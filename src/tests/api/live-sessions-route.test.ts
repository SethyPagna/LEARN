import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { DatabaseSync, type SQLInputValue } from "node:sqlite"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { createLiveSession, reduceSession, serializeSession, type LiveQuizSession } from "../../lib/live/quiz-session"
import { setLocalRealtimeHub } from "../../lib/realtime/hub-core"
import { installDatabaseStub, primeDatabase, request, TEST_USER_ROW } from "./harness"
import { installSqliteStore } from "./sqlite-store"

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
const HOST_ID = "live_host"
const PLAYER_ID = TEST_USER_ROW.id
const PARTICIPANT_ID = `lp_${PLAYER_ID}`
const QUESTIONS = ["q1", "q2"].map((id) => ({
  id,
  prompt: "Two plus two?",
  choices: [{ id: "a", text: "Four" }, { id: "b", text: "Five" }],
  correctChoiceId: "a",
  timeLimitSeconds: 30,
}))

function sqlParameters(values: unknown[]): SQLInputValue[] {
  return values.map((value) => {
    if (value === null || typeof value === "string" || typeof value === "number") return value
    throw new Error("Unexpected live quiz SQL parameter")
  })
}

test("live quiz routes preserve replay results with the real roster and answer constraints", async (t) => {
  const stub = installDatabaseStub()
  const database = new DatabaseSync(":memory:")
  database.exec("CREATE TABLE users (id TEXT PRIMARY KEY)")
  database.prepare("INSERT INTO users (id) VALUES (?), (?)").run(HOST_ID, PLAYER_ID)
  database.exec(fs.readFileSync(path.join(PROJECT_ROOT, "ops/migrations/0015_live_quiz_sessions.sql"), "utf8"))
  setLocalRealtimeHub({
    broadcast() { return 1 },
    snapshot() { return { connections: 0, users: [], events: [] } },
    onlineUserIds() { return [] },
  })

  try {
    await primeDatabase(stub)
    installSqliteStore(stub, database, { pattern: /\blive_quiz_(sessions|participants|answers)\b/ })
    const { GET, POST } = await import("../../app/api/live-sessions/[code]/route")
    stub.on(/\blive_quiz_(sessions|participants|answers)\b/, (sql, params) => {
      const statement = database.prepare(sql)
      const values = sqlParameters(params)
      if (/^SELECT\b/i.test(sql.trim())) return { rows: statement.all(...values) }
      return { rowCount: Number(statement.run(...values).changes) }
    })

    function authenticate(userId: string) {
      stub.on(/FROM user_sessions/, { rows: [{ ...TEST_USER_ROW, id: userId }] })
    }

    function saveSession(id: string, code: string, state?: LiveQuizSession) {
      const session = state || createLiveSession({
        code,
        quizId: "replayed-quiz",
        quizTitle: "Replay",
        hostUserId: HOST_ID,
        questions: QUESTIONS,
        createdAt: Date.now(),
      })
      database.prepare("INSERT INTO live_quiz_sessions (id, code, quiz_id, quiz_title, host_user_id, phase, question_index, state_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .run(id, code, session.quizId, session.quizTitle, HOST_ID, session.phase, session.questionIndex, serializeSession(session))
      return session
    }

    async function post(code: string, body: Record<string, unknown>, userId = PLAYER_ID) {
      authenticate(userId)
      return POST(request(`/api/live-sessions/${code}`, { method: "POST", body }), { params: Promise.resolve({ code }) })
    }

    async function get(code: string, userId = PLAYER_ID) {
      authenticate(userId)
      return GET(request(`/api/live-sessions/${code}`), { params: Promise.resolve({ code }) })
    }

    await t.test("the same learner answers the same question in two sessions without replacing either result", async () => {
      saveSession("first-round", "ABC234")
      saveSession("second-round", "DEF567")
      for (const code of ["ABC234", "DEF567"]) {
        assert.equal((await get(code)).status, 403, "knowing a code does not grant access")
        const joined = await post(code, { action: "join", participantId: "lp_somebody_else" })
        assert.equal(joined.status, 200)
        const joinedItem = (await joined.json()).item
        assert.equal(joinedItem.viewer.participantId, PARTICIPANT_ID, "the authenticated learner owns the identity")
        assert.equal((await post(code, { action: "start" }, HOST_ID)).status, 200)
        const running = await get(code)
        assert.equal(running.status, 200)
        assert.ok((await running.json()).item.session.questions.every((question: { correctChoiceId: string }) => question.correctChoiceId === ""))
        const answered = await post(code, { action: "answer", questionId: "q1", choiceId: "a" })
        assert.equal(answered.status, 200)
        assert.equal((await answered.json()).correct, true)
        assert.equal((await post(code, { action: "answer", questionId: "q1", choiceId: "b" })).status, 409)
      }

      const roster = database.prepare("SELECT id, session_id, user_id FROM live_quiz_participants ORDER BY session_id").all()
      const answers = database.prepare("SELECT id, session_id, participant_id, choice_id FROM live_quiz_answers ORDER BY session_id").all()
      assert.equal(roster.length, 2)
      assert.equal(new Set(roster.map((participant) => participant.id)).size, 2)
      assert.equal(answers.length, 2, "the existing global unique index accepts both rounds")
      assert.equal(new Set(answers.map((answer) => answer.id)).size, 2)
      assert.deepEqual(answers.map((answer) => answer.session_id), ["first-round", "second-round"])
      for (const answer of answers) {
        assert.equal(answer.choice_id, "a")
        assert.ok(roster.some((participant) => participant.id === answer.participant_id && participant.session_id === answer.session_id && participant.user_id === PLAYER_ID))
      }
      const writesBeforeRefresh = stub.writesMatching(/live_quiz_/).length
      assert.equal((await post("ABC234", { action: "join" })).status, 200)
      assert.equal(stub.writesMatching(/live_quiz_/).length, writesBeforeRefresh, "another device reuses the roster without resetting score")
      assert.equal(database.prepare("SELECT COUNT(*) AS count FROM live_quiz_participants").get()?.count, 2)
    })

    await t.test("an existing legacy roster and answer remain intact while missing JSON answers are recovered", async () => {
      const now = Date.now()
      let legacy = createLiveSession({ code: "GHJ678", quizId: "replayed-quiz", quizTitle: "Legacy", hostUserId: HOST_ID, questions: QUESTIONS, createdAt: now })
      legacy = reduceSession(legacy, { type: "join", actorId: PLAYER_ID, participantId: PARTICIPANT_ID, name: "Original player" }, now).session
      legacy = reduceSession(legacy, { type: "start", actorId: HOST_ID }, now).session
      legacy = reduceSession(legacy, { type: "answer", actorId: PLAYER_ID, participantId: PARTICIPANT_ID, questionId: "q1", choiceId: "a", atMs: now }, now).session
      legacy = reduceSession(legacy, { type: "reveal", actorId: HOST_ID }, now).session
      legacy = reduceSession(legacy, { type: "next", actorId: HOST_ID }, now).session
      legacy = reduceSession(legacy, { type: "answer", actorId: PLAYER_ID, participantId: PARTICIPANT_ID, questionId: "q2", choiceId: "a", atMs: now }, now).session
      saveSession("legacy-round", "GHJ678", legacy)
      database.prepare("INSERT INTO live_quiz_participants (id, session_id, user_id, name, score) VALUES (?, ?, ?, ?, ?)")
        .run(PARTICIPANT_ID, "legacy-round", PLAYER_ID, "Original player", 1500)
      database.prepare("INSERT INTO live_quiz_answers (id, session_id, question_id, participant_id, choice_id, correct, points) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run("original-answer", "legacy-round", "q1", PARTICIPANT_ID, "a", 1, 1500)

      assert.equal((await get("GHJ678")).status, 200, "legacy in-state identities still authorize the player")
      assert.equal((await post("GHJ678", { action: "close" }, HOST_ID)).status, 200)
      const legacyRoster = database.prepare("SELECT id, session_id, user_id, score FROM live_quiz_participants WHERE session_id = ?").all("legacy-round")
      assert.equal(legacyRoster.length, 1, "a legacy participant is not duplicated")
      assert.equal(legacyRoster[0].id, PARTICIPANT_ID)
      assert.equal(legacyRoster[0].score, 3000)
      const legacyAnswers = database.prepare("SELECT id, question_id, participant_id, points FROM live_quiz_answers WHERE session_id = ? ORDER BY question_id").all("legacy-round")
      assert.equal(legacyAnswers.length, 2)
      assert.equal(legacyAnswers[0].id, "original-answer", "the original stored answer is preserved")
      assert.ok(legacyAnswers.every((answer) => answer.participant_id === PARTICIPANT_ID && answer.points === 1500))

      saveSession("legacy-replay", "KMN789")
      assert.equal((await post("KMN789", { action: "join" })).status, 200)
      assert.equal((await post("KMN789", { action: "start" }, HOST_ID)).status, 200)
      assert.equal((await post("KMN789", { action: "answer", questionId: "q1", choiceId: "a" })).status, 200)
      assert.equal(database.prepare("SELECT COUNT(*) AS count FROM live_quiz_answers WHERE session_id = ?").get("legacy-replay")?.count, 1)
      assert.equal(database.prepare("SELECT session_id FROM live_quiz_participants WHERE id = ?").get(PARTICIPANT_ID)?.session_id, "legacy-round")
    })

    await t.test("the host opens the lobby and finished result without joining the player roster", async () => {
      saveSession("host-round", "PQR234")
      const writesBeforeJoin = stub.writesMatching(/live_quiz_/).length
      const joined = await post("PQR234", { action: "join" }, HOST_ID)
      assert.equal(joined.status, 200)
      assert.deepEqual((await joined.json()).item.viewer, { isHost: true, isParticipant: false, participantId: `lp_${HOST_ID}` })
      assert.equal(stub.writesMatching(/live_quiz_/).length, writesBeforeJoin)
      assert.equal(database.prepare("SELECT COUNT(*) AS count FROM live_quiz_participants WHERE session_id = ?").get("host-round")?.count, 0)
      assert.equal((await post("PQR234", { action: "close" }, HOST_ID)).status, 200)
      const finishedWrites = stub.writesMatching(/live_quiz_/).length
      const finished = await post("PQR234", { action: "join" }, HOST_ID)
      assert.equal(finished.status, 200)
      assert.equal((await finished.json()).item.session.phase, "finished")
      assert.equal(stub.writesMatching(/live_quiz_/).length, finishedWrites)
    })
  } finally {
    setLocalRealtimeHub(null)
    stub.restore()
    database.close()
  }
})
