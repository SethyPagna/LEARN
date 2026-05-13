import type { NextRequest } from "next/server"
import { isApiResponse, ok, requireApiUser } from "@/lib/api"
import { updatePreferences } from "@/lib/data"

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  return ok({ preferences: user.preferences })
}

export async function PUT(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const body = await request.json().catch(() => ({}))
  const preferences = await updatePreferences(user, typeof body === "object" && body ? body : {})
  return ok({ preferences })
}
