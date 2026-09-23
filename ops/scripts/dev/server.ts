import { randomBytes } from "node:crypto"
import http from "node:http"
import type { Duplex } from "node:stream"
import next from "next"
import { WebSocketServer } from "ws"
import {
  isAllowedRealtimeOrigin,
  LOCAL_REALTIME_RPC_URL_ENV,
  LOCAL_REALTIME_SECRET_ENV,
  LOCAL_REALTIME_SECRET_HEADER,
  REALTIME_AUTHORIZE_HEADER,
  setLocalRealtimeHub,
} from "../../../src/lib/realtime/hub-core"
import { isRealtimeKind, type CollaborationEventPayload } from "../../../src/lib/collaboration-events"
import { LocalRealtimeHub } from "./realtime-hub"

/**
 * `pnpm dev`: Next.js in development mode plus the realtime WebSocket hub.
 *
 * Production terminates `/api/realtime/<kind>/<id>` upgrades in the Worker
 * (`src/workers/app.ts`) and hands them to Durable Objects. `next dev` has
 * neither, so this server wraps Next with the same endpoint:
 *
 *   1. the upgrade's Origin must be this site (or its loopback alias);
 *   2. the session cookie and channel access are checked by the realtime
 *      API route itself, called over loopback in "authorize" mode — so the
 *      rules are the route's, not a copy;
 *   3. the socket joins the in-process hub, which stamps the verified user
 *      on every event it relays.
 *
 * API routes push server events (a saved chat message, an incoming call)
 * through the hub directly when they share this process, or through the
 * secret-guarded loopback RPC below when they do not.
 */

Object.assign(process.env, { NODE_ENV: process.env.NODE_ENV || "development" })

const port = Number(process.env.PORT || 3000)
const listenHost = process.env.LEARN_DEV_HOST || undefined
const hostnameForNext = process.env.LEARN_DEV_HOSTNAME || "localhost"
const REALTIME_ROUTE = /^\/api\/realtime\/([a-z]+)\/([^/?#]+)$/
const RPC_PATH = "/__learn/realtime/rpc"
const secret = randomBytes(24).toString("hex")

process.env[LOCAL_REALTIME_RPC_URL_ENV] = `http://127.0.0.1:${port}${RPC_PATH}`
process.env[LOCAL_REALTIME_SECRET_ENV] = secret

const hub = new LocalRealtimeHub()
setLocalRealtimeHub(hub)

// Next attaches its own "upgrade" listener to whichever server `httpServer`
// names (default: the one serving the first request). That listener ends any
// socket whose path matches an app route — including /api/realtime/* while we
// are still authorizing it. Handing Next an idle server keeps its listener off
// ours; HMR upgrades still reach Next through getUpgradeHandler() below.
const idleServerForNext = new http.Server()
const app = next({ dev: true, hostname: hostnameForNext, port, httpServer: idleServerForNext })

function rejectUpgrade(socket: Duplex, status: number, message: string) {
  const reason = http.STATUS_CODES[status] || "Error"
  const body = JSON.stringify({ error: message })
  socket.end(
    `HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`,
  )
}

async function authorizeUpgrade(kind: string, id: string, cookie: string | undefined) {
  const response = await fetch(`http://127.0.0.1:${port}/api/realtime/${kind}/${encodeURIComponent(id)}`, {
    headers: {
      [REALTIME_AUTHORIZE_HEADER]: "1",
      [LOCAL_REALTIME_SECRET_HEADER]: secret,
      ...(cookie ? { cookie } : {}),
    },
    signal: AbortSignal.timeout(90_000),
  })
  const body = (await response.json().catch(() => null)) as { user?: { id?: string; name?: string }; error?: string } | null
  if (!response.ok || !body?.user?.id) {
    return { ok: false as const, status: response.status >= 400 ? response.status : 401, error: body?.error || "Not allowed." }
  }
  return { ok: true as const, user: { id: body.user.id, name: body.user.name || "" } }
}

async function readBody(request: http.IncomingMessage, limit = 256 * 1024) {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.byteLength
    if (size > limit) throw new Error("Body too large")
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString("utf8")
}

function sendJson(response: http.ServerResponse, status: number, value: unknown) {
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" })
  response.end(JSON.stringify(value))
}

async function handleRpc(request: http.IncomingMessage, response: http.ServerResponse) {
  const remote = request.socket.remoteAddress || ""
  const isLoopback = remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1"
  if (!isLoopback || request.headers[LOCAL_REALTIME_SECRET_HEADER] !== secret || request.method !== "POST") {
    sendJson(response, 404, { error: "Not found" })
    return
  }
  try {
    const input = JSON.parse(await readBody(request)) as {
      op?: string
      kind?: string
      id?: string
      event?: CollaborationEventPayload
      to?: string
      userIds?: string[]
    }
    if (input.op === "broadcast" && input.kind && input.id && input.event) {
      sendJson(response, 200, { delivered: hub.broadcast(input.kind, input.id, input.event, { to: input.to }) })
      return
    }
    if (input.op === "snapshot" && input.kind && input.id) {
      sendJson(response, 200, hub.snapshot(input.kind, input.id))
      return
    }
    if (input.op === "online" && Array.isArray(input.userIds)) {
      sendJson(response, 200, { online: hub.onlineUserIds(input.userIds.map(String)) })
      return
    }
    sendJson(response, 400, { error: "Unknown realtime rpc." })
  } catch (error) {
    sendJson(response, 400, { error: error instanceof Error ? error.message : "Bad request" })
  }
}

async function main() {
  await app.prepare()
  const handle = app.getRequestHandler()
  const upgradeNext = app.getUpgradeHandler()
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 })

  const server = http.createServer((request, response) => {
    if (request.url?.startsWith(RPC_PATH)) {
      void handleRpc(request, response)
      return
    }
    void handle(request, response)
  })

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`)
    const match = url.pathname.match(REALTIME_ROUTE)
    if (!match) {
      void upgradeNext(request, socket, head)
      return
    }

    void (async () => {
      const [, kind, rawId] = match
      let id = ""
      try {
        id = decodeURIComponent(rawId)
      } catch {
        rejectUpgrade(socket, 400, "Malformed channel id.")
        return
      }
      if (!isRealtimeKind(kind) || !id.trim()) {
        rejectUpgrade(socket, 404, "Unsupported realtime channel.")
        return
      }
      if (!isAllowedRealtimeOrigin(request.headers.origin, request.headers.host)) {
        rejectUpgrade(socket, 403, "This origin may not open realtime connections.")
        return
      }

      try {
        const auth = await authorizeUpgrade(kind, id, request.headers.cookie)
        if (socket.destroyed) return // the client gave up while we were checking
        if (!auth.ok) {
          rejectUpgrade(socket, auth.status, auth.error)
          return
        }
        const device = (url.searchParams.get("device") || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64)
        wss.handleUpgrade(request, socket, head, (ws) => {
          hub.connect(ws, {
            userId: auth.user.id,
            name: auth.user.name,
            device: device || undefined,
            kind,
            id,
            connectedAt: new Date().toISOString(),
          })
        })
      } catch (error) {
        console.error("[realtime] upgrade failed", error)
        rejectUpgrade(socket, 500, "Realtime is unavailable right now.")
      }
    })()
  })

  server.listen(port, listenHost, () => {
    const shown = listenHost && listenHost !== "0.0.0.0" && listenHost !== "::" ? listenHost : "localhost"
    console.log(`\n  LEARN dev server  →  http://${shown}:${port}`)
    console.log("  Realtime hub      →  chat, presence, typing and call signaling run locally")
    console.log(`  Second account?   →  open http://127.0.0.1:${port} in the same browser (separate sign-in)\n`)
  })

  const shutdown = () => {
    hub.close()
    wss.close()
    server.close()
    void app.close?.().finally(() => process.exit(0))
    setTimeout(() => process.exit(0), 2000).unref()
  }
  process.once("SIGINT", shutdown)
  process.once("SIGTERM", shutdown)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
