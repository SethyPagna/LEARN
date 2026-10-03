import assert from "node:assert/strict"
import test from "node:test"
import { sealCalendarSecret } from "../../lib/calendar/connection-store"
import { listOAuthCalendars, listOAuthEvents, writeOAuthEvent } from "../../lib/calendar/google-outlook"
import { writeAppleEvent } from "../../lib/calendar/apple"
import type { CalendarConnection, ConnectedCalendar } from "../../lib/calendar/connections-types"

const key = "provider-request-test-encryption-key-32"
const connection: CalendarConnection = { id: "connection", user_id: "owner", provider: "google", label: "Test", credentials: sealCalendarSecret({ accessToken: "test-token", expiresAt: Date.now() + 3600000 }, key, "owner:connection") }
const calendar: ConnectedCalendar = { id: "team@calendar.test", connectionId: connection.id, provider: "google", name: "Team", writable: true }
const input = { title: "Class", startsAt: "2026-09-25T09:00:00Z", endsAt: "2026-09-25T10:00:00Z", notes: "Brief", reminderMinutes: 0, allDay: false }

test("provider requests retain paging, authorization, conflicts and rich notes", async context => {
  const oldKey = process.env.CALENDAR_ENCRYPTION_KEY
  process.env.CALENDAR_ENCRYPTION_KEY = key
  context.after(() => { if (oldKey === undefined) delete process.env.CALENDAR_ENCRYPTION_KEY; else process.env.CALENDAR_ENCRYPTION_KEY = oldKey })

  await context.test("Google calendar paging reads all pages and respects access roles", async t => {
    const requests: string[] = []
    t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
      requests.push(url)
      assert.equal(new Headers(init.headers).get("authorization"), "Bearer test-token")
      return Response.json(requests.length === 1 ? { items: [{ id: "one", summary: "Owned", accessRole: "owner" }], nextPageToken: "second" } : { items: [{ id: "two", summary: "Read only", accessRole: "reader" }] })
    })
    const calendars = await listOAuthCalendars(connection)
    assert.deepEqual(calendars.map(item => item.writable), [true, false])
    assert.equal(new URL(requests[1]).searchParams.get("pageToken"), "second")
  })

  await context.test("event reads request expanded occurrences within the visible date range", async t => {
    t.mock.method(globalThis, "fetch", async (url: string) => {
      const request = new URL(url)
      assert.equal(request.searchParams.get("singleEvents"), "true")
      assert.equal(request.searchParams.get("timeMin"), input.startsAt)
      return Response.json({ items: [] })
    })
    await listOAuthEvents(connection, calendar, { start: input.startsAt, end: input.endsAt })
  })

  await context.test("untrusted pagination cannot forward OAuth tokens to another host", async t => {
    let count = 0
    t.mock.method(globalThis, "fetch", async () => { count++; return Response.json({ value: [], "@odata.nextLink": "https://evil.test/collect" }) })
    await assert.rejects(listOAuthCalendars({ ...connection, provider: "outlook" }), /Unexpected calendar page/)
    assert.equal(count, 1)
  })

  await context.test("Google edits send an ETag and preserve stale-event conflicts", async t => {
    t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
      assert.equal(init.method, "PATCH")
      assert.equal(new Headers(init.headers).get("if-match"), '"v1"')
      return new Response(null, { status: 412 })
    })
    await assert.rejects(writeOAuthEvent(connection, calendar.id, { eventId: "event", etag: '"v1"', input }), /changed in another app/)
  })

  await context.test("Outlook title edits retain the original formatted body", async t => {
    t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
      if (!init.method) return Response.json({ bodyPreview: "Brief", body: { contentType: "html", content: "<b>Brief</b>" } })
      const payload = JSON.parse(String(init.body))
      assert.equal(payload.subject, "Class")
      assert.equal("body" in payload, false)
      return new Response(null, { status: 204 })
    })
    await writeOAuthEvent({ ...connection, provider: "outlook" }, "calendar", { eventId: "event", etag: '"v1"', input })
  })

  await context.test("Apple creation uses conditional PUT without replacing existing resources", async t => {
    t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
      assert.equal(new URL(url).hostname, "p01-caldav.icloud.com")
      assert.equal(init.method, "PUT")
      assert.equal(new Headers(init.headers).get("if-none-match"), "*")
      assert.match(String(init.body), /SUMMARY:Class/)
      return new Response(null, { status: 201 })
    })
    await writeAppleEvent({ username: "test@example.test", password: "test-only" }, "https://p01-caldav.icloud.com/123/calendars/work/", { input })
  })
})
