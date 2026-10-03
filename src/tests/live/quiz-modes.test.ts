import assert from "node:assert/strict"
import test from "node:test"

import {
  DEFAULT_LIVE_QUIZ_MODE,
  LIVE_QUIZ_MODES,
  MAX_STREAK_MULTIPLIER,
  activeParticipants,
  createLiveSession,
  currentStreak,
  findParticipant,
  leaderboard,
  normalizeLiveMode,
  parseSession,
  reduceSession,
  scoreAnswer,
  serializeSession,
  streakMultiplier,
  streakMultiplierHalves,
  summarizeResults,
  type LiveEvent,
  type LiveQuizMode,
  type LiveQuizQuestion,
  type LiveQuizSession,
} from "../../lib/live/quiz-session"

/**
 * The three game modes, side by side.
 *
 * `quiz-session.test.ts` covers the engine that all three share — the lobby,
 * the timer, the base-plus-speed score, the transport-agnostic effects. This
 * file covers only what makes a mode a mode: if `survival` ever stops
 * eliminating, or `streak` stops resetting, the code still runs and still calls
 * itself by that name. These assertions are what stop that from being true.
 */

const HOST = "user_host"
const START_MS = 1_700_000_000_000
const STREAK_MULTIPLIER_HALVES_MAX = MAX_STREAK_MULTIPLIER * 2

function question(overrides: Partial<LiveQuizQuestion> = {}): LiveQuizQuestion {
  return {
    id: "q1",
    prompt: "Which planet is closest to the sun?",
    choices: [
      { id: "a", text: "Mercury" },
      { id: "b", text: "Venus" },
      { id: "c", text: "Mars" },
    ],
    correctChoiceId: "a",
    timeLimitSeconds: 20,
    ...overrides,
  }
}

/** A session of `mode` with `count` questions, all answered correctly by "a". */
function modeSession(mode: LiveQuizMode, count = 3): LiveQuizSession {
  return createLiveSession({
    code: "ABCDEF",
    quizId: "quiz_1",
    quizTitle: "Solar system",
    hostUserId: HOST,
    mode,
    questions: Array.from({ length: count }, (_unused, index) =>
      question({ id: `q${index + 1}`, prompt: `Question ${index + 1}` })),
    createdAt: START_MS,
  })
}

/** The opened question of a `mode` session with `players` joined and started. */
function startedMode(mode: LiveQuizMode, players: string[], count = 3): LiveQuizSession {
  let session = modeSession(mode, count)
  players.forEach((id, index) => {
    const joined = reduceSession(session, { type: "join", actorId: id, participantId: id, name: id }, START_MS + index)
    assert.ok(joined.effects.length > 0, `${id} should have been able to join`)
    session = joined.session
  })
  const started = reduceSession(session, { type: "start", actorId: HOST }, START_MS + 100)
  assert.ok(started.effects.length > 0, "the host should have been able to start")
  return started.session
}

function answerEvent(participantId: string, choiceId: string, questionId = "q1", atMs = START_MS): LiveEvent {
  return { type: "answer", actorId: participantId, participantId, questionId, choiceId, atMs }
}

/** Applies an event, asserting it was accepted, and returns the types of its effects. */
function accepted(session: LiveQuizSession, event: LiveEvent, at: number): { session: LiveQuizSession; effects: string[] } {
  const result = reduceSession(session, event, at)
  assert.ok(result.effects.length > 0, `event ${event.type} was unexpectedly rejected`)
  return { session: result.session, effects: result.effects.map((effect) => effect.type) }
}

/**
 * Answers the current question *instantly* — `atMs` is exactly the moment the
 * window opened — so the speed bonus is at its maximum and the points under
 * test are purely the mode's multiplier. Then reveals and advances.
 */
function playInstantly(session: LiveQuizSession, participantId: string, choiceId: string, nowMs: number, advance = true): LiveQuizSession {
  const current = session.questions[session.questionIndex]
  const at = session.questionStartedAt
  const answered = accepted(session, answerEvent(participantId, choiceId, current.id, at), at)
  if (!advance) return answered.session
  const revealed = accepted(answered.session, { type: "reveal", actorId: HOST }, nowMs)
  return accepted(revealed.session, { type: "next", actorId: HOST }, nowMs).session
}

// ---------------------------------------------------------------------------
// The mode field itself
// ---------------------------------------------------------------------------

test("the mode is carried, round-tripped, and defaulted rather than thrown at", () => {
  for (const mode of LIVE_QUIZ_MODES) {
    const session = modeSession(mode)
    assert.equal(session.mode, mode)
    assert.equal(parseSession(serializeSession(session))?.mode, mode, `${mode} must survive a round-trip`)
  }

  // `race` is the default for every unusable value — never an exception,
  // because a session that cannot say how it is played must still be playable.
  const created = createLiveSession({
    code: "ABCDEF",
    quizId: "q",
    quizTitle: "T",
    hostUserId: HOST,
    questions: [question()],
    createdAt: START_MS,
  })
  assert.equal(created.mode, DEFAULT_LIVE_QUIZ_MODE)
  assert.equal(DEFAULT_LIVE_QUIZ_MODE, "race")
  for (const junk of [undefined, null, 42, true, "", "banana", "RACE", {}]) {
    assert.equal(normalizeLiveMode(junk), "race", `${JSON.stringify(junk)} should default to race`)
  }
  assert.equal(normalizeLiveMode("survival"), "survival")
  assert.equal(normalizeLiveMode("streak"), "streak")

  // A row written before modes existed has no `mode` field at all.
  const legacy = JSON.parse(serializeSession(modeSession("streak"))) as Record<string, unknown>
  delete legacy.mode
  assert.equal(parseSession(legacy)?.mode, "race", "an absent mode must read back as race")
  assert.equal(parseSession({ ...legacy, mode: "banana" })?.mode, "race", "an unknown mode must read back as race")
})

// ---------------------------------------------------------------------------
// race — the behaviour that must not change
// ---------------------------------------------------------------------------

test("race is unchanged: a wrong answer neither eliminates nor ends the game", () => {
  const started = startedMode("race", ["u1", "u2"])

  const wrong = accepted(started, answerEvent("u1", "b", "q1", START_MS + 200), START_MS + 200)
  assert.deepEqual(wrong.effects, ["broadcast", "persist"], "a wrong answer is not a finalize")
  assert.equal(wrong.session.phase, "question")
  assert.equal(findParticipant(wrong.session, "u1")?.score, 0)
  assert.equal(findParticipant(wrong.session, "u1")?.eliminated, undefined, "race has no elimination")
  assert.deepEqual(activeParticipants(wrong.session).map((participant) => participant.id), ["u1", "u2"])

  // The score is exactly the base-plus-speed rule race always had, with no
  // multiplier applied on top.
  const scored = scoreAnswer({ question: question(), questionStartedAt: START_MS + 100, choiceId: "a", atMs: START_MS + 200 })
  const correct = accepted(started, answerEvent("u1", "a", "q1", START_MS + 200), START_MS + 200)
  assert.equal(findParticipant(correct.session, "u1")?.score, scored.points)
  assert.equal(currentStreak(findParticipant(correct.session, "u1")!), 1, "the run is recorded, but race does not multiply by it")
})

// ---------------------------------------------------------------------------
// survival — elimination and the early finish
// ---------------------------------------------------------------------------

test("survival eliminates on a wrong answer and ends the moment one player is left standing", () => {
  const started = startedMode("survival", ["u1", "u2", "u3"])

  // First wrong answer: u1 is out, but two players are still standing.
  const first = accepted(started, answerEvent("u1", "b", "q1", START_MS + 200), START_MS + 200)
  assert.equal(findParticipant(first.session, "u1")?.eliminated, true)
  assert.equal(findParticipant(first.session, "u1")?.score, 0)
  assert.equal(first.session.phase, "question", "the game continues while two players stand")
  assert.deepEqual(first.effects, ["broadcast", "persist"], "the game is not over yet")
  assert.deepEqual(activeParticipants(first.session).map((participant) => participant.id), ["u2", "u3"])

  // Second wrong answer: only u3 remains, so the game finishes *now* — not after
  // a reveal, and not after the remaining questions.
  const second = accepted(first.session, answerEvent("u2", "b", "q1", START_MS + 400), START_MS + 400)
  assert.equal(findParticipant(second.session, "u2")?.eliminated, true)
  assert.equal(second.session.phase, "finished")
  assert.ok(second.effects.includes("finalize"), "an early finish must ask for the results to be saved")

  // "Last one standing wins" is a ranking rule, not just a state: u3 answered
  // nothing at all and still ranks above the two players who answered faster.
  assert.deepEqual(leaderboard(second.session).map((participant) => participant.id), ["u3", "u1", "u2"])
  assert.equal(summarizeResults(second.session).participants[0].name, "u3")
})

test("survival refuses an eliminated player's answers and never lets them score again", () => {
  const started = startedMode("survival", ["u1", "u2", "u3"])
  const out = accepted(started, answerEvent("u1", "b", "q1", START_MS + 200), START_MS + 200).session
  const scoreWhenOut = findParticipant(out, "u1")?.score

  // Same question: refused because they are out, not because they answered.
  const retry = reduceSession(out, answerEvent("u1", "a", "q1", START_MS + 300), START_MS + 300)
  assert.deepEqual(retry.effects, [], "an eliminated player cannot answer")
  assert.equal(retry.session, out, "a refused answer is not a partial write")

  // A later question: still refused, and still not scoring.
  const nextQuestion = accepted(accepted(out, { type: "reveal", actorId: HOST }, START_MS + 400).session, { type: "next", actorId: HOST }, START_MS + 500).session
  assert.equal(nextQuestion.questionIndex, 1)
  const late = reduceSession(nextQuestion, answerEvent("u1", "a", "q2", START_MS + 600), START_MS + 600)
  assert.deepEqual(late.effects, [], "elimination lasts the whole game")
  assert.equal(findParticipant(late.session, "u1")?.score, scoreWhenOut)
  assert.equal(findParticipant(late.session, "u1")?.answers.length, 1, "the wrong answer is their whole record")
})

test("survival runs to the end of the questions when more than one player survives", () => {
  const started = startedMode("survival", ["u1", "u2"], 2)
  const first = playInstantly(started, "u1", "a", START_MS + 300)
  assert.equal(first.phase, "question")
  assert.equal(first.questionIndex, 1)

  const last = accepted(first, answerEvent("u2", "b", "q2", START_MS + 500), START_MS + 500)
  assert.equal(findParticipant(last.session, "u2")?.eliminated, true)
  // Two players, one now eliminated: "at most one left standing", so the game
  // ends here too — by the same rule, not a special case for the last question.
  assert.equal(last.session.phase, "finished")
  assert.deepEqual(leaderboard(last.session).map((participant) => participant.id), ["u1", "u2"])

  // A survival game where everyone survives to the last question ends normally.
  const bothAlive = startedMode("survival", ["u1", "u2"], 2)
  const survived = playInstantly(bothAlive, "u1", "a", START_MS + 300)
  const survivor = playInstantly(survived, "u2", "a", START_MS + 500)
  assert.equal(survivor.phase, "finished")
  assert.deepEqual(activeParticipants(survivor).map((participant) => participant.id), ["u1", "u2"])
})

// ---------------------------------------------------------------------------
// streak — multiplier growth, reset, and the cap
// ---------------------------------------------------------------------------

test("streak builds a half-step multiplier per consecutive correct answer, capped at x3", () => {
  // An instant answer scores the full 1.5x base: 1500 points before multipliers.
  const base = scoreAnswer({ question: question(), questionStartedAt: START_MS + 100, choiceId: "a", atMs: START_MS + 100 }).points
  assert.equal(base, 1500)

  const multipliersInHalves = [2, 3, 4, 5, 6, 6]
  const expected = multipliersInHalves.map((halves) => Math.floor((base * halves) / 2))
  assert.deepEqual(expected, [1500, 2250, 3000, 3750, 4500, 4500], "x1, x1.5, x2, x2.5, x3, capped at x3")

  let session = startedMode("streak", ["u1"], 6)
  let total = 0
  for (let index = 0; index < 6; index += 1) {
    session = playInstantly(session, "u1", "a", START_MS + 200 + index * 1_000, index < 5)
    const participant = findParticipant(session, "u1")
    assert.ok(participant)
    assert.equal(participant.answers[index].points, expected[index], `answer ${index + 1} should carry the multiplier for a run of ${index}`)
    total += expected[index]
    assert.equal(participant.score, total, "the total is the sum of the multiplied answers")
    assert.equal(currentStreak(participant), index + 1)
    assert.ok(participant.answers.every((answer) => Number.isInteger(answer.points)), "points must stay integers")
  }

  assert.equal(total, 19_500)
  assert.equal(streakMultiplierHalves(6), STREAK_MULTIPLIER_HALVES_MAX)
  assert.equal(streakMultiplierHalves(50), STREAK_MULTIPLIER_HALVES_MAX, "the multiplier is capped, not unbounded")
  assert.equal(streakMultiplier(findParticipant(session, "u1")!), MAX_STREAK_MULTIPLIER)
})

test("streak resets to x1 after a wrong answer", () => {
  let session = startedMode("streak", ["u1"], 4)
  const me = () => findParticipant(session, "u1")!

  session = playInstantly(session, "u1", "a", START_MS + 200)
  session = playInstantly(session, "u1", "a", START_MS + 300)
  assert.deepEqual(me().answers.map((answer) => answer.points), [1500, 2250])
  assert.equal(currentStreak(me()), 2)
  assert.equal(streakMultiplier(me()), 2)

  session = playInstantly(session, "u1", "b", START_MS + 400)
  assert.equal(me().answers[2].points, 0)
  assert.equal(currentStreak(me()), 0, "a wrong answer resets the run")
  assert.equal(streakMultiplier(me()), 1)

  session = playInstantly(session, "u1", "a", START_MS + 500, false)
  assert.equal(me().answers[3].points, 1500, "the answer after a reset is back to x1")
  assert.deepEqual(me().answers.map((answer) => answer.points), [1500, 2250, 0, 1500])
  assert.equal(me().score, 5250)
  assert.equal(me().answers.every((answer) => Number.isInteger(answer.points)), true)
})

// ---------------------------------------------------------------------------
// Persistence of the mode-specific state
// ---------------------------------------------------------------------------

test("elimination and the mode survive a serialise/parse cycle", () => {
  const started = startedMode("survival", ["u1", "u2", "u3"])
  const eliminated = accepted(started, answerEvent("u1", "b", "q1", START_MS + 200), START_MS + 200).session
  const restored = parseSession(serializeSession(eliminated))

  assert.ok(restored)
  assert.equal(restored.mode, "survival")
  assert.deepEqual(restored.participants.map((participant) => participant.eliminated ?? false), [true, false, false])
  assert.equal(findParticipant(restored, "u1")?.score, 0)
  // Still refused after a round-trip: the rule lives in the state, not in the
  // process that happened to write it.
  assert.deepEqual(reduceSession(restored, answerEvent("u1", "a", "q1", START_MS + 300), START_MS + 300).effects, [])

  // A late joiner arrives into the same mode, alive and scoreable.
  const late = accepted(restored, { type: "join", actorId: "u4", participantId: "u4", name: "Alan" }, START_MS + 400)
  assert.equal(late.session.mode, "survival")
  assert.equal(findParticipant(late.session, "u4")?.eliminated, undefined)
  assert.equal(activeParticipants(late.session).length, 3)
})

test("a parsed survival session keeps reducing exactly like the original", () => {
  const started = startedMode("survival", ["u1", "u2", "u3"])
  const eliminated = accepted(started, answerEvent("u1", "b", "q1", START_MS + 200), START_MS + 200).session
  const restored = parseSession(serializeSession(eliminated))
  assert.ok(restored)

  // The same wrong answer from u2 ends the game in both worlds, with the same
  // ranking — so a mode rule cannot depend on having been run in-process.
  const event = answerEvent("u2", "b", "q1", START_MS + 400)
  const online = reduceSession(eliminated, event, START_MS + 400)
  const offline = reduceSession(restored, event, START_MS + 400)
  assert.equal(online.session.phase, "finished")
  assert.equal(offline.session.phase, "finished")
  assert.deepEqual(offline.session.participants, online.session.participants)
  assert.deepEqual(leaderboard(offline.session).map((participant) => participant.id), ["u3", "u1", "u2"])
})
