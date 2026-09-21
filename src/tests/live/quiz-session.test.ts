import assert from "node:assert/strict"
import test from "node:test"

import {
  DEFAULT_QUESTION_POINTS,
  JOIN_CODE_ALPHABET,
  JOIN_CODE_LENGTH,
  SESSION_VERSION,
  answerWindowOpen,
  createLiveSession,
  currentQuestion,
  findParticipant,
  generateJoinCode,
  hasAnswered,
  leaderboard,
  normalizeJoinCode,
  normalizeLiveQuestion,
  parseSession,
  reduceSession,
  remainingMs,
  scoreAnswer,
  serializeSession,
  summarizeResults,
  totalAnswerTimeMs,
  type LiveEvent,
  type LiveQuizParticipant,
  type LiveQuizQuestion,
  type LiveQuizSession,
} from "../../lib/live/quiz-session"

const HOST = "user_host"
const START_MS = 1_700_000_000_000

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

function sessionWith(overrides: Partial<LiveQuizSession> = {}): LiveQuizSession {
  return {
    ...createLiveSession({
      code: "ABCDEF",
      quizId: "quiz_1",
      quizTitle: "Solar system",
      hostUserId: HOST,
      questions: [question(), question({ id: "q2", prompt: "Which planet is the largest?" })],
      createdAt: START_MS,
    }),
    ...overrides,
  }
}

/** Applies events in order, each with its own clock, asserting none is rejected. */
function applySteps(session: LiveQuizSession, steps: Array<{ event: LiveEvent; at: number }>): LiveQuizSession {
  return steps.reduce((current, step) => {
    const result = reduceSession(current, step.event, step.at)
    assert.ok(result.effects.length > 0, `event ${step.event.type} at ${step.at} was unexpectedly rejected`)
    return result.session
  }, session)
}

/** Applies events in order, asserting each one was accepted. */
function apply(session: LiveQuizSession, events: LiveEvent[], nowMs: number): LiveQuizSession {
  return applySteps(session, events.map((event) => ({ event, at: nowMs })))
}

function rejected(session: LiveQuizSession, event: LiveEvent, nowMs: number) {
  const result = reduceSession(session, event, nowMs)
  assert.deepEqual(result.effects, [], `event ${event.type} should have been rejected`)
  // Rejection is not a partial write: the session is returned untouched.
  assert.equal(result.session, session, `rejected ${event.type} must not produce a new session`)
  return result
}

function playing(): LiveQuizSession {
  const lobby = apply(sessionWith(), [
    { type: "join", actorId: "user_1", participantId: "user_1", name: "Ada" },
    { type: "join", actorId: "user_2", participantId: "user_2", name: "Grace" },
    { type: "start", actorId: HOST },
  ], START_MS)
  return lobby
}

// ---------------------------------------------------------------------------
// Join codes
// ---------------------------------------------------------------------------

test("generateJoinCode emits six unambiguous uppercase characters", () => {
  // 31 symbols, so floor(0.42 * 31) = 13.
  const code = generateJoinCode(() => 0.42)

  assert.equal(code.length, JOIN_CODE_LENGTH)
  assert.equal(code, "Q".repeat(JOIN_CODE_LENGTH))
  assert.equal(JOIN_CODE_ALPHABET[13], "Q")
  assert.equal(JOIN_CODE_ALPHABET.length, 31, "23 letters (minus I, L, O) plus 8 digits")
  assert.match(code, /^[A-Z2-9]{6}$/)
})

test("generateJoinCode never emits the transcription-ambiguous characters", () => {
  // Sweep the whole unit interval at a fine step rather than trusting 30
  // samples: the alphabet is what the code is *for*, and an off-by-one in the
  // index would leak `0`/`O`/`1`/`I`/`L` back in.
  const seen = new Set<string>()
  for (let step = 0; step < 3000; step += 1) {
    for (const character of generateJoinCode(() => step / 3000)) seen.add(character)
  }

  assert.deepEqual([...JOIN_CODE_ALPHABET].filter((character) => seen.has(character)).sort(), [...JOIN_CODE_ALPHABET].sort())
  for (const ambiguous of ["0", "O", "1", "I", "L"]) {
    assert.equal(seen.has(ambiguous), false, `${ambiguous} must never appear in a join code`)
  }
})

test("generateJoinCode clamps a random() that returns exactly 1", () => {
  assert.equal(generateJoinCode(() => 1), JOIN_CODE_ALPHABET[JOIN_CODE_ALPHABET.length - 1].repeat(6))
})

test("generateJoinCode is deterministic for an injected random source", () => {
  // Deterministic by construction: the only entropy in the module is the
  // `random` argument, so the same sequence always yields the same code.
  const sequence = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6]
  const fromSequence = () => {
    let index = 0
    return () => sequence[index++ % sequence.length]
  }

  assert.equal(generateJoinCode(fromSequence()), "DGKPSV")
  assert.equal(generateJoinCode(fromSequence()), generateJoinCode(fromSequence()))
})

test("normalizeJoinCode canonicalises what a player actually types", () => {
  assert.equal(normalizeJoinCode("abcdef"), "ABCDEF")
  assert.equal(normalizeJoinCode("  abcdef  "), "ABCDEF")
  assert.equal(normalizeJoinCode("ab-cd ef"), "ABCDEF")
  assert.equal(normalizeJoinCode("A B C D E F"), "ABCDEF")
  assert.equal(normalizeJoinCode("AB_CDE"), null, "underscores are not separator noise")
})

test("normalizeJoinCode rejects junk, wrong lengths, and ambiguous characters", () => {
  for (const junk of [null, undefined, 42, {}, [], "", "ABC", "ABCDE", "ABCDEFG", "ABC DEFG"]) {
    assert.equal(normalizeJoinCode(junk), null, `${JSON.stringify(junk)} is not a join code`)
  }
  for (const ambiguous of ["ABC0EF", "ABC1EF", "ABCOEF", "ABCIEF", "ABCLEF"]) {
    assert.equal(normalizeJoinCode(ambiguous), null, `${ambiguous} contains a character the generator never emits`)
  }
})

// ---------------------------------------------------------------------------
// Lobby: join, duplicate join, late join, leave
// ---------------------------------------------------------------------------

test("a join adds the participant to the lobby and asks for a broadcast", () => {
  const lobby = sessionWith()
  const result = reduceSession(lobby, { type: "join", actorId: "user_1", participantId: "user_1", name: "  Ada  " }, START_MS + 500)

  assert.deepEqual(result.session.participants, [{ id: "user_1", name: "Ada", joinedAt: START_MS + 500, score: 0, answers: [] }])
  assert.deepEqual(result.session.phase, "lobby")
  assert.deepEqual(result.effects, [
    { type: "broadcast", reason: "join" },
    { type: "persist", reason: "join" },
  ])
  // The input session is never mutated.
  assert.equal(lobby.participants.length, 0)
})

test("a duplicate join is refused rather than double-counted", () => {
  const joined = apply(sessionWith(), [{ type: "join", actorId: "user_1", participantId: "user_1", name: "Ada" }], START_MS)

  rejected(joined, { type: "join", actorId: "user_1", participantId: "user_1", name: "Ada" }, START_MS + 1)
  // The same player re-joining under a different display name is still one
  // participant: identity is the id, not the label.
  rejected(joined, { type: "join", actorId: "user_1", participantId: "user_1", name: "Someone else" }, START_MS + 2)
})

test("a join with no id or no name is refused", () => {
  const lobby = sessionWith()

  rejected(lobby, { type: "join", actorId: "", participantId: "", name: "Ada" }, START_MS)
  rejected(lobby, { type: "join", actorId: "user_1", participantId: "user_1", name: "   " }, START_MS)
})

test("a long name is truncated to the display limit", () => {
  const result = reduceSession(
    sessionWith(),
    { type: "join", actorId: "user_1", participantId: "user_1", name: "x".repeat(80) },
    START_MS,
  )

  assert.equal(result.session.participants[0].name.length, 40)
})

test("late join is allowed mid-question but refused once the session is finished", () => {
  const running = playing()
  const late = reduceSession(running, { type: "join", actorId: "user_3", participantId: "user_3", name: "Alan" }, START_MS + 1000)

  assert.equal(late.effects.length > 0, true)
  assert.equal(late.session.participants.length, 3)
  assert.equal(late.session.phase, "question")

  const finished = apply(running, [{ type: "close", actorId: HOST }], START_MS + 2000)
  rejected(finished, { type: "join", actorId: "user_3", participantId: "user_3", name: "Alan" }, START_MS + 3000)
})

test("the lobby has a participant cap", () => {
  let lobby = sessionWith()
  for (let index = 0; index < 200; index += 1) {
    lobby = reduceSession(lobby, { type: "join", actorId: `user_${index}`, participantId: `user_${index}`, name: `Player ${index}` }, START_MS + index).session
  }

  assert.equal(lobby.participants.length, 200)
  rejected(lobby, { type: "join", actorId: "user_200", participantId: "user_200", name: "One too many" }, START_MS + 1000)
})

test("leave removes a participant and is refused for a stranger", () => {
  const lobby = apply(sessionWith(), [{ type: "join", actorId: "user_1", participantId: "user_1", name: "Ada" }], START_MS)

  assert.deepEqual(
    reduceSession(lobby, { type: "leave", actorId: "user_1", participantId: "user_1" }, START_MS + 100).session.participants,
    [],
  )
  rejected(lobby, { type: "leave", actorId: "user_9", participantId: "user_9" }, START_MS + 100)
})

test("leave is refused once results are frozen", () => {
  const finished = apply(playing(), [{ type: "close", actorId: HOST }], START_MS + 1000)

  rejected(finished, { type: "leave", actorId: "user_1", participantId: "user_1" }, START_MS + 2000)
})

// ---------------------------------------------------------------------------
// Phase machine
// ---------------------------------------------------------------------------

test("only the host can start, reveal, advance, or close", () => {
  const lobby = apply(sessionWith(), [{ type: "join", actorId: "user_1", participantId: "user_1", name: "Ada" }], START_MS)

  rejected(lobby, { type: "start", actorId: "user_1" }, START_MS + 1)
  rejected(lobby, { type: "start", actorId: "" }, START_MS + 1)

  const running = reduceSession(lobby, { type: "start", actorId: HOST }, START_MS + 10).session
  assert.equal(running.phase, "question")

  rejected(running, { type: "reveal", actorId: "user_1" }, START_MS + 20)
  rejected(running, { type: "next", actorId: "user_1" }, START_MS + 20)
  rejected(running, { type: "close", actorId: "user_1" }, START_MS + 20)

  const revealed = reduceSession(running, { type: "reveal", actorId: HOST }, START_MS + 30).session
  assert.equal(revealed.phase, "reveal")
  rejected(revealed, { type: "next", actorId: "user_1" }, START_MS + 40)
})

test("start is refused outside the lobby and on an empty quiz", () => {
  const empty = sessionWith({ questions: [] })
  rejected(empty, { type: "start", actorId: HOST }, START_MS)

  const running = apply(sessionWith(), [{ type: "start", actorId: HOST }], START_MS)
  rejected(running, { type: "start", actorId: HOST }, START_MS + 1)
})

test("reveal is refused outside the question phase and next outside the reveal phase", () => {
  const lobby = sessionWith()
  rejected(lobby, { type: "reveal", actorId: HOST }, START_MS)
  rejected(lobby, { type: "next", actorId: HOST }, START_MS)

  const running = apply(lobby, [{ type: "start", actorId: HOST }], START_MS)
  rejected(running, { type: "next", actorId: HOST }, START_MS + 1)
})

test("start stamps the question window with the injected clock", () => {
  const running = reduceSession(sessionWith(), { type: "start", actorId: HOST }, START_MS + 777).session

  assert.equal(running.phase, "question")
  assert.equal(running.questionIndex, 0)
  assert.equal(running.questionStartedAt, START_MS + 777)
  assert.equal(currentQuestion(running)?.id, "q1")
})

test("next advances to the following question and re-stamps the window", () => {
  const advanced = apply(playing(), [{ type: "reveal", actorId: HOST }, { type: "next", actorId: HOST }], START_MS + 5000)

  assert.equal(advanced.phase, "question")
  assert.equal(advanced.questionIndex, 1)
  assert.equal(advanced.questionStartedAt, START_MS + 5000)
  assert.equal(currentQuestion(advanced)?.id, "q2")
})

test("next on the last question finishes the session and asks to persist results", () => {
  // Through q1 to q2, leaving q2 open for the host to reveal.
  const beforeLast = apply(playing(), [
    { type: "reveal", actorId: HOST },
    { type: "next", actorId: HOST },
    { type: "reveal", actorId: HOST },
  ], START_MS + 5000)
  assert.equal(beforeLast.phase, "reveal")
  assert.equal(beforeLast.questionIndex, 1)

  const result = reduceSession(beforeLast, { type: "next", actorId: HOST }, START_MS + 9000)

  assert.equal(result.session.phase, "finished")
  assert.equal(result.session.questionIndex, 1, "the index stays on the last question rather than running past it")
  assert.equal(result.session.questionStartedAt, 0)
  assert.deepEqual(result.effects, [
    { type: "broadcast", reason: "next" },
    { type: "persist", reason: "next" },
    { type: "finalize", reason: "next" },
  ])
})

test("close ends the quiz early from any live phase, and is refused twice", () => {
  for (const prepared of [sessionWith(), playing()]) {
    const closed = reduceSession(prepared, { type: "close", actorId: HOST }, START_MS + 100)
    assert.equal(closed.session.phase, "finished")
    assert.equal(closed.effects.some((effect) => effect.type === "finalize"), true)
    rejected(closed.session, { type: "close", actorId: HOST }, START_MS + 200)
  }

  const revealed = apply(playing(), [{ type: "reveal", actorId: HOST }], START_MS + 100)
  assert.equal(reduceSession(revealed, { type: "close", actorId: HOST }, START_MS + 200).session.phase, "finished")
})

test("the full happy path runs lobby to finished and stamps every window", () => {
  const steps: Array<{ event: LiveEvent; at: number }> = [
    { event: { type: "join", actorId: "user_1", participantId: "user_1", name: "Ada" }, at: START_MS },
    { event: { type: "join", actorId: "user_2", participantId: "user_2", name: "Grace" }, at: START_MS + 100 },
    { event: { type: "start", actorId: HOST }, at: START_MS + 1000 },
    { event: { type: "answer", actorId: "user_1", participantId: "user_1", questionId: "q1", choiceId: "a", atMs: START_MS + 2000 }, at: START_MS + 2000 },
    { event: { type: "answer", actorId: "user_2", participantId: "user_2", questionId: "q1", choiceId: "b", atMs: START_MS + 3000 }, at: START_MS + 3000 },
    { event: { type: "reveal", actorId: HOST }, at: START_MS + 4000 },
    { event: { type: "next", actorId: HOST }, at: START_MS + 5000 },
    { event: { type: "answer", actorId: "user_1", participantId: "user_1", questionId: "q2", choiceId: "a", atMs: START_MS + 6000 }, at: START_MS + 6000 },
    { event: { type: "answer", actorId: "user_2", participantId: "user_2", questionId: "q2", choiceId: "a", atMs: START_MS + 7000 }, at: START_MS + 7000 },
    { event: { type: "reveal", actorId: HOST }, at: START_MS + 8000 },
    { event: { type: "next", actorId: HOST }, at: START_MS + 9000 },
  ]

  const phases = [`lobby`]
  let session = sessionWith()
  for (const step of steps) {
    const result = reduceSession(session, step.event, step.at)
    assert.ok(result.effects.length > 0, `${step.event.type} at ${step.at} was rejected`)
    session = result.session
    phases.push(session.phase)
  }

  assert.deepEqual(phases, ["lobby", "lobby", "lobby", "question", "question", "question", "reveal", "question", "question", "question", "reveal", "finished"])
  assert.equal(findParticipant(session, "user_1")?.answers.length, 2)
  assert.equal(findParticipant(session, "user_2")?.answers.length, 2)
  // Ada answered instantly on both questions, so she leads despite both being correct.
  assert.deepEqual(leaderboard(session).map((participant) => participant.name), ["Ada", "Grace"])
})

// ---------------------------------------------------------------------------
// Answering
// ---------------------------------------------------------------------------

test("an answer in the lobby is refused", () => {
  const lobby = apply(sessionWith(), [{ type: "join", actorId: "user_1", participantId: "user_1", name: "Ada" }], START_MS)

  rejected(lobby, { type: "answer", actorId: "user_1", participantId: "user_1", questionId: "q1", choiceId: "a", atMs: START_MS + 1 }, START_MS + 1)
})

test("an answer in the reveal phase is refused", () => {
  const revealed = apply(playing(), [{ type: "reveal", actorId: HOST }], START_MS + 1000)

  rejected(revealed, { type: "answer", actorId: "user_1", participantId: "user_1", questionId: "q1", choiceId: "a", atMs: START_MS + 1100 }, START_MS + 1100)
})

test("the answer window closes exactly at the time limit", () => {
  const running = playing()
  const limitMs = 20_000

  // Inclusive at the boundary: the buzzer-beater answer still counts.
  assert.equal(answerWindowOpen(running, running.questionStartedAt + limitMs), true)
  assert.equal(answerWindowOpen(running, running.questionStartedAt + limitMs + 1), false)

  const onTheBuzzer = reduceSession(
    running,
    { type: "answer", actorId: "user_1", participantId: "user_1", questionId: "q1", choiceId: "a", atMs: START_MS + limitMs },
    START_MS + limitMs,
  )
  assert.equal(onTheBuzzer.effects.length > 0, true)

  const late = reduceSession(
    running,
    { type: "answer", actorId: "user_2", participantId: "user_2", questionId: "q1", choiceId: "a", atMs: START_MS + limitMs + 1 },
    START_MS + limitMs + 1,
  )
  rejected(running, { type: "answer", actorId: "user_2", participantId: "user_2", questionId: "q1", choiceId: "a", atMs: START_MS + limitMs + 1 }, START_MS + limitMs + 1)
  assert.deepEqual(late.effects, [])
})

test("a second answer to the same question is refused", () => {
  const answered = apply(
    playing(),
    [{ type: "answer", actorId: "user_1", participantId: "user_1", questionId: "q1", choiceId: "a", atMs: START_MS + 1000 }],
    START_MS + 1000,
  )

  assert.equal(hasAnswered(answered, "user_1", "q1"), true)
  rejected(answered, { type: "answer", actorId: "user_1", participantId: "user_1", questionId: "q1", choiceId: "b", atMs: START_MS + 2000 }, START_MS + 2000)
  assert.equal(findParticipant(answered, "user_1")?.answers.length, 1)
  // A different participant is of course still allowed to answer the same question.
  assert.equal(hasAnswered(answered, "user_2", "q1"), false)
})

test("answers to a question that is not current, from a stranger, or for a choice that does not exist are refused", () => {
  const running = playing()

  rejected(running, { type: "answer", actorId: "user_1", participantId: "user_1", questionId: "q2", choiceId: "a", atMs: START_MS + 1000 }, START_MS + 1000)
  rejected(running, { type: "answer", actorId: "ghost", participantId: "ghost", questionId: "q1", choiceId: "a", atMs: START_MS + 1000 }, START_MS + 1000)
  rejected(running, { type: "answer", actorId: "user_1", participantId: "user_1", questionId: "q1", choiceId: "zzz", atMs: START_MS + 1000 }, START_MS + 1000)
})

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

test("the scoring formula is base plus a linear speed bonus, clamped to 1.5x base", () => {
  const target = question({ points: 1000, timeLimitSeconds: 20 })
  const startedAt = 0
  const cases: Array<{ label: string; atMs: number; expected: number }> = [
    { label: "instant answer pays the maximum", atMs: 0, expected: 1500 },
    { label: "a quarter of the window gone pays three quarters of the bonus", atMs: 5_000, expected: 1375 },
    { label: "half the window gone pays half the bonus", atMs: 10_000, expected: 1250 },
    { label: "the buzzer pays the base and no bonus", atMs: 20_000, expected: 1000 },
  ]

  for (const item of cases) {
    const scored = scoreAnswer({ question: target, questionStartedAt: startedAt, choiceId: "a", atMs: item.atMs })
    assert.equal(scored.correct, true, item.label)
    assert.equal(scored.points, item.expected, item.label)
    assert.equal(scored.elapsedMs, item.atMs, item.label)
  }
})

test("the speed bonus is monotonic and never exceeds the clamp", () => {
  const target = question({ points: 1000, timeLimitSeconds: 20 })
  let previous = Number.POSITIVE_INFINITY

  for (let atMs = 0; atMs <= 20_000; atMs += 250) {
    const scored = scoreAnswer({ question: target, questionStartedAt: 0, choiceId: "a", atMs })
    assert.ok(scored.points <= 1500, `bonus at ${atMs}ms must not exceed the clamp`)
    assert.ok(scored.points >= 1000, `a correct answer is worth at least the base at ${atMs}ms`)
    assert.ok(scored.points <= previous, `bonus must not increase with elapsed time (${atMs}ms)`)
    previous = scored.points
  }
})

test("elapsed time is clamped, so clock skew can never buy more than the maximum bonus", () => {
  const target = question({ points: 1000, timeLimitSeconds: 20 })

  const early = scoreAnswer({ question: target, questionStartedAt: START_MS, choiceId: "a", atMs: START_MS - 60_000 })
  assert.equal(early.elapsedMs, 0)
  assert.equal(early.points, 1500)

  const veryLate = scoreAnswer({ question: target, questionStartedAt: START_MS, choiceId: "a", atMs: START_MS + 600_000 })
  assert.equal(veryLate.elapsedMs, 20_000)
  assert.equal(veryLate.points, 1000)
})

test("a wrong answer scores zero whatever the speed", () => {
  const target = question({ points: 1000, timeLimitSeconds: 20 })

  for (const atMs of [0, 1, 10_000, 20_000]) {
    assert.deepEqual(
      scoreAnswer({ question: target, questionStartedAt: 0, choiceId: "b", atMs }),
      { correct: false, points: 0, elapsedMs: atMs },
    )
  }
})

test("a custom base scales the whole formula and a zero-length window has no bonus", () => {
  assert.equal(scoreAnswer({ question: question({ points: 500 }), questionStartedAt: 0, choiceId: "a", atMs: 0 }).points, 750)
  assert.equal(scoreAnswer({ question: question({ points: 333 }), questionStartedAt: 0, choiceId: "a", atMs: 10_000 }).points, 416)

  // No time limit means no bonus is derivable: the answer is worth the base.
  const noWindow = scoreAnswer({ question: question({ timeLimitSeconds: 0 }), questionStartedAt: 0, choiceId: "a", atMs: 0 })
  assert.deepEqual(noWindow, { correct: true, points: DEFAULT_QUESTION_POINTS, elapsedMs: 0 })
})

test("scoring documented in the module matches the reducer's accumulation", () => {
  const running = playing()
  const answered = apply(
    running,
    [{ type: "answer", actorId: "user_1", participantId: "user_1", questionId: "q1", choiceId: "a", atMs: START_MS + 5_000 }],
    START_MS + 5_000,
  )

  // 5s into a 20s window: base 1000 + floor(500 * 0.75) = 1375.
  assert.equal(findParticipant(answered, "user_1")?.score, 1375)
  assert.deepEqual(findParticipant(answered, "user_1")?.answers, [
    { questionId: "q1", choiceId: "a", at: START_MS + 5_000, elapsedMs: 5_000, correct: true, points: 1375 },
  ])
})

// ---------------------------------------------------------------------------
// Timer helpers
// ---------------------------------------------------------------------------

test("remainingMs counts down inside the window and floors at zero", () => {
  const running = playing()

  assert.equal(remainingMs(running, START_MS), 20_000)
  assert.equal(remainingMs(running, START_MS + 1), 19_999)
  assert.equal(remainingMs(running, START_MS + 20_000), 0)
  assert.equal(remainingMs(running, START_MS + 99_999), 0)
})

test("remainingMs is zero outside the question phase", () => {
  assert.equal(remainingMs(sessionWith(), START_MS), 0)
  assert.equal(remainingMs(apply(playing(), [{ type: "reveal", actorId: HOST }], START_MS + 100), START_MS + 100), 0)
  assert.equal(remainingMs(apply(playing(), [{ type: "close", actorId: HOST }], START_MS + 100), START_MS + 100), 0)
})

test("answerWindowOpen mirrors the phase and the clock", () => {
  const lobby = sessionWith()
  assert.equal(answerWindowOpen(lobby, START_MS), false)

  const running = playing()
  assert.equal(answerWindowOpen(running, running.questionStartedAt - 5_000), true, "an early clock is inside the window")
  assert.equal(answerWindowOpen(running, running.questionStartedAt + 19_999), true)
  assert.equal(answerWindowOpen(running, running.questionStartedAt + 20_000), true)
  assert.equal(answerWindowOpen(running, running.questionStartedAt + 20_001), false)
})

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------

/** Builds a participant directly, so tie-breaks can be set up precisely. */
function player(id: string, input: {
  score: number
  joinedAt?: number
  times?: number[]
  correct?: boolean[]
}): LiveQuizParticipant {
  const times = input.times ?? []
  return {
    id,
    name: id,
    joinedAt: input.joinedAt ?? START_MS,
    score: input.score,
    answers: times.map((elapsedMs, index) => ({
      questionId: `q${index + 1}`,
      choiceId: "a",
      at: START_MS + elapsedMs,
      elapsedMs,
      correct: input.correct?.[index] ?? true,
      points: 0,
    })),
  }
}

test("the leaderboard orders by score, highest first", () => {
  const session = sessionWith({
    participants: [
      player("low", { score: 500 }),
      player("high", { score: 2000 }),
      player("mid", { score: 1200 }),
    ],
  })

  assert.deepEqual(leaderboard(session).map((participant) => participant.id), ["high", "mid", "low"])
})

test("an exact score tie is broken by total answer time, then join order, then id", () => {
  const session = sessionWith({
    participants: [
      // Same score; the quicker total answer time wins (4000ms vs 5000ms).
      player("slow", { score: 2000, joinedAt: START_MS, times: [3000, 2000] }),
      player("quick", { score: 2000, joinedAt: START_MS + 50, times: [1000, 1000] }),
      // Same score and same total answer time as "quick" (2000ms), but joined later.
      player("late", { score: 2000, joinedAt: START_MS + 900, times: [1500, 500] }),
      // Same score, same total time, same join time as "late": only the id is left.
      player("aaa", { score: 2000, joinedAt: START_MS + 900, times: [1500, 500] }),
    ],
  })

  assert.deepEqual(
    leaderboard(session).map((participant) => participant.id),
    ["quick", "aaa", "late", "slow"],
  )
  assert.equal(totalAnswerTimeMs(player("slow", { score: 0, times: [3000, 2000] })), 5000)
})

test("the leaderboard does not depend on the stored participant order", () => {
  const participants = [
    player("quick", { score: 2000, joinedAt: START_MS + 50, times: [1000, 1000] }),
    player("slow", { score: 2000, joinedAt: START_MS, times: [3000, 2000] }),
    player("aaa", { score: 2000, joinedAt: START_MS + 900, times: [1500, 500] }),
    player("late", { score: 2000, joinedAt: START_MS + 900, times: [1500, 500] }),
  ]
  const forward = leaderboard(sessionWith({ participants })).map((participant) => participant.id)
  const reversed = leaderboard(sessionWith({ participants: [...participants].reverse() })).map((participant) => participant.id)

  assert.deepEqual(forward, ["quick", "aaa", "late", "slow"])
  assert.deepEqual(reversed, forward)
})

test("an unanswered player ranks below an answered player on equal points", () => {
  const session = sessionWith({
    participants: [player("silent", { score: 0 }), player("wrong", { score: 0, times: [100] })],
  })

  // Both scored nothing, but "wrong" answered: 100ms of answer time beats none.
  assert.deepEqual(leaderboard(session).map((participant) => participant.id), ["wrong", "silent"])
})

test("a zero-participant leaderboard is empty rather than throwing", () => {
  assert.deepEqual(leaderboard(sessionWith()), [])
})

// ---------------------------------------------------------------------------
// Results summary
// ---------------------------------------------------------------------------

test("summarizeResults captures per-player rank, accuracy, and answer time", () => {
  // q1 opens at T+0, q2 opens at T+5000, so the elapsed times below are real
  // (not an artefact of reusing one clock reading for the whole game).
  const session = applySteps(sessionWith(), [
    { event: { type: "join", actorId: "user_1", participantId: "user_1", name: "Ada" }, at: START_MS },
    { event: { type: "join", actorId: "user_2", participantId: "user_2", name: "Grace" }, at: START_MS },
    { event: { type: "start", actorId: HOST }, at: START_MS },
    // Ada: correct, 2s into a 20s window → 1000 + floor(500 * 18/20) = 1450.
    { event: { type: "answer", actorId: "user_1", participantId: "user_1", questionId: "q1", choiceId: "a", atMs: START_MS + 2_000 }, at: START_MS + 2_000 },
    // Grace: wrong → 0 points, but the attempt still counts as answered.
    { event: { type: "answer", actorId: "user_2", participantId: "user_2", questionId: "q1", choiceId: "c", atMs: START_MS + 4_000 }, at: START_MS + 4_000 },
    { event: { type: "reveal", actorId: HOST }, at: START_MS + 5_000 },
    { event: { type: "next", actorId: HOST }, at: START_MS + 5_000 },
    // Grace: correct, 7s into q2's window → 1000 + floor(500 * 13/20) = 1325. Just short of Ada.
    { event: { type: "answer", actorId: "user_2", participantId: "user_2", questionId: "q2", choiceId: "a", atMs: START_MS + 12_000 }, at: START_MS + 12_000 },
    { event: { type: "reveal", actorId: HOST }, at: START_MS + 13_000 },
    { event: { type: "next", actorId: HOST }, at: START_MS + 13_000 },
  ])

  const summary = summarizeResults(session, START_MS + 14_000)

  assert.equal(session.phase, "finished")
  assert.equal(summary.code, "ABCDEF")
  assert.equal(summary.quizTitle, "Solar system")
  assert.equal(summary.finishedAt, START_MS + 14_000)
  assert.deepEqual(summary.participants, [
    { participantId: "user_1", name: "Ada", score: 1450, rank: 1, correctCount: 1, answeredCount: 1, totalAnswerTimeMs: 2_000 },
    { participantId: "user_2", name: "Grace", score: 1325, rank: 2, correctCount: 1, answeredCount: 2, totalAnswerTimeMs: 11_000 },
  ])
  assert.deepEqual(summary.questions.map((question) => ({
    questionId: question.questionId,
    answeredCount: question.answeredCount,
    correctCount: question.correctCount,
    accuracy: question.accuracy,
  })), [
    { questionId: "q1", answeredCount: 2, correctCount: 1, accuracy: 0.5 },
    { questionId: "q2", answeredCount: 1, correctCount: 1, accuracy: 1 },
  ])
  assert.deepEqual(summary.totals, { participants: 2, questions: 2, answers: 3, correctAnswers: 2 })
})

test("summarizeResults reports zero accuracy for a question nobody answered", () => {
  const summary = summarizeResults(sessionWith())

  assert.deepEqual(summary.participants, [])
  assert.deepEqual(summary.questions.map((question) => question.accuracy), [0, 0])
  assert.deepEqual(summary.totals, { participants: 0, questions: 2, answers: 0, correctAnswers: 0 })
  assert.equal("finishedAt" in summary, false)
})

test("summary ranks agree with the leaderboard", () => {
  const session = sessionWith({
    participants: [
      player("slow", { score: 2000, joinedAt: START_MS, times: [3000, 2000] }),
      player("quick", { score: 2000, joinedAt: START_MS + 50, times: [1000, 1000] }),
      player("low", { score: 10 }),
    ],
  })

  assert.deepEqual(summarizeResults(session).participants.map((participant) => participant.participantId), leaderboard(session).map((participant) => participant.id))
  assert.deepEqual(summarizeResults(session).participants.map((participant) => participant.rank), [1, 2, 3])
})

// ---------------------------------------------------------------------------
// Serialisation
// ---------------------------------------------------------------------------

test("serialize then parse round-trips a live session without loss", () => {
  let session = sessionWith()
  session = apply(session, [
    { type: "join", actorId: "user_1", participantId: "user_1", name: "Ada" },
    { type: "start", actorId: HOST },
    { type: "answer", actorId: "user_1", participantId: "user_1", questionId: "q1", choiceId: "a", atMs: START_MS + 1_500 },
    { type: "reveal", actorId: HOST },
    { type: "next", actorId: HOST },
  ], START_MS)

  const restored = parseSession(serializeSession(session))

  assert.deepEqual(restored, session)
  assert.equal(restored?.version, SESSION_VERSION)
})

test("a parsed session keeps reducing identically to the original", () => {
  const running = apply(sessionWith(), [
    { type: "join", actorId: "user_1", participantId: "user_1", name: "Ada" },
    { type: "start", actorId: HOST },
  ], START_MS)
  const restored = parseSession(serializeSession(running))
  assert.ok(restored)

  const event: LiveEvent = { type: "answer", actorId: "user_1", participantId: "user_1", questionId: "q1", choiceId: "a", atMs: START_MS + 2_500 }
  assert.deepEqual(reduceSession(restored, event, START_MS + 2_500).session, reduceSession(running, event, START_MS + 2_500).session)
})

test("parseSession never throws on partial or junk data", () => {
  for (const junk of [
    null,
    undefined,
    42,
    true,
    [],
    "",
    "{not json",
    "null",
    JSON.stringify({}),
    JSON.stringify({ code: "ABCDEF" }),
    JSON.stringify({ code: "ABCDEF", quizId: "q", hostUserId: "h", phase: "lobby" }),
    JSON.stringify({ code: "ABCDEF", quizId: "q", hostUserId: "h", phase: "not-a-phase", questions: [question()] }),
    JSON.stringify({ code: "ABCDEF", quizId: "q", hostUserId: "h", phase: "lobby", questions: [] }),
    JSON.stringify({ code: "ABCDEF", quizId: "q", hostUserId: "h", phase: "lobby", questions: [question()], version: 99 }),
  ]) {
    assert.equal(parseSession(junk), null, `${typeof junk === "string" ? junk : JSON.stringify(junk)} is not a session`)
  }
})

test("parseSession drops malformed questions and participants instead of failing", () => {
  const parsed = parseSession(JSON.stringify({
    code: "abcdef",
    quizId: "quiz_1",
    quizTitle: "Solar system",
    hostUserId: HOST,
    phase: "lobby",
    questionIndex: 42,
    questions: [
      question(),
      "nonsense",
      { id: "q_bad", prompt: "One choice only", choices: [{ id: "a", text: "A" }], correctChoiceId: "a" },
      { id: "q_bad2", prompt: "Correct choice missing from the list", choices: [{ id: "a", text: "A" }, { id: "b", text: "B" }], correctChoiceId: "z" },
    ],
    participants: [
      { id: "user_1", name: "Ada", joinedAt: 1, score: 9999, answers: [{ questionId: "q1", choiceId: "a", at: 2, elapsedMs: 3, correct: true, points: 1375 }, "junk"] },
      null,
      { name: "no id" },
    ],
  }))

  assert.ok(parsed)
  assert.equal(parsed.code, "ABCDEF", "the code is canonicalised on read")
  assert.equal(parsed.questions.length, 1)
  assert.equal(parsed.questionIndex, 0, "an out-of-range index is clamped to the last question")
  assert.equal(parsed.participants.length, 1)
  assert.equal(parsed.participants[0].answers.length, 1)
  // The stored total disagrees with the stored answers; the answers win.
  assert.equal(parsed.participants[0].score, 1375)
})

test("normalizeLiveQuestion accepts both the live shape and the stored quiz shape", () => {
  assert.deepEqual(normalizeLiveQuestion({ id: "q", prompt: "P", choices: [{ id: "a", text: "A" }, { id: "b", text: "B" }], correctChoiceId: "b", timeLimitSeconds: 15 }), {
    id: "q",
    prompt: "P",
    choices: [{ id: "a", text: "A" }, { id: "b", text: "B" }],
    correctChoiceId: "b",
    timeLimitSeconds: 15,
  })

  // A row straight out of `quiz_questions`: `question`/`correct_answer_id`.
  assert.deepEqual(normalizeLiveQuestion({ id: "q", question: "P", choices: [{ id: "a", text: "A" }, { id: "b", text: "B" }], correct_answer_id: "a" }), {
    id: "q",
    prompt: "P",
    choices: [{ id: "a", text: "A" }, { id: "b", text: "B" }],
    correctChoiceId: "a",
    timeLimitSeconds: 20,
  })

  assert.equal(normalizeLiveQuestion({ id: "q", prompt: "P", choices: [{ id: "a", text: "A" }, { id: "a", text: "A" }], correctChoiceId: "a" })?.choices.length, 2)
  assert.equal(normalizeLiveQuestion({ id: "", prompt: "P", choices: [{ id: "a", text: "A" }, { id: "b", text: "B" }], correctChoiceId: "a" }), null)
  assert.equal(normalizeLiveQuestion(null), null)
})

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

test("the same inputs and clock always produce the same session and effects", () => {
  const events: Array<{ event: LiveEvent; at: number }> = [
    { event: { type: "join", actorId: "user_1", participantId: "user_1", name: "Ada" }, at: START_MS },
    { event: { type: "join", actorId: "user_2", participantId: "user_2", name: "Grace" }, at: START_MS + 10 },
    { event: { type: "start", actorId: HOST }, at: START_MS + 100 },
    { event: { type: "answer", actorId: "user_1", participantId: "user_1", questionId: "q1", choiceId: "a", atMs: START_MS + 4_321 }, at: START_MS + 4_321 },
    { event: { type: "answer", actorId: "user_2", participantId: "user_2", questionId: "q1", choiceId: "a", atMs: START_MS + 7_654 }, at: START_MS + 7_654 },
    { event: { type: "reveal", actorId: HOST }, at: START_MS + 8_000 },
    { event: { type: "next", actorId: HOST }, at: START_MS + 9_000 },
    { event: { type: "close", actorId: HOST }, at: START_MS + 9_500 },
  ]

  const run = () => {
    let session = sessionWith()
    const effects: string[] = []
    for (const step of events) {
      const result = reduceSession(session, step.event, step.at)
      session = result.session
      effects.push(JSON.stringify(result.effects))
    }
    return { serialized: serializeSession(session), effects, summary: JSON.stringify(summarizeResults(session, START_MS + 9_500)) }
  }

  assert.deepEqual(run(), run())
})

test("construction and scoring do not depend on ambient state", () => {
  const originalNow = Date.now
  const originalRandom = Math.random
  Date.now = () => 1
  Math.random = () => 0.999

  try {
    const running = playing()
    const scored = reduceSession(
      running,
      { type: "answer", actorId: "user_1", participantId: "user_1", questionId: "q1", choiceId: "a", atMs: START_MS + 1_000 },
      START_MS + 1_000,
    )

    assert.equal(findParticipant(scored.session, "user_1")?.score, 1475)
    assert.equal(scored.session.questionStartedAt, START_MS)
    assert.equal(scored.session.code, "ABCDEF")
  } finally {
    Date.now = originalNow
    Math.random = originalRandom
  }
})
