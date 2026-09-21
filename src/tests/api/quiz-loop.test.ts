/**
 * The create → play → learn loop, executed end to end.
 *
 * The AI council's highest-confidence finding was that nobody had ever
 * demonstrated this loop closing: the app's whole thesis is that the thing you
 * *make* and the thing you *play* are the same object, and there was no
 * evidence that a created quiz could actually be played and scored, let alone
 * that the result fed back into the learning record.
 *
 * This test runs both real handlers against a stateful fake of the two quiz
 * tables, so the attempt genuinely reads back the quiz the create step wrote.
 * It is not two disconnected fixtures — if `saveQuiz` stops writing a column
 * that `getQuiz` needs, this test fails.
 *
 * What it pins:
 *   1. `POST /api/quizzes` writes a quiz plus its questions.
 *   2. `POST /api/quizzes/attempts` reads that quiz back, scores it, and
 *      writes an attempt.
 *   3. The attempt *also* writes a `practice_sessions` row whose metadata
 *      carries the quiz id — this is the artifact-becomes-activity link, the
 *      structural thing the app has that a notes app or a quiz app does not.
 *   4. Every multi-row write is batched into one statement, not N.
 */

import assert from "node:assert/strict"
import test from "node:test"

import {
  installDatabaseStub,
  primeDatabase,
  readJson,
  request,
  stubSessionLookup,
  TEST_USER_ROW,
  type DatabaseStub,
} from "./harness"

type Row = Record<string, unknown>

const QUIZ_COLUMNS = ["id", "title", "topic", "description", "source"]
const QUESTION_COLUMNS = [
  "id",
  "quiz_id",
  "question",
  "choices",
  "correct_answer_id",
  "topic",
  "explanation",
]
const PRACTICE_ITEM_COLUMNS = [
  "id", "session_id", "question_id", "review_item_id", "content_item_id",
  "prompt", "answer", "user_answer", "correct", "elapsed_ms", "metadata",
]
const ATTEMPT_ANSWER_COLUMNS = ["id", "attempt_id", "question_id", "topic", "selected_answer_id", "correct"]

function sliceRows(params: unknown[], width: number): unknown[][] {
  const rows: unknown[][] = []
  for (let index = 0; index + width <= params.length; index += width) {
    rows.push(params.slice(index, index + width))
  }
  return rows
}

function toRecord(columns: string[], values: unknown[]): Row {
  return Object.fromEntries(columns.map((column, index) => [column, values[index]]))
}

/**
 * A minimal stateful stand-in for `quizzes` + `quiz_questions`. Writes are
 * captured and reads are served from what was captured, so the two halves of
 * the loop are actually connected.
 */
function installQuizStore(stub: DatabaseStub) {
  const quizzes = new Map<string, Row>()
  const questions = new Map<string, Row[]>()

  stub.on(/INSERT INTO quizzes/, (_sql, params) => {
    const row = toRecord(QUIZ_COLUMNS, params)
    row.workspace_id = "workspace_demo"
    quizzes.set(String(row.id), row)
    return { rowCount: 1 }
  })

  stub.on(/INSERT INTO quiz_questions/, (_sql, params) => {
    const rows = sliceRows(params, QUESTION_COLUMNS.length).map((values) =>
      toRecord(QUESTION_COLUMNS, values),
    )
    for (const row of rows) {
      const quizId = String(row.quiz_id)
      questions.set(quizId, [...(questions.get(quizId) ?? []), row])
    }
    return { rowCount: rows.length }
  })

  stub.on(/SELECT \* FROM quizzes/, (_sql, params) => {
    const row = quizzes.get(String(params[0]))
    return { rows: row ? [row] : [] }
  })

  stub.on(/SELECT \* FROM quiz_questions/, (_sql, params) => ({
    rows: questions.get(String(params[0])) ?? [],
  }))

  return { quizzes, questions }
}

const QUESTIONS = [
  {
    question: "Which gas do plants absorb?",
    choices: [
      { id: "a", text: "Oxygen" },
      { id: "b", text: "Carbon dioxide" },
    ],
    correct_answer_id: "b",
    topic: "Gas exchange",
    explanation: "CO2 enters through the stomata.",
  },
  {
    question: "Where does photosynthesis happen?",
    choices: [
      { id: "a", text: "Chloroplast" },
      { id: "b", text: "Mitochondria" },
    ],
    correct_answer_id: "a",
    topic: "Cell biology",
    explanation: "Chloroplasts contain chlorophyll.",
  },
]

test("a quiz can be created, played, scored, and recorded as a practice session", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    const store = installQuizStore(stub)

    const quizzesRoute = await import("../../app/api/quizzes/route")
    const attemptsRoute = await import("../../app/api/quizzes/attempts/route")

    // ---- 1. Create -------------------------------------------------------
    const created = await quizzesRoute.POST(
      request("/api/quizzes", {
        method: "POST",
        body: { title: "Photosynthesis", topic: "Biology", questions: QUESTIONS },
      }),
    )
    assert.equal(created.status, 201)
    const createdBody = await readJson<{ item: { id: string; questions: { id: string }[] } }>(created)
    const quizId = createdBody.item.id
    assert.ok(quizId, "the create step must return an id the play step can use")
    assert.equal(createdBody.item.questions.length, 2)

    // ---- 2. Play ---------------------------------------------------------
    // The attempt reads the quiz back out of the store, so it depends on what
    // the create step actually wrote rather than on a hand-written fixture.
    const [first, second] = createdBody.item.questions
    const played = await attemptsRoute.POST(
      request("/api/quizzes/attempts", {
        method: "POST",
        body: {
          quizId,
          durationSeconds: 42,
          answers: [
            { questionId: first.id, selectedAnswerId: "b" }, // correct
            { questionId: second.id, selectedAnswerId: "b" }, // wrong, key is "a"
          ],
        },
      }),
    )
    assert.equal(played.status, 200)
    const result = await readJson<{
      attemptId: string
      practiceSessionId: string
      score: number
      total: number
      durationSeconds: number
    }>(played)

    // ---- 3. Score --------------------------------------------------------
    assert.equal(result.score, 1, "exactly one of the two answers was correct")
    assert.equal(result.total, 2)
    assert.equal(result.durationSeconds, 42)
    assert.match(result.attemptId, /^attempt/)
    assert.match(result.practiceSessionId, /^practice/)

    const attemptInsert = stub.matching(/INSERT INTO quiz_attempts/)
    assert.equal(attemptInsert.length, 1)
    assert.equal(attemptInsert[0].params[1], quizId)
    assert.equal(attemptInsert[0].params[2], TEST_USER_ROW.id, "the attempt belongs to the caller")
    assert.equal(attemptInsert[0].params[3], 1, "score")
    assert.equal(attemptInsert[0].params[4], 2, "total")
    assert.equal(attemptInsert[0].params[5], 42, "duration")

    // ---- 4. The artifact became an activity ------------------------------
    // A quiz row and a practice_sessions row, written from one request, tied
    // together by metadata.quizId. This is the loop's load-bearing seam.
    const sessionInsert = stub.matching(/INSERT INTO practice_sessions/)
    assert.equal(sessionInsert.length, 1, "playing a quiz must also open a practice session")

    // Named rather than destructured: `ended_at` is `now()` in the SQL and so
    // is not a bound parameter, which makes a positional destructure silently
    // off by one.
    const session = sessionInsert[0].params
    const sessionId = session[0]
    const sessionUserId = session[1]
    const sessionType = session[3]
    const sessionDuration = session[5]
    const sessionScore = session[6]
    const sessionTotal = session[7]
    const sessionMetadata = session[8]
    assert.equal(session.length, 9)

    assert.equal(sessionId, result.practiceSessionId, "the returned session id must be the written one")
    assert.equal(sessionUserId, TEST_USER_ROW.id)
    assert.equal(sessionType, "quiz")
    assert.equal(sessionScore, 1)
    assert.equal(sessionTotal, 2)
    assert.equal(sessionDuration, 42)
    assert.ok(
      String(sessionMetadata).includes(quizId),
      "the practice session must record which artifact it came from",
    )
    assert.ok(
      String(sessionMetadata).includes("Photosynthesis"),
      "the practice session must carry the artifact's title, not just its id",
    )

    // ---- 5. Nothing is written N+1 ---------------------------------------
    const sessionItems = stub.matching(/INSERT INTO practice_session_items/)
    assert.equal(sessionItems.length, 1, "practice items must be batched into one statement")
    assert.equal(sessionItems[0].params.length, 2 * PRACTICE_ITEM_COLUMNS.length)

    const attemptAnswers = stub.matching(/INSERT INTO quiz_attempt_answers/)
    assert.equal(attemptAnswers.length, 1, "attempt answers must be batched into one statement")
    assert.equal(attemptAnswers[0].params.length, 2 * ATTEMPT_ANSWER_COLUMNS.length)

    // ---- 6. The content survived the round trip --------------------------
    const item = (index: number) =>
      toRecord(PRACTICE_ITEM_COLUMNS, sessionItems[0].params.slice(index * 11, index * 11 + 11))

    const firstItem = item(0)
    const secondItem = item(1)
    assert.equal(firstItem.correct, 1)
    assert.equal(secondItem.correct, 0)
    assert.ok(
      String(firstItem.answer).includes("Carbon dioxide"),
      "the practice item must store the correct answer as text, not just an id",
    )
    assert.ok(String(firstItem.answer).includes("CO2 enters through the stomata."))
    assert.equal(firstItem.user_answer, "Carbon dioxide")
    assert.equal(secondItem.user_answer, "Mitochondria")

    // ---- 7. The loop is auditable ----------------------------------------
    // Two writes, two audit rows: the create logs the artifact, the play logs
    // the activity. Both sides of the loop are traceable, not just the last one.
    const audit = stub.matching(/INSERT INTO audit_logs/)
    assert.equal(audit.length, 2)
    const auditedEntities = audit.map((statement) => statement.params[3])
    assert.deepEqual(auditedEntities, ["quiz", "quiz_attempt"])
  } finally {
    stub.restore()
  }
})

test("playing a quiz that does not exist fails cleanly instead of writing a phantom attempt", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    installQuizStore(stub)

    const attemptsRoute = await import("../../app/api/quizzes/attempts/route")
    const played = await attemptsRoute.POST(
      request("/api/quizzes/attempts", {
        method: "POST",
        body: { quizId: "quiz_does_not_exist", answers: [{ questionId: "qq_1", selectedAnswerId: "a" }] },
      }),
    )

    // `recordQuizAttempt` throws "Quiz not found"; the error boundary turns
    // that into a clean 400 rather than an opaque 500.
    assert.equal(played.status, 400)
    const body = await readJson<{ error: string }>(played)
    assert.match(body.error, /not found/i)
    assert.equal(stub.matching(/INSERT INTO quiz_attempts/).length, 0)
    assert.equal(stub.matching(/INSERT INTO practice_sessions/).length, 0)
  } finally {
    stub.restore()
  }
})

test("an attempt with no answers is rejected before the quiz is even loaded", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    installQuizStore(stub)

    const attemptsRoute = await import("../../app/api/quizzes/attempts/route")
    const played = await attemptsRoute.POST(
      request("/api/quizzes/attempts", {
        method: "POST",
        body: { quizId: "quiz_1", answers: [] },
      }),
    )

    assert.equal(played.status, 400)
    assert.equal(stub.matching(/SELECT \* FROM quizzes/).length, 0)
  } finally {
    stub.restore()
  }
})
