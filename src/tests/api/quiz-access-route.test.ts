import assert from "node:assert/strict"
import test from "node:test"
import { installDatabaseStub, primeDatabase, request, TEST_USER_ROW } from "./harness"

const QUIZ_ID = "protected-quiz"
const CONTENT_ID = "protected-content"
const OTHER_OWNER = "another-learner"
const QUESTION = {
  id: "q1",
  quiz_id: QUIZ_ID,
  question: "Two plus two?",
  choices: JSON.stringify([{ id: "a", text: "Four" }, { id: "b", text: "Five" }]),
  correct_answer_id: "a",
  topic: "Numbers",
}

test("quiz reads and attempts enforce the same owner, shared-bank and viewer permissions", async (t) => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    const { GET } = await import("../../app/api/quizzes/[id]/route")
    const { POST } = await import("../../app/api/quizzes/attempts/route")

    function configure(input: {
      ownerId: string | null
      role?: string
      visibility?: string
      grants?: Record<string, unknown>[]
      groupIds?: string[]
      spaceIds?: string[]
    }) {
      stub.reset()
      stub.on(/FROM user_sessions/, { rows: [{ ...TEST_USER_ROW, role: input.role || "learner" }] })
      stub.on(/SELECT \* FROM quizzes WHERE/, { rows: [{ id: QUIZ_ID, title: "Protected", created_by_user_id: input.ownerId }] })
      stub.on(/SELECT \* FROM quiz_questions WHERE/, { rows: [QUESTION] })
      stub.on(/FROM content_items WHERE source_table/, { rows: [{ id: CONTENT_ID, owner_user_id: input.ownerId, visibility: input.visibility || "private" }] })
      stub.on(/FROM shared_access WHERE content_item_id/, { rows: input.grants || [] })
      stub.on(/SELECT group_id FROM group_members/, { rows: (input.groupIds || []).map(group_id => ({ group_id })) })
      stub.on(/SELECT space_id FROM learning_space_members/, { rows: (input.spaceIds || []).map(space_id => ({ space_id })) })
    }

    const readQuiz = () => GET(request(`/api/quizzes/${QUIZ_ID}`), { params: Promise.resolve({ id: QUIZ_ID }) })
    const attemptQuiz = () => POST(request("/api/quizzes/attempts", {
      method: "POST",
      body: { quizId: QUIZ_ID, answers: [{ questionId: QUESTION.id, selectedAnswerId: "a" }] },
    }))

    async function assertDenied() {
      const read = await readQuiz()
      assert.equal(read.status, 403)
      const denied = await read.json()
      assert.equal(denied.item, undefined, "a private quiz's questions and answer key are never returned")
      assert.match(denied.error, /access to this quiz/)
      const attempted = await attemptQuiz()
      assert.equal(attempted.status, 400)
      assert.match((await attempted.json()).error, /access to this quiz/)
      assert.equal(stub.writesMatching(/./).length, 0, "a denied attempt cannot write practice, results, audit or XP")
    }

    async function assertAllowed() {
      const read = await readQuiz()
      assert.equal(read.status, 200)
      assert.equal((await read.json()).item.questions[0].id, QUESTION.id)
      assert.equal(stub.writesMatching(/./).length, 0, "reading an allowed quiz is read-only")
      const attempted = await attemptQuiz()
      assert.equal(attempted.status, 200)
      assert.equal((await attempted.json()).score, 1)
      assert.equal(stub.writesMatching(/INSERT INTO quiz_attempts/).length, 1)
      assert.equal(stub.writesMatching(/INSERT INTO practice_sessions/).length, 1)
    }

    await t.test("knowing another learner's private quiz id does not allow a read or attempt", async () => {
      configure({ ownerId: OTHER_OWNER })
      await assertDenied()
    })

    for (const [label, ownerId, role] of [
      ["owner", TEST_USER_ROW.id, "learner"],
      ["legacy shared bank", null, "learner"],
      ["administrator", OTHER_OWNER, "admin"],
    ] as const) {
      await t.test(`${label} can read and play without a shared-content lookup`, async () => {
        configure({ ownerId, role })
        await assertAllowed()
        assert.equal(stub.matching(/FROM content_items WHERE source_table/).length, 0)
      })
    }

    for (const grantType of ["user", "group", "space"] as const) {
      await t.test(`a ${grantType} viewer grant permits both read and attempt`, async () => {
        const granteeId = grantType === "user" ? TEST_USER_ROW.id : "shared-membership"
        configure({
          ownerId: OTHER_OWNER,
          grants: [{ content_item_id: CONTENT_ID, grantee_type: grantType, grantee_id: granteeId, role: "viewer" }],
          groupIds: grantType === "group" ? [granteeId] : [],
          spaceIds: grantType === "space" ? [granteeId] : [],
        })
        await assertAllowed()
        assert.ok(stub.matching(/FROM content_items WHERE source_table/).every(statement => statement.params[0] === "quizzes" && statement.params[1] === QUIZ_ID))
      })
    }

    await t.test("public content visibility permits a signed-in learner to play", async () => {
      configure({ ownerId: OTHER_OWNER, visibility: "public" })
      await assertAllowed()
    })

    await t.test("an unpresented public link cannot grant access by guessed quiz id", async () => {
      configure({ ownerId: OTHER_OWNER, grants: [{ content_item_id: CONTENT_ID, grantee_type: "public_link", grantee_id: null, role: "viewer" }] })
      await assertDenied()
    })

    await t.test("expired or unrelated viewer grants cannot grant access", async () => {
      configure({ ownerId: OTHER_OWNER, grants: [
        { content_item_id: CONTENT_ID, grantee_type: "user", grantee_id: TEST_USER_ROW.id, role: "viewer", expires_at: new Date(Date.now() - 1000).toISOString() },
        { content_item_id: CONTENT_ID, grantee_type: "user", grantee_id: "somebody-else", role: "viewer" },
        { content_item_id: CONTENT_ID, grantee_type: "group", grantee_id: "private-group", role: "viewer" },
      ] })
      await assertDenied()
    })

    await t.test("missing quizzes retain their not-found read behavior", async () => {
      configure({ ownerId: null })
      stub.on(/SELECT \* FROM quizzes WHERE/, { rows: [] })
      assert.equal((await readQuiz()).status, 404)
      assert.equal((await attemptQuiz()).status, 400)
      assert.equal(stub.writesMatching(/./).length, 0)
    })
  } finally {
    stub.restore()
  }
})
