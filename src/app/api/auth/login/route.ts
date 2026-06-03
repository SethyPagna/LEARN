import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { authenticateUser, createUserSession, SESSION_COOKIE } from "@/lib/data"
import { isDatabaseConfigured } from "@/lib/db"
import { fail, readJsonObject } from "@/lib/api"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"

export async function POST(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return fail("Cloudflare D1 is not configured. Set LEARN_DB binding or Cloudflare D1 API credentials.", 503)
  }

  const body = await readJsonObject(request)
  const identifier = String(body.identifier || "").trim().slice(0, 254)
  const password = String(body.password || "")
  if (!identifier || !password) return fail("Username/email and password are required.", 400)
  if (password.length > 1024) return fail("Invalid username or password.", 401)

  const clientIp = getClientIp(request.headers)
  const limit = await checkRateLimit({
    key: `login:${clientIp}:${identifier.toLowerCase()}`,
    limit: 8,
    windowMs: 10 * 60 * 1000,
  })
  if (!limit.allowed) {
    const response = fail("Too many sign-in attempts. Try again later.", 429)
    response.headers.set("retry-after", String(Math.ceil((limit.resetAt - Date.now()) / 1000)))
    return response
  }

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
