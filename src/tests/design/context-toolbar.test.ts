import assert from "node:assert/strict"
import test from "node:test"
import { createElement as reactElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { ContextToolbar, type ToolbarActions } from "../../components/learn/design/context-toolbar"
import type { DesignEditorApi } from "../../components/learn/design/editor-types"
import { createDesignDoc } from "../../lib/design/document"
import { designTheme } from "../../lib/design/themes"
import { estimateMeasure } from "../../lib/design/text"
import { createElement, type CanvasElement } from "../../lib/studio/canvas-engine"

function renderTools(selection: CanvasElement[]) {
  const design = createDesignDoc()
  design.pages[0].elements = selection
  const noop = () => {}
  const api: DesignEditorApi = {
    design, pageIndex: 0, theme: designTheme(design.theme), measure: estimateMeasure,
    selectedIds: selection.map(element => element.id), notes: [], recentUploads: [],
    update: noop, select: noop, goToPage: noop, notify: noop, uploadFiles: async () => {},
    insertElements: noop,
  }
  const actions: ToolbarActions = {
    editText: noop, crop: noop, replacePicture: noop, openPanel: noop,
    duplicate: noop, remove: noop, group: noop, ungroup: noop,
    reorder: noop, align: noop, distribute: noop, toggleLock: noop,
  }
  return renderToStaticMarkup(reactElement(ContextToolbar, { api, selection, actions, cropping: false }))
}

test("empty selection shows page tools without object editing controls", () => {
  const html = renderTools([])
  assert.match(html, /aria-label="Page background"/)
  assert.doesNotMatch(html, /aria-label="Font size"|aria-label="Object actions"/)
})

test("text selection exposes typography while advanced actions start closed", () => {
  const html = renderTools([createElement({ type: "text", content: "Selected text" })])
  assert.match(html, /aria-label="Font size"/)
  assert.match(html, /aria-label="Position"/)
  assert.match(html, /aria-label="More text options"/)
  assert.doesNotMatch(html, /aria-label="Filters"|aria-label="Element x"|aria-label="Strikethrough"/)
})

test("image and shape selections expose only their relevant appearance tools", () => {
  const image = renderTools([createElement({ type: "image", content: "https://example.com/image.png" })])
  assert.match(image, /aria-label="Filters"/)
  assert.doesNotMatch(image, /aria-label="Font size"|aria-label="Change shape"/)
  const shape = renderTools([createElement({ type: "shape" })])
  assert.match(shape, /aria-label="Change shape"/)
  assert.doesNotMatch(shape, /aria-label="Filters"|aria-label="Font size"/)
})

test("mixed selection shows shared controls instead of stacking unrelated toolsets", () => {
  const html = renderTools([createElement({ type: "text", content: "Text" }), createElement({ type: "image" })])
  assert.match(html, /aria-label="Position"/)
  assert.match(html, /aria-label="Object actions"/)
  assert.doesNotMatch(html, /aria-label="Font size"|aria-label="Filters"|aria-label="Change shape"/)
})
