export const realtimeKinds = ["rooms", "battles", "presence"] as const
export const collaborationEventTypes = ["presence", "pomodoro", "battle-answer", "editor-change", "snapshot"] as const

export type RealtimeKind = typeof realtimeKinds[number]
export type CollaborationEventType = typeof collaborationEventTypes[number]
export type CollaborationSessionType = "editor" | "room" | "battle" | "presence"

export interface CollaborationEventPayload {
  type: CollaborationEventType
  userId?: string
  payload: Record<string, unknown>
}

export interface CollaborationEventValidation {
  ok: boolean
  event?: CollaborationEventPayload
  error?: string
}

export interface CollaborationEventParseResult {
  ok: boolean
  input?: unknown
  error?: string
}

const maxPayloadBytes = 16 * 1024
const allowedPomodoroStatuses = new Set(["start", "pause", "resume", "complete", "reset", "tick"])

export function isRealtimeKind(value: string): value is RealtimeKind {
  return (realtimeKinds as readonly string[]).includes(value)
}

export function sessionTypeForRealtimeKind(kind: RealtimeKind): CollaborationSessionType {
  if (kind === "rooms") return "room"
  if (kind === "battles") return "battle"
  return "presence"
}

export function collaborationSessionId(kind: RealtimeKind, channelId: string) {
  const safeChannel = channelId.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 96) || "channel"
  return `collab_${kind}_${safeChannel}`
}

export function shouldPersistCollaborationEvent(type: CollaborationEventType) {
  return type !== "presence"
}

function payloadSize(value: unknown) {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

function cleanString(value: unknown, maxLength = 160) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : ""
}

function objectPayload(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export function validateCollaborationEvent(input: unknown): CollaborationEventValidation {
  const parsedInput = parseCollaborationEventInput(input)
  if (!parsedInput.ok) return { ok: false, error: parsedInput.error }
  const parsed = parsedInput.input
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, error: "Message must be a JSON object." }
  if (payloadSize(parsed) > maxPayloadBytes) return { ok: false, error: "Message is too large." }

  const record = parsed as Record<string, unknown>
  const type = cleanString(record.type, 48) as CollaborationEventType
  if (!(collaborationEventTypes as readonly string[]).includes(type)) return { ok: false, error: "Unsupported realtime event type." }

  const payload = objectPayload(record.payload)
  const userId = cleanString(record.userId || record.user_id, 120) || undefined

  if (type === "presence") {
    const count = Number(record.count ?? payload.count)
    if (!Number.isFinite(count) || count < 0) return { ok: false, error: "Presence events require a non-negative count." }
    return { ok: true, event: { type, userId, payload: { count: Math.floor(count) } } }
  }

  if (type === "pomodoro") {
    const status = cleanString(record.status || payload.status, 32)
    if (!allowedPomodoroStatuses.has(status)) return { ok: false, error: "Pomodoro events require a valid status." }
    return {
      ok: true,
      event: {
        type,
        userId,
        payload: {
          status,
          minutes: Math.max(0, Math.min(240, Math.round(Number(record.minutes ?? payload.minutes ?? 25)))),
        },
      },
    }
  }

  if (type === "battle-answer") {
    const questionId = cleanString(record.questionId || record.question_id || payload.questionId || payload.question_id)
    const answerId = cleanString(record.answerId || record.answer_id || record.selectedAnswerId || record.selected_answer_id || payload.answerId || payload.answer_id)
    if (!questionId || !answerId) return { ok: false, error: "Battle answers require question and answer ids." }
    return { ok: true, event: { type, userId, payload: { questionId, answerId } } }
  }

  if (type === "editor-change") {
    const contentItemId = cleanString(record.contentItemId || record.content_item_id || payload.contentItemId || payload.content_item_id, 120)
    const operation = cleanString(record.operation || payload.operation, 80)
    if (!contentItemId || !operation) return { ok: false, error: "Editor changes require a content item and operation." }
    return {
      ok: true,
      event: {
        type,
        userId,
        payload: {
          contentItemId,
          operation,
          clientMutationId: cleanString(record.clientMutationId || record.client_mutation_id || payload.clientMutationId || payload.client_mutation_id, 120),
        },
      },
    }
  }

  const summary = cleanString(record.summary || payload.summary, 500)
  return { ok: true, event: { type, userId, payload: { summary, ...payload } } }
}

export function parseCollaborationEventInput(input: unknown): CollaborationEventParseResult {
  if (typeof input !== "string") return { ok: true, input }
  try {
    return { ok: true, input: JSON.parse(input) as unknown }
  } catch {
    return { ok: false, error: "Message must be valid JSON." }
  }
}
