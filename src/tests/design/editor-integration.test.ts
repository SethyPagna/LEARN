import assert from "node:assert/strict"
import test from "node:test"
import { createCanvasDoc, createElement, groupElements } from "../../lib/studio/canvas-engine"
import { createDesignDoc, createDesignPage, addPage, movePage, removePage, withPageCanvas, pageCanvas } from "../../lib/design/document"
import { clusteredSelection, commitEditorChange, createEditorState, travelEditorHistory } from "../../lib/design/editor-state"
import { previewElementGesture } from "../../lib/design/editor-gesture"
import { insertDesignElements } from "../../lib/design/editor-insert"
import { estimateMeasure } from "../../lib/design/text"
import { blockToElement } from "../../lib/studio/block-drop"

const box = (id: string, x = 100) => createElement({ id, type: "shape", x, y: 100, width: 100, height: 100 })
const doc = () => createDesignDoc({ pages: [createDesignPage({ id: "page-a", elements: [box("a"), box("b", 300)] }), createDesignPage({ id: "page-b" })] })
const input = { shift: false, snap: false, grid: false, zoom: 1, measure: estimateMeasure }

test("sequential commands use the latest design and undo coalesced typing together", () => {
  let state = createEditorState(doc())
  const initial = state.history.present
  state = commitEditorChange(state, (doc) => ({ ...doc, name: "A" }), { coalesce: "name" }, 100)
  state = commitEditorChange(state, (doc) => ({ ...doc, name: doc.name + "B" }), { coalesce: "name" }, 200)
  assert.equal(state.history.present.name, "AB")
  state = travelEditorHistory(state, "undo")
  assert.deepEqual(state.history.present, initial)
  state = travelEditorHistory(state, "redo")
  assert.equal(state.history.present.name, "AB")
  state = commitEditorChange(state, (doc) => ({ ...doc, name: "C" }), { coalesce: "name" }, 250)
  assert.equal(travelEditorHistory(state, "undo").history.present.name, "AB", "redo breaks the previous typing group")
})

test("page insertion, reordering and removal retain a valid selected page through history", () => {
  let state = createEditorState(doc())
  state = commitEditorChange(state, (doc) => { const result = addPage(doc, 1); return { doc: result.doc, page: result.index } })
  assert.equal(state.page, 2)
  const id = state.history.present.pages[2].id
  state = commitEditorChange(state, (doc) => ({ doc: movePage(doc, 2, 0), page: 0 }))
  assert.equal(state.history.present.pages[state.page].id, id)
  state = commitEditorChange(state, (doc) => { const result = removePage(doc, 0); return { doc: result.doc, page: result.index } })
  state = travelEditorHistory(state, "undo")
  assert.equal(state.history.present.pages[state.page].id, id)
  state = commitEditorChange(state, (doc) => doc, { page: 999, select: ["missing"] })
  assert.equal(state.page, state.history.present.pages.length - 1)
  assert.deepEqual(state.selected, [])
})

test("undoing a title edit keeps the current page instead of jumping to the cover", () => {
  let state = { ...createEditorState(doc()), page: 1 }
  state = commitEditorChange(state, (doc) => ({ ...doc, name: "Renamed" }))
  assert.equal(travelEditorHistory(state, "undo").page, 1)
})

test("a group drag previews from its start, moves only editable members, and commits once", () => {
  const initial = doc()
  const grouped = groupElements(pageCanvas(initial, 0), ["a", "b"])
  grouped.elements.push({ ...box("locked", 500), locked: true, groupId: grouped.elements[0].groupId })
  let state = createEditorState(withPageCanvas(initial, 0, grouped))
  const ids = clusteredSelection(state.history.present, 0, ["a"])
  assert.deepEqual(ids, ["a", "b", "locked"])
  const gesture = { kind: "move" as const, canvas: grouped, ids, start: { x: 100, y: 100 } }
  const first = previewElementGesture(gesture, { ...input, point: { x: 110, y: 110 } })
  const final = previewElementGesture(gesture, { ...input, point: { x: 125, y: 130 } })
  assert.equal(first.canvas.elements[0].x, 110)
  assert.equal(final.canvas.elements[0].x, 125, "deltas do not accumulate between preview frames")
  assert.equal(final.canvas.elements[1].x, 325)
  assert.equal(final.canvas.elements[2].x, 500)
  assert.equal(state.history.canUndo, false, "previews never enter committed history")
  state = commitEditorChange(state, (doc) => withPageCanvas(doc, 0, final.canvas))
  assert.deepEqual(travelEditorHistory(state, "undo").history.present.pages[0].elements, grouped.elements)
  assert.equal(travelEditorHistory(state, "undo").history.canUndo, false)
})

test("AI block drop targets the requested page, selects it, and is undone in one step", () => {
  let state = createEditorState(doc())
  const element = blockToElement({ type: "paragraph", text: "Imported lesson" }, { x: 300, y: 200 }, 0)
  assert.ok(element)
  state = commitEditorChange(state, (doc) => insertDesignElements(doc, [element], { page: 1, at: { x: 600, y: 400 }, snap: false }))
  assert.equal(state.page, 1)
  assert.equal(state.selected.length, 1)
  const placed = state.history.present.pages[1].elements[0]
  assert.equal(placed.x + placed.width / 2, 600)
  assert.equal(placed.y + placed.height / 2, 400)
  assert.equal(state.history.present.pages[0].elements.length, 2)
  state = travelEditorHistory(state, "undo")
  assert.equal(state.page, 1)
  assert.equal(state.history.present.pages[1].elements.length, 0)
})

test("dropping a picture fills the target frame without adding a duplicate layer", () => {
  const frame = createElement({ id: "frame", type: "image", x: 0, y: 0, width: 200, height: 200, style: { mask: "circle", focusX: 0.1 } })
  const initial = createDesignDoc({ pages: [createDesignPage({ elements: [frame] })] })
  const picture = createElement({ type: "image", content: "https://example.com/photo.png" })
  const result = insertDesignElements(initial, [picture], { page: 0, at: { x: 50, y: 50 } })
  assert.equal(result.doc.pages[0].elements.length, 1)
  assert.equal(result.doc.pages[0].elements[0].content, picture.content)
  assert.equal(result.doc.pages[0].elements[0].style.mask, "circle")
  assert.equal(result.doc.pages[0].elements[0].style.focusX, 0.5)
  assert.deepEqual(result.select, ["frame"])
})

test("resize and rotation gestures preserve source snapshots and locked elements", () => {
  const canvas = createCanvasDoc({ elements: [box("a"), { ...box("locked", 300), locked: true }] })
  const resized = previewElementGesture({ kind: "resize", canvas, ids: ["a", "locked"], handle: "se", start: { x: 200, y: 200 } }, { ...input, point: { x: 250, y: 250 } })
  assert.equal(resized.canvas.elements[0].width, 150)
  assert.equal(resized.canvas.elements[1].width, 100)
  const rotated = previewElementGesture({ kind: "rotate", canvas, ids: ["a"], start: { x: 150, y: 100 } }, { ...input, shift: true, point: { x: 200, y: 150 } })
  assert.equal(rotated.canvas.elements[0].rotation, 90)
  assert.equal(canvas.elements[0].rotation, 0)
})
