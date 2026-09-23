import {
  boundsOf,
  computeSnapGuides,
  normalizeAngle,
  reorderElement,
  type CanvasDoc,
  type CanvasElement,
  type CanvasRect,
  type ReorderAction,
  type ResizeHandle,
  type SnapGuide,
} from "@/lib/studio/canvas-engine"

import { setElementStyle } from "./editing"

/**
 * The geometry behind the design editor's pointer gestures: hit testing with
 * a finger-sized tolerance, dragging a selection with snapping, turning a
 * selection about its centre, panning a picture inside its frame, zoom steps
 * and the resize cursors.
 *
 * Pure: no DOM, no React, so every rule here is testable in Node.
 */

export interface Point {
  x: number
  y: number
}

type Box = Pick<CanvasElement, "x" | "y" | "width" | "height" | "rotation">

/** The id of the stand-in box a multi-selection snaps as. */
export const SELECTION_ID = "__selection__"

export const DESIGN_ZOOM = { min: 0.05, max: 4 } as const

/** Zoom presets, as fractions: what the zoom menu lists and what Ctrl+=/Ctrl+- step through. */
export const ZOOM_STEPS: readonly number[] = [0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4]

const round2 = (value: number) => Math.round(value * 100) / 100
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

// ---------------------------------------------------------------------------
// Hit testing
// ---------------------------------------------------------------------------

/** A point in an element's own (unturned) frame, measured from its centre. */
export function toLocal(element: Box, point: Point): Point {
  const radians = (element.rotation * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const dx = point.x - (element.x + element.width / 2)
  const dy = point.y - (element.y + element.height / 2)
  return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos }
}

/** Whether a point is on the element, with `tolerance` page px around its edges. */
export function hitsElement(element: Box, point: Point, tolerance = 0): boolean {
  const local = toLocal(element, point)
  return Math.abs(local.x) <= element.width / 2 + tolerance && Math.abs(local.y) <= element.height / 2 + tolerance
}

/**
 * The topmost visible element under a point. Locked elements count (pressing
 * one selects it, so it can be unlocked). A press that lands squarely on an
 * element wins over one that is only near an element above it; the tolerance
 * decides only when nothing is hit exactly, so thin lines stay easy to catch.
 */
export function pickElement(elements: readonly CanvasElement[], point: Point, tolerance = 0): CanvasElement | null {
  for (let index = elements.length - 1; index >= 0; index -= 1) {
    const element = elements[index]
    if (!element.hidden && hitsElement(element, point)) return element
  }
  if (tolerance <= 0) return null
  for (let index = elements.length - 1; index >= 0; index -= 1) {
    const element = elements[index]
    if (!element.hidden && hitsElement(element, point, tolerance)) return element
  }
  return null
}

/** Whether a press lands inside the box around several selected elements. */
export function insideBounds(elements: readonly CanvasElement[], point: Point, tolerance = 0): boolean {
  const bounds = boundsOf(elements as CanvasElement[])
  if (!bounds) return false
  return (
    point.x >= bounds.x - tolerance &&
    point.x <= bounds.x + bounds.width + tolerance &&
    point.y >= bounds.y - tolerance &&
    point.y <= bounds.y + bounds.height + tolerance
  )
}

/** The rectangle between two points, whichever way it was dragged. */
export function rectFromPoints(a: Point, b: Point): CanvasRect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) }
}

// ---------------------------------------------------------------------------
// Moving
// ---------------------------------------------------------------------------

/** Shift-drag: only the axis the pointer has travelled further along. */
export function constrainAxis(dx: number, dy: number): { dx: number; dy: number } {
  return Math.abs(dx) >= Math.abs(dy) ? { dx, dy: 0 } : { dx: 0, dy }
}

export interface SelectionMove {
  dx: number
  dy: number
  guides: SnapGuide[]
}

/**
 * How far a dragged selection moves: the pointer's travel, nudged onto the
 * page's edges and centre lines, or onto another element's edges and centre,
 * when one is within `threshold` page px. The selection snaps as one box, so a
 * group lines up by its outside edges. The grid never applies.
 */
export function snapSelectionMove(canvas: CanvasDoc, moving: readonly CanvasElement[], dx: number, dy: number, options: { threshold: number; snap: boolean }): SelectionMove {
  const movable = moving.filter((element) => !element.locked)
  const bounds = boundsOf(movable)
  if (!options.snap || !bounds) return { dx, dy, guides: [] }
  const ids = new Set(moving.map((element) => element.id))
  const probe: CanvasElement = {
    id: SELECTION_ID,
    type: "shape",
    x: bounds.x + dx,
    y: bounds.y + dy,
    width: bounds.width,
    height: bounds.height,
    rotation: 0,
    z: canvas.elements.length,
    groupId: null,
    locked: false,
    hidden: false,
    content: "",
    style: {},
  }
  const doc: CanvasDoc = { ...canvas, elements: [...canvas.elements.filter((element) => !ids.has(element.id)), probe] }
  const snap = computeSnapGuides(doc, SELECTION_ID, { threshold: options.threshold, gridSnap: false })
  return { dx: dx + snap.dx, dy: dy + snap.dy, guides: snap.guides }
}

/**
 * Change the stacking of several elements without them leapfrogging each
 * other: they keep their order among themselves.
 */
export function reorderSelection(canvas: CanvasDoc, ids: readonly string[], action: ReorderAction): CanvasDoc {
  const wanted = new Set(ids)
  const members = canvas.elements.filter((element) => wanted.has(element.id))
  // To the front (or back a step), the lowest goes first; to the back (or forward a step), the highest.
  const ordered = action === "front" || action === "backward" ? members : [...members].reverse()
  let next = canvas
  for (const element of ordered) next = reorderElement(next, element.id, action)
  return next
}

// ---------------------------------------------------------------------------
// Turning
// ---------------------------------------------------------------------------

/** The direction from `center` to `point`, in degrees clockwise from +x (screen convention). */
export function angleAt(center: Point, point: Point): number {
  return (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI
}

/**
 * Shift snaps to 15° steps; otherwise the angle clicks onto the nearest
 * multiple of 45° when within 3° of it. Always in [0, 360).
 */
export function snapAngle(angle: number, shift: boolean): number {
  const value = normalizeAngle(angle)
  if (shift) return normalizeAngle(Math.round(value / 15) * 15)
  const nearest = Math.round(value / 45) * 45
  if (Math.abs(value - nearest) <= 3) return normalizeAngle(nearest)
  return normalizeAngle(Math.round(value * 10) / 10)
}

/** Turn an element about a point; its own rotation turns with it. */
export function rotateAbout(element: CanvasElement, center: Point, degrees: number): CanvasElement {
  const radians = (degrees * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const cx = element.x + element.width / 2 - center.x
  const cy = element.y + element.height / 2 - center.y
  const nx = center.x + cx * cos - cy * sin
  const ny = center.y + cx * sin + cy * cos
  return {
    ...element,
    x: round2(nx - element.width / 2),
    y: round2(ny - element.height / 2),
    rotation: normalizeAngle(Math.round((element.rotation + degrees) * 10) / 10),
  }
}

/**
 * Turn a selection by how far the pointer has turned around its centre. One
 * element snaps its own angle; several turn together about their shared
 * centre and the turn itself snaps. `angle` is what the badge shows.
 */
export function rotateSelection(starts: readonly CanvasElement[], center: Point, turn: number, shift: boolean): { elements: CanvasElement[]; angle: number } {
  if (starts.length === 1) {
    const start = starts[0]
    if (start.locked) return { elements: [start], angle: start.rotation }
    const rotation = snapAngle(start.rotation + turn, shift)
    return { elements: [{ ...start, rotation }], angle: rotation }
  }
  const angle = snapAngle(turn, shift)
  return { elements: starts.map((element) => (element.locked ? element : rotateAbout(element, center, angle))), angle }
}

// ---------------------------------------------------------------------------
// Resizing cursors
// ---------------------------------------------------------------------------

const HANDLE_ANGLES: Record<ResizeHandle, number> = { e: 0, se: 45, s: 90, sw: 135, w: 180, nw: 225, n: 270, ne: 315 }
const RESIZE_CURSORS = ["ew-resize", "nwse-resize", "ns-resize", "nesw-resize"] as const

/** The resize cursor that points the way a handle pulls once the element is turned. */
export function handleCursor(handle: ResizeHandle, rotation: number): string {
  const angle = normalizeAngle(HANDLE_ANGLES[handle] + rotation)
  return RESIZE_CURSORS[Math.round((angle % 180) / 45) % 4]
}

// ---------------------------------------------------------------------------
// Pictures
// ---------------------------------------------------------------------------

export interface PictureRect {
  left: number
  top: number
  width: number
  height: number
}

/** Where the whole picture sits in its frame's own frame, filling it ("cover") at this focus. */
export function coverRect(box: { width: number; height: number }, natural: { width: number; height: number }, focus: Point): PictureRect {
  const scale = Math.max(box.width / Math.max(1, natural.width), box.height / Math.max(1, natural.height))
  const width = natural.width * scale
  const height = natural.height * scale
  return { left: -(width - box.width) * focus.x, top: -(height - box.height) * focus.y, width, height }
}

/**
 * The focus after the pointer moved `delta` page px while cropping: the
 * picture follows the pointer inside its frame and never leaves a gap. A
 * mirrored picture moves the other way in its own coordinates.
 */
export function panCrop(
  start: { focusX: number; focusY: number },
  delta: Point,
  box: Box,
  natural: { width: number; height: number },
  flip: { x: boolean; y: boolean },
): { focusX: number; focusY: number } {
  const view = coverRect(box, natural, { x: start.focusX, y: start.focusY })
  const overflowX = view.width - box.width
  const overflowY = view.height - box.height
  const radians = (box.rotation * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const localX = delta.x * cos + delta.y * sin
  const localY = -delta.x * sin + delta.y * cos
  const focusX = overflowX > 0.5 ? clamp(start.focusX + ((flip.x ? 1 : -1) * localX) / overflowX, 0, 1) : start.focusX
  const focusY = overflowY > 0.5 ? clamp(start.focusY + ((flip.y ? 1 : -1) * localY) / overflowY, 0, 1) : start.focusY
  return { focusX: Math.round(focusX * 1000) / 1000, focusY: Math.round(focusY * 1000) / 1000 }
}

/**
 * The picture frame a dropped picture fills: the topmost thing under the
 * point, when that is an empty frame or a shaped (masked) one. A plain
 * picture is not replaced by a drop: the new picture goes on top.
 */
export function frameAt(elements: readonly CanvasElement[], point: Point): CanvasElement | null {
  for (let index = elements.length - 1; index >= 0; index -= 1) {
    const element = elements[index]
    if (element.hidden || !hitsElement(element, point)) continue
    if (element.type !== "image" || element.locked) return null
    const empty = !String(element.content ?? "").trim()
    const mask = element.style.mask
    return empty || (typeof mask === "string" && mask !== "none") ? element : null
  }
  return null
}

/** A frame showing a new picture, filled and centred. */
export function fillFrame(element: CanvasElement, src: string): CanvasElement {
  return setElementStyle({ ...element, content: src }, { fit: "cover", focusX: 0.5, focusY: 0.5 })
}

// ---------------------------------------------------------------------------
// Zoom and pages
// ---------------------------------------------------------------------------

export function clampZoom(zoom: number): number {
  return Number.isFinite(zoom) ? clamp(zoom, DESIGN_ZOOM.min, DESIGN_ZOOM.max) : 1
}

/** The next preset up or down from the current zoom. */
export function stepZoom(zoom: number, direction: 1 | -1): number {
  if (direction > 0) return ZOOM_STEPS.find((step) => step > zoom + 0.001) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1]
  for (let index = ZOOM_STEPS.length - 1; index >= 0; index -= 1) {
    if (ZOOM_STEPS[index] < zoom - 0.001) return ZOOM_STEPS[index]
  }
  return ZOOM_STEPS[0]
}

/** The zoom that shows a whole page in the viewport with room around it (never above 200%). */
export function fitZoom(page: { width: number; height: number }, viewport: { width: number; height: number }, margin = 56): number {
  const zoom = Math.min((viewport.width - margin) / page.width, (viewport.height - margin) / page.height)
  return Number.isFinite(zoom) && zoom > 0 ? clamp(zoom, DESIGN_ZOOM.min, 2) : 1
}

/** The first page two versions of a design differ on, or -1 (undo shows where it happened). */
export function firstChangedPage(before: { pages: readonly unknown[] }, after: { pages: readonly unknown[] }): number {
  const count = Math.max(before.pages.length, after.pages.length)
  for (let index = 0; index < count; index += 1) {
    if (before.pages[index] !== after.pages[index]) return Math.max(0, Math.min(index, after.pages.length - 1))
  }
  return -1
}
