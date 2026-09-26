import assert from "node:assert/strict"
import test from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { SharedDesign } from "../../components/learn/shared-design"
import { createCanvasDoc, createElement } from "../../lib/studio/canvas-engine"
import { normalizeDesignDoc, addPage } from "../../lib/design/document"

test("shared design renders every visible page and never hidden page content", () => {
  const canvas = createCanvasDoc({ name: "Lesson", elements: [createElement({ type: "text", content: "Visible introduction" })] })
  let design = normalizeDesignDoc(canvas)
  design = addPage(design, 0).doc
  design.pages[1].elements = [createElement({ type: "text", content: "Visible practice" })]
  design = addPage(design, 1).doc
  design.pages[2].hidden = true
  design.pages[2].elements = [createElement({ type: "text", content: "Hidden answer key" })]
  const html = renderToStaticMarkup(React.createElement(SharedDesign, { content: design }))
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")
  assert.match(text, /Visible introduction/)
  assert.match(text, /Visible practice/)
  assert.match(html, /Page 2 of 2/)
  assert.doesNotMatch(html, /Hidden answer key/)
})

test("legacy canvas share remains readable and unsafe images are not emitted", () => {
  const canvas = createCanvasDoc({ name: "Legacy", elements: [createElement({ type: "text", content: "Legacy content" }), createElement({ type: "image", content: "javascript:alert(1)" })] })
  const html = renderToStaticMarkup(React.createElement(SharedDesign, { content: canvas }))
  assert.match(html, /Legacy content/)
  assert.doesNotMatch(html, /javascript:/)
})
