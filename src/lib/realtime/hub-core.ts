import {
  shouldPersistCollaborationEvent,
  validateCollaborationEvent,
  type CollaborationEventPayload,
  type CollaborationEventType,
  type RealtimeKind,
} from "../collaboration-events"

/**
 * Transport-neutral realtime rules shared by the production Durable Object
 * (`src/workers/realtime.ts`) and the local development hub
 * (`ops/scripts/dev/realtime-hub.ts`).
 *
 * Both transports hold a set of sockets per channel (`kind:id`) and fan events
 * out between them. What they must agree on is decided here, once:
 *
 *  - identity is stamped by the server from the authenticated session, never
 *    taken from the client frame, so nobody can speak as someone else;
 *  - which event types a client socket may emit on which channel kind (a
 *    browser never gets to forge a chat message or a server notification);
 *  - who receives an event: everyone else on the channel, or one addressed
 *    user (optionally one of their devices) for call signaling;
 *  - the app-level heartbeat frames.
 */

export const REALTIME_PING = "ping"
export const REALTIME_PONG = "pong"

/** The largest client frame either transport accepts, in bytes. */
export const MAX_CLIENT_FRAME_BYTES = 48 * 1024

/** Header the trusted edge sets after authenticating an upgrade; stripped from client requests first. */
export const REALTIME_USER_HEADER = "x-learn-user-id"
export const REALTIME_USER_NAME_HEADER = "x-learn-user-name"
export const REALTIME_DEVICE_HEADER = "x-learn-device-id"

export interface RealtimeIdentity {
  userId: string
  name?: string
  /** A per-tab id chosen by the client, so a call can address one tab of a user. */
  device?: string
  kind: string
  id: string
  connectedAt: string
}

export interface RealtimeEnvelope extends CollaborationEventPayload {
  channel: { kind: string; id: string }
  receivedAt: string
  fromDevice?: string
  /** Addressed delivery: only this user's sockets receive the event. */
  to?: string
  toDevice?: string
}

/**
 * Events a browser may send over its socket, per channel kind. Everything
 * else (chat messages, receipts, rings, notifications, game state) is created
 * by an API route after it has persisted and authorized the change, and
 * reaches sockets through the server broadcast path only.
 */
const CLIENT_EVENTS: Record<string, ReadonlySet<CollaborationEventType>> = {
  chat: new Set<CollaborationEventType>(["typing", "call-signal"]),
  rooms: new Set<CollaborationEventType>(["pomodoro", "editor-change", "snapshot", "cursor"]),
  battles: new Set<CollaborationEventType>(["battle-answer", "snapshot"]),
  presence: new Set<CollaborationEventType>(["cursor", "editor-change"]),
  inbox: new Set<CollaborationEventType>(),
}

export function clientMayEmit(kind: string, type: CollaborationEventType) {
  return CLIENT_EVENTS[kind]?.has(type) ?? false
}

function cleanId(value: unknown, max = 120) {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}

function byteLength(message: string) {
  return new TextEncoder().encode(message).byteLength
}

export type ClientFrameResult =
  | { ok: true; heartbeat: true }
  | { ok: true; heartbeat?: false; envelope: RealtimeEnvelope; persist: boolean }
  | { ok: false; error: string }

/**
 * Turns one raw client frame into an envelope ready for fan-out, or explains
 * why it was refused. The sender's identity always comes from `identity`
 * (the authenticated socket), overwriting any `userId` in the frame.
 */
export function acceptClientFrame(raw: string | ArrayBuffer, identity: RealtimeIdentity, now = new Date()): ClientFrameResult {
  if (typeof raw !== "string") return { ok: false, error: "Message must be JSON text." }
  if (raw === REALTIME_PING) return { ok: true, heartbeat: true }
  if (byteLength(raw) > MAX_CLIENT_FRAME_BYTES) return { ok: false, error: "Message is too large." }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, error: "Message must be valid JSON." }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, error: "Message must be a JSON object." }

  const record = parsed as Record<string, unknown>
  const validation = validateCollaborationEvent(record)
  if (!validation.ok || !validation.event) return { ok: false, error: validation.error || "Invalid message." }
  if (!clientMayEmit(identity.kind, validation.event.type)) {
    return { ok: false, error: `This channel does not accept ${validation.event.type} events from clients.` }
  }

  const to = cleanId(record.to)
  const toDevice = cleanId(record.toDevice, 80)
  const envelope: RealtimeEnvelope = {
    ...validation.event,
    userId: identity.userId,
    channel: { kind: identity.kind, id: identity.id },
    receivedAt: now.toISOString(),
    ...(identity.device ? { fromDevice: identity.device } : {}),
    ...(to ? { to } : {}),
    ...(to && toDevice ? { toDevice } : {}),
  }
  return { ok: true, envelope, persist: shouldPersistCollaborationEvent(envelope.type) }
}

/**
 * Builds the envelope for a server-originated event (an API route pushing a
 * change it already persisted). `to` addresses one user.
 */
export function serverEnvelope(
  kind: RealtimeKind | string,
  id: string,
  event: CollaborationEventPayload,
  options: { to?: string; now?: Date } = {},
): RealtimeEnvelope {
  return {
    ...event,
    channel: { kind, id },
    receivedAt: (options.now || new Date()).toISOString(),
    ...(options.to ? { to: options.to } : {}),
  }
}

/**
 * Whether `recipient` should receive `envelope`. The sending socket never
 * gets its own frame back; other tabs of the same user do, so a second tab
 * sees "answered on another device" style state changes.
 */
export function shouldDeliver(envelope: RealtimeEnvelope, recipient: RealtimeIdentity, isSenderSocket: boolean) {
  if (isSenderSocket) return false
  if (envelope.to && envelope.to !== recipient.userId) return false
  if (envelope.toDevice && envelope.toDevice !== recipient.device) return false
  return true
}

/**
 * Per-socket token bucket. A call start legitimately bursts a few dozen ICE
 * candidates, so the bucket is sized for that; a client that keeps flooding
 * past the refill rate gets its frames refused rather than fanned out.
 */
export function createFrameRateLimiter(options: { capacity?: number; refillPerSecond?: number } = {}) {
  const capacity = options.capacity ?? 80
  const refillPerSecond = options.refillPerSecond ?? 30
  let tokens = capacity
  let updatedAt = 0

  return {
    take(now = Date.now()) {
      if (updatedAt) tokens = Math.min(capacity, tokens + ((now - updatedAt) / 1000) * refillPerSecond)
      updatedAt = now
      if (tokens < 1) return false
      tokens -= 1
      return true
    },
  }
}

export interface PresenceMember {
  userId: string
  name?: string
  devices: number
}

export function presenceMembers(identities: RealtimeIdentity[]): PresenceMember[] {
  const members = new Map<string, PresenceMember>()
  for (const identity of identities) {
    if (!identity.userId) continue
    const existing = members.get(identity.userId)
    if (existing) existing.devices += 1
    else members.set(identity.userId, { userId: identity.userId, name: identity.name, devices: 1 })
  }
  return [...members.values()]
}

/** Presence keeps the legacy `count` field (sockets) and adds who is here. */
export function presenceEnvelope(kind: string, id: string, identities: RealtimeIdentity[], now = new Date()): RealtimeEnvelope {
  return {
    type: "presence",
    payload: { count: identities.length, users: presenceMembers(identities) },
    channel: { kind, id },
    receivedAt: now.toISOString(),
  }
}

/**
 * The shape the local development hub exposes on `globalThis`, so API routes
 * running in the same Node process can broadcast without an HTTP hop.
 */
export interface LocalRealtimeHubLike {
  broadcast(kind: string, id: string, event: CollaborationEventPayload, options?: { to?: string }): number
  snapshot(kind: string, id: string): { connections: number; users: PresenceMember[]; events: unknown[] }
  onlineUserIds(userIds: string[]): string[]
}

const LOCAL_HUB_KEY = "__learnLocalRealtimeHub"

export function getLocalRealtimeHub(): LocalRealtimeHubLike | null {
  const candidate = (globalThis as Record<string, unknown>)[LOCAL_HUB_KEY]
  return candidate && typeof candidate === "object" ? candidate as LocalRealtimeHubLike : null
}

export function setLocalRealtimeHub(hub: LocalRealtimeHubLike | null) {
  const target = globalThis as Record<string, unknown>
  if (hub) target[LOCAL_HUB_KEY] = hub
  else delete target[LOCAL_HUB_KEY]
}

/** Env names the local development server sets for API routes. */
export const LOCAL_REALTIME_RPC_URL_ENV = "LEARN_LOCAL_REALTIME_URL"
export const LOCAL_REALTIME_SECRET_ENV = "LEARN_LOCAL_REALTIME_SECRET"
export const LOCAL_REALTIME_SECRET_HEADER = "x-learn-realtime-secret"
export const REALTIME_AUTHORIZE_HEADER = "x-learn-realtime-authorize"

export function isLocalRealtimeMode(env: Record<string, string | undefined> = process.env) {
  return Boolean(env[LOCAL_REALTIME_RPC_URL_ENV] && env[LOCAL_REALTIME_SECRET_ENV])
}

/**
 * Browser origins allowed to open a realtime socket: the origin the request
 * was addressed to, plus the loopback aliases of it (so `localhost:3000` and
 * `127.0.0.1:3000` — two separate cookie jars, handy for testing two
 * accounts side by side — both work).
 */
export function isAllowedRealtimeOrigin(origin: string | null | undefined, host: string | null | undefined, extraOrigins: string[] = []) {
  if (!origin) return true // non-browser clients (tests, server tooling) send no Origin
  let originUrl: URL
  try {
    originUrl = new URL(origin)
  } catch {
    return false
  }
  if (extraOrigins.includes(originUrl.origin)) return true
  if (!host) return false
  if (originUrl.host === host) return true

  const loopback = new Set(["localhost", "127.0.0.1", "[::1]", "::1"])
  const hostName = host.replace(/:\d+$/, "")
  const hostPort = host.match(/:(\d+)$/)?.[1] || ""
  return loopback.has(originUrl.hostname) && loopback.has(hostName) && originUrl.port === hostPort
}
