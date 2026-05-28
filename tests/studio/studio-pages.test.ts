import assert from "node:assert/strict"
import test from "node:test"

import { appendRichDocumentPage, countRichDocumentPages, duplicateRichDocumentLastPage } from "../../lib/studio-pages"

test("rich document page helpers count and append page-like canvases", () => {
  const first = "<h1>One</h1><p>Body</p>"
  const second = appendRichDocumentPage(first, "Practice")

  assert.equal(countRichDocumentPages(first), 1)
  assert.equal(countRichDocumentPages(second), 2)
  assert.match(second, /<h2>Practice<\/h2>/)
})

test("rich document page helpers duplicate the last page content", () => {
  const html = appendRichDocumentPage("<h1>One</h1>", "Two")
  const duplicated = duplicateRichDocumentLastPage(html)

  assert.equal(countRichDocumentPages(duplicated), 3)
  assert.equal((duplicated.match(/<h2>Two<\/h2>/g) || []).length, 2)
})
