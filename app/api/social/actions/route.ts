import type { NextRequest } from "next/server"
import { fail, isApiResponse, ok, readJsonObject, requireApiUser } from "@/lib/api"
import { listSocialActions, recordSocialAction } from "@/lib/data"
import { normalizeSocialActionInput } from "@/lib/sharing"

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const { searchParams } = new URL(request.url)
  try {
    return ok({
      items: await listSocialActions(user, {
        targetType: searchParams.get("targetType") || searchParams.get("target_type"),
        targetId: searchParams.get("targetId") || searchParams.get("target_id"),
        limit: Number(searchParams.get("limit") || 12),
      }),
    })
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to load social actions.", 500)
  }
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const body = await readJsonObject(request)
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
