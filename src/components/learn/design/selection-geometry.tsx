"use client"

import { useEffect, useState } from "react"
import { editGeometry, type GeometryField } from "@/lib/design/inspector"
import { withPageElements } from "@/lib/design/document"
import type { CanvasElement } from "@/lib/studio/canvas-engine"
import type { DesignEditorApi } from "./editor-types"

function GeometryInput({ field, element, onCommit }: { field: GeometryField; element: CanvasElement; onCommit: (field: GeometryField, value: string) => void }) {
  const [value, setValue] = useState(String(Math.round(element[field] * 10) / 10))
  useEffect(() => setValue(String(Math.round(element[field] * 10) / 10)), [element.id, element[field]])
  function commit() { onCommit(field, value); setValue(String(editGeometry(element, field, value)[field])) }
  return <label className="inspector-number"><span>{field === "rotation" ? "Angle" : field === "width" ? "W" : field === "height" ? "H" : field.toUpperCase()}</span><input aria-label={`Element ${field}`} type="number" step="1" disabled={element.locked} value={value} onChange={event => setValue(event.target.value)} onBlur={commit} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") { setValue(String(element[field])); event.stopPropagation() } }} /></label>
}

export function SelectionGeometry({ api, element }: { api: DesignEditorApi; element: CanvasElement }) {
  function commit(field: GeometryField, value: string) {
    api.update(doc => withPageElements(doc, api.pageIndex, doc.pages[api.pageIndex].elements.map(current =>
      current.id === element.id ? editGeometry(current, field, value) : current,
    )))
  }
  return <fieldset className="space-y-2">
    <legend className="text-xs font-semibold">Size & position</legend>
    <div className="inspector-geometry">
      {(["x", "y", "width", "height", "rotation"] as const).map(field =>
        <GeometryInput key={field} field={field} element={element} onCommit={commit} />,
      )}
    </div>
  </fieldset>
}
