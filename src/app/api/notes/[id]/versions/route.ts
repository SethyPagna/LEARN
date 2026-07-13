import type { NextRequest } from "next/server"
import { isApiResponse, ok, requireApiUser, withApiErrorBoundary } from "@/lib/api"
import { listNoteVersions } from "@/lib/data"

export const GET = withApiErrorBoundary(async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const { id } = await context.params
  return ok({ items: await listNoteVersions(user, id) })
})
