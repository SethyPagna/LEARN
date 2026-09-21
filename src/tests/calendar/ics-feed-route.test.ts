/**
 * Route tests for the calendar export and the subscription feed.
 *
 * These run the real handlers, the real `lib/data.ts` and the real SQL
 * normaliser against the D1 HTTP boundary (`./harness`), so they fail if any
 * link breaks — including the one that matters most here: the public,
 * token-only read path, which by definition has no session to fall back on.
 *
 * The assertions deliberately look at the SQL that reached the database, not
 * just the response. A feed route that returned 200 while reading every user's
 * events would pass a response-only test.
 */

import assert from "node:assert/strict"
import test from "node:test"

import {
  installDatabaseStub,
  primeDatabase,
  readJson,
  request,
  stubSessionLookup,
  TEST_USER_ROW,
} from "../api/harness"

const FEED_TOKEN = "a".repeat(64)

const EVENT_ROWS = [
  {
    id: "event_alpha",
    workspace_id: "workspace_demo",
    owner_user_id: TEST_USER_ROW.id,
    title: "Focus block",
    event_type: "study",
    starts_at: "2026-09-21T13:05:00.000Z",
    ends_at: "2026-09-21T13:50:00.000Z",
    timezone: "UTC",
    notes: "Chapter 4",
    linked_note_id: null,
    reminder_minutes: 30,
  },
  {
    id: "event_beta",
    workspace_id: "workspace_demo",
    owner_user_id: TEST_USER_ROW.id,
    title: "Review",
    event_type: "review",
    starts_at: "2026-09-22T09:00:00.000Z",
    ends_at: "2026-09-22T09:30:00.000Z",
    timezone: "UTC",
    notes: "",
    linked_note_id: null,
    reminder_minutes: null,
  },
]

// `query()` rewrites `$n` to `?` before the statement leaves the process, so
// these match either side of the normaliser.
const OWNER_SCOPED_READ = /FROM calendar_events\s+WHERE owner_user_id = (?:\$\d+|\?)\s+ORDER BY/
const ADMIN_WIDENED_READ = /OR (?:\$\d+|\?) = 'admin'/

// ---------------------------------------------------------------------------
// GET /api/calendar/ics — session export
// ---------------------------------------------------------------------------

test("GET /api/calendar/ics with a session exports the caller's events as text/calendar", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    stub.on(/FROM calendar_events/, { rows: EVENT_ROWS })

    const { GET } = await import("../../app/api/calendar/ics/route")
    const response = await GET(request("/api/calendar/ics"))

    assert.equal(response.status, 200)
    assert.equal(response.headers.get("content-type"), "text/calendar; charset=utf-8")
    assert.equal(response.headers.get("content-disposition"), 'attachment; filename="learn-calendar.ics"')
    assert.equal(response.headers.get("cache-control"), "no-store")

    const body = await response.text()
    assert.ok(body.startsWith("BEGIN:VCALENDAR\r\n"))
    assert.ok(body.endsWith("END:VCALENDAR\r\n"))
    assert.ok(body.includes("UID:event_alpha@learn"))
    assert.ok(body.includes("DTSTART:20260921T130500Z"))
    // The row's own reminder wins over the default lead.
    assert.ok(body.includes("TRIGGER:-PT30M"))
    // The null reminder on event_beta falls back to the default 15 minutes.
    assert.ok(body.includes("TRIGGER:-PT15M"))
    assert.ok(body.includes("DESCRIPTION:Chapter 4"))
    assert.equal(/[^\r]\n/.test(body), false, "the body must use CRLF throughout")
  } finally {
    stub.restore()
  }
})

test("the export never widens to other users' events, even for an admin", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    // An admin session: `listCalendarEvents` would hand this caller every event
    // in the workspace. The export must not use that read.
    stub.on(/FROM user_sessions/, { rows: [{ ...TEST_USER_ROW, role: "admin" }] })
    stub.on(/FROM calendar_events/, { rows: EVENT_ROWS })

    const { GET } = await import("../../app/api/calendar/ics/route")
    const response = await GET(request("/api/calendar/ics"))

    assert.equal(response.status, 200)
    const reads = stub.matching(/FROM calendar_events/)
    assert.equal(reads.length, 1)
    assert.ok(OWNER_SCOPED_READ.test(reads[0].sql), `expected an owner-scoped read, got: ${reads[0].sql}`)
    assert.equal(ADMIN_WIDENED_READ.test(reads[0].sql), false, "the admin bypass must not reach the feed")
    assert.deepEqual(reads[0].params, [TEST_USER_ROW.id])
  } finally {
    stub.restore()
  }
})

// ---------------------------------------------------------------------------
// GET /api/calendar/ics?token=… — the public subscription feed
// ---------------------------------------------------------------------------

test("a valid token serves that user's events with no session at all", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stub.on(/FROM users WHERE calendar_feed_token/, { rows: [{ ...TEST_USER_ROW, calendar_feed_token: FEED_TOKEN }] })
    stub.on(/FROM calendar_events/, { rows: EVENT_ROWS })

    const { GET } = await import("../../app/api/calendar/ics/route")
    // `token: null` means no cookie is sent: this is the calendar app's request.
    const response = await GET(request(`/api/calendar/ics?token=${FEED_TOKEN}`, { token: null }))

    assert.equal(response.status, 200)
    const body = await response.text()
    assert.ok(body.includes("UID:event_alpha@learn"))

    // Identity came from the token, not from a session.
    const tokenLookups = stub.matching(/FROM users WHERE calendar_feed_token/)
    assert.equal(tokenLookups.length, 1)
    assert.deepEqual(tokenLookups[0].params, [FEED_TOKEN])
    assert.equal(
      stub.matching(/FROM user_sessions/).length,
      0,
      "a token request must not consult the session table",
    )
  } finally {
    stub.restore()
  }
})

test("an invalid token without a session is rejected and reads no events", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    // An exact-match lookup for a token nobody holds.
    stub.on(/FROM users WHERE calendar_feed_token/, { rows: [] })

    const { GET } = await import("../../app/api/calendar/ics/route")
    const response = await GET(request("/api/calendar/ics?token=guess", { token: null }))

    assert.equal(response.status, 401)
    assert.equal(stub.matching(/FROM calendar_events/).length, 0, "no events may be read for an unknown token")
  } finally {
    stub.restore()
  }
})

test("a revoked token is not retried against an unrelated signed-in session", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    stub.on(/FROM users WHERE calendar_feed_token/, { rows: [] })

    const { GET } = await import("../../app/api/calendar/ics/route")
    // A valid session cookie *is* present, and the token is still honoured as
    // the identity: falling back would serve a different account's calendar to
    // whoever happens to be signed in on the device that opened the link.
    const response = await GET(request("/api/calendar/ics?token=revoked"))

    assert.equal(response.status, 401)
    assert.equal(stub.matching(/FROM user_sessions/).length, 0, "the session must not be consulted")
    assert.equal(stub.matching(/FROM calendar_events/).length, 0)
  } finally {
    stub.restore()
  }
})

test("no token and no session is rejected", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)

    const { GET } = await import("../../app/api/calendar/ics/route")
    const response = await GET(request("/api/calendar/ics", { token: null }))

    assert.equal(response.status, 401)
    assert.equal(stub.matching(/FROM calendar_events/).length, 0)
  } finally {
    stub.restore()
  }
})

test("the feed route exports only GET, so the public surface cannot write", async () => {
  const route = await import("../../app/api/calendar/ics/route")

  assert.deepEqual(Object.keys(route).sort(), ["GET"])
})

// ---------------------------------------------------------------------------
// POST /api/calendar/feed — minting the subscription URL
// ---------------------------------------------------------------------------

test("POST /api/calendar/feed mints a token when the caller has none and returns a usable URL", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    stub.on(/SELECT calendar_feed_token FROM users/, { rows: [{ calendar_feed_token: null }] })
    stub.on(/UPDATE users SET calendar_feed_token/, { rowCount: 1 })

    const { POST } = await import("../../app/api/calendar/feed/route")
    const response = await POST(request("/api/calendar/feed", { method: "POST" }))

    assert.equal(response.status, 200)
    const payload = await readJson<{ url: string }>(response)

    const writes = stub.matching(/UPDATE users SET calendar_feed_token/)
    assert.equal(writes.length, 1)
    const minted = String(writes[0].params[0])
    assert.match(minted, /^[0-9a-f]{48,}$/, "the token must be long hex")
    assert.equal(writes[0].params[1], TEST_USER_ROW.id)

    // The URL has to be copy-pasteable, so it uses the request's own origin and
    // carries the same token that was just persisted.
    assert.equal(payload.url, `https://learn.local/api/calendar/ics?token=${minted}`)
  } finally {
    stub.restore()
  }
})

test("POST /api/calendar/feed returns the existing token without rewriting the row", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    stub.on(/SELECT calendar_feed_token FROM users/, { rows: [{ calendar_feed_token: FEED_TOKEN }] })

    const { POST } = await import("../../app/api/calendar/feed/route")
    const response = await POST(request("/api/calendar/feed", { method: "POST" }))

    assert.equal(response.status, 200)
    const payload = await readJson<{ url: string }>(response)
    assert.equal(payload.url, `https://learn.local/api/calendar/ics?token=${FEED_TOKEN}`)
    assert.equal(
      stub.matching(/UPDATE users SET calendar_feed_token/).length,
      0,
      "an existing link must keep working; re-minting would break every subscribed device",
    )
  } finally {
    stub.restore()
  }
})

test("POST /api/calendar/feed requires a session and a same-origin request", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)

    const { POST } = await import("../../app/api/calendar/feed/route")

    const anonymous = await POST(request("/api/calendar/feed", { method: "POST", token: null }))
    assert.equal(anonymous.status, 401)

    const crossOrigin = await POST(
      request("/api/calendar/feed", { method: "POST", headers: { origin: "https://attacker.example" } }),
    )
    assert.equal(crossOrigin.status, 403)

    // Neither caller may have been handed a link.
    assert.equal(stub.matching(/calendar_feed_token/).length, 0)
  } finally {
    stub.restore()
  }
})

// ---------------------------------------------------------------------------
// POST /api/calendar — the reminder column survives the write path
// ---------------------------------------------------------------------------

test("POST /api/calendar stores the chosen reminder, including a literal zero", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    stub.on(/INSERT INTO calendar_events/, { rowCount: 1 })
    stub.on(/INSERT INTO audit_logs/, { rowCount: 1 })
    stub.on(/SELECT \* FROM calendar_events/, {
      rows: [{ ...EVENT_ROWS[0], id: "event_new", reminder_minutes: 0 }],
    })

    const { POST } = await import("../../app/api/calendar/route")
    const response = await POST(
      request("/api/calendar", {
        method: "POST",
        body: {
          title: "Silent block",
          startsAt: "2026-09-21T13:05:00.000Z",
          endsAt: "2026-09-21T13:50:00.000Z",
          reminderMinutes: 0,
        },
      }),
    )

    assert.equal(response.status, 201)
    const inserts = stub.matching(/INSERT INTO calendar_events/)
    assert.equal(inserts.length, 1)
    assert.ok(inserts[0].sql.includes("reminder_minutes"), "the column must be written")
    assert.equal(
      inserts[0].params[inserts[0].params.length - 1],
      0,
      'a chosen "None" is 0, not null — reading it with `||` would lose it',
    )

    const payload = await readJson<{ item: { reminder_minutes: number | null } }>(response)
    assert.equal(payload.item.reminder_minutes, 0)
  } finally {
    stub.restore()
  }
})

test("a reminder that was never chosen stays null rather than becoming zero", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    stub.on(/INSERT INTO calendar_events/, { rowCount: 1 })
    stub.on(/INSERT INTO audit_logs/, { rowCount: 1 })
    stub.on(/SELECT \* FROM calendar_events/, { rows: [{ ...EVENT_ROWS[0], reminder_minutes: null }] })

    const { POST } = await import("../../app/api/calendar/route")
    const response = await POST(
      request("/api/calendar", {
        method: "POST",
        body: { title: "No choice", startsAt: "2026-09-21T13:05:00.000Z", endsAt: "2026-09-21T13:50:00.000Z" },
      }),
    )

    assert.equal(response.status, 201)
    const inserts = stub.matching(/INSERT INTO calendar_events/)
    assert.equal(inserts[0].params[inserts[0].params.length - 1], null)

    const payload = await readJson<{ item: { reminder_minutes: number | null } }>(response)
    assert.equal(payload.item.reminder_minutes, null, "null means 'use the default lead', not 'no alarm'")
  } finally {
    stub.restore()
  }
})

test("GET /api/calendar passes reminder_minutes through to the month and agenda views", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    stub.on(/FROM calendar_events/, { rows: EVENT_ROWS })

    const { GET } = await import("../../app/api/calendar/route")
    const response = await GET(request("/api/calendar"))

    assert.equal(response.status, 200)
    const payload = await readJson<{ items: Array<{ id: string; reminder_minutes: number | null }> }>(response)
    assert.equal(payload.items[0].reminder_minutes, 30)
    assert.equal(payload.items[1].reminder_minutes, null)
  } finally {
    stub.restore()
  }
})
