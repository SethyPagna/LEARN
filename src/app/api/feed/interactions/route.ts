import type { NextRequest } from "next/server"
import { fail, isApiResponse, ok, readJsonObject, requireApiUser } from "@/lib/api"
import { recordFeedInteraction } from "@/lib/data"

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const body = await readJsonObject(request)
  if (!String(body.lessonId || body.lesson_id || "").trim()) return fail("A lesson id is required.")

  try {
    return ok({ item: await recordFeedInteraction(user, body) }, { status: 201 })
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to record feed interaction.", 500)
  }
}
