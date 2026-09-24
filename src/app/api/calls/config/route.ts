import type { NextRequest } from "next/server"
import { isApiResponse, ok, requireApiUser, withApiErrorBoundary } from "@/lib/api"
import { callIceConfiguration } from "@/lib/call-config"
import { getCloudflareBindings } from "@/lib/cloudflare"

export const GET = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const bindings = await getCloudflareBindings()
  return ok(callIceConfiguration({ ...process.env, ...bindings }, user.id), { headers: { "cache-control": "private, no-store" } })
})
