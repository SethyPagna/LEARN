import type { CanvasElement } from "@/lib/studio/canvas-engine"

import type { DesignDoc, DesignPage } from "./document"
import { pageUnit } from "./document"
import type { DesignFontId } from "./fonts"
import { pageInches } from "./formats"
import { alphaOf, readShapeStyle, readTextStyle, shadowSpec, toHex6 } from "./style"
import { estimateMeasure, layoutText, type MeasureText } from "./text"

/**
 * A PowerPoint export plan: what to put on each slide, in pptxgenjs terms.
 *
 * Text stays text (editable in PowerPoint, Keynote and Google Slides) at the
 * size the editor actually fitted it to, and simple shapes stay shapes. What
 * PowerPoint cannot draw the same way — pictures with masks, filters or a focus
 * point, gradients, organic shapes, embeds and patterned backgrounds — is marked
 * `raster`: the editor draws that one element (or the background) with the
 * canvas renderer and places the picture where the element was, so the slide
 * still matches the design.
 *
 * Pure: the browser side only walks the plan and calls pptxgenjs.
 */

/** Font names written into the file (Google Slides has all of them; PowerPoint substitutes missing ones). */
export const PPTX_FONT_FACES: Record<DesignFontId, string> = {
  sans: "Arial",
  display: "Bricolage Grotesque",
  mono: "Courier New",
  poppins: "Poppins",
  nunito: "Nunito",
  space: "Space Grotesk",
  playfair: "Playfair Display",
  lora: "Lora",
  "dm-serif": "DM Serif Display",
  bebas: "Bebas Neue",
  anton: "Anton",
  caveat: "Caveat",
  pacifico: "Pacifico",
}

export interface PptxBox {
  x: number
  y: number
  w: number
  h: number
  rotate?: number
}

export interface PptxShadow {
  type: "outer"
  color: string
  opacity: number
  blur: number
  offset: number
  angle: number
}

export interface PptxTextOptions extends PptxBox {
  fontFace: string
  fontSize: number
  color: string
  transparency?: number
  bold: boolean
  italic: boolean
  align: "left" | "center" | "right" | "justify"
  valign: "top" | "middle" | "bottom"
  margin: number
  lineSpacing: number
  paraSpaceAfter?: number
  charSpacing?: number
  underline?: { style: "sng" }
  strike?: "sngStrike"
  bullet?: boolean | { type: "number" }
  fit: "none"
  wrap: true
  shape?: string
  fill?: { color: string; transparency?: number }
  line?: { color: string; width: number; dashType?: "dash" | "sysDot"; transparency?: number }
  rectRadius?: number
  shadow?: PptxShadow
  glow?: { size: number; opacity: number; color: string }
  outline?: { size: number; color: string }
  highlight?: string
}

export interface PptxShapeOptions extends PptxBox {
  fill?: { color: string; transparency?: number }
  line?: { color: string; width: number; dashType?: "dash" | "sysDot"; transparency?: number }
  rectRadius?: number
  shadow?: PptxShadow
}

export type PptxOp =
  | { kind: "text"; id: string; text: string; options: PptxTextOptions }
  | { kind: "shape"; id: string; shape: string; options: PptxShapeOptions }
  /** Draw element `id` with the canvas renderer and place the picture in `box` (unrotated size; `rotate` applies). */
  | { kind: "raster"; id: string; box: PptxBox; transparent: boolean }

export interface PptxSlidePlan {
  pageId: string
  /** Solid background colour (hex without `#`). */
  background: string
  /** The background has a pattern: draw it with the canvas renderer instead. */
  backgroundRaster: boolean
  hidden: boolean
  notes: string
  ops: PptxOp[]
}

export interface PptxPlan {
  title: string
  layout: { name: string; width: number; height: number }
  slides: PptxSlidePlan[]
}

export interface PptxPlanOptions {
  measure?: MeasureText
  /** Leave hidden pages out (default) or keep them as hidden slides. */
  includeHidden?: boolean
}

/** Shapes PowerPoint draws the same way as the editor. */
const NATIVE_SHAPES: Partial<Record<string, string>> = {
  rect: "rect",
  rounded: "roundRect",
  pill: "roundRect",
  ellipse: "ellipse",
  triangle: "triangle",
  diamond: "diamond",
  line: "line",
}

function hex(value: unknown, fallback = "#000000"): string {
  return toHex6(value, fallback).replace("#", "")
}

function transparency(color: unknown, opacity: number): number | undefined {
  const alpha = alphaOf(color) * opacity
  const value = Math.round((1 - alpha) * 100)
  return value > 0 ? Math.min(100, value) : undefined
}

function r(value: number, digits = 4): number {
  const scale = 10 ** digits
  return Math.round(value * scale) / scale
}

function rotation(element: CanvasElement): number | undefined {
  const degrees = ((Math.round(element.rotation) % 360) + 360) % 360
  return degrees ? degrees : undefined
}

function dashType(dash: string): "dash" | "sysDot" | undefined {
  if (dash === "dashed") return "dash"
  if (dash === "dotted") return "sysDot"
  return undefined
}

interface Scale {
  /** Inches per design px. */
  inch: number
  /** Points per design px. */
  pt: number
  unit: number
}

function box(element: CanvasElement, scale: Scale): PptxBox {
  const out: PptxBox = { x: r(element.x * scale.inch), y: r(element.y * scale.inch), w: r(Math.max(1, element.width) * scale.inch), h: r(Math.max(1, element.height) * scale.inch) }
  const rotate = rotation(element)
  if (rotate) out.rotate = rotate
  return out
}

function shadowOption(kind: Parameters<typeof shadowSpec>[0], scale: Scale, glowColor?: string): PptxShadow | undefined {
  const spec = shadowSpec(kind, scale.unit, glowColor)
  if (!spec) return undefined
  const alpha = alphaOf(spec.color)
  return {
    type: "outer",
    color: hex(spec.color),
    opacity: r(alpha, 2),
    blur: r(spec.blur * scale.pt, 1),
    offset: r(Math.hypot(spec.x, spec.y) * scale.pt, 1),
    angle: spec.y || spec.x ? Math.round(((Math.atan2(spec.y, spec.x) * 180) / Math.PI + 360) % 360) : 90,
  }
}

function textOp(element: CanvasElement, scale: Scale, measure: MeasureText): PptxOp {
  const style = readTextStyle(element)
  const fitted = layoutText(element.content, element, style, measure)
  const size = fitted.size
  const options: PptxTextOptions = {
    ...box(element, scale),
    fontFace: PPTX_FONT_FACES[style.font],
    fontSize: r(size * scale.pt, 1),
    color: hex(style.color),
    bold: style.weight >= 600,
    italic: style.italic,
    align: style.align,
    valign: style.verticalAlign,
    margin: r(style.padding * scale.pt, 2),
    lineSpacing: r(fitted.lineHeight * scale.pt, 2),
    fit: "none",
    wrap: true,
  }
  const see = transparency(style.color, style.opacity)
  if (see) options.transparency = see
  if (style.paragraphSpacing) options.paraSpaceAfter = r(style.paragraphSpacing * size * scale.pt, 2)
  if (style.letterSpacing) options.charSpacing = r(style.letterSpacing * size * scale.pt, 2)
  if (style.underline) options.underline = { style: "sng" }
  if (style.strike) options.strike = "sngStrike"
  if (style.list === "bullet") options.bullet = true
  else if (style.list === "number") options.bullet = { type: "number" }
  if (style.background) {
    options.fill = { color: hex(style.background), ...(transparency(style.background, style.opacity) ? { transparency: transparency(style.background, style.opacity) } : {}) }
  }
  if (style.stroke && style.strokeWidth > 0) {
    options.line = { color: hex(style.stroke), width: r(style.strokeWidth * scale.pt, 2), ...(dashType(style.dash) ? { dashType: dashType(style.dash) } : {}) }
  }
  if ((style.background || options.line) && style.radius > 0) {
    options.shape = "roundRect"
    options.rectRadius = r(Math.min(style.radius, Math.min(element.width, element.height) / 2) * scale.inch)
  }
  const boxShadow = style.background ? shadowOption(style.shadow, scale) : undefined
  if (boxShadow) options.shadow = boxShadow
  const effectColor = hex(style.effectColor)
  switch (style.effect) {
    case "shadow":
      options.shadow = { type: "outer", color: effectColor, opacity: 0.45, blur: r(size * 0.1 * scale.pt, 1), offset: r(size * 0.072 * scale.pt, 1), angle: 56 }
      break
    case "lift":
      options.shadow = { type: "outer", color: effectColor, opacity: 0.35, blur: r(size * 0.28 * scale.pt, 1), offset: r(size * 0.08 * scale.pt, 1), angle: 90 }
      break
    case "neon":
      options.glow = { size: r(size * 0.22 * scale.pt, 1), opacity: 0.8, color: effectColor }
      break
    case "outline":
      options.outline = { size: r(Math.max(1, size * 0.07) * scale.pt, 2), color: effectColor }
      break
    case "highlight":
      options.highlight = effectColor
      break
    default:
      break
  }
  const text = style.uppercase ? element.content.toUpperCase() : element.content
  return { kind: "text", id: element.id, text, options }
}

function shapeOp(element: CanvasElement, scale: Scale, measure: MeasureText): PptxOp {
  const style = readShapeStyle(element)
  const native = NATIVE_SHAPES[style.shape]
  if (!native || style.fill2) return { kind: "raster", id: element.id, box: box(element, scale), transparent: true }
  const place = box(element, scale)
  const opacity = style.opacity
  if (native === "line") {
    const width = style.strokeWidth || Math.max(2, 4 * scale.unit)
    return {
      kind: "shape",
      id: element.id,
      shape: "line",
      options: {
        ...place,
        y: r((element.y + element.height / 2) * scale.inch),
        h: 0,
        line: { color: hex(style.stroke ?? style.fill ?? "#1F2430"), width: r(width * scale.pt, 2), ...(dashType(style.dash) ? { dashType: dashType(style.dash) } : {}), ...(opacity < 1 ? { transparency: Math.round((1 - opacity) * 100) } : {}) },
      },
    }
  }
  const options: PptxShapeOptions = { ...place }
  if (style.fill) {
    const see = transparency(style.fill, opacity)
    options.fill = { color: hex(style.fill), ...(see ? { transparency: see } : {}) }
  } else {
    options.fill = { color: "FFFFFF", transparency: 100 }
  }
  if (style.stroke && style.strokeWidth > 0) {
    options.line = { color: hex(style.stroke), width: r(style.strokeWidth * scale.pt, 2), ...(dashType(style.dash) ? { dashType: dashType(style.dash) } : {}) }
  }
  if (style.shape === "pill") options.rectRadius = r((Math.min(element.width, element.height) / 2) * scale.inch)
  if (style.shape === "rounded") {
    const radius = typeof element.style.borderRadius === "number" ? style.radius : Math.min(element.width, element.height) * 0.12
    options.rectRadius = r(Math.min(radius, Math.min(element.width, element.height) / 2) * scale.inch)
  }
  const shadow = style.fill ? shadowOption(style.shadow, scale, style.fill) : undefined
  if (shadow) options.shadow = shadow
  const label = element.content.trim()
  if (!label) return { kind: "shape", id: element.id, shape: native, options }
  // A labelled shape is a text box drawn in that shape.
  const pad = Math.min(element.width, element.height) * 0.08
  const fitted = layoutText(
    element.content,
    element,
    { font: style.label.font, size: style.label.size, weight: style.label.weight, italic: false, letterSpacing: 0, lineHeight: 1.2, uppercase: false, list: "none", verticalAlign: "middle", fit: "shrink", padding: pad },
    measure,
  )
  const text: PptxTextOptions = {
    ...options,
    shape: native,
    fontFace: PPTX_FONT_FACES[style.label.font],
    fontSize: r(fitted.size * scale.pt, 1),
    color: hex(style.label.color),
    bold: style.label.weight >= 600,
    italic: false,
    align: "center",
    valign: "middle",
    margin: r(pad * scale.pt, 2),
    lineSpacing: r(fitted.lineHeight * scale.pt, 2),
    fit: "none",
    wrap: true,
  }
  return { kind: "text", id: element.id, text: element.content, options: text }
}

function elementOp(element: CanvasElement, scale: Scale, measure: MeasureText): PptxOp {
  if (element.type === "text") return textOp(element, scale, measure)
  if (element.type === "shape") return shapeOp(element, scale, measure)
  // Pictures keep their mask, crop, filter and flips; embeds become their preview card.
  const transparent = element.type !== "image" || String(element.style.mask ?? "none") !== "none" || typeof element.style.borderRadius === "number"
  return { kind: "raster", id: element.id, box: box(element, scale), transparent }
}

function slidePlan(doc: DesignDoc, page: DesignPage, scale: Scale, measure: MeasureText): PptxSlidePlan {
  const ops = [...page.elements]
    .filter((element) => !element.hidden)
    .sort((a, b) => a.z - b.z)
    .map((element) => elementOp(element, scale, measure))
  return {
    pageId: page.id,
    background: hex(page.background, "#FFFFFF"),
    backgroundRaster: page.pattern !== "none",
    hidden: page.hidden,
    notes: page.notes,
    ops,
  }
}

/** The whole deck: slide size in inches, then one slide plan per page. */
export function buildPptxPlan(doc: DesignDoc, options: PptxPlanOptions = {}): PptxPlan {
  const measure = options.measure ?? estimateMeasure
  const inches = pageInches(doc.width, doc.height)
  const inch = inches.width / doc.width
  const scale: Scale = { inch, pt: inch * 72, unit: pageUnit(doc) }
  const pages = doc.pages.filter((page) => options.includeHidden || !page.hidden)
  return {
    title: doc.name,
    layout: { name: `LEARN_${doc.width}x${doc.height}`, width: inches.width, height: inches.height },
    slides: (pages.length ? pages : doc.pages.slice(0, 1)).map((page) => slidePlan(doc, page, scale, measure)),
  }
}
