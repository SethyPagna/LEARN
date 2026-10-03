import { NextResponse, type NextRequest } from "next/server"
import { isApiResponse, requireApiUser } from "@/lib/api"
import { addConnection, calendarSecretKey, openCalendarSecret } from "@/lib/calendar/connection-store"
import { calendarOAuthCookie, exchangeCalendarToken, type CalendarOAuthState } from "@/lib/calendar/oauth"

export async function GET(request: NextRequest) {
  const destination = new URL("/calendar", request.url)
  try {
    const user = await requireApiUser(request)
    if (isApiResponse(user)) { destination.searchParams.set("connection", "signin"); return NextResponse.redirect(destination) }
    const state = openCalendarSecret<CalendarOAuthState>(request.cookies.get(calendarOAuthCookie)?.value || "", await calendarSecretKey(), user.id)
    const params = new URL(request.url).searchParams
    if (state.userId !== user.id || state.expires < Date.now() || state.state !== params.get("state") || !["google", "outlook"].includes(state.provider)) throw new Error("Authorization expired.")
    if (params.has("error") || !params.get("code")) throw new Error("Authorization was not completed.")
    const credentials = await exchangeCalendarToken(state.provider, { grant_type: "authorization_code", code: params.get("code")!, redirect_uri: state.redirectUri, code_verifier: state.verifier })
    if (!credentials.refreshToken) throw new Error("Offline authorization was not granted.")
    await addConnection(user.id, state.provider, state.provider === "google" ? "Google Calendar" : "Outlook", credentials)
    destination.searchParams.set("connection", "connected")
  } catch { destination.searchParams.set("connection", "failed") }
  const response = NextResponse.redirect(destination)
  response.cookies.set(calendarOAuthCookie, "", { path: "/api/calendar/connections", maxAge: 0, httpOnly: true, sameSite: "lax" })
  return response
}
