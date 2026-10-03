/**
 * The docs / sheets / slides resource routes.
 *
 * These three routes were byte-for-byte identical apart from which data-layer
 * functions they injected, and `src/lib/data.ts` had never been called through
 * any of them by a test. They are also the archive/restore surface: `DELETE`
 * archives by `?id=` and `PATCH { action: "restore" }` un-archives, both of
 * which mutate a row the caller only sometimes owns.
 *
 * This file exists as the safety net for collapsing those three files onto one
 * shared factory. Every assertion below is about observable behaviour at the
 * HTTP boundary — status code, response shape, and the statement that actually
 * reached the database — so the suite goes red if the factory changes a status
 * code, renames a response key, or drops a guard. It deliberately does not
 * assert on the route file's internals, so it keeps passing across the refactor
 * and keeps failing if behaviour moves.
 *
 * The per-resource differences are the whole point, so they are data, not code:
 * the table name drives every statement pattern, and `actionLabel` is the word
 * that appears in the `PATCH` rejection message.
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

interface ResourceCase {
  /** Directory under `src/app/api`. */
  readonly path: string
  /** The noun the route uses in its "Unsupported … action." message. */
  readonly actionLabel: string
  /** Table the resource rows live in; drives every SQL pattern below. */
  readonly table: string
  /** Row the list/save/restore reads answer with. */
  readonly row: Record<string, unknown>
  /** Column that comes back JSON-encoded and must be parsed by the data layer. */
  readonly jsonField: string
  /** Whether that column is an object or an array once parsed. */
  readonly jsonShape: "object" | "array"
  /** A body that creates a new row (no id, so no ownership lookup runs). */
  readonly createBody: Record<string, unknown>
  /** A body that updates an existing row (id present, so ownership is checked). */
  readonly updateBody: Record<string, unknown>
}

const DOC_ROW = {
  id: "doc_test_1",
  workspace_id: "workspace_demo",
  owner_user_id: TEST_USER_ROW.id,
  title: "Lecture notes",
  document_type: "doc",
  content: '{"blocks":[{"id":"b1"}]}',
  tags: '["biology"]',
  archived_at: null,
  updated_at: "2024-01-01 00:00:00",
}

const SHEET_ROW = {
  id: "sheet_test_1",
  workspace_id: "workspace_demo",
  owner_user_id: TEST_USER_ROW.id,
  title: "Gradebook",
  cells: '[[1,2],[3,4]]',
  history: "[]",
  archived_at: null,
  updated_at: "2024-01-01 00:00:00",
}

const SLIDE_ROW = {
  id: "deck_test_1",
  workspace_id: "workspace_demo",
  owner_user_id: TEST_USER_ROW.id,
  title: "Cell division",
  slides: '[{"id":"s1"}]',
  speaker_notes: '{"s1":"remember the phases"}',
  archived_at: null,
  updated_at: "2024-01-01 00:00:00",
}

const RESOURCES: readonly ResourceCase[] = [
  {
    path: "docs",
    actionLabel: "document",
    table: "editor_documents",
    row: DOC_ROW,
    jsonField: "content",
    jsonShape: "object",
    createBody: { title: "Lecture notes", content: { blocks: [{ id: "b1" }] }, tags: ["biology"] },
    updateBody: { id: DOC_ROW.id, title: "Lecture notes (revised)", content: { blocks: [] } },
  },
  {
    path: "sheets",
    actionLabel: "sheet",
    table: "sheet_documents",
    row: SHEET_ROW,
    jsonField: "cells",
    jsonShape: "array",
    createBody: { title: "Gradebook", cells: [[1, 2]], history: [] },
    updateBody: { id: SHEET_ROW.id, title: "Gradebook (revised)", cells: [[9]] },
  },
  {
    path: "slides",
    actionLabel: "slide",
    table: "slide_decks",
    row: SLIDE_ROW,
    jsonField: "slides",
    jsonShape: "array",
    createBody: { title: "Cell division", slides: [{ id: "s1" }], speakerNotes: {} },
    updateBody: { id: SLIDE_ROW.id, title: "Cell division (revised)", slides: [] },
  },
]

const patterns = (resource: ResourceCase) => ({
  /** Any read or write touching the resource table. */
  table: new RegExp(`\\b${resource.table}\\b`),
  /** The list query and the post-save/post-restore single-row read. */
  select: new RegExp(`SELECT \\* FROM ${resource.table}`),
  /** The save upsert. */
  insert: new RegExp(`INSERT INTO ${resource.table}`),
  /** The ownership pre-check for an update. */
  ownership: new RegExp(`SELECT owner_user_id AS owner_id FROM ${resource.table}`),
  // `now()` never reaches the database: the real normaliser rewrites it to
  // `datetime('now')`. Matching the rewritten form keeps this assertion honest
  // about what was actually sent, and distinguishes it from the `= NULL` restore.
  archive: new RegExp(`UPDATE ${resource.table} SET archived_at = datetime\\('now'\\)`),
  restore: new RegExp(`UPDATE ${resource.table} SET archived_at = NULL`),
})

/**
 * Everything a write path needs, so each test can focus on the assertion that
 * matters instead of restating the plumbing.
 */
function stubWritePath(stub: DatabaseStub, resource: ResourceCase) {
  const sql = patterns(resource)
  stub.on(new RegExp(`INSERT INTO ${resource.table}`), { rowCount: 1 })
  stub.on(/INSERT INTO content_items/, { rowCount: 1 })
  stub.on(/SELECT \* FROM content_items/, { rows: [{ id: `content_${resource.path}_test` }] })
  stub.on(/INSERT INTO content_versions/, { rowCount: 1 })
  stub.on(/INSERT INTO audit_logs/, { rowCount: 1 })
  stub.on(sql.select, { rows: [resource.row] })
  stub.on(/UPDATE content_items SET archived_at/, { rowCount: 1 })
  stub.on(sql.ownership, { rows: [{ owner_id: TEST_USER_ROW.id }] })
}

async function loadRoute(resource: ResourceCase) {
  return import(`../../app/api/${resource.path}/route`)
}

for (const resource of RESOURCES) {
  const sql = patterns(resource)
  const modulePath = `src/app/api/${resource.path}/route.ts`

  test(`${modulePath} rejects an unauthenticated GET with 401 before touching the database`, async () => {
    const stub = installDatabaseStub()
    try {
      await primeDatabase(stub)
      stubSessionLookup(stub)

      const { GET } = await loadRoute(resource)
      const response = await GET(request(`/api/${resource.path}`, { method: "GET", token: null }))

      assert.equal(response.status, 401)
      const payload = await readJson<{ error: string }>(response)
      assert.match(payload.error, /sign in/i)
      assert.equal(
        stub.matching(sql.table).length,
        0,
        "no statement may reference the table without a session",
      )
    } finally {
      stub.restore()
    }
  })

  test(`${modulePath} rejects an unauthenticated POST with 401 and writes nothing`, async () => {
    const stub = installDatabaseStub()
    try {
      await primeDatabase(stub)
      stubSessionLookup(stub)
      stubWritePath(stub, resource)

      const { POST } = await loadRoute(resource)
      const response = await POST(
        request(`/api/${resource.path}`, { method: "POST", body: resource.createBody, token: null }),
      )

      assert.equal(response.status, 401)
      assert.equal(stub.writesMatching(sql.table).length, 0, "no row may be written without a session")
    } finally {
      stub.restore()
    }
  })

  test(`${modulePath} GET returns { items } parsed through the real data layer`, async () => {
    const stub = installDatabaseStub()
    try {
      await primeDatabase(stub)
      stubSessionLookup(stub)
      stub.on(sql.select, { rows: [resource.row] })

      const { GET } = await loadRoute(resource)
      const response = await GET(request(`/api/${resource.path}`, { method: "GET" }))

      assert.equal(response.status, 200)
      const payload = await readJson<{ items: Record<string, unknown>[] }>(response)
      assert.equal(Array.isArray(payload.items), true)
      assert.equal(payload.items.length, 1)
      assert.equal(payload.items[0].id, resource.row.id)

      // The column is stored as a JSON string and must come back decoded: this
      // is what proves the real `lib/data.ts` mapping ran, not a passthrough.
      const parsed = payload.items[0][resource.jsonField]
      assert.equal(
        typeof parsed,
        "object",
        `${resource.jsonField} should be parsed, not left as a string`,
      )
      assert.equal(Array.isArray(parsed), resource.jsonShape === "array")

      // The list query is scoped to the caller (or an admin), and the archive
      // filter defaults to active when no `?status=` is given.
      const listQuery = stub.matching(sql.select)
      assert.equal(listQuery.length, 1)
      assert.deepEqual(listQuery[0].params.slice(-2), [TEST_USER_ROW.id, TEST_USER_ROW.role])
      assert.ok(listQuery[0].sql.includes("archived_at IS NULL"), "default status is active")
    } finally {
      stub.restore()
    }
  })

  test(`${modulePath} POST creates and answers 201 { item }`, async () => {
    const stub = installDatabaseStub()
    try {
      await primeDatabase(stub)
      stubSessionLookup(stub)
      stubWritePath(stub, resource)

      const { POST } = await loadRoute(resource)
      const response = await POST(
        request(`/api/${resource.path}`, { method: "POST", body: resource.createBody }),
      )

      assert.equal(response.status, 201)
      const payload = await readJson<{ item: Record<string, unknown> }>(response)
      assert.equal(payload.item.id, resource.row.id)

      const inserts = stub.matching(sql.insert)
      assert.equal(inserts.length, 1)
      assert.ok(inserts[0].params.includes(TEST_USER_ROW.id), "the create must record its owner")

      // A create is an event, not a silent write.
      assert.equal(stub.matching(/INSERT INTO audit_logs/).length, 1)
      assert.equal(stub.writesMatching(sql.archive).length, 0, "a create must not archive")
    } finally {
      stub.restore()
    }
  })

  test(`${modulePath} PUT updates and answers 200 { item } (not 201)`, async () => {
    const stub = installDatabaseStub()
    try {
      await primeDatabase(stub)
      stubSessionLookup(stub)
      stubWritePath(stub, resource)

      const { PUT } = await loadRoute(resource)
      const response = await PUT(
        request(`/api/${resource.path}`, { method: "PUT", body: resource.updateBody }),
      )

      assert.equal(response.status, 200)
      const payload = await readJson<{ item: Record<string, unknown> }>(response)
      assert.equal(payload.item.id, resource.row.id)

      // An update with an id must ask who owns the row first — the write-IDOR
      // guard. Answering it for the caller is what lets the write through.
      const guard = stub.matching(sql.ownership)
      assert.equal(guard.length, 1, "an update by id must check ownership")
      assert.deepEqual(guard[0].params, [resource.row.id])
      assert.equal(stub.matching(sql.insert).length, 1)
    } finally {
      stub.restore()
    }
  })

  test(`${modulePath} DELETE ?id= archives the row and answers { success: true }`, async () => {
    const stub = installDatabaseStub()
    try {
      await primeDatabase(stub)
      stubSessionLookup(stub)
      stubWritePath(stub, resource)

      const { DELETE } = await loadRoute(resource)
      const response = await DELETE(
        request(`/api/${resource.path}?id=${resource.row.id}`, { method: "DELETE" }),
      )

      assert.equal(response.status, 200)
      const payload = await readJson<{ success: boolean }>(response)
      assert.deepEqual(payload, { success: true })

      // Exactly one archive statement, keyed by the id from the query string,
      // and scoped to the caller.
      const archives = stub.matching(sql.archive)
      assert.equal(archives.length, 1, "the archive statement must be issued once")
      assert.equal(archives[0].params[0], resource.row.id)
      assert.ok(archives[0].sql.includes("owner_user_id"), "the archive must be owner-scoped")

      assert.equal(stub.matching(/INSERT INTO audit_logs/).length, 1)
      assert.equal(stub.writesMatching(sql.insert).length, 0, "archiving must not re-save the row")
    } finally {
      stub.restore()
    }
  })

  test(`${modulePath} PATCH { action: "restore" } un-archives and answers { item }`, async () => {
    const stub = installDatabaseStub()
    try {
      await primeDatabase(stub)
      stubSessionLookup(stub)
      stubWritePath(stub, resource)

      const { PATCH } = await loadRoute(resource)
      const response = await PATCH(
        request(`/api/${resource.path}`, {
          method: "PATCH",
          body: { action: "restore", id: resource.row.id },
        }),
      )

      assert.equal(response.status, 200)
      const payload = await readJson<{ item: Record<string, unknown> }>(response)
      assert.equal(payload.item.id, resource.row.id)

      const restores = stub.matching(sql.restore)
      assert.equal(restores.length, 1, "the restore statement must be issued once")
      assert.equal(restores[0].params[0], resource.row.id)
      assert.equal(stub.matching(/INSERT INTO audit_logs/).length, 1)
    } finally {
      stub.restore()
    }
  })

  test(`${modulePath} PATCH with an unknown action answers 400 "${`Unsupported ${resource.actionLabel} action.`}" and writes nothing`, async () => {
    const stub = installDatabaseStub()
    try {
      await primeDatabase(stub)
      stubSessionLookup(stub)
      stubWritePath(stub, resource)

      const { PATCH } = await loadRoute(resource)
      const response = await PATCH(
        request(`/api/${resource.path}`, {
          method: "PATCH",
          body: { action: "archive", id: resource.row.id },
        }),
      )

      assert.equal(response.status, 400)
      const payload = await readJson<{ error: string }>(response)
      // Exact, not a regex: the noun here is the resource's identity in the
      // shared factory, and the three of them must not converge on one label.
      assert.equal(payload.error, `Unsupported ${resource.actionLabel} action.`)

      assert.equal(stub.writesMatching(sql.table).length, 0, "an unknown action must not write")
    } finally {
      stub.restore()
    }
  })
}

/**
 * The three resources must keep their distinct nouns. If a refactor points all
 * three at one shared label, every route-specific message above still needs to
 * differ — this pins the labels as a set.
 */
test("the three resources keep distinct unsupported-action labels", () => {
  const labels = RESOURCES.map((resource) => resource.actionLabel)
  assert.deepEqual([...new Set(labels)].length, labels.length)
  assert.deepEqual(labels, ["document", "sheet", "slide"])
})
