import assert from "node:assert/strict"
import test from "node:test"
import { getSchema } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import { WritingDocument, WritingPage, splitWritingPage } from "../../components/learn/studio-writing-pages"
import { richDocumentPageBodies, richDocumentEditingHtml, joinRichDocumentPages } from "../../lib/studio-pages"
import { EditorState, TextSelection } from "@tiptap/pm/state"
import { history, undo } from "@tiptap/pm/history"

test("writing workspace preserves empty pages, tables and ordinary dividers", () => {
  const pages = ['<p>One</p><hr><table><tr><td>Cell</td></tr></table>', '<p></p>', '<h2>Three</h2>']
  const stored = joinRichDocumentPages(pages)
  assert.deepEqual(richDocumentPageBodies(stored), pages)
  assert.equal(richDocumentEditingHtml(stored), pages.map(page => `<section data-studio-sheet="true">${page}</section>`).join(""))
  assert.deepEqual(richDocumentPageBodies('<hr data-studio-page="true">'), ['<p></p>', '<p></p>'])
})

test("document page edits and reordering share one undo history", () => {
  const schema = getSchema([StarterKit.configure({ document: false }), WritingDocument, WritingPage])
  const page = (text: string) => schema.nodes.studioSheet.create(null, schema.nodes.paragraph.create(null, schema.text(text)))
  const first = page("First")
  const second = page("Second")
  let state = EditorState.create({ doc: schema.nodes.doc.create(null, [first, second]), plugins: [history()] })
  const original = state.doc.toJSON()
  state = state.apply(state.tr.delete(first.nodeSize, first.nodeSize + second.nodeSize).insert(0, second))
  assert.equal(state.doc.child(0).textContent, "Second")
  assert.equal(state.doc.child(1).textContent, "First")
  assert.equal(state.doc.childCount, 2)
  undo(state, transaction => { state = state.apply(transaction) })
  assert.deepEqual(state.doc.toJSON(), original)
  assert.equal(schema.nodes.studioSheet.spec.isolating, true)
})

test("a page break splits a paragraph at the cursor without dropping text", () => {
  const schema = getSchema([StarterKit.configure({ document: false }), WritingDocument, WritingPage])
  const doc = schema.nodes.doc.create(null, schema.nodes.studioSheet.create(null, schema.nodes.paragraph.create(null, schema.text("First second"))))
  const state = EditorState.create({ doc, selection: TextSelection.create(doc, 7) })
  const transaction = state.tr
  splitWritingPage(transaction)
  assert.equal(transaction.doc.childCount, 2)
  assert.equal(transaction.doc.child(0).textContent, "First")
  assert.equal(transaction.doc.child(1).textContent, " second")
  transaction.doc.check()
})
