/**
 * Local canvas draft parsing.
 *
 * The editor's promise is "a failed save never loses work", and the draft is
 * what makes that true. The storage key is part of that promise: bumping it
 * silently orphans every draft a learner is relying on, so it is pinned here.
 */

import assert from "node:assert/strict"
import test from "node:test"

import { createCanvasDoc, createElement, serializeCanvas } from "../../lib/studio/canvas-engine"
import {
  CANVAS_DRAFT_KEY,
  clearCanvasDraft,
  parseStoredCanvasDraft,
  readCanvasDraft,
  serializeCanvasDraft,
  shouldRestoreCanvasDraft,
  writeCanvasDraft,
  type CanvasDraftRecord,
} from "../../lib/studio/canvas-draft"

const DRAFT: CanvasDraftRecord = {
  id: "canvas_1",
  title: "Poster",
  updatedAt: "2026-01-02T03:04:05.000Z",
  reason: "save-failed",
  canvas: createCanvasDoc({
    id: "canvas_1",
    name: "Poster",
    elements: [createElement({ id: "a", type: "text", x: 10, y: 20, content: "Hello", rotation: 15 })],
  }),
}

test("the draft key is pinned so existing drafts survive", () => {
  assert.equal(CANVAS_DRAFT_KEY, "learn_canvas_draft_v1")
})

test("a draft round-trips through local storage shape", () => {
  const parsed = parseStoredCanvasDraft(serializeCanvasDraft(DRAFT))

  assert.deepEqual(parsed, DRAFT)
  assert.equal(serializeCanvasDraft(parsed as CanvasDraftRecord), serializeCanvasDraft(DRAFT), "serialization is stable")
})

test("parseStoredCanvasDraft rejects anything it cannot trust", () => {
  assert.equal(parseStoredCanvasDraft(null), null)
  assert.equal(parseStoredCanvasDraft(""), null)
  assert.equal(parseStoredCanvasDraft("not json"), null)
  assert.equal(parseStoredCanvasDraft('"a string"'), null)
  assert.equal(parseStoredCanvasDraft("[]"), null)
  assert.equal(parseStoredCanvasDraft('{"title":"no canvas"}'), null, "a draft with no canvas is not a draft")
})

test("parseStoredCanvasDraft coerces a partial record instead of dropping it", () => {
  const parsed = parseStoredCanvasDraft('{"canvas":{"width":"nope","elements":[{"type":"shape"}]},"reason":"nonsense"}')

  assert.ok(parsed)
  assert.equal(parsed.canvas.width, 1080)
  assert.equal(parsed.canvas.elements.length, 1)
  assert.equal(parsed.title, parsed.canvas.name, "a missing title falls back to the canvas name")
  assert.equal(parsed.updatedAt, "")
  assert.equal(parsed.reason, "unsaved")
  assert.equal(parsed.id, undefined)
})

test("the draft's canvas is stored in the documented open format", () => {
  const stored = JSON.parse(serializeCanvasDraft(DRAFT)) as { canvas: unknown }

  assert.equal(serializeCanvas(DRAFT.canvas).trim().startsWith('{\n  "version": 1,'), true)
  assert.deepEqual(stored.canvas, JSON.parse(serializeCanvas(DRAFT.canvas)), "the draft embeds the open format, not a private shape")
})

test("shouldRestoreCanvasDraft prefers a newer draft over the saved row", () => {
  const draft = { ...DRAFT, updatedAt: "2026-01-02T03:04:05.000Z" }

  assert.equal(shouldRestoreCanvasDraft(null, "2026-01-01T00:00:00.000Z"), false)
  assert.equal(shouldRestoreCanvasDraft(draft, null), true, "no server row means the draft is all we have")
  assert.equal(shouldRestoreCanvasDraft(draft, "2026-01-01 00:00:00"), true, "D1's space-separated timestamps are understood")
  assert.equal(shouldRestoreCanvasDraft(draft, "2026-02-01 00:00:00"), false, "a newer server row wins")
  assert.equal(shouldRestoreCanvasDraft({ ...draft, updatedAt: "" }, "2026-01-01 00:00:00"), false)
})

test("the window wrappers are inert outside a browser", () => {
  const originalWindow = globalThis.window
  // @ts-expect-error -- simulating a server render, where window does not exist.
  delete globalThis.window

  try {
    assert.equal(readCanvasDraft(), null)
    assert.doesNotThrow(() => clearCanvasDraft())
    assert.doesNotThrow(() => writeCanvasDraft(DRAFT))
  } finally {
    if (originalWindow) globalThis.window = originalWindow
  }
})
