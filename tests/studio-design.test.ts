import assert from "node:assert/strict"
import test from "node:test"
import { applySlideDesignPreset, buildDesignedSlideTemplateDeck, buildSlideExportPayload, buildSlidePresenterOutline, createSlideDesignObject, documentInsertGroups, getDocumentInsertBlock, removeSlideDesignObject, slideAnimationPresets, slideDesignPresets, slideTemplateDesigns, slideTransitionPresets, summarizeSlideShow, updateSlideDesignObject } from "../lib/studio-design"

test("document insert blocks expose reusable editor snippets", () => {
  assert.match(getDocumentInsertBlock("callout"), /Callout/)
  assert.match(getDocumentInsertBlock("two-column"), /<table>/)
  assert.match(getDocumentInsertBlock("cornell-notes"), /Cues/)
  assert.match(getDocumentInsertBlock("quiz-seed"), /Question/)
  assert.deepEqual(documentInsertGroups.map((group) => group.label), ["Blocks", "Layouts", "Learning"])
})

test("slide design presets add theme and background metadata", () => {
  const slide = applySlideDesignPreset({ title: "One", body: "Body" }, "forest")

  assert.equal(Object.keys(slideDesignPresets).length >= 10, true)
  assert.equal(slide.theme, "forest")
  assert.equal(slide.background, "#052e2b")
})

test("slide template deck applies real design metadata and editable objects", () => {
  const slides = buildDesignedSlideTemplateDeck("Hook|Why it matters|Open\nPractice|Try it|Do", "Lesson")

  assert.equal(slides.length, 2)
  assert.equal(slideTemplateDesigns.length, 10)
  assert.equal(slides[0].theme, "midnight")
  assert.equal(slides[1].layout, "two-column")
  assert.ok(slides[0].background)
  assert.ok(slides[0].objects?.length)
  assert.match(slides[0].speakerNotes || "", /Lesson/)
})

test("slide design objects create editable placeholders", () => {
  const shape = createSlideDesignObject("shape")
  const text = createSlideDesignObject("text")
  const table = createSlideDesignObject("table")

  assert.equal(shape.type, "shape")
  assert.equal(shape.style?.background, "#2563eb")
  assert.equal(text.type, "text")
  assert.ok(text.text)
  assert.equal(table.type, "table")
  assert.match(table.text || "", /Concept/)
})

test("slide design objects can be updated and removed", () => {
  const object = createSlideDesignObject("text")
  const slide = { title: "One", body: "Body", objects: [object] }
  const updated = updateSlideDesignObject(slide, object.id, { text: "Updated point" })
  const removed = removeSlideDesignObject(updated, object.id)

  assert.equal(updated.objects?.[0]?.text, "Updated point")
  assert.equal(removed.objects?.length, 0)
})

test("slide motion presets summarize deck duration", () => {
  const summary = summarizeSlideShow([
    { title: "Intro", body: "A short teaching point.", transition: "fade", animation: "rise" },
    { title: "Practice", body: "Try the question and explain your reasoning.", transition: "push", animation: "reveal" },
  ])

  assert.equal(slideTransitionPresets.fade.label, "Fade")
  assert.equal(slideAnimationPresets.reveal.label, "Reveal")
  assert.equal(summary.slideCount, 2)
  assert.ok(summary.totalSeconds >= 8)
  assert.equal(summary.slideTimings[0].title, "Intro")
})

test("slide export payload includes presenter outline and timings", () => {
  const object = createSlideDesignObject("table")
  const slides = [
    { title: "Intro", body: "A short teaching point.", accent: "Open", objects: [object], speakerNotes: "Ask a warmup question." },
  ]
  const outline = buildSlidePresenterOutline(slides)
  const payload = buildSlideExportPayload("Lesson", slides)

  assert.match(outline, /Slide 1: Intro/)
  assert.match(outline, /Objects: table/)
  assert.equal(payload.title, "Lesson")
  assert.equal(payload.slides[0].estimatedSeconds >= 3, true)
  assert.match(payload.presenterOutline, /Speaker notes/)
})
