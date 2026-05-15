export type ChatIntent = "update" | "question" | "win"
export type ChatThreadFilter = "all" | "questions" | "wins" | "saved"

export interface ChatThreadLike {
  id?: string
  title?: string
  last_message?: string | null
  lastMessage?: string | null
  updated_at?: string
  updatedAt?: string
}

export function parseThreadTitle(title = "") {
  const [maybeChannel, ...rest] = title.split(" - ")
  const channel = maybeChannel.startsWith("#") ? maybeChannel : "#general"
  return {
    channel,
    title: (channel === maybeChannel ? rest.join(" - ") : title).trim() || "Study thread",
  }
}

export function buildChatDraftPayload(input: {
  body: string
  channel: string
  title: string
  intent: ChatIntent
  threadId?: string
}) {
  const body = input.body.trim()
  const channel = input.channel.startsWith("#") ? input.channel : `#${input.channel}`
  const title = input.title.trim() || "Study room"
  return {
    threadId: input.threadId,
    title: `${channel} - ${title}`,
    body: `[${input.intent}] ${body}`,
    metadata: {
      channel,
      intent: input.intent,
      hasMention: /(^|\s)@\w+/.test(body),
      hasStudioLink: /\/(studio|notes|docs|sheets|slides)\b/.test(body),
    },
  }
}

export function filterChatThreads(threads: ChatThreadLike[], input: { query?: string; filter?: ChatThreadFilter }) {
  const query = input.query?.trim().toLowerCase() || ""
  const filter = input.filter || "all"

  return threads.filter((thread) => {
    const title = String(thread.title || "")
    const lastMessage = String(thread.last_message || thread.lastMessage || "")
    const haystack = `${title} ${lastMessage}`.toLowerCase()
    if (query && !haystack.includes(query)) return false
    if (filter === "all") return true
    if (filter === "questions") return haystack.includes("[question]") || haystack.includes("?")
    if (filter === "wins") return haystack.includes("[win]") || haystack.includes("#wins")
    return haystack.includes("[saved]") || haystack.includes(" saved ") || haystack.includes("bookmark")
  })
}
