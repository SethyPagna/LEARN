import {
  addElement,
  alignElements,
  boundsOf,
  createElement,
  elementBounds,
  type AlignMode,
  type CanvasDoc,
  type CanvasElement,
  type CanvasRect,
  type ResizeHandle,
  resizeRect,
} from "@/lib/studio/canvas-engine"

import { DESIGN_LIMITS, newDesignId, reidentifyElements } from "./document"
import { nearestFontWeight } from "./fonts"
import { isStrokeOnlyShape, type ShapeKind } from "./shapes"
import { FONT_SIZE_RANGE, readShapeStyle, readTextStyle, type ImageMask } from "./style"
import { naturalTextHeight, naturalTextWidth, type ListStyle, type MeasureText, type TextAlign } from "./text"
import { themeShapeFill, themeTextStyle, type DesignTheme, type PaletteKey, type TextRole } from "./themes"

/**
 * The editor's rules on top of the engine's geometry: what a drag on each
 * handle does to each kind of element, aligning to the page, copy and paste,
 * and the starting look of anything added from a panel.
 *
 * The rules follow the design tools people already know. A text box's corners
 * scale the type with the box and its sides re-wrap the text; a picture keeps
 * its proportions from a corner; a shape stretches freely unless Shift is
 * held; a multi-selection scales as one.
 *
 * Pure apart from id generation: no DOM, no React.
 */

export const ALL_HANDLES: readonly ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"]
export const CORNER_HANDLES: readonly ResizeHandle[] = ["nw", "ne", "se", "sw"]

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

export function isCornerHandle(handle: ResizeHandle): boolean {
  return handle.length === 2
}

function round2(value: number): number {
  return Math.round(value * 100) / 100 || 0
}

/** The handles an element offers. A growing text box has no top/bottom handles: its text sets its height. */
export function elementHandles(element: CanvasElement): readonly ResizeHandle[] {
  if (element.type === "text" && readTextStyle(element).fit === "grow") return ["nw", "ne", "se", "sw", "e", "w"]
  if (element.type === "shape" && isStrokeOnlyShape(readShapeStyle(element).shape)) return ["e", "w"]
  return ALL_HANDLES
}

// ---------------------------------------------------------------------------
// Resizing
// ---------------------------------------------------------------------------

/**
 * Scale a box about the corner opposite `handle`, keeping its proportions.
 * The factor is the pointer's projection on the box diagonal, so the corner
 * follows the pointer smoothly whichever way it strays.
 */
export function scaleFromCorner(rect: CanvasRect & { rotation: number }, handle: ResizeHandle, dx: number, dy: number, minSize = 8): { rect: CanvasRect; scale: number } {
  const { sx, sy } = HANDLE_VECTORS[handle]
  const radians = (rect.rotation * Math.PI) / 180
  const u = { x: Math.cos(radians), y: Math.sin(radians) }
  const v = { x: -Math.sin(radians), y: Math.cos(radians) }
  const halfW = rect.width / 2
  const halfH = rect.height / 2
  const cx = rect.x + halfW
  const cy = rect.y + halfH
  const anchor = { x: cx - sx * halfW * u.x - sy * halfH * v.x, y: cy - sx * halfW * u.y - sy * halfH * v.y }
  const gripped = { x: cx + sx * halfW * u.x + sy * halfH * v.x, y: cy + sx * halfW * u.y + sy * halfH * v.y }
  const diagonal = { x: gripped.x - anchor.x, y: gripped.y - anchor.y }
  const length = diagonal.x * diagonal.x + diagonal.y * diagonal.y
  const pointer = { x: gripped.x + dx - anchor.x, y: gripped.y + dy - anchor.y }
  const minScale = Math.max(minSize / Math.max(1, rect.width), minSize / Math.max(1, rect.height))
  const scale = Math.max(minScale, length > 0 ? (pointer.x * diagonal.x + pointer.y * diagonal.y) / length : 1)
  const width = rect.width * scale
  const height = rect.height * scale
  const center = { x: anchor.x + (diagonal.x * scale) / 2, y: anchor.y + (diagonal.y * scale) / 2 }
  return { rect: { x: center.x - width / 2, y: center.y - height / 2, width, height }, scale }
}

const SCALED_STYLE_KEYS = ["fontSize", "padding", "strokeWidth", "borderWidth", "borderRadius"] as const

/** Multiply the size-like style values (type size, padding, outline, corners) by `factor`. */
export function scaleElementStyle(style: Record<string, unknown>, factor: number): Record<string, unknown> {
  const next = { ...style }
  for (const key of SCALED_STYLE_KEYS) {
    const value = next[key]
    if (typeof value !== "number" || !Number.isFinite(value)) continue
    const scaled = round2(value * factor)
    next[key] = key === "fontSize" ? Math.min(FONT_SIZE_RANGE.max, Math.max(FONT_SIZE_RANGE.min, scaled)) : scaled
  }
  return next
}

/** Change an element's height keeping its top edge where it is (rotation-aware). */
export function withHeightFromTop(element: CanvasElement, height: number): CanvasElement {
  const next = Math.max(1, round2(height))
  const delta = next - element.height
  if (Math.abs(delta) < 0.01) return element
  const radians = (element.rotation * Math.PI) / 180
  const v = { x: -Math.sin(radians), y: Math.cos(radians) }
  const cx = element.x + element.width / 2 + (v.x * delta) / 2
  const cy = element.y + element.height / 2 + (v.y * delta) / 2
  return { ...element, height: next, x: round2(cx - element.width / 2), y: round2(cy - next / 2) }
}

/** A growing text box sized to its text (other boxes come back unchanged). */
export function growText(element: CanvasElement, measure: MeasureText): CanvasElement {
  if (element.type !== "text") return element
  const style = readTextStyle(element)
  if (style.fit !== "grow") return element
  const height = Math.max(Math.ceil(style.size * style.lineHeight * 0.6), naturalTextHeight(element.content, element.width, style, measure))
  return withHeightFromTop(element, height)
}

export interface ResizeGesture {
  handle: ResizeHandle
  /** Pointer travel since the gesture started, in page coordinates. */
  dx: number
  dy: number
  /** Shift held: keep proportions where the element would otherwise stretch. */
  shift: boolean
  measure: MeasureText
  minSize?: number
}

/**
 * Resize one element from its state when the gesture started (so rounding
 * never accumulates over a long drag).
 */
export function resizeDesignElement(start: CanvasElement, gesture: ResizeGesture): CanvasElement {
  const minSize = gesture.minSize ?? 8
  const corner = isCornerHandle(gesture.handle)
  if (start.type === "text") {
    if (corner) {
      const { rect, scale } = scaleFromCorner(start, gesture.handle, gesture.dx, gesture.dy, minSize)
      const scaled = { ...start, ...roundRect(rect), style: scaleElementStyle(start.style, scale) }
      return growText(scaled, gesture.measure)
    }
    const rect = resizeRect(start, gesture.handle, gesture.dx, gesture.dy, minSize)
    return growText({ ...start, ...roundRect(rect) }, gesture.measure)
  }
  const lockAspect = corner && (start.type === "image" || start.type === "embed" ? !gesture.shift : gesture.shift)
  if (lockAspect) {
    const { rect } = scaleFromCorner(start, gesture.handle, gesture.dx, gesture.dy, minSize)
    return { ...start, ...roundRect(rect) }
  }
  return { ...start, ...roundRect(resizeRect(start, gesture.handle, gesture.dx, gesture.dy, minSize)) }
}

/**
 * Scale a multi-selection as one picture from a corner of its bounds: every
 * member keeps its place in the group, and type, padding and outlines scale
 * with it.
 */
export function scaleSelection(starts: readonly CanvasElement[], handle: ResizeHandle, dx: number, dy: number, measure: MeasureText, minSize = 8): CanvasElement[] {
  const bounds = boundsOf(starts as CanvasElement[])
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return [...starts]
  const corner = isCornerHandle(handle) ? handle : "se"
  const { rect, scale } = scaleFromCorner({ ...bounds, rotation: 0 }, corner, dx, dy, minSize)
  return starts.map((element) => {
    if (element.locked) return element
    const cx = rect.x + (element.x + element.width / 2 - bounds.x) * scale
    const cy = rect.y + (element.y + element.height / 2 - bounds.y) * scale
    const width = Math.max(1, element.width * scale)
    const height = Math.max(1, element.height * scale)
    const scaled: CanvasElement = { ...element, x: round2(cx - width / 2), y: round2(cy - height / 2), width: round2(width), height: round2(height), style: scaleElementStyle(element.style, scale) }
    return growText(scaled, measure)
  })
}

function roundRect(rect: CanvasRect): CanvasRect {
  return { x: round2(rect.x), y: round2(rect.y), width: Math.max(1, round2(rect.width)), height: Math.max(1, round2(rect.height)) }
}

// ---------------------------------------------------------------------------
// Aligning
// ---------------------------------------------------------------------------

/**
 * Align a selection. Several separate things align to each other; one thing
 * (a single element, or one group) aligns to the page.
 */
export function alignSelection(canvas: CanvasDoc, ids: readonly string[], mode: AlignMode): CanvasDoc {
  const members = canvas.elements.filter((element) => ids.includes(element.id) && !element.locked)
  if (!members.length) return canvas
  const clusters = new Set(members.map((element) => element.groupId ?? element.id))
  if (members.length > 1 && clusters.size > 1) return alignElements(canvas, ids, mode)
  const bounds = boundsOf(members)
  if (!bounds) return canvas
  let dx = 0
  let dy = 0
  if (mode === "left") dx = -bounds.x
  if (mode === "center") dx = canvas.width / 2 - (bounds.x + bounds.width / 2)
  if (mode === "right") dx = canvas.width - (bounds.x + bounds.width)
  if (mode === "top") dy = -bounds.y
  if (mode === "middle") dy = canvas.height / 2 - (bounds.y + bounds.height / 2)
  if (mode === "bottom") dy = canvas.height - (bounds.y + bounds.height)
  if (!dx && !dy) return canvas
  const moving = new Set(members.map((element) => element.id))
  return { ...canvas, elements: canvas.elements.map((element) => (moving.has(element.id) ? { ...element, x: round2(element.x + dx), y: round2(element.y + dy) } : element)) }
}

// ---------------------------------------------------------------------------
// Copy, paste, duplicate
// ---------------------------------------------------------------------------

/**
 * A copy that is free of the layout that made the original: no content slot
 * (the page's spec would read two boxes into one field) and unlocked.
 */
export function detachElement(element: CanvasElement): CanvasElement {
  const style = { ...element.style }
  delete style.slot
  return { ...element, locked: false, style }
}

/** The clipboard form of a selection: stack order, deep enough to survive later edits. */
export function copyElements(canvas: CanvasDoc, ids: readonly string[]): CanvasElement[] {
  const wanted = new Set(ids)
  return canvas.elements.filter((element) => wanted.has(element.id)).map((element) => ({ ...element, style: { ...element.style } }))
}

/**
 * How far to shift pasted copies so they never land exactly on what is
 * already there: the first free step of a diagonal cascade.
 */
export function pasteOffset(canvas: CanvasDoc, clip: readonly CanvasElement[], step: number): number {
  const lead = clip[0]
  if (!lead) return 0
  for (let k = 0; k < 40; k += 1) {
    const x = lead.x + k * step
    const y = lead.y + k * step
    const taken = canvas.elements.some((element) => Math.abs(element.x - x) < 0.5 && Math.abs(element.y - y) < 0.5)
    if (!taken) return k * step
  }
  return 0
}

/** Paste copies on top of the page. Returns the new ids (select them). */
export function pasteElements(canvas: CanvasDoc, clip: readonly CanvasElement[], step: number): { canvas: CanvasDoc; ids: string[] } {
  const room = Math.max(0, DESIGN_LIMITS.elementsPerPage - canvas.elements.length)
  const items = clip.slice(0, room)
  if (!items.length) return { canvas, ids: [] }
  const offset = pasteOffset(canvas, items, step)
  const fresh = reidentifyElements(items.map(detachElement)).map((element) => ({ ...element, x: round2(element.x + offset), y: round2(element.y + offset) }))
  let next = canvas
  for (const element of fresh) next = addElement(next, element)
  return { canvas: next, ids: fresh.map((element) => element.id) }
}

export function duplicateSelection(canvas: CanvasDoc, ids: readonly string[], step: number): { canvas: CanvasDoc; ids: string[] } {
  return pasteElements(canvas, copyElements(canvas, ids), step)
}

// ---------------------------------------------------------------------------
// Style edits
// ---------------------------------------------------------------------------

const ROLE_KEYS = ["role", "colorRole", "fillRole", "strokeRole", "labelRole", "radiusRole", "look"] as const

/**
 * Apply a style change a person made. On a theme-driven element the changed
 * keys are listed in `custom`, so a later theme switch leaves them alone.
 */
export function setElementStyle(element: CanvasElement, patch: Record<string, unknown>): CanvasElement {
  const style: Record<string, unknown> = { ...element.style, ...patch }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null) delete style[key]
  }
  if (ROLE_KEYS.some((key) => element.style[key] !== undefined && element.style[key] !== null)) {
    const custom = new Set(Array.isArray(element.style.custom) ? element.style.custom.filter((key): key is string => typeof key === "string") : [])
    for (const key of Object.keys(patch)) custom.add(key)
    style.custom = [...custom].sort()
  }
  return { ...element, style }
}

// ---------------------------------------------------------------------------
// New elements
// ---------------------------------------------------------------------------

export interface PageBox {
  width: number
  height: number
}

function unitOf(page: PageBox): number {
  return Math.min(page.width, page.height) / 1080
}

/** Centre `element` on the page (or on `at`), stepping diagonally off anything already sitting there. */
export function placeElement(canvas: CanvasDoc, element: CanvasElement, at?: { x: number; y: number }): CanvasElement {
  const center = at ?? { x: canvas.width / 2, y: canvas.height / 2 }
  const base = { ...element, x: round2(center.x - element.width / 2), y: round2(center.y - element.height / 2) }
  if (at) return base
  const offset = pasteOffset(canvas, [base], Math.round(24 * unitOf(canvas)))
  return { ...base, x: round2(base.x + offset), y: round2(base.y + offset) }
}

export type TextPresetId = "title" | "heading" | "subheading" | "body" | "bullets" | "quote" | "caption" | "kicker"

interface TextPreset {
  label: string
  role: TextRole
  size: number
  lineHeight: number
  sample: string
  /** Box width as a share of the page's short side. */
  width: number
  list?: ListStyle
  align?: TextAlign
  letterSpacing?: number
}

export const TEXT_PRESETS: Record<TextPresetId, TextPreset> = {
  title: { label: "Title", role: "title", size: 104, lineHeight: 1.08, sample: "Add a title", width: 1.05 },
  heading: { label: "Heading", role: "heading", size: 68, lineHeight: 1.12, sample: "Add a heading", width: 0.9 },
  subheading: { label: "Subheading", role: "subtitle", size: 42, lineHeight: 1.25, sample: "Add a subheading", width: 0.8 },
  body: { label: "Body text", role: "body", size: 30, lineHeight: 1.45, sample: "Add a little bit of body text", width: 0.72 },
  bullets: { label: "Bullet list", role: "bullets", size: 30, lineHeight: 1.45, sample: "First idea\nSecond idea\nThird idea", width: 0.72, list: "bullet" },
  quote: { label: "Quote", role: "quote", size: 50, lineHeight: 1.25, sample: "“Write something worth remembering.”", width: 0.9, align: "center" },
  caption: { label: "Caption", role: "caption", size: 22, lineHeight: 1.4, sample: "Add a caption", width: 0.5 },
  kicker: { label: "Label", role: "kicker", size: 22, lineHeight: 1.2, sample: "SECTION LABEL", width: 0.5, letterSpacing: 0.12 },
}

export const TEXT_PRESET_IDS = Object.keys(TEXT_PRESETS) as TextPresetId[]

/** A text box in the theme's look, sized for the page. */
export function textPresetElement(preset: TextPresetId, theme: DesignTheme, page: PageBox, measure: MeasureText): CanvasElement {
  const spec = TEXT_PRESETS[preset]
  const unit = unitOf(page)
  const look = themeTextStyle(theme, spec.role)
  const style: Record<string, unknown> = {
    role: spec.role,
    fontFamily: look.font,
    fontSize: round2(spec.size * unit),
    fontWeight: nearestFontWeight(look.font, look.weight),
    color: look.color,
    italic: look.italic,
    uppercase: look.uppercase,
    lineHeight: spec.lineHeight,
    letterSpacing: spec.letterSpacing ?? 0,
    textAlign: spec.align ?? "left",
    list: spec.list ?? "none",
    fit: "grow",
    padding: 0,
  }
  const maxWidth = Math.min(page.width * 0.9, Math.round(spec.width * Math.min(page.width, page.height)))
  const element = createElement({ id: newDesignId("text"), type: "text", width: maxWidth, height: 10, content: spec.sample, style })
  // Short samples hug their text; long ones wrap at the preset width.
  const natural = naturalTextWidth(spec.sample, readTextStyle(element), measure) + Math.ceil(4 * unit)
  return growText({ ...element, width: Math.max(Math.round(120 * unit), Math.min(maxWidth, natural)) }, measure)
}

/** Emoji and symbols placed as big type (they export as the same glyphs). */
export function stickerElement(glyph: string, page: PageBox, measure: MeasureText): CanvasElement {
  const unit = unitOf(page)
  const style = { fontFamily: "sans", fontSize: round2(180 * unit), fontWeight: 400, lineHeight: 1.15, textAlign: "center", fit: "grow", padding: 0 }
  const element = createElement({ id: newDesignId("text"), type: "text", width: 10, height: 10, content: glyph, style })
  const width = naturalTextWidth(glyph, readTextStyle(element), measure) + Math.ceil(8 * unit)
  return growText({ ...element, width }, measure)
}

/** A shape in the theme's main colour. */
export function shapeElement(kind: ShapeKind, theme: DesignTheme, page: PageBox): CanvasElement {
  const unit = unitOf(page)
  if (isStrokeOnlyShape(kind)) {
    return createElement({
      id: newDesignId("shape"),
      type: "shape",
      width: round2(420 * unit),
      height: round2(24 * unit),
      style: { shape: kind, stroke: theme.palette.text, strokeRole: "text", strokeWidth: round2(6 * unit) },
    })
  }
  const side = round2(280 * unit)
  const wide = kind === "arrow" || kind === "chevron" || kind === "wave" || kind === "pill" || kind === "speech"
  const fillRole: PaletteKey = kind === "star" || kind === "burst" || kind === "heart" ? "accent" : "primary"
  return createElement({
    id: newDesignId("shape"),
    type: "shape",
    width: wide ? round2(side * 1.5) : side,
    height: side,
    style: { shape: kind, fill: theme.palette[fillRole], fillRole, color: theme.palette.onPrimary, labelRole: "onPrimary", fontFamily: theme.fonts.body, fontSize: round2(34 * unit), fontWeight: 600 },
  })
}

/** A soft card in the theme (a panel to put text on). */
export function cardElement(theme: DesignTheme, page: PageBox): CanvasElement {
  const unit = unitOf(page)
  return createElement({
    id: newDesignId("shape"),
    type: "shape",
    width: round2(560 * unit),
    height: round2(360 * unit),
    style: { shape: "rounded", fill: theme.palette.surface, fillRole: "surface", look: "card", shadow: "soft", radiusRole: "theme", borderRadius: round2(theme.radius * unit) },
  })
}

/** An empty picture frame (drop or upload a picture into it). */
export function frameElement(mask: ImageMask, page: PageBox): CanvasElement {
  const unit = unitOf(page)
  const side = round2(420 * unit)
  const tall = mask === "arch"
  return createElement({
    id: newDesignId("image"),
    type: "image",
    width: side,
    height: tall ? round2(side * 1.3) : side,
    content: "",
    style: { mask, fit: "cover", ...(mask === "rounded" ? { borderRadius: round2(36 * unit) } : {}) },
  })
}

/** A picture sized to sit comfortably on the page at its own proportions. */
export function pictureElement(src: string, natural: { width: number; height: number } | null, page: PageBox): CanvasElement {
  const ratio = natural && natural.width > 0 && natural.height > 0 ? natural.width / natural.height : 4 / 3
  const maxWidth = page.width * 0.6
  const maxHeight = page.height * 0.6
  let width = maxWidth
  let height = width / ratio
  if (height > maxHeight) {
    height = maxHeight
    width = height * ratio
  }
  return createElement({ id: newDesignId("image"), type: "image", width: round2(width), height: round2(height), content: src, style: { fit: "cover" } })
}

/**
 * An element made for the old one-size canvas (an AI block dropped from a
 * reply) restyled for a design page: design type defaults and sizes scaled to
 * the page.
 */
export function adaptDroppedElement(element: CanvasElement, page: PageBox, theme: DesignTheme, measure: MeasureText): CanvasElement {
  const factor = Math.max(0.5, unitOf(page) * 1.5)
  const scaled: CanvasElement = { ...element, id: newDesignId(element.type), width: round2(element.width * factor), height: round2(element.height * factor), style: scaleElementStyle(element.style, factor) }
  if (element.type === "text") {
    const look = themeTextStyle(theme, "body")
    const style = { fontFamily: look.font, color: look.color, lineHeight: 1.4, fit: "grow", ...scaled.style, padding: round2(12 * unitOf(page)) }
    return growText({ ...scaled, style }, measure)
  }
  if (element.type === "shape" && !scaled.style.shape) {
    return { ...scaled, style: { ...scaled.style, shape: "rounded", fill: scaled.style.backgroundColor ?? themeShapeFill(theme, "divider") } }
  }
  return scaled
}

/** The union box of elements in page coordinates (rotated boxes included). */
export function selectionBounds(elements: readonly CanvasElement[]): CanvasRect | null {
  if (!elements.length) return null
  if (elements.length === 1) return elementBounds(elements[0])
  return boundsOf(elements as CanvasElement[])
}
