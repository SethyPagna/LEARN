import type { NextRequest } from "next/server"
import { fail, isApiResponse, ok, readJsonObject, requireApiUser, withApiErrorBoundary } from "@/lib/api"
import { ensureDatabase } from "@/lib/schema"
import { deleteNotification, listNotifications, markNotificationsRead } from "@/lib/notifications"

export const GET = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  await ensureDatabase()
  const unreadOnly = request.nextUrl.searchParams.get("filter") === "unread"
  const limit = Number(request.nextUrl.searchParams.get("limit") || 40)
  return ok(await listNotifications(user.id, { limit, unreadOnly }))
})

/** `{ all: true }` or `{ ids: [...] }`; `read: false` marks them unread again. */
export const PATCH = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const body = await readJsonObject(request)
  const ids = Array.isArray(body.ids) ? body.ids.map(String) : []
  if (!body.all && !ids.length) return fail("Say which notifications to update.")
  await markNotificationsRead(user.id, { all: body.all === true, ids, read: body.read !== false })
  return ok(await listNotifications(user.id))
})

export const DELETE = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const id = request.nextUrl.searchParams.get("id")
  if (!id) return fail("A notification id is required.")
  await deleteNotification(user.id, id)
  return ok({ deleted: true })
})
