/**
 * `pdf` — build a PDF 1.4 document from themed blocks, with no dependency.
 *
 * The input is the *existing* `ThemedBlock` union from
 * `@/lib/ai/format-response`, the same shape `./docx` consumes, so one AI reply
 * or document body renders to both formats without a second normalizer. PDF is
 * a text format, so the whole file — header, object bodies, cross-reference
 * table, trailer — is assembled here by hand; nothing is fetched, embedded or
 * compressed.
 *
 * File skeleton, in the order the bytes are emitted:
 *
 *     %PDF-1.4                       header + binary marker comment
 *     1 0 obj   catalogue            /Type /Catalog -> the page tree
 *     2 0 obj   page tree            /Type /Pages, /Kids, /Count
 *     3..5 0 obj three core fonts    Helvetica, Helvetica-Bold, Courier
 *     6 0 obj   document info        /Title, /Producer, /CreationDate
 *     7 0 obj   first page           /Type /Page, /Resources, /Contents
 *     8 0 obj   first content stream the page's operators
 *     9,10 ...  one page object + one content stream per page
 *     xref                           one 20-byte entry per object
 *     trailer                        /Size, /Root, /Info
 *     startxref                      byte offset of the `xref` keyword
 *     %%EOF
 *
 * The xref is the part hand-rolled writers usually get wrong: offsets are
 * accumulated as the object bodies are appended, so every entry points at the
 * first byte of its `N 0 obj` line, and `startxref` is the offset of the `xref`
 * keyword itself. Both are asserted byte-for-byte in the test.
 *
 * `buildPdf` lays out a document; `buildDeckPdf` lays out a deck — landscape
 * 16:9 pages, one slide per page, with an overflowing slide continued onto
 * further pages. Both share everything below the layout: the fonts, the width
 * table, the escaping, the object numbering and the serialiser, so a deck and a
 * document are the same file shape laid out differently.
 *
 * Fonts are the three core fonts every reader already has, so nothing is
 * embedded: `Helvetica` for body text, `Helvetica-Bold` for the title and
 * headings, `Courier` for code. Text is laid out against a real width table
 * (thousandths of an em, per character) rather than a fixed character count, so
 * wrapping holds for proportional text; Courier is measured the same way, which
 * for a monospaced face is 600/1000 em per character.
 *
 * Output is deterministic: the same input and `createdAt` produce byte-identical
 * bytes. The module never reads the clock — with no `createdAt` the document
 * table carries a fixed epoch date, the same convention as `DEFAULT_ENTRY_DATE`
 * in `./zip`. There is no randomness and no iteration over unordered maps.
 */

import type { QuizQuestion, ThemedBlock, ThemedSlide, ThemedTableAlign } from "@/lib/ai/format-response"

/** A PDF block is exactly a themed block — one shape, three renderers. */
export type PdfBlock = ThemedBlock

/** The three core fonts this writer uses. None is embedded. */
export type PdfFontName = "helvetica" | "helvetica-bold" | "courier"

export interface BuildPdfInput {
  /** Document title: a first-page title block, and the PDF's `/Title`. */
  title: string
  blocks: PdfBlock[]
  /** Paper size. Defaults to `letter`, matching the geometry `./docx` uses. */
  pageSize?: "a4" | "letter"
  /** Margin in points on all sides. Defaults to 56 (about 0.78in). */
  margin?: number
  /** Draw `Page n of m` at the foot of every page. Defaults to `true`. */
  footer?: boolean
  /**
   * `/CreationDate`, and the only clock this module has. Omit it for
   * byte-reproducible output.
   */
  createdAt?: Date
}

/** Trimmed page boxes in points: 1/72in, the unit PDF itself uses. */
export const PDF_PAGE_SIZES = {
  a4: { width: 595.28, height: 841.89 },
  letter: { width: 612, height: 792 },
} as const

export const PDF_DEFAULT_MARGIN = 56

/** A deck slide as this writer sees it: a title and the bullet lines under it. */
export interface PdfDeckSlide {
  title: string
  bullets: string[]
}

export interface BuildDeckPdfInput {
  /** Deck title. Becomes the PDF's `/Title`; it is not drawn as its own slide. */
  title: string
  slides: PdfDeckSlide[]
  /** Draw the `i / n` slide number at the foot of every page. Defaults to `true`. */
  footer?: boolean
  /** `/CreationDate`, and the only clock this module has. Omit for reproducible bytes. */
  createdAt?: Date
}

/**
 * Landscape slide geometry: 960x540pt is exactly 16:9, the canvas a deck is
 * authored on, and is two letter pages wide so a projected slide is legible at
 * the same type sizes a document uses.
 */
export const PDF_DECK_PAGE_SIZE = { width: 960, height: 540 } as const

export const PDF_DECK_MARGIN = 64

/**
 * The marker that heads a page continuing the slide above it. Exported so a
 * caller — or the test — can recognise a continuation without hard-coding it.
 */
export const DECK_CONTINUATION_SUFFIX = " (cont.)"

/**
 * The fixed stand-in for `/CreationDate`. A date that never changes is what
 * makes two runs on the same input identical; `./zip` uses the same idea.
 */
const PDF_REPLACEMENT_DATE = new Date(Date.UTC(1980, 0, 1))

const PDF_VERSION = "%PDF-1.4"

/**
 * Resource names inside a page's `/Resources /Font` dictionary. Fixed, because
 * the font objects always occupy objects 3, 4 and 5.
 */
const FONT_RESOURCES: Record<PdfFontName, string> = {
  helvetica: "F1",
  "helvetica-bold": "F2",
  courier: "F3",
}

const FONT_BASE_NAMES: Record<PdfFontName, string> = {
  helvetica: "Helvetica",
  "helvetica-bold": "Helvetica-Bold",
  courier: "Courier",
}

// ---------------------------------------------------------------------------
// Width tables
// ---------------------------------------------------------------------------

/**
 * Character widths in thousandths of an em, from the Adobe AFM metrics for the
 * core fonts. Three runs per face, indexed by WinAnsi byte:
 *
 *   - `ascii`  bytes 32..126 (95 values, space first)
 *   - `latin1` bytes 160..255 (96 values, exclamdown first)
 *   - `cp1252` the 27 slots CP1252 fills in bytes 128..159, in `WIN_ANSI_HIGH`
 *              order (every other byte in that range is undefined)
 *
 * Held as strings because 218 numbers per face read better — and diff better —
 * as three dense lines than as three arrays, and they are parsed once at module
 * load. Bytes the tables do not cover fall back to `WIDTH_FALLBACK`, which only
 * matters for the undefined C1 slots: text outside WinAnsi is replaced by `?`
 * before it is measured or drawn.
 */
interface FontMetrics {
  readonly ascii: readonly number[]
  readonly latin1: readonly number[]
  readonly cp1252: readonly number[]
}

function widths(source: string): number[] {
  return source.split(" ").map(Number)
}

const WIDTH_FALLBACK = 556

const HELVETICA_WIDTHS: FontMetrics = {
  ascii: widths(
    "278 278 355 556 556 889 667 191 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 556 556 278 278 584 584 584 556 1015 667 667 722 722 667 611 778 722 278 500 667 556 833 722 778 667 778 722 667 611 722 667 944 667 667 611 278 278 278 469 556 333 556 556 500 556 556 278 556 556 222 222 500 222 833 556 556 556 556 333 500 278 556 500 722 500 500 500 334 260 334 584",
  ),
  latin1: widths(
    "333 556 556 556 556 556 556 333 737 370 556 584 333 737 333 400 584 333 333 333 556 537 278 333 333 365 556 834 834 834 611 667 667 667 667 667 667 1000 722 667 667 667 667 278 278 278 278 722 722 778 778 778 778 778 584 778 722 722 722 722 667 667 611 556 556 556 556 556 556 889 500 556 556 556 556 278 278 278 278 556 556 556 556 556 556 556 584 611 556 556 556 556 500 556 500",
  ),
  cp1252: widths("556 222 556 333 1000 556 556 333 1000 667 333 1000 611 222 222 333 333 350 556 1000 333 1000 500 333 944 500 667"),
}

const HELVETICA_BOLD_WIDTHS: FontMetrics = {
  ascii: widths(
    "278 333 474 556 556 889 722 238 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 556 556 333 333 584 584 584 611 975 722 722 722 722 667 611 778 722 278 556 722 611 833 722 778 667 778 722 667 611 722 667 944 667 667 611 333 278 333 584 556 333 556 611 556 611 556 333 611 611 278 278 556 278 889 611 611 611 611 389 556 333 611 556 778 556 556 500 389 280 389 584",
  ),
  latin1: widths(
    "333 556 556 556 556 556 556 333 737 370 556 584 333 737 333 400 584 333 333 333 611 556 278 333 333 365 556 834 834 834 611 722 722 722 722 722 722 1000 722 667 667 667 667 278 278 278 278 722 722 778 778 778 778 778 584 778 722 722 722 722 667 667 611 556 556 556 556 556 556 889 556 556 556 556 556 278 278 278 278 611 611 611 611 611 611 611 584 611 611 611 611 611 556 611 556",
  ),
  cp1252: widths("556 278 556 333 1000 556 556 333 1000 667 333 1000 611 278 278 500 500 350 556 1000 333 1000 556 333 944 500 667"),
}

/** Courier is monospaced: 600/1000 em for every glyph, so it needs no table. */
const COURIER_WIDTH = 600

/** Only the proportional faces have per-character metrics. */
const PROPORTIONAL_METRICS: Record<"helvetica" | "helvetica-bold", FontMetrics> = {
  helvetica: HELVETICA_WIDTHS,
  "helvetica-bold": HELVETICA_BOLD_WIDTHS,
}

// ---------------------------------------------------------------------------
// Text encoding: code points -> WinAnsi bytes
// ---------------------------------------------------------------------------

/**
 * The bytes CP1252 (which `WinAnsiEncoding` mirrors) uses for the code points
 * above ASCII that are not Latin-1, as `[byte, code point]` pairs: 0x20AC is
 * the euro sign, 0x2019 the typographic apostrophe, and so on — exactly the
 * characters a document body picks up from copy-paste and typographic
 * replacement. Every other byte in 128..159 is undefined in CP1252.
 */
const WIN_ANSI_HIGH: ReadonlyArray<readonly [number, number]> = [
  [0x80, 0x20ac], [0x82, 0x201a], [0x83, 0x0192], [0x84, 0x201e], [0x85, 0x2026],
  [0x86, 0x2020], [0x87, 0x2021], [0x88, 0x02c6], [0x89, 0x2030], [0x8a, 0x0160],
  [0x8b, 0x2039], [0x8c, 0x0152], [0x8e, 0x017d], [0x91, 0x2018], [0x92, 0x2019],
  [0x93, 0x201c], [0x94, 0x201d], [0x95, 0x2022], [0x96, 0x2013], [0x97, 0x2014],
  [0x98, 0x02dc], [0x99, 0x2122], [0x9a, 0x0161], [0x9b, 0x203a], [0x9c, 0x0153],
  [0x9e, 0x017e], [0x9f, 0x0178],
]

const WIN_ANSI_BY_CODE_POINT = new Map<number, number>(WIN_ANSI_HIGH.map(([byte, codePoint]) => [codePoint, byte]))

/** Position of a CP1252 byte inside the compact `cp1252` width run. */
const WIN_ANSI_WIDTH_INDEX = new Map<number, number>(WIN_ANSI_HIGH.map(([byte], index) => [byte, index]))

/** The stand-in for a character WinAnsi cannot carry. */
const REPLACEMENT_BYTE = 0x3f // "?"

/**
 * One code point to one WinAnsi byte.
 *
 * Anything WinAnsi cannot carry — emoji, CJK, the C1 control block, a lone
 * surrogate — becomes `?` (0x3F) rather than being emitted as a raw byte. PDF
 * strings are byte strings: writing a UTF-8 sequence into one produces mojibake
 * in some readers and unparseable files in others, so a visible `?` is the
 * honest failure. This is the only place that decision is made.
 */
function winAnsiByte(codePoint: number): number {
  if (codePoint >= 0x20 && codePoint <= 0x7e) return codePoint
  if (codePoint >= 0xa0 && codePoint <= 0xff) return codePoint
  return WIN_ANSI_BY_CODE_POINT.get(codePoint) ?? REPLACEMENT_BYTE
}

/**
 * Text -> a WinAnsi "byte string": one character per byte, each holding the
 * value that will be written. Iterating code points (not UTF-16 units) keeps a
 * surrogate pair together, so an emoji becomes one `?` rather than two.
 */
function toWinAnsiString(text: string): string {
  let out = ""
  for (const character of text) {
    const codePoint = character.codePointAt(0)
    out += String.fromCharCode(codePoint === undefined ? REPLACEMENT_BYTE : winAnsiByte(codePoint))
  }
  return out
}

/**
 * Escape a byte string for a PDF literal string: backslash first, or the
 * backslashes the later replacements introduce would be escaped twice.
 */
function escapePdfString(byteString: string): string {
  return byteString.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")
}

/** A prepared literal string, ready to place between `(` and `)` in an operator. */
function pdfString(text: string): string {
  return escapePdfString(toWinAnsiString(text))
}

/**
 * A byte string as bytes. One character per byte: every string this module
 * builds is either ASCII or already converted to WinAnsi, so the low byte of
 * each character is the byte to write — which is what lets the file's offsets
 * (accumulated in characters) be byte offsets.
 */
function latin1Bytes(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length)
  for (let index = 0; index < text.length; index += 1) bytes[index] = text.charCodeAt(index) & 0xff
  return bytes
}

// ---------------------------------------------------------------------------
// Measurement and wrapping
// ---------------------------------------------------------------------------

function widthOfByte(byte: number, font: PdfFontName): number {
  if (font === "courier") return COURIER_WIDTH
  const metrics = PROPORTIONAL_METRICS[font]
  if (byte >= 32 && byte <= 126) return metrics.ascii[byte - 32]
  if (byte >= 160) return metrics.latin1[byte - 160]
  const index = WIN_ANSI_WIDTH_INDEX.get(byte)
  return index === undefined ? WIDTH_FALLBACK : metrics.cp1252[index]
}

/**
 * Width of a single line, in points, on the same basis the text will be drawn:
 * the string is mapped to WinAnsi first, so a character that becomes `?` is
 * measured as `?` and a line can never measure narrower than it renders.
 *
 * Exported so a caller — or the test — can predict where a line will break
 * without re-implementing the width table.
 */
export function measurePdfText(text: string, font: PdfFontName, size: number): number {
  const byteString = toWinAnsiString(text)
  let thousandths = 0
  for (let index = 0; index < byteString.length; index += 1) {
    thousandths += widthOfByte(byteString.charCodeAt(index), font)
  }
  return (thousandths / 1000) * size
}

/**
 * Break one word that cannot fit on a line of `maxWidth` into pieces that do.
 * Iterating code points means a piece never splits a surrogate pair.
 */
function breakLongWord(word: string, font: PdfFontName, size: number, maxWidth: number): string[] {
  if (measurePdfText(word, font, size) <= maxWidth) return [word]

  const parts: string[] = []
  let chunk = ""
  for (const character of word) {
    const candidate = chunk + character
    if (chunk && measurePdfText(candidate, font, size) > maxWidth) {
      parts.push(chunk)
      chunk = character
    } else {
      chunk = candidate
    }
  }
  if (chunk) parts.push(chunk)
  return parts
}

/**
 * Greedy word wrap to a measured width.
 *
 * Hard line breaks in the source are honoured first, then words are packed; a
 * single word wider than the column is broken by characters, so no drawn line
 * can exceed `maxWidth` — the bound the test asserts against this same width
 * table.
 */
function wrapProse(text: string, font: PdfFontName, size: number, maxWidth: number): string[] {
  const lines: string[] = []

  for (const hardLine of text.replace(/\r\n?/g, "\n").split("\n")) {
    const words = hardLine.split(/\s+/).filter(Boolean)
    if (!words.length) {
      lines.push("")
      continue
    }

    let current = ""
    for (const word of words) {
      for (const part of breakLongWord(word, font, size, maxWidth)) {
        const candidate = current ? `${current} ${part}` : part
        if (measurePdfText(candidate, font, size) <= maxWidth) {
          current = candidate
        } else {
          if (current) lines.push(current)
          current = part
        }
      }
    }
    if (current) lines.push(current)
  }

  return lines
}

/**
 * Code is wrapped the same way but without reflowing spaces: indentation is
 * meaning, so a line is only broken when it does not fit, and then at the
 * character that overflows.
 *
 * One array per source line, because the fragments of a long statement belong
 * together: `layoutCode` paginates by these groups, so a page break never lands
 * between the two halves of one wrapped line.
 */
function wrapCode(code: string, size: number, maxWidth: number): string[][] {
  return code
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((sourceLine) => {
      const line = sourceLine.replace(/\t/g, "  ")
      const fragments: string[] = []
      let chunk = ""
      for (const character of line) {
        const candidate = chunk + character
        if (chunk && measurePdfText(candidate, "courier", size) > maxWidth) {
          fragments.push(chunk)
          chunk = character
        } else {
          chunk = candidate
        }
      }
      fragments.push(chunk)
      return fragments
    })
}

// ---------------------------------------------------------------------------
// Page layout
// ---------------------------------------------------------------------------

type Rgb = readonly [number, number, number]

const INK: Rgb = [0.1, 0.12, 0.16]
const MUTED: Rgb = [0.42, 0.46, 0.53]
const RULE: Rgb = [0.72, 0.75, 0.8]
const CODE_BACKGROUND: Rgb = [0.95, 0.96, 0.97]
const TABLE_HEADER_BACKGROUND: Rgb = [0.93, 0.94, 0.96]

const CALLOUT_TONES: Record<string, { background: Rgb; bar: Rgb }> = {
  info: { background: [0.93, 0.95, 1], bar: [0.29, 0.53, 0.9] },
  warn: { background: [1, 0.97, 0.89], bar: [0.85, 0.62, 0.1] },
  success: { background: [0.92, 0.99, 0.94], bar: [0.13, 0.66, 0.35] },
}

const TITLE_SIZE = 22
const TITLE_LINE_HEIGHT = 27
const BODY_SIZE = 10.5
const BODY_LINE_HEIGHT = 15
const CODE_SIZE = 9
const CODE_LINE_HEIGHT = 12.2
const CODE_PADDING = 6
const CELL_SIZE = 10
const CELL_LINE_HEIGHT = 13
const CELL_PADDING = 5
const MIN_COLUMN_WIDTH = 30
const FOOTER_SIZE = 9
/** Fractions of a font size that layout reserves above and below the baseline. */
const ASCENT = 0.78
const DESCENT = 0.22

/** Sizes and leading per heading level, mirroring the DOCX heading scale. */
const HEADING_STYLES: Record<1 | 2 | 3 | 4, { size: number; lineHeight: number; spaceBefore: number }> = {
  1: { size: 17, lineHeight: 21, spaceBefore: 12 },
  2: { size: 14, lineHeight: 18, spaceBefore: 12 },
  3: { size: 12, lineHeight: 15.5, spaceBefore: 10 },
  4: { size: 10.5, lineHeight: 14, spaceBefore: 9 },
}

/**
 * Deck scale. A slide is read from across a room rather than held in the hand,
 * so the title is several times a heading and the bullets are body-and-a-half,
 * with a leading wide enough to keep a projected line from crowding the next.
 */
const DECK_TITLE_SIZE = 30
const DECK_TITLE_LINE_HEIGHT = 38
/** Gap from the accent rule down to the first bullet's baseline. */
const DECK_TITLE_SPACE_AFTER = 22
const DECK_ACCENT_RULE_WIDTH = 64
const DECK_ACCENT_RULE_THICKNESS = 3
const DECK_BULLET_SIZE = 17
const DECK_BULLET_LINE_HEIGHT = 25
/** The bullet marker hangs here; wrapped lines align with the text, not the marker. */
const DECK_BULLET_INDENT = 26
const DECK_SLIDE_NUMBER_SIZE = 10

/** The deck's accent tone: the same blue the info callout bar uses. */
const DECK_ACCENT: Rgb = [0.29, 0.53, 0.9]

/**
 * Layout state. `y` is always the baseline of the next line to draw, and the
 * page grows downwards: every helper spends vertical space by lowering `y`, and
 * `ensureSpace` starts a new page when the next baseline would cross
 * `contentBottom`.
 */
interface LayoutState {
  pageWidth: number
  pageHeight: number
  margin: number
  contentWidth: number
  contentBottom: number
  pages: string[][]
  page: string[]
  y: number
}

/** Compact number formatting: at most two decimals, no trailing zeros. */
function num(value: number): string {
  return String(Math.round(value * 100) / 100)
}

function fillColor(color: Rgb): string {
  return `${num(color[0])} ${num(color[1])} ${num(color[2])} rg`
}

function strokeColor(color: Rgb): string {
  return `${num(color[0])} ${num(color[1])} ${num(color[2])} RG`
}

function beginPage(state: LayoutState): void {
  state.page = []
  state.pages.push(state.page)
  state.y = state.pageHeight - state.margin
}

/** Start a new page unless `height` of content still fits above the margin. */
function ensureSpace(state: LayoutState, height: number): void {
  if (state.y - height < state.contentBottom) beginPage(state)
}

function fillRect(state: LayoutState, x: number, top: number, width: number, height: number, color: Rgb): void {
  state.page.push(`q ${fillColor(color)} ${num(x)} ${num(top - height)} ${num(width)} ${num(height)} re f Q`)
}

function drawRule(state: LayoutState, x1: number, y1: number, x2: number, y2: number, thickness: number, color: Rgb = RULE): void {
  state.page.push(`q ${strokeColor(color)} ${num(thickness)} w ${num(x1)} ${num(y1)} m ${num(x2)} ${num(y2)} l S Q`)
}

/** One already-wrapped line, drawn at `baseline` (default: the cursor). */
function drawLineOfText(state: LayoutState, text: string, x: number, font: PdfFontName, size: number, color: Rgb, baseline = state.y): void {
  state.page.push(
    "BT",
    `/${FONT_RESOURCES[font]} ${num(size)} Tf`,
    fillColor(color),
    `1 0 0 1 ${num(x)} ${num(baseline)} Tm`,
    `(${pdfString(text)}) Tj`,
    "ET",
  )
}

function clampHeadingLevel(level: number): 1 | 2 | 3 | 4 {
  const rounded = Math.floor(level) || 1
  return Math.min(4, Math.max(1, rounded)) as 1 | 2 | 3 | 4
}

interface ParagraphOptions {
  x: number
  width: number
  font: PdfFontName
  size: number
  lineHeight: number
  color?: Rgb
  spaceBefore?: number
  spaceAfter?: number
}

/** A run of wrapped lines at one font, size and indent, with optional gaps. */
function drawParagraph(state: LayoutState, text: string, options: ParagraphOptions): void {
  const color = options.color ?? INK
  const lines = wrapProse(text, options.font, options.size, options.width)

  state.y -= options.spaceBefore ?? 0
  for (const line of lines) {
    ensureSpace(state, options.lineHeight)
    drawLineOfText(state, line, options.x, options.font, options.size, color)
    state.y -= options.lineHeight
  }
  state.y -= options.spaceAfter ?? 0
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

function layoutHeading(state: LayoutState, level: number, text: string): void {
  const style = HEADING_STYLES[clampHeadingLevel(level)]
  drawParagraph(state, text, {
    x: state.margin,
    width: state.contentWidth,
    font: "helvetica-bold",
    size: style.size,
    lineHeight: style.lineHeight,
    spaceBefore: style.spaceBefore,
    spaceAfter: 4,
  })
}

function layoutList(state: LayoutState, ordered: boolean, items: string[]): void {
  // The marker hangs in the indent: the first line carries it, wrapped lines
  // align with the text, not with the marker.
  const indent = ordered ? 22 : 16
  const textX = state.margin + indent

  items.forEach((item, index) => {
    const marker = ordered ? `${index + 1}.` : "•"
    const lines = wrapProse(item, "helvetica", BODY_SIZE, state.contentWidth - indent)
    lines.forEach((line, lineIndex) => {
      ensureSpace(state, BODY_LINE_HEIGHT)
      if (lineIndex === 0) drawLineOfText(state, marker, state.margin, "helvetica", BODY_SIZE, MUTED)
      drawLineOfText(state, line, textX, "helvetica", BODY_SIZE, INK)
      state.y -= BODY_LINE_HEIGHT
    })
  })

  state.y -= 6
}

/**
 * Column widths from content: each column asks for the width of its widest cell
 * (header included) plus padding, and the set is then scaled to fill the text
 * width exactly. When the natural widths overflow the page, columns shrink
 * proportionally but never below a floor, which the loop re-applies until the
 * total fits; the floor is itself capped so a table with very many columns
 * still fits a page.
 */
function tableColumnWidths(headers: string[], rows: string[][], contentWidth: number): number[] {
  const columns = Math.max(headers.length, ...rows.map((row) => row.length), 0)
  if (!columns) return []

  const natural = Array.from({ length: columns }, (_, column) => {
    const texts = [headers[column] ?? "", ...rows.map((row) => row[column] ?? "")]
    const widest = texts.reduce(
      (widest, text) => Math.max(widest, measurePdfText(text, "helvetica", CELL_SIZE), measurePdfText(text, "helvetica-bold", CELL_SIZE)),
      0,
    )
    return widest + CELL_PADDING * 2
  })

  const minWidth = Math.min(MIN_COLUMN_WIDTH, contentWidth / columns)
  let fitted = natural.map((width) => Math.max(width, minWidth))

  // Shrink until the total fits. A proportional pass alone can stay over budget
  // when the floor binds, so the loop re-clamps and rescales a few times — it
  // converges in two passes in practice and is bounded here to stay predictable.
  for (let pass = 0; pass < 8; pass += 1) {
    const total = fitted.reduce((sum, width) => sum + width, 0)
    if (total <= contentWidth) break
    fitted = fitted.map((width) => Math.max(minWidth, (width * contentWidth) / total))
  }

  const total = fitted.reduce((sum, width) => sum + width, 0)
  return fitted.map((width) => (width * contentWidth) / total)
}

function wrappedCellLines(text: string, width: number, font: PdfFontName): string[] {
  return wrapProse(text, font, CELL_SIZE, Math.max(8, width - CELL_PADDING * 2))
}

/** Height of a row box: text lines plus padding above and below. */
function cellRowHeight(lines: string[][]): number {
  const textLines = Math.max(1, ...lines.map((cell) => Math.max(1, cell.length)))
  return (textLines - 1) * CELL_LINE_HEIGHT + CELL_SIZE * (ASCENT + DESCENT) + CELL_PADDING * 2
}

/**
 * Draw one row with its first baseline at the cursor, then leave the cursor at
 * the row's bottom padding. Rules are drawn by the caller so a row that lands
 * at the top of a new page cannot be double-stroked.
 */
function drawTableRow(state: LayoutState, widths: number[], lines: string[][], font: PdfFontName, align?: ThemedTableAlign[]): void {
  const firstBaseline = state.y
  let x = state.margin

  lines.forEach((cellLines, column) => {
    const available = widths[column] - CELL_PADDING * 2
    const cellAlign = align?.[column]

    cellLines.forEach((line, lineIndex) => {
      const width = measurePdfText(line, font, CELL_SIZE)
      const shift = cellAlign === "center" ? (available - width) / 2 : cellAlign === "right" ? available - width : 0
      drawLineOfText(state, line, x + CELL_PADDING + Math.max(0, shift), font, CELL_SIZE, INK, firstBaseline - lineIndex * CELL_LINE_HEIGHT)
    })

    x += widths[column]
  })

  // The row's box bottom is one descender and one padding below the last
  // baseline; the rule closes the row there and the next row's top starts on it.
  const boxBottom = firstBaseline - (cellRowHeight(lines) - CELL_SIZE * ASCENT - CELL_PADDING)
  drawRule(state, state.margin, boxBottom, state.margin + widths.reduce((sum, width) => sum + width, 0), boxBottom, 0.5)

  state.y = firstBaseline - cellRowHeight(lines)
}

function layoutTable(state: LayoutState, headers: string[], rows: string[][], align?: ThemedTableAlign[]): void {
  const widths = tableColumnWidths(headers, rows, state.contentWidth)
  if (!widths.length) return

  const columns = widths.length
  const rowOf = (row: string[], font: PdfFontName) =>
    Array.from({ length: columns }, (_, column) => wrappedCellLines(row[column] ?? "", widths[column], font))

  const headerLines = headers.length ? rowOf(headers, "helvetica-bold") : []
  const headerHeight = headerLines.length ? cellRowHeight(headerLines) : 0

  const drawHeader = () => {
    if (!headerLines.length) return
    fillRect(state, state.margin, state.y + CELL_SIZE * ASCENT + CELL_PADDING, state.contentWidth, headerHeight, TABLE_HEADER_BACKGROUND)
    drawTableRow(state, widths, headerLines, "helvetica-bold", align)
  }

  ensureSpace(state, headerHeight + (rows.length ? cellRowHeight(rowOf(rows[0], "helvetica")) : 0))
  drawRule(state, state.margin, state.y + CELL_SIZE * ASCENT + CELL_PADDING, state.margin + state.contentWidth, state.y + CELL_SIZE * ASCENT + CELL_PADDING, 0.5)
  drawHeader()

  for (const row of rows) {
    const lines = rowOf(row, "helvetica")
    if (state.y - cellRowHeight(lines) < state.contentBottom) {
      beginPage(state)
      // The header repeats, so a table continued on a new page still reads.
      drawHeader()
    }
    drawTableRow(state, widths, lines, "helvetica", align)
  }

  state.y -= 12
}

function layoutCode(state: LayoutState, code: string, language: string): void {
  if (language) {
    drawParagraph(state, language, { x: state.margin, width: state.contentWidth, font: "helvetica-bold", size: 8, lineHeight: 11, color: MUTED, spaceAfter: 3 })
  }

  const pending = wrapCode(code, CODE_SIZE, state.contentWidth - CODE_PADDING * 2)

  while (pending.length) {
    const minimumHeight = CODE_SIZE * (ASCENT + DESCENT) + CODE_PADDING * 2
    ensureSpace(state, minimumHeight)

    // A block taller than a page is split across pages rather than clipped, and
    // each chunk gets its own background so no page shows an unshaded tail.
    // Chunks break between source lines where possible, and character-wrap
    // fragments of one line are never separated.
    const capacity = Math.max(1, Math.floor((state.y - state.contentBottom - CODE_SIZE * DESCENT - CODE_PADDING) / CODE_LINE_HEIGHT) + 1)
    const chunk: string[] = []

    while (pending.length) {
      const group = pending[0]
      if (chunk.length + group.length > capacity) {
        if (!chunk.length) {
          // One line, wrapped, is taller than a whole page: take what fits and
          // leave the rest for the next page.
          chunk.push(...group.slice(0, capacity))
          pending[0] = group.slice(capacity)
        }
        break
      }
      chunk.push(...group)
      pending.shift()
    }

    const firstBaseline = state.y
    const boxTop = firstBaseline + CODE_SIZE * ASCENT + CODE_PADDING
    const boxHeight = (chunk.length - 1) * CODE_LINE_HEIGHT + CODE_SIZE * (ASCENT + DESCENT) + CODE_PADDING * 2
    fillRect(state, state.margin, boxTop, state.contentWidth, boxHeight, CODE_BACKGROUND)

    chunk.forEach((line, lineIndex) => {
      drawLineOfText(state, line, state.margin + CODE_PADDING, "courier", CODE_SIZE, INK, firstBaseline - lineIndex * CODE_LINE_HEIGHT)
    })

    // Cursor: the last baseline, then down past the descender, the padding and
    // the gap that separates this block from the next.
    state.y = firstBaseline - (chunk.length - 1) * CODE_LINE_HEIGHT - CODE_SIZE * DESCENT - CODE_PADDING - 8

    if (pending.length) beginPage(state)
  }
}

function layoutQuote(state: LayoutState, text: string): void {
  const x = state.margin + 20
  const lines = wrapProse(text, "helvetica", BODY_SIZE, state.contentWidth - 20)

  for (const line of lines) {
    ensureSpace(state, BODY_LINE_HEIGHT)
    // The rule is drawn per line, so a quote that crosses a page break keeps its
    // edge on both pages instead of trailing off the first one.
    drawRule(state, state.margin + 6, state.y - BODY_SIZE * DESCENT, state.margin + 6, state.y + BODY_SIZE * ASCENT, 1.6)
    drawLineOfText(state, line, x, "helvetica", BODY_SIZE, MUTED)
    state.y -= BODY_LINE_HEIGHT
  }

  state.y -= 8
}

function layoutDivider(state: LayoutState): void {
  ensureSpace(state, 14)
  state.y -= 5
  drawRule(state, state.margin, state.y, state.margin + state.contentWidth, state.y, 0.6)
  state.y -= 9
}

function layoutCallout(state: LayoutState, tone: string, text: string): void {
  const colors = CALLOUT_TONES[tone] ?? CALLOUT_TONES.info
  const x = state.margin + 18
  const lines = wrapProse(`[${tone.toUpperCase()}] ${text}`, "helvetica", BODY_SIZE, state.contentWidth - 18 - CODE_PADDING)

  const boxHeight = (lines.length - 1) * BODY_LINE_HEIGHT + BODY_SIZE * (ASCENT + DESCENT) + CODE_PADDING * 2
  ensureSpace(state, boxHeight)

  const boxTop = state.y + BODY_SIZE * ASCENT + CODE_PADDING
  fillRect(state, state.margin, boxTop, state.contentWidth, boxHeight, colors.background)
  fillRect(state, state.margin, boxTop, 3, boxHeight, colors.bar)

  lines.forEach((line, lineIndex) => {
    drawLineOfText(state, line, x, "helvetica", BODY_SIZE, INK, state.y - lineIndex * BODY_LINE_HEIGHT)
  })

  state.y -= (lines.length - 1) * BODY_LINE_HEIGHT + BODY_SIZE * DESCENT + CODE_PADDING + 8
}

function layoutImage(state: LayoutState, alt: string, url: string): void {
  const label = alt.trim()
  const target = url.trim()
  // Images are not embedded — that would mean fetching and re-encoding binary
  // data — so the caption and its location are written and nothing is lost.
  const text = label && target ? `[Image: ${label} — ${target}]` : `[Image: ${label || target || "untitled"}]`
  drawParagraph(state, text, { x: state.margin, width: state.contentWidth, font: "helvetica", size: BODY_SIZE, lineHeight: BODY_LINE_HEIGHT, color: MUTED, spaceAfter: 6 })
}

function layoutQuiz(state: LayoutState, title: string, questions: QuizQuestion[]): void {
  if (title) layoutHeading(state, 2, title)

  questions.forEach((question, index) => {
    drawParagraph(state, `${index + 1}. ${question.question}`, { x: state.margin, width: state.contentWidth, font: "helvetica", size: BODY_SIZE, lineHeight: BODY_LINE_HEIGHT, spaceAfter: 4 })
    if (question.choices.length) layoutList(state, false, question.choices.map((choice) => `${choice.id}. ${choice.text}`))
    if (question.answerId) drawParagraph(state, `Answer: ${question.answerId}`, { x: state.margin, width: state.contentWidth, font: "helvetica-bold", size: BODY_SIZE, lineHeight: BODY_LINE_HEIGHT, spaceAfter: 6 })
    if (question.explanation) layoutQuote(state, question.explanation)
  })
}

function layoutSlideOutline(state: LayoutState, title: string, slides: ThemedSlide[]): void {
  if (title) layoutHeading(state, 1, title)
  slides.forEach((slide, index) => {
    layoutHeading(state, 2, `Slide ${index + 1}: ${slide.title}`)
    if (slide.bullets.length) layoutList(state, false, slide.bullets)
  })
}

function layoutBlock(state: LayoutState, block: PdfBlock): void {
  switch (block.type) {
    case "heading":
      return layoutHeading(state, block.level, block.text)
    case "paragraph":
      return drawParagraph(state, block.text, { x: state.margin, width: state.contentWidth, font: "helvetica", size: BODY_SIZE, lineHeight: BODY_LINE_HEIGHT, spaceAfter: 8 })
    case "list":
      return layoutList(state, block.ordered, block.items)
    case "table":
      return layoutTable(state, block.headers, block.rows, block.align)
    case "code":
      return layoutCode(state, block.code, block.language)
    case "quote":
      return layoutQuote(state, block.text)
    case "divider":
      return layoutDivider(state)
    case "image":
      return layoutImage(state, block.alt, block.url)
    case "callout":
      return layoutCallout(state, block.tone, block.text)
    case "quiz":
      return layoutQuiz(state, block.title, block.questions)
    case "slideOutline":
      return layoutSlideOutline(state, block.title, block.slides)
    default:
      return
  }
}

// ---------------------------------------------------------------------------
// Document layout
// ---------------------------------------------------------------------------

interface ResolvedOptions {
  title: string
  blocks: PdfBlock[]
  pageWidth: number
  pageHeight: number
  margin: number
  contentWidth: number
  footer: boolean
  createdAt: Date
}

function resolveOptions(input: BuildPdfInput): ResolvedOptions {
  const size = PDF_PAGE_SIZES[input.pageSize === "a4" ? "a4" : "letter"]
  const requested = Number.isFinite(input.margin) ? Number(input.margin) : PDF_DEFAULT_MARGIN
  // A margin that leaves less than 72pt of text width is not a document; the
  // clamp keeps the pagination maths sound for any caller value.
  const margin = Math.min(Math.max(requested, 12), Math.max(12, (size.width - 72) / 2))
  const createdAt = input.createdAt instanceof Date && Number.isFinite(input.createdAt.getTime()) ? input.createdAt : PDF_REPLACEMENT_DATE

  return {
    title: typeof input.title === "string" ? input.title.trim() : "",
    blocks: Array.isArray(input.blocks) ? input.blocks : [],
    pageWidth: size.width,
    pageHeight: size.height,
    margin,
    contentWidth: size.width - margin * 2,
    footer: input.footer !== false,
    createdAt,
  }
}

/** The `Page n of m` line, centred on the page and below the bottom margin. */
function layoutFooters(pages: string[][], options: ResolvedOptions): void {
  pages.forEach((ops, index) => {
    const label = `Page ${index + 1} of ${pages.length}`
    const x = (options.pageWidth - measurePdfText(label, "helvetica", FOOTER_SIZE)) / 2
    ops.push(
      "BT",
      `/${FONT_RESOURCES.helvetica} ${num(FOOTER_SIZE)} Tf`,
      fillColor(MUTED),
      `1 0 0 1 ${num(x)} ${num(options.margin * 0.45)} Tm`,
      `(${pdfString(label)}) Tj`,
      "ET",
    )
  })
}

function layoutDocument(options: ResolvedOptions): string[][] {
  const state: LayoutState = {
    pageWidth: options.pageWidth,
    pageHeight: options.pageHeight,
    margin: options.margin,
    contentWidth: options.contentWidth,
    contentBottom: options.margin,
    pages: [],
    page: [],
    y: 0,
  }
  beginPage(state)

  // The first page opens with the document title above a rule, the way the HTML
  // and DOCX renderers both lead with it.
  for (const line of wrapProse(options.title || "Untitled", "helvetica-bold", TITLE_SIZE, options.contentWidth)) {
    ensureSpace(state, TITLE_LINE_HEIGHT)
    drawLineOfText(state, line, options.margin, "helvetica-bold", TITLE_SIZE, INK)
    state.y -= TITLE_LINE_HEIGHT
  }
  state.y += 4
  drawRule(state, options.margin, state.y, options.margin + options.contentWidth, state.y, 0.8, RULE)
  state.y -= 24

  for (const block of options.blocks) layoutBlock(state, block)

  if (options.footer) layoutFooters(state.pages, options)

  return state.pages
}

// ---------------------------------------------------------------------------
// Deck layout
// ---------------------------------------------------------------------------

/** A slide as the layout consumes it: sane strings, always at least one page. */
interface DeckSlide {
  title: string
  bullets: string[]
}

/** One bullet's wrapped lines; `marker` is drawn on the first line only. */
interface PendingBullet {
  lines: string[]
  marker: boolean
}

function resolveDeckOptions(input: BuildDeckPdfInput): ResolvedOptions {
  const createdAt = input.createdAt instanceof Date && Number.isFinite(input.createdAt.getTime()) ? input.createdAt : PDF_REPLACEMENT_DATE
  return {
    title: typeof input.title === "string" ? input.title.trim() : "",
    blocks: [],
    pageWidth: PDF_DECK_PAGE_SIZE.width,
    pageHeight: PDF_DECK_PAGE_SIZE.height,
    margin: PDF_DECK_MARGIN,
    contentWidth: PDF_DECK_PAGE_SIZE.width - PDF_DECK_MARGIN * 2,
    footer: input.footer !== false,
    createdAt,
  }
}

/**
 * Slides -> the strings this writer can draw. A deck with no slide at all still
 * becomes one page titled after the deck: a page tree with no kids is not a
 * document a reader will open.
 */
function resolveDeckSlides(slides: PdfDeckSlide[] | undefined, deckTitle: string): DeckSlide[] {
  const list = Array.isArray(slides) ? slides : []
  const resolved = list.map((slide, index) => ({
    title: typeof slide?.title === "string" && slide.title.trim() ? slide.title.trim() : `Slide ${index + 1}`,
    bullets: Array.isArray(slide?.bullets)
      ? slide.bullets.filter((bullet): bullet is string => typeof bullet === "string").map((bullet) => bullet.trim()).filter(Boolean)
      : [],
  }))
  return resolved.length ? resolved : [{ title: deckTitle || "Untitled", bullets: [] }]
}

/** One wrapped, indented bullet at the deck's body scale. */
function drawDeckBullet(state: LayoutState, bullet: PendingBullet): void {
  bullet.lines.forEach((line, lineIndex) => {
    if (lineIndex === 0 && bullet.marker) drawLineOfText(state, "•", state.margin, "helvetica", DECK_BULLET_SIZE, MUTED)
    drawLineOfText(state, line, state.margin + DECK_BULLET_INDENT, "helvetica", DECK_BULLET_SIZE, INK)
    state.y -= DECK_BULLET_LINE_HEIGHT
  })
}

/** The slide title in bold, above the short accent rule that marks a deck page. */
function drawDeckHeading(state: LayoutState, title: string): void {
  for (const line of wrapProse(title, "helvetica-bold", DECK_TITLE_SIZE, state.contentWidth)) {
    ensureSpace(state, DECK_TITLE_LINE_HEIGHT)
    drawLineOfText(state, line, state.margin, "helvetica-bold", DECK_TITLE_SIZE, INK)
    state.y -= DECK_TITLE_LINE_HEIGHT
  }
  state.y += 4
  drawRule(state, state.margin, state.y, state.margin + DECK_ACCENT_RULE_WIDTH, state.y, DECK_ACCENT_RULE_THICKNESS, DECK_ACCENT)
  state.y -= DECK_TITLE_SPACE_AFTER
}

/** `i / n` at the foot of the page: the deck's own footer, not `Page n of m`. */
function drawDeckSlideNumber(state: LayoutState, label: string, enabled: boolean): void {
  if (!enabled) return
  const x = state.pageWidth - state.margin - measurePdfText(label, "helvetica", DECK_SLIDE_NUMBER_SIZE)
  drawLineOfText(state, label, x, "helvetica", DECK_SLIDE_NUMBER_SIZE, MUTED, state.margin * 0.45)
}

/**
 * Lay the deck out one slide per page, in slide order.
 *
 * Bullets are queued as wrapped groups rather than as bullets, so a page break
 * can land between the lines of one long bullet without losing the rest of it.
 * When a slide runs out of page the remaining lines continue on an extra page
 * headed `<title> (cont.)` — the text is never clipped and never dropped. A
 * slide with no bullets is still a page: the title alone is a slide.
 */
function layoutDeck(options: ResolvedOptions, slides: DeckSlide[]): string[][] {
  const state: LayoutState = {
    pageWidth: options.pageWidth,
    pageHeight: options.pageHeight,
    margin: options.margin,
    contentWidth: options.contentWidth,
    contentBottom: options.margin,
    pages: [],
    page: [],
    y: 0,
  }

  slides.forEach((slide, index) => {
    beginPage(state)
    drawDeckHeading(state, slide.title)

    const pending: PendingBullet[] = slide.bullets.map((bullet) => ({
      lines: wrapProse(bullet, "helvetica", DECK_BULLET_SIZE, state.contentWidth - DECK_BULLET_INDENT),
      marker: true,
    }))

    while (pending.length) {
      const bullet = pending[0]
      const capacity = Math.floor((state.y - state.contentBottom) / DECK_BULLET_LINE_HEIGHT)

      if (capacity >= bullet.lines.length) {
        drawDeckBullet(state, bullet)
        pending.shift()
        continue
      }

      // What fits is drawn here; the rest is carried to a continuation page. A
      // fresh page always has room for at least one line, so each pass either
      // finishes a bullet or starts a page — the loop cannot stall.
      if (capacity > 0) {
        drawDeckBullet(state, { lines: bullet.lines.slice(0, capacity), marker: bullet.marker })
        pending[0] = { lines: bullet.lines.slice(capacity), marker: false }
      }
      beginPage(state)
      drawDeckHeading(state, `${slide.title}${DECK_CONTINUATION_SUFFIX}`)
    }

    drawDeckSlideNumber(state, `${index + 1} / ${slides.length}`, options.footer)
  })

  return state.pages
}

// ---------------------------------------------------------------------------
// Serialisation
// ---------------------------------------------------------------------------

/** `D:YYYYMMDDHHmmSSZ` — the PDF date form, always UTC, never local time. */
function pdfDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0")
  return [
    `D:${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`,
    `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`,
  ].join("")
}

/**
 * Object numbers are fixed, which is what lets a page object reference the
 * fonts by number:
 *
 *   1 catalogue · 2 page tree · 3 Helvetica · 4 Helvetica-Bold · 5 Courier
 *   6 document info · 7 + 2i page i · 8 + 2i page i's content stream
 */
const CATALOG_OBJECT = 1
const PAGE_TREE_OBJECT = 2
const FIRST_FONT_OBJECT = 3
const INFO_OBJECT = 6
const FIRST_PAGE_OBJECT = 7

function fontObjects(): string[] {
  return (["helvetica", "helvetica-bold", "courier"] as const).map(
    (font) => `<< /Type /Font /Subtype /Type1 /BaseFont /${FONT_BASE_NAMES[font]} /Encoding /WinAnsiEncoding >>`,
  )
}

function infoObject(options: ResolvedOptions): string {
  return [
    "<<",
    `/Title (${pdfString(options.title || "Untitled")})`,
    "/Producer (LEARN)",
    "/Creator (LEARN)",
    `/CreationDate (${pdfDate(options.createdAt)})`,
    ">>",
  ].join(" ")
}

function pageObject(options: ResolvedOptions, contentsObject: number): string {
  return [
    "<<",
    "/Type /Page",
    `/Parent ${PAGE_TREE_OBJECT} 0 R`,
    `/MediaBox [0 0 ${num(options.pageWidth)} ${num(options.pageHeight)}]`,
    "/Resources <<",
    `/Font << /F1 ${FIRST_FONT_OBJECT} 0 R /F2 ${FIRST_FONT_OBJECT + 1} 0 R /F3 ${FIRST_FONT_OBJECT + 2} 0 R >>`,
    "/ProcSet [/PDF /Text]",
    ">>",
    `/Contents ${contentsObject} 0 R`,
    ">>",
  ].join(" ")
}

/**
 * Assemble the file and compute the cross-reference table.
 *
 * Offsets are accumulated as bodies are appended: an entry's value is the
 * character index where its `N 0 obj` line begins, which is the byte index
 * because every body is ASCII or already converted to WinAnsi. `startxref` is
 * the same accumulation stopped at the `xref` keyword.
 */
function serialize(options: ResolvedOptions, pageStreams: string[]): Uint8Array {
  const bodies: string[] = []
  const kids = pageStreams.map((_, index) => `${FIRST_PAGE_OBJECT + index * 2} 0 R`)

  bodies.push(`<< /Type /Catalog /Pages ${PAGE_TREE_OBJECT} 0 R >>`)
  bodies.push(`<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pageStreams.length} >>`)
  bodies.push(...fontObjects())
  bodies.push(infoObject(options))

  pageStreams.forEach((stream, index) => {
    const pageObjectNumber = FIRST_PAGE_OBJECT + index * 2
    bodies.push(pageObject(options, pageObjectNumber + 1))
    // `/Length` counts the bytes between `stream` and `endstream`, which is the
    // stream text without the newline this writer puts after it.
    bodies.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
  })

  let body = `${PDF_VERSION}\n%\u00e2\u00e3\u00cf\u00d3\n` // the binary marker comment
  const offsets: number[] = []

  bodies.forEach((object, index) => {
    offsets.push(body.length)
    body += `${index + 1} 0 obj\n${object}\nendobj\n`
  })

  const xrefOffset = body.length
  // Every entry is exactly 20 bytes: 10-digit offset, space, 5-digit
  // generation, space, type, space, newline.
  const entries = [`0000000000 65535 f `, ...offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n `)]
  const xref = `xref\n0 ${bodies.length + 1}\n${entries.join("\n")}\n`
  const trailer = `trailer\n<< /Size ${bodies.length + 1} /Root ${CATALOG_OBJECT} 0 R /Info ${INFO_OBJECT} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`

  return latin1Bytes(body + xref + trailer)
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/** Serialize blocks into a complete PDF file. */
export function buildPdf(input: BuildPdfInput): Uint8Array {
  const options = resolveOptions(input)
  const pages = layoutDocument(options)
  return serialize(
    options,
    pages.map((ops) => ops.join("\n")),
  )
}

/**
 * Serialize a deck into a complete PDF file: one landscape 16:9 page per slide,
 * in slide order, with a slide whose bullets do not fit continued onto further
 * pages. It shares this module's whole skeleton — the same fonts, width table,
 * escaping, object numbering and xref construction as `buildPdf`, over the deck
 * layout instead of the block layout — so there is one PDF writer, not two.
 */
export function buildDeckPdf(input: BuildDeckPdfInput): Uint8Array {
  const options = resolveDeckOptions(input)
  const slides = resolveDeckSlides(input.slides, options.title)
  const pages = layoutDeck(options, slides)
  return serialize(
    options,
    pages.map((ops) => ops.join("\n")),
  )
}
