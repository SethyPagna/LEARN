import type { CanvasElement } from "@/lib/studio/canvas-engine"

import type { DesignDoc, DesignPage } from "./document"
import { pageUnit } from "./document"
import { designFont, type DesignFontId } from "./fonts"
import { dashArray, embedLabel, gradientPoints, imagePlacement, patternInk, patternRuleWidth, textEffectSpec } from "./paint"
import { isStrokeOnlyShape, maskPath, patternPaths, shapePath } from "./shapes"
import { imageFilterCss, imageSource, readImageStyle, readShapeStyle, readTextStyle, shadowSpec, type DesignBoxStyle, type DesignImageStyle, type TextEffect } from "./style"
import { layoutText, type MeasureText, type TextAlign, type TextLayoutInput } from "./text"
import { designTheme } from "./themes"

/**
 * Draws a design page onto a 2D canvas: the PNG and PDF exports.
 *
 * It reads elements through the same style readers and lays text out with the
 * same `layoutText` as the editor, so an exported page matches the screen line
 * for line. The context is a small structural interface (a real
 * `CanvasRenderingContext2D` satisfies it), which keeps this module free of the
 * DOM and lets tests record the drawing calls.
 */

export interface RasterGradient {
  addColorStop(offset: number, color: string): void
}

export interface RasterContext {
  save(): void
  restore(): void
  translate(x: number, y: number): void
  rotate(angle: number): void
  scale(x: number, y: number): void
  beginPath(): void
  rect(x: number, y: number, width: number, height: number): void
  clip(path?: never): void
  fill(path?: never): void
  stroke(path?: never): void
  fillRect(x: number, y: number, width: number, height: number): void
  fillText(text: string, x: number, y: number): void
  strokeText(text: string, x: number, y: number): void
  drawImage(image: never, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void
  setLineDash(segments: number[]): void
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): RasterGradient
  measureText(text: string): { width: number; fontBoundingBoxAscent?: number; fontBoundingBoxDescent?: number }
  fillStyle: unknown
  strokeStyle: unknown
  lineWidth: number
  lineJoin: string
  lineCap: string
  globalAlpha: number
  font: string
  textBaseline: string
  textAlign: string
  shadowColor: string
  shadowBlur: number
  shadowOffsetX: number
  shadowOffsetY: number
  filter?: string
}

export interface RasterImage {
  source: unknown
  width: number
  height: number
}

export interface RasterOptions {
  /** Output pixels per design pixel (2 exports a 1920px page at 3840px). */
  scale: number
  /** Builds a path object from SVG path data (`d => new Path2D(d)` in a browser). */
  makePath: (d: string) => unknown
  /** The font-family list for a font id, as the page has it loaded. */
  fontFamily: (font: DesignFontId) => string
  /** Decoded pictures by source URL; a missing one draws as an empty frame. */
  images?: ReadonlyMap<string, RasterImage>
}

type Path = never

/** The CSS font shorthand the canvas draws with (the editor measures with the same string). */
export function canvasFont(family: string, size: number, weight: number, italic: boolean): string {
  return `${italic ? "italic " : ""}${weight} ${Math.max(1, Math.round(size * 100) / 100)}px ${family}`
}

/** A text measurer backed by this context (the export lays text out with it). */
export function contextMeasure(ctx: RasterContext, fontFamily: (font: DesignFontId) => string): MeasureText {
  const cache = new Map<string, number>()
  return (text, font) => {
    const family = fontFamily(font.font)
    const key = `${family}|${font.size}|${font.weight}|${font.italic ? 1 : 0}|${font.letterSpacing}|${text}`
    const cached = cache.get(key)
    if (cached !== undefined) return cached
    ctx.font = canvasFont(family, font.size, font.weight, font.italic)
    const width = ctx.measureText(text).width + Math.max(0, [...text].length - 1) * font.letterSpacing * font.size
    cache.set(key, width)
    return width
  }
}

function applyShadow(ctx: RasterContext, shadow: { x: number; y: number; blur: number; color: string } | null, scale: number): void {
  // Canvas shadows ignore the transform, so they are scaled by hand.
  ctx.shadowColor = shadow ? shadow.color : "rgba(0, 0, 0, 0)"
  ctx.shadowBlur = shadow ? shadow.blur * scale : 0
  ctx.shadowOffsetX = shadow ? shadow.x * scale : 0
  ctx.shadowOffsetY = shadow ? shadow.y * scale : 0
}

function drawBox(ctx: RasterContext, element: CanvasElement, box: DesignBoxStyle, options: RasterOptions, unit: number): void {
  if (!box.background && !(box.stroke && box.strokeWidth > 0)) return
  const path = options.makePath(shapePath(box.radius > 0 ? "rounded" : "rect", element.width, element.height, { radius: box.radius })) as Path
  if (box.background) {
    ctx.save()
    applyShadow(ctx, shadowSpec(box.shadow, unit), options.scale)
    ctx.fillStyle = box.background
    ctx.fill(path)
    ctx.restore()
  }
  if (box.stroke && box.strokeWidth > 0) {
    ctx.save()
    ctx.strokeStyle = box.stroke
    ctx.lineWidth = box.strokeWidth
    ctx.setLineDash(dashArray(box.dash, box.strokeWidth))
    ctx.lineCap = box.dash === "dotted" ? "round" : "butt"
    ctx.stroke(path)
    ctx.restore()
  }
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

interface TextPaint {
  color: string
  align: TextAlign
  underline: boolean
  strike: boolean
  /** Sized from the fitted font size, so a shrunk heading keeps a matching glow. */
  effect: TextEffect
  effectColor: string
}

/** Draw laid-out text inside a box (shared by text elements and shape labels). */
function drawTextLines(ctx: RasterContext, content: string, box: { width: number; height: number }, input: TextLayoutInput, paint: TextPaint, options: RasterOptions, measure: MeasureText): void {
  const layout = layoutText(content, box, input, measure)
  const effect = textEffectSpec(paint.effect, layout.size, paint.effectColor)
  const family = options.fontFamily(input.font)
  ctx.font = canvasFont(family, layout.size, input.weight, input.italic)
  ctx.textBaseline = "alphabetic"
  const metrics = ctx.measureText("Hg")
  const ascent = metrics.fontBoundingBoxAscent ?? layout.size * 0.8
  const descent = metrics.fontBoundingBoxDescent ?? layout.size * 0.2
  const padding = Math.max(0, input.padding)
  const innerWidth = Math.max(1, box.width - padding * 2)
  const textLeft = padding + layout.markerWidth
  const textWidth = Math.max(1, innerWidth - layout.markerWidth)
  const spacing = input.letterSpacing * layout.size

  for (const line of layout.lines) {
    const top = padding + layout.offsetY + line.y
    // CSS centres the font's ascent+descent in the line box; so does this.
    const baseline = top + (layout.lineHeight - (ascent + descent)) / 2 + ascent
    const justify = paint.align === "justify" && !line.last && line.text.includes(" ")
    const lineWidth = line.width
    let x = textLeft
    if (paint.align === "center") x = textLeft + (textWidth - lineWidth) / 2
    else if (paint.align === "right") x = textLeft + textWidth - lineWidth

    if (effect.highlight && line.text) {
      ctx.save()
      ctx.fillStyle = effect.highlight
      const bandTop = top + layout.lineHeight * 0.1
      ctx.fillRect(x - layout.size * 0.15, bandTop, (justify ? textWidth : lineWidth) + layout.size * 0.3, layout.lineHeight * 0.8)
      ctx.restore()
    }

    const drawRun = (mode: "fill" | "stroke") => {
      const draw = (text: string, at: number) => (mode === "fill" ? ctx.fillText(text, at, baseline) : ctx.strokeText(text, at, baseline))
      if (justify) {
        const words = line.text.split(" ")
        const wordsWidth = words.reduce((sum, word) => sum + measure(word, { font: input.font, size: layout.size, weight: input.weight, italic: input.italic, letterSpacing: input.letterSpacing }), 0)
        const gap = (textWidth - wordsWidth) / Math.max(1, words.length - 1)
        let at = textLeft
        for (const word of words) {
          drawSpaced(word, at, draw)
          at += measure(word, { font: input.font, size: layout.size, weight: input.weight, italic: input.italic, letterSpacing: input.letterSpacing }) + gap
        }
        return
      }
      drawSpaced(line.text, x, draw)
    }
    const drawSpaced = (text: string, at: number, draw: (text: string, x: number) => void) => {
      if (!spacing) {
        draw(text, at)
        return
      }
      let cursor = at
      for (const character of text) {
        draw(character, cursor)
        cursor += ctx.measureText(character).width + spacing
      }
    }

    ctx.textAlign = "left"
    if (line.marker) {
      ctx.fillStyle = paint.color
      applyShadow(ctx, null, options.scale)
      ctx.fillText(line.marker, padding, baseline)
    }
    if (effect.outline) {
      ctx.save()
      ctx.strokeStyle = effect.outline.color
      ctx.lineWidth = effect.outline.width * 2
      ctx.lineJoin = "round"
      drawRun("stroke")
      ctx.restore()
    }
    ctx.fillStyle = paint.color
    for (const shadow of effect.shadows) {
      ctx.save()
      applyShadow(ctx, shadow, options.scale)
      drawRun("fill")
      ctx.restore()
    }
    applyShadow(ctx, null, options.scale)
    drawRun("fill")

    if ((paint.underline || paint.strike) && line.text) {
      const thickness = Math.max(1, layout.size * 0.06)
      ctx.fillStyle = paint.color
      if (paint.underline) ctx.fillRect(x, baseline + layout.size * 0.1, justify ? textWidth : lineWidth, thickness)
      if (paint.strike) ctx.fillRect(x, baseline - layout.size * 0.28, justify ? textWidth : lineWidth, thickness)
    }
  }
}

function drawText(ctx: RasterContext, element: CanvasElement, options: RasterOptions, measure: MeasureText, unit: number): void {
  const style = readTextStyle(element)
  drawBox(ctx, element, style, options, unit)
  drawTextLines(ctx, element.content, element, style, { color: style.color, align: style.align, underline: style.underline, strike: style.strike, effect: style.effect, effectColor: style.effectColor }, options, measure)
}

// ---------------------------------------------------------------------------
// Shapes, pictures, embeds
// ---------------------------------------------------------------------------

function drawShape(ctx: RasterContext, element: CanvasElement, options: RasterOptions, measure: MeasureText, unit: number): void {
  const style = readShapeStyle(element)
  const hasRadius = typeof element.style.borderRadius === "number"
  const d = shapePath(style.shape, element.width, element.height, { radius: hasRadius ? style.radius : undefined, seed: style.seed })
  const path = options.makePath(d) as Path
  if (isStrokeOnlyShape(style.shape)) {
    ctx.save()
    ctx.strokeStyle = style.stroke ?? style.fill ?? "#1F2430"
    ctx.lineWidth = style.strokeWidth || Math.max(2, 4 * unit)
    ctx.lineCap = "round"
    ctx.setLineDash(dashArray(style.dash, ctx.lineWidth))
    ctx.stroke(path)
    ctx.restore()
  } else {
    if (style.fill) {
      ctx.save()
      applyShadow(ctx, shadowSpec(style.shadow, unit, style.fill), options.scale)
      if (style.fill2) {
        const points = gradientPoints(style.gradientAngle, element.width, element.height)
        const gradient = ctx.createLinearGradient(points.x1, points.y1, points.x2, points.y2)
        gradient.addColorStop(0, style.fill)
        gradient.addColorStop(1, style.fill2)
        ctx.fillStyle = gradient
      } else {
        ctx.fillStyle = style.fill
      }
      ctx.fill(path)
      ctx.restore()
    }
    if (style.stroke && style.strokeWidth > 0) {
      ctx.save()
      ctx.strokeStyle = style.stroke
      ctx.lineWidth = style.strokeWidth
      ctx.lineJoin = "round"
      ctx.setLineDash(dashArray(style.dash, style.strokeWidth))
      ctx.lineCap = style.dash === "dotted" ? "round" : "butt"
      ctx.stroke(path)
      ctx.restore()
    }
  }
  if (element.content.trim()) {
    const label = style.label
    const pad = Math.min(element.width, element.height) * 0.08
    drawTextLines(
      ctx,
      element.content,
      element,
      { font: label.font, size: label.size, weight: label.weight, italic: false, letterSpacing: 0, lineHeight: 1.2, uppercase: false, list: "none", verticalAlign: "middle", fit: "shrink", padding: pad },
      { color: label.color, align: "center", underline: false, strike: false, effect: "none", effectColor: label.color },
      options,
      measure,
    )
  }
}

function drawImage(ctx: RasterContext, element: CanvasElement, options: RasterOptions, unit: number): void {
  const style = readImageStyle(element)
  const src = imageSource(element)
  const picture = src ? options.images?.get(src) : undefined
  const clipD = maskPath(style.mask, element.width, element.height, style.radius) ?? shapePath("rect", element.width, element.height)
  const clip = options.makePath(clipD) as Path
  if (!picture) {
    ctx.save()
    applyShadow(ctx, shadowSpec(style.shadow, unit), options.scale)
    ctx.fillStyle = style.background ?? "#EEF0F4"
    ctx.fill(clip)
    ctx.restore()
  } else {
    drawPicture(ctx, element, style, picture, clip, options, unit)
  }
  if (style.stroke && style.strokeWidth > 0) {
    ctx.save()
    ctx.strokeStyle = style.stroke
    ctx.lineWidth = style.strokeWidth
    ctx.setLineDash(dashArray(style.dash, style.strokeWidth))
    ctx.lineCap = style.dash === "dotted" ? "round" : "butt"
    ctx.stroke(clip)
    ctx.restore()
  }
}

function drawPicture(ctx: RasterContext, element: CanvasElement, style: DesignImageStyle, picture: RasterImage, clip: Path, options: RasterOptions, unit: number): void {
  if (style.shadow !== "none") {
    ctx.save()
    applyShadow(ctx, shadowSpec(style.shadow, unit), options.scale)
    ctx.fillStyle = style.background ?? "#FFFFFF"
    ctx.fill(clip)
    ctx.restore()
  }
  ctx.save()
  ctx.clip(clip)
  if (style.background) {
    ctx.fillStyle = style.background
    ctx.fill(clip)
  }
  const place = imagePlacement(style.fit, style.focusX, style.focusY, element.width, element.height, picture.width, picture.height)
  if (style.flipX || style.flipY) {
    ctx.translate(style.flipX ? element.width : 0, style.flipY ? element.height : 0)
    ctx.scale(style.flipX ? -1 : 1, style.flipY ? -1 : 1)
  }
  const filter = imageFilterCss(style.filter)
  if (filter && "filter" in ctx) ctx.filter = filter
  ctx.drawImage(picture.source as never, 0, 0, picture.width, picture.height, place.x, place.y, place.width, place.height)
  ctx.restore()
}

function drawEmbed(ctx: RasterContext, element: CanvasElement, options: RasterOptions, measure: MeasureText): void {
  const path = options.makePath(shapePath("rounded", element.width, element.height, { radius: Math.min(element.width, element.height) * 0.06 })) as Path
  ctx.save()
  ctx.fillStyle = "#1F2430"
  ctx.fill(path)
  ctx.restore()
  const size = Math.max(10, Math.min(element.width, element.height) * 0.09)
  drawTextLines(
    ctx,
    embedLabel(element.content),
    element,
    { font: "sans", size, weight: 600, italic: false, letterSpacing: 0, lineHeight: 1.2, uppercase: false, list: "none", verticalAlign: "middle", fit: "shrink", padding: size },
    { color: "#FFFFFF", align: "center", underline: false, strike: false, effect: "none", effectColor: "#FFFFFF" },
    options,
    measure,
  )
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

function drawPattern(ctx: RasterContext, doc: DesignDoc, page: DesignPage, options: RasterOptions): void {
  if (page.pattern === "none") return
  const paths = patternPaths(page.pattern, doc.width, doc.height)
  const ink = patternInk(page.background, designTheme(doc.theme).palette.accent)
  ctx.save()
  if (paths.dots) {
    ctx.fillStyle = ink.dot
    ctx.fill(options.makePath(paths.rules) as Path)
  } else if (paths.rules) {
    ctx.strokeStyle = ink.rule
    ctx.lineWidth = patternRuleWidth(doc.width, doc.height)
    ctx.stroke(options.makePath(paths.rules) as Path)
  }
  if (paths.margin) {
    ctx.strokeStyle = ink.margin
    ctx.lineWidth = patternRuleWidth(doc.width, doc.height) * 1.4
    ctx.stroke(options.makePath(paths.margin) as Path)
  }
  ctx.restore()
}

/** Draw one element in page coordinates (the caller has applied the page scale). */
export function drawDesignElement(ctx: RasterContext, element: CanvasElement, options: RasterOptions, measure: MeasureText, unit: number): void {
  if (element.hidden) return
  const opacity = typeof element.style.opacity === "number" && Number.isFinite(element.style.opacity) ? Math.max(0.02, Math.min(1, element.style.opacity)) : 1
  ctx.save()
  ctx.globalAlpha = opacity
  ctx.translate(element.x + element.width / 2, element.y + element.height / 2)
  if (element.rotation) ctx.rotate((element.rotation * Math.PI) / 180)
  ctx.translate(-element.width / 2, -element.height / 2)
  if (element.type === "text") drawText(ctx, element, options, measure, unit)
  else if (element.type === "shape") drawShape(ctx, element, options, measure, unit)
  else if (element.type === "image") drawImage(ctx, element, options, unit)
  else drawEmbed(ctx, element, options, measure)
  ctx.restore()
}

/**
 * Draw page `pageIndex` of `doc` at `options.scale`. The canvas must be
 * `width * scale` by `height * scale` pixels.
 */
export function drawDesignPage(ctx: RasterContext, doc: DesignDoc, pageIndex: number, options: RasterOptions): void {
  const page = doc.pages[Math.max(0, Math.min(doc.pages.length - 1, pageIndex))]
  if (!page) return
  const measure = contextMeasure(ctx, options.fontFamily)
  const unit = pageUnit(doc)
  ctx.save()
  ctx.scale(options.scale, options.scale)
  ctx.beginPath()
  ctx.rect(0, 0, doc.width, doc.height)
  ctx.clip()
  ctx.fillStyle = page.background
  ctx.fillRect(0, 0, doc.width, doc.height)
  drawPattern(ctx, doc, page, options)
  for (const element of page.elements) drawDesignElement(ctx, element, options, measure, unit)
  ctx.restore()
}

/** Fonts a page uses (for loading them before drawing). */
export function pageFonts(page: DesignPage): DesignFontId[] {
  const fonts = new Set<DesignFontId>()
  for (const element of page.elements) {
    if (element.hidden) continue
    if (element.type === "text") fonts.add(readTextStyle(element).font)
    else if (element.type === "shape" && element.content.trim()) fonts.add(readShapeStyle(element).label.font)
  }
  return [...fonts].filter((font) => designFont(font).id === font)
}

/** Picture sources a design uses (for decoding them before drawing). */
export function designImageSources(doc: DesignDoc, pages?: readonly number[]): string[] {
  const sources = new Set<string>()
  doc.pages.forEach((page, index) => {
    if (pages && !pages.includes(index)) return
    for (const element of page.elements) {
      if (element.hidden || element.type !== "image") continue
      const src = imageSource(element)
      if (src) sources.add(src)
    }
  })
  return [...sources]
}
