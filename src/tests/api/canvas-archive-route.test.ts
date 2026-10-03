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

const EDITED_CONTENT = {
  format: "presentation",
  pages: [{ id: "page_1", notes: "New presenter notes", elements: [{ type: "text", content: "Edited after conversion" }] }],
}

function canvasRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "design-deck_archive",
    owner_user_id: TEST_USER_ROW.id,
    document_type: "canvas",
    title: "Edited deck",
    content: JSON.stringify(EDITED_CONTENT),
    tags: "[]",
    archived_at: "2026-09-29 00:00:00" as string | null,
    ...overrides,
  }
}

type CanvasRow = ReturnType<typeof canvasRow>

function stubCanvasRead(stub: DatabaseStub, rows: CanvasRow[]) {
  stub.on(/SELECT \* FROM editor_documents/, (sql, params) => ({
    rows: rows.filter((row) => {
      if (row.id !== params[0]) return false
      // A restore's result read follows its owner-scoped UPDATE.
      if (!sql.includes("document_type")) return true
      if (row.document_type !== params[1]) return false
      if (row.owner_user_id !== params[2] && params[3] !== "admin") return false
      if (sql.includes("archived_at IS NOT NULL")) return row.archived_at !== null
      if (sql.includes("archived_at IS NULL")) return row.archived_at === null
      return true
    }),
  }))
}

for (const statusCase of [
  { query: "", expected: 404, predicate: "archived_at IS NULL" },
  { query: "&status=unknown", expected: 404, predicate: "archived_at IS NULL" },
  { query: "&status=archived", expected: 200, predicate: "archived_at IS NOT NULL" },
  { query: "&status=all", expected: 200, predicate: "1 = 1" },
]) {
  test(`canvas single read ${statusCase.query || "without status"} respects its archive filter`, async () => {
    const stub = installDatabaseStub()
    try {
      await primeDatabase(stub)
      stubSessionLookup(stub)
      const row = canvasRow()
      stubCanvasRead(stub, [row])

      const { GET } = await import("../../app/api/canvas/route")
      const response = await GET(request(`/api/canvas?id=${row.id}${statusCase.query}`))
      assert.equal(response.status, statusCase.expected)
      if (response.ok) {
        const { item } = await readJson<{ item: { content: unknown; archived_at: string } }>(response)
        assert.deepEqual(item.content, EDITED_CONTENT, "the edited conversion survives the archived lookup")
        assert.equal(item.archived_at, row.archived_at)
      }

      const [read] = stub.matching(/SELECT \* FROM editor_documents/)
      assert.ok(read.sql.includes(statusCase.predicate))
      assert.match(read.sql, /owner_user_id = \? OR \? = 'admin'/)
      assert.deepEqual(read.params, [row.id, "canvas", TEST_USER_ROW.id, TEST_USER_ROW.role])
      assert.equal(stub.writesMatching(/editor_documents/).length, 0, "finding a copy must not update it")
    } finally {
      stub.restore()
    }
  })
}

test("an archived converted canvas can be restored without replacing its edited content", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    const row = canvasRow()
    stubCanvasRead(stub, [row])
    stub.on(/UPDATE editor_documents SET archived_at = NULL/, (_sql, params) => {
      if (row.id !== params[0] || (row.owner_user_id !== params[1] && params[2] !== "admin")) return { rowCount: 0 }
      row.archived_at = null
      return { rowCount: 1 }
    })

    const { GET, PATCH } = await import("../../app/api/canvas/route")
    const archived = await GET(request(`/api/canvas?id=${row.id}&status=all`))
    assert.equal(archived.status, 200)
    const restored = await PATCH(request("/api/canvas", { method: "PATCH", body: { id: row.id, action: "restore" } }))
    assert.equal(restored.status, 200)
    const { item } = await readJson<{ item: { archived_at: unknown; content: unknown } }>(restored)
    assert.equal(item.archived_at, null)
    assert.deepEqual(item.content, EDITED_CONTENT)
    assert.equal((await GET(request(`/api/canvas?id=${row.id}`))).status, 200)
    assert.equal(stub.matching(/UPDATE editor_documents SET archived_at = NULL/).length, 1)
    assert.equal(stub.matching(/INSERT INTO editor_documents/).length, 0, "restoring must not recreate the stale original deck")
  } finally {
    stub.restore()
  }
})

test("including archived canvases still hides another owner's copy and other document types", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    const otherOwner = canvasRow({ id: "design_other", owner_user_id: "user_other" })
    const otherType = canvasRow({ id: "doc_other", document_type: "doc" })
    stubCanvasRead(stub, [otherOwner, otherType])
    const { GET } = await import("../../app/api/canvas/route")
    for (const row of [otherOwner, otherType]) {
      assert.equal((await GET(request(`/api/canvas?id=${row.id}&status=all`))).status, 404)
    }
    assert.equal(stub.writesMatching(/editor_documents/).length, 0)
  } finally {
    stub.restore()
  }
})

test("an admin can find an archived canvas owned by another learner", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stub.on(/FROM user_sessions/, { rows: [{ ...TEST_USER_ROW, role: "admin" }] })
    const row = canvasRow({ owner_user_id: "user_other" })
    stubCanvasRead(stub, [row])
    const { GET } = await import("../../app/api/canvas/route")
    assert.equal((await GET(request(`/api/canvas?id=${row.id}&status=all`))).status, 200)
    assert.deepEqual(stub.matching(/SELECT \* FROM editor_documents/)[0].params, [row.id, "canvas", TEST_USER_ROW.id, "admin"])
  } finally {
    stub.restore()
  }
})

test("an archived canvas lookup requires a session before reading any editor document", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    const { GET } = await import("../../app/api/canvas/route")
    assert.equal((await GET(request("/api/canvas?id=design-deck_archive&status=all", { token: null }))).status, 401)
    assert.equal(stub.matching(/editor_documents/).length, 0)
  } finally {
    stub.restore()
  }
})
