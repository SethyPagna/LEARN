import type { NextRequest } from "next/server"
import { fail, isApiResponse, ok, readJsonObject, requireApiUser, withApiErrorBoundary } from "@/lib/api"
import { addConnection, calendarSecretKey, listConnections, removeConnection, sealCalendarSecret } from "@/lib/calendar/connection-store"
import { beginCalendarOAuth, calendarOAuthCookie, connectionAvailability } from "@/lib/calendar/oauth"
import { discoverAppleCredentials, listAppleCalendars } from "@/lib/calendar/apple"
import { checkRateLimit } from "@/lib/rate-limit"

export const GET = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  return ok({ providers: await connectionAvailability(), connections: (await listConnections(user.id)).map(({ id, provider, label }) => ({ id, provider, label })) }, { headers: { "Cache-Control": "private, no-store" } })
})

export const POST = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  if (!(await checkRateLimit({ key: `calendar-connect:${user.id}`, limit: 12, windowMs: 60_000 })).allowed) return fail("Please wait before connecting another account.", 429)
  if ((await listConnections(user.id)).length >= 8) return fail("You can connect up to eight calendar accounts.")
  const body = await readJsonObject(request)
  const secret = await calendarSecretKey()
  if (body.provider === "apple") {
    const credentials = await discoverAppleCredentials(String(body.username || "").trim(), String(body.password || "").trim())
    await listAppleCalendars(credentials, "verify")
    const id = await addConnection(user.id, "apple", credentials.username!, credentials)
    return ok({ id }, { status: 201 })
  }
  if (body.provider !== "google" && body.provider !== "outlook") return fail("Choose a calendar provider.")
  const flow = await beginCalendarOAuth(user.id, body.provider, new URL(request.url).origin)
  const response = ok({ url: flow.url })
  response.cookies.set(calendarOAuthCookie, sealCalendarSecret(flow.state, secret, user.id), { httpOnly: true, sameSite: "lax", secure: new URL(request.url).protocol === "https:", path: "/api/calendar/connections", maxAge: 600 })
  return response
})

export const DELETE = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  await removeConnection(user.id, new URL(request.url).searchParams.get("id") || "")
  return ok({ success: true })
})
