/**
 * The canvas engine contract.
 *
 * `canvas-editor.tsx` is a thin shell over these functions, so this file is
 * where the free-form editing behaviour is actually pinned: the rotation-aware
 * resize anchor, the snap corrections, dense z-order, group semantics, the
 * undo/redo invariants, and the open serialization format.
 *
 * Geometry assertions use `near` rather than `assert.equal` because rotated
 * resize runs through `cos`/`sin`; the epsilon is far below one device pixel.
 */

import assert from "node:assert/strict"
import test from "node:test"

import {
  addElement,
  alignElements,
  anchorPointFor,
  applySnapToMove,
  boundsOf,
  canvasDeepEqual,
  computeSnapGuides,
  containsPoint,
  createCanvasDoc,
  createElement,
  createHistory,
  distributeElements,
  duplicateElement,
  elementBounds,
  elementCorners,
  elementsInRect,
  fitText,
  groupElements,
  handlePoint,
  hitTest,
  moveElement,
  moveElementToIndex,
  moveElements,
  normalizeAngle,
  normalizeCanvasDoc,
  parseCanvas,
  removeElements,
  reorderElement,
  resizeElement,
  resizeElements,
  rotateElement,
  selectionCluster,
  serializeCanvas,
  ungroupElements,
  updateElement,
  type CanvasDoc,
  type CanvasElement,
  type CanvasElementInput,
  type ResizeHandle,
} from "../../lib/studio/canvas-engine"

const ALL_HANDLES: ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"]

function makeDoc(elements: CanvasElementInput[] = [], overrides: Partial<CanvasDoc> = {}): CanvasDoc {
  return createCanvasDoc({
    id: "doc-test",
    name: "Test canvas",
    width: 1000,
    height: 600,
    background: "#ffffff",
    elements: elements.map((input) => createElement(input)),
    ...overrides,
  })
}

function elementOf(doc: CanvasDoc, id: string): CanvasElement {
  const element = doc.elements.find((candidate) => candidate.id === id)
  assert.ok(element, `expected element ${id}`)
  return element
}

function near(actual: number, expected: number, epsilon = 1e-6, message = "") {
  assert.ok(Math.abs(actual - expected) <= epsilon, message || `expected ${actual} to be within ${epsilon} of ${expected}`)
}

function nearPoint(actual: { x: number; y: number }, expected: { x: number; y: number }, epsilon = 1e-6, message = "") {
  near(actual.x, expected.x, epsilon, `${message} (x)`)
  near(actual.y, expected.y, epsilon, `${message} (y)`)
}

// ---------------------------------------------------------------------------
// Construction and defensive parsing
// ---------------------------------------------------------------------------

test("createCanvasDoc fills every field with usable defaults", () => {
  const doc = createCanvasDoc()

  assert.equal(doc.version, 1)
  assert.equal(doc.width, 1080)
  assert.equal(doc.height, 720)
  assert.equal(doc.background, "#ffffff")
  assert.deepEqual(doc.elements, [])
})

test("createElement coerces partial input and generates an id when omitted", () => {
  const element = createElement({ type: "text" })

  assert.equal(element.type, "text")
  assert.ok(element.id.length > 0)
  assert.equal(element.rotation, 0)
  assert.equal(element.z, 0)
  assert.equal(element.groupId, null)
  assert.equal(element.locked, false)
  assert.equal(element.hidden, false)
  assert.ok(element.width > 0 && element.height > 0)
  assert.deepEqual(element.style, {})
})

test("normalizeCanvasDoc never throws on junk and coerces partial input", () => {
  for (const junk of [null, undefined, 42, "canvas", [], true, { elements: "nope" }, { elements: [null, 3] }]) {
    const doc = normalizeCanvasDoc(junk)
    assert.equal(doc.version, 1)
    assert.ok(Array.isArray(doc.elements))
    assert.ok(doc.width >= 1 && doc.height >= 1)
  }

  const partial = normalizeCanvasDoc({
    width: "wide",
    elements: [{ type: "text", content: "hello" }, { type: "diagram", x: "12", y: Number.NaN }],
  })

  assert.equal(partial.width, 1080, "a non-numeric width falls back")
  assert.equal(partial.elements.length, 2, "an unknown type is coerced rather than dropped")
  assert.equal(partial.elements[0].id, "element-0", "a missing id gets a deterministic one")
  assert.equal(partial.elements[0].content, "hello")
  assert.equal(partial.elements[1].type, "shape")
  assert.equal(partial.elements[1].x, 12, "numeric strings are accepted")
  assert.equal(partial.elements[1].y, 0)
})

test("normalizeCanvasDoc rebuilds z into a dense ascending sequence", () => {
  const doc = normalizeCanvasDoc({
    elements: [
      { id: "top", z: 9 },
      { id: "low", z: -3 },
      { id: "mid", z: 4 },
      { id: "tie", z: 4 },
    ],
  })

  assert.deepEqual(doc.elements.map((element) => [element.id, element.z]), [
    ["low", 0],
    ["mid", 1],
    ["tie", 2],
    ["top", 3],
  ])
})

test("normalizeAngle wraps into [0, 360)", () => {
  assert.equal(normalizeAngle(0), 0)
  assert.equal(normalizeAngle(-90), 270)
  assert.equal(normalizeAngle(370), 10)
  assert.equal(normalizeAngle(Number.NaN), 0)
})

// ---------------------------------------------------------------------------
// Move
// ---------------------------------------------------------------------------

test("moveElement translates by a delta and ignores locked or unknown ids", () => {
  const doc = makeDoc([
    { id: "a", type: "text", x: 10, y: 20, width: 100, height: 60 },
    { id: "frozen", type: "shape", x: 0, y: 0, width: 10, height: 10, locked: true },
  ])

  const moved = moveElement(doc, "a", 15, -5)
  assert.equal(elementOf(moved, "a").x, 25)
  assert.equal(elementOf(moved, "a").y, 15)
  assert.equal(elementOf(moved, "a").z, elementOf(doc, "a").z)

  assert.deepEqual(moveElement(moved, "frozen", 50, 50), moved, "a locked element does not move")
  assert.deepEqual(moveElement(moved, "missing", 50, 50), moved, "an unknown id is a no-op")

  const grid = moveElement(moved, "a", 5, 5, { grid: 8 })
  assert.equal(elementOf(grid, "a").x, 32, "30 snapped to the nearest 8px line")
  assert.equal(elementOf(grid, "a").y, 24)
})

// ---------------------------------------------------------------------------
// Resize, including rotation-aware anchors
// ---------------------------------------------------------------------------

test("resizeElement moves the right edge for each of the eight handles", () => {
  const expected: Record<ResizeHandle, { x: number; y: number; width: number; height: number }> = {
    nw: { x: 110, y: 110, width: 90, height: 50 },
    n: { x: 100, y: 110, width: 100, height: 50 },
    ne: { x: 100, y: 110, width: 110, height: 50 },
    e: { x: 100, y: 100, width: 110, height: 60 },
    se: { x: 100, y: 100, width: 110, height: 70 },
    s: { x: 100, y: 100, width: 100, height: 70 },
    sw: { x: 110, y: 100, width: 90, height: 70 },
    w: { x: 110, y: 100, width: 90, height: 60 },
  }

  for (const handle of ALL_HANDLES) {
    const doc = makeDoc([{ id: "a", type: "shape", x: 100, y: 100, width: 100, height: 60 }])
    const resized = elementOf(resizeElement(doc, "a", handle, 10, 10), "a")

    near(resized.x, expected[handle].x, 1e-6, `${handle} x`)
    near(resized.y, expected[handle].y, 1e-6, `${handle} y`)
    near(resized.width, expected[handle].width, 1e-6, `${handle} width`)
    near(resized.height, expected[handle].height, 1e-6, `${handle} height`)
  }
})

test("resizeElement keeps the opposite edge fixed while the element is rotated", () => {
  for (const rotation of [0, 15, 30, 45, 90, 137, 270]) {
    for (const handle of ALL_HANDLES) {
      const doc = makeDoc([{ id: "a", type: "shape", x: 240, y: 180, width: 120, height: 70, rotation }])
      const before = elementOf(doc, "a")
      const resized = elementOf(resizeElement(doc, "a", handle, 13, -7), "a")

      // The anchor is the opposite handle's point: it must not move at all in
      // canvas space, whatever the rotation is.
      nearPoint(
        anchorPointFor(resized, handle),
        anchorPointFor(before, handle),
        1e-9,
        `rotation ${rotation} handle ${handle}: anchor edge`,
      )
      assert.equal(resized.rotation, rotation, `rotation ${rotation} handle ${handle}: rotation is preserved`)
      assert.ok(resized.width > 0 && resized.height > 0, `rotation ${rotation} handle ${handle}: stays positive`)
    }
  }
})

test("resizeElement clamps to minSize and refuses locked elements", () => {
  const doc = makeDoc([{ id: "a", type: "shape", x: 100, y: 100, width: 100, height: 60 }])
  const collapsed = elementOf(resizeElement(doc, "a", "se", -500, -500, { minSize: 12 }), "a")

  assert.equal(collapsed.width, 12)
  assert.equal(collapsed.height, 12)

  const lockedDoc = makeDoc([{ id: "a", type: "shape", x: 100, y: 100, width: 100, height: 60, locked: true }])
  assert.deepEqual(resizeElement(lockedDoc, "a", "se", 50, 50), lockedDoc)
})

test("handlePoint and anchorPointFor agree with the box corners", () => {
  const element = elementOf(makeDoc([{ id: "a", type: "shape", x: 10, y: 20, width: 100, height: 60 }]), "a")

  nearPoint(handlePoint(element, "se"), { x: 110, y: 80 })
  nearPoint(anchorPointFor(element, "se"), { x: 10, y: 20 })
  nearPoint(handlePoint(element, "w"), { x: 10, y: 50 })
  nearPoint(anchorPointFor(element, "w"), { x: 110, y: 50 })

  const rotated = elementOf(makeDoc([{ id: "b", type: "shape", x: 0, y: 0, width: 100, height: 100, rotation: 90 }]), "b")
  nearPoint(handlePoint(rotated, "e"), { x: 50, y: 100 }, 1e-9)
})

test("elementCorners and containsPoint respect rotation", () => {
  const element = elementOf(makeDoc([{ id: "a", type: "shape", x: 0, y: 0, width: 100, height: 100, rotation: 45 }]), "a")
  const corners = elementCorners(element)

  nearPoint(corners[0], { x: 50, y: 50 - Math.SQRT1_2 * 100 })
  assert.equal(containsPoint(element, 50, 50), true, "the centre is always inside")
  assert.equal(containsPoint(element, 2, 2), false, "a corner of the unrotated box falls outside the rotated shape")

  const upright = elementOf(makeDoc([{ id: "b", type: "shape", x: 0, y: 0, width: 100, height: 100 }]), "b")
  assert.equal(containsPoint(upright, 2, 2), true)
})

// ---------------------------------------------------------------------------
// Rotate
// ---------------------------------------------------------------------------

test("rotateElement adds a delta and normalizes the result", () => {
  const doc = makeDoc([{ id: "a", type: "shape", rotation: 350 }])

  assert.equal(elementOf(rotateElement(doc, "a", 20), "a").rotation, 10)
  assert.equal(elementOf(rotateElement(doc, "a", -90), "a").rotation, 260)
  assert.equal(elementOf(rotateElement(doc, "a", 0), "a").rotation, 350)
})

test("rotateElement snaps to 15 degree steps when asked", () => {
  const doc = makeDoc([{ id: "a", type: "shape", rotation: 0 }])

  assert.equal(elementOf(rotateElement(doc, "a", 20, { snap: true }), "a").rotation, 15)
  assert.equal(elementOf(rotateElement(doc, "a", 7, { snap: true }), "a").rotation, 0)
  assert.equal(elementOf(rotateElement(doc, "a", 8, { snap: true }), "a").rotation, 15)
  assert.equal(elementOf(rotateElement(doc, "a", 30, { snap: true, snapDegrees: 45 }), "a").rotation, 45)
  assert.equal(elementOf(rotateElement(doc, "a", 20), "a").rotation, 20, "no snap by default")
})

// ---------------------------------------------------------------------------
// Snapping
// ---------------------------------------------------------------------------

test("computeSnapGuides snaps to canvas edges and centres", () => {
  const doc = makeDoc([
    { id: "a", type: "shape", x: 0, y: 0, width: 100, height: 60 },
    { id: "b", type: "shape", x: 496, y: 297, width: 100, height: 60 },
  ])
  const snap = computeSnapGuides(doc, "b")

  assert.deepEqual(snap.guides, [
    { axis: "x", kind: "canvas", position: 500 },
    { axis: "y", kind: "canvas", position: 300 },
  ])
  near(snap.dx, 4)
  near(snap.dy, 3)
})

test("computeSnapGuides snaps to another element's edge and reports its id", () => {
  const doc = makeDoc([
    { id: "a", type: "shape", x: 200, y: 100, width: 100, height: 60 },
    { id: "b", type: "shape", x: 203, y: 400, width: 80, height: 40 },
  ])
  const snap = computeSnapGuides(doc, "b")

  assert.deepEqual(snap.guides, [{ axis: "x", kind: "element", position: 200, targetId: "a" }])
  near(snap.dx, -3)
  near(snap.dy, 0)
})

test("computeSnapGuides falls back to the grid when nothing is near", () => {
  const doc = makeDoc([{ id: "a", type: "shape", x: 13, y: 13, width: 100, height: 60 }])
  const snap = computeSnapGuides(doc, "a")

  assert.deepEqual(snap.guides, [
    { axis: "x", kind: "grid", position: 16 },
    { axis: "y", kind: "grid", position: 16 },
  ])
  near(snap.dx, 3)
  near(snap.dy, 3)
})

test("snapping can be disabled, on either the master switch or the grid", () => {
  const doc = makeDoc([
    { id: "a", type: "shape", x: 0, y: 0, width: 100, height: 60 },
    { id: "b", type: "shape", x: 496, y: 297, width: 100, height: 60 },
  ])

  assert.deepEqual(computeSnapGuides(doc, "b", { snap: false }), { guides: [], dx: 0, dy: 0 })
  const moved = moveElement(doc, "b", 5, 5)
  const disabled = computeSnapGuides(moved, "b", { snap: false })
  assert.deepEqual([disabled.dx, disabled.dy], [0, 0], "a disabled snap leaves the proposed position alone")
  assert.notDeepEqual(moved, moveElement(moved, "b", computeSnapGuides(moved, "b").dx, computeSnapGuides(moved, "b").dy), "enabling the snap would have moved it")

  const offGrid = makeDoc([{ id: "a", type: "shape", x: 13, y: 13, width: 100, height: 60 }])
  assert.deepEqual(computeSnapGuides(offGrid, "a", { gridSnap: false }), { guides: [], dx: 0, dy: 0 })
  assert.deepEqual(computeSnapGuides(offGrid, "a", { grid: 0 }), { guides: [], dx: 0, dy: 0 })
})

test("computeSnapGuides honours a custom threshold and the ignore list", () => {
  const doc = makeDoc([
    { id: "a", type: "shape", x: 200, y: 100, width: 100, height: 60 },
    { id: "b", type: "shape", x: 203, y: 400, width: 80, height: 40 },
  ])

  assert.deepEqual(
    computeSnapGuides(doc, "b", { threshold: 2, gridSnap: false }),
    { guides: [], dx: 0, dy: 0 },
    "a 3px offset is outside a 2px threshold",
  )
  assert.deepEqual(computeSnapGuides(doc, "b", { threshold: 12, gridSnap: false }).guides, [
    { axis: "x", kind: "element", position: 200, targetId: "a" },
  ])
  assert.deepEqual(
    computeSnapGuides(doc, "b", { threshold: 12, gridSnap: false, ignoreIds: ["b", "a"] }).guides,
    [],
    "ignoring the only neighbour leaves nothing to snap to",
  )
})

test("applySnapToMove returns the moved document plus the guides it hit", () => {
  const doc = makeDoc([{ id: "a", type: "shape", x: 10, y: 10, width: 100, height: 60 }])

  const grid = applySnapToMove(doc, "a", 400, 200)
  const moved = moveElement(doc, "a", 400, 200)
  const snap = computeSnapGuides(moved, "a")

  assert.deepEqual(grid.doc, moveElement(moved, "a", snap.dx, snap.dy), "snapping is move-then-correct")
  assert.deepEqual(grid.guides, snap.guides)
  near(elementOf(grid.doc, "a").x, 408, 1e-6, "410 falls back to the nearest 8px line")
  near(elementOf(grid.doc, "a").y, 208)

  const aligned = applySnapToMove(doc, "a", 390, 190)
  assert.deepEqual(aligned.guides, [{ axis: "x", kind: "canvas", position: 500 }])
  near(elementOf(aligned.doc, "a").x, 400)
  near(elementOf(aligned.doc, "a").y, 200)
})

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

test("reorderElement keeps z dense with no ties or gaps", () => {
  const doc = makeDoc([
    { id: "a", type: "shape" },
    { id: "b", type: "shape" },
    { id: "c", type: "shape" },
    { id: "d", type: "shape" },
  ])

  const check = (next: CanvasDoc, expected: string[]) => {
    assert.deepEqual(next.elements.map((element) => element.id), expected)
    assert.deepEqual(
      next.elements.map((element) => element.z),
      next.elements.map((_element, index) => index),
      "z is exactly the array index",
    )
    assert.equal(new Set(next.elements.map((element) => element.z)).size, next.elements.length, "no ties")
  }

  check(reorderElement(doc, "b", "forward"), ["a", "c", "b", "d"])
  check(reorderElement(doc, "b", "backward"), ["b", "a", "c", "d"])
  check(reorderElement(doc, "a", "front"), ["b", "c", "d", "a"])
  check(reorderElement(doc, "d", "back"), ["d", "a", "b", "c"])
  assert.deepEqual(reorderElement(doc, "missing", "front"), doc)
})

test("reorderElement is a no-op at the ends of the stack", () => {
  const doc = makeDoc([{ id: "a", type: "shape" }, { id: "b", type: "shape" }])

  assert.deepEqual(reorderElement(doc, "a", "back"), doc)
  assert.deepEqual(reorderElement(doc, "a", "backward"), doc)
  assert.deepEqual(reorderElement(doc, "b", "front"), doc)
  assert.deepEqual(reorderElement(doc, "b", "forward"), doc)
})

test("moveElementToIndex places an element at an explicit stack position", () => {
  const doc = makeDoc([
    { id: "a", type: "shape" },
    { id: "b", type: "shape" },
    { id: "c", type: "shape" },
  ])

  assert.deepEqual(moveElementToIndex(doc, "a", 2).elements.map((element) => element.id), ["b", "c", "a"])
  assert.deepEqual(moveElementToIndex(doc, "c", 0).elements.map((element) => element.id), ["c", "a", "b"])
  assert.deepEqual(moveElementToIndex(doc, "c", 99).elements.map((element) => element.id), ["a", "b", "c"])
  assert.deepEqual(moveElementToIndex(doc, "missing", 0), doc)
})

test("addElement, updateElement, removeElements and duplicateElement keep the stack dense", () => {
  const doc = makeDoc([{ id: "a", type: "shape", x: 0, y: 0, width: 10, height: 10 }])
  const added = addElement(doc, createElement({ id: "b", type: "text", content: "hi" }))

  assert.deepEqual(added.elements.map((element) => [element.id, element.z]), [["a", 0], ["b", 1]])

  const renamed = updateElement(added, "a", { content: "label" })
  assert.equal(elementOf(renamed, "a").content, "label")
  assert.equal(elementOf(renamed, "a").id, "a", "the id cannot be patched away")
  assert.deepEqual(updateElement(renamed, "missing", { content: "x" }), renamed)

  const removed = removeElements(renamed, ["a", "missing"])
  assert.deepEqual(removed.elements.map((element) => [element.id, element.z]), [["b", 0]])

  const duplicated = duplicateElement(renamed, "a")
  assert.notEqual(duplicated.id, "a")
  assert.ok(duplicated.id && elementOf(duplicated.doc, duplicated.id))
  assert.equal(elementOf(duplicated.doc, duplicated.id as string).z, 2, "the copy lands on top")
  assert.equal(duplicated.doc.elements.length, 3)
  assert.equal(duplicateElement(renamed, "missing").id, null)
})

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

test("groupElements shares one id and leaves absolute positions untouched", () => {
  const doc = makeDoc([
    { id: "a", type: "shape", x: 100, y: 100, width: 100, height: 60, rotation: 30 },
    { id: "b", type: "shape", x: 300, y: 220, width: 60, height: 60 },
    { id: "c", type: "shape", x: 500, y: 300, width: 20, height: 20 },
  ])
  const grouped = groupElements(doc, ["a", "b"])
  const groupId = elementOf(grouped, "a").groupId

  assert.ok(groupId)
  assert.equal(elementOf(grouped, "b").groupId, groupId)
  assert.equal(elementOf(grouped, "c").groupId, null)
  for (const id of ["a", "b", "c"]) {
    const before = elementOf(doc, id)
    const after = elementOf(grouped, id)
    assert.deepEqual(
      { x: after.x, y: after.y, width: after.width, height: after.height, rotation: after.rotation },
      { x: before.x, y: before.y, width: before.width, height: before.height, rotation: before.rotation },
      `${id} keeps its own frame`,
    )
  }

  assert.deepEqual(groupElements(doc, ["a"]), doc, "one element is not a group")
  assert.deepEqual(groupElements(doc, ["a", "missing"]), doc)
})

test("moving a grouped selection translates every member without shear", () => {
  const doc = makeDoc([
    { id: "a", type: "shape", x: 100, y: 100, width: 100, height: 60, rotation: 30 },
    { id: "b", type: "shape", x: 300, y: 220, width: 60, height: 60, rotation: 15 },
  ])
  const grouped = groupElements(doc, ["a", "b"])
  const cluster = selectionCluster(grouped, "a")

  assert.deepEqual(cluster.sort(), ["a", "b"])
  const moved = moveElements(grouped, cluster, 25, -10)

  for (const id of ["a", "b"]) {
    const before = elementOf(grouped, id)
    const after = elementOf(moved, id)
    near(after.x, before.x + 25)
    near(after.y, before.y - 10)
    assert.equal(after.width, before.width, `${id} width is untouched by a move`)
    assert.equal(after.height, before.height, `${id} height is untouched by a move`)
    assert.equal(after.rotation, before.rotation, `${id} rotation is untouched by a move`)
  }

  assert.deepEqual(selectionCluster(grouped, "c"), [])
  assert.deepEqual(selectionCluster(makeDoc([{ id: "solo", type: "shape" }]), "solo"), ["solo"])
})

/** A scaled rectangle stays a rectangle: its edges keep their lengths and stay perpendicular. */
function assertNoShear(element: CanvasElement, context: string) {
  const [c0, c1, , c3] = elementCorners(element)
  const edgeA = { x: c1.x - c0.x, y: c1.y - c0.y }
  const edgeB = { x: c3.x - c0.x, y: c3.y - c0.y }

  near(edgeA.x * edgeB.x + edgeA.y * edgeB.y, 0, 1e-6, `${context}: edges are perpendicular (no shear)`)
  near(Math.hypot(edgeA.x, edgeA.y), element.width, 1e-6, `${context}: edge A keeps its length`)
  near(Math.hypot(edgeB.x, edgeB.y), element.height, 1e-6, `${context}: edge B keeps its length`)
}

test("resizing a grouped selection scales every member about a fixed anchor", () => {
  const doc = makeDoc([
    { id: "a", type: "shape", x: 100, y: 100, width: 100, height: 60 },
    { id: "b", type: "shape", x: 300, y: 200, width: 60, height: 60 },
  ])
  const grouped = groupElements(doc, ["a", "b"])
  const before = boundsOf(grouped.elements)
  assert.ok(before)

  const resized = resizeElements(grouped, ["a", "b"], "e", 100, 0)
  const after = boundsOf(resized.elements)
  assert.ok(after)

  near(after.x, before.x, 1e-9, "the west edge is the anchor and must not move")
  near(after.width, before.width + 100, 1e-6, "the selection grows by the drag distance")
  const scaleX = after.width / before.width

  for (const id of ["a", "b"]) {
    const original = elementOf(grouped, id)
    const scaled = elementOf(resized, id)
    near(scaled.width, original.width * scaleX, 1e-6, `${id} width scales`)
    near(scaled.height, original.height, 1e-6, `${id} height is untouched by an east handle`)
    assert.equal(scaled.rotation, original.rotation, `${id} rotation survives the resize`)
    assertNoShear(scaled, id)
  }
})

test("resizing a group with a rotated member never shears it", () => {
  const doc = makeDoc([
    { id: "a", type: "shape", x: 100, y: 100, width: 100, height: 60, rotation: 30 },
    { id: "b", type: "shape", x: 300, y: 200, width: 60, height: 60 },
  ])
  const grouped = groupElements(doc, ["a", "b"])
  const before = boundsOf(grouped.elements)
  assert.ok(before)
  const resized = resizeElements(grouped, ["a", "b"], "e", 100, 0)
  const scaleX = (before.width + 100) / before.width

  for (const id of ["a", "b"]) {
    const original = elementOf(grouped, id)
    const scaled = elementOf(resized, id)
    const originalCenter = original.x + original.width / 2

    assert.equal(scaled.rotation, original.rotation, `${id} keeps its own frame`)
    near(scaled.width, original.width * scaleX, 1e-6, `${id} scales by the same factor`)
    near(scaled.height, original.height, 1e-6, `${id} does not scale on the untouched axis`)
    near(scaled.x + scaled.width / 2, before.x + (originalCenter - before.x) * scaleX, 1e-6, `${id} centre scales about the anchor`)
    assertNoShear(scaled, id)
  }
})

test("resizing a single-element selection uses the rotation-aware path", () => {
  const doc = makeDoc([{ id: "a", type: "shape", x: 240, y: 180, width: 120, height: 70, rotation: 30 }])
  const viaSelection = resizeElements(doc, ["a"], "se", 11, 9)

  assert.deepEqual(viaSelection, resizeElement(doc, "a", "se", 11, 9), "one member delegates to the exact path")
  nearPoint(
    anchorPointFor(elementOf(viaSelection, "a"), "se"),
    anchorPointFor(elementOf(doc, "a"), "se"),
    1e-9,
    "the opposite corner is still the fixed anchor",
  )
})

test("ungroupElements accepts either a group id or a member id", () => {
  const doc = groupElements(
    makeDoc([
      { id: "a", type: "shape", x: 10, y: 10 },
      { id: "b", type: "shape", x: 200, y: 10 },
      { id: "c", type: "shape", x: 400, y: 10 },
    ]),
    ["a", "b"],
  )
  const groupId = elementOf(doc, "a").groupId as string

  for (const next of [ungroupElements(doc, groupId), ungroupElements(doc, "b")]) {
    assert.equal(elementOf(next, "a").groupId, null)
    assert.equal(elementOf(next, "b").groupId, null)
    assert.equal(Math.abs(elementOf(next, "a").x - 10) < 1e-9, true, "positions are untouched by ungrouping")
  }

  assert.deepEqual(ungroupElements(doc, "c"), doc, "a solo element is not a group")
  assert.deepEqual(ungroupElements(doc, "missing"), doc)
})

// ---------------------------------------------------------------------------
// Align / distribute
// ---------------------------------------------------------------------------

test("alignElements aligns on each of the six modes", () => {
  const build = () =>
    makeDoc([
      { id: "a", type: "shape", x: 100, y: 50, width: 100, height: 40 },
      { id: "b", type: "shape", x: 300, y: 200, width: 60, height: 80 },
      { id: "c", type: "shape", x: 500, y: 400, width: 40, height: 20 },
    ])

  const left = alignElements(build(), ["a", "b", "c"], "left")
  assert.deepEqual(left.elements.map((element) => element.x), [100, 100, 100])

  const right = alignElements(build(), ["a", "b", "c"], "right")
  assert.deepEqual(right.elements.map((element) => element.x + element.width), [540, 540, 540])

  const center = alignElements(build(), ["a", "b", "c"], "center")
  const centers = center.elements.map((element) => element.x + element.width / 2)
  near(centers[0], centers[1])
  near(centers[1], centers[2])

  const top = alignElements(build(), ["a", "b", "c"], "top")
  assert.deepEqual(top.elements.map((element) => element.y), [50, 50, 50])

  const bottom = alignElements(build(), ["a", "b", "c"], "bottom")
  assert.deepEqual(bottom.elements.map((element) => element.y + element.height), [420, 420, 420])

  const middle = alignElements(build(), ["a", "b", "c"], "middle")
  const middles = middle.elements.map((element) => element.y + element.height / 2)
  near(middles[0], middles[1])
  near(middles[1], middles[2])
})

test("alignElements aligns rotated elements by their bounding boxes", () => {
  const doc = makeDoc([
    { id: "a", type: "shape", x: 100, y: 100, width: 100, height: 60, rotation: 45 },
    { id: "b", type: "shape", x: 400, y: 200, width: 100, height: 60 },
  ])
  const aligned = alignElements(doc, ["a", "b"], "left")
  const lefts = aligned.elements.map((element) => elementBounds(element).x)

  near(lefts[0], lefts[1], 1e-6, "the rotated AABB left edges line up")
  assert.equal(elementOf(aligned, "a").rotation, 45, "alignment never rotates an element")
})

test("alignElements ignores single selections and locked elements", () => {
  const doc = makeDoc([
    { id: "a", type: "shape", x: 100, y: 50, width: 100, height: 40 },
    { id: "b", type: "shape", x: 300, y: 200, width: 60, height: 80, locked: true },
    { id: "c", type: "shape", x: 500, y: 400, width: 40, height: 20 },
  ])

  assert.deepEqual(alignElements(doc, ["a"], "left"), doc)
  const aligned = alignElements(doc, ["a", "b", "c"], "left")
  assert.equal(elementOf(aligned, "b").x, 300, "a locked element stays where it is")
  assert.equal(elementOf(aligned, "a").x, 100)
  assert.equal(elementOf(aligned, "c").x, 100)
})

test("distributeElements spaces centres evenly and never moves the extremes", () => {
  const doc = makeDoc([
    { id: "a", type: "shape", x: -50, y: 0, width: 100, height: 20 },
    { id: "b", type: "shape", x: -40, y: 100, width: 100, height: 20 },
    { id: "c", type: "shape", x: 50, y: 200, width: 100, height: 20 },
  ])
  const distributed = distributeElements(doc, ["a", "b", "c"], "horizontal")
  const centers = distributed.elements.map((element) => element.x + element.width / 2)

  near(centers[0], 0)
  near(centers[1], 50)
  near(centers[2], 100)
  assert.deepEqual(distributed.elements.map((element) => element.y), [0, 100, 200], "the other axis is untouched")

  const vertical = distributeElements(
    makeDoc([
      { id: "a", type: "shape", x: 0, y: 0, width: 20, height: 100 },
      { id: "b", type: "shape", x: 100, y: 10, width: 20, height: 100 },
      { id: "c", type: "shape", x: 200, y: 200, width: 20, height: 100 },
    ]),
    ["a", "b", "c"],
    "vertical",
  )
  const middles = vertical.elements.map((element) => element.y + element.height / 2)
  near(middles[0], 50)
  near(middles[1], 150)
  near(middles[2], 250)

  assert.deepEqual(distributeElements(doc, ["a", "b"], "horizontal"), doc, "two elements cannot be distributed")
})

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

test("hitTest returns the topmost element and skips locked and hidden ones", () => {
  const doc = makeDoc([
    { id: "bottom", type: "shape", x: 0, y: 0, width: 200, height: 200, z: 0 },
    { id: "top", type: "shape", x: 50, y: 50, width: 100, height: 100, z: 1 },
    { id: "over", type: "shape", x: 60, y: 60, width: 20, height: 20, z: 2, locked: true },
    { id: "gone", type: "shape", x: 70, y: 70, width: 20, height: 20, z: 3, hidden: true },
  ])

  assert.equal(hitTest(doc, 75, 75)?.id, "top", "the locked and hidden elements above are skipped")
  assert.equal(hitTest(doc, 10, 10)?.id, "bottom")
  assert.equal(hitTest(doc, 500, 500), null)
})

test("hitTest respects rotation", () => {
  const doc = makeDoc([{ id: "a", type: "shape", x: 0, y: 0, width: 100, height: 100, rotation: 45 }])

  assert.equal(hitTest(doc, 50, 50)?.id, "a")
  assert.equal(hitTest(doc, 3, 3), null, "inside the unrotated box but outside the rotated shape")
  assert.equal(hitTest(doc, 50, 3)?.id, "a", "the rotated shape reaches the top middle")
})

test("elementsInRect selects intersecting elements for a marquee", () => {
  const doc = makeDoc([
    { id: "inside", type: "shape", x: 20, y: 20, width: 40, height: 40 },
    { id: "partial", type: "shape", x: 90, y: 90, width: 40, height: 40 },
    { id: "outside", type: "shape", x: 400, y: 400, width: 40, height: 40 },
    { id: "locked", type: "shape", x: 30, y: 30, width: 10, height: 10, locked: true },
    { id: "hidden", type: "shape", x: 30, y: 30, width: 10, height: 10, hidden: true },
  ])

  assert.deepEqual(elementsInRect(doc, { x: 0, y: 0, width: 100, height: 100 }).map((element) => element.id), ["inside", "partial"])
  assert.deepEqual(elementsInRect(doc, { x: 0, y: 0, width: 100, height: 100 }).length, 2, "locked and hidden are not marquee-selectable")
  assert.deepEqual(elementsInRect(doc, { x: 500, y: 500, width: 10, height: 10 }), [])
  assert.deepEqual(
    elementsInRect(doc, { x: 100, y: 100, width: -100, height: -100 }).map((element) => element.id),
    ["inside", "partial"],
    "a backwards marquee is normalized",
  )
})

test("boundsOf unions rotated bounding boxes and returns null when empty", () => {
  const doc = makeDoc([
    { id: "a", type: "shape", x: 100, y: 100, width: 100, height: 60 },
    { id: "b", type: "shape", x: 300, y: 200, width: 100, height: 100, rotation: 45 },
  ])
  const bounds = boundsOf(doc.elements)
  assert.ok(bounds)
  // The 45deg box contributes a 100*sqrt(2) square centred on (350, 250).
  near(bounds.x, 100)
  near(bounds.y, 100)
  near(bounds.width, 250 + 50 * Math.SQRT2, 1e-6)
  near(bounds.height, 150 + 50 * Math.SQRT2, 1e-6)

  assert.equal(boundsOf([]), null)
  assert.equal(boundsOf([createElement({ id: "h", type: "shape", hidden: true })]), null)
})

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

test("createHistory restores on undo and re-applies on redo", () => {
  const history = createHistory("a")

  assert.equal(history.present, "a")
  assert.equal(history.canUndo, false)
  assert.equal(history.canRedo, false)

  const committed = history.commit("b")
  assert.equal(committed.present, "b")
  assert.equal(committed.canUndo, true)
  assert.equal(committed.canRedo, false)

  const undone = committed.undo()
  assert.equal(undone.present, "a", "undo(commit(x)) restores the previous value")
  assert.equal(undone.canUndo, false)
  assert.equal(undone.canRedo, true)
  assert.equal(undone.undo().present, "a", "undo at the bottom is a no-op")
  assert.equal(undone.redo().present, "b", "redo re-applies the commit")
  assert.equal(undone.redo().redo().present, "b", "redo at the top is a no-op")
})

test("createHistory drops no-op commits and clears the redo branch on a new commit", () => {
  const doc = makeDoc([{ id: "a", type: "shape", x: 10, y: 10 }])
  const history = createHistory(doc)

  assert.equal(history.commit({ ...doc, elements: doc.elements.map((element) => ({ ...element })) }).canUndo, false, "a deep-equal commit is dropped")
  assert.equal(canvasDeepEqual(history.commit(doc).present, doc), true)

  const branched = history.commit(moveElement(doc, "a", 5, 0))
  assert.equal(branched.canRedo, false)
  const undone = branched.undo()
  assert.equal(undone.canRedo, true)
  assert.equal(undone.commit(moveElement(doc, "a", 0, 5)).canRedo, false, "a new commit drops the redo branch")
})

test("createHistory enforces its stack limit", () => {
  let history = createHistory(0, 3)
  for (const value of [1, 2, 3, 4, 5]) history = history.commit(value)

  assert.equal(history.present, 5)
  assert.equal(history.undo().present, 4)
  assert.equal(history.undo().undo().present, 3)
  assert.equal(history.undo().undo().undo().present, 2)
  assert.equal(history.undo().undo().undo().undo().present, 2, "the 0 and 1 commits were dropped by the limit")
})

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

test("serializeCanvas and parseCanvas round-trip a document exactly", () => {
  const doc = makeDoc([
    {
      id: "title",
      type: "text",
      x: 40,
      y: 32,
      width: 420,
      height: 96,
      rotation: 30,
      groupId: "group_1",
      content: "Design canvas",
      style: { fontSize: 32, color: "#1f2937" },
    },
    { id: "photo", type: "image", x: 500, y: 200, width: 240, height: 180, rotation: 0, hidden: true, content: "https://example.test/a.png" },
    { id: "note", type: "shape", x: 120, y: 300, width: 160, height: 120, locked: true, content: "shape" },
  ])

  const text = serializeCanvas(doc)
  const parsed = parseCanvas(text)

  assert.equal(canvasDeepEqual(parsed, doc), true, "parse(serialize(doc)) deep-equals doc")
  assert.deepEqual(parsed, doc)
  assert.equal(serializeCanvas(parsed), text, "serialization is byte-stable")
  assert.ok(text.startsWith('{\n  "version": 1,'), "the format version is the first key")
  assert.equal(JSON.parse(text).elements.length, 3)
  assert.deepEqual(Object.keys(JSON.parse(text).elements[0]), [
    "id",
    "type",
    "x",
    "y",
    "width",
    "height",
    "rotation",
    "z",
    "groupId",
    "locked",
    "hidden",
    "content",
    "style",
  ])
})

test("parseCanvas never throws on invalid or partial input", () => {
  assert.deepEqual(parseCanvas("not json"), createCanvasDoc())
  assert.deepEqual(parseCanvas(""), createCanvasDoc())

  const partial = parseCanvas('{"width": "nope", "elements": [{"type": "text", "x": "5"}]}')
  assert.equal(partial.width, 1080)
  assert.equal(partial.elements.length, 1)
  assert.equal(partial.elements[0].x, 5)
  assert.equal(partial.elements[0].rotation, 0)
})

// ---------------------------------------------------------------------------
// Text layout
// ---------------------------------------------------------------------------

test("fitText wraps by a font metric callback", () => {
  const measure = (line: string) => line.length * 10
  const fitted = fitText("aaa bbb ccc ddd", { width: 100, height: 48 }, measure)

  assert.deepEqual(fitted.lines, ["aaa bbb", "ccc ddd"])
  assert.equal(fitted.truncated, false)
  assert.equal(fitted.lineHeight, 24)
  assert.equal(fitted.height, 48)

  const clipped = fitText("aaa bbb ccc ddd eee", { width: 100, height: 48 }, measure)
  assert.deepEqual(clipped.lines, ["aaa bbb", "ccc ddd"])
  assert.equal(clipped.truncated, true, "the fifth word does not fit and is flagged")

  assert.deepEqual(fitText("", { width: 100, height: 48 }, measure).lines, [""])
  assert.deepEqual(fitText("one\n\ntwo", { width: 200, height: 100 }, measure).lines, ["one", "", "two"])
})

test("fitText breaks a single word wider than the box", () => {
  const measure = (line: string) => line.length * 10
  const fitted = fitText("abcdefghijkl", { width: 100, height: 100 }, measure, { lineHeight: 20, maxLines: 3 })

  assert.deepEqual(fitted.lines, ["abcdefghij", "kl"])
  assert.equal(fitted.truncated, false)
})
