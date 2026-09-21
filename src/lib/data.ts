import { cookies } from "next/headers"
import crypto from "node:crypto"
import { buildProviderAdminSummary, decryptProviderSecret, encryptProviderSecret, maskProviderSecret, normalizeProviderConfigInput, type ProviderConfigInput, type SerializedProviderConfig } from "./ai/provider-admin"
import type { AiProviderKey } from "./ai/providers"
import { createSessionToken, hashPassword, hashSessionToken, verifyPassword } from "./auth"
import { query } from "./db"
import { buildFeedRankCacheEntries, feedTopicKey, selectCachedFeedLessons, type FeedRankCacheEntry } from "./feed-cache"
import { buildLearningSnapshot, type TopicAnswer } from "./learning"
import {
  buildReviewSchedule,
  calculateLevelFromXp,
  detectOrphanKnowledgeNodes,
  filterPublicProfileArtifacts,
  updateLearningStreak,
  type FeedLessonCandidate,
  type KnowledgeEdge,
  type KnowledgeNode,
  type ReviewItem,
  type Weekday,
} from "./learning-ecosystem"
import { buildGamePracticeSessionDraft, buildQuizPracticeSessionDraft, buildReviewCardsFromPracticeItems, type PracticeSessionDraft, type PracticeSessionQuestion } from "./practice-sessions"
import { createId, ensureDatabase, logAudit } from "./schema"
import { buildMultiRowInsert, chunkRowsForInsert } from "./sql-batch"
import {
  canUseContentRole,
  isGrantActive,
  normalizeConnectionInput,
  normalizeSocialActionInput,
  normalizeSocialTargetType,
  resolveContentPermission,
  type ContentItemLike,
  type PermissionRole,
  type SharedAccessLike,
} from "./sharing"
import { blankDeckTitle, blankDocTitle, blankSheetTitle } from "./studio-defaults"

export const SESSION_COOKIE = "learn_session"
const DEFAULT_WORKSPACE_ID = "workspace_demo"

/**
 * How stale `user_sessions.last_seen_at` is allowed to get before an
 * authenticated request refreshes it.
 *
 * This runs on *every* authenticated API request (123 `requireApiUser` call
 * sites), and the value is only ever read coarsely as "when was this session
 * last active". Touching it on every request cost one D1 write per call for
 * sub-second precision nobody consumes.
 */
const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000

/**
 * Parse a timestamp produced by SQLite/D1 (`datetime('now')` →
 * `"2026-09-21 06:45:10"`, always UTC) or by `Date#toISOString()`
 * (`"2026-09-21T06:45:10.000Z"`).
 *
 * `Date.parse` treats a bare `"YYYY-MM-DD HH:MM:SS"` as *local* time, which
 * would skew the comparison by the host's UTC offset. Normalise to explicit
 * UTC before parsing.
 */
function parseTimestampMs(value: unknown) {
  const text = typeof value === "string" ? value.trim() : ""
  if (!text) return Number.NaN
  const iso = text.replace(" ", "T")
  const utc = /(?:Z|[+-]\d{2}:?\d{2})$/.test(iso) ? iso : `${iso}Z`
  return Date.parse(utc)
}

/**
 * Write related rows in as few statements as D1 permits.
 *
 * Replaces the per-row `for (… ) { await query(INSERT …) }` pattern, which cost
 * one round trip per row. D1 serves a database strictly one query at a time, so
 * those round trips serialise: a 20-question quiz was 20 sequential waits.
 * `chunkRowsForInsert` keeps each statement inside D1's 100-bound-parameter
 * ceiling (see `sql-batch.ts`), so long lists still collapse to a handful of
 * statements rather than one per row.
 *
 * `onConflict` is the trailing clause of the original per-row statement, e.g.
 * `ON CONFLICT (id) DO NOTHING`. It is appended to *every* chunk, so a chunked
 * upsert behaves exactly like the per-row form it replaced.
 */
async function insertRows(
  table: string,
  columns: string[],
  rows: unknown[][],
  jsonColumns: string[] = [],
  onConflict?: string,
) {
  for (const chunk of chunkRowsForInsert(rows, columns.length)) {
    const statement = buildMultiRowInsert({ table, columns, rows: chunk, jsonColumns, onConflict })
    if (statement) await query(statement.sql, statement.values)
  }
}

const OWNERSHIP_ERROR = "You can only change items you own."

function assertOwnerRow(user: User, row: Record<string, unknown> | undefined) {
  if (!row) return
  const ownerId = row.owner_id == null ? "" : String(row.owner_id)
  if (ownerId && ownerId !== user.id && user.role !== "admin") {
    throw new Error(OWNERSHIP_ERROR)
  }
}

/**
 * Reject a write that targets a row owned by somebody else.
 *
 * Every `INSERT … ON CONFLICT (id) DO UPDATE` in this file takes the row id
 * straight from the request body, and the update branch is not filtered by
 * owner. That makes an unscoped upsert a **write IDOR**: supplying another
 * user's id rewrites their row, and the `owner_user_id` in the `VALUES` clause
 * does not help, because on conflict the row already exists and the update
 * branch never touches the owner column.
 *
 * Call this before every upsert whose id can come from the client. It costs one
 * `SELECT` on the update path and nothing on the create path, because a
 * generated id never matches an existing row.
 *
 * `table` and `ownerColumn` are module-level constants, never request input.
 * They are interpolated into the SQL text, so they must stay that way.
 *
 * `user.role === "admin"` is allowed through, matching the `OR $n = 'admin'`
 * convention already used by every `delete*` function in this file. Note that
 * this means an admin can rewrite any user's private note — consistent with the
 * existing convention, but worth a deliberate decision rather than an accident.
 *
 * Returns the row it already read (`undefined` when there is none), so a caller
 * that is *updating an existing row* rather than upserting can turn "no row"
 * into its own rejection without paying for a second `SELECT`. Upsert callers
 * ignore the return value: for them an absent row is the create path, which is
 * why this function deliberately does not throw on a missing row by itself.
 */
async function assertOwnership(
  user: User,
  table: string,
  id: unknown,
  ownerColumn: string,
): Promise<Record<string, unknown> | undefined> {
  const rowId = id == null ? "" : String(id).trim()
  if (!rowId) return undefined
  const result = await query(
    `SELECT ${ownerColumn} AS owner_id FROM ${table} WHERE id = $1 LIMIT 1`,
    [rowId],
  )
  const row = result.rows[0]
  assertOwnerRow(user, row)
  return row
}

/**
 * `note_blocks` has no owner column of its own — it inherits ownership from its
 * parent note. Both the block id and the parent note id need checking: a caller
 * could otherwise pass their own `noteId` alongside somebody else's block id and
 * slip past a parent-only check.
 */
async function assertNoteBlockOwnership(user: User, blockId: unknown, noteId: unknown) {
  await assertOwnership(user, "notes", noteId, "owner_user_id")
  const rowId = blockId == null ? "" : String(blockId).trim()
  if (!rowId) return
  const result = await query(
    `SELECT n.owner_user_id AS owner_id
     FROM note_blocks b
     JOIN notes n ON n.id = b.note_id
     WHERE b.id = $1
     LIMIT 1`,
    [rowId],
  )
  assertOwnerRow(user, result.rows[0])
}

export interface User {
  id: string
  username: string
  email: string
  name: string
  avatarUrl?: string
  bio?: string
  profileVisibility?: string
  role: "admin" | "learner"
  preferences: Record<string, unknown>
  metrics?: {
    streakCurrent: number
    streakLongest: number
    streakFreezesAvailable: number
    xpTotal: number
  }
}

export interface NoteRecord {
  id: string
  title: string
  icon: string
  content: string
  favorite: boolean
  template: string
  created_at: string
  updated_at: string
  archived_at?: string | null
  tags?: string[]
}

interface QuizQuestionRecord extends Record<string, unknown> {
  id: string
  quiz_id?: string
  question: string
  choices: Array<{ id: string; text: string }>
  correct_answer_id: string
  topic: string
  explanation: string
}

export type ContentItemType =
  | "note"
  | "doc"
  | "sheet"
  | "slide_deck"
  | "media"
  | "micro_lesson"
  | "quiz"
  | "review_item"
  | "knowledge_node"

export interface ContentItemInput {
  workspaceId?: string
  ownerUserId: string
  itemType: ContentItemType
  sourceTable: string
  sourceId: string
  title: string
  summary?: string
  visibility?: string
  archivedAt?: string | null
}

export interface ContentVersionInput {
  contentItemId: string
  sourceTable: string
  sourceId: string
  userId?: string | null
  title: string
  payload?: unknown
  plainText?: string
  changeSummary?: string
}

interface WorkspaceInviteRow {
  id: string
  workspace_id: string
  invited_email: string
  role: string
  status: string
  expires_at: string
  created_at: string
}

function normalizeUser(row: Record<string, unknown>): User {
  const preferences = parseJsonObject(row.preferences)
  return {
    id: String(row.id),
    username: String(row.username),
    email: String(row.email),
    name: String(row.name),
    avatarUrl: String(row.avatar_url || ""),
    bio: String(row.bio || ""),
    profileVisibility: String(row.profile_visibility || "private"),
    role: row.role === "admin" ? "admin" : "learner",
    preferences,
    metrics: {
      streakCurrent: normalizeInteger(row.streak_current),
      streakLongest: normalizeInteger(row.streak_longest),
      streakFreezesAvailable: normalizeInteger(row.streak_freezes_available),
      xpTotal: normalizeInteger(row.xp_total),
    },
  }
}

function normalizeInteger(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value) return value as Record<string, unknown>
  if (typeof value !== "string" || !value.trim()) return {}
  try {
    const parsed = JSON.parse(value)
    return typeof parsed === "object" && parsed ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function parseJsonArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[]
  if (typeof value !== "string" || !value.trim()) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed as T[] : []
  } catch {
    return []
  }
}

function normalizeNote(row: NoteRecord): NoteRecord {
  const favorite: unknown = (row as unknown as Record<string, unknown>).favorite
  return {
    ...row,
    favorite: favorite === true || favorite === 1 || favorite === "1",
    tags: parseJsonArray<string>(row.tags),
  }
}

function normalizeQuizQuestion(row: Record<string, unknown>): QuizQuestionRecord {
  return {
    ...row,
    id: String(row.id),
    quiz_id: row.quiz_id ? String(row.quiz_id) : undefined,
    question: String(row.question || ""),
    choices: parseJsonArray<{ id: string; text: string }>(row.choices),
    correct_answer_id: String(row.correct_answer_id || ""),
    topic: String(row.topic || "General"),
    explanation: String(row.explanation || ""),
  }
}

export async function getCurrentUserFromToken(token?: string) {
  await ensureDatabase()
  const value = token?.trim()
  if (!value) return null

  // Hash once: this used to run twice per request (once for the lookup, once
  // for the touch), and this path executes on every authenticated API call.
  const tokenHash = await hashSessionToken(value)
  const result = await query(
    `SELECT u.*, s.last_seen_at AS session_last_seen_at
     FROM user_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()
     LIMIT 1`,
    [tokenHash],
  )
  const row = result.rows[0]
  if (!row) return null

  const lastSeenAt = parseTimestampMs(row.session_last_seen_at)
  const isStale = Number.isNaN(lastSeenAt) || Date.now() - lastSeenAt > SESSION_TOUCH_INTERVAL_MS
  if (isStale) {
    await query("UPDATE user_sessions SET last_seen_at = now() WHERE token_hash = $1", [tokenHash])
  }

  return normalizeUser(row)
}

export async function getCurrentUser() {
  const cookieStore = await cookies()
  return getCurrentUserFromToken(cookieStore.get(SESSION_COOKIE)?.value)
}

export async function authenticateUser(identifier: string, password: string) {
  await ensureDatabase()
  const result = await query(
    `SELECT * FROM users
     WHERE lower(username) = lower($1) OR lower(email) = lower($1)
     LIMIT 1`,
    [identifier.trim()],
  )
  const row = result.rows[0]
  if (!row || !(await verifyPassword(password, String(row.password_hash)))) {
    return null
  }

  return normalizeUser(row)
}

export async function createUserSession(userId: string) {
  await ensureDatabase()
  const token = createSessionToken()
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14)
  await query(
    `INSERT INTO user_sessions (id, user_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [createId("session"), userId, await hashSessionToken(token), expiresAt.toISOString()],
  )
  await logAudit({ userId, action: "login", entity: "auth", entityId: userId })
  return { token, expiresAt }
}

export async function revokeSession(token: string) {
  await ensureDatabase()
  await query("DELETE FROM user_sessions WHERE token_hash = $1", [await hashSessionToken(token)])
}

export async function getDashboardData(user: User) {
  await ensureDatabase()
  const [notes, goals, answers, chats, attempts, files, todayStudy] = await Promise.all([
    query<NoteRecord>(
      `SELECT n.*,
        COALESCE((
          SELECT json_group_array(t.name)
          FROM note_tags nt
          JOIN tags t ON t.id = nt.tag_id
          WHERE nt.note_id = n.id
        ), '[]') AS tags
       FROM notes n
       WHERE n.owner_user_id = $1 OR $2 = 'admin'
       ORDER BY n.updated_at DESC
       LIMIT 8`,
      [user.id, user.role],
    ),
    query<{ title: string; completed: boolean }>(
      "SELECT title, completed FROM learning_goals WHERE user_id = $1 ORDER BY created_at DESC",
      [user.id],
    ),
    query<TopicAnswer>(
      `SELECT qa.topic, qa.correct AS "isCorrect"
       FROM quiz_attempt_answers qa
       JOIN quiz_attempts a ON a.id = qa.attempt_id
       WHERE a.user_id = $1`,
      [user.id],
    ),
    query("SELECT id, title, updated_at FROM ai_chats WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 5", [user.id]),
    query(
      `SELECT a.id, a.score, a.total, a.created_at, q.title AS quiz_title
       FROM quiz_attempts a
       LEFT JOIN quizzes q ON q.id = a.quiz_id
       WHERE a.user_id = $1
       ORDER BY a.created_at DESC
       LIMIT 5`,
      [user.id],
    ),
    query(
      `SELECT id, filename, content_type, created_at
       FROM media_assets
       WHERE owner_user_id = $1 OR $2 = 'admin'
       ORDER BY created_at DESC
       LIMIT 5`,
      [user.id, user.role],
    ),
    query<{ seconds: number }>(
      `SELECT COALESCE(SUM(duration_seconds), 0) AS seconds
       FROM practice_sessions
       WHERE user_id = $1
         AND substr(started_at, 1, 10) = date('now')`,
      [user.id],
    ),
  ])

  const normalizedNotes = notes.rows.map(normalizeNote)
  const snapshot = {
    ...buildLearningSnapshot({
      goals: goals.rows,
      notes: normalizedNotes.map((note) => ({
        id: note.id,
        title: note.title,
        updatedAt: new Date(note.updated_at).toISOString(),
      })),
      answers: answers.rows,
    }),
    todayStudyMinutes: Math.max(0, Math.round(Number(todayStudy.rows[0]?.seconds || 0) / 60)),
  }

  return {
    user,
    snapshot,
    notes: normalizedNotes,
    goals: goals.rows,
    chats: chats.rows,
    attempts: attempts.rows,
    files: files.rows,
  }
}

export type ArchiveListStatus = "active" | "archived" | "all"

function archivedWhereClause(alias = "") {
  const prefix = alias ? `${alias}.` : ""
  return {
    active: `${prefix}archived_at IS NULL`,
    archived: `${prefix}archived_at IS NOT NULL`,
    all: "1 = 1",
  } satisfies Record<ArchiveListStatus, string>
}

export function normalizeArchiveStatus(value?: string | null): ArchiveListStatus {
  return value === "archived" || value === "all" ? value : "active"
}

export async function listNotes(user: User, status: ArchiveListStatus = "active") {
  await ensureDatabase()
  const archiveClause = archivedWhereClause("n")[status]
  const result = await query<NoteRecord>(
    `SELECT n.*,
      COALESCE((
        SELECT json_group_array(t.name)
        FROM note_tags nt
        JOIN tags t ON t.id = nt.tag_id
        WHERE nt.note_id = n.id
      ), '[]') AS tags
     FROM notes n
     WHERE ${archiveClause} AND (n.owner_user_id = $1 OR $2 = 'admin')
     ORDER BY n.favorite DESC, n.updated_at DESC`,
    [user.id, user.role],
  )
  return result.rows.map(normalizeNote)
}

export async function getNote(user: User, id: string) {
  await ensureDatabase()
  const result = await query<NoteRecord>(
    "SELECT * FROM notes WHERE id = $1 AND archived_at IS NULL AND (owner_user_id = $2 OR $3 = 'admin') LIMIT 1",
    [id, user.id, user.role],
  )
  return result.rows[0] ? normalizeNote(result.rows[0]) : null
}

export async function saveNote(user: User, input: Partial<NoteRecord> & { title: string; content: string }) {
  await ensureDatabase()
  const id = input.id || createId("note")
  const workspaceId = "workspace_demo"
  const existing = input.id ? await getNote(user, input.id) : null
  await assertOwnership(user, "notes", input.id, "owner_user_id")
  await query(
    `INSERT INTO notes (id, workspace_id, owner_user_id, title, icon, content, favorite, template, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
     ON CONFLICT (id) DO UPDATE
     SET title = EXCLUDED.title,
         icon = EXCLUDED.icon,
         content = EXCLUDED.content,
         favorite = EXCLUDED.favorite,
         template = EXCLUDED.template,
         archived_at = NULL,
         updated_at = now()`,
    [
      id,
      workspaceId,
      user.id,
      input.title.trim() || "Untitled",
      input.icon || "FileText",
      input.content,
      input.favorite ? 1 : 0,
      input.template || "blank",
    ],
  )
  await query(
    `INSERT INTO note_versions (id, note_id, user_id, title, content, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      createId("version"),
      id,
      user.id,
      input.title.trim() || "Untitled",
      input.content,
      JSON.stringify({ source: existing ? "update" : "create", previousTitle: existing?.title || null }),
    ],
  )
  const contentItem = await upsertContentItemForSource({
    workspaceId,
    ownerUserId: user.id,
    itemType: "note",
    sourceTable: "notes",
    sourceId: id,
    title: input.title.trim() || "Untitled",
    summary: input.content,
  })
  await appendContentVersion({
    contentItemId: String(contentItem.id),
    sourceTable: "notes",
    sourceId: id,
    userId: user.id,
    title: input.title.trim() || "Untitled",
    payload: {
      content: input.content,
      favorite: Boolean(input.favorite),
      icon: input.icon || "FileText",
      template: input.template || "blank",
    },
    plainText: input.content,
    changeSummary: existing ? "Updated note" : "Created note",
  })
  await logAudit({ userId: user.id, action: input.id ? "update" : "create", entity: "note", entityId: id })
  return getNote(user, id)
}

/**
 * Archive and restore are the write half of the notes IDOR.
 *
 * The `UPDATE`s below carry no owner predicate, so the guard has to run before
 * them or any signed-in user can archive (or quietly un-archive) somebody else's
 * note by id. Notes use `assertOwnership` here rather than the
 * `AND (owner_user_id = $2 OR $3 = 'admin')` predicate the sibling resources put
 * in their own `UPDATE`: this is the predicate `saveNote` already applies to
 * this same table, and scoping in TypeScript rather than in SQL means the two
 * paths cannot drift apart.
 *
 * Unlike an upsert, a missing note is not a create path — there is nothing to
 * archive. `assertOwnership` returns the row it read so that case is rejected
 * *before* the `UPDATE` is issued, rather than running a statement that matches
 * no rows and reporting success.
 */
export async function deleteNote(user: User, id: string) {
  await ensureDatabase()
  const note = await assertOwnership(user, "notes", id, "owner_user_id")
  if (!note) throw new Error("Note not found.")
  await query("UPDATE notes SET archived_at = now(), updated_at = now() WHERE id = $1", [id])
  await archiveContentItemForSource("notes", id)
  await logAudit({ userId: user.id, action: "delete", entity: "note", entityId: id })
}

export async function restoreNote(user: User, id: string) {
  await ensureDatabase()
  const note = await assertOwnership(user, "notes", id, "owner_user_id")
  if (!note) throw new Error("Note not found.")
  await query("UPDATE notes SET archived_at = NULL, updated_at = now() WHERE id = $1", [id])
  await restoreContentItemForSource("notes", id)
  await logAudit({ userId: user.id, action: "restore", entity: "note", entityId: id })
  return getNote(user, id)
}

export async function listNoteVersions(user: User, noteId: string) {
  await ensureDatabase()
  const note = await query("SELECT id FROM notes WHERE id = $1 AND (owner_user_id = $2 OR $3 = 'admin') LIMIT 1", [noteId, user.id, user.role])
  if (!note.rowCount) return []
  const result = await query(
    `SELECT id, note_id, user_id, title, content, metadata, created_at
     FROM note_versions
     WHERE note_id = $1
     ORDER BY created_at DESC
     LIMIT 40`,
    [noteId],
  )
  return result.rows.map((row) => ({ ...row, metadata: parseJsonObject(row.metadata) }))
}

export async function updateProfile(user: User, input: {
  avatarUrl?: string
  bio?: string
  email?: string
  name?: string
  preferences?: Record<string, unknown>
  profileVisibility?: string
}) {
  await ensureDatabase()
  const nextName = String(input.name || user.name).trim() || user.name
  const nextEmail = String(input.email || user.email).trim() || user.email
  const nextAvatarUrl = String(input.avatarUrl ?? user.avatarUrl ?? "").trim()
  const nextBio = String(input.bio ?? user.bio ?? "").trim().slice(0, 800)
  const nextProfileVisibility = ["private", "connections", "public"].includes(String(input.profileVisibility))
    ? String(input.profileVisibility)
    : user.profileVisibility || "private"
  const preferences = { ...user.preferences, ...(input.preferences || {}) }
  await query(
    `UPDATE users
     SET name = $1, email = $2, avatar_url = $3, bio = $4, profile_visibility = $5,
         preferences = $6::jsonb, updated_at = now()
     WHERE id = $7`,
    [nextName, nextEmail, nextAvatarUrl, nextBio, nextProfileVisibility, JSON.stringify(preferences), user.id],
  )
  await logAudit({ userId: user.id, action: "update", entity: "profile", entityId: user.id })
  // Rebuild from the values we just wrote instead of re-reading the session.
  // The caller already authenticated `user` via requireApiUser, so going back
  // through getCurrentUserFromToken() would spend another token hash + SELECT
  // (plus a possible last_seen_at write) to recover data we already hold.
  return {
    ...user,
    name: nextName,
    email: nextEmail,
    avatarUrl: nextAvatarUrl,
    bio: nextBio,
    profileVisibility: nextProfileVisibility,
    preferences,
  } satisfies User
}

export async function updatePreferences(user: User, preferences: Record<string, unknown>) {
  await ensureDatabase()
  const nextPreferences = { ...user.preferences, ...preferences }
  await query("UPDATE users SET preferences = $1::jsonb, updated_at = now() WHERE id = $2", [JSON.stringify(nextPreferences), user.id])
  await logAudit({ userId: user.id, action: "update", entity: "preferences", entityId: user.id })
  return nextPreferences
}

export async function listCalendarEvents(user: User) {
  await ensureDatabase()
  const result = await query(
    `SELECT * FROM calendar_events
     WHERE owner_user_id = $1 OR $2 = 'admin'
     ORDER BY starts_at ASC
     LIMIT 120`,
    [user.id, user.role],
  )
  return result.rows.map(normalizeCalendarEventRow)
}

/**
 * One user's own events, with no admin widening.
 *
 * `listCalendarEvents` deliberately hands an admin *every* event so the month
 * and agenda views can moderate across the workspace. An ICS feed cannot do
 * that: its URL is a bearer credential that gets pasted into chat, forwarded,
 * and stored on a calendar vendor's servers, so the read behind it must be
 * unable to resolve to anybody else's rows even for an admin. The exported
 * calendar is the user's own schedule and nothing more.
 */
export async function listOwnerCalendarEvents(userId: string) {
  await ensureDatabase()
  const result = await query(
    `SELECT * FROM calendar_events
     WHERE owner_user_id = $1
     ORDER BY starts_at ASC
     LIMIT 500`,
    [userId],
  )
  return result.rows.map(normalizeCalendarEventRow)
}

/**
 * `null` means the user never picked a reminder; `0` means they picked "None".
 *
 * Those are different states in the exported ICS (default alarm vs no alarm),
 * so `0` has to survive storage — which is why callers read this with `??` and
 * not `||`. Anything unparseable or negative is dropped to `null` rather than
 * stored, so the ICS builder never has to guess at junk. The upper bound is a
 * week: large enough for any plausible reminder, small enough that a hostile
 * value cannot become a nonsense `-PT…M` in someone's calendar.
 */
function normalizeReminderMinutes(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const minutes = Number(value)
  if (!Number.isFinite(minutes) || minutes < 0) return null
  return Math.min(Math.floor(minutes), 10080)
}

/**
 * Coerce `reminder_minutes` on the way out of the database.
 *
 * A row written before this column existed has no value at all, and D1 reports
 * that as `null` — which must stay "unset" rather than collapsing to `0` and
 * silently suppressing that event's alarm in the export.
 */
function normalizeCalendarEventRow<T extends Record<string, unknown> | undefined>(row: T): T {
  if (!row) return row
  const value = row.reminder_minutes
  if (value === null || value === undefined || value === "") {
    return { ...row, reminder_minutes: null }
  }
  const minutes = Number(value)
  return { ...row, reminder_minutes: Number.isFinite(minutes) ? minutes : null }
}

export async function saveCalendarEvent(user: User, input: Record<string, unknown>) {
  await ensureDatabase()
  const id = String(input.id || createId("event"))
  const startsAt = String(input.startsAt || input.starts_at || new Date().toISOString())
  const startsAtMs = Date.parse(startsAt)
  const defaultEndsAt = new Date((Number.isFinite(startsAtMs) ? startsAtMs : Date.now()) + 45 * 60 * 1000).toISOString()
  const reminderMinutes = normalizeReminderMinutes(input.reminderMinutes ?? input.reminder_minutes)
  await assertOwnership(user, "calendar_events", input.id, "owner_user_id")
  await query(
    `INSERT INTO calendar_events (id, workspace_id, owner_user_id, title, event_type, starts_at, ends_at, timezone, notes, linked_note_id, reminder_minutes, updated_at)
     VALUES ($1, 'workspace_demo', $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
     ON CONFLICT (id) DO UPDATE
     SET title = EXCLUDED.title,
         event_type = EXCLUDED.event_type,
         starts_at = EXCLUDED.starts_at,
         ends_at = EXCLUDED.ends_at,
         timezone = EXCLUDED.timezone,
         notes = EXCLUDED.notes,
         linked_note_id = EXCLUDED.linked_note_id,
         reminder_minutes = EXCLUDED.reminder_minutes,
         updated_at = now()`,
    [
      id,
      user.id,
      String(input.title || "Study block").trim(),
      String(input.eventType || input.event_type || "study"),
      startsAt,
      String(input.endsAt || input.ends_at || defaultEndsAt),
      String(input.timezone || "UTC"),
      String(input.notes || ""),
      input.linkedNoteId || input.linked_note_id || null,
      reminderMinutes,
    ],
  )
  await logAudit({ userId: user.id, action: input.id ? "update" : "create", entity: "calendar_event", entityId: id })
  return normalizeCalendarEventRow((await query("SELECT * FROM calendar_events WHERE id = $1 LIMIT 1", [id])).rows[0])
}

/**
 * The caller's subscription token, minted on first use.
 *
 * Two v4 UUIDs with their dashes stripped give 64 hex characters. Not because
 * 122 bits of v4 entropy is insufficient on its own, but because the token is
 * the only thing between a stranger and a calendar: doubling the length costs
 * nothing and puts it well clear of anything a scanner would enumerate. It is
 * deliberately not a session token — this one never expires, so it is stored
 * separately from `user_sessions` and revoked by clearing the column rather
 * than by a logout.
 *
 * Read-then-write rather than a single upsert: two concurrent requests can mint
 * two tokens and the later write wins, leaving the first URL dead. That is a
 * cheap failure (re-copy the link) and the alternative is a race-prone
 * transaction for a value the user fetches once.
 */
export async function getOrCreateCalendarFeedToken(user: User) {
  await ensureDatabase()
  const existing = await query("SELECT calendar_feed_token FROM users WHERE id = $1 LIMIT 1", [user.id])
  const current = existing.rows[0]?.calendar_feed_token
  if (typeof current === "string" && current.trim()) return current.trim()

  const token = `${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "")}`
  await query("UPDATE users SET calendar_feed_token = $1, updated_at = now() WHERE id = $2", [token, user.id])
  await logAudit({ userId: user.id, action: "create", entity: "calendar_feed", entityId: user.id })
  return token
}

/**
 * Resolve a subscription token to its owner, or `null`.
 *
 * The comparison happens inside SQLite as an indexed exact-match lookup rather
 * than in JavaScript as `stored === supplied`. A byte-by-byte `===` on a secret
 * short-circuits at the first differing byte, so its running time leaks how many
 * leading characters a guess got right — enough to recover a token one
 * character at a time given enough requests. A B-tree lookup does not compare
 * in a guess-order-dependent way, and it never loads every user to find one.
 */
export async function getUserByCalendarFeedToken(token: unknown) {
  await ensureDatabase()
  const value = typeof token === "string" ? token.trim() : ""
  if (!value) return null

  const result = await query("SELECT * FROM users WHERE calendar_feed_token = $1 LIMIT 1", [value])
  const row = result.rows[0]
  return row ? normalizeUser(row) : null
}

export async function deleteCalendarEvent(user: User, id: string) {
  await ensureDatabase()
  await query("DELETE FROM calendar_events WHERE id = $1 AND (owner_user_id = $2 OR $3 = 'admin')", [id, user.id, user.role])
  await logAudit({ userId: user.id, action: "delete", entity: "calendar_event", entityId: id })
}

function normalizeJsonRow<T extends Record<string, unknown>>(row: T, keys: string[]) {
  return keys.reduce<Record<string, unknown>>((next, key) => {
    next[key] = parseJsonArray(row[key])
    return next
  }, { ...row })
}

function truncateSummary(value: string, maxLength = 240) {
  const compact = value.replace(/\s+/g, " ").trim()
  return compact.length > maxLength ? `${compact.slice(0, maxLength - 1).trim()}...` : compact
}

function extractPlainText(value: unknown): string {
  if (typeof value === "string") return value
  if (Array.isArray(value)) return value.map(extractPlainText).filter(Boolean).join(" ")
  if (!value || typeof value !== "object") return ""
  const record = value as Record<string, unknown>
  const direct = [record.plainText, record.markdown, record.text, record.content, record.body, record.title]
    .filter((item): item is string => typeof item === "string")
    .join(" ")
  const nested = [record.blocks, record.slides, record.rows, record.cells, record.children]
    .map(extractPlainText)
    .filter(Boolean)
    .join(" ")
  return [direct, nested].filter(Boolean).join(" ")
}

export async function upsertContentItemForSource(input: ContentItemInput) {
  const id = createId("content")
  await query(
    `INSERT INTO content_items (
       id, workspace_id, owner_user_id, item_type, source_table, source_id,
       title, summary, visibility, archived_at, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
     ON CONFLICT (source_table, source_id) DO UPDATE
     SET workspace_id = EXCLUDED.workspace_id,
         owner_user_id = EXCLUDED.owner_user_id,
         item_type = EXCLUDED.item_type,
         title = EXCLUDED.title,
         summary = EXCLUDED.summary,
         visibility = EXCLUDED.visibility,
         archived_at = EXCLUDED.archived_at,
         updated_at = now()`,
    [
      id,
      input.workspaceId || DEFAULT_WORKSPACE_ID,
      input.ownerUserId,
      input.itemType,
      input.sourceTable,
      input.sourceId,
      input.title.trim() || "Untitled",
      truncateSummary(input.summary || ""),
      input.visibility || "private",
      input.archivedAt ?? null,
    ],
  )
  const result = await query("SELECT * FROM content_items WHERE source_table = $1 AND source_id = $2 LIMIT 1", [input.sourceTable, input.sourceId])
  return result.rows[0]
}

export async function archiveContentItemForSource(sourceTable: string, sourceId: string) {
  await query("UPDATE content_items SET archived_at = now(), updated_at = now() WHERE source_table = $1 AND source_id = $2", [sourceTable, sourceId])
}

export async function restoreContentItemForSource(sourceTable: string, sourceId: string) {
  await query("UPDATE content_items SET archived_at = NULL, updated_at = now() WHERE source_table = $1 AND source_id = $2", [sourceTable, sourceId])
}

export async function appendContentVersion(input: ContentVersionInput) {
  const versionResult = await query<{ version_number: number | string }>(
    "SELECT COALESCE(MAX(version_number), 0) + 1 AS version_number FROM content_versions WHERE content_item_id = $1",
    [input.contentItemId],
  )
  const versionNumber = Number(versionResult.rows[0]?.version_number || 1)
  await query(
    `INSERT INTO content_versions (
       id, content_item_id, source_table, source_id, user_id, version_number,
       title, payload, plain_text, change_summary
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      createId("cversion"),
      input.contentItemId,
      input.sourceTable,
      input.sourceId,
      input.userId || null,
      versionNumber,
      input.title.trim() || "Untitled",
      JSON.stringify(input.payload || {}),
      truncateSummary(input.plainText || extractPlainText(input.payload), 20000),
      input.changeSummary || "",
    ],
  )
  return { versionNumber }
}

export async function attachMediaToContentSource(sourceTable: string, sourceId: string, mediaAssetId: string, role = "source") {
  const result = await query("SELECT id FROM content_items WHERE source_table = $1 AND source_id = $2 LIMIT 1", [sourceTable, sourceId])
  const contentItemId = result.rows[0]?.id
  if (!contentItemId) return false
  await query(
    `INSERT INTO content_attachments (content_item_id, media_asset_id, attachment_role)
     VALUES ($1, $2, $3)
     ON CONFLICT (content_item_id, media_asset_id, attachment_role) DO NOTHING`,
    [contentItemId, mediaAssetId, role],
  )
  return true
}

// ---------------------------------------------------------------------------
// Sharing — grants, share links, and the write-side role check
// ---------------------------------------------------------------------------

/**
 * The roles a share link may grant.
 *
 * Deliberately narrower than `PermissionRole`. A link is a bearer credential
 * that anyone holding the URL can forward, so it can never mint `owner` (which
 * would let the holder manage the item's other grants) and there is no
 * `commenter` surface in the product yet.
 */
export const SHARE_LINK_ROLES = ["viewer", "editor"] as const
export type ShareLinkRole = typeof SHARE_LINK_ROLES[number]

export interface ShareLinkInput {
  /** The registry id, when the caller has it. */
  contentItemId?: string | null
  /** Otherwise the source pair the registry mirrors. */
  sourceTable?: string | null
  sourceId?: string | null
  role: ShareLinkRole
  /** ISO-8601, or null for a link that never expires. */
  expiresAt?: string | null
}

export interface ShareLinkSummary {
  id: string
  /** The bearer credential itself: `shared_access.grantee_id`. */
  token: string
  role: ShareLinkRole
  expiresAt: string | null
  /** False once `expires_at` has passed; the row is kept so it can be revoked. */
  active: boolean
}

export interface ResolvedShareToken {
  grant: SharedAccessLike & { id: string }
  item: Record<string, unknown>
}

const SHARE_NOT_FOUND_ERROR = "Content item not found."
const SHARE_OWNER_ERROR = "Only the owner of an item can manage its share links."

/** `""` for anything absent, so every id comparison below is on trimmed strings. */
function normalizeId(value: unknown) {
  return value == null ? "" : String(value).trim()
}

/**
 * Reject a share-management call from anyone but the item's owner (or an admin,
 * matching the convention every `delete*` function in this file follows).
 */
function assertContentItemOwner(user: User, item: Record<string, unknown> | null | undefined) {
  if (!item) throw new Error(SHARE_NOT_FOUND_ERROR)
  const ownerId = normalizeId(item.owner_user_id)
  if (ownerId !== user.id && user.role !== "admin") throw new Error(SHARE_OWNER_ERROR)
  return item
}

/**
 * The permission model reads only these four fields off `content_items`; D1
 * hands every column back untyped, so narrow them once here instead of at each
 * call site.
 */
function toContentItemLike(row: Record<string, unknown> | null | undefined): ContentItemLike | null {
  if (!row) return null
  const id = normalizeId(row.id)
  if (!id) return null
  return {
    id,
    owner_user_id: normalizeId(row.owner_user_id),
    visibility: row.visibility == null ? null : String(row.visibility),
    archived_at: row.archived_at == null ? null : String(row.archived_at),
  }
}

export async function getContentItemById(id: unknown) {
  await ensureDatabase()
  const itemId = normalizeId(id)
  if (!itemId) return null
  const result = await query("SELECT * FROM content_items WHERE id = $1 LIMIT 1", [itemId])
  return result.rows[0] || null
}

export async function getContentItemForSource(sourceTable: unknown, sourceId: unknown) {
  await ensureDatabase()
  const table = normalizeId(sourceTable)
  const id = normalizeId(sourceId)
  if (!table || !id) return null
  const result = await query("SELECT * FROM content_items WHERE source_table = $1 AND source_id = $2 LIMIT 1", [table, id])
  return result.rows[0] || null
}

export async function listGrantsForContentItem(contentItemId: unknown): Promise<SharedAccessLike[]> {
  await ensureDatabase()
  const id = normalizeId(contentItemId)
  if (!id) return []
  const result = await query("SELECT * FROM shared_access WHERE content_item_id = $1", [id])
  return result.rows.map((row) => ({
    content_item_id: normalizeId(row.content_item_id),
    grantee_type: normalizeId(row.grantee_type) as SharedAccessLike["grantee_type"],
    grantee_id: row.grantee_id == null ? null : String(row.grantee_id),
    role: normalizeId(row.role) as SharedAccessLike["role"],
    expires_at: row.expires_at == null ? null : String(row.expires_at),
  }))
}

export interface ViewerContext {
  groupIds: string[]
  spaceIds: string[]
}

/**
 * The two membership sets `resolveContentPermission` matches `group` and `space`
 * grants against, read once per viewer instead of per grant.
 */
export async function resolveViewerContext(user: Pick<User, "id">): Promise<ViewerContext> {
  await ensureDatabase()
  const groups = await query("SELECT group_id FROM group_members WHERE user_id = $1", [user.id])
  const spaces = await query("SELECT space_id FROM learning_space_members WHERE user_id = $1", [user.id])
  return {
    groupIds: groups.rows.map((row) => normalizeId(row.group_id)).filter(Boolean),
    spaceIds: spaces.rows.map((row) => normalizeId(row.space_id)).filter(Boolean),
  }
}

/**
 * No user can have the empty id, so the anonymous viewer matches no `user`
 * grant and resolves through public visibility alone.
 */
const ANONYMOUS_VIEWER_ID = ""

/**
 * The caller's role on one content item — the single entry point to
 * `resolveContentPermission` for this app.
 *
 * `public_link` grants are deliberately **excluded** from the set handed to the
 * model. Every row of that kind is readable by anyone who can guess an item id,
 * so honouring one without presenting the token it carries would turn an "edit"
 * link into "any signed-in user may edit this item". A link grant is only ever
 * honoured through `resolveShareToken`, which has the token, or through
 * `resolveContentRoleForToken` below.
 *
 * Pass `null` for a visitor with no session.
 */
export async function resolveContentRole(
  user: User | null,
  contentItem: Record<string, unknown> | null | undefined,
): Promise<PermissionRole> {
  const item = toContentItemLike(contentItem)
  if (!item) return "none"
  if (user && (user.role === "admin" || item.owner_user_id === user.id)) return "owner"

  const grants = (await listGrantsForContentItem(item.id)).filter((grant) => grant.grantee_type !== "public_link")
  const memberships = user ? await resolveViewerContext(user) : { groupIds: [], spaceIds: [] }

  return resolveContentPermission({
    user: { id: user?.id || ANONYMOUS_VIEWER_ID, role: user?.role },
    contentItem: item,
    grants,
    groupIds: memberships.groupIds,
    spaceIds: memberships.spaceIds,
  })
}

/**
 * The role a *presented token* confers, which is the one case where a
 * `public_link` grant counts.
 */
export function resolveContentRoleForToken(resolved: ResolvedShareToken): PermissionRole {
  const item = toContentItemLike(resolved.item)
  if (!item || item.archived_at) return "none"
  return resolved.grant.role
}

/**
 * The write guard for the resources whose rows are mirrored into
 * `content_items`: editor documents (including canvases and pages), sheets and
 * slide decks.
 *
 * Replaces the bare `assertOwnership` in those savers only. `assertOwnership`
 * says "the caller owns this row, or is an admin"; this says the same *plus*
 * "or holds an editor/owner grant on the content item that mirrors it". A
 * viewer, commenter or unshared stranger is refused exactly as before.
 *
 * Returns the user id the `content_items` mirror must keep as its owner. Without
 * that, a granted editor saving the item would rewrite the mirror's
 * `owner_user_id` to themselves (`upsertContentItemForSource` takes the owner
 * from its caller) and the real owner would silently lose the ability to manage
 * the item's share links. Owner and admin saves are unaffected: the owner gets
 * their own id back, and an admin save now preserves the row's owner instead of
 * taking it over.
 *
 * The `SELECT` below is character-for-character the one `assertOwnership`
 * issues, on purpose: the owner path still costs one read and the SQL patterns
 * every existing guard test matches on stay valid. Module-level constants only —
 * `table` is interpolated.
 */
async function assertContentWriteRole(user: User, table: string, id: unknown): Promise<string> {
  const rowId = normalizeId(id)
  if (!rowId) return user.id // create path: the id is generated below, nothing to guard

  const result = await query(`SELECT owner_user_id AS owner_id FROM ${table} WHERE id = $1 LIMIT 1`, [rowId])
  const row = result.rows[0]
  if (!row) return user.id // no such row: an upsert here is a create, as before

  const ownerId = normalizeId(row.owner_id)
  if (!ownerId || ownerId === user.id || user.role === "admin") return ownerId || user.id

  const contentItem = await getContentItemForSource(table, rowId)
  const role = await resolveContentRole(user, contentItem)
  if (!canUseContentRole(role, "editor")) throw new Error(OWNERSHIP_ERROR)
  return ownerId
}

/**
 * The role a share link may carry, narrowed for display. Anything that is not
 * exactly `editor` reads as `viewer`, so an unexpected value in the table can
 * never be presented as broader access than it is.
 */
function shareLinkRoleOf(value: unknown): ShareLinkRole {
  return normalizeId(value) === "editor" ? "editor" : "viewer"
}

function shareLinkSummaryOf(row: Record<string, unknown>, now: Date): ShareLinkSummary {
  const role = shareLinkRoleOf(row.role)
  const grant: SharedAccessLike = {
    content_item_id: normalizeId(row.content_item_id),
    grantee_type: "public_link",
    grantee_id: row.grantee_id == null ? null : String(row.grantee_id),
    role,
    expires_at: row.expires_at == null ? null : String(row.expires_at),
  }
  return {
    id: normalizeId(row.id),
    token: grant.grantee_id || "",
    role,
    expiresAt: grant.expires_at ?? null,
    active: isGrantActive(grant, now),
  }
}

/**
 * Expiry normalisation.
 *
 * Stored as an ISO-8601 UTC string, never in D1's `datetime('now')` shape
 * ("2026-09-22 06:45:10"): `isGrantActive` parses with `Date.parse`, which reads
 * that bare form as *local* time and would silently shift the deadline by the
 * host's UTC offset.
 */
function normalizeShareExpiry(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null
  const parsed = typeof value === "number" ? value : Date.parse(String(value))
  if (!Number.isFinite(parsed)) throw new Error("A share link expiry must be a real date.")
  return new Date(parsed).toISOString()
}

async function requireOwnedContentItem(user: User, input: ShareLinkInput) {
  const item = normalizeId(input.contentItemId)
    ? await getContentItemById(input.contentItemId)
    : await getContentItemForSource(input.sourceTable, input.sourceId)
  return assertContentItemOwner(user, item)
}

/**
 * Mint a `public_link` grant on an item the caller owns.
 *
 * There is no token column in `shared_access` — the schema predates this feature
 * and needs no change for it: a link is a `grantee_type = 'public_link'` row
 * whose `grantee_id` *is* the token. The row is the grant, so listing, expiring
 * and revoking a link are all plain `shared_access` operations, and revoking is
 * one `DELETE` that cannot leave a dangling credential behind.
 *
 * The token is 64 hex characters of CSPRNG output, minted the same way
 * `getOrCreateCalendarFeedToken` does it, and is looked up by exact match in
 * SQLite rather than compared in JavaScript (see `getUserByCalendarFeedToken`
 * for why a short-circuiting `===` on a secret is the wrong comparison).
 */
export async function createShareLink(user: User, input: ShareLinkInput): Promise<ShareLinkSummary> {
  await ensureDatabase()
  if (input.role !== "viewer" && input.role !== "editor") {
    throw new Error("A share link can grant view or edit access only.")
  }

  const item = await requireOwnedContentItem(user, input)
  const contentItemId = normalizeId(item.id)
  const expiresAt = normalizeShareExpiry(input.expiresAt)
  const token = `${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "")}`
  const id = createId("share")

  await query(
    `INSERT INTO shared_access (id, content_item_id, grantee_type, grantee_id, role, created_by_user_id, expires_at)
     VALUES ($1, $2, 'public_link', $3, $4, $5, $6)`,
    [id, contentItemId, token, input.role, user.id, expiresAt],
  )
  await logAudit({
    userId: user.id,
    action: "create",
    entity: "share_link",
    entityId: id,
    details: { contentItemId, role: input.role, expiresAt },
  })

  return { id, token, role: input.role, expiresAt, active: true }
}

/**
 * Every link on one item, owner (or admin) only.
 *
 * This is the one place tokens are returned in bulk, and it is reached only by
 * the item's owner — the person who could mint an equivalent link anyway.
 */
export async function listShareLinks(user: User, contentItemId: unknown): Promise<ShareLinkSummary[]> {
  await ensureDatabase()
  const item = assertContentItemOwner(user, await getContentItemById(contentItemId))
  const result = await query(
    `SELECT * FROM shared_access
     WHERE content_item_id = $1 AND grantee_type = 'public_link'
     ORDER BY created_at DESC`,
    [normalizeId(item.id)],
  )
  const now = new Date()
  return result.rows.map((row) => shareLinkSummaryOf(row, now))
}

/**
 * Revoke one link. Owner (or admin) only — the grant is followed back to its
 * content item and ownership is checked there, so a grant id from somebody
 * else's item revokes nothing.
 */
export async function revokeShareLink(user: User, grantId: unknown) {
  await ensureDatabase()
  const id = normalizeId(grantId)
  if (!id) throw new Error("A share link id is required.")

  const existing = await query(
    "SELECT * FROM shared_access WHERE id = $1 AND grantee_type = 'public_link' LIMIT 1",
    [id],
  )
  const row = existing.rows[0]
  if (!row) throw new Error("Share link not found.")

  assertContentItemOwner(user, await getContentItemById(row.content_item_id))
  await query("DELETE FROM shared_access WHERE id = $1 AND grantee_type = 'public_link'", [id])
  await logAudit({ userId: user.id, action: "delete", entity: "share_link", entityId: id })
  return { id }
}

/**
 * Resolve a presented token to its live grant and content item, or `null`.
 *
 * Unknown, revoked, expired and dangling all collapse to the same `null` so a
 * caller can only answer 404 and cannot learn which of them it was. Archiving is
 * a separate question the caller asks — `resolveContentRoleForToken` treats an
 * archived item as no access at all, matching the model's own rule.
 */
export async function resolveShareToken(token: unknown): Promise<ResolvedShareToken | null> {
  await ensureDatabase()
  const value = normalizeId(token)
  if (!value) return null

  const result = await query(
    "SELECT * FROM shared_access WHERE grantee_type = 'public_link' AND grantee_id = $1 LIMIT 1",
    [value],
  )
  const row = result.rows[0]
  if (!row) return null

  const summary = shareLinkSummaryOf(row, new Date())
  const contentItemId = normalizeId(row.content_item_id)
  const grant = {
    id: summary.id,
    content_item_id: contentItemId,
    grantee_type: "public_link" as const,
    grantee_id: summary.token,
    role: summary.role,
    expires_at: summary.expiresAt,
  }
  if (!isGrantActive(grant)) return null

  const item = await getContentItemById(contentItemId)
  if (!item) return null

  return { grant, item }
}

/**
 * The record behind a content item, read-only.
 *
 * `source_table` is written by `upsertContentItemForSource`, never by a client,
 * but it is still resolved through a closed map rather than interpolated
 * directly — a table name in SQL text is only safe while the set of values is
 * fixed, and a `Map` (not an object literal) cannot be fooled by `"constructor"`.
 *
 * Column names come from the schema, so this is a pass-through of stored values;
 * the JSON columns are parsed exactly the way the saver for each resource parses
 * them, so a caller sees the same shape it would through the owning route.
 */
const SHAREABLE_SOURCE_TABLES = new Map<string, (row: Record<string, unknown>) => Record<string, unknown>>([
  ["notes", (row) => row],
  ["editor_documents", (row) => ({ ...row, content: parseJsonObject(row.content), tags: parseJsonArray(row.tags) })],
  ["sheet_documents", (row) => normalizeJsonRow(row, ["cells", "history"])],
  ["slide_decks", (row) => ({ ...row, slides: parseJsonArray(row.slides), speaker_notes: parseJsonObject(row.speaker_notes) })],
])

export async function readSharedContentPayload(sourceTable: unknown, sourceId: unknown) {
  await ensureDatabase()
  const table = normalizeId(sourceTable)
  const id = normalizeId(sourceId)
  const normalize = SHAREABLE_SOURCE_TABLES.get(table)
  if (!normalize || !id) return null
  const result = await query(`SELECT * FROM ${table} WHERE id = $1 LIMIT 1`, [id])
  const row = result.rows[0]
  return row ? normalize(row) : null
}

export async function listEditorDocuments(user: User, documentType = "doc", status: ArchiveListStatus = "active") {
  await ensureDatabase()
  const archiveClause = archivedWhereClause()[status]
  const result = await query(
    `SELECT * FROM editor_documents
     WHERE document_type = $1 AND ${archiveClause} AND (owner_user_id = $2 OR $3 = 'admin')
     ORDER BY updated_at DESC
     LIMIT 100`,
    [documentType, user.id, user.role],
  )
  return result.rows.map((row) => ({ ...row, content: parseJsonObject(row.content), tags: parseJsonArray(row.tags) }))
}

export async function saveEditorDocument(user: User, input: Record<string, unknown>, documentType = "doc") {
  await ensureDatabase()
  const id = String(input.id || createId(documentType === "doc" ? "doc" : "page"))
  // Owner, admin, or a holder of an editor/owner grant on this item's content
  // item. Returns the owner the content mirror must keep, so a granted editor
  // cannot take the item over. Covers docs, pages and canvases alike.
  const mirrorOwnerId = await assertContentWriteRole(user, "editor_documents", input.id)
  await query(
    `INSERT INTO editor_documents (id, workspace_id, owner_user_id, title, document_type, content, tags, updated_at)
     VALUES ($1, 'workspace_demo', $2, $3, $4, $5::jsonb, $6::jsonb, now())
     ON CONFLICT (id) DO UPDATE
     SET title = EXCLUDED.title,
         content = EXCLUDED.content,
         tags = EXCLUDED.tags,
         archived_at = NULL,
         updated_at = now()`,
    [
      id,
      user.id,
      String(input.title || blankDocTitle).trim(),
      documentType,
      JSON.stringify(input.content || {}),
      JSON.stringify(Array.isArray(input.tags) ? input.tags : []),
    ],
  )
  const title = String(input.title || blankDocTitle).trim()
  const content = input.content || {}
  const contentItem = await upsertContentItemForSource({
    workspaceId: DEFAULT_WORKSPACE_ID,
    ownerUserId: mirrorOwnerId,
    itemType: "doc",
    sourceTable: "editor_documents",
    sourceId: id,
    title,
    summary: extractPlainText(content),
  })
  await appendContentVersion({
    contentItemId: String(contentItem.id),
    sourceTable: "editor_documents",
    sourceId: id,
    userId: user.id,
    title,
    payload: content,
    plainText: extractPlainText(content),
    changeSummary: input.id ? "Updated document" : "Created document",
  })
  await logAudit({ userId: user.id, action: input.id ? "update" : "create", entity: "editor_document", entityId: id })
  const savedDoc = (await query("SELECT * FROM editor_documents WHERE id = $1 LIMIT 1", [id])).rows[0]
  return savedDoc ? { ...savedDoc, content: parseJsonObject(savedDoc.content), tags: parseJsonArray(savedDoc.tags) } : savedDoc
}

export async function archiveEditorDocument(user: User, id: string) {
  await ensureDatabase()
  await query("UPDATE editor_documents SET archived_at = now(), updated_at = now() WHERE id = $1 AND (owner_user_id = $2 OR $3 = 'admin')", [id, user.id, user.role])
  await archiveContentItemForSource("editor_documents", id)
  await logAudit({ userId: user.id, action: "archive", entity: "editor_document", entityId: id })
}

export async function restoreEditorDocument(user: User, id: string) {
  await ensureDatabase()
  await query("UPDATE editor_documents SET archived_at = NULL, updated_at = now() WHERE id = $1 AND (owner_user_id = $2 OR $3 = 'admin')", [id, user.id, user.role])
  await restoreContentItemForSource("editor_documents", id)
  await logAudit({ userId: user.id, action: "restore", entity: "editor_document", entityId: id })
  const result = await query("SELECT * FROM editor_documents WHERE id = $1 LIMIT 1", [id])
  const row = result.rows[0]
  return row ? { ...row, content: parseJsonObject(row.content), tags: parseJsonArray(row.tags) } : null
}

export async function listSheets(user: User, status: ArchiveListStatus = "active") {
  await ensureDatabase()
  const archiveClause = archivedWhereClause()[status]
  const result = await query(
    `SELECT * FROM sheet_documents
     WHERE ${archiveClause} AND (owner_user_id = $1 OR $2 = 'admin')
     ORDER BY updated_at DESC
     LIMIT 100`,
    [user.id, user.role],
  )
  return result.rows.map((row) => normalizeJsonRow(row, ["cells", "history"]))
}

export async function saveSheet(user: User, input: Record<string, unknown>) {
  await ensureDatabase()
  const id = String(input.id || createId("sheet"))
  const mirrorOwnerId = await assertContentWriteRole(user, "sheet_documents", input.id)
  await query(
    `INSERT INTO sheet_documents (id, workspace_id, owner_user_id, title, cells, history, updated_at)
     VALUES ($1, 'workspace_demo', $2, $3, $4::jsonb, $5::jsonb, now())
     ON CONFLICT (id) DO UPDATE
     SET title = EXCLUDED.title,
         cells = EXCLUDED.cells,
         history = EXCLUDED.history,
         archived_at = NULL,
         updated_at = now()`,
    [
      id,
      user.id,
      String(input.title || blankSheetTitle).trim(),
      JSON.stringify(Array.isArray(input.cells) ? input.cells : []),
      JSON.stringify(Array.isArray(input.history) ? input.history : []),
    ],
  )
  const title = String(input.title || blankSheetTitle).trim()
  const cells = Array.isArray(input.cells) ? input.cells : []
  const contentItem = await upsertContentItemForSource({
    workspaceId: DEFAULT_WORKSPACE_ID,
    ownerUserId: mirrorOwnerId,
    itemType: "sheet",
    sourceTable: "sheet_documents",
    sourceId: id,
    title,
    summary: extractPlainText(cells),
  })
  await appendContentVersion({
    contentItemId: String(contentItem.id),
    sourceTable: "sheet_documents",
    sourceId: id,
    userId: user.id,
    title,
    payload: { cells, history: Array.isArray(input.history) ? input.history : [] },
    plainText: extractPlainText(cells),
    changeSummary: input.id ? "Updated sheet" : "Created sheet",
  })
  await logAudit({ userId: user.id, action: input.id ? "update" : "create", entity: "sheet", entityId: id })
  const savedSheet = (await query("SELECT * FROM sheet_documents WHERE id = $1 LIMIT 1", [id])).rows[0]
  return savedSheet ? normalizeJsonRow(savedSheet, ["cells", "history"]) : savedSheet
}

export async function archiveSheet(user: User, id: string) {
  await ensureDatabase()
  await query("UPDATE sheet_documents SET archived_at = now(), updated_at = now() WHERE id = $1 AND (owner_user_id = $2 OR $3 = 'admin')", [id, user.id, user.role])
  await archiveContentItemForSource("sheet_documents", id)
  await logAudit({ userId: user.id, action: "archive", entity: "sheet", entityId: id })
}

export async function restoreSheet(user: User, id: string) {
  await ensureDatabase()
  await query("UPDATE sheet_documents SET archived_at = NULL, updated_at = now() WHERE id = $1 AND (owner_user_id = $2 OR $3 = 'admin')", [id, user.id, user.role])
  await restoreContentItemForSource("sheet_documents", id)
  await logAudit({ userId: user.id, action: "restore", entity: "sheet", entityId: id })
  const result = await query("SELECT * FROM sheet_documents WHERE id = $1 LIMIT 1", [id])
  return result.rows[0] ? normalizeJsonRow(result.rows[0], ["cells", "history"]) : null
}

export async function listSlideDecks(user: User, status: ArchiveListStatus = "active") {
  await ensureDatabase()
  const archiveClause = archivedWhereClause()[status]
  const result = await query(
    `SELECT * FROM slide_decks
     WHERE ${archiveClause} AND (owner_user_id = $1 OR $2 = 'admin')
     ORDER BY updated_at DESC
     LIMIT 100`,
    [user.id, user.role],
  )
  return result.rows.map((row) => ({ ...row, slides: parseJsonArray(row.slides), speaker_notes: parseJsonObject(row.speaker_notes) }))
}

export async function saveSlideDeck(user: User, input: Record<string, unknown>) {
  await ensureDatabase()
  const id = String(input.id || createId("deck"))
  const mirrorOwnerId = await assertContentWriteRole(user, "slide_decks", input.id)
  await query(
    `INSERT INTO slide_decks (id, workspace_id, owner_user_id, title, slides, speaker_notes, updated_at)
     VALUES ($1, 'workspace_demo', $2, $3, $4::jsonb, $5::jsonb, now())
     ON CONFLICT (id) DO UPDATE
     SET title = EXCLUDED.title,
         slides = EXCLUDED.slides,
         speaker_notes = EXCLUDED.speaker_notes,
         archived_at = NULL,
         updated_at = now()`,
    [
      id,
      user.id,
      String(input.title || blankDeckTitle).trim(),
      JSON.stringify(Array.isArray(input.slides) ? input.slides : []),
      JSON.stringify(input.speakerNotes || input.speaker_notes || {}),
    ],
  )
  const title = String(input.title || blankDeckTitle).trim()
  const slides = Array.isArray(input.slides) ? input.slides : []
  const speakerNotes = input.speakerNotes || input.speaker_notes || {}
  const contentItem = await upsertContentItemForSource({
    workspaceId: DEFAULT_WORKSPACE_ID,
    ownerUserId: mirrorOwnerId,
    itemType: "slide_deck",
    sourceTable: "slide_decks",
    sourceId: id,
    title,
    summary: extractPlainText(slides),
  })
  await appendContentVersion({
    contentItemId: String(contentItem.id),
    sourceTable: "slide_decks",
    sourceId: id,
    userId: user.id,
    title,
    payload: { slides, speakerNotes },
    plainText: extractPlainText(slides),
    changeSummary: input.id ? "Updated slide deck" : "Created slide deck",
  })
  await logAudit({ userId: user.id, action: input.id ? "update" : "create", entity: "slide_deck", entityId: id })
  const savedDeck = (await query("SELECT * FROM slide_decks WHERE id = $1 LIMIT 1", [id])).rows[0]
  return savedDeck ? { ...savedDeck, slides: parseJsonArray(savedDeck.slides), speaker_notes: parseJsonObject(savedDeck.speaker_notes) } : savedDeck
}

export async function archiveSlideDeck(user: User, id: string) {
  await ensureDatabase()
  await query("UPDATE slide_decks SET archived_at = now(), updated_at = now() WHERE id = $1 AND (owner_user_id = $2 OR $3 = 'admin')", [id, user.id, user.role])
  await archiveContentItemForSource("slide_decks", id)
  await logAudit({ userId: user.id, action: "archive", entity: "slide_deck", entityId: id })
}

export async function restoreSlideDeck(user: User, id: string) {
  await ensureDatabase()
  await query("UPDATE slide_decks SET archived_at = NULL, updated_at = now() WHERE id = $1 AND (owner_user_id = $2 OR $3 = 'admin')", [id, user.id, user.role])
  await restoreContentItemForSource("slide_decks", id)
  await logAudit({ userId: user.id, action: "restore", entity: "slide_deck", entityId: id })
  const result = await query("SELECT * FROM slide_decks WHERE id = $1 LIMIT 1", [id])
  const row = result.rows[0]
  return row ? { ...row, slides: parseJsonArray(row.slides), speaker_notes: parseJsonObject(row.speaker_notes) } : null
}

export async function listWorkspaceMembers(user: User) {
  await ensureDatabase()
  if (user.role === "admin") {
    const adminMembers = await query(
      `SELECT u.id, u.name, u.email, u.role, COALESCE(wm.status, 'active') AS status, COALESCE(wm.created_at, u.created_at) AS created_at
       FROM users u
       LEFT JOIN workspace_members wm ON wm.user_id = u.id
       ORDER BY u.created_at ASC`,
    )
    return adminMembers.rows
  }
  return [{ id: user.id, name: user.name, email: user.email, role: user.role, status: "active" }]
}

export async function createWorkspaceInvite(user: User, input: Record<string, unknown>) {
  await ensureDatabase()
  if (user.role !== "admin") throw new Error("Admin access required.")
  const token = createSessionToken()
  const id = createId("invite")
  await query(
    `INSERT INTO workspace_invites (id, workspace_id, invited_email, role, status, token_hash, expires_at, created_by_user_id)
     VALUES ($1, 'workspace_demo', $2, $3, 'pending', $4, $5, $6)`,
    [
      id,
      String(input.email || input.invited_email || "").trim().toLowerCase(),
      String(input.role || "learner"),
      await hashSessionToken(token),
      new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
      user.id,
    ],
  )
  await logAudit({ userId: user.id, action: "create", entity: "workspace_invite", entityId: id })
  return { id, token, status: "pending" }
}

export async function getWorkspaceInviteByToken(token: string) {
  await ensureDatabase()
  const tokenHash = await hashSessionToken(token)
  const result = await query<WorkspaceInviteRow>(
    `SELECT id, workspace_id, invited_email, role, status, expires_at, created_at
     FROM workspace_invites
     WHERE token_hash = $1
     LIMIT 1`,
    [tokenHash],
  )
  const invite = result.rows[0]
  if (!invite) return null
  const expired = new Date(String(invite.expires_at)).getTime() < Date.now()
  return {
    ...invite,
    expired,
    ready: invite.status === "pending" && !expired,
  }
}

async function createUniqueUsername(email: string) {
  const base = email
    .split("@")[0]
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24) || "learner"

  for (let index = 0; index < 5; index += 1) {
    const username = index === 0 ? base : `${base}_${index + 1}`
    const existing = await query("SELECT id FROM users WHERE lower(username) = lower($1) LIMIT 1", [username])
    if (!existing.rowCount) return username
  }

  return `${base}_${createId("user").slice(-6)}`
}

export async function acceptWorkspaceInvite(input: {
  email: string
  name: string
  password: string
  token: string
}) {
  await ensureDatabase()
  const invite = await getWorkspaceInviteByToken(input.token)
  if (!invite) throw new Error("Invite not found.")
  if (invite.status !== "pending") throw new Error("Invite has already been used.")
  if (invite.expired) {
    await query("UPDATE workspace_invites SET status = 'expired' WHERE id = $1", [invite.id])
    throw new Error("Invite has expired. Ask an admin for a new invite.")
  }

  if (String(invite.invited_email).toLowerCase() !== input.email.toLowerCase()) {
    throw new Error("Use the same email address that received the invite.")
  }

  const existing = await query("SELECT * FROM users WHERE lower(email) = lower($1) LIMIT 1", [input.email])
  const user = existing.rows[0]
    ? normalizeUser(existing.rows[0])
    : await (async () => {
        const newUser = {
          id: createId("user"),
          username: await createUniqueUsername(input.email),
          email: input.email,
          name: input.name,
          role: invite.role === "admin" ? "admin" as const : "learner" as const,
          preferences: { theme: "system", focusMode: "balanced", dailyGoalMinutes: 45, firstRun: true },
        }
        await query(
          `INSERT INTO users (id, username, email, name, password_hash, role, preferences)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
          [
            newUser.id,
            newUser.username,
            newUser.email,
            newUser.name,
            await hashPassword(input.password),
            newUser.role,
            JSON.stringify(newUser.preferences),
          ],
        )
        return newUser
      })()

  await query(
    `INSERT INTO workspace_members (workspace_id, user_id, role, status)
     VALUES ($1, $2, $3, 'active')
     ON CONFLICT (workspace_id, user_id) DO UPDATE
     SET role = EXCLUDED.role,
         status = 'active'`,
    [String(invite.workspace_id || "workspace_demo"), user.id, String(invite.role || "learner")],
  )
  await query("UPDATE workspace_invites SET status = 'accepted' WHERE id = $1", [invite.id])
  await logAudit({ userId: user.id, action: "accept", entity: "workspace_invite", entityId: String(invite.id) })
  return {
    createdUser: !existing.rows[0],
    inviteId: String(invite.id),
    user,
  }
}

export async function listGroups(user: User) {
  await ensureDatabase()
  const result = await query(
    `SELECT g.*,
       (SELECT count(*) FROM group_members gm WHERE gm.group_id = g.id) AS member_count,
       EXISTS(SELECT 1 FROM group_members gm2 WHERE gm2.group_id = g.id AND gm2.user_id = $1) AS is_member
     FROM workspace_groups g
     ORDER BY g.updated_at DESC
     LIMIT 80`,
    [user.id],
  )
  return result.rows.map((row) => ({ ...row, is_member: Boolean(row.is_member) }))
}

export async function joinGroup(user: User, groupId: string) {
  await ensureDatabase()
  const group = await query("SELECT id FROM workspace_groups WHERE id = $1 LIMIT 1", [groupId])
  if (!group.rows[0]) throw new Error("Group not found.")
  await query(
    `INSERT INTO group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT (group_id, user_id) DO NOTHING`,
    [groupId, user.id],
  )
  await logAudit({ userId: user.id, action: "join", entity: "workspace_group", entityId: groupId })
  return (await query("SELECT * FROM workspace_groups WHERE id = $1 LIMIT 1", [groupId])).rows[0]
}

export async function leaveGroup(user: User, groupId: string) {
  await ensureDatabase()
  await query("DELETE FROM group_members WHERE group_id = $1 AND user_id = $2", [groupId, user.id])
  await logAudit({ userId: user.id, action: "leave", entity: "workspace_group", entityId: groupId })
  return { groupId, left: true }
}

export async function saveGroup(user: User, input: Record<string, unknown>) {
  await ensureDatabase()
  const id = String(input.id || createId("group"))
  await assertOwnership(user, "workspace_groups", input.id, "created_by_user_id")
  await query(
    `INSERT INTO workspace_groups (id, workspace_id, name, description, created_by_user_id, updated_at)
     VALUES ($1, 'workspace_demo', $2, $3, $4, now())
     ON CONFLICT (id) DO UPDATE
     SET name = EXCLUDED.name,
         description = EXCLUDED.description,
         updated_at = now()`,
    [id, String(input.name || "Study group").trim(), String(input.description || ""), user.id],
  )
  await query(
    `INSERT INTO group_members (group_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (group_id, user_id) DO NOTHING`,
    [id, user.id],
  )
  await logAudit({ userId: user.id, action: input.id ? "update" : "create", entity: "workspace_group", entityId: id })
  return (await query("SELECT * FROM workspace_groups WHERE id = $1 LIMIT 1", [id])).rows[0]
}

export async function listChatThreads(user: User) {
  await ensureDatabase()
  const result = await query(
    `SELECT t.*,
       (SELECT body FROM chat_messages m WHERE m.thread_id = t.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
       CASE WHEN t.target_user_id IS NOT NULL THEN
         (SELECT name FROM users WHERE id = (CASE WHEN t.created_by_user_id = $1 THEN t.target_user_id ELSE t.created_by_user_id END))
       END AS dm_peer_name,
       CASE WHEN t.target_user_id IS NOT NULL THEN
         (CASE WHEN t.created_by_user_id = $1 THEN t.target_user_id ELSE t.created_by_user_id END)
       END AS dm_peer_id
     FROM chat_threads t
     WHERE t.created_by_user_id = $1
        OR t.target_user_id = $1
        OR t.group_id IN (SELECT group_id FROM group_members WHERE user_id = $1)
     ORDER BY t.updated_at DESC
     LIMIT 80`,
    [user.id],
  )
  return result.rows
}

async function isChatThreadParticipant(user: User, threadId: string) {
  const result = await query(
    `SELECT 1 FROM chat_threads t
     WHERE t.id = $1
       AND (t.created_by_user_id = $2 OR t.target_user_id = $2 OR t.group_id IN (SELECT group_id FROM group_members WHERE user_id = $2))
     LIMIT 1`,
    [threadId, user.id],
  )
  return Boolean(result.rows[0])
}

/**
 * A file uploaded and attached to a chat message should be viewable by
 * whoever the message was actually sent to, not just its uploader — chat
 * attachments otherwise 404 for the very people they were shared with.
 * This only grants read access to the file's bytes; it does not make the
 * recipient the file's owner (they still can't delete or re-attach it).
 */
export async function isFileSharedWithUserViaChat(fileId: string, user: User) {
  const result = await query(
    `SELECT 1 FROM chat_messages m
     JOIN chat_threads t ON t.id = m.thread_id
     WHERE json_extract(m.metadata, '$.attachment.fileId') = $1
       AND (t.created_by_user_id = $2 OR t.target_user_id = $2 OR t.group_id IN (SELECT group_id FROM group_members WHERE user_id = $2))
     LIMIT 1`,
    [fileId, user.id],
  )
  return Boolean(result.rows[0])
}

export async function listChatMessages(user: User, threadId: string) {
  await ensureDatabase()
  if (!(await isChatThreadParticipant(user, threadId))) throw new Error("You don't have access to this conversation.")
  const result = await query(
    "SELECT * FROM chat_messages WHERE thread_id = $1 ORDER BY created_at ASC LIMIT 200",
    [threadId],
  )
  return result.rows.map((row) => ({ ...row, metadata: parseJsonObject(row.metadata) }))
}

export async function postChatMessage(user: User, input: Record<string, unknown>) {
  await ensureDatabase()
  const providedThreadId = String(input.threadId || input.thread_id || "").trim()
  let threadId = providedThreadId

  if (providedThreadId) {
    const existing = await query("SELECT id FROM chat_threads WHERE id = $1 LIMIT 1", [providedThreadId])
    if (existing.rows[0] && !(await isChatThreadParticipant(user, providedThreadId))) {
      throw new Error("You don't have access to this conversation.")
    }
  }

  const title = String(input.title || "Study chat").trim()
  const groupId = (input.groupId || input.group_id || null) as string | null
  const requestedTargetUserId = String(input.targetUserId || input.target_user_id || "").trim() || null
  if (groupId) {
    const membership = await query("SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2 LIMIT 1", [groupId, user.id])
    if (!membership.rows[0]) throw new Error("You're not a member of that group.")
  }
  if (requestedTargetUserId && requestedTargetUserId === user.id) throw new Error("You can't message yourself.")

  // Reuse an existing DM thread between these two people instead of creating a new one every time.
  if (!threadId && requestedTargetUserId && !groupId) {
    const existingDm = await query(
      `SELECT id FROM chat_threads
       WHERE group_id IS NULL
         AND ((created_by_user_id = $1 AND target_user_id = $2) OR (created_by_user_id = $2 AND target_user_id = $1))
       LIMIT 1`,
      [user.id, requestedTargetUserId],
    )
    threadId = existingDm.rows[0]?.id as string | undefined || ""
  }
  if (!threadId) threadId = createId("thread")

  await query(
    `INSERT INTO chat_threads (id, workspace_id, group_id, target_user_id, title, created_by_user_id, updated_at)
     VALUES ($1, 'workspace_demo', $2, $3, $4, $5, now())
     ON CONFLICT (id) DO UPDATE SET updated_at = now()`,
    [threadId, groupId, requestedTargetUserId, title, user.id],
  )
  const messageId = createId("chatmsg")
  const body = String(input.body || "").trim()
  await query(
    `INSERT INTO chat_messages (id, thread_id, user_id, body, metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [messageId, threadId, user.id, body, JSON.stringify(input.metadata || {})],
  )
  await logAudit({ userId: user.id, action: "create", entity: "chat_message", entityId: messageId })

  const savedMessageRow = (await query("SELECT * FROM chat_messages WHERE id = $1 LIMIT 1", [messageId])).rows[0]
  const item = savedMessageRow ? { ...savedMessageRow, metadata: parseJsonObject(savedMessageRow.metadata) } : { id: messageId, thread_id: threadId, user_id: user.id, body }

  // The thread may already have belonged to a group or DM even if this call didn't pass that itself (a reply).
  const threadRow = (await query("SELECT group_id, target_user_id, created_by_user_id FROM chat_threads WHERE id = $1 LIMIT 1", [threadId])).rows[0]
  const resolvedGroupId = (threadRow?.group_id as string | null | undefined) || null
  const resolvedTargetUserId = threadRow?.target_user_id
    ? ((threadRow.created_by_user_id === user.id ? threadRow.target_user_id : threadRow.created_by_user_id) as string)
    : null

  return { threadId, messageId, item, groupId: resolvedGroupId, targetUserId: resolvedTargetUserId }
}

export async function listGameAttempts(user: User) {
  await ensureDatabase()
  const result = await query("SELECT * FROM game_attempts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 80", [user.id])
  return result.rows.map((row) => ({ ...row, metadata: parseJsonObject(row.metadata) }))
}

async function insertPracticeSession(user: User, draft: PracticeSessionDraft, sourceContentItemId?: string | null) {
  const sessionId = createId("practice")
  await query(
    `INSERT INTO practice_sessions (
       id, user_id, workspace_id, session_type, source_content_item_id,
       ended_at, duration_seconds, score, total, metadata
     )
     VALUES ($1, $2, $3, $4, $5, now(), $6, $7, $8, $9::jsonb)`,
    [
      sessionId,
      user.id,
      DEFAULT_WORKSPACE_ID,
      draft.sessionType,
      sourceContentItemId || null,
      draft.durationSeconds,
      draft.score,
      draft.total,
      JSON.stringify(draft.metadata),
    ],
  )
  await insertRows(
    "practice_session_items",
    [
      "id", "session_id", "question_id", "review_item_id", "content_item_id",
      "prompt", "answer", "user_answer", "correct", "elapsed_ms", "metadata",
    ],
    draft.items.map((item) => [
      createId("practiceitem"),
      sessionId,
      item.questionId || null,
      item.reviewItemId || null,
      item.contentItemId || null,
      item.prompt,
      item.answer,
      item.userAnswer,
      item.correct ? 1 : 0,
      item.elapsedMs,
      JSON.stringify(item.metadata),
    ]),
    ["metadata"],
  )
  return sessionId
}

export async function recordGameAttempt(user: User, input: Record<string, unknown>) {
  await ensureDatabase()
  const id = createId("game")
  const gameKey = String(input.gameKey || input.game_key || "flashcard-sprint")
  const metadata = input.metadata && typeof input.metadata === "object" ? input.metadata as Record<string, unknown> : {}
  const items = Array.isArray(input.items) ? input.items as Array<Record<string, unknown>> : Array.isArray(metadata.items) ? metadata.items as Array<Record<string, unknown>> : []
  const draft = buildGamePracticeSessionDraft({
    gameKey,
    score: Number(input.score || 0),
    total: Number(input.total || 0),
    durationSeconds: Number(input.durationSeconds || input.duration_seconds || 0),
    metadata,
    items,
  })
  const practiceSessionId = await insertPracticeSession(user, draft)
  await query(
    `INSERT INTO game_attempts (id, user_id, game_key, score, total, duration_seconds, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [
      id,
      user.id,
      gameKey,
      draft.score,
      draft.total,
      draft.durationSeconds,
      JSON.stringify({ ...metadata, practiceSessionId }),
    ],
  )
  await logAudit({ userId: user.id, action: "complete", entity: "game_attempt", entityId: id })
  return { id, practiceSessionId }
}

export async function listQuizzes() {
  await ensureDatabase()
  const result = await query(
    `SELECT q.*, count(qq.id)::int AS question_count
     FROM quizzes q
     LEFT JOIN quiz_questions qq ON qq.quiz_id = q.id
     WHERE q.archived_at IS NULL
     GROUP BY q.id
     ORDER BY q.topic ASC`,
  )
  return result.rows
}

export async function saveQuiz(user: User, input: Record<string, unknown>) {
  await ensureDatabase()
  const title = String(input.title || "").trim()
  if (!title) throw new Error("A quiz title is required.")
  const rawQuestions = Array.isArray(input.questions) ? input.questions : []
  if (!rawQuestions.length) throw new Error("A quiz needs at least one question.")

  const id = String(input.id || createId("quiz"))
  const topic = String(input.topic || "General").trim() || "General"
  await assertOwnership(user, "quizzes", input.id, "created_by_user_id")
  // `created_by_user_id` is last in the column list on purpose: the fake quiz
  // store in `tests/api/quiz-loop.test.ts` parses these params positionally, and
  // appending keeps its first five mapping to the same columns.
  //
  // It is also deliberately absent from the `DO UPDATE SET` clause: an existing
  // quiz keeps the owner it was created with, so an update cannot reassign it.
  await query(
    `INSERT INTO quizzes (id, workspace_id, title, topic, description, source, created_by_user_id)
     VALUES ($1, 'workspace_demo', $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, topic = EXCLUDED.topic, description = EXCLUDED.description`,
    [id, title, topic, String(input.description || ""), String(input.source || "manual"), user.id],
  )

  if (input.id) await query("DELETE FROM quiz_questions WHERE quiz_id = $1", [id])

  const questionRows = (rawQuestions as Record<string, unknown>[]).flatMap((raw) => {
    const question = String(raw.question || "").trim()
    const choices = Array.isArray(raw.choices) ? raw.choices : []
    const correctAnswerId = String(raw.correct_answer_id || raw.correctAnswerId || "")
    if (!question || choices.length < 2 || !correctAnswerId) return []
    return [[
      createId("qq"),
      id,
      question,
      JSON.stringify(choices),
      correctAnswerId,
      String(raw.topic || topic),
      String(raw.explanation || ""),
    ]]
  })
  await insertRows(
    "quiz_questions",
    ["id", "quiz_id", "question", "choices", "correct_answer_id", "topic", "explanation"],
    questionRows,
    ["choices"],
  )

  await logAudit({ userId: user.id, action: input.id ? "update" : "create", entity: "quiz", entityId: id })
  return getQuiz(id)
}

export async function getQuiz(id: string) {
  await ensureDatabase()
  const [quiz, questions] = await Promise.all([
    query("SELECT * FROM quizzes WHERE id = $1 AND archived_at IS NULL LIMIT 1", [id]),
    query("SELECT * FROM quiz_questions WHERE quiz_id = $1 ORDER BY id ASC", [id]),
  ])
  if (!quiz.rows[0]) return null
  return { ...quiz.rows[0], questions: questions.rows.map(normalizeQuizQuestion) }
}

export async function archiveQuiz(user: User, id: string) {
  await ensureDatabase()
  const existing = await query("SELECT id FROM quizzes WHERE id = $1 AND archived_at IS NULL LIMIT 1", [id])
  if (!existing.rows[0]) return false
  await assertOwnership(user, "quizzes", id, "created_by_user_id")
  await query("UPDATE quizzes SET archived_at = datetime('now') WHERE id = $1", [id])
  await logAudit({ userId: user.id, action: "archive", entity: "quiz", entityId: id })
  return true
}

export async function recordQuizAttempt(user: User, input: {
  quizId: string
  answers: { questionId: string; selectedAnswerId: string }[]
  durationSeconds?: number
}) {
  await ensureDatabase()
  const quiz = await getQuiz(input.quizId)
  if (!quiz) throw new Error("Quiz not found")

  const questionMap = new Map(quiz.questions.map((question) => [question.id, question]))
  let score = 0
  const normalizedAnswers = input.answers.map((answer) => {
    const question = questionMap.get(answer.questionId)
    const correct = String(question?.correct_answer_id || "") === answer.selectedAnswerId
    if (correct) score += 1
    return {
      ...answer,
      topic: String(question?.topic || "General"),
      correct,
    }
  })
  const attemptId = createId("attempt")
  const durationSeconds = Math.max(0, Math.round(Number(input.durationSeconds || 0)))
  const practiceDraft = buildQuizPracticeSessionDraft({
    quizId: input.quizId,
    quizTitle: String((quiz as Record<string, unknown>).title || "Quiz"),
    questions: quiz.questions.map((question): PracticeSessionQuestion => ({
      id: question.id,
      question: question.question,
      topic: question.topic,
      choices: question.choices,
      correct_answer_id: question.correct_answer_id,
      explanation: question.explanation,
    })),
    answers: input.answers.map((answer) => ({
      questionId: answer.questionId,
      selectedAnswerId: answer.selectedAnswerId,
    })),
    durationSeconds,
  })
  const practiceSessionId = await insertPracticeSession(user, practiceDraft)
  await query(
    "INSERT INTO quiz_attempts (id, quiz_id, user_id, score, total, duration_seconds) VALUES ($1, $2, $3, $4, $5, $6)",
    [attemptId, input.quizId, user.id, score, input.answers.length, durationSeconds],
  )
  await insertRows(
    "quiz_attempt_answers",
    ["id", "attempt_id", "question_id", "topic", "selected_answer_id", "correct"],
    normalizedAnswers.map((answer) => [
      createId("answer"),
      attemptId,
      answer.questionId,
      answer.topic,
      answer.selectedAnswerId,
      answer.correct ? 1 : 0,
    ]),
  )
  await logAudit({ userId: user.id, action: "complete", entity: "quiz_attempt", entityId: attemptId })
  return { attemptId, practiceSessionId, score, total: input.answers.length, durationSeconds }
}

export async function listAdminData() {
  await ensureDatabase()
  const [users, providers, audit, members, events, games] = await Promise.all([
    query("SELECT id, username, email, name, role, created_at FROM users ORDER BY created_at ASC"),
    listAiProviderConfigs(),
    query("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 80"),
    query("SELECT count(*) AS count FROM workspace_members"),
    query("SELECT count(*) AS count FROM calendar_events"),
    query("SELECT count(*) AS count FROM game_attempts"),
  ])
  return {
    users: users.rows,
    providers,
    audit: audit.rows,
    counters: {
      members: Number(members.rows[0]?.count || 0),
      events: Number(events.rows[0]?.count || 0),
      games: Number(games.rows[0]?.count || 0),
    },
  }
}

function serializeAiProvider(row: Record<string, unknown>): SerializedProviderConfig {
  const encrypted = String(row.api_key_encrypted || "")
  return {
    id: String(row.id || ""),
    name: String(row.name || ""),
    provider: String(row.provider || "cloudflare"),
    provider_type: String(row.provider_type || "chat"),
    account_email: String(row.account_email || ""),
    project_name: String(row.project_name || ""),
    default_model: String(row.default_model || ""),
    supported_models: parseJsonArray<string>(row.supported_models_json),
    endpoint_override: String(row.endpoint_override || ""),
    notes: String(row.notes || ""),
    enabled: row.enabled === true || row.enabled === 1 || row.enabled === "1",
    priority: Number(row.priority || 50),
    requests_per_minute: Number(row.requests_per_minute || 10),
    max_input_chars: Number(row.max_input_chars || 1200),
    max_completion_tokens: Number(row.max_completion_tokens || 1800),
    timeout_ms: Number(row.timeout_ms || 18_000),
    cooldown_seconds: Number(row.cooldown_seconds || 20),
    last_status: String(row.last_status || "untested"),
    last_error: String(row.last_error || ""),
    last_checked_at: String(row.last_checked_at || ""),
    created_at: String(row.created_at || ""),
    updated_at: String(row.updated_at || ""),
    has_key: Boolean(encrypted),
    key_masked: encrypted ? "stored" : "",
  }
}

export async function listAiProviderConfigs() {
  await ensureDatabase()
  const result = await query(
    `SELECT * FROM ai_provider_configs
     ORDER BY enabled DESC, priority ASC, provider ASC, created_at DESC`,
  )
  return result.rows.map(serializeAiProvider)
}

export async function getAiProviderAdminState() {
  const providers = await listAiProviderConfigs()
  return {
    items: providers,
    summary: buildProviderAdminSummary(providers),
  }
}

export interface RuntimeAiProviderConfig {
  id: string
  name: string
  provider: AiProviderKey
  providerType: "chat" | "embed" | "gateway"
  endpoint: string
  model: string
  apiKey: string
  priority: number
  requestsPerMinute: number
  maxInputChars: number
  maxCompletionTokens: number
  timeoutMs: number
  cooldownSeconds: number
}

export async function listRuntimeAiProviderConfigs(kind: "chat" | "embed" = "chat") {
  await ensureDatabase()
  const rows = (await query(
    `SELECT * FROM ai_provider_configs
     WHERE enabled = 1
       AND provider_type IN ($1, 'gateway')
       AND api_key_encrypted IS NOT NULL
       AND api_key_encrypted != ''
     ORDER BY priority ASC, updated_at DESC, created_at DESC`,
    [kind],
  )).rows
  const providers: RuntimeAiProviderConfig[] = []
  for (const row of rows) {
    const provider = String(row.provider || "") as AiProviderKey
    const apiKey = await decryptProviderSecret(String(row.api_key_encrypted || "")).catch(() => "")
    if (!apiKey) continue
    providers.push({
      id: String(row.id),
      name: String(row.name || provider),
      provider,
      providerType: (String(row.provider_type || "chat") as RuntimeAiProviderConfig["providerType"]),
      endpoint: String(row.endpoint_override || ""),
      model: String(row.default_model || ""),
      apiKey,
      priority: Number(row.priority || 50),
      requestsPerMinute: Number(row.requests_per_minute || 10),
      maxInputChars: Number(row.max_input_chars || 1200),
      maxCompletionTokens: Number(row.max_completion_tokens || 1800),
      timeoutMs: Number(row.timeout_ms || 18_000),
      cooldownSeconds: Number(row.cooldown_seconds || 20),
    })
  }
  return providers
}

export async function recordAiProviderRuntimeStatus(id: string, status: "ok" | "error", message = "") {
  await ensureDatabase()
  await query(
    "UPDATE ai_provider_configs SET last_status = $1, last_error = $2, last_checked_at = now(), updated_at = now() WHERE id = $3",
    [status, status === "ok" ? "" : message.slice(0, 500), id],
  )
}

export async function saveAiProviderConfig(user: User, input: ProviderConfigInput & { id?: string }) {
  await ensureDatabase()
  if (user.role !== "admin") throw new Error("Admin access required.")
  const normalized = normalizeProviderConfigInput(input)
  const existing = input.id
    ? (await query("SELECT * FROM ai_provider_configs WHERE id = $1 LIMIT 1", [input.id])).rows[0]
    : null
  const encryptedKey = normalized.apiKey
    ? await encryptProviderSecret(normalized.apiKey)
    : String(existing?.api_key_encrypted || "")
  if (!encryptedKey) throw new Error("API key is required.")
  const id = String(input.id || createId("provider"))
  await query(
    `INSERT INTO ai_provider_configs (
       id, name, provider, env_key, default_model, enabled, provider_type, account_email, project_name,
       api_key_encrypted, supported_models_json, endpoint_override, notes, priority, requests_per_minute,
       max_input_chars, max_completion_tokens, timeout_ms, cooldown_seconds, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14, $15, $16, $17, $18, $19, now())
     ON CONFLICT (id) DO UPDATE
     SET name = EXCLUDED.name,
         provider = EXCLUDED.provider,
         env_key = EXCLUDED.env_key,
         default_model = EXCLUDED.default_model,
         enabled = EXCLUDED.enabled,
         provider_type = EXCLUDED.provider_type,
         account_email = EXCLUDED.account_email,
         project_name = EXCLUDED.project_name,
         api_key_encrypted = EXCLUDED.api_key_encrypted,
         supported_models_json = EXCLUDED.supported_models_json,
         endpoint_override = EXCLUDED.endpoint_override,
         notes = EXCLUDED.notes,
         priority = EXCLUDED.priority,
         requests_per_minute = EXCLUDED.requests_per_minute,
         max_input_chars = EXCLUDED.max_input_chars,
         max_completion_tokens = EXCLUDED.max_completion_tokens,
         timeout_ms = EXCLUDED.timeout_ms,
         cooldown_seconds = EXCLUDED.cooldown_seconds,
         updated_at = now()`,
    [
      id,
      normalized.name,
      normalized.provider,
      `${normalized.provider.toUpperCase()}_API_KEY`,
      normalized.defaultModel,
      normalized.enabled ? 1 : 0,
      normalized.providerType,
      normalized.accountEmail || null,
      normalized.projectName || null,
      encryptedKey,
      JSON.stringify(normalized.supportedModels),
      normalized.endpointOverride || null,
      normalized.notes || null,
      normalized.priority,
      normalized.requestsPerMinute,
      normalized.maxInputChars,
     normalized.maxCompletionTokens,
     normalized.timeoutMs,
     normalized.cooldownSeconds,
    ],
  )
  await query(
    `UPDATE ai_provider_configs
     SET created_by_id = COALESCE(created_by_id, $1),
         created_by_name = COALESCE(created_by_name, $2)
     WHERE id = $3`,
    [user.id, user.name, id],
  )
  await logAudit({ userId: user.id, action: input.id ? "update" : "create", entity: "ai_provider_config", entityId: id })
  return serializeAiProvider((await query("SELECT * FROM ai_provider_configs WHERE id = $1 LIMIT 1", [id])).rows[0] || {})
}

export async function deleteAiProviderConfig(user: User, id: string) {
  await ensureDatabase()
  if (user.role !== "admin") throw new Error("Admin access required.")
  await query("DELETE FROM ai_provider_configs WHERE id = $1", [id])
  await logAudit({ userId: user.id, action: "delete", entity: "ai_provider_config", entityId: id })
}

export async function testAiProviderConfig(user: User, id: string) {
  await ensureDatabase()
  if (user.role !== "admin") throw new Error("Admin access required.")
  const row = (await query("SELECT * FROM ai_provider_configs WHERE id = $1 LIMIT 1", [id])).rows[0]
  if (!row) throw new Error("AI provider not found.")
  const decrypted = await decryptProviderSecret(String(row.api_key_encrypted || ""))
  const status = decrypted ? "ok" : "error"
  const message = decrypted
    ? `Provider ${row.provider || row.name} has a stored key ${maskProviderSecret(decrypted)}.`
    : "Provider API key is not available."
  await query(
    "UPDATE ai_provider_configs SET last_status = $1, last_error = $2, last_checked_at = now(), updated_at = now() WHERE id = $3",
    [status, status === "ok" ? "" : message, id],
  )
  await logAudit({ userId: user.id, action: "test", entity: "ai_provider_config", entityId: id, details: { status } })
  return { success: status === "ok", message }
}

function parseJsonValue<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value.trim()) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function normalizeKnowledgeNode(row: Record<string, unknown>): KnowledgeNode & Record<string, unknown> {
  return {
    ...row,
    id: String(row.id),
    title: String(row.title),
    type: String(row.source_type || "concept") as KnowledgeNode["type"],
    mastery: Number(row.mastery || 0),
    visibility: String(row.visibility || "private") as KnowledgeNode["visibility"],
    position: {
      x: Number(row.position_x || 0),
      y: Number(row.position_y || 0),
      z: Number(row.position_z || 0),
    },
    metadata: parseJsonObject(row.metadata),
  }
}

function normalizeKnowledgeEdge(row: Record<string, unknown>): KnowledgeEdge & Record<string, unknown> {
  return {
    ...row,
    id: String(row.id),
    sourceId: String(row.source_node_id || row.sourceId),
    targetId: String(row.target_node_id || row.targetId),
    type: String(row.edge_type || "related") as KnowledgeEdge["type"],
    strength: Number(row.strength || 0.5),
    metadata: parseJsonObject(row.metadata),
  }
}

async function seedKnowledgeGraphForUser(user: User) {
  const existing = await query("SELECT count(*) AS count FROM knowledge_nodes WHERE user_id = $1", [user.id])
  if (Number(existing.rows[0]?.count || 0) > 0) return

  const notes = (await listNotes(user)).slice(0, 5)
  await insertRows(
    "knowledge_nodes",
    [
      "id", "user_id", "workspace_id", "source_type", "source_id", "title", "summary", "mastery",
      "visibility", "position_x", "position_y", "position_z", "metadata",
    ],
    notes.map((note, index) => [
      `node_${note.id}`,
      user.id,
      "workspace_demo",
      "note",
      note.id,
      note.title,
      note.content.slice(0, 220),
      Math.min(0.9, 0.35 + index * 0.12),
      note.favorite ? "connections" : "private",
      Math.cos(index) * 120,
      Math.sin(index) * 90,
      0,
      JSON.stringify({ icon: note.icon, tags: note.tags || [] }),
    ]),
    ["metadata"],
    "ON CONFLICT (id) DO NOTHING",
  )

  if (notes.length >= 2) {
    await insertRows(
      "knowledge_edges",
      ["id", "user_id", "workspace_id", "source_node_id", "target_node_id", "edge_type", "strength", "created_by"],
      notes.slice(1).map((note, index) => [
        createId("edge"),
        user.id,
        "workspace_demo",
        `node_${notes[index].id}`,
        `node_${note.id}`,
        "related",
        Math.max(0.35, 0.8 - (index + 1) * 0.08),
        "ai-suggested",
      ]),
      [],
      "ON CONFLICT (source_node_id, target_node_id, edge_type) DO NOTHING",
    )
  }
}

async function seedReviewItemsForUser(user: User) {
  const existing = await query("SELECT count(*) AS count FROM review_items WHERE user_id = $1", [user.id])
  if (Number(existing.rows[0]?.count || 0) > 0) return

  const notes = (await listNotes(user)).slice(0, 6)
  await insertRows(
    "review_items",
    [
      "id", "user_id", "source_type", "source_id", "title", "prompt", "answer", "difficulty",
      "stability", "retrievability", "due_at", "metadata",
    ],
    notes.map((note, index) => [
      createId("review"),
      user.id,
      "note",
      note.id,
      note.title,
      `Explain the central idea in "${note.title}".`,
      note.content.slice(0, 500),
      0.45 + index * 0.04,
      2 + index,
      0.9 - index * 0.08,
      new Date(Date.now() - index * 60 * 60 * 1000).toISOString(),
      JSON.stringify({ icon: note.icon, reviewableBlock: true }),
    ]),
    ["metadata"],
    "ON CONFLICT (user_id, source_type, source_id) DO NOTHING",
  )
}

async function seedMicroLessons(user: User) {
  const existing = await query("SELECT count(*) AS count FROM micro_lessons")
  if (Number(existing.rows[0]?.count || 0) > 0) return

  const lessons = [
    {
      id: "lesson_spaced_repetition",
      title: "Why spaced repetition works",
      summary: "A compact lesson on retrieval, timing, and why reviews should feel slightly effortful.",
      tags: ["memory", "study"],
      question: "What makes a review most useful?",
      choices: [
        { id: "a", text: "Seeing the answer immediately" },
        { id: "b", text: "Trying to recall before seeing the answer" },
        { id: "c", text: "Reviewing every card every day" },
      ],
      correct: "b",
    },
    {
      id: "lesson_graph_connections",
      title: "Turn notes into a graph",
      summary: "Connect concepts as prerequisites, examples, contradictions, or extensions.",
      tags: ["knowledge graph", "notes"],
      question: "Which edge type means one idea must come before another?",
      choices: [
        { id: "a", text: "related" },
        { id: "b", text: "prerequisite" },
        { id: "c", text: "extends" },
      ],
      correct: "b",
    },
    {
      id: "lesson_serendipity",
      title: "Serendipity prevents learning tunnels",
      summary: "A small slice of outside-topic material keeps curiosity alive without hijacking focus.",
      tags: ["discovery", "feed"],
      question: "Why keep a serendipity slot in the feed?",
      choices: [
        { id: "a", text: "To force random content only" },
        { id: "b", text: "To surface useful adjacent ideas" },
        { id: "c", text: "To remove user controls" },
      ],
      correct: "b",
    },
  ]

  await insertRows(
    "micro_lessons",
    [
      "id", "creator_user_id", "title", "summary", "duration_seconds", "topic_tags", "question",
      "choices", "correct_choice_id", "explanation",
    ],
    lessons.map((lesson) => [
      lesson.id,
      user.id,
      lesson.title,
      lesson.summary,
      90,
      JSON.stringify(lesson.tags),
      lesson.question,
      JSON.stringify(lesson.choices),
      lesson.correct,
      "Save the lesson to your Vault and connect it to one note.",
    ]),
    ["topic_tags", "choices"],
    "ON CONFLICT (id) DO NOTHING",
  )
}

export async function getVaultGraph(user: User) {
  await ensureDatabase()
  await seedKnowledgeGraphForUser(user)
  const [nodesResult, edgesResult] = await Promise.all([
    query("SELECT * FROM knowledge_nodes WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 160", [user.id]),
    query("SELECT * FROM knowledge_edges WHERE user_id = $1 ORDER BY created_at DESC LIMIT 240", [user.id]),
  ])
  const nodes = nodesResult.rows.map(normalizeKnowledgeNode)
  const edges = edgesResult.rows.map(normalizeKnowledgeEdge)
  return {
    nodes,
    edges,
    orphanNodes: detectOrphanKnowledgeNodes(nodes, edges),
  }
}

export async function saveVaultBlock(user: User, input: Record<string, unknown>) {
  await ensureDatabase()
  const noteId = String(input.noteId || input.note_id || "")
  const blockType = String(input.blockType || input.block_type || "text")
  const content = typeof input.content === "object" && input.content ? input.content : { text: String(input.content || "") }
  const id = String(input.id || createId("block"))
  await assertNoteBlockOwnership(user, input.id, noteId)
  await query(
    `INSERT INTO note_blocks (id, note_id, block_type, content, sort_order)
     VALUES ($1, $2, $3, $4::jsonb, $5)
     ON CONFLICT (id) DO UPDATE SET block_type = EXCLUDED.block_type, content = EXCLUDED.content, sort_order = EXCLUDED.sort_order`,
    [id, noteId, blockType, JSON.stringify(content), Number(input.sortOrder || input.sort_order || 0)],
  )
  await logAudit({ userId: user.id, action: input.id ? "update" : "create", entity: "vault_block", entityId: id })
  return { id, noteId, blockType, content }
}

export async function listReviewSchedule(user: User) {
  await ensureDatabase()
  await seedReviewItemsForUser(user)
  const rows = (await query(
    `SELECT * FROM review_items
     WHERE user_id = $1
     ORDER BY due_at ASC
     LIMIT 120`,
    [user.id],
  )).rows
  const preferences = user.preferences || {}
  const items: ReviewItem[] = rows.map((row) => {
    const metadata = parseJsonObject(row.metadata)
    return {
      id: String(row.id),
      title: String(row.title),
      sourceType: String(row.source_type || "note") as ReviewItem["sourceType"],
      dueAt: String(row.due_at),
      difficulty: Number(row.difficulty || 0.5),
      stability: Number(row.stability || 2),
      retrievability: Number(row.retrievability || 0.9),
      prompt: String(row.prompt || ""),
      answer: String(row.answer || ""),
      topic: String(metadata.topic || ""),
    }
  })
  return buildReviewSchedule({
    items,
    now: new Date(),
    dailyCap: Number(preferences.dailyReviewCap || 30),
    restDay: String(preferences.restDay || "") as Weekday,
  })
}

export async function createPracticeReviewItems(user: User, input: Record<string, unknown>) {
  await ensureDatabase()
  const cards = Array.isArray(input.items) ? input.items : []
  const dueAt = new Date().toISOString()
  const created = []

  // Deliberately left as a per-row loop rather than folded into `insertRows`.
  // The conflict target is `(user_id, source_type, source_id)`, and `sourceId`
  // comes straight from the request body with no de-duplication, so two cards
  // in one call can collide on it. A multi-row upsert makes the winner among
  // colliding rows engine-defined; the sequential form is unambiguously
  // last-wins. Collapsing this would be a behaviour change, not an optimisation.
  for (const card of cards) {
    if (!card || typeof card !== "object") continue
    const record = card as Record<string, unknown>
    const sourceId = String(record.sourceId || record.source_id || "").trim()
    const prompt = String(record.prompt || "").trim()
    if (!sourceId || !prompt) continue
    const id = createId("review")
    const title = String(record.title || "Practice mistake").slice(0, 160)
    const answer = String(record.answer || "").slice(0, 2000)
    const topic = String(record.topic || "General").slice(0, 80)
    await query(
      `INSERT INTO review_items (
         id, user_id, source_type, source_id, title, prompt, answer, difficulty, stability, retrievability, due_at, metadata
       )
       VALUES ($1, $2, 'practice_mistake', $3, $4, $5, $6, 0.7, 1.5, 0.55, $7, $8::jsonb)
       ON CONFLICT (user_id, source_type, source_id) DO UPDATE SET
         title = EXCLUDED.title,
         prompt = EXCLUDED.prompt,
         answer = EXCLUDED.answer,
         due_at = EXCLUDED.due_at,
         retrievability = 0.45,
         updated_at = now()`,
      [id, user.id, sourceId, title, prompt, answer, dueAt, JSON.stringify({ topic, source: "practice" })],
    )
    created.push({ sourceId, title, topic })
  }

  if (created.length) {
    await logAudit({ userId: user.id, action: "create", entity: "review_items", entityId: "practice_mistakes", details: { count: created.length } })
  }
  return { created, count: created.length }
}

export async function createPracticeReviewItemsFromSession(user: User, sessionId: string) {
  await ensureDatabase()
  const session = await query(
    "SELECT id FROM practice_sessions WHERE id = $1 AND user_id = $2 LIMIT 1",
    [sessionId, user.id],
  )
  if (!session.rowCount) return { created: [], count: 0 }

  const result = await query(
    `SELECT question_id, prompt, answer, user_answer, correct, elapsed_ms, metadata
     FROM practice_session_items
     WHERE session_id = $1 AND correct = 0
     ORDER BY created_at ASC
     LIMIT 20`,
    [sessionId],
  )
  const items = result.rows.map((row) => ({
    questionId: row.question_id ? String(row.question_id) : undefined,
    prompt: String(row.prompt || ""),
    answer: String(row.answer || ""),
    userAnswer: String(row.user_answer || ""),
    correct: false,
    elapsedMs: Number(row.elapsed_ms || 0),
    metadata: parseJsonObject(row.metadata),
  }))
  const cards = buildReviewCardsFromPracticeItems({ sessionId, items })
  return createPracticeReviewItems(user, { items: cards })
}

export async function recordReviewResult(user: User, input: Record<string, unknown>) {
  await ensureDatabase()
  const id = String(input.id || input.reviewItemId || "")
  const rating = String(input.rating || "good")
  const nextIntervalDays = rating === "again" ? 1 : rating === "hard" ? 2 : rating === "easy" ? 7 : 4
  const nextDueAt = new Date(Date.now() + nextIntervalDays * 24 * 60 * 60 * 1000).toISOString()
  await query(
    `UPDATE review_items
     SET due_at = $1,
         last_reviewed_at = now(),
         review_count = review_count + 1,
         lapse_count = lapse_count + $2,
         retrievability = $3,
         updated_at = now()
     WHERE id = $4 AND user_id = $5`,
    [nextDueAt, rating === "again" ? 1 : 0, rating === "again" ? 0.35 : 0.9, id, user.id],
  )
  await query(
    "INSERT INTO review_logs (id, user_id, review_item_id, rating, elapsed_ms, next_due_at) VALUES ($1, $2, $3, $4, $5, $6)",
    [createId("reviewlog"), user.id, id, rating, Number(input.elapsedMs || input.elapsed_ms || 0), nextDueAt],
  )
  const today = new Date().toISOString().slice(0, 10)
  const streak = updateLearningStreak({
    current: Number((user as unknown as Record<string, unknown>).streak_current || 0),
    longest: Number((user as unknown as Record<string, unknown>).streak_longest || 0),
    freezesAvailable: Number((user as unknown as Record<string, unknown>).streak_freezes_available || 0),
    lastActivityDate: String((user as unknown as Record<string, unknown>).last_learning_activity_at || "").slice(0, 10),
    today,
    restDay: String(user.preferences?.restDay || "") as Weekday,
  })
  await query(
    "UPDATE users SET streak_current = $1, streak_longest = $2, streak_freezes_available = $3, xp_total = COALESCE(xp_total, 0) + 8, last_learning_activity_at = $4 WHERE id = $5",
    [streak.current, streak.longest, streak.freezesAvailable, today, user.id],
  )
  await logAudit({ userId: user.id, action: "complete", entity: "review_item", entityId: id, details: { rating } })
  return { nextDueAt, streak }
}

export async function listFeed(user: User, topics: string[] = []) {
  await ensureDatabase()
  await seedMicroLessons(user)
  const rows = (await query(
    `SELECT ml.*,
       COALESCE((SELECT count(*) FROM feed_interactions fi WHERE fi.lesson_id = ml.id), 0) AS interaction_count
     FROM micro_lessons ml
     WHERE ml.status = 'published'
     ORDER BY ml.updated_at DESC
     LIMIT 120`,
  )).rows
  const candidates: FeedLessonCandidate[] = rows.map((row) => ({
    id: String(row.id),
    title: String(row.title),
    topicTags: parseJsonArray<string>(row.topic_tags),
    durationSeconds: Number(row.duration_seconds || 90),
    readinessScore: 0.5 + Math.min(0.4, Number(row.interaction_count || 0) / 100),
  }))
  const preferredTopics = topics.length ? topics : parseJsonArray<string>(user.preferences?.feedTopics).concat(["study", "notes"])
  const topicKey = feedTopicKey(preferredTopics)
  const now = new Date()
  const lessonsById = new Map(candidates.map((candidate) => [candidate.id, candidate]))
  const cacheRows = (await query(
    `SELECT lesson_id, topic_key, reason, rank_score, topic_tags, expires_at
     FROM feed_rank_cache
     WHERE user_id = $1 AND topic_key = $2 AND expires_at > datetime('now')
     ORDER BY rank_score DESC
     LIMIT 12`,
    [user.id, topicKey],
  )).rows
  const cacheEntries: FeedRankCacheEntry[] = cacheRows.map((row) => ({
    lessonId: String(row.lesson_id),
    topicKey: String(row.topic_key || ""),
    reason: row.reason === "serendipity" ? "serendipity" : "preferred",
    rankScore: Number(row.rank_score || 0),
    topicTags: parseJsonArray<string>(row.topic_tags),
    expiresAt: String(row.expires_at),
  }))
  const selected = selectCachedFeedLessons({ cacheEntries, lessonsById, now, count: 12, fallbackTopics: preferredTopics })
  if (cacheEntries.length < selected.length) {
    await refreshFeedRankCache(user.id, topicKey, selected, now)
  }
  return selected.map((item) => {
    const source = rows.find((row) => row.id === item.id) || {}
    return {
      ...source,
      ...item,
      topic_tags: item.topicTags,
      choices: parseJsonArray(source.choices),
    }
  })
}

async function refreshFeedRankCache(userId: string, topicKey: string, selected: ReturnType<typeof selectCachedFeedLessons>, now: Date) {
  await query("DELETE FROM feed_rank_cache WHERE user_id = $1 AND topic_key = $2", [userId, topicKey])
  const entries = buildFeedRankCacheEntries({ userId, selected, topicKey, now })
  await insertRows(
    "feed_rank_cache",
    ["id", "user_id", "lesson_id", "topic_key", "reason", "rank_score", "topic_tags", "expires_at"],
    entries.map((entry) => [
      entry.id,
      entry.userId,
      entry.lessonId,
      entry.topicKey,
      entry.reason,
      entry.rankScore,
      JSON.stringify(entry.topicTags),
      entry.expiresAt,
    ]),
    ["topic_tags"],
    `ON CONFLICT (user_id, lesson_id, topic_key) DO UPDATE
     SET reason = EXCLUDED.reason,
         rank_score = EXCLUDED.rank_score,
         topic_tags = EXCLUDED.topic_tags,
         expires_at = EXCLUDED.expires_at,
         created_at = datetime('now')`,
  )
}

export async function recordFeedInteraction(user: User, input: Record<string, unknown>) {
  await ensureDatabase()
  const id = createId("feed")
  await query(
    `INSERT INTO feed_interactions (id, user_id, lesson_id, action, correct, saved_to_vault, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [
      id,
      user.id,
      String(input.lessonId || input.lesson_id || ""),
      String(input.action || "viewed"),
      input.correct ? 1 : 0,
      input.savedToVault || input.saved_to_vault ? 1 : 0,
      JSON.stringify(input.metadata || {}),
    ],
  )
  await query("UPDATE users SET xp_total = COALESCE(xp_total, 0) + $1 WHERE id = $2", [input.correct ? 6 : 2, user.id])
  await logAudit({ userId: user.id, action: "create", entity: "feed_interaction", entityId: id })
  return { id }
}

export async function listAchievements(user: User) {
  await ensureDatabase()
  const result = await query(
    `SELECT a.*, ua.unlocked_at
     FROM achievements a
     LEFT JOIN user_achievements ua ON ua.achievement_id = a.id AND ua.user_id = $1
     ORDER BY ua.unlocked_at DESC, a.created_at ASC`,
    [user.id],
  )
  if (result.rowCount) return result.rows.map((row) => ({ ...row, criteria: parseJsonObject(row.criteria), unlocked: Boolean(row.unlocked_at) }))
  const seeded = [
    ["ach_first_review", "First Review", "Complete your first Vault review.", "repeat", 20],
    ["ach_graph_seed", "Graph Seed", "Create your first knowledge edge.", "network", 30],
    ["ach_feed_answer", "Curiosity Spark", "Answer a feed lesson question.", "sparkles", 15],
  ]
  await insertRows(
    "achievements",
    ["id", "name", "description", "icon", "xp_reward", "criteria"],
    seeded.map(([id, name, description, icon, xp]) => [id, name, description, icon, xp, JSON.stringify({ seeded: true })]),
    ["criteria"],
    "ON CONFLICT (id) DO NOTHING",
  )
  return listAchievements(user)
}

export async function getPublicProfile(username: string, viewer: "public" | "connections" | "owner" = "public") {
  await ensureDatabase()
  const result = await query("SELECT id, username, name, bio, avatar_url, preferences, xp_total, streak_current, streak_longest, reputation, profile_visibility FROM users WHERE username = $1 LIMIT 1", [username])
  const row = result.rows[0]
  if (!row) return null
  const preferences = parseJsonObject(row.preferences)
  const nodes = (await query("SELECT * FROM knowledge_nodes WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 80", [row.id])).rows.map(normalizeKnowledgeNode)
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    bio: row.bio || "",
    avatar_url: row.avatar_url || "",
    profile_visibility: row.profile_visibility || "private",
    social_links: {
      facebook: preferenceLink(preferences.facebookUrl),
      intro: preferenceLink(preferences.introUrl),
      website: preferenceLink(preferences.websiteUrl),
    },
    metrics: {
      xp: Number(row.xp_total || 0),
      ...calculateLevelFromXp(Number(row.xp_total || 0)),
      streak: Number(row.streak_current || 0),
      longestStreak: Number(row.streak_longest || 0),
      reputation: Number(row.reputation || 0),
    },
    artifacts: filterPublicProfileArtifacts(nodes, viewer),
  }
}

function preferenceLink(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

export async function listLearningSpaces(user: User) {
  await ensureDatabase()
  const result = await query(
    `SELECT ls.*,
       (SELECT count(*) FROM learning_space_members lsm WHERE lsm.space_id = ls.id) AS member_count
     FROM learning_spaces ls
     WHERE ls.visibility = 'public' OR ls.owner_user_id = $1 OR $2 = 'admin'
     ORDER BY ls.updated_at DESC
     LIMIT 80`,
    [user.id, user.role],
  )
  return result.rows.map((row) => ({ ...row, topic_tags: parseJsonArray(row.topic_tags), settings: parseJsonObject(row.settings) }))
}

export async function saveLearningSpace(user: User, input: Record<string, unknown>) {
  await ensureDatabase()
  const id = String(input.id || createId("space"))
  await assertOwnership(user, "learning_spaces", input.id, "owner_user_id")
  await query(
    `INSERT INTO learning_spaces (id, workspace_id, owner_user_id, name, description, visibility, topic_tags, settings, updated_at)
     VALUES ($1, 'workspace_demo', $2, $3, $4, $5, $6::jsonb, $7::jsonb, now())
     ON CONFLICT (id) DO UPDATE
     SET name = EXCLUDED.name,
         description = EXCLUDED.description,
         visibility = EXCLUDED.visibility,
         topic_tags = EXCLUDED.topic_tags,
         settings = EXCLUDED.settings,
         updated_at = now()`,
    [
      id,
      user.id,
      String(input.name || "Learning Space").trim(),
      String(input.description || ""),
      String(input.visibility || "private"),
      JSON.stringify(Array.isArray(input.topicTags) ? input.topicTags : input.topic_tags || []),
      JSON.stringify(input.settings || {}),
    ],
  )
  await query(
    "INSERT INTO learning_space_members (space_id, user_id, role) VALUES ($1, $2, 'owner') ON CONFLICT (space_id, user_id) DO NOTHING",
    [id, user.id],
  )
  await logAudit({ userId: user.id, action: input.id ? "update" : "create", entity: "learning_space", entityId: id })
  const savedSpace = (await query("SELECT * FROM learning_spaces WHERE id = $1 LIMIT 1", [id])).rows[0]
  return savedSpace ? ({ ...savedSpace, topic_tags: parseJsonArray(savedSpace.topic_tags), settings: parseJsonObject(savedSpace.settings) } as Record<string, unknown>) : savedSpace
}

export async function deleteLearningSpace(user: User, id: string) {
  await ensureDatabase()
  await query("DELETE FROM learning_spaces WHERE id = $1 AND (owner_user_id = $2 OR $3 = 'admin')", [id, user.id, user.role])
  await logAudit({ userId: user.id, action: "delete", entity: "learning_space", entityId: id })
}

export async function listStudyRooms(user: User) {
  await ensureDatabase()
  const result = await query(
    `SELECT sr.*,
       (SELECT count(*) FROM study_battles sb WHERE sb.room_id = sr.id) AS battle_count
     FROM study_rooms sr
     WHERE sr.owner_user_id = $1 OR $2 = 'admin' OR sr.status = 'open'
     ORDER BY sr.updated_at DESC
     LIMIT 80`,
    [user.id, user.role],
  )
  return result.rows.map((row) => ({ ...row, presence: parseJsonArray(row.presence) }))
}

export async function saveStudyRoom(user: User, input: Record<string, unknown>) {
  await ensureDatabase()
  const id = String(input.id || createId("room"))
  await assertOwnership(user, "study_rooms", input.id, "owner_user_id")
  await query(
    `INSERT INTO study_rooms (id, space_id, owner_user_id, name, mode, pomodoro_minutes, break_minutes, status, presence, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, now())
     ON CONFLICT (id) DO UPDATE
     SET name = EXCLUDED.name,
         mode = EXCLUDED.mode,
         pomodoro_minutes = EXCLUDED.pomodoro_minutes,
         break_minutes = EXCLUDED.break_minutes,
         status = EXCLUDED.status,
         presence = EXCLUDED.presence,
         updated_at = now()`,
    [
      id,
      input.spaceId || input.space_id || null,
      user.id,
      String(input.name || "Focus Room").trim(),
      String(input.mode || "focus"),
      Number(input.pomodoroMinutes || input.pomodoro_minutes || 25),
      Number(input.breakMinutes || input.break_minutes || 5),
      String(input.status || "open"),
      JSON.stringify(Array.isArray(input.presence) ? input.presence : []),
    ],
  )
  await logAudit({ userId: user.id, action: input.id ? "update" : "create", entity: "study_room", entityId: id })
  const savedRoom = (await query("SELECT * FROM study_rooms WHERE id = $1 LIMIT 1", [id])).rows[0]
  return savedRoom ? ({ ...savedRoom, presence: parseJsonArray(savedRoom.presence) } as Record<string, unknown>) : savedRoom
}

export async function deleteStudyRoom(user: User, id: string) {
  await ensureDatabase()
  await query("DELETE FROM study_rooms WHERE id = $1 AND (owner_user_id = $2 OR $3 = 'admin')", [id, user.id, user.role])
  await logAudit({ userId: user.id, action: "delete", entity: "study_room", entityId: id })
}

export async function listStudyBattles(user: User) {
  await ensureDatabase()
  const result = await query(
    `SELECT * FROM study_battles
     WHERE owner_user_id = $1 OR $2 = 'admin' OR status IN ('waiting', 'active')
     ORDER BY updated_at DESC
     LIMIT 80`,
    [user.id, user.role],
  )
  return result.rows.map((row) => ({ ...row, question_set: parseJsonArray(row.question_set), leaderboard: parseJsonArray(row.leaderboard) }))
}

export async function saveStudyBattle(user: User, input: Record<string, unknown>) {
  await ensureDatabase()
  const id = String(input.id || createId("battle"))
  await assertOwnership(user, "study_battles", input.id, "owner_user_id")
  await query(
    `INSERT INTO study_battles (id, room_id, owner_user_id, title, topic, mode, status, question_set, leaderboard, started_at, ended_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11, now())
     ON CONFLICT (id) DO UPDATE
     SET title = EXCLUDED.title,
         topic = EXCLUDED.topic,
         mode = EXCLUDED.mode,
         status = EXCLUDED.status,
         question_set = EXCLUDED.question_set,
         leaderboard = EXCLUDED.leaderboard,
         started_at = EXCLUDED.started_at,
         ended_at = EXCLUDED.ended_at,
         updated_at = now()`,
    [
      id,
      input.roomId || input.room_id || null,
      user.id,
      String(input.title || "Study Battle").trim(),
      String(input.topic || "General"),
      String(input.mode || "solo"),
      String(input.status || "waiting"),
      JSON.stringify(Array.isArray(input.questionSet) ? input.questionSet : input.question_set || []),
      JSON.stringify(Array.isArray(input.leaderboard) ? input.leaderboard : []),
      input.startedAt || input.started_at || null,
      input.endedAt || input.ended_at || null,
    ],
  )
  await logAudit({ userId: user.id, action: input.id ? "update" : "create", entity: "study_battle", entityId: id })
  const savedBattle = (await query("SELECT * FROM study_battles WHERE id = $1 LIMIT 1", [id])).rows[0]
  return savedBattle ? { ...savedBattle, question_set: parseJsonArray(savedBattle.question_set), leaderboard: parseJsonArray(savedBattle.leaderboard) } : savedBattle
}

export async function deleteStudyBattle(user: User, id: string) {
  await ensureDatabase()
  await query("DELETE FROM study_battles WHERE id = $1 AND (owner_user_id = $2 OR $3 = 'admin')", [id, user.id, user.role])
  await logAudit({ userId: user.id, action: "delete", entity: "study_battle", entityId: id })
}

export async function upsertUserConnection(user: User, input: Record<string, unknown>) {
  await ensureDatabase()
  const normalized = normalizeConnectionInput({
    requesterUserId: user.id,
    targetUserId: String(input.targetUserId || input.target_user_id || ""),
    connectionType: String(input.connectionType || input.connection_type || "follow"),
    status: String(input.status || "accepted"),
  })
  await query(
    `INSERT INTO user_connections (requester_user_id, target_user_id, connection_type, status, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (requester_user_id, target_user_id, connection_type) DO UPDATE
     SET status = EXCLUDED.status,
         updated_at = now()`,
    [
      normalized.requesterUserId,
      normalized.targetUserId,
      normalized.connectionType,
      normalized.status,
    ],
  )
  await logAudit({
    userId: user.id,
    action: "upsert",
    entity: "user_connection",
    entityId: normalized.targetUserId,
    details: { connectionType: normalized.connectionType, status: normalized.status },
  })
  return normalized
}

export async function listUserConnections(user: User) {
  await ensureDatabase()
  const result = await query(
    `SELECT uc.*, u.username, u.name, u.avatar_url
     FROM user_connections uc
     JOIN users u ON u.id = uc.target_user_id
     WHERE uc.requester_user_id = $1
     ORDER BY uc.updated_at DESC
     LIMIT 100`,
    [user.id],
  )
  return result.rows
}

export async function deleteUserConnection(user: User, input: Record<string, unknown>) {
  await ensureDatabase()
  const targetUserId = String(input.targetUserId || input.target_user_id || "").trim()
  const connectionType = String(input.connectionType || input.connection_type || "follow") === "friend" ? "friend" : "follow"
  if (!targetUserId) throw new Error("A target user is required.")
  await query(
    `DELETE FROM user_connections
     WHERE requester_user_id = $1
       AND target_user_id = $2
       AND connection_type = $3`,
    [user.id, targetUserId, connectionType],
  )
  await logAudit({
    userId: user.id,
    action: "delete",
    entity: "user_connection",
    entityId: targetUserId,
    details: { connectionType },
  })
}

export async function recordSocialAction(user: User, input: Record<string, unknown>) {
  await ensureDatabase()
  const normalized = normalizeSocialActionInput(input)
  const id = createId("social")
  await query(
    `INSERT INTO social_actions (id, actor_user_id, target_type, target_id, action_type, body, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [
      id,
      user.id,
      normalized.targetType,
      normalized.targetId,
      normalized.actionType,
      normalized.body,
      JSON.stringify(normalized.metadata),
    ],
  )
  await logAudit({ userId: user.id, action: "create", entity: "social_action", entityId: id })
  return { id }
}

export async function listSocialActions(user: User, input: { targetType?: string | null; targetId?: string | null; limit?: number } = {}) {
  await ensureDatabase()
  const limit = Math.min(50, Math.max(1, Math.floor(Number(input.limit) || 12)))
  const params: unknown[] = []
  const conditions: string[] = []

  if (user.role !== "admin") {
    params.push(user.id)
    conditions.push(`sa.actor_user_id = $${params.length}`)
  }

  const targetType = input.targetType ? normalizeSocialTargetType(input.targetType) : null
  const targetId = String(input.targetId || "").trim()
  if (targetType && targetId) {
    params.push(targetType)
    conditions.push(`sa.target_type = $${params.length}`)
    params.push(targetId)
    conditions.push(`sa.target_id = $${params.length}`)
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""
  const result = await query(
    `SELECT sa.*, u.name AS actor_name, u.username AS actor_username
     FROM social_actions sa
     LEFT JOIN users u ON u.id = sa.actor_user_id
     ${where}
     ORDER BY sa.created_at DESC
     LIMIT ${limit}`,
    params,
  )
  return result.rows.map((row) => ({ ...row, metadata: parseJsonObject(row.metadata) }))
}

export async function listModerationItems(user: User) {
  await ensureDatabase()
  if (user.role !== "admin") return []
  const result = await query("SELECT * FROM moderation_items ORDER BY created_at DESC LIMIT 100")
  return result.rows
}

export async function saveModerationItem(user: User, input: Record<string, unknown>) {
  await ensureDatabase()
  const id = String(input.id || createId("mod"))
  await assertOwnership(user, "moderation_items", input.id, "reporter_user_id")
  await query(
    `INSERT INTO moderation_items (id, reporter_user_id, target_type, target_id, reason, status, notes, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now())
     ON CONFLICT (id) DO UPDATE
     SET status = EXCLUDED.status,
         notes = EXCLUDED.notes,
         updated_at = now()`,
    [
      id,
      user.id,
      String(input.targetType || input.target_type || "feed"),
      String(input.targetId || input.target_id || ""),
      String(input.reason || "Needs review"),
      String(input.status || "open"),
      String(input.notes || ""),
    ],
  )
  await logAudit({ userId: user.id, action: input.id ? "update" : "create", entity: "moderation_item", entityId: id })
  return (await query("SELECT * FROM moderation_items WHERE id = $1 LIMIT 1", [id])).rows[0]
}

export async function saveAiTurn(input: {
  user: User
  chatId?: string
  prompt: string
  response: string
  provider?: string | null
  model?: string | null
  status: string
}) {
  await ensureDatabase()
  const chatId = input.chatId || createId("chat")
  await query(
    `INSERT INTO ai_chats (id, user_id, title, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (id) DO UPDATE SET updated_at = now()`,
    [chatId, input.user.id, input.prompt.slice(0, 64) || "AI Tutor Chat"],
  )
  await query(
    `INSERT INTO ai_messages (id, chat_id, role, content, provider, model)
     VALUES ($1, $2, 'user', $3, $4, $5), ($6, $2, 'assistant', $7, $4, $5)`,
    [
      createId("msg"),
      chatId,
      input.prompt,
      input.provider || null,
      input.model || null,
      createId("msg"),
      input.response,
    ],
  )
  await query(
    `INSERT INTO ai_response_logs (id, user_id, provider, model, prompt, response, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      createId("ailog"),
      input.user.id,
      input.provider || null,
      input.model || null,
      input.prompt,
      input.response,
      input.status,
    ],
  )
  return { chatId }
}
