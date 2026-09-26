/**
 * The free-form design canvas engine.
 *
 * This module is the whole geometry/layout contract for `canvas-editor.tsx`:
 * every move, resize, rotation, snap, ordering, grouping, align and history
 * step is a pure function over plain objects here, so the editor component has
 * no layout logic of its own to drift from the tests.
 *
 * Deliberately dependency-free and environment-free: no React, no DOM, no
 * `window`, no fetch, no clock. Everything that needs a browser stays in the
 * component; everything that can be wrong in a subtle way (a rotated resize
 * anchor, a z-order tie, a snap correction) lives here and is unit tested.
 *
 * The one exception to "pure" is `createElement`'s id counter, which exists so
 * callers can omit an id. Pass an explicit id when you need determinism.
 */

export const CANVAS_FORMAT_VERSION = 1 as const

export type CanvasElementType = "text" | "image" | "shape" | "embed"

/** The eight box handles, named as compass points. */
export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w"

export type ReorderAction = "front" | "back" | "forward" | "backward"

export type AlignMode = "left" | "center" | "right" | "top" | "middle" | "bottom"

export type DistributeAxis = "horizontal" | "vertical"

export interface CanvasRect {
  x: number
  y: number
  width: number
  height: number
}

export interface CanvasElement {
  id: string
  type: CanvasElementType
  /** Top-left of the element's *unrotated* box, in canvas coordinates (px). */
  x: number
  y: number
  width: number
  height: number
  /** Clockwise degrees. Screen convention: +y points down, so +rotation turns right. */
  rotation: number
  /** Stacking order. Always dense 0..n-1 on a normalized document. */
  z: number
  /** Shared group id, or null when the element stands alone. */
  groupId: string | null
  /** When true the element cannot be hit-tested, marquee-selected or dragged. */
  locked: boolean
  /** When true the element is not rendered and cannot be selected. */
  hidden: boolean
  /** Text elements hold their text; image/embed hold a URL; shape holds a label. */
  content: string
  style: Record<string, unknown>
}

export interface CanvasDoc {
  version: typeof CANVAS_FORMAT_VERSION
  id: string
  name: string
  /** Canvas width in px. */
  width: number
  /** Canvas height in px. */
  height: number
  background: string
  /** Kept sorted by `z` ascending with dense `z`, so array order is stack order. */
  elements: CanvasElement[]
}

/** Input accepted by `createElement`: everything is optional except `type`. */
export type CanvasElementInput = Partial<Omit<CanvasElement, "type">> & { type: CanvasElementType }

// ---------------------------------------------------------------------------
// Small numeric / structural helpers
// ---------------------------------------------------------------------------

const DEG_TO_RAD = Math.PI / 180
const EPSILON = 1e-6

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Finite number from a number or a numeric string; anything else falls back. */
function coerceNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function isElementType(value: unknown): value is CanvasElementType {
  return value === "text" || value === "image" || value === "shape" || value === "embed"
}

/** Normalize an angle into [0, 360). */
export function normalizeAngle(degrees: number): number {
  if (!Number.isFinite(degrees)) return 0
  const wrapped = degrees % 360
  return wrapped < 0 ? wrapped + 360 : wrapped
}

/** Structural deep equality for plain canvas data (objects, arrays, primitives). */
export function canvasDeepEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (typeof left !== typeof right) return false
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false
    return left.every((item, index) => canvasDeepEqual(item, right[index]))
  }
  if (isRecord(left) && isRecord(right)) {
    const leftKeys = Object.keys(left)
    const rightKeys = Object.keys(right)
    if (leftKeys.length !== rightKeys.length) return false
    return leftKeys.every((key) => Object.prototype.hasOwnProperty.call(right, key) && canvasDeepEqual(left[key], right[key]))
  }
  return false
}

let elementIdCounter = 0

function nextGeneratedId(prefix: string): string {
  elementIdCounter += 1
  return `${prefix}_${elementIdCounter.toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`
}

// ---------------------------------------------------------------------------
// Construction / normalization
// ---------------------------------------------------------------------------

export function createCanvasDoc(input: Partial<CanvasDoc> = {}): CanvasDoc {
  const width = Math.max(1, coerceNumber(input.width, 1080))
  const height = Math.max(1, coerceNumber(input.height, 720))
  return {
    version: CANVAS_FORMAT_VERSION,
    id: typeof input.id === "string" && input.id.trim() ? input.id : "canvas",
    name: typeof input.name === "string" && input.name.trim() ? input.name : "Untitled canvas",
    width,
    height,
    background: typeof input.background === "string" && input.background.trim() ? input.background : "#ffffff",
    elements: normalizeElements(input.elements),
  }
}

export function createElement(input: CanvasElementInput): CanvasElement {
  const width = Math.max(1, coerceNumber(input.width, input.type === "shape" ? 160 : 220))
  const height = Math.max(1, coerceNumber(input.height, input.type === "shape" ? 120 : 96))
  return {
    id: typeof input.id === "string" && input.id.trim() ? input.id : nextGeneratedId(input.type),
    type: input.type,
    x: coerceNumber(input.x, 0),
    y: coerceNumber(input.y, 0),
    width,
    height,
    rotation: normalizeAngle(coerceNumber(input.rotation, 0)),
    z: Math.max(0, Math.floor(coerceNumber(input.z, 0))),
    groupId: typeof input.groupId === "string" && input.groupId ? input.groupId : null,
    locked: input.locked === true,
    hidden: input.hidden === true,
    content: typeof input.content === "string" ? input.content : "",
    style: isRecord(input.style) ? { ...input.style } : {},
  }
}

/**
 * Coerce one stored/imported element. Returns null for input with no usable
 * identity — a canvas full of anonymous boxes is worse than dropping the row.
 */
function normalizeElement(value: unknown, fallbackId: string): CanvasElement | null {
  if (!isRecord(value)) return null
  const type = isElementType(value.type) ? value.type : "shape"
  const id = typeof value.id === "string" && value.id.trim() ? value.id : fallbackId
  return createElement({
    ...(value as CanvasElementInput),
    id,
    type,
  })
}

/**
 * Defensive parse. Never throws: junk becomes defaults, partial input is filled
 * in, and `z` is rebuilt into a dense ascending sequence.
 */
export function normalizeCanvasDoc(input: unknown): CanvasDoc {
  if (!isRecord(input)) return createCanvasDoc()
  const rawElements = Array.isArray(input.elements) ? input.elements : []
  return createCanvasDoc({
    id: typeof input.id === "string" ? input.id : undefined,
    name: typeof input.name === "string" ? input.name : undefined,
    width: coerceNumber(input.width, 1080),
    height: coerceNumber(input.height, 720),
    background: typeof input.background === "string" ? input.background : undefined,
    elements: rawElements.map((element, index) => normalizeElement(element, `element-${index}`)).filter((element): element is CanvasElement => element !== null),
  })
}

function normalizeElements(value: unknown): CanvasElement[] {
  if (!Array.isArray(value)) return []
  const elements = value
    .map((element, index) => normalizeElement(element, `element-${index}`))
    .filter((element): element is CanvasElement => element !== null)
  return withDenseZ(elements)
}

/** Sort by `z` (stable, index breaks ties) and rewrite `z` as 0..n-1. */
function withDenseZ(elements: CanvasElement[]): CanvasElement[] {
  return elements
    .map((element, index) => ({ element, index }))
    .sort((left, right) => left.element.z - right.element.z || left.index - right.index)
    .map(({ element }, index) => (element.z === index ? element : { ...element, z: index }))
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/**
 * The four rotated corners of an element, in canvas space, starting at the
 * unrotated top-left and going clockwise (`nw`, `ne`, `se`, `sw`).
 */
export function elementCorners(element: CanvasElement): { x: number; y: number }[] {
  const radians = element.rotation * DEG_TO_RAD
  const u = { x: Math.cos(radians), y: Math.sin(radians) }
  const v = { x: -Math.sin(radians), y: Math.cos(radians) }
  const cx = element.x + element.width / 2
  const cy = element.y + element.height / 2
  const halfW = element.width / 2
  const halfH = element.height / 2
  return [
    { x: cx - halfW * u.x - halfH * v.x, y: cy - halfW * u.y - halfH * v.y },
    { x: cx + halfW * u.x - halfH * v.x, y: cy + halfW * u.y - halfH * v.y },
    { x: cx + halfW * u.x + halfH * v.x, y: cy + halfW * u.y + halfH * v.y },
    { x: cx - halfW * u.x + halfH * v.x, y: cy - halfW * u.y + halfH * v.y },
  ]
}

/** The axis-aligned bounding box of an element, rotation included. */
export function elementBounds(element: CanvasElement): CanvasRect {
  const corners = elementCorners(element)
  const xs = corners.map((corner) => corner.x)
  const ys = corners.map((corner) => corner.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}

/** Union of the rotated bounding boxes; null when there is nothing to bound. */
export function boundsOf(elements: readonly CanvasElement[]): CanvasRect | null {
  const visible = elements.filter((element) => !element.hidden)
  if (!visible.length) return null
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const element of visible) {
    const bounds = elementBounds(element)
    minX = Math.min(minX, bounds.x)
    minY = Math.min(minY, bounds.y)
    maxX = Math.max(maxX, bounds.x + bounds.width)
    maxY = Math.max(maxY, bounds.y + bounds.height)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/** Point-in-element test in the element's own (rotated) frame. */
export function containsPoint(element: CanvasElement, x: number, y: number): boolean {
  const radians = -element.rotation * DEG_TO_RAD
  const cx = element.x + element.width / 2
  const cy = element.y + element.height / 2
  const dx = x - cx
  const dy = y - cy
  const localX = dx * Math.cos(radians) - dy * Math.sin(radians)
  const localY = dx * Math.sin(radians) + dy * Math.cos(radians)
  return Math.abs(localX) <= element.width / 2 + EPSILON && Math.abs(localY) <= element.height / 2 + EPSILON
}

function rectsIntersect(left: CanvasRect, right: CanvasRect): boolean {
  return left.x <= right.x + right.width && right.x <= left.x + left.width && left.y <= right.y + right.height && right.y <= left.y + left.height
}

// ---------------------------------------------------------------------------
// Document plumbing
// ---------------------------------------------------------------------------

function findElement(doc: CanvasDoc, id: string): CanvasElement | undefined {
  return doc.elements.find((element) => element.id === id)
}

/**
 * Reassign `z` from array position. Used when the array order is already the
 * intended stack order (reorder, add, remove) — unlike `withDenseZ`, this never
 * re-sorts, so a splice is not silently undone.
 */
function indexElements(elements: CanvasElement[]): CanvasElement[] {
  return elements.map((element, index) => (element.z === index ? element : { ...element, z: index }))
}

function replaceElements(doc: CanvasDoc, next: CanvasElement[]): CanvasDoc {
  return { ...doc, elements: indexElements(next) }
}

/** Replace one element by id; returns the same doc when the id is unknown. */
export function updateElement(doc: CanvasDoc, id: string, patch: Partial<CanvasElement>): CanvasDoc {
  if (!findElement(doc, id)) return doc
  return { ...doc, elements: doc.elements.map((element) => (element.id === id ? { ...element, ...patch, id: element.id } : element)) }
}

/** Append an element on top of the stack. */
export function addElement(doc: CanvasDoc, element: CanvasElement): CanvasDoc {
  const rest = doc.elements.filter((candidate) => candidate.id !== element.id)
  return replaceElements(doc, [...rest, { ...element, z: rest.length }])
}

/** Remove elements by id; unknown ids are ignored. */
export function removeElements(doc: CanvasDoc, ids: readonly string[]): CanvasDoc {
  const removing = new Set(ids)
  if (!doc.elements.some((element) => removing.has(element.id))) return doc
  return replaceElements(doc, doc.elements.filter((element) => !removing.has(element.id)))
}

/** Copy one element above the stack, offset slightly so it is visibly a copy. */
export function duplicateElement(doc: CanvasDoc, id: string, offset = 16): { doc: CanvasDoc; id: string | null } {
  const source = findElement(doc, id)
  if (!source) return { doc, id: null }
  const copy = createElement({ ...source, id: nextGeneratedId(source.type), x: source.x + offset, y: source.y + offset, z: doc.elements.length })
  return { doc: addElement(doc, copy), id: copy.id }
}

// ---------------------------------------------------------------------------
// Transforms
// ---------------------------------------------------------------------------

export interface MoveOptions {
  /** Snap the resulting top-left to a grid of this size. Omit to keep exact deltas. */
  grid?: number | null
}

/**
 * Translate one element by a canvas-space delta. Never shears: only `x`/`y`
 * change, so a rotated element keeps its own frame exactly.
 */
export function moveElement(doc: CanvasDoc, id: string, dx: number, dy: number, options: MoveOptions = {}): CanvasDoc {
  const element = findElement(doc, id)
  if (!element || element.locked) return doc
  let x = element.x + coerceNumber(dx, 0)
  let y = element.y + coerceNumber(dy, 0)
  if (typeof options.grid === "number" && options.grid > 0) {
    x = Math.round(x / options.grid) * options.grid
    y = Math.round(y / options.grid) * options.grid
  }
  return updateElement(doc, id, { x, y })
}

const HANDLE_VECTORS: Record<ResizeHandle, { sx: -1 | 0 | 1; sy: -1 | 0 | 1 }> = {
  nw: { sx: -1, sy: -1 },
  n: { sx: 0, sy: -1 },
  ne: { sx: 1, sy: -1 },
  e: { sx: 1, sy: 0 },
  se: { sx: 1, sy: 1 },
  s: { sx: 0, sy: 1 },
  sw: { sx: -1, sy: 1 },
  w: { sx: -1, sy: 0 },
}

export interface ResizeOptions {
  /** Smallest allowed width/height. Default 1. */
  minSize?: number
}

/**
 * Rotation-aware resize.
 *
 * The maths runs in the element's own frame and is projected back, so the
 * opposite edge/corner stays fixed *in canvas space* even while rotated:
 *
 *   1. `u`/`v` are the element's local axes in canvas space, from its rotation.
 *   2. The anchor is the opposite handle's point; it never moves.
 *   3. The pointer delta moves the dragged handle, and the vector from the
 *      anchor to that handle is projected onto `u` and `v` — those projections
 *      are the new width/height, with no coupling between the two axes.
 *   4. The new centre is rebuilt from the fixed anchor along `u`/`v`.
 *
 * Because each axis is sized only from its own projection, the resize can never
 * introduce shear: rotation is carried through untouched.
 */
export function resizeElement(doc: CanvasDoc, id: string, handle: ResizeHandle, dx: number, dy: number, options: ResizeOptions = {}): CanvasDoc {
  const element = findElement(doc, id)
  if (!element || element.locked) return doc
  const resized = resizeRect(element, handle, coerceNumber(dx, 0), coerceNumber(dy, 0), options.minSize ?? 1)
  return updateElement(doc, id, resized)
}

/** The rotation-aware resize maths on its own, exposed for the editor and tests. */
export function resizeRect(rect: CanvasRect & { rotation: number }, handle: ResizeHandle, dx: number, dy: number, minSize = 1): CanvasRect {
  const { sx, sy } = HANDLE_VECTORS[handle]
  const radians = rect.rotation * DEG_TO_RAD
  const u = { x: Math.cos(radians), y: Math.sin(radians) }
  const v = { x: -Math.sin(radians), y: Math.cos(radians) }
  const anchor = pointOnElement(rect, -sx, -sy)
  const gripped = pointOnElement(rect, sx, sy)
  const toHandle = { x: gripped.x + dx - anchor.x, y: gripped.y + dy - anchor.y }
  const projectionU = toHandle.x * u.x + toHandle.y * u.y
  const projectionV = toHandle.x * v.x + toHandle.y * v.y
  const width = sx === 0 ? rect.width : Math.max(minSize, projectionU * sx)
  const height = sy === 0 ? rect.height : Math.max(minSize, projectionV * sy)
  const center = {
    x: anchor.x + sx * (width / 2) * u.x + sy * (height / 2) * v.x,
    y: anchor.y + sx * (width / 2) * u.y + sy * (height / 2) * v.y,
  }
  return { x: center.x - width / 2, y: center.y - height / 2, width, height }
}

/** A point on an element's rotated box, given local axis multipliers in [-1, 1]. */
function pointOnElement(element: CanvasElement | (CanvasRect & { rotation: number }), sx: number, sy: number): { x: number; y: number } {
  const radians = element.rotation * DEG_TO_RAD
  const u = { x: Math.cos(radians), y: Math.sin(radians) }
  const v = { x: -Math.sin(radians), y: Math.cos(radians) }
  const cx = element.x + element.width / 2
  const cy = element.y + element.height / 2
  return {
    x: cx + sx * (element.width / 2) * u.x + sy * (element.height / 2) * v.x,
    y: cy + sx * (element.width / 2) * u.y + sy * (element.height / 2) * v.y,
  }
}

/** The point on `element` that a resize handle grips (its canvas-space position). */
export function handlePoint(element: CanvasElement, handle: ResizeHandle): { x: number; y: number } {
  const { sx, sy } = HANDLE_VECTORS[handle]
  return pointOnElement(element, sx, sy)
}

/** The handle opposite `handle` — the point a resize keeps fixed. */
export function anchorPointFor(element: CanvasElement, handle: ResizeHandle): { x: number; y: number } {
  const { sx, sy } = HANDLE_VECTORS[handle]
  return pointOnElement(element, -sx, -sy)
}

export interface RotateOptions {
  /** Round the resulting absolute rotation to the nearest `snapDegrees`. */
  snap?: boolean
  /** Snap step when `snap` is on. Default 15. */
  snapDegrees?: number
}

/** Rotate by a delta (degrees, clockwise). Result is normalized into [0, 360). */
export function rotateElement(doc: CanvasDoc, id: string, degrees: number, options: RotateOptions = {}): CanvasDoc {
  const element = findElement(doc, id)
  if (!element || element.locked) return doc
  const step = options.snapDegrees && options.snapDegrees > 0 ? options.snapDegrees : 15
  const raw = normalizeAngle(element.rotation + coerceNumber(degrees, 0))
  const rotation = options.snap ? normalizeAngle(Math.round(raw / step) * step) : raw
  return updateElement(doc, id, { rotation })
}

/** Multi-element translate. Each element moves by the same delta in its own frame. */
export function moveElements(doc: CanvasDoc, ids: readonly string[], dx: number, dy: number, options: MoveOptions = {}): CanvasDoc {
  let next = doc
  for (const id of ids) next = moveElement(next, id, dx, dy, options)
  return next
}

/**
 * Resize a multi-element selection by scaling its shared bounds about the
 * anchor handle. Each member's own centre and size scale by the same factors,
 * so a rotated member keeps its rotation and cannot shear.
 *
 * A single-element selection delegates to `resizeElement`, which has the exact
 * rotation-aware anchor handling.
 */
export function resizeElements(doc: CanvasDoc, ids: readonly string[], handle: ResizeHandle, dx: number, dy: number, options: ResizeOptions = {}): CanvasDoc {
  const members = doc.elements.filter((element) => ids.includes(element.id) && !element.locked)
  if (!members.length) return doc
  if (members.length === 1) return resizeElement(doc, members[0].id, handle, dx, dy, options)
  const bounds = boundsOf(members)
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return doc
  const resized = resizeRect({ ...bounds, rotation: 0 }, handle, dx, dy, options.minSize ?? 1)
  const scaleX = resized.width / bounds.width
  const scaleY = resized.height / bounds.height
  const next = doc.elements.map((element) => {
    if (!ids.includes(element.id) || element.locked) return element
    const center = { x: element.x + element.width / 2, y: element.y + element.height / 2 }
    const scaledCenter = {
      x: resized.x + (center.x - bounds.x) * scaleX,
      y: resized.y + (center.y - bounds.y) * scaleY,
    }
    const width = Math.max(options.minSize ?? 1, element.width * scaleX)
    const height = Math.max(options.minSize ?? 1, element.height * scaleY)
    return { ...element, x: scaledCenter.x - width / 2, y: scaledCenter.y - height / 2, width, height }
  })
  return { ...doc, elements: next }
}

// ---------------------------------------------------------------------------
// Snapping
// ---------------------------------------------------------------------------

export interface SnapGuide {
  axis: "x" | "y"
  kind: "canvas" | "element" | "grid"
  /** Canvas coordinate of the guide line. */
  position: number
  /** The element the guide came from, when `kind` is "element". */
  targetId?: string
}

export interface SnapOptions {
  /** Alignment tolerance in px. Default 6. */
  threshold?: number
  /** Grid size in px. Default 8. */
  grid?: number
  /** Master switch. `false` returns no guides and no correction. Default true. */
  snap?: boolean
  /** Whether the grid fallback applies. Default true. */
  gridSnap?: boolean
  /** Elements to leave out of the target set (usually the ones being dragged). */
  ignoreIds?: readonly string[]
}

export interface SnapResult {
  guides: SnapGuide[]
  /** Correction to add to the proposed position. */
  dx: number
  dy: number
}

const CANVAS_SNAP_THRESHOLD = 6
const CANVAS_SNAP_GRID = 8

interface SnapCandidate {
  delta: number
  guide: Omit<SnapGuide, "axis">
  /** Lower sorts first when two candidates are equally close. */
  rank: number
}

function bestCandidate(candidates: SnapCandidate[]): SnapCandidate | null {
  let best: SnapCandidate | null = null
  for (const candidate of candidates) {
    if (!best) {
      best = candidate
      continue
    }
    const distance = Math.abs(candidate.delta)
    const bestDistance = Math.abs(best.delta)
    if (distance < bestDistance - EPSILON || (Math.abs(distance - bestDistance) <= EPSILON && candidate.rank < best.rank)) {
      best = candidate
    }
  }
  return best
}

/**
 * The alignment guides a proposed move actually hits, plus the correction that
 * lands the element on them.
 *
 * The caller moves the element to the raw proposed position first (via
 * `moveElement`), then calls this and applies `dx`/`dy`. That keeps every
 * decision here read-only and previewable: the editor can render the returned
 * guides without mutating the document twice.
 *
 * Targets are the canvas edges/centre and every other visible element's
 * edges/centre. When no alignment wins on an axis and the grid is enabled, the
 * top-left snaps to the nearest grid line.
 */
export function computeSnapGuides(doc: CanvasDoc, movingId: string, options: SnapOptions = {}): SnapResult {
  const empty: SnapResult = { guides: [], dx: 0, dy: 0 }
  if (options.snap === false) return empty
  const moving = findElement(doc, movingId)
  if (!moving || moving.hidden) return empty
  const box = elementBounds(moving)
  const threshold = options.threshold ?? CANVAS_SNAP_THRESHOLD
  const grid = options.grid ?? CANVAS_SNAP_GRID
  const gridEnabled = options.gridSnap !== false && grid > 0
  const ignore = new Set(options.ignoreIds ?? [movingId])

  const targets: { kind: "canvas" | "element"; position: number; targetId?: string }[] = [
    { kind: "canvas", position: 0 },
    { kind: "canvas", position: doc.width / 2 },
    { kind: "canvas", position: doc.width },
  ]
  const yTargets: { kind: "canvas" | "element"; position: number; targetId?: string }[] = [
    { kind: "canvas", position: 0 },
    { kind: "canvas", position: doc.height / 2 },
    { kind: "canvas", position: doc.height },
  ]
  for (const element of doc.elements) {
    if (element.hidden || ignore.has(element.id)) continue
    const bounds = elementBounds(element)
    targets.push({ kind: "element", position: bounds.x, targetId: element.id })
    targets.push({ kind: "element", position: bounds.x + bounds.width / 2, targetId: element.id })
    targets.push({ kind: "element", position: bounds.x + bounds.width, targetId: element.id })
    yTargets.push({ kind: "element", position: bounds.y, targetId: element.id })
    yTargets.push({ kind: "element", position: bounds.y + bounds.height / 2, targetId: element.id })
    yTargets.push({ kind: "element", position: bounds.y + bounds.height, targetId: element.id })
  }

  const xEdges: { value: number; rank: number }[] = [
    { value: box.x, rank: 0 },
    { value: box.x + box.width / 2, rank: 1 },
    { value: box.x + box.width, rank: 0 },
  ]
  const yEdges: { value: number; rank: number }[] = [
    { value: box.y, rank: 0 },
    { value: box.y + box.height / 2, rank: 1 },
    { value: box.y + box.height, rank: 0 },
  ]

  const axis = (
    edges: { value: number; rank: number }[],
    axisTargets: { kind: "canvas" | "element"; position: number; targetId?: string }[],
    origin: number,
    axisName: "x" | "y",
  ): { guide: SnapGuide | null; delta: number } => {
    const candidates: SnapCandidate[] = []
    for (const edge of edges) {
      for (const target of axisTargets) {
        const delta = target.position - edge.value
        if (Math.abs(delta) > threshold) continue
        candidates.push({
          delta,
          rank: edge.rank * 10 + (target.kind === "canvas" ? 0 : 1),
          guide: { kind: target.kind, position: target.position, ...(target.targetId ? { targetId: target.targetId } : {}) },
        })
      }
    }
    const best = bestCandidate(candidates)
    if (best) return { guide: { axis: axisName, ...best.guide }, delta: best.delta }
    if (!gridEnabled) return { guide: null, delta: 0 }
    const snapped = Math.round(origin / grid) * grid
    const delta = snapped - origin
    if (Math.abs(delta) < EPSILON) return { guide: null, delta: 0 }
    return { guide: { axis: axisName, kind: "grid", position: snapped }, delta }
  }

  const horizontal = axis(xEdges, targets, box.x, "x")
  const vertical = axis(yEdges, yTargets, box.y, "y")
  return {
    guides: [horizontal.guide, vertical.guide].filter((guide): guide is SnapGuide => guide !== null),
    dx: horizontal.delta,
    dy: vertical.delta,
  }
}

/** Snap a single proposed move: the common editor path (move, then correct). */
export function applySnapToMove(doc: CanvasDoc, id: string, dx: number, dy: number, options: SnapOptions = {}): { doc: CanvasDoc; guides: SnapGuide[] } {
  const moved = moveElement(doc, id, dx, dy)
  const snap = computeSnapGuides(moved, id, options)
  if (snap.dx === 0 && snap.dy === 0) return { doc: moved, guides: snap.guides }
  return { doc: moveElement(moved, id, snap.dx, snap.dy), guides: snap.guides }
}

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

/**
 * Reorder one element. The result always keeps `z` dense 0..n-1 with no ties or
 * gaps, so array order is stack order and the layers panel can trust it.
 */
export function reorderElement(doc: CanvasDoc, id: string, action: ReorderAction): CanvasDoc {
  const stack = withDenseZ([...doc.elements])
  const index = stack.findIndex((element) => element.id === id)
  if (index === -1) return doc
  const target = action === "front" ? stack.length - 1 : action === "back" ? 0 : action === "forward" ? Math.min(stack.length - 1, index + 1) : Math.max(0, index - 1)
  if (target === index) return doc
  const [element] = stack.splice(index, 1)
  stack.splice(target, 0, element)
  return replaceElements(doc, stack)
}

/** Move an element to an explicit stack index (used by drag-and-drop layers). */
export function moveElementToIndex(doc: CanvasDoc, id: string, index: number): CanvasDoc {
  const stack = withDenseZ([...doc.elements])
  const current = stack.findIndex((element) => element.id === id)
  if (current === -1) return doc
  const target = clamp(Math.round(index), 0, stack.length - 1)
  if (target === current) return doc
  const [element] = stack.splice(current, 1)
  stack.splice(target, 0, element)
  return replaceElements(doc, stack)
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

let groupIdCounter = 0

function nextGroupId(): string {
  groupIdCounter += 1
  return `group_${groupIdCounter.toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`
}

/**
 * Group elements under a fresh id. Absolute positions are untouched: `x`/`y`
 * stay canvas coordinates and each member keeps its own rotation and size, so
 * grouping can never move or shear anything.
 */
export function groupElements(doc: CanvasDoc, ids: readonly string[]): CanvasDoc {
  const members = doc.elements.filter((element) => ids.includes(element.id))
  if (members.length < 2) return doc
  const groupId = nextGroupId()
  return replaceElements(doc, doc.elements.map((element) => (ids.includes(element.id) ? { ...element, groupId } : element)))
}

/**
 * Ungroup. `id` may be either a group id or an element id; an element id
 * dissolves the whole group that element belongs to.
 */
export function ungroupElements(doc: CanvasDoc, id: string): CanvasDoc {
  const owner = findElement(doc, id)
  const groupId = owner?.groupId ?? id
  if (!groupId) return doc
  if (!doc.elements.some((element) => element.groupId === groupId)) return doc
  return replaceElements(doc, doc.elements.map((element) => (element.groupId === groupId ? { ...element, groupId: null } : element)))
}

/** Every id that moves with `id`: its group (if any), otherwise just itself. */
export function selectionCluster(doc: CanvasDoc, id: string): string[] {
  const element = findElement(doc, id)
  if (!element) return []
  if (!element.groupId) return [id]
  return doc.elements.filter((candidate) => candidate.groupId === element.groupId).map((candidate) => candidate.id)
}

// ---------------------------------------------------------------------------
// Align / distribute
// ---------------------------------------------------------------------------

/** Align elements to their shared selection bounds, using rotated AABBs. */
export function alignElements(doc: CanvasDoc, ids: readonly string[], mode: AlignMode): CanvasDoc {
  const members = doc.elements.filter((element) => ids.includes(element.id) && !element.locked)
  if (members.length < 2) return doc
  const bounds = boundsOf(members)
  if (!bounds) return doc
  const next = doc.elements.map((element) => {
    if (!ids.includes(element.id) || element.locked) return element
    const box = elementBounds(element)
    let dx = 0
    let dy = 0
    if (mode === "left") dx = bounds.x - box.x
    if (mode === "center") dx = bounds.x + bounds.width / 2 - (box.x + box.width / 2)
    if (mode === "right") dx = bounds.x + bounds.width - (box.x + box.width)
    if (mode === "top") dy = bounds.y - box.y
    if (mode === "middle") dy = bounds.y + bounds.height / 2 - (box.y + box.height / 2)
    if (mode === "bottom") dy = bounds.y + bounds.height - (box.y + box.height)
    return { ...element, x: element.x + dx, y: element.y + dy }
  })
  return { ...doc, elements: next }
}

/**
 * Distribute centres evenly between the two extreme centres on one axis. The
 * outermost elements do not move, so a distribute is never a surprise.
 */
export function distributeElements(doc: CanvasDoc, ids: readonly string[], axis: DistributeAxis): CanvasDoc {
  const members = doc.elements.filter((element) => ids.includes(element.id) && !element.locked)
  if (members.length < 3) return doc
  const centerOf = (element: CanvasElement) => {
    const box = elementBounds(element)
    return axis === "horizontal" ? box.x + box.width / 2 : box.y + box.height / 2
  }
  const ordered = [...members].sort((left, right) => centerOf(left) - centerOf(right))
  const first = centerOf(ordered[0])
  const last = centerOf(ordered[ordered.length - 1])
  const step = (last - first) / (ordered.length - 1)
  const offsets = new Map<string, number>()
  ordered.forEach((element, index) => {
    offsets.set(element.id, first + step * index - centerOf(element))
  })
  const next = doc.elements.map((element) => {
    const offset = offsets.get(element.id)
    if (offset === undefined) return element
    return axis === "horizontal" ? { ...element, x: element.x + offset } : { ...element, y: element.y + offset }
  })
  return { ...doc, elements: next }
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

/** Topmost element under a canvas point, skipping hidden and locked elements. */
export function hitTest(doc: CanvasDoc, x: number, y: number): CanvasElement | null {
  const ordered = [...doc.elements].sort((left, right) => right.z - left.z)
  for (const element of ordered) {
    if (element.hidden || element.locked) continue
    if (containsPoint(element, x, y)) return element
  }
  return null
}

/** Marquee selection: every visible, unlocked element whose AABB meets `rect`. */
export function elementsInRect(doc: CanvasDoc, rect: CanvasRect): CanvasElement[] {
  const normalized: CanvasRect = {
    x: Math.min(rect.x, rect.x + rect.width),
    y: Math.min(rect.y, rect.y + rect.height),
    width: Math.abs(rect.width),
    height: Math.abs(rect.height),
  }
  return doc.elements.filter((element) => !element.hidden && !element.locked && rectsIntersect(elementBounds(element), normalized))
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export interface History<T> {
  readonly present: T
  readonly canUndo: boolean
  readonly canRedo: boolean
  undo(): History<T>
  redo(): History<T>
  commit(next: T): History<T>
}

const HISTORY_LIMIT = 50

function makeHistory<T>(present: T, past: T[], future: T[], limit: number): History<T> {
  return {
    present,
    get canUndo() {
      return past.length > 0
    },
    get canRedo() {
      return future.length > 0
    },
    undo() {
      if (!past.length) return makeHistory(present, past, future, limit)
      const previous = past[past.length - 1]
      return makeHistory(previous, past.slice(0, -1), [present, ...future].slice(0, limit), limit)
    },
    redo() {
      if (!future.length) return makeHistory(present, past, future, limit)
      const [next, ...rest] = future
      return makeHistory(next, [...past, present].slice(-limit), rest, limit)
    },
    commit(next: T) {
      // A commit that changes nothing must not create an undo step, or undo
      // appears to do nothing (and the limit fills with duplicates).
      if (canvasDeepEqual(next, present)) return makeHistory(present, past, future, limit)
      return makeHistory(next, [...past, present].slice(-limit), [], limit)
    },
  }
}

/**
 * Bounded undo/redo over an immutable value.
 *
 * Each method returns a new history, so a React component can hold it in state
 * directly. Commits that deep-equal the present value are dropped; the past and
 * future stacks are both capped at `limit` (default 50).
 */
export function createHistory<T>(initial: T, limit = HISTORY_LIMIT): History<T> {
  return makeHistory(initial, [], [], Math.max(1, Math.floor(limit)))
}

// ---------------------------------------------------------------------------
// Serialization — the documented open format
// ---------------------------------------------------------------------------

const DOC_KEY_ORDER = ["version", "id", "name", "width", "height", "background", "elements"] as const
const ELEMENT_KEY_ORDER = ["id", "type", "x", "y", "width", "height", "rotation", "z", "groupId", "locked", "hidden", "content", "style"] as const

function orderedElement(element: CanvasElement): Record<string, unknown> {
  const source = element as unknown as Record<string, unknown>
  const output: Record<string, unknown> = {}
  for (const key of ELEMENT_KEY_ORDER) {
    if (key === "rotation") {
      output[key] = normalizeAngle(element.rotation)
      continue
    }
    output[key] = key === "style" ? { ...(element.style ?? {}) } : source[key]
  }
  return output
}

/**
 * Serialize to the open `LEARN canvas` JSON format.
 *
 * Key order is fixed (`version` first) so two documents that are semantically
 * equal also produce byte-equal JSON — which makes the format diffable in git
 * and makes the round-trip property testable instead of aspirational.
 */
export function serializeCanvas(doc: CanvasDoc): string {
  const normalized = normalizeCanvasDoc(doc)
  const ordered: Record<string, unknown> = {}
  const source = normalized as unknown as Record<string, unknown>
  for (const key of DOC_KEY_ORDER) {
    ordered[key] = key === "elements" ? normalized.elements.map(orderedElement) : source[key]
  }
  return JSON.stringify(ordered, null, 2)
}

/**
 * Parse the open format back into a document. Never throws: invalid JSON falls
 * back to an empty canvas, and partial documents are coerced field by field.
 */
export function parseCanvas(text: string): CanvasDoc {
  try {
    return normalizeCanvasDoc(JSON.parse(text))
  } catch {
    return createCanvasDoc()
  }
}

// ---------------------------------------------------------------------------
// Text layout
// ---------------------------------------------------------------------------

export interface TextFitResult {
  lines: string[]
  truncated: boolean
  lineHeight: number
  width: number
  height: number
}

export interface TextFitOptions {
  lineHeight?: number
  maxLines?: number
}

/**
 * Greedy word wrap for a text box, driven by a font-metric callback so this
 * stays pure and testable. Hard breaks on `\n`; words longer than the box are
 * split by character; overflowing lines are dropped and flagged.
 */
export function fitText(text: string, box: { width: number; height: number }, measure: (line: string) => number, options: TextFitOptions = {}): TextFitResult {
  const lineHeight = options.lineHeight && options.lineHeight > 0 ? options.lineHeight : 24
  const width = Math.max(0, box.width)
  const height = Math.max(0, box.height)
  const maxByHeight = Math.max(1, Math.floor(height / lineHeight))
  const maxLines = Math.max(1, Math.min(options.maxLines ?? maxByHeight, maxByHeight))
  const lines: string[] = []
  let truncated = false

  const push = (line: string): boolean => {
    if (lines.length >= maxLines) {
      truncated = true
      return false
    }
    lines.push(line)
    return true
  }

  for (const paragraph of String(text).split("\n")) {
    if (lines.length >= maxLines) {
      truncated = true
      break
    }
    const words = paragraph.split(/\s+/).filter(Boolean)
    if (!words.length) {
      if (!push("")) break
      continue
    }
    let line = ""
    let stopped = false
    for (const word of words) {
      if (!line) {
        if (measure(word) <= width) {
          line = word
          continue
        }
        // A single word wider than the box: break it by character.
        let fragment = ""
        for (const character of word) {
          if (fragment && measure(fragment + character) > width) {
            if (!push(fragment)) {
              stopped = true
              break
            }
            fragment = character
          } else {
            fragment += character
          }
        }
        if (stopped) break
        line = fragment
        continue
      }
      const candidate = `${line} ${word}`
      if (measure(candidate) <= width) {
        line = candidate
        continue
      }
      if (!push(line)) {
        stopped = true
        break
      }
      line = word
    }
    if (stopped) break
    if (!push(line)) break
  }

  return { lines, truncated, lineHeight, width, height: Math.min(height, lines.length * lineHeight) }
}
