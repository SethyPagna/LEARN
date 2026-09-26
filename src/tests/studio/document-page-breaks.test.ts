import assert from "node:assert/strict"
import test from "node:test"
import { getSchema } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import { StudioPageBreak } from "../../components/learn/studio-page-break"
import { blocksFromDocumentHtml, blocksToDocumentHtml } from "../../lib/export/html-blocks"
import { documentHtmlToDocx, documentHtmlToPdf } from "../../lib/export/studio-export"
import { importDocx } from "../../lib/export/docx-import"
import { countRichDocumentPages, duplicateRichDocumentLastPage } from "../../lib/studio-pages"
import { partText } from "../export/zip-reader"

test("page counting tolerates editor attributes and does not count ordinary rules", () => {
  const html = '<p>One</p><hr class="page" data-studio-page="true" /><p>Two</p><hr><hr data-studio-page=\'true\'><p>Three</p>'
  assert.equal(countRichDocumentPages(html), 3)
  const duplicate = duplicateRichDocumentLastPage(html)
  assert.equal(countRichDocumentPages(duplicate), 4)
  assert.equal(duplicate.match(/<p>Three<\/p>/g)?.length, 2)
})

test("TipTap schema retains explicit page-break attributes when serializing", () => {
  const schema = getSchema([StarterKit, StudioPageBreak])
  const rule = schema.nodes.horizontalRule
  assert.equal(rule.create().attrs.pageBreak, false)
  const pageBreak = rule.create({ pageBreak: true })
  const output = rule.spec.toDOM?.(pageBreak)
  assert.ok(Array.isArray(output))
  assert.deepEqual(output[1], { "data-studio-page": "true" })
})

test("document page breaks survive HTML and Word export/import", async () => {
  const html = '<h1>First page</h1><hr data-studio-page="true"><p>Second page</p>'
  const blocks = blocksFromDocumentHtml(html)
  assert.deepEqual(blocks[1], { type: "divider", pageBreak: true })
  assert.equal(countRichDocumentPages(blocksToDocumentHtml(blocks)), 2)
  const bytes = documentHtmlToDocx({ title: "Pages", html })
  assert.match(partText(bytes, "word/document.xml"), /<w:br w:type="page"\/>/)
  const imported = await importDocx(bytes)
  assert.deepEqual(imported.blocks, blocks)
})

test("explicit document boundaries create separate PDF pages including blank pages", () => {
  const html = '<p>First page</p><hr data-studio-page="true"><hr data-studio-page="true"><p>Third page</p>'
  const pdf = new TextDecoder("latin1").decode(documentHtmlToPdf({ title: "Pages", html }))
  assert.match(pdf, /\/Type \/Pages\b[^]*?\/Count 3\b/)
  const ordinaryRule = new TextDecoder("latin1").decode(documentHtmlToPdf({ title: "Rules", html: "<p>One</p><hr><p>Two</p>" }))
  assert.match(ordinaryRule, /\/Type \/Pages\b[^]*?\/Count 1\b/)
})
