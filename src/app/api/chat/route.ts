import type { NextRequest } from "next/server"
import { fail, isApiResponse, ok, readJsonObject, requireApiUser, withApiErrorBoundary } from "@/lib/api"
import { groupChatChannelId } from "@/lib/chat-channel"
import { listChatMessages, listChatThreads, postChatMessage } from "@/lib/data"
import { broadcastRealtimeEvent } from "@/lib/realtime-broadcast"

export const GET = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const threadId = request.nextUrl.searchParams.get("threadId")
  if (threadId) return ok({ items: await listChatMessages(user, threadId) })
  return ok({ items: await listChatThreads(user) })
})

export const POST = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const body = await readJsonObject(request)
  if (!String(body.body || "").trim()) return fail("Message body is required.")
  const result = await postChatMessage(user, body)

  // Fire-and-forget: push the message live to anyone else currently viewing this
  // group's chat. The REST write above is already durable, so a failed broadcast
  // never loses data — the recipient just sees it on their next reload instead.
  if (result.groupId) {
    void broadcastRealtimeEvent("chat", groupChatChannelId(result.groupId), {
      type: "chat-message",
      userId: user.id,
      payload: {
        threadId: result.threadId,
        messageId: result.messageId,
        body: String((result.item as Record<string, unknown>)?.body || ""),
        createdAt: String((result.item as Record<string, unknown>)?.created_at || new Date().toISOString()),
      },
    })
  }

  return ok({ item: result.item, threadId: result.threadId, messageId: result.messageId }, { status: 201 })
})
