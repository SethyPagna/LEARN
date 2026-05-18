import type { NextRequest } from "next/server"
import { fail, isApiResponse, ok, requireApiUser } from "@/lib/api"
import { recordSocialAction } from "@/lib/data"
import { normalizeSocialActionInput } from "@/lib/sharing"

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const body = await request.json().catch(() => ({}))
  try {
    normalizeSocialActionInput(body)
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Invalid social action.", 400)
  }

  try {
    return ok({ item: await recordSocialAction(user, body) }, { status: 201 })
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to record social action.", 500)
  }
}
