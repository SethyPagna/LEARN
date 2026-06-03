import { DurableObject } from "cloudflare:workers"

type RealtimeChannelKind = "rooms" | "battles" | "presence"
type RealtimeEventType = "presence" | "pomodoro" | "battle-answer" | "editor-change" | "snapshot"

interface D1Binding {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      run(): Promise<unknown>
    }
  }
}

export interface RealtimeEnv {
  LEARN_DB?: D1Binding
  STUDY_ROOM_DO?: DurableObjectNamespace
  STUDY_BATTLE_DO?: DurableObjectNamespace
  PRESENCE_DO?: DurableObjectNamespace
}

interface RealtimeEvent {
  channel?: {
    kind: RealtimeChannelKind | string
    id: string
  }
  payload: Record<string, unknown>
  type: RealtimeEventType
  userId?: string
}

interface RealtimeValidation {
  error?: string
  event?: RealtimeEvent
  ok: boolean
}

const CHANNELS = {
  rooms: "STUDY_ROOM_DO",
  battles: "STUDY_BATTLE_DO",
  presence: "PRESENCE_DO",
} as const

const EVENT_TYPES = new Set<RealtimeEventType>(["presence", "pomodoro", "battle-answer", "editor-change", "snapshot"])
const POMODORO_STATUSES = new Set(["start", "pause", "resume", "complete", "reset", "tick"])
const MAX_PAYLOAD_BYTES = 16 * 1024

class RealtimeLearningObject extends DurableObject<RealtimeEnv> {
  ctx: DurableObjectState
  env: RealtimeEnv

  constructor(ctx: DurableObjectState, env: RealtimeEnv) {
    super(ctx, env)
    this.ctx = ctx
    this.env = env
  }

  async fetch(request: Request) {
    if (request.method === "DELETE") {
      await this.ctx.storage.deleteAll()
      this.broadcast({ type: "reset", receivedAt: new Date().toISOString() })
      return Response.json({ ok: true })
    }

    if (request.headers.get("upgrade") !== "websocket") {
      return Response.json(await this.snapshot())
    }

    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    this.ctx.acceptWebSocket(server)
    const context = channelContextFromRequest(request)
    server.serializeAttachment?.({
      connectedAt: new Date().toISOString(),
      ...context,
    })
    this.broadcast({ type: "presence", count: this.ctx.getWebSockets().length })
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    const validation = validateRealtimeMessage(message)
    if (!validation.ok) {
      socket.send(JSON.stringify({ type: "error", message: validation.error || "Invalid message." }))
      return
    }

    const eventKey = `event:${Date.now()}:${crypto.randomUUID()}`
    const attachment = socket.deserializeAttachment?.() || {}
    const payload = {
      ...validation.event,
      channel: {
        kind: attachment.kind || "presence",
        id: attachment.channelId || "global",
      },
    } as RealtimeEvent & { channel: { kind: string; id: string } }

    await this.ctx.storage.put(eventKey, payload)
    await this.persistUsefulEvent(payload, eventKey)
    this.broadcast({ ...payload, receivedAt: new Date().toISOString() })
  }

  async webSocketClose() {
    this.broadcast({ type: "presence", count: this.ctx.getWebSockets().length })
  }

  async snapshot() {
    const events = await this.ctx.storage.list({ prefix: "event:", limit: 25, reverse: true })
    return {
      connections: this.ctx.getWebSockets().length,
      events: Array.from(events.values()),
    }
  }

  broadcast(payload: Record<string, unknown>) {
    const message = JSON.stringify(payload)
    for (const socket of this.ctx.getWebSockets()) {
      socket.send(message)
    }
  }

  async persistUsefulEvent(event: RealtimeEvent & { channel: { kind: string; id: string } }, eventKey: string) {
    if (!this.env.LEARN_DB || event.type === "presence") return

    try {
      const sessionId = collaborationSessionId(event.channel.kind, event.channel.id)
      const sessionType = sessionTypeForKind(event.channel.kind)
      const storedPayload = JSON.stringify({
        ...event.payload,
        channel: event.channel,
        sourceUserId: event.userId || null,
      })

      await this.env.LEARN_DB.prepare(
        "INSERT INTO collaboration_sessions (id, session_type, status) VALUES (?, ?, 'active') ON CONFLICT(id) DO UPDATE SET status = 'active'",
      )
        .bind(sessionId, sessionType)
        .run()

      await this.env.LEARN_DB.prepare(
        "INSERT INTO collaboration_events (id, session_id, user_id, event_type, payload, durable_object_key) VALUES (?, ?, ?, ?, ?, ?)",
      )
        .bind(`collab_event_${crypto.randomUUID()}`, sessionId, null, event.type, storedPayload, eventKey)
        .run()
    } catch (error) {
      await this.ctx.storage.put("projection:lastError", {
        message: error instanceof Error ? error.message : "Unknown realtime projection error.",
        at: new Date().toISOString(),
      })
    }
  }
}

export class StudyRoomDurableObject extends RealtimeLearningObject {}
export class StudyBattleDurableObject extends RealtimeLearningObject {}
export class PresenceDurableObject extends RealtimeLearningObject {}

class LegacyCompatibilityDurableObject extends DurableObject<RealtimeEnv> {
  async fetch() {
    return Response.json({
      ok: true,
      status: "retained-for-existing-cloudflare-durable-objects",
    })
  }
}

export class MatchmakingDO extends LegacyCompatibilityDurableObject {}
export class GameRoomDO extends LegacyCompatibilityDurableObject {}
export class PresenceDO extends LegacyCompatibilityDurableObject {}
export class StudyRoomDO extends LegacyCompatibilityDurableObject {}
export class StudyBattleDO extends LegacyCompatibilityDurableObject {}

export function routeRealtimeRequest(request: Request, env: RealtimeEnv) {
  const url = new URL(request.url)
  const [kind, ...idParts] = url.pathname.replace(/^\/+/, "").split("/")
  const bindingName = isRealtimeChannelKind(kind) ? CHANNELS[kind] : null
  const id = idParts.join("/")

  if (!bindingName || !id.trim()) {
    return Response.json({ error: "Unsupported realtime channel." }, { status: 404 })
  }

  const namespace = env[bindingName]
  if (!namespace) {
    return Response.json({ error: "Realtime Durable Object binding is not configured." }, { status: 503 })
  }

  const objectId = namespace.idFromName(`${kind}:${id}`)
  return namespace.get(objectId).fetch(request)
}

export default {
  fetch: routeRealtimeRequest,
}

function validateRealtimeMessage(message: string | ArrayBuffer): RealtimeValidation {
  if (typeof message !== "string") return { ok: false, error: "Message must be JSON text." }

  const parsed = safeJson(message)
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, error: "Message must be a JSON object." }
  if (payloadSize(parsed) > MAX_PAYLOAD_BYTES) return { ok: false, error: "Message is too large." }

  const type = cleanString(readField(parsed, "type"), 48)
  if (!isRealtimeEventType(type)) return { ok: false, error: "Unsupported realtime event type." }

  const payload = objectPayload(readField(parsed, "payload"))
  const userId = cleanString(readField(parsed, "userId") || readField(parsed, "user_id"), 120) || undefined

  if (type === "presence") {
    const count = Number(readField(parsed, "count") ?? payload.count)
    if (!Number.isFinite(count) || count < 0) return { ok: false, error: "Presence events require a non-negative count." }
    return { ok: true, event: { type, userId, payload: { count: Math.floor(count) } } }
  }

  if (type === "pomodoro") {
    const status = cleanString(readField(parsed, "status") || payload.status, 32)
    if (!POMODORO_STATUSES.has(status)) return { ok: false, error: "Pomodoro events require a valid status." }
    return {
      ok: true,
      event: {
        type,
        userId,
        payload: {
          status,
          minutes: Math.max(0, Math.min(240, Math.round(Number(readField(parsed, "minutes") ?? payload.minutes ?? 25)))),
        },
      },
    }
  }

  if (type === "battle-answer") {
    const questionId = cleanString(readField(parsed, "questionId") || readField(parsed, "question_id") || payload.questionId || payload.question_id)
    const answerId = cleanString(readField(parsed, "answerId") || readField(parsed, "answer_id") || readField(parsed, "selectedAnswerId") || readField(parsed, "selected_answer_id") || payload.answerId || payload.answer_id)
    if (!questionId || !answerId) return { ok: false, error: "Battle answers require question and answer ids." }
    return { ok: true, event: { type, userId, payload: { questionId, answerId } } }
  }

  if (type === "editor-change") {
    const contentItemId = cleanString(readField(parsed, "contentItemId") || readField(parsed, "content_item_id") || payload.contentItemId || payload.content_item_id, 120)
    const operation = cleanString(readField(parsed, "operation") || payload.operation, 80)
    if (!contentItemId || !operation) return { ok: false, error: "Editor changes require a content item and operation." }
    return {
      ok: true,
      event: {
        type,
        userId,
        payload: {
          contentItemId,
          operation,
          clientMutationId: cleanString(readField(parsed, "clientMutationId") || readField(parsed, "client_mutation_id") || payload.clientMutationId || payload.client_mutation_id, 120),
        },
      },
    }
  }

  const summary = cleanString(readField(parsed, "summary") || payload.summary, 500)
  return { ok: true, event: { type, userId, payload: { summary, ...payload } } }
}

function channelContextFromRequest(request: Request) {
  const [kind, ...idParts] = new URL(request.url).pathname.replace(/^\/+/, "").split("/")
  return {
    kind: isRealtimeChannelKind(kind) ? kind : "presence",
    channelId: decodeURIComponent(idParts.join("/") || "global"),
  }
}

function collaborationSessionId(kind: string, channelId: string) {
  const safeChannel = String(channelId || "channel").replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 96) || "channel"
  return `collab_${kind}_${safeChannel}`
}

function sessionTypeForKind(kind: string) {
  if (kind === "rooms") return "room"
  if (kind === "battles") return "battle"
  return "presence"
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

function objectPayload(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readField(source: unknown, key: string) {
  return source && typeof source === "object" && key in source ? (source as Record<string, unknown>)[key] : undefined
}

function isRealtimeChannelKind(value: string): value is RealtimeChannelKind {
  return value === "rooms" || value === "battles" || value === "presence"
}

function isRealtimeEventType(value: string): value is RealtimeEventType {
  return EVENT_TYPES.has(value as RealtimeEventType)
}

function safeJson(value: string) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}
