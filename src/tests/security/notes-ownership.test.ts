/**
 * Notes are the user's private Vault, and `notes.owner_user_id` is how the rest
 * of the data layer says so. Reading was the first half of the fix: `listNotes`
 * ran `FROM notes n WHERE ${archiveClause}` and `getNote(id)` ran
 * `SELECT * FROM notes WHERE id = $1`, so any signed-in user could read every
 * other user's note titles and bodies through `GET /api/notes`,
 * `GET /api/notes/[id]` and the dashboard snapshot.
 *
 * Writing was the second half. `saveNote` guarded its upsert with
 * `assertOwnership`, but `deleteNote` and `restoreNote` ran
 * `UPDATE notes … WHERE id = $1` with no owner predicate at all — so
 * `DELETE /api/notes/[id]` and `PATCH /api/notes/[id]` (`{action:"restore"}`)
 * let any signed-in user archive or silently un-archive somebody else's note,
 * and the handler answered 200 either way. That is the write IDOR the last four
 * tests below pin down.
 *
 * These tests assert the fix at two levels:
 *
 *   1. The D1 boundary — the statement the handler actually issued carries the
 *      owner predicate and the caller's id, and no row owned by somebody else
 *      comes back through the response (reads) or is written (writes).
 *   2. The data-layer source — the predicate text is still there, so a later
 *      edit that rewrites the query string cannot quietly drop it.
 *
 * The stub honours the same predicate the real statement carries (it filters
 * the fixture by `params[0]`), so if the predicate is removed the leak shows up
 * as an extra row in the response rather than as a test that stays green. The
 * write-side guard is scoped in TypeScript rather than in SQL, so the same fake
 * answers the ownership read for all three cases that matter — owner,
 * non-owner, and no such note — and the refusal tests additionally assert on
 * the fake's own answer so they cannot pass vacuously.
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

/** An id that is in no fixture row, so the ownership read answers "no row". */
const MISSING_NOTE_ID = "note_does_not_exist"

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

/**
 * The ownership `SELECT` `assertOwnership` issues, after `$1` becomes `?` and
 * after `now()` becomes `datetime('now')`.
 *
 * It binds only the row id — the owner comes back as a column — so the fake can
 * answer the owner, non-owner and missing-note cases from the same fixture, and
 * the `/api/notes/[id]` handlers reach it identically to the way the upsert path
 * already does.
 */
const OWNERSHIP_READ = /SELECT owner_user_id AS owner_id FROM notes WHERE id = \?/
const ARCHIVE_WRITE = /UPDATE notes SET archived_at = datetime\('now'\)/
const RESTORE_WRITE = /UPDATE notes SET archived_at = NULL/
const CONTENT_ITEM_WRITE = /UPDATE content_items SET/

/** What the ownership read answers for a row id, straight from the fixture. */
function ownershipRowsFor(rowId: string) {
  return ALL_NOTES.filter((row) => row.id === rowId).map((row) => ({ owner_id: row.owner_user_id }))
}

function stubNotesOwnershipRead(stub: ReturnType<typeof installDatabaseStub>) {
  stub.on(OWNERSHIP_READ, (_sql, params) => ({ rows: ownershipRowsFor(String(params[0])) }))
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

/** The notes route context both write handlers take. */
function noteContext(id: string) {
  return { params: Promise.resolve({ id }) }
}

test("DELETE /api/notes/[id] archives the caller's own note, after checking ownership", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    stubNotesOwnershipRead(stub)

    const { DELETE } = await import("../../app/api/notes/[id]/route")
    const response = await DELETE(
      request(`/api/notes/${MY_NOTE.id}`, { method: "DELETE" }),
      noteContext(MY_NOTE.id),
    )

    assert.equal(response.status, 200, "an owner's archive must still succeed")
    const payload = await readJson<{ success: boolean }>(response)
    assert.equal(payload.success, true)

    // The guard the write depends on ran, bound to the note being archived.
    const guards = stub.matching(OWNERSHIP_READ)
    assert.equal(guards.length, 1, "the archive path runs exactly one ownership read")
    assert.deepEqual(guards[0].params, [MY_NOTE.id], "the ownership read must be bound to the note id")

    // And the archive itself still happens.
    const archives = stub.writesMatching(ARCHIVE_WRITE)
    assert.equal(archives.length, 1, "the owner's note must still be archived")
    assert.deepEqual(archives[0].params, [MY_NOTE.id])

    // Ordering is the whole point: a guard that runs after the UPDATE would
    // still let the write land.
    assert.ok(
      stub.statements.findIndex((statement) => OWNERSHIP_READ.test(statement.sql)) <
        stub.statements.findIndex((statement) => ARCHIVE_WRITE.test(statement.sql)),
      "ownership must be checked before the archive UPDATE",
    )

    // The content mirror is kept in step, as before.
    assert.equal(stub.writesMatching(CONTENT_ITEM_WRITE).length, 1)
  } finally {
    stub.restore()
  }
})

test("DELETE /api/notes/[id] refuses another user's note, and a note that is not there", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    stubNotesOwnershipRead(stub)

    // Self-check the fake before trusting its refusals: the same responder that
    // answers MY_NOTE (a green archive in the test above) must answer a row
    // here, otherwise the 400 below would prove nothing.
    assert.deepEqual(
      ownershipRowsFor(THEIR_NOTE.id),
      [{ owner_id: OTHER_USER_ID }],
      "the fake must answer the other user's note as a row owned by them",
    )
    assert.deepEqual(ownershipRowsFor(MISSING_NOTE_ID), [], "the fake must answer no row for a missing note")

    const { DELETE } = await import("../../app/api/notes/[id]/route")

    const theirs = await DELETE(
      request(`/api/notes/${THEIR_NOTE.id}`, { method: "DELETE" }),
      noteContext(THEIR_NOTE.id),
    )
    assert.equal(theirs.status, 400, "another user's note must not be archivable")
    const theirsBody = await readJson<{ error: string }>(theirs)
    assert.match(theirsBody.error, /only change items you own/i)

    const missing = await DELETE(
      request(`/api/notes/${MISSING_NOTE_ID}`, { method: "DELETE" }),
      noteContext(MISSING_NOTE_ID),
    )
    assert.equal(missing.status, 400, "archiving a note that does not exist must not report success")
    const missingBody = await readJson<{ error: string }>(missing)
    assert.match(missingBody.error, /not found/i)

    // Neither request reached the write. A 4xx response is only half the claim;
    // the statement log is the other half.
    assert.equal(stub.writesMatching(ARCHIVE_WRITE).length, 0, "no archive UPDATE may be issued")
    assert.equal(stub.writesMatching(CONTENT_ITEM_WRITE).length, 0, "no content mirror may be archived")
    assert.equal(stub.matching(/INSERT INTO audit_logs/).length, 0, "a refused archive must not be audited as a delete")

    // Both refusals did reach the guard, with the id under test — so the 400s
    // come from the ownership check, not from a route that rejects everything.
    const guards = stub.matching(OWNERSHIP_READ)
    assert.equal(guards.length, 2)
    assert.deepEqual(
      guards.map((guard) => guard.params),
      [[THEIR_NOTE.id], [MISSING_NOTE_ID]],
    )
  } finally {
    stub.restore()
  }
})

test("PATCH /api/notes/[id] restores the caller's own note, after checking ownership", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    stubNotesOwnershipRead(stub)
    stubOwnerScopedNoteRead(stub)

    const { PATCH } = await import("../../app/api/notes/[id]/route")
    const response = await PATCH(
      request(`/api/notes/${MY_NOTE.id}`, { method: "PATCH", body: { action: "restore" } }),
      noteContext(MY_NOTE.id),
    )

    assert.equal(response.status, 200, "an owner's restore must still succeed")

    const guards = stub.matching(OWNERSHIP_READ)
    assert.equal(guards.length, 1)
    assert.deepEqual(guards[0].params, [MY_NOTE.id])

    const restores = stub.writesMatching(RESTORE_WRITE)
    assert.equal(restores.length, 1, "the owner's note must still be restored")
    assert.deepEqual(restores[0].params, [MY_NOTE.id])

    assert.ok(
      stub.statements.findIndex((statement) => OWNERSHIP_READ.test(statement.sql)) <
        stub.statements.findIndex((statement) => RESTORE_WRITE.test(statement.sql)),
      "ownership must be checked before the restore UPDATE",
    )

    assert.equal(stub.writesMatching(CONTENT_ITEM_WRITE).length, 1)

    // The response still comes from `getNote`, so a restore keeps returning the
    // restored row rather than the bare success flag.
    const payload = await readJson<{ item: { id: string } | null }>(response)
    assert.equal(payload.item?.id, MY_NOTE.id, "the restore must return the restored note")
  } finally {
    stub.restore()
  }
})

test("PATCH /api/notes/[id] refuses to restore another user's note, or one that is not there", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    stubNotesOwnershipRead(stub)
    stubOwnerScopedNoteRead(stub)

    assert.deepEqual(ownershipRowsFor(THEIR_NOTE.id), [{ owner_id: OTHER_USER_ID }])
    assert.deepEqual(ownershipRowsFor(MISSING_NOTE_ID), [])

    const { PATCH } = await import("../../app/api/notes/[id]/route")
    const restore = (id: string) =>
      PATCH(
        request(`/api/notes/${id}`, { method: "PATCH", body: { action: "restore" } }),
        noteContext(id),
      )

    const theirs = await restore(THEIR_NOTE.id)
    assert.equal(theirs.status, 400, "another user's note must not be restorable")
    const theirsBody = await readJson<{ error: string }>(theirs)
    assert.match(theirsBody.error, /only change items you own/i)

    // Un-archiving a note that does not exist is not a create path, so it is
    // refused for the same reason: there is no owned row to act on.
    const missing = await restore(MISSING_NOTE_ID)
    assert.equal(missing.status, 400, "restoring a note that does not exist must not report success")
    const missingBody = await readJson<{ error: string }>(missing)
    assert.match(missingBody.error, /not found/i)

    assert.equal(stub.writesMatching(RESTORE_WRITE).length, 0, "no restore UPDATE may be issued")
    assert.equal(stub.writesMatching(CONTENT_ITEM_WRITE).length, 0, "no content mirror may be restored")
    assert.equal(stub.matching(/INSERT INTO audit_logs/).length, 0, "a refused restore must not be audited")
    assert.equal(stub.matching(/SELECT \* FROM notes WHERE id/).length, 0, "a refused restore must not read the note back")

    const guards = stub.matching(OWNERSHIP_READ)
    assert.equal(guards.length, 2)
    assert.deepEqual(
      guards.map((guard) => guard.params),
      [[THEIR_NOTE.id], [MISSING_NOTE_ID]],
    )
  } finally {
    stub.restore()
  }
})

test("the notes archive and restore paths keep their ownership guard in the data layer source", () => {
  const source = fs.readFileSync(DATA_LAYER, "utf8")

  // The write-side guard lives in TypeScript, not in the UPDATE text, so pin it
  // per function: a rewrite that drops the call, or that stops treating a
  // missing row as a refusal, fails here next to the function it broke.
  for (const name of ["deleteNote", "restoreNote"]) {
    const start = source.indexOf(`export async function ${name}(`)
    assert.notEqual(start, -1, `${name} must still exist`)
    const end = source.indexOf("\nexport ", start + 1)
    const body = source.slice(start, end === -1 ? undefined : end)

    assert.match(
      body,
      /await assertOwnership\(user, "notes", id, "owner_user_id"\)/,
      `${name} must run the same owner guard saveNote uses on this table`,
    )
    assert.match(body, /if \(!note\) throw new Error\("Note not found\."\)/, `${name} must refuse a missing note`)
    assert.match(body, /UPDATE notes SET/, `${name} must still issue its UPDATE for the owner`)
  }
})
