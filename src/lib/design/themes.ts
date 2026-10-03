import type { DesignFontId } from "./fonts"

/**
 * Design themes: a palette, a heading/body font pair and a decoration style.
 *
 * Layout output never hard-codes a colour or a font: every element it creates
 * carries a role ("title", "body", "decor-accent", …) and takes its look from
 * the theme through `themeTextStyle` / `themeRoleColor`. That is what lets one
 * click re-theme a finished design without moving anything a person placed.
 *
 * Colours are 6-digit hex so they survive every export target (PPTX needs hex).
 */

export type DesignDecoration = "none" | "blobs" | "notebook" | "grid" | "stripes" | "confetti" | "frame" | "halftone"

export interface DesignPalette {
  /** Page background. */
  background: string
  /** Cards and panels laid on the page. */
  surface: string
  /** Main text. */
  text: string
  /** Secondary text: captions, labels, attributions. */
  muted: string
  /** Headline colour and main shapes. */
  primary: string
  /** A second shape colour. */
  secondary: string
  /** Small highlights: numbers, markers, underlines. */
  accent: string
  /** Text drawn on a `primary` fill. */
  onPrimary: string
}

export interface DesignTheme {
  id: string
  label: string
  palette: DesignPalette
  fonts: { heading: DesignFontId; body: DesignFontId }
  /** Heading weight; single-weight display faces use 400. */
  headingWeight: number
  /** Corner radius for cards, in design units at 1080px. */
  radius: number
  decoration: DesignDecoration
  /** Upper-cases titles (poster and meme faces read better shouting). */
  uppercaseTitles?: boolean
}

export const designThemes: readonly DesignTheme[] = [
  {
    id: "notebook",
    label: "Notebook",
    palette: { background: "#FBF8F1", surface: "#FFFFFF", text: "#1F2430", muted: "#5B6170", primary: "#2F5BD3", secondary: "#F2C14E", accent: "#E4572E", onPrimary: "#FFFFFF" },
    fonts: { heading: "display", body: "sans" },
    headingWeight: 700,
    radius: 24,
    decoration: "notebook",
  },
  {
    id: "midnight",
    label: "Midnight",
    palette: { background: "#0E1528", surface: "#18223D", text: "#E8EDF7", muted: "#9AA6C2", primary: "#5CC8FF", secondary: "#7C5CFF", accent: "#FF6FB5", onPrimary: "#0E1528" },
    fonts: { heading: "space", body: "sans" },
    headingWeight: 700,
    radius: 28,
    decoration: "blobs",
  },
  {
    id: "sunset",
    label: "Sunset",
    palette: { background: "#FFF3E8", surface: "#FFFFFF", text: "#3A1C2A", muted: "#7A5563", primary: "#F2545B", secondary: "#FFB443", accent: "#6A4C93", onPrimary: "#FFFFFF" },
    fonts: { heading: "poppins", body: "nunito" },
    headingWeight: 800,
    radius: 32,
    decoration: "blobs",
  },
  {
    id: "forest",
    label: "Forest",
    palette: { background: "#F2F6EF", surface: "#FFFFFF", text: "#1C3326", muted: "#52675A", primary: "#2F7D4F", secondary: "#A3C586", accent: "#E9A23B", onPrimary: "#FFFFFF" },
    fonts: { heading: "playfair", body: "lora" },
    headingWeight: 700,
    radius: 16,
    decoration: "frame",
  },
  {
    id: "pop",
    label: "Bold pop",
    palette: { background: "#FFE14D", surface: "#FFFFFF", text: "#141414", muted: "#3D3D3D", primary: "#141414", secondary: "#FF4FA3", accent: "#2E6BFF", onPrimary: "#FFE14D" },
    fonts: { heading: "bebas", body: "poppins" },
    headingWeight: 400,
    radius: 8,
    decoration: "halftone",
    uppercaseTitles: true,
  },
  {
    id: "chalkboard",
    label: "Chalkboard",
    palette: { background: "#1F3A30", surface: "#28483C", text: "#F4F1E8", muted: "#BFD3C6", primary: "#FFE08A", secondary: "#9CC9FF", accent: "#FF9E80", onPrimary: "#1F3A30" },
    fonts: { heading: "caveat", body: "nunito" },
    headingWeight: 700,
    radius: 12,
    decoration: "frame",
  },
  {
    id: "minimal",
    label: "Minimal",
    palette: { background: "#FFFFFF", surface: "#F4F5F7", text: "#111827", muted: "#6B7280", primary: "#111827", secondary: "#E5E7EB", accent: "#4F46E5", onPrimary: "#FFFFFF" },
    fonts: { heading: "sans", body: "sans" },
    headingWeight: 700,
    radius: 12,
    decoration: "none",
  },
  {
    id: "ocean",
    label: "Ocean",
    palette: { background: "#E6F4FB", surface: "#FFFFFF", text: "#0B3954", muted: "#48708A", primary: "#087CA7", secondary: "#9BD4E4", accent: "#F28C28", onPrimary: "#FFFFFF" },
    fonts: { heading: "poppins", body: "sans" },
    headingWeight: 700,
    radius: 28,
    decoration: "stripes",
  },
  {
    id: "candy",
    label: "Candy",
    palette: { background: "#FFF0F7", surface: "#FFFFFF", text: "#4A0F3A", muted: "#8A4F77", primary: "#D6246E", secondary: "#8B5CF6", accent: "#FFB020", onPrimary: "#FFFFFF" },
    fonts: { heading: "pacifico", body: "nunito" },
    headingWeight: 400,
    radius: 36,
    decoration: "confetti",
  },
  {
    id: "retro",
    label: "Retro",
    palette: { background: "#F3E7D3", surface: "#FBF4E8", text: "#2B2118", muted: "#6E5B48", primary: "#C8553D", secondary: "#2A7F62", accent: "#F2A541", onPrimary: "#FBF4E8" },
    fonts: { heading: "dm-serif", body: "space" },
    headingWeight: 400,
    radius: 20,
    decoration: "grid",
  },
  {
    id: "meme",
    label: "Meme classic",
    palette: { background: "#101010", surface: "#1E1E1E", text: "#FFFFFF", muted: "#D4D4D4", primary: "#FFFFFF", secondary: "#3A3A3A", accent: "#FFD400", onPrimary: "#101010" },
    fonts: { heading: "anton", body: "sans" },
    headingWeight: 400,
    radius: 0,
    decoration: "none",
    uppercaseTitles: true,
  },
]

const themesById = new Map(designThemes.map((theme) => [theme.id, theme]))

export const DEFAULT_DESIGN_THEME = "notebook"

export function designTheme(id: unknown): DesignTheme {
  return themesById.get(typeof id === "string" ? id : "") ?? (themesById.get(DEFAULT_DESIGN_THEME) as DesignTheme)
}

/**
 * Roles a layout assigns. Text roles pick a font and colour; shape roles pick
 * a fill. Anything a person adds by hand has no role and keeps its own look.
 */
export type TextRole =
  | "title"
  | "subtitle"
  | "kicker"
  | "heading"
  | "body"
  | "bullets"
  | "caption"
  | "quote"
  | "attribution"
  | "stat-value"
  | "stat-label"
  | "label"
  | "number"
  | "choice"
  | "meme"
  | "on-primary"

export type ShapeRole = "decor-primary" | "decor-secondary" | "decor-accent" | "decor-soft" | "card" | "card-primary" | "divider" | "marker"

export interface ThemeTextStyle {
  font: DesignFontId
  weight: number
  color: string
  uppercase: boolean
  italic: boolean
}

/**
 * What a text element sits on. Text on a `primary` fill (a section page, a
 * number badge, a filled card) takes the theme's on-primary colour so it stays
 * readable when the theme changes; `page` and `card` use the normal colours.
 */
export type TextSurface = "page" | "card" | "primary"

export function isTextSurface(value: unknown): value is TextSurface {
  return value === "page" || value === "card" || value === "primary"
}

export type PaletteKey = keyof DesignPalette

export const PALETTE_KEYS: readonly PaletteKey[] = ["background", "surface", "text", "muted", "primary", "secondary", "accent", "onPrimary"]

export function isPaletteKey(value: unknown): value is PaletteKey {
  return typeof value === "string" && (PALETTE_KEYS as readonly string[]).includes(value)
}

export function paletteColor(theme: DesignTheme, key: PaletteKey): string {
  return theme.palette[key]
}

export function themeTextStyle(theme: DesignTheme, role: TextRole, surface: TextSurface = "page"): ThemeTextStyle {
  const style = baseTextStyle(theme, role)
  if (surface === "primary" && role !== "meme") return { ...style, color: theme.palette.onPrimary }
  return style
}

function baseTextStyle(theme: DesignTheme, role: TextRole): ThemeTextStyle {
  const { palette, fonts } = theme
  const heading = { font: fonts.heading, weight: theme.headingWeight, italic: false }
  const body = { font: fonts.body, weight: 400, italic: false }
  switch (role) {
    case "title":
      return { ...heading, color: palette.text, uppercase: Boolean(theme.uppercaseTitles) }
    case "heading":
      return { ...heading, color: palette.text, uppercase: Boolean(theme.uppercaseTitles) }
    case "subtitle":
      return { ...body, weight: 500, color: palette.muted, uppercase: false }
    case "kicker":
      return { ...body, weight: 700, color: palette.primary, uppercase: true }
    case "quote":
      return { ...heading, color: palette.text, uppercase: false, italic: theme.fonts.heading === "playfair" || theme.fonts.heading === "dm-serif" }
    case "attribution":
    case "caption":
      return { ...body, weight: 500, color: palette.muted, uppercase: false }
    case "stat-value":
      return { ...heading, color: palette.primary, uppercase: false }
    case "stat-label":
    case "label":
      return { ...body, weight: 600, color: palette.muted, uppercase: false }
    case "number":
      return { ...heading, color: palette.onPrimary, uppercase: false }
    case "on-primary":
      return { ...body, weight: 600, color: palette.onPrimary, uppercase: false }
    case "choice":
      return { ...body, weight: 600, color: palette.text, uppercase: false }
    case "meme":
      return { font: "anton", weight: 400, italic: false, color: "#FFFFFF", uppercase: true }
    case "body":
    case "bullets":
    default:
      return { ...body, color: palette.text, uppercase: false }
  }
}

/**
 * How cards (panels behind bullets, stats, choices…) are drawn in a theme:
 * lifted with a soft shadow, outlined like a sticker, or flat. Layout-made
 * cards are tagged `look: "card"`, so switching theme restyles them too.
 */
export interface CardLook {
  shadow: "none" | "soft" | "lifted"
  strokeRole: PaletteKey | null
  /** Outline width at a 1080px short side. */
  strokeWidth: number
}

export function themeCardLook(theme: DesignTheme): CardLook {
  switch (theme.decoration) {
    case "halftone":
      return { shadow: "none", strokeRole: "text", strokeWidth: 5 }
    case "grid":
      return { shadow: "none", strokeRole: "text", strokeWidth: 3 }
    case "frame":
      return { shadow: "none", strokeRole: "muted", strokeWidth: 2 }
    case "none":
      return { shadow: "none", strokeRole: null, strokeWidth: 0 }
    default:
      return { shadow: "soft", strokeRole: null, strokeWidth: 0 }
  }
}

export function themeShapeFill(theme: DesignTheme, role: ShapeRole): string {
  const { palette } = theme
  switch (role) {
    case "decor-primary":
    case "card-primary":
    case "marker":
      return palette.primary
    case "decor-secondary":
      return palette.secondary
    case "decor-accent":
      return palette.accent
    case "decor-soft":
      return palette.secondary
    case "divider":
      return palette.muted
    case "card":
    default:
      return palette.surface
  }
}

export function isTextRole(value: unknown): value is TextRole {
  return typeof value === "string" && TEXT_ROLES.has(value as TextRole)
}

export function isShapeRole(value: unknown): value is ShapeRole {
  return typeof value === "string" && SHAPE_ROLES.has(value as ShapeRole)
}

const TEXT_ROLES = new Set<TextRole>(["title", "subtitle", "kicker", "heading", "body", "bullets", "caption", "quote", "attribution", "stat-value", "stat-label", "label", "number", "choice", "meme", "on-primary"])
const SHAPE_ROLES = new Set<ShapeRole>(["decor-primary", "decor-secondary", "decor-accent", "decor-soft", "card", "card-primary", "divider", "marker"])
