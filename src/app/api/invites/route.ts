import type { NextRequest } from "next/server"
import { fail, isApiResponse, ok, readJsonObject, requireApiUser, withApiErrorBoundary } from "@/lib/api"
import { createWorkspaceInvite } from "@/lib/data"

export const POST = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const body = await readJsonObject(request)
  try {
    return ok({ item: await createWorkspaceInvite(user, body) }, { status: 201 })
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Unable to create invite.", 403)
  }
})
