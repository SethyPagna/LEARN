"use client"

import { useEffect, useState } from "react"
import { Layers, SlidersHorizontal, X } from "lucide-react"
import { editGeometry, type GeometryField } from "@/lib/design/inspector"
import { withPageElements } from "@/lib/design/document"
import type { CanvasElement } from "@/lib/studio/canvas-engine"
import { ContextToolbar, type ToolbarActions } from "./context-toolbar"
import type { DesignEditorApi } from "./editor-types"
import { LayersPanel } from "./panels/layers-panel"

function GeometryInput({ field, element, onCommit }: { field: GeometryField; element: CanvasElement; onCommit: (field: GeometryField, value: string) => void }) {
  const [value, setValue] = useState(String(Math.round(element[field] * 10) / 10))
  useEffect(() => setValue(String(Math.round(element[field] * 10) / 10)), [element.id, element[field]])
  function commit() { onCommit(field, value); setValue(String(editGeometry(element, field, value)[field])) }
  return <label className="inspector-number"><span>{field === "rotation" ? "Angle" : field === "width" ? "W" : field === "height" ? "H" : field.toUpperCase()}</span><input aria-label={`Element ${field}`} type="number" step="1" disabled={element.locked} value={value} onChange={event => setValue(event.target.value)} onBlur={commit} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") { setValue(String(element[field])); event.stopPropagation() } }} /></label>
}

export function DesignInspector({ api, selection, actions, cropping, onClose }: { api: DesignEditorApi; selection: readonly CanvasElement[]; actions: ToolbarActions; cropping: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<"design" | "layers">("design")
  const single = selection.length === 1 ? selection[0] : null
  function commit(field: GeometryField, value: string) {
    if (!single) return
    api.update(doc => withPageElements(doc, api.pageIndex, doc.pages[api.pageIndex].elements.map(element => element.id === single.id ? editGeometry(element, field, value) : element)))
  }
  return <aside className="design-inspector" aria-label="Design inspector">
    <header className="inspector-tabs"><button aria-pressed={tab === "design"} onClick={() => setTab("design")}><SlidersHorizontal size={14} />Design</button><button aria-pressed={tab === "layers"} onClick={() => setTab("layers")}><Layers size={14} />Layers</button><button aria-label="Close inspector" onClick={onClose}><X size={15} /></button></header>
    <div className="inspector-body">{tab === "layers" ? <LayersPanel api={api} /> : <>
      <div className="inspector-section"><h3>{single ? single.type === "text" ? "Text" : single.type === "image" ? "Image" : "Element" : selection.length ? `${selection.length} selected` : "Page"}</h3>
        {single ? <div className="inspector-geometry">{(["x", "y", "width", "height", "rotation"] as const).map(field => <GeometryInput key={field} field={field} element={single} onCommit={commit} />)}</div> : !selection.length ? <p className="text-xs text-muted-foreground">{api.design.width} × {api.design.height} px</p> : null}
      </div>
      <div className="inspector-section"><h3>{selection.length ? "Appearance & actions" : "Page style"}</h3><ContextToolbar api={api} selection={selection} actions={actions} cropping={cropping} /></div>
      {!selection.length ? <div className="inspector-hint"><p>Select an object to style it.</p><details><summary>Shortcuts</summary><p>T · add text<br />Ctrl D · duplicate<br />Shift click · select more<br />Arrow keys · move<br />Ctrl Z · undo</p></details></div> : null}
    </>}</div>
  </aside>
}
