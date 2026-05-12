import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { authenticateUser, createUserSession, SESSION_COOKIE } from "@/lib/data"
import { isDatabaseConfigured } from "@/lib/db"
import { fail } from "@/lib/api"

export async function POST(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return fail("Cloudflare D1 is not configured. Set LEARN_DB binding or Cloudflare D1 API credentials.", 503)
  }

  const body = await request.json().catch(() => ({}))
  const identifier = String(body.identifier || "").trim()
  const password = String(body.password || "")
  if (!identifier || !password) return fail("Username/email and password are required.", 400)

  const user = await authenticateUser(identifier, password)
  if (!user) return fail("Invalid username or password.", 401)

  const session = await createUserSession(user.id)
  const response = NextResponse.json({ user })
  response.cookies.set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    expires: session.expiresAt,
    path: "/",
  })
  return response
}
