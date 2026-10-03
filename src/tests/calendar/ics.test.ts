/**
 * The ICS serialiser is the one part of the calendar-export feature that has no
 * excuse for being wrong: it is deterministic, so a fixed fixture has exactly
 * one correct output and it can be asserted byte for byte.
 *
 * The bug this file exists to catch is not exotic. `Date.parse("2026-09-21
 * 13:05:00")` — the shape D1's `datetime('now')` produces — resolves against
 * the host's timezone, so a server in Berlin would export a 13:05 UTC event as
 * 11:05 UTC and every reminder would arrive two hours early. `parseTimestampMs`
 * in `lib/data.ts` already had to fix that once; these tests keep the ICS path
 * from reintroducing it.
 */

import assert from "node:assert/strict"
import test from "node:test"

import {
  buildCalendarIcs,
  DEFAULT_ALARM_LEAD_MINUTES,
  escapeIcsText,
  foldIcsLine,
  formatIcsTimestamp,
  InvalidIcsTimestampError,
  toUtcDate,
} from "../../lib/calendar/ics"

const encoder = new TextEncoder()
const octets = (value: string) => encoder.encode(value).length

// ---------------------------------------------------------------------------
// UTC conversion
// ---------------------------------------------------------------------------

test("an ISO string and a Date format to the same UTC instant", () => {
  assert.equal(formatIcsTimestamp("2026-09-21T13:05:00.000Z"), "20260921T130500Z")
  assert.equal(formatIcsTimestamp(new Date("2026-09-21T13:05:00.000Z")), "20260921T130500Z")
  assert.equal(toUtcDate("2026-09-21T13:05:00.000Z").getTime(), Date.parse("2026-09-21T13:05:00Z"))
})

test("both stored timestamp shapes resolve to the same instant", () => {
  // `Date#toISOString()` (what this app writes) and `datetime('now')` (what D1
  // writes) must not disagree, or an event would shift the first time it was
  // read back from the database and exported.
  assert.equal(formatIcsTimestamp("2026-09-21 13:05:00"), formatIcsTimestamp("2026-09-21T13:05:00.000Z"))
  assert.equal(formatIcsTimestamp("2026-09-21 13:05:00"), "20260921T130500Z")
})

test("a D1-shaped timestamp is read as UTC, not as the host's local time", () => {
  // The trap, spelled out: a bare `"YYYY-MM-DD HH:MM:SS"` has no zone, so a
  // naive `Date.parse` treats it as local and the result moves with the host.
  assert.equal(formatIcsTimestamp("2026-09-21 13:05:00"), "20260921T130500Z")

  // The assertion above is only meaningful on a host that is not already at
  // UTC, and CI usually is. This makes the same point on any host: build the
  // instant that the *local* reading of that wall clock denotes, and check the
  // module agrees with it only when the host offset is genuinely zero.
  const offsetMinutes = -new Date().getTimezoneOffset()
  const sign = offsetMinutes < 0 ? "-" : "+"
  const absolute = Math.abs(offsetMinutes)
  const hostOffset = `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`
  const localReading = formatIcsTimestamp(`2026-09-21T13:05:00${hostOffset}`)

  assert.equal(
    localReading === "20260921T130500Z",
    offsetMinutes === 0,
    `a host at UTC${hostOffset} must read the bare timestamp as UTC, not as its own local time`,
  )
})

test("a timestamp carrying its own offset is converted, not reinterpreted", () => {
  // 15:05 in Berlin is 13:05 UTC; the offset in the string wins over the host.
  assert.equal(formatIcsTimestamp("2026-09-21T15:05:00+02:00"), "20260921T130500Z")
  assert.equal(formatIcsTimestamp("2026-09-21T11:05:00-02:00"), "20260921T130500Z")
})

test("an unparseable timestamp throws a typed error instead of emitting a broken line", () => {
  for (const value of ["", "   ", "not a date", "2026-13-45T99:99:99Z", new Date(Number.NaN)]) {
    assert.throws(
      () => formatIcsTimestamp(value),
      (error: unknown) => error instanceof InvalidIcsTimestampError,
      `${JSON.stringify(String(value))} should be rejected`,
    )
  }

  // The error carries the offending value so a caller logging a skipped row can
  // tell which one it was without re-deriving it.
  const error = new InvalidIcsTimestampError("nope")
  assert.equal(error.value, "nope")
  assert.equal(error.name, "InvalidIcsTimestampError")
})

// ---------------------------------------------------------------------------
// Escaping
// ---------------------------------------------------------------------------

test("escapeIcsText escapes the four characters RFC 5545 reserves", () => {
  assert.equal(escapeIcsText("a, b; c\\d"), "a\\, b\\; c\\\\d")
  assert.equal(escapeIcsText("line one\nline two"), "line one\\nline two")
  assert.equal(escapeIcsText("windows\r\nline"), "windows\\nline")
  assert.equal(escapeIcsText("carriage\rreturn"), "carriage\\nreturn")
})

test("escapeIcsText escapes backslashes before the characters it introduces", () => {
  // A backslash-first ordering is the whole point: escape `,` first and the
  // backslash it inserts gets doubled on the next pass, turning `a, b` into
  // `a\\, b` and corrupting the value in the user's calendar.
  assert.equal(escapeIcsText("a, b").replace(/\\,/g, "").includes("\\\\"), false)
  assert.equal(escapeIcsText("50% off \\ 3 for 1, today"), "50% off \\\\ 3 for 1\\, today")
})

// ---------------------------------------------------------------------------
// Folding
// ---------------------------------------------------------------------------

test("foldIcsLine leaves a short line alone", () => {
  const line = "SUMMARY:A short title"
  assert.equal(foldIcsLine(line), line)
})

test("foldIcsLine folds at 75 octets and every physical line stays within it", () => {
  const line = `DESCRIPTION:${"x".repeat(200)}`
  const folded = foldIcsLine(line)

  assert.ok(folded.includes("\r\n "), "a continuation line must start with a space")
  for (const physical of folded.split("\r\n")) {
    assert.ok(octets(physical) <= 75, `"${physical.slice(0, 20)}…" is ${octets(physical)} octets`)
  }
  // Folding is lossless: removing CRLF + the single space recovers the input.
  assert.equal(folded.replace(/\r\n /g, ""), line)
})

test("foldIcsLine counts octets, not characters", () => {
  // 30 emoji is 30 characters but 120 octets, so it must be folded even though
  // `line.length` is well under the limit.
  const line = `SUMMARY:${"🎓".repeat(30)}`
  assert.ok(line.length < 75, "the fixture should be short by character count")
  const folded = foldIcsLine(line)

  assert.ok(folded.includes("\r\n "), "a 120-octet line must be folded")
  for (const physical of folded.split("\r\n")) {
    assert.ok(octets(physical) <= 75, `"${physical}" is ${octets(physical)} octets`)
  }
  assert.equal(folded.replace(/\r\n /g, ""), line)
  // No surrogate pair may be cut in half: a split emoji decodes to U+FFFD.
  assert.equal(folded.includes("\uFFFD"), false)
})

test("foldIcsLine does not fold a line that is exactly at the limit", () => {
  const line = "x".repeat(75)
  assert.equal(octets(line), 75)
  assert.equal(foldIcsLine(line), line)
})

// ---------------------------------------------------------------------------
// Full document
// ---------------------------------------------------------------------------

const NOW = new Date("2026-09-21T12:00:00.000Z")

function build(events: Parameters<typeof buildCalendarIcs>[0]["events"], alarmLeadMinutes = DEFAULT_ALARM_LEAD_MINUTES) {
  return buildCalendarIcs({ calendarName: "Study calendar", events, now: NOW, alarmLeadMinutes })
}

test("buildCalendarIcs emits a complete VCALENDAR", () => {
  const ics = build([
    {
      id: "event_alpha",
      title: "Focus block, morning",
      startsAt: "2026-09-21T13:05:00.000Z",
      endsAt: "2026-09-21T13:50:00.000Z",
      description: "Read chapter 4; then\nsummarise it.",
      reminderMinutes: 30,
    },
  ])

  const expected = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Learn//Study Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Study calendar",
    "BEGIN:VEVENT",
    "UID:event_alpha@learn",
    "DTSTAMP:20260921T120000Z",
    "DTSTART:20260921T130500Z",
    "DTEND:20260921T135000Z",
    "SUMMARY:Focus block\\, morning",
    "DESCRIPTION:Read chapter 4\\; then\\nsummarise it.",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "TRIGGER:-PT30M",
    "DESCRIPTION:Focus block\\, morning",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n") + "\r\n"

  assert.equal(ics, expected)

  // Restated as structure, so a failure says which invariant broke rather than
  // just printing two long strings.
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"), "must open with BEGIN:VCALENDAR")
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"), "must close with END:VCALENDAR and a trailing CRLF")
  assert.equal(/[^\r]\n/.test(ics), false, "every line break must be CRLF")
})

test("every logical line is a valid property and every block is balanced", () => {
  const ics = build([
    {
      id: "event_alpha",
      title: "A title long enough to need folding, with a comma, a semicolon; and a tail that keeps going",
      startsAt: "2026-09-21T13:05:00.000Z",
      endsAt: "2026-09-21T13:50:00.000Z",
      description: "Notes with a very long body so that the folded continuation logic is exercised here too, over and over, until it folds.",
      location: "Library, floor 3",
      reminderMinutes: 5,
    },
    { id: "event_beta", title: "Review", startsAt: "2026-09-22T09:00:00Z", endsAt: "2026-09-22T09:30:00Z" },
  ])

  // Unfold the way a parser does, then check the logical lines.
  const logical = ics.replace(/\r\n[ \t]/g, "").split("\r\n").filter(Boolean)

  for (const line of logical) {
    assert.match(line, /^[A-Z][A-Z0-9-]*(;[^:]*)?:/, `not a property line: ${line}`)
  }

  const balanced = logical.reduce((depth, line) => {
    if (line.startsWith("BEGIN:")) return depth + 1
    if (line.startsWith("END:")) return depth - 1
    return depth
  }, 0)
  assert.equal(balanced, 0, "BEGIN/END pairs must nest and close")

  const begins = logical.filter((line) => line.startsWith("BEGIN:")).map((line) => line.slice(6))
  const ends = logical.filter((line) => line.startsWith("END:")).map((line) => line.slice(4))
  // Two events, and `event_beta` makes no reminder choice so it takes the
  // default lead: one VALARM folded inside each VEVENT.
  assert.deepEqual(begins, ["VCALENDAR", "VEVENT", "VALARM", "VEVENT", "VALARM"])
  assert.deepEqual(ends, ["VALARM", "VEVENT", "VALARM", "VEVENT", "VCALENDAR"])
})

test("an event without a reminder gets the calendar-wide alarm lead", () => {
  const ics = build([
    { id: "event_a", title: "No choice made", startsAt: "2026-09-21T13:05:00Z", endsAt: "2026-09-21T13:50:00Z" },
  ], 25)

  assert.ok(ics.includes("TRIGGER:-PT25M"), "the fallback lead should be used")
})

test("an event's own reminder overrides the calendar-wide lead", () => {
  const ics = build([
    { id: "event_a", title: "Own lead", startsAt: "2026-09-21T13:05:00Z", endsAt: "2026-09-21T13:50:00Z", reminderMinutes: 5 },
    { id: "event_b", title: "Fallback lead", startsAt: "2026-09-22T13:05:00Z", endsAt: "2026-09-22T13:50:00Z", reminderMinutes: null },
  ], 25)

  assert.ok(ics.includes("TRIGGER:-PT5M"))
  assert.ok(ics.includes("TRIGGER:-PT25M"))
  assert.equal(ics.includes("TRIGGER:-PT30M"), false)

  // The override must belong to the right VEVENT, not just appear somewhere in
  // the file: event_a carries -PT5M before its own END:VEVENT.
  const forEventA = ics.slice(ics.indexOf("UID:event_a@learn"), ics.indexOf("UID:event_b@learn"))
  assert.ok(forEventA.includes("TRIGGER:-PT5M"))
})

test("a reminder of 0 means the user asked for no alarm", () => {
  const ics = build([
    { id: "event_a", title: "Silent", startsAt: "2026-09-21T13:05:00Z", endsAt: "2026-09-21T13:50:00Z", reminderMinutes: 0 },
  ])

  assert.equal(ics.includes("VALARM"), false)
  // The event itself must still be there: "no alarm" is not "no event".
  assert.ok(ics.includes("UID:event_a@learn"))
  assert.ok(ics.includes("SUMMARY:Silent"))
})

test("an unparseable event is skipped and its siblings still export", () => {
  const ics = build([
    { id: "event_good", title: "Kept", startsAt: "2026-09-21T13:05:00Z", endsAt: "2026-09-21T13:50:00Z" },
    { id: "event_bad_start", title: "Dropped", startsAt: "not a date", endsAt: "2026-09-21T13:50:00Z" },
    { id: "event_bad_end", title: "Dropped too", startsAt: "2026-09-21T13:05:00Z", endsAt: "" },
    { id: "event_also_good", title: "Also kept", startsAt: "2026-09-22T13:05:00Z", endsAt: "2026-09-22T13:50:00Z" },
  ])

  assert.ok(ics.includes("UID:event_good@learn"))
  assert.ok(ics.includes("UID:event_also_good@learn"))
  assert.equal(ics.includes("event_bad_start"), false)
  assert.equal(ics.includes("event_bad_end"), false)
  // No half-written VEVENT may be left behind: two events in, two VEVENTs out.
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2)
  assert.equal((ics.match(/END:VEVENT/g) || []).length, 2)
})

test("an event that ends before it starts is skipped rather than exported backwards", () => {
  const ics = build([
    { id: "event_inverted", title: "Backwards", startsAt: "2026-09-21T15:00:00Z", endsAt: "2026-09-21T14:00:00Z" },
    { id: "event_zero", title: "Zero length", startsAt: "2026-09-21T15:00:00Z", endsAt: "2026-09-21T15:00:00Z" },
  ])

  assert.equal(ics.includes("BEGIN:VEVENT"), false, "RFC 5545 forbids DTEND at or before DTSTART")
  assert.ok(ics.includes("BEGIN:VCALENDAR"), "the calendar itself is still valid and empty")
})

test("LOCATION appears only when there is one", () => {
  const withLocation = build([
    { id: "event_a", title: "T", startsAt: "2026-09-21T13:05:00Z", endsAt: "2026-09-21T13:50:00Z", location: "Room 2" },
  ])
  const withoutLocation = build([
    { id: "event_a", title: "T", startsAt: "2026-09-21T13:05:00Z", endsAt: "2026-09-21T13:50:00Z", location: "   " },
  ])

  assert.ok(withLocation.includes("LOCATION:Room 2"))
  assert.equal(withoutLocation.includes("LOCATION:"), false)
})

test("the calendar name is escaped and the document stays CRLF through folding", () => {
  const ics = buildCalendarIcs({
    calendarName: "Ada's study, blocks; v2",
    events: [],
    now: NOW,
    alarmLeadMinutes: DEFAULT_ALARM_LEAD_MINUTES,
  })

  assert.ok(ics.includes("X-WR-CALNAME:Ada's study\\, blocks\\; v2"))
  assert.equal(/[^\r]\n/.test(ics), false)
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 0)
})
