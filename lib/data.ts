import { cookies } from "next/headers"
import { buildProviderAdminSummary, decryptProviderSecret, encryptProviderSecret, maskProviderSecret, normalizeProviderConfigInput, type ProviderConfigInput } from "./ai/provider-admin"
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
import { normalizeConnectionInput, normalizeSocialActionInput, normalizeSocialTargetType } from "./sharing"
import { blankDeckTitle, blankDocTitle, blankSheetTitle } from "./studio-defaults"

export const SESSION_COOKIE = "learn_session"
const DEFAULT_WORKSPACE_ID = "workspace_demo"

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

function normalizeQuizQuestion(row: Record<string, unknown>) {
  return {
    ...row,
    choices: parseJsonArray(row.choices),
  }
}

export async function getCurrentUserFromToken(token?: string) {
  await ensureDatabase()
  const value = token?.trim()
  if (!value) return null

  const result = await query(
    `SELECT u.*
     FROM user_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()
     LIMIT 1`,
    [await hashSessionToken(value)],
  )
  if (!result.rows[0]) return null

  await query("UPDATE user_sessions SET last_seen_at = now() WHERE token_hash = $1", [await hashSessionToken(value)])
  return normalizeUser(result.rows[0])
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
       ORDER BY n.updated_at DESC
       LIMIT 8`,
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

export async function listNotes(status: ArchiveListStatus = "active") {
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
     WHERE ${archiveClause}
     ORDER BY n.favorite DESC, n.updated_at DESC`,
  )
  return result.rows.map(normalizeNote)
}

export async function getNote(id: string) {
  await ensureDatabase()
  const result = await query<NoteRecord>("SELECT * FROM notes WHERE id = $1 AND archived_at IS NULL LIMIT 1", [id])
  return result.rows[0] ? normalizeNote(result.rows[0]) : null
}

export async function saveNote(user: User, input: Partial<NoteRecord> & { title: string; content: string }) {
  await ensureDatabase()
  const id = input.id || createId("note")
  const workspaceId = "workspace_demo"
  const existing = input.id ? await getNote(input.id) : null
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
  return getNote(id)
}

export async function deleteNote(user: User, id: string) {
  await ensureDatabase()
  await query("UPDATE notes SET archived_at = now(), updated_at = now() WHERE id = $1", [id])
  await archiveContentItemForSource("notes", id)
  await logAudit({ userId: user.id, action: "delete", entity: "note", entityId: id })
}

export async function restoreNote(user: User, id: string) {
  await ensureDatabase()
  await query("UPDATE notes SET archived_at = NULL, updated_at = now() WHERE id = $1", [id])
  await restoreContentItemForSource("notes", id)
  await logAudit({ userId: user.id, action: "restore", entity: "note", entityId: id })
  return getNote(id)
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
  return getCurrentUserFromToken((await cookies()).get(SESSION_COOKIE)?.value)
}

export async function updatePreferences(user: User, preferences: Record<string, unknown>) {
  await ensureDatabase()
  const nextPreferences = { ...user.preferences, ...preferences }
  await query("UPDATE users SET preferences = $1::jsonb, updated_at = now() WHERE id = $2", [JSON.stringify(nextPreferences), user.id])
  await logAudit({ userId: user.id, action: "update", entity: "preferences", entityId: user.id })
  return nextPreferences
}

export async function listAuditLogs(user: User) {
  await ensureDatabase()
  const result = user.role === "admin"
    ? await query("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 120")
    : await query("SELECT * FROM audit_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 80", [user.id])
  return result.rows.map((row) => ({ ...row, details: parseJsonObject(row.details) }))
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
  return result.rows
}

export async function saveCalendarEvent(user: User, input: Record<string, unknown>) {
  await ensureDatabase()
  const id = String(input.id || createId("event"))
  await query(
    `INSERT INTO calendar_events (id, workspace_id, owner_user_id, title, event_type, starts_at, ends_at, timezone, notes, linked_note_id, updated_at)
     VALUES ($1, 'workspace_demo', $2, $3, $4, $5, $6, $7, $8, $9, now())
     ON CONFLICT (id) DO UPDATE
     SET title = EXCLUDED.title,
         event_type = EXCLUDED.event_type,
         starts_at = EXCLUDED.starts_at,
         ends_at = EXCLUDED.ends_at,
         timezone = EXCLUDED.timezone,
         notes = EXCLUDED.notes,
         linked_note_id = EXCLUDED.linked_note_id,
         updated_at = now()`,
    [
      id,
      user.id,
      String(input.title || "Study block").trim(),
      String(input.eventType || input.event_type || "study"),
      String(input.startsAt || input.starts_at || new Date().toISOString()),
      String(input.endsAt || input.ends_at || new Date(Date.now() + 45 * 60 * 1000).toISOString()),
      String(input.timezone || "UTC"),
      String(input.notes || ""),
      input.linkedNoteId || input.linked_note_id || null,
    ],
  )
  await logAudit({ userId: user.id, action: input.id ? "update" : "create", entity: "calendar_event", entityId: id })
  return (await query("SELECT * FROM calendar_events WHERE id = $1 LIMIT 1", [id])).rows[0]
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
    ownerUserId: user.id,
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
  return (await query("SELECT * FROM editor_documents WHERE id = $1 LIMIT 1", [id])).rows[0]
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
    ownerUserId: user.id,
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
  return (await query("SELECT * FROM sheet_documents WHERE id = $1 LIMIT 1", [id])).rows[0]
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
    ownerUserId: user.id,
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
  return (await query("SELECT * FROM slide_decks WHERE id = $1 LIMIT 1", [id])).rows[0]
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
       (SELECT count(*) FROM group_members gm WHERE gm.group_id = g.id) AS member_count
     FROM workspace_groups g
     ORDER BY g.updated_at DESC
     LIMIT 80`,
    [user.id],
  )
  return result.rows
}

export async function saveGroup(user: User, input: Record<string, unknown>) {
  await ensureDatabase()
  const id = String(input.id || createId("group"))
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
       (SELECT body FROM chat_messages m WHERE m.thread_id = t.id ORDER BY m.created_at DESC LIMIT 1) AS last_message
     FROM chat_threads t
     WHERE t.created_by_user_id = $1
     ORDER BY t.updated_at DESC
     LIMIT 80`,
    [user.id],
  )
  return result.rows
}

export async function postChatMessage(user: User, input: Record<string, unknown>) {
  await ensureDatabase()
  const threadId = String(input.threadId || input.thread_id || createId("thread"))
  const title = String(input.title || "Study chat").trim()
  await query(
    `INSERT INTO chat_threads (id, workspace_id, group_id, title, created_by_user_id, updated_at)
     VALUES ($1, 'workspace_demo', $2, $3, $4, now())
     ON CONFLICT (id) DO UPDATE SET updated_at = now()`,
    [threadId, input.groupId || input.group_id || null, title, user.id],
  )
  const messageId = createId("chatmsg")
  await query(
    `INSERT INTO chat_messages (id, thread_id, user_id, body, metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [messageId, threadId, user.id, String(input.body || "").trim(), JSON.stringify(input.metadata || {})],
  )
  await logAudit({ userId: user.id, action: "create", entity: "chat_message", entityId: messageId })
  return { threadId, messageId }
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
  for (const item of draft.items) {
    await query(
      `INSERT INTO practice_session_items (
         id, session_id, question_id, review_item_id, content_item_id,
         prompt, answer, user_answer, correct, elapsed_ms, metadata
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)`,
      [
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
      ],
    )
  }
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

  const questionMap = new Map(quiz.questions.map((question: any) => [String(question.id), question]))
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
    questions: quiz.questions.map((question: Record<string, unknown>): PracticeSessionQuestion => ({
      id: String(question.id),
      question: String(question.question || ""),
      topic: String(question.topic || "General"),
      choices: parseJsonArray<{ id: string; text: string }>(question.choices),
      correct_answer_id: String(question.correct_answer_id || ""),
      explanation: String(question.explanation || ""),
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
  for (const answer of normalizedAnswers) {
    await query(
      `INSERT INTO quiz_attempt_answers (id, attempt_id, question_id, topic, selected_answer_id, correct)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [createId("answer"), attemptId, answer.questionId, answer.topic, answer.selectedAnswerId, answer.correct ? 1 : 0],
    )
  }
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

function serializeAiProvider(row: Record<string, unknown>) {
  const encrypted = String(row.api_key_encrypted || "")
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    provider_type: row.provider_type || "chat",
    account_email: row.account_email || "",
    project_name: row.project_name || "",
    default_model: row.default_model || "",
    supported_models: parseJsonArray(row.supported_models_json),
    endpoint_override: row.endpoint_override || "",
    notes: row.notes || "",
    enabled: row.enabled === true || row.enabled === 1 || row.enabled === "1",
    priority: Number(row.priority || 50),
    requests_per_minute: Number(row.requests_per_minute || 10),
    max_input_chars: Number(row.max_input_chars || 1200),
    max_completion_tokens: Number(row.max_completion_tokens || 1800),
    timeout_ms: Number(row.timeout_ms || 18_000),
    cooldown_seconds: Number(row.cooldown_seconds || 20),
    last_status: row.last_status || "untested",
    last_error: row.last_error || "",
    last_checked_at: row.last_checked_at || "",
    created_at: row.created_at,
    updated_at: row.updated_at,
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
    summary: buildProviderAdminSummary(providers as any),
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

  const notes = (await listNotes()).slice(0, 5)
  for (const [index, note] of notes.entries()) {
    await query(
      `INSERT INTO knowledge_nodes (
         id, user_id, workspace_id, source_type, source_id, title, summary, mastery, visibility,
         position_x, position_y, position_z, metadata
       )
       VALUES ($1, $2, 'workspace_demo', 'note', $3, $4, $5, $6, $7, $8, $9, 0, $10::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [
        `node_${note.id}`,
        user.id,
        note.id,
        note.title,
        note.content.slice(0, 220),
        Math.min(0.9, 0.35 + index * 0.12),
        note.favorite ? "connections" : "private",
        Math.cos(index) * 120,
        Math.sin(index) * 90,
        JSON.stringify({ icon: note.icon, tags: note.tags || [] }),
      ],
    )
  }

  if (notes.length >= 2) {
    for (let index = 1; index < notes.length; index += 1) {
      await query(
        `INSERT INTO knowledge_edges (id, user_id, workspace_id, source_node_id, target_node_id, edge_type, strength, created_by)
         VALUES ($1, $2, 'workspace_demo', $3, $4, 'related', $5, 'ai-suggested')
         ON CONFLICT (source_node_id, target_node_id, edge_type) DO NOTHING`,
        [createId("edge"), user.id, `node_${notes[index - 1].id}`, `node_${notes[index].id}`, Math.max(0.35, 0.8 - index * 0.08)],
      )
    }
  }
}

async function seedReviewItemsForUser(user: User) {
  const existing = await query("SELECT count(*) AS count FROM review_items WHERE user_id = $1", [user.id])
  if (Number(existing.rows[0]?.count || 0) > 0) return

  const notes = (await listNotes()).slice(0, 6)
  for (const [index, note] of notes.entries()) {
    await query(
      `INSERT INTO review_items (
         id, user_id, source_type, source_id, title, prompt, answer, difficulty, stability, retrievability, due_at, metadata
       )
       VALUES ($1, $2, 'note', $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
       ON CONFLICT (user_id, source_type, source_id) DO NOTHING`,
      [
        createId("review"),
        user.id,
        note.id,
        note.title,
        `Explain the central idea in "${note.title}".`,
        note.content.slice(0, 500),
        0.45 + index * 0.04,
        2 + index,
        0.9 - index * 0.08,
        new Date(Date.now() - index * 60 * 60 * 1000).toISOString(),
        JSON.stringify({ icon: note.icon, reviewableBlock: true }),
      ],
    )
  }
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

  for (const lesson of lessons) {
    await query(
      `INSERT INTO micro_lessons (
         id, creator_user_id, title, summary, duration_seconds, topic_tags, question, choices, correct_choice_id, explanation
       )
       VALUES ($1, $2, $3, $4, 90, $5::jsonb, $6, $7::jsonb, $8, $9)
       ON CONFLICT (id) DO NOTHING`,
      [
        lesson.id,
        user.id,
        lesson.title,
        lesson.summary,
        JSON.stringify(lesson.tags),
        lesson.question,
        JSON.stringify(lesson.choices),
        lesson.correct,
        "Save the lesson to your Vault and connect it to one note.",
      ],
    )
  }
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
  for (const entry of entries) {
    await query(
      `INSERT INTO feed_rank_cache (id, user_id, lesson_id, topic_key, reason, rank_score, topic_tags, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
       ON CONFLICT (user_id, lesson_id, topic_key) DO UPDATE
       SET reason = EXCLUDED.reason,
           rank_score = EXCLUDED.rank_score,
           topic_tags = EXCLUDED.topic_tags,
           expires_at = EXCLUDED.expires_at,
           created_at = datetime('now')`,
      [
        entry.id,
        entry.userId,
        entry.lessonId,
        entry.topicKey,
        entry.reason,
        entry.rankScore,
        JSON.stringify(entry.topicTags),
        entry.expiresAt,
      ],
    )
  }
}

export async function listMicroLessons(user: User) {
  await ensureDatabase()
  await seedMicroLessons(user)
  const result = await query("SELECT * FROM micro_lessons ORDER BY updated_at DESC LIMIT 100")
  return result.rows.map((row) => ({
    ...row,
    topic_tags: parseJsonArray(row.topic_tags),
    choices: parseJsonArray(row.choices),
  }))
}

export async function saveMicroLesson(user: User, input: Record<string, unknown>) {
  await ensureDatabase()
  const id = String(input.id || createId("lesson"))
  await query(
    `INSERT INTO micro_lessons (
       id, creator_user_id, title, summary, duration_seconds, topic_tags, question, choices,
       correct_choice_id, explanation, visibility, status, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb, $9, $10, $11, $12, now())
     ON CONFLICT (id) DO UPDATE
     SET title = EXCLUDED.title,
         summary = EXCLUDED.summary,
         duration_seconds = EXCLUDED.duration_seconds,
         topic_tags = EXCLUDED.topic_tags,
         question = EXCLUDED.question,
         choices = EXCLUDED.choices,
         correct_choice_id = EXCLUDED.correct_choice_id,
         explanation = EXCLUDED.explanation,
         visibility = EXCLUDED.visibility,
         status = EXCLUDED.status,
         updated_at = now()`,
    [
      id,
      user.id,
      String(input.title || "Untitled micro-lesson").trim(),
      String(input.summary || ""),
      Number(input.durationSeconds || input.duration_seconds || 90),
      JSON.stringify(Array.isArray(input.topicTags) ? input.topicTags : input.topic_tags || []),
      String(input.question || ""),
      JSON.stringify(Array.isArray(input.choices) ? input.choices : []),
      String(input.correctChoiceId || input.correct_choice_id || ""),
      String(input.explanation || ""),
      String(input.visibility || "public"),
      String(input.status || "published"),
    ],
  )
  const title = String(input.title || "Untitled micro-lesson").trim()
  const summary = String(input.summary || "")
  const visibility = String(input.visibility || "public")
  await upsertContentItemForSource({
    workspaceId: DEFAULT_WORKSPACE_ID,
    ownerUserId: user.id,
    itemType: "micro_lesson",
    sourceTable: "micro_lessons",
    sourceId: id,
    title,
    summary,
    visibility,
  })
  await logAudit({ userId: user.id, action: input.id ? "update" : "create", entity: "micro_lesson", entityId: id })
  return (await query("SELECT * FROM micro_lessons WHERE id = $1 LIMIT 1", [id])).rows[0]
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
  for (const [id, name, description, icon, xp] of seeded) {
    await query(
      "INSERT INTO achievements (id, name, description, icon, xp_reward, criteria) VALUES ($1, $2, $3, $4, $5, $6::jsonb) ON CONFLICT (id) DO NOTHING",
      [id, name, description, icon, xp, JSON.stringify({ seeded: true })],
    )
  }
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
  return (await query("SELECT * FROM learning_spaces WHERE id = $1 LIMIT 1", [id])).rows[0]
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
  return (await query("SELECT * FROM study_rooms WHERE id = $1 LIMIT 1", [id])).rows[0]
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
  return (await query("SELECT * FROM study_battles WHERE id = $1 LIMIT 1", [id])).rows[0]
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
