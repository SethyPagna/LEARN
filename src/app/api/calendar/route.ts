import type { NextRequest } from "next/server"
import { isApiResponse, ok, readJsonObject, requireApiUser, withApiErrorBoundary } from "@/lib/api"
import { deleteCalendarEvent, listCalendarEvents, saveCalendarEvent } from "@/lib/data"

export const GET = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  return ok({ items: await listCalendarEvents(user) })
})

export const POST = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const body = await readJsonObject(request)
  return ok({ item: await saveCalendarEvent(user, body) }, { status: 201 })
})

export const PUT = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const body = await readJsonObject(request)
  return ok({ item: await saveCalendarEvent(user, body) })
})

export const DELETE = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const id = new URL(request.url).searchParams.get("id") || ""
  await deleteCalendarEvent(user, id)
  return ok({ success: true })
})
