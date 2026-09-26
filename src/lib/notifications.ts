import { query } from "./db"
import { broadcastToInboxes } from "./realtime-broadcast"
import { createId } from "./schema"

/**
 * Notifications: what the bell in the top bar shows.
 *
 * Only the server writes them, as a side effect of something real happening to
 * the person (a connection request, a mention, a missed call). Each write also
 * pushes a live copy to the owner's realtime inbox, so an open tab updates its
 * badge without polling. If the push fails the row is still there on the next
 * load; the database is the source of truth, the push is a courtesy.
 */

export const notificationKinds = [
  "connection-request",
  "connection-accepted",
  "group-added",
  "mention",
  "message",
  "missed-call",
  "share",
  "game-invite",
  "story-reply",
  "system",
] as const

export type NotificationKind = (typeof notificationKinds)[number]

export interface NotificationItem {
  id: string
  kind: NotificationKind
  title: string
  body: string
  link: string
  actorUserId: string | null
  actorName: string | null
  actorAvatarUrl: string | null
  metadata: Record<string, unknown>
  createdAt: string
  readAt: string | null
}

export interface CreateNotificationInput {
  userId: string
  kind: NotificationKind
  title: string
  body?: string
  link?: string
  actorUserId?: string | null
  /** Unread rows sharing a key are folded into one (the newest wins). */
  groupKey?: string
  metadata?: Record<string, unknown>
}

const MAX_TITLE = 140
const MAX_BODY = 280

function clip(value: unknown, max: number) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/** Only in-app paths are allowed as links; anything else is dropped. */
export function sanitizeNotificationLink(link: unknown) {
  const value = String(link ?? "").trim()
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return ""
  return value.slice(0, 300)
}

function parseMetadata(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>
  if (typeof value !== "string" || !value) return {}
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function toItem(row: Record<string, unknown>): NotificationItem {
  return {
    id: String(row.id),
    kind: (notificationKinds as readonly string[]).includes(String(row.kind)) ? (row.kind as NotificationKind) : "system",
    title: String(row.title || ""),
    body: String(row.body || ""),
    link: String(row.link || ""),
    actorUserId: row.actor_user_id ? String(row.actor_user_id) : null,
    actorName: row.actor_name ? String(row.actor_name) : null,
    actorAvatarUrl: row.actor_avatar_url ? String(row.actor_avatar_url) : null,
    metadata: parseMetadata(row.metadata),
    createdAt: String(row.created_at || ""),
    readAt: row.read_at ? String(row.read_at) : null,
  }
}

async function readNotification(userId: string, id: string) {
  const result = await query(
    `SELECT n.*, u.name AS actor_name, u.avatar_url AS actor_avatar_url
     FROM notifications n
     LEFT JOIN users u ON u.id = n.actor_user_id
     WHERE n.id = $1 AND n.user_id = $2
     LIMIT 1`,
    [id, userId],
  )
  return result.rows[0] ? toItem(result.rows[0]) : null
}

export async function createNotification(input: CreateNotificationInput): Promise<NotificationItem | null> {
  const userId = String(input.userId || "").trim()
  const title = clip(input.title, MAX_TITLE)
  if (!userId || !title) return null
  // Nobody is notified about their own action.
  if (input.actorUserId && input.actorUserId === userId) return null

  const now = new Date().toISOString()
  const body = clip(input.body, MAX_BODY)
  const link = sanitizeNotificationLink(input.link)
  const metadata = JSON.stringify(input.metadata ?? {})
  const groupKey = input.groupKey ? String(input.groupKey).slice(0, 160) : null

  let id = ""
  if (groupKey) {
    const existing = await query(
      "SELECT id FROM notifications WHERE user_id = $1 AND group_key = $2 AND read_at IS NULL ORDER BY created_at DESC LIMIT 1",
      [userId, groupKey],
    )
    const existingId = existing.rows[0]?.id
    if (existingId) {
      id = String(existingId)
      await query(
        `UPDATE notifications SET kind = $1, title = $2, body = $3, link = $4, actor_user_id = $5, metadata = $6, created_at = $7
         WHERE id = $8 AND user_id = $9`,
        [input.kind, title, body, link, input.actorUserId || null, metadata, now, id, userId],
      )
    }
  }
  if (!id) {
    id = createId("ntf")
    await query(
      `INSERT INTO notifications (id, user_id, kind, title, body, link, actor_user_id, group_key, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [id, userId, input.kind, title, body, link, input.actorUserId || null, groupKey, metadata, now],
    )
  }

  const item = await readNotification(userId, id)
  if (item) void broadcastToInboxes([userId], { type: "notification", payload: { item } }).catch(() => undefined)
  return item
}

export async function listNotifications(userId: string, options: { limit?: number; unreadOnly?: boolean } = {}) {
  const limit = Math.min(100, Math.max(1, Math.floor(options.limit ?? 40)))
  const result = await query(
    `SELECT n.*, u.name AS actor_name, u.avatar_url AS actor_avatar_url
     FROM notifications n
     LEFT JOIN users u ON u.id = n.actor_user_id
     WHERE n.user_id = $1 ${options.unreadOnly ? "AND n.read_at IS NULL" : ""}
     ORDER BY n.created_at DESC
     LIMIT ${limit}`,
    [userId],
  )
  const unread = await query("SELECT count(*) AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL", [userId])
  return {
    items: result.rows.map(toItem),
    unreadCount: Number(unread.rows[0]?.count || 0),
  }
}

export async function markNotificationsRead(userId: string, input: { ids?: string[]; all?: boolean; read?: boolean }) {
  const readAt = input.read === false ? null : new Date().toISOString()
  if (input.all) {
    await query("UPDATE notifications SET read_at = $1 WHERE user_id = $2 AND (read_at IS NULL OR $1 IS NULL)", [readAt, userId])
    return
  }
  const ids = (input.ids ?? []).map(String).filter(Boolean).slice(0, 100)
  for (const id of ids) {
    await query("UPDATE notifications SET read_at = $1 WHERE id = $2 AND user_id = $3", [readAt, id, userId])
  }
}

export async function deleteNotification(userId: string, id: string) {
  await query("DELETE FROM notifications WHERE id = $1 AND user_id = $2", [id, userId])
}
