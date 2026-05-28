import type { NextRequest } from "next/server"
import { isApiResponse, ok, readJsonObject, requireApiUser } from "@/lib/api"
import { deleteCalendarEvent, listCalendarEvents, saveCalendarEvent } from "@/lib/data"

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  return ok({ items: await listCalendarEvents(user) })
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const body = await readJsonObject(request)
  return ok({ item: await saveCalendarEvent(user, body) }, { status: 201 })
}

export async function PUT(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const body = await readJsonObject(request)
  return ok({ item: await saveCalendarEvent(user, body) })
}

export async function DELETE(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const id = new URL(request.url).searchParams.get("id") || ""
  await deleteCalendarEvent(user, id)
  return ok({ success: true })
}
