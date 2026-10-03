import { getCloudflareBindings, type DurableObjectNamespaceLike } from "@/lib/cloudflare"
import type { CollaborationEventType, RealtimeKind } from "@/lib/collaboration-events"
import {
  getLocalRealtimeHub,
  isLocalRealtimeMode,
  LOCAL_REALTIME_RPC_URL_ENV,
  LOCAL_REALTIME_SECRET_ENV,
  LOCAL_REALTIME_SECRET_HEADER,
  type PresenceMember,
} from "@/lib/realtime/hub-core"

function namespaceForRealtimeKind(kind: RealtimeKind, env: Awaited<ReturnType<typeof getCloudflareBindings>>): DurableObjectNamespaceLike | null {
  if (kind === "rooms") return env?.STUDY_ROOM_DO || null
  if (kind === "battles") return env?.STUDY_BATTLE_DO || null
  if (kind === "presence") return env?.PRESENCE_DO || null
  if (kind === "chat") return env?.CHAT_DO || null
  if (kind === "inbox") return env?.PRESENCE_DO || null
  return null
}

export interface RealtimeBroadcastEvent {
  type: CollaborationEventType
  userId?: string
  payload: Record<string, unknown>
}

/**
 * Loopback call into the local dev server's hub, for the case where this
 * route runs in a different process from the hub. Guarded by the per-run
 * secret the dev server generated.
 */
async function localRpc<T>(body: Record<string, unknown>): Promise<T | null> {
  const url = process.env[LOCAL_REALTIME_RPC_URL_ENV]
  const secret = process.env[LOCAL_REALTIME_SECRET_ENV]
  if (!url || !secret) return null
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", [LOCAL_REALTIME_SECRET_HEADER]: secret },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(4000),
    })
    return response.ok ? ((await response.json()) as T) : null
  } catch {
    return null
  }
}

/**
 * Pushes a server-validated event to every client currently connected to a
 * realtime channel (kind + id), without requiring the caller to hold a
 * WebSocket connection itself. Used so REST endpoints (e.g. POST /api/chat)
 * can broadcast the row they just persisted to anyone else viewing the same
 * thread live. `to` narrows delivery to one user's sockets on that channel.
 * Failures are swallowed — realtime push is a nice-to-have on top of the
 * durable REST write, never a requirement for it to succeed.
 *
 * Transport order: the in-process local hub (`pnpm dev`), the local hub over
 * loopback, then the Durable Object (deployed Worker).
 */
export async function broadcastRealtimeEvent(
  kind: RealtimeKind,
  id: string,
  event: RealtimeBroadcastEvent,
  options: { to?: string } = {},
) {
  if (!id.trim()) return false
  try {
    const localHub = getLocalRealtimeHub()
    if (localHub) {
      localHub.broadcast(kind, id, event, options)
      return true
    }
    if (isLocalRealtimeMode()) {
      const result = await localRpc<{ delivered: number }>({ op: "broadcast", kind, id, event, to: options.to })
      return Boolean(result)
    }

    const env = await getCloudflareBindings()
    const namespace = namespaceForRealtimeKind(kind, env)
    if (!namespace) return false

    const objectId = namespace.idFromName(`${kind}:${id}`)
    const response = await namespace.get(objectId).fetch(
      new Request(`https://realtime.internal/${kind}/${encodeURIComponent(id)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...event, ...(options.to ? { to: options.to } : {}) }),
      }),
    )
    return response.ok
  } catch {
    return false
  }
}

/** Sends the same event to several users' personal inbox channels. */
export async function broadcastToInboxes(userIds: string[], event: RealtimeBroadcastEvent) {
  const unique = [...new Set(userIds.filter(Boolean))]
  const results = await Promise.all(unique.map((userId) => broadcastRealtimeEvent("inbox", userId, event)))
  return results.filter(Boolean).length
}

export async function localRealtimeSnapshot(kind: RealtimeKind, id: string) {
  const localHub = getLocalRealtimeHub()
  if (localHub) return localHub.snapshot(kind, id)
  return localRpc<{ connections: number; users: PresenceMember[]; events: unknown[] }>({ op: "snapshot", kind, id })
}

/**
 * Which of `userIds` currently have the app open (an inbox socket). Locally
 * the hub answers directly; deployed, each user's inbox Durable Object
 * reports its own connection count.
 */
export async function onlineUserIds(userIds: string[]) {
  const unique = [...new Set(userIds.filter(Boolean))].slice(0, 200)
  if (!unique.length) return []

  const localHub = getLocalRealtimeHub()
  if (localHub) return localHub.onlineUserIds(unique)
  if (isLocalRealtimeMode()) {
    const result = await localRpc<{ online: string[] }>({ op: "online", userIds: unique })
    return result?.online || []
  }

  try {
    const env = await getCloudflareBindings()
    const namespace = namespaceForRealtimeKind("inbox", env)
    if (!namespace) return []
    const checks = await Promise.all(
      unique.map(async (userId) => {
        try {
          const response = await namespace.get(namespace.idFromName(`inbox:${userId}`)).fetch(
            new Request(`https://realtime.internal/inbox/${encodeURIComponent(userId)}`, { method: "GET" }),
          )
          const body = (await response.json().catch(() => null)) as { connections?: number } | null
          return (body?.connections || 0) > 0 ? userId : null
        } catch {
          return null
        }
      }),
    )
    return checks.filter((userId): userId is string => Boolean(userId))
  } catch {
    return []
  }
}
