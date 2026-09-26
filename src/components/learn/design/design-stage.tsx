"use client"

import { useEffect, useRef, useState, type DragEvent, type PointerEvent, type CSSProperties } from "react"
import { boundsOf, elementsInRect, type CanvasDoc, type CanvasRect, type ResizeHandle, type SnapGuide } from "@/lib/studio/canvas-engine"
import { blockToElement, hasBlockDragPayload, readBlockDragPayload } from "@/lib/studio/block-drop"
import { pageCanvas, withPageCanvas } from "@/lib/design/document"
import { clusteredSelection } from "@/lib/design/editor-state"
import { previewElementGesture, type ElementGesture } from "@/lib/design/editor-gesture"
import { adaptDroppedElement, CORNER_HANDLES, elementHandles, growText } from "@/lib/design/editing"
import { handleCursor, panCrop, pickElement, rectFromPoints, type Point } from "@/lib/design/gestures"
import { readImageStyle } from "@/lib/design/style"
import { DesignPageView } from "./design-renderer"
import { elementForItem, hasDesignDragItem, readDesignDragItem } from "./design-drag"
import { dragHasFiles, naturalSize, pictureFilesFrom } from "./image-upload"
import { TextEditorOverlay } from "./text-editor-overlay"
import type { DesignEditorApi } from "./editor-types"

interface StageProps {
  api: DesignEditorApi
  zoom: number
  snap: boolean
  grid: boolean
  editingId: string | null
  cropping: boolean
  onEdit: (id: string | null) => void
  onUndo: (redo: boolean) => void
  onInteraction: (busy: boolean) => void
  onContext: (point: Point) => void
}

interface ActivePointer {
  id: number
  start: Point
  canvas: CanvasDoc
  originalSelection: string[]
  gesture: ElementGesture | null
  crop: string | null
  next: CanvasDoc | null
}

const HANDLE_POSITION: Record<ResizeHandle, [number, number]> = { nw: [0, 0], n: [0.5, 0], ne: [1, 0], e: [1, 0.5], se: [1, 1], s: [0.5, 1], sw: [0, 1], w: [0, 0.5] }

export function DesignStage({ api, zoom, snap, grid, editingId, cropping, onEdit, onUndo, onInteraction, onContext }: StageProps) {
  const stage = useRef<HTMLDivElement>(null)
  const pointer = useRef<ActivePointer | null>(null)
  const [live, setLive] = useState<CanvasDoc | null>(null)
  const [marquee, setMarquee] = useState<CanvasRect | null>(null)
  const [guides, setGuides] = useState<SnapGuide[]>([])
  const [pictureSize, setPictureSize] = useState<{ width: number; height: number } | null>(null)
  const canvas = live ?? pageCanvas(api.design, api.pageIndex)
  const selected = canvas.elements.filter((element) => api.selectedIds.includes(element.id) && !element.hidden)
  const editable = selected.filter((element) => !element.locked)
  const single = editable.length === 1 ? editable[0] : null
  const bounds = single ?? boundsOf(editable)
  const editing = canvas.elements.find((element) => element.id === editingId && !element.locked && !element.hidden)
  const picture = cropping && selected.length === 1 && selected[0].type === "image" ? selected[0] : null

  useEffect(() => {
    if (!pointer.current) return
    pointer.current = null
    setLive(null); setMarquee(null); setGuides([]); onInteraction(false)
  }, [api.design])
  useEffect(() => () => onInteraction(false), [])

  useEffect(() => {
    let active = true
    setPictureSize(null)
    if (picture?.content) void naturalSize(picture.content).then((size) => { if (active) setPictureSize(size) })
    return () => { active = false }
  }, [picture?.content])

  function pointAt(event: { clientX: number; clientY: number }): Point {
    const rect = stage.current!.getBoundingClientRect()
    return { x: (event.clientX - rect.left) / zoom, y: (event.clientY - rect.top) / zoom }
  }

  function begin(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || (event.target as HTMLElement).closest("textarea")) return
    event.preventDefault()
    onEdit(null)
    stage.current?.focus({ preventScroll: true })
    const start = pointAt(event)
    const committed = pageCanvas(api.design, api.pageIndex)
    const handle = (event.target as HTMLElement).closest("[data-resize-handle]")?.getAttribute("data-resize-handle") as ResizeHandle | null
    const rotate = Boolean((event.target as HTMLElement).closest("[data-rotate-handle]"))
    const hit = pickElement(committed.elements, start, 2 / zoom)
    const additive = event.shiftKey || event.ctrlKey || event.metaKey
    let ids = [...api.selectedIds]
    let gesture: ElementGesture | null = null
    let crop: string | null = null
    if ((handle || rotate) && ids.length) {
      gesture = { kind: rotate ? "rotate" : "resize", canvas: committed, ids, start, handle: handle ?? undefined }
    } else if (hit) {
      const cluster = clusteredSelection(api.design, api.pageIndex, [hit.id])
      ids = additive ? ids.includes(hit.id) ? ids.filter((id) => !cluster.includes(id)) : [...new Set([...ids, ...cluster])] : ids.includes(hit.id) ? ids : cluster
      api.select(ids)
      if (picture?.id === hit.id && pictureSize) crop = hit.id
      else if (ids.includes(hit.id)) gesture = { kind: "move", canvas: committed, ids, start }
    } else {
      if (!additive) { ids = []; api.select([]) }
      setMarquee({ ...start, width: 0, height: 0 })
    }
    pointer.current = { id: event.pointerId, start, canvas: committed, originalSelection: additive ? ids : [], gesture, crop, next: null }
    event.currentTarget.setPointerCapture(event.pointerId)
    onInteraction(true)
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    const active = pointer.current
    if (!active || active.id !== event.pointerId) return
    const point = pointAt(event)
    if (active.crop && pictureSize) {
      const original = active.canvas.elements.find((element) => element.id === active.crop)!
      const style = readImageStyle(original)
      const focus = panCrop(style, { x: point.x - active.start.x, y: point.y - active.start.y }, original, pictureSize, { x: style.flipX, y: style.flipY })
      active.next = { ...active.canvas, elements: active.canvas.elements.map((element) => element.id === original.id ? { ...element, style: { ...element.style, ...focus } } : element) }
      setLive(active.next)
    } else if (active.gesture) {
      const result = previewElementGesture(active.gesture, { point, shift: event.shiftKey, snap: snap && !event.altKey, grid, zoom, measure: api.measure })
      active.next = result.canvas
      setLive(result.canvas)
      setGuides(result.guides)
    } else setMarquee(rectFromPoints(active.start, point))
  }

  function finish(event: PointerEvent<HTMLDivElement>, cancel = false) {
    const active = pointer.current
    if (!active || active.id !== event.pointerId) return
    pointer.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (!cancel) {
      if (active.next) api.update((doc) => withPageCanvas(doc, api.pageIndex, active.next!))
      else if (!active.gesture && !active.crop) {
        const rect = rectFromPoints(active.start, pointAt(event))
        if (rect.width > 2 || rect.height > 2) api.select(clusteredSelection(api.design, api.pageIndex, [...active.originalSelection, ...elementsInRect(active.canvas, rect).map((element) => element.id)]))
      }
    }
    setLive(null); setMarquee(null); setGuides([]); onInteraction(false)
  }

  function acceptsDrop(event: DragEvent<HTMLDivElement>) {
    return hasBlockDragPayload(event.dataTransfer) || hasDesignDragItem(event.dataTransfer) || dragHasFiles(event.dataTransfer)
  }

  function drop(event: DragEvent<HTMLDivElement>) {
    if (!acceptsDrop(event)) return
    event.preventDefault()
    const at = pointAt(event)
    const files = pictureFilesFrom(event.dataTransfer)
    if (files.length) { void api.uploadFiles(files, { at }); return }
    const item = readDesignDragItem(event.dataTransfer)
    if (item) { api.insertElements([elementForItem(item, api.theme, api.design, api.measure)], { at }); return }
    const payload = readBlockDragPayload(event.dataTransfer)
    const element = payload ? blockToElement(payload.block, at, payload.index) : null
    if (!element) { api.notify("That drag did not carry a usable block."); return }
    api.insertElements([adaptDroppedElement(element, api.design, api.theme, api.measure)], { at })
  }

  const selectionStyle: CSSProperties | undefined = bounds ? { position: "absolute", left: bounds.x * zoom, top: bounds.y * zoom, width: bounds.width * zoom, height: bounds.height * zoom, transform: single ? `rotate(${single.rotation}deg)` : undefined, border: "1px solid #6d5ce8", pointerEvents: "none", zIndex: 3 } : undefined
  return <div ref={stage} tabIndex={0} role="application" aria-label={`Design page ${api.pageIndex + 1}`} className="relative shrink-0 outline-none shadow-xl" style={{ width: api.design.width * zoom, height: api.design.height * zoom, touchAction: "none" }} onPointerDown={begin} onPointerMove={move} onPointerUp={(event) => finish(event)} onPointerCancel={(event) => finish(event, true)} onLostPointerCapture={(event) => finish(event, true)} onKeyDown={(event) => {
    if (event.key === "Escape" && pointer.current) { pointer.current = null; setLive(null); setMarquee(null); setGuides([]); onInteraction(false); event.stopPropagation() }
  }} onDoubleClick={(event) => {
    const element = pickElement(canvas.elements, pointAt(event))
    if (element && (element.type === "text" || element.type === "shape")) onEdit(element.id)
  }} onDragOver={(event) => { if (acceptsDrop(event)) { event.preventDefault(); event.dataTransfer.dropEffect = "copy" } }} onDrop={drop} onContextMenu={(event) => {
    event.preventDefault()
    const hit = pickElement(canvas.elements, pointAt(event))
    if (hit && !api.selectedIds.includes(hit.id)) api.select(clusteredSelection(api.design, api.pageIndex, [hit.id]))
    onContext({ x: event.clientX, y: event.clientY })
  }}>
    <DesignPageView width={api.design.width} height={api.design.height} theme={api.design.theme} page={{ ...api.design.pages[api.pageIndex], elements: canvas.elements }} measure={api.measure} editingId={editingId} placeholders style={{ transform: `scale(${zoom})`, transformOrigin: "top left", pointerEvents: "none" }} />
    {grid ? <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: "radial-gradient(#8885 1px, transparent 1px)", backgroundSize: `${8 * zoom}px ${8 * zoom}px` }} /> : null}
    {guides.map((guide, index) => <div key={index} className="pointer-events-none absolute bg-fuchsia-500" style={guide.axis === "x" ? { left: guide.position * zoom, top: 0, height: "100%", width: 1 } : { top: guide.position * zoom, left: 0, width: "100%", height: 1 }} />)}
    {bounds && !editing ? <div style={selectionStyle}>
      {(single ? elementHandles(single) : CORNER_HANDLES).map((handle) => <button key={handle} type="button" className="canvas-handle" aria-label={`Resize ${handle}`} data-resize-handle={handle} style={{ position: "absolute", left: `${HANDLE_POSITION[handle][0] * 100}%`, top: `${HANDLE_POSITION[handle][1] * 100}%`, width: 10, height: 10, transform: "translate(-50%,-50%)", pointerEvents: "auto", cursor: handleCursor(handle, single?.rotation ?? 0) }} />)}
      <button type="button" className="canvas-handle" aria-label="Rotate selection" data-rotate-handle="true" style={{ position: "absolute", left: "50%", top: -28, width: 10, height: 10, pointerEvents: "auto", cursor: "grab", transform: "translateX(-50%)" }} />
    </div> : null}
    {marquee ? <div className="pointer-events-none absolute border border-primary bg-primary/10" style={{ left: marquee.x * zoom, top: marquee.y * zoom, width: marquee.width * zoom, height: marquee.height * zoom }} /> : null}
    {editing ? <TextEditorOverlay key={editing.id} element={editing} zoom={zoom} measure={api.measure} select="all" selectToken={0} onChange={(content) => api.update((doc) => {
      const page = pageCanvas(doc, api.pageIndex)
      return withPageCanvas(doc, api.pageIndex, { ...page, elements: page.elements.map((element) => element.id === editing.id ? growText({ ...element, content }, api.measure) : element) })
    }, { coalesce: `text:${editing.id}` })} onDone={() => { onEdit(null); stage.current?.focus() }} onUndo={onUndo} /> : null}
  </div>
}
