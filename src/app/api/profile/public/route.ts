import type { NextRequest } from "next/server"
import { fail, ok, withApiErrorBoundary } from "@/lib/api"
import { getCurrentUserFromToken, getPublicProfile, SESSION_COOKIE } from "@/lib/data"

/**
 * A profile as the requester is allowed to see it. Signing in is optional (a
 * public profile is public), but the relationship to the owner comes from the
 * session only: private and connections-only profiles stay closed to anyone
 * the owner has not accepted.
 */
export const GET = withApiErrorBoundary(async (request: NextRequest) => {
  const username = (request.nextUrl.searchParams.get("username") || "").trim()
  if (!username) return fail("A username is required.")

  const viewer = await getCurrentUserFromToken(request.cookies.get(SESSION_COOKIE)?.value)
  const profile = await getPublicProfile(username, viewer)
  if (!profile) return fail("Profile not found.", 404)
  return ok({ item: profile })
})
