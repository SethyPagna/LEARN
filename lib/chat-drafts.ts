import type { ChatIntent } from "./social-features"

export const CHAT_DRAFT_KEY = "learn_chat_draft_v1"

export interface ChatDraft {
  body: string
  title: string
  intent: ChatIntent
  channel: string
  replyThreadId?: string
}

const CHAT_INTENTS: ChatIntent[] = ["update", "question", "win"]
const DEFAULT_CHAT_DRAFT: ChatDraft = {
  body: "",
  title: "Study room",
  intent: "update",
  channel: "#general",
}

export function parseStoredChatDraft(raw: string | null): ChatDraft | null {
  return normalizeChatDraft(parseJson(raw))
}

export function normalizeChatDraft(value: unknown): ChatDraft | null {
  if (!isRecord(value)) return null
  return {
    body: readString(value.body, DEFAULT_CHAT_DRAFT.body),
    title: readString(value.title, DEFAULT_CHAT_DRAFT.title),
    intent: normalizeIntent(value.intent),
    channel: normalizeChannel(value.channel),
    replyThreadId: readOptionalString(value.replyThreadId),
  }
}

export function serializeChatDraft(draft: ChatDraft): string {
  return JSON.stringify(normalizeChatDraft(draft) ?? DEFAULT_CHAT_DRAFT)
}

function parseJson(raw: string | null): unknown {
  if (!raw) return null
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

function normalizeIntent(value: unknown): ChatIntent {
  return typeof value === "string" && CHAT_INTENTS.includes(value as ChatIntent) ? value as ChatIntent : DEFAULT_CHAT_DRAFT.intent
}

function normalizeChannel(value: unknown): string {
  const channel = readString(value, DEFAULT_CHAT_DRAFT.channel).replace(/\s+/g, "-")
  return channel.startsWith("#") ? channel : `#${channel}`
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}
