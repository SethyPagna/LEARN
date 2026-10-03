import type { NextRequest } from "next/server"
import { fail, isApiResponse, ok, readJsonObject, requireApiUser, withApiErrorBoundary } from "@/lib/api"
import { listConnections, ownedConnection } from "@/lib/calendar/connection-store"
import { changeConnectedEvent, readConnectedCalendar } from "@/lib/calendar/connected-calendars"
import { parseCalendarRange, parseEventInput } from "@/lib/calendar/connections-types"

export const GET = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const params = new URL(request.url).searchParams
  const range = parseCalendarRange(params.get("start"), params.get("end"))
  const connections = await listConnections(user.id)
  const results = await Promise.all(connections.map(async connection => {
    try { return { connectionId: connection.id, label: connection.label, ...await readConnectedCalendar(connection, range), error: "" } }
    catch (error) { return { connectionId: connection.id, label: connection.label, calendars: [], items: [], error: error instanceof Error ? error.message : "Calendar unavailable." } }
  }))
  return ok({ results, checkedAt: new Date().toISOString() }, { headers: { "Cache-Control": "private, no-store" } })
})

async function mutate(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const body = await readJsonObject(request)
  const connection = await ownedConnection(user.id, String(body.connectionId || ""))
  const calendarId = String(body.calendarId || ""), eventId = typeof body.eventId === "string" ? body.eventId : undefined
  if (!calendarId || request.method !== "POST" && !eventId) return fail("Choose a calendar and event.")
  await changeConnectedEvent(connection, calendarId, { eventId: request.method === "POST" ? undefined : eventId, etag: typeof body.etag === "string" ? body.etag : undefined, recurrenceId: typeof body.recurrenceId === "string" ? body.recurrenceId : undefined, remove: request.method === "DELETE", input: request.method === "DELETE" ? undefined : parseEventInput(body) })
  return ok({ success: true })
}
export const POST = withApiErrorBoundary(mutate)
export const PUT = withApiErrorBoundary(mutate)
export const DELETE = withApiErrorBoundary(mutate)
