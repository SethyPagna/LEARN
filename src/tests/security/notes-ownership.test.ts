/**
 * Notes are the user's private Vault, and `notes.owner_user_id` is how the rest
 * of the data layer says so: `saveNote`, `deleteNote`, `archiveNote` and
 * `restoreNote` all run `assertOwnership`, and the sibling resources
 * (`listEditorDocuments`, `listSheets`, `listSlideDecks`, `listCalendarEvents`)
 * all read with `AND (owner_user_id = $n OR $m = 'admin')`.
 *
 * Reading was the one path that never got that predicate: `listNotes(status)`
 * ran `FROM notes n WHERE ${archiveClause}` and `getNote(id)` ran
 * `SELECT * FROM notes WHERE id = $1`, so any signed-in user could read every
 * other user's note titles and bodies through `GET /api/notes` and
 * `GET /api/notes/[id]`. `getDashboardData`'s notes snapshot had the same gap.
 *
 * These tests assert the fix at two levels:
 *
 *   1. The D1 boundary — the statement the handler actually issued carries the
 *      owner predicate and the caller's id, and no row owned by somebody else
 *      comes back through the response.
 *   2. The data-layer source — the predicate text is still there, so a later
 *      edit that rewrites the query string cannot quietly drop it.
 *
 * The stub honours the same predicate the real statement carries (it filters
 * the fixture by `params[0]`), so if the predicate is removed the leak shows up
 * as an extra row in the response rather than as a test that stays green.
 */

import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import {
  installDatabaseStub,
  primeDatabase,
  readJson,
  request,
  stubSessionLookup,
  TEST_USER_ROW,
} from "../api/harness"
import type { User } from "../../lib/data"

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
const DATA_LAYER = path.join(PROJECT_ROOT, "src", "lib", "data.ts")

/** The same caller `stubSessionLookup` resolves, as the data layer sees them. */
const CALLER: User = {
  id: TEST_USER_ROW.id,
  username: TEST_USER_ROW.username,
  email: TEST_USER_ROW.email,
  name: TEST_USER_ROW.name,
  role: "learner",
  preferences: {},
}

/** A second, unauthenticated-as-far-as-the-caller-cares user. */
const OTHER_USER_ID = "user_other_learner"

/** A `notes` row as D1 returns it: `tags` is JSON text, `favorite` an integer. */
function noteRow(id: string, ownerUserId: string, title: string) {
  return {
    id,
    workspace_id: "workspace_demo",
    owner_user_id: ownerUserId,
    title,
    icon: "FileText",
    content: `Body of "${title}"`,
    favorite: 0,
    template: "blank",
    archived_at: null,
    updated_at: "2026-09-21 06:00:00",
    tags: "[]",
  }
}

const MY_NOTE = noteRow("note_mine", TEST_USER_ROW.id, "My lecture notes")
const THEIR_NOTE = noteRow("note_theirs", OTHER_USER_ID, "Someone else's exam answers")
const ALL_NOTES = [MY_NOTE, THEIR_NOTE]

/**
 * Answer list-shaped notes reads the way the real database would: apply the
 * owner predicate to the fixture using the bound parameters. In the list and
 * dashboard queries `params[0]` is the caller's id.
 */
function stubOwnerScopedNotesList(stub: ReturnType<typeof installDatabaseStub>, pattern: RegExp) {
  stub.on(pattern, (_sql, params) => ({
    rows: ALL_NOTES.filter((row) => row.owner_user_id === params[0]),
  }))
}

/**
 * The single-note read binds `[id, callerId, role]`, so it needs its own fake:
 * filtering this one by `params[0]` would compare an id against an owner and
 * 404 the caller's own note, which is exactly the false confidence a stub is
 * supposed to remove.
 */
function stubOwnerScopedNoteRead(stub: ReturnType<typeof installDatabaseStub>) {
  stub.on(/SELECT \* FROM notes WHERE id/, (_sql, params) => ({
    rows: ALL_NOTES.filter((row) => row.id === params[0] && row.owner_user_id === params[1]),
  }))
}

/** The predicate every notes read must carry, after `$n` becomes `?`. */
const OWNER_PREDICATE = /owner_user_id = \? OR \? = 'admin'/

test("GET /api/notes returns only the caller's notes and carries the owner predicate", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    stubOwnerScopedNotesList(stub, /FROM notes n/)

    const { GET } = await import("../../app/api/notes/route")
    const response = await GET(request("/api/notes", { method: "GET" }))

    assert.equal(response.status, 200)

    // The statement that reached D1 is scoped to the caller (or an admin).
    const listQuery = stub.matching(/FROM notes n/)
    assert.equal(listQuery.length, 1, "the list route issues exactly one notes read")
    assert.match(listQuery[0].sql, OWNER_PREDICATE, "the notes list query must filter by owner")
    assert.deepEqual(
      listQuery[0].params,
      [TEST_USER_ROW.id, TEST_USER_ROW.role],
      "the owner predicate must be bound to the authenticated caller",
    )

    // And no row belonging to another user survives the read.
    const payload = await readJson<{ items: Record<string, unknown>[] }>(response)
    assert.deepEqual(
      payload.items.map((item) => item.owner_user_id),
      [TEST_USER_ROW.id],
      "another user's note must not be returned",
    )
    assert.deepEqual(payload.items.map((item) => item.id), [MY_NOTE.id])

    // The archived-status filter is still applied alongside the owner predicate.
    assert.ok(listQuery[0].sql.includes("archived_at IS NULL"), "default status is still active")
  } finally {
    stub.restore()
  }
})

test("GET /api/notes/[id] answers 404 for a note owned by somebody else", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    stubOwnerScopedNoteRead(stub)

    const { GET } = await import("../../app/api/notes/[id]/route")
    const context = (id: string) => ({ params: Promise.resolve({ id }) })

    const theirs = await GET(
      request(`/api/notes/${THEIR_NOTE.id}`, { method: "GET" }),
      context(THEIR_NOTE.id),
    )
    assert.equal(theirs.status, 404, "another user's note must not be readable")
    const theirsBody = await readJson<{ error: string }>(theirs)
    assert.match(theirsBody.error, /not found/i)

    // The same route and the same stub answer 200 for the caller's own note, so
    // the 404 above is the owner predicate — not a stub that answers nothing.
    const mine = await GET(request(`/api/notes/${MY_NOTE.id}`, { method: "GET" }), context(MY_NOTE.id))
    assert.equal(mine.status, 200)
    const mineBody = await readJson<{ item: Record<string, unknown> }>(mine)
    assert.equal(mineBody.item.id, MY_NOTE.id)

    const reads = stub.matching(/SELECT \* FROM notes WHERE id/)
    assert.equal(reads.length, 2)
    for (const read of reads) {
      assert.match(read.sql, OWNER_PREDICATE, "the single-note read must filter by owner")
    }
    assert.deepEqual(reads[0].params, [THEIR_NOTE.id, TEST_USER_ROW.id, TEST_USER_ROW.role])
  } finally {
    stub.restore()
  }
})

test("GET /api/dashboard scopes its notes snapshot to the caller too", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    stubOwnerScopedNotesList(stub, /FROM notes n/)

    const { GET } = await import("../../app/api/dashboard/route")
    const response = await GET(request("/api/dashboard", { method: "GET" }))

    assert.equal(response.status, 200)

    const listQuery = stub.matching(/FROM notes n/)
    assert.equal(listQuery.length, 1)
    assert.match(listQuery[0].sql, OWNER_PREDICATE, "the dashboard notes read must filter by owner")
    assert.deepEqual(listQuery[0].params, [TEST_USER_ROW.id, TEST_USER_ROW.role])

    const payload = await readJson<{ notes: { id: string }[] }>(response)
    assert.deepEqual(
      payload.notes.map((note) => note.id),
      [MY_NOTE.id],
      "the dashboard must not surface another user's notes",
    )
  } finally {
    stub.restore()
  }
})

test("the per-user seeds that reuse notes reads pass the user through", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubOwnerScopedNotesList(stub, /FROM notes n/)

    const { getVaultGraph, listReviewSchedule } = await import("../../lib/data")
    await getVaultGraph(CALLER)
    await listReviewSchedule(CALLER)

    const reads = stub.matching(/FROM notes n/)
    assert.equal(reads.length, 2, "both seeds read notes once")
    for (const read of reads) {
      assert.match(read.sql, OWNER_PREDICATE, "the seeds must not fall back to an unscoped read")
      assert.deepEqual(read.params, [TEST_USER_ROW.id, TEST_USER_ROW.role])
    }
  } finally {
    stub.restore()
  }
})

test("the notes read queries keep their owner predicate in the data layer source", () => {
  const source = fs.readFileSync(DATA_LAYER, "utf8")

  // Boundary tests only cover the paths a request reaches, and only while the
  // handler keeps calling them. Pin the shipped SQL text as well: if any of
  // these three queries is rewritten without the predicate, this fails next to
  // the query rather than as a leak discovered later.
  assert.match(
    source,
    /WHERE \$\{archiveClause\} AND \(n\.owner_user_id = \$1 OR \$2 = 'admin'\)/,
    "listNotes must filter by owner",
  )
  assert.match(
    source,
    /SELECT \* FROM notes WHERE id = \$1 AND archived_at IS NULL AND \(owner_user_id = \$2 OR \$3 = 'admin'\)/,
    "getNote must filter by owner",
  )
  assert.match(
    source,
    /FROM notes n\r?\n\s+WHERE n\.owner_user_id = \$1 OR \$2 = 'admin'/,
    "the dashboard notes snapshot must filter by owner",
  )

  // No caller may go back to the unscoped signature.
  assert.equal(
    source.includes("listNotes()"),
    false,
    "every listNotes call must pass the caller; the parameter is not optional",
  )
})
