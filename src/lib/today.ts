/**
 * The Today page's small pieces of logic, kept pure so they can be tested
 * without a database: the study streak, the week strip, the greeting and the
 * buddy's mood.
 *
 * Days are `YYYY-MM-DD` strings in the learner's own time zone. The server
 * turns activity timestamps into those days with the offset the browser sends,
 * so "today" means the learner's today, not UTC's.
 */

const DAY_MS = 24 * 60 * 60 * 1000
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** Browsers report offsets between UTC-12 and UTC+14. */
export const MAX_TIMEZONE_OFFSET_MINUTES = 14 * 60

export interface StreakDay {
  day: string
  active: boolean
}

export interface StreakSummary {
  /** Consecutive days with study, ending today or, if today has none yet, yesterday. */
  streak: number
  studiedToday: boolean
  /** The last seven days, oldest first, ending with today. */
  week: StreakDay[]
}

export type BuddyMood = "happy" | "excited" | "curious" | "sleepy" | "hello"

function parseDay(day: string) {
  if (!DAY_PATTERN.test(day)) return Number.NaN
  const [year, month, date] = day.split("-").map(Number)
  const time = Date.UTC(year, month - 1, date)
  return new Date(time).toISOString().slice(0, 10) === day ? time : Number.NaN
}

function formatDay(time: number) {
  return new Date(time).toISOString().slice(0, 10)
}

/** `day` moved by `amount` calendar days. */
export function shiftDay(day: string, amount: number) {
  const time = parseDay(day)
  if (Number.isNaN(time)) throw new RangeError(`Not a calendar day: ${day}`)
  return formatDay(time + amount * DAY_MS)
}

/**
 * `getTimezoneOffset()` from the browser, checked: minutes to add to local
 * time to reach UTC (UTC+7 is -420). Anything else falls back to UTC.
 */
export function parseTimezoneOffset(value: unknown) {
  const offset = typeof value === "string" && value.trim() ? Number(value) : typeof value === "number" ? value : 0
  return Number.isInteger(offset) && Math.abs(offset) <= MAX_TIMEZONE_OFFSET_MINUTES ? offset : 0
}

/** The SQLite date modifier that turns a UTC timestamp into the learner's local day. */
export function localDayModifier(offsetMinutes: number) {
  const shift = -parseTimezoneOffset(offsetMinutes)
  return `${shift >= 0 ? "+" : "-"}${Math.abs(shift)} minutes`
}

/** The learner's calendar day at `now`. */
export function localDay(now: Date, offsetMinutes: number) {
  return formatDay(now.getTime() - parseTimezoneOffset(offsetMinutes) * 60 * 1000)
}

export function summarizeStreak(activeDays: Iterable<string>, today: string): StreakSummary {
  if (Number.isNaN(parseDay(today))) throw new RangeError(`Not a calendar day: ${today}`)
  const days = new Set<string>()
  for (const day of activeDays) if (!Number.isNaN(parseDay(day))) days.add(day)

  const studiedToday = days.has(today)
  let streak = 0
  for (let day = studiedToday ? today : shiftDay(today, -1); days.has(day); day = shiftDay(day, -1)) streak += 1

  const week = Array.from({ length: 7 }, (_, index) => {
    const day = shiftDay(today, index - 6)
    return { day, active: days.has(day) }
  })
  return { streak, studiedToday, week }
}

export function greetingFor(hour: number) {
  if (hour >= 5 && hour < 12) return "Good morning"
  if (hour >= 12 && hour < 18) return "Good afternoon"
  return "Good evening"
}

/** How the buddy looks: it cheers a streak, nudges a streak at risk, and yawns late at night. */
export function buddyMood(summary: Pick<StreakSummary, "streak" | "studiedToday">, hour: number): BuddyMood {
  if (summary.studiedToday) return summary.streak >= 3 ? "excited" : "happy"
  if (summary.streak > 0) return "curious"
  if (hour >= 22 || hour < 5) return "sleepy"
  return "hello"
}

/** One short line from the buddy. */
export function buddyLine(summary: Pick<StreakSummary, "streak" | "studiedToday">, hour: number) {
  const { streak } = summary
  switch (buddyMood(summary, hour)) {
    case "excited": return `${streak} days in a row. You're on fire.`
    case "happy": return streak > 1 ? `${streak} days in a row. Nice.` : "Nice work today."
    case "curious": return `A quick session keeps your ${streak}-day streak.`
    case "sleepy": return "Late one. Five minutes still counts."
    default: return "Let's start a streak today."
  }
}

export interface RecentItem {
  kind: string
  id: string
  updatedAt: string
}

/** Server and browser stamps alike; unreadable ones sort last. */
function stampOf(value: string) {
  const text = value.trim()
  const time = Date.parse(/^\d{4}-\d{2}-\d{2} \d/.test(text) ? `${text.replace(" ", "T")}Z` : text)
  return Number.isNaN(time) ? 0 : time
}

/**
 * Saved projects plus unsaved work kept in the browser (canvas drafts), newest
 * first. A draft replaces its saved copy only when it is newer, as in Studio.
 */
export function mergeRecent<T extends RecentItem>(saved: readonly T[], drafts: readonly T[], limit: number): T[] {
  const merged = new Map(saved.map((item) => [`${item.kind}:${item.id}`, item]))
  for (const draft of drafts) {
    const key = `${draft.kind}:${draft.id}`
    const current = merged.get(key)
    if (!current || stampOf(draft.updatedAt) > stampOf(current.updatedAt)) merged.set(key, draft)
  }
  return [...merged.values()].sort((left, right) => stampOf(right.updatedAt) - stampOf(left.updatedAt)).slice(0, limit)
}
