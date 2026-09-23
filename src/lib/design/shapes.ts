/**
 * Shape geometry for design elements, as SVG path data.
 *
 * One path string serves every renderer: the editor draws it in an `<svg>`,
 * the PNG/PDF export draws it with `new Path2D(path)`, and the thumbnails reuse
 * the editor's component. A shape therefore looks identical on screen and in
 * the exported file.
 *
 * Paths are in the element's own box: (0,0) is its top-left, (width,height)
 * its bottom-right, before rotation.
 *
 * Pure: no DOM, no React.
 */

export type ShapeKind =
  | "rect"
  | "rounded"
  | "pill"
  | "ellipse"
  | "triangle"
  | "diamond"
  | "pentagon"
  | "hexagon"
  | "star"
  | "burst"
  | "heart"
  | "arrow"
  | "chevron"
  | "speech"
  | "cross"
  | "blob"
  | "wave"
  | "line"
  | "dots"

export const SHAPE_KINDS: readonly ShapeKind[] = [
  "rect",
  "rounded",
  "pill",
  "ellipse",
  "triangle",
  "diamond",
  "pentagon",
  "hexagon",
  "star",
  "burst",
  "heart",
  "arrow",
  "chevron",
  "speech",
  "cross",
  "blob",
  "wave",
  "line",
  "dots",
]

export const SHAPE_LABELS: Record<ShapeKind, string> = {
  rect: "Square",
  rounded: "Rounded",
  pill: "Pill",
  ellipse: "Circle",
  triangle: "Triangle",
  diamond: "Diamond",
  pentagon: "Pentagon",
  hexagon: "Hexagon",
  star: "Star",
  burst: "Badge",
  heart: "Heart",
  arrow: "Arrow",
  chevron: "Chevron",
  speech: "Speech bubble",
  cross: "Plus",
  blob: "Blob",
  wave: "Wave",
  line: "Line",
  dots: "Dots",
}

const SHAPE_SET = new Set<string>(SHAPE_KINDS)

export function isShapeKind(value: unknown): value is ShapeKind {
  return typeof value === "string" && SHAPE_SET.has(value)
}

/** Shapes drawn as a stroke only (a filled line would be invisible). */
export function isStrokeOnlyShape(kind: ShapeKind): boolean {
  return kind === "line"
}

export interface ShapePathOptions {
  /** Corner radius for `rounded` and `speech`, in px. */
  radius?: number
  /** Seed for organic shapes (`blob`), so a stored blob keeps its outline. */
  seed?: number
}

const MAX_DOTS = 400

function n(value: number): string {
  // Two decimals keep path strings short and byte-stable across runs.
  const rounded = Math.round(value * 100) / 100
  return Object.is(rounded, -0) ? "0" : String(rounded)
}

function polygon(points: { x: number; y: number }[]): string {
  if (!points.length) return ""
  return `M${points.map((point) => `${n(point.x)} ${n(point.y)}`).join(" L")} Z`
}

function regularPolygon(width: number, height: number, sides: number, rotationDeg = -90): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = []
  for (let index = 0; index < sides; index += 1) {
    const angle = ((rotationDeg + (360 / sides) * index) * Math.PI) / 180
    points.push({ x: width / 2 + (width / 2) * Math.cos(angle), y: height / 2 + (height / 2) * Math.sin(angle) })
  }
  return points
}

function starPoints(width: number, height: number, tips: number, innerRatio: number): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = []
  for (let index = 0; index < tips * 2; index += 1) {
    const angle = ((-90 + (180 / tips) * index) * Math.PI) / 180
    const ratio = index % 2 === 0 ? 1 : innerRatio
    points.push({ x: width / 2 + (width / 2) * ratio * Math.cos(angle), y: height / 2 + (height / 2) * ratio * Math.sin(angle) })
  }
  return points
}

function roundedRect(width: number, height: number, radius: number): string {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2))
  if (r <= 0) return `M0 0 H${n(width)} V${n(height)} H0 Z`
  return [
    `M${n(r)} 0`,
    `H${n(width - r)}`,
    `A${n(r)} ${n(r)} 0 0 1 ${n(width)} ${n(r)}`,
    `V${n(height - r)}`,
    `A${n(r)} ${n(r)} 0 0 1 ${n(width - r)} ${n(height)}`,
    `H${n(r)}`,
    `A${n(r)} ${n(r)} 0 0 1 0 ${n(height - r)}`,
    `V${n(r)}`,
    `A${n(r)} ${n(r)} 0 0 1 ${n(r)} 0`,
    "Z",
  ].join(" ")
}

/** A small deterministic PRNG (mulberry32), so seeded shapes never change. */
export function seededRandom(seed: number): () => number {
  let state = Math.floor(seed) >>> 0 || 0x9e3779b9
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function blob(width: number, height: number, seed: number): string {
  const random = seededRandom(seed)
  const count = 8
  const points = Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2
    const radius = 0.78 + random() * 0.22
    return { x: width / 2 + (width / 2) * radius * Math.cos(angle), y: height / 2 + (height / 2) * radius * Math.sin(angle) }
  })
  // Closed Catmull-Rom spline through the points, written as cubic Béziers.
  const segments: string[] = [`M${n(points[0].x)} ${n(points[0].y)}`]
  for (let index = 0; index < count; index += 1) {
    const p0 = points[(index - 1 + count) % count]
    const p1 = points[index]
    const p2 = points[(index + 1) % count]
    const p3 = points[(index + 2) % count]
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 }
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 }
    segments.push(`C${n(c1.x)} ${n(c1.y)} ${n(c2.x)} ${n(c2.y)} ${n(p2.x)} ${n(p2.y)}`)
  }
  segments.push("Z")
  return segments.join(" ")
}

function dots(width: number, height: number): string {
  const spacing = Math.max(8, Math.sqrt((width * height) / MAX_DOTS))
  const radius = spacing * 0.22
  const columns = Math.max(1, Math.floor(width / spacing))
  const rows = Math.max(1, Math.floor(height / spacing))
  const offsetX = (width - (columns - 1) * spacing) / 2
  const offsetY = (height - (rows - 1) * spacing) / 2
  const parts: string[] = []
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const cx = offsetX + column * spacing
      const cy = offsetY + row * spacing
      parts.push(`M${n(cx - radius)} ${n(cy)} A${n(radius)} ${n(radius)} 0 1 0 ${n(cx + radius)} ${n(cy)} A${n(radius)} ${n(radius)} 0 1 0 ${n(cx - radius)} ${n(cy)} Z`)
    }
  }
  return parts.join(" ")
}

/** SVG path data for a shape filling a `width` x `height` box. */
export function shapePath(kind: ShapeKind, width: number, height: number, options: ShapePathOptions = {}): string {
  const w = Math.max(1, width)
  const h = Math.max(1, height)
  switch (kind) {
    case "rect":
      return roundedRect(w, h, 0)
    case "rounded":
      return roundedRect(w, h, options.radius ?? Math.min(w, h) * 0.12)
    case "pill":
      return roundedRect(w, h, Math.min(w, h) / 2)
    case "ellipse":
      return `M0 ${n(h / 2)} A${n(w / 2)} ${n(h / 2)} 0 1 0 ${n(w)} ${n(h / 2)} A${n(w / 2)} ${n(h / 2)} 0 1 0 0 ${n(h / 2)} Z`
    case "triangle":
      return polygon([
        { x: w / 2, y: 0 },
        { x: w, y: h },
        { x: 0, y: h },
      ])
    case "diamond":
      return polygon([
        { x: w / 2, y: 0 },
        { x: w, y: h / 2 },
        { x: w / 2, y: h },
        { x: 0, y: h / 2 },
      ])
    case "pentagon":
      return polygon(regularPolygon(w, h, 5))
    case "hexagon":
      return polygon(regularPolygon(w, h, 6, 0))
    case "star":
      return polygon(starPoints(w, h, 5, 0.42))
    case "burst":
      return polygon(starPoints(w, h, 12, 0.78))
    case "heart": {
      const x = (value: number) => n(value * w)
      const y = (value: number) => n(value * h)
      return [
        `M${x(0.5)} ${y(1)}`,
        `C${x(0.2)} ${y(0.78)} 0 ${y(0.56)} 0 ${y(0.32)}`,
        `C0 ${y(0.14)} ${x(0.14)} 0 ${x(0.3)} 0`,
        `C${x(0.4)} 0 ${x(0.47)} ${y(0.05)} ${x(0.5)} ${y(0.14)}`,
        `C${x(0.53)} ${y(0.05)} ${x(0.6)} 0 ${x(0.7)} 0`,
        `C${x(0.86)} 0 ${x(1)} ${y(0.14)} ${x(1)} ${y(0.32)}`,
        `C${x(1)} ${y(0.56)} ${x(0.8)} ${y(0.78)} ${x(0.5)} ${y(1)}`,
        "Z",
      ].join(" ")
    }
    case "arrow": {
      const head = Math.min(h * 0.62, w * 0.45)
      return polygon([
        { x: 0, y: h * 0.3 },
        { x: w - head, y: h * 0.3 },
        { x: w - head, y: 0 },
        { x: w, y: h / 2 },
        { x: w - head, y: h },
        { x: w - head, y: h * 0.7 },
        { x: 0, y: h * 0.7 },
      ])
    }
    case "chevron": {
      const depth = Math.min(h / 2, w / 3)
      return polygon([
        { x: 0, y: 0 },
        { x: w - depth, y: 0 },
        { x: w, y: h / 2 },
        { x: w - depth, y: h },
        { x: 0, y: h },
        { x: depth, y: h / 2 },
      ])
    }
    case "speech": {
      const bodyHeight = h * 0.8
      const r = Math.max(0, Math.min(options.radius ?? Math.min(w, bodyHeight) * 0.18, w / 2, bodyHeight / 2))
      return [
        `M${n(r)} 0`,
        `H${n(w - r)}`,
        `A${n(r)} ${n(r)} 0 0 1 ${n(w)} ${n(r)}`,
        `V${n(bodyHeight - r)}`,
        `A${n(r)} ${n(r)} 0 0 1 ${n(w - r)} ${n(bodyHeight)}`,
        `H${n(w * 0.36)}`,
        `L${n(w * 0.16)} ${n(h)}`,
        `L${n(w * 0.2)} ${n(bodyHeight)}`,
        `H${n(r)}`,
        `A${n(r)} ${n(r)} 0 0 1 0 ${n(bodyHeight - r)}`,
        `V${n(r)}`,
        `A${n(r)} ${n(r)} 0 0 1 ${n(r)} 0`,
        "Z",
      ].join(" ")
    }
    case "cross": {
      const t = Math.min(w, h) * 0.34
      const x0 = (w - t) / 2
      const x1 = (w + t) / 2
      const y0 = (h - t) / 2
      const y1 = (h + t) / 2
      return polygon([
        { x: x0, y: 0 },
        { x: x1, y: 0 },
        { x: x1, y: y0 },
        { x: w, y: y0 },
        { x: w, y: y1 },
        { x: x1, y: y1 },
        { x: x1, y: h },
        { x: x0, y: h },
        { x: x0, y: y1 },
        { x: 0, y: y1 },
        { x: 0, y: y0 },
        { x: x0, y: y0 },
      ])
    }
    case "blob":
      return blob(w, h, options.seed ?? 7)
    case "wave":
      return `M0 ${n(h * 0.35)} C${n(w * 0.3)} ${n(-h * 0.1)} ${n(w * 0.55)} ${n(h * 0.8)} ${n(w)} ${n(h * 0.3)} V${n(h)} H0 Z`
    case "line":
      return `M0 ${n(h / 2)} H${n(w)}`
    case "dots":
      return dots(w, h)
    default:
      return roundedRect(w, h, 0)
  }
}

/**
 * The clip outline for a picture mask, in the image box. Null means no clip
 * beyond the box itself (`none`); `rounded` uses the element's corner radius.
 */
export function maskPath(mask: string, width: number, height: number, radius = 0): string | null {
  const w = Math.max(1, width)
  const h = Math.max(1, height)
  switch (mask) {
    case "rounded":
      return roundedRect(w, h, radius || Math.min(w, h) * 0.08)
    case "circle":
      return shapePath("ellipse", w, h)
    case "blob":
      return shapePath("blob", w, h, { seed: 11 })
    case "heart":
      return shapePath("heart", w, h)
    case "star":
      return shapePath("star", w, h)
    case "hexagon":
      return shapePath("hexagon", w, h)
    case "arch": {
      const r = w / 2
      if (h <= r) return roundedRect(w, h, 0)
      return `M0 ${n(h)} V${n(r)} A${n(r)} ${n(r)} 0 0 1 ${n(w)} ${n(r)} V${n(h)} Z`
    }
    default:
      return radius > 0 ? roundedRect(w, h, radius) : null
  }
}

export type PagePattern = "none" | "lines" | "grid" | "dots"

export const PAGE_PATTERNS: readonly PagePattern[] = ["none", "lines", "grid", "dots"]

export function isPagePattern(value: unknown): value is PagePattern {
  return value === "none" || value === "lines" || value === "grid" || value === "dots"
}

/**
 * The strokes of a page pattern (ruled lines, a grid, a dot grid), sized from
 * the page's short side so every format gets the same density. The ruled
 * pattern also returns a margin line, drawn in the accent colour.
 */
export function patternPaths(pattern: PagePattern, width: number, height: number): { rules: string; margin: string; dots: boolean } {
  const unit = Math.min(width, height) / 100
  if (pattern === "lines") {
    const gap = Math.max(12, unit * 5.2)
    const rules: string[] = []
    for (let y = unit * 14; y < height - unit * 2; y += gap) rules.push(`M0 ${n(y)} H${n(width)}`)
    const marginX = unit * 9
    return { rules: rules.join(" "), margin: `M${n(marginX)} 0 V${n(height)}`, dots: false }
  }
  if (pattern === "grid") {
    const gap = Math.max(12, unit * 5)
    const rules: string[] = []
    for (let x = gap; x < width; x += gap) rules.push(`M${n(x)} 0 V${n(height)}`)
    for (let y = gap; y < height; y += gap) rules.push(`M0 ${n(y)} H${n(width)}`)
    return { rules: rules.join(" "), margin: "", dots: false }
  }
  if (pattern === "dots") {
    const gap = Math.max(12, unit * 4.4)
    const radius = Math.max(1, unit * 0.28)
    const parts: string[] = []
    for (let y = gap; y < height; y += gap) {
      for (let x = gap; x < width; x += gap) {
        parts.push(`M${n(x - radius)} ${n(y)} A${n(radius)} ${n(radius)} 0 1 0 ${n(x + radius)} ${n(y)} A${n(radius)} ${n(radius)} 0 1 0 ${n(x - radius)} ${n(y)} Z`)
      }
    }
    return { rules: parts.join(" "), margin: "", dots: true }
  }
  return { rules: "", margin: "", dots: false }
}
