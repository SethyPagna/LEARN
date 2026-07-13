import type { NextRequest } from "next/server"
import { fail, isApiResponse, ok, requireApiUser, withApiErrorBoundary } from "@/lib/api"
import { getDashboardData } from "@/lib/data"

export const GET = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user

  try {
    return ok(await getDashboardData(user))
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to load dashboard.", 500)
  }
})
