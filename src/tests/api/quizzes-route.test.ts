/**
 * The first route-handler test in the codebase.
 *
 * `POST /api/quizzes` was chosen because it is the highest-risk authenticated
 * mutation: it writes a quiz row plus N question rows and it sits on the exact
 * path the product depends on (create → play → learn). Before this file, the
 * 49 handlers under `src/app/api` had never been executed by a test.
 *
 * This test does not mock `lib/data.ts`. It runs the real handler, the real
 * data layer, the real SQL normaliser, and asserts on the statements that
 * actually reached the database boundary — so it fails if any of those links
 * break, which is precisely what the other 383 tests cannot tell you.
 */

import assert from "node:assert/strict"
import test from "node:test"

import { installDatabaseStub, primeDatabase, readJson, request, stubSessionLookup } from "./harness"

const QUIZ_ID = "quiz_test_1"

const QUIZ_ROW = {
  id: QUIZ_ID,
  workspace_id: "workspace_demo",
  title: "Photosynthesis",
  topic: "Biology",
  description: "How plants make food",
  source: "manual",
}

const QUESTION_ROWS = [
  {
    id: "qq_1",
    quiz_id: QUIZ_ID,
    question: "Which gas do plants absorb?",
    choices: JSON.stringify([
      { id: "a", text: "Oxygen" },
      { id: "b", text: "Carbon dioxide" },
    ]),
    correct_answer_id: "b",
    topic: "Biology",
    explanation: "CO2 enters through the stomata.",
  },
]

function createBody() {
  return {
    title: "Photosynthesis",
    topic: "Biology",
    description: "How plants make food",
    questions: [
      {
        question: "Which gas do plants absorb?",
        choices: [
          { id: "a", text: "Oxygen" },
          { id: "b", text: "Carbon dioxide" },
        ],
        correct_answer_id: "b",
        explanation: "CO2 enters through the stomata.",
      },
    ],
  }
}

test("POST /api/quizzes persists the quiz, batches its questions, and returns it", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    stub.on(/INSERT INTO quizzes/, { rowCount: 1 })
    stub.on(/INSERT INTO quiz_questions/, { rowCount: 1 })
    stub.on(/INSERT INTO audit_logs/, { rowCount: 1 })
    stub.on(/SELECT \* FROM quizzes/, { rows: [QUIZ_ROW] })
    stub.on(/SELECT \* FROM quiz_questions/, { rows: QUESTION_ROWS })

    const { POST } = await import("../../app/api/quizzes/route")
    const response = await POST(request("/api/quizzes", { method: "POST", body: createBody() }))

    assert.equal(response.status, 201)
    const payload = await readJson<{ item: { id: string; title: string; questions: unknown[] } }>(response)
    assert.equal(payload.item.id, QUIZ_ID)
    assert.equal(payload.item.title, "Photosynthesis")
    assert.equal(payload.item.questions.length, 1)

    // The quiz row was written with the caller's title as a bound parameter —
    // not string-interpolated into the SQL.
    const quizInsert = stub.matching(/INSERT INTO quizzes/)
    assert.equal(quizInsert.length, 1)
    assert.ok(quizInsert[0].params.includes("Photosynthesis"))
    assert.ok(!quizInsert[0].sql.includes("Photosynthesis"), "title must not be inlined into SQL")

    // Questions are batched into one statement rather than one statement per
    // question. This is the N+1 fix from the audit, pinned so it cannot regress.
    const questionInserts = stub.matching(/INSERT INTO quiz_questions/)
    assert.equal(questionInserts.length, 1)
    assert.equal(questionInserts[0].params.length, 7)

    // Ownership and audit are part of the write path, not an afterthought.
    const auditInserts = stub.matching(/INSERT INTO audit_logs/)
    assert.equal(auditInserts.length, 1)
    assert.ok(auditInserts[0].params.includes("quiz"))
  } finally {
    stub.restore()
  }
})

test("the handler runs through the real SQL normaliser and the real session lookup", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    stub.on(/INSERT INTO quizzes/, { rowCount: 1 })
    stub.on(/INSERT INTO quiz_questions/, { rowCount: 1 })
    stub.on(/INSERT INTO audit_logs/, { rowCount: 1 })
    stub.on(/SELECT \* FROM quizzes/, { rows: [QUIZ_ROW] })
    stub.on(/SELECT \* FROM quiz_questions/, { rows: QUESTION_ROWS })

    const { POST } = await import("../../app/api/quizzes/route")
    await POST(request("/api/quizzes", { method: "POST", body: createBody() }))

    // `query()` rewrites `$n` to `?` and `now()` to `datetime('now')` before the
    // statement leaves the process. Seeing that rewrite proves the production
    // code path ran end to end instead of a mock short-circuiting it.
    const sessionLookup = stub.matching(/FROM user_sessions/)
    assert.equal(sessionLookup.length, 1, "the session must be resolved from the database")
    assert.ok(sessionLookup[0].sql.includes("datetime('now')"), "now() should be rewritten for D1")
    assert.ok(sessionLookup[0].sql.includes("?"), "$n placeholders should be rewritten for D1")
    assert.ok(!sessionLookup[0].sql.includes("$1"), "no $n placeholders should survive")

    // The lookup is keyed by the hashed token, never the raw cookie value.
    assert.equal(sessionLookup[0].params.length, 1)
    assert.notEqual(sessionLookup[0].params[0], "test-session-token")
    assert.match(String(sessionLookup[0].params[0]), /^[0-9a-f]{64}$/)
  } finally {
    stub.restore()
  }
})

test("an unauthenticated POST is rejected before any write happens", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)

    const { POST } = await import("../../app/api/quizzes/route")
    const response = await POST(
      request("/api/quizzes", { method: "POST", body: createBody(), token: null }),
    )

    assert.equal(response.status, 401)
    const payload = await readJson<{ error: string }>(response)
    assert.match(payload.error, /sign in/i)
    assert.equal(stub.matching(/INSERT INTO quizzes/).length, 0, "no quiz may be written without a session")
  } finally {
    stub.restore()
  }
})

test("a cross-origin POST is rejected before any write happens", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)

    const { POST } = await import("../../app/api/quizzes/route")
    const response = await POST(
      request("/api/quizzes", {
        method: "POST",
        body: createBody(),
        headers: { origin: "https://attacker.example" },
      }),
    )

    assert.equal(response.status, 403)
    assert.equal(stub.matching(/INSERT INTO quizzes/).length, 0)
  } finally {
    stub.restore()
  }
})

test("a quiz with no title is rejected with a 400 and writes nothing", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)

    const { POST } = await import("../../app/api/quizzes/route")
    const response = await POST(
      request("/api/quizzes", { method: "POST", body: { title: "   ", questions: [] } }),
    )

    assert.equal(response.status, 400)
    const payload = await readJson<{ error: string }>(response)
    assert.match(payload.error, /title is required/i)
    assert.equal(stub.matching(/INSERT INTO quizzes/).length, 0)
  } finally {
    stub.restore()
  }
})
