import type { NextRequest } from "next/server"
import { fail, isApiResponse, ok, requireApiUser } from "@/lib/api"
import { getQuiz } from "@/lib/data"

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const { id } = await context.params
  const quiz = await getQuiz(id)
  if (!quiz) return fail("Quiz not found.", 404)
  return ok({ item: quiz })
}
