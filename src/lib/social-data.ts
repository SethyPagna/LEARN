import type { User } from "./data"
import { broadcastChatThreadChange, isChatThreadParticipant } from "./data"
import { query } from "./db"
import { createId, ensureDatabase } from "./schema"
import { isReactionEmoji, MAX_SOCIAL_MEDIA_BYTES, STORY_LIFETIME_MS, validateStoryInput, type MessageReaction, type SocialStory } from "./social-media"

// $1 is the viewer and $2 is server time. Blocking overrides friends/groups;
// ownership remains readable, and expired rows never confer file access.
const VISIBLE_STORY = `s.expires_at > $2 AND (
  s.owner_user_id = $1 OR (
    NOT EXISTS (SELECT 1 FROM user_connections blocked WHERE blocked.status = 'blocked'
      AND ((blocked.requester_user_id = s.owner_user_id AND blocked.target_user_id = $1)
        OR (blocked.requester_user_id = $1 AND blocked.target_user_id = s.owner_user_id)))
    AND (
      (s.audience = 'friends' AND EXISTS (SELECT 1 FROM user_connections friend
        WHERE friend.connection_type = 'friend' AND friend.status = 'accepted'
          AND ((friend.requester_user_id = s.owner_user_id AND friend.target_user_id = $1)
            OR (friend.requester_user_id = $1 AND friend.target_user_id = s.owner_user_id))))
      OR (s.audience = 'group' AND EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id = s.group_id AND gm.user_id = $1)
        AND EXISTS (SELECT 1 FROM group_members author WHERE author.group_id = s.group_id AND author.user_id = s.owner_user_id))
    )
  )
)`

function storyFromRow(row: Record<string, unknown>): SocialStory {
  return {
    id: String(row.id), ownerUserId: String(row.owner_user_id), ownerName: String(row.owner_name || "Learner"),
    body: String(row.body || ""), fileId: row.file_id ? String(row.file_id) : null,
    audience: row.audience as SocialStory["audience"], groupId: row.group_id ? String(row.group_id) : null,
    createdAt: String(row.created_at), expiresAt: String(row.expires_at),
  }
}

export async function listStories(user: User): Promise<SocialStory[]> {
  await ensureDatabase()
  const rows = await query(`SELECT s.*, u.name AS owner_name FROM social_stories s JOIN users u ON u.id = s.owner_user_id
    WHERE ${VISIBLE_STORY} ORDER BY s.created_at DESC, s.id DESC LIMIT 100`, [user.id, new Date().toISOString()])
  return rows.rows.map(storyFromRow)
}

export async function createStory(user: User, raw: Record<string, unknown>): Promise<SocialStory> {
  await ensureDatabase()
  const input = validateStoryInput(raw)
  if (input.groupId) {
    const membership = await query("SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2 LIMIT 1", [input.groupId, user.id])
    if (!membership.rows[0]) throw new Error("You must belong to the story's group.")
  }
  if (input.fileId) {
    const owned = await query("SELECT content_type, size_bytes FROM media_assets WHERE id = $1 AND owner_user_id = $2 LIMIT 1", [input.fileId, user.id])
    const file = owned.rows[0]
    if (!file || !/^image\/(png|jpeg|webp|gif|avif)$/.test(String(file.content_type)) || Number(file.size_bytes) > MAX_SOCIAL_MEDIA_BYTES) {
      throw new Error("Choose a PNG, JPEG, WebP, GIF or AVIF picture you uploaded, under 20 MB.")
    }
  }
  const createdAt = new Date().toISOString()
  const expiresAt = new Date(Date.now() + STORY_LIFETIME_MS).toISOString()
  const id = createId("story")
  await query(`INSERT INTO social_stories (id, owner_user_id, body, file_id, audience, group_id, created_at, expires_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [id, user.id, input.body, input.fileId, input.audience, input.groupId, createdAt, expiresAt])
  return { id, ownerUserId: user.id, ownerName: user.name, ...input, createdAt, expiresAt }
}

export async function deleteStory(user: User, id: string) {
  const result = await query("DELETE FROM social_stories WHERE id = $1 AND owner_user_id = $2", [id, user.id])
  if (!result.rowCount) throw new Error("Story not found or you do not own it.")
}

export async function isFileSharedViaStory(fileId: string, user: User) {
  const result = await query(`SELECT 1 FROM social_stories s
    JOIN media_assets a ON a.id = s.file_id AND a.owner_user_id = s.owner_user_id
    WHERE s.file_id = $3 AND ${VISIBLE_STORY} LIMIT 1`, [user.id, new Date().toISOString(), fileId])
  return Boolean(result.rows[0])
}

export async function listChatReactions(user: User, threadId: string): Promise<Record<string, MessageReaction[]>> {
  if (!(await isChatThreadParticipant(user, threadId))) throw new Error("You don't have access to this conversation.")
  const result = await query(`SELECT r.message_id, r.emoji, count(*) AS total, MAX(CASE WHEN r.user_id = $2 THEN 1 ELSE 0 END) AS mine
    FROM chat_message_reactions r JOIN chat_messages m ON m.id = r.message_id
    WHERE m.thread_id = $1 AND m.id IN (SELECT id FROM chat_messages WHERE thread_id = $1 ORDER BY created_at DESC, id DESC LIMIT 200)
    GROUP BY r.message_id, r.emoji`, [threadId, user.id])
  const reactions: Record<string, MessageReaction[]> = {}
  for (const row of result.rows) {
    if (isReactionEmoji(row.emoji)) (reactions[String(row.message_id)] ||= []).push({ emoji: row.emoji, count: Number(row.total), mine: Boolean(row.mine) })
  }
  return reactions
}

export async function setChatReaction(user: User, raw: Record<string, unknown>) {
  if (!isReactionEmoji(raw.emoji) || typeof raw.active !== "boolean" || typeof raw.messageId !== "string") throw new Error("Choose a message and a supported reaction.")
  const message = await query("SELECT thread_id FROM chat_messages WHERE id = $1 LIMIT 1", [raw.messageId])
  const threadId = String(message.rows[0]?.thread_id || "")
  if (!threadId || !(await isChatThreadParticipant(user, threadId))) throw new Error("You don't have access to this conversation.")
  if (raw.active) {
    await query("INSERT INTO chat_message_reactions (message_id, user_id, emoji) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [raw.messageId, user.id, raw.emoji])
  } else {
    await query("DELETE FROM chat_message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3", [raw.messageId, user.id, raw.emoji])
  }
  await broadcastChatThreadChange(threadId, user.id)
  return { threadId }
}
