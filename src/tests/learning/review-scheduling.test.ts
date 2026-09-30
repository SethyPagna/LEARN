import assert from "node:assert/strict"
import test from "node:test"
import { nextReviewDueAt, readDailyReviewBudget, reviewSchedulingPreferences } from "../../lib/review-scheduling"
import { installDatabaseStub } from "../api/harness"

test("review preferences preserve zero caps and validate stored settings", () => {
  assert.deepEqual(reviewSchedulingPreferences({}), { dailyCap: 30, restDay: undefined })
  assert.deepEqual(reviewSchedulingPreferences({ dailyReviewCap: 0, restDay: "sunday" }), { dailyCap: 0, restDay: "sunday" })
  assert.equal(reviewSchedulingPreferences({ dailyReviewCap: 500 }).dailyCap, 200)
  assert.equal(reviewSchedulingPreferences({ dailyReviewCap: 5.9 }).dailyCap, 5)
  assert.equal(reviewSchedulingPreferences({ dailyReviewCap: "broken", restDay: "funday" }).dailyCap, 30)
  assert.equal(reviewSchedulingPreferences({ restDay: "funday" }).restDay, undefined)
})

test("review intervals retain each rating and move a due date beyond the rest day", () => {
  const now = new Date("2026-09-30T09:15:00.000Z")
  assert.equal(nextReviewDueAt({ now, rating: "again" }), "2026-10-01T09:15:00.000Z")
  assert.equal(nextReviewDueAt({ now, rating: "hard" }), "2026-10-02T09:15:00.000Z")
  assert.equal(nextReviewDueAt({ now, rating: "good" }), "2026-10-04T09:15:00.000Z")
  assert.equal(nextReviewDueAt({ now, rating: "easy" }), "2026-10-07T09:15:00.000Z")
  assert.equal(nextReviewDueAt({ now, rating: "good", restDay: "sunday" }), "2026-10-05T09:15:00.000Z")
  assert.equal(nextReviewDueAt({ now, rating: "again", restDay: "thursday" }), "2026-10-02T09:15:00.000Z")
})

test("daily review budget scopes completions to the caller and one UTC day", async () => {
  const stub = installDatabaseStub()
  try {
    let count = 2
    stub.on(/SELECT count\(\*\) AS count FROM review_logs/, (sql, params) => {
      assert.match(sql, /user_id = \? AND datetime\(created_at\) >= datetime\(\?\) AND datetime\(created_at\) < datetime\(\?\)/)
      assert.deepEqual(params, ["learner", "2026-10-01T00:00:00.000Z", "2026-10-02T00:00:00.000Z"])
      return { rows: [{ count }] }
    })
    const input = { userId: "learner", preferences: { dailyReviewCap: 3, restDay: "sunday" }, now: new Date("2026-10-01T23:59:59.000Z") }
    assert.deepEqual(await readDailyReviewBudget(input), { dailyCap: 1, restDay: "sunday" })
    count = 5
    assert.equal((await readDailyReviewBudget(input)).dailyCap, 0, "an exhausted budget cannot become negative")
    assert.equal(stub.writesMatching(/./).length, 0)
  } finally {
    stub.restore()
  }
})
