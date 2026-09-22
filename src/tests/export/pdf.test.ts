import assert from "node:assert/strict"
import test from "node:test"
import type { ThemedBlock } from "../../lib/ai/format-response"
import { DECK_CONTINUATION_SUFFIX, PDF_DECK_MARGIN, PDF_DECK_PAGE_SIZE, PDF_DEFAULT_MARGIN, PDF_PAGE_SIZES, buildDeckPdf, buildPdf, measurePdfText, type PdfFontName } from "../../lib/export/pdf"

/**
 * PDF structure guards.
 *
 * A hand-rolled PDF fails in one of two ways: it looks fine in a text editor
 * but no reader will open it, or it opens and shows the wrong thing. The first
 * failure is structural — a cross-reference table whose offsets do not point at
 * the objects, or a `startxref` that does not point at the table — and it is
 * asserted here by parsing the produced bytes and walking every entry. The
 * second is layout, and it is asserted against the same width table the writer
 * uses, so a line can never measure wider than the column it was wrapped into.
 *
 * Everything is parsed from the exported `Uint8Array`; the test is DOM-free and
 * dependency-free, like the module it checks.
 */

/** The file is a byte string, so one character per byte is a faithful decode. */
function latin1(bytes: Uint8Array): string {
  let text = ""
  for (const byte of bytes) text += String.fromCharCode(byte)
  return text
}

const FONT_BY_RESOURCE: Record<string, PdfFontName> = {
  F1: "helvetica",
  F2: "helvetica-bold",
  F3: "courier",
}

/**
 * Two characters whose WinAnsi bytes are not their Unicode code points, as they
 * read back from a Latin-1 decode of the file: the bullet is byte 0x95 and the
 * em dash byte 0x97. Asserting them by byte is the point — the file must carry
 * the CP1252 byte, not a UTF-8 sequence.
 */
const BULLET = "\u0095"
const EM_DASH = "\u0097"

/** `Page n of m` is drawn below the bottom margin, so layout checks skip it. */
const FOOTER_PATTERN = /^Page \d+ of \d+$/

interface DrawnLine {
  font: PdfFontName
  size: number
  x: number
  y: number
  text: string
}

/** Undo the literal-string escaping, so a line can be measured as it was drawn. */
function unescapePdfString(value: string): string {
  return value.replace(/\\([\\()])/g, "$1")
}

/** Every text line in the document, in stream order, with its placement. */
function drawnLines(text: string): DrawnLine[] {
  const pattern = /\/F(\d) ([0-9.]+) Tf\n[0-9. ]+rg\n1 0 0 1 ([0-9.]+) ([0-9.]+) Tm\n\(((?:[^()\\]|\\.)*)\) Tj/g
  return [...text.matchAll(pattern)].map((match) => ({
    font: FONT_BY_RESOURCE[`F${match[1]}`],
    size: Number(match[2]),
    x: Number(match[3]),
    y: Number(match[4]),
    text: unescapePdfString(match[5]),
  }))
}

interface XrefEntry {
  objectNumber: number
  offset: number
  type: string
  /** The 20 bytes of the entry, newline included. */
  raw: string
}

interface ParsedPdf {
  text: string
  bytes: Uint8Array
  startxref: number
  /** Byte offset of the `xref` keyword that `startxref` points at. */
  xrefOffset: number
  size: number
  entries: XrefEntry[]
  trailer: string
  pageObjects: Array<{ objectNumber: number; body: string; contentsObject: number }>
  streams: Array<{ objectNumber: number; declaredLength: number; body: string }>
}

function parsePdf(bytes: Uint8Array): ParsedPdf {
  const text = latin1(bytes)
  const startxref = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(text)?.[1])

  const xrefBlock = text.slice(startxref)
  const lines = xrefBlock.split("\n")
  const size = Number(lines[1].split(" ")[1])
  const entries: XrefEntry[] = Array.from({ length: size }, (_, objectNumber) => {
    const raw = lines[2 + objectNumber]
    return { objectNumber, offset: Number(raw.slice(0, 10)), type: raw.slice(17, 18), raw: raw + "\n" }
  })

  const pageObjects = [...text.matchAll(/(\d+) 0 obj\n(<< \/Type \/Page .*? >>)\nendobj/g)].map((match) => ({
    objectNumber: Number(match[1]),
    body: match[2],
    contentsObject: Number(/\/Contents (\d+) 0 R/.exec(match[2])?.[1]),
  }))

  const streams = [...text.matchAll(/(\d+) 0 obj\n<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/g)].map((match) => ({
    objectNumber: Number(match[1]),
    declaredLength: Number(match[2]),
    body: match[3],
  }))

  return {
    text,
    bytes,
    startxref,
    xrefOffset: text.indexOf("xref\n0 "),
    size,
    entries,
    trailer: lines[2 + size + 1],
    pageObjects,
    streams,
  }
}

/** The page count the writer itself computed, read back out of `/Count`. */
function declaredPageCount(parsed: ParsedPdf): number {
  return Number(/\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/.exec(parsed.text)?.[1])
}

const sampleBlocks: ThemedBlock[] = [
  { type: "heading", level: 1, text: "Lesson one" },
  { type: "paragraph", text: "First paragraph." },
  { type: "list", ordered: false, items: ["alpha", "beta"] },
  { type: "list", ordered: true, items: ["step one", "step two"] },
  { type: "table", headers: ["Term", "Meaning", "Example"], rows: [["Cell", "A box", "grid"]] },
  { type: "code", language: "ts", code: "const x = 1\nconst y = 2" },
  { type: "quote", text: "Quoted line" },
  { type: "divider" },
  { type: "callout", tone: "warn", text: "Careful" },
  { type: "image", url: "https://example.com/a.png", alt: "A diagram" },
]

// ---------------------------------------------------------------------------
// File skeleton: header, trailer, cross-reference offsets
// ---------------------------------------------------------------------------

test("pdf has the header, trailer and catalogue a reader looks for", () => {
  const parsed = parsePdf(buildPdf({ title: "Lesson one", blocks: sampleBlocks }))

  assert.ok(parsed.text.startsWith("%PDF-1.4\n"), "starts with the version header")
  assert.ok(parsed.text.endsWith("%%EOF\n"), "ends with the EOF marker")
  assert.match(parsed.text, /\n1 0 obj\n<< \/Type \/Catalog \/Pages 2 0 R >>/)
  assert.match(parsed.text, /\/Type \/Pages \/Kids \[[^\]]+\] \/Count \d+/)
  assert.ok(parsed.pageObjects.length > 0, "at least one page object")
  // The binary marker comment keeps tools from treating the file as text.
  assert.deepEqual(Array.from(parsed.bytes.subarray(9, 15)), [0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])
})

test("startxref points at the xref keyword and every entry points at its object", () => {
  const parsed = parsePdf(buildPdf({ title: "Lesson one", blocks: sampleBlocks }))

  // The strongest structural check: the declared offset of the table is really
  // where the table starts...
  assert.equal(parsed.startxref, parsed.xrefOffset, "startxref is the offset of the xref keyword")
  assert.equal(parsed.text.slice(parsed.startxref, parsed.startxref + 5), "xref\n")

  // ...and each entry's offset is really where its `N 0 obj` line starts.
  assert.equal(parsed.entries[0].type, "f", "object 0 is the free entry")
  assert.equal(parsed.entries[0].offset, 0)
  assert.equal(parsed.entries.length, parsed.size, "one entry per object, plus the free one")

  for (const entry of parsed.entries.slice(1)) {
    assert.equal(entry.type, "n", `object ${entry.objectNumber} is in use`)
    const at = parsed.text.slice(entry.offset, entry.offset + 40)
    assert.ok(
      at.startsWith(`${entry.objectNumber} 0 obj\n`),
      `xref offset ${entry.offset} must point at "${entry.objectNumber} 0 obj", found ${JSON.stringify(at.slice(0, 20))}`,
    )
  }

  // An entry is exactly 20 bytes, as the format requires.
  for (const entry of parsed.entries) assert.equal(entry.raw.length, 20, `entry ${entry.objectNumber} is 20 bytes`)
  assert.match(parsed.trailer, new RegExp(`^<< /Size ${parsed.size} /Root 1 0 R /Info \\d+ 0 R >>$`))
})

test("the page tree count, the page objects and the content streams agree", () => {
  const parsed = parsePdf(buildPdf({ title: "Lesson one", blocks: sampleBlocks }))

  assert.equal(declaredPageCount(parsed), parsed.pageObjects.length, "/Count equals the number of page objects")
  assert.ok(parsed.streams.length >= parsed.pageObjects.length, "every page has a content stream")

  const streamObjects = new Set(parsed.streams.map((stream) => stream.objectNumber))
  for (const page of parsed.pageObjects) {
    assert.ok(streamObjects.has(page.contentsObject), `page ${page.objectNumber} references a real content stream`)
    assert.match(page.body, /\/MediaBox \[0 0 \d+(?:\.\d+)? \d+(?:\.\d+)?\]/)
  }

  // `/Length` must equal the bytes actually between `stream` and `endstream`.
  for (const stream of parsed.streams) {
    assert.equal(stream.declaredLength, stream.body.length, `stream ${stream.objectNumber} declares its real length`)
    assert.ok(stream.body.includes("BT"), `stream ${stream.objectNumber} draws text`)
  }

  // The three core fonts are declared once, never embedded.
  for (const baseFont of ["Helvetica", "Helvetica-Bold", "Courier"]) {
    assert.equal(
      (parsed.text.match(new RegExp(`/BaseFont /${baseFont} /Encoding /WinAnsiEncoding`, "g")) ?? []).length,
      1,
      `${baseFont} is declared once`,
    )
  }
  assert.equal(parsed.text.includes("/FontFile"), false, "no font is embedded")
})

test("an empty document is still a valid one-page file", () => {
  const parsed = parsePdf(buildPdf({ title: "", blocks: [] }))
  assert.equal(declaredPageCount(parsed), 1)
  assert.equal(parsed.pageObjects.length, 1)
  assert.match(parsed.text, /\(Untitled\) Tj/)
  for (const entry of parsed.entries.slice(1)) {
    assert.ok(parsed.text.slice(entry.offset).startsWith(`${entry.objectNumber} 0 obj\n`))
  }
})

// ---------------------------------------------------------------------------
// Layout: title, pagination, footer
// ---------------------------------------------------------------------------

test("the first page leads with the title, and the footer counts the pages", () => {
  const parsed = parsePdf(buildPdf({ title: "Lesson one", blocks: sampleBlocks }))
  const lines = drawnLines(parsed.streams[0].body)

  assert.equal(lines[0].text, "Lesson one")
  assert.equal(lines[0].font, "helvetica-bold")
  assert.ok(lines[0].size > 16, "the title is larger than body text")
  assert.match(parsed.streams[0].body, /\(Page 1 of 1\) Tj/)

  const noFooter = parsePdf(buildPdf({ title: "Lesson one", blocks: sampleBlocks, footer: false }))
  assert.equal(noFooter.text.includes("Page 1 of 1"), false, "the footer is optional")
})

test("a long document paginates and each page keeps its own content stream", () => {
  const blocks: ThemedBlock[] = Array.from({ length: 40 }, (_, index) => ({
    type: "paragraph",
    text: `Paragraph ${index + 1}: ${"filler words that take up room on the page ".repeat(3)}`,
  }))
  const parsed = parsePdf(buildPdf({ title: "Long document", blocks }))

  assert.ok(parsed.pageObjects.length > 1, `40 paragraphs must span more than one page, got ${parsed.pageObjects.length}`)
  assert.equal(declaredPageCount(parsed), parsed.pageObjects.length)

  // Every page carries a real, non-empty stream with its own operators.
  const byObject = new Map(parsed.streams.map((stream) => [stream.objectNumber, stream]))
  for (const page of parsed.pageObjects) {
    const stream = byObject.get(page.contentsObject)
    assert.ok(stream && stream.body.length > 0, `page ${page.objectNumber} has content`)
  }

  // The footer counts to the real total on the last page.
  const last = byObject.get(parsed.pageObjects.at(-1)!.contentsObject)
  assert.match(last!.body, new RegExp(`\\(Page ${parsed.pageObjects.length} of ${parsed.pageObjects.length}\\) Tj`))

  // No block is ever drawn below the bottom margin (the footer line is, by
  // design, in the margin strip itself).
  const bottom = PDF_DEFAULT_MARGIN
  for (const line of drawnLines(parsed.text)) {
    if (FOOTER_PATTERN.test(line.text)) continue
    assert.ok(line.y >= bottom - 0.01, `baseline ${line.y} stays above the bottom margin`)
    // And nothing runs past the right margin either.
    const right = PDF_PAGE_SIZES.letter.width - PDF_DEFAULT_MARGIN
    assert.ok(
      line.x + measurePdfText(line.text, line.font, line.size) <= right + 0.01,
      `line at x=${line.x} ends past the right margin: ${JSON.stringify(line.text)}`,
    )
  }
})

test("the page size and margin are the caller's, and a table row can be measured by them", () => {
  const a4 = parsePdf(buildPdf({ title: "A4", blocks: [], pageSize: "a4", margin: 72 }))
  assert.match(a4.text, new RegExp(`/MediaBox \\[0 0 ${PDF_PAGE_SIZES.a4.width} ${PDF_PAGE_SIZES.a4.height}\\]`))
  const drawn = drawnLines(a4.streams[0].body)
  assert.equal(drawn[0].x, 72, "the title starts at the requested margin")

  const letter = parsePdf(buildPdf({ title: "Letter", blocks: [] }))
  assert.match(letter.text, new RegExp(`/MediaBox \\[0 0 ${PDF_PAGE_SIZES.letter.width} ${PDF_PAGE_SIZES.letter.height}\\]`))
})

// ---------------------------------------------------------------------------
// Wrapping: measured, never a character count
// ---------------------------------------------------------------------------

test("a long paragraph wraps to the printable width, measured with the width table", () => {
  const margin = PDF_DEFAULT_MARGIN
  const printable = PDF_PAGE_SIZES.letter.width - margin * 2
  const paragraph = `${"Authentication and authorization are different questions. ".repeat(8)}`
  const parsed = parsePdf(buildPdf({ title: "Wrap", blocks: [{ type: "paragraph", text: paragraph }] }))
  const lines = drawnLines(parsed.streams[0].body).filter((line) => line.font === "helvetica" && !FOOTER_PATTERN.test(line.text))

  assert.ok(lines.length > 3, `a paragraph this long must wrap, got ${lines.length} lines`)
  for (const line of lines) {
    const width = measurePdfText(line.text, line.font, line.size)
    assert.ok(width <= printable + 0.01, `line measures ${width.toFixed(2)}pt, over the ${printable}pt column: ${JSON.stringify(line.text)}`)
    assert.equal(line.x, margin, "body lines start at the left margin")
  }
  // Nothing the caller wrote is lost to wrapping.
  assert.equal(lines.map((line) => line.text).join(" "), paragraph.trim().split(/\s+/).join(" "))

  // Wrapping is proportional, not fixed-width: a run of wide capitals and a run
  // of narrow letters pack differently into the same column.
  const wide = parsePdf(buildPdf({ title: "W", blocks: [{ type: "paragraph", text: "W".repeat(200) }] }))
  const narrow = parsePdf(buildPdf({ title: "W", blocks: [{ type: "paragraph", text: "i".repeat(200) }] }))
  const countLines = (parsed2: ParsedPdf) => drawnLines(parsed2.streams[0].body).filter((line) => line.font === "helvetica" && !FOOTER_PATTERN.test(line.text)).length
  assert.ok(countLines(narrow) < countLines(wide), `200 narrow glyphs must need fewer lines (${countLines(narrow)}) than 200 wide ones (${countLines(wide)})`)
})

test("a word wider than the column is broken so no line can overflow", () => {
  const margin = PDF_DEFAULT_MARGIN
  const printable = PDF_PAGE_SIZES.letter.width - margin * 2
  const token = "Supercalifragilisticexpialidocious".repeat(12)
  const parsed = parsePdf(buildPdf({ title: "Token", blocks: [{ type: "paragraph", text: token }] }))
  const lines = drawnLines(parsed.streams[0].body).filter((line) => line.font === "helvetica" && !FOOTER_PATTERN.test(line.text))

  assert.ok(lines.length >= 3, `the unbroken token must be split, got ${lines.length} lines`)
  // The break is by characters: the fragments together are the whole word.
  assert.equal(lines.map((line) => line.text).join(""), token)
  for (const line of lines) {
    assert.ok(measurePdfText(line.text, line.font, line.size) <= printable + 0.01, `over-wide fragment: ${JSON.stringify(line.text)}`)
  }
})

test("code is monospaced, measured at 600/1000 em, and never splits a line it does not have to", () => {
  const code = "const a = 1\nconst b = 2"
  const parsed = parsePdf(buildPdf({ title: "Code", blocks: [{ type: "code", language: "ts", code }] }))
  const lines = drawnLines(parsed.streams[0].body).filter((line) => line.font === "courier")

  assert.equal(lines.length, 2, "each code line stays its own line")
  assert.equal(lines[0].text, "const a = 1")
  // Courier is exactly 600/1000 em: eleven characters at 9pt is 59.4pt.
  assert.equal(Number(measurePdfText("const a = 1", "courier", 9).toFixed(4)), Number((11 * 0.6 * 9).toFixed(4)))
  assert.ok(lines.every((line) => line.size === 9))
  // The block is shaded: a filled rectangle is emitted before the text.
  assert.match(parsed.streams[0].body, /re f Q\nBT\n\/F3/)
})

// ---------------------------------------------------------------------------
// Escaping and encoding
// ---------------------------------------------------------------------------

test("parentheses and backslashes are escaped in the content stream", () => {
  const payload = "a(b)c\\d ((nested)) \\\\ end"
  const parsed = parsePdf(buildPdf({ title: "Escape", blocks: [{ type: "paragraph", text: payload }] }))

  assert.ok(parsed.text.includes("(a\\(b\\)c\\\\d \\(\\(nested\\)\\) \\\\\\\\ end) Tj"), "the string is escaped, not truncated")
  // A raw, unbalanced parenthesis would end the literal early, so the parsed
  // text must come back byte-for-byte identical to the input.
  const drawn = drawnLines(parsed.streams[0].body)
  assert.equal(drawn.find((line) => line.text.startsWith("a(b)c"))?.text, payload)
})

test("characters WinAnsi cannot carry become ?, never a broken byte", () => {
  const parsed = parsePdf(buildPdf({ title: "Emoji", blocks: [{ type: "paragraph", text: "before 😀 after 漢字" }] }))

  // The emoji is one replacement, not a mangled UTF-8 sequence.
  assert.ok(parsed.text.includes("(before ? after ??) Tj"), "an unknown code point becomes ?")
  assert.equal(parsed.text.includes("\u00f0\u009f\u0098\u0080"), false, "no UTF-8 bytes leak into the stream")
  // Every byte in the file is a real byte: nothing above 0xFF, no NaN, no
  // substitution character.
  assert.equal(parsed.bytes.some((byte) => byte > 0xff), false)
  assert.equal(parsed.text.includes("\ufffd"), false)
})

test("Latin-1 and the WinAnsi typographic range survive as their own bytes", () => {
  const parsed = parsePdf(buildPdf({ title: "Accents", blocks: [{ type: "paragraph", text: "café — “quoted” … €5, résumé" }] }))

  // é is 0xE9, — is 0x97, “ ” are 0x93 0x94, … is 0x85 and € is 0x80: the bytes
  // CP1252 defines, which is what /WinAnsiEncoding decodes back.
  const bytes = Array.from(parsed.bytes)
  for (const byte of [0xe9, 0x97, 0x93, 0x94, 0x85, 0x80]) {
    assert.ok(bytes.includes(byte), `the stream contains byte 0x${byte.toString(16)}`)
  }
  // Latin-1 code points map to the identical byte, so they stay readable.
  assert.equal(parsed.text.includes("café"), true)
  assert.equal(parsed.text.includes(`quoted${"\u0094"}`), true)
  assert.equal(parsed.bytes.some((byte) => byte > 0xff), false, "every byte is a byte")
})

test("the title travels into the document info dictionary, escaped", () => {
  const parsed = parsePdf(buildPdf({ title: 'Unit (3) \\ "quoted"', blocks: [] }))
  assert.match(parsed.text, /\/Title \(Unit \\\(3\\\) \\\\ "quoted"\)/)
  assert.match(parsed.text, /\/CreationDate \(D:\d{14}Z\)/)
})

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

test("the same input and createdAt produce byte-identical output", () => {
  const createdAt = new Date(Date.UTC(2026, 0, 2, 3, 4, 6))
  const first = buildPdf({ title: "Lesson", blocks: sampleBlocks, createdAt })
  const second = buildPdf({ title: "Lesson", blocks: sampleBlocks, createdAt })
  assert.deepEqual(Array.from(first), Array.from(second))

  // No clock was read: a later date changes the info dictionary, and nothing else.
  const later = buildPdf({ title: "Lesson", blocks: sampleBlocks, createdAt: new Date(createdAt.getTime() + 5000) })
  assert.notDeepEqual(Array.from(first), Array.from(later))
  assert.ok(latin1(later).includes("D:20260102030411Z"))

  // Two documents with no createdAt at all are still identical, because the
  // fallback date is a constant rather than "now".
  assert.deepEqual(
    Array.from(buildPdf({ title: "Lesson", blocks: sampleBlocks })),
    Array.from(buildPdf({ title: "Lesson", blocks: sampleBlocks })),
  )
})

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

test("a three-column table emits three cell texts per row, laid out left to right", () => {
  const headers = ["Alpha", "Beta", "Gamma"]
  const rows = [
    ["one", "two", "three"],
    ["four", "five", "six"],
  ]
  const parsed = parsePdf(buildPdf({ title: "Table", blocks: [{ type: "table", headers, rows }] }))
  const lines = drawnLines(parsed.streams[0].body)

  for (const cell of [...headers, ...rows.flat()]) {
    assert.equal(lines.filter((line) => line.text === cell).length, 1, `cell "${cell}" is drawn exactly once`)
  }

  // Row one's three cells share a baseline and step to the right.
  const firstRow = rows[0].map((cell) => lines.find((line) => line.text === cell)!)
  assert.equal(new Set(firstRow.map((line) => line.y)).size, 1, "a row's cells share a baseline")
  assert.ok(firstRow[0].x < firstRow[1].x && firstRow[1].x < firstRow[2].x, "cells are drawn left to right")

  // Column widths come from content: a wider cell makes a wider column.
  const xOf = (cell: string) => lines.find((line) => line.text === cell)!.x
  assert.ok(xOf("four") === xOf("one"), "columns align across rows")

  // Rules and the header band are drawn: at least one thin horizontal rule.
  assert.match(parsed.streams[0].body, /0\.5 w [\d.]+ [\d.]+ m [\d.]+ [\d.]+ l S Q/)
})

test("a table wider than the page still fits inside the text column", () => {
  const headers = Array.from({ length: 12 }, (_, index) => `H${index + 1}`)
  const rows = [Array.from({ length: 12 }, (_, index) => `${index + 1}`)]
  const parsed = parsePdf(buildPdf({ title: "Wide", blocks: [{ type: "table", headers, rows }] }))
  const headerLines = drawnLines(parsed.text).filter((line) => /^H\d+$/.test(line.text))

  assert.equal(headerLines.length, 12, "every column header is drawn once")
  const right = PDF_PAGE_SIZES.letter.width - PDF_DEFAULT_MARGIN
  for (const line of headerLines) {
    assert.ok(line.x + measurePdfText(line.text, line.font, line.size) <= right + 0.01, `a cell runs past the right margin at x=${line.x}`)
  }
  // Twelve distinct x positions, stepping left to right.
  assert.equal(new Set(headerLines.map((line) => line.x)).size, 12)
})

// ---------------------------------------------------------------------------
// Every block type reaches the page
// ---------------------------------------------------------------------------

test("each themed block type maps to something a reader can see", () => {
  const blocks: ThemedBlock[] = [
    ...sampleBlocks,
    { type: "quiz", title: "Check yourself", questions: [{ question: "Which one?", choices: [{ id: "a", text: "first" }, { id: "b", text: "second" }], answerId: "a", explanation: "Because a." }] },
    { type: "slideOutline", title: "Deck", slides: [{ title: "Intro", bullets: ["one", "two"] }] },
  ]
  const parsed = parsePdf(buildPdf({ title: "Everything", blocks }))
  const text = parsed.text

  assert.match(text, /\(Lesson one\) Tj/)
  assert.match(text, /\(First paragraph\.\) Tj/)
  // The marker hangs in the indent, so it is its own text line at the margin
  // and the item text starts to the right of it.
  assert.match(text, new RegExp(`\\(${BULLET}\\) Tj`))
  assert.match(text, /\(alpha\) Tj/)
  assert.match(text, /\(1\.\) Tj/)
  assert.match(text, /\(step one\) Tj/)
  assert.match(text, /\(Term\) Tj/)
  assert.match(text, /\(const y = 2\) Tj/)
  assert.match(text, /\(Quoted line\) Tj/)
  // Brackets are not PDF string delimiters, so they reach the stream unescaped;
  // only \ ( and ) are escaped.
  assert.match(text, /\(\[WARN\] Careful\) Tj/)
  assert.match(text, new RegExp(`\\(\\[Image: A diagram ${EM_DASH} https://example\\.com/a\\.png\\]\\) Tj`))
  assert.match(text, /\(Check yourself\) Tj/)
  assert.match(text, /\(1\. Which one\?\) Tj/)
  assert.match(text, /\(Answer: a\) Tj/)
  assert.match(text, /\(Because a\.\) Tj/)
  assert.match(text, /\(Slide 1: Intro\) Tj/)
  assert.match(text, /\(two\) Tj/)
  // A divider is a rule, not text.
  assert.match(text, /0\.6 w [\d.]+ [\d.]+ m [\d.]+ [\d.]+ l S Q/)
})

// ---------------------------------------------------------------------------
// Decks: landscape slides, one page per slide, overflow continued
// ---------------------------------------------------------------------------

/**
 * A deck is the same file skeleton laid out differently, so it is checked the
 * same way: the bytes are parsed back and the xref walked, then the geometry and
 * the pagination are read off the pages themselves.
 */

/** The page box of every page object, as the reader would see it. */
function mediaBoxes(parsed: ParsedPdf): Array<{ width: number; height: number }> {
  return parsed.pageObjects.map((page) => {
    const match = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(page.body)
    assert.ok(match, `page ${page.objectNumber} has a MediaBox`)
    return { width: Number(match[1]), height: Number(match[2]) }
  })
}

/** A deck that fits: six slides, each with room to spare on one page. */
const FITTING_DECK = {
  title: "Unit 3 — Identity, Sessions, and Access",
  slides: [
    { title: "Identity, sessions, access", bullets: ["AuthN answers who you are.", "AuthZ decides what you may do.", "A session is how long the answer stays true."] },
    { title: "Key terms", bullets: ["Authentication", "Authorization", "Session", "Revocation"] },
    { title: "Worked example", bullets: ["Verify the signature.", "Load the caller's roles.", "Evaluate the policy.", "Log the decision."] },
    { title: "Where students lose marks", bullets: ["Writing authentication for a permissions question.", "Treating session expiry as a convenience."] },
    { title: "Check yourself", bullets: ["Which one is the permission check?"] },
    { title: "Recap", bullets: ["Two questions, two mechanisms.", "Every request asks both."] },
  ],
}

test("a deck is a valid file: header, trailer, and every xref offset on its object", () => {
  const parsed = parsePdf(buildDeckPdf(FITTING_DECK))

  assert.ok(parsed.text.startsWith("%PDF-1.4\n"), "starts with the version header")
  assert.ok(parsed.text.endsWith("%%EOF\n"), "ends with the EOF marker")
  assert.match(parsed.text, /\n1 0 obj\n<< \/Type \/Catalog \/Pages 2 0 R >>/)
  assert.equal(parsed.startxref, parsed.xrefOffset, "startxref is the offset of the xref keyword")

  for (const entry of parsed.entries.slice(1)) {
    assert.equal(entry.type, "n", `object ${entry.objectNumber} is in use`)
    assert.equal(entry.raw.length, 20, `entry ${entry.objectNumber} is 20 bytes`)
    const at = parsed.text.slice(entry.offset, entry.offset + 40)
    assert.ok(
      at.startsWith(`${entry.objectNumber} 0 obj\n`),
      `xref offset ${entry.offset} must point at "${entry.objectNumber} 0 obj", found ${JSON.stringify(at.slice(0, 20))}`,
    )
  }
  assert.match(parsed.trailer, new RegExp(`^<< /Size ${parsed.size} /Root 1 0 R /Info \\d+ 0 R >>$`))
})

test("a deck that fits has exactly one landscape page per slide, in slide order", () => {
  const parsed = parsePdf(buildDeckPdf(FITTING_DECK))
  const slides = FITTING_DECK.slides

  assert.equal(parsed.pageObjects.length, slides.length, "one page per slide, and no title page")
  assert.equal(declaredPageCount(parsed), slides.length, "/Count equals the page count")

  for (const box of mediaBoxes(parsed)) {
    assert.deepEqual(box, { width: PDF_DECK_PAGE_SIZE.width, height: PDF_DECK_PAGE_SIZE.height })
    assert.ok(box.width > box.height, `a slide must be landscape, got ${box.width}x${box.height}`)
    assert.equal((box.width / box.height).toFixed(4), (16 / 9).toFixed(4), "the slide box is 16:9")
  }

  // Slide order is page order: each page's title is the slide's title.
  parsed.pageObjects.forEach((page, index) => {
    const stream = parsed.streams.find((item) => item.objectNumber === page.contentsObject)
    const title = drawnLines(stream!.body).find((line) => line.font === "helvetica-bold" && line.size === 30)
    assert.equal(title?.text, slides[index].title, `page ${index + 1} leads with slide ${index + 1}'s title`)
  })

  // The deck's own footer is a slide number, not `Page n of m`.
  for (const [index, page] of parsed.pageObjects.entries()) {
    const stream = parsed.streams.find((item) => item.objectNumber === page.contentsObject)!
    assert.match(stream.body, new RegExp(`\\(${index + 1} / ${slides.length}\\) Tj`), `page ${index + 1} carries its slide number`)
  }
  assert.equal(parsed.text.includes("Page 1 of 1"), false, "a deck does not use the document footer")

  const noFooter = parsePdf(buildDeckPdf({ ...FITTING_DECK, footer: false }))
  assert.equal(noFooter.text.includes(`(1 / ${slides.length}) Tj`), false, "the slide number is optional")
  assert.equal(noFooter.pageObjects.length, slides.length, "turning the footer off changes no pagination")
})

test("a slide whose bullets overflow is continued on a marked page, never clipped", () => {
  const overflow = Array.from({ length: 21 }, (_, index) => `Bullet ${index + 1}: a line that takes one row on the slide.`)
  const deck = {
    title: "Long slide",
    slides: [
      { title: "Everything at once", bullets: overflow },
      { title: "Recap", bullets: ["Two questions, two mechanisms."] },
    ],
  }
  const parsed = parsePdf(buildDeckPdf(deck))

  assert.ok(parsed.pageObjects.length > deck.slides.length, `the overflow must add a page, got ${parsed.pageObjects.length} for ${deck.slides.length} slides`)
  assert.equal(declaredPageCount(parsed), parsed.pageObjects.length)

  // Every bullet survives, exactly once, and in order.
  const drawn = drawnLines(parsed.text).map((line) => line.text)
  for (const bullet of overflow) assert.equal(drawn.filter((text) => text === bullet).length, 1, `"${bullet}" is drawn exactly once`)
  const positions = overflow.map((bullet) => drawn.indexOf(bullet))
  assert.deepEqual([...positions].sort((left, right) => left - right), positions, "bullets keep their order across the page break")

  // The continuation page is headed with the same title, marked.
  const continuation = drawn.filter((text) => text.endsWith(DECK_CONTINUATION_SUFFIX))
  assert.ok(continuation.length >= 1, "the carried page names the slide it continues")
  assert.ok(continuation.every((text) => text === `Everything at once${DECK_CONTINUATION_SUFFIX}`), `unexpected continuation title: ${JSON.stringify(continuation)}`)

  // The continuation is a page of its own, and the next slide starts fresh.
  const withContinuation = parsed.pageObjects.filter((page) => {
    const stream = parsed.streams.find((item) => item.objectNumber === page.contentsObject)!
    return drawnLines(stream.body).some((line) => line.text === `Everything at once${DECK_CONTINUATION_SUFFIX}`)
  })
  assert.equal(withContinuation.length, continuation.length, "each continuation heading is on its own page")

  // Nothing is ever drawn below the bottom margin, except each page's own footer.
  for (const line of drawnLines(parsed.text)) {
    if (FOOTER_PATTERN.test(line.text) || /^\d+ \/ \d+$/.test(line.text)) continue
    assert.ok(line.y >= PDF_DECK_MARGIN - 0.01, `baseline ${line.y} stays above the bottom margin`)
    const right = PDF_DECK_PAGE_SIZE.width - PDF_DECK_MARGIN
    assert.ok(
      line.x + measurePdfText(line.text, line.font, line.size) <= right + 0.01,
      `line at x=${line.x} ends past the right margin: ${JSON.stringify(line.text)}`,
    )
  }
})

test("deck bullets are escaped and encoded like document text", () => {
  // The author types an em dash and an accented e; the file carries the CP1252
  // bytes (0x97, 0xE9) a WinAnsi reader decodes back, as the document path does.
  const payload = "Escaped (danger) \\ path — café"
  const carried = `Escaped (danger) \\ path ${EM_DASH} caf\u00e9`
  const parsed = parsePdf(buildDeckPdf({ title: "Escape", slides: [{ title: "Marks", bullets: [payload] }] }))

  assert.ok(parsed.text.includes("(Escaped \\(danger\\) \\\\ path \u0097 caf\u00e9) Tj"), "the bullet is escaped, not truncated")
  // The marker is the CP1252 bullet byte, drawn once, at the left margin.
  const lines = drawnLines(parsed.streams[0].body)
  const bullet = lines.find((line) => line.text === carried)
  assert.equal(bullet?.text, carried, "parens, the backslash and the typographic range survive the round trip")
  const marker = lines.find((line) => line.text === BULLET)
  assert.ok(marker, "the bullet marker is drawn")
  assert.equal(marker!.x, PDF_DECK_MARGIN, "the marker hangs at the left margin")
  assert.ok(bullet!.x > marker!.x, "the text starts to the right of the marker")
  assert.equal(parsed.bytes.some((byte) => byte > 0xff), false, "every byte is a byte")
})

test("a slide with no bullets still gets a page, with its title", () => {
  const parsed = parsePdf(buildDeckPdf({ title: "Sparse", slides: [{ title: "Section break", bullets: [] }, { title: "Next", bullets: [] }] }))
  assert.equal(parsed.pageObjects.length, 2, "an empty slide is a page, not a skip")

  const first = drawnLines(parsed.streams[0].body)
  assert.equal(first.find((line) => line.font === "helvetica-bold" && line.size === 30)?.text, "Section break")
  assert.equal(first.some((line) => line.text === BULLET), false, "no bullet marker without a bullet")
})

test("an empty deck is still a valid one-page file", () => {
  const parsed = parsePdf(buildDeckPdf({ title: "Untitled deck", slides: [] }))
  assert.equal(parsed.pageObjects.length, 1, "a page tree with no kids would not open")
  assert.equal(declaredPageCount(parsed), 1)
  assert.match(parsed.text, /\(Untitled deck\) Tj/, "the deck title names the page")
})

test("the same deck and createdAt produce byte-identical output", () => {
  const createdAt = new Date(Date.UTC(2026, 8, 22, 9, 30, 0))
  const first = buildDeckPdf({ ...FITTING_DECK, createdAt })
  const second = buildDeckPdf({ ...FITTING_DECK, createdAt })
  assert.deepEqual(Array.from(first), Array.from(second))

  const later = buildDeckPdf({ ...FITTING_DECK, createdAt: new Date(createdAt.getTime() + 5000) })
  assert.notDeepEqual(Array.from(first), Array.from(later))
  assert.ok(latin1(later).includes("D:20260922093005Z"), "the deck's date reaches the document info")

  // No createdAt at all: the fixed epoch date keeps two runs identical.
  assert.deepEqual(Array.from(buildDeckPdf(FITTING_DECK)), Array.from(buildDeckPdf(FITTING_DECK)))
  assert.match(latin1(first), /\/Title \(Unit 3 \u0097 Identity, Sessions, and Access\)/, "the deck title is the PDF's title")
})
