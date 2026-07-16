import type { NextRequest } from "next/server"
import { isApiResponse, ok, requireApiUser, withApiErrorBoundary } from "@/lib/api"
import { joinGroup, leaveGroup } from "@/lib/data"

export const POST = withApiErrorBoundary(async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const { id } = await context.params
  return ok({ item: await joinGroup(user, id) })
})

export const DELETE = withApiErrorBoundary(async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const { id } = await context.params
  return ok(await leaveGroup(user, id))
})
