import { DurableObject } from "cloudflare:workers"
import {
  collaborationSessionId as sharedCollaborationSessionId,
  sessionTypeForRealtimeKind,
  shouldPersistCollaborationEvent,
  validateCollaborationEvent,
  type CollaborationEventPayload,
  type RealtimeKind,
} from "../lib/collaboration-events"
import {
  acceptClientFrame,
  createFrameRateLimiter,
  presenceEnvelope,
  presenceMembers,
  REALTIME_DEVICE_HEADER,
  REALTIME_PING,
  REALTIME_PONG,
  REALTIME_USER_HEADER,
  REALTIME_USER_NAME_HEADER,
  serverEnvelope,
  shouldDeliver,
  type RealtimeEnvelope,
  type RealtimeIdentity,
} from "../lib/realtime/hub-core"

interface D1Binding {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      run(): Promise<unknown>
      first<T = unknown>(): Promise<T | null>
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
  // A user's personal inbox (notifications, call rings) lives in the presence
  // namespace under its own `inbox:<userId>` name.
  inbox: "PRESENCE_DO",
} as const

class RealtimeLearningObject extends DurableObject<RealtimeEnv> {
  ctx: DurableObjectState
  env: RealtimeEnv
  // In-memory only: resets if the object hibernates, which is fine for a
  // flood guard.
  private limiters = new WeakMap<WebSocket, ReturnType<typeof createFrameRateLimiter>>()

  constructor(ctx: DurableObjectState, env: RealtimeEnv) {
    super(ctx, env)
    this.ctx = ctx
    this.env = env
    // Heartbeats are answered without waking a hibernated object.
    this.ctx.setWebSocketAutoResponse?.(new WebSocketRequestResponsePair(REALTIME_PING, REALTIME_PONG))
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
      const to = body && typeof body === "object" && typeof (body as { to?: unknown }).to === "string" ? (body as { to: string }).to : undefined
      this.fanOut(serverEnvelope(context.kind, context.id, validation.event, { to }), null)
      return Response.json({ ok: true })
    }

    if (request.headers.get("upgrade") !== "websocket") {
      return Response.json(await this.snapshot())
    }

    const userId = request.headers.get(REALTIME_USER_HEADER) || ""
    if (!userId) return new Response("Missing verified identity.", { status: 401 })

    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    this.ctx.acceptWebSocket(server)
    const context = channelContextFromRequest(request)
    const identity: RealtimeIdentity = {
      userId,
      name: safeDecode(request.headers.get(REALTIME_USER_NAME_HEADER) || ""),
      device: request.headers.get(REALTIME_DEVICE_HEADER) || undefined,
      kind: context.kind,
      id: context.id,
      connectedAt: new Date().toISOString(),
    }
    server.serializeAttachment?.(identity)
    const identities = this.identities()
    server.send(JSON.stringify({
      type: "welcome",
      payload: { userId, device: identity.device || null, users: presenceMembers(identities) },
      channel: { kind: context.kind, id: context.id },
      receivedAt: new Date().toISOString(),
    }))
    this.fanOut(presenceEnvelope(context.kind, context.id, identities), null)
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    const identity = identityOf(socket)
    if (!identity) {
      socket.close(4401, "Missing verified identity.")
      return
    }

    const result = acceptClientFrame(message, identity)
    if (!result.ok) {
      socket.send(JSON.stringify({ type: "error", message: result.error }))
      return
    }
    if (result.heartbeat) {
      socket.send(REALTIME_PONG)
      return
    }

    let limiter = this.limiters.get(socket)
    if (!limiter) {
      limiter = createFrameRateLimiter()
      this.limiters.set(socket, limiter)
    }
    if (!limiter.take()) {
      socket.send(JSON.stringify({ type: "error", message: "Slow down, too many realtime messages." }))
      return
    }

    if (result.persist) {
      const eventKey = `event:${Date.now()}:${crypto.randomUUID()}`
      await this.ctx.storage.put(eventKey, result.envelope)
      await this.persistUsefulEvent(result.envelope, eventKey)
    }
    this.fanOut(result.envelope, socket)
  }

  async webSocketClose(socket: WebSocket) {
    this.announcePresence(socket)
  }

  async webSocketError(socket: WebSocket) {
    this.announcePresence(socket)
  }

  announcePresence(leaving: WebSocket) {
    const identity = identityOf(leaving)
    if (!identity) return
    this.fanOut(presenceEnvelope(identity.kind, identity.id, this.identities(leaving)), leaving)
  }

  identities(excluding?: WebSocket) {
    return this.ctx.getWebSockets()
      .filter((socket) => socket !== excluding && socket.readyState === WebSocket.OPEN)
      .map(identityOf)
      .filter((identity): identity is RealtimeIdentity => Boolean(identity))
  }

  async snapshot() {
    const events = await this.ctx.storage.list({ prefix: "event:", limit: 25, reverse: true })
    const identities = this.identities()
    return {
      connections: identities.length,
      users: presenceMembers(identities),
      events: Array.from(events.values()),
    }
  }

  fanOut(envelope: RealtimeEnvelope, sender: WebSocket | null) {
    const message = JSON.stringify(envelope)
    for (const socket of this.ctx.getWebSockets()) {
      const identity = identityOf(socket)
      if (!identity || !shouldDeliver(envelope, identity, socket === sender)) continue
      try {
        socket.send(message)
      } catch {
        // One broken socket must not stop the rest of the fan-out.
      }
    }
  }

  broadcast(payload: Record<string, unknown>) {
    const message = JSON.stringify(payload)
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(message)
      } catch {
        // ignore closed sockets
      }
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
        .bind(`collab_event_${crypto.randomUUID()}`, sessionId, event.userId || null, event.type, storedPayload, eventKey)
        .run()
    } catch (error) {
      await this.ctx.storage.put("projection:lastError", {
        message: error instanceof Error ? error.message : "Unknown realtime projection error.",
        at: new Date().toISOString(),
      })
    }
  }
}

function identityOf(socket: WebSocket): RealtimeIdentity | null {
  try {
    const attachment = socket.deserializeAttachment?.() as Partial<RealtimeIdentity> | null
    if (!attachment?.userId || !attachment.kind || !attachment.id) return null
    return attachment as RealtimeIdentity
  } catch {
    return null
  }
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return ""
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

function channelContextFromRequest(request: Request) {
  const [kind, ...idParts] = new URL(request.url).pathname.replace(/^\/+/, "").split("/")
  return {
    kind: isRealtimeChannelKind(kind) ? kind : "presence",
    id: decodeURIComponent(idParts.join("/") || "global"),
  }
}

function isRealtimeChannelKind(value: string): value is keyof typeof CHANNELS {
  return value === "rooms" || value === "battles" || value === "presence" || value === "chat" || value === "inbox"
}
