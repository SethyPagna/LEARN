/**
 * File downloads, end to end through the real handlers.
 *
 * `GET /api/files/[id]/download` answered 400 for every stored object in local
 * development — `{"error":"Cannot stringify arbitrary non-POJOs"}` — because it
 * returned the R2 body straight out of the binding. Under `next dev` that
 * binding is a wrangler proxy which serialises every call *and every result*
 * across the Node/workerd boundary, and a real `R2ObjectBody` does not survive
 * the trip:
 *
 *   - `writeHttpMetadata(headers)` throws `Cannot stringify arbitrary
 *     non-POJOs`, because the `Headers` argument is a Node global rather than
 *     the `undici.Headers` instance miniflare's bridge tests for. Reproduced
 *     against the local runtime with the real R2 binding;
 *   - reading `.body` spends the object — a later read answers "Body has
 *     already been used. It can only be used once.".
 *
 * So the route now reads `arrayBuffer()` and returns those bytes. The fake
 * binding below deliberately *refuses* the two things the route must not do: it
 * throws from `writeHttpMetadata` and spends the body on first read, exactly as
 * the local proxy did. A route that goes back to depending on either one fails
 * here, not only in a browser.
 *
 * The binding is installed through the same global the production worker
 * entrypoint uses (`Symbol.for("__cloudflare-context__")`), so these tests
 * drive the *real* binding branch of `getMediaObject` rather than its signed
 * R2 fetch fallback. The fake env has no `LEARN_DB`, which keeps every SQL
 * statement on the harness's D1 stub.
 *
 * The download handler reads its session through `getCurrentUser()`, i.e. via
 * `next/headers`' `cookies()`, so each call is made inside the request scope
 * from `./request-scope` — which is why that import comes first.
 */

// First import by design: it installs the AsyncLocalStorage global that Next's
// request stores are built from at module-evaluation time.
import "./request-scope"

import assert from "node:assert/strict"
import test from "node:test"

import type { R2BucketLike } from "../../lib/cloudflare"
import { MAX_INLINE_DOWNLOAD_BYTES } from "../../lib/file-security"
import {
  installDatabaseStub,
  primeDatabase,
  readJson,
  request,
  stubSessionLookup,
  TEST_SESSION_TOKEN,
  TEST_USER_ROW,
  type DatabaseStub,
} from "./harness"
import { withRequestScope } from "./request-scope"

/** A 1x1 PNG — real magic bytes, so the upload guard runs rather than being sidestepped. */
const PNG = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMB/6X0mQAAAABJRU5ErkJggg==",
    "base64",
  ),
)

const ASSET_ID = "asset_download_test"
const OBJECT_KEY = `apps/learn/workspaces/workspace_demo/users/${TEST_USER_ROW.id}/${ASSET_ID}-e2e-upload.png`

/** The message the local bridge produced, verbatim. */
const BRIDGE_ERROR = "Cannot stringify arbitrary non-POJOs"

interface StoredObject {
  bytes: Uint8Array
  size: number
  contentType: string
}

async function toBytes(value: ReadableStream | ArrayBuffer | ArrayBufferView | string | null) {
  if (value === null) return new Uint8Array()
  if (typeof value === "string") return new TextEncoder().encode(value)
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  return new Uint8Array(await new Response(value).arrayBuffer())
}

/**
 * An in-memory `LEARN_FILES` that behaves like the local dev proxy, not like a
 * sanitised stub: the traps are the point of this file.
 */
class FakeR2Bucket implements R2BucketLike {
  readonly objects = new Map<string, StoredObject>()
  /** Calls the route *must not* make: they cannot cross the local bridge. */
  writeHttpMetadataCalls = 0
  gets = 0

  reset() {
    this.objects.clear()
    this.writeHttpMetadataCalls = 0
    this.gets = 0
  }

  /** Place an object directly, optionally claiming a different size (a stale row). */
  seed(key: string, bytes: Uint8Array, overrides: Partial<StoredObject> = {}) {
    this.objects.set(key, {
      bytes,
      size: bytes.byteLength,
      contentType: "application/octet-stream",
      ...overrides,
    })
  }

  async put(
    key: string,
    value: ReadableStream | ArrayBuffer | ArrayBufferView | string | null,
    options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> },
  ) {
    this.seed(key, await toBytes(value), {
      contentType: options?.httpMetadata?.contentType ?? "application/octet-stream",
    })
    return {}
  }

  async get(key: string) {
    this.gets += 1
    const stored = this.objects.get(key)
    if (!stored) return null

    let streamTaken = false
    const bucket = this
    return {
      get body() {
        // The bridge hands the stream to Node once and leaves the workerd-side
        // body spent, which is why approaching this object as a stream fails.
        streamTaken = true
        return new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(stored.bytes)
            controller.close()
          },
        })
      },
      httpMetadata: { contentType: stored.contentType },
      size: stored.size,
      writeHttpMetadata() {
        bucket.writeHttpMetadataCalls += 1
        throw new Error(BRIDGE_ERROR)
      },
      async arrayBuffer() {
        if (streamTaken) {
          throw new Error("Body has already been used. It can only be used once. Use tee() first if you need to read it twice.")
        }
        return stored.bytes.slice().buffer
      },
    }
  }

  async delete(key: string) {
    this.objects.delete(key)
  }

  async head(key: string) {
    const stored = this.objects.get(key)
    return stored ? { size: stored.size, httpMetadata: { contentType: stored.contentType } } : null
  }

  async list(options?: { prefix?: string; limit?: number }) {
    const objects = [...this.objects.entries()]
      .filter(([key]) => !options?.prefix || key.startsWith(options.prefix))
      .slice(0, options?.limit ?? 1000)
      .map(([key, stored]) => ({ key, size: stored.size }))
    return { objects }
  }
}

const bucket = new FakeR2Bucket()

// `getCloudflareBindings()` reads this global before falling back to wrangler;
// setting it here (not inside a test) is what makes the binding branch the one
// under test for every case in this file.
;(globalThis as unknown as Record<symbol, unknown>)[Symbol.for("__cloudflare-context__")] = {
  env: { LEARN_FILES: bucket },
}

/** A `media_assets` row. */
function assetRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ASSET_ID,
    workspace_id: "workspace_demo",
    owner_user_id: TEST_USER_ROW.id,
    bucket: "learn-files",
    object_key: OBJECT_KEY,
    filename: "e2e-upload.png",
    content_type: "image/png",
    size_bytes: PNG.byteLength,
    note_id: null,
    source: "upload",
    metadata: "{}",
    created_at: "2026-01-01 00:00:00",
    ...overrides,
  }
}

async function loadUploadRoute() {
  return import("../../app/api/files/route")
}

async function loadDownloadRoute() {
  return import("../../app/api/files/[id]/download/route")
}

function assetContext(id: string) {
  return { params: Promise.resolve({ id }) }
}

/** The download handler, invoked the way Next invokes it: inside a request scope. */
async function downloadFile(id: string) {
  const { GET } = await loadDownloadRoute()
  return withRequestScope(TEST_SESSION_TOKEN, () => GET(request(`/api/files/${id}/download`), assetContext(id)))
}

test("inline preview is opt-in and restricted to authorized PDF assets", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub); stubSessionLookup(stub); bucket.reset()
    bucket.seed(OBJECT_KEY, PNG)
    const assets = installMediaAssetTable(stub)
    const { GET } = await loadDownloadRoute()
    for (const type of ["application/pdf", "image/png", "text/plain"]) {
      assets.serve(assetRow({ content_type: type }))
      const response = await withRequestScope(TEST_SESSION_TOKEN, () => GET(request(`/api/files/${ASSET_ID}/download?preview=1`), assetContext(ASSET_ID)))
      assert.equal(response.status, 200)
      assert.equal(response.headers.get("content-disposition")?.startsWith("inline;"), type === "application/pdf")
      assert.equal(response.headers.get("cache-control"), "private, no-store")
    }
  } finally { stub.restore() }
})

/** The upload's SQL, answered from the row the insert just wrote. */
function installMediaAssetTable(stub: DatabaseStub) {
  let written: Record<string, unknown> | null = null

  stub.on(/INSERT INTO media_assets/, (_sql, params) => {
    written = {
      id: String(params[0]),
      workspace_id: "workspace_demo",
      owner_user_id: String(params[1]),
      bucket: String(params[2]),
      object_key: String(params[3]),
      filename: String(params[4]),
      content_type: String(params[5]),
      size_bytes: Number(params[6]),
      note_id: params[7] ?? null,
      source: String(params[8]),
      metadata: String(params[9]),
      created_at: "2026-01-01 00:00:00",
    }
    return { rowCount: 1 }
  })

  stub.on(/FROM media_assets/, () => ({ rows: written ? [written] : [] }))

  return {
    row: () => written,
    /** Serve a row that was never uploaded (missing object, oversized asset). */
    serve: (row: Record<string, unknown>) => {
      stub.on(/FROM media_assets/, { rows: [row] })
    },
  }
}

// ---------------------------------------------------------------------------
// The round trip
// ---------------------------------------------------------------------------

test("uploading a file and downloading it again returns the exact bytes", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    bucket.reset()
    const assets = installMediaAssetTable(stub)
    stub.on(/INSERT INTO content_items/, { rowCount: 1 })
    stub.on(/SELECT \* FROM content_items/, { rows: [] })

    const form = new FormData()
    form.set("file", new File([PNG], "e2e-upload.png", { type: "image/png" }))
    form.set("source", "e2e-test")

    const { POST } = await loadUploadRoute()
    const upload = await POST(request("/api/files", { method: "POST", form }))

    assert.equal(upload.status, 201)
    const created = await readJson<{ file: { id: string; object_key: string; size_bytes: number } }>(upload)
    assert.equal(created.file.size_bytes, PNG.byteLength)
    assert.ok(assets.row(), "the upload must write the media_assets row")
    assert.ok(
      bucket.objects.has(created.file.object_key),
      "the upload must have reached the object store under the key it reported",
    )

    const { GET } = await loadDownloadRoute()
    const download = await withRequestScope(TEST_SESSION_TOKEN, () =>
      GET(request(`/api/files/${created.file.id}/download`), assetContext(created.file.id)),
    )

    assert.equal(download.status, 200)
    assert.deepEqual(new Uint8Array(await download.arrayBuffer()), PNG)
    assert.equal(download.headers.get("content-type"), "image/png")
    assert.equal(download.headers.get("content-disposition"), 'attachment; filename="e2e-upload.png"')
    assert.equal(download.headers.get("cache-control"), "private, no-store")
    assert.equal(download.headers.get("x-content-type-options"), "nosniff")
    // The one call that made this route unrunnable locally. Content type comes
    // from the asset row, so nothing of value is lost by never making it.
    assert.equal(bucket.writeHttpMetadataCalls, 0, "the route must not push Node objects across the binding bridge")
  } finally {
    stub.restore()
  }
})

// ---------------------------------------------------------------------------
// Failure modes
// ---------------------------------------------------------------------------

test("an asset whose object is gone answers 404 rather than an empty file", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    bucket.reset()
    installMediaAssetTable(stub).serve(assetRow())

    const response = await downloadFile(ASSET_ID)

    assert.equal(response.status, 404)
    assert.match((await readJson<{ error: string }>(response)).error, /not found in R2/i)
    assert.equal(bucket.gets, 1, "the route must still ask storage before claiming the object is missing")
  } finally {
    stub.restore()
  }
})

test("an asset over the download cap is refused before storage is read", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    bucket.reset()
    installMediaAssetTable(stub).serve(assetRow({ size_bytes: MAX_INLINE_DOWNLOAD_BYTES + 1 }))

    const response = await downloadFile(ASSET_ID)

    assert.equal(response.status, 413)
    assert.match((await readJson<{ error: string }>(response)).error, /too large/i)
    // The whole reason for the cap: a 26 MB object must not be pulled into
    // memory just to be turned into an error response.
    assert.equal(bucket.gets, 0, "an oversized asset must not be fetched at all")
  } finally {
    stub.restore()
  }
})

test("a row that understates the object is caught by the size storage reports", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    bucket.reset()
    // The row says 67 bytes — it passes the pre-check — while the stored object
    // is over the cap. Only a check against storage can refuse this one.
    installMediaAssetTable(stub).serve(assetRow())
    bucket.seed(OBJECT_KEY, PNG, { size: MAX_INLINE_DOWNLOAD_BYTES + 1, contentType: "image/png" })

    const response = await downloadFile(ASSET_ID)

    assert.equal(response.status, 413)
    assert.match((await readJson<{ error: string }>(response)).error, /too large/i)
    assert.equal(bucket.gets, 1)
  } finally {
    stub.restore()
  }
})

test("the download carries the asset's own content type, not the stored one", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubSessionLookup(stub)
    bucket.reset()
    installMediaAssetTable(stub).serve(assetRow({ content_type: "image/png", filename: "chart.png" }))
    // Storage disagrees; the row the user is actually reading from wins, which
    // is the header the browser will honour.
    bucket.seed(OBJECT_KEY, PNG, { contentType: "application/octet-stream" })

    const response = await downloadFile(ASSET_ID)

    assert.equal(response.status, 200)
    assert.equal(response.headers.get("content-type"), "image/png")
    assert.equal(response.headers.get("content-disposition"), 'attachment; filename="chart.png"')
  } finally {
    stub.restore()
  }
})
