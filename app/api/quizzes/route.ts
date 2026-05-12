import type { NextRequest } from "next/server"
import { isApiResponse, ok, requireApiUser } from "@/lib/api"
import { listQuizzes } from "@/lib/data"

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  return ok({ items: await listQuizzes() })
}
