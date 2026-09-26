/**
 * The typefaces a design can use.
 *
 * A stored design names fonts by id ("poppins"), never by a CSS stack, so a
 * document stays valid if the way a font is loaded changes, and an unknown id
 * from an old or hostile document falls back to the app's sans face instead of
 * reaching the DOM. The files themselves are loaded by next/font (self-hosted,
 * no third-party request at runtime) in `components/learn/design/design-fonts.ts`,
 * which sets the CSS variables named here.
 *
 * Pure: no DOM, no React.
 */

export type DesignFontId =
  | "sans"
  | "display"
  | "mono"
  | "poppins"
  | "nunito"
  | "space"
  | "playfair"
  | "lora"
  | "dm-serif"
  | "bebas"
  | "anton"
  | "caveat"
  | "pacifico"

export type DesignFontCategory = "sans" | "serif" | "display" | "handwriting" | "mono"

export interface DesignFont {
  id: DesignFontId
  label: string
  category: DesignFontCategory
  /** The CSS variable next/font sets to this face's generated family name. */
  cssVar: string
  /** Used when the variable is missing (tests, server render, a failed font load). */
  fallback: string
  /** Weights the face actually ships; the UI only offers these. */
  weights: readonly number[]
  /**
   * Average glyph advance as a fraction of the font size, for estimating line
   * breaks where no real font metrics exist (server, tests). Condensed faces
   * are narrow, script faces wide.
   */
  widthFactor: number
}

const SANS_FALLBACK = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
const SERIF_FALLBACK = "ui-serif, Georgia, 'Times New Roman', serif"

export const designFonts: readonly DesignFont[] = [
  { id: "sans", label: "Geist", category: "sans", cssVar: "--font-geist-sans", fallback: SANS_FALLBACK, weights: [300, 400, 500, 600, 700, 800, 900], widthFactor: 0.53 },
  { id: "display", label: "Bricolage", category: "display", cssVar: "--font-learn-display", fallback: SANS_FALLBACK, weights: [400, 500, 600, 700, 800], widthFactor: 0.55 },
  { id: "poppins", label: "Poppins", category: "sans", cssVar: "--font-design-poppins", fallback: SANS_FALLBACK, weights: [400, 500, 600, 700, 800], widthFactor: 0.58 },
  { id: "nunito", label: "Nunito", category: "sans", cssVar: "--font-design-nunito", fallback: SANS_FALLBACK, weights: [300, 400, 500, 600, 700, 800, 900], widthFactor: 0.53 },
  { id: "space", label: "Space Grotesk", category: "sans", cssVar: "--font-design-space", fallback: SANS_FALLBACK, weights: [300, 400, 500, 600, 700], widthFactor: 0.56 },
  { id: "playfair", label: "Playfair Display", category: "serif", cssVar: "--font-design-playfair", fallback: SERIF_FALLBACK, weights: [400, 500, 600, 700, 800, 900], widthFactor: 0.52 },
  { id: "lora", label: "Lora", category: "serif", cssVar: "--font-design-lora", fallback: SERIF_FALLBACK, weights: [400, 500, 600, 700], widthFactor: 0.52 },
  { id: "dm-serif", label: "DM Serif Display", category: "serif", cssVar: "--font-design-dm-serif", fallback: SERIF_FALLBACK, weights: [400], widthFactor: 0.5 },
  { id: "bebas", label: "Bebas Neue", category: "display", cssVar: "--font-design-bebas", fallback: "Impact, 'Arial Narrow', sans-serif", weights: [400], widthFactor: 0.4 },
  { id: "anton", label: "Anton", category: "display", cssVar: "--font-design-anton", fallback: "Impact, 'Arial Narrow', sans-serif", weights: [400], widthFactor: 0.47 },
  { id: "caveat", label: "Caveat", category: "handwriting", cssVar: "--font-design-caveat", fallback: "'Comic Sans MS', cursive", weights: [400, 500, 600, 700], widthFactor: 0.42 },
  { id: "pacifico", label: "Pacifico", category: "handwriting", cssVar: "--font-design-pacifico", fallback: "cursive", weights: [400], widthFactor: 0.6 },
  { id: "mono", label: "Geist Mono", category: "mono", cssVar: "--font-geist-mono", fallback: "ui-monospace, 'SFMono-Regular', Menlo, monospace", weights: [400, 500, 600, 700], widthFactor: 0.6 },
]

const fontsById = new Map<string, DesignFont>(designFonts.map((font) => [font.id, font]))

export const DEFAULT_DESIGN_FONT: DesignFontId = "sans"

export function isDesignFontId(value: unknown): value is DesignFontId {
  return typeof value === "string" && fontsById.has(value)
}

export function designFont(id: unknown): DesignFont {
  return fontsById.get(typeof id === "string" ? id : "") ?? (fontsById.get(DEFAULT_DESIGN_FONT) as DesignFont)
}

/** The CSS `font-family` value for a font id: the loaded face first, then its fallback. */
export function designFontStack(id: unknown): string {
  const font = designFont(id)
  return `var(${font.cssVar}), ${font.fallback}`
}

/** The nearest weight the face ships, so "bold" on a single-weight face stays honest. */
export function nearestFontWeight(id: unknown, weight: number): number {
  const weights = designFont(id).weights
  let best = weights[0] ?? 400
  for (const candidate of weights) {
    if (Math.abs(candidate - weight) < Math.abs(best - weight)) best = candidate
  }
  return best
}

/**
 * Line-width estimate without a canvas: good enough for layout decisions on the
 * server and in tests. The editor measures real glyphs in the browser.
 */
export function estimateTextWidth(text: string, fontId: unknown, size: number, weight = 400, letterSpacingEm = 0): number {
  const font = designFont(fontId)
  const boldness = weight >= 700 ? 1.07 : weight >= 600 ? 1.04 : 1
  let units = 0
  for (const character of text) {
    if (character === " ") units += 0.55
    else if (/[ilIj.,:;'!|]/.test(character)) units += 0.55
    else if (/[mwMW@]/.test(character)) units += 1.45
    else if (/[A-Z0-9]/.test(character)) units += 1.18
    else if (/[\u{1F000}-\u{1FAFF}☀-➿]/u.test(character)) units += 2.1
    else units += 1
  }
  return units * font.widthFactor * size * boldness + Math.max(0, text.length - 1) * letterSpacingEm * size
}
