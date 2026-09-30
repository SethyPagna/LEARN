import assert from "node:assert/strict"
import test from "node:test"
import { shiftDay } from "../../lib/today"
import type { ReviewSchedule } from "../../lib/learning-ecosystem"
import { installDatabaseStub, primeDatabase, readJson, request, stubSessionLookup, TEST_USER_ROW } from "./harness"

function card(id = "review_1") {
  return { id, title: "Saved card", source_type: "flashcard", due_at: "2020-01-01 00:00:00", difficulty: 0, stability: 2, retrievability: 0, prompt: "Recall", answer: "Saved answer", metadata: '{"topic":"Cells"}' }
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
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    const today = new Date().toISOString().slice(0, 10)
    const current = { streak_current: 6, streak_longest: 12, streak_freezes_available: 2, last_learning_activity_at: shiftDay(today, -1) }
    stub.on(/UPDATE review_items/, { rowCount: 1 })
    stub.on(/SELECT streak_current, streak_longest/, (_sql, params) => {
      assert.deepEqual(params, [TEST_USER_ROW.id])
      return { rows: [current] }
    })
    stub.on(/UPDATE users SET streak_current/, (_sql, params) => {
      assert.deepEqual(params, [7, 12, 2, today, TEST_USER_ROW.id])
      current.streak_current = Number(params[0])
      current.last_learning_activity_at = String(params[3])
      return { rowCount: 1 }
    })
    const { POST } = await import("../../app/api/reviews/route")
    for (const id of ["review_1", "review_2"]) {
      const response = await POST(request("/api/reviews", { method: "POST", body: { id, rating: "good" } }))
      assert.equal(response.status, 201)
      const body = await readJson<{ item: { streak: { current: number; longest: number; freezesAvailable: number } } }>(response)
      assert.equal(body.item.streak.current, 7, "the session's stale metrics must not reset or increment the persisted streak")
      assert.equal(body.item.streak.longest, 12)
      assert.equal(body.item.streak.freezesAvailable, 2)
    }
    assert.equal(stub.matching(/INSERT INTO review_logs/).length, 2)
  } finally {
    stub.restore()
  }
})

test("a card kept open after the daily dose is completed cannot create another log or XP", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stub.on(/FROM user_sessions/, { rows: [{ ...TEST_USER_ROW, preferences: '{"dailyReviewCap":1}' }] })
    let completed = 0
    stub.on(/SELECT count\(\*\) AS count FROM review_logs/, (_sql, params) => {
      assert.equal(params[0], TEST_USER_ROW.id)
      return { rows: [{ count: completed }] }
    })
    stub.on(/UPDATE review_items/, { rowCount: 1 })
    stub.on(/INSERT INTO review_logs/, () => {
      completed += 1
      return { rowCount: 1 }
    })
    const { POST } = await import("../../app/api/reviews/route")
    const first = await POST(request("/api/reviews", { method: "POST", body: { id: "first_card" } }))
    assert.equal(first.status, 201)
    const heldInAnotherTab = await POST(request("/api/reviews", { method: "POST", body: { id: "another_due_card" } }))
    assert.equal(heldInAnotherTab.status, 400)
    assert.match(String((await readJson(heldInAnotherTab)).error), /today's review limit/)
    assert.equal(stub.matching(/UPDATE review_items/).length, 1)
    assert.equal(stub.matching(/INSERT INTO review_logs/).length, 1)
    assert.equal(stub.matching(/UPDATE users SET streak_current/).length, 1)
  } finally {
    stub.restore()
  }
})

test("a card kept open into a rest day is rejected before any learner data is written", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
    const preferences = { dailyReviewCap: 30, restDay: weekdays[new Date().getUTCDay()] }
    stub.on(/FROM user_sessions/, { rows: [{ ...TEST_USER_ROW, preferences: JSON.stringify(preferences) }] })
    const { POST } = await import("../../app/api/reviews/route")
    const response = await POST(request("/api/reviews", { method: "POST", body: { id: "previously_loaded_card", rating: "good" } }))
    assert.equal(response.status, 400)
    assert.match(String((await readJson(response)).error), /rest day/)
    assert.equal(stub.writesMatching(/./).length, 0)
  } finally {
    stub.restore()
  }
})

test("duplicate, unavailable, and invalid grades do not create logs or XP", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    const due = new Set(["owned_card"])
    stub.on(/UPDATE review_items/, (sql, params) => {
      assert.match(sql, /WHERE id = \? AND user_id = \? AND datetime\(due_at\) <= datetime\(\?\)/)
      assert.equal(params[4], TEST_USER_ROW.id)
      assert.ok(Date.parse(String(params[0])) > Date.parse(String(params[5])))
      return { rowCount: due.delete(String(params[3])) ? 1 : 0 }
    })
    const { POST } = await import("../../app/api/reviews/route")
    const grade = (id: string, rating = "good") => POST(request("/api/reviews", { method: "POST", body: { id, rating } }))
    const invalid = await grade("owned_card", "invented")
    assert.equal(invalid.status, 400)
    assert.equal(stub.matching(/UPDATE review_items/).length, 0)
    const duplicates = await Promise.all([grade("owned_card"), grade("owned_card")])
    assert.deepEqual(duplicates.map((response) => response.status).sort(), [201, 400])
    assert.equal((await grade("other_or_future_card")).status, 400)
    assert.equal(stub.matching(/INSERT INTO review_logs/).length, 1)
    assert.equal(stub.matching(/UPDATE users SET streak_current/).length, 1)
    const write = stub.matching(/INSERT INTO review_logs/)[0]
    assert.equal(write.params[1], TEST_USER_ROW.id)
    assert.equal(write.params[2], "owned_card")
  } finally {
    stub.restore()
  }
})
