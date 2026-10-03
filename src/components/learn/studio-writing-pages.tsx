"use client"

import { Node, getHTMLFromFragment, type Editor } from "@tiptap/core"
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, useEditorState, type NodeViewProps } from "@tiptap/react"
import { ChevronDown, ChevronUp, CopyPlus, Plus, Trash2 } from "lucide-react"
import { joinRichDocumentPages } from "@/lib/studio-pages"
import { TextSelection, type Transaction } from "@tiptap/pm/state"

export const WritingDocument = Node.create({ name: "doc", topNode: true, content: "studioSheet+" })

export const WritingPage = Node.create({
  name: "studioSheet", content: "block+", defining: true, isolating: true,
  parseHTML: () => [{ tag: 'section[data-studio-sheet="true"]' }],
  renderHTML: () => ["section", { "data-studio-sheet": "true" }, 0],
  addNodeView: () => ReactNodeViewRenderer(WritingPageView),
})

export function writingDocumentHtml(editor: Editor): string {
  const pages: string[] = []
  editor.state.doc.forEach(page => pages.push(getHTMLFromFragment(page.content, editor.schema)))
  return joinRichDocumentPages(pages)
}

export function insertWritingPageBreak(editor: Editor): void {
  editor.chain().focus().command(({ tr }) => {
    splitWritingPage(tr)
    return true
  }).run()
}

export function splitWritingPage(transaction: Transaction): void {
  transaction.deleteSelection()
  const { $from, from } = transaction.selection
  if ($from.depth < 1) return
  const page = $from.node(1)
  const start = $from.before(1)
  // Lists and tables stay intact; a break inside one follows that block.
  const offset = ($from.depth > 2 ? $from.after(2) : from) - $from.start(1)
  const before = page.cut(0, offset)
  const after = page.cut(offset)
  const first = before.childCount ? before : page.type.createAndFill()!
  const second = after.childCount ? after : page.type.createAndFill()!
  transaction.replaceWith(start, start + page.nodeSize, [first, second])
  transaction.setSelection(TextSelection.near(transaction.doc.resolve(start + first.nodeSize + 1)))
}

function WritingPageView({ node, editor, getPos }: NodeViewProps) {
  const { index, count } = useEditorState({ editor, selector: ({ editor }) => {
    const position = getPos()
    return { index: typeof position === "number" ? editor.state.doc.resolve(Math.min(position, editor.state.doc.content.size)).index(0) : 0, count: editor.state.doc.childCount }
  } })
  function change(action: "add" | "duplicate" | "delete" | "up" | "down") {
    const start = getPos()
    if (typeof start !== "number") return
    const current = editor.state.doc.nodeAt(start)
    if (!current) return
    const transaction = editor.state.tr
    if (action === "add" || action === "duplicate") {
      const page = action === "duplicate" ? current : editor.schema.nodes.studioSheet.createAndFill()
      if (page) transaction.insert(start + current.nodeSize, page)
    } else if (action === "delete") {
      if (count < 2) return
      transaction.delete(start, start + current.nodeSize)
    } else {
      const destination = index + (action === "up" ? -1 : 1)
      if (destination < 0 || destination >= count) return
      const target = action === "up" ? start - editor.state.doc.child(destination).nodeSize : start + editor.state.doc.child(destination).nodeSize
      transaction.delete(start, start + current.nodeSize).insert(target, current)
    }
    editor.view.dispatch(transaction)
  }
  return <NodeViewWrapper className="writing-page-node" data-page-index={index}>
    <div className="design-page-actions" contentEditable={false}>
      <span className="design-page-number">Page {index + 1}</span>
      <button type="button" title="Move up" aria-label={`Move document page ${index + 1} up`} disabled={index === 0} onClick={() => change("up")}><ChevronUp size={15} /></button>
      <button type="button" title="Move down" aria-label={`Move document page ${index + 1} down`} disabled={index === count - 1} onClick={() => change("down")}><ChevronDown size={15} /></button>
      <button type="button" title="Duplicate" aria-label={`Duplicate document page ${index + 1}`} onClick={() => change("duplicate")}><CopyPlus size={15} /></button>
      <button type="button" title="Delete" aria-label={`Delete document page ${index + 1}`} disabled={count === 1} onClick={() => change("delete")}><Trash2 size={15} /></button>
      <button type="button" title="Add page" aria-label={`Add document page after ${index + 1}`} onClick={() => change("add")}><Plus size={15} /></button>
    </div>
    <NodeViewContent className="writing-page-content" data-page-size={node.nodeSize} />
  </NodeViewWrapper>
}
