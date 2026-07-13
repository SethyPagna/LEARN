import type { NextRequest } from "next/server"
import { fail, isApiResponse, ok, readJsonObject, requireApiUser, withApiErrorBoundary } from "@/lib/api"
import { listChatThreads, postChatMessage } from "@/lib/data"

export const GET = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  return ok({ items: await listChatThreads(user) })
})

export const POST = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const body = await readJsonObject(request)
  if (!String(body.body || "").trim()) return fail("Message body is required.")
  return ok({ item: await postChatMessage(user, body) }, { status: 201 })
})
