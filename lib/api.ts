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

export async function requireApiUser(request: NextRequest): Promise<User | NextResponse> {
  if (!isDatabaseConfigured()) {
    return fail("DATABASE_URL is not configured. Use Docker run scripts or set a Postgres connection string.", 503)
  }

  const user = await getCurrentUserFromToken(request.cookies.get(SESSION_COOKIE)?.value)
  if (!user) return fail("Please sign in to continue.", 401)
  return user
}

export function isApiResponse(value: User | NextResponse): value is NextResponse {
  return value instanceof NextResponse
}
