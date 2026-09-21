/**
 * The live-quiz state machine.
 *
 * Everything about a running Kahoot-style session — who is in it, which
 * question is showing, who answered what, and what it scored — is decided
 * here, by one pure function. This file has **zero imports on purpose**: no
 * database, no React, no timers, no `Date.now()`, no `Math.random()` except
 * through an injected argument. The only thing it cannot see is the current
 * time, and that arrives as `nowMs`.
 *
 * Why it is worth the discipline: the rest of the feature (Postgres/D1 rows,
 * HTTP routes, WebSocket or polling transport, two screens) is plumbing around
 * this reduce. If the reduce is right, a live quiz is right — and the entire
 * correctness argument is a unit test with no server running.
 *
 * The reducer never performs an effect. It returns the effects the caller must
 * perform, which is how "the scoring is correct" and "the broadcast happened"
 * become separately arguable claims.
 */

/** Bumped whenever the persisted shape changes incompatibly. */
export const SESSION_VERSION = 1

/**
 * The characters a join code may use. `0/O/1/I/L` are excluded: a host reads
 * the code off a projector and a player types it on a phone, and that is
 * exactly the transcription pair humans get wrong. 31 symbols × 6 places is
 * still ~8.9e8 codes.
 */
export const JOIN_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
export const JOIN_CODE_LENGTH = 6

export type LiveQuizPhase = "lobby" | "question" | "reveal" | "finished"

export interface LiveQuizChoice {
  id: string
  text: string
}

export interface LiveQuizQuestion {
  id: string
  prompt: string
  choices: LiveQuizChoice[]
  correctChoiceId: string
  timeLimitSeconds: number
  /** Base points for a correct answer. Defaults to `DEFAULT_QUESTION_POINTS`. */
  points?: number
}

/**
 * One participant's answer to one question.
 *
 * `at` is absolute epoch ms and `elapsedMs` is `at - <that question's start>`,
 * clamped to the question window at scoring time. `elapsedMs` is stored rather
 * than re-derived because the session only remembers the *current* question's
 * start time, and the leaderboard tie-break ("who was quicker overall") needs
 * every historical answer's duration after the fact.
 */
export interface LiveQuizAnswer {
  questionId: string
  choiceId: string
  at: number
  elapsedMs: number
  correct: boolean
  points: number
}

export interface LiveQuizParticipant {
  id: string
  name: string
  joinedAt: number
  score: number
  answers: LiveQuizAnswer[]
}

export interface LiveQuizSession {
  code: string
  quizId: string
  quizTitle: string
  hostUserId: string
  phase: LiveQuizPhase
  /** Index into `questions`; meaningless in `lobby`, frozen once `finished`. */
  questionIndex: number
  /** Epoch ms the current question opened; `0` outside `question`/`reveal`. */
  questionStartedAt: number
  /**
   * The questions travel *with* the session. The reducer cannot score an
   * answer without the correct choice and the time limit, and the transport
   * cannot draw a question the players do not have, so the question set is
   * part of session state rather than a separate lookup.
   */
  questions: LiveQuizQuestion[]
  participants: LiveQuizParticipant[]
  createdAt: number
  version: number
}

/** Deliberate: an event can only impersonate an actor via `actorId`. */
export interface LiveEventActor {
  actorId: string
}

export type LiveEvent =
  | (LiveEventActor & { type: "join"; participantId: string; name: string })
  | (LiveEventActor & { type: "leave"; participantId: string })
  | (LiveEventActor & { type: "start" })
  | (LiveEventActor & { type: "answer"; participantId: string; questionId: string; choiceId: string; atMs: number })
  | (LiveEventActor & { type: "reveal" })
  | (LiveEventActor & { type: "next" })
  | (LiveEventActor & { type: "close" })

/**
 * What the caller must do after a state change. The pure layer names the work;
 * the transport and the repository do it.
 */
export type LiveEffectType = "broadcast" | "persist" | "finalize"

export interface LiveEffect {
  type: LiveEffectType
  /** The event name that produced this effect, for logs and tests. */
  reason: string
}

export interface LiveReduceResult {
  session: LiveQuizSession
  /**
   * Empty means the event was **rejected** and the session is unchanged (the
   * same reference, in fact). There is no separate error channel: "no effects"
   * is the rejection signal, and callers that need to explain it check the
   * guards in this module (`answerWindowOpen`, `remainingMs`, …) first.
   */
  effects: LiveEffect[]
}

export const DEFAULT_QUESTION_POINTS = 1000
/** A correct answer is worth at most `base * 1.5`: the base plus a full bonus. */
export const MAX_POINTS_MULTIPLIER = 1.5
/** Fraction of the base awarded as a bonus for answering instantly. */
export const SPEED_BONUS_FRACTION = 0.5
const MAX_NAME_LENGTH = 40
const MAX_PARTICIPANTS = 200

// ---------------------------------------------------------------------------
// Join codes
// ---------------------------------------------------------------------------

/**
 * Six characters from `JOIN_CODE_ALPHABET`, uppercase.
 *
 * `random` is injected so the generator is deterministic under test; in
 * production it is `Math.random`, and uniqueness is the repository's problem
 * (it retries on collision against the unique index).
 */
export function generateJoinCode(random: () => number = Math.random): string {
  let code = ""
  for (let index = 0; index < JOIN_CODE_LENGTH; index += 1) {
    const value = random()
    // Clamp: a pathological `random` returning exactly 1 would otherwise index
    // one past the end of the alphabet.
    const position = Math.min(JOIN_CODE_ALPHABET.length - 1, Math.max(0, Math.floor(value * JOIN_CODE_ALPHABET.length)))
    code += JOIN_CODE_ALPHABET[position]
  }
  return code
}

/**
 * Canonicalises typed input: trims, uppercases, and drops spaces and dashes
 * (people read "ABC-123" aloud). Returns `null` for anything that is not a
 * well-formed code — including codes containing the ambiguous characters the
 * generator never emits.
 */
export function normalizeJoinCode(input: unknown): string | null {
  if (typeof input !== "string") return null
  const candidate = input.trim().toUpperCase().replace(/[\s-]+/g, "")
  if (candidate.length !== JOIN_CODE_LENGTH) return null
  for (const character of candidate) {
    if (!JOIN_CODE_ALPHABET.includes(character)) return null
  }
  return candidate
}

// ---------------------------------------------------------------------------
// Session construction
// ---------------------------------------------------------------------------

export function createLiveSession(input: {
  code: string
  quizId: string
  quizTitle: string
  hostUserId: string
  questions: LiveQuizQuestion[]
  createdAt: number
}): LiveQuizSession {
  return {
    code: normalizeJoinCode(input.code) || input.code,
    quizId: input.quizId,
    quizTitle: input.quizTitle,
    hostUserId: input.hostUserId,
    phase: "lobby",
    questionIndex: 0,
    questionStartedAt: 0,
    questions: input.questions.map(normalizeLiveQuestion).filter((question): question is LiveQuizQuestion => Boolean(question)),
    participants: [],
    createdAt: input.createdAt,
    version: SESSION_VERSION,
  }
}

/** The current question, or `null` in the lobby (and for an empty quiz). */
export function currentQuestion(session: LiveQuizSession): LiveQuizQuestion | null {
  return session.questions[session.questionIndex] ?? null
}

export function questionTimeLimitMs(question: LiveQuizQuestion | null): number {
  if (!question) return 0
  return Math.max(0, Number(question.timeLimitSeconds) || 0) * 1000
}

/**
 * Milliseconds left in the current question, floored at 0. `0` outside the
 * `question` phase, which is what a player's timer bar wants to draw.
 */
export function remainingMs(session: LiveQuizSession, nowMs: number): number {
  if (session.phase !== "question") return 0
  const limitMs = questionTimeLimitMs(currentQuestion(session))
  return Math.max(0, session.questionStartedAt + limitMs - nowMs)
}

/**
 * Is the answer window open? Inclusive of the instant the limit is reached —
 * the clock and the player's tap land on the same millisecond far more often
 * than intuition suggests, and a correct answer at exactly `t = limit` scores
 * the base with no bonus rather than vanishing.
 */
export function answerWindowOpen(session: LiveQuizSession, nowMs: number): boolean {
  if (session.phase !== "question") return false
  const limitMs = questionTimeLimitMs(currentQuestion(session))
  return nowMs <= session.questionStartedAt + limitMs
}

export function findParticipant(session: LiveQuizSession, participantId: string): LiveQuizParticipant | null {
  return session.participants.find((participant) => participant.id === participantId) ?? null
}

export function hasAnswered(session: LiveQuizSession, participantId: string, questionId: string): boolean {
  const participant = findParticipant(session, participantId)
  return Boolean(participant?.answers.some((answer) => answer.questionId === questionId))
}

/**
 * Points for one answer — the whole scoring rule, in one place.
 *
 * ```
 * base      = question.points ?? 1000
 * limitMs   = question.timeLimitSeconds * 1000
 * elapsedMs = clamp(atMs - questionStartedAt, 0, limitMs)
 * bonus     = limitMs > 0 ? floor(base * 0.5 * (limitMs - elapsedMs) / limitMs) : 0
 * points    = correct ? clamp(base + bonus, 0, base * 1.5) : 0
 * ```
 *
 * So an instant answer scores `1.5 * base` and an answer on the buzzer scores
 * exactly `base`; the bonus decays linearly and monotonically with elapsed
 * time and never pushes a score past the clamp. `atMs` before the question
 * opened (device clock skew) clamps to `elapsedMs = 0`, i.e. the fastest
 * legitimate bonus, never more.
 *
 * Integer arithmetic only, so the same inputs always produce the same points.
 */
export function scoreAnswer(input: {
  question: LiveQuizQuestion
  questionStartedAt: number
  choiceId: string
  atMs: number
}): { correct: boolean; points: number; elapsedMs: number } {
  const base = Math.max(0, Number(input.question.points ?? DEFAULT_QUESTION_POINTS) || 0)
  const limitMs = questionTimeLimitMs(input.question)
  const elapsedMs = Math.min(Math.max(0, input.atMs - input.questionStartedAt), limitMs)
  const correct = input.choiceId === input.question.correctChoiceId
  if (!correct) return { correct: false, points: 0, elapsedMs }

  const remainingRatio = limitMs > 0 ? (limitMs - elapsedMs) / limitMs : 0
  const bonus = Math.floor(base * SPEED_BONUS_FRACTION * remainingRatio)
  const points = Math.min(Math.max(0, base + bonus), Math.floor(base * MAX_POINTS_MULTIPLIER))
  return { correct: true, points, elapsedMs }
}

// ---------------------------------------------------------------------------
// Read models
// ---------------------------------------------------------------------------

export function totalAnswerTimeMs(participant: LiveQuizParticipant): number {
  return participant.answers.reduce((total, answer) => total + Math.max(0, answer.elapsedMs), 0)
}

/**
 * The speed a tie-break compares: total answer time, or `Infinity` for a
 * player who never answered.
 *
 * Without the `Infinity` arm, "no answers" is 0ms — the *fastest* possible
 * total — and a player who sat the whole quiz out would out-rank a player who
 * answered and got it wrong. Speed only ranks players who actually played.
 */
function speedForRanking(participant: LiveQuizParticipant): number {
  return participant.answers.length ? totalAnswerTimeMs(participant) : Number.POSITIVE_INFINITY
}

/**
 * Participants best-first.
 *
 * The tie-breaks are the difference between a leaderboard and a coin flip:
 * equal score falls back to the lower **total answer time** (two players on
 * 2000 points are separated by who actually knew it faster), then to **join
 * order** (`joinedAt`), then to **id**. Every comparator is total, so the
 * order does not depend on the order the rows came back from the database in —
 * which matters, because that order is not stable across a sharded read.
 */
export function leaderboard(session: LiveQuizSession): LiveQuizParticipant[] {
  return [...session.participants].sort((left, right) => {
    const scoreDelta = right.score - left.score
    if (scoreDelta !== 0) return scoreDelta

    const leftSpeed = speedForRanking(left)
    const rightSpeed = speedForRanking(right)
    if (leftSpeed !== rightSpeed) return leftSpeed < rightSpeed ? -1 : 1

    const joinedDelta = left.joinedAt - right.joinedAt
    if (joinedDelta !== 0) return joinedDelta

    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
  })
}

export interface LiveParticipantResult {
  participantId: string
  name: string
  score: number
  rank: number
  correctCount: number
  answeredCount: number
  totalAnswerTimeMs: number
}

export interface LiveQuestionResult {
  questionId: string
  prompt: string
  correctChoiceId: string
  answeredCount: number
  correctCount: number
  /** `correctCount / answeredCount`, or 0 when nobody answered. */
  accuracy: number
}

export interface LiveResultsSummary {
  code: string
  quizId: string
  quizTitle: string
  hostUserId: string
  version: number
  createdAt: number
  finishedAt?: number
  participants: LiveParticipantResult[]
  questions: LiveQuestionResult[]
  totals: {
    participants: number
    questions: number
    answers: number
    correctAnswers: number
  }
}

/**
 * The record that outlives the session — what "saved results" means.
 *
 * Ranks come from `leaderboard`, so the summary cannot disagree with the screen
 * the players just watched.
 */
export function summarizeResults(session: LiveQuizSession, finishedAt?: number): LiveResultsSummary {
  const ordered = leaderboard(session)
  const participants: LiveParticipantResult[] = ordered.map((participant, index) => ({
    participantId: participant.id,
    name: participant.name,
    score: participant.score,
    rank: index + 1,
    correctCount: participant.answers.filter((answer) => answer.correct).length,
    answeredCount: participant.answers.length,
    totalAnswerTimeMs: totalAnswerTimeMs(participant),
  }))

  const questions: LiveQuestionResult[] = session.questions.map((question) => {
    let answeredCount = 0
    let correctCount = 0
    for (const participant of session.participants) {
      const answer = participant.answers.find((candidate) => candidate.questionId === question.id)
      if (!answer) continue
      answeredCount += 1
      if (answer.correct) correctCount += 1
    }
    return {
      questionId: question.id,
      prompt: question.prompt,
      correctChoiceId: question.correctChoiceId,
      answeredCount,
      correctCount,
      accuracy: answeredCount > 0 ? correctCount / answeredCount : 0,
    }
  })

  return {
    code: session.code,
    quizId: session.quizId,
    quizTitle: session.quizTitle,
    hostUserId: session.hostUserId,
    version: session.version,
    createdAt: session.createdAt,
    ...(finishedAt === undefined ? {} : { finishedAt }),
    participants,
    questions,
    totals: {
      participants: session.participants.length,
      questions: session.questions.length,
      answers: participants.reduce((total, participant) => total + participant.answeredCount, 0),
      correctAnswers: participants.reduce((total, participant) => total + participant.correctCount, 0),
    },
  }
}

// ---------------------------------------------------------------------------
// The reducer
// ---------------------------------------------------------------------------

function broadcast(reason: string): LiveEffect[] {
  return [{ type: "broadcast", reason }, { type: "persist", reason }]
}

/**
 * Applies one event.
 *
 * Every host-only event is checked against `event.actorId === session.hostUserId`
 * and returns the untouched session when it fails — a non-host's `start` is not
 * "applied differently", it does not happen at all. The same posture applies to
 * answering: out of phase, out of window, unknown participant, unknown question,
 * unknown choice, and already-answered are all refusals, not best-effort writes.
 */
export function reduceSession(session: LiveQuizSession, event: LiveEvent, nowMs: number): LiveReduceResult {
  const reject: LiveReduceResult = { session, effects: [] }
  switch (event.type) {
    case "join": {
      const name = String(event.name ?? "").trim().slice(0, MAX_NAME_LENGTH)
      if (!event.participantId || !name) return reject
      // Late join is allowed while a quiz is running — a player who scans the
      // code mid-game still gets to play the questions that remain, with 0 for
      // the ones they missed. Only a finished session is closed to entries.
      if (session.phase === "finished") return reject
      if (findParticipant(session, event.participantId)) return reject
      if (session.participants.length >= MAX_PARTICIPANTS) return reject

      const participant: LiveQuizParticipant = {
        id: event.participantId,
        name,
        joinedAt: nowMs,
        score: 0,
        answers: [],
      }
      return {
        session: { ...session, participants: [...session.participants, participant] },
        effects: broadcast("join"),
      }
    }

    case "leave": {
      if (session.phase === "finished") return reject
      const participant = findParticipant(session, event.participantId)
      if (!participant) return reject
      return {
        session: {
          ...session,
          participants: session.participants.filter((candidate) => candidate.id !== event.participantId),
        },
        effects: broadcast("leave"),
      }
    }

    case "start": {
      if (event.actorId !== session.hostUserId) return reject
      if (session.phase !== "lobby") return reject
      if (!session.questions.length) return reject
      return {
        session: { ...session, phase: "question", questionIndex: 0, questionStartedAt: nowMs },
        effects: broadcast("start"),
      }
    }

    case "answer": {
      if (session.phase !== "question") return reject
      if (!answerWindowOpen(session, event.atMs)) return reject
      const question = currentQuestion(session)
      if (!question || event.questionId !== question.id) return reject
      if (!question.choices.some((choice) => choice.id === event.choiceId)) return reject
      const participant = findParticipant(session, event.participantId)
      if (!participant) return reject
      // One answer per participant per question, enforced here rather than by
      // the table: a retried request must not score twice.
      if (hasAnswered(session, event.participantId, question.id)) return reject

      const scored = scoreAnswer({
        question,
        questionStartedAt: session.questionStartedAt,
        choiceId: event.choiceId,
        atMs: event.atMs,
      })
      const answer: LiveQuizAnswer = {
        questionId: question.id,
        choiceId: event.choiceId,
        at: event.atMs,
        elapsedMs: scored.elapsedMs,
        correct: scored.correct,
        points: scored.points,
      }
      return {
        session: {
          ...session,
          participants: session.participants.map((candidate) =>
            candidate.id === participant.id
              ? {
                  ...candidate,
                  score: candidate.score + scored.points,
                  answers: [...candidate.answers, answer],
                }
              : candidate,
          ),
        },
        effects: broadcast("answer"),
      }
    }

    case "reveal": {
      if (event.actorId !== session.hostUserId) return reject
      if (session.phase !== "question") return reject
      return { session: { ...session, phase: "reveal" }, effects: broadcast("reveal") }
    }

    case "next": {
      if (event.actorId !== session.hostUserId) return reject
      if (session.phase !== "reveal") return reject
      const nextIndex = session.questionIndex + 1
      if (nextIndex >= session.questions.length) {
        return {
          session: { ...session, phase: "finished", questionStartedAt: 0 },
          effects: [...broadcast("next"), { type: "finalize", reason: "next" }],
        }
      }
      return {
        session: { ...session, phase: "question", questionIndex: nextIndex, questionStartedAt: nowMs },
        effects: broadcast("next"),
      }
    }

    case "close": {
      if (event.actorId !== session.hostUserId) return reject
      if (session.phase === "finished") return reject
      return {
        session: { ...session, phase: "finished", questionStartedAt: 0 },
        effects: [...broadcast("close"), { type: "finalize", reason: "close" }],
      }
    }

    default:
      return reject
  }
}

// ---------------------------------------------------------------------------
// Serialisation
// ---------------------------------------------------------------------------

export function serializeSession(session: LiveQuizSession): string {
  return JSON.stringify(session)
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN
  return Number.isFinite(parsed) ? parsed : fallback
}

/**
 * Normalises one question from stored/JSON input.
 *
 * Returns `null` for anything unusable (no id, no prompt, fewer than two
 * choices, or a correct choice that is not among them) rather than throwing —
 * a corrupt question must not take down a lobby.
 */
export function normalizeLiveQuestion(value: unknown): LiveQuizQuestion | null {
  const record = asRecord(value)
  if (!record) return null
  const id = asString(record.id).trim()
  const prompt = asString(record.prompt ?? record.question).trim()
  if (!id || !prompt) return null

  const choices = (Array.isArray(record.choices) ? record.choices : []).flatMap((rawChoice): LiveQuizChoice[] => {
    const choice = asRecord(rawChoice)
    if (!choice) return []
    const choiceId = asString(choice.id).trim()
    const text = asString(choice.text).trim()
    if (!choiceId || !text) return []
    return [{ id: choiceId, text }]
  })
  if (choices.length < 2) return null

  const correctChoiceId = asString(record.correctChoiceId ?? record.correct_answer_id).trim()
  if (!correctChoiceId || !choices.some((choice) => choice.id === correctChoiceId)) return null

  const timeLimitSeconds = asNumber(record.timeLimitSeconds, 20)
  return {
    id,
    prompt,
    choices,
    correctChoiceId,
    timeLimitSeconds: timeLimitSeconds > 0 ? timeLimitSeconds : 20,
    ...(record.points === undefined ? {} : { points: asNumber(record.points, DEFAULT_QUESTION_POINTS) }),
  }
}

function parseParticipant(value: unknown): LiveQuizParticipant | null {
  const record = asRecord(value)
  if (!record) return null
  const id = asString(record.id).trim()
  if (!id) return null
  const answers = (Array.isArray(record.answers) ? record.answers : []).flatMap((raw): LiveQuizAnswer[] => {
    const answer = asRecord(raw)
    if (!answer) return []
    const questionId = asString(answer.questionId).trim()
    const choiceId = asString(answer.choiceId).trim()
    if (!questionId || !choiceId) return []
    return [{
      questionId,
      choiceId,
      at: asNumber(answer.at),
      elapsedMs: Math.max(0, asNumber(answer.elapsedMs)),
      correct: answer.correct === true,
      points: Math.max(0, asNumber(answer.points)),
    }]
  })
  // `score` is re-derived from the answers instead of trusted: the stored total
  // and the stored answers disagreeing is a corruption, and the answers are the
  // evidence the results summary needs.
  const score = answers.reduce((total, answer) => total + answer.points, 0)
  return {
    id,
    name: asString(record.name).trim().slice(0, MAX_NAME_LENGTH) || "Player",
    joinedAt: asNumber(record.joinedAt),
    score,
    answers,
  }
}

const livePhases: readonly LiveQuizPhase[] = ["lobby", "question", "reveal", "finished"]

function parsePhase(value: unknown): LiveQuizPhase | null {
  return typeof value === "string" && (livePhases as readonly string[]).includes(value) ? (value as LiveQuizPhase) : null
}

/**
 * Reads back a persisted session.
 *
 * Never throws: input arrives from a JSON column and from the network, and a
 * lobby that fails to render because one participant row is malformed is worse
 * than one that renders without them. Returns `null` only when the session
 * cannot be trusted at all — no code, no host, no quiz, no questions, or a
 * `version` this build does not understand (refusing a future shape is the
 * honest failure; guessing at it is how a live game silently mis-scores).
 */
export function parseSession(input: unknown): LiveQuizSession | null {
  let value = input
  if (typeof value === "string") {
    try {
      value = JSON.parse(value)
    } catch {
      return null
    }
  }
  const record = asRecord(value)
  if (!record) return null

  const version = record.version === undefined ? SESSION_VERSION : asNumber(record.version, Number.NaN)
  if (version !== SESSION_VERSION) return null

  const code = asString(record.code).trim().toUpperCase()
  const quizId = asString(record.quizId).trim()
  const hostUserId = asString(record.hostUserId).trim()
  const phase = parsePhase(record.phase)
  if (!code || !quizId || !hostUserId || !phase) return null

  const questions = (Array.isArray(record.questions) ? record.questions : [])
    .map(normalizeLiveQuestion)
    .filter((question): question is LiveQuizQuestion => Boolean(question))
  if (!questions.length) return null

  const participants = (Array.isArray(record.participants) ? record.participants : [])
    .map(parseParticipant)
    .filter((participant): participant is LiveQuizParticipant => Boolean(participant))

  const questionIndex = Math.min(Math.max(0, Math.trunc(asNumber(record.questionIndex))), Math.max(0, questions.length - 1))

  return {
    code,
    quizId,
    quizTitle: asString(record.quizTitle, "Live quiz"),
    hostUserId,
    phase,
    questionIndex,
    questionStartedAt: Math.max(0, asNumber(record.questionStartedAt)),
    questions,
    participants,
    createdAt: asNumber(record.createdAt),
    version: SESSION_VERSION,
  }
}
