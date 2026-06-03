import type { NextRequest } from "next/server"
import { fail, isApiResponse, isPlainRecord, ok, readJsonObject, requireApiUser } from "@/lib/api"
import { recordQuizAttempt } from "@/lib/data"

interface QuizAttemptAnswerInput {
  questionId: string
  selectedAnswerId: string
}

function stringInput(value: unknown) {
  return String(value || "").trim()
}

function normalizeAttemptAnswer(value: unknown): QuizAttemptAnswerInput | null {
  if (!isPlainRecord(value)) return null
  const questionId = stringInput(value.questionId)
  const selectedAnswerId = stringInput(value.selectedAnswerId)
  if (!questionId || !selectedAnswerId) return null
  return { questionId, selectedAnswerId }
}

function normalizeAttemptAnswers(value: unknown): QuizAttemptAnswerInput[] {
  if (!Array.isArray(value)) return []
  return value.map(normalizeAttemptAnswer).filter((answer): answer is QuizAttemptAnswerInput => Boolean(answer))
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user

  const body = await readJsonObject(request)
  const quizId = String(body.quizId || "")
  const answers = normalizeAttemptAnswers(body.answers)
  const durationSeconds = Math.max(0, Math.round(Number(body.durationSeconds || body.duration_seconds || 0)))
  if (!quizId || answers.length === 0) return fail("Quiz id and answers are required.")
  return ok(await recordQuizAttempt(user, { quizId, answers, durationSeconds }))
}
