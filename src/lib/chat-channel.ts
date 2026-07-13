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

/**
 * Authorization check for the "chat" realtime kind: since the DM channel id is
 * just the two participants' ids joined together (by design — both sides need
 * to compute it independently, with no server round trip), anyone who knows
 * both user ids could otherwise derive someone else's channel id and connect
 * to it. This confirms the requesting user is actually one of the two named
 * participants before the WebSocket upgrade or REST forward is allowed through.
 *
 * Group channels aren't given a membership check here yet (group chat isn't
 * wired up in the product surface), so we only require authentication for
 * those — same as before this check existed.
 */
export function isAuthorizedForChatChannel(channelId: string, userId: string) {
  if (!channelId || !userId) return false
  if (channelId.startsWith("group__")) return true
  const parts = channelId.split("__")
  if (parts.length !== 2) return false
  return parts[0] === userId || parts[1] === userId
}
