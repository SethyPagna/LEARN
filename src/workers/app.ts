// @ts-ignore OpenNext generates this module before Wrangler bundles the Worker.
import { default as openNextHandler } from "../../.open-next/worker.js"
import { isAuthorizedForChatChannel } from "../lib/chat-channel"
import {
  isAllowedRealtimeOrigin,
  REALTIME_DEVICE_HEADER,
  REALTIME_USER_HEADER,
  REALTIME_USER_NAME_HEADER,
} from "../lib/realtime/hub-core"
import {
  ChatDurableObject,
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
  ChatDurableObject,
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

const REALTIME_ROUTE = /^\/api\/realtime\/(rooms|battles|presence|chat|inbox)\/([^/]+)$/
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

/**
 * The request handed to the Durable Object. Identity headers a client might
 * have sent are dropped first, then set from the verified session — the
 * object stamps every relayed event with them, so they must only ever come
 * from here.
 */
function realtimeServiceRequest(request: Request, kind: string, id: string, user: { id: string; name?: string }) {
  const url = new URL(request.url)
  const device = (url.searchParams.get("device") || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64)
  url.pathname = `/${kind}/${encodeURIComponent(id)}`
  url.search = ""

  const headers = new Headers(request.headers)
  headers.delete(REALTIME_USER_HEADER)
  headers.delete(REALTIME_USER_NAME_HEADER)
  headers.delete(REALTIME_DEVICE_HEADER)
  headers.set(REALTIME_USER_HEADER, user.id)
  if (user.name) headers.set(REALTIME_USER_NAME_HEADER, encodeURIComponent(user.name.slice(0, 80)))
  if (device) headers.set(REALTIME_DEVICE_HEADER, device)

  return new Request(url, { method: request.method, headers })
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

async function resolveSessionUser(request: Request, env: AppWorkerEnv, ctx: ExecutionContext) {
  const response = await handler.fetch(sessionRequest(request), env, ctx)
  if (!response.ok) return null
  const body = await response.json().catch(() => null) as { user?: { id?: string; name?: string } | null } | null
  return body?.user?.id ? { id: body.user.id, name: body.user.name } : null
}

async function isGroupMember(env: AppWorkerEnv, groupId: string, userId: string) {
  if (!env.LEARN_DB) return false
  try {
    const row = await env.LEARN_DB.prepare("SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ? LIMIT 1")
      .bind(groupId, userId)
      .first()
    return Boolean(row)
  } catch {
    return false
  }
}

export default {
  async fetch(request: Request, env: AppWorkerEnv, ctx: ExecutionContext) {
    if (request.headers.get("upgrade") === "websocket") {
      const url = new URL(request.url)
      const match = url.pathname.match(REALTIME_ROUTE)
      if (!match) return new Response("Unsupported websocket route.", { status: 404 })

      // Cross-site WebSocket hijacking guard: browsers always send Origin on
      // a socket handshake, and only this site may open one with our cookie.
      if (!isAllowedRealtimeOrigin(request.headers.get("origin"), url.host)) {
        return new Response("This origin may not open realtime connections.", { status: 403 })
      }

      const user = await resolveSessionUser(request, env, ctx)
      if (!user?.id) return new Response("Please sign in to continue.", { status: 401 })

      const [, kind, id] = match
      let channelId = ""
      try {
        channelId = decodeURIComponent(id)
      } catch {
        return new Response("Malformed channel id.", { status: 400 })
      }
      if (kind === "chat" && !(await isAuthorizedForChatChannel(channelId, user.id, (groupId, userId) => isGroupMember(env, groupId, userId)))) {
        return new Response("You're not a participant in this conversation.", { status: 403 })
      }
      if (kind === "inbox" && channelId !== user.id) {
        return new Response("You can't open this channel.", { status: 403 })
      }

      return routeRealtimeRequest(realtimeServiceRequest(request, kind, channelId, user), env)
    }

    return handler.fetch(request, env, ctx)
  },
}
