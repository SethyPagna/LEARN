import { query } from "./db"
import type { ReviewRating, Weekday } from "./learning-ecosystem"

export const MAX_DAILY_REVIEW_CAP = 200
const DEFAULT_DAILY_REVIEW_CAP = 30
const REVIEW_INTERVAL_DAYS: Record<ReviewRating, number> = { again: 1, hard: 2, good: 4, easy: 7 }
const WEEKDAYS: readonly Weekday[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]

export function reviewSchedulingPreferences(preferences: Record<string, unknown>): { dailyCap: number; restDay?: Weekday } {
  const savedOptions = preferences.workspaceOptions
  const options = savedOptions && typeof savedOptions === "object" && !Array.isArray(savedOptions) ? savedOptions as Record<string, unknown> : {}
  const configuredCap = Number(preferences.dailyReviewCap ?? options.dailyReviewCap ?? DEFAULT_DAILY_REVIEW_CAP)
  const dailyCap = Number.isFinite(configuredCap)
    ? Math.max(0, Math.min(MAX_DAILY_REVIEW_CAP, Math.floor(configuredCap)))
    : DEFAULT_DAILY_REVIEW_CAP
  const restDay = WEEKDAYS.find((day) => day === (preferences.restDay ?? options.restDay))
  return { dailyCap, restDay }
}

/** Reviews and their streak have always used UTC days; use the same boundary for the daily dose. */
export function reviewDayWindow(now: Date) {
  const dayStart = new Date(now)
  dayStart.setUTCHours(0, 0, 0, 0)
  const nextDay = new Date(dayStart)
  nextDay.setUTCDate(nextDay.getUTCDate() + 1)
  return { dayStart: dayStart.toISOString(), nextDay: nextDay.toISOString() }
}

export async function readDailyReviewBudget(input: {
  userId: string
  preferences: Record<string, unknown>
  now: Date
}): Promise<{ dailyCap: number; restDay?: Weekday }> {
  const preferences = reviewSchedulingPreferences(input.preferences)
  const { dayStart, nextDay } = reviewDayWindow(input.now)
  const { rows } = await query<{ count: number }>(
    `SELECT count(*) AS count FROM review_logs
     WHERE user_id = $1 AND datetime(created_at) >= datetime($2) AND datetime(created_at) < datetime($3)`,
    [input.userId, dayStart, nextDay],
  )
  const completed = Number(rows[0]?.count ?? 0)
  return {
    ...preferences,
    dailyCap: Math.max(0, preferences.dailyCap - (Number.isFinite(completed) ? Math.max(0, Math.floor(completed)) : 0)),
  }
}

export function nextReviewDueAt(input: { rating: ReviewRating; now: Date; restDay?: Weekday }): string {
  const due = new Date(input.now)
  due.setUTCDate(due.getUTCDate() + REVIEW_INTERVAL_DAYS[input.rating])
  if (input.restDay && WEEKDAYS[due.getUTCDay()] === input.restDay) {
    due.setUTCDate(due.getUTCDate() + 1)
  }
  return due.toISOString()
}
