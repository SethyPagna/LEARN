import type { NextRequest } from "next/server"
import { getCurrentUserFromToken, SESSION_COOKIE } from "@/lib/data"
import { isDatabaseConfigured } from "@/lib/db"
import { fail, ok, withApiErrorBoundary } from "@/lib/api"

export const GET = withApiErrorBoundary(async (request: NextRequest) => {
  if (!isDatabaseConfigured()) return ok({ user: null, databaseConfigured: false })
  const user = await getCurrentUserFromToken(request.cookies.get(SESSION_COOKIE)?.value)
  return ok({ user, databaseConfigured: true })
})
