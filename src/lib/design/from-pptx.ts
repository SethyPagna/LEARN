import { createElement, type CanvasElement } from "@/lib/studio/canvas-engine"
import { CONTENT_IMPORT_MAX_BYTES, relationshipPath, resolveRelationship } from "@/lib/export/pptx-import"
import { attribute, childElements, childNamed, childrenNamed, decodeXmlBytes, descendants, findFirst, parseXml, textOf, type XmlElement } from "@/lib/export/xml-read"
import { normalizePartNames, readZip } from "@/lib/export/zip"
import { createDesignDoc, createDesignPage, DESIGN_LIMITS, type DesignDoc, type DesignPage, type PageTransition } from "./document"
import type { DesignFontId } from "./fonts"
import { designFormat } from "./formats"
import { PPTX_FONT_FACES } from "./pptx"
import type { ShapeKind } from "./shapes"
import { withAlpha } from "./style"
import { serializeTableCells, TABLE_LIMITS } from "./table"

/**
 * A PowerPoint file as a presentation design, keeping each slide's layout.
 *
 * Text boxes, placeholders, shapes, lines, pictures, tables, groups and backgrounds land
 * where they were, at their size, in their colours and fonts, so the slides look
 * like the original and every piece stays editable. Positions, sizes and type
 * are read in EMU (914,400 per inch) and scaled onto the 1920 x 1080 (16:9) or
 * 1440 x 1080 (4:3) page; other slide shapes are fitted onto the nearer one.
 *
 * What a slide shows is spread over four parts, and each is read in turn:
 *
 *   - the **slide** itself (its shapes, and placeholders filled in),
 *   - its **layout** (where an unmoved placeholder sits, decorations),
 *   - the layout's **master** (text styles, more decorations, the colour map),
 *   - the master's **theme** (the colour scheme and the heading/body fonts).
 *
 * A design element has one text style, so a text box takes the look of its
 * first run of text. Pictures are handed to `placePicture` once each (the app
 * uploads them); without it, pictures are left out. Pure: no DOM.
 */

const EMU_PER_POINT = 12_700
const MAX_SLIDES_READ = 100
const MAX_PICTURES = 80
const MAX_GROUP_DEPTH = 8
/** Pictures a browser can draw; EMF, WMF and TIFF cannot be shown. */
const PICTURE_TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", bmp: "image/bmp", webp: "image/webp", svg: "image/svg+xml", avif: "image/avif" }

export interface PptxPicture {
  /** The picture's part in the file, e.g. `ppt/media/image3.png`. */
  path: string
  name: string
  type: string
  bytes: Uint8Array
}

export interface PptxDesignOptions {
  id?: string
  /** Used when the file has no title of its own. */
  fallbackTitle?: string
  /** Store one picture and return where it is served from, or null to leave it out. */
  placePicture?: (picture: PptxPicture) => Promise<string | null>
  onProgress?: (progress: { stage: "pictures"; done: number; total: number }) => void
}

export interface ImportedPptxDesign {
  design: DesignDoc
  warnings: string[]
}

// ---------------------------------------------------------------------------
// The package
// ---------------------------------------------------------------------------

interface PptxPackage {
  parts: Record<string, Uint8Array>
  xml: (path: string) => XmlElement
  /** The part a relationship of `type` (and `id`, when given) points at, or null. */
  related: (owner: string, type: string, id?: string) => string | null
}

async function openPackage(bytes: Uint8Array): Promise<PptxPackage> {
  const parts = normalizePartNames(await readZip(bytes, { maxArchiveBytes: CONTENT_IMPORT_MAX_BYTES, maxEntries: 5000, maxEntryBytes: 20 * 1024 * 1024, maxTotalBytes: 100 * 1024 * 1024 }))
  const parsed = new Map<string, XmlElement>()
  const xml = (path: string) => {
    let root = parsed.get(path)
    if (!root) {
      if (!parts[path]) throw new Error(`PPTX is missing ${path}.`)
      root = parseXml(decodeXmlBytes(parts[path]), path, { preserveQualifiedAttributes: true, maxDepth: 60, maxNodes: 200_000 })
      parsed.set(path, root)
    }
    return root
  }
  const related = (owner: string, type: string, id?: string) => {
    const rels = relationshipPath(owner)
    if (!parts[rels]) return null
    const relation = childrenNamed(xml(rels), "Relationship").find((rel) => (id === undefined || attribute(rel, "Id") === id) && attribute(rel, "Type").endsWith(`/${type}`))
    if (!relation || attribute(relation, "TargetMode") === "External") return null
    try { return resolveRelationship(owner, relation) } catch { return null }
  }
  return { parts, xml, related }
}

// ---------------------------------------------------------------------------
// Theme, colours and fonts
// ---------------------------------------------------------------------------

interface Theme {
  colors: Record<string, string>
  majorFont: string
  minorFont: string
  lineWidths: number[]
}

function readTheme(root: XmlElement | null): Theme {
  const colors: Record<string, string> = {}
  const scheme = root ? findFirst(root, "clrScheme") : null
  for (const slot of scheme ? childElements(scheme) : []) {
    const value = childElements(slot)[0]
    const hex = value?.name === "srgbClr" ? cleanHex(attribute(value, "val")) : value?.name === "sysClr" ? cleanHex(attribute(value, "lastClr")) : null
    if (hex) colors[slot.name] = hex
  }
  const fontScheme = root ? findFirst(root, "fontScheme") : null
  const face = (name: string) => {
    const font = fontScheme ? childNamed(fontScheme, name) : null
    return attribute(font ? childNamed(font, "latin") : null, "typeface")
  }
  const lines = root ? findFirst(root, "lnStyleLst") : null
  return {
    colors,
    majorFont: face("majorFont"),
    minorFont: face("minorFont"),
    lineWidths: (lines ? childrenNamed(lines, "ln") : []).map((line) => number(attribute(line, "w"), 9525)),
  }
}

interface ColorContext {
  theme: Theme
  /** Slide colour names (`bg1`, `tx1`, …) to theme slots (`lt1`, `dk1`, …). */
  colorMap: Record<string, string>
  /** What `phClr` means here: the colour a style reference passed down. */
  placeholder?: Paint
}

interface Paint {
  hex: string
  alpha: number
}

const DEFAULT_COLOR_MAP: Record<string, string> = { bg1: "lt1", tx1: "dk1", bg2: "lt2", tx2: "dk2" }
const PRESET_COLORS: Record<string, string> = { black: "000000", white: "FFFFFF", red: "FF0000", green: "008000", blue: "0000FF", yellow: "FFFF00", gray: "808080", grey: "808080", orange: "FFA500", purple: "800080", navy: "000080", teal: "008080", silver: "C0C0C0", maroon: "800000" }

function cleanHex(value: string): string | null {
  return /^[0-9a-fA-F]{6}$/.test(value) ? value.toUpperCase() : null
}

function number(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

/** A colour element (`srgbClr`, `schemeClr`, …) with its tint, shade and luminance changes applied. */
function readColor(node: XmlElement | null | undefined, context: ColorContext): Paint | null {
  if (!node) return null
  let hex: string | null = null
  let alpha = 1
  if (node.name === "srgbClr") hex = cleanHex(attribute(node, "val"))
  else if (node.name === "sysClr") hex = cleanHex(attribute(node, "lastClr")) ?? (attribute(node, "val") === "window" ? "FFFFFF" : "000000")
  else if (node.name === "prstClr") hex = PRESET_COLORS[attribute(node, "val")] ?? null
  else if (node.name === "scrgbClr") hex = ["r", "g", "b"].map((key) => Math.round(Math.min(1, Math.max(0, number(attribute(node, key), 0) / 100_000)) * 255).toString(16).padStart(2, "0")).join("").toUpperCase()
  else if (node.name === "schemeClr") {
    const name = attribute(node, "val")
    if (name === "phClr") {
      hex = context.placeholder?.hex.slice(1) ?? null
      alpha = context.placeholder?.alpha ?? 1
    } else hex = context.theme.colors[context.colorMap[name] ?? DEFAULT_COLOR_MAP[name] ?? name] ?? null
  }
  if (!hex) return null
  let [r, g, b] = [0, 2, 4].map((start) => Number.parseInt(hex!.slice(start, start + 2), 16))
  for (const change of childElements(node)) {
    const amount = number(attribute(change, "val"), 100_000) / 100_000
    if (change.name === "alpha") alpha = Math.min(1, Math.max(0, amount))
    else if (change.name === "shade") [r, g, b] = [r, g, b].map((channel) => channel * amount)
    else if (change.name === "tint") [r, g, b] = [r, g, b].map((channel) => channel + (255 - channel) * (1 - amount))
    else if (change.name === "lumMod" || change.name === "lumOff") {
      const [h, s, l] = toHsl(r, g, b)
      ;[r, g, b] = fromHsl(h, s, Math.min(1, Math.max(0, change.name === "lumMod" ? l * amount : l + amount)))
    }
  }
  const channel = (value: number) => Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, "0")
  return { hex: `#${channel(r)}${channel(g)}${channel(b)}`.toUpperCase(), alpha }
}

function toHsl(r: number, g: number, b: number): [number, number, number] {
  const [red, green, blue] = [r / 255, g / 255, b / 255]
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === red ? (green - blue) / d + (green < blue ? 6 : 0) : max === green ? (blue - red) / d + 2 : (red - green) / d + 4
  return [h / 6, s, l]
}

function fromHsl(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255]
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hue = (t: number) => {
    const x = t < 0 ? t + 1 : t > 1 ? t - 1 : t
    if (x < 1 / 6) return p + (q - p) * 6 * x
    if (x < 1 / 2) return q
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6
    return p
  }
  return [hue(h + 1 / 3) * 255, hue(h) * 255, hue(h - 1 / 3) * 255]
}

type Fill =
  | { kind: "none" }
  | { kind: "solid"; paint: Paint }
  | { kind: "gradient"; from: Paint; to: Paint; angle: number }
  | { kind: "picture"; embed: string }

/** The fill set directly on `parent` (`spPr`, `bgPr`, `tcPr`), or null when it sets none. */
function readFill(parent: XmlElement | null, context: ColorContext): Fill | null {
  if (!parent) return null
  for (const child of childElements(parent)) {
    if (child.name === "noFill") return { kind: "none" }
    if (child.name === "solidFill") {
      const paint = readColor(childElements(child)[0], context)
      return paint ? { kind: "solid", paint } : null
    }
    if (child.name === "gradFill") {
      const stops = descendants(child, "gs")
        .map((stop) => ({ at: number(attribute(stop, "pos"), 0), paint: readColor(childElements(stop)[0], context) }))
        .filter((stop): stop is { at: number; paint: Paint } => Boolean(stop.paint))
        .sort((a, b) => a.at - b.at)
      if (!stops.length) return null
      const linear = findFirst(child, "lin")
      // PowerPoint measures from left-to-right, clockwise; CSS measures from bottom-to-top.
      const angle = ((number(attribute(linear, "ang"), 0) / 60_000 + 90) % 360 + 360) % 360
      return { kind: "gradient", from: stops[0].paint, to: stops[stops.length - 1].paint, angle }
    }
    if (child.name === "pattFill") {
      const paint = readColor(childElements(childNamed(child, "fgClr") ?? child)[0], context)
      return paint ? { kind: "solid", paint } : null
    }
    if (child.name === "blipFill") {
      const embed = attribute(findFirst(child, "blip"), "embed")
      return embed ? { kind: "picture", embed } : null
    }
  }
  return null
}

interface Line {
  paint: Paint | null
  /** EMU. */
  width: number
  dash: "solid" | "dashed" | "dotted"
}

function readLine(parent: XmlElement | null, context: ColorContext): Line | null {
  return readLineNode(parent ? childNamed(parent, "ln") : null, context)
}

/** A line element itself: `a:ln`, or a table cell's `a:lnL`, `a:lnT`, and so on. */
function readLineNode(line: XmlElement | null, context: ColorContext): Line | null {
  if (!line) return null
  const fill = readFill(line, context)
  if (fill?.kind === "none") return { paint: null, width: 0, dash: "solid" }
  const dash = attribute(childNamed(line, "prstDash"), "val")
  const paint = fill?.kind === "solid" ? fill.paint : fill?.kind === "gradient" ? fill.from : null
  if (!paint && !attribute(line, "w")) return null
  return { paint, width: number(attribute(line, "w"), 9525), dash: /dot/i.test(dash) && !/dash/i.test(dash) ? "dotted" : dash && dash !== "solid" ? "dashed" : "solid" }
}

const FACE_TO_FONT = new Map(Object.entries(PPTX_FONT_FACES).map(([id, face]) => [face.toLowerCase(), id as DesignFontId]))

/** The design font closest to a PowerPoint typeface. */
export function designFontFor(face: string): DesignFontId {
  const name = face.trim().toLowerCase()
  const exact = FACE_TO_FONT.get(name)
  if (exact) return exact
  if (/mono|courier|consolas|menlo|lucida console/.test(name)) return "mono"
  if (/playfair/.test(name)) return "playfair"
  if (/dm serif/.test(name)) return "dm-serif"
  if (/bebas/.test(name)) return "bebas"
  if (/impact|anton|oswald|league gothic/.test(name)) return "anton"
  if (/pacifico|lobster/.test(name)) return "pacifico"
  if (/comic|caveat|marker|handwrit|script|brush|segoe print|ink free/.test(name)) return "caveat"
  if (/poppins|montserrat|century gothic|futura|avenir|gill sans/.test(name)) return "poppins"
  if (/nunito|quicksand|varela|rounded/.test(name)) return "nunito"
  if (/space grotesk/.test(name)) return "space"
  if (!/sans/.test(name) && /serif|georgia|times|garamond|cambria|palatino|book antiqua|baskerville|constantia|lora|merriweather|bookman|didot|bodoni/.test(name)) return "lora"
  return "sans"
}

function fontWeightFor(face: string, bold: boolean): number {
  if (bold) return /black|heavy/i.test(face) ? 900 : 700
  if (/thin|hairline/i.test(face)) return 200
  if (/light/i.test(face)) return 300
  if (/semibold|demibold/i.test(face)) return 600
  if (/medium/i.test(face)) return 500
  if (/black|heavy/i.test(face)) return 900
  return 400
}

// ---------------------------------------------------------------------------
// Masters and layouts
// ---------------------------------------------------------------------------

interface MasterPart {
  path: string
  root: XmlElement
  theme: Theme
  colorMap: Record<string, string>
  styles: { title: XmlElement | null; body: XmlElement | null; other: XmlElement | null }
}

interface LayoutPart {
  path: string
  root: XmlElement
  master: MasterPart | null
}

function readColorMap(node: XmlElement | null): Record<string, string> {
  return node ? { ...DEFAULT_COLOR_MAP, ...node.attributes } : { ...DEFAULT_COLOR_MAP }
}

function shapeTree(root: XmlElement): XmlElement | null {
  const slide = childNamed(root, "cSld")
  return slide ? childNamed(slide, "spTree") : null
}

/** The non-visual properties of a shape, picture, connector, frame or group. */
function nonVisual(shape: XmlElement): XmlElement | null {
  return childElements(shape).find((child) => child.name.startsWith("nv")) ?? null
}

interface Placeholder {
  type: string
  idx: string
}

function placeholderOf(shape: XmlElement): Placeholder | null {
  const properties = nonVisual(shape)
  const nvPr = properties ? childNamed(properties, "nvPr") : null
  const ph = nvPr ? childNamed(nvPr, "ph") : null
  return ph ? { type: attribute(ph, "type") || "obj", idx: attribute(ph, "idx") } : null
}

function placeholderFamily(type: string): string {
  if (type === "title" || type === "ctrTitle") return "title"
  if (["body", "obj", "subTitle", "tbl", "chart", "dgm", "media", "clipArt", "pic"].includes(type)) return "body"
  return type
}

function placeholdersIn(root: XmlElement | null): XmlElement[] {
  const tree = root ? shapeTree(root) : null
  return tree ? childElements(tree).filter((shape) => placeholderOf(shape)) : []
}

/** The layout placeholder a slide placeholder fills: same index first, then same type, then same family. */
function matchPlaceholder(candidates: XmlElement[], wanted: Placeholder, byIndex: boolean): XmlElement | null {
  const typed = candidates.map((shape) => ({ shape, ph: placeholderOf(shape)! }))
  if (byIndex && wanted.idx) {
    const found = typed.find(({ ph }) => ph.idx === wanted.idx)
    if (found) return found.shape
  }
  return typed.find(({ ph }) => ph.type === wanted.type)?.shape
    ?? typed.find(({ ph }) => placeholderFamily(ph.type) === placeholderFamily(wanted.type))?.shape
    ?? null
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

interface Box {
  x: number
  y: number
  width: number
  height: number
  rotation: number
  flipH: boolean
  flipV: boolean
}

function readXfrm(xfrm: XmlElement | null): Box | null {
  const offset = xfrm ? childNamed(xfrm, "off") : null
  const extent = xfrm ? childNamed(xfrm, "ext") : null
  if (!xfrm || !offset || !extent) return null
  return {
    x: number(attribute(offset, "x"), 0),
    y: number(attribute(offset, "y"), 0),
    width: Math.max(0, number(attribute(extent, "cx"), 0)),
    height: Math.max(0, number(attribute(extent, "cy"), 0)),
    rotation: number(attribute(xfrm, "rot"), 0) / 60_000,
    flipH: attribute(xfrm, "flipH") === "1" || attribute(xfrm, "flipH") === "true",
    flipV: attribute(xfrm, "flipV") === "1" || attribute(xfrm, "flipV") === "true",
  }
}

/** Where a shape sits in its own coordinates: its `xfrm`, or its placeholder's on the layout, then the master. */
function shapeBox(shape: XmlElement, inherited: Inherited): Box | null {
  const properties = childNamed(shape, "spPr") ?? childNamed(shape, "grpSpPr")
  const own = readXfrm(properties ? childNamed(properties, "xfrm") : childNamed(shape, "xfrm"))
  if (own) return own
  for (const source of [inherited.layoutShape, inherited.masterShape]) {
    const properties = source ? childNamed(source, "spPr") : null
    const box = readXfrm(properties ? childNamed(properties, "xfrm") : null)
    if (box) return box
  }
  return null
}

/** Maps a box in a group's child space (EMU) to page pixels. */
type Mapper = (box: Box) => Box

const SHAPE_KINDS_BY_PRESET: Record<string, ShapeKind> = {
  rect: "rect", flowChartProcess: "rect", flowChartAlternateProcess: "rounded", roundRect: "rounded", round1Rect: "rounded", round2SameRect: "rounded", round2DiagRect: "rounded",
  snip1Rect: "rect", snip2SameRect: "rect", flowChartTerminator: "pill", ellipse: "ellipse", flowChartConnector: "ellipse", donut: "ellipse", pie: "ellipse", chord: "ellipse",
  triangle: "triangle", rtTriangle: "triangle", flowChartExtract: "triangle", diamond: "diamond", flowChartDecision: "diamond", pentagon: "pentagon", hexagon: "hexagon", octagon: "hexagon",
  star4: "star", star5: "star", star6: "star", star7: "star", star8: "star", star10: "star", star12: "burst", star16: "burst", star24: "burst", star32: "burst", irregularSeal1: "burst", irregularSeal2: "burst",
  heart: "heart", rightArrow: "arrow", leftArrow: "arrow", upArrow: "arrow", downArrow: "arrow", notchedRightArrow: "arrow", stripedRightArrow: "arrow", homePlate: "arrow", chevron: "chevron",
  wedgeRectCallout: "speech", wedgeRoundRectCallout: "speech", wedgeEllipseCallout: "speech", cloudCallout: "speech", plus: "cross", mathPlus: "cross", cloud: "blob", wave: "wave", doubleWave: "wave",
  line: "line", straightConnector1: "line",
}

/** Arrows pointing another way are drawn as the right arrow, turned. */
const ARROW_TURNS: Record<string, number> = { leftArrow: 180, upArrow: -90, downArrow: 90 }

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

interface Inherited {
  /** The matching placeholder on the layout and on the master, when the shape is a placeholder. */
  layoutShape: XmlElement | null
  masterShape: XmlElement | null
  /** The master's title, body or other style, then the presentation's default. */
  styles: Array<XmlElement | null>
}

/** A run's or field's text (`a:t`); breaks between runs are handled by `paragraphText`. */
function runText(run: XmlElement): string {
  const text = childNamed(run, "t")
  return text ? text.children.filter((part): part is string => typeof part === "string").join("") : ""
}

/** A paragraph's text from its runs and line breaks only, so formatting whitespace never leaks in. */
function paragraphText(paragraph: XmlElement): string {
  let text = ""
  for (const child of childElements(paragraph)) {
    if (child.name === "r" || child.name === "fld") text += runText(child)
    else if (child.name === "br") text += "\n"
  }
  return text
}

function bodyText(shape: XmlElement): string {
  const body = childNamed(shape, "txBody") ?? childNamed(shape, "textBody")
  return body ? childrenNamed(body, "p").map(paragraphText).join("\n").trim() : ""
}

function listStyle(shape: XmlElement | null): XmlElement | null {
  const body = shape ? childNamed(shape, "txBody") : null
  return body ? childNamed(body, "lstStyle") : null
}

function bodyProperties(shape: XmlElement | null): XmlElement | null {
  const body = shape ? childNamed(shape, "txBody") : null
  return body ? childNamed(body, "bodyPr") : null
}

function levelOf(style: XmlElement | null, level: number): XmlElement | null {
  if (!style) return null
  return childNamed(style, `lvl${level}pPr`) ?? (level > 1 ? childNamed(style, "lvl1pPr") : null)
}

function first<T>(sources: Array<XmlElement | null>, read: (source: XmlElement) => T | null | undefined): T | null {
  for (const source of sources) {
    if (!source) continue
    const value = read(source)
    if (value !== null && value !== undefined) return value
  }
  return null
}

interface TextLook {
  text: string
  style: Record<string, unknown>
}

/** A text body as one design text style: the first run's look, the first paragraph's alignment and list. */
function readText(shape: XmlElement, inherited: Inherited, context: ColorContext, scale: number, styleColor: Paint | null): TextLook | null {
  const body = childNamed(shape, "txBody") ?? childNamed(shape, "textBody")
  if (!body) return null
  const paragraphs = childrenNamed(body, "p")
  const lines = paragraphs.map(paragraphText)
  const text = lines.join("\n").replace(/\s+$/, "")
  if (!text.trim()) return null
  const firstIndex = Math.max(0, lines.findIndex((line) => line.trim()))
  const paragraph = paragraphs[firstIndex]
  const paragraphProperties = childNamed(paragraph, "pPr")
  const level = Math.min(9, Math.max(1, number(attribute(paragraphProperties, "lvl"), 0) + 1))
  const levels = [paragraphProperties, levelOf(childNamed(body, "lstStyle"), level), levelOf(listStyle(inherited.layoutShape), level), levelOf(listStyle(inherited.masterShape), level), ...inherited.styles.map((style) => levelOf(style, level))]
  const run = childElements(paragraph).find((child) => (child.name === "r" || child.name === "fld") && runText(child).trim())
  const runs = [run ? childNamed(run, "rPr") : null, ...levels.map((source) => source ? childNamed(source, "defRPr") : null)]
  // The run, its paragraph and the shape's own list style come before the shape's style colour; the layout, master and deck defaults after it.
  const ownRuns = runs.slice(0, 3)
  const inheritedRuns = runs.slice(3)
  const bodies = [childNamed(body, "bodyPr"), bodyProperties(inherited.layoutShape), bodyProperties(inherited.masterShape)]

  const autofit = first(bodies, (source) => childNamed(source, "normAutofit") ?? childNamed(source, "spAutoFit") ?? childNamed(source, "noAutofit"))
  const fontScale = autofit?.name === "normAutofit" ? number(attribute(autofit, "fontScale"), 100_000) / 100_000 : 1
  const spacingCut = autofit?.name === "normAutofit" ? number(attribute(autofit, "lnSpcReduction"), 0) / 100_000 : 0
  const points = first(runs, (source) => attribute(source, "sz") ? number(attribute(source, "sz"), 1800) / 100 : null) ?? 18
  const face = resolveFace(first(runs, (source) => attribute(childNamed(source, "latin"), "typeface") || null) ?? "+mn-lt", context.theme)
  const bold = first(runs, (source) => attribute(source, "b") ? attribute(source, "b") === "1" || attribute(source, "b") === "true" : null) ?? false
  const italic = first(runs, (source) => attribute(source, "i") ? attribute(source, "i") === "1" || attribute(source, "i") === "true" : null) ?? false
  const underline = first(runs, (source) => attribute(source, "u") ? attribute(source, "u") !== "none" : null) ?? false
  const strike = first(runs, (source) => attribute(source, "strike") ? attribute(source, "strike") !== "noStrike" : null) ?? false
  const caps = first(runs, (source) => attribute(source, "cap") ? attribute(source, "cap") === "all" : null) ?? false
  const runColor = (source: XmlElement) => {
    const fill = readFill(source, context)
    return fill?.kind === "solid" ? fill.paint : fill?.kind === "gradient" ? fill.from : null
  }
  const color = first(ownRuns, runColor) ?? styleColor ?? first(inheritedRuns, runColor) ?? schemeColor("tx1", context)
  const align = first(levels, (source) => ({ l: "left", ctr: "center", r: "right", just: "justify", dist: "justify" } as Record<string, string>)[attribute(source, "algn")])
  const list = first(levels, (source) => childNamed(source, "buNone") ? "none" : childNamed(source, "buAutoNum") ? "number" : childNamed(source, "buChar") || childNamed(source, "buBlip") ? "bullet" : null)
  const spacing = first(levels, (source) => {
    const line = childNamed(source, "lnSpc")
    const percent = line ? childNamed(line, "spcPct") : null
    const fixed = line ? childNamed(line, "spcPts") : null
    if (percent) return 1.2 * number(attribute(percent, "val"), 100_000) / 100_000
    if (fixed) return number(attribute(fixed, "val"), points * 120) / 100 / points
    return null
  }) ?? 1.2
  const anchor = first(bodies, (source) => ({ t: "top", ctr: "middle", b: "bottom", just: "middle", dist: "middle" } as Record<string, string>)[attribute(source, "anchor")])
  const inset = (key: string, fallback: number) => first(bodies, (source) => attribute(source, key) ? number(attribute(source, key), fallback) : null) ?? fallback
  const padding = ((inset("lIns", 91_440) + inset("rIns", 91_440)) / 2 + (inset("tIns", 45_720) + inset("bIns", 45_720)) / 2) / 2 * scale

  const style: Record<string, unknown> = {
    fontFamily: designFontFor(face),
    fontSize: round(Math.min(800, Math.max(6, points * EMU_PER_POINT * scale * fontScale))),
    fontWeight: fontWeightFor(face, bold),
    color: color?.hex ?? "#000000",
    textAlign: align ?? "left",
    verticalAlign: anchor ?? "top",
    lineHeight: round(Math.min(3, Math.max(0.7, spacing * (1 - spacingCut)))),
    padding: round(padding),
    fit: autofit?.name === "spAutoFit" ? "grow" : "shrink",
  }
  if (italic) style.italic = true
  if (underline) style.underline = true
  if (strike) style.strike = true
  if (caps) style.uppercase = true
  if (list && list !== "none") style.list = list
  if (color && color.alpha < 0.98) style.opacity = round(Math.max(0.05, color.alpha))
  return { text, style }
}

function schemeColor(name: string, context: ColorContext): Paint | null {
  return readColor({ name: "schemeClr", attributes: { val: name }, children: [] }, context)
}

function resolveFace(face: string, theme: Theme): string {
  if (face.startsWith("+mj")) return theme.majorFont || "Arial"
  if (face.startsWith("+mn")) return theme.minorFont || "Arial"
  return face
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

// ---------------------------------------------------------------------------
// Building one page
// ---------------------------------------------------------------------------

interface PageBuild {
  elements: CanvasElement[]
  pictures: Array<{ element: CanvasElement; path: string }>
  groups: number
  counts: { unsupported: number; missingPictures: number; mergedTables: number; tablesCut: boolean; truncated: boolean }
}

interface PartScope {
  /** The part the shapes came from; picture relationships are resolved against it. */
  path: string
  context: ColorContext
  inherit: (shape: XmlElement) => Inherited
  related: PptxPackage["related"]
  /** A table style by its id (`{5C22544A-…}`), or null. */
  tableStyle: (id: string) => XmlElement | null
}

interface PlaceOptions {
  groupId: string | null
  /** Backgrounds are locked, so clicking the page never picks them up. */
  locked?: boolean
}

function readStyleReference(shape: XmlElement, name: string, context: ColorContext): { index: number; paint: Paint | null } | null {
  const style = childNamed(shape, "style")
  const reference = style ? childNamed(style, name) : null
  if (!reference) return null
  return { index: number(attribute(reference, "idx"), 0), paint: readColor(childElements(reference)[0], context) }
}

/** `mc:AlternateContent`: the fallback is plain PresentationML every reader understands. */
function unwrapAlternate(node: XmlElement): XmlElement[] {
  if (node.name !== "AlternateContent") return [node]
  const fallback = childNamed(node, "Fallback") ?? childNamed(node, "Choice")
  return fallback ? childElements(fallback) : []
}

function nextGroup(build: PageBuild): string {
  build.groups += 1
  return `group-${build.groups}`
}

function addShapes(tree: XmlElement, scope: PartScope, map: Mapper, scale: number, build: PageBuild, options: { skipPlaceholders: boolean; groupId: string | null; depth: number }) {
  for (const raw of childElements(tree)) {
    for (const node of unwrapAlternate(raw)) {
      if (build.elements.length >= DESIGN_LIMITS.elementsPerPage) { build.counts.truncated = true; return }
      const properties = nonVisual(node)
      const described = properties ? childNamed(properties, "cNvPr") : null
      if (attribute(described, "hidden") === "1" || attribute(described, "hidden") === "true") continue
      if (options.skipPlaceholders && placeholderOf(node)) continue
      const name = attribute(described, "name").slice(0, 60)
      const place = { groupId: options.groupId }
      if (node.name === "grpSp") {
        if (options.depth >= MAX_GROUP_DEPTH) continue
        const groupProperties = childNamed(node, "grpSpPr")
        const xfrm = groupProperties ? childNamed(groupProperties, "xfrm") : null
        const groupBox = readXfrm(xfrm)
        const childOffset = xfrm ? childNamed(xfrm, "chOff") : null
        const childExtent = xfrm ? childNamed(xfrm, "chExt") : null
        let inner = map
        if (groupBox && childOffset && childExtent) {
          const cx = number(attribute(childOffset, "x"), 0)
          const cy = number(attribute(childOffset, "y"), 0)
          const cw = number(attribute(childExtent, "cx"), 0)
          const ch = number(attribute(childExtent, "cy"), 0)
          const sx = cw ? groupBox.width / cw : 1
          const sy = ch ? groupBox.height / ch : 1
          inner = (box) => map({ ...box, x: groupBox.x + (box.x - cx) * sx, y: groupBox.y + (box.y - cy) * sy, width: box.width * sx, height: box.height * sy })
        }
        // Everything inside a group (nested groups too) moves as one design group.
        addShapes(node, scope, inner, scale, build, { ...options, groupId: options.groupId ?? nextGroup(build), depth: options.depth + 1 })
      } else if (node.name === "sp" || node.name === "cxnSp") addShape(node, name, scope, map, scale, build, place)
      else if (node.name === "pic") addPicture(node, name, scope, map, build, place)
      else if (node.name === "graphicFrame") addFrame(node, name, scope, map, scale, build, place)
    }
  }
}

function push(build: PageBuild, input: Parameters<typeof createElement>[0], options: PlaceOptions): CanvasElement {
  const element = createElement({ ...input, id: `${input.type}-${build.elements.length + 1}`, z: build.elements.length, groupId: options.groupId, locked: options.locked === true })
  build.elements.push(element)
  return element
}

function pageBox(box: Box): Pick<CanvasElement, "x" | "y" | "width" | "height" | "rotation"> {
  return { x: round(box.x), y: round(box.y), width: Math.max(1, round(box.width)), height: Math.max(1, round(box.height)), rotation: round(box.rotation) }
}

function fitContent(text: string, build: PageBuild): string {
  if (text.length <= DESIGN_LIMITS.contentLength) return text
  build.counts.truncated = true
  return text.slice(0, DESIGN_LIMITS.contentLength)
}

function addShape(shape: XmlElement, name: string, scope: PartScope, map: Mapper, scale: number, build: PageBuild, options: PlaceOptions) {
  const inherited = scope.inherit(shape)
  const own = shapeBox(shape, inherited)
  if (!own) return
  const box = map(own)
  const properties = childNamed(shape, "spPr")
  const preset = attribute(properties ? childNamed(properties, "prstGeom") : null, "prst") || (properties && childNamed(properties, "custGeom") ? "custom" : "rect")
  const fillReference = readStyleReference(shape, "fillRef", scope.context)
  const lineReference = readStyleReference(shape, "lnRef", scope.context)
  const fontReference = readStyleReference(shape, "fontRef", scope.context)
  const inheritedFill = first([inherited.layoutShape, inherited.masterShape].map((source) => source ? childNamed(source, "spPr") : null), (source) => readFill(source, scope.context))
  const fill: Fill = readFill(properties, scope.context) ?? inheritedFill ?? (fillReference && fillReference.index > 0 && fillReference.paint ? { kind: "solid", paint: fillReference.paint } : { kind: "none" })
  const referencedLine: Line | null = lineReference && lineReference.index > 0 && lineReference.paint ? { paint: lineReference.paint, width: scope.context.theme.lineWidths[lineReference.index - 1] ?? 9525 * lineReference.index, dash: "solid" } : null
  const ownLine = readLine(properties, scope.context)
  const line: Line | null = ownLine ? (ownLine.paint || ownLine.width === 0 ? ownLine : { ...ownLine, paint: referencedLine?.paint ?? null }) : referencedLine
  const stroke = line?.paint && line.width > 0 ? { stroke: line.paint.hex, strokeWidth: round(Math.max(1, line.width * scale)), ...(line.dash !== "solid" ? { dash: line.dash } : {}) } : null
  const label = name ? { name } : {}

  // Lines and connectors: a line shape along the box's diagonal.
  if (shape.name === "cxnSp" || SHAPE_KINDS_BY_PRESET[preset] === "line" || /connector/i.test(preset)) {
    if (!stroke) return
    const dx = (box.flipH ? -1 : 1) * box.width
    const dy = (box.flipV ? -1 : 1) * box.height
    const length = Math.max(1, Math.hypot(dx, dy))
    const thickness = Math.max(4, stroke.strokeWidth * 2)
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    push(build, { type: "shape", ...pageBox({ ...box, x: cx - length / 2, y: cy - thickness / 2, width: length, height: thickness, rotation: box.rotation + Math.atan2(dy, dx) * 180 / Math.PI }), style: { shape: "line", ...stroke, ...label } }, options)
    return
  }

  const text = readText(shape, inherited, scope.context, scale, fontReference?.paint ?? null)
  // An empty placeholder is a prompt ("Click to add title"); a slide show never draws it.
  if (!text && placeholderOf(shape)) return
  const kind: ShapeKind = SHAPE_KINDS_BY_PRESET[preset] ?? "rect"
  const radius = kind === "rounded" ? round(Math.min(box.width, box.height) * 0.16667) : 0
  if (text && (kind === "rect" || kind === "rounded") && (fill.kind === "none" || fill.kind === "solid")) {
    // A rectangle with text is one text box carrying the fill and outline.
    const style: Record<string, unknown> = { ...text.style, ...label }
    if (fill.kind === "solid") style.backgroundColor = fill.paint.hex
    if (stroke) Object.assign(style, stroke)
    if (radius) style.borderRadius = radius
    push(build, { type: "text", ...pageBox(box), content: fitContent(text.text, build), style }, options)
    return
  }

  let under: CanvasElement | null = null
  if (fill.kind === "picture") {
    const path = scope.related(scope.path, "image", fill.embed)
    if (path) {
      under = push(build, { type: "image", ...pageBox(box), style: { fit: "cover", ...label } }, options)
      build.pictures.push({ element: under, path })
    } else build.counts.missingPictures += 1
  } else if (fill.kind !== "none" || stroke) {
    const turn = ARROW_TURNS[preset] ?? 0
    const turned = Math.abs(turn) === 90 ? { ...box, x: box.x + (box.width - box.height) / 2, y: box.y + (box.height - box.width) / 2, width: box.height, height: box.width } : box
    const style: Record<string, unknown> = { shape: kind, ...label }
    if (fill.kind === "solid") {
      style.fill = fill.paint.hex
      if (fill.paint.alpha < 0.98) style.opacity = round(Math.max(0.05, fill.paint.alpha))
    } else if (fill.kind === "gradient") Object.assign(style, { fill: fill.from.hex, fill2: fill.to.hex, gradientAngle: round(fill.angle) })
    else style.fill = "transparent"
    if (stroke) Object.assign(style, stroke)
    under = push(build, { type: "shape", ...pageBox({ ...turned, rotation: box.rotation + turn }), style }, options)
  }
  if (text) {
    // Text on any other shape rides on top of it, grouped with it so they move together.
    let groupId = options.groupId
    if (under && !groupId) {
      groupId = nextGroup(build)
      under.groupId = groupId
    }
    push(build, { type: "text", ...pageBox(box), content: fitContent(text.text, build), style: { ...text.style, ...label } }, { ...options, groupId })
  }
}

function addPicture(picture: XmlElement, name: string, scope: PartScope, map: Mapper, build: PageBuild, options: PlaceOptions) {
  const own = shapeBox(picture, scope.inherit(picture))
  if (!own) return
  const box = map(own)
  const fill = childNamed(picture, "blipFill")
  const embed = attribute(fill ? findFirst(fill, "blip") : null, "embed")
  const path = embed ? scope.related(scope.path, "image", embed) : null
  if (!path) { build.counts.missingPictures += 1; return }
  const crop = fill ? childNamed(fill, "srcRect") : null
  const style: Record<string, unknown> = { fit: "cover" }
  if (crop) {
    // The design shows a crop as "cover" around the centre of what PowerPoint kept.
    const [l, t, r, b] = ["l", "t", "r", "b"].map((key) => number(attribute(crop, key), 0) / 100_000)
    style.focusX = round(Math.min(1, Math.max(0, l + (1 - l - r) / 2)))
    style.focusY = round(Math.min(1, Math.max(0, t + (1 - t - b) / 2)))
  }
  if (box.flipH) style.flipX = true
  if (box.flipV) style.flipY = true
  if (name) style.name = name
  build.pictures.push({ element: push(build, { type: "image", ...pageBox(box), style }, options), path })
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

/**
 * PowerPoint's default table style, Medium Style 2 – Accent 1. PowerPoint
 * writes every style a deck uses into `tableStyles.xml`, but other writers
 * may name this one without defining it.
 */
const DEFAULT_TABLE_STYLE_ID = "{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"
const DEFAULT_TABLE_STYLE_XML = (() => {
  const line = `<ln w="12700"><solidFill><schemeClr val="lt1"/></solidFill></ln>`
  const borders = ["left", "right", "top", "bottom", "insideH", "insideV"].map((side) => `<${side}>${line}</${side}>`).join("")
  const fill = (tint: string) => `<fill><solidFill><schemeClr val="accent1">${tint ? `<tint val="${tint}"/>` : ""}</schemeClr></solidFill></fill>`
  return `<tblStyle styleId="${DEFAULT_TABLE_STYLE_ID}">`
    + `<wholeTbl><tcTxStyle><schemeClr val="dk1"/></tcTxStyle><tcStyle><tcBdr>${borders}</tcBdr>${fill("20000")}</tcStyle></wholeTbl>`
    + `<band1H><tcStyle>${fill("40000")}</tcStyle></band1H>`
    + `<firstRow><tcTxStyle b="on"><schemeClr val="lt1"/></tcTxStyle><tcStyle>${fill("")}</tcStyle></firstRow>`
    + `</tblStyle>`
})()
let defaultTableStyle: XmlElement | null = null

/** The deck's own definition of a table style, else PowerPoint's default when that is the one named. */
function findTableStyle(pkg: PptxPackage, presentationPath: string, id: string): XmlElement | null {
  if (!id) return null
  const path = pkg.related(presentationPath, "tableStyles") ?? "ppt/tableStyles.xml"
  const own = pkg.parts[path] ? descendants(pkg.xml(path), "tblStyle").find((style) => attribute(style, "styleId") === id) : undefined
  if (own) return own
  if (id !== DEFAULT_TABLE_STYLE_ID) return null
  defaultTableStyle ??= parseXml(DEFAULT_TABLE_STYLE_XML, "default table style")
  return defaultTableStyle
}

const COLOR_NODES = new Set(["srgbClr", "schemeClr", "sysClr", "prstClr", "scrgbClr"])
const TABLE_ALIGN: Record<string, "left" | "center" | "right"> = { l: "left", ctr: "center", r: "right", just: "left", dist: "left" }
const TABLE_ANCHOR: Record<string, "top" | "middle" | "bottom"> = { t: "top", ctr: "middle", b: "bottom" }

function flagOn(node: XmlElement | null, name: string): boolean {
  const value = attribute(node, name)
  return value === "1" || value === "true" || value === "on"
}

function paintOf(fill: Fill | null): Paint | null {
  return fill?.kind === "solid" ? fill.paint : fill?.kind === "gradient" ? fill.from : null
}

function paintColor(paint: Paint | null): string | null {
  if (!paint) return null
  return paint.alpha < 0.98 ? withAlpha(paint.hex, Math.max(0.05, paint.alpha)) : paint.hex
}

function samePaint(a: Paint | null, b: Paint | null): boolean {
  return (a?.hex ?? "") === (b?.hex ?? "") && Math.abs((a?.alpha ?? 0) - (b?.alpha ?? 0)) < 0.02
}

/** A cell's paragraphs as one line: a design table cell holds one paragraph. */
function cellText(cell: XmlElement): string {
  const body = childNamed(cell, "txBody")
  return body ? childrenNamed(body, "p").map(paragraphText).join(" ").replace(/\s+/g, " ").trim() : ""
}

/** The first run with text among these cells, else the first cell's end-of-paragraph look. */
function firstRunProperties(cells: XmlElement[]): XmlElement | null {
  let fallback: XmlElement | null = null
  for (const cell of cells) {
    const body = childNamed(cell, "txBody")
    for (const paragraph of body ? childrenNamed(body, "p") : []) {
      for (const child of childElements(paragraph)) {
        const isRun = child.name === "r" || child.name === "fld"
        if (isRun && runText(child).trim()) return childNamed(child, "rPr")
        if (!fallback && (isRun || child.name === "endParaRPr")) fallback = isRun ? childNamed(child, "rPr") : child
      }
    }
  }
  return fallback
}

function textStyleColor(text: XmlElement, context: ColorContext): Paint | null {
  const colorIn = (node: XmlElement | null) => node ? readColor(childElements(node).find((child) => COLOR_NODES.has(child.name)), context) : null
  return colorIn(text) ?? colorIn(childNamed(text, "fontRef"))
}

/** A table style's border side: its own line, or a line from the theme. */
function styleBorder(side: XmlElement | null, context: ColorContext): Line | null {
  if (!side) return null
  const own = readLineNode(childNamed(side, "ln"), context)
  if (own) return own
  const reference = childNamed(side, "lnRef")
  const index = number(attribute(reference, "idx"), 0)
  const paint = reference && index > 0 ? readColor(childElements(reference)[0], context) : null
  return paint ? { paint, width: context.theme.lineWidths[index - 1] ?? 9525 * index, dash: "solid" } : null
}

interface TableRowLook {
  fill: Paint | null
  color: Paint | null
  bold: boolean
  italic: boolean
  face: string
  points: number | null
  line: Line | null
  align: "left" | "center" | "right" | null
  anchor: "top" | "middle" | "bottom"
  /** Average cell margin, EMU. */
  margin: number
}

/**
 * A PowerPoint table as a design table.
 *
 * A design table has one look per kind of row (header, body, banded body) and
 * one grid line, so each kind takes the look of a sample cell: the cell's own
 * fill, lines and first run, then the table style's parts for that row. The
 * first row is a header when it looks different from the next one, and the
 * body is banded when its first two rows differ. Merged cells come in split,
 * with the text in the first one.
 */
function addFrame(frame: XmlElement, name: string, scope: PartScope, map: Mapper, scale: number, build: PageBuild, options: PlaceOptions) {
  const own = readXfrm(childNamed(frame, "xfrm"))
  const table = findFirst(frame, "tbl")
  const rowNodes = table ? childrenNamed(table, "tr") : []
  if (!own || !table || !rowNodes.length) { build.counts.unsupported += 1; return }
  const context = scope.context
  const properties = childNamed(table, "tblPr")
  const styleId = properties ? childNamed(properties, "tableStyleId") : null
  const style = styleId ? scope.tableStyle(styleId.children.filter((part): part is string => typeof part === "string").join("").trim()) : null
  const allRows = rowNodes.map((row) => childrenNamed(row, "tc"))
  const tableGrid = childNamed(table, "tblGrid")
  const widths = tableGrid ? childrenNamed(tableGrid, "gridCol").map((column) => number(attribute(column, "w"), 0)) : []
  const allColumns = Math.max(1, widths.length, ...allRows.map((cells) => cells.length))
  const rows = Math.min(allRows.length, TABLE_LIMITS.rows)
  const columns = Math.min(allColumns, TABLE_LIMITS.columns)
  if (rows < allRows.length || columns < allColumns) build.counts.tablesCut = true

  let merged = false
  const grid = allRows.slice(0, rows).map((cells) => Array.from({ length: columns }, (_, column) => {
    const cell = cells[column]
    if (!cell) return ""
    if (flagOn(cell, "hMerge") || flagOn(cell, "vMerge")) { merged = true; return "" }
    if (number(attribute(cell, "gridSpan"), 1) > 1 || number(attribute(cell, "rowSpan"), 1) > 1) merged = true
    return cellText(cell)
  }))
  if (merged) build.counts.mergedTables += 1

  // The style's parts for a row, the most specific first. Column parts are left out:
  // the sample cell is the second one when the first column has a look of its own.
  const firstRow = flagOn(properties, "firstRow")
  const lastRow = flagOn(properties, "lastRow")
  const isLastRow = (row: number) => lastRow && allRows.length > 1 && row === allRows.length - 1
  const partsFor = (row: number): XmlElement[] => {
    if (!style) return []
    const names = ["wholeTbl"]
    const isHeader = firstRow && row === 0
    if (flagOn(properties, "bandRow") && !isHeader && !isLastRow(row)) names.push((row - (firstRow ? 1 : 0)) % 2 === 0 ? "band1H" : "band2H")
    if (isLastRow(row)) names.push("lastRow")
    if (isHeader) names.push("firstRow")
    return names.map((part) => childNamed(style, part)).filter((part): part is XmlElement => Boolean(part)).reverse()
  }
  const sampleColumn = flagOn(properties, "firstCol") && columns > 1 ? 1 : 0

  const look = (row: number): TableRowLook => {
    const cells = allRows[row] ?? []
    const cell = cells[sampleColumn] ?? cells[0] ?? null
    const cellProperties = cell ? childNamed(cell, "tcPr") : null
    const parts = partsFor(row)
    const cellStyles = parts.map((part) => childNamed(part, "tcStyle"))
    const textStyles = parts.map((part) => childNamed(part, "tcTxStyle"))
    const styleFill = first(cellStyles, (cellStyle) => {
      const fill = readFill(childNamed(cellStyle, "fill"), context)
      if (fill) return fill
      const reference = childNamed(cellStyle, "fillRef")
      const paint = reference && number(attribute(reference, "idx"), 0) > 0 ? readColor(childElements(reference)[0], context) : null
      return paint ? { kind: "solid", paint } as Fill : null
    })
    const run = firstRunProperties(cells)
    const flag = (key: "b" | "i") => {
      const value = attribute(run, key)
      if (value) return value === "1" || value === "true"
      return first(textStyles, (text) => attribute(text, key) === "on" ? true : attribute(text, key) === "off" ? false : null) ?? false
    }
    const styleFace = first(textStyles, (text) => ({ major: "+mj-lt", minor: "+mn-lt" } as Record<string, string>)[attribute(childNamed(text, "fontRef"), "idx")])
    // Four sides set and none shown means no lines, whatever the style says.
    const sides = ["lnT", "lnB", "lnL", "lnR"].map((side) => readLineNode(cellProperties ? childNamed(cellProperties, side) : null, context))
    const shown = (line: Line | null) => Boolean(line?.paint && line.width > 0)
    const styleLine = first(cellStyles, (cellStyle) => {
      const borders = childNamed(cellStyle, "tcBdr")
      return borders ? ["insideH", "insideV", "top", "bottom", "left", "right"].map((side) => styleBorder(childNamed(borders, side), context)).find(shown) : null
    })
    const body = cell ? childNamed(cell, "txBody") : null
    const paragraph = body ? childNamed(body, "p") : null
    const margin = (key: string, fallback: number) => number(attribute(cellProperties, key), fallback)
    return {
      fill: paintOf(readFill(cellProperties, context) ?? styleFill),
      color: paintOf(run ? readFill(run, context) : null) ?? first(textStyles, (text) => textStyleColor(text, context)) ?? schemeColor("tx1", context),
      bold: flag("b"),
      italic: flag("i"),
      face: resolveFace(attribute(run ? childNamed(run, "latin") : null, "typeface") || styleFace || "+mn-lt", context.theme),
      points: attribute(run, "sz") ? number(attribute(run, "sz"), 1800) / 100 : null,
      line: sides.find(shown) ?? (sides.every(Boolean) ? null : styleLine ?? null),
      align: TABLE_ALIGN[attribute(paragraph ? childNamed(paragraph, "pPr") : null, "algn")] ?? null,
      anchor: TABLE_ANCHOR[attribute(cellProperties, "anchor")] ?? "top",
      margin: ((margin("marL", 91_440) + margin("marR", 91_440)) / 2 + (margin("marT", 45_720) + margin("marB", 45_720)) / 2) / 2,
    }
  }

  const top = look(0)
  const next = allRows.length > 1 ? look(1) : null
  // Rows that simply alternate colours are banding, not a header, unless the table says it has one.
  const alternates = allRows.length > 2 && samePaint(top.fill, look(2).fill)
  const header = Boolean(next && (top.bold !== next.bold || !samePaint(top.color, next.color) || (!samePaint(top.fill, next.fill) && (firstRow || !alternates))))
  const bodyStart = header ? 1 : 0
  const body = header ? next! : top
  const bandRow = bodyStart + 1
  const band = bandRow < allRows.length && !isLastRow(bandRow) ? look(bandRow) : null
  const banded = Boolean(band?.fill && !samePaint(band.fill, body.fill))
  const anySize = descendants(table, "rPr").map((run) => attribute(run, "sz")).find(Boolean)
  const points = body.points ?? top.points ?? (anySize ? number(anySize, 1800) / 100 : 18)

  const tableStyle: Record<string, unknown> = {
    fontFamily: designFontFor(body.face),
    fontSize: round(Math.min(800, Math.max(6, points * EMU_PER_POINT * scale))),
    fontWeight: fontWeightFor(body.face, body.bold),
    color: paintColor(body.color) ?? "#000000",
    textAlign: body.align ?? top.align ?? "left",
    verticalAlign: body.anchor,
    padding: round(Math.min(200, body.margin * scale)),
  }
  if (body.italic) tableStyle.italic = true
  const bodyFill = paintColor(body.fill)
  if (bodyFill) tableStyle.fill = bodyFill
  if (header) {
    tableStyle.header = true
    const headerFill = paintColor(top.fill)
    if (headerFill) tableStyle.headerFill = headerFill
    tableStyle.headerColor = paintColor(top.color) ?? tableStyle.color
  }
  if (banded) {
    tableStyle.banded = true
    tableStyle.bandFill = paintColor(band!.fill)
  }
  if (body.line?.paint) {
    tableStyle.stroke = paintColor(body.line.paint)
    tableStyle.strokeWidth = round(Math.min(40, Math.max(1, body.line.width * scale)))
  }
  // Column widths and row heights as shares of the table; rows PowerPoint sizes itself (no height) share evenly.
  const shares = (values: number[]) => {
    const total = values.reduce((sum, value) => sum + value, 0)
    return values.length > 1 && values.every((value) => value > 0) ? values.map((value) => Math.round(value / total * 10_000) / 10_000) : null
  }
  const columnShares = widths.length >= columns ? shares(widths.slice(0, columns)) : null
  const rowShares = shares(rowNodes.slice(0, rows).map((row) => number(attribute(row, "h"), 0)))
  if (columnShares) tableStyle.columns = columnShares
  if (rowShares) tableStyle.rows = rowShares
  if (name) tableStyle.name = name

  // Past the character limit, later cells are cut first.
  let room = TABLE_LIMITS.characters - (rows * columns - 1)
  const kept = grid.map((cells) => cells.map((cell) => {
    const text = cell.slice(0, Math.max(0, room))
    room -= text.length
    if (text.length < cell.length) build.counts.truncated = true
    return text
  }))
  push(build, { type: "table", ...pageBox(map(own)), content: serializeTableCells(kept), style: tableStyle }, options)
}

// ---------------------------------------------------------------------------
// Backgrounds, transitions, notes
// ---------------------------------------------------------------------------

interface Background {
  color: string
  gradient?: { from: string; to: string; angle: number }
  picture?: string
}

function readBackground(root: XmlElement, path: string, context: ColorContext, pkg: PptxPackage): Background | null {
  const slide = childNamed(root, "cSld")
  const background = slide ? childNamed(slide, "bg") : null
  if (!background) return null
  const properties = childNamed(background, "bgPr")
  if (properties) {
    const fill = readFill(properties, context)
    if (fill?.kind === "solid") return { color: fill.paint.hex }
    if (fill?.kind === "gradient") return { color: fill.from.hex, gradient: { from: fill.from.hex, to: fill.to.hex, angle: fill.angle } }
    if (fill?.kind === "picture") {
      const picture = pkg.related(path, "image", fill.embed)
      return picture ? { color: "#FFFFFF", picture } : null
    }
    return null
  }
  const reference = childNamed(background, "bgRef")
  const paint = reference ? readColor(childElements(reference)[0], context) : null
  return paint ? { color: paint.hex } : null
}

function readTransition(root: XmlElement): PageTransition {
  const transition = findFirst(root, "transition")
  if (!transition) return "none"
  const effect = childElements(transition).find((child) => !["sndAc", "extLst"].includes(child.name))?.name
  if (!effect) return "none"
  if (effect === "fade" || effect === "dissolve" || effect === "morph") return "fade"
  if (effect === "zoom" || effect === "newsflash" || effect === "warp") return "zoom"
  return "slide"
}

/** Whether a slide has animation effects (a slide can carry an empty timing tree). */
function hasAnimations(root: XmlElement): boolean {
  const timing = findFirst(root, "timing")
  return Boolean(timing && descendants(timing, "cTn").some((node) => attribute(node, "presetClass")))
}

function readNotes(pkg: PptxPackage, slidePath: string): string {
  const notesPath = pkg.related(slidePath, "notesSlide")
  if (!notesPath || !pkg.parts[notesPath]) return ""
  return descendants(pkg.xml(notesPath), "sp")
    .filter((shape) => !["sldImg", "sldNum", "dt", "hdr", "ftr"].includes(placeholderOf(shape)?.type ?? ""))
    .map(bodyText)
    .filter(Boolean).join("\n")
}

function pictureType(path: string): string | undefined {
  return PICTURE_TYPES[path.slice(path.lastIndexOf(".") + 1).toLowerCase()]
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many.replace("#", String(count))
}

// ---------------------------------------------------------------------------
// The whole file
// ---------------------------------------------------------------------------

export async function importPptxDesign(bytes: Uint8Array, options: PptxDesignOptions = {}): Promise<ImportedPptxDesign> {
  const pkg = await openPackage(bytes)
  const presentationPath = pkg.related("", "officeDocument") ?? "ppt/presentation.xml"
  const presentation = pkg.xml(presentationPath)
  const order = childNamed(presentation, "sldIdLst")
  const slideIds = order ? childrenNamed(order, "sldId") : []
  if (!slideIds.length) throw new Error("PPTX has no slides in its presentation order.")
  if (slideIds.length > MAX_SLIDES_READ) throw new Error(`Import supports at most ${MAX_SLIDES_READ} slides.`)
  const warnings: string[] = []

  // Page size: 16:9 and 4:3 slides map straight across; any other shape is fitted onto the nearer one.
  const size = childNamed(presentation, "sldSz")
  const slideWidth = number(attribute(size, "cx"), 12_192_000) || 12_192_000
  const slideHeight = number(attribute(size, "cy"), 6_858_000) || 6_858_000
  const ratio = slideWidth / slideHeight
  const format = designFormat(Math.abs(ratio - 4 / 3) < Math.abs(ratio - 16 / 9) ? "presentation-4-3" : "presentation")
  const scale = Math.min(format.width / slideWidth, format.height / slideHeight)
  const offsetX = (format.width - slideWidth * scale) / 2
  const offsetY = (format.height - slideHeight * scale) / 2
  if (Math.abs(ratio - format.width / format.height) > 0.02) warnings.push(`The slides were a different shape, so they're fitted onto ${format.id === "presentation" ? "16:9" : "4:3"} pages.`)
  const toPage: Mapper = (box) => ({ ...box, x: offsetX + box.x * scale, y: offsetY + box.y * scale, width: box.width * scale, height: box.height * scale })

  const presentationStyle = childNamed(presentation, "defaultTextStyle")
  const masters = new Map<string, MasterPart>()
  const layouts = new Map<string, LayoutPart>()
  const masterAt = (path: string | null): MasterPart | null => {
    if (!path || !pkg.parts[path]) return null
    let master = masters.get(path)
    if (!master) {
      const root = pkg.xml(path)
      const themePath = pkg.related(path, "theme")
      const styles = childNamed(root, "txStyles")
      master = {
        path,
        root,
        theme: readTheme(themePath && pkg.parts[themePath] ? pkg.xml(themePath) : null),
        colorMap: readColorMap(childNamed(root, "clrMap")),
        styles: { title: styles ? childNamed(styles, "titleStyle") : null, body: styles ? childNamed(styles, "bodyStyle") : null, other: styles ? childNamed(styles, "otherStyle") : null },
      }
      masters.set(path, master)
    }
    return master
  }
  const layoutAt = (path: string | null): LayoutPart | null => {
    if (!path || !pkg.parts[path]) return null
    let layout = layouts.get(path)
    if (!layout) {
      layout = { path, root: pkg.xml(path), master: masterAt(pkg.related(path, "slideMaster")) }
      layouts.set(path, layout)
    }
    return layout
  }

  if (slideIds.length > DESIGN_LIMITS.pages) warnings.push(`Only the first ${DESIGN_LIMITS.pages} of ${slideIds.length} slides came in; a design holds ${DESIGN_LIMITS.pages} pages.`)
  const pictures: PageBuild["pictures"] = []
  const totals = { unsupported: 0, missingPictures: 0, mergedTables: 0, tablesCut: false, truncated: false, animated: 0, notesCut: false }
  const tableStyle = (id: string) => findTableStyle(pkg, presentationPath, id)
  let firstTitle = ""

  const pages: DesignPage[] = slideIds.slice(0, DESIGN_LIMITS.pages).map((slideId, index) => {
    // The numeric `id` is unrelated to the namespaced relationship id (prefixes vary).
    const relationshipId = Object.entries(slideId.attributes).find(([key]) => key.endsWith(":id"))?.[1] ?? ""
    const slidePath = relationshipId ? pkg.related(presentationPath, "slide", relationshipId) : null
    if (!slidePath || !pkg.parts[slidePath]) throw new Error(`PPTX slide ${index + 1} has no valid slide relationship.`)
    const slide = pkg.xml(slidePath)
    const layout = layoutAt(pkg.related(slidePath, "slideLayout"))
    const master = layout?.master ?? null
    const theme = master?.theme ?? readTheme(null)
    const masterContext: ColorContext = { theme, colorMap: master?.colorMap ?? { ...DEFAULT_COLOR_MAP } }
    const override = findFirst(slide, "overrideClrMapping")
    const context: ColorContext = override ? { theme, colorMap: readColorMap(override) } : masterContext
    const layoutPlaceholders = placeholdersIn(layout?.root ?? null)
    const masterPlaceholders = placeholdersIn(master?.root ?? null)

    // Text looks fall back to the master's title or body style for placeholders, and to the deck default otherwise.
    const stylesFor = (placeholder: Placeholder | null) => placeholder
      ? [placeholderFamily(placeholder.type) === "title" ? master?.styles.title ?? null : master?.styles.body ?? null, presentationStyle]
      : [presentationStyle, master?.styles.other ?? null]
    const decoration = (): Inherited => ({ layoutShape: null, masterShape: null, styles: stylesFor(null) })
    const slideInherit = (shape: XmlElement): Inherited => {
      const placeholder = placeholderOf(shape)
      if (!placeholder) return decoration()
      const layoutShape = matchPlaceholder(layoutPlaceholders, placeholder, true)
      const masterShape = matchPlaceholder(masterPlaceholders, layoutShape ? placeholderOf(layoutShape)! : placeholder, false)
      return { layoutShape, masterShape, styles: stylesFor(placeholder) }
    }

    const build: PageBuild = { elements: [], pictures: [], groups: 0, counts: { unsupported: 0, missingPictures: 0, mergedTables: 0, tablesCut: false, truncated: false } }
    // The first background found (slide, then layout, then master) fills the page.
    const background = readBackground(slide, slidePath, context, pkg)
      ?? (layout ? readBackground(layout.root, layout.path, masterContext, pkg) : null)
      ?? (master ? readBackground(master.root, master.path, masterContext, pkg) : null)
      ?? { color: "#FFFFFF" }
    if (background.picture) {
      const element = push(build, { type: "image", x: 0, y: 0, width: format.width, height: format.height, style: { fit: "cover", name: "Background picture" } }, { groupId: null, locked: true })
      build.pictures.push({ element, path: background.picture })
    } else if (background.gradient) {
      push(build, { type: "shape", x: 0, y: 0, width: format.width, height: format.height, style: { shape: "rect", fill: background.gradient.from, fill2: background.gradient.to, gradientAngle: round(background.gradient.angle), name: "Background" } }, { groupId: null, locked: true })
    }

    // Decorations from the master and the layout (not their placeholders) sit under the slide's own shapes.
    const showsLayout = attribute(slide, "showMasterSp") !== "0"
    const showsMaster = showsLayout && attribute(layout?.root ?? null, "showMasterSp") !== "0"
    const parts: Array<{ root: XmlElement; scope: PartScope; skipPlaceholders: boolean }> = []
    if (showsMaster && master) parts.push({ root: master.root, scope: { path: master.path, context: masterContext, inherit: decoration, related: pkg.related, tableStyle }, skipPlaceholders: true })
    if (showsLayout && layout) parts.push({ root: layout.root, scope: { path: layout.path, context: masterContext, inherit: decoration, related: pkg.related, tableStyle }, skipPlaceholders: true })
    parts.push({ root: slide, scope: { path: slidePath, context, inherit: slideInherit, related: pkg.related, tableStyle }, skipPlaceholders: false })
    for (const part of parts) {
      const tree = shapeTree(part.root)
      if (tree) addShapes(tree, part.scope, toPage, scale, build, { skipPlaceholders: part.skipPlaceholders, groupId: null, depth: 0 })
    }

    const tree = shapeTree(slide)
    const titleShape = !firstTitle && tree ? childElements(tree).find((shape) => placeholderFamily(placeholderOf(shape)?.type ?? "") === "title") : null
    if (titleShape) firstTitle = bodyText(titleShape).replace(/\s+/g, " ")
    pictures.push(...build.pictures)
    totals.unsupported += build.counts.unsupported
    totals.missingPictures += build.counts.missingPictures
    totals.mergedTables += build.counts.mergedTables
    totals.tablesCut ||= build.counts.tablesCut
    totals.truncated ||= build.counts.truncated
    if (hasAnimations(slide)) totals.animated += 1
    const notes = readNotes(pkg, slidePath)
    if (notes.length > DESIGN_LIMITS.notesLength) totals.notesCut = true
    return createDesignPage({
      id: `slide-${index + 1}`,
      background: background.color,
      elements: build.elements,
      notes: notes.slice(0, DESIGN_LIMITS.notesLength),
      hidden: attribute(slide, "show") === "0" || attribute(slide, "show") === "false",
      transition: readTransition(slide),
    })
  })

  // Pictures: each distinct one is stored once, in the order they first appear.
  const distinct = [...new Set(pictures.map((picture) => picture.path))]
  const showable = distinct.filter((path) => pictureType(path) && pkg.parts[path])
  let unshown = totals.missingPictures + distinct.length - showable.length
  const placed = new Map<string, string>()
  if (options.placePicture) {
    const toPlace = showable.slice(0, MAX_PICTURES)
    if (showable.length > toPlace.length) warnings.push(`Only the first ${MAX_PICTURES} pictures came in.`)
    options.onProgress?.({ stage: "pictures", done: 0, total: toPlace.length })
    for (const [index, path] of toPlace.entries()) {
      const url = await options.placePicture({ path, name: path.slice(path.lastIndexOf("/") + 1), type: pictureType(path)!, bytes: pkg.parts[path] }).catch(() => null)
      if (url) placed.set(path, url)
      else unshown += 1
      options.onProgress?.({ stage: "pictures", done: index + 1, total: toPlace.length })
    }
  } else if (showable.length) warnings.push(plural(showable.length, "A picture was left out.", "# pictures were left out."))
  const sources = new Map(pictures.filter((picture) => placed.has(picture.path)).map((picture) => [picture.element, placed.get(picture.path)!]))
  const finished = pages.map((page) => ({
    ...page,
    elements: page.elements.flatMap((element) => {
      if (element.type !== "image") return [element]
      const src = sources.get(element)
      return src ? [{ ...element, content: src }] : []
    }),
  }))

  if (unshown) warnings.push(plural(unshown, "A picture couldn't be shown (for example an EMF or WMF file) and was left out.", "# pictures couldn't be shown (for example EMF or WMF files) and were left out."))
  if (totals.unsupported) warnings.push(plural(totals.unsupported, "A chart or diagram was left out.", "# charts or diagrams were left out."))
  if (totals.mergedTables) warnings.push(plural(totals.mergedTables, "A table's merged cells came in as separate cells.", "# tables' merged cells came in as separate cells."))
  if (totals.tablesCut) warnings.push(`A table holds up to ${TABLE_LIMITS.rows} rows and ${TABLE_LIMITS.columns} columns; the rest was cut.`)
  if (totals.animated) warnings.push("Animations weren't brought in.")
  if (totals.truncated) warnings.push("Some slides held more than a page can; the extra was cut.")
  if (totals.notesCut) warnings.push(`Speaker notes longer than ${DESIGN_LIMITS.notesLength.toLocaleString("en-US")} characters were cut.`)

  // The file's own title, unless it is PowerPoint's placeholder one; then the file name; then the first slide's title.
  const core = pkg.parts["docProps/core.xml"] ? findFirst(pkg.xml("docProps/core.xml"), "title") : null
  const coreTitle = core ? textOf(core).trim() : ""
  const name = ((/^powerpoint presentation$/i.test(coreTitle) ? "" : coreTitle) || options.fallbackTitle || firstTitle || "Imported slides").slice(0, DESIGN_LIMITS.nameLength)
  return { design: createDesignDoc({ id: options.id, name, format: format.id, theme: "minimal", pages: finished }), warnings }
}
