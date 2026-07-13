import { getCloudflareBindings, type DurableObjectNamespaceLike } from "@/lib/cloudflare"
import type { CollaborationEventType, RealtimeKind } from "@/lib/collaboration-events"

function namespaceForRealtimeKind(kind: RealtimeKind, env: Awaited<ReturnType<typeof getCloudflareBindings>>): DurableObjectNamespaceLike | null {
  if (kind === "rooms") return env?.STUDY_ROOM_DO || null
  if (kind === "battles") return env?.STUDY_BATTLE_DO || null
  if (kind === "presence") return env?.PRESENCE_DO || null
  if (kind === "chat") return env?.CHAT_DO || null
  return null
}

/**
 * Pushes a server-validated event to every client currently connected to a
 * realtime channel (kind + id), without requiring the caller to hold a
 * WebSocket connection itself. Used so REST endpoints (e.g. POST /api/chat)
 * can broadcast the row they just persisted to anyone else viewing the same
 * thread live. Failures are swallowed — realtime push is a nice-to-have on
 * top of the durable REST write, never a requirement for it to succeed.
 */
export async function broadcastRealtimeEvent(
  kind: RealtimeKind,
  id: string,
  event: { type: CollaborationEventType; userId?: string; payload: Record<string, unknown> },
) {
  try {
    const env = await getCloudflareBindings()
    const namespace = namespaceForRealtimeKind(kind, env)
    if (!namespace || !id.trim()) return false

    const objectId = namespace.idFromName(`${kind}:${id}`)
    const response = await namespace.get(objectId).fetch(
      new Request(`https://realtime.internal/${kind}/${encodeURIComponent(id)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(event),
      }),
    )
    return response.ok
  } catch {
    return false
  }
}
