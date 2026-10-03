import {
  acceptClientFrame,
  createFrameRateLimiter,
  presenceEnvelope,
  presenceMembers,
  REALTIME_PONG,
  serverEnvelope,
  shouldDeliver,
  type LocalRealtimeHubLike,
  type PresenceMember,
  type RealtimeEnvelope,
  type RealtimeIdentity,
} from "../../../src/lib/realtime/hub-core"
import type { CollaborationEventPayload } from "../../../src/lib/collaboration-events"

/**
 * The local development stand-in for the realtime Durable Objects.
 *
 * `next dev` cannot host the Worker's internal Durable Objects, so chat,
 * typing, presence and call signaling had nowhere to connect on localhost.
 * This hub keeps the same contract as `src/workers/realtime.ts` — one room of
 * sockets per `kind:id`, server-stamped identity, addressed delivery — using
 * the rules both share in `src/lib/realtime/hub-core.ts`, so what works here
 * works the same once deployed.
 *
 * It is transport-agnostic: anything with `send`/`close`/`on` (a `ws`
 * WebSocket in the dev server, a fake in tests) can be connected.
 */

export interface HubSocket {
  readonly readyState: number
  send(data: string): void
  close(code?: number, reason?: string): void
  terminate?(): void
  ping?(): void
  on(event: "message", listener: (data: unknown, isBinary: boolean) => void): unknown
  on(event: "close", listener: () => void): unknown
  on(event: "pong", listener: () => void): unknown
  on(event: "error", listener: (error: Error) => void): unknown
}

const OPEN = 1
const MAX_REMEMBERED_EVENTS = 25

interface SocketState {
  identity: RealtimeIdentity
  alive: boolean
  limiter: ReturnType<typeof createFrameRateLimiter>
}

function channelKey(kind: string, id: string) {
  return `${kind}:${id}`
}

function frameText(data: unknown, isBinary: boolean): string | ArrayBuffer {
  if (isBinary) return new ArrayBuffer(0)
  if (typeof data === "string") return data
  if (Buffer.isBuffer(data)) return data.toString("utf8")
  if (Array.isArray(data)) return Buffer.concat(data as Buffer[]).toString("utf8")
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8")
  return String(data)
}

export class LocalRealtimeHub implements LocalRealtimeHubLike {
  private readonly channels = new Map<string, Map<HubSocket, SocketState>>()
  private readonly events = new Map<string, RealtimeEnvelope[]>()
  private readonly heartbeat: ReturnType<typeof setInterval> | null
  private readonly onPresenceChange?: (userId: string, online: boolean) => void

  constructor(options: { heartbeatMs?: number; onPresenceChange?: (userId: string, online: boolean) => void } = {}) {
    this.onPresenceChange = options.onPresenceChange
    const heartbeatMs = options.heartbeatMs ?? 30_000
    this.heartbeat = heartbeatMs > 0 ? setInterval(() => this.sweep(), heartbeatMs) : null
    this.heartbeat?.unref?.()
  }

  connect(socket: HubSocket, identity: RealtimeIdentity) {
    const key = channelKey(identity.kind, identity.id)
    const channel = this.channels.get(key) || new Map<HubSocket, SocketState>()
    this.channels.set(key, channel)

    const wasOnline = identity.kind === "inbox" && this.isUserOnline(identity.userId)
    const state: SocketState = { identity, alive: true, limiter: createFrameRateLimiter() }
    channel.set(socket, state)

    socket.on("pong", () => {
      state.alive = true
    })
    socket.on("message", (data, isBinary) => this.receive(socket, state, frameText(data, isBinary)))
    socket.on("close", () => this.disconnect(socket, identity))
    socket.on("error", () => this.disconnect(socket, identity))

    this.sendTo(socket, {
      type: "welcome",
      payload: { userId: identity.userId, device: identity.device || null, users: presenceMembers(this.identities(key)) },
      channel: { kind: identity.kind, id: identity.id },
      receivedAt: new Date().toISOString(),
    })
    this.fanOut(key, presenceEnvelope(identity.kind, identity.id, this.identities(key)), null)
    if (identity.kind === "inbox" && !wasOnline) this.onPresenceChange?.(identity.userId, true)
  }

  broadcast(kind: string, id: string, event: CollaborationEventPayload, options: { to?: string } = {}) {
    const key = channelKey(kind, id)
    return this.fanOut(key, serverEnvelope(kind, id, event, { to: options.to }), null)
  }

  snapshot(kind: string, id: string) {
    const key = channelKey(kind, id)
    return {
      connections: this.channels.get(key)?.size || 0,
      users: presenceMembers(this.identities(key)),
      events: [...(this.events.get(key) || [])].reverse(),
    }
  }

  onlineUserIds(userIds: string[]) {
    return userIds.filter((userId) => this.isUserOnline(userId))
  }

  presence(kind: string, id: string): PresenceMember[] {
    return presenceMembers(this.identities(channelKey(kind, id)))
  }

  close() {
    if (this.heartbeat) clearInterval(this.heartbeat)
    for (const channel of this.channels.values()) {
      for (const socket of channel.keys()) {
        try {
          socket.close(1001, "Server shutting down")
        } catch {
          // already gone
        }
      }
    }
    this.channels.clear()
  }

  private isUserOnline(userId: string) {
    const inbox = this.channels.get(channelKey("inbox", userId))
    return Boolean(inbox && inbox.size > 0)
  }

  private identities(key: string) {
    return [...(this.channels.get(key)?.values() || [])].map((state) => state.identity)
  }

  private receive(socket: HubSocket, state: SocketState, raw: string | ArrayBuffer) {
    state.alive = true
    const result = acceptClientFrame(raw, state.identity)
    if (!result.ok) {
      this.sendTo(socket, { type: "error", message: result.error })
      return
    }
    if (result.heartbeat) {
      if (socket.readyState === OPEN) socket.send(REALTIME_PONG)
      return
    }
    if (!state.limiter.take()) {
      this.sendTo(socket, { type: "error", message: "Slow down — too many realtime messages." })
      return
    }

    const key = channelKey(state.identity.kind, state.identity.id)
    if (result.persist) {
      const remembered = this.events.get(key) || []
      remembered.push(result.envelope)
      if (remembered.length > MAX_REMEMBERED_EVENTS) remembered.splice(0, remembered.length - MAX_REMEMBERED_EVENTS)
      this.events.set(key, remembered)
    }
    this.fanOut(key, result.envelope, socket)
  }

  private disconnect(socket: HubSocket, identity: RealtimeIdentity) {
    const key = channelKey(identity.kind, identity.id)
    const channel = this.channels.get(key)
    if (!channel?.delete(socket)) return
    if (!channel.size) {
      this.channels.delete(key)
      this.events.delete(key)
    } else {
      this.fanOut(key, presenceEnvelope(identity.kind, identity.id, this.identities(key)), null)
    }
    if (identity.kind === "inbox" && !this.isUserOnline(identity.userId)) this.onPresenceChange?.(identity.userId, false)
  }

  private fanOut(key: string, envelope: RealtimeEnvelope, sender: HubSocket | null) {
    const channel = this.channels.get(key)
    if (!channel) return 0
    const message = JSON.stringify(envelope)
    let delivered = 0
    for (const [socket, state] of channel) {
      if (!shouldDeliver(envelope, state.identity, socket === sender)) continue
      if (socket.readyState !== OPEN) continue
      try {
        socket.send(message)
        delivered += 1
      } catch {
        // One broken socket must not stop the rest of the fan-out.
      }
    }
    return delivered
  }

  private sendTo(socket: HubSocket, frame: Record<string, unknown>) {
    if (socket.readyState !== OPEN) return
    try {
      socket.send(JSON.stringify(frame))
    } catch {
      // ignore: the close handler cleans up
    }
  }

  /** Drop sockets that stopped answering pings (a laptop lid closed mid-call). */
  private sweep() {
    for (const channel of this.channels.values()) {
      for (const [socket, state] of channel) {
        if (!state.alive) {
          try {
            socket.terminate ? socket.terminate() : socket.close(4000, "Heartbeat timeout")
          } catch {
            // ignore
          }
          this.disconnect(socket, state.identity)
          continue
        }
        state.alive = false
        try {
          socket.ping?.()
        } catch {
          // ignore
        }
      }
    }
  }
}
