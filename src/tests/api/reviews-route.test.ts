import assert from "node:assert/strict"
import test from "node:test"
import { shiftDay } from "../../lib/today"
import type { ReviewSchedule } from "../../lib/learning-ecosystem"
import { installDatabaseStub, primeDatabase, readJson, request, stubSessionLookup, TEST_USER_ROW } from "./harness"
import { createSqliteFixture, installSqliteStore, simultaneousBatchBarrier } from "./sqlite-store"

function card(id = "review_1") {
  return { id, title: "Saved card", source_type: "flashcard", due_at: "2020-01-01 00:00:00", difficulty: 0, stability: 2, retrievability: 0, prompt: "Recall", answer: "Saved answer", metadata: '{"topic":"Cells"}' }
}

async function gradingFixture(preferences: Record<string, unknown> = {}) {
  const fixture = await createSqliteFixture()
  const { database, stub } = fixture
  database.prepare("INSERT INTO users (id, username, email, name, password_hash, preferences, xp_total) VALUES (?, ?, ?, ?, 'test', ?, ?)")
    .run(TEST_USER_ROW.id, TEST_USER_ROW.username, TEST_USER_ROW.email, TEST_USER_ROW.name, JSON.stringify(preferences), TEST_USER_ROW.xp_total)
  stub.on(/FROM user_sessions/, { rows: [{ ...TEST_USER_ROW, preferences: JSON.stringify(preferences) }] })
  const { POST } = await import("../../app/api/reviews/route")
  return {
    ...fixture,
    addCard(id: string) {
      database.prepare("INSERT INTO review_items (id, user_id, source_type, source_id, title, due_at) VALUES (?, ?, 'flashcard', ?, 'Saved card', '2020-01-01 00:00:00')")
        .run(id, TEST_USER_ROW.id, id)
    },
    grade(id: string, rating = "good") {
      return POST(request("/api/reviews", { method: "POST", body: { id, rating } }))
    },
  }
}

test("reviews GET reads existing cards and keeps an empty queue empty", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    const { GET } = await import("../../app/api/reviews/route")
    const empty = await readJson<ReviewSchedule>(await GET(request("/api/reviews")))
    assert.deepEqual(empty.items, [])
    assert.equal(stub.matching(/FROM notes/).length, 0, "loading reviews must never invent cards from notes")
    stub.on(/SELECT \* FROM review_items/, (sql, params) => {
      assert.match(sql, /user_id = \? AND datetime\(due_at\) <= datetime\(\?\)/)
      assert.match(sql, /ORDER BY datetime\(due_at\) ASC\s+LIMIT \?/)
      assert.equal(params[0], TEST_USER_ROW.id)
      assert.equal(params[2], 200)
      return { rows: [card()] }
    })
    const saved = await readJson<ReviewSchedule>(await GET(request("/api/reviews")))
    assert.deepEqual(saved.items[0], { id: "review_1", title: "Saved card", sourceType: "flashcard", dueAt: "2020-01-01T00:00:00.000Z", difficulty: 0, stability: 2, retrievability: 0, prompt: "Recall", answer: "Saved answer", topic: "Cells" })
    assert.equal(stub.writesMatching(/./).length, 0, "queue reads do not write to the learner's data")
  } finally {
    stub.restore()
  }
})

test("reviews and Today share the remaining daily budget and preserve rest days", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    const now = new Date()
    const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
    let preferences: Record<string, unknown> = { dailyReviewCap: 2 }
    let completed = 1
    stub.on(/FROM user_sessions/, () => ({ rows: [{ ...TEST_USER_ROW, preferences: JSON.stringify(preferences) }] }))
    stub.on(/FROM review_items/, { rows: [card("oldest"), { ...card("later"), due_at: "2020-01-02T00:00:00Z" }] })
    stub.on(/SELECT count\(\*\) AS count FROM review_logs/, (_sql, params) => {
      assert.equal(params[0], TEST_USER_ROW.id)
      return { rows: [{ count: completed }] }
    })
    const { GET } = await import("../../app/api/reviews/route")
    const { getTodayData } = await import("../../lib/today-data")
    const schedule = await readJson<ReviewSchedule>(await GET(request("/api/reviews")))
    assert.deepEqual(schedule.items.map((item) => item.id), ["oldest"])
    assert.equal(schedule.remainingDueCount, 1)
    const user = { ...TEST_USER_ROW, role: "learner" as const, preferences }
    assert.equal((await getTodayData(user, 0, now)).reviewsDue, schedule.items.length)
    completed = 2
    assert.deepEqual((await readJson<ReviewSchedule>(await GET(request("/api/reviews")))).items, [])
    assert.equal((await getTodayData(user, 0, now)).reviewsDue, 0)
    preferences = { dailyReviewCap: 2, restDay: weekdays[now.getUTCDay()] }
    completed = 0
    const rest = await readJson<ReviewSchedule>(await GET(request("/api/reviews")))
    assert.equal(rest.isRestDay, true)
    assert.deepEqual(rest.items, [])
    assert.equal(rest.remainingDueCount, 2)
    assert.equal(stub.writesMatching(/./).length, 0)
  } finally {
    stub.restore()
  }
})

test("the configured 200-card daily dose is not silently truncated at 120", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stub.on(/FROM user_sessions/, { rows: [{ ...TEST_USER_ROW, preferences: '{"dailyReviewCap":200}' }] })
    stub.on(/SELECT \* FROM review_items/, { rows: Array.from({ length: 150 }, (_, index) => card(`review_${index}`)) })
    const { GET } = await import("../../app/api/reviews/route")
    const schedule = await readJson<ReviewSchedule>(await GET(request("/api/reviews")))
    assert.equal(schedule.items.length, 150)
    assert.equal(stub.matching(/SELECT \* FROM review_items/)[0].params[2], 200)
  } finally {
    stub.restore()
  }
})

test("grading reads the persisted streak and does not increment it twice on one day", async () => {
  const fixture = await gradingFixture()
  const { database } = fixture
  try {
    const today = new Date().toISOString().slice(0, 10)
    database.prepare("UPDATE users SET streak_current = 6, streak_longest = 12, streak_freezes_available = 2, last_learning_activity_at = ? WHERE id = ?")
      .run(shiftDay(today, -1), TEST_USER_ROW.id)
    for (const id of ["review_1", "review_2"]) {
      fixture.addCard(id)
      const response = await fixture.grade(id)
      assert.equal(response.status, 201)
      const body = await readJson<{ item: { streak: { current: number; longest: number; freezesAvailable: number } } }>(response)
      assert.equal(body.item.streak.current, 7, "the session's stale metrics must not reset or increment the persisted streak")
      assert.equal(body.item.streak.longest, 12)
      assert.equal(body.item.streak.freezesAvailable, 2)
    }
    assert.equal(database.prepare("SELECT count(*) AS count FROM review_logs").get()?.count, 2)
    assert.equal(database.prepare("SELECT xp_total FROM users WHERE id = ?").get(TEST_USER_ROW.id)?.xp_total, 436)
  } finally {
    fixture.close()
  }
})

test("a card kept open after the daily dose is completed cannot create another log or XP", async () => {
  const fixture = await gradingFixture({ dailyReviewCap: 1 })
  const { database } = fixture
  try {
    fixture.addCard("first_card")
    fixture.addCard("another_due_card")
    const first = await fixture.grade("first_card")
    assert.equal(first.status, 201)
    const heldInAnotherTab = await fixture.grade("another_due_card")
    assert.equal(heldInAnotherTab.status, 400)
    assert.match(String((await readJson(heldInAnotherTab)).error), /today's review limit/)
    assert.equal(database.prepare("SELECT count(*) AS count FROM review_logs").get()?.count, 1)
    assert.equal(database.prepare("SELECT count(*) AS count FROM audit_logs").get()?.count, 1)
    assert.equal(database.prepare("SELECT review_count FROM review_items WHERE id = 'another_due_card'").get()?.review_count, 0)
    assert.equal(database.prepare("SELECT xp_total FROM users WHERE id = ?").get(TEST_USER_ROW.id)?.xp_total, 428)
  } finally {
    fixture.close()
  }
})

test("a card kept open into a rest day is rejected before any learner data is written", async () => {
  const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
  const fixture = await gradingFixture({ dailyReviewCap: 30, restDay: weekdays[new Date().getUTCDay()] })
  const { stub } = fixture
  try {
    fixture.addCard("previously_loaded_card")
    const response = await fixture.grade("previously_loaded_card")
    assert.equal(response.status, 400)
    assert.match(String((await readJson(response)).error), /rest day/)
    assert.equal(stub.writesMatching(/./).length, 0)
  } finally {
    fixture.close()
  }
})

test("a review cap previously saved by Settings applies to real grading", async () => {
  const fixture = await gradingFixture({ workspaceOptions: { dailyReviewCap: 1 } })
  try {
    fixture.addCard("settings_first")
    fixture.addCard("settings_second")
    assert.equal((await fixture.grade("settings_first")).status, 201)
    const exhausted = await fixture.grade("settings_second")
    assert.equal(exhausted.status, 400)
    assert.match(String((await readJson(exhausted)).error), /today's review limit/)
    assert.equal(fixture.database.prepare("SELECT count(*) AS count FROM review_logs").get()?.count, 1)
    assert.equal(fixture.database.prepare("SELECT review_count FROM review_items WHERE id = 'settings_second'").get()?.review_count, 0)
  } finally { fixture.close() }
})

test("duplicate, unavailable, and invalid grades do not create logs or XP", async () => {
  const fixture = await gradingFixture()
  const { stub, database } = fixture
  try {
    fixture.addCard("owned_card")
    const invalid = await fixture.grade("owned_card", "invented")
    assert.equal(invalid.status, 400)
    assert.equal(stub.matching(/UPDATE review_items/).length, 0)
    installSqliteStore(stub, database, { beforeBatch: simultaneousBatchBarrier() })
    stubSessionLookup(stub)
    const duplicates = await Promise.all([fixture.grade("owned_card"), fixture.grade("owned_card")])
    assert.deepEqual(duplicates.map((response) => response.status).sort(), [201, 400])
    assert.equal((await fixture.grade("other_or_future_card")).status, 400)
    assert.equal(database.prepare("SELECT count(*) AS count FROM review_logs").get()?.count, 1)
    assert.equal(database.prepare("SELECT review_item_id, user_id FROM review_logs").get()?.review_item_id, "owned_card")
    assert.equal(database.prepare("SELECT review_count FROM review_items WHERE id = 'owned_card'").get()?.review_count, 1)
    assert.equal(database.prepare("SELECT xp_total FROM users WHERE id = ?").get(TEST_USER_ROW.id)?.xp_total, 428)
  } finally {
    fixture.close()
  }
})
