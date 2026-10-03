/**
 * RFC 5545 (iCalendar) serialisation for calendar events.
 *
 * This module is pure: no database, no `fetch`, no `Date.now()`. Everything it
 * needs — including "now" — is passed in, so the exact bytes it produces for a
 * fixture are reproducible and can be asserted with `assert.equal` in a test.
 * The only non-determinism left is the caller's own clock.
 *
 * The formatting rules here are the ones calendar apps actually reject files
 * over: timestamps that are not UTC, unescaped commas and semicolons, lines
 * longer than 75 octets, and LF instead of CRLF.
 *
 * No third-party iCalendar library exists in this repo, and adding one would
 * mean a dependency for ~100 lines of well-specified string building.
 */

/** Minutes before an event that an alarm fires when the event picks none. */
export const DEFAULT_ALARM_LEAD_MINUTES = 15

/**
 * A timestamp that cannot be turned into an iCalendar UTC value.
 *
 * Typed so a caller building a VEVENT can `catch (error) { if (error instanceof
 * InvalidIcsTimestampError) continue }` and skip one bad row instead of
 * emitting `DTSTART:` with nothing after the colon — which is the kind of line
 * that makes a whole feed unparseable rather than losing a single event.
 */
export class InvalidIcsTimestampError extends Error {
  readonly value: unknown

  constructor(value: unknown) {
    super(`Cannot format ${JSON.stringify(value) ?? String(value)} as an iCalendar UTC timestamp.`)
    this.name = "InvalidIcsTimestampError"
    this.value = value
  }
}

/**
 * Read a timestamp the way the rest of this codebase reads one.
 *
 * Two shapes reach us: `Date#toISOString()` (`"2026-09-21T13:05:00.000Z"`) and
 * whatever SQLite/D1 hands back (`datetime('now')` → `"2026-09-21 13:05:00"`,
 * always UTC). `Date.parse("2026-09-21 13:05:00")` treats the second shape as
 * *local* time and silently shifts it by the host's offset, so the space is
 * normalised to `T` and an explicit `Z` is appended when the string carries no
 * zone of its own. This is deliberately the same rule as `parseTimestampMs` in
 * `lib/data.ts` — a calendar event written from D1 and exported from here must
 * resolve to the instant they both agree on.
 */
export function toUtcDate(input: string | Date): Date {
  if (input instanceof Date) {
    if (!Number.isFinite(input.getTime())) throw new InvalidIcsTimestampError(input)
    return input
  }

  const text = typeof input === "string" ? input.trim() : ""
  if (!text) throw new InvalidIcsTimestampError(input)

  const iso = text.replace(" ", "T")
  const utc = /(?:Z|[+-]\d{2}:?\d{2})$/.test(iso) ? iso : `${iso}Z`
  const ms = Date.parse(utc)
  if (!Number.isFinite(ms)) throw new InvalidIcsTimestampError(input)
  return new Date(ms)
}

function pad(value: number) {
  return String(value).padStart(2, "0")
}

/** `YYYYMMDDTHHMMSSZ` — the RFC 5545 "UTC time" form, never a floating time. */
export function formatIcsTimestamp(input: string | Date): string {
  const date = toUtcDate(input)
  return [
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`,
    "T",
    `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`,
    "Z",
  ].join("")
}

/**
 * Escape a text value for use after a property's colon.
 *
 * Backslash first, or every backslash introduced by the later replacements
 * would be escaped a second time.
 */
export function escapeIcsText(value: string): string {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n")
}

/**
 * RFC 5545 §3.1 line folding.
 *
 * The limit is 75 *octets*, not characters: a line of 75 emoji is 300 bytes and
 * must be folded, while a line of 75 ASCII characters must not be. Continuation
 * lines carry a single leading space, which counts toward the same 75, so they
 * hold 74 octets of content.
 *
 * The character walk is `for…of` (code points, not UTF-16 units) so a surrogate
 * pair is never cut in half — folding mid-character is what produces the
 * mojibake other calendar clients see as a broken event title.
 *
 * Expects one logical line: callers escape first, so no raw newlines remain.
 */
export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder()
  const octets = (text: string) => encoder.encode(text).length

  if (octets(line) <= ICS_FOLD_LIMIT) return line

  const parts: string[] = []
  let remaining = line
  let limit = ICS_FOLD_LIMIT

  while (octets(remaining) > limit) {
    let cut = 0
    let used = 0
    for (const character of remaining) {
      const size = octets(character)
      if (used + size > limit) break
      used += size
      cut += character.length
    }
    // A single code point wider than the whole budget cannot be folded any
    // further; stop rather than loop forever.
    if (cut === 0) break
    parts.push(remaining.slice(0, cut))
    remaining = remaining.slice(cut)
    // Every continuation line pays one octet for its leading space.
    limit = ICS_FOLD_LIMIT - 1
  }

  parts.push(remaining)
  return parts.join("\r\n ")
}

const ICS_FOLD_LIMIT = 75
const ICS_CRLF = "\r\n"
const PRODUCT_ID = "-//Learn//Study Calendar//EN"
const UID_SUFFIX = "@learn"

/**
 * One event to export, in camelCase.
 *
 * Deliberately not the `calendar_events` row shape: this module knows nothing
 * about the schema, so the route that owns the SQL does the mapping and the
 * fixture in a test stays readable.
 */
export interface IcsEvent {
  id: string
  title: string
  startsAt: string
  endsAt: string
  description?: string
  location?: string
  /**
   * `undefined`/`null` means "not chosen" and takes `alarmLeadMinutes`.
   * `0` means the user explicitly asked for no reminder, so no VALARM is
   * written. Any positive number is that many minutes before the start.
   */
  reminderMinutes?: number | null
}

export interface BuildCalendarIcsInput {
  calendarName: string
  events: IcsEvent[]
  now: Date | string
  alarmLeadMinutes: number
}

/**
 * Resolve the alarm lead for one event.
 *
 * Returns `null` for "no alarm at all", a number of minutes otherwise. An
 * unparseable value is treated as a missing choice, not a reason to drop the
 * event — a bad reminder should never cost the user the event itself.
 */
function resolveAlarmMinutes(event: IcsEvent, fallback: number): number | null {
  const lead = Number.isFinite(fallback) && fallback > 0 ? Math.floor(fallback) : DEFAULT_ALARM_LEAD_MINUTES
  const chosen = event.reminderMinutes
  if (chosen === null || chosen === undefined) return lead

  const minutes = Number(chosen)
  if (!Number.isFinite(minutes) || minutes < 0) return lead
  return Math.floor(minutes)
}

/**
 * Build a complete `VCALENDAR`.
 *
 * Events with an unparseable start or end, or an end at or before the start,
 * are skipped rather than emitted: a VEVENT with a missing or backwards
 * `DTSTART`/`DTEND` can make a calendar app reject the entire subscription,
 * which loses every other event in the file. Dropping one malformed row is the
 * smaller failure. (`saveCalendarEvent` already defaults the end to start + 45
 * minutes, so this only catches rows written outside that path.)
 */
export function buildCalendarIcs(input: BuildCalendarIcsInput): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODUCT_ID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(input.calendarName)}`,
  ]

  const stamp = formatIcsTimestamp(input.now)

  for (const event of input.events) {
    let startsAt: Date
    let endsAt: Date
    try {
      startsAt = toUtcDate(event.startsAt)
      endsAt = toUtcDate(event.endsAt)
    } catch (error) {
      if (error instanceof InvalidIcsTimestampError) continue
      throw error
    }
    if (endsAt.getTime() <= startsAt.getTime()) continue

    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeIcsText(`${event.id}${UID_SUFFIX}`)}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${formatIcsTimestamp(startsAt)}`,
      `DTEND:${formatIcsTimestamp(endsAt)}`,
      `SUMMARY:${escapeIcsText(event.title)}`,
      `DESCRIPTION:${escapeIcsText(event.description || "")}`,
    )
    if (event.location?.trim()) lines.push(`LOCATION:${escapeIcsText(event.location)}`)

    const alarmMinutes = resolveAlarmMinutes(event, input.alarmLeadMinutes)
    if (alarmMinutes !== null && alarmMinutes > 0) {
      lines.push(
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `TRIGGER:-PT${alarmMinutes}M`,
        `DESCRIPTION:${escapeIcsText(event.title)}`,
        "END:VALARM",
      )
    }

    lines.push("END:VEVENT")
  }

  lines.push("END:VCALENDAR")
  return lines.map(foldIcsLine).join(ICS_CRLF) + ICS_CRLF
}
