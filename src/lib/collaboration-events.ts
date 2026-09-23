export const realtimeKinds = ["rooms", "battles", "presence", "chat", "inbox"] as const
export const collaborationEventTypes = [
  "presence",
  "pomodoro",
  "battle-answer",
  "editor-change",
  "snapshot",
  "chat-message",
  "typing",
  "call-signal",
  "cursor",
  // Server-originated only (see clientMayEmit in lib/realtime/hub-core.ts):
  "chat-event",
  "call-ring",
  "notification",
  "game-state",
  "story-event",
] as const

/**
 * Event types an API route creates after persisting a change. They carry a
 * structured payload the route built itself, so validation only bounds their
 * size and shape; the transports refuse them from client sockets.
 */
export const serverOnlyEventTypes = ["chat-event", "call-ring", "notification", "game-state", "story-event"] as const

export type RealtimeKind = typeof realtimeKinds[number]
export type CollaborationEventType = typeof collaborationEventTypes[number]
export type CollaborationSessionType = "editor" | "room" | "battle" | "presence" | "chat"

/**
 * Call signaling vocabulary. offer/answer/ice-candidate carry WebRTC
 * negotiation between two devices (always addressed with `to`); join/leave
 * announce a device entering or leaving a (possibly group) call; ringing,
 * decline and busy answer an incoming ring; media-state shares mute/camera/
 * screen state so every tile can show it.
 */
export const callSignalKinds = ["offer", "answer", "ice-candidate", "hangup", "decline", "busy", "join", "leave", "ringing", "media-state"] as const
export type CallSignalKind = typeof callSignalKinds[number]

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

// WebRTC SDP blobs (especially for video, with many codec lines) can run a few
// KB; the default cap is generous for the small structured events but call
// signaling gets its own higher ceiling below.
const maxPayloadBytes = 48 * 1024
const allowedPomodoroStatuses = new Set(["start", "pause", "resume", "complete", "reset", "tick"])

export function isRealtimeKind(value: string): value is RealtimeKind {
  return (realtimeKinds as readonly string[]).includes(value)
}

export function sessionTypeForRealtimeKind(kind: RealtimeKind): CollaborationSessionType {
  if (kind === "rooms") return "room"
  if (kind === "battles") return "battle"
  if (kind === "chat") return "chat"
  return "presence"
}

export function isServerOnlyEventType(type: string) {
  return (serverOnlyEventTypes as readonly string[]).includes(type)
}

export function collaborationSessionId(kind: RealtimeKind, channelId: string) {
  const safeChannel = channelId.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 96) || "channel"
  return `collab_${kind}_${safeChannel}`
}

export function shouldPersistCollaborationEvent(type: CollaborationEventType) {
  if (isServerOnlyEventType(type)) return false
  return type !== "presence" && type !== "typing" && type !== "chat-message" && type !== "call-signal" && type !== "cursor"
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

  if (type === "chat-message") {
    const threadId = cleanString(record.threadId || record.thread_id || payload.threadId || payload.thread_id, 120)
    const messageId = cleanString(record.messageId || record.message_id || payload.messageId || payload.message_id, 120)
    const body = cleanString(record.body || payload.body, 4000)
    if (!threadId || !messageId) return { ok: false, error: "Chat messages require a thread and message id." }
    const rawAttachment = (record.attachment || payload.attachment) as Record<string, unknown> | undefined
    const attachment = rawAttachment && typeof rawAttachment === "object"
      ? {
          fileId: cleanString(rawAttachment.fileId || rawAttachment.file_id, 120),
          filename: cleanString(rawAttachment.filename, 200),
          contentType: cleanString(rawAttachment.contentType || rawAttachment.content_type, 120),
        }
      : undefined
    return {
      ok: true,
      event: {
        type,
        userId,
        payload: {
          threadId,
          messageId,
          body,
          createdAt: cleanString(record.createdAt || record.created_at || payload.createdAt || payload.created_at, 40),
          attachment: attachment?.fileId ? attachment : undefined,
        },
      },
    }
  }

  if (type === "typing") {
    const threadId = cleanString(record.threadId || record.thread_id || payload.threadId || payload.thread_id, 120)
    if (!threadId) return { ok: false, error: "Typing events require a thread id." }
    const isTyping = record.isTyping ?? record.is_typing ?? payload.isTyping ?? payload.is_typing
    return { ok: true, event: { type, userId, payload: { threadId, isTyping: isTyping !== false } } }
  }

  if (type === "call-signal") {
    const callId = cleanString(record.callId || record.call_id || payload.callId || payload.call_id, 80)
    const kind = cleanString(record.kind || payload.kind, 24) as CallSignalKind
    if (!callId) return { ok: false, error: "Call signals require a call id." }
    if (!(callSignalKinds as readonly string[]).includes(kind)) return { ok: false, error: "Unsupported call signal kind." }

    const video = Boolean(record.video ?? payload.video ?? false)
    // A video offer carrying audio, camera and screen transceivers runs well
    // past 12 KB of SDP in Chrome; the frame-level cap still bounds the total.
    const sdp = typeof (record.sdp ?? payload.sdp) === "string" ? cleanString(record.sdp ?? payload.sdp, 40000) : undefined
    const candidate = typeof (record.candidate ?? payload.candidate) === "string" ? cleanString(record.candidate ?? payload.candidate, 4000) : undefined

    if ((kind === "offer" || kind === "answer") && !sdp) return { ok: false, error: "Offer/answer signals require an sdp payload." }
    if (kind === "ice-candidate" && candidate === undefined) return { ok: false, error: "ICE candidate signals require a candidate payload." }

    const signalPayload: Record<string, unknown> = { callId, kind, video, sdp, candidate }
    if (kind === "media-state" || kind === "join") {
      const media = objectPayload(record.media ?? payload.media)
      signalPayload.media = {
        audio: media.audio !== false,
        video: Boolean(media.video),
        screen: Boolean(media.screen),
      }
    }
    const conversationId = cleanString(record.conversationId ?? payload.conversationId, 120)
    if (conversationId) signalPayload.conversationId = conversationId
    const name = cleanString(record.name ?? payload.name, 80)
    if (name) signalPayload.name = name

    return { ok: true, event: { type, userId, payload: signalPayload } }
  }

  if (type === "cursor") {
    const x = Number(record.x ?? payload.x)
    const y = Number(record.y ?? payload.y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) return { ok: false, error: "Cursor events require numeric x and y." }
    return {
      ok: true,
      event: {
        type,
        userId,
        payload: {
          x: Math.round(x * 10) / 10,
          y: Math.round(y * 10) / 10,
          target: cleanString(record.target ?? payload.target, 120),
        },
      },
    }
  }

  if (isServerOnlyEventType(type)) {
    // Built by our own API routes; keep the structure, bounded by the size
    // check above, and require the payload to be a real object.
    if (!record.payload || typeof record.payload !== "object" || Array.isArray(record.payload)) {
      return { ok: false, error: "Server events require an object payload." }
    }
    return { ok: true, event: { type, userId, payload: { ...payload } } }
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
