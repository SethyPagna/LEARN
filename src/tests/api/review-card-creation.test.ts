import assert from "node:assert/strict"
import test from "node:test"
import { generatedReviewCards } from "../../lib/ai/assessment-output"
import { readJson, request, TEST_USER_ROW } from "./harness"
import { createSqliteFixture, installSqliteStore, simultaneousBatchBarrier } from "./sqlite-store"

async function creationFixture() {
  const fixture = await createSqliteFixture()
  const { database, stub } = fixture
  database.prepare("INSERT INTO users (id, username, email, name, password_hash, preferences, xp_total) VALUES (?, ?, ?, ?, 'test', '{}', ?)")
    .run(TEST_USER_ROW.id, TEST_USER_ROW.username, TEST_USER_ROW.email, TEST_USER_ROW.name, TEST_USER_ROW.xp_total)
  const authenticate = () => stub.on(/FROM user_sessions/, { rows: [TEST_USER_ROW] })
  authenticate()
  const { POST } = await import("../../app/api/reviews/route")
  return {
    ...fixture,
    authenticate,
    save(items: unknown[]) { return POST(request("/api/reviews", { method: "POST", body: { items } })) },
    grade(id: string) { return POST(request("/api/reviews", { method: "POST", body: { id, rating: "good" } })) },
  }
}

function localCard(sourceId: string, title = "Cells") {
  return { sourceId, title, prompt: "Boundary?", answer: "Membrane", topic: "Cells" }
}

function reviewedState(fixture: Awaited<ReturnType<typeof creationFixture>>, id: string) {
  return fixture.database.prepare(`SELECT id, user_id, source_type, source_id, difficulty, stability,
    retrievability, due_at, last_reviewed_at, review_count, lapse_count, metadata, created_at
    FROM review_items WHERE id = ?`).get(id)
}

test("recreating a graded local card preserves its complete schedule and grade history", async () => {
  const fixture = await creationFixture()
  const { database } = fixture
  try {
    assert.equal((await fixture.save([localCard("selection:history")])).status, 201)
    const id = String(database.prepare("SELECT id FROM review_items").get()?.id)
    database.prepare("UPDATE review_items SET difficulty = 0.17, stability = 42, lapse_count = 2, metadata = ? WHERE id = ?")
      .run('{"topic":"Cells","custom":"preserved"}', id)
    assert.equal((await fixture.grade(id)).status, 201)
    const before = reviewedState(fixture, id)
    const history = database.prepare("SELECT * FROM review_logs").all()
    const learner = database.prepare("SELECT xp_total, streak_current, streak_longest, last_learning_activity_at FROM users WHERE id = ?").get(TEST_USER_ROW.id)
    assert.ok(Date.parse(String(before?.due_at)) > Date.now())

    const repeated = await fixture.save([localCard("selection:history", "Updated card title")])
    assert.equal(repeated.status, 201)
    assert.equal((await readJson<{ item: { count: number } }>(repeated)).item.count, 1)
    assert.equal(database.prepare("SELECT count(*) AS count FROM review_items").get()?.count, 1)
    assert.equal(database.prepare("SELECT title FROM review_items").get()?.title, "Updated card title")
    assert.deepEqual(reviewedState(fixture, id), before)
    assert.deepEqual(database.prepare("SELECT * FROM review_logs").all(), history)
    assert.deepEqual(database.prepare("SELECT xp_total, streak_current, streak_longest, last_learning_activity_at FROM users WHERE id = ?").get(TEST_USER_ROW.id), learner)
  } finally { fixture.close() }
})

test("identical AI output repeatedly saves one card and retains its grade", async () => {
  const fixture = await creationFixture()
  const { database } = fixture
  try {
    const pairs = [{ prompt: "Boundary?", answer: "Membrane" }]
    assert.equal((await fixture.save(generatedReviewCards(pairs, "Cells"))).status, 201)
    const id = String(database.prepare("SELECT id FROM review_items").get()?.id)
    assert.equal((await fixture.grade(id)).status, 201)
    const before = reviewedState(fixture, id)
    assert.equal((await fixture.save(generatedReviewCards(pairs, "Renamed source"))).status, 201)
    assert.equal(database.prepare("SELECT count(*) AS count FROM review_items").get()?.count, 1)
    assert.deepEqual(reviewedState(fixture, id), before)
    assert.equal(database.prepare("SELECT count(*) AS count FROM review_logs").get()?.count, 1)
  } finally { fixture.close() }
})

test("new AI pair IDs adopt a previously graded random ID without re-keying its row or logs", async () => {
  const fixture = await creationFixture()
  const { database } = fixture
  try {
    const oldSourceId = "ai:9f54852e-b6ed-469d-92a0-0b3fb33051ae:0"
    assert.equal((await fixture.save([localCard(oldSourceId)])).status, 201)
    const id = String(database.prepare("SELECT id FROM review_items").get()?.id)
    assert.equal((await fixture.grade(id)).status, 201)
    const before = reviewedState(fixture, id)
    const history = database.prepare("SELECT * FROM review_logs").all()

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const cards = generatedReviewCards([{ prompt: "Boundary?", answer: "Membrane" }], "Restored source")
      assert.notEqual(cards[0].sourceId, oldSourceId)
      assert.equal((await fixture.save(cards)).status, 201)
    }
    assert.equal(database.prepare("SELECT count(*) AS count FROM review_items").get()?.count, 1)
    assert.deepEqual(reviewedState(fixture, id), before)
    assert.deepEqual(database.prepare("SELECT * FROM review_logs").all(), history)
  } finally { fixture.close() }
})

test("legacy AI adoption is isolated by user and source type", async () => {
  const fixture = await creationFixture()
  const { database, stub } = fixture
  try {
    const otherUser = { ...TEST_USER_ROW, id: "other_user", username: "other_learner", email: "other@learn.local" }
    database.prepare("INSERT INTO users (id, username, email, name, password_hash) VALUES (?, ?, ?, ?, 'test')")
      .run(otherUser.id, otherUser.username, otherUser.email, otherUser.name)
    database.prepare(`INSERT INTO review_items (id, user_id, source_type, source_id, title, prompt, answer, due_at, review_count)
      VALUES ('foreign_ai', ?, 'practice_mistake', 'ai:old-random:0', 'Private card', 'Boundary?', 'Membrane', '2030-01-01', 8)`).run(otherUser.id)
    database.prepare(`INSERT INTO review_items (id, user_id, source_type, source_id, title, prompt, answer, due_at)
      VALUES ('other_source_type', ?, 'flashcard', 'ai:another-random:0', 'Separate deck', 'Boundary?', 'Membrane', '2030-01-01')`).run(TEST_USER_ROW.id)
    const foreignBefore = database.prepare("SELECT * FROM review_items WHERE id = 'foreign_ai'").get()
    const typedBefore = database.prepare("SELECT * FROM review_items WHERE id = 'other_source_type'").get()
    const cards = generatedReviewCards([{ prompt: "Boundary?", answer: "Membrane" }], "New own card")
    assert.equal((await fixture.save(cards)).status, 201)
    assert.deepEqual(database.prepare("SELECT * FROM review_items WHERE id = 'foreign_ai'").get(), foreignBefore)
    assert.deepEqual(database.prepare("SELECT * FROM review_items WHERE id = 'other_source_type'").get(), typedBefore)
    assert.equal(database.prepare("SELECT count(*) AS count FROM review_items WHERE user_id = ? AND source_type = 'practice_mistake'").get(TEST_USER_ROW.id)?.count, 1)

    stub.on(/FROM user_sessions/, { rows: [otherUser] })
    assert.equal((await fixture.save(cards)).status, 201)
    assert.equal(database.prepare("SELECT count(*) AS count FROM review_items WHERE user_id = ?").get(otherUser.id)?.count, 1)
    assert.equal(database.prepare("SELECT source_id, review_count, due_at FROM review_items WHERE id = 'foreign_ai'").get()?.source_id, "ai:old-random:0")
    assert.equal(database.prepare("SELECT review_count FROM review_items WHERE id = 'foreign_ai'").get()?.review_count, 8)
    assert.equal(database.prepare("SELECT due_at FROM review_items WHERE id = 'foreign_ai'").get()?.due_at, "2030-01-01")
  } finally { fixture.close() }
})

test("pre-existing duplicate AI rows remain intact while the most-reviewed match is reused", async () => {
  const fixture = await creationFixture()
  const { database } = fixture
  try {
    const insert = database.prepare(`INSERT INTO review_items (id, user_id, source_type, source_id, title, prompt, answer, due_at, review_count)
      VALUES (?, ?, 'practice_mistake', ?, 'Old title', 'Boundary?', 'Membrane', '2030-01-01', ?)`)
    insert.run("legacy_ungraded", TEST_USER_ROW.id, "ai:old-a:0", 0)
    insert.run("legacy_graded", TEST_USER_ROW.id, "ai:old-b:0", 4)
    const untouched = database.prepare("SELECT * FROM review_items WHERE id = 'legacy_ungraded'").get()
    const gradedBefore = reviewedState(fixture, "legacy_graded")
    assert.equal((await fixture.save(generatedReviewCards([{ prompt: "Boundary?", answer: "Membrane" }], "New title"))).status, 201)
    assert.equal(database.prepare("SELECT count(*) AS count FROM review_items").get()?.count, 2)
    assert.deepEqual(database.prepare("SELECT * FROM review_items WHERE id = 'legacy_ungraded'").get(), untouched)
    assert.deepEqual(reviewedState(fixture, "legacy_graded"), gradedBefore)
    assert.equal(database.prepare("SELECT title FROM review_items WHERE id = 'legacy_graded'").get()?.title, "New title")
  } finally { fixture.close() }
})

test("simultaneous AI saves with canonical and old random IDs resolve one physical row", async () => {
  const fixture = await creationFixture()
  const { database, stub } = fixture
  try {
    installSqliteStore(stub, database, { beforeBatch: simultaneousBatchBarrier() })
    fixture.authenticate()
    const cards = generatedReviewCards([{ prompt: "Boundary?", answer: "Membrane" }], "Cells")
    const oldClientCards = [{ ...cards[0], sourceId: "ai:older-client-random:0" }]
    const responses = await Promise.all([fixture.save(cards), fixture.save(oldClientCards)])
    assert.deepEqual(responses.map((response) => response.status), [201, 201])
    assert.equal(database.prepare("SELECT count(*) AS count FROM review_items").get()?.count, 1)
    assert.equal(database.prepare("SELECT review_count FROM review_items").get()?.review_count, 0)
    assert.equal(database.prepare("SELECT count(*) AS count FROM audit_logs").get()?.count, 2)
  } finally { fixture.close() }
})

test("duplicate source IDs in one batch keep ordered last-wins content updates", async () => {
  const fixture = await creationFixture()
  const { database } = fixture
  try {
    const first = localCard("selection:duplicate", "First")
    const last = { ...first, title: "Last", prompt: "Final prompt", answer: "Final answer" }
    const response = await fixture.save([first, last])
    assert.equal(response.status, 201)
    assert.equal((await readJson<{ item: { count: number } }>(response)).item.count, 2, "the compatibility count describes accepted cards, including updates")
    assert.equal(database.prepare("SELECT count(*) AS count FROM review_items").get()?.count, 1)
    const row = database.prepare("SELECT title, prompt, answer, retrievability FROM review_items").get()
    assert.deepEqual({ ...row }, { title: "Last", prompt: "Final prompt", answer: "Final answer", retrievability: 0.55 })
    assert.equal(database.prepare("SELECT count(*) AS count FROM audit_logs").get()?.count, 1)
  } finally { fixture.close() }
})

test("a failing later card rolls back earlier updates and preserves the original grade", async () => {
  const fixture = await creationFixture()
  const { database } = fixture
  try {
    assert.equal((await fixture.save([localCard("selection:existing")])).status, 201)
    const id = String(database.prepare("SELECT id FROM review_items").get()?.id)
    assert.equal((await fixture.grade(id)).status, 201)
    const before = database.prepare("SELECT * FROM review_items").get()
    const logs = database.prepare("SELECT * FROM review_logs").all()
    const audits = database.prepare("SELECT * FROM audit_logs").all()
    database.exec("CREATE TRIGGER reject_card BEFORE INSERT ON review_items WHEN NEW.prompt = 'Fail' BEGIN SELECT RAISE(ABORT, 'card storage failure'); END")
    const failed = await fixture.save([localCard("selection:existing", "Uncommitted title"), { ...localCard("selection:failing"), prompt: "Fail" }])
    assert.equal(failed.status, 500)
    assert.match(String((await readJson(failed)).error), /card storage failure/)
    assert.equal(database.prepare("SELECT count(*) AS count FROM review_items").get()?.count, 1)
    assert.deepEqual(database.prepare("SELECT * FROM review_items").get(), before)
    assert.deepEqual(database.prepare("SELECT * FROM review_logs").all(), logs)
    assert.deepEqual(database.prepare("SELECT * FROM audit_logs").all(), audits)
  } finally { fixture.close() }
})

test("a late audit failure rolls back the entire new card set before a retry", async () => {
  const fixture = await creationFixture()
  const { database, stub } = fixture
  try {
    const cards = [localCard("selection:first"), { ...localCard("selection:second"), prompt: "Control?", answer: "Nucleus" }]
    database.exec("CREATE TRIGGER reject_card_audit BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT, 'audit storage failure'); END")
    assert.equal((await fixture.save(cards)).status, 500)
    assert.equal(stub.matching(/INSERT INTO review_items/).length, 2, "the injected failure happens after both card statements")
    assert.equal(database.prepare("SELECT count(*) AS count FROM review_items").get()?.count, 0)
    assert.equal(database.prepare("SELECT count(*) AS count FROM audit_logs").get()?.count, 0)
    database.exec("DROP TRIGGER reject_card_audit")
    assert.equal((await fixture.save(cards)).status, 201)
    assert.equal(database.prepare("SELECT count(*) AS count FROM review_items").get()?.count, 2)
    assert.equal(database.prepare("SELECT count(*) AS count FROM audit_logs").get()?.count, 1)
  } finally { fixture.close() }
})

test("a committed but lost save response is not replayed and a user retry preserves the cards", async () => {
  const fixture = await creationFixture()
  const { database, stub } = fixture
  try {
    let loseResponse = true
    stub.onBatch((_statements, execute) => {
      database.exec("BEGIN")
      let results: ReturnType<typeof execute>
      try {
        results = execute()
        database.exec("COMMIT")
      } catch (error) {
        database.exec("ROLLBACK")
        throw error
      }
      if (loseResponse) {
        loseResponse = false
        throw new Error("Lost committed card save response")
      }
      return results
    })
    const pairs = [{ prompt: "Boundary?", answer: "Membrane" }, { prompt: "Control?", answer: "Nucleus" }]
    assert.equal((await fixture.save(generatedReviewCards(pairs, "Cells"))).status, 500)
    assert.equal(stub.matching(/INSERT INTO review_items/).length, 2, "an uncertain transaction must not be automatically retried")
    assert.equal(database.prepare("SELECT count(*) AS count FROM review_items").get()?.count, 2)
    assert.equal(database.prepare("SELECT count(*) AS count FROM audit_logs").get()?.count, 1)
    const ids = database.prepare("SELECT id FROM review_items ORDER BY source_id").all()
    assert.equal((await fixture.grade(String(ids[0].id))).status, 201)
    const studied = reviewedState(fixture, String(ids[0].id))
    assert.equal((await fixture.save(generatedReviewCards(pairs, "Cells"))).status, 201)
    assert.deepEqual(database.prepare("SELECT id FROM review_items ORDER BY source_id").all(), ids)
    assert.deepEqual(reviewedState(fixture, String(ids[0].id)), studied)
    assert.equal(database.prepare("SELECT count(*) AS count FROM review_logs").get()?.count, 1)
  } finally { fixture.close() }
})

test("card save limits reject oversized batches before any card or audit writes", async () => {
  const fixture = await creationFixture()
  const { database, stub } = fixture
  try {
    const cards = Array.from({ length: 40 }, (_, index) => ({ ...localCard(`selection:${index}`), prompt: `Question ${index}` }))
    const tooMany = await fixture.save([...cards, cards[0]])
    assert.equal(tooMany.status, 500)
    assert.match(String((await readJson(tooMany)).error), /at most 40/)
    assert.equal(stub.writesMatching(/./).length, 0)
    assert.equal((await fixture.save(cards)).status, 201)
    assert.equal(database.prepare("SELECT count(*) AS count FROM review_items").get()?.count, 40)
    assert.equal(database.prepare("SELECT count(*) AS count FROM audit_logs").get()?.count, 1)
  } finally { fixture.close() }
})
