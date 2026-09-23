import { isAuthorizedForChatChannel } from "../chat-channel"
import type { RealtimeKind } from "../collaboration-events"
import { query } from "../db"

async function isGroupMember(groupId: string, userId: string) {
  try {
    const result = await query("SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2 LIMIT 1", [groupId, userId])
    return Boolean(result.rows[0])
  } catch {
    return false
  }
}

/**
 * Who may open (or snapshot) a realtime channel. The Worker applies the same
 * rules at the socket upgrade; the local dev server borrows them by asking
 * the realtime route to authorize the upgrade.
 *
 *  - chat:  a DM's two participants, or a member of the group;
 *  - inbox: only its owner — it carries their notifications and call rings;
 *  - rooms, battles, presence: any signed-in user.
 */
export async function canAccessRealtimeChannel(kind: RealtimeKind, id: string, userId: string) {
  if (!id || !userId) return false
  if (kind === "chat") return isAuthorizedForChatChannel(id, userId, isGroupMember)
  if (kind === "inbox") return id === userId
  return true
}
