import { listChatReactions } from "@/lib/social-data"
import type { NextRequest } from "next/server"
import { fail, isApiResponse, ok, readJsonObject, requireApiUser, withApiErrorBoundary } from "@/lib/api"
import { listChatMessages, listChatThreads, postChatMessage, sanitizeClientChatMetadata } from "@/lib/data"

export const GET = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const threadId = request.nextUrl.searchParams.get("threadId")
  if (threadId) {
    const items = await listChatMessages(user, threadId)
    return ok({ items, reactions: await listChatReactions(user, threadId) })
  }
  return ok({ items: await listChatThreads(user) })
})

export const POST = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const body = await readJsonObject(request)
  if (!String(body.body || "").trim()) return fail("Message body is required.")
  const result = await postChatMessage(user, { ...body, metadata: await sanitizeClientChatMetadata(user, body.metadata) })

  return ok({ item: result.item, threadId: result.threadId, messageId: result.messageId }, { status: 201 })
})
