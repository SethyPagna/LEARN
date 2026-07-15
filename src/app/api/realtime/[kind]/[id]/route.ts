import type { NextRequest } from "next/server"
import { fail, isApiResponse, requireApiUser, withApiErrorBoundary } from "@/lib/api"
import { getCloudflareBindings, type DurableObjectNamespaceLike } from "@/lib/cloudflare"
import { isAuthorizedForChatChannel } from "@/lib/chat-channel"
import { isRealtimeKind } from "@/lib/collaboration-events"
import { query } from "@/lib/db"

function namespaceFor(kind: string, env: Awaited<ReturnType<typeof getCloudflareBindings>>): DurableObjectNamespaceLike | null {
  if (kind === "rooms") return env?.STUDY_ROOM_DO || null
  if (kind === "battles") return env?.STUDY_BATTLE_DO || null
  if (kind === "presence") return env?.PRESENCE_DO || null
  if (kind === "chat") return env?.CHAT_DO || null
  return null
}

async function isGroupMember(groupId: string, userId: string) {
  try {
    const result = await query("SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2 LIMIT 1", [groupId, userId])
    return Boolean(result.rows[0])
  } catch {
    return false
  }
}

async function forwardRealtime(request: NextRequest, context: { params: Promise<{ kind: string; id: string }> }) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user

  const { kind, id } = await context.params
  if (!isRealtimeKind(kind)) return fail("Unsupported realtime channel.", 404)
  if (!id.trim()) return fail("Realtime channel id is required.")
  if (kind === "chat" && !(await isAuthorizedForChatChannel(id, user.id, isGroupMember))) return fail("You're not a participant in this conversation.", 403)

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
