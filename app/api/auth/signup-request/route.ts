import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { fail } from "@/lib/api"
import { normalizeAccessRequest } from "@/lib/auth-entry"
import { isDatabaseConfigured } from "@/lib/db"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"
import { createId, ensureDatabase, logAudit } from "@/lib/schema"

export async function POST(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return fail("Cloudflare D1 is not configured. Access requests need the LEARN database.", 503)
  }

  const input = await request.json().catch(() => ({}))
  const validation = normalizeAccessRequest(input)
  if (!validation.ok) return fail(validation.error, 400)

  const clientIp = getClientIp(request.headers)
  const limit = await checkRateLimit({
    key: `signup-request:${clientIp}:${validation.value.email}`,
    limit: 4,
    windowMs: 60 * 60 * 1000,
  })
  if (!limit.allowed) {
    const response = fail("Too many access requests. Try again later.", 429)
    response.headers.set("retry-after", String(Math.ceil((limit.resetAt - Date.now()) / 1000)))
    return response
  }

  await ensureDatabase()
  const requestId = createId("access")
  await logAudit({
    action: "request_access",
    entity: "auth",
    entityId: requestId,
    details: validation.value,
  })

  return NextResponse.json({
    id: requestId,
    message: "Access request saved. An admin can review it from audit activity.",
  })
}
