import type { NextRequest } from "next/server"
import { isApiResponse, ok, readJsonObject, requireApiUser, withApiErrorBoundary } from "@/lib/api"
import { setChatReaction } from "@/lib/social-data"

export const POST = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  return ok(await setChatReaction(user, await readJsonObject(request)))
})
