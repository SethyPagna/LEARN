import type { CanvasElement } from "@/lib/studio/canvas-engine"
import { safeColor, safeNumber, sanitizeImageUrl } from "@/lib/studio/canvas-styles"

import { isDesignFontId, nearestFontWeight, type DesignFontId } from "./fonts"
import { isShapeKind, type ShapeKind } from "./shapes"
import type { ListStyle, TextAlign, TextFit, TextLayoutInput, VerticalAlign } from "./text"

/**
 * Typed, validated reads of a design element's `style` record.
 *
 * `style` is stored JSON, so nothing in it is trusted: every renderer (editor,
 * thumbnails, share page, PNG/PDF export, PPTX export) reads it through these
 * functions, which clamp numbers, check colours and enums, and fill defaults.
 * A value the editor refuses is refused everywhere, because there is one reader.
 *
 * Also reads the first canvas format's keys (`backgroundColor`, `borderColor`,
 * `borderWidth`, `borderRadius`) so designs saved before multi-page designs
 * render the same.
 *
 * Pure: no DOM, no React.
 */

export type ShadowKind = "none" | "soft" | "lifted" | "glow"
export type TextEffect = "none" | "shadow" | "lift" | "outline" | "neon" | "highlight"
export type ImageFilter = "none" | "grayscale" | "sepia" | "warm" | "cool" | "vivid" | "fade" | "dark"
export type ImageMask = "none" | "rounded" | "circle" | "blob" | "heart" | "star" | "hexagon" | "arch"
export type StrokeDash = "solid" | "dashed" | "dotted"

export const SHADOW_KINDS: readonly ShadowKind[] = ["none", "soft", "lifted", "glow"]
export const TEXT_EFFECTS: readonly TextEffect[] = ["none", "shadow", "lift", "outline", "neon", "highlight"]
export const IMAGE_FILTERS: readonly ImageFilter[] = ["none", "grayscale", "sepia", "warm", "cool", "vivid", "fade", "dark"]
export const IMAGE_MASKS: readonly ImageMask[] = ["none", "rounded", "circle", "blob", "heart", "star", "hexagon", "arch"]

export const FONT_SIZE_RANGE = { min: 6, max: 800 }

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

function bool(value: unknown): boolean {
  return value === true
}

function num(value: unknown, min: number, max: number, fallback: number): number {
  return safeNumber(value, min, max) ?? fallback
}

export interface DesignBoxStyle {
  /** Box fill behind the content (text box background, image placeholder). */
  background: string | null
  stroke: string | null
  strokeWidth: number
  dash: StrokeDash
  radius: number
  opacity: number
  shadow: ShadowKind
}

export interface DesignTextStyle extends TextLayoutInput, DesignBoxStyle {
  color: string
  align: TextAlign
  underline: boolean
  strike: boolean
  effect: TextEffect
  effectColor: string
}

export interface DesignShapeStyle extends DesignBoxStyle {
  shape: ShapeKind
  fill: string | null
  /** Optional second fill colour: the shape is filled with a linear gradient. */
  fill2: string | null
  gradientAngle: number
  seed: number
  /** A shape can carry a centred label (its `content`). */
  label: { color: string; size: number; weight: number; font: DesignFontId }
}

export interface DesignImageStyle extends DesignBoxStyle {
  fit: "cover" | "contain"
  mask: ImageMask
  filter: ImageFilter
  flipX: boolean
  flipY: boolean
  /** Which point of the picture stays in view when `fit` is cover (0..1). */
  focusX: number
  focusY: number
}

function readBox(style: Record<string, unknown>, defaults: Partial<DesignBoxStyle> = {}): DesignBoxStyle {
  const stroke = safeColor(style.stroke ?? style.borderColor) ?? null
  return {
    background: safeColor(style.backgroundColor ?? style.background) ?? defaults.background ?? null,
    stroke,
    strokeWidth: stroke ? num(style.strokeWidth ?? style.borderWidth, 0, 200, defaults.strokeWidth ?? 0) : 0,
    dash: oneOf(style.dash, ["solid", "dashed", "dotted"] as const, "solid"),
    radius: num(style.borderRadius, 0, 2000, defaults.radius ?? 0),
    opacity: num(style.opacity, 0.02, 1, 1),
    shadow: oneOf(style.shadow, SHADOW_KINDS, defaults.shadow ?? "none"),
  }
}

export function readTextStyle(element: Pick<CanvasElement, "style">): DesignTextStyle {
  const style = element.style ?? {}
  const font: DesignFontId = isDesignFontId(style.fontFamily) ? style.fontFamily : "sans"
  const size = num(style.fontSize, FONT_SIZE_RANGE.min, FONT_SIZE_RANGE.max, 32)
  const weight = nearestFontWeight(font, num(style.fontWeight, 100, 900, 400))
  return {
    ...readBox(style),
    font,
    size,
    weight,
    italic: bool(style.italic),
    underline: bool(style.underline),
    strike: bool(style.strike),
    letterSpacing: num(style.letterSpacing, -0.2, 1.5, 0),
    lineHeight: num(style.lineHeight, 0.7, 3, 1.25),
    uppercase: bool(style.uppercase),
    list: oneOf(style.list, ["none", "bullet", "number", "check"] as const satisfies readonly ListStyle[], "none"),
    verticalAlign: oneOf(style.verticalAlign, ["top", "middle", "bottom"] as const satisfies readonly VerticalAlign[], "top"),
    fit: oneOf(style.fit, ["grow", "shrink", "none"] as const satisfies readonly TextFit[], "grow"),
    padding: num(style.padding, 0, 400, 0),
    paragraphSpacing: num(style.paragraphSpacing, 0, 3, 0),
    color: safeColor(style.color) ?? "#1F2430",
    align: oneOf(style.textAlign, ["left", "center", "right", "justify"] as const satisfies readonly TextAlign[], "left"),
    effect: oneOf(style.effect, TEXT_EFFECTS, "none"),
    effectColor: safeColor(style.effectColor) ?? "#000000",
  }
}

export function readShapeStyle(element: Pick<CanvasElement, "style">): DesignShapeStyle {
  const style = element.style ?? {}
  const box = readBox(style)
  const legacyRadius = safeNumber(style.borderRadius, 0, 2000)
  const shape: ShapeKind = isShapeKind(style.shape) ? style.shape : legacyRadius ? "rounded" : "rect"
  const labelFont: DesignFontId = isDesignFontId(style.fontFamily) ? style.fontFamily : "sans"
  return {
    ...box,
    // A shape's fill is its `fill`, or the first format's `backgroundColor`.
    background: null,
    shape,
    fill: safeColor(style.fill ?? style.backgroundColor ?? style.background) ?? null,
    fill2: safeColor(style.fill2) ?? null,
    gradientAngle: num(style.gradientAngle, -360, 360, 135),
    seed: Math.floor(num(style.seed, 0, 1_000_000, 7)),
    label: {
      color: safeColor(style.color) ?? "#1F2430",
      size: num(style.fontSize, FONT_SIZE_RANGE.min, FONT_SIZE_RANGE.max, 22),
      weight: nearestFontWeight(labelFont, num(style.fontWeight, 100, 900, 600)),
      font: labelFont,
    },
  }
}

export function readImageStyle(element: Pick<CanvasElement, "style">): DesignImageStyle {
  const style = element.style ?? {}
  return {
    ...readBox(style),
    fit: style.fit === "contain" ? "contain" : "cover",
    mask: oneOf(style.mask, IMAGE_MASKS, "none"),
    filter: oneOf(style.filter, IMAGE_FILTERS, "none"),
    flipX: bool(style.flipX),
    flipY: bool(style.flipY),
    focusX: num(style.focusX, 0, 1, 0.5),
    focusY: num(style.focusY, 0, 1, 0.5),
  }
}

/** A stored image source that is safe to put in `src` (same rules as the canvas). */
export function imageSource(element: Pick<CanvasElement, "type" | "content">): string | null {
  if (element.type !== "image") return null
  return sanitizeImageUrl(element.content || "")
}

/** CSS `filter` value for an image filter preset ("" for none). */
export function imageFilterCss(filter: ImageFilter): string {
  switch (filter) {
    case "grayscale":
      return "grayscale(1)"
    case "sepia":
      return "sepia(0.85)"
    case "warm":
      return "sepia(0.25) saturate(1.25) hue-rotate(-8deg)"
    case "cool":
      return "saturate(1.1) hue-rotate(12deg) brightness(1.03)"
    case "vivid":
      return "saturate(1.6) contrast(1.08)"
    case "fade":
      return "contrast(0.85) brightness(1.1) saturate(0.8)"
    case "dark":
      return "brightness(0.62) contrast(1.1)"
    default:
      return ""
  }
}

/**
 * Shadow geometry in design px. Sizes are defined for a 1080px short side and
 * scaled by `unit` (short side / 1080) so a shadow reads the same on a story
 * and on an A4 page.
 */
export function shadowSpec(kind: ShadowKind, unit: number, glowColor = "#5CC8FF"): { x: number; y: number; blur: number; color: string } | null {
  if (kind === "soft") return { x: 0, y: 8 * unit, blur: 24 * unit, color: "rgba(15, 23, 42, 0.18)" }
  if (kind === "lifted") return { x: 0, y: 18 * unit, blur: 40 * unit, color: "rgba(15, 23, 42, 0.3)" }
  if (kind === "glow") return { x: 0, y: 0, blur: 30 * unit, color: withAlpha(glowColor, 0.65) }
  return null
}

// ---------------------------------------------------------------------------
// Colour helpers (hex is the interchange format: PPTX needs it)
// ---------------------------------------------------------------------------

const NAMED: Record<string, string> = {
  white: "#FFFFFF",
  black: "#000000",
  transparent: "#000000",
  red: "#FF0000",
  green: "#008000",
  blue: "#0000FF",
  yellow: "#FFFF00",
  orange: "#FFA500",
  purple: "#800080",
  gray: "#808080",
  grey: "#808080",
  pink: "#FFC0CB",
}

/** Parse #rgb, #rgba, #rrggbb, #rrggbbaa, rgb() and rgba() into channels. */
export function parseColor(value: unknown): { r: number; g: number; b: number; a: number } | null {
  if (typeof value !== "string") return null
  const text = value.trim().toLowerCase()
  const named = NAMED[text]
  if (named) return { ...(parseColor(named) as { r: number; g: number; b: number; a: number }), a: text === "transparent" ? 0 : 1 }
  const hex = /^#([0-9a-f]{3,8})$/.exec(text)
  if (hex) {
    const digits = hex[1]
    if (digits.length === 3 || digits.length === 4) {
      const [r, g, b, a = "f"] = digits.split("")
      return { r: parseInt(r + r, 16), g: parseInt(g + g, 16), b: parseInt(b + b, 16), a: parseInt(a + a, 16) / 255 }
    }
    if (digits.length === 6 || digits.length === 8) {
      return {
        r: parseInt(digits.slice(0, 2), 16),
        g: parseInt(digits.slice(2, 4), 16),
        b: parseInt(digits.slice(4, 6), 16),
        a: digits.length === 8 ? parseInt(digits.slice(6, 8), 16) / 255 : 1,
      }
    }
    return null
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(text)
  if (rgb) {
    const alphaRaw = rgb[4]
    const alpha = alphaRaw === undefined ? 1 : alphaRaw.endsWith("%") ? Number(alphaRaw.slice(0, -1)) / 100 : Number(alphaRaw)
    const channel = (part: string) => Math.max(0, Math.min(255, Math.round(Number(part))))
    return { r: channel(rgb[1]), g: channel(rgb[2]), b: channel(rgb[3]), a: Math.max(0, Math.min(1, Number.isFinite(alpha) ? alpha : 1)) }
  }
  return null
}

/** Six-digit uppercase hex without the alpha channel, or the fallback. */
export function toHex6(value: unknown, fallback = "#000000"): string {
  const color = parseColor(value)
  if (!color) return fallback
  const part = (channel: number) => channel.toString(16).padStart(2, "0").toUpperCase()
  return `#${part(color.r)}${part(color.g)}${part(color.b)}`
}

/** The colour's alpha (1 when opaque or unparseable). */
export function alphaOf(value: unknown): number {
  return parseColor(value)?.a ?? 1
}

export function withAlpha(value: unknown, alpha: number): string {
  const color = parseColor(value) ?? { r: 0, g: 0, b: 0, a: 1 }
  const a = Math.max(0, Math.min(1, alpha)) * color.a
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${Math.round(a * 1000) / 1000})`
}

/** Relative luminance (WCAG) of a colour, 0 (black) to 1 (white). */
export function luminance(value: unknown): number {
  const color = parseColor(value) ?? { r: 255, g: 255, b: 255, a: 1 }
  const channel = (component: number) => {
    const c = component / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b)
}

export function contrastRatio(left: unknown, right: unknown): number {
  const a = luminance(left)
  const b = luminance(right)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/** Black or white, whichever reads better on `background`. */
export function readableOn(background: unknown): "#111111" | "#FFFFFF" {
  return contrastRatio(background, "#111111") >= contrastRatio(background, "#FFFFFF") ? "#111111" : "#FFFFFF"
}

/** Mix two colours in sRGB (t = 0 gives `left`, 1 gives `right`). */
export function mixColors(left: unknown, right: unknown, t: number): string {
  const a = parseColor(left) ?? { r: 255, g: 255, b: 255, a: 1 }
  const b = parseColor(right) ?? { r: 0, g: 0, b: 0, a: 1 }
  const k = Math.max(0, Math.min(1, t))
  const mix = (x: number, y: number) => Math.round(x + (y - x) * k)
  return toHex6(`rgb(${mix(a.r, b.r)}, ${mix(a.g, b.g)}, ${mix(a.b, b.b)})`)
}
