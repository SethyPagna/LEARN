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

import {
  installDatabaseStub,
  primeDatabase,
  readJson,
  request,
  stubSessionLookup,
  TEST_USER_ROW,
} from "./harness"

const QUIZ_ID = "quiz_test_1"

/** Somebody who is not the caller, and not an admin either. */
const OTHER_USER_ID = "user_other"

/**
 * The read `assertOwnership` issues before a quiz write. Matching on the alias
 * keeps it distinct from the `SELECT * FROM quizzes` that `getQuiz` issues, so a
 * test can answer the ownership question without answering the read.
 */
const OWNERSHIP_LOOKUP = /created_by_user_id AS owner_id FROM quizzes/

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

/**
 * The registry mirror a saved quiz now writes.
 *
 * `saveQuiz` upserts a `content_items` row so the quiz can be shared, permission
 * checked and listed like every other resource. The upsert reads the row back
 * (its `ON CONFLICT` branch needs the id), so a save that succeeds needs an
 * answer here — and `stub.matching(/INSERT INTO content_items/)` is how the test
 * below proves the mirror was actually written rather than merely tolerated.
 */
function stubContentItemMirror(stub: ReturnType<typeof installDatabaseStub>) {
  stub.on(/INSERT INTO content_items/, { rowCount: 1 })
  stub.on(/SELECT \* FROM content_items/, { rows: [{ id: "content_quiz_1", title: QUIZ_ROW.title }] })
}

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
    stubContentItemMirror(stub)

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

    // The registry mirror is what makes the quiz shareable, so it is asserted
    // here rather than left implicit: without this row a share link cannot be
    // minted for a quiz at all (`createShareLink` needs the content item).
    const mirrorInserts = stub.writesMatching(/INSERT INTO content_items/)
    assert.equal(mirrorInserts.length, 1, "a saved quiz must be mirrored into content_items")
    assert.ok(mirrorInserts[0].params.includes("quiz"), "the mirror's item_type must be 'quiz'")
    assert.ok(mirrorInserts[0].params.includes("quizzes"), "the mirror must name the quizzes source table")
    assert.ok(mirrorInserts[0].params.includes(TEST_USER_ROW.id), "the mirror belongs to the quiz's creator")
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
    stubContentItemMirror(stub)

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

/**
 * The write-IDOR cluster.
 *
 * `saveQuiz` takes the row id straight from the request body, so before these
 * tests the `ON CONFLICT (id) DO UPDATE` branch — and the `DELETE FROM
 * quiz_questions` that follows it — was a way for any signed-in caller to
 * overwrite any quiz in the shared bank. `quizzes` had no owner column at all,
 * which is why it was the last content type to get a guard.
 *
 * These tests answer the ownership lookup by hand so both halves of the guard
 * are pinned: the refusal, and the shared/seed case that must keep working.
 */
test("POST /api/quizzes with another user's quiz id is refused before any write", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    stub.on(OWNERSHIP_LOOKUP, { rows: [{ owner_id: OTHER_USER_ID }] })

    const { POST } = await import("../../app/api/quizzes/route")
    const response = await POST(
      request("/api/quizzes", { method: "POST", body: { ...createBody(), id: QUIZ_ID } }),
    )

    assert.equal(response.status, 400)
    const payload = await readJson<{ error: string }>(response)
    assert.match(payload.error, /only change items you own/i)

    // The check must run before the write, not alongside it: nothing about the
    // victim's quiz may be touched on the way to the refusal.
    assert.equal(stub.matching(/INSERT INTO quizzes/).length, 0, "no quiz row may be written")
    assert.equal(stub.matching(/UPDATE quizzes/).length, 0, "no quiz row may be updated")
    assert.equal(
      stub.matching(/DELETE FROM quiz_questions/).length,
      0,
      "the victim's questions must survive the attempt",
    )

    // And the lookup must be keyed by the id the caller supplied, or the guard
    // is checking a different quiz than the one about to be rewritten.
    const lookups = stub.matching(OWNERSHIP_LOOKUP)
    assert.equal(lookups.length, 1)
    assert.deepEqual(lookups[0].params, [QUIZ_ID])
  } finally {
    stub.restore()
  }
})

test("POST /api/quizzes with the caller's own quiz id updates it and stamps the owner", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    stub.on(OWNERSHIP_LOOKUP, { rows: [{ owner_id: TEST_USER_ROW.id }] })
    stub.on(/INSERT INTO quizzes/, { rowCount: 1 })
    stub.on(/DELETE FROM quiz_questions/, { rowCount: 1 })
    stub.on(/INSERT INTO quiz_questions/, { rowCount: 1 })
    stub.on(/INSERT INTO audit_logs/, { rowCount: 1 })
    stub.on(/SELECT \* FROM quizzes/, { rows: [QUIZ_ROW] })
    stub.on(/SELECT \* FROM quiz_questions/, { rows: QUESTION_ROWS })
    stubContentItemMirror(stub)

    const { POST } = await import("../../app/api/quizzes/route")
    const response = await POST(
      request("/api/quizzes", { method: "POST", body: { ...createBody(), id: QUIZ_ID } }),
    )

    assert.equal(response.status, 201)

    const inserts = stub.matching(/INSERT INTO quizzes/)
    assert.equal(inserts.length, 1)
    assert.ok(inserts[0].sql.includes("created_by_user_id"), "the owner column must be written")
    assert.equal(inserts[0].params[0], QUIZ_ID)
    assert.equal(
      inserts[0].params[inserts[0].params.length - 1],
      TEST_USER_ROW.id,
      "a create must record its creator",
    )

    // Ownership is set on insert only. If it were in the `DO UPDATE SET` clause,
    // re-saving a shared quiz would claim it — the same bug wearing a hat.
    assert.ok(
      !/created_by_user_id\s*=/.test(inserts[0].sql),
      "created_by_user_id must not be assignable from the update branch",
    )
  } finally {
    stub.restore()
  }
})

test("POST /api/quizzes with an unknown id is allowed: there is no owner to protect", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    stub.on(OWNERSHIP_LOOKUP, { rows: [] })
    stub.on(/INSERT INTO quizzes/, { rowCount: 1 })
    stub.on(/INSERT INTO quiz_questions/, { rowCount: 1 })
    stub.on(/INSERT INTO audit_logs/, { rowCount: 1 })
    stub.on(/SELECT \* FROM quizzes/, { rows: [QUIZ_ROW] })
    stub.on(/SELECT \* FROM quiz_questions/, { rows: QUESTION_ROWS })
    stubContentItemMirror(stub)

    const { POST } = await import("../../app/api/quizzes/route")
    const response = await POST(
      request("/api/quizzes", { method: "POST", body: { ...createBody(), id: "quiz_not_stored_yet" } }),
    )

    assert.equal(response.status, 201)
    assert.equal(stub.matching(/INSERT INTO quizzes/).length, 1)
  } finally {
    stub.restore()
  }
})

test("POST /api/quizzes with an ownerless quiz id is allowed: the seeded bank stays shared", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    // Seed data predates the owner column, so its `created_by_user_id` is NULL.
    stub.on(OWNERSHIP_LOOKUP, { rows: [{ owner_id: null }] })
    stub.on(/INSERT INTO quizzes/, { rowCount: 1 })
    stub.on(/DELETE FROM quiz_questions/, { rowCount: 1 })
    stub.on(/INSERT INTO quiz_questions/, { rowCount: 1 })
    stub.on(/INSERT INTO audit_logs/, { rowCount: 1 })
    stub.on(/SELECT \* FROM quizzes/, { rows: [QUIZ_ROW] })
    stub.on(/SELECT \* FROM quiz_questions/, { rows: QUESTION_ROWS })
    stubContentItemMirror(stub)

    const { POST } = await import("../../app/api/quizzes/route")
    const response = await POST(
      request("/api/quizzes", { method: "POST", body: { ...createBody(), id: QUIZ_ID } }),
    )

    assert.equal(response.status, 201)
    assert.equal(stub.matching(/INSERT INTO quizzes/).length, 1)
    assert.equal(
      stub.matching(/DELETE FROM quiz_questions/).length,
      1,
      "a NULL owner must not block the ordinary update path",
    )
  } finally {
    stub.restore()
  }
})

test("DELETE /api/quizzes/[id] refuses to archive another user's quiz", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    stub.on(/SELECT id FROM quizzes/, { rows: [{ id: QUIZ_ID }] })
    stub.on(OWNERSHIP_LOOKUP, { rows: [{ owner_id: OTHER_USER_ID }] })

    const { DELETE } = await import("../../app/api/quizzes/[id]/route")
    const response = await DELETE(
      request(`/api/quizzes/${QUIZ_ID}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: QUIZ_ID }) },
    )

    assert.equal(response.status, 400)
    const payload = await readJson<{ error: string }>(response)
    assert.match(payload.error, /only change items you own/i)

    assert.equal(stub.matching(/UPDATE quizzes SET archived_at/).length, 0, "the quiz must stay live")
    assert.equal(stub.matching(/INSERT INTO audit_logs/).length, 0, "a refused archive is not an event")
  } finally {
    stub.restore()
  }
})

test("DELETE /api/quizzes/[id] archives an ownerless quiz", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    stub.on(/SELECT id FROM quizzes/, { rows: [{ id: QUIZ_ID }] })
    stub.on(OWNERSHIP_LOOKUP, { rows: [{ owner_id: null }] })
    stub.on(/UPDATE quizzes SET archived_at/, { rowCount: 1 })
    stub.on(/INSERT INTO audit_logs/, { rowCount: 1 })

    const { DELETE } = await import("../../app/api/quizzes/[id]/route")
    const response = await DELETE(
      request(`/api/quizzes/${QUIZ_ID}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: QUIZ_ID }) },
    )

    assert.equal(response.status, 200)
    const payload = await readJson<{ archived: boolean }>(response)
    assert.equal(payload.archived, true)

    // Order matters: the archive is the last thing that happens, after the
    // existence check and the ownership check.
    assert.equal(stub.matching(/UPDATE quizzes SET archived_at/).length, 1)
    assert.equal(stub.matching(/INSERT INTO audit_logs/).length, 1)
  } finally {
    stub.restore()
  }
})

test("DELETE /api/quizzes/[id] still reports a missing quiz as 404", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    // The existence check finds nothing, so there is no owner to look up.
    stub.on(/SELECT id FROM quizzes/, { rows: [] })

    const { DELETE } = await import("../../app/api/quizzes/[id]/route")
    const response = await DELETE(
      request(`/api/quizzes/${QUIZ_ID}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: QUIZ_ID }) },
    )

    assert.equal(response.status, 404)
    assert.equal(stub.matching(OWNERSHIP_LOOKUP).length, 0, "no lookup without a row")
    assert.equal(stub.matching(/UPDATE quizzes SET archived_at/).length, 0)
  } finally {
    stub.restore()
  }
})
