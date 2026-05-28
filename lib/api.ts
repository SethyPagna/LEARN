import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { getCurrentUserFromToken, SESSION_COOKIE, type User } from "./data"
import { isDatabaseConfigured } from "./db"

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  const value: unknown = await request.json().catch(() => ({}))
  return isPlainRecord(value) ? value : {}
}

function isMutation(method: string) {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase())
}

function hasTrustedOrigin(request: NextRequest) {
  const origin = request.headers.get("origin")
  if (!origin) return true
  const host = request.headers.get("host")
  if (!host) return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

export async function requireApiUser(request: NextRequest): Promise<User | NextResponse> {
  if (!isDatabaseConfigured()) {
    return fail("Cloudflare D1 is not configured. Set LEARN_DB binding or Cloudflare D1 API credentials.", 503)
  }

  if (isMutation(request.method) && !hasTrustedOrigin(request)) {
    return fail("Cross-origin mutations are blocked.", 403)
  }

  const user = await getCurrentUserFromToken(request.cookies.get(SESSION_COOKIE)?.value)
  if (!user) return fail("Please sign in to continue.", 401)
  return user
}

export function isApiResponse(value: User | NextResponse): value is NextResponse {
  return value instanceof NextResponse
}
