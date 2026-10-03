import assert from "node:assert/strict"
import test from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { StudioProjectPreview } from "../../components/learn/studio-project-preview"
import type { Project } from "../../components/learn/studio-projects"
import { estimateMeasure } from "../../lib/design/text"

function render(project: Partial<Project>) {
  return renderToStaticMarkup(createElement(StudioProjectPreview, { project: { id: "preview", title: "Example", kind: "notes", ...project }, measure: estimateMeasure }))
}

test("project previews show stored HTML text safely without interactive markup", () => {
  const html = render({ kind: "docs", content: { text: '<h2>Real heading</h2><p>Actual content</p><script>alert(1)</script><input value="unsafe">' } })
  assert.match(html, /Real heading/)
  assert.match(html, /Actual content/)
  assert.doesNotMatch(html, /<script|<input|alert\(1\)/)
})

test("Markdown notes preserve headings and lists in their preview", () => {
  const html = render({ content: "## Scheduling\n\n- Round robin\n- Priority queues" })
  assert.match(html, /preview-heading/)
  assert.match(html, /<li>Round robin<\/li>/)
  assert.doesNotMatch(html, /## Scheduling/)
})

test("sheet previews use real cells and resolve supported formulas", () => {
  const html = render({ kind: "sheets", cells: [["7", "Total"], ["9", "=SUM(A1:A2)"]] })
  assert.match(html, />Total</)
  assert.match(html, />16</)
  assert.doesNotMatch(html, /=SUM/)
})

test("sheet previews recalculate dependencies and preserve failed formulas for inspection", () => {
  const html = render({ kind: "sheets", cells: [["7", "Total"], ["9", " =SUM(A1:A2) "], ["=SUM(B2)", "=SUM(B3)"]] })
  assert.match(html, />16</)
  assert.doesNotMatch(html, /SUM\(A1:A2\)|SUM\(B2\)/)
  assert.match(html, /=SUM\(B3\)/)
})

test("empty or malformed projects have an honest fallback", () => {
  assert.match(render({ content: "" }), /Empty page/)
  assert.match(render({ kind: "slides", slides: [] }), /No preview/)
})
