import type { NextRequest } from "next/server"
import { isApiResponse, ok, requireApiUser, withApiErrorBoundary } from "@/lib/api"
import { getOrCreateCalendarFeedToken } from "@/lib/data"

/**
 * POST /api/calendar/feed — hand the caller a subscription URL.
 *
 * A mutation rather than a GET because it can mint the token, so it goes
 * through `requireApiUser` and picks up the same-origin (CSRF) check every
 * other mutation gets. It is also why the URL is built from the request's own
 * origin instead of a configured base: the link has to be copy-pasteable from
 * whichever host the user is actually on, including a local dev server.
 */
export const POST = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user

  const token = await getOrCreateCalendarFeedToken(user)
  return ok({ url: `${new URL(request.url).origin}/api/calendar/ics?token=${token}` })
})
