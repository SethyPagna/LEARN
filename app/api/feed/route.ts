import type { NextRequest } from "next/server"
import { fail, isApiResponse, ok, requireApiUser } from "@/lib/api"
import { listFeed } from "@/lib/data"

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const topics = request.nextUrl.searchParams.getAll("topic")

  try {
    return ok({ items: await listFeed(user, topics) })
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to load feed.", 500)
  }
}
