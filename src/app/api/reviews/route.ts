import type { NextRequest } from "next/server"
import { fail, isApiResponse, ok, readJsonObject, requireApiUser, withApiErrorBoundary } from "@/lib/api"
import { createPracticeReviewItems, createPracticeReviewItemsFromSession, listReviewSchedule, recordReviewResult } from "@/lib/data"

export const GET = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user

  try {
    return ok(await listReviewSchedule(user))
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to load reviews.", 500)
  }
})

export const POST = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const body = await readJsonObject(request)
  const sessionId = String(body.sessionId || body.session_id || "").trim()
  if (sessionId) {
    try {
      return ok({ item: await createPracticeReviewItemsFromSession(user, sessionId) }, { status: 201 })
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Failed to create review cards from practice session.", 500)
    }
  }
  if (Array.isArray(body.items)) {
    try {
      return ok({ item: await createPracticeReviewItems(user, body) }, { status: 201 })
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Failed to create review cards.", 500)
    }
  }
  if (!String(body.id || body.reviewItemId || "").trim()) return fail("A review item id is required.")

  try {
    return ok({ item: await recordReviewResult(user, body) }, { status: 201 })
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to record review.", 500)
  }
})
