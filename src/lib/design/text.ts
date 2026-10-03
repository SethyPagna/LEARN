import { estimateTextWidth, type DesignFontId } from "./fonts"

/**
 * Text layout for design text boxes: line breaking, list markers, vertical
 * alignment and shrink-to-fit.
 *
 * The editor, the page export and the thumbnails all break lines with this one
 * function, fed by a font measurer (a canvas `measureText` in the browser, the
 * width estimate in tests and on the server). The lines on screen are the
 * lines in the exported PNG/PDF, because they come from the same place.
 *
 * Pure: no DOM, no React.
 */

export type TextAlign = "left" | "center" | "right" | "justify"
export type VerticalAlign = "top" | "middle" | "bottom"
export type ListStyle = "none" | "bullet" | "number" | "check"
/**
 * How a box treats text that does not fit:
 *  - `grow`: the box height follows the text (a text box someone typed into)
 *  - `shrink`: the font gets smaller until the text fits (layout-made boxes)
 *  - `none`: nothing changes; extra lines overflow the box
 */
export type TextFit = "grow" | "shrink" | "none"

export interface FontSpec {
  font: DesignFontId
  size: number
  weight: number
  italic: boolean
  /** Extra space between letters, in em. */
  letterSpacing: number
}

export type MeasureText = (text: string, font: FontSpec) => number

/** The width estimate from `fonts.ts`: deterministic, so layouts are testable. */
export const estimateMeasure: MeasureText = (text, font) => estimateTextWidth(text, font.font, font.size, font.weight, font.letterSpacing)

export interface TextLayoutInput {
  font: DesignFontId
  size: number
  weight: number
  italic: boolean
  letterSpacing: number
  /** Line height as a multiple of the font size. */
  lineHeight: number
  uppercase: boolean
  list: ListStyle
  verticalAlign: VerticalAlign
  fit: TextFit
  /** Inner padding on every side, in design px. */
  padding: number
  /** Extra space after each paragraph (list item), as a multiple of the font size. */
  paragraphSpacing?: number
}

export interface LaidOutLine {
  text: string
  /** The list marker drawn before the first line of an item ("" otherwise). */
  marker: string
  /** Measured width of `text`, without the marker column. */
  width: number
  /** True for the last line of a paragraph (justify leaves it ragged). */
  last: boolean
  /** Top of this line's box, from the top of the text block (before `offsetY`). */
  y: number
}

export interface TextLayout {
  /** The font size actually used (smaller than asked when `fit` shrank it). */
  size: number
  /** Line height in px. */
  lineHeight: number
  lines: LaidOutLine[]
  /** Width of the list marker column, 0 without a list. */
  markerWidth: number
  /** Height of all lines, in px. */
  contentHeight: number
  /** Where the first line starts inside the padded box (vertical alignment). */
  offsetY: number
  /** True when the lines are taller than the box even after any shrinking. */
  overflow: boolean
  /** True when a word wider than the box had to be split mid-word. */
  brokeWord: boolean
}

export const MIN_FONT_SIZE = 6
const SHRINK_STEP = 0.93

export function listMarker(list: ListStyle, index: number): string {
  if (list === "bullet") return "•"
  if (list === "number") return `${index + 1}.`
  if (list === "check") return "☐"
  return ""
}

/** Normalize line endings and apply the case transform the box asks for. */
export function displayText(content: string, uppercase: boolean): string {
  const text = String(content ?? "").replace(/\r\n?/g, "\n")
  return uppercase ? text.toLocaleUpperCase() : text
}

interface Measurer {
  word: (word: string) => number
  space: number
  raw: (text: string) => number
}

function createMeasurer(measure: MeasureText, font: FontSpec): Measurer {
  const cache = new Map<string, number>()
  const raw = (text: string) => {
    const cached = cache.get(text)
    if (cached !== undefined) return cached
    const width = Math.max(0, measure(text, font) || 0)
    cache.set(text, width)
    return width
  }
  return { word: raw, space: raw(" "), raw }
}

/** Greedy word wrap of one paragraph into lines no wider than `width`. */
function wrapParagraph(paragraph: string, width: number, measurer: Measurer, onBreak: () => void): { text: string; width: number }[] {
  const words = paragraph.split(/[ \t]+/).filter(Boolean)
  if (!words.length) return [{ text: "", width: 0 }]
  const lines: { text: string; width: number }[] = []
  let line = ""
  let lineWidth = 0

  const pushWord = (word: string) => {
    const wordWidth = measurer.word(word)
    if (!line) {
      if (wordWidth <= width) {
        line = word
        lineWidth = wordWidth
        return
      }
      // A single word wider than the box is broken by character.
      onBreak()
      let fragment = ""
      for (const character of word) {
        const next = fragment + character
        if (fragment && measurer.raw(next) > width) {
          lines.push({ text: fragment, width: measurer.raw(fragment) })
          fragment = character
        } else {
          fragment = next
        }
      }
      line = fragment
      lineWidth = measurer.raw(fragment)
      return
    }
    const candidate = lineWidth + measurer.space + wordWidth
    if (candidate <= width) {
      line = `${line} ${word}`
      lineWidth = candidate
      return
    }
    lines.push({ text: line, width: lineWidth })
    line = ""
    lineWidth = 0
    pushWord(word)
  }

  for (const word of words) pushWord(word)
  lines.push({ text: line, width: lineWidth })
  return lines
}

function layoutAtSize(content: string, innerWidth: number, style: TextLayoutInput, size: number, measure: MeasureText): { lines: LaidOutLine[]; markerWidth: number; lineHeight: number; height: number; brokeWord: boolean } {
  const font: FontSpec = { font: style.font, size, weight: style.weight, italic: style.italic, letterSpacing: style.letterSpacing }
  const measurer = createMeasurer(measure, font)
  const paragraphs = displayText(content, style.uppercase).split("\n")

  let markerWidth = 0
  if (style.list !== "none") {
    let item = 0
    for (const paragraph of paragraphs) {
      if (!paragraph.trim()) continue
      markerWidth = Math.max(markerWidth, measurer.raw(listMarker(style.list, item)))
      item += 1
    }
    if (markerWidth > 0) markerWidth += size * 0.5
  }

  const available = Math.max(1, innerWidth - markerWidth)
  const lineHeight = size * style.lineHeight
  const gap = Math.max(0, style.paragraphSpacing ?? 0) * size
  const lines: LaidOutLine[] = []
  let brokeWord = false
  const onBreak = () => {
    brokeWord = true
  }
  let item = 0
  let y = 0
  paragraphs.forEach((paragraph, paragraphIndex) => {
    if (paragraphIndex > 0) y += gap
    const trimmed = paragraph.trim()
    if (!trimmed) {
      lines.push({ text: "", marker: "", width: 0, last: true, y })
      y += lineHeight
      return
    }
    const wrapped = wrapParagraph(style.list === "none" ? paragraph.replace(/\s+$/, "") : trimmed, available, measurer, onBreak)
    wrapped.forEach((line, index) => {
      lines.push({
        text: line.text,
        marker: index === 0 && style.list !== "none" ? listMarker(style.list, item) : "",
        width: line.width,
        last: index === wrapped.length - 1,
        y,
      })
      y += lineHeight
    })
    item += 1
  })
  return { lines, markerWidth, lineHeight, height: y, brokeWord }
}

/**
 * Lay text out in a box. `box` is the element's full size; padding is applied
 * here. With `fit: "shrink"` the size steps down until the lines fit, but never
 * below `MIN_FONT_SIZE` or 30% of the asked size, so a box stays readable.
 */
export function layoutText(content: string, box: { width: number; height: number }, style: TextLayoutInput, measure: MeasureText = estimateMeasure): TextLayout {
  const padding = Math.max(0, style.padding)
  const innerWidth = Math.max(1, box.width - padding * 2)
  const innerHeight = Math.max(0, box.height - padding * 2)
  const asked = Math.max(MIN_FONT_SIZE, style.size)
  const floor = Math.max(MIN_FONT_SIZE, asked * 0.3)

  let size = asked
  let result = layoutAtSize(content, innerWidth, style, size, measure)
  let contentHeight = result.height
  if (style.fit === "shrink") {
    while (contentHeight > innerHeight + 0.5 && size > floor) {
      size = Math.max(floor, size * SHRINK_STEP)
      result = layoutAtSize(content, innerWidth, style, size, measure)
      contentHeight = result.height
    }
  }

  const free = innerHeight - contentHeight
  const offsetY = free <= 0 ? 0 : style.verticalAlign === "middle" ? free / 2 : style.verticalAlign === "bottom" ? free : 0
  return {
    size: roundTo(size, 2),
    lineHeight: roundTo(result.lineHeight, 3),
    lines: result.lines.map((line) => ({ ...line, y: roundTo(line.y, 3) })),
    markerWidth: roundTo(result.markerWidth, 3),
    contentHeight: roundTo(contentHeight, 3),
    offsetY: roundTo(offsetY, 3),
    overflow: contentHeight > innerHeight + 0.5,
    brokeWord: result.brokeWord,
  }
}

/** The box height text needs at a fixed width (what a `grow` box resizes to). */
export function naturalTextHeight(content: string, width: number, style: TextLayoutInput, measure: MeasureText = estimateMeasure): number {
  const layout = layoutText(content, { width, height: Number.MAX_SAFE_INTEGER / 4 }, { ...style, fit: "none" }, measure)
  return Math.ceil(layout.contentHeight + Math.max(0, style.padding) * 2)
}

/** The widest line's width (plus markers and padding): how wide the text wants to be. */
export function naturalTextWidth(content: string, style: TextLayoutInput, measure: MeasureText = estimateMeasure): number {
  const layout = layoutText(content, { width: Number.MAX_SAFE_INTEGER / 4, height: Number.MAX_SAFE_INTEGER / 4 }, { ...style, fit: "none" }, measure)
  const widest = layout.lines.reduce((max, line) => Math.max(max, line.width), 0)
  return Math.ceil(widest + layout.markerWidth + Math.max(0, style.padding) * 2)
}

/**
 * The largest font size in [min, max] at which the text fits the box. Used by
 * the layout engine to pick a type size, so it steps in small increments and
 * is deterministic for a given measurer.
 */
export function fitFontSize(content: string, box: { width: number; height: number }, style: Omit<TextLayoutInput, "size" | "fit">, range: { max: number; min: number }, measure: MeasureText = estimateMeasure): number {
  const max = Math.max(MIN_FONT_SIZE, range.max)
  const min = Math.max(MIN_FONT_SIZE, Math.min(range.min, max))
  let size = max
  while (size > min) {
    const layout = layoutText(content, box, { ...style, size, fit: "none" }, measure)
    if (!layout.overflow && !layout.brokeWord) return roundTo(size, 1)
    size = Math.max(min, size * 0.95)
  }
  return roundTo(min, 1)
}

function roundTo(value: number, digits: number) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}
