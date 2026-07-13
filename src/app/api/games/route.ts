import type { NextRequest } from "next/server"
import { isApiResponse, ok, readJsonObject, requireApiUser, withApiErrorBoundary } from "@/lib/api"
import { listGameAttempts, recordGameAttempt } from "@/lib/data"

export const GET = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  return ok({ items: await listGameAttempts(user) })
})

export const POST = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const body = await readJsonObject(request)
  return ok({ item: await recordGameAttempt(user, body) }, { status: 201 })
})
