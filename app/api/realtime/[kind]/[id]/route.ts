import type { NextRequest } from "next/server"
import { fail, isApiResponse, requireApiUser } from "@/lib/api"
import { getCloudflareBindings, type DurableObjectNamespaceLike } from "@/lib/cloudflare"
import { isRealtimeKind, type RealtimeKind } from "@/lib/collaboration-events"

function namespaceFor(kind: string, env: Awaited<ReturnType<typeof getCloudflareBindings>>): DurableObjectNamespaceLike | null {
  if (kind === "rooms") return env?.STUDY_ROOM_DO || null
  if (kind === "battles") return env?.STUDY_BATTLE_DO || null
  if (kind === "presence") return env?.PRESENCE_DO || null
  return null
}

function serviceRequest(request: NextRequest, kind: RealtimeKind, id: string) {
  const url = new URL(request.url)
  url.pathname = `/${kind}/${encodeURIComponent(id)}`
  return new Request(url, request)
}

async function forwardRealtime(request: NextRequest, context: { params: Promise<{ kind: string; id: string }> }) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user

  const { kind, id } = await context.params
  if (!isRealtimeKind(kind)) return fail("Unsupported realtime channel.", 404)
  if (!id.trim()) return fail("Realtime channel id is required.")

  const env = await getCloudflareBindings()
  if (env?.LEARN_REALTIME) {
    return env.LEARN_REALTIME.fetch(serviceRequest(request, kind, id))
  }

  const namespace = namespaceFor(kind, env)
  if (!namespace) return fail("Realtime Durable Object binding is not configured.", 503)

  const objectId = namespace.idFromName(`${kind}:${id}`)
  return namespace.get(objectId).fetch(request)
}

export async function GET(request: NextRequest, context: { params: Promise<{ kind: string; id: string }> }) {
  return forwardRealtime(request, context)
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ kind: string; id: string }> }) {
  return forwardRealtime(request, context)
}
