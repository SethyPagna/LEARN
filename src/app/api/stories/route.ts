import type { NextRequest } from "next/server"
import { fail, isApiResponse, ok, readJsonObject, requireApiUser, withApiErrorBoundary } from "@/lib/api"
import { createStory, deleteStory, listStories } from "@/lib/social-data"
import { checkRateLimit } from "@/lib/rate-limit"

export const GET = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  return ok({ items: await listStories(user) }, { headers: { "cache-control": "private, no-store" } })
})

export const POST = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const limit = await checkRateLimit({ key: `story:${user.id}`, limit: 20, windowMs: 60 * 60 * 1000 })
  if (!limit.allowed) return fail("Too many stories. Try again later.", 429)
  return ok({ item: await createStory(user, await readJsonObject(request)) }, { status: 201 })
})

export const DELETE = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const id = request.nextUrl.searchParams.get("id") || ""
  if (!id) return fail("Choose a story to delete.")
  await deleteStory(user, id)
  return ok({ deleted: true })
})
