import type { NextRequest } from "next/server"
import { fail, isApiResponse, ok, requireApiUser } from "@/lib/api"
import { listReviewSchedule, recordReviewResult } from "@/lib/data"

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user

  try {
    return ok(await listReviewSchedule(user))
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to load reviews.", 500)
  }
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const body = await request.json().catch(() => ({}))
  if (!String(body.id || body.reviewItemId || "").trim()) return fail("A review item id is required.")

  try {
    return ok({ item: await recordReviewResult(user, body) }, { status: 201 })
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to record review.", 500)
  }
}
