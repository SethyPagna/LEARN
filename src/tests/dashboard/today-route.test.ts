import assert from "node:assert/strict"
import test from "node:test"
import { installDatabaseStub, primeDatabase, readJson, request, stubSessionLookup, TEST_USER_ROW } from "../api/harness"
import { localDay, shiftDay, type StreakSummary } from "../../lib/today"
import type { TodayData } from "../../lib/today-data"

const ME = TEST_USER_ROW.id
const ACTIVITY = /SELECT DISTINCT date\(ts, \?\) AS day/
const REVIEWS = /FROM review_items/
const LIVE = /FROM live_quiz_sessions s/
const PROJECT_TABLES = /FROM (notes|editor_documents|sheet_documents|slide_decks) WHERE owner_user_id/

async function getToday(query = "?tz=-420") {
  const { GET } = await import("../../app/api/today/route")
  return GET(request(`/api/today${query}`))
}

test("Today reads the caller's own activity, reviews, projects and invites without writing anything", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    const today = localDay(new Date(), -420)
    stub.on(ACTIVITY, { rows: [{ day: today }, { day: shiftDay(today, -1) }, { day: shiftDay(today, -3) }] })
    const past = new Date(Date.now() - 60 * 60 * 1000)
    stub.on(REVIEWS, { rows: [
      { id: "r1", due_at: past.toISOString(), retrievability: 0.4 },
      { id: "r2", due_at: past.toISOString().replace("T", " ").slice(0, 19), retrievability: 0.6 },
      { id: "r3", due_at: new Date(Date.now() + 86_400_000).toISOString(), retrievability: 0.9 },
      { id: "r4", due_at: "not a date", retrievability: 0.9 },
    ] })
    stub.on(/FROM notes WHERE owner_user_id/, { rows: [{ id: "n1", title: "Cell biology", updated_at: "2026-09-26 09:00:00" }] })
    stub.on(/document_type = 'canvas'/, { rows: [{ id: "c1", title: "Poster", updated_at: "2026-09-27T01:00:00.000Z" }] })
    stub.on(/FROM slide_decks/, { rows: [{ id: "s1", title: "Pitch", updated_at: "2026-09-25 12:00:00" }] })
    stub.on(LIVE, { rows: [{ code: "QX7K2P", quiz_title: "Cells", host_name: "Dara Sok", created_at: "2026-09-27 08:00:00" }] })

    const response = await getToday()
    assert.equal(response.status, 200)
    const data = await readJson<TodayData>(response)

    assert.equal(data.firstName, "Test")
    assert.equal(data.today, today)
    assert.deepEqual({ streak: data.streak.streak, studiedToday: data.streak.studiedToday }, { streak: 2, studiedToday: true } satisfies Partial<StreakSummary>)
    assert.equal(data.streak.week.length, 7)
    assert.equal(data.reviewsDue, 2, "both past-due cards count, whichever timestamp format they use; future and unreadable ones do not")
    assert.equal(data.restDay, false)
    assert.deepEqual(data.projects.map((project) => `${project.kind}:${project.id}`), ["canvas:c1", "notes:n1", "slides:s1"], "newest first across kinds")
    assert.deepEqual(data.liveGame, { code: "QX7K2P", quizTitle: "Cells", hostName: "Dara Sok", createdAt: "2026-09-27 08:00:00" })

    // D1 binds by position, so parameters arrive in the order they appear in the SQL.
    const [activity] = stub.matching(ACTIVITY)
    assert.deepEqual(activity.params, ["+420 minutes", ME, ME, ME, ME, ME, shiftDay(today, -400)], "days are counted in the learner's own time zone, from the caller's rows only")
    for (const statement of [...stub.matching(REVIEWS), ...stub.matching(PROJECT_TABLES)]) {
      assert.equal(statement.params[0], ME, `scoped to the caller: ${statement.sql.slice(0, 60)}`)
    }
    assert.equal(stub.matching(PROJECT_TABLES).length, 5, "one light read per project kind")
    assert.ok(stub.matching(PROJECT_TABLES).every((statement) => /archived_at IS NULL/.test(statement.sql) && !/content|cells|slides,/.test(statement.sql.split("FROM")[0])), "live projects only, and no content is downloaded")

    const [live] = stub.matching(LIVE)
    assert.match(live.sql, /t\.created_by_user_id = \? OR t\.target_user_id = \?/, "only games posted in chats you belong to")
    assert.match(live.sql, /group_members WHERE user_id = \?/)
    assert.match(live.sql, /NOT EXISTS/, "games you already joined are not offered again")
    assert.ok(live.params.every((value) => value === ME || value === "-3 hours"), "every predicate is bound to the caller")

    assert.deepEqual(stub.writesMatching(/./).map((statement) => statement.sql), [], "Today never writes, not even review seeding")
  } finally {
    stub.restore()
  }
})

test("Today falls back to UTC for a missing or nonsense time zone", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    for (const query of ["", "?tz=abc", "?tz=9999", "?tz=1.5"]) {
      stub.reset()
      stubSessionLookup(stub)
      const response = await getToday(query)
      assert.equal(response.status, 200)
      const data = await readJson<TodayData>(response)
      assert.equal(stub.matching(ACTIVITY)[0].params[0], "+0 minutes", query || "no tz")
      assert.equal(data.today, localDay(new Date(), 0))
      assert.deepEqual({ streak: data.streak.streak, reviewsDue: data.reviewsDue, projects: data.projects, liveGame: data.liveGame }, { streak: 0, reviewsDue: 0, projects: [], liveGame: null })
    }
  } finally {
    stub.restore()
  }
})

test("Today needs a signed-in learner", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    const { GET } = await import("../../app/api/today/route")
    const response = await GET(request("/api/today", { token: null }))
    assert.equal(response.status, 401)
    assert.equal(stub.matching(ACTIVITY).length, 0)
  } finally {
    stub.restore()
  }
})
