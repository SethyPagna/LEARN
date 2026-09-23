import type { NextRequest } from "next/server"
import { fail, isApiResponse, ok, requireApiUser, withApiErrorBoundary } from "@/lib/api"
import { getCloudflareBindings, type DurableObjectNamespaceLike } from "@/lib/cloudflare"
import { isRealtimeKind } from "@/lib/collaboration-events"
import { localRealtimeSnapshot } from "@/lib/realtime-broadcast"
import { canAccessRealtimeChannel } from "@/lib/realtime/channel-access"
import {
  isLocalRealtimeMode,
  LOCAL_REALTIME_SECRET_ENV,
  LOCAL_REALTIME_SECRET_HEADER,
  REALTIME_AUTHORIZE_HEADER,
} from "@/lib/realtime/hub-core"

function namespaceFor(kind: string, env: Awaited<ReturnType<typeof getCloudflareBindings>>): DurableObjectNamespaceLike | null {
  if (kind === "rooms") return env?.STUDY_ROOM_DO || null
  if (kind === "battles") return env?.STUDY_BATTLE_DO || null
  if (kind === "presence") return env?.PRESENCE_DO || null
  if (kind === "chat") return env?.CHAT_DO || null
  // A user's personal inbox shares the presence namespace under its own name.
  if (kind === "inbox") return env?.PRESENCE_DO || null
  return null
}

function isLocalAuthorizeRequest(request: NextRequest) {
  if (request.headers.get(REALTIME_AUTHORIZE_HEADER) !== "1") return false
  const secret = process.env[LOCAL_REALTIME_SECRET_ENV]
  return Boolean(isLocalRealtimeMode() && secret && request.headers.get(LOCAL_REALTIME_SECRET_HEADER) === secret)
}

async function forwardRealtime(request: NextRequest, context: { params: Promise<{ kind: string; id: string }> }) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user

  const { kind, id } = await context.params
  if (!isRealtimeKind(kind)) return fail("Unsupported realtime channel.", 404)
  if (!id.trim()) return fail("Realtime channel id is required.")
  if (!(await canAccessRealtimeChannel(kind, id, user.id))) {
    return fail(kind === "chat" ? "You're not a participant in this conversation." : "You can't open this channel.", 403)
  }

  // The local dev server asks this route to vouch for an upgrade before it
  // joins the socket to its hub — the same checks, answered with who it is.
  if (isLocalAuthorizeRequest(request)) {
    return ok({ ok: true, user: { id: user.id, name: user.name, username: user.username } })
  }

  if (request.method === "DELETE" && user.role !== "admin") {
    return fail("Only an admin can reset a realtime channel.", 403)
  }

  if (isLocalRealtimeMode()) {
    if (request.method === "DELETE") return ok({ ok: true })
    const snapshot = await localRealtimeSnapshot(kind, id)
    return snapshot ? ok(snapshot) : fail("The local realtime hub is not running.", 503)
  }

  const env = await getCloudflareBindings()
  const namespace = namespaceFor(kind, env)
  if (!namespace) return fail("Realtime Durable Object binding is not configured.", 503)

  const objectId = namespace.idFromName(`${kind}:${id}`)
  // Forward a plain Request rather than the NextRequest instance itself: NextRequest
  // carries extra internal state that doesn't reliably survive being passed straight
  // into a Durable Object stub's fetch().
  const forwardedRequest = new Request(request.url, {
    method: request.method,
    headers: request.headers,
  })
  return namespace.get(objectId).fetch(forwardedRequest)
}

export const GET = withApiErrorBoundary(async (request: NextRequest, context: { params: Promise<{ kind: string; id: string }> }) => {
  return forwardRealtime(request, context)
})

export const DELETE = withApiErrorBoundary(async (request: NextRequest, context: { params: Promise<{ kind: string; id: string }> }) => {
  return forwardRealtime(request, context)
})
