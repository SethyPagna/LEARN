import type { NextRequest } from "next/server"
import { fail, isApiResponse, ok, readJsonObject, requireApiUser, withApiErrorBoundary } from "@/lib/api"
import { advanceLiveSession, getLiveSessionByCode, joinLiveSession, liveParticipantId, submitLiveAnswer } from "@/lib/data"
import { broadcastRealtimeEvent } from "@/lib/realtime-broadcast"
import { summarizeResults, type LiveQuizSession } from "@/lib/live/quiz-session"

/**
 * Live quiz synchronisation.
 *
 * **Polling is the transport.** The player and host screens re-read this
 * endpoint on a short interval (≈800ms while the session is open, backing off
 * while the tab is hidden). It was chosen over a WebSocket channel on purpose:
 * the game state already has to be durable and authoritative in D1, a poll
 * re-reads exactly that state, and it needs no Durable Object binding, no
 * connection lifecycle, and no reconnect story when a phone sleeps. Correctness
 * is therefore verifiable against the database alone.
 *
 * As a latency optimisation on top of that, a successful mutation also pushes a
 * small "something changed" nudge — never the state itself — through the
 * *existing* realtime channel for `presence` (a generic keyed channel). No new
 * Durable Object and no wrangler binding is involved, and if the binding is
 * absent the push is a no-op: the poll is still the source of truth.
 */
function channelId(code: string) {
  return `live-quiz:${code}`
}

async function publishNudge(code: string, session: LiveQuizSession, action: string) {
  await broadcastRealtimeEvent("presence", channelId(code), {
    type: "snapshot",
    payload: { action, code, phase: session.phase, questionIndex: session.questionIndex, at: Date.now() },
  })
}

/**
 * The state a particular viewer is allowed to see.
 *
 * During a live question, `correctChoiceId` is stripped for everyone but the
 * host. The reducer needs it to score, the player's screen must not have it
 * yet, and shipping it "because the client won't look" would hand the answer to
 * anyone with a network tab open.
 */
function stateForViewer(found: { id: string; session: LiveQuizSession }, userId: string) {
  const isHost = found.session.hostUserId === userId
  const participantId = liveParticipantId(userId)
  const isParticipant = found.session.participants.some((participant) => participant.id === participantId)
  const hideAnswers = !isHost && found.session.phase === "question"

  return {
    item: {
      id: found.id,
      code: found.session.code,
      /**
       * The server's clock at response time. The question window lives in
       * server time, and a player's phone is routinely seconds off, so the
       * client offsets its own clock by `serverNow - Date.now()` before drawing
       * the timer — otherwise the bar can visibly disagree with whether an
       * answer still counts.
       */
      serverNow: Date.now(),
      session: hideAnswers
        ? {
            ...found.session,
            questions: found.session.questions.map(({ correctChoiceId, ...question }) => ({ ...question, correctChoiceId: "" })),
          }
        : found.session,
      // The saved results record is attached once the session is over so the
      // final screen shows the same ranks that were persisted, instead of a
      // second implementation computed in the browser.
      ...(found.session.phase === "finished" ? { summary: summarizeResults(found.session) } : {}),
      viewer: { isHost, isParticipant, participantId },
    },
  }
}

export const GET = withApiErrorBoundary(async (request: NextRequest, context: { params: Promise<{ code: string }> }) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user

  const { code } = await context.params
  const found = await getLiveSessionByCode(code)
  if (!found) return fail("That join code does not match a live quiz.", 404)

  const isHost = found.session.hostUserId === user.id
  const isParticipant = found.session.participants.some((participant) => participant.id === liveParticipantId(user.id))
  // A session's state is not public: the join code is short and human, so
  // "knows the code" cannot be the authorization check.
  if (!isHost && !isParticipant) return fail("Join this live quiz before watching it.", 403)

  return ok(stateForViewer(found, user.id))
}, 404)

export const POST = withApiErrorBoundary(async (request: NextRequest, context: { params: Promise<{ code: string }> }) => {
  const user = await requireApiUser(request)
  if (isApiResponse(user)) return user

  const { code } = await context.params
  const body = await readJsonObject(request)
  const action = String(body.action || "").trim()

  if (action === "join") {
    const result = await joinLiveSession(user, code)
    if (result.joined) await publishNudge(result.session.code, result.session, "join")
    return ok(stateForViewer({ id: result.id, session: result.session }, user.id))
  }

  if (action === "answer") {
    const questionId = String(body.questionId || "").trim()
    const choiceId = String(body.choiceId || "").trim()
    if (!questionId || !choiceId) return fail("An answer needs a question and a choice.")

    const result = await submitLiveAnswer(user, code, { questionId, choiceId })
    if (!result.accepted) return fail("That answer did not count — the question was already closed or already answered.", 409)
    await publishNudge(result.session.code, result.session, "answer")
    return ok({
      ...stateForViewer({ id: result.id, session: result.session }, user.id),
      correct: result.correct,
      points: result.points,
    })
  }

  if (action === "start" || action === "reveal" || action === "next" || action === "close") {
    const result = await advanceLiveSession(user, code, action)
    await publishNudge(result.session.code, result.session, action)
    return ok(stateForViewer({ id: result.id, session: result.session }, user.id))
  }

  return fail("Unsupported live quiz action.")
}, 404)
