import assert from "node:assert/strict"
import test from "node:test"
import { installDatabaseStub, primeDatabase, readJson, request, stubSessionLookup, TEST_USER_ROW } from "./harness"

for (const role of ["learner", "admin"]) {
  test(`the ${role}'s quiz library excludes archives and respects ownership`, async () => {
    const stub = installDatabaseStub()
    try {
      await primeDatabase(stub)
      stub.on(/FROM user_sessions/, { rows: [{ ...TEST_USER_ROW, role }] })
      const quizzes = [
        { id: "own", created_by_user_id: TEST_USER_ROW.id, archived_at: null },
        { id: "other", created_by_user_id: "someone_else", archived_at: null },
        { id: "bank", created_by_user_id: null, archived_at: null },
        { id: "archived", created_by_user_id: TEST_USER_ROW.id, archived_at: "2026-09-30" },
      ]
      stub.on(/FROM quizzes q/, (sql, params) => ({
        rows: quizzes.filter((quiz) => (!sql.includes("q.archived_at IS NULL") || !quiz.archived_at)
          && (!sql.includes("q.created_by_user_id = ?") || quiz.created_by_user_id === params[0]
            || (sql.includes("q.created_by_user_id IS NULL") && quiz.created_by_user_id === null) || params[1] === "admin")),
      }))
      const { GET } = await import("../../app/api/quizzes/route")
      const response = await GET(request("/api/quizzes"))
      assert.equal(response.status, 200)
      const { items } = await readJson<{ items: { id: string }[] }>(response)
      assert.deepEqual(items.map((item) => item.id), role === "admin" ? ["own", "other", "bank"] : ["own", "bank"])
      assert.deepEqual(stub.matching(/FROM quizzes q/)[0].params, [TEST_USER_ROW.id, role])
      assert.equal(stub.writesMatching(/quizzes/).length, 0)
    } finally { stub.restore() }
  })
}

test("an empty achievement list is read-only and does not invent badges", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    const { GET } = await import("../../app/api/achievements/route")
    const response = await GET(request("/api/achievements"))
    assert.equal(response.status, 200)
    assert.deepEqual(await readJson(response), { items: [] })
    assert.equal(stub.writesMatching(/achievements/).length, 0)
    assert.equal(stub.matching(/FROM achievements/).length, 1)
  } finally { stub.restore() }
})

test("stored achievements retain their real unlocked state", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    stub.on(/FROM achievements/, { rows: [
      { id: "earned", criteria: '{"reviews":10}', unlocked_at: "2026-09-30" },
      { id: "locked", criteria: "{}", unlocked_at: null },
    ] })
    const { GET } = await import("../../app/api/achievements/route")
    const { items } = await readJson<{ items: { id: string; criteria: unknown; unlocked: boolean }[] }>(await GET(request("/api/achievements")))
    assert.deepEqual(items.map(({ id, criteria, unlocked }) => ({ id, criteria, unlocked })), [
      { id: "earned", criteria: { reviews: 10 }, unlocked: true },
      { id: "locked", criteria: {}, unlocked: false },
    ])
    assert.equal(stub.writesMatching(/achievements/).length, 0)
  } finally { stub.restore() }
})

for (const role of ["learner", "admin"]) {
  test(`the ${role}'s dashboard does not resurface archived notes`, async () => {
    const stub = installDatabaseStub()
    try {
      await primeDatabase(stub)
      stub.on(/FROM user_sessions/, { rows: [{ ...TEST_USER_ROW, role }] })
      const notes = [
        { id: "active", title: "Active", owner_user_id: TEST_USER_ROW.id, tags: "[]", content: "", archived_at: null },
        { id: "archived", title: "Archived", owner_user_id: TEST_USER_ROW.id, tags: "[]", content: "", archived_at: "2026-09-30" },
        { id: "other", title: "Other", owner_user_id: "someone_else", tags: "[]", content: "", archived_at: null },
      ].map((note) => ({ ...note, updated_at: "2026-09-30T00:00:00Z" }))
      stub.on(/FROM notes n/, (sql, params) => ({ rows: notes.filter((note) =>
        (!sql.includes("n.archived_at IS NULL") || !note.archived_at)
        && (note.owner_user_id === params[0] || params[1] === "admin")) }))
      const { GET } = await import("../../app/api/dashboard/route")
      const response = await GET(request("/api/dashboard"))
      assert.equal(response.status, 200)
      const data = await readJson<{ notes: { id: string }[] }>(response)
      assert.deepEqual(data.notes.map((note) => note.id), role === "admin" ? ["active", "other"] : ["active"])
      assert.match(stub.matching(/FROM notes n/)[0].sql, /WHERE \(n\.owner_user_id = \? OR \? = 'admin'\) AND n\.archived_at IS NULL/)
      assert.equal(stub.writesMatching(/notes/).length, 0)
    } finally { stub.restore() }
  })
}
