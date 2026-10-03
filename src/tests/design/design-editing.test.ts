import assert from "node:assert/strict"
import test from "node:test"
import { createCanvasDoc, createElement, elementBounds, type CanvasElement } from "../../lib/studio/canvas-engine"
import { applyTheme, createDesignDoc, createDesignPage } from "../../lib/design/document"
import {
  adaptDroppedElement,
  alignSelection,
  duplicateSelection,
  elementHandles,
  growText,
  pasteElements,
  pictureElement,
  placeElement,
  resizeDesignElement,
  scaleFromCorner,
  scaleSelection,
  setElementStyle,
  textPresetElement,
  withHeightFromTop,
} from "../../lib/design/editing"
import { estimateMeasure, naturalTextHeight } from "../../lib/design/text"
import { readTextStyle } from "../../lib/design/style"
import { designTheme } from "../../lib/design/themes"

const PAGE = { width: 1920, height: 1080 }

function text(input: Partial<CanvasElement> = {}): CanvasElement {
  return createElement({ id: "t", type: "text", x: 100, y: 100, width: 400, height: 80, content: "Hello there, general knowledge", style: { fontSize: 40, padding: 10, fit: "grow" }, ...input })
}

function near(actual: number, expected: number, message?: string) {
  assert.ok(Math.abs(actual - expected) < 0.05, `${message ?? ""} expected ${expected}, got ${actual}`)
}

test("a corner drag scales about the opposite corner and keeps proportions", () => {
  const { rect, scale } = scaleFromCorner({ x: 0, y: 0, width: 200, height: 100, rotation: 0 }, "se", 200, 0)
  // Pointer projected on the diagonal: (400·200 + 100·100) / (200² + 100²) = 1.8
  near(scale, 1.8)
  assert.deepEqual({ ...rect, width: Math.round(rect.width), height: Math.round(rect.height) }, { x: 0, y: 0, width: 360, height: 180 })
  const rotated = scaleFromCorner({ x: 0, y: 0, width: 200, height: 100, rotation: 90 }, "nw", 0, 0)
  near(rotated.scale, 1, "no travel, no change")
  near(rotated.rect.x, 0)
})

test("text corners scale the type; text sides re-wrap and regrow the height", () => {
  const start = text()
  const scaled = resizeDesignElement(start, { handle: "se", dx: 400, dy: 80, shift: false, measure: estimateMeasure })
  near(Number(scaled.style.fontSize), 80, "font doubles with the box")
  near(Number(scaled.style.padding), 20)
  near(scaled.width, 800)
  assert.equal(scaled.x, 100)
  assert.equal(scaled.y, 100)

  const narrow = resizeDesignElement(start, { handle: "e", dx: -200, dy: 0, shift: false, measure: estimateMeasure })
  assert.equal(narrow.width, 200)
  assert.equal(Number(narrow.style.fontSize), 40, "side handles never change the type size")
  assert.equal(narrow.height, naturalTextHeight(start.content, 200, readTextStyle(narrow), estimateMeasure))
  assert.ok(narrow.height > start.height, "narrower text grows taller")
  assert.equal(narrow.y, 100, "the top edge stays put")
})

test("pictures keep proportions from a corner unless Shift frees them; shapes do the opposite", () => {
  const picture = createElement({ id: "p", type: "image", x: 0, y: 0, width: 400, height: 200 })
  const kept = resizeDesignElement(picture, { handle: "se", dx: 400, dy: 0, shift: false, measure: estimateMeasure })
  near(kept.width / kept.height, 2)
  const free = resizeDesignElement(picture, { handle: "se", dx: 400, dy: 0, shift: true, measure: estimateMeasure })
  assert.deepEqual([free.width, free.height], [800, 200])
  const shape = createElement({ id: "s", type: "shape", x: 0, y: 0, width: 400, height: 200 })
  const stretched = resizeDesignElement(shape, { handle: "se", dx: 400, dy: 0, shift: false, measure: estimateMeasure })
  assert.deepEqual([stretched.width, stretched.height], [800, 200])
})

test("handles follow the element: growing text has no top/bottom handles, a line only has ends", () => {
  assert.deepEqual([...elementHandles(text())], ["nw", "ne", "se", "sw", "e", "w"])
  assert.equal(elementHandles(text({ style: { fit: "shrink" } })).length, 8)
  assert.deepEqual([...elementHandles(createElement({ type: "shape", style: { shape: "line" } }))], ["e", "w"])
})

test("changing height from the top keeps a rotated box's top edge fixed", () => {
  const box = createElement({ id: "r", type: "text", x: 0, y: 0, width: 200, height: 100, rotation: 90 })
  const taller = withHeightFromTop(box, 200)
  // At 90° the top edge is on the right-hand side of the screen box; its midpoint must not move.
  const topMid = (element: CanvasElement) => {
    const radians = (element.rotation * Math.PI) / 180
    const cx = element.x + element.width / 2
    const cy = element.y + element.height / 2
    return { x: cx + (element.height / 2) * Math.sin(radians), y: cy - (element.height / 2) * Math.cos(radians) }
  }
  near(topMid(taller).x, topMid(box).x)
  near(topMid(taller).y, topMid(box).y)
})

test("a multi-selection scales as one: positions, sizes and type together", () => {
  const a = text({ id: "a", x: 0, y: 0, width: 100, height: 50, style: { fontSize: 20, fit: "none" } })
  const b = createElement({ id: "b", type: "shape", x: 100, y: 50, width: 100, height: 50 })
  const [sa, sb] = scaleSelection([a, b], "se", 200, 100, estimateMeasure)
  assert.deepEqual([sa.x, sa.y, sa.width, sa.height], [0, 0, 200, 100])
  assert.equal(Number(sa.style.fontSize), 40)
  assert.deepEqual([sb.x, sb.y, sb.width, sb.height], [200, 100, 200, 100])
})

test("one element aligns to the page, several align to each other", () => {
  const canvas = createCanvasDoc({ width: 1000, height: 600, elements: [createElement({ id: "a", type: "shape", x: 10, y: 20, width: 100, height: 100 }), createElement({ id: "b", type: "shape", x: 300, y: 300, width: 50, height: 50 })] })
  const centred = alignSelection(canvas, ["a"], "center")
  assert.equal(centred.elements[0].x, 450)
  const middled = alignSelection(canvas, ["a"], "middle")
  assert.equal(middled.elements[0].y, 250)
  const together = alignSelection(canvas, ["a", "b"], "left")
  assert.equal(together.elements[1].x, 10, "aligned to the leftmost member, not the page")
  const grouped = createCanvasDoc({ width: 1000, height: 600, elements: canvas.elements.map((element) => ({ ...element, groupId: "g" })) })
  const groupRight = alignSelection(grouped, ["a", "b"], "right")
  const bounds = elementBounds(groupRight.elements[1])
  assert.equal(bounds.x + bounds.width, 1000, "a group moves as one thing to the page edge")
})

test("pasting makes detached copies: fresh ids, groups kept together, no layout slots, cascading offset", () => {
  const canvas = createCanvasDoc({
    width: 1000,
    height: 600,
    elements: [
      createElement({ id: "a", type: "text", x: 10, y: 10, groupId: "g1", locked: true, content: "A", style: { slot: "b0.text", role: "title" } }),
      createElement({ id: "b", type: "shape", x: 50, y: 50, groupId: "g1", style: { slot: "d-bar" } }),
    ],
  })
  const first = duplicateSelection(canvas, ["a", "b"], 24)
  assert.equal(first.ids.length, 2)
  const copies = first.canvas.elements.slice(2)
  assert.ok(copies.every((element) => !("slot" in element.style)), "slots are stripped")
  assert.equal(copies[0].style.role, "title", "theme roles survive, so the copy still follows the theme")
  assert.ok(copies[0].groupId && copies[0].groupId === copies[1].groupId && copies[0].groupId !== "g1", "one fresh group")
  assert.equal(copies[0].locked, false)
  assert.deepEqual([copies[0].x, copies[0].y], [34, 34])
  const second = pasteElements(first.canvas, canvas.elements, 24)
  const secondCopy = second.canvas.elements.find((element) => element.id === second.ids[0])
  assert.deepEqual([secondCopy?.x, secondCopy?.y], [58, 58], "a second paste steps further instead of stacking")
})

test("hand-made style changes on themed elements survive a theme switch", () => {
  const theme = designTheme("notebook")
  const heading = textPresetElement("heading", theme, PAGE, estimateMeasure)
  const recoloured = setElementStyle(heading, { color: "#FF0000" })
  assert.deepEqual(recoloured.style.custom, ["color"])
  const doc = createDesignDoc({ theme: "notebook", pages: [createDesignPage({ elements: [recoloured, heading] })] })
  const switched = applyTheme(doc, "midnight")
  const [kept, followed] = switched.pages[0].elements
  assert.equal(kept.style.color, "#FF0000", "the person's colour stays")
  assert.equal(followed.style.color, designTheme("midnight").palette.text, "an untouched heading follows the theme")
  assert.equal(kept.style.fontFamily, followed.style.fontFamily, "untouched properties still follow")
  const plain = setElementStyle(createElement({ type: "text", style: { color: "#000" } }), { color: "#111", italic: null })
  assert.equal(plain.style.custom, undefined, "elements without roles need no bookkeeping")
})

test("new elements are placed in the middle, then step off each other", () => {
  const canvas = createCanvasDoc({ width: 1920, height: 1080 })
  const box = createElement({ id: "x", type: "shape", width: 200, height: 100 })
  const first = placeElement(canvas, box)
  assert.deepEqual([first.x, first.y], [860, 490])
  const second = placeElement({ ...canvas, elements: [first] }, { ...box, id: "y" })
  assert.deepEqual([second.x, second.y], [884, 514])
})

test("presets, pictures and dropped blocks come out sized for the page", () => {
  const theme = designTheme("sunset")
  const title = textPresetElement("title", theme, PAGE, estimateMeasure)
  assert.equal(title.style.fontFamily, theme.fonts.heading)
  assert.equal(title.height, growText(title, estimateMeasure).height, "a preset is already sized to its text")
  const picture = pictureElement("/api/files/a/download", { width: 4000, height: 1000 }, PAGE)
  near(picture.width / picture.height, 4)
  assert.ok(picture.width <= PAGE.width * 0.6 + 0.01)
  const small = createElement({ id: "ai", type: "text", width: 460, height: 40, content: "From the tutor", style: { fontSize: 18 } })
  const dropped = adaptDroppedElement(small, PAGE, theme, estimateMeasure)
  assert.equal(dropped.style.fontSize, 27)
  assert.notEqual(dropped.id, "ai")
  assert.equal(dropped.style.fit, "grow")
})
