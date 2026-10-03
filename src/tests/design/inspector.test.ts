import assert from "node:assert/strict"
import test from "node:test"
import { createElement } from "../../lib/studio/canvas-engine"
import { createDesignDoc } from "../../lib/design/document"
import { editGeometry } from "../../lib/design/inspector"
import { composeFromTemplate } from "../../lib/design/compose"
import { DESIGN_TEMPLATES, designFromTemplate } from "../../lib/design/templates"

test("inspector geometry ignores incomplete, invalid and locked edits", () => {
  const element = createElement({ type: "shape", width: 150, height: 80 })
  for (const input of ["", " ", "not a number", "Infinity"]) assert.equal(editGeometry(element, "width", input), element)
  const locked = { ...element, locked: true }
  assert.equal(editGeometry(locked, "x", "80"), locked)
})

test("inspector clamps dimensions, permits off-page positioning and normalizes angles", () => {
  const element = createElement({ type: "text", content: "Test", width: 150, height: 80 })
  assert.equal(editGeometry(element, "width", "-5").width, 1)
  assert.equal(editGeometry(element, "height", "999999").height, 20000)
  assert.equal(editGeometry(element, "x", "-20.5").x, -20.5)
  assert.equal(editGeometry(element, "rotation", "450").rotation, 90)
  assert.equal(element.width, 150)
})

test("template preview preserves the document; insertion keeps existing pages and optional artwork colors", () => {
  const template = DESIGN_TEMPLATES.find(item => item.id === "neon-quiz")!
  const source = designFromTemplate(DESIGN_TEMPLATES.find(item => item.id === "editorial-notes")!)
  const before = JSON.stringify(source)
  const preview = designFromTemplate(template)
  assert.equal(JSON.stringify(source), before)
  const result = composeFromTemplate(source, template, { pageIndex: 0, preserveTemplateStyle: true })
  assert.deepEqual(result.doc.pages[0], source.pages[0])
  assert.deepEqual(result.doc.pages.at(-1), source.pages.at(-1))
  assert.equal(result.doc.pages[1].background, preview.pages[0].background)
  assert.equal(result.added, template.spec.pages.length)
  assert.equal(JSON.stringify(source), before)
})

test("all curated templates render finite visible geometry and fit the page budget", () => {
  assert.equal(new Set(DESIGN_TEMPLATES.map(item => item.id)).size, DESIGN_TEMPLATES.length)
  for (const template of DESIGN_TEMPLATES) {
    const result = composeFromTemplate(createDesignDoc(), template, { pageIndex: 0, preserveTemplateStyle: true })
    assert.ok(result.doc.pages.length > 0 && result.doc.pages.length <= 60, template.id)
    for (const page of result.doc.pages) for (const element of page.elements) {
      assert.ok([element.x, element.y, element.width, element.height].every(Number.isFinite), template.id)
      assert.ok(element.width > 0 && element.height > 0, template.id)
    }
  }
})
