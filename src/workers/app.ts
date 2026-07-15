// @ts-ignore OpenNext generates this module before Wrangler bundles the Worker.
import { default as openNextHandler } from "../../.open-next/worker.js"
import { isAuthorizedForChatChannel } from "../lib/chat-channel"
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

const REALTIME_ROUTE = /^\/api\/realtime\/(rooms|battles|presence|chat)\/([^/]+)$/
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

async function resolveSessionUser(request: Request, env: AppWorkerEnv, ctx: ExecutionContext) {
  const response = await handler.fetch(sessionRequest(request), env, ctx)
  if (!response.ok) return null
  const body = await response.json().catch(() => null) as { user?: { id?: string } | null } | null
  return body?.user?.id ? body.user : null
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
      const match = new URL(request.url).pathname.match(REALTIME_ROUTE)
      if (!match) return new Response("Unsupported websocket route.", { status: 404 })

      const user = await resolveSessionUser(request, env, ctx)
      if (!user?.id) return new Response("Please sign in to continue.", { status: 401 })

      const [, kind, id] = match
      const channelId = decodeURIComponent(id)
      if (kind === "chat" && !(await isAuthorizedForChatChannel(channelId, user.id, (groupId, userId) => isGroupMember(env, groupId, userId)))) {
        return new Response("You're not a participant in this conversation.", { status: 403 })
      }

      return routeRealtimeRequest(realtimeServiceRequest(request, kind, channelId), env)
    }

    return handler.fetch(request, env, ctx)
  },
}
