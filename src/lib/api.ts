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
  if (!(await isDatabaseConfigured())) {
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

/**
 * Wraps a route handler so a thrown Error becomes a clean `{ error }` JSON
 * response instead of an unhandled exception. Next.js's production error
 * handling returns those as an opaque 500 with an empty body — fine for a
 * genuine bug, but most of what lib/data.ts and friends throw are ordinary,
 * client-triggerable conditions (not found, validation, conflicts) that
 * deserve a real message and, usually, a 4xx status.
 *
 * Defaults to 400 to match the try/catch pattern already used by hand in
 * several routes (`catch (error) { return fail(error.message, 400) }`);
 * pass a different default (e.g. 404) for handlers where "not found" is the
 * dominant failure mode.
 */
export function withApiErrorBoundary<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response> | Response,
  defaultStatus = 400,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await handler(...args)
    } catch (error) {
      console.error(error)
      return fail(error instanceof Error ? error.message : "Something went wrong. Please try again.", defaultStatus)
    }
  }
}
