import type { RealtimeKind } from "../collaboration-events"

/**
 * Browser side of the realtime endpoint (`/api/realtime/<kind>/<id>`).
 *
 * One `RealtimeSocket` is one channel. It keeps itself connected the way a
 * messaging app has to on real networks:
 *
 *  - reconnects with exponential backoff and jitter (so a server restart does
 *    not get a thundering herd), and immediately when the browser comes back
 *    online or the tab becomes visible again;
 *  - sends an app-level heartbeat and treats a missing reply as a dead socket,
 *    because a laptop waking from sleep often holds a socket that looks open
 *    but will never deliver again;
 *  - queues a few frames sent while reconnecting instead of dropping them.
 *
 * The server stamps the sender's identity on every frame it relays, so nothing
 * here claims to be anyone; `userId` fields a caller adds are ignored upstream.
 */

export const REALTIME_HEARTBEAT_MS = 25_000
const HEARTBEAT_TIMEOUT_MS = 10_000
const MAX_BACKOFF_MS = 30_000
const MAX_QUEUED_FRAMES = 20

export type RealtimeStatus = "connecting" | "open" | "reconnecting" | "closed"

export interface RealtimeFrame {
  type: string
  userId?: string
  payload?: Record<string, unknown>
  fromDevice?: string
  receivedAt?: string
  channel?: { kind: string; id: string }
  [key: string]: unknown
}

export interface RealtimeSocketOptions {
  kind: RealtimeKind
  id: string
  onFrame: (frame: RealtimeFrame) => void
  onStatus?: (status: RealtimeStatus) => void
  /** Overridable for tests. */
  createSocket?: (url: string) => WebSocket
}

const DEVICE_KEY = "learn_realtime_device"

/**
 * A per-tab id. Two tabs of the same person are two devices, so a call can be
 * answered in one without the other ringing forever.
 */
export function realtimeDeviceId() {
  if (typeof window === "undefined") return ""
  try {
    const existing = window.sessionStorage.getItem(DEVICE_KEY)
    if (existing) return existing
    const next = `d${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`
    window.sessionStorage.setItem(DEVICE_KEY, next)
    return next
  } catch {
    return `d${Math.random().toString(36).slice(2, 12)}`
  }
}

export function realtimeUrl(kind: RealtimeKind, id: string, device = realtimeDeviceId()) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
  const query = device ? `?device=${encodeURIComponent(device)}` : ""
  return `${protocol}//${window.location.host}/api/realtime/${kind}/${encodeURIComponent(id)}${query}`
}

/** Backoff for the n-th consecutive failure: 0.5s, 1s, 2s … capped, with ±30% jitter. */
export function reconnectDelay(attempt: number, random = Math.random) {
  const base = Math.min(MAX_BACKOFF_MS, 500 * 2 ** Math.max(0, attempt))
  const jitter = base * 0.3 * (random() * 2 - 1)
  return Math.max(250, Math.round(base + jitter))
}

export class RealtimeSocket {
  private socket: WebSocket | null = null
  private attempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private heartbeatDeadline: ReturnType<typeof setTimeout> | null = null
  private queue: string[] = []
  private stopped = false
  private currentStatus: RealtimeStatus = "connecting"
  private readonly handleOnline = () => this.reconnectNow()
  private readonly handleVisible = () => {
    if (document.visibilityState === "visible" && this.currentStatus !== "open") this.reconnectNow()
  }

  constructor(private readonly options: RealtimeSocketOptions) {}

  get status() {
    return this.currentStatus
  }

  start() {
    this.stopped = false
    if (typeof window !== "undefined") {
      window.addEventListener("online", this.handleOnline)
      document.addEventListener("visibilitychange", this.handleVisible)
    }
    this.open()
    return this
  }

  /** Sends a frame now, or queues it until the socket is back. Returns false when dropped. */
  send(frame: Record<string, unknown>) {
    const text = JSON.stringify(frame)
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(text)
      return true
    }
    if (this.stopped) return false
    if (this.queue.length >= MAX_QUEUED_FRAMES) this.queue.shift()
    this.queue.push(text)
    return false
  }

  /** Sends only if connected; for ephemeral frames (typing, cursors) that are useless late. */
  sendNow(frame: Record<string, unknown>) {
    if (this.socket?.readyState !== WebSocket.OPEN) return false
    this.socket.send(JSON.stringify(frame))
    return true
  }

  close() {
    this.stopped = true
    this.clearTimers()
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.handleOnline)
      document.removeEventListener("visibilitychange", this.handleVisible)
    }
    const socket = this.socket
    this.socket = null
    this.queue = []
    if (socket && socket.readyState <= WebSocket.OPEN) socket.close(1000, "closed by client")
    this.setStatus("closed")
  }

  private open() {
    if (this.stopped) return
    this.setStatus(this.attempt === 0 ? "connecting" : "reconnecting")
    let socket: WebSocket
    try {
      const url = realtimeUrl(this.options.kind, this.options.id)
      socket = this.options.createSocket ? this.options.createSocket(url) : new WebSocket(url)
    } catch {
      this.scheduleReconnect()
      return
    }
    this.socket = socket

    socket.onopen = () => {
      if (this.socket !== socket) return
      this.attempt = 0
      this.setStatus("open")
      this.startHeartbeat()
      const pending = this.queue
      this.queue = []
      for (const text of pending) socket.send(text)
    }

    socket.onmessage = (event) => {
      if (this.socket !== socket) return
      const data = typeof event.data === "string" ? event.data : ""
      if (data === "pong") {
        if (this.heartbeatDeadline) clearTimeout(this.heartbeatDeadline)
        this.heartbeatDeadline = null
        return
      }
      if (!data.startsWith("{")) return
      try {
        this.options.onFrame(JSON.parse(data) as RealtimeFrame)
      } catch {
        // A malformed frame is dropped; one bad event must not kill the channel.
      }
    }

    socket.onclose = () => {
      if (this.socket !== socket) return
      this.socket = null
      this.clearTimers()
      if (!this.stopped) this.scheduleReconnect()
    }

    socket.onerror = () => {
      // `onclose` follows every error and owns the reconnect.
    }
  }

  private reconnectNow() {
    if (this.stopped) return
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      // Probe instead of trusting it: a socket that survived sleep may be dead.
      this.ping()
      return
    }
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    this.attempt = 0
    const stale = this.socket
    this.socket = null
    if (stale && stale.readyState <= WebSocket.OPEN) stale.close()
    this.open()
  }

  private scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) return
    this.setStatus("reconnecting")
    const delay = reconnectDelay(this.attempt)
    this.attempt += 1
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.open()
    }, delay)
  }

  private startHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = setInterval(() => this.ping(), REALTIME_HEARTBEAT_MS)
  }

  private ping() {
    const socket = this.socket
    if (!socket || socket.readyState !== WebSocket.OPEN) return
    socket.send("ping")
    if (this.heartbeatDeadline) return
    this.heartbeatDeadline = setTimeout(() => {
      this.heartbeatDeadline = null
      // No pong: the connection is gone even if the browser has not noticed.
      if (this.socket === socket) {
        this.socket = null
        this.clearTimers()
        socket.close()
        this.scheduleReconnect()
      }
    }, HEARTBEAT_TIMEOUT_MS)
  }

  private clearTimers() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    if (this.heartbeatDeadline) clearTimeout(this.heartbeatDeadline)
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.heartbeatTimer = null
    this.heartbeatDeadline = null
    this.reconnectTimer = null
  }

  private setStatus(status: RealtimeStatus) {
    if (this.currentStatus === status) return
    this.currentStatus = status
    this.options.onStatus?.(status)
  }
}
