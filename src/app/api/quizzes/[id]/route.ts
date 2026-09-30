import type { NextRequest } from "next/server"
import { fail, isApiResponse, ok, requireApiUser, withApiErrorBoundary } from "@/lib/api"
import { archiveQuiz, getAccessibleQuiz } from "@/lib/data"

export const GET = withApiErrorBoundary(async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const { id } = await context.params
  const quiz = await getAccessibleQuiz(user, id)
  if (!quiz) return fail("Quiz not found.", 404)
  return ok({ item: quiz })
}, 403)

export const DELETE = withApiErrorBoundary(async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user
  const { id } = await context.params
  const archived = await archiveQuiz(user, id)
  if (!archived) return fail("Quiz not found.", 404)
  return ok({ archived: true })
})
