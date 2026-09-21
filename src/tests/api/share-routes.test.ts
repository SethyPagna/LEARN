/**
 * Share links, end to end through the real handlers.
 *
 * The permission model (`src/lib/sharing.ts`) had no caller before this feature,
 * so these tests are the first place its answers change what an HTTP request is
 * allowed to do. Two things are therefore being pinned here, and they fail for
 * different reasons:
 *
 *   1. **The link itself** — `/api/share` mints, lists and revokes a
 *      `public_link` grant on an item the caller owns, and
 *      `/api/share/[token]` serves that item's record to anyone holding the
 *      token, but only while the grant is live. Unknown, expired, revoked and
 *      archived all have to answer 404 with no data, because a share URL is a
 *      bearer credential that gets forwarded, logged and cached.
 *
 *   2. **The write path the grant feeds** — `saveEditorDocument` (and the sheet
 *      and slide savers) now accept a non-owner who holds an *editor* grant and
 *      still refuse a *viewer*. That is the difference the feature exists to
 *      make, so it is driven through `PUT /api/docs` and `PUT /api/canvas`
 *      rather than asserted against the data layer directly.
 *
 * `shared_access` is faked statefully — the harness answers SQL by pattern, so a
 * stateless stub would let a test "revoke" a link that a later GET still finds.
 * Inserts land in a map and deletes remove from it, which is what makes the
 * revoke test prove the token stopped resolving.
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
  type RecordedStatement,
} from "./harness"

const OWNER_USER_ID = "user_owner"
const DOC_ID = "doc_shared_1"
const CONTENT_ITEM_ID = "content_doc_1"
const VIEWER_USER_ID = TEST_USER_ROW.id

const CONTENT_ITEM_ROW = {
  id: CONTENT_ITEM_ID,
  workspace_id: "workspace_demo",
  owner_user_id: OWNER_USER_ID,
  item_type: "doc",
  source_table: "editor_documents",
  source_id: DOC_ID,
  title: "Cell division",
  summary: "Mitosis",
  visibility: "private",
  archived_at: null,
  updated_at: "2024-01-01 00:00:00",
}

const DOC_ROW = {
  id: DOC_ID,
  workspace_id: "workspace_demo",
  owner_user_id: OWNER_USER_ID,
  title: "Cell division",
  document_type: "doc",
  content: '{"blocks":[{"id":"b1"}]}',
  tags: "[]",
  archived_at: null,
  updated_at: "2024-01-01 00:00:00",
}

const OWNERSHIP_READ = /SELECT owner_user_id AS owner_id FROM editor_documents/
const SHARE_INSERT = /INSERT INTO shared_access/
// `\s+`, not a space: one of these statements is written across lines in
// `lib/data.ts`, and a pattern that assumed a single space silently answered
// "no rows" — which is exactly what a "the link stopped working" bug looks like.
const SHARE_BY_TOKEN = /SELECT \* FROM shared_access\s+WHERE grantee_type = 'public_link' AND grantee_id = \?/
const SHARE_BY_ID = /SELECT \* FROM shared_access\s+WHERE id = \?/
const SHARE_BY_ITEM = /SELECT \* FROM shared_access\s+WHERE content_item_id = \?/
const SHARE_DELETE = /DELETE FROM shared_access\s+WHERE id = \?/

interface ShareLinkPayload {
  id: string
  token: string
  role: "viewer" | "editor"
  expiresAt: string | null
  active: boolean
}

/** A stateful `shared_access`, keyed by token — the way the table behaves. */
function installSharedAccess(stub: DatabaseStub) {
  const rows = new Map<string, Record<string, unknown>>()

  stub.on(SHARE_INSERT, (_sql, params) => {
    const row = {
      id: String(params[0]),
      content_item_id: String(params[1]),
      grantee_type: "public_link",
      grantee_id: String(params[2]),
      role: String(params[3]),
      created_by_user_id: String(params[4]),
      expires_at: params[5] == null ? null : String(params[5]),
      created_at: "2026-01-01 00:00:00",
    }
    rows.set(row.grantee_id, row)
    return { rowCount: 1 }
  })

  stub.on(SHARE_BY_TOKEN, (_sql, params) => {
    const row = rows.get(String(params[0]))
    return { rows: row ? [row] : [] }
  })

  stub.on(SHARE_BY_ID, (_sql, params) => {
    const row = [...rows.values()].find((candidate) => candidate.id === String(params[0]))
    return { rows: row ? [row] : [] }
  })

  stub.on(SHARE_BY_ITEM, (_sql, params) => ({
    rows: [...rows.values()].filter((candidate) => candidate.content_item_id === String(params[0])),
  }))

  stub.on(SHARE_DELETE, (_sql, params) => {
    for (const [token, row] of rows) if (row.id === String(params[0])) rows.delete(token)
    return { rowCount: 1 }
  })

  return rows
}

/** Everything the doc save path needs beyond its guard, for a granted editor. */
function stubDocWritePath(stub: DatabaseStub) {
  stub.on(/INSERT INTO editor_documents/, { rowCount: 1 })
  stub.on(/INSERT INTO content_items/, { rowCount: 1 })
  stub.on(/SELECT \* FROM content_items/, { rows: [CONTENT_ITEM_ROW] })
  stub.on(/INSERT INTO content_versions/, { rowCount: 1 })
  stub.on(/SELECT COALESCE\(MAX\(version_number\)/, { rows: [{ version_number: 1 }] })
  stub.on(/INSERT INTO audit_logs/, { rowCount: 1 })
  stub.on(/SELECT \* FROM editor_documents\s+WHERE id = \? LIMIT 1/, { rows: [DOC_ROW] })
}

/** The registry row, with the given owner — ownership is the whole test here. */
function stubContentItem(stub: DatabaseStub, ownerUserId: string, overrides: Record<string, unknown> = {}) {
  stub.on(/SELECT \* FROM content_items/, { rows: [{ ...CONTENT_ITEM_ROW, owner_user_id: ownerUserId, ...overrides }] })
}

function savedMirrorOwner(stub: DatabaseStub) {
  const inserts = stub.matching(/INSERT INTO content_items/)
  assert.ok(inserts.length, "the save must write the content mirror")
  // owner_user_id is the third bound parameter of the mirror upsert.
  return String(inserts[0].params[2])
}

async function loadShareRoute() {
  return import("../../app/api/share/route")
}

async function loadTokenRoute() {
  return import("../../app/api/share/[token]/route")
}

function tokenContext(token: string) {
  return { params: Promise.resolve({ token }) }
}

// ---------------------------------------------------------------------------
// Creating a link: owner only
// ---------------------------------------------------------------------------

test("POST /api/share refuses a non-owner and writes no grant", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    installSharedAccess(stub)
    // The registry row belongs to somebody else; the caller is `user_test`.
    stub.on(/SELECT \* FROM content_items/, { rows: [CONTENT_ITEM_ROW] })

    const { POST } = await loadShareRoute()
    const response = await POST(
      request("/api/share", {
        method: "POST",
        body: { sourceTable: "editor_documents", sourceId: DOC_ID, role: "viewer" },
      }),
    )

    assert.equal(response.status, 400)
    const payload = await readJson<{ error: string }>(response)
    assert.match(payload.error, /only the owner/i)
    assert.equal(stub.writesMatching(SHARE_INSERT).length, 0, "a refused create must not insert a grant")
    assert.equal(stub.matching(/INSERT INTO audit_logs/).length, 0, "a refused create must not be audited")
  } finally {
    stub.restore()
  }
})

test("POST /api/share requires a session before it reads the body", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    installSharedAccess(stub)

    const { POST } = await loadShareRoute()
    const response = await POST(
      request("/api/share", {
        method: "POST",
        token: null,
        body: { sourceTable: "editor_documents", sourceId: DOC_ID, role: "viewer" },
      }),
    )

    assert.equal(response.status, 401)
    assert.equal(stub.matching(/content_items/).length, 0, "an unauthenticated create must not look anything up")
    assert.equal(stub.writesMatching(SHARE_INSERT).length, 0)
  } finally {
    stub.restore()
  }
})

test("POST /api/share mints a token for the owner and echoes the role", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    const rows = installSharedAccess(stub)
    stubContentItem(stub, VIEWER_USER_ID)

    const { POST } = await loadShareRoute()
    const response = await POST(
      request("/api/share", {
        method: "POST",
        body: { contentItemId: CONTENT_ITEM_ID, role: "editor" },
      }),
    )

    assert.equal(response.status, 201)
    const payload = await readJson<{ link: ShareLinkPayload }>(response)
    assert.match(payload.link.token, /^[0-9a-f]{64}$/, "the token must be 64 hex chars of CSPRNG output")
    assert.equal(payload.link.role, "editor")
    assert.equal(payload.link.expiresAt, null)
    assert.equal(payload.link.active, true)
    assert.equal(rows.size, 1)

    const inserts = stub.writesMatching(SHARE_INSERT)
    assert.equal(inserts.length, 1)
    // Values are ($id, $contentItemId, 'public_link', $token, $role, $userId, $expiresAt).
    assert.deepEqual(inserts[0].params, [payload.link.id, CONTENT_ITEM_ID, payload.link.token, "editor", VIEWER_USER_ID, null])
    assert.match(inserts[0].sql, /'public_link'/, "the grant must be a public_link")
    assert.equal(stub.matching(/INSERT INTO audit_logs/).length, 1, "minting a link is an auditable event")

    // A second link for the same item is a second row: links are individually
    // revocable, so they cannot share a grant.
    const second = await POST(
      request("/api/share", { method: "POST", body: { contentItemId: CONTENT_ITEM_ID, role: "viewer" } }),
    )
    assert.equal(second.status, 201)
    const secondPayload = await readJson<{ link: ShareLinkPayload }>(second)
    assert.notEqual(secondPayload.link.token, payload.link.token)
    assert.equal(rows.size, 2)
  } finally {
    stub.restore()
  }
})

test("POST /api/share refuses a role a link may not carry", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    installSharedAccess(stub)
    stubContentItem(stub, VIEWER_USER_ID)

    const { POST } = await loadShareRoute()
    // An absent, empty, or unrecognised role is refused rather than defaulted:
    // the role is the security-relevant half of this request.
    for (const role of ["owner", "commenter", "", undefined]) {
      const response = await POST(
        request("/api/share", { method: "POST", body: { contentItemId: CONTENT_ITEM_ID, role } }),
      )
      assert.equal(response.status, 400, `role ${JSON.stringify(role)}`)
      assert.equal(
        stub.writesMatching(SHARE_INSERT).length,
        0,
        `role ${JSON.stringify(role)} must not insert a grant`,
      )
    }
  } finally {
    stub.restore()
  }
})

test("POST /api/share stores an expiry as ISO-8601 UTC", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    installShareLinkOnly(stub)
    stubContentItem(stub, VIEWER_USER_ID)

    const { POST } = await loadShareRoute()
    const response = await POST(
      request("/api/share", {
        method: "POST",
        body: { contentItemId: CONTENT_ITEM_ID, role: "viewer", expiresAt: "2027-03-04T05:06:07.000Z" },
      }),
    )

    assert.equal(response.status, 201)
    const payload = await readJson<{ link: ShareLinkPayload }>(response)
    assert.equal(payload.link.expiresAt, "2027-03-04T05:06:07.000Z")

    const inserts = stub.writesMatching(SHARE_INSERT)
    assert.equal(inserts[0].params[5], "2027-03-04T05:06:07.000Z")
    // D1's `datetime('now')` shape would be read as *local* time by
    // `isGrantActive`; the stored value must never look like that.
    assert.doesNotMatch(String(inserts[0].params[5]), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  } finally {
    stub.restore()
  }
})

/** The insert responder alone, for tests that only need the write to succeed. */
function installShareLinkOnly(stub: DatabaseStub) {
  const rows: Record<string, unknown>[] = []
  stub.on(SHARE_INSERT, (_sql, params) => {
    rows.push({ id: String(params[0]) })
    return { rowCount: 1 }
  })
  return rows
}

// ---------------------------------------------------------------------------
// Listing and revoking: owner only, and tokens are not leaked to anyone else
// ---------------------------------------------------------------------------

test("GET /api/share lists the item's links for the owner and refuses everyone else", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    installSharedAccess(stub)
    stubContentItem(stub, VIEWER_USER_ID)

    const { GET, POST } = await loadShareRoute()
    await POST(request("/api/share", { method: "POST", body: { contentItemId: CONTENT_ITEM_ID, role: "viewer" } }))

    const mine = await GET(request(`/api/share?contentItemId=${CONTENT_ITEM_ID}`))
    assert.equal(mine.status, 200)
    const payload = await readJson<{ links: ShareLinkPayload[] }>(mine)
    assert.equal(payload.links.length, 1)
    assert.equal(payload.links[0].role, "viewer")
    assert.equal(payload.links[0].active, true)

    // The same read as somebody else: refused, and with no token in the body.
    stubContentItem(stub, OWNER_USER_ID)
    const theirs = await GET(request(`/api/share?contentItemId=${CONTENT_ITEM_ID}`))
    assert.equal(theirs.status, 400)
    const refusal = await readJson<{ error: string; links?: unknown }>(theirs)
    assert.match(refusal.error, /only the owner/i)
    assert.equal(refusal.links, undefined)
  } finally {
    stub.restore()
  }
})

test("GET /api/share resolves a source pair as well as a registry id", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    installSharedAccess(stub)
    stubContentItem(stub, VIEWER_USER_ID)

    const { GET } = await loadShareRoute()
    const response = await GET(request(`/api/share?sourceTable=editor_documents&sourceId=${DOC_ID}`))

    assert.equal(response.status, 200)
    assert.deepEqual(await readJson<{ links: ShareLinkPayload[] }>(response), { links: [] })

    const unknown = await GET(request("/api/share?sourceTable=editor_documents"))
    assert.equal(unknown.status, 400)
  } finally {
    stub.restore()
  }
})

// ---------------------------------------------------------------------------
// The public token route
// ---------------------------------------------------------------------------

test("GET /api/share/[token] serves the item and its payload with no session at all", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    installSharedAccess(stub)
    stubContentItem(stub, VIEWER_USER_ID)

    const { POST } = await loadShareRoute()
    const created = await readJson<{ link: ShareLinkPayload }>(
      await POST(request("/api/share", { method: "POST", body: { contentItemId: CONTENT_ITEM_ID, role: "viewer" } })),
    )

    stub.reset()
    installSharedAccessRows(stub, created.link, CONTENT_ITEM_ROW)
    stub.on(/SELECT \* FROM content_items/, { rows: [CONTENT_ITEM_ROW] })
    stub.on(/SELECT \* FROM editor_documents WHERE id = \? LIMIT 1/, { rows: [DOC_ROW] })

    const { GET } = await loadTokenRoute()
    const response = await GET(request(`/api/share/${created.link.token}`, { token: null }), tokenContext(created.link.token))

    assert.equal(response.status, 200)
    const payload = await readJson<{ item: Record<string, unknown>; payload: Record<string, unknown> }>(response)
    assert.deepEqual(payload.item, {
      id: CONTENT_ITEM_ID,
      title: "Cell division",
      itemType: "doc",
      sourceTable: "editor_documents",
      sourceId: DOC_ID,
      role: "viewer",
    })
    assert.equal(payload.payload.id, DOC_ID)
    // The stored JSON columns come back decoded, exactly as the owning route
    // would return them — this is the data layer's mapper running, not a passthrough.
    assert.equal(typeof payload.payload.content, "object")
    assert.deepEqual(payload.payload.tags, [])

    // The whole point: no session was involved.
    assert.equal(stub.matching(/FROM user_sessions/).length, 0, "the public route must not require a session")
  } finally {
    stub.restore()
  }
})

/** One live grant row, as the stateful stub would have stored it. */
function installSharedAccessRows(stub: DatabaseStub, link: ShareLinkPayload, item: Record<string, unknown>) {
  const row = {
    id: link.id,
    content_item_id: item.id,
    grantee_type: "public_link",
    grantee_id: link.token,
    role: link.role,
    created_by_user_id: OWNER_USER_ID,
    expires_at: link.expiresAt,
    created_at: "2026-01-01 00:00:00",
  }
  stub.on(SHARE_BY_TOKEN, { rows: [row] })
}

test("GET /api/share/[token] answers 404 for an unknown token", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    installSharedAccess(stub)

    const { GET } = await loadTokenRoute()
    const response = await GET(request("/api/share/deadbeef", { token: null }), tokenContext("deadbeef"))

    assert.equal(response.status, 404)
    const payload = await readJson<{ error: string; item?: unknown; payload?: unknown }>(response)
    assert.match(payload.error, /not valid/i)
    assert.equal(payload.item, undefined)
    assert.equal(payload.payload, undefined)
    assert.equal(stub.matching(/editor_documents/).length, 0, "an unknown token must not read any record")
  } finally {
    stub.restore()
  }
})

test("GET /api/share/[token] answers 404 for an expired grant, without reading the record", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    installSharedAccessRows(
      stub,
      { id: "share_expired", token: "a".repeat(64), role: "viewer", expiresAt: "2000-01-01T00:00:00.000Z", active: false },
      CONTENT_ITEM_ROW,
    )
    // Everything *else* about this link is valid: the item exists and its record
    // is waiting to be served. Only the expiry can produce the 404 below, which
    // is what makes this test the one that fails if expiry stops being checked.
    stubContentItem(stub, OWNER_USER_ID)
    stub.on(/SELECT \* FROM editor_documents WHERE id = \? LIMIT 1/, { rows: [DOC_ROW] })

    const { GET } = await loadTokenRoute()
    const response = await GET(request(`/api/share/${"a".repeat(64)}`, { token: null }), tokenContext("a".repeat(64)))

    assert.equal(response.status, 404)
    const payload = await readJson<{ error: string; payload?: unknown }>(response)
    assert.match(payload.error, /not valid/i)
    assert.equal(payload.payload, undefined)
    assert.equal(stub.matching(/editor_documents/).length, 0, "an expired link must not read the record")
  } finally {
    stub.restore()
  }
})

test("revoking a link makes its token 404", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    const rows = installSharedAccess(stub)
    stubContentItem(stub, VIEWER_USER_ID)

    const { POST, DELETE } = await loadShareRoute()
    const created = await readJson<{ link: ShareLinkPayload }>(
      await POST(request("/api/share", { method: "POST", body: { contentItemId: CONTENT_ITEM_ID, role: "editor" } })),
    )

    // It resolves while it is live… (the item is the caller's, so the revoke
    // below is allowed — the registry owner and the caller are the same account.)
    const tokenRoute = await loadTokenRoute()
    stubContentItem(stub, VIEWER_USER_ID)
    stub.on(/SELECT \* FROM editor_documents WHERE id = \? LIMIT 1/, { rows: [DOC_ROW] })
    const live = await tokenRoute.GET(
      request(`/api/share/${created.link.token}`, { token: null }),
      tokenContext(created.link.token),
    )
    assert.equal(live.status, 200)

    // …and the owner's Revoke control is the DELETE.
    const revoked = await DELETE(request(`/api/share?id=${created.link.id}`, { method: "DELETE" }))
    assert.equal(revoked.status, 200)
    assert.deepEqual(await readJson<{ success: boolean }>(revoked), { success: true })
    assert.equal(rows.size, 0, "the grant row must be gone, not merely flagged")
    assert.equal(stub.matching(/INSERT INTO audit_logs/).length, 2, "create and revoke are both audited")

    const after = await tokenRoute.GET(
      request(`/api/share/${created.link.token}`, { token: null }),
      tokenContext(created.link.token),
    )
    assert.equal(after.status, 404)
    assert.equal((await readJson<{ payload?: unknown }>(after)).payload, undefined)
  } finally {
    stub.restore()
  }
})

test("DELETE /api/share refuses a non-owner, and a missing id", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    const rows = installSharedAccess(stub)
    // A grant that exists on somebody else's item: the row is found, and the
    // ownership check is what refuses the revoke.
    rows.set("tok", {
      id: "share_theirs",
      content_item_id: CONTENT_ITEM_ID,
      grantee_type: "public_link",
      grantee_id: "tok",
      role: "viewer",
      expires_at: null,
    })
    stubContentItem(stub, OWNER_USER_ID)

    const { DELETE } = await loadShareRoute()
    const refused = await DELETE(request("/api/share?id=share_theirs", { method: "DELETE" }))
    assert.equal(refused.status, 400)
    assert.match((await readJson<{ error: string }>(refused)).error, /only the owner/i)
    assert.equal(stub.writesMatching(SHARE_DELETE).length, 0, "a refused revoke must not delete")
    assert.equal(rows.size, 1, "the grant must still be there")

    const missing = await DELETE(request("/api/share?id=share_unknown", { method: "DELETE" }))
    assert.equal(missing.status, 400)
    assert.equal(stub.writesMatching(SHARE_DELETE).length, 0)

    const noId = await DELETE(request("/api/share", { method: "DELETE" }))
    assert.equal(noId.status, 400)
    assert.equal(
      stub.matching(SHARE_BY_ID).length,
      2,
      "an id-less revoke must not look anything up — only the two calls above read a grant",
    )
  } finally {
    stub.restore()
  }
})

test("GET /api/share/[token] answers 404 for an archived item", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    const archivedItem = { ...CONTENT_ITEM_ROW, archived_at: "2026-05-05 00:00:00" }
    installSharedAccessRows(
      stub,
      { id: "share_live", token: "b".repeat(64), role: "editor", expiresAt: null, active: true },
      archivedItem,
    )
    stub.on(/SELECT \* FROM content_items WHERE id = \? LIMIT 1/, { rows: [archivedItem] })
    // The record is available too, so the only reason this can 404 is the
    // archive — and the assertion at the end proves nothing was read.
    stub.on(/SELECT \* FROM editor_documents WHERE id = \? LIMIT 1/, { rows: [DOC_ROW] })

    const { GET } = await loadTokenRoute()
    const response = await GET(request(`/api/share/${"b".repeat(64)}`, { token: null }), tokenContext("b".repeat(64)))

    // Archiving an item kills its links: the item is out of the workspace, so
    // serving its record from a URL that predates the archive would be a leak.
    assert.equal(response.status, 404)
    assert.equal((await readJson<{ payload?: unknown }>(response)).payload, undefined)
    assert.equal(stub.matching(/editor_documents/).length, 0)
  } finally {
    stub.restore()
  }
})

// ---------------------------------------------------------------------------
// The write path the grants now gate
// ---------------------------------------------------------------------------

/** One `shared_access` row, as D1 would return it. */
function grantRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "share_grant",
    content_item_id: CONTENT_ITEM_ID,
    grantee_type: "user",
    grantee_id: VIEWER_USER_ID,
    role: "viewer",
    expires_at: null,
    ...overrides,
  }
}

/** A non-owner save of `DOC_ID`, with the caller holding `role` on its item. */
async function attemptNonOwnerDocSave(
  stub: DatabaseStub,
  role: "viewer" | "commenter" | "editor" | "owner" | null,
  path = "docs",
) {
  await primeDatabase(stub)
  stubSessionLookup(stub)
  stubDocWritePath(stub)
  stub.on(OWNERSHIP_READ, { rows: [{ owner_id: OWNER_USER_ID }] })
  stub.on(/SELECT \* FROM content_items WHERE source_table/, { rows: [CONTENT_ITEM_ROW] })
  stub.on(SHARE_BY_ITEM, { rows: role ? [grantRow({ role })] : [] })

  const route = await import(`../../app/api/${path}/route`)
  return route.PUT(
    request(`/api/${path}`, { method: "PUT", body: { id: DOC_ID, title: "Edited", content: {} } }),
  )
}

test("a viewer grant cannot write through the item's save route", async () => {
  const stub = installDatabaseStub()
  try {
    const response = await attemptNonOwnerDocSave(stub, "viewer")

    assert.equal(response.status, 400)
    assert.match((await readJson<{ error: string }>(response)).error, /only change items you own/i)
    assert.equal(stub.writesMatching(/INSERT INTO editor_documents/).length, 0, "a viewer must not write the row")
    assert.equal(stub.writesMatching(/INSERT INTO content_items/).length, 0)
    assert.equal(stub.matching(/INSERT INTO audit_logs/).length, 0)
  } finally {
    stub.restore()
  }
})

test("a share link's own grant never gives a signed-in stranger edit rights", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    stubDocWritePath(stub)
    stub.on(OWNERSHIP_READ, { rows: [{ owner_id: OWNER_USER_ID }] })
    stub.on(/SELECT \* FROM content_items WHERE source_table/, { rows: [CONTENT_ITEM_ROW] })
    // The only grant on the item is an "edit" link. Without presenting the token
    // it must count for nothing — `public_link` rows are readable by anyone who
    // knows an item id, so honouring one here would let any signed-in user edit
    // any item that has an edit link.
    stub.on(SHARE_BY_ITEM, {
      rows: [grantRow({ grantee_type: "public_link", grantee_id: "a".repeat(64), role: "editor" })],
    })

    const { PUT } = await import("../../app/api/docs/route")
    const response = await PUT(
      request("/api/docs", { method: "PUT", body: { id: DOC_ID, title: "Hijacked", content: {} } }),
    )

    assert.equal(response.status, 400)
    assert.equal(stub.writesMatching(/INSERT INTO editor_documents/).length, 0)
  } finally {
    stub.restore()
  }
})

test("a group grant of editor writes through, resolved from the caller's memberships", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    stubDocWritePath(stub)
    stub.on(OWNERSHIP_READ, { rows: [{ owner_id: OWNER_USER_ID }] })
    stub.on(/SELECT \* FROM content_items WHERE source_table/, { rows: [CONTENT_ITEM_ROW] })
    stub.on(/FROM group_members/, { rows: [{ group_id: "group_editors" }] })
    stub.on(SHARE_BY_ITEM, {
      rows: [grantRow({ grantee_type: "group", grantee_id: "group_editors", role: "editor" })],
    })

    const { PUT } = await import("../../app/api/docs/route")
    const response = await PUT(
      request("/api/docs", { method: "PUT", body: { id: DOC_ID, title: "Group edit", content: {} } }),
    )

    assert.equal(response.status, 200)
    assert.equal(stub.writesMatching(/INSERT INTO editor_documents/).length, 1)
    assert.equal(savedMirrorOwner(stub), OWNER_USER_ID)

    // The membership sets are read for the caller, not for the grant.
    const memberships = stub.matching(/FROM group_members/)
    assert.equal(memberships.length, 1)
    assert.deepEqual(memberships[0].params, [VIEWER_USER_ID])
  } finally {
    stub.restore()
  }
})

test("no grant at all, and a commenter grant, are refused the same way", async () => {
  for (const role of [null, "commenter"] as const) {
    const stub = installDatabaseStub()
    try {
      const response = await attemptNonOwnerDocSave(stub, role)
      assert.equal(response.status, 400, `role ${role}`)
      assert.equal(stub.writesMatching(/INSERT INTO editor_documents/).length, 0, `role ${role} must not write`)
    } finally {
      stub.restore()
    }
  }
})

test("an editor grant writes through the save route and keeps the mirror's owner", async () => {
  const stub = installDatabaseStub()
  try {
    const response = await attemptNonOwnerDocSave(stub, "editor")

    assert.equal(response.status, 200)
    const payload = await readJson<{ item: Record<string, unknown> }>(response)
    assert.equal(payload.item.id, DOC_ID)
    assert.equal(stub.writesMatching(/INSERT INTO editor_documents/).length, 1)
    assert.equal(stub.matching(/INSERT INTO audit_logs/).length, 1)
    // The mirror must stay the owner's: `upsertContentItemForSource` takes its
    // owner from the caller, so without this a granted editor would take the
    // item over and lock the real owner out of their own share settings.
    assert.equal(savedMirrorOwner(stub), OWNER_USER_ID)
  } finally {
    stub.restore()
  }
})

test("the canvas route — the one the Share control lives in — obeys the same rule", async () => {
  const viewerStub = installDatabaseStub()
  try {
    const refused = await attemptNonOwnerDocSave(viewerStub, "viewer", "canvas")
    assert.equal(refused.status, 400)
    assert.equal(viewerStub.writesMatching(/INSERT INTO editor_documents/).length, 0)
  } finally {
    viewerStub.restore()
  }

  const editorStub = installDatabaseStub()
  try {
    const allowed = await attemptNonOwnerDocSave(editorStub, "editor", "canvas")
    assert.equal(allowed.status, 200)
    assert.equal(savedMirrorOwner(editorStub), OWNER_USER_ID)
  } finally {
    editorStub.restore()
  }
})

test("the owner's own save costs no grant lookup and keeps today's answer", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    stubDocWritePath(stub)
    stub.on(OWNERSHIP_READ, { rows: [{ owner_id: VIEWER_USER_ID }] })

    const { PUT } = await import("../../app/api/docs/route")
    const response = await PUT(request("/api/docs", { method: "PUT", body: { id: DOC_ID, title: "Mine", content: {} } }))

    assert.equal(response.status, 200)
    assert.equal(stub.matching(OWNERSHIP_READ).length, 1, "the owner path stays one ownership read")
    assert.equal(stub.matching(SHARE_BY_ITEM).length, 0, "an owner is never pushed through the grant lookup")
    assert.equal(savedMirrorOwner(stub), VIEWER_USER_ID)
  } finally {
    stub.restore()
  }
})

test("an admin's save still passes and no longer takes the mirror's ownership", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stub.on(/FROM user_sessions/, { rows: [{ ...TEST_USER_ROW, role: "admin" }] })
    stubDocWritePath(stub)
    stub.on(OWNERSHIP_READ, { rows: [{ owner_id: OWNER_USER_ID }] })
    stub.on(SHARE_BY_ITEM, { rows: [] })

    const { PUT } = await import("../../app/api/docs/route")
    const response = await PUT(request("/api/docs", { method: "PUT", body: { id: DOC_ID, title: "Admin edit", content: {} } }))

    assert.equal(response.status, 200)
    assert.equal(stub.writesMatching(/INSERT INTO editor_documents/).length, 1)
    assert.equal(savedMirrorOwner(stub), OWNER_USER_ID)
  } finally {
    stub.restore()
  }
})

/**
 * The guard is in the data layer, so a route that bypassed the savers would
 * still be unguarded. Pin the call itself, next to the saver it replaced: the
 * three savers must call the role-aware guard and none of them may fall back to
 * the owner-only one.
 */
test("the mirrored savers call the role-aware guard, not the owner-only one", async () => {
  const fs = await import("node:fs")
  const path = await import("node:path")
  const source = fs.readFileSync(path.join(process.cwd(), "src", "lib", "data.ts"), "utf8")

  for (const [name, table] of [
    ["saveEditorDocument", "editor_documents"],
    ["saveSheet", "sheet_documents"],
    ["saveSlideDeck", "slide_decks"],
  ] as const) {
    const start = source.indexOf(`export async function ${name}(`)
    assert.notEqual(start, -1, `${name} must still exist`)
    const end = source.indexOf("\nexport ", start + 1)
    const body = source.slice(start, end === -1 ? undefined : end)

    assert.match(body, new RegExp(`await assertContentWriteRole\\(user, "${table}", input\\.id\\)`), `${name} must use the role-aware guard on ${table}`)
    assert.doesNotMatch(body, /await assertOwnership\(/, `${name} must not fall back to the owner-only guard`)
    assert.match(body, /ownerUserId: mirrorOwnerId/, `${name} must keep the mirror's owner`)
  }

  // Everything else keeps the owner-only guard: notes are not shareable yet, and
  // archive/restore paths were never in scope.
  assert.match(source, /await assertOwnership\(user, "notes", id, "owner_user_id"\)/)
})

/**
 * A granted editor is identified by the caller's own session, so a "grant" line
 * that names nobody is worthless. The recorded statements are asserted here to
 * make sure the lookup really was by the caller's id and the item in question.
 */
test("the grant lookup is scoped to the item and to the caller's own id", async () => {
  const stub = installDatabaseStub()
  try {
    await attemptNonOwnerDocSave(stub, "editor")

    const lookups: RecordedStatement[] = stub.matching(SHARE_BY_ITEM)
    assert.equal(lookups.length, 1)
    assert.deepEqual(lookups[0].params, [CONTENT_ITEM_ID])

    // And the grant rows are matched against the caller in JS, so prove the
    // request really was authenticated as that user.
    assert.ok(
      stub.matching(/FROM user_sessions/).length >= 1,
      "the request must have been authenticated as a real user",
    )
  } finally {
    stub.restore()
  }
})
