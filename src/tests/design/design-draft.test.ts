import assert from "node:assert/strict"
import test from "node:test"
import { createCanvasDoc, createElement } from "../../lib/studio/canvas-engine"
import { serializeCanvasDraft } from "../../lib/studio/canvas-draft"
import { createDesignDoc, createDesignPage } from "../../lib/design/document"
import {
  DESIGN_DRAFT_KEY,
  legacyDraftAsDesign,
  parseStoredDesignDrafts,
  serializeDesignDrafts,
  shouldRestoreDesignDraft,
  timestampMs,
  upsertDraft,
  type DesignDraftRecord,
} from "../../lib/design/draft"

function draft(id: string, updatedAt = "2026-09-20T10:00:00.000Z", pages = 1): DesignDraftRecord {
  const design = createDesignDoc({ id, name: `Design ${id}`, pages: Array.from({ length: pages }, (_, index) => createDesignPage({ id: `${id}-p${index}` })) })
  return { id, title: design.name, design, updatedAt, reason: "unsaved" }
}

test("the draft key is pinned so stored drafts survive upgrades", () => {
  assert.equal(DESIGN_DRAFT_KEY, "learn_design_drafts_v2")
})

test("drafts round-trip, and junk storage or junk entries never throw", () => {
  const stored = serializeDesignDrafts([draft("a"), draft("b")])
  const parsed = parseStoredDesignDrafts(stored)
  assert.deepEqual(parsed.map((entry) => entry.id), ["a", "b"])
  assert.equal(parsed[0].design.pages[0].id, "a-p0")
  assert.deepEqual(parseStoredDesignDrafts("{not json"), [])
  assert.deepEqual(parseStoredDesignDrafts(JSON.stringify({ drafts: [null, { id: "x" }, { id: "y", design: {} }] })).map((entry) => entry.id), ["y"])
})

test("the newest draft goes first and old ones fall off", () => {
  let drafts: DesignDraftRecord[] = []
  for (const id of ["a", "b", "c", "d", "e"]) drafts = upsertDraft(drafts, draft(id))
  assert.deepEqual(drafts.map((entry) => entry.id), ["e", "d", "c", "b"])
  drafts = upsertDraft(drafts, draft("c", "2026-09-21T00:00:00.000Z"))
  assert.deepEqual(drafts.map((entry) => entry.id), ["c", "e", "d", "b"])
})

test("server timestamps without a zone are UTC, so the draft decision does not depend on the clock's time zone", () => {
  assert.equal(timestampMs("2026-09-21 06:45:10"), Date.parse("2026-09-21T06:45:10Z"))
  assert.equal(timestampMs("2026-09-21T06:45:10.000Z"), Date.parse("2026-09-21T06:45:10Z"))
  assert.equal(timestampMs(""), null)
  const saved = "2026-09-21 06:45:10"
  assert.equal(shouldRestoreDesignDraft(draft("a", "2026-09-21T06:45:11.000Z"), saved), true)
  assert.equal(shouldRestoreDesignDraft(draft("a", "2026-09-21T06:45:09.000Z"), saved), false)
  assert.equal(shouldRestoreDesignDraft(draft("a", ""), saved), false)
  assert.equal(shouldRestoreDesignDraft(draft("a", ""), null), true, "no server copy: the draft is all there is")
})

test("the first editor's draft is carried over as a one-page design", () => {
  const raw = serializeCanvasDraft({
    id: "canvas_1",
    title: "Poster",
    updatedAt: "2026-01-02T03:04:05.000Z",
    reason: "save-failed",
    canvas: createCanvasDoc({ id: "canvas_1", name: "Poster", width: 1080, height: 720, elements: [createElement({ id: "a", type: "text", content: "Hello" })] }),
  })
  const migrated = legacyDraftAsDesign(raw)
  assert.ok(migrated)
  assert.equal(migrated.id, "canvas_1")
  assert.equal(migrated.design.id, "canvas_1")
  assert.equal(migrated.reason, "save-failed")
  assert.equal(migrated.design.pages.length, 1)
  assert.equal(migrated.design.pages[0].elements[0].content, "Hello")
  assert.equal(legacyDraftAsDesign("garbage"), null)
})
