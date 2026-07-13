import type { NextRequest } from "next/server"
import { fail, isApiResponse, ok, readJsonObject, requireApiUser, withApiErrorBoundary } from "@/lib/api"
import { listModerationItems, saveModerationItem } from "@/lib/data"

export const GET = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user

  try {
    return ok({ items: await listModerationItems(user) })
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to load moderation queue.", 500)
  }
})

export const POST = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const body = await readJsonObject(request)

  try {
    return ok({ item: await saveModerationItem(user, body) }, { status: 201 })
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to save moderation item.", 500)
  }
})
