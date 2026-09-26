export type ChatDestination =
  | { kind: "thread"; threadId: string }
  | { kind: "group"; groupId: string }
  | { kind: "dm"; targetUserId: string }
  | { kind: "personal" }

export function chatDestinationPayload(destination: ChatDestination) {
  switch (destination.kind) {
    case "thread": return { threadId: destination.threadId }
    case "group": return { groupId: destination.groupId }
    case "dm": return { targetUserId: destination.targetUserId }
    case "personal": return {}
  }
}

export interface ConversationThread {
  id?: string
  threadId?: string
  thread_id?: string
  group_id?: string | null
  dm_peer_id?: string | null
}

export function conversationThreadId(thread: ConversationThread) {
  return String(thread.id || thread.threadId || thread.thread_id || "")
}

/** An explicit destination never falls back to a different conversation. */
export function selectConversationThread<T extends ConversationThread>(threads: readonly T[], destination: ChatDestination): T | null {
  switch (destination.kind) {
    case "thread": return threads.find((thread) => conversationThreadId(thread) === destination.threadId) || null
    case "group": return threads.find((thread) => thread.group_id === destination.groupId) || null
    case "dm": return threads.find((thread) => !thread.group_id && thread.dm_peer_id === destination.targetUserId) || null
    case "personal": return null
  }
}
