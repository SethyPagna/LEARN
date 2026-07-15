/**
 * A DM's realtime channel key must be something both participants can compute
 * on their own, before any message (and therefore before any chat_threads row)
 * exists. Sorting the two user ids gives a stable, symmetric key.
 */
export function dmChatChannelId(userIdA: string, userIdB: string) {
  return [userIdA, userIdB].sort().join("__")
}

export function groupChatChannelId(groupId: string) {
  return `group__${groupId}`
}

export type ParsedChatChannel =
  | { kind: "dm"; userIds: [string, string] }
  | { kind: "group"; groupId: string }
  | null

export function parseChatChannel(channelId: string): ParsedChatChannel {
  if (!channelId) return null
  if (channelId.startsWith("group__")) {
    const groupId = channelId.slice("group__".length)
    return groupId ? { kind: "group", groupId } : null
  }
  const parts = channelId.split("__")
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null
  return { kind: "dm", userIds: [parts[0], parts[1]] }
}

/**
 * Authorization check for the "chat" realtime kind. A DM channel id is just
 * the two participants' ids joined together (by design — both sides need to
 * compute it independently, with no server round trip), so anyone who knew
 * both ids could otherwise derive someone else's channel id and connect to
 * it; a group channel id only reveals the group id, so membership has to be
 * checked against the database instead.
 *
 * `isGroupMember` is injected because the two callers (the Worker's
 * WebSocket upgrade, and the Next.js REST fallback) reach D1 through
 * different mechanisms (a raw binding vs. the shared query() abstraction).
 */
export async function isAuthorizedForChatChannel(
  channelId: string,
  userId: string,
  isGroupMember: (groupId: string, userId: string) => Promise<boolean>,
) {
  if (!channelId || !userId) return false
  const parsed = parseChatChannel(channelId)
  if (!parsed) return false
  if (parsed.kind === "dm") return parsed.userIds[0] === userId || parsed.userIds[1] === userId
  return isGroupMember(parsed.groupId, userId)
}
