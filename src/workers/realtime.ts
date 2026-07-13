import { DurableObject } from "cloudflare:workers"
import {
  collaborationSessionId as sharedCollaborationSessionId,
  sessionTypeForRealtimeKind,
  shouldPersistCollaborationEvent,
  validateCollaborationEvent,
  type CollaborationEventPayload,
  type RealtimeKind,
} from "../lib/collaboration-events"

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
  CHAT_DO?: DurableObjectNamespace
}

type RealtimeEvent = CollaborationEventPayload & {
  channel?: { kind: RealtimeKind | string; id: string }
}

const CHANNELS = {
  rooms: "STUDY_ROOM_DO",
  battles: "STUDY_BATTLE_DO",
  presence: "PRESENCE_DO",
  chat: "CHAT_DO",
} as const

const MAX_PAYLOAD_BYTES = 48 * 1024

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

    if (request.method === "POST") {
      // Server-to-server push: used to fan out a message that a Next.js API route
      // already validated and persisted (e.g. a chat message), without requiring
      // the sender to hold an open WebSocket to this object themselves.
      const body = await request.json().catch(() => null)
      const validation = validateCollaborationEvent(body)
      if (!validation.ok || !validation.event) {
        return Response.json({ error: validation.error || "Invalid broadcast payload." }, { status: 400 })
      }
      const context = channelContextFromRequest(request)
      const payload = { ...validation.event, channel: context } satisfies RealtimeEvent
      this.broadcast({ ...payload, receivedAt: new Date().toISOString() })
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
        id: attachment.id || "global",
      },
    } as RealtimeEvent & { channel: { kind: string; id: string } }

    if (shouldPersistCollaborationEvent(payload.type)) {
      await this.ctx.storage.put(eventKey, payload)
      await this.persistUsefulEvent(payload, eventKey)
    }
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
    if (!this.env.LEARN_DB || !shouldPersistCollaborationEvent(event.type)) return

    try {
      const kind = event.channel.kind as RealtimeKind
      const sessionId = sharedCollaborationSessionId(kind, event.channel.id)
      const sessionType = sessionTypeForRealtimeKind(kind)
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
export class ChatDurableObject extends RealtimeLearningObject {}

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

function validateRealtimeMessage(message: string | ArrayBuffer) {
  if (typeof message !== "string") return { ok: false as const, error: "Message must be JSON text." }
  if (new TextEncoder().encode(message).byteLength > MAX_PAYLOAD_BYTES) {
    return { ok: false as const, error: "Message is too large." }
  }
  return validateCollaborationEvent(message)
}

function channelContextFromRequest(request: Request) {
  const [kind, ...idParts] = new URL(request.url).pathname.replace(/^\/+/, "").split("/")
  return {
    kind: isRealtimeChannelKind(kind) ? kind : "presence",
    id: decodeURIComponent(idParts.join("/") || "global"),
  }
}

function isRealtimeChannelKind(value: string): value is keyof typeof CHANNELS {
  return value === "rooms" || value === "battles" || value === "presence" || value === "chat"
}
