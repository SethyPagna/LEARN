import type { NextRequest } from "next/server"
import { fail, isApiResponse, ok, requireApiUser } from "@/lib/api"
import { listAchievements } from "@/lib/data"

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user

  try {
    return ok({ items: await listAchievements(user) })
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to load achievements.", 500)
  }
}
