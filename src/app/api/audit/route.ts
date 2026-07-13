import type { NextRequest } from "next/server"
import { isApiResponse, ok, requireApiUser, withApiErrorBoundary } from "@/lib/api"
import { listAuditLogs } from "@/lib/data"

export const GET = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  return ok({ items: await listAuditLogs(user) })
})
