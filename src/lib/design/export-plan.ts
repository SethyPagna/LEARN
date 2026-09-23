import type { CanvasElement } from "@/lib/studio/canvas-engine"

import type { DesignDoc, DesignPage } from "./document"
import { readImageStyle, readShapeStyle, readTextStyle, shadowSpec } from "./style"
import type { FontSpec } from "./text"

/**
 * The pure half of exporting a design: which pages go out, at what pixel
 * size, which faces must be loaded first, how much room a single element's
 * picture needs, and what the files are called. The browser half
 * (components/learn/design/design-export.ts) draws, encodes and downloads.
 */

export type DesignExportFormat = "png" | "jpg" | "pdf" | "pptx" | "json"
export type ExportQuality = "standard" | "high"

export const DESIGN_EXPORT_FORMATS: readonly DesignExportFormat[] = ["png", "jpg", "pdf", "pptx", "json"]

/** Longest output edge, in pixels, per quality. */
const LONG_EDGE: Record<ExportQuality, number> = { standard: 2880, high: 4800 }
const MAX_SCALE: Record<ExportQuality, number> = { standard: 2, high: 4 }
/** Safari refuses canvases above 16.7M pixels; stay under it everywhere. */
const MAX_AREA = 16_000_000

/** Output pixels per design pixel for a page picture. */
export function exportPixelScale(width: number, height: number, quality: ExportQuality = "standard"): number {
  const w = Math.max(1, width)
  const h = Math.max(1, height)
  const byEdge = LONG_EDGE[quality] / Math.max(w, h)
  const byArea = Math.sqrt(MAX_AREA / (w * h))
  return Math.max(0.1, Math.min(MAX_SCALE[quality], byEdge, byArea))
}

/** Pixel scale for one element's picture inside a PowerPoint slide. */
export function rasterPixelScale(width: number, height: number): number {
  return Math.max(0.25, Math.min(2, 2048 / Math.max(1, width, height)))
}

/**
 * The pages to export, in order. An explicit choice is honoured as long as it
 * names real pages; otherwise every visible page goes, or every page when all
 * of them are hidden (an export is never empty).
 */
export function exportPageIndices(doc: Pick<DesignDoc, "pages">, requested?: readonly number[]): number[] {
  if (requested?.length) {
    const chosen = [...new Set(requested)].filter((index) => Number.isInteger(index) && index >= 0 && index < doc.pages.length).sort((a, b) => a - b)
    if (chosen.length) return chosen
  }
  const visible = doc.pages.flatMap((page, index) => (page.hidden ? [] : [index]))
  return visible.length ? visible : doc.pages.map((_, index) => index)
}

/**
 * A file name stem from a design's name. Letters of any script survive
 * (a Khmer or Thai title stays readable); everything a file system could
 * object to becomes a dash.
 */
export function designFileBase(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
  const short = Array.from(slug).slice(0, 60).join("").replace(/-+$/, "")
  return short || "design"
}

/** `lesson-03.png`: numbered by the page's place in the design, padded so files sort. */
export function pageFileName(base: string, pageIndex: number, pageCount: number, extension: string): string {
  const digits = Math.max(2, String(Math.max(1, pageCount)).length)
  return `${base}-${String(pageIndex + 1).padStart(digits, "0")}.${extension}`
}

export type ExportFontSpec = Pick<FontSpec, "font" | "weight" | "italic">

/**
 * Every face, weight and slant the given pages draw text with. Canvas drawing
 * never downloads a font by itself, so these are loaded before the first page
 * is drawn; otherwise the export would silently use the fallback face.
 */
export function exportFontSpecs(pages: readonly DesignPage[]): ExportFontSpec[] {
  const specs = new Map<string, ExportFontSpec>()
  const add = (spec: ExportFontSpec) => specs.set(`${spec.font}|${spec.weight}|${spec.italic ? 1 : 0}`, spec)
  for (const page of pages) {
    for (const element of page.elements) {
      if (element.hidden) continue
      if (element.type === "text") {
        const style = readTextStyle(element)
        add({ font: style.font, weight: style.weight, italic: style.italic })
      } else if (element.type === "shape" && element.content.trim()) {
        const label = readShapeStyle(element).label
        add({ font: label.font, weight: label.weight, italic: false })
      } else if (element.type === "embed") {
        add({ font: "sans", weight: 600, italic: false })
      }
    }
  }
  return [...specs.values()]
}

/**
 * Room, in design pixels, that one element's picture needs around its box:
 * a shadow and the outer half of a stroke are drawn outside it, and a
 * picture cut to the box would clip them.
 */
export function rasterPadding(element: CanvasElement, unit: number): number {
  if (element.type !== "image" && element.type !== "shape") return 0
  const style = element.type === "image" ? readImageStyle(element) : readShapeStyle(element)
  const shadow = shadowSpec(style.shadow, unit)
  const shadowRoom = shadow ? Math.abs(shadow.x) + Math.abs(shadow.y) + shadow.blur : 0
  const strokeRoom = style.stroke && style.strokeWidth > 0 ? style.strokeWidth / 2 + 1 : 0
  return Math.ceil(shadowRoom + strokeRoom)
}

/**
 * Whether an element's picture may be a JPEG (a quarter of a PNG's size for
 * photos): only an unmasked, fully opaque picture that fills exactly its box.
 */
export function rasterCanBeJpeg(element: CanvasElement, transparent: boolean, padding: number): boolean {
  if (element.type !== "image" || transparent || padding > 0) return false
  const style = readImageStyle(element)
  return style.opacity >= 1 && (style.fit === "cover" || Boolean(style.background))
}
