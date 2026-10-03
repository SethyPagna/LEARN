import type { NextRequest } from "next/server"
import { fail, isApiResponse, ok, requireApiUser, withApiErrorBoundary } from "@/lib/api"
import { parseTimezoneOffset } from "@/lib/today"
import { getTodayData } from "@/lib/today-data"

/** GET /api/today?tz=<Date#getTimezoneOffset()>: the Today page's streak, plan and recents. */
export const GET = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user

  try {
    return ok(await getTodayData(user, parseTimezoneOffset(request.nextUrl.searchParams.get("tz"))))
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to load today.", 500)
  }
})
