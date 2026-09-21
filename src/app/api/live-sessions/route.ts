import type { NextRequest } from "next/server"
import { fail, isApiResponse, ok, readJsonObject, requireApiUser, withApiErrorBoundary } from "@/lib/api"
import { createLiveSession, listLiveSessions } from "@/lib/data"

export const GET = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user

  return ok(await listLiveSessions(user))
})

export const POST = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user

  const body = await readJsonObject(request)
  const quizId = String(body.quizId || "").trim()
  if (!quizId) return fail("Pick a quiz to host.")

  const created = await createLiveSession(user, { quizId, title: String(body.title || "") })
  return ok({ item: { id: created.id, code: created.code, session: created.session } }, { status: 201 })
})
