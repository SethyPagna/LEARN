import { createElement, type CanvasElement } from "@/lib/studio/canvas-engine"

import { createDesignDoc, createDesignPage, DESIGN_LIMITS, newDesignId, scaleDesign, themePattern, type DesignDoc, type DesignPage } from "./document"
import { nearestFontWeight } from "./fonts"
import { designFormat, orientationOf, type DesignFormatId, type PageOrientation } from "./formats"
import { seededRandom, type PagePattern, type ShapeKind } from "./shapes"
import { LAYOUT_IDS, normalizeDesignSpec, normalizePageSpec, pickLayout, type DesignSpec, type LayoutId, type PageSpec, type SemanticBlock } from "./spec"
import { imageSource, readTextStyle, type ImageMask, type ShadowKind, type StrokeDash, type TextEffect } from "./style"
import { estimateMeasure, fitFontSize, naturalTextHeight, type ListStyle, type MeasureText, type TextAlign, type TextFit, type TextLayoutInput, type VerticalAlign } from "./text"
import { designTheme, themeCardLook, themeTextStyle, type DesignTheme, type PaletteKey, type TextRole, type TextSurface } from "./themes"

/**
 * The layout engine: a semantic page spec ("a title, three bullets and an
 * image") becomes positioned, themed elements.
 *
 * Deterministic: the same spec, theme, page size and text measurer always give
 * the same elements, so AI output stays small (it only writes the spec) and
 * every result looks designed rather than scattered.
 *
 * Every element a layout makes carries a `slot` in its style:
 *  - content slots (`b2.items.1.value`) name the spec field the element shows,
 *    so edits made on the page flow back into the spec (`syncSpecFromElements`)
 *    and a page can be re-laid out or resized without losing them;
 *  - decoration slots (`d-…`) are cards, badges, bars and theme ornaments that
 *    a re-layout rebuilds.
 * Elements a person adds have no slot and are never touched by a re-layout.
 *
 * Content that does not fit moves to continuation pages instead of shrinking
 * into unreadable type.
 *
 * Pure: no DOM, no React (the measurer is injected; the width estimate is the
 * default so tests and the server get the same answer every time).
 */

// ---------------------------------------------------------------------------
// Context and primitives
// ---------------------------------------------------------------------------

interface Ctx {
  theme: DesignTheme
  width: number
  height: number
  pageId: string
  index: number
  measure: MeasureText
  /** 1% of the page's short side. */
  u: number
  /** Short side / 1080: theme radii and strokes are defined at 1080px. */
  unit: number
  orientation: PageOrientation
  /** Type scale for the orientation (portrait pages read closer). */
  s: number
  margin: number
}

type Out = CanvasElement[]

interface Box {
  x: number
  y: number
  w: number
  h: number
}

interface Placed {
  block: SemanticBlock
  index: number
}

/** The smallest body scale: a single block that cannot be split shrinks this far. */
const MIN_K = 0.62
/** Several blocks that would need to go below this move to a continuation page instead. */
const SPLIT_K = 0.8
const MAX_K = 1.3
const MAX_CONTINUATIONS = 8

/** Type sizes in `u` (1% of the short side) at scale 1. */
const T = {
  display: 10.5,
  displayMin: 5.2,
  heading: 5.2,
  headingMin: 3.3,
  subheading: 3.6,
  subtitle: 3.2,
  kicker: 2.0,
  body: 3.0,
  small: 2.5,
  caption: 2.1,
  statValue: 8.2,
  statLabel: 2.3,
  quote: 5.6,
  quoteMin: 3.0,
  meme: 9.5,
} as const

function r2(value: number): number {
  return Math.round(value * 100) / 100
}

function sz(ctx: Ctx, key: keyof typeof T, k = 1): number {
  return T[key] * ctx.u * ctx.s * k
}

function hashString(value: string): number {
  let hash = 5381
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) + hash + value.charCodeAt(index)) >>> 0
  return hash
}

function makeCtx(options: { theme: DesignTheme; width: number; height: number; pageId: string; index: number; measure: MeasureText }): Ctx {
  const short = Math.min(options.width, options.height)
  const orientation = orientationOf(options.width, options.height)
  const u = short / 100
  return {
    ...options,
    u,
    unit: short / 1080,
    orientation,
    s: orientation === "landscape" ? 1 : orientation === "square" ? 0.94 : 0.86,
    margin: (orientation === "portrait" ? 8 : 7) * u,
  }
}

function contentBox(ctx: Ctx): Box {
  return { x: ctx.margin, y: ctx.margin, w: ctx.width - ctx.margin * 2, h: ctx.height - ctx.margin * 2 }
}

// --- text ------------------------------------------------------------------

interface TextOptions {
  role: TextRole
  surface?: TextSurface
  size: number
  align?: TextAlign
  valign?: VerticalAlign
  lineHeight?: number
  letterSpacing?: number
  list?: ListStyle
  paragraphSpacing?: number
  colorRole?: PaletteKey
  opacity?: number
  effect?: TextEffect
  effectColor?: string
  fit?: TextFit
}

function textInput(ctx: Ctx, options: TextOptions): TextLayoutInput {
  const look = themeTextStyle(ctx.theme, options.role, options.surface ?? "page")
  return {
    font: look.font,
    size: options.size,
    weight: nearestFontWeight(look.font, look.weight),
    italic: look.italic,
    letterSpacing: options.letterSpacing ?? 0,
    lineHeight: options.lineHeight ?? 1.25,
    uppercase: look.uppercase,
    list: options.list ?? "none",
    verticalAlign: options.valign ?? "top",
    fit: "none",
    padding: 0,
    paragraphSpacing: options.paragraphSpacing ?? 0,
  }
}

function textHeight(ctx: Ctx, content: string, width: number, options: TextOptions): number {
  return naturalTextHeight(content, Math.max(1, width), textInput(ctx, options), ctx.measure)
}

/** The largest size in `range` at which `content` fits `box` without breaking a word. */
function fitSize(ctx: Ctx, content: string, box: { width: number; height: number }, options: Omit<TextOptions, "size">, range: { max: number; min: number }): number {
  const { size: _size, fit: _fit, ...rest } = textInput(ctx, { ...options, size: range.max })
  return fitFontSize(content, { width: Math.max(1, box.width), height: Math.max(1, box.height) }, rest, range, ctx.measure)
}

function addText(ctx: Ctx, out: Out, slot: string, content: string, box: Box, options: TextOptions): void {
  const input = textInput(ctx, options)
  const surface = options.surface ?? "page"
  const look = themeTextStyle(ctx.theme, options.role, surface)
  const style: Record<string, unknown> = {
    slot,
    role: options.role,
    surface,
    fontFamily: input.font,
    fontSize: r2(options.size),
    fontWeight: input.weight,
    italic: input.italic,
    uppercase: input.uppercase,
    color: surface !== "primary" && options.colorRole ? ctx.theme.palette[options.colorRole] : look.color,
    textAlign: options.align ?? "left",
    verticalAlign: options.valign ?? "top",
    lineHeight: input.lineHeight,
    letterSpacing: input.letterSpacing,
    list: input.list,
    paragraphSpacing: input.paragraphSpacing,
    fit: options.fit ?? "shrink",
    padding: 0,
  }
  if (options.colorRole) style.colorRole = options.colorRole
  if (options.opacity !== undefined) style.opacity = options.opacity
  if (options.effect && options.effect !== "none") {
    style.effect = options.effect
    style.effectColor = options.effectColor ?? "#000000"
  }
  out.push(createElement({ id: `${ctx.pageId}-${slot}`, type: "text", x: r2(box.x), y: r2(box.y), width: r2(Math.max(1, box.w)), height: r2(Math.max(1, box.h)), content, style }))
}

// --- shapes and images -----------------------------------------------------

interface ShapeOptions {
  shape: ShapeKind
  fillRole?: PaletteKey
  opacity?: number
  radius?: number | "theme"
  strokeRole?: PaletteKey
  strokeWidth?: number
  dash?: StrokeDash
  /** Draw as a theme card (surface fill, the theme's shadow or outline). */
  card?: boolean
  rotation?: number
  seed?: number
  locked?: boolean
  shadow?: ShadowKind
}

function addShape(ctx: Ctx, out: Out, slot: string, box: Box, options: ShapeOptions): void {
  const { palette } = ctx.theme
  const style: Record<string, unknown> = { slot, shape: options.shape, role: "decor" }
  if (options.fillRole) {
    style.fillRole = options.fillRole
    style.fill = palette[options.fillRole]
  }
  if (options.radius === "theme") {
    style.radiusRole = "theme"
    style.borderRadius = r2(ctx.theme.radius * ctx.unit)
  } else if (typeof options.radius === "number") {
    style.borderRadius = r2(options.radius)
  }
  if (options.card) {
    const look = themeCardLook(ctx.theme)
    style.look = "card"
    style.shadow = look.shadow
    style.strokeRole = look.strokeRole
    style.stroke = look.strokeRole ? palette[look.strokeRole] : null
    style.strokeWidth = look.strokeRole ? r2(look.strokeWidth * ctx.unit) : 0
  } else if (options.strokeRole) {
    style.strokeRole = options.strokeRole
    style.stroke = palette[options.strokeRole]
    style.strokeWidth = r2(options.strokeWidth ?? 2 * ctx.unit)
  }
  if (options.dash) style.dash = options.dash
  if (options.opacity !== undefined) style.opacity = options.opacity
  if (options.seed !== undefined) style.seed = options.seed
  if (options.shadow && !options.card) style.shadow = options.shadow
  out.push(
    createElement({
      id: `${ctx.pageId}-${slot}`,
      type: "shape",
      x: r2(box.x),
      y: r2(box.y),
      width: r2(Math.max(1, box.w)),
      height: r2(Math.max(1, box.h)),
      rotation: options.rotation ?? 0,
      locked: options.locked === true,
      content: "",
      style,
    }),
  )
}

function addImage(ctx: Ctx, out: Out, slot: string, box: Box, src: string | undefined, options: { radius?: number | "theme"; mask?: ImageMask } = {}): void {
  const { palette } = ctx.theme
  const style: Record<string, unknown> = { slot, fit: "cover" }
  if (options.radius === "theme") {
    style.radiusRole = "theme"
    style.borderRadius = r2(ctx.theme.radius * ctx.unit)
  } else if (typeof options.radius === "number") {
    style.borderRadius = r2(options.radius)
  }
  if (options.mask) style.mask = options.mask
  if (!src) {
    // An empty frame: drop or pick a picture to fill it.
    style.placeholder = true
    style.fillRole = "surface"
    style.backgroundColor = palette.surface
    style.strokeRole = "muted"
    style.stroke = palette.muted
    style.strokeWidth = r2(Math.max(1, 0.25 * ctx.u))
    style.dash = "dashed"
  }
  out.push(createElement({ id: `${ctx.pageId}-${slot}`, type: "image", x: r2(box.x), y: r2(box.y), width: r2(Math.max(1, box.w)), height: r2(Math.max(1, box.h)), content: src ?? "", style }))
}

function addCard(ctx: Ctx, out: Out, slot: string, box: Box): void {
  addShape(ctx, out, slot, box, { shape: "rounded", fillRole: "surface", radius: "theme", card: true })
}

/** A filled circle with a centred number or letter (steps, choices, cards). */
function addBadge(ctx: Ctx, out: Out, slot: string, x: number, y: number, diameter: number, label: string): void {
  addShape(ctx, out, `${slot}-dot`, { x, y, w: diameter, h: diameter }, { shape: "ellipse", fillRole: "primary" })
  addText(ctx, out, `${slot}-label`, label, { x, y, w: diameter, h: diameter }, { role: "number", surface: "primary", size: diameter * (label.length > 1 ? 0.42 : 0.5), align: "center", valign: "middle", lineHeight: 1 })
}

// ---------------------------------------------------------------------------
// Theme decorations (always behind content, kept to the page edges)
// ---------------------------------------------------------------------------

type DecorKind = "hero" | "content" | "section"

function decorate(ctx: Ctx, out: Out, kind: DecorKind): void {
  const { width: W, height: H, u, theme } = ctx
  const random = seededRandom(hashString(theme.id) + ctx.index * 7919 + (kind === "hero" ? 101 : kind === "section" ? 211 : 0))
  let count = 0
  const slot = () => `d-decor-${count++}`
  const seed = () => Math.floor(random() * 1000)

  if (kind === "section") {
    addShape(ctx, out, slot(), { x: W - 34 * u, y: -22 * u, w: 64 * u, h: 64 * u }, { shape: "ellipse", fillRole: "onPrimary", opacity: 0.08 })
    addShape(ctx, out, slot(), { x: W - 58 * u, y: H - 20 * u, w: 26 * u, h: 26 * u }, { shape: "ellipse", fillRole: "onPrimary", opacity: 0.06 })
    if (theme.decoration === "frame") {
      addShape(ctx, out, slot(), { x: 2.4 * u, y: 2.4 * u, w: W - 4.8 * u, h: H - 4.8 * u }, { shape: "rounded", radius: "theme", strokeRole: "onPrimary", strokeWidth: 0.3 * u, opacity: 0.45, locked: true })
    }
    return
  }

  switch (theme.decoration) {
    case "blobs": {
      if (kind === "hero") {
        addShape(ctx, out, slot(), { x: W - 30 * u, y: -18 * u, w: 52 * u, h: 52 * u }, { shape: "blob", fillRole: "secondary", opacity: 0.55, seed: seed() })
        addShape(ctx, out, slot(), { x: -12 * u, y: H - 24 * u, w: 36 * u, h: 36 * u }, { shape: "blob", fillRole: "accent", opacity: 0.35, seed: seed() })
        addShape(ctx, out, slot(), { x: W - 40 * u, y: H - 17 * u, w: 5 * u, h: 5 * u }, { shape: "ellipse", fillRole: "primary", opacity: 0.85 })
      } else {
        addShape(ctx, out, slot(), { x: W - 16 * u, y: -13 * u, w: 30 * u, h: 30 * u }, { shape: "blob", fillRole: "secondary", opacity: 0.35, seed: seed() })
      }
      return
    }
    case "notebook": {
      if (kind === "hero") {
        addShape(ctx, out, slot(), { x: ctx.margin - 2 * u, y: ctx.margin - 3.2 * u, w: 16 * u, h: 4.2 * u }, { shape: "rect", fillRole: "secondary", opacity: 0.75, rotation: -5 })
        addShape(ctx, out, slot(), { x: W - 22 * u, y: H - 9 * u, w: 15 * u, h: 3.8 * u }, { shape: "rect", fillRole: "accent", opacity: 0.45, rotation: 4 })
      } else {
        addShape(ctx, out, slot(), { x: W - 19 * u, y: 2.2 * u, w: 13 * u, h: 3.4 * u }, { shape: "rect", fillRole: "secondary", opacity: 0.6, rotation: 4 })
      }
      return
    }
    case "grid": {
      if (kind === "hero") {
        addShape(ctx, out, slot(), { x: W - 22 * u, y: H - 22 * u, w: 30 * u, h: 30 * u }, { shape: "ellipse", fillRole: "accent", opacity: 0.9 })
        addShape(ctx, out, slot(), { x: W - 30 * u, y: 5 * u, w: 8 * u, h: 8 * u }, { shape: "star", fillRole: "secondary", rotation: 12 })
      } else {
        addShape(ctx, out, slot(), { x: W - 7.5 * u, y: 3 * u, w: 4 * u, h: 4 * u }, { shape: "rect", fillRole: "accent", rotation: 12 })
      }
      return
    }
    case "stripes": {
      if (kind === "hero") {
        const roles: PaletteKey[] = ["primary", "secondary", "accent"]
        roles.forEach((role, index) => {
          addShape(ctx, out, slot(), { x: W - (12 + index * 7.5) * u, y: -12 * u, w: 4.6 * u, h: H * 0.72 }, { shape: "pill", fillRole: role, rotation: 28, opacity: 0.9 })
        })
      } else {
        addShape(ctx, out, slot(), { x: 0, y: 0, w: W, h: 1.1 * u }, { shape: "rect", fillRole: "primary" })
        addShape(ctx, out, slot(), { x: 0, y: 1.1 * u, w: W * 0.4, h: 0.6 * u }, { shape: "rect", fillRole: "secondary" })
      }
      return
    }
    case "confetti": {
      const pieces = kind === "hero" ? 16 : 6
      const kinds: ShapeKind[] = ["ellipse", "triangle", "star", "rounded", "pill", "diamond"]
      const roles: PaletteKey[] = ["primary", "secondary", "accent"]
      const band = ctx.margin * 0.85
      for (let piece = 0; piece < pieces; piece += 1) {
        const size = (1.3 + random() * 1.9) * u
        let x: number
        let y: number
        if (kind === "hero") {
          // Anywhere in the border band around the content.
          const side = Math.floor(random() * 4)
          if (side === 0) [x, y] = [random() * W, random() * band]
          else if (side === 1) [x, y] = [W - band + random() * (band - size), random() * H]
          else if (side === 2) [x, y] = [random() * W, H - band + random() * (band - size)]
          else [x, y] = [random() * (band - size), random() * H]
        } else {
          // Content pages: only the top-right corner.
          x = W - band * 2.2 + random() * (band * 2.2 - size)
          y = random() * band * 1.6
        }
        const shape = kinds[Math.floor(random() * kinds.length)]
        addShape(ctx, out, slot(), { x, y, w: shape === "pill" ? size * 1.8 : size, h: size }, { shape, fillRole: roles[Math.floor(random() * roles.length)], rotation: Math.round(random() * 360), opacity: 0.9 })
      }
      return
    }
    case "frame": {
      addShape(ctx, out, slot(), { x: 2.4 * u, y: 2.4 * u, w: W - 4.8 * u, h: H - 4.8 * u }, { shape: "rounded", radius: "theme", strokeRole: kind === "hero" ? "primary" : "muted", strokeWidth: 0.3 * u, opacity: kind === "hero" ? 1 : 0.6, locked: true })
      if (kind === "hero") addShape(ctx, out, slot(), { x: W / 2 - 1.6 * u, y: 1.1 * u, w: 3.2 * u, h: 3.2 * u }, { shape: "diamond", fillRole: "primary" })
      return
    }
    case "halftone": {
      if (kind === "hero") {
        addShape(ctx, out, slot(), { x: W - 24 * u, y: -14 * u, w: 40 * u, h: 40 * u }, { shape: "ellipse", fillRole: "secondary" })
        addShape(ctx, out, slot(), { x: W - 30 * u, y: H - 28 * u, w: 34 * u, h: 34 * u }, { shape: "dots", fillRole: "text", opacity: 0.2 })
      } else {
        addShape(ctx, out, slot(), { x: W - 18 * u, y: -4 * u, w: 22 * u, h: 22 * u }, { shape: "dots", fillRole: "text", opacity: 0.14 })
      }
      return
    }
    default: {
      if (kind === "hero") addShape(ctx, out, slot(), { x: ctx.margin, y: H - ctx.margin * 0.62, w: 12 * u, h: 0.8 * u }, { shape: "pill", fillRole: "accent" })
    }
  }
}

// ---------------------------------------------------------------------------
// Blocks (stack layouts). Each renderer draws a block at (x, y) with width w
// and returns the height it used; measuring is rendering into a scratch list.
// ---------------------------------------------------------------------------

function isFlexBlock(block: SemanticBlock): boolean {
  return block.type === "image" || block.type === "meme"
}

function gapFor(ctx: Ctx, k: number): number {
  return 3.2 * ctx.u * Math.max(0.75, k)
}

function renderBlock(ctx: Ctx, out: Out, block: SemanticBlock, i: number, x: number, y: number, w: number, k: number, extra = 0): number {
  switch (block.type) {
    case "title":
      return renderSubheading(ctx, out, i, block.text, x, y, w, k, block.kicker, block.subtitle)
    case "heading":
      return renderSubheading(ctx, out, i, block.text, x, y, w, k)
    case "text":
      return renderParagraph(ctx, out, i, block.text, x, y, w, k)
    case "bullets":
      return useCardBullets(ctx, block.items, w) ? renderBulletCards(ctx, out, i, block.items, x, y, w, k) : renderBulletList(ctx, out, i, block.items, block.ordered === true, x, y, w, k)
    case "quote":
      return renderInlineQuote(ctx, out, i, block.text, block.by, x, y, w, k)
    case "image":
      return renderInlineImage(ctx, out, i, block.src, block.caption, x, y, w, k, extra)
    case "stats":
      return renderStats(ctx, out, i, block.items, x, y, w, k)
    case "timeline":
      return renderTimeline(ctx, out, i, block.items, x, y, w, k)
    case "compare":
      return renderCompare(ctx, out, i, block.left, block.right, x, y, w, k)
    case "steps":
      return renderSteps(ctx, out, i, block.items, x, y, w, k)
    case "question":
      return renderQuestion(ctx, out, i, block.question, block.choices ?? [], x, y, w, k)
    case "definition":
      return renderDefinition(ctx, out, i, block.term, block.text, x, y, w, k)
    case "callout":
      return renderCallout(ctx, out, i, block.text, block.tone ?? "note", x, y, w, k)
    case "meme":
      return renderInlineMeme(ctx, out, i, block, x, y, w, k, extra)
    default:
      return 0
  }
}

function measureBlock(ctx: Ctx, block: SemanticBlock, w: number, k: number): number {
  return renderBlock(ctx, [], block, 0, 0, 0, w, k, 0)
}

function renderSubheading(ctx: Ctx, out: Out, i: number, text: string, x: number, y: number, w: number, k: number, kicker?: string, subtitle?: string): number {
  const u = ctx.u
  let top = y
  if (kicker) {
    const options: TextOptions = { role: "kicker", size: sz(ctx, "kicker", k), letterSpacing: 0.12 }
    const h = textHeight(ctx, kicker, w, options)
    addText(ctx, out, `b${i}.kicker`, kicker, { x, y: top, w, h }, options)
    top += h + 1 * u
  }
  const options: TextOptions = { role: "heading", size: sz(ctx, "subheading", k), lineHeight: 1.12 }
  const h = textHeight(ctx, text, w, options)
  addText(ctx, out, `b${i}.text`, text, { x, y: top, w, h }, options)
  top += h
  if (subtitle) {
    const subOptions: TextOptions = { role: "subtitle", size: sz(ctx, "subtitle", k) * 0.85, lineHeight: 1.35 }
    const sh = textHeight(ctx, subtitle, w, subOptions)
    top += 1 * u
    addText(ctx, out, `b${i}.subtitle`, subtitle, { x, y: top, w, h: sh }, subOptions)
    top += sh
  }
  return top - y
}

function renderParagraph(ctx: Ctx, out: Out, i: number, text: string, x: number, y: number, w: number, k: number): number {
  const options: TextOptions = { role: "body", size: sz(ctx, "body", k), lineHeight: 1.45 }
  // Long lines are hard to read: keep a paragraph to roughly 80 characters.
  const width = Math.min(w, options.size * 44)
  const h = textHeight(ctx, text, width, options)
  addText(ctx, out, `b${i}.text`, text, { x, y, w: width, h }, options)
  return h
}

function useCardBullets(ctx: Ctx, items: string[], w: number): boolean {
  const total = items.reduce((sum, item) => sum + item.length, 0)
  return items.length >= 2 && items.length <= 4 && items.every((item) => item.length <= 110) && total <= 360 && w >= 60 * ctx.u
}

function renderBulletCards(ctx: Ctx, out: Out, i: number, items: string[], x: number, y: number, w: number, k: number): number {
  const u = ctx.u
  const n = items.length
  const longest = items.reduce((max, item) => Math.max(max, item.length), 0)
  const cols = n === 4 ? (w >= 150 * u && longest <= 60 ? 4 : 2) : n
  const rows = Math.ceil(n / cols)
  const gap = 2.4 * u
  const colW = (w - gap * (cols - 1)) / cols
  const pad = 2.6 * u * Math.min(1, k)
  const badge = 5.2 * u * ctx.s * k
  const options: TextOptions = { role: "body", size: sz(ctx, "small", k) * 1.08, lineHeight: 1.36 }
  const heights = items.map((item) => textHeight(ctx, item, colW - pad * 2, options))
  const rowHeights = Array.from({ length: rows }, (_, row) => Math.max(...heights.slice(row * cols, row * cols + cols)))
  const cardHeights = rowHeights.map((height) => pad + badge + 1.8 * u + height + pad)
  let top = y
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const j = row * cols + col
      if (j >= n) break
      const cx = x + col * (colW + gap)
      addCard(ctx, out, `d-b${i}-card-${j}`, { x: cx, y: top, w: colW, h: cardHeights[row] })
      addBadge(ctx, out, `d-b${i}-badge-${j}`, cx + pad, top + pad, badge, String(j + 1))
      addText(ctx, out, `b${i}.items.${j}`, items[j], { x: cx + pad, y: top + pad + badge + 1.8 * u, w: colW - pad * 2, h: heights[j] }, options)
    }
    top += cardHeights[row] + (row < rows - 1 ? gap : 0)
  }
  return top - y
}

function renderBulletList(ctx: Ctx, out: Out, i: number, items: string[], ordered: boolean, x: number, y: number, w: number, k: number): number {
  const options: TextOptions = { role: "bullets", size: sz(ctx, "body", k), lineHeight: 1.34, list: ordered ? "number" : "bullet", paragraphSpacing: 0.6 }
  const width = Math.min(w, options.size * 46)
  const content = items.join("\n")
  const h = textHeight(ctx, content, width, options)
  addText(ctx, out, `b${i}.items`, content, { x, y, w: width, h }, options)
  return h
}

function renderInlineQuote(ctx: Ctx, out: Out, i: number, text: string, by: string | undefined, x: number, y: number, w: number, k: number): number {
  const u = ctx.u
  const bar = 0.8 * u
  const inset = bar + 3 * u
  const options: TextOptions = { role: "quote", size: sz(ctx, "subheading", k) * 0.95, lineHeight: 1.3 }
  const width = Math.min(w - inset, options.size * 40)
  const qh = textHeight(ctx, text, width, options)
  let h = qh
  const byOptions: TextOptions = { role: "attribution", size: sz(ctx, "caption", k) * 1.1, lineHeight: 1.3 }
  const byText = by ? `— ${by}` : ""
  const bh = byText ? textHeight(ctx, byText, width, byOptions) : 0
  if (byText) h += 1.2 * u + bh
  addShape(ctx, out, `d-b${i}-bar`, { x, y, w: bar, h }, { shape: "pill", fillRole: "accent" })
  addText(ctx, out, `b${i}.text`, text, { x: x + inset, y, w: width, h: qh }, options)
  if (byText) addText(ctx, out, `b${i}.by`, byText, { x: x + inset, y: y + qh + 1.2 * u, w: width, h: bh }, byOptions)
  return h
}

function imageMinHeight(ctx: Ctx, k: number): number {
  return (ctx.orientation === "landscape" ? 26 : 22) * ctx.u * k
}

function renderInlineImage(ctx: Ctx, out: Out, i: number, src: string | undefined, caption: string | undefined, x: number, y: number, w: number, k: number, extra: number): number {
  const u = ctx.u
  const imageH = imageMinHeight(ctx, k) + Math.max(0, extra)
  addImage(ctx, out, `b${i}.src`, { x, y, w, h: imageH }, src, { radius: "theme" })
  if (!caption) return imageH
  const options: TextOptions = { role: "caption", size: sz(ctx, "caption", k), lineHeight: 1.3, align: "center" }
  const ch = textHeight(ctx, caption, w, options)
  addText(ctx, out, `b${i}.caption`, caption, { x, y: y + imageH + 1.2 * u, w, h: ch }, options)
  return imageH + 1.2 * u + ch
}

function renderInlineMeme(ctx: Ctx, out: Out, i: number, block: Extract<SemanticBlock, { type: "meme" }>, x: number, y: number, w: number, k: number, extra: number): number {
  const u = ctx.u
  const options: TextOptions = { role: "heading", size: sz(ctx, "subheading", k), lineHeight: 1.1, align: "center" }
  let top = y
  if (block.top) {
    const h = textHeight(ctx, block.top, w, options)
    addText(ctx, out, `b${i}.top`, block.top, { x, y: top, w, h }, options)
    top += h + 1.2 * u
  }
  const imageH = imageMinHeight(ctx, k) + Math.max(0, extra)
  addImage(ctx, out, `b${i}.src`, { x, y: top, w, h: imageH }, block.src, { radius: "theme" })
  top += imageH
  if (block.bottom) {
    const h = textHeight(ctx, block.bottom, w, options)
    top += 1.2 * u
    addText(ctx, out, `b${i}.bottom`, block.bottom, { x, y: top, w, h }, options)
    top += h
  }
  return top - y
}

function renderStats(ctx: Ctx, out: Out, i: number, items: Array<{ value: string; label: string }>, x: number, y: number, w: number, k: number): number {
  const u = ctx.u
  const n = items.length
  const cols = n > 2 && w / n < 22 * u ? 2 : n
  const rows = Math.ceil(n / cols)
  const gap = 2.4 * u
  const colW = (w - gap * (cols - 1)) / cols
  const pad = 3 * u * Math.min(1, k)
  const maxValue = sz(ctx, "statValue", k)
  const valueBase: Omit<TextOptions, "size"> = { role: "stat-value", lineHeight: 1.02, align: "center" }
  const valueSize = Math.min(...items.map((item) => fitSize(ctx, item.value, { width: colW - pad * 2, height: maxValue * 1.1 }, valueBase, { max: maxValue, min: maxValue * 0.4 })))
  const valueOptions: TextOptions = { ...valueBase, size: valueSize }
  const labelOptions: TextOptions = { role: "stat-label", size: sz(ctx, "statLabel", k), lineHeight: 1.3, align: "center" }
  const valueH = Math.max(...items.map((item) => textHeight(ctx, item.value, colW - pad * 2, valueOptions)))
  const labelH = Math.max(0, ...items.map((item) => (item.label ? textHeight(ctx, item.label, colW - pad * 2, labelOptions) : 0)))
  const cardH = pad + valueH + (labelH ? 1.2 * u + labelH : 0) + pad
  items.forEach((item, j) => {
    const row = Math.floor(j / cols)
    const col = j % cols
    // A short last row is centred under the full rows.
    const rowCount = Math.min(cols, n - row * cols)
    const rowOffset = ((cols - rowCount) * (colW + gap)) / 2
    const cx = x + rowOffset + col * (colW + gap)
    const cy = y + row * (cardH + gap)
    addCard(ctx, out, `d-b${i}-card-${j}`, { x: cx, y: cy, w: colW, h: cardH })
    addText(ctx, out, `b${i}.items.${j}.value`, item.value, { x: cx + pad, y: cy + pad, w: colW - pad * 2, h: valueH }, valueOptions)
    if (item.label) addText(ctx, out, `b${i}.items.${j}.label`, item.label, { x: cx + pad, y: cy + pad + valueH + 1.2 * u, w: colW - pad * 2, h: labelH }, labelOptions)
  })
  return rows * cardH + (rows - 1) * gap
}

function renderTimeline(ctx: Ctx, out: Out, i: number, items: Array<{ label: string; text: string }>, x: number, y: number, w: number, k: number): number {
  const u = ctx.u
  const n = items.length
  const labelOptions: TextOptions = { role: "label", colorRole: "primary", size: sz(ctx, "small", k) * 1.05, lineHeight: 1.2 }
  const textOptions: TextOptions = { role: "body", size: sz(ctx, "small", k) * 0.95, lineHeight: 1.36 }
  if (ctx.orientation === "landscape" && n <= 5 && w >= 100 * u) {
    const colW = w / n
    const dot = 3 * u * k
    const inner = colW - 2.4 * u
    const center: TextOptions = { ...labelOptions, align: "center" }
    const centerText: TextOptions = { ...textOptions, align: "center" }
    const labelH = Math.max(0, ...items.map((item) => (item.label ? textHeight(ctx, item.label, inner, center) : 0)))
    const textH = Math.max(0, ...items.map((item) => (item.text ? textHeight(ctx, item.text, inner, centerText) : 0)))
    if (n > 1) addShape(ctx, out, `d-b${i}-line`, { x: x + colW / 2, y: y + dot / 2 - 0.2 * u, w: colW * (n - 1), h: 0.4 * u }, { shape: "rect", fillRole: "muted", opacity: 0.45 })
    items.forEach((item, j) => {
      const cx = x + colW * j
      addShape(ctx, out, `d-b${i}-dot-${j}`, { x: cx + colW / 2 - dot / 2, y, w: dot, h: dot }, { shape: "ellipse", fillRole: "primary" })
      const labelY = y + dot + 1.6 * u
      if (item.label) addText(ctx, out, `b${i}.items.${j}.label`, item.label, { x: cx + 1.2 * u, y: labelY, w: inner, h: labelH }, center)
      if (item.text) addText(ctx, out, `b${i}.items.${j}.text`, item.text, { x: cx + 1.2 * u, y: labelY + (labelH ? labelH + 0.8 * u : 0), w: inner, h: textH }, centerText)
    })
    return dot + 1.6 * u + labelH + (labelH && textH ? 0.8 * u : 0) + textH
  }
  const dot = 2.6 * u * k
  const tx = x + dot + 2.4 * u
  const tw = w - dot - 2.4 * u
  const rowGap = 2.2 * u
  let top = y
  const centers: number[] = []
  items.forEach((item, j) => {
    const lh = item.label ? textHeight(ctx, item.label, tw, labelOptions) : 0
    const th = item.text ? textHeight(ctx, item.text, tw, textOptions) : 0
    const firstLine = item.label ? labelOptions.size * 1.2 : textOptions.size * 1.36
    const dotY = top + (firstLine - dot) / 2
    centers.push(dotY + dot / 2)
    addShape(ctx, out, `d-b${i}-dot-${j}`, { x, y: dotY, w: dot, h: dot }, { shape: "ellipse", fillRole: "primary" })
    if (item.label) addText(ctx, out, `b${i}.items.${j}.label`, item.label, { x: tx, y: top, w: tw, h: lh }, labelOptions)
    if (item.text) addText(ctx, out, `b${i}.items.${j}.text`, item.text, { x: tx, y: top + (lh ? lh + 0.5 * u : 0), w: tw, h: th }, textOptions)
    top += Math.max(dot, lh + (lh && th ? 0.5 * u : 0) + th) + (j < n - 1 ? rowGap : 0)
  })
  if (n > 1) {
    // The line sits behind the dots: insert it before the first dot.
    const line: Out = []
    addShape(ctx, line, `d-b${i}-line`, { x: x + dot / 2 - 0.2 * u, y: centers[0], w: 0.4 * u, h: centers[n - 1] - centers[0] }, { shape: "rect", fillRole: "muted", opacity: 0.45 })
    const firstDot = out.findIndex((element) => element.id === `${ctx.pageId}-d-b${i}-dot-0`)
    out.splice(firstDot < 0 ? out.length : firstDot, 0, ...line)
  }
  return top - y
}

function renderCompare(ctx: Ctx, out: Out, i: number, left: { title: string; items: string[] }, right: { title: string; items: string[] }, x: number, y: number, w: number, k: number): number {
  const u = ctx.u
  const stacked = w < 70 * u
  const gap = stacked ? 2.4 * u : 3.2 * u
  const colW = stacked ? w : (w - gap) / 2
  const pad = 3 * u * Math.min(1, k)
  const inner = colW - pad * 2
  const listOptions: TextOptions = { role: "bullets", size: sz(ctx, "small", k) * 1.05, lineHeight: 1.32, list: "bullet", paragraphSpacing: 0.5 }
  const sides = [
    { key: "left", data: left, color: "primary" as PaletteKey },
    { key: "right", data: right, color: "accent" as PaletteKey },
  ]
  const measured = sides.map((side) => {
    const titleOptions: TextOptions = { role: "heading", size: sz(ctx, "subheading", k) * 0.85, lineHeight: 1.15, colorRole: side.color }
    const th = side.data.title ? textHeight(ctx, side.data.title, inner, titleOptions) : 0
    const lh = side.data.items.length ? textHeight(ctx, side.data.items.join("\n"), inner, listOptions) : 0
    return { ...side, titleOptions, th, lh, height: pad + 1.8 * u + th + (th && lh ? 1.6 * u : 0) + lh + pad }
  })
  const cardH = stacked ? 0 : Math.max(...measured.map((side) => side.height))
  let top = y
  measured.forEach((side, index) => {
    const cx = stacked ? x : x + index * (colW + gap)
    const cy = stacked ? top : y
    const height = stacked ? side.height : cardH
    addCard(ctx, out, `d-b${i}-card-${side.key}`, { x: cx, y: cy, w: colW, h: height })
    addShape(ctx, out, `d-b${i}-tag-${side.key}`, { x: cx + pad, y: cy + pad, w: 7 * u, h: 0.8 * u }, { shape: "pill", fillRole: side.color })
    let inside = cy + pad + 1.8 * u
    if (side.data.title) {
      addText(ctx, out, `b${i}.${side.key}.title`, side.data.title, { x: cx + pad, y: inside, w: inner, h: side.th }, side.titleOptions)
      inside += side.th + (side.lh ? 1.6 * u : 0)
    }
    if (side.data.items.length) addText(ctx, out, `b${i}.${side.key}.items`, side.data.items.join("\n"), { x: cx + pad, y: inside, w: inner, h: side.lh }, listOptions)
    if (stacked) top += side.height + gap
  })
  if (!stacked) {
    const badge = 6.4 * u * Math.min(1, k)
    addBadge(ctx, out, `d-b${i}-vs`, x + colW + gap / 2 - badge / 2, y + cardH / 2 - badge / 2, badge, "VS")
    return cardH
  }
  return top - gap - y
}

function renderSteps(ctx: Ctx, out: Out, i: number, items: Array<{ title: string; text?: string }>, x: number, y: number, w: number, k: number): number {
  const u = ctx.u
  const n = items.length
  const titleOptions: TextOptions = { role: "heading", size: sz(ctx, "small", k) * 1.2, lineHeight: 1.2 }
  const textOptions: TextOptions = { role: "body", size: sz(ctx, "small", k) * 0.95, lineHeight: 1.38 }
  if (ctx.orientation === "landscape" && n <= 4 && w >= 90 * u) {
    const gap = 3 * u
    const colW = (w - gap * (n - 1)) / n
    const badge = 6 * u * k
    const titleH = Math.max(...items.map((item) => textHeight(ctx, item.title, colW, titleOptions)))
    const textH = Math.max(0, ...items.map((item) => (item.text ? textHeight(ctx, item.text, colW, textOptions) : 0)))
    if (n > 1) addShape(ctx, out, `d-b${i}-line`, { x: x + badge / 2, y: y + badge / 2 - 0.2 * u, w: (colW + gap) * (n - 1), h: 0.4 * u }, { shape: "rect", fillRole: "muted", opacity: 0.4, dash: "dashed" })
    items.forEach((item, j) => {
      const cx = x + j * (colW + gap)
      addBadge(ctx, out, `d-b${i}-badge-${j}`, cx, y, badge, String(j + 1))
      addText(ctx, out, `b${i}.items.${j}.title`, item.title, { x: cx, y: y + badge + 2 * u, w: colW, h: titleH }, titleOptions)
      if (item.text) addText(ctx, out, `b${i}.items.${j}.text`, item.text, { x: cx, y: y + badge + 2 * u + titleH + 0.8 * u, w: colW, h: textH }, textOptions)
    })
    return badge + 2 * u + titleH + (textH ? 0.8 * u + textH : 0)
  }
  const badge = 5 * u * k
  const tx = x + badge + 2.6 * u
  const tw = w - badge - 2.6 * u
  const rowGap = 2.4 * u
  let top = y
  items.forEach((item, j) => {
    const th = textHeight(ctx, item.title, tw, titleOptions)
    const bh = item.text ? textHeight(ctx, item.text, tw, textOptions) : 0
    const block = th + (bh ? 0.6 * u + bh : 0)
    const rowH = Math.max(badge, block)
    addBadge(ctx, out, `d-b${i}-badge-${j}`, x, top, badge, String(j + 1))
    const textTop = top + Math.max(0, (badge - th) / 2 - (bh ? (badge - th) / 2 : 0))
    addText(ctx, out, `b${i}.items.${j}.title`, item.title, { x: tx, y: textTop, w: tw, h: th }, titleOptions)
    if (item.text) addText(ctx, out, `b${i}.items.${j}.text`, item.text, { x: tx, y: textTop + th + 0.6 * u, w: tw, h: bh }, textOptions)
    top += rowH + (j < n - 1 ? rowGap : 0)
  })
  return top - y
}

const CHOICE_LETTERS = ["A", "B", "C", "D", "E", "F"]

function renderQuestion(ctx: Ctx, out: Out, i: number, question: string, choices: string[], x: number, y: number, w: number, k: number): number {
  const u = ctx.u
  const questionOptions: TextOptions = { role: "heading", size: sz(ctx, "subheading", k) * 1.05, lineHeight: 1.18 }
  const qw = Math.min(w, questionOptions.size * 34)
  const qh = textHeight(ctx, question, qw, questionOptions)
  addText(ctx, out, `b${i}.question`, question, { x, y, w: qw, h: qh }, questionOptions)
  if (!choices.length) {
    // An open question gets a place to write the answer.
    const answerH = 14 * u * k
    addShape(ctx, out, `d-b${i}-answer`, { x, y: y + qh + 3 * u, w, h: answerH }, { shape: "rounded", fillRole: "surface", radius: "theme", strokeRole: "muted", strokeWidth: 0.25 * u, dash: "dashed" })
    return qh + 3 * u + answerH
  }
  const n = choices.length
  const cols = n >= 3 && w >= 80 * u ? 2 : 1
  const rows = Math.ceil(n / cols)
  const gap = 2 * u
  const colW = (w - gap * (cols - 1)) / cols
  const pad = 2 * u * Math.min(1, k)
  const badge = 4.6 * u * k
  const choiceOptions: TextOptions = { role: "choice", size: sz(ctx, "body", k) * 0.95, lineHeight: 1.3, valign: "middle" }
  const textW = colW - pad * 2 - badge - 2 * u
  const heights = choices.map((choice) => Math.max(badge, textHeight(ctx, choice, textW, choiceOptions)))
  const rowHeights = Array.from({ length: rows }, (_, row) => Math.max(...heights.slice(row * cols, row * cols + cols)))
  let top = y + qh + 3 * u
  for (let row = 0; row < rows; row += 1) {
    const cardH = rowHeights[row] + pad * 2
    for (let col = 0; col < cols; col += 1) {
      const j = row * cols + col
      if (j >= n) break
      const cx = x + col * (colW + gap)
      addCard(ctx, out, `d-b${i}-card-${j}`, { x: cx, y: top, w: colW, h: cardH })
      addBadge(ctx, out, `d-b${i}-letter-${j}`, cx + pad, top + pad + (rowHeights[row] - badge) / 2, badge, CHOICE_LETTERS[j] ?? String(j + 1))
      addText(ctx, out, `b${i}.choices.${j}`, choices[j], { x: cx + pad + badge + 2 * u, y: top + pad, w: textW, h: rowHeights[row] }, choiceOptions)
    }
    top += cardH + (row < rows - 1 ? gap : 0)
  }
  return top - y
}

function renderDefinition(ctx: Ctx, out: Out, i: number, term: string, text: string, x: number, y: number, w: number, k: number): number {
  const u = ctx.u
  const pad = 3.2 * u * Math.min(1, k)
  const bar = 1 * u
  const inset = pad + bar + 2 * u
  const inner = w - inset - pad
  const termOptions: TextOptions = { role: "heading", size: sz(ctx, "subheading", k) * 1.1, lineHeight: 1.1, colorRole: "primary" }
  const textOptions: TextOptions = { role: "body", size: sz(ctx, "body", k), lineHeight: 1.45 }
  const th = textHeight(ctx, term, inner, termOptions)
  const bh = textHeight(ctx, text, inner, textOptions)
  const cardH = pad + th + 1.4 * u + bh + pad
  addCard(ctx, out, `d-b${i}-card`, { x, y, w, h: cardH })
  addShape(ctx, out, `d-b${i}-bar`, { x: x + pad, y: y + pad, w: bar, h: cardH - pad * 2 }, { shape: "pill", fillRole: "accent" })
  addText(ctx, out, `b${i}.term`, term, { x: x + inset, y: y + pad, w: inner, h: th }, termOptions)
  addText(ctx, out, `b${i}.text`, text, { x: x + inset, y: y + pad + th + 1.4 * u, w: inner, h: bh }, textOptions)
  return cardH
}

const CALLOUT_TONES: Record<"tip" | "note" | "warning", { label: string; role: PaletteKey }> = {
  tip: { label: "Tip", role: "primary" },
  note: { label: "Note", role: "primary" },
  warning: { label: "Heads up", role: "accent" },
}

function renderCallout(ctx: Ctx, out: Out, i: number, text: string, tone: "tip" | "note" | "warning", x: number, y: number, w: number, k: number): number {
  const u = ctx.u
  const look = CALLOUT_TONES[tone]
  const pad = 2.8 * u * Math.min(1, k)
  const bar = 0.9 * u
  const inset = pad + bar + 2 * u
  const inner = w - inset - pad
  const labelOptions: TextOptions = { role: "kicker", size: sz(ctx, "kicker", k), letterSpacing: 0.12, colorRole: look.role }
  const textOptions: TextOptions = { role: "body", size: sz(ctx, "body", k) * 0.95, lineHeight: 1.42 }
  const lh = textHeight(ctx, look.label, inner, labelOptions)
  const th = textHeight(ctx, text, inner, textOptions)
  const height = pad + lh + 0.8 * u + th + pad
  addShape(ctx, out, `d-b${i}-bg`, { x, y, w, h: height }, { shape: "rounded", fillRole: look.role, opacity: 0.12, radius: "theme" })
  addShape(ctx, out, `d-b${i}-bar`, { x: x + pad, y: y + pad, w: bar, h: height - pad * 2 }, { shape: "pill", fillRole: look.role })
  addText(ctx, out, `d-b${i}-label`, look.label, { x: x + inset, y: y + pad, w: inner, h: lh }, labelOptions)
  addText(ctx, out, `b${i}.text`, text, { x: x + inset, y: y + pad + lh + 0.8 * u, w: inner, h: th }, textOptions)
  return height
}

// ---------------------------------------------------------------------------
// Stack layouts: a page header, then blocks top to bottom at a shared scale
// ---------------------------------------------------------------------------

function renderHeader(ctx: Ctx, out: Out, block: SemanticBlock, index: number, area: Box): number {
  const u = ctx.u
  let y = area.y
  if (block.type === "title" && block.kicker) {
    const options: TextOptions = { role: "kicker", size: sz(ctx, "kicker"), letterSpacing: 0.14 }
    const h = textHeight(ctx, block.kicker, area.w, options)
    addText(ctx, out, `b${index}.kicker`, block.kicker, { x: area.x, y, w: area.w, h }, options)
    y += h + 1.4 * u
  }
  const text = block.type === "title" || block.type === "heading" ? block.text : ""
  const base: Omit<TextOptions, "size"> = { role: "heading", lineHeight: 1.1, letterSpacing: -0.005 }
  const size = fitSize(ctx, text, { width: area.w, height: sz(ctx, "heading") * 1.1 * 2.2 }, base, { max: sz(ctx, "heading"), min: sz(ctx, "headingMin") })
  const options: TextOptions = { ...base, size }
  const h = textHeight(ctx, text, area.w, options)
  addText(ctx, out, `b${index}.text`, text, { x: area.x, y, w: area.w, h }, options)
  y += h
  if (block.type === "title" && block.subtitle) {
    const subOptions: TextOptions = { role: "subtitle", size: sz(ctx, "subtitle") * 0.85, lineHeight: 1.35 }
    const sh = textHeight(ctx, block.subtitle, area.w, subOptions)
    y += 1.2 * u
    addText(ctx, out, `b${index}.subtitle`, block.subtitle, { x: area.x, y, w: area.w, h: sh }, subOptions)
    y += sh
  }
  y += 2 * u
  addShape(ctx, out, "d-header-bar", { x: area.x, y, w: 7 * u, h: 0.8 * u }, { shape: "pill", fillRole: "accent" })
  return y + 0.8 * u + 3.6 * u
}

function stackMetrics(ctx: Ctx, blocks: Placed[], w: number, k: number): { total: number; heights: number[] } {
  const heights = blocks.map((placed) => measureBlock(ctx, placed.block, w, k))
  const total = heights.reduce((sum, height) => sum + height, 0) + gapFor(ctx, k) * Math.max(0, blocks.length - 1)
  return { total, heights }
}

/** The body scale: shrink until the blocks fit, or grow a sparse page a little. Null when nothing fits at `minK`. */
function chooseScale(ctx: Ctx, blocks: Placed[], w: number, h: number, minK = MIN_K): number | null {
  if (!blocks.length) return 1
  let k = 1
  let metrics = stackMetrics(ctx, blocks, w, k)
  if (metrics.total <= h) {
    if (blocks.some((placed) => isFlexBlock(placed.block))) return k
    while (k < MAX_K) {
      const next = Math.min(MAX_K, k * 1.07)
      const grown = stackMetrics(ctx, blocks, w, next)
      if (grown.total > h * 0.8) break
      k = next
      metrics = grown
    }
    return r2(k)
  }
  while (k > minK) {
    k = Math.max(minK, k * 0.94)
    metrics = stackMetrics(ctx, blocks, w, k)
    if (metrics.total <= h) return r2(k)
  }
  return null
}

function placeStack(ctx: Ctx, out: Out, blocks: Placed[], area: Box, k: number): void {
  const { total } = stackMetrics(ctx, blocks, area.w, k)
  const free = Math.max(0, area.h - total)
  const flexCount = blocks.filter((placed) => isFlexBlock(placed.block)).length
  const maxExtra = 44 * ctx.u
  const extra = flexCount ? Math.min(maxExtra, free / flexCount) : 0
  let y = area.y
  // A short page sits a little lower than the header instead of hugging it.
  if (!flexCount && free > area.h * 0.18) y += free * 0.3
  const gap = gapFor(ctx, k)
  blocks.forEach((placed) => {
    const height = renderBlock(ctx, out, placed.block, placed.index, area.x, y, area.w, k, isFlexBlock(placed.block) ? extra : 0)
    y += height + gap
  })
}

/** Split a list-like block so its first `m` items fill `room`. */
function splitItems(ctx: Ctx, block: SemanticBlock, w: number, room: number): { head: SemanticBlock; tail: SemanticBlock } | null {
  if (block.type !== "bullets" && block.type !== "steps" && block.type !== "timeline") return null
  const items = block.items as unknown[]
  for (let m = items.length - 1; m >= 1; m -= 1) {
    const head = { ...block, items: items.slice(0, m) } as SemanticBlock
    if (measureBlock(ctx, head, w, SPLIT_K) <= room) return { head, tail: { ...block, items: items.slice(m) } as SemanticBlock }
  }
  return null
}

/** How much a block asks of the reader; a page holds up to `maxPageWeight`. */
function blockWeight(block: SemanticBlock): number {
  switch (block.type) {
    case "stats":
    case "question":
    case "compare":
    case "timeline":
    case "steps":
    case "image":
    case "meme":
      return 2
    case "bullets":
      return block.items.length > 4 ? 2 : 1.5
    default:
      return 1
  }
}

/** Tall pages (documents, posters, stories) hold more than a slide. */
function maxPageWeight(ctx: Ctx): number {
  return ctx.height >= ctx.width * 1.3 ? 6 : 4
}

/**
 * Which body blocks this page shows; the rest continue on the next page.
 * A page carries a few ideas at most (stats, a quote and a quiz fit, but read
 * as clutter), and several blocks share a page only while they fit at
 * `SPLIT_K` or larger, so a crowded page becomes two readable ones instead of
 * one with tiny type.
 */
function planFit(ctx: Ctx, blocks: Placed[], w: number, h: number): { fit: Placed[]; rest: SemanticBlock[] } {
  let weight = 0
  let take = 0
  while (take < blocks.length) {
    const next = weight + blockWeight(blocks[take].block)
    if (take > 0 && next > maxPageWeight(ctx)) break
    weight = next
    take += 1
  }
  if (take < blocks.length) {
    const head = planFit(ctx, blocks.slice(0, take), w, h)
    return { fit: head.fit, rest: [...head.rest, ...blocks.slice(take).map((placed) => placed.block)] }
  }
  const only = blocks.length === 1 ? blocks[0].block : null
  const splittable = only !== null && (only.type === "bullets" || only.type === "steps" || only.type === "timeline") && only.items.length > 1
  const floor = blocks.length > 1 || splittable ? SPLIT_K : MIN_K
  if (chooseScale(ctx, blocks, w, h, floor) !== null) return { fit: blocks, rest: [] }
  const gap = gapFor(ctx, SPLIT_K)
  const fit: Placed[] = []
  let used = 0
  for (let j = 0; j < blocks.length; j += 1) {
    const placed = blocks[j]
    const height = measureBlock(ctx, placed.block, w, SPLIT_K)
    const need = (fit.length ? gap : 0) + height
    if (used + need <= h) {
      fit.push(placed)
      used += need
      continue
    }
    const later = blocks.slice(j + 1).map((entry) => entry.block)
    const split = splitItems(ctx, placed.block, w, h - used - (fit.length ? gap : 0))
    if (split) return { fit: [...fit, { block: split.head, index: placed.index }], rest: [split.tail, ...later] }
    // A block taller than a whole page gets a page of its own (its text shrinks to fit).
    if (!fit.length) return { fit: [placed], rest: later }
    return { fit, rest: [placed.block, ...later] }
  }
  return { fit, rest: [] }
}

interface StackAreas {
  area: Box
  image: { index: number; box: Box; caption: Box | null } | null
}

/** The text column and, for a split page, the full-bleed picture beside it. */
function stackAreas(ctx: Ctx, blocks: SemanticBlock[], layout: LayoutId, headerIndex: number): StackAreas {
  const area = contentBox(ctx)
  if (layout !== "split") return { area, image: null }
  const index = blocks.findIndex((block, position) => position !== headerIndex && block.type === "image")
  if (index < 0) return { area, image: null }
  const image = blocks[index] as Extract<SemanticBlock, { type: "image" }>
  const u = ctx.u
  let box: Box
  let text: Box
  if (ctx.orientation === "landscape") {
    const iw = ctx.width * 0.42
    box = { x: ctx.width - iw, y: 0, w: iw, h: ctx.height }
    text = { x: area.x, y: area.y, w: ctx.width - iw - ctx.margin * 2, h: area.h }
  } else {
    const ih = ctx.height * 0.36
    box = { x: 0, y: 0, w: ctx.width, h: ih }
    text = { x: area.x, y: ih + ctx.margin * 0.8, w: area.w, h: ctx.height - ih - ctx.margin * 1.8 }
  }
  let caption: Box | null = null
  if (image.caption) {
    const h = sz(ctx, "caption") * 1.3 * 2
    caption = { x: text.x, y: text.y + text.h - h, w: text.w, h }
    text = { ...text, h: text.h - h - 2 * u }
  }
  return { area: text, image: { index, box, caption } }
}

function planStack(ctx: Ctx, spec: PageSpec, layout: LayoutId): { stored: SemanticBlock[]; rest: SemanticBlock[] } {
  const blocks = spec.blocks
  const headerIndex = blocks[0] && (blocks[0].type === "title" || blocks[0].type === "heading") ? 0 : -1
  const { area, image } = stackAreas(ctx, blocks, layout, headerIndex)
  const headerBottom = headerIndex === 0 ? renderHeader(ctx, [], blocks[0], 0, area) : area.y
  const body: Placed[] = blocks.map((block, index) => ({ block, index })).filter((placed) => placed.index !== headerIndex && placed.index !== image?.index)
  const { fit, rest } = planFit(ctx, body, area.w, area.y + area.h - headerBottom)
  const stored = [...(headerIndex === 0 ? [blocks[0]] : []), ...(image ? [blocks[image.index]] : []), ...fit.map((placed) => placed.block)]
  return { stored, rest }
}

function renderStack(ctx: Ctx, out: Out, blocks: SemanticBlock[], layout: LayoutId): void {
  decorate(ctx, out, "content")
  const headerIndex = blocks[0] && (blocks[0].type === "title" || blocks[0].type === "heading") ? 0 : -1
  const { area, image } = stackAreas(ctx, blocks, layout, headerIndex)
  if (image) {
    const block = blocks[image.index] as Extract<SemanticBlock, { type: "image" }>
    addImage(ctx, out, `b${image.index}.src`, image.box, block.src)
    if (image.caption && block.caption) addText(ctx, out, `b${image.index}.caption`, block.caption, image.caption, { role: "caption", size: sz(ctx, "caption"), lineHeight: 1.3, valign: "bottom" })
  }
  const headerBottom = headerIndex === 0 ? renderHeader(ctx, out, blocks[0], 0, area) : area.y
  const body: Placed[] = blocks.map((block, index) => ({ block, index })).filter((placed) => placed.index !== headerIndex && placed.index !== image?.index)
  const bodyArea: Box = { x: area.x, y: headerBottom, w: area.w, h: area.y + area.h - headerBottom }
  const k = chooseScale(ctx, body, bodyArea.w, bodyArea.h) ?? MIN_K
  placeStack(ctx, out, body, bodyArea, k)
}

// ---------------------------------------------------------------------------
// Hero layouts: cover, closing, section, quote, meme
// ---------------------------------------------------------------------------

type HeroLayout = "cover" | "closing" | "section" | "quote" | "meme"

function isHero(layout: LayoutId): layout is HeroLayout {
  return layout === "cover" || layout === "closing" || layout === "section" || layout === "quote" || layout === "meme"
}

/** The blocks a hero layout shows (in page order), or null when it cannot show this page. */
function heroSelection(layout: HeroLayout, blocks: SemanticBlock[]): number[] | null {
  const first = (test: (block: SemanticBlock) => boolean) => blocks.findIndex(test)
  const titleIndex = first((block) => block.type === "title" || block.type === "heading")
  const textIndex = first((block) => block.type === "text")
  if (layout === "meme") {
    const meme = first((block) => block.type === "meme")
    return meme < 0 ? null : [meme]
  }
  if (layout === "quote") {
    const quote = first((block) => block.type === "quote")
    if (quote < 0) return null
    return [titleIndex, quote].filter((index) => index >= 0).sort((a, b) => a - b)
  }
  if (titleIndex < 0 && textIndex < 0) return null
  const picked = [titleIndex, textIndex]
  if (layout === "cover") picked.push(first((block) => block.type === "image"))
  return picked.filter((index) => index >= 0).sort((a, b) => a - b)
}

interface HeroPart {
  slot: string
  text: string
  options: TextOptions
  width: number
  gapBefore: number
}

/** Stack text parts vertically, centred (or slightly high) in `area`, shrinking together until they fit. */
function placeHeroParts(ctx: Ctx, out: Out, area: Box, align: TextAlign, build: (k: number) => HeroPart[], bias = 0.5): void {
  let parts: HeroPart[] = []
  let heights: number[] = []
  let total = 0
  for (let k = 1; k >= 0.55; k -= 0.09) {
    parts = build(k)
    heights = parts.map((part) => textHeight(ctx, part.text, part.width, part.options))
    total = parts.reduce((sum, part, index) => sum + (index ? part.gapBefore : 0) + heights[index], 0)
    if (total <= area.h) break
  }
  let y = area.y + Math.max(0, (area.h - total) * bias)
  parts.forEach((part, index) => {
    if (index) y += part.gapBefore
    const x = align === "center" ? area.x + (area.w - part.width) / 2 : align === "right" ? area.x + area.w - part.width : area.x
    addText(ctx, out, part.slot, part.text, { x, y, w: part.width, h: heights[index] }, part.options)
    y += heights[index]
  })
}

function renderCover(ctx: Ctx, out: Out, blocks: SemanticBlock[], centered: boolean): void {
  const u = ctx.u
  decorate(ctx, out, "hero")
  let area = contentBox(ctx)
  const titleIndex = blocks.findIndex((block) => block.type === "title" || block.type === "heading")
  const textIndex = blocks.findIndex((block) => block.type === "text")
  const imageIndex = centered ? -1 : blocks.findIndex((block) => block.type === "image")
  let align: TextAlign = centered || ctx.orientation !== "landscape" ? "center" : "left"

  if (imageIndex >= 0) {
    const image = blocks[imageIndex] as Extract<SemanticBlock, { type: "image" }>
    if (ctx.orientation === "landscape") {
      const iw = ctx.width * 0.44
      addImage(ctx, out, `b${imageIndex}.src`, { x: ctx.width - iw, y: 0, w: iw, h: ctx.height }, image.src)
      area = { x: ctx.margin, y: ctx.margin, w: ctx.width - iw - ctx.margin * 2, h: ctx.height - ctx.margin * 2 }
      align = "left"
    } else {
      const ih = ctx.height * 0.42
      addImage(ctx, out, `b${imageIndex}.src`, { x: 0, y: 0, w: ctx.width, h: ih }, image.src)
      area = { x: ctx.margin, y: ih + ctx.margin * 0.7, w: ctx.width - ctx.margin * 2, h: ctx.height - ih - ctx.margin * 1.7 }
    }
    if (image.caption) {
      const h = sz(ctx, "caption") * 1.3 * 2
      addText(ctx, out, `b${imageIndex}.caption`, image.caption, { x: area.x, y: area.y + area.h - h, w: area.w, h }, { role: "caption", size: sz(ctx, "caption"), lineHeight: 1.3, align, valign: "bottom" })
      area = { ...area, h: area.h - h - 2 * u }
    }
  }

  const title = titleIndex >= 0 ? (blocks[titleIndex] as Extract<SemanticBlock, { type: "title" | "heading" }>) : null
  const text = textIndex >= 0 ? (blocks[textIndex] as Extract<SemanticBlock, { type: "text" }>) : null
  const titleWidth = align === "left" && imageIndex < 0 ? area.w * 0.8 : area.w
  const build = (k: number): HeroPart[] => {
    const parts: HeroPart[] = []
    if (title?.type === "title" && title.kicker) parts.push({ slot: `b${titleIndex}.kicker`, text: title.kicker, options: { role: "kicker", size: sz(ctx, "kicker", k) * 1.1, letterSpacing: 0.14, align }, width: titleWidth, gapBefore: 0 })
    // With no title the first paragraph plays the title.
    const headline = title ? { slot: `b${titleIndex}.text`, text: title.text } : text ? { slot: `b${textIndex}.text`, text: text.text } : null
    if (headline) {
      const base: Omit<TextOptions, "size"> = { role: "title", lineHeight: 1.04, letterSpacing: -0.01, align }
      const size = fitSize(ctx, headline.text, { width: titleWidth, height: area.h * 0.56 }, base, { max: sz(ctx, "display", k), min: sz(ctx, "displayMin", k) })
      parts.push({ slot: headline.slot, text: headline.text, options: { ...base, size }, width: titleWidth, gapBefore: 2.2 * u })
    }
    const subWidth = align === "center" ? titleWidth * 0.86 : Math.min(titleWidth, sz(ctx, "subtitle", k) * 46)
    if (title?.type === "title" && title.subtitle) parts.push({ slot: `b${titleIndex}.subtitle`, text: title.subtitle, options: { role: "subtitle", size: sz(ctx, "subtitle", k), lineHeight: 1.35, align }, width: subWidth, gapBefore: 3.4 * u })
    if (title && text) parts.push({ slot: `b${textIndex}.text`, text: text.text, options: { role: "subtitle", size: sz(ctx, "subtitle", k) * 0.86, lineHeight: 1.42, align }, width: subWidth, gapBefore: 2.4 * u })
    return parts
  }
  placeHeroParts(ctx, out, area, align, build, align === "left" ? 0.46 : 0.5)
}

function renderSection(ctx: Ctx, out: Out, blocks: SemanticBlock[]): void {
  const u = ctx.u
  decorate(ctx, out, "section")
  const area = contentBox(ctx)
  const align: TextAlign = ctx.orientation === "landscape" ? "left" : "center"
  const titleIndex = blocks.findIndex((block) => block.type === "title" || block.type === "heading")
  const textIndex = blocks.findIndex((block) => block.type === "text")
  const title = titleIndex >= 0 ? (blocks[titleIndex] as Extract<SemanticBlock, { type: "title" | "heading" }>) : null
  const text = textIndex >= 0 ? (blocks[textIndex] as Extract<SemanticBlock, { type: "text" }>) : null
  const width = area.w * (align === "left" ? 0.82 : 1)
  const barW = 10 * u
  const build = (k: number): HeroPart[] => {
    const parts: HeroPart[] = []
    if (title?.type === "title" && title.kicker) parts.push({ slot: `b${titleIndex}.kicker`, text: title.kicker, options: { role: "kicker", surface: "primary", size: sz(ctx, "kicker", k) * 1.1, letterSpacing: 0.14, align, opacity: 0.85 }, width, gapBefore: 0 })
    const headline = title ? { slot: `b${titleIndex}.text`, text: title.text } : text ? { slot: `b${textIndex}.text`, text: text.text } : null
    if (headline) {
      const base: Omit<TextOptions, "size"> = { role: "heading", surface: "primary", lineHeight: 1.06, letterSpacing: -0.01, align }
      const size = fitSize(ctx, headline.text, { width, height: area.h * 0.5 }, base, { max: sz(ctx, "display", k) * 0.9, min: sz(ctx, "headingMin", k) })
      parts.push({ slot: headline.slot, text: headline.text, options: { ...base, size }, width, gapBefore: 2 * u })
    }
    if (title?.type === "title" && title.subtitle) parts.push({ slot: `b${titleIndex}.subtitle`, text: title.subtitle, options: { role: "subtitle", surface: "primary", size: sz(ctx, "subtitle", k), lineHeight: 1.35, align, opacity: 0.85 }, width: Math.min(width, sz(ctx, "subtitle", k) * 46), gapBefore: 3 * u })
    if (title && text) parts.push({ slot: `b${textIndex}.text`, text: text.text, options: { role: "subtitle", surface: "primary", size: sz(ctx, "subtitle", k) * 0.88, lineHeight: 1.42, align, opacity: 0.85 }, width: Math.min(width, sz(ctx, "subtitle", k) * 46), gapBefore: 2.4 * u })
    return parts
  }
  // Leave room above the text for the accent bar.
  const textArea: Box = { ...area, y: area.y + 3 * u, h: area.h - 3 * u }
  const before = out.length
  placeHeroParts(ctx, out, textArea, align, build, 0.5)
  const firstText = out[before]
  if (firstText) {
    const barX = align === "center" ? ctx.width / 2 - barW / 2 : area.x
    addShape(ctx, out, "d-section-bar", { x: barX, y: firstText.y - 3.2 * u, w: barW, h: 1 * u }, { shape: "pill", fillRole: "accent" })
  }
}

function renderQuote(ctx: Ctx, out: Out, blocks: SemanticBlock[]): void {
  const u = ctx.u
  decorate(ctx, out, "hero")
  const area = contentBox(ctx)
  const align: TextAlign = ctx.orientation === "landscape" ? "left" : "center"
  const quoteIndex = blocks.findIndex((block) => block.type === "quote")
  const labelIndex = blocks.findIndex((block) => block.type === "title" || block.type === "heading")
  const quote = blocks[quoteIndex] as Extract<SemanticBlock, { type: "quote" }>
  const label = labelIndex >= 0 ? (blocks[labelIndex] as Extract<SemanticBlock, { type: "title" | "heading" }>) : null
  const width = area.w * (align === "left" ? 0.84 : 1)
  const build = (k: number): HeroPart[] => {
    const parts: HeroPart[] = []
    if (label) parts.push({ slot: `b${labelIndex}.text`, text: label.text, options: { role: "kicker", size: sz(ctx, "kicker", k) * 1.1, letterSpacing: 0.14, align }, width, gapBefore: 0 })
    parts.push({ slot: "d-quote-mark", text: "“", options: { role: "quote", colorRole: "accent", size: sz(ctx, "display", k) * 1.9, lineHeight: 0.62, align, fit: "none" }, width: Math.min(width, sz(ctx, "display", k) * 1.6), gapBefore: 2 * u })
    const base: Omit<TextOptions, "size"> = { role: "quote", lineHeight: 1.24, align }
    const size = fitSize(ctx, quote.text, { width, height: area.h * 0.55 }, base, { max: sz(ctx, "quote", k), min: sz(ctx, "quoteMin", k) })
    parts.push({ slot: `b${quoteIndex}.text`, text: quote.text, options: { ...base, size }, width, gapBefore: 1.2 * u })
    if (quote.by) parts.push({ slot: `b${quoteIndex}.by`, text: `— ${quote.by}`, options: { role: "attribution", size: sz(ctx, "subtitle", k) * 0.9, lineHeight: 1.3, align }, width, gapBefore: 3 * u })
    return parts
  }
  placeHeroParts(ctx, out, area, align, build, 0.5)
}

function renderMeme(ctx: Ctx, out: Out, blocks: SemanticBlock[]): void {
  const u = ctx.u
  const index = blocks.findIndex((block) => block.type === "meme")
  const meme = blocks[index] as Extract<SemanticBlock, { type: "meme" }>
  addImage(ctx, out, `b${index}.src`, { x: 0, y: 0, w: ctx.width, h: ctx.height }, meme.src)
  const pad = 3.5 * u
  const width = ctx.width - pad * 2
  const base: Omit<TextOptions, "size"> = { role: "meme", lineHeight: 1.02, align: "center", effect: "outline", effectColor: "#000000" }
  const place = (slot: string, text: string, valign: VerticalAlign) => {
    const size = fitSize(ctx, text, { width, height: ctx.height * 0.28 }, base, { max: sz(ctx, "meme"), min: sz(ctx, "meme") * 0.35 })
    const options: TextOptions = { ...base, size, valign }
    const h = textHeight(ctx, text, width, options)
    addText(ctx, out, slot, text, { x: pad, y: valign === "top" ? pad : ctx.height - pad - h, w: width, h }, options)
  }
  if (meme.top) place(`b${index}.top`, meme.top, "top")
  if (meme.bottom) place(`b${index}.bottom`, meme.bottom, "bottom")
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

interface BuiltPage {
  elements: CanvasElement[]
  layout: LayoutId
  stored: SemanticBlock[]
  rest: SemanticBlock[]
  background: string
  backgroundRole: DesignPage["backgroundRole"]
  pattern: PagePattern
}

function buildPage(ctx: Ctx, spec: PageSpec, requested: LayoutId): BuiltPage {
  const theme = ctx.theme
  const out: Out = []
  if (isHero(requested)) {
    const selection = heroSelection(requested, spec.blocks)
    if (selection) {
      const stored = selection.map((index) => spec.blocks[index])
      const rest = spec.blocks.filter((_, index) => !selection.includes(index))
      if (requested === "cover" || requested === "closing") renderCover(ctx, out, stored, requested === "closing")
      else if (requested === "section") renderSection(ctx, out, stored)
      else if (requested === "quote") renderQuote(ctx, out, stored)
      else renderMeme(ctx, out, stored)
      if (requested === "meme") return { elements: out, layout: requested, stored, rest, background: "#111111", backgroundRole: null, pattern: "none" }
      if (requested === "section") return { elements: out, layout: requested, stored, rest, background: theme.palette.primary, backgroundRole: "primary", pattern: "none" }
      return { elements: out, layout: requested, stored, rest, background: theme.palette.background, backgroundRole: "background", pattern: themePattern(theme) }
    }
  }
  // Stack layouts (and any hero that cannot show this content).
  const layout: LayoutId = isHero(requested) ? (spec.blocks.some((block) => block.type === "bullets") ? "bullets" : "text") : requested
  const { stored, rest } = planStack(ctx, spec, layout)
  renderStack(ctx, out, stored, layout)
  return { elements: out, layout, stored, rest, background: theme.palette.background, backgroundRole: "background", pattern: themePattern(theme) }
}

function answerNotes(blocks: SemanticBlock[]): string {
  const lines: string[] = []
  for (const block of blocks) {
    if (block.type !== "question") continue
    if (block.answer !== undefined && block.choices?.[block.answer]) lines.push(`Answer: ${CHOICE_LETTERS[block.answer] ?? block.answer + 1}. ${block.choices[block.answer]}`)
    if (block.explanation) lines.push(block.explanation)
  }
  return lines.join("\n")
}

function continuationSpec(page: BuiltPage, source: PageSpec): PageSpec | null {
  if (!page.rest.length) return null
  const header = source.blocks[0]
  const blocks = [...page.rest]
  const startsWithHeading = blocks[0]?.type === "heading" || blocks[0]?.type === "title"
  if ((header?.type === "title" || header?.type === "heading") && !startsWithHeading && !isHero(page.layout)) {
    blocks.unshift({ type: "heading", text: `${header.text.replace(/\s*\(cont\.\)$/i, "")} (cont.)` })
  }
  return normalizePageSpec({ blocks })
}

export interface LayoutPageOptions {
  theme: string
  width: number
  height: number
  pageId?: string
  /** Page position in the design: varies decorations and picks cover/closing layouts. */
  index?: number
  total?: number
  measure?: MeasureText
  /** Ids for continuation pages (defaults to fresh random ids). */
  nextPageId?: () => string
}

/**
 * Lay out one page spec. Returns the page plus any continuation pages its
 * content needed. The page's layout is `spec.layout` when set, otherwise the
 * one `pickLayout` chooses for its content and position.
 */
export function layoutPage(spec: PageSpec, options: LayoutPageOptions): DesignPage[] {
  const theme = designTheme(options.theme)
  const measure = options.measure ?? estimateMeasure
  const index = options.index ?? 0
  const total = options.total ?? 1
  const pages: DesignPage[] = []
  let current: PageSpec | null = spec
  let continuation = 0
  while (current && continuation <= MAX_CONTINUATIONS) {
    const pageId = continuation === 0 ? (options.pageId ?? newDesignId("pg")) : options.nextPageId ? options.nextPageId() : newDesignId("pg")
    const ctx = makeCtx({ theme, width: options.width, height: options.height, pageId, index: index + continuation, measure })
    const requested: LayoutId = continuation === 0 ? pickLayout(current, index, total) : pickLayout({ blocks: current.blocks }, 1, 3)
    const built = buildPage(ctx, current, requested)
    // A page that handed blocks on is named for what it kept (stats, not the quiz that moved on).
    let layout = built.layout
    if (!current.layout && built.rest.length && !isHero(layout) && layout !== "split") {
      const settled = pickLayout({ blocks: built.stored }, 1, 3)
      if (!isHero(settled) && settled !== "split") layout = settled
    }
    const notes = [continuation === 0 ? (spec.notes ?? "") : "", answerNotes(built.stored)].filter(Boolean).join("\n\n")
    pages.push(
      createDesignPage({
        id: pageId,
        background: built.background,
        backgroundRole: built.backgroundRole,
        pattern: built.pattern,
        elements: built.elements.map((element, z) => ({ ...element, z })),
        notes,
        layout,
        spec: { layout, blocks: built.stored },
      }),
    )
    current = continuationSpec(built, current)
    continuation += 1
  }
  return pages
}

export interface DesignFromSpecOptions {
  format?: DesignFormatId | "custom"
  width?: number
  height?: number
  theme?: string
  name?: string
  measure?: MeasureText
  /** Page ids become `${prefix}1`, `${prefix}2`… (stable output for tests and previews). */
  pageIdPrefix?: string
}

/** A whole design from a spec: every page laid out, themed and sized for the format. */
export function designFromSpec(input: DesignSpec, options: DesignFromSpecOptions = {}): DesignDoc {
  const spec = normalizeDesignSpec(input)
  const format = options.format ?? "presentation"
  const size = format === "custom" ? { width: options.width ?? 1920, height: options.height ?? 1080 } : designFormat(format)
  const theme = designTheme(options.theme ?? spec.theme)
  let counter = 0
  const nextPageId = () => (options.pageIdPrefix ? `${options.pageIdPrefix}${++counter}` : newDesignId("pg"))
  const pages: DesignPage[] = []
  spec.pages.forEach((pageSpec, index) => {
    if (pages.length >= DESIGN_LIMITS.pages) return
    pages.push(...layoutPage(pageSpec, { theme: theme.id, width: size.width, height: size.height, pageId: nextPageId(), index, total: spec.pages.length, measure: options.measure, nextPageId }))
  })
  return createDesignDoc({
    name: options.name ?? spec.title ?? "Untitled design",
    format,
    width: size.width,
    height: size.height,
    theme: theme.id,
    pages: pages.slice(0, DESIGN_LIMITS.pages),
  })
}

// ---------------------------------------------------------------------------
// Edits flow back: page elements -> spec
// ---------------------------------------------------------------------------

function slotOf(element: CanvasElement): string | null {
  const slot = element.style?.slot
  return typeof slot === "string" && slot ? slot : null
}

function isContentSlot(slot: string): boolean {
  return /^b\d+\./.test(slot)
}

function stripListMarker(line: string): string {
  return line.replace(/^\s*(?:[-*•☐]|\d+[.)])\s+/, "").trim()
}

/**
 * Rebuild a page's spec from what is on the page now: edited text replaces the
 * spec text, deleted (or hidden) elements drop their field, and a replaced
 * picture keeps its new source. Fields a layout never draws (a quiz answer, an
 * explanation, alt text) are kept as they were.
 */
export function syncSpecFromElements(spec: PageSpec, elements: readonly CanvasElement[]): PageSpec | null {
  const bySlot = new Map<string, CanvasElement>()
  for (const element of elements) {
    const slot = slotOf(element)
    if (slot && isContentSlot(slot) && !element.hidden && !bySlot.has(slot)) bySlot.set(slot, element)
  }
  const read = (path: string): string | undefined => bySlot.get(path)?.content
  const text = (path: string): string => (read(path) ?? "").trim()
  const list = (path: string): string[] | undefined => {
    const value = read(path)
    return value === undefined ? undefined : value.split("\n").map(stripListMarker).filter(Boolean)
  }

  const blocks = spec.blocks.map((block, i): unknown => {
    const p = `b${i}.`
    switch (block.type) {
      case "title":
        return { type: "title", text: text(`${p}text`), subtitle: text(`${p}subtitle`), kicker: text(`${p}kicker`) }
      case "heading":
      case "text":
      case "callout":
        return { ...block, text: text(`${p}text`) }
      case "bullets": {
        const whole = list(`${p}items`)
        return { ...block, items: whole ?? block.items.map((_, j) => text(`${p}items.${j}`)) }
      }
      case "quote":
        return { ...block, text: text(`${p}text`), by: text(`${p}by`).replace(/^[—–-]+\s*/, "") }
      case "image": {
        const src = read(`${p}src`)
        if (src === undefined) return null
        return { type: "image", src: src || undefined, alt: block.alt, caption: text(`${p}caption`) }
      }
      case "stats":
        return { type: "stats", items: block.items.map((_, j) => ({ value: text(`${p}items.${j}.value`), label: text(`${p}items.${j}.label`) })) }
      case "timeline":
        return { type: "timeline", items: block.items.map((_, j) => ({ label: text(`${p}items.${j}.label`), text: text(`${p}items.${j}.text`) })) }
      case "steps":
        return { type: "steps", items: block.items.map((_, j) => ({ title: text(`${p}items.${j}.title`), text: text(`${p}items.${j}.text`) })) }
      case "compare":
        return {
          type: "compare",
          left: { title: text(`${p}left.title`), items: list(`${p}left.items`) ?? [] },
          right: { title: text(`${p}right.title`), items: list(`${p}right.items`) ?? [] },
        }
      case "question": {
        const choices: string[] = []
        let answer: number | undefined
        ;(block.choices ?? []).forEach((_, j) => {
          const value = text(`${p}choices.${j}`)
          if (!value) return
          if (j === block.answer) answer = choices.length
          choices.push(value)
        })
        return { type: "question", question: text(`${p}question`), choices, answer, explanation: block.explanation }
      }
      case "definition":
        return { type: "definition", term: text(`${p}term`), text: text(`${p}text`) }
      case "meme": {
        const src = read(`${p}src`)
        return { type: "meme", top: text(`${p}top`), bottom: text(`${p}bottom`), src: src || undefined }
      }
      default:
        return block
    }
  })
  return normalizePageSpec({ layout: spec.layout, blocks: blocks.filter(Boolean) })
}

/**
 * The spec behind a page: synced from its slots when a layout made it, or read
 * off a hand-made page (largest text near the top is the title, multi-line
 * text is a list, pictures are images). `consumed` lists the elements the spec
 * now stands for; a re-layout replaces those and keeps everything else.
 */
export function inferPageSpec(page: DesignPage, options: { first?: boolean } = {}): { spec: PageSpec; consumed: Set<string> } | null {
  if (page.spec) {
    const spec = syncSpecFromElements(page.spec, page.elements)
    if (!spec) return null
    return { spec, consumed: new Set(page.elements.filter((element) => slotOf(element)).map((element) => element.id)) }
  }
  const visible = page.elements.filter((element) => !element.hidden)
  const texts = visible.filter((element) => element.type === "text" && element.content.trim()).sort((a, b) => a.y - b.y || a.x - b.x)
  const images = visible.filter((element) => element.type === "image" && imageSource(element)).sort((a, b) => b.width * b.height - a.width * a.height)
  if (!texts.length && !images.length) return null

  const sizes = texts.map((element) => readTextStyle(element).size)
  const sorted = [...sizes].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0
  const largest = Math.max(0, ...sizes)
  const titleElement = texts.length && (texts.length === 1 || largest >= median * 1.2) ? texts[sizes.indexOf(largest)] : null

  const blocks: unknown[] = []
  const consumed = new Set<string>()
  if (titleElement) {
    blocks.push({ type: options.first ? "title" : "heading", text: titleElement.content.trim() })
    consumed.add(titleElement.id)
  }
  for (const element of texts) {
    if (element === titleElement || blocks.length >= 7) continue
    const lines = element.content.split("\n").map(stripListMarker).filter(Boolean)
    if (lines.length >= 2 && lines.every((line) => line.length <= 120)) blocks.push({ type: "bullets", items: lines })
    else blocks.push({ type: "text", text: element.content.trim() })
    consumed.add(element.id)
  }
  const image = images[0]
  if (image) {
    blocks.push({ type: "image", src: image.content })
    consumed.add(image.id)
  }
  const spec = normalizePageSpec({ blocks })
  return spec ? { spec, consumed } : null
}

// ---------------------------------------------------------------------------
// Same content, another format
// ---------------------------------------------------------------------------

const LEADING_LABEL = /^\s*((?:\d{1,4}(?:s|bc|ad)?|[A-Z][a-z]{2,8}\.?(?: \d{1,4})?|(?:step|phase|week|day|part)\s*\d+|Q[1-4]))\s*[:\-–—]\s*(.+)$/i
const LEADING_NUMBER = /^\s*([$€£]?\d[\d.,]*\s?(?:%|x|k|m|bn|[a-z]{0,3})?)\s+(?:[-–—:]\s*)?(.{2,80})$/i

function splitTitle(item: string): { title: string; text?: string } {
  const match = /^(.{2,60}?)\s*(?::|\s[-–—]\s)\s*(.+)$/.exec(item)
  return match ? { title: match[1].trim(), text: match[2].trim() } : { title: item }
}

function firstBlockIndex(spec: PageSpec, types: SemanticBlock["type"][]): number {
  return spec.blocks.findIndex((block) => types.includes(block.type))
}

function listItemsOf(block: SemanticBlock): string[] {
  switch (block.type) {
    case "bullets":
      return block.items
    case "steps":
      return block.items.map((item) => (item.text ? `${item.title}: ${item.text}` : item.title))
    case "timeline":
      return block.items.map((item) => [item.label, item.text].filter(Boolean).join(": "))
    case "stats":
      return block.items.map((item) => `${item.value} ${item.label}`.trim())
    case "compare":
      return [...block.left.items, ...block.right.items]
    case "text":
      return block.text
        .split(/(?<=[.!?])\s+/)
        .map((sentence) => sentence.trim())
        .filter(Boolean)
        .slice(0, 8)
    default:
      return []
  }
}

/**
 * Rewrite a spec so a chosen layout can show it: a list becomes steps, a
 * timeline, stat cards or two columns; a paragraph becomes a quote; a split
 * layout gets a picture frame. Content is converted, never dropped.
 */
export function adaptSpecToLayout(spec: PageSpec, layout: LayoutId): PageSpec {
  const blocks = [...spec.blocks]
  const listIndex = firstBlockIndex(spec, ["bullets", "steps", "timeline", "stats", "compare"])
  const replaceList = (make: (items: string[]) => SemanticBlock | null) => {
    const index = listIndex >= 0 ? listIndex : firstBlockIndex(spec, ["text"])
    if (index < 0) return
    const items = listItemsOf(blocks[index])
    if (items.length < 1) return
    const next = make(items)
    if (next) blocks[index] = next
  }
  switch (layout) {
    case "bullets":
      replaceList((items) => ({ type: "bullets", items: items.slice(0, 8) }))
      break
    case "steps":
      replaceList((items) => ({ type: "steps", items: items.slice(0, 5).map(splitTitle) }))
      break
    case "timeline":
      replaceList((items) => ({
        type: "timeline",
        items: items.slice(0, 6).map((item, index) => {
          const match = LEADING_LABEL.exec(item)
          return match ? { label: match[1], text: match[2] } : { label: String(index + 1).padStart(2, "0"), text: item }
        }),
      }))
      break
    case "stats":
      replaceList((items) => {
        const stats = items.slice(0, 4).map((item) => {
          const match = LEADING_NUMBER.exec(item)
          return match ? { value: match[1], label: match[2] } : null
        })
        return stats.every(Boolean) ? { type: "stats", items: stats as Array<{ value: string; label: string }> } : null
      })
      break
    case "compare":
      replaceList((items) => {
        if (items.length < 2) return null
        const half = Math.ceil(items.length / 2)
        return { type: "compare", left: { title: "", items: items.slice(0, half).slice(0, 5) }, right: { title: "", items: items.slice(half).slice(0, 5) } }
      })
      break
    case "quote": {
      const index = firstBlockIndex(spec, ["text", "callout"])
      const block = blocks[index]
      if (block && (block.type === "text" || block.type === "callout")) blocks[index] = { type: "quote", text: block.text.slice(0, 320) }
      break
    }
    case "text": {
      if (listIndex >= 0) blocks[listIndex] = { type: "text", text: listItemsOf(blocks[listIndex]).join(" ").slice(0, 900) }
      break
    }
    case "split": {
      if (!blocks.some((block) => block.type === "image")) blocks.push({ type: "image" })
      break
    }
    case "definition": {
      const heading = firstBlockIndex(spec, ["heading", "title"])
      const text = firstBlockIndex(spec, ["text"])
      if (heading >= 0 && text >= 0 && !blocks.some((block) => block.type === "definition")) {
        const term = blocks[heading] as Extract<SemanticBlock, { type: "heading" | "title" }>
        const body = blocks[text] as Extract<SemanticBlock, { type: "text" }>
        blocks[text] = { type: "definition", term: term.text.slice(0, 80), text: body.text.slice(0, 320) }
        blocks.splice(heading, 1)
      }
      break
    }
    default:
      break
  }
  return normalizePageSpec({ layout, blocks: blocks.slice(0, 8) }) ?? { ...spec, layout }
}

/** Layouts worth offering for a page's content, best first. */
export function layoutChoices(spec: PageSpec, index = 1, total = 3): LayoutId[] {
  const types = new Set(spec.blocks.map((block) => block.type))
  const choices: LayoutId[] = [pickLayout({ ...spec, layout: undefined }, index, total)]
  const add = (...layouts: LayoutId[]) => {
    for (const layout of layouts) if (!choices.includes(layout)) choices.push(layout)
  }
  const listish = types.has("bullets") || types.has("steps") || types.has("timeline") || types.has("compare")
  const onlyText = [...types].every((type) => type === "title" || type === "heading" || type === "text")
  if (types.has("meme")) add("meme")
  if (types.has("question")) add("question")
  if (types.has("quote")) add("quote", "text")
  if (types.has("definition")) add("definition", "text")
  if (types.has("stats")) add("stats", "bullets", "split")
  if (listish) add("bullets", "steps", "timeline", "compare", "split", "text")
  if (onlyText) add("cover", "section", "closing", "split")
  if (types.has("text") && (types.has("heading") || types.has("title"))) add("definition", "quote")
  if (types.has("image")) add("split")
  return choices.filter((layout) => LAYOUT_IDS.includes(layout)).slice(0, 8)
}

// ---------------------------------------------------------------------------
// Re-layout and resize
// ---------------------------------------------------------------------------

/**
 * Re-lay out one page from what is on it (optionally in another layout). Pages
 * the content now needs are inserted after it. Elements a person added keep
 * their place, on top.
 */
export function relayoutPage(doc: DesignDoc, pageIndex: number, options: { layout?: LayoutId; measure?: MeasureText } = {}): { doc: DesignDoc; added: number } {
  const index = Math.max(0, Math.min(doc.pages.length - 1, Math.floor(pageIndex)))
  const page = doc.pages[index]
  const inferred = inferPageSpec(page, { first: index === 0 })
  if (!inferred) return { doc, added: 0 }
  const spec = options.layout ? adaptSpecToLayout(inferred.spec, options.layout) : inferred.spec
  const room = DESIGN_LIMITS.pages - doc.pages.length
  const laidOut = layoutPage(spec, { theme: doc.theme, width: doc.width, height: doc.height, pageId: page.id, index, total: doc.pages.length, measure: options.measure }).slice(0, Math.max(1, room + 1))
  const kept = page.elements.filter((element) => !inferred.consumed.has(element.id))
  const first = laidOut[0]
  const taken = new Set(first.elements.map((element) => element.id))
  const merged = [...first.elements, ...kept.map((element) => (taken.has(element.id) ? { ...element, id: newDesignId(element.type) } : element))].map((element, z) => ({ ...element, z }))
  laidOut[0] = { ...first, elements: merged, notes: page.notes || first.notes, hidden: page.hidden, transition: page.transition }
  const pages = [...doc.pages.slice(0, index), ...laidOut, ...doc.pages.slice(index + 1)]
  return { doc: { ...doc, pages }, added: laidOut.length - 1 }
}

/**
 * Change the page size. `scale` keeps every element where it was, scaled;
 * `smart` also re-lays out every page a layout made, so a slide deck becomes a
 * real story or A4 handout rather than a squashed one.
 */
export function resizeDesign(doc: DesignDoc, target: { format: DesignFormatId | "custom"; width: number; height: number }, options: { mode?: "scale" | "smart"; measure?: MeasureText } = {}): DesignDoc {
  const scaled = scaleDesign(doc, target)
  if (options.mode !== "smart") return scaled
  let result = scaled
  for (let index = result.pages.length - 1; index >= 0; index -= 1) {
    if (!result.pages[index].spec) continue
    result = relayoutPage(result, index, { measure: options.measure }).doc
  }
  return result
}
