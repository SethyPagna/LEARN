import type { NextRequest } from "next/server"
import { fail, isApiResponse, ok, requireApiUser } from "@/lib/api"
import { recordQuizAttempt } from "@/lib/data"

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user

  const body = await request.json().catch(() => ({}))
  const quizId = String(body.quizId || "")
  const answers = Array.isArray(body.answers) ? body.answers : []
  if (!quizId || answers.length === 0) return fail("Quiz id and answers are required.")
  return ok(await recordQuizAttempt(user, { quizId, answers }))
}
