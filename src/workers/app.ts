// @ts-ignore OpenNext generates this module before Wrangler bundles the Worker.
import { default as openNextHandler } from "../../.open-next/worker.js"
import {
  PresenceDurableObject,
  routeRealtimeRequest,
  StudyBattleDurableObject,
  StudyRoomDurableObject,
  MatchmakingDO,
  GameRoomDO,
  PresenceDO,
  StudyBattleDO,
  StudyRoomDO,
  type RealtimeEnv,
} from "./realtime"

export {
  GameRoomDO,
  MatchmakingDO,
  PresenceDO,
  PresenceDurableObject,
  StudyBattleDO,
  StudyBattleDurableObject,
  StudyRoomDO,
  StudyRoomDurableObject,
}

interface OpenNextHandler {
  fetch(request: Request, env: unknown, ctx: ExecutionContext): Promise<Response> | Response
}

const REALTIME_ROUTE = /^\/api\/realtime\/(rooms|battles|presence)\/([^/]+)$/
const WEBSOCKET_HEADERS = [
  "connection",
  "sec-websocket-accept",
  "sec-websocket-extensions",
  "sec-websocket-key",
  "sec-websocket-protocol",
  "sec-websocket-version",
  "upgrade",
]
const handler = openNextHandler as OpenNextHandler

type AppWorkerEnv = RealtimeEnv

function realtimeServiceRequest(request: Request, kind: string, id: string) {
  const url = new URL(request.url)
  url.pathname = `/${kind}/${encodeURIComponent(id)}`
  return new Request(url, request)
}

function sessionRequest(request: Request) {
  const url = new URL(request.url)
  url.pathname = "/api/auth/session"
  url.search = ""

  const headers = new Headers(request.headers)
  for (const header of WEBSOCKET_HEADERS) headers.delete(header)

  return new Request(url, {
    headers,
    method: "GET",
  })
}

async function isAuthenticated(request: Request, env: AppWorkerEnv, ctx: ExecutionContext) {
  const response = await handler.fetch(sessionRequest(request), env, ctx)
  return response.ok
}

export default {
  async fetch(request: Request, env: AppWorkerEnv, ctx: ExecutionContext) {
    if (request.headers.get("upgrade") === "websocket") {
      const match = new URL(request.url).pathname.match(REALTIME_ROUTE)
      if (!match) return new Response("Unsupported websocket route.", { status: 404 })
      if (!(await isAuthenticated(request, env, ctx))) return new Response("Please sign in to continue.", { status: 401 })

      const [, kind, id] = match
      return routeRealtimeRequest(realtimeServiceRequest(request, kind, id), env)
    }

    return handler.fetch(request, env, ctx)
  },
}
