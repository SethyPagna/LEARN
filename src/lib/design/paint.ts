import type { StrokeDash, TextEffect } from "./style"
import { readableOn, withAlpha } from "./style"

/**
 * Paint decisions shared by the DOM renderer (editor, thumbnails, share page)
 * and the canvas renderer (PNG/PDF export), so both draw the same gradient,
 * dash, text effect and picture crop from one set of numbers.
 *
 * Pure: no DOM, no React.
 */

/**
 * End points of a linear gradient at a CSS angle (0deg points up, 90deg right)
 * across a w x h box, in the box's own coordinates. These are the points CSS
 * `linear-gradient(<angle>, …)` uses, so SVG and canvas gradients match it.
 */
export function gradientPoints(angle: number, width: number, height: number): { x1: number; y1: number; x2: number; y2: number } {
  const radians = (angle * Math.PI) / 180
  const dx = Math.sin(radians)
  const dy = -Math.cos(radians)
  const half = Math.abs((width / 2) * dx) + Math.abs((height / 2) * dy)
  const cx = width / 2
  const cy = height / 2
  return { x1: round(cx - dx * half), y1: round(cy - dy * half), x2: round(cx + dx * half), y2: round(cy + dy * half) }
}

/** Dash pattern for a stroke (empty for solid). Dotted strokes need round caps. */
export function dashArray(dash: StrokeDash, strokeWidth: number): number[] {
  const width = Math.max(1, strokeWidth)
  if (dash === "dashed") return [round(width * 3), round(width * 2.2)]
  if (dash === "dotted") return [0, round(width * 2)]
  return []
}

export interface TextShadowLayer {
  x: number
  y: number
  blur: number
  color: string
}

export interface TextEffectSpec {
  shadows: TextShadowLayer[]
  /** Outline drawn under the fill: the stroke is twice this wide, the fill covers the inner half. */
  outline: { width: number; color: string } | null
  /** Marker-pen band behind each line. */
  highlight: string | null
}

/** What a text effect draws, in design px for a given font size. */
export function textEffectSpec(effect: TextEffect, size: number, color: string): TextEffectSpec {
  switch (effect) {
    case "shadow":
      return { shadows: [{ x: round(size * 0.04), y: round(size * 0.06), blur: round(size * 0.1), color: withAlpha(color, 0.45) }], outline: null, highlight: null }
    case "lift":
      return { shadows: [{ x: 0, y: round(size * 0.08), blur: round(size * 0.28), color: withAlpha(color, 0.35) }], outline: null, highlight: null }
    case "neon":
      return {
        shadows: [
          { x: 0, y: 0, blur: round(size * 0.08), color: withAlpha(color, 0.95) },
          { x: 0, y: 0, blur: round(size * 0.22), color: withAlpha(color, 0.8) },
          { x: 0, y: 0, blur: round(size * 0.5), color: withAlpha(color, 0.6) },
        ],
        outline: null,
        highlight: null,
      }
    case "outline":
      return { shadows: [], outline: { width: round(Math.max(1, size * 0.07)), color }, highlight: null }
    case "highlight":
      return { shadows: [], outline: null, highlight: color }
    default:
      return { shadows: [], outline: null, highlight: null }
  }
}

/** Where a picture lands in its box for `cover` / `contain`, keeping the focus point in view. */
export function imagePlacement(fit: "cover" | "contain", focusX: number, focusY: number, boxWidth: number, boxHeight: number, imageWidth: number, imageHeight: number): { x: number; y: number; width: number; height: number } {
  const iw = Math.max(1, imageWidth)
  const ih = Math.max(1, imageHeight)
  const scale = fit === "cover" ? Math.max(boxWidth / iw, boxHeight / ih) : Math.min(boxWidth / iw, boxHeight / ih)
  const width = iw * scale
  const height = ih * scale
  const x = fit === "cover" ? (boxWidth - width) * focusX : (boxWidth - width) / 2
  const y = fit === "cover" ? (boxHeight - height) * focusY : (boxHeight - height) / 2
  return { x: round(x), y: round(y), width: round(width), height: round(height) }
}

/** Ink for a page pattern: faint rules that read on the page's own background. */
export function patternInk(background: string, accent: string): { rule: string; margin: string; dot: string } {
  const ink = readableOn(background)
  return { rule: withAlpha(ink, 0.1), margin: withAlpha(accent, 0.45), dot: withAlpha(ink, 0.2) }
}

/** Stroke width of pattern rules for a page (0.12% of the short side, at least 1px). */
export function patternRuleWidth(width: number, height: number): number {
  return Math.max(1, round((Math.min(width, height) / 100) * 0.12))
}

/** The label an embed card shows: its site's host name. */
export function embedLabel(content: string): string {
  let host = "Embedded media"
  try {
    host = new URL(content).hostname.replace(/^www\./, "") || host
  } catch {
    // Keep the generic label.
  }
  return `▶  ${host}`
}

function round(value: number): number {
  // `|| 0` folds -0 into 0 so equal geometry serialises identically.
  return Math.round(value * 100) / 100 || 0
}
