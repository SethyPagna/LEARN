"use client"

import { useState, type DragEvent, type MouseEvent } from "react"
import { Eye, EyeOff, GripVertical, Image as ImageIcon, Lock, LockOpen, Shapes, Type, Link2 } from "lucide-react"

import { moveElementToIndex, type CanvasElement } from "@/lib/studio/canvas-engine"
import { pageCanvas, withPageCanvas, withPageElements } from "@/lib/design/document"
import { SHAPE_LABELS } from "@/lib/design/shapes"
import { readShapeStyle } from "@/lib/design/style"

import type { DesignEditorApi } from "../editor-types"
import { EmptyHint } from "./panel-kit"

/**
 * Everything on the current page, front-most first. Click to select (Shift or
 * Ctrl/Cmd adds to the selection), drag a row to restack, and hide or lock
 * each element. Locked elements (a layout's frame, a background picture)
 * cannot be picked on the page itself, so this is where they are selected.
 */

const LAYER_MIME = "application/x-learn-design-layer"

export function layerLabel(element: CanvasElement): string {
  if (typeof element.style.name === "string" && element.style.name.trim()) return element.style.name.trim()
  if (element.type === "text") return element.content.split("\n")[0].trim().slice(0, 48) || "Empty text"
  if (element.type === "image") return element.content ? "Picture" : "Empty frame"
  if (element.type === "shape") {
    const name = SHAPE_LABELS[readShapeStyle(element).shape] ?? "Shape"
    const label = element.content.trim().split("\n")[0].slice(0, 28)
    return label ? `${name}: ${label}` : name
  }
  return "Embed"
}

function LayerIcon({ element }: { element: CanvasElement }) {
  const className = "h-3.5 w-3.5 shrink-0 opacity-70"
  if (element.type === "text") return <Type className={className} aria-hidden="true" />
  if (element.type === "image") return <ImageIcon className={className} aria-hidden="true" />
  if (element.type === "shape") return <Shapes className={className} aria-hidden="true" />
  return <Link2 className={className} aria-hidden="true" />
}

export function LayersPanel({ api }: { api: DesignEditorApi }) {
  const page = api.design.pages[api.pageIndex]
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropId, setDropId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [name, setName] = useState("")
  if (!page) return null
  const stack = page.elements
  const rows = [...stack].reverse()
  const selected = new Set(api.selectedIds)

  const select = (element: CanvasElement, event: MouseEvent) => {
    const additive = event.shiftKey || event.metaKey || event.ctrlKey
    if (!additive) {
      api.select([element.id])
      return
    }
    api.select(selected.has(element.id) ? api.selectedIds.filter((id) => id !== element.id) : [...api.selectedIds, element.id])
  }

  const setFlag = (element: CanvasElement, patch: Partial<Pick<CanvasElement, "hidden" | "locked">>) => {
    api.update((design) => {
      const current = design.pages[api.pageIndex]
      if (!current) return design
      return withPageElements(design, api.pageIndex, current.elements.map((candidate) => (candidate.id === element.id ? { ...candidate, ...patch } : candidate)))
    })
  }

  const onDrop = (event: DragEvent<HTMLLIElement>, target: CanvasElement) => {
    const id = event.dataTransfer.getData(LAYER_MIME) || dragId
    setDragId(null)
    setDropId(null)
    if (!id || id === target.id) return
    event.preventDefault()
    api.update((design) => {
      const canvas = pageCanvas(design, api.pageIndex)
      const index = canvas.elements.findIndex((element) => element.id === target.id)
      if (index < 0) return design
      return withPageCanvas(design, api.pageIndex, moveElementToIndex(canvas, id, index))
    })
  }

  if (!rows.length) return <EmptyHint>This page is empty. Add text, a shape or a picture and it will be listed here.</EmptyHint>

  return (
    <div>
      <p className="sr-only">Front-most first. Drag rows to restack.</p>
      <ul className="grid gap-1" aria-label={`Layers on page ${api.pageIndex + 1}`}>
        {rows.map((element) => {
          const isSelected = selected.has(element.id)
          return (
            <li
              key={element.id}
              className="canvas-layer group flex items-center gap-0.5 pr-1"
              data-selected={isSelected ? "true" : "false"}
              data-drop={dropId === element.id && dragId !== element.id ? "true" : "false"}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData(LAYER_MIME, element.id)
                event.dataTransfer.effectAllowed = "move"
                setDragId(element.id)
              }}
              onDragOver={(event) => {
                if (!dragId && !Array.from(event.dataTransfer.types).includes(LAYER_MIME)) return
                event.preventDefault()
                event.dataTransfer.dropEffect = "move"
                if (dropId !== element.id) setDropId(element.id)
              }}
              onDragLeave={() => setDropId((current) => (current === element.id ? null : current))}
              onDragEnd={() => {
                setDragId(null)
                setDropId(null)
              }}
              onDrop={(event) => onDrop(event, element)}
            >
              <button
                type="button"
                className={`flex min-w-0 flex-1 items-center gap-2 rounded-[10px] px-2 py-2 text-left text-[0.8rem] ${element.hidden ? "opacity-50" : ""}`}
                onClick={(event) => select(element, event)}
                aria-pressed={isSelected}
                title={layerLabel(element)}
                onDoubleClick={() => { setRenamingId(element.id); setName(layerLabel(element)) }}
              >
                <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab opacity-0 transition group-hover:opacity-50" aria-hidden="true" />
                <LayerIcon element={element} />
                <span className="min-w-0 flex-1 truncate">{layerLabel(element)}</span>
                {element.groupId ? <span className="rounded-full bg-primary/15 px-1.5 text-[0.6rem] font-bold uppercase tracking-wide text-primary">Group</span> : null}
              </button>
              {renamingId === element.id ? <input autoFocus aria-label="Layer name" className="min-w-0 flex-1 rounded border bg-background px-2 py-1 text-sm" maxLength={120} value={name} onChange={(event) => setName(event.target.value)} onBlur={() => {
                api.update((design) => withPageElements(design, api.pageIndex, design.pages[api.pageIndex].elements.map((candidate) => candidate.id === element.id ? { ...candidate, style: { ...candidate.style, name: name.trim() } } : candidate)))
                setRenamingId(null)
              }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") { setRenamingId(null); event.stopPropagation() } }} /> : <button type="button" className="rounded p-1 text-xs text-muted-foreground hover:bg-muted" aria-label={`Rename ${layerLabel(element)}`} onClick={() => { setRenamingId(element.id); setName(layerLabel(element)) }}>Rename</button>}
              <button
                type="button"
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-background/70 hover:text-foreground"
                onClick={() => setFlag(element, { hidden: !element.hidden })}
                aria-label={element.hidden ? `Show ${layerLabel(element)}` : `Hide ${layerLabel(element)}`}
                title={element.hidden ? "Show" : "Hide"}
              >
                {element.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition hover:bg-background/70 hover:text-foreground ${element.locked ? "text-foreground" : "text-muted-foreground"}`}
                onClick={() => setFlag(element, { locked: !element.locked })}
                aria-label={element.locked ? `Unlock ${layerLabel(element)}` : `Lock ${layerLabel(element)}`}
                title={element.locked ? "Unlock" : "Lock"}
              >
                {element.locked ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
