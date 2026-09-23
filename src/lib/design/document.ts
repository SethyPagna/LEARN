import { createElement, normalizeCanvasDoc, type CanvasDoc, type CanvasElement } from "@/lib/studio/canvas-engine"
import { safeColor } from "@/lib/studio/canvas-styles"

import { nearestFontWeight } from "./fonts"
import { designFormat, formatForSize, isDesignFormatId, MAX_PAGE_EDGE, MIN_PAGE_EDGE, type DesignFormatId } from "./formats"
import { isPagePattern, type PagePattern } from "./shapes"
import { LAYOUT_IDS, normalizePageSpec, type LayoutId, type PageSpec } from "./spec"
import { designTheme, isPaletteKey, isTextRole, isTextSurface, themeCardLook, themeTextStyle, type DesignTheme, type PaletteKey } from "./themes"

/**
 * The multi-page design document.
 *
 * A design is a list of pages that share one size and one theme. Each page is
 * a plain `canvas-engine` element list, so every move, resize, rotate, snap,
 * group and align on a page is the engine's tested code: the editor turns the
 * current page into a `CanvasDoc` with `pageCanvas`, runs the engine function,
 * and writes the result back with `withPageCanvas`.
 *
 * Theming is data, not code. Layout-made elements carry roles (`role`,
 * `colorRole`, `fillRole`, `strokeRole`, `surface`) next to their resolved look,
 * and `applyTheme` rewrites the look from the roles. Anything a person adds by
 * hand has no roles and keeps exactly what they chose.
 *
 * The first canvas format (one page, `version: 1`) still loads:
 * `normalizeDesignDoc` migrates it into a one-page design.
 *
 * Pure apart from id generation: no DOM, no React.
 */

export const DESIGN_VERSION = 2 as const
export const DESIGN_KIND = "learn-design" as const

export type PageTransition = "none" | "fade" | "slide" | "zoom"
export const PAGE_TRANSITIONS: readonly PageTransition[] = ["none", "fade", "slide", "zoom"]

export interface DesignPage {
  id: string
  /** The page fill. While `backgroundRole` is set it follows the theme. */
  background: string
  backgroundRole: PaletteKey | null
  pattern: PagePattern
  /** The page's elements, in the engine's shape: sorted by dense `z`. */
  elements: CanvasElement[]
  /** Speaker notes; never drawn on the page. */
  notes: string
  /** The layout that built this page, when one did. */
  layout: LayoutId | null
  /** The content the layout was run on, kept so a smart resize can rebuild it. */
  spec: PageSpec | null
  /** Hidden pages are skipped when presenting and exporting. */
  hidden: boolean
  transition: PageTransition
}

export interface DesignDoc {
  version: typeof DESIGN_VERSION
  kind: typeof DESIGN_KIND
  id: string
  name: string
  format: DesignFormatId | "custom"
  width: number
  height: number
  theme: string
  pages: DesignPage[]
}

export const DESIGN_LIMITS = {
  pages: 60,
  elementsPerPage: 250,
  contentLength: 4000,
  notesLength: 4000,
  nameLength: 120,
} as const

// ---------------------------------------------------------------------------
// Ids
// ---------------------------------------------------------------------------

let idCounter = 0

/** A fresh id: random where the platform has crypto, counter-backed otherwise. */
export function newDesignId(prefix: string): string {
  idCounter += 1
  let random = ""
  const cryptoApi = (globalThis as { crypto?: { getRandomValues?: (array: Uint32Array) => Uint32Array } }).crypto
  if (cryptoApi?.getRandomValues) {
    const values = cryptoApi.getRandomValues(new Uint32Array(2))
    random = `${values[0].toString(36)}${values[1].toString(36)}`.slice(0, 10)
  } else {
    random = Math.floor(Math.random() * 1e12).toString(36)
  }
  return `${prefix}_${idCounter.toString(36)}${random}`
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function clampEdge(value: unknown, fallback: number): number {
  const number = typeof value === "number" && Number.isFinite(value) ? value : fallback
  return Math.round(Math.min(MAX_PAGE_EDGE, Math.max(MIN_PAGE_EDGE, number)))
}

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : ""
}

/** The page pattern a theme's decoration implies (ruled paper, a grid, none). */
export function themePattern(theme: DesignTheme): PagePattern {
  if (theme.decoration === "notebook") return "lines"
  if (theme.decoration === "grid") return "grid"
  return "none"
}

/** A blank page dressed in the theme. */
export function blankPage(themeId: string, input: Partial<DesignPage> = {}): DesignPage {
  const theme = designTheme(themeId)
  return createDesignPage({
    background: theme.palette.background,
    backgroundRole: "background",
    pattern: themePattern(theme),
    ...input,
  })
}

export function createDesignPage(input: Partial<DesignPage> = {}): DesignPage {
  return {
    id: typeof input.id === "string" && input.id.trim() ? input.id : newDesignId("pg"),
    background: typeof input.background === "string" && input.background.trim() ? input.background : "#FFFFFF",
    backgroundRole: isPaletteKey(input.backgroundRole) ? input.backgroundRole : null,
    pattern: isPagePattern(input.pattern) ? input.pattern : "none",
    elements: Array.isArray(input.elements) ? input.elements : [],
    notes: cleanText(input.notes, DESIGN_LIMITS.notesLength),
    layout: input.layout && LAYOUT_IDS.includes(input.layout) ? input.layout : null,
    spec: input.spec ?? null,
    hidden: input.hidden === true,
    transition: input.transition && PAGE_TRANSITIONS.includes(input.transition) ? input.transition : "fade",
  }
}

export interface CreateDesignInput {
  id?: string
  name?: string
  format?: DesignFormatId | "custom"
  width?: number
  height?: number
  theme?: string
  pages?: DesignPage[]
}

export function createDesignDoc(input: CreateDesignInput = {}): DesignDoc {
  const format = input.format === "custom" ? "custom" : isDesignFormatId(input.format) ? input.format : "presentation"
  const size = format === "custom" ? { width: input.width ?? 1920, height: input.height ?? 1080 } : designFormat(format)
  const theme = designTheme(input.theme).id
  return {
    version: DESIGN_VERSION,
    kind: DESIGN_KIND,
    id: typeof input.id === "string" && input.id.trim() ? input.id : newDesignId("design"),
    name: typeof input.name === "string" && input.name.trim() ? input.name.slice(0, DESIGN_LIMITS.nameLength) : "Untitled design",
    format,
    width: clampEdge(size.width, 1920),
    height: clampEdge(size.height, 1080),
    theme,
    pages: input.pages?.length ? input.pages.slice(0, DESIGN_LIMITS.pages) : [blankPage(theme)],
  }
}

// ---------------------------------------------------------------------------
// Normalization (stored / imported / shared JSON -> a safe document)
// ---------------------------------------------------------------------------

/** Engine normalization plus caps and unique ids within the page. */
function normalizeElements(value: unknown): CanvasElement[] {
  const raw = Array.isArray(value) ? value.slice(0, DESIGN_LIMITS.elementsPerPage) : []
  const elements = normalizeCanvasDoc({ elements: raw }).elements
  const seen = new Set<string>()
  return elements.map((element) => {
    let id = element.id.slice(0, 80)
    while (seen.has(id)) id = `${id}-2`
    seen.add(id)
    const content = element.content.length > DESIGN_LIMITS.contentLength ? element.content.slice(0, DESIGN_LIMITS.contentLength) : element.content
    return id === element.id && content === element.content ? element : { ...element, id, content }
  })
}

function normalizePage(value: unknown, index: number, usedIds: Set<string>): DesignPage {
  const record = isRecord(value) ? value : {}
  let id = typeof record.id === "string" && record.id.trim() ? record.id.trim().slice(0, 80) : `page-${index + 1}`
  while (usedIds.has(id)) id = `${id}-2`
  usedIds.add(id)
  const layout = typeof record.layout === "string" && (LAYOUT_IDS as readonly string[]).includes(record.layout) ? (record.layout as LayoutId) : null
  return createDesignPage({
    id,
    background: safeColor(record.background) ?? "#FFFFFF",
    backgroundRole: isPaletteKey(record.backgroundRole) ? record.backgroundRole : null,
    pattern: isPagePattern(record.pattern) ? record.pattern : "none",
    elements: normalizeElements(record.elements),
    notes: cleanText(record.notes, DESIGN_LIMITS.notesLength),
    layout,
    spec: record.spec ? normalizePageSpec(record.spec) : null,
    hidden: record.hidden === true,
    transition: typeof record.transition === "string" && (PAGE_TRANSITIONS as readonly string[]).includes(record.transition) ? (record.transition as PageTransition) : "fade",
  })
}

/**
 * The first canvas format drew text with 8px padding at a 1.4 line height and
 * a 600 weight by default. Those defaults are written into the style so the
 * migrated text looks the way it did.
 */
function migrateLegacyElement(element: CanvasElement): CanvasElement {
  if (element.type === "text") {
    const style = element.style ?? {}
    return {
      ...element,
      style: {
        fontFamily: "sans",
        fontSize: 22,
        fontWeight: 600,
        color: "#1F2937",
        padding: 8,
        lineHeight: 1.4,
        fit: "none",
        ...style,
      },
    }
  }
  if (element.type === "shape") {
    const style = element.style ?? {}
    return { ...element, style: { fontSize: 15, fontWeight: 600, ...style } }
  }
  return element
}

export function isDesignDocShape(value: unknown): boolean {
  return isRecord(value) && (value.kind === DESIGN_KIND || value.version === DESIGN_VERSION) && Array.isArray(value.pages)
}

/**
 * Defensive parse. Never throws: a design comes back as a design, a first-format
 * canvas is migrated into a one-page design, and anything else becomes a blank
 * design.
 */
export function normalizeDesignDoc(input: unknown): DesignDoc {
  if (!isRecord(input)) return createDesignDoc()

  if (isDesignDocShape(input)) {
    const formatId = input.format === "custom" ? "custom" : isDesignFormatId(input.format) ? input.format : null
    const known = formatId && formatId !== "custom" ? designFormat(formatId) : null
    const width = clampEdge(known ? known.width : input.width, 1920)
    const height = clampEdge(known ? known.height : input.height, 1080)
    const usedIds = new Set<string>()
    const pages = (input.pages as unknown[]).slice(0, DESIGN_LIMITS.pages).map((page, index) => normalizePage(page, index, usedIds))
    return createDesignDoc({
      id: typeof input.id === "string" ? input.id.slice(0, 80) : undefined,
      name: typeof input.name === "string" ? input.name : undefined,
      format: formatId ?? (formatForSize(width, height)?.id || "custom"),
      width,
      height,
      theme: typeof input.theme === "string" ? input.theme : undefined,
      pages,
    })
  }

  if (Array.isArray(input.elements)) {
    const canvas: CanvasDoc = normalizeCanvasDoc(input)
    const width = clampEdge(canvas.width, 1080)
    const height = clampEdge(canvas.height, 720)
    const page = createDesignPage({
      id: "page-1",
      background: canvas.background,
      backgroundRole: null,
      pattern: "none",
      elements: normalizeElements(canvas.elements.map(migrateLegacyElement)),
    })
    return createDesignDoc({
      id: canvas.id,
      name: canvas.name === "Untitled canvas" ? "Untitled design" : canvas.name,
      format: formatForSize(width, height)?.id || "custom",
      width,
      height,
      theme: "minimal",
      pages: [page],
    })
  }

  return createDesignDoc()
}

// ---------------------------------------------------------------------------
// Pages <-> engine documents
// ---------------------------------------------------------------------------

function clampIndex(doc: DesignDoc, index: number): number {
  return Math.max(0, Math.min(doc.pages.length - 1, Math.floor(Number.isFinite(index) ? index : 0)))
}

/** One page as an engine document, so any engine function can run on it. */
export function pageCanvas(doc: DesignDoc, index: number): CanvasDoc {
  const page = doc.pages[clampIndex(doc, index)]
  return { version: 1, id: page.id, name: doc.name, width: doc.width, height: doc.height, background: page.background, elements: page.elements }
}

/** Write an engine document's elements back into a page. */
export function withPageCanvas(doc: DesignDoc, index: number, canvas: CanvasDoc): DesignDoc {
  return withPageElements(doc, index, canvas.elements)
}

export function withPageElements(doc: DesignDoc, index: number, elements: CanvasElement[]): DesignDoc {
  const target = clampIndex(doc, index)
  if (doc.pages[target].elements === elements) return doc
  return { ...doc, pages: doc.pages.map((page, position) => (position === target ? { ...page, elements } : page)) }
}

export function updatePage(doc: DesignDoc, index: number, patch: Partial<Omit<DesignPage, "id">>): DesignDoc {
  const target = clampIndex(doc, index)
  return { ...doc, pages: doc.pages.map((page, position) => (position === target ? { ...page, ...patch } : page)) }
}

// ---------------------------------------------------------------------------
// Page operations
// ---------------------------------------------------------------------------

/** Insert a page after `afterIndex` (-1 inserts first). Returns the new page's index. */
export function addPage(doc: DesignDoc, afterIndex: number, page?: DesignPage): { doc: DesignDoc; index: number } {
  if (doc.pages.length >= DESIGN_LIMITS.pages) return { doc, index: clampIndex(doc, afterIndex) }
  const insertAt = Math.max(0, Math.min(doc.pages.length, Math.floor(afterIndex) + 1))
  const next = page ?? blankPage(doc.theme)
  const pages = [...doc.pages.slice(0, insertAt), next, ...doc.pages.slice(insertAt)]
  return { doc: { ...doc, pages }, index: insertAt }
}

/** Give a copied element list fresh element and group ids, keeping groups together. */
export function reidentifyElements(elements: CanvasElement[]): CanvasElement[] {
  const groups = new Map<string, string>()
  return elements.map((element) => {
    let groupId: string | null = null
    if (element.groupId) {
      groupId = groups.get(element.groupId) ?? newDesignId("group")
      groups.set(element.groupId, groupId)
    }
    return { ...element, id: newDesignId(element.type), groupId, style: { ...element.style } }
  })
}

export function duplicatePage(doc: DesignDoc, index: number): { doc: DesignDoc; index: number } {
  const source = doc.pages[clampIndex(doc, index)]
  const copy: DesignPage = { ...source, id: newDesignId("pg"), elements: reidentifyElements(source.elements) }
  return addPage(doc, clampIndex(doc, index), copy)
}

/** Remove a page. The last page is replaced by a blank one: a design always has a page. */
export function removePage(doc: DesignDoc, index: number): { doc: DesignDoc; index: number } {
  const target = clampIndex(doc, index)
  if (doc.pages.length <= 1) return { doc: { ...doc, pages: [blankPage(doc.theme)] }, index: 0 }
  const pages = doc.pages.filter((_, position) => position !== target)
  return { doc: { ...doc, pages }, index: Math.min(target, pages.length - 1) }
}

export function movePage(doc: DesignDoc, from: number, to: number): DesignDoc {
  const source = clampIndex(doc, from)
  const target = clampIndex(doc, to)
  if (source === target) return doc
  const pages = [...doc.pages]
  const [page] = pages.splice(source, 1)
  pages.splice(target, 0, page)
  return { ...doc, pages }
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

/** Short-side unit: 1 at a 1080px short side. Radii and shadows scale with it. */
export function pageUnit(doc: Pick<DesignDoc, "width" | "height">): number {
  return Math.min(doc.width, doc.height) / 1080
}

/** Restyle one element from its roles; elements without roles come back unchanged. */
export function themeElement(element: CanvasElement, theme: DesignTheme, unit: number): CanvasElement {
  const style = element.style ?? {}
  const patch: Record<string, unknown> = {}

  if (element.type === "text" && isTextRole(style.role)) {
    const surface = isTextSurface(style.surface) ? style.surface : "page"
    const look = themeTextStyle(theme, style.role, surface)
    patch.fontFamily = look.font
    patch.fontWeight = nearestFontWeight(look.font, look.weight)
    patch.uppercase = look.uppercase
    patch.italic = look.italic
    patch.color = surface !== "primary" && isPaletteKey(style.colorRole) ? theme.palette[style.colorRole] : look.color
  } else if (element.type === "text" && isPaletteKey(style.colorRole)) {
    patch.color = theme.palette[style.colorRole]
  }

  if (element.type === "shape" || element.type === "text" || element.type === "image") {
    if (isPaletteKey(style.fillRole)) {
      if (element.type === "shape") patch.fill = theme.palette[style.fillRole]
      else patch.backgroundColor = theme.palette[style.fillRole]
    }
    if (style.look === "card") {
      const look = themeCardLook(theme)
      patch.shadow = look.shadow
      patch.strokeRole = look.strokeRole
      patch.stroke = look.strokeRole ? theme.palette[look.strokeRole] : null
      patch.strokeWidth = look.strokeRole ? Math.round(look.strokeWidth * unit * 100) / 100 : 0
    } else if (isPaletteKey(style.strokeRole)) {
      patch.stroke = theme.palette[style.strokeRole]
    }
    if (element.type === "shape" && isPaletteKey(style.labelRole)) patch.color = theme.palette[style.labelRole]
    if (style.radiusRole === "theme") patch.borderRadius = Math.round(theme.radius * unit * 100) / 100
  }

  // Properties a person set by hand (the editor lists them in `custom`) keep
  // their value through a theme change; everything else follows the theme.
  if (Array.isArray(style.custom)) {
    for (const key of style.custom) {
      if (typeof key === "string") delete patch[key]
    }
  }

  if (!Object.keys(patch).length) return element
  return { ...element, style: { ...style, ...patch } }
}

/**
 * Switch the design's theme. Pages whose background follows the theme take the
 * new palette and pattern; every element with roles is restyled; nothing moves.
 */
export function applyTheme(doc: DesignDoc, themeId: string): DesignDoc {
  const theme = designTheme(themeId)
  const unit = pageUnit(doc)
  const pages = doc.pages.map((page) => {
    const elements = page.elements.map((element) => themeElement(element, theme, unit))
    const changed = elements.some((element, index) => element !== page.elements[index])
    const followsTheme = page.backgroundRole !== null
    if (!changed && !followsTheme) return page
    return {
      ...page,
      elements: changed ? elements : page.elements,
      ...(followsTheme ? { background: theme.palette[page.backgroundRole as PaletteKey], pattern: page.layout || page.pattern !== "none" ? themePattern(theme) : page.pattern } : {}),
    }
  })
  return { ...doc, theme: theme.id, pages }
}

// ---------------------------------------------------------------------------
// Resize (scale mode; the layout module adds a relayout mode on top)
// ---------------------------------------------------------------------------

function scaleNumber(value: unknown, factor: number): unknown {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value * factor * 100) / 100 : value
}

/**
 * Scale one element from an old page size to a new one.
 *
 * Positions keep their place relative to the page (centres scale per axis),
 * while sizes, type and radii scale uniformly by the smaller factor, so nothing
 * is stretched. An element that spans (nearly) the full width or height keeps
 * spanning it: a full-bleed background stays full-bleed.
 */
export function scaleElement(element: CanvasElement, from: { width: number; height: number }, to: { width: number; height: number }): CanvasElement {
  const sx = to.width / from.width
  const sy = to.height / from.height
  const uniform = Math.min(sx, sy)
  const fullWidth = element.x <= from.width * 0.02 && element.x + element.width >= from.width * 0.98
  const fullHeight = element.y <= from.height * 0.02 && element.y + element.height >= from.height * 0.98
  const width = fullWidth ? element.width * sx : element.width * uniform
  const height = fullHeight ? element.height * sy : element.height * uniform
  const cx = (element.x + element.width / 2) * sx
  const cy = (element.y + element.height / 2) * sy
  const style = { ...element.style }
  for (const key of ["fontSize", "borderRadius", "strokeWidth", "borderWidth", "padding"]) {
    if (key in style) style[key] = scaleNumber(style[key], uniform)
  }
  return {
    ...element,
    x: Math.round((cx - width / 2) * 100) / 100,
    y: Math.round((cy - height / 2) * 100) / 100,
    width: Math.max(1, Math.round(width * 100) / 100),
    height: Math.max(1, Math.round(height * 100) / 100),
    style,
  }
}

export function scaleDesign(doc: DesignDoc, target: { format: DesignFormatId | "custom"; width: number; height: number }): DesignDoc {
  const width = clampEdge(target.width, doc.width)
  const height = clampEdge(target.height, doc.height)
  if (width === doc.width && height === doc.height) return { ...doc, format: target.format }
  const from = { width: doc.width, height: doc.height }
  const to = { width, height }
  return {
    ...doc,
    format: target.format,
    width,
    height,
    pages: doc.pages.map((page) => ({ ...page, elements: page.elements.map((element) => scaleElement(element, from, to)) })),
  }
}

// ---------------------------------------------------------------------------
// Serialization — the documented open format
// ---------------------------------------------------------------------------

const DOC_KEYS = ["version", "kind", "id", "name", "format", "width", "height", "theme", "pages"] as const
const PAGE_KEYS = ["id", "background", "backgroundRole", "pattern", "layout", "hidden", "transition", "notes", "spec", "elements"] as const
const ELEMENT_KEYS = ["id", "type", "x", "y", "width", "height", "rotation", "z", "groupId", "locked", "hidden", "content", "style"] as const

function pick<T extends object>(source: T, keys: readonly string[]): Record<string, unknown> {
  const record = source as unknown as Record<string, unknown>
  const output: Record<string, unknown> = {}
  for (const key of keys) output[key] = record[key]
  return output
}

/** Stable key order, so equal designs serialize to equal bytes (diffable, testable). */
export function serializeDesign(doc: DesignDoc): string {
  const normalized = normalizeDesignDoc(doc)
  const output = pick(normalized, DOC_KEYS)
  output.pages = normalized.pages.map((page) => {
    const record = pick(page, PAGE_KEYS)
    record.elements = page.elements.map((element) => pick(element, ELEMENT_KEYS))
    return record
  })
  return JSON.stringify(output)
}

export function parseDesign(text: string): DesignDoc {
  try {
    return normalizeDesignDoc(JSON.parse(text))
  } catch {
    return createDesignDoc()
  }
}

/**
 * A stored design cut down to what a picker shows: its first visible page
 * (the cover) and how many pages it has. Old one-page canvases come back as
 * one-page designs.
 */
export function designPreview(input: unknown): { preview: DesignDoc; pageCount: number } {
  const doc = normalizeDesignDoc(input)
  const cover = doc.pages.find((page) => !page.hidden) ?? doc.pages[0]
  return { preview: { ...doc, pages: [cover] }, pageCount: doc.pages.length }
}

/** Every piece of text in the design, for search and the vault summary. */
export function designPlainText(doc: DesignDoc, limit = 4000): string {
  const parts: string[] = [doc.name]
  for (const page of doc.pages) {
    for (const element of page.elements) {
      if ((element.type === "text" || element.type === "shape") && element.content.trim()) parts.push(element.content.trim())
    }
  }
  return parts.join("\n").slice(0, limit)
}

/** A new element with a fresh id (a thin wrapper so callers need not import the engine). */
export function designElement(input: Parameters<typeof createElement>[0]): CanvasElement {
  return createElement({ ...input, id: input.id ?? newDesignId(input.type) })
}
