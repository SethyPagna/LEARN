import type { NextRequest } from "next/server"
import { fail, isApiResponse, ok, readJsonObject, requireApiUser, withApiErrorBoundary } from "@/lib/api"
import { createLiveSession, launchLiveGameInChat, listLiveSessions } from "@/lib/data"

export const GET = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user

  return ok(await listLiveSessions(user))
})

/**
 * Starts a live game. One action, two shapes, told apart by whether the caller
 * named a conversation:
 *
 * - with a `threadId` (or a `groupId`/`targetUserId`) the whole launch happens
 *   server-side — the session, the invite message in that thread, and the
 *   thread the result will be posted back into — and all three come back in the
 *   response. This is what the chat composer's "Start a live game" calls.
 * - without one it is the plain "host a game on the Practice screen" call it
 *   always was.
 *
 * `mode` is accepted on both and defaults to `race` in the data layer, so a
 * client that does not know about modes still starts a playable game.
 */
export const POST = withApiErrorBoundary(async (request: NextRequest) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user

  const body = await readJsonObject(request)
  const quizId = String(body.quizId || "").trim()
  if (!quizId) return fail("Pick a quiz to host.")

  const title = String(body.title || "")
  const mode = body.mode
  const threadId = String(body.threadId || "").trim()
  const groupId = String(body.groupId || "").trim()
  const targetUserId = String(body.targetUserId || "").trim()

  if (threadId || groupId || targetUserId) {
    const launched = await launchLiveGameInChat(user, { quizId, title, mode, threadId, groupId, targetUserId })
    return ok({
      item: { id: launched.id, code: launched.code, session: launched.session },
      threadId: launched.threadId,
      messageId: launched.messageId,
    }, { status: 201 })
  }

  const created = await createLiveSession(user, { quizId, title, mode })
  return ok({ item: { id: created.id, code: created.code, session: created.session } }, { status: 201 })
})
