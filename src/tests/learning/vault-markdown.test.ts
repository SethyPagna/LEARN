import assert from "node:assert/strict"
import test from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { VaultBlockContent } from "../../components/learn/vault-block-content"
import { VaultNoteBlocks } from "../../components/learn/vault-note-blocks"
import { AiBlockStyles } from "../../components/learn/ai-block-renderer"

function render(text: string, blockType?: string): string {
  return renderToStaticMarkup(createElement(VaultBlockContent, { text, blockType }))
}

test("Vault Markdown displays headings, lists and inline formatting", () => {
  const html = render("## **Study plan**\n\n- *Read* the chapter\n- Use `examples` and ~~old notes~~\n\n[Reference](https://example.com/guide)")
  assert.match(html, /role="heading" aria-level="2"><strong>Study plan<\/strong>/)
  assert.match(html, /<li><em>Read<\/em> the chapter<\/li>/)
  assert.match(html, /<code>examples<\/code>/)
  assert.match(html, /<s>old notes<\/s>/)
  assert.match(html, /href="https:\/\/example.com\/guide"/)
  assert.doesNotMatch(html, /## |\*\*Study/)
  assert.doesNotMatch(html, /<[a-z][^>]*\s(?:title="Drag block"|draggable="true")/i)
})

test("Vault Markdown renders ordered lists, quotes and table cells", () => {
  const html = render("1. First\n2. Second\n\n> Remember **why**\n\n| Topic | Action |\n| --- | --- |\n| **Cells** | Practice |")
  assert.match(html, /<ol[^>]*><li>First<\/li><li>Second<\/li><\/ol>/)
  assert.match(html, /<blockquote[^>]*>Remember <strong>why<\/strong><\/blockquote>/)
  assert.match(html, /<th[^>]*scope="col">Topic<\/th>/)
  assert.match(html, /<td[^>]*><strong>Cells<\/strong><\/td>/)
})

test("Vault fenced and typed code stays literal and cannot become markup", () => {
  const source = '<script>alert("hi")</script>\n**literal**'
  for (const html of [render(`\`\`\`html\n${source}\n\`\`\``), render(source, "code")]) {
    assert.match(html, /&lt;script&gt;/)
    assert.match(html, /\*\*literal\*\*/)
    assert.doesNotMatch(html, /<script|<strong>literal/)
  }
})

test("inline HTML code does not make a Markdown note lose its structure or examples", () => {
  const html = render("# HTML\n\nUse `<div>` and `<script>` to discuss tags, with `&lt;` as a literal entity.")
  assert.match(html, /role="heading" aria-level="1">HTML/)
  assert.match(html, /<code>&lt;div&gt;<\/code>/)
  assert.match(html, /<code>&lt;script&gt;<\/code>/)
  assert.match(html, /<code>&amp;lt;<\/code>/)
  assert.doesNotMatch(html, /<div><\/code>|<script>/)
})

test("Vault rejects unsafe links and executable HTML while retaining readable content", () => {
  const markdown = render("[unsafe](javascript:alert)\n\n![image](data:image/svg+xml;base64,unsafe)")
  const richText = render('<h2>Saved note</h2><p>Body</p><script>alert(1)</script><img src="javascript:alert" onerror="alert(2)">')
  for (const html of [markdown, richText]) assert.doesNotMatch(html, /<script|onerror=|href="javascript:|src="javascript:|src="data:image\/svg/)
  assert.match(richText, /Saved note/)
  assert.match(richText, />Body<\/p>/)
})

test("Vault note content is visible even when no saved blocks are loaded", () => {
  const note = { id: "note_1", title: "Plan", icon: "", content: "## Visible source\n\n- Use the note", favorite: false, template: "", updated_at: "2026-10-01" }
  const html = renderToStaticMarkup(createElement(VaultNoteBlocks, { note, revision: 0, setView: () => {} }))
  assert.match(html, /aria-label="Note content"/)
  assert.match(html, /role="heading" aria-level="2">Visible source/)
  assert.match(html, /<li>Use the note<\/li>/)
  assert.equal((html.match(/<style>/g) ?? []).length, 1)
})

test("a 200-block Vault group emits its shared stylesheet once", () => {
  const html = renderToStaticMarkup(createElement("section", null,
    createElement(AiBlockStyles),
    ...Array.from({ length: 200 }, (_, index) => createElement(VaultBlockContent, { key: index, text: `Block ${index}`, includeStyles: false })),
  ))
  assert.equal((html.match(/<style>/g) ?? []).length, 1)
  assert.ok(html.length < 100_000, "small blocks must not repeat a megabyte of preset CSS")
  assert.equal((render("Standalone").match(/<style>/g) ?? []).length, 1, "standalone previews retain their styles")
})

test("long Vault content is bounded and discloses a shortened preview", () => {
  const html = render("a".repeat(45_000))
  assert.match(html, /Content shortened for preview/)
  assert.ok(html.length < 30_000)
})

test("deeply nested saved HTML remains visible as bounded escaped source", () => {
  const source = "<div>".repeat(7_000) + "Deep content" + "</div>".repeat(7_000)
  const html = render(source)
  assert.match(html, /Preview could not be formatted/)
  assert.match(html, /&lt;div&gt;/)
  assert.match(html, /Deep content/)
  assert.match(html, /Content shortened for preview/)
  assert.ok(html.length < 120_000)
})
