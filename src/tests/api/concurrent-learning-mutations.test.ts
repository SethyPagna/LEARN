import assert from "node:assert/strict"
import test from "node:test"
import { advanceLiveSession, getLiveSessionByCode, joinLiveSession, launchLiveGameInChat, recordReviewResult, submitLiveAnswer, type User } from "../../lib/data"
import { createLiveSession, parseSession, reduceSession, serializeSession } from "../../lib/live/quiz-session"
import { setLocalRealtimeHub } from "../../lib/realtime/hub-core"
import { shiftDay } from "../../lib/today"
import { createSqliteFixture, installSqliteStore, simultaneousBatchBarrier } from "./sqlite-store"

type Fixture = Awaited<ReturnType<typeof createSqliteFixture>>
const QUESTION = {
  id: "q1", prompt: "Two plus two?", choices: [{ id: "a", text: "Four" }, { id: "b", text: "Five" }],
  correctChoiceId: "a", timeLimitSeconds: 60,
}

function addUser(fixture: Fixture, id: string, preferences: Record<string, unknown> = {}): User {
  fixture.database.prepare("INSERT INTO users (id, username, email, name, password_hash, preferences, xp_total, streak_current, streak_longest, streak_freezes_available, last_learning_activity_at) VALUES (?, ?, ?, ?, 'test', ?, 420, 6, 12, 2, ?)")
    .run(id, id, `${id}@example.test`, id, JSON.stringify(preferences), shiftDay(new Date().toISOString().slice(0, 10), -1))
  return { id, username: id, email: `${id}@example.test`, name: id, role: "learner", preferences }
}

function saveRunningSession(fixture: Fixture, players: User[]) {
  const host = addUser(fixture, "host")
  const now = Date.now()
  let session = createLiveSession({ code: "ABC234", quizId: "quiz", quizTitle: "Concurrent round", hostUserId: host.id, questions: [QUESTION], createdAt: now })
  for (const player of players) {
    session = reduceSession(session, { type: "join", actorId: player.id, participantId: `lp_${player.id}`, name: player.name }, now).session
  }
  session = reduceSession(session, { type: "start", actorId: host.id }, now).session
  fixture.database.prepare("INSERT INTO live_quiz_sessions (id, code, quiz_id, quiz_title, host_user_id, phase, state_json) VALUES ('round', ?, ?, ?, ?, ?, ?)")
    .run(session.code, session.quizId, session.quizTitle, host.id, session.phase, serializeSession(session))
  return session
}

function currentSession(fixture: Fixture) {
  const session = parseSession(fixture.database.prepare("SELECT state_json FROM live_quiz_sessions WHERE id = 'round'").get()?.state_json)
  assert.ok(session)
  return session
}

function addCard(fixture: Fixture, user: User, id: string) {
  fixture.database.prepare("INSERT INTO review_items (id, user_id, source_type, source_id, title, due_at) VALUES (?, ?, 'flashcard', ?, 'Saved card', '2020-01-01 00:00:00')")
    .run(id, user.id, id)
}

test("two live answers from the same state retain both scores, JSON answers and stored rows", async () => {
  const fixture = await createSqliteFixture()
  try {
    const players = [addUser(fixture, "alice"), addUser(fixture, "bob")]
    saveRunningSession(fixture, players)
    // Preserve a legacy identity while the other player gets a scoped row.
    fixture.database.prepare("INSERT INTO live_quiz_participants (id, session_id, user_id, name) VALUES ('lp_alice', 'round', 'alice', 'alice')").run()
    installSqliteStore(fixture.stub, fixture.database, { beforeBatch: simultaneousBatchBarrier() })
    const answers = await Promise.all(players.map((player) => submitLiveAnswer(player, "ABC234", { questionId: "q1", choiceId: "a" })))
    assert.ok(answers.every((answer) => answer.accepted))
    const session = currentSession(fixture)
    assert.ok(session.participants.every((player) => player.answers.length === 1 && player.score === player.answers[0].points))
    const rows = fixture.database.prepare("SELECT p.id, p.user_id, p.score, a.points FROM live_quiz_participants p JOIN live_quiz_answers a ON a.participant_id = p.id AND a.session_id = p.session_id ORDER BY p.user_id").all()
    assert.equal(rows.length, 2)
    assert.equal(rows[0].id, "lp_alice", "a successful retry must preserve the old roster ID")
    assert.ok(rows.every((row) => row.score === row.points))
    assert.equal(fixture.stub.matching(/UPDATE live_quiz_sessions/).length, 3, "one stale comparison retries from the winner's state")
  } finally { fixture.close() }
})

test("simultaneous duplicate live answers have one winner and cannot change its choice or score", async () => {
  const fixture = await createSqliteFixture()
  try {
    const player = addUser(fixture, "alice")
    saveRunningSession(fixture, [player])
    installSqliteStore(fixture.stub, fixture.database, { beforeBatch: simultaneousBatchBarrier() })
    const results = await Promise.all(["a", "b"].map((choiceId) => submitLiveAnswer(player, "ABC234", { questionId: "q1", choiceId })))
    assert.deepEqual(results.map((result) => result.accepted).sort(), [false, true])
    const answer = currentSession(fixture).participants[0].answers[0]
    const stored = fixture.database.prepare("SELECT choice_id, points FROM live_quiz_answers").all()
    assert.equal(stored.length, 1)
    assert.equal(stored[0].choice_id, answer.choiceId)
    assert.equal(stored[0].points, answer.points)
    assert.equal(fixture.database.prepare("SELECT score FROM live_quiz_participants").get()?.score, answer.points)
  } finally { fixture.close() }
})

test("a late live answer-write failure rolls back JSON, mutation token and roster score", async () => {
  const fixture = await createSqliteFixture()
  try {
    const player = addUser(fixture, "alice")
    const before = saveRunningSession(fixture, [player])
    fixture.database.exec("CREATE TRIGGER reject_live_answer BEFORE INSERT ON live_quiz_answers BEGIN SELECT RAISE(ABORT, 'answer storage failure'); END")
    await assert.rejects(submitLiveAnswer(player, "ABC234", { questionId: "q1", choiceId: "a" }), /answer storage failure/)
    assert.deepEqual(currentSession(fixture), before)
    assert.equal(fixture.database.prepare("SELECT json_extract(state_json, '$._mutationId') AS token FROM live_quiz_sessions").get()?.token, null)
    assert.equal(fixture.database.prepare("SELECT count(*) AS count FROM live_quiz_participants").get()?.count, 0)
    assert.equal(fixture.database.prepare("SELECT count(*) AS count FROM live_quiz_answers").get()?.count, 0)
    assert.equal(fixture.stub.matching(/UPDATE live_quiz_sessions/).length, 1, "a failed transaction is not retried")
  } finally { fixture.close() }
})

test("live contention retries are bounded and a failed comparison writes no answers", async () => {
  const fixture = await createSqliteFixture()
  try {
    const player = addUser(fixture, "alice")
    saveRunningSession(fixture, [player])
    let comparisons = 0
    installSqliteStore(fixture.stub, fixture.database, { beforeBatch() {
      comparisons += 1
      fixture.database.prepare("UPDATE live_quiz_sessions SET state_json = json_set(state_json, '$._mutationId', ?) WHERE id = 'round'").run(`competing-${comparisons}`)
    } })
    await assert.rejects(submitLiveAnswer(player, "ABC234", { questionId: "q1", choiceId: "a" }), /busy/)
    assert.equal(comparisons, 8)
    assert.equal(currentSession(fixture).participants[0].answers.length, 0)
    assert.equal(fixture.database.prepare("SELECT count(*) AS count FROM live_quiz_answers").get()?.count, 0)
    assert.equal(fixture.database.prepare("SELECT count(*) AS count FROM live_quiz_participants").get()?.count, 0)
  } finally { fixture.close() }
})

test("a committed live batch with a lost response is not replayed", async () => {
  const fixture = await createSqliteFixture()
  try {
    const player = addUser(fixture, "alice")
    saveRunningSession(fixture, [player])
    const transport = globalThis.fetch
    let batches = 0
    globalThis.fetch = async (input, init) => {
      const response = await transport(input, init)
      if (JSON.parse(String(init?.body ?? "{}")).batch) {
        batches += 1
        throw new Error("Lost committed response")
      }
      return response
    }
    await assert.rejects(submitLiveAnswer(player, "ABC234", { questionId: "q1", choiceId: "a" }), /Lost committed response/)
    assert.equal(batches, 1)
    assert.equal(currentSession(fixture).participants[0].answers.length, 1)
    assert.equal(fixture.database.prepare("SELECT count(*) AS count FROM live_quiz_answers").get()?.count, 1)
  } finally { fixture.close() }
})

test("a player joining after a chat invite is sent survives thread attachment", async () => {
  const fixture = await createSqliteFixture()
  try {
    const host = addUser(fixture, "host")
    const player = addUser(fixture, "alice")
    fixture.database.exec("INSERT INTO workspaces (id, owner_user_id, name) VALUES ('workspace_demo', 'host', 'Fixture')")
    fixture.database.exec("INSERT INTO quizzes (id, workspace_id, title, topic, created_by_user_id) VALUES ('quiz', 'workspace_demo', 'Fixture quiz', 'math', 'host')")
    fixture.database.prepare("INSERT INTO quiz_questions (id, quiz_id, question, choices, correct_answer_id, topic) VALUES ('q1', 'quiz', ?, ?, 'a', 'math')")
      .run(QUESTION.prompt, JSON.stringify(QUESTION.choices))
    fixture.database.exec("INSERT INTO chat_threads (id, workspace_id, title, created_by_user_id, target_user_id) VALUES ('thread', 'workspace_demo', 'Fixture chat', 'host', 'alice')")
    let invites = 0
    setLocalRealtimeHub({ broadcast() { invites += 1; return 1 }, snapshot() { return { connections: 0, users: [], events: [] } }, onlineUserIds() { return [] } })
    let joined = false
    installSqliteStore(fixture.stub, fixture.database, { async beforeBatch(statements) {
      if (joined || !statements[0].sql.includes("'$.threadId'")) return
      joined = true
      assert.equal(invites, 1, "the invite has reached the thread before attachment begins")
      const code = String(fixture.database.prepare("SELECT code FROM live_quiz_sessions").get()?.code)
      assert.equal((await joinLiveSession(player, code)).joined, true)
    } })
    const launched = await launchLiveGameInChat(host, { quizId: "quiz", threadId: "thread" })
    assert.equal(joined, true)
    assert.equal(launched.session.threadId, "thread")
    assert.deepEqual(launched.session.participants.map((participant) => participant.id), ["lp_alice"])
    const saved = parseSession(fixture.database.prepare("SELECT state_json FROM live_quiz_sessions").get()?.state_json)
    assert.deepEqual(saved, launched.session)
    assert.equal(fixture.database.prepare("SELECT count(*) AS count FROM live_quiz_participants").get()?.count, 1)
  } finally { setLocalRealtimeHub(null); fixture.close() }
})

test("different cards contending for the final daily slot commit only one grade, log, audit and XP award", async () => {
  const fixture = await createSqliteFixture()
  try {
    const user = addUser(fixture, "alice", { dailyReviewCap: 1 })
    for (const id of ["first", "second"]) addCard(fixture, user, id)
    installSqliteStore(fixture.stub, fixture.database, { beforeBatch: simultaneousBatchBarrier() })
    const results = await Promise.allSettled(["first", "second"].map((id) => recordReviewResult(user, { id, rating: "good" })))
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1)
    const refused = results.find((result) => result.status === "rejected")
    assert.ok(refused?.status === "rejected")
    assert.match(String(refused.reason), /today's review limit/)
    assert.equal(fixture.database.prepare("SELECT count(*) AS count FROM review_logs").get()?.count, 1)
    assert.equal(fixture.database.prepare("SELECT count(*) AS count FROM audit_logs").get()?.count, 1)
    assert.deepEqual(fixture.database.prepare("SELECT review_count FROM review_items ORDER BY review_count").all().map((row) => row.review_count), [0, 1])
    const metrics = fixture.database.prepare("SELECT xp_total, streak_current, streak_freezes_available FROM users WHERE id = 'alice'").get()
    assert.deepEqual({ ...metrics }, { xp_total: 428, streak_current: 7, streak_freezes_available: 2 })
    assert.equal(fixture.stub.matching(/INSERT INTO review_logs/).length, 2, "both requests reached the atomic budget comparison")
  } finally { fixture.close() }
})

test("only a host retry recovers a failed finished-game publication, once", async () => {
  const fixture = await createSqliteFixture()
  try {
    const player = addUser(fixture, "alice")
    saveRunningSession(fixture, [player])
    const host: User = { id: "host", username: "host", email: "host@example.test", name: "host", role: "learner", preferences: {} }
    fixture.database.exec("INSERT INTO workspaces (id, owner_user_id, name) VALUES ('workspace_demo', 'host', 'Fixture')")
    fixture.database.exec("INSERT INTO chat_threads (id, workspace_id, title, created_by_user_id, updated_at) VALUES ('thread', 'workspace_demo', 'Fixture chat', 'host', '2020-01-01 00:00:00')")
    fixture.database.exec("UPDATE live_quiz_sessions SET state_json = json_set(state_json, '$.threadId', 'thread') WHERE id = 'round'")
    fixture.database.exec("CREATE TRIGGER reject_result BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT, 'publication failure'); END")
    await assert.rejects(advanceLiveSession(host, "ABC234", "close"), /publication failure/)
    assert.equal(currentSession(fixture).phase, "finished", "publication follows the game transaction")
    assert.equal(fixture.database.prepare("SELECT updated_at FROM chat_threads WHERE id = 'thread'").get()?.updated_at, "2020-01-01 00:00:00", "a late audit failure rolls back the publication timestamp")
    fixture.database.exec("DROP TRIGGER reject_result")
    await assert.rejects(advanceLiveSession(player, "ABC234", "close"), /Only the host/)
    const writes = fixture.stub.writesMatching(/./).length
    await getLiveSessionByCode("ABC234")
    assert.equal(fixture.stub.writesMatching(/./).length, writes, "reading a finished game never publishes")
    assert.equal(fixture.database.prepare("SELECT count(*) AS count FROM chat_messages").get()?.count, 0)
    assert.equal((await advanceLiveSession(host, "ABC234", "close")).accepted, false, "the finished game is not advanced again")
    fixture.database.exec("UPDATE audit_logs SET id = 'historical-audit' WHERE entity = 'chat_message'")
    assert.equal((await advanceLiveSession(host, "ABC234", "next")).accepted, false)
    assert.equal(fixture.database.prepare("SELECT count(*) AS count FROM chat_messages").get()?.count, 1)
    assert.equal(fixture.database.prepare("SELECT count(*) AS count FROM audit_logs WHERE entity = 'chat_message'").get()?.count, 1)
    assert.equal(fixture.database.prepare("SELECT id FROM audit_logs WHERE entity = 'chat_message'").get()?.id, "historical-audit", "a legacy audit prevents a new duplicate audit ID")
  } finally { fixture.close() }
})

test("a result message whose response is lost is preserved on a host retry", async () => {
  const fixture = await createSqliteFixture()
  try {
    const player = addUser(fixture, "alice")
    saveRunningSession(fixture, [player])
    const host: User = { id: "host", username: "host", email: "host@example.test", name: "host", role: "learner", preferences: {} }
    fixture.database.exec("INSERT INTO workspaces (id, owner_user_id, name) VALUES ('workspace_demo', 'host', 'Fixture')")
    fixture.database.exec("INSERT INTO chat_threads (id, workspace_id, title, created_by_user_id, target_user_id, updated_at) VALUES ('thread', 'workspace_demo', 'Fixture chat', 'host', 'alice', '2020-01-01 00:00:00')")
    fixture.database.exec("UPDATE live_quiz_sessions SET state_json = json_set(state_json, '$.threadId', 'thread') WHERE id = 'round'")
    let broadcasts = 0
    setLocalRealtimeHub({ broadcast() { broadcasts += 1; return 1 }, snapshot() { return { connections: 0, users: [], events: [] } }, onlineUserIds() { return [] } })
    const transport = globalThis.fetch
    let loseResponse = true
    globalThis.fetch = async (input, init) => {
      const response = await transport(input, init)
      const body = JSON.parse(String(init?.body ?? "{}")) as { batch?: { sql: string }[] }
      if (loseResponse && body.batch?.some((statement) => statement.sql.includes("INSERT INTO chat_messages"))) {
        loseResponse = false
        throw new Error("Lost publication response")
      }
      return response
    }
    await assert.rejects(advanceLiveSession(host, "ABC234", "close"), /Lost publication response/)
    const message = fixture.database.prepare("SELECT id, body, metadata FROM chat_messages").get()
    assert.ok(message)
    assert.equal(broadcasts, 0, "an uncertain transaction response does not broadcast")
    assert.equal(fixture.database.prepare("SELECT count(*) AS count FROM audit_logs WHERE entity = 'chat_message'").get()?.count, 1)
    fixture.database.exec("UPDATE chat_threads SET updated_at = '2020-01-01 00:00:00' WHERE id = 'thread'")
    const writes = fixture.stub.writesMatching(/./).length
    await getLiveSessionByCode("ABC234")
    await assert.rejects(advanceLiveSession(player, "ABC234", "next"), /Only the host/)
    assert.equal(fixture.stub.writesMatching(/./).length, writes)
    assert.equal(broadcasts, 0)
    await advanceLiveSession(host, "ABC234", "close")
    assert.equal(fixture.database.prepare("SELECT count(*) AS count FROM chat_messages").get()?.count, 1)
    assert.deepEqual(fixture.database.prepare("SELECT id, body, metadata FROM chat_messages").get(), message)
    assert.equal(fixture.database.prepare("SELECT count(*) AS count FROM audit_logs WHERE entity = 'chat_message'").get()?.count, 1)
    assert.notEqual(fixture.database.prepare("SELECT updated_at FROM chat_threads WHERE id = 'thread'").get()?.updated_at, "2020-01-01 00:00:00")
    assert.equal(broadcasts, 1)
    await advanceLiveSession(host, "ABC234", "next")
    assert.equal(broadcasts, 2, "confirmed retries wake clients again without duplicating durable rows")
    assert.equal(fixture.database.prepare("SELECT count(*) AS count FROM audit_logs WHERE entity = 'chat_message'").get()?.count, 1)
  } finally { setLocalRealtimeHub(null); fixture.close() }
})

test("two allowed concurrent grades re-read metrics and spend a streak freeze only once", async () => {
  const fixture = await createSqliteFixture()
  try {
    const user = addUser(fixture, "alice", { dailyReviewCap: 2 })
    fixture.database.prepare("UPDATE users SET last_learning_activity_at = ? WHERE id = 'alice'")
      .run(shiftDay(new Date().toISOString().slice(0, 10), -2))
    for (const id of ["first", "second"]) addCard(fixture, user, id)
    installSqliteStore(fixture.stub, fixture.database, { beforeBatch: simultaneousBatchBarrier() })
    const results = await Promise.all(["first", "second"].map((id) => recordReviewResult(user, { id, rating: "again" })))
    assert.equal(results.length, 2)
    assert.equal(results.filter((result) => result.streak.usedFreeze).length, 1)
    const metrics = fixture.database.prepare("SELECT xp_total, streak_current, streak_freezes_available FROM users WHERE id = 'alice'").get()
    assert.deepEqual({ ...metrics }, { xp_total: 436, streak_current: 6, streak_freezes_available: 1 })
    assert.equal(fixture.database.prepare("SELECT count(*) AS count FROM review_logs").get()?.count, 2)
    assert.equal(fixture.database.prepare("SELECT count(*) AS count FROM audit_logs").get()?.count, 2)
    assert.equal(fixture.stub.matching(/INSERT INTO review_logs/).length, 3, "the stale metric snapshot retries once")
  } finally { fixture.close() }
})

test("a cap change during grading is re-read before any review mutation commits", async () => {
  const fixture = await createSqliteFixture()
  try {
    const user = addUser(fixture, "alice", { dailyReviewCap: 1 })
    addCard(fixture, user, "first")
    installSqliteStore(fixture.stub, fixture.database, { beforeBatch() {
      fixture.database.exec("UPDATE users SET preferences = '{\"dailyReviewCap\":0}' WHERE id = 'alice'")
    } })
    await assert.rejects(recordReviewResult(user, { id: "first" }), /today's review limit/)
    assert.equal(fixture.database.prepare("SELECT count(*) AS count FROM review_logs").get()?.count, 0)
    assert.equal(fixture.database.prepare("SELECT review_count FROM review_items").get()?.review_count, 0)
    assert.equal(fixture.database.prepare("SELECT xp_total FROM users WHERE id = 'alice'").get()?.xp_total, 420)
  } finally { fixture.close() }
})

test("failure of the final review audit statement rolls back the card, log, budget, XP and streak", async () => {
  const fixture = await createSqliteFixture()
  try {
    const user = addUser(fixture, "alice", { dailyReviewCap: 1 })
    addCard(fixture, user, "first")
    fixture.database.exec("CREATE TRIGGER reject_review_audit BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT, 'audit storage failure'); END")
    await assert.rejects(recordReviewResult(user, { id: "first" }), /audit storage failure/)
    assert.equal(fixture.database.prepare("SELECT count(*) AS count FROM review_logs").get()?.count, 0)
    assert.equal(fixture.database.prepare("SELECT count(*) AS count FROM audit_logs").get()?.count, 0)
    const card = fixture.database.prepare("SELECT due_at, review_count, lapse_count, last_reviewed_at FROM review_items").get()
    assert.deepEqual({ ...card }, { due_at: "2020-01-01 00:00:00", review_count: 0, lapse_count: 0, last_reviewed_at: null })
    const metrics = fixture.database.prepare("SELECT xp_total, streak_current, streak_freezes_available FROM users WHERE id = 'alice'").get()
    assert.deepEqual({ ...metrics }, { xp_total: 420, streak_current: 6, streak_freezes_available: 2 })
    assert.equal(fixture.stub.matching(/INSERT INTO review_logs/).length, 1, "a failed transaction is not replayed")
  } finally { fixture.close() }
})
