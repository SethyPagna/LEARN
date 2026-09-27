import assert from "node:assert/strict"
import test from "node:test"
import { pageCanvas, parseDesign, serializeDesign, withPageCanvas } from "../../lib/design/document"
import { previewElementGesture } from "../../lib/design/editor-gesture"
import { commitEditorChange, createEditorState, travelEditorHistory } from "../../lib/design/editor-state"
import { createPublicDemo } from "../../lib/design/public-demo"
import { estimateMeasure } from "../../lib/design/text"

test("public Studio starts with a deterministic, portable design and no external assets", () => {
  const first = createPublicDemo()
  const second = createPublicDemo()
  assert.deepEqual(second, first, "server and hydrating client must generate the same ids and geometry")
  assert.deepEqual(parseDesign(serializeDesign(first)), first)
  assert.ok(first.pages[0].elements.every((element) => element.type === "text" || element.type === "shape"))
  first.pages[0].elements[0].x = 999
  assert.notEqual(second.pages[0].elements[0].x, 999, "each demo must own its document")
})

test("public demo drag and reset use the same undoable design transactions as Studio", () => {
  const original = createPublicDemo()
  let state = createEditorState(original)
  const canvas = pageCanvas(original, 0)
  const title = canvas.elements.find((element) => element.id === "demo-heading")!
  const moved = previewElementGesture({ kind: "move", canvas, ids: [title.id], start: { x: title.x, y: title.y } }, { point: { x: title.x + 40, y: title.y + 20 }, shift: false, snap: false, grid: false, zoom: 0.4, measure: estimateMeasure })
  state = commitEditorChange(state, (doc) => withPageCanvas(doc, 0, moved.canvas))
  assert.equal(state.history.present.pages[0].elements.find((element) => element.id === title.id)?.x, title.x + 40)
  const edited = state.history.present
  state = commitEditorChange(state, () => createPublicDemo())
  assert.deepEqual(state.history.present, original)
  assert.deepEqual(travelEditorHistory(state, "undo").history.present, edited, "reset must not destroy the previous edits")
})
