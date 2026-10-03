import assert from "node:assert/strict"
import test from "node:test"
import { sealCalendarSecret, openCalendarSecret } from "../../lib/calendar/connection-store"
import { parseCalendarRange, parseEventInput, type ConnectedCalendar } from "../../lib/calendar/connections-types"
import { normalizeOAuthEvent, oauthEventPayload } from "../../lib/calendar/google-outlook"
import { appleCalendarUrl, parseAppleEvents, updateAppleEvent, removeAppleOccurrence } from "../../lib/calendar/apple"

const secret = "calendar-test-secret-32-characters-long"
const input = { title: "Focus", startsAt: "2026-09-25T09:00:00Z", endsAt: "2026-09-25T10:00:00Z", notes: "First\nSecond", reminderMinutes: 15, allDay: false }
const calendar: ConnectedCalendar = { id: "https://p01-caldav.icloud.com/123/calendars/work/", name: "Work", connectionId: "connection", provider: "apple", writable: true }

test("calendar secrets are authenticated, randomized and bound to the account", () => {
  const value = { refreshToken: "private-refresh-token" }
  const sealed = sealCalendarSecret(value, secret, "alice:connection")
  assert.ok(!sealed.includes(value.refreshToken))
  assert.notEqual(sealed, sealCalendarSecret(value, secret, "alice:connection"))
  assert.deepEqual(openCalendarSecret(sealed, secret, "alice:connection"), value)
  assert.throws(() => openCalendarSecret(sealed, secret, "bob:connection"))
  assert.throws(() => openCalendarSecret(sealed + "a", secret, "alice:connection"))
  assert.throws(() => sealCalendarSecret(value, "short", "alice:connection"))
})

test("calendar range and event validation reject invalid and unbounded requests", () => {
  assert.throws(() => parseCalendarRange("2026-01-01", "2027-01-01"))
  assert.throws(() => parseCalendarRange("invalid", "2026-01-01"))
  assert.throws(() => parseEventInput({ ...input, endsAt: input.startsAt }))
  assert.throws(() => parseEventInput({ ...input, title: " " }))
  assert.throws(() => parseEventInput({ ...input, reminderMinutes: -1 }))
  assert.equal(parseEventInput(input).startsAt, "2026-09-25T09:00:00.000Z")
})

test("OAuth events preserve all-day dates, recurrence IDs and write permissions", () => {
  const event = normalizeOAuthEvent({ id: "occurrence", etag: "version1", summary: "Holiday", start: { date: "2026-09-25" }, end: { date: "2026-09-26" }, recurringEventId: "series" }, { ...calendar, provider: "google", writable: false })!
  assert.equal(event.allDay, true)
  assert.equal(event.starts_at, "2026-09-25T00:00:00.000Z")
  assert.equal(event.remote.writable, false)
  assert.equal(event.remote.recurring, true)
  assert.equal(event.remote.eventId, "occurrence")
  assert.equal(normalizeOAuthEvent({ status: "cancelled" }, calendar), null)
})

test("Outlook dates without offsets are interpreted in the requested UTC zone", () => {
  const event = normalizeOAuthEvent({ id: "event", subject: "Class", start: { dateTime: "2026-09-25T09:00:00.0000000", timeZone: "UTC" }, end: { dateTime: "2026-09-25T10:00:00.0000000", timeZone: "UTC" }, body: { contentType: "text", content: "Full notes" }, isReminderOn: false }, { ...calendar, provider: "outlook" })!
  assert.equal(new Date(event.starts_at).toISOString(), "2026-09-25T09:00:00.000Z")
  assert.equal(event.notes, "Full notes")
})

test("provider writes use native date and reminder payloads", () => {
  const google = oauthEventPayload({ ...input, allDay: true }, "google")
  assert.deepEqual(google.start, { date: "2026-09-25" })
  const outlook = oauthEventPayload(input, "outlook")
  assert.deepEqual(outlook.start, { dateTime: "2026-09-25T09:00:00", timeZone: "UTC" })
  assert.equal(outlook.isReminderOn, true)
})

test("Apple URLs never send passwords to arbitrary hosts or insecure redirects", () => {
  for (const url of ["http://caldav.icloud.com/", "https://evil.test/", "https://p01-caldav.icloud.com.evil.test/", "https://user:pass@caldav.icloud.com/", "https://caldav.icloud.com:444/"]) assert.throws(() => appleCalendarUrl(url))
  assert.equal(appleCalendarUrl("test.ics", calendar.id), calendar.id + "test.ics")
})

test("Apple event updates preserve unrelated properties and round-trip text safely", () => {
  const original = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:stable-id\r\nDTSTART:20260925T090000Z\r\nDTEND:20260925T100000Z\r\nSUMMARY:Old\r\nLOCATION:Library\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"
  const updated = updateAppleEvent(original, input)
  assert.match(updated, /UID:stable-id/)
  assert.match(updated, /LOCATION:Library/)
  assert.match(updated, /BEGIN:VALARM/)
  const parsed = parseAppleEvents(updated, calendar, "event.ics", '"v2"')[0]
  assert.equal(parsed.title, input.title)
  assert.equal(parsed.notes, input.notes)
  assert.equal(parsed.remote.etag, '"v2"')
  const withDuration = original.replace("DTEND:20260925T100000Z", "DURATION:PT1H")
  const durationUpdated = updateAppleEvent(withDuration, input)
  assert.doesNotMatch(durationUpdated, /DURATION:/)
  assert.match(durationUpdated, /DTEND:20260925T100000Z/)
})

test("Apple recurring series are protected against whole-series overwrite", () => {
  const recurring = updateAppleEvent(null, input).replace("BEGIN:VEVENT", "BEGIN:VEVENT\r\nRRULE:FREQ=DAILY")
  assert.throws(() => updateAppleEvent(recurring, input), /individual occurrence/)
  assert.equal(parseAppleEvents(recurring, calendar, "event.ics", '"v1"')[0].remote.writable, false)
})

test("editing or deleting one Apple occurrence preserves the recurring series", () => {
  const recurring = updateAppleEvent(null, input).replace("BEGIN:VEVENT", "BEGIN:VEVENT\r\nRRULE:FREQ=DAILY;COUNT=5")
  const edited = updateAppleEvent(recurring, { ...input, title: "Moved occurrence", startsAt: "2026-09-26T11:00:00Z", endsAt: "2026-09-26T12:00:00Z" }, "2026-09-26T09:00:00Z")
  assert.equal((edited.match(/RRULE:/g) || []).length, 1)
  assert.equal((edited.match(/BEGIN:VEVENT/g) || []).length, 2)
  assert.match(edited, /RECURRENCE-ID:20260926T090000Z/)
  assert.match(edited, /SUMMARY:Focus/)
  const removed = removeAppleOccurrence(edited, "2026-09-26T09:00:00Z")
  assert.equal((removed.match(/BEGIN:VEVENT/g) || []).length, 1)
  assert.match(removed, /EXDATE:20260926T090000Z/)
  assert.match(removed, /RRULE:FREQ=DAILY;COUNT=5/)
})

test("Apple recurrence identifiers retain their timezone when sent back for editing", () => {
  const ics = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VTIMEZONE\r\nTZID:Asia/Hong_Kong\r\nBEGIN:STANDARD\r\nDTSTART:19700101T000000\r\nTZOFFSETFROM:+0800\r\nTZOFFSETTO:+0800\r\nEND:STANDARD\r\nEND:VTIMEZONE\r\nBEGIN:VEVENT\r\nUID:series\r\nRECURRENCE-ID;TZID=Asia/Hong_Kong:20260926T170000\r\nDTSTART;TZID=Asia/Hong_Kong:20260926T170000\r\nDTEND;TZID=Asia/Hong_Kong:20260926T180000\r\nSUMMARY:Occurrence\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"
  const event = parseAppleEvents(ics, calendar, "event.ics", '"v1"')[0]
  assert.equal(event.remote.recurrenceId, "2026-09-26T09:00:00Z")
})
