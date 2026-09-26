/**
 * Page formats a design can take.
 *
 * Sizes are in design pixels, the unit every element coordinate uses. Each
 * format also carries its print size in PDF points and its PowerPoint size in
 * inches, so an export lands on a true A4 page or a true 16:9 slide instead of
 * a guess made from the pixel count.
 *
 * Pure: no DOM, no React.
 */

export type DesignFormatGroup = "presentation" | "document" | "social" | "poster" | "fun"

export type DesignFormatId =
  | "presentation"
  | "presentation-4-3"
  | "a4"
  | "a4-landscape"
  | "letter"
  | "square"
  | "portrait"
  | "story"
  | "poster"
  | "infographic"
  | "thumbnail"
  | "flashcard"
  | "meme"

export interface DesignFormat {
  id: DesignFormatId
  label: string
  group: DesignFormatGroup
  width: number
  height: number
  /** Print size in PDF points (1/72 inch). */
  points: { width: number; height: number }
  description: string
}

const A4_POINTS = { width: 595.28, height: 841.89 }

export const designFormats: readonly DesignFormat[] = [
  { id: "presentation", label: "Presentation 16:9", group: "presentation", width: 1920, height: 1080, points: { width: 960, height: 540 }, description: "Slides for class, a talk or a pitch" },
  { id: "presentation-4-3", label: "Presentation 4:3", group: "presentation", width: 1440, height: 1080, points: { width: 720, height: 540 }, description: "Classic projector slides" },
  { id: "a4", label: "A4 page", group: "document", width: 1240, height: 1754, points: A4_POINTS, description: "Handouts, worksheets and one-pagers" },
  { id: "a4-landscape", label: "A4 landscape", group: "document", width: 1754, height: 1240, points: { width: A4_POINTS.height, height: A4_POINTS.width }, description: "Wide worksheets and comparison pages" },
  { id: "letter", label: "US Letter", group: "document", width: 1275, height: 1650, points: { width: 612, height: 792 }, description: "Printable North American pages" },
  { id: "poster", label: "Poster", group: "poster", width: 1414, height: 2000, points: { width: 841.89, height: 1190.55 }, description: "Classroom posters and big summaries" },
  { id: "infographic", label: "Infographic", group: "poster", width: 1080, height: 2520, points: { width: 810, height: 1890 }, description: "Tall visual explainers and timelines" },
  { id: "square", label: "Square post", group: "social", width: 1080, height: 1080, points: { width: 810, height: 810 }, description: "Cards, recaps and carousel posts" },
  { id: "portrait", label: "Portrait post 4:5", group: "social", width: 1080, height: 1350, points: { width: 810, height: 1012.5 }, description: "Feed posts and quote cards" },
  { id: "story", label: "Story 9:16", group: "social", width: 1080, height: 1920, points: { width: 810, height: 1440 }, description: "Stories and vertical explainers" },
  { id: "thumbnail", label: "Thumbnail 16:9", group: "social", width: 1280, height: 720, points: { width: 960, height: 540 }, description: "Video thumbnails and lesson covers" },
  { id: "flashcard", label: "Flashcard", group: "fun", width: 1500, height: 900, points: { width: 360, height: 216 }, description: "Index-card sized study cards" },
  { id: "meme", label: "Meme", group: "fun", width: 1080, height: 1080, points: { width: 810, height: 810 }, description: "Top text, bottom text, big laughs" },
]

export const designFormatGroups: readonly { id: DesignFormatGroup; label: string }[] = [
  { id: "presentation", label: "Presentations" },
  { id: "document", label: "Documents" },
  { id: "social", label: "Social" },
  { id: "poster", label: "Posters" },
  { id: "fun", label: "Fun" },
]

const formatsById = new Map<string, DesignFormat>(designFormats.map((format) => [format.id, format]))

export const DEFAULT_DESIGN_FORMAT: DesignFormatId = "presentation"

/** Largest page edge a document may use, so a stored size cannot exhaust memory on export. */
export const MAX_PAGE_EDGE = 4000
export const MIN_PAGE_EDGE = 200

export function isDesignFormatId(value: unknown): value is DesignFormatId {
  return typeof value === "string" && formatsById.has(value)
}

export function designFormat(id: unknown): DesignFormat {
  return formatsById.get(typeof id === "string" ? id : "") ?? (formatsById.get(DEFAULT_DESIGN_FORMAT) as DesignFormat)
}

/** The known format with exactly this size, if there is one. */
export function formatForSize(width: number, height: number): DesignFormat | null {
  return designFormats.find((format) => format.width === width && format.height === height) ?? null
}

export type PageOrientation = "landscape" | "portrait" | "square"

export function orientationOf(width: number, height: number): PageOrientation {
  const ratio = width / Math.max(1, height)
  if (ratio >= 1.15) return "landscape"
  if (ratio <= 0.87) return "portrait"
  return "square"
}

/**
 * Print size for any page: a known format's true size, otherwise 0.75pt per
 * design pixel (96 dpi), which is how browsers map CSS pixels to points.
 */
export function pagePoints(width: number, height: number): { width: number; height: number } {
  const known = formatForSize(width, height)
  if (known) return known.points
  return { width: round2(width * 0.75), height: round2(height * 0.75) }
}

/** PowerPoint slide size in inches for a page (PowerPoint caps each side at 56in). */
export function pageInches(width: number, height: number): { width: number; height: number } {
  const points = pagePoints(width, height)
  const scale = Math.min(1, 56 / Math.max(points.width / 72, points.height / 72))
  return { width: round4((points.width / 72) * scale), height: round4((points.height / 72) * scale) }
}

function round2(value: number) {
  return Math.round(value * 100) / 100
}

function round4(value: number) {
  return Math.round(value * 10000) / 10000
}
