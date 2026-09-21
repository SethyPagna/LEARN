"use client"

/**
 * The free-form design canvas.
 *
 * This component deliberately owns no geometry. Every move, resize, rotate,
 * snap, reorder, group, align and undo step delegates to
 * `@/lib/studio/canvas-engine`, which is pure and unit tested — so what is
 * asserted in `src/tests/studio/canvas-engine.test.ts` is what runs here.
 *
 * What lives here is the browser half: pointer capture, the keyboard map, the
 * layers panel, save/draft state, and the Takram soft-tech surface styling
 * (rounded 12-16px corners, layered soft shadows, calm neutral surfaces with a
 * single restrained accent — the accent is the app's own `--primary` token, so
 * the canvas follows the learner's chosen accent instead of a new colour).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent as ReactDragEvent, type PointerEvent as ReactPointerEvent } from "react"
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpToLine,
  Check,
  ChevronDown,
  ChevronUp,
  ChevronsDown,
  ChevronsUp,
  Columns3,
  Copy,
  Download,
  Eye,
  EyeOff,
  Group,
  Image as ImageIcon,
  Layers,
  Link2,
  Loader2,
  Lock,
  Magnet,
  Maximize2,
  RotateCw,
  Rows3,
  Save,
  Square,
  Trash2,
  Type,
  Undo2,
  Redo2,
  Unlock,
  ZoomIn,
  ZoomOut,
} from "lucide-react"

import { api } from "../api"
import { SharePanel } from "../share-panel"
import { Panel } from "../ui"
import {
  addElement,
  alignElements,
  boundsOf,
  canvasDeepEqual,
  computeSnapGuides,
  createCanvasDoc,
  createElement,
  createHistory,
  distributeElements,
  duplicateElement,
  elementsInRect,
  fitText,
  groupElements,
  handlePoint,
  hitTest,
  moveElementToIndex,
  moveElements,
  normalizeCanvasDoc,
  removeElements,
  reorderElement,
  resizeElements,
  rotateElement,
  selectionCluster,
  serializeCanvas,
  ungroupElements,
  updateElement,
  type AlignMode,
  type CanvasDoc,
  type CanvasElement,
  type CanvasElementType,
  type DistributeAxis,
  type ResizeHandle,
  type ReorderAction,
  type SnapGuide,
} from "@/lib/studio/canvas-engine"
import { clearCanvasDraft, readCanvasDraft, shouldRestoreCanvasDraft, writeCanvasDraft } from "@/lib/studio/canvas-draft"
import { safeColor, safeNumber, sanitizeImageUrl } from "@/lib/studio/canvas-styles"
import { blockToElement, hasBlockDragPayload, readBlockDragPayload } from "@/lib/studio/block-drop"

const GRID_SIZE = 8
const SNAP_THRESHOLD = 6
const MIN_ZOOM = 0.25
const MAX_ZOOM = 4

/**
 * Canvases live in `editor_documents`, so this is the source pair the share API
 * is addressed with. The editor knows the record id it saved, not the
 * `content_items` id behind it, which is why the API accepts both.
 */
const CANVAS_SOURCE_TABLE = "editor_documents"

/**
 * The Takram soft-tech preset, scoped to this component.
 *
 * Everything reuses the app's existing semantic tokens (`--card`, `--border`,
 * `--primary`, `--muted`) so the canvas matches the rest of LEARN in both
 * themes; only the shape language (radius, shadow, motion) is defined here
 * because nothing else in the app needed it.
 */
const CANVAS_PRESET_CSS = `
.learn-canvas-soft {
  --canvas-radius: 16px;
  --canvas-radius-sm: 12px;
  --canvas-shadow: 0 1px 2px rgba(15, 23, 42, 0.04), 0 18px 40px -28px rgba(15, 23, 42, 0.35);
  --canvas-shadow-soft: 0 12px 28px -22px rgba(15, 23, 42, 0.4);
  --canvas-gap: 14px;
}
.learn-canvas-soft .canvas-panel {
  border: 0;
  border-radius: var(--canvas-radius);
  box-shadow: var(--canvas-shadow);
}
.learn-canvas-soft .canvas-sheet {
  border: 0;
  border-radius: var(--canvas-radius);
  box-shadow: var(--canvas-shadow);
}
.learn-canvas-soft .canvas-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px;
  border-radius: var(--canvas-radius-sm);
  background: var(--muted);
}
.learn-canvas-soft .canvas-tool {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 36px;
  padding: 0 12px;
  border: 0;
  border-radius: 10px;
  background: var(--card);
  color: var(--card-foreground);
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  transition: background 160ms ease, transform 160ms ease, box-shadow 160ms ease;
}
.learn-canvas-soft .canvas-tool:hover:not(:disabled) {
  background: var(--accent);
  color: var(--accent-foreground);
  box-shadow: var(--canvas-shadow-soft);
}
.learn-canvas-soft .canvas-tool:disabled {
  opacity: 0.5;
}
.learn-canvas-soft .canvas-tool[data-active="true"] {
  background: var(--primary);
  color: var(--primary-foreground);
}
.learn-canvas-soft .canvas-element {
  border-radius: var(--canvas-radius-sm);
  transition: box-shadow 180ms ease;
}
.learn-canvas-soft .canvas-element[data-static="false"]:hover {
  box-shadow: var(--canvas-shadow-soft);
}
.learn-canvas-soft .canvas-handle {
  border: 0;
  border-radius: 999px;
  background: var(--card);
  box-shadow: 0 0 0 1.5px var(--primary), 0 2px 6px rgba(15, 23, 42, 0.25);
}
/**
 * The dot stays 10px so the selection chrome stays quiet, but the *hit area* is
 * the 24px box below: a transparent ::after centred on the dot, which the
 * engine's hit test (target.closest("[data-resize-handle]")) resolves to this
 * same button because a pseudo-element belongs to its originating element.
 * Geometry, drag maths and the painted dot are untouched — only the surface a
 * finger or pointer has to find gets bigger. Coarse pointers get 32px, and
 * touch-action: none so a drag is not swallowed by the sheet's scrolling.
 */
.learn-canvas-soft .canvas-handle::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  width: 24px;
  height: 24px;
  transform: translate(-50%, -50%);
  border-radius: 999px;
  background: transparent;
}
/**
 * The rotate handle hangs 28px above the top edge, so on a coarse pointer its
 * enlarged box would lose the strip nearest the "n" resize handle — whichever
 * handle is painted last wins the overlap. Rotate is painted first, so it goes
 * on top: the dot a finger aims at is the dot that receives the gesture, and the
 * engine's own hit test (closest on data-resize-handle) sees no change.
 */
.learn-canvas-soft [data-rotate-handle] {
  z-index: 1;
}
@media (pointer: coarse) {
  .learn-canvas-soft .canvas-handle {
    touch-action: none;
  }
  .learn-canvas-soft .canvas-handle::after {
    width: 32px;
    height: 32px;
  }
}
.learn-canvas-soft .canvas-layer {
  border: 0;
  border-radius: var(--canvas-radius-sm);
  transition: background 160ms ease;
}
.learn-canvas-soft .canvas-layer[data-selected="true"] {
  background: var(--accent);
  color: var(--accent-foreground);
}
.learn-canvas-soft .canvas-layer[data-drop="true"] {
  box-shadow: inset 0 0 0 1.5px var(--primary);
}
`

// ---------------------------------------------------------------------------
// Sanitizers — the shared validators, so the share preview refuses exactly what
// this editor refuses (`@/lib/studio/canvas-styles`)
// ---------------------------------------------------------------------------

function safeEnum<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : undefined
}

function embedHost(raw: string): string | null {
  const value = sanitizeImageUrl(raw)
  if (!value) return null
  if (value.startsWith("data:")) return "inline data"
  try {
    return new URL(value).host
  } catch {
    return null
  }
}

function layerLabel(element: CanvasElement): string {
  const named = element.style?.name
  if (typeof named === "string" && named.trim()) return named.trim()
  const content = element.content.trim()
  if (content) return content.length > 32 ? `${content.slice(0, 32)}…` : content
  return element.type
}

// ---------------------------------------------------------------------------
// Text measurement for the engine's pure `fitText`
// ---------------------------------------------------------------------------

let measureContext: CanvasRenderingContext2D | null | undefined

/** Text wrap is real: `fitText` gets a font metric callback from a 2D context. */
function textMeasurer(font: string): (line: string) => number {
  if (typeof document === "undefined") return (line) => line.length * 8
  if (measureContext === undefined) measureContext = document.createElement("canvas").getContext("2d")
  const context = measureContext
  if (!context) return (line) => line.length * 8
  context.font = font
  return (line) => context.measureText(line).width
}

function elementFont(element: CanvasElement): { size: number; weight: number; family: string } {
  return {
    size: safeNumber(element.style?.fontSize, 8, 200) ?? (element.type === "text" ? 22 : 15),
    weight: safeNumber(element.style?.fontWeight, 100, 900) ?? (element.type === "text" ? 600 : 500),
    family: "Inter, ui-sans-serif, system-ui, sans-serif",
  }
}

function boxStyleFor(element: CanvasElement): CSSProperties {
  const style: CSSProperties = {
    position: "absolute",
    left: element.x,
    top: element.y,
    width: element.width,
    height: element.height,
    transform: `rotate(${element.rotation}deg)`,
    transformOrigin: "center",
  }
  const background = safeColor(element.style?.backgroundColor ?? element.style?.background)
  const border = safeColor(element.style?.borderColor)
  const borderWidth = safeNumber(element.style?.borderWidth, 0, 24)
  const radius = safeNumber(element.style?.borderRadius, 0, 96)
  const opacity = safeNumber(element.style?.opacity, 0.05, 1)
  if (background) style.background = background
  if (border && borderWidth) {
    style.borderStyle = "solid"
    style.borderWidth = `${borderWidth}px`
    style.borderColor = border
  }
  if (radius !== undefined) style.borderRadius = radius
  if (opacity !== undefined) style.opacity = opacity
  return style
}

// ---------------------------------------------------------------------------
// Starter document
// ---------------------------------------------------------------------------

function starterDoc(): CanvasDoc {
  return createCanvasDoc({
    name: "Untitled canvas",
    width: 1080,
    height: 720,
    background: "#ffffff",
    elements: [
      createElement({
        id: "layer-title",
        type: "text",
        x: 96,
        y: 88,
        width: 520,
        height: 120,
        content: "Design canvas",
        style: { fontSize: 44, fontWeight: 600, color: "#1f2937" },
      }),
      createElement({
        id: "layer-note",
        type: "shape",
        x: 96,
        y: 248,
        width: 320,
        height: 160,
        content: "Drag me. Resize from any corner, rotate from the handle above.",
        style: { backgroundColor: "#eef2ff", borderRadius: 16, color: "#3730a3" },
      }),
      createElement({
        id: "layer-placeholder",
        type: "image",
        x: 640,
        y: 248,
        width: 288,
        height: 200,
        content: "",
        style: { backgroundColor: "#f1f5f9", borderRadius: 16, label: "Image by URL" },
      }),
    ],
  })
}

// ---------------------------------------------------------------------------
// Gestures
// ---------------------------------------------------------------------------

type Gesture =
  | { kind: "move"; ids: string[]; primaryId: string }
  | { kind: "resize"; ids: string[]; handle: ResizeHandle }
  | { kind: "rotate"; id: string }
  | { kind: "marquee" }

interface ActiveGesture {
  gesture: Gesture
  pointerId: number
  start: { x: number; y: number }
  startDoc: CanvasDoc
  startAngle: number
}

interface LayerDragState {
  from: string
  over: string
}

export function CanvasEditorView() {
  const stageRef = useRef<HTMLDivElement>(null)
  const gestureRef = useRef<ActiveGesture | null>(null)
  const marqueeRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null)
  const lastSavedRef = useRef<CanvasDoc | null>(null)
  const autosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [history, setHistory] = useState(() => createHistory(starterDoc()))
  const [liveDoc, setLiveDoc] = useState<CanvasDoc | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [guides, setGuides] = useState<SnapGuide[]>([])
  const [marquee, setMarquee] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [snapEnabled, setSnapEnabled] = useState(true)
  const [gridEnabled, setGridEnabled] = useState(true)
  const [saveState, setSaveState] = useState<"loading" | "idle" | "saving" | "saved" | "error">("loading")
  const [status, setStatus] = useState("")
  const [recordId, setRecordId] = useState("")
  const [insertOpen, setInsertOpen] = useState(false)
  const [insertKind, setInsertKind] = useState<Extract<CanvasElementType, "image" | "embed">>("image")
  const [insertUrl, setInsertUrl] = useState("")
  const [renameId, setRenameId] = useState("")
  const [renameValue, setRenameValue] = useState("")
  const [layerDrag, setLayerDrag] = useState<LayerDragState | null>(null)

  const doc = liveDoc ?? history.present
  const selection = useMemo(() => doc.elements.filter((element) => selectedIds.includes(element.id)), [doc.elements, selectedIds])
  const selectionBounds = useMemo(() => boundsOf(selection), [selection])
  const chromeScale = 1 / zoom

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  const persist = useCallback(
    async (next: CanvasDoc, id: string) => {
      setSaveState("saving")
      try {
        const response = await api<{ item: { id: string; updated_at?: string } }>("/api/canvas", {
          method: "PUT",
          body: JSON.stringify({ ...(id ? { id } : {}), title: next.name, content: next }),
        })
        lastSavedRef.current = next
        setRecordId(response.item?.id || id)
        clearCanvasDraft()
        setSaveState("saved")
        setStatus("")
      } catch (error) {
        // The draft is what makes "never lose work" true, so it is written on
        // the failure path as well as on every edit.
        writeCanvasDraft({ ...(id ? { id } : {}), title: next.name, canvas: next, updatedAt: new Date().toISOString(), reason: "save-failed" })
        setSaveState("error")
        setStatus(error instanceof Error ? `${error.message} Your work is kept in a local draft.` : "Save failed. Your work is kept in a local draft.")
      }
    },
    [],
  )

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const response = await api<{ items: { id: string; title?: string; content?: unknown; updated_at?: string }[] }>("/api/canvas")
        if (cancelled) return
        const item = response.items[0]
        const local = readCanvasDraft()
        if (local && shouldRestoreCanvasDraft(local, item?.updated_at)) {
          setHistory(createHistory(local.canvas))
          setRecordId(local.id || item?.id || "")
          lastSavedRef.current = null
          setStatus(local.reason === "save-failed" ? "Recovered a local draft from a failed save." : "Recovered an unsaved local draft.")
          setSaveState("idle")
          return
        }
        const serverDoc = item ? normalizeCanvasDoc(item.content) : starterDoc()
        setHistory(createHistory(serverDoc))
        // Opening the view must not create a row: nothing is written until the
        // first real edit differs from what the server already has.
        lastSavedRef.current = serverDoc
        setRecordId(item?.id || "")
        setSaveState("idle")
      } catch (error) {
        if (cancelled) return
        setSaveState("error")
        setStatus(error instanceof Error ? error.message : "Unable to load the canvas.")
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  // Autosave: one debounced write per settled edit, plus a draft on every change.
  useEffect(() => {
    if (saveState === "loading") return
    if (liveDoc) return
    if (lastSavedRef.current && canvasDeepEqual(lastSavedRef.current, doc)) return
    writeCanvasDraft({ ...(recordId ? { id: recordId } : {}), title: doc.name, canvas: doc, updatedAt: new Date().toISOString(), reason: "unsaved" })
    if (autosaveRef.current) clearTimeout(autosaveRef.current)
    const pending = doc
    const id = recordId
    autosaveRef.current = setTimeout(() => {
      void persist(pending, id)
    }, 1100)
    return () => {
      if (autosaveRef.current) clearTimeout(autosaveRef.current)
    }
    // `doc` is the only trigger: identity changes exactly when an edit lands.
  }, [doc, liveDoc, persist, recordId, saveState])

  const commit = useCallback((next: CanvasDoc) => {
    setHistory((current) => current.commit(next))
  }, [])

  // -------------------------------------------------------------------------
  // Selection helpers
  // -------------------------------------------------------------------------

  /** Every id that moves with the given ids: their groups, expanded. */
  function clusterIdsFor(target: CanvasDoc, ids: string[]) {
    const set = new Set<string>()
    for (const id of ids) for (const member of selectionCluster(target, id)) set.add(member)
    return [...set]
  }

  // -------------------------------------------------------------------------
  // Pointer gestures
  // -------------------------------------------------------------------------

  function toCanvasPoint(event: { clientX: number; clientY: number }) {
    const rect = stageRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return { x: (event.clientX - rect.left) / zoom, y: (event.clientY - rect.top) / zoom }
  }

  function beginGesture(event: ReactPointerEvent<HTMLDivElement>, gesture: Gesture, start: { x: number; y: number }) {
    const center = (() => {
      if (gesture.kind !== "rotate") return { x: 0, y: 0 }
      const element = doc.elements.find((candidate) => candidate.id === gesture.id)
      return element ? { x: element.x + element.width / 2, y: element.y + element.height / 2 } : { x: 0, y: 0 }
    })()
    gestureRef.current = {
      gesture,
      pointerId: event.pointerId,
      start,
      startDoc: history.present,
      startAngle: Math.atan2(start.y - center.y, start.x - center.x) * (180 / Math.PI),
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onStagePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    event.preventDefault()
    const target = event.target as HTMLElement
    const start = toCanvasPoint(event)
    const resizeHandle = target.closest("[data-resize-handle]")?.getAttribute("data-resize-handle") as ResizeHandle | null
    const isRotateHandle = Boolean(target.closest("[data-rotate-handle]"))

    // Rotation is per-element: the handle only exists (and is only honoured)
    // for a single-element selection.
    if (isRotateHandle) {
      if (selectionIds.length !== 1) return
      beginGesture(event, { kind: "rotate", id: selectionIds[0] }, start)
      return
    }
    if (resizeHandle && selectedIds.length) {
      beginGesture(event, { kind: "resize", ids: clusterIdsFor(doc, selectedIds), handle: resizeHandle }, start)
      return
    }

    // The engine's hit test — not the DOM — decides what the pointer grabbed,
    // so locked and hidden elements and rotated shapes behave as tested.
    const hit = hitTest(doc, start.x, start.y)
    const additive = event.shiftKey || event.metaKey || event.ctrlKey
    if (!hit) {
      if (!additive) setSelectedIds([])
      beginGesture(event, { kind: "marquee" }, start)
      marqueeRef.current = { x: start.x, y: start.y, width: 0, height: 0 }
      setMarquee(marqueeRef.current)
      return
    }

    const cluster = selectionCluster(doc, hit.id)
    let nextSelection = selectedIds
    let moveIds: string[] = []
    if (additive) {
      const removing = selectedIds.includes(hit.id)
      nextSelection = removing ? selectedIds.filter((id) => !cluster.includes(id)) : [...new Set([...selectedIds, ...cluster])]
      moveIds = removing ? [] : cluster
    } else if (selectedIds.includes(hit.id)) {
      moveIds = clusterIdsFor(doc, selectedIds)
    } else {
      nextSelection = cluster
      moveIds = cluster
    }
    setSelectedIds(nextSelection)
    if (moveIds.length) beginGesture(event, { kind: "move", ids: moveIds, primaryId: hit.id }, start)
  }

  function onStagePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const active = gestureRef.current
    if (!active || active.pointerId !== event.pointerId) return
    const point = toCanvasPoint(event)
    const dx = point.x - active.start.x
    const dy = point.y - active.start.y
    const gesture = active.gesture

    if (gesture.kind === "marquee") {
      const rect = { x: active.start.x, y: active.start.y, width: dx, height: dy }
      marqueeRef.current = rect
      setMarquee(rect)
      return
    }

    if (gesture.kind === "move") {
      const moved = moveElements(active.startDoc, gesture.ids, dx, dy)
      const snap = snapEnabled
        ? computeSnapGuides(moved, gesture.primaryId, {
            threshold: SNAP_THRESHOLD,
            grid: GRID_SIZE,
            gridSnap: gridEnabled,
            ignoreIds: gesture.ids,
          })
        : { guides: [], dx: 0, dy: 0 }
      const corrected = snap.dx || snap.dy ? moveElements(moved, gesture.ids, snap.dx, snap.dy) : moved
      setLiveDoc(corrected)
      setGuides(snap.guides)
      return
    }

    if (gesture.kind === "resize") {
      setLiveDoc(resizeElements(active.startDoc, gesture.ids, gesture.handle, dx, dy))
      return
    }

    if (gesture.kind === "rotate") {
      const element = active.startDoc.elements.find((candidate) => candidate.id === gesture.id)
      if (!element) return
      const center = { x: element.x + element.width / 2, y: element.y + element.height / 2 }
      const angle = Math.atan2(point.y - center.y, point.x - center.x) * (180 / Math.PI)
      const delta = angle - active.startAngle
      setLiveDoc(rotateElement(active.startDoc, gesture.id, delta, { snap: event.shiftKey, snapDegrees: 15 }))
      setGuides([])
    }
  }

  function endGesture(event: ReactPointerEvent<HTMLDivElement>) {
    const active = gestureRef.current
    if (!active || active.pointerId !== event.pointerId) return
    gestureRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)

    if (active.gesture.kind === "marquee") {
      const rect = marqueeRef.current
      marqueeRef.current = null
      setMarquee(null)
      if (rect && (Math.abs(rect.width) > 2 || Math.abs(rect.height) > 2)) {
        const inside = elementsInRect(active.startDoc, rect).map((element) => element.id)
        setSelectedIds(event.shiftKey ? [...new Set([...selectedIds, ...inside])] : inside)
      }
      return
    }

    if (liveDoc) commit(liveDoc)
    setLiveDoc(null)
    setGuides([])
  }

  // -------------------------------------------------------------------------
  // Drops — an AI-formatted block dragged in from `ai-block-renderer.tsx`
  // -------------------------------------------------------------------------

  /**
   * Only a drag carrying a block is a drop candidate, so the canvas does not
   * swallow the layer-panel drags that share this stage. `dragover` has to
   * `preventDefault()` for `drop` to fire at all, and it can only ask about the
   * drag's types — the payload itself stays unreadable until the drop.
   */
  function onStageDragOver(event: ReactDragEvent<HTMLDivElement>) {
    if (!hasBlockDragPayload(event.dataTransfer)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = "copy"
  }

  /**
   * Place the dragged block at the pointer, as one undoable step.
   *
   * The conversion, the position and the snapping are all engine calls, so what
   * lands here is the same document a pointer gesture would produce: nothing is
   * written twice and `commit` records exactly one history entry — and, having
   * no drag gesture to end, the new element is selected immediately.
   */
  function onStageDrop(event: ReactDragEvent<HTMLDivElement>) {
    if (!hasBlockDragPayload(event.dataTransfer)) return
    // Stops the browser's default of navigating to the dragged data.
    event.preventDefault()
    const dropped = readBlockDragPayload(event.dataTransfer)
    if (!dropped) {
      setStatus("That drag did not carry a usable block.")
      return
    }
    const point = toCanvasPoint(event)
    const element = blockToElement(dropped.block, point, dropped.index)
    if (!element) {
      setStatus("That block cannot be placed on the canvas.")
      return
    }

    let next = addElement(doc, element)
    const snap = snapEnabled
      ? computeSnapGuides(next, element.id, {
          threshold: SNAP_THRESHOLD,
          grid: GRID_SIZE,
          gridSnap: gridEnabled,
          ignoreIds: [element.id],
        })
      : { guides: [], dx: 0, dy: 0 }
    if (snap.dx || snap.dy) next = moveElements(next, [element.id], snap.dx, snap.dy)

    commit(next)
    setSelectedIds([element.id])
    setStatus("")
  }

  // -------------------------------------------------------------------------
  // Commands
  // -------------------------------------------------------------------------

  function insertElement(type: CanvasElementType, content = "") {
    const base = createElement({
      type,
      content,
      x: 120 + (doc.elements.length % 6) * 24,
      y: 120 + (doc.elements.length % 6) * 24,
      width: type === "text" ? 360 : type === "shape" ? 220 : 280,
      height: type === "text" ? 96 : type === "shape" ? 160 : 180,
      style:
        type === "text"
          ? { fontSize: 24, fontWeight: 600, color: "#1f2937" }
          : type === "embed"
            ? { backgroundColor: "#f8fafc", borderRadius: 16, label: "Embed placeholder" }
            : { backgroundColor: "#eef2ff", borderRadius: 16, color: "#3730a3" },
    })
    const next = addElement(doc, base)
    commit(next)
    setSelectedIds([base.id])
    setStatus("")
  }

  function insertFromUrl() {
    const url = sanitizeImageUrl(insertUrl)
    if (!url) {
      setStatus("Enter an http(s) URL or a data:image/… value. Other schemes are rejected.")
      return
    }
    if (insertKind === "image") {
      insertElement("image", url)
    } else {
      insertElement("embed", url)
    }
    setInsertUrl("")
    setInsertOpen(false)
    setStatus("")
  }

  function applyTransform(next: CanvasDoc) {
    commit(next)
    setStatus("")
  }

  function removeSelection() {
    if (!selectedIds.length) return
    applyTransform(removeElements(doc, clusterIdsFor(doc, selectedIds)))
    setSelectedIds([])
  }

  function duplicateSelection() {
    if (selectedIds.length !== 1) return
    const result = duplicateElement(doc, selectedIds[0])
    if (!result.id) return
    applyTransform(result.doc)
    setSelectedIds([result.id])
  }

  function orderSelection(action: ReorderAction) {
    if (selectedIds.length !== 1) return
    applyTransform(reorderElement(doc, selectedIds[0], action))
  }

  function groupSelection() {
    if (selectedIds.length < 2) return
    applyTransform(groupElements(doc, clusterIdsFor(doc, selectedIds)))
  }

  function ungroupSelection() {
    if (!selectedIds.length) return
    let next = doc
    for (const id of clusterIdsFor(doc, selectedIds)) next = ungroupElements(next, id)
    applyTransform(next)
  }

  function setElementFlag(id: string, patch: Partial<CanvasElement>) {
    applyTransform(updateElement(doc, id, patch))
  }

  function toggleSnap() {
    setSnapEnabled((current) => !current)
  }

  function toggleGrid() {
    setGridEnabled((current) => !current)
  }

  function downloadJson() {
    const blob = new Blob([serializeCanvas(doc)], { type: "application/json" })
    const href = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = href
    anchor.download = `${doc.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "canvas"}.learn-canvas.json`
    anchor.click()
    URL.revokeObjectURL(href)
  }

  // -------------------------------------------------------------------------
  // Keyboard
  // -------------------------------------------------------------------------

  useEffect(() => {
    function isTyping(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) return false
      if (target.isContentEditable) return true
      return ["input", "textarea", "select"].includes(target.tagName.toLowerCase())
    }

    function onKeyDown(event: KeyboardEvent) {
      if (isTyping(event.target)) return
      // A gesture owns the document while a pointer is down; ignoring keys here
      // keeps `startDoc` the single source of truth for the drag.
      if (gestureRef.current) return
      const meta = event.metaKey || event.ctrlKey
      const current = history.present

      if (meta && event.key.toLowerCase() === "z") {
        event.preventDefault()
        setHistory((entry) => (event.shiftKey ? entry.redo() : entry.undo()))
        return
      }
      if (meta && event.key.toLowerCase() === "y") {
        event.preventDefault()
        setHistory((entry) => entry.redo())
        return
      }
      if (meta && event.key.toLowerCase() === "g") {
        event.preventDefault()
        if (event.shiftKey) {
          let next = current
          for (const id of clusterIdsFor(current, selectedIds)) next = ungroupElements(next, id)
          applyTransform(next)
        } else {
          applyTransform(groupElements(current, clusterIdsFor(current, selectedIds)))
        }
        return
      }
      if (meta && event.key.toLowerCase() === "d") {
        event.preventDefault()
        duplicateSelection()
        return
      }
      if (meta && event.key.toLowerCase() === "a") {
        event.preventDefault()
        setSelectedIds(current.elements.filter((element) => !element.locked && !element.hidden).map((element) => element.id))
        return
      }
      if (event.key === "Escape") {
        setSelectedIds([])
        setGuides([])
        return
      }
      if (selectionIds.length) {
        const step = event.shiftKey ? 10 : 1
        const nudge: Record<string, [number, number]> = {
          ArrowLeft: [-step, 0],
          ArrowRight: [step, 0],
          ArrowUp: [0, -step],
          ArrowDown: [0, step],
        }
        const delta = nudge[event.key]
        if (delta) {
          event.preventDefault()
          applyTransform(moveElements(current, clusterIdsFor(current, selectionIds), delta[0], delta[1]))
          return
        }
        if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault()
          applyTransform(removeElements(current, clusterIdsFor(current, selectionIds)))
          setSelectedIds([])
          return
        }
        if (event.key === "[" || event.key === "]") {
          if (selectionIds.length !== 1) return
          event.preventDefault()
          const forward = event.key === "]"
          const action: ReorderAction = event.shiftKey ? (forward ? "front" : "back") : forward ? "forward" : "backward"
          applyTransform(reorderElement(current, selectionIds[0], action))
        }
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  })

  const selectionIds = clusterIdsFor(doc, selectedIds)

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const saveBadge = {
    loading: { label: "Loading", icon: Loader2, tone: "text-muted-foreground" },
    idle: { label: "Draft kept locally", icon: Save, tone: "text-muted-foreground" },
    saving: { label: "Saving…", icon: Loader2, tone: "text-muted-foreground" },
    saved: { label: "Saved", icon: Check, tone: "text-success" },
    error: { label: "Save failed — draft kept", icon: AlertTriangle, tone: "text-destructive" },
  }[saveState]

  return (
    <div className="learn-canvas-soft grid gap-4 xl:grid-cols-[1fr_312px]">
      <style>{CANVAS_PRESET_CSS}</style>

      <Panel className="canvas-panel p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <label className="flex items-center gap-2">
              <span className="sr-only">Canvas name</span>
              <input
                value={doc.name}
                onChange={(event) => commit({ ...doc, name: event.target.value })}
                className="w-full min-w-0 bg-transparent text-2xl font-semibold tracking-tight text-foreground outline-none"
                placeholder="Untitled canvas"
              />
            </label>
            <p className={`mt-1 inline-flex items-center gap-1.5 text-xs font-semibold ${saveBadge.tone}`}>
              <saveBadge.icon className={`h-3.5 w-3.5 ${saveState === "loading" || saveState === "saving" ? "animate-spin" : ""}`} />
              {saveBadge.label}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={downloadJson} className="canvas-tool">
              <Download className="h-4 w-4" />
              Download JSON
            </button>
            <button type="button" onClick={() => setHistory((entry) => entry.undo())} disabled={!history.canUndo} className="canvas-tool" title="Undo (Cmd/Ctrl+Z)">
              <Undo2 className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => setHistory((entry) => entry.redo())} disabled={!history.canRedo} className="canvas-tool" title="Redo (Shift+Cmd/Ctrl+Z)">
              <Redo2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        <SharePanel
          className="mb-3"
          sourceTable={CANVAS_SOURCE_TABLE}
          sourceId={recordId}
          triggerClassName="canvas-tool"
          requiresSourceMessage="This design is not saved yet. A share link points at a stored canvas, so it can be created once the first edit is saved."
        />

        <div className="canvas-toolbar mb-3">
          <button type="button" onClick={() => insertElement("text", "New text")} className="canvas-tool">
            <Type className="h-4 w-4" />
            Text
          </button>
          <button type="button" onClick={() => insertElement("shape", "Shape")} className="canvas-tool">
            <Square className="h-4 w-4" />
            Shape
          </button>
          <button
            type="button"
            onClick={() => {
              setInsertKind("image")
              setInsertOpen(true)
            }}
            className="canvas-tool"
          >
            <ImageIcon className="h-4 w-4" />
            Image
          </button>
          <button
            type="button"
            onClick={() => {
              setInsertKind("embed")
              setInsertOpen(true)
            }}
            className="canvas-tool"
          >
            <Link2 className="h-4 w-4" />
            Embed
          </button>

          <span className="mx-1 w-px self-stretch bg-border" aria-hidden />

          {(["left", "center", "right", "top", "middle", "bottom"] as AlignMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => applyTransform(alignElements(doc, clusterIdsFor(doc, selectedIds), mode))}
              disabled={selectionIds.length < 2}
              className="canvas-tool capitalize"
              title={`Align ${mode}`}
            >
              {mode}
            </button>
          ))}
          {(["horizontal", "vertical"] as DistributeAxis[]).map((axis) => (
            <button
              key={axis}
              type="button"
              onClick={() => applyTransform(distributeElements(doc, clusterIdsFor(doc, selectedIds), axis))}
              disabled={selectionIds.length < 3}
              className="canvas-tool"
              title={`Distribute ${axis}`}
            >
              {axis === "horizontal" ? <Columns3 className="h-4 w-4" /> : <Rows3 className="h-4 w-4" />}
            </button>
          ))}

          <span className="mx-1 w-px self-stretch bg-border" aria-hidden />

          <button type="button" onClick={groupSelection} disabled={selectionIds.length < 2} className="canvas-tool" title="Group (Cmd/Ctrl+G)">
            <Group className="h-4 w-4" />
            Group
          </button>
          <button type="button" onClick={ungroupSelection} disabled={!selectionIds.length} className="canvas-tool" title="Ungroup (Shift+Cmd/Ctrl+G)">
            <Group className="h-4 w-4" />
            Ungroup
          </button>
          <button type="button" onClick={() => orderSelection("front")} disabled={selectionIds.length !== 1} className="canvas-tool" title="Bring to front">
            <ArrowUpToLine className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => orderSelection("forward")} disabled={selectionIds.length !== 1} className="canvas-tool" title="Bring forward (])">
            <ChevronsUp className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => orderSelection("backward")} disabled={selectionIds.length !== 1} className="canvas-tool" title="Send backward ([)">
            <ChevronsDown className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => orderSelection("back")} disabled={selectionIds.length !== 1} className="canvas-tool" title="Send to back">
            <ArrowDownToLine className="h-4 w-4" />
          </button>
          <button type="button" onClick={duplicateSelection} disabled={selectionIds.length !== 1} className="canvas-tool" title="Duplicate (Cmd/Ctrl+D)">
            <Copy className="h-4 w-4" />
          </button>
          <button type="button" onClick={removeSelection} disabled={!selectionIds.length} className="canvas-tool" title="Delete selected">
            <Trash2 className="h-4 w-4" />
          </button>

          <span className="mx-1 w-px self-stretch bg-border" aria-hidden />

          <button type="button" data-active={snapEnabled} onClick={toggleSnap} className="canvas-tool" title="Toggle alignment snapping">
            <Magnet className="h-4 w-4" />
            Snap
          </button>
          <button type="button" data-active={gridEnabled} onClick={toggleGrid} className="canvas-tool" title="Toggle 8px grid snapping">
            Grid
          </button>
          <button type="button" onClick={() => setZoom((value) => Math.max(MIN_ZOOM, Number((value - 0.1).toFixed(2))))} className="canvas-tool" title="Zoom out">
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="inline-flex h-9 items-center px-1 text-xs font-semibold text-muted-foreground">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom((value) => Math.min(MAX_ZOOM, Number((value + 0.1).toFixed(2))))} className="canvas-tool" title="Zoom in">
            <ZoomIn className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setZoom(1)} className="canvas-tool" title="Reset zoom">
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>

        {insertOpen ? (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-[12px] bg-muted p-3">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{insertKind === "image" ? "Image URL" : "Embed URL"}</span>
            <input
              value={insertUrl}
              onChange={(event) => setInsertUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") insertFromUrl()
              }}
              placeholder="https://… or data:image/png;base64,…"
              className="h-9 min-w-[220px] flex-1 rounded-[10px] bg-card px-3 text-sm text-foreground outline-none ring-1 ring-border focus:ring-2 focus:ring-primary/40"
            />
            <button type="button" onClick={insertFromUrl} className="canvas-tool">
              Add
            </button>
            <button type="button" onClick={() => setInsertOpen(false)} className="canvas-tool">
              Cancel
            </button>
            <p className="w-full text-xs text-muted-foreground">
              Only http(s) and data:image URLs are accepted. Embeds render as a labelled placeholder — no remote document is loaded.
            </p>
          </div>
        ) : null}

        {status ? <p className="mb-3 rounded-[12px] bg-warning/15 p-3 text-sm text-warning-foreground dark:text-warning">{status}</p> : null}

        <div className="canvas-sheet max-h-[68vh] overflow-auto bg-muted/50 p-4">
          <div
            ref={stageRef}
            onPointerDown={onStagePointerDown}
            onPointerMove={onStagePointerMove}
            onPointerUp={endGesture}
            onPointerCancel={endGesture}
            onDragOver={onStageDragOver}
            onDrop={onStageDrop}
            className="relative touch-none select-none shadow-sm"
            style={{
              width: doc.width,
              height: doc.height,
              background: doc.background,
              transform: `scale(${zoom})`,
              transformOrigin: "top left",
              borderRadius: 12,
            }}
          >
            {doc.elements.map((element) =>
              element.hidden ? null : <CanvasElementView key={element.id} element={element} />
            )}

            {guides.map((guide) => (
              <div
                key={`${guide.axis}-${guide.kind}-${guide.position}-${guide.targetId ?? ""}`}
                className="pointer-events-none absolute bg-primary/70"
                style={
                  guide.axis === "x"
                    ? { left: guide.position, top: 0, width: chromeScale, height: doc.height }
                    : { left: 0, top: guide.position, height: chromeScale, width: doc.width }
                }
              />
            ))}

            {marquee ? (
              <div
                className="pointer-events-none absolute rounded-[8px] border border-primary/60 bg-primary/10"
                style={{
                  left: Math.min(marquee.x, marquee.x + marquee.width),
                  top: Math.min(marquee.y, marquee.y + marquee.height),
                  width: Math.abs(marquee.width),
                  height: Math.abs(marquee.height),
                }}
              />
            ) : null}

            {selection.map((element) => (
              <div
                key={`outline-${element.id}`}
                className="pointer-events-none absolute"
                style={{ ...outlineStyle(element), outline: `${chromeScale}px solid var(--primary)`, outlineOffset: 2 * chromeScale }}
              />
            ))}

            {selection.length === 1 ? (
              <>
                <RotationHandle element={selection[0]} scale={chromeScale} />
                {RESIZE_HANDLES.map((handle) => (
                  <ResizeHandleDot key={handle} element={selection[0]} handle={handle} scale={chromeScale} />
                ))}
              </>
            ) : null}

            {selection.length > 1 && selectionBounds ? (
              <>
                <div
                  className="pointer-events-none absolute border border-dashed border-primary/70"
                  style={{
                    left: selectionBounds.x,
                    top: selectionBounds.y,
                    width: selectionBounds.width,
                    height: selectionBounds.height,
                    borderRadius: 8,
                    borderWidth: chromeScale,
                  }}
                />
                {RESIZE_HANDLES.map((handle) => (
                  <SelectionHandleDot key={handle} handle={handle} bounds={selectionBounds} scale={chromeScale} />
                ))}
              </>
            ) : null}
          </div>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          Drag to move, handles to resize (rotated resize keeps the opposite edge fixed), the top handle to rotate — hold Shift while rotating to snap to 15°.
          Arrows nudge, Shift+Arrows nudge 10px, [ / ] reorder, Cmd/Ctrl+Z undoes. Drop a formatted AI block here to place it on the canvas.
        </p>
      </Panel>

      <Panel className="canvas-panel flex max-h-[80vh] flex-col p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="inline-flex items-center gap-2 font-semibold text-foreground">
            <Layers className="h-4 w-4 text-muted-foreground" />
            Layers
          </h3>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">{doc.elements.length}</span>
        </div>
        <ul className="min-h-0 flex-1 space-y-1.5 overflow-auto pr-1">
          {[...doc.elements].sort((left, right) => right.z - left.z).map((element, index, sorted) => (
            <li
              key={element.id}
              draggable
              onDragStart={() => setLayerDrag({ from: element.id, over: element.id })}
              onDragOver={(event) => {
                event.preventDefault()
                setLayerDrag((current) => (current ? { ...current, over: element.id } : current))
              }}
              onDrop={(event) => {
                event.preventDefault()
                if (layerDrag && layerDrag.from !== element.id) {
                  const targetStackIndex = sorted.length - 1 - index
                  applyTransform(moveElementToIndex(doc, layerDrag.from, targetStackIndex))
                }
                setLayerDrag(null)
              }}
              onDragEnd={() => setLayerDrag(null)}
              data-selected={selectedIds.includes(element.id)}
              data-drop={layerDrag?.over === element.id && layerDrag.from !== element.id}
              className="canvas-layer flex items-center gap-1.5 bg-background p-1.5"
            >
              <button
                type="button"
                onClick={() => setSelectedIds(selectionCluster(doc, element.id))}
                className="min-w-0 flex-1 truncate px-1 text-left text-sm font-medium"
                title={layerLabel(element)}
              >
                {layerLabel(element)}
              </button>
              {renameId === element.id ? (
                <input
                  autoFocus
                  aria-label="Layer name"
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      applyTransform(updateElement(doc, element.id, { style: { ...element.style, name: renameValue } }))
                      setRenameId("")
                    }
                    if (event.key === "Escape") setRenameId("")
                  }}
                  onBlur={() => {
                    applyTransform(updateElement(doc, element.id, { style: { ...element.style, name: renameValue } }))
                    setRenameId("")
                  }}
                  className="h-7 w-24 rounded-[8px] bg-card px-2 text-xs outline-none ring-1 ring-border focus:ring-2 focus:ring-primary/40"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setRenameId(element.id)
                    setRenameValue(layerLabel(element))
                  }}
                  className="h-7 w-7 rounded-[8px] text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  title="Rename layer"
                >
                  Aa
                </button>
              )}
              <button
                type="button"
                onClick={() => setElementFlag(element.id, { locked: !element.locked })}
                className="h-7 w-7 rounded-[8px] text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                title={element.locked ? "Unlock layer" : "Lock layer"}
              >
                {element.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => setElementFlag(element.id, { hidden: !element.hidden })}
                className="h-7 w-7 rounded-[8px] text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                title={element.hidden ? "Show layer" : "Hide layer"}
              >
                {element.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => applyTransform(moveElementToIndex(doc, element.id, element.z + 1))}
                disabled={element.z === doc.elements.length - 1}
                className="h-7 w-7 rounded-[8px] text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
                title="Move layer up"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => applyTransform(moveElementToIndex(doc, element.id, element.z - 1))}
                disabled={element.z === 0}
                className="h-7 w-7 rounded-[8px] text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
                title="Move layer down"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
          {!doc.elements.length ? (
            <li className="rounded-[12px] border border-dashed border-border p-3 text-sm text-muted-foreground">
              No layers yet. Add text, a shape, or an image from the toolbar.
            </li>
          ) : null}
        </ul>
        <div className="mt-3 rounded-[12px] bg-muted p-3 text-xs leading-5 text-muted-foreground">
          <p className="font-semibold text-foreground">Open format</p>
          <p className="mt-1">“Download JSON” writes the versioned `LEARN canvas` document this editor reads back — the same bytes the vault stores.</p>
          <p className="mt-1">
            Geometry, ordering and history are computed by `canvas-engine.ts`, which is pure and unit tested.
          </p>
        </div>
      </Panel>
    </div>
  )
}

const RESIZE_HANDLES: ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"]

const HANDLE_OFFSET: Record<ResizeHandle, { x: number; y: number; cursor: string }> = {
  nw: { x: 0, y: 0, cursor: "nwse-resize" },
  n: { x: 0.5, y: 0, cursor: "ns-resize" },
  ne: { x: 1, y: 0, cursor: "nesw-resize" },
  e: { x: 1, y: 0.5, cursor: "ew-resize" },
  se: { x: 1, y: 1, cursor: "nwse-resize" },
  s: { x: 0.5, y: 1, cursor: "ns-resize" },
  sw: { x: 0, y: 1, cursor: "nesw-resize" },
  w: { x: 0, y: 0.5, cursor: "ew-resize" },
}

function outlineStyle(element: CanvasElement): CSSProperties {
  return {
    left: element.x,
    top: element.y,
    width: element.width,
    height: element.height,
    transform: `rotate(${element.rotation}deg)`,
    transformOrigin: "center",
    borderRadius: 12,
  }
}

function ResizeHandleDot({ element, handle, scale }: { element: CanvasElement; handle: ResizeHandle; scale: number }) {
  const offset = HANDLE_OFFSET[handle]
  const size = 10 * scale
  return (
    <button
      type="button"
      data-resize-handle={handle}
      aria-label={`Resize ${handle}`}
      className="canvas-handle absolute"
      style={{
        left: element.x + element.width * offset.x,
        top: element.y + element.height * offset.y,
        width: size,
        height: size,
        marginLeft: -size / 2,
        marginTop: -size / 2,
        cursor: offset.cursor,
        transform: `rotate(${element.rotation}deg)`,
      }}
    />
  )
}

function SelectionHandleDot({ bounds, handle, scale }: { bounds: { x: number; y: number; width: number; height: number }; handle: ResizeHandle; scale: number }) {
  const offset = HANDLE_OFFSET[handle]
  const size = 10 * scale
  return (
    <button
      type="button"
      data-resize-handle={handle}
      aria-label={`Resize selection ${handle}`}
      className="canvas-handle absolute"
      style={{
        left: bounds.x + bounds.width * offset.x,
        top: bounds.y + bounds.height * offset.y,
        width: size,
        height: size,
        marginLeft: -size / 2,
        marginTop: -size / 2,
        cursor: offset.cursor,
      }}
    />
  )
}

function RotationHandle({ element, bounds, scale }: { element?: CanvasElement; bounds?: { x: number; y: number; width: number; height: number }; scale: number }) {
  const size = 14 * scale
  // For a rotated element the handle rides on the rotated top edge, offset
  // outward along the element's own local -v axis (the engine's frame).
  const anchor = (() => {
    if (element) {
      const top = handlePoint(element, "n")
      const radians = (element.rotation * Math.PI) / 180
      const offset = 28 * scale
      return { x: top.x + Math.sin(radians) * offset, y: top.y - Math.cos(radians) * offset }
    }
    if (bounds) return { x: bounds.x + bounds.width / 2, y: bounds.y - 28 * scale }
    return { x: 0, y: 0 }
  })()
  return (
    <button
      type="button"
      data-rotate-handle="true"
      aria-label="Rotate"
      className="canvas-handle absolute inline-flex items-center justify-center"
      style={{
        left: anchor.x,
        top: anchor.y,
        width: size,
        height: size,
        marginLeft: -size / 2,
        marginTop: -size / 2,
        cursor: "grab",
      }}
      title="Rotate (hold Shift to snap to 15°)"
    >
      <RotateCw className="h-3 w-3 text-primary" />
    </button>
  )
}

/**
 * One element. Everything the document says is rendered as a text node or a
 * validated attribute — there is no HTML injection path, and embeds are a
 * labelled placeholder rather than an iframe so no remote document can run.
 */
function CanvasElementView({ element }: { element: CanvasElement }) {
  const font = elementFont(element)
  const fitted = useMemo(() => {
    if (element.type !== "text") return null
    const padding = 8
    return fitText(
      element.content,
      { width: Math.max(0, element.width - padding * 2), height: Math.max(0, element.height - padding * 2) },
      textMeasurer(`${font.weight} ${font.size}px ${font.family}`),
      { lineHeight: Math.round(font.size * 1.4) },
    )
  }, [element.content, element.height, element.type, element.width, font.family, font.size, font.weight])

  const imageUrl = element.type === "image" ? sanitizeImageUrl(element.content) : null
  const embed = element.type === "embed" ? embedHost(element.content) : null
  const textColor = safeColor(element.style?.color) ?? "var(--foreground)"
  const textAlign = safeEnum(element.style?.textAlign, ["left", "center", "right"] as const)

  return (
    <div
      data-element-id={element.id}
      data-static={element.locked ? "true" : "false"}
      className="canvas-element absolute overflow-hidden"
      style={{
        ...boxStyleFor(element),
        pointerEvents: element.locked ? "none" : "auto",
        display: "flex",
        alignItems: element.type === "text" ? "flex-start" : "center",
        justifyContent: element.type === "text" ? "flex-start" : "center",
        padding: 8,
      }}
    >
      {element.type === "text" ? (
        <div className="h-full w-full" style={{ color: textColor, fontSize: font.size, fontWeight: font.weight, fontFamily: font.family, lineHeight: 1.4, textAlign }}>
          {(fitted?.lines ?? [element.content]).map((line, index) => (
            <span key={`${element.id}-line-${index}`} className="block break-words">
              {line}
            </span>
          ))}
          {fitted?.truncated ? <span className="block text-xs opacity-70">…</span> : null}
        </div>
      ) : null}

      {element.type === "shape" ? (
        <span className="text-center text-sm font-semibold" style={{ color: textColor }}>
          {element.content}
        </span>
      ) : null}

      {element.type === "image" ? (
        imageUrl ? (
          // The URL is scheme-checked; the app CSP still restricts img-src to
          // 'self' data: blob:, so a remote URL may show as a broken image.
          <img src={imageUrl} alt={layerLabel(element)} loading="lazy" decoding="async" className="h-full w-full object-cover" style={{ borderRadius: 12 }} />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-xs text-muted-foreground">
            <ImageIcon className="h-5 w-5" />
            <span>{layerLabel(element) === "image" ? "Image by URL" : layerLabel(element)}</span>
          </div>
        )
      ) : null}

      {element.type === "embed" ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-[12px] bg-card/70 text-center text-xs text-muted-foreground">
          <Link2 className="h-5 w-5" />
          <span className="font-semibold text-foreground">{embed ?? "Embed placeholder"}</span>
          <span>Link only — no remote document is loaded.</span>
        </div>
      ) : null}
    </div>
  )
}
