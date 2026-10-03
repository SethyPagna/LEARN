export const CHAT_REACTION_EMOJI = ["👍", "❤️", "😂", "🎉", "🤔", "👀"] as const
export type ChatReactionEmoji = typeof CHAT_REACTION_EMOJI[number]
export const CHAT_STICKERS = ["📚", "🧠", "✨", "🎉", "💡", "🔥", "🚀", "💪"] as const
export const STORY_LIFETIME_MS = 24 * 60 * 60 * 1000
export const MAX_STORY_TEXT = 500
export const MAX_SOCIAL_MEDIA_BYTES = 20 * 1024 * 1024
export const MAX_VOICE_SECONDS = 120

export interface MessageReaction { emoji: ChatReactionEmoji; count: number; mine: boolean }
export interface SocialStory {
  id: string
  ownerUserId: string
  ownerName: string
  body: string
  fileId: string | null
  audience: "private" | "friends" | "group"
  groupId: string | null
  createdAt: string
  expiresAt: string
}

export function isReactionEmoji(value: unknown): value is ChatReactionEmoji {
  return (CHAT_REACTION_EMOJI as readonly unknown[]).includes(value)
}

export function validateStoryInput(input: Record<string, unknown>): Pick<SocialStory, "body" | "fileId" | "audience" | "groupId"> {
  const body = typeof input.body === "string" ? input.body.trim() : ""
  const fileId = typeof input.fileId === "string" ? input.fileId.trim() : ""
  if (!body && !fileId) throw new Error("Add text or a picture to your story.")
  if (body.length > MAX_STORY_TEXT) throw new Error(`Keep stories under ${MAX_STORY_TEXT} characters.`)
  const audience = input.audience
  if (audience !== "private" && audience !== "friends" && audience !== "group") throw new Error("Choose who can see this story.")
  const groupId = typeof input.groupId === "string" ? input.groupId.trim() : ""
  if (audience === "group" && !groupId) throw new Error("Choose a group for this story.")
  if (audience !== "group" && groupId) throw new Error("Only group stories can specify a group.")
  return { body, fileId: fileId || null, audience, groupId: audience === "group" ? groupId : null }
}
