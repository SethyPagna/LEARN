import type { User } from "./data"
import { query } from "./db"
import { parseServerTime } from "./format-time"
import { buildReviewSchedule } from "./learning-ecosystem"
import { MAX_DAILY_REVIEW_CAP, readDailyReviewBudget } from "./review-scheduling"
import { ensureDatabase } from "./schema"
import { localDay, localDayModifier, shiftDay, summarizeStreak, type StreakSummary } from "./today"

/**
 * Everything the Today page shows, read in one round of light queries. It is
 * strictly read-only, and it never downloads project content (covers are
 * drawn from kind and title).
 */

export type TodayProjectKind = "notes" | "docs" | "canvas" | "sheets" | "slides"

export interface TodayProject {
  kind: TodayProjectKind
  id: string
  title: string
  updatedAt: string
}

/** A live quiz someone started in one of your chats that you have not joined yet. */
export interface TodayLiveGame {
  code: string
  quizTitle: string
  hostName: string
  createdAt: string
}

export interface TodayData {
  firstName: string
  today: string
  streak: StreakSummary
  /** Cards the Reviews page will show right now (after the daily cap). */
  reviewsDue: number
  restDay: boolean
  projects: TodayProject[]
  liveGame: TodayLiveGame | null
}

/** How far back the streak looks. A longer streak still counts up to this. */
export const STREAK_WINDOW_DAYS = 400
export const TODAY_PROJECT_LIMIT = 5
/** Lobbies older than this are treated as abandoned. */
const LIVE_INVITE_HOURS = 3

export function firstNameOf(user: Pick<User, "name" | "username">) {
  return user.name?.trim().split(/\s+/)[0] || user.username
}

/** Any day with practice, reviews, a live answer or a saved edit counts as a study day. */
async function activeDays(userId: string, offsetMinutes: number, today: string) {
  const { rows } = await query<{ day: string }>(
    `SELECT DISTINCT date(ts, $2) AS day FROM (
       SELECT started_at AS ts FROM practice_sessions WHERE user_id = $1
       UNION ALL SELECT created_at FROM review_logs WHERE user_id = $1
       UNION ALL SELECT a.answered_at FROM live_quiz_answers a
         JOIN live_quiz_participants p ON p.id = a.participant_id AND p.session_id = a.session_id
         WHERE p.user_id = $1
       UNION ALL SELECT created_at FROM note_versions WHERE user_id = $1
       UNION ALL SELECT created_at FROM content_versions WHERE user_id = $1
     )
     WHERE ts >= $3
     ORDER BY day DESC`,
    [userId, localDayModifier(offsetMinutes), shiftDay(today, -STREAK_WINDOW_DAYS)],
  )
  return rows.map((row) => String(row.day))
}

/** SQL and ISO stamps both become ISO; anything unreadable stays as is and never counts as due. */
function isoStamp(value: string) {
  const time = parseServerTime(value)
  return Number.isNaN(time.getTime()) ? value : time.toISOString()
}

async function dueReviews(user: User, now: Date) {
  const [{ rows }, budget] = await Promise.all([
    query<{ id: string; due_at: string; retrievability: number }>(
      `SELECT id, due_at, retrievability FROM review_items
       WHERE user_id = $1 AND datetime(due_at) <= datetime($2)
       ORDER BY datetime(due_at) ASC
       LIMIT $3`,
      [user.id, now.toISOString(), MAX_DAILY_REVIEW_CAP],
    ),
    readDailyReviewBudget({ userId: user.id, preferences: user.preferences || {}, now }),
  ])
  // The same rules the Reviews page applies, so the count on Today matches it.
  const schedule = buildReviewSchedule({
    items: rows.map((row) => ({
      id: String(row.id),
      title: "",
      dueAt: isoStamp(String(row.due_at)),
      difficulty: 0.5,
      stability: 2,
      retrievability: Number(row.retrievability ?? 0.9),
    })),
    now,
    ...budget,
  })
  return { due: schedule.items.length, restDay: schedule.isRestDay }
}

const projectSources: Array<{ kind: TodayProjectKind; sql: string }> = [
  { kind: "notes", sql: "SELECT id, title, updated_at FROM notes WHERE owner_user_id = $1 AND archived_at IS NULL ORDER BY updated_at DESC LIMIT $2" },
  { kind: "docs", sql: "SELECT id, title, updated_at FROM editor_documents WHERE owner_user_id = $1 AND document_type = 'doc' AND archived_at IS NULL ORDER BY updated_at DESC LIMIT $2" },
  { kind: "canvas", sql: "SELECT id, title, updated_at FROM editor_documents WHERE owner_user_id = $1 AND document_type = 'canvas' AND archived_at IS NULL ORDER BY updated_at DESC LIMIT $2" },
  { kind: "sheets", sql: "SELECT id, title, updated_at FROM sheet_documents WHERE owner_user_id = $1 AND archived_at IS NULL ORDER BY updated_at DESC LIMIT $2" },
  { kind: "slides", sql: "SELECT id, title, updated_at FROM slide_decks WHERE owner_user_id = $1 AND archived_at IS NULL ORDER BY updated_at DESC LIMIT $2" },
]

/** Your newest projects of every kind, newest first. Titles only: no content is read. */
async function recentProjects(userId: string) {
  const lists = await Promise.all(projectSources.map(async ({ kind, sql }) => {
    const { rows } = await query<{ id: string; title: string; updated_at: string }>(sql, [userId, TODAY_PROJECT_LIMIT])
    return rows.map((row): TodayProject => ({ kind, id: String(row.id), title: String(row.title || ""), updatedAt: String(row.updated_at || "") }))
  }))
  return lists
    .flat()
    .sort((left, right) => (parseServerTime(right.updatedAt).getTime() || 0) - (parseServerTime(left.updatedAt).getTime() || 0))
    .slice(0, TODAY_PROJECT_LIMIT)
}

async function waitingLiveGame(userId: string): Promise<TodayLiveGame | null> {
  const { rows } = await query<{ code: string; quiz_title: string; host_name: string; created_at: string }>(
    `SELECT s.code, s.quiz_title, s.created_at, u.name AS host_name
     FROM live_quiz_sessions s
     JOIN chat_threads t ON t.id = json_extract(s.state_json, '$.threadId')
     JOIN users u ON u.id = s.host_user_id
     WHERE s.phase = 'lobby'
       AND s.finished_at IS NULL
       AND s.host_user_id <> $1
       AND datetime(s.created_at) >= datetime('now', $2)
       AND (t.created_by_user_id = $1 OR t.target_user_id = $1
         OR t.group_id IN (SELECT group_id FROM group_members WHERE user_id = $1))
       AND NOT EXISTS (
         SELECT 1 FROM json_each(s.state_json, '$.participants') p
         WHERE json_extract(p.value, '$.id') = 'lp_' || $1
       )
     ORDER BY s.created_at DESC
     LIMIT 1`,
    [userId, `-${LIVE_INVITE_HOURS} hours`],
  )
  const row = rows[0]
  return row ? { code: String(row.code), quizTitle: String(row.quiz_title || ""), hostName: String(row.host_name || ""), createdAt: String(row.created_at || "") } : null
}

export async function getTodayData(user: User, offsetMinutes: number, now = new Date()): Promise<TodayData> {
  await ensureDatabase()
  const today = localDay(now, offsetMinutes)
  const [days, reviews, projects, liveGame] = await Promise.all([
    activeDays(user.id, offsetMinutes, today),
    dueReviews(user, now),
    recentProjects(user.id),
    waitingLiveGame(user.id),
  ])
  return {
    firstName: firstNameOf(user),
    today,
    streak: summarizeStreak(days, today),
    reviewsDue: reviews.due,
    restDay: reviews.restDay,
    projects,
    liveGame,
  }
}
