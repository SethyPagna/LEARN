import assert from "node:assert/strict"
import test from "node:test"
import type { CanvasElement } from "../../lib/studio/canvas-engine"
import {
  addPage,
  applyTheme,
  createDesignDoc,
  designPlainText,
  duplicatePage,
  movePage,
  normalizeDesignDoc,
  parseDesign,
  removePage,
  scaleDesign,
  serializeDesign,
  type DesignDoc,
} from "../../lib/design/document"
import { designFormat } from "../../lib/design/formats"
import { adaptSpecToLayout, designFromSpec, layoutChoices, layoutPage, relayoutPage, resizeDesign, syncSpecFromElements } from "../../lib/design/layout"
import { dashArray, gradientPoints, imagePlacement, textEffectSpec } from "../../lib/design/paint"
import { parseTextToSpec, type DesignSpec } from "../../lib/design/spec"
import { readTextStyle } from "../../lib/design/style"
import { DESIGN_TEMPLATES, designFromTemplate } from "../../lib/design/templates"
import { estimateMeasure, layoutText } from "../../lib/design/text"
import { designTheme } from "../../lib/design/themes"

const NOTES = `# Photosynthesis
How plants turn light into food

## Why it matters
- Plants make their own food from light
- It releases the oxygen we breathe
- Almost every food chain starts here

## By the numbers
- 70% of oxygen comes from ocean plants
- 6 molecules of CO2 per glucose
- 1 billion years of practice

> The sun is the source of all energy on earth — A teacher

Q: Where does photosynthesis happen?
a) Mitochondria
b) Chloroplast *
c) Nucleus
d) Cell wall

Chlorophyll: the green pigment that absorbs light energy for photosynthesis.
`

function slot(element: CanvasElement): string {
  return typeof element.style.slot === "string" ? element.style.slot : ""
}

/** Every content element sits on the page and its text fits its box. */
function assertPageFits(doc: DesignDoc, label: string) {
  for (const page of doc.pages) {
    for (const element of page.elements) {
      if (slot(element).startsWith("d-")) continue
      assert.ok(element.x >= -1 && element.y >= -1, `${label} ${page.id} ${slot(element)} starts on the page`)
      assert.ok(element.x + element.width <= doc.width + 1 && element.y + element.height <= doc.height + 1, `${label} ${page.id} ${slot(element)} ends on the page`)
      if (element.type !== "text") continue
      const fitted = layoutText(element.content, element, readTextStyle(element), estimateMeasure)
      assert.equal(fitted.overflow, false, `${label} ${page.id} ${slot(element)} text fits its box`)
    }
  }
}

test("a new design has one blank page in the format's size and the theme's background", () => {
  const doc = createDesignDoc({ format: "story", theme: "midnight", name: "  " })
  assert.equal(doc.version, 2)
  assert.equal(doc.kind, "learn-design")
  assert.equal(doc.name, "Untitled design")
  assert.deepEqual([doc.width, doc.height], [1080, 1920])
  assert.equal(doc.pages.length, 1)
  assert.equal(doc.pages[0].background, designTheme("midnight").palette.background)
  assert.equal(doc.pages[0].backgroundRole, "background")
})

test("stored designs are rebuilt defensively and a first-format canvas becomes one page", () => {
  assert.equal(normalizeDesignDoc(null).pages.length, 1)
  assert.equal(normalizeDesignDoc("nope").pages.length, 1)

  const hostile = normalizeDesignDoc({
    version: 2,
    kind: "learn-design",
    format: "presentation",
    width: 99999,
    pages: [
      { id: "same", background: "x".repeat(500), elements: [{ id: "a", type: "text", content: "hi" }, { id: "a", type: "text", content: "twin" }], transition: "spin" },
      { id: "same", elements: "not an array", notes: 42 },
    ],
  })
  assert.deepEqual([hostile.width, hostile.height], [1920, 1080], "a known format wins over a stored size")
  assert.notEqual(hostile.pages[0].id, hostile.pages[1].id, "page ids are unique")
  assert.equal(hostile.pages[0].background, "#FFFFFF", "an oversized background value is dropped")
  assert.equal(hostile.pages[0].transition, "fade")
  const ids = hostile.pages[0].elements.map((element) => element.id)
  assert.equal(new Set(ids).size, ids.length, "element ids are unique within a page")
  assert.deepEqual(hostile.pages[1].elements, [])
  assert.equal(hostile.pages[1].notes, "")

  const legacy = normalizeDesignDoc({ version: 1, id: "c1", name: "Untitled canvas", width: 1080, height: 1080, background: "#FFEEDD", elements: [{ id: "t", type: "text", x: 10, y: 10, width: 200, height: 60, content: "Old text", style: { fontSize: 30 } }] })
  assert.equal(legacy.pages.length, 1)
  assert.equal(legacy.name, "Untitled design")
  assert.equal(legacy.format, "square")
  assert.equal(legacy.pages[0].background, "#FFEEDD")
  const text = legacy.pages[0].elements[0]
  assert.equal(text.style.fontSize, 30, "the stored size is kept")
  assert.equal(text.style.padding, 8, "the old renderer's defaults are written in, so it looks the same")
})

test("serialize and parse round-trip a design exactly", () => {
  const doc = designFromSpec(parseTextToSpec(NOTES), { theme: "sunset", pageIdPrefix: "p" })
  const text = serializeDesign(doc)
  assert.deepEqual(parseDesign(text), normalizeDesignDoc(JSON.parse(text)))
  assert.equal(serializeDesign(parseDesign(text)), text)
  assert.match(designPlainText(doc), /Photosynthesis/)
  assert.match(designPlainText(doc), /Chloroplast/)
})

test("page operations keep a design valid", () => {
  let doc = createDesignDoc({ theme: "notebook" })
  doc = addPage(doc, 0).doc
  doc = addPage(doc, -1).doc
  assert.equal(doc.pages.length, 3)
  const grouped: CanvasElement = { id: "e1", type: "shape", x: 0, y: 0, width: 10, height: 10, rotation: 0, z: 0, groupId: "g1", locked: false, hidden: false, content: "", style: {} }
  doc = { ...doc, pages: doc.pages.map((page, index) => (index === 0 ? { ...page, elements: [grouped, { ...grouped, id: "e2" }] } : page)) }
  const copy = duplicatePage(doc, 0)
  assert.equal(copy.index, 1)
  const copied = copy.doc.pages[1].elements
  assert.notEqual(copied[0].id, "e1", "copied elements get new ids")
  assert.equal(copied[0].groupId, copied[1].groupId, "a copied group stays one group")
  assert.notEqual(copied[0].groupId, "g1", "…with its own group id")
  const moved = movePage(copy.doc, 0, 3)
  assert.equal(moved.pages[3].id, copy.doc.pages[0].id)
  let single = createDesignDoc()
  single = removePage(single, 0).doc
  assert.equal(single.pages.length, 1, "removing the last page leaves a blank one")
})

test("a theme change restyles by role and keeps what a person coloured by hand", () => {
  const doc = designFromSpec(parseTextToSpec(NOTES), { theme: "notebook", pageIdPrefix: "p" })
  const handColoured: CanvasElement = { id: "mine", type: "text", x: 10, y: 10, width: 300, height: 60, rotation: 0, z: 99, groupId: null, locked: false, hidden: false, content: "Mine", style: { color: "#FF00AA", fontSize: 30 } }
  const withMine = { ...doc, pages: doc.pages.map((page, index) => (index === 1 ? { ...page, elements: [...page.elements, handColoured] } : page)) }
  const themed = applyTheme(withMine, "midnight")
  const midnight = designTheme("midnight")
  assert.equal(themed.theme, "midnight")
  assert.equal(themed.pages[1].background, midnight.palette.background)
  const heading = themed.pages[1].elements.find((element) => slot(element) === "b0.text")
  assert.ok(heading)
  assert.notEqual(heading.style.color, doc.pages[1].elements.find((element) => slot(element) === "b0.text")?.style.color, "role text follows the theme")
  assert.equal(themed.pages[1].elements.find((element) => element.id === "mine")?.style.color, "#FF00AA")
})

test("layout is deterministic and every page fits in every format", () => {
  const spec = parseTextToSpec(NOTES)
  const a = designFromSpec(spec, { theme: "notebook", pageIdPrefix: "p" })
  const b = designFromSpec(spec, { theme: "notebook", pageIdPrefix: "p" })
  assert.equal(serializeDesign({ ...a, id: "same" }), serializeDesign({ ...b, id: "same" }), "only the new design's own id differs")
  for (const format of ["presentation", "story", "a4", "square", "flashcard", "infographic"] as const) {
    assertPageFits(designFromSpec(spec, { format, theme: "pop", pageIdPrefix: "p" }), format)
  }
})

test("a crowded page continues on a new page with a (cont.) heading instead of shrinking", () => {
  const doc = designFromSpec(parseTextToSpec(NOTES), { theme: "notebook", pageIdPrefix: "p" })
  const quiz = doc.pages.findIndex((page) => page.spec?.blocks.some((block) => block.type === "question"))
  assert.ok(quiz > 0)
  const quizPage = doc.pages[quiz]
  const heading = quizPage.spec?.blocks[0]
  assert.equal(heading?.type === "heading" ? heading.text : "", "By the numbers (cont.)")
  assert.equal(quizPage.notes, "Answer: B. Chloroplast", "the answer goes to the notes, never onto the page")
  assert.ok(!quizPage.elements.some((element) => element.content.includes("Answer")))
  const before = doc.pages[quiz - 1]
  assert.equal(before.layout, "stats", "the page that handed the quiz on is named for what it kept")
  for (const page of doc.pages) {
    for (const element of page.elements) {
      if (element.type !== "text" || slot(element).startsWith("d-")) continue
      const size = layoutText(element.content, element, readTextStyle(element), estimateMeasure).size
      assert.ok(size >= 20, `${page.id} ${slot(element)} stays readable (${size}px)`)
    }
  }
})

test("edits on the page flow back into the spec", () => {
  const doc = designFromSpec(parseTextToSpec(NOTES), { theme: "notebook", pageIdPrefix: "p" })
  const page = doc.pages[1]
  assert.ok(page.spec)
  const edited = page.elements
    .map((element) => (slot(element) === "b0.text" ? { ...element, content: "Why it really matters" } : element))
    .filter((element) => slot(element) !== "b1.items.1")
  const spec = syncSpecFromElements(page.spec, edited)
  assert.deepEqual(spec?.blocks, [
    { type: "heading", text: "Why it really matters" },
    { type: "bullets", items: ["Plants make their own food from light", "Almost every food chain starts here"] },
  ])
})

test("re-layout keeps edits, notes and anything a person added", () => {
  const doc = designFromSpec(parseTextToSpec(NOTES), { theme: "notebook", pageIdPrefix: "p" })
  const sticker: CanvasElement = { id: "sticker", type: "shape", x: 40, y: 40, width: 80, height: 80, rotation: 12, z: 0, groupId: null, locked: false, hidden: false, content: "", style: { shape: "star", fill: "#FFCC00" } }
  const pages = doc.pages.map((page, index) =>
    index === 1 ? { ...page, notes: "Say this out loud", elements: [...page.elements.map((element) => (slot(element) === "b0.text" ? { ...element, content: "Why photosynthesis matters" } : element)), sticker] } : page,
  )
  const result = relayoutPage({ ...doc, pages }, 1, { layout: "timeline" })
  const page = result.doc.pages[1]
  assert.equal(page.layout, "timeline")
  assert.equal(page.notes, "Say this out loud")
  assert.ok(page.elements.some((element) => element.content === "Why photosynthesis matters"))
  const kept = page.elements.find((element) => element.id === "sticker")
  assert.ok(kept, "the sticker survives")
  assert.equal(kept.rotation, 12)
  assert.equal(kept.z, page.elements.length - 1, "…on top")
})

test("layouts on offer suit the content, and switching adapts the blocks", () => {
  const spec = { blocks: [{ type: "heading" as const, text: "Why" }, { type: "bullets" as const, items: ["One", "Two", "Three"] }] }
  const choices = layoutChoices(spec)
  assert.equal(choices[0], "bullets")
  assert.ok(choices.includes("steps") && choices.includes("timeline"))
  const steps = adaptSpecToLayout(spec, "steps")
  assert.deepEqual(steps.blocks[1], { type: "steps", items: [{ title: "One" }, { title: "Two" }, { title: "Three" }] })
  const pages = layoutPage(steps, { theme: "forest", width: 1920, height: 1080, pageId: "x" })
  assert.equal(pages[0].layout, "steps")
})

test("smart resize re-lays out every page for the new shape", () => {
  const deck = designFromSpec(parseTextToSpec(NOTES), { theme: "ocean", pageIdPrefix: "p" })
  const story = designFormat("story")
  const smart = resizeDesign(deck, { format: "story", width: story.width, height: story.height }, { mode: "smart" })
  assert.deepEqual([smart.width, smart.height], [1080, 1920])
  assert.equal(smart.pages.length, deck.pages.length)
  assertPageFits(smart, "smart story")
  const scaled = scaleDesign(deck, { format: "story", width: story.width, height: story.height })
  const heading = scaled.pages[1].elements.find((element) => slot(element) === "b0.text")
  const original = deck.pages[1].elements.find((element) => slot(element) === "b0.text")
  assert.ok(heading && original)
  assert.ok(Number(heading.style.fontSize) < Number(original.style.fontSize), "plain scaling shrinks type to the narrower page")
})

test("every template builds, fits its format and survives a format change", () => {
  const ids = new Set<string>()
  for (const template of DESIGN_TEMPLATES) {
    assert.ok(!ids.has(template.id), `template ids are unique (${template.id})`)
    ids.add(template.id)
    const doc = designFromTemplate(template, { pageIdPrefix: "p" })
    assert.equal(doc.format, template.format)
    assert.equal(doc.theme, template.theme)
    assertPageFits(doc, template.id)
    assertPageFits(designFromTemplate(template, { format: "square", pageIdPrefix: "p" }), `${template.id} square`)
  }
})

test("paragraph spacing opens up a list and every line knows where it sits", () => {
  const style = { ...readTextStyle({ style: { fontSize: 20, lineHeight: 1.5, list: "bullet" } }), fit: "none" as const }
  const tight = layoutText("One\nTwo\nThree", { width: 400, height: 400 }, style)
  const loose = layoutText("One\nTwo\nThree", { width: 400, height: 400 }, { ...style, paragraphSpacing: 0.5 })
  assert.equal(tight.contentHeight, 90)
  assert.equal(loose.contentHeight, 110)
  assert.deepEqual(
    loose.lines.map((line) => line.y),
    [0, 40, 80],
  )
})

test("paint helpers match CSS: gradient ends, dashes, crops and text effects", () => {
  assert.deepEqual(gradientPoints(90, 200, 100), { x1: 0, y1: 50, x2: 200, y2: 50 })
  assert.deepEqual(gradientPoints(180, 200, 100), { x1: 100, y1: 0, x2: 100, y2: 100 })
  assert.deepEqual(dashArray("solid", 4), [])
  assert.deepEqual(dashArray("dashed", 2), [6, 4.4])
  assert.deepEqual(dashArray("dotted", 3), [0, 6])
  assert.deepEqual(imagePlacement("cover", 0.5, 0.5, 100, 100, 200, 100), { x: -50, y: 0, width: 200, height: 100 })
  assert.deepEqual(imagePlacement("cover", 0, 0.5, 100, 100, 200, 100), { x: 0, y: 0, width: 200, height: 100 }, "the focus point stays in view")
  assert.deepEqual(imagePlacement("contain", 0.5, 0.5, 100, 100, 200, 100), { x: 0, y: 25, width: 100, height: 50 })
  assert.equal(textEffectSpec("neon", 100, "#00FFFF").shadows.length, 3)
  assert.equal(textEffectSpec("outline", 100, "#000000").outline?.width, 7)
  assert.equal(textEffectSpec("none", 100, "#000000").shadows.length, 0)
})

test("a spec from untrusted input still lays out (ids and text are bounded)", () => {
  const hostile = { pages: [{ blocks: [{ type: "title", text: "x".repeat(5000) }, { type: "bullets", items: Array.from({ length: 50 }, () => "y".repeat(400)) }] }] } as unknown as DesignSpec
  const doc = designFromSpec(hostile, { format: "square", pageIdPrefix: "p" })
  assert.ok(doc.pages.length >= 1 && doc.pages.length <= 20)
  for (const page of doc.pages) assert.ok(page.elements.length <= 250)
})
