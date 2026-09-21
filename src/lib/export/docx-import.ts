/**
 * `docx-import` — read a Word document back into themed blocks.
 *
 * This is the inverse of `./docx`, and it exists so the Brief's round-trip
 * clause is real: export a document, re-import it, and get the same content and
 * structure back. It is written against the format rather than against our own
 * output, because the file a user re-imports may have come from Word. What that
 * changes:
 *
 *   - **Namespace prefixes do not matter.** Word writes `w:`, some producers use
 *     a default namespace, and `./xml-read` matches on local names.
 *   - **Bullets and numbering come from `numbering.xml`.** Word does not put a
 *     `•` in the text of a list item; it points at a numbering definition. The
 *     `numFmt` of that definition is what distinguishes an ordered list from a
 *     bulleted one, so the format is read from the definition when it is there
 *     and inferred from the text when it is not.
 *   - **Headings come from a style or from the run properties.** `Heading N`,
 *     `Title` and `Subtitle` are read by name; a paragraph whose runs are all
 *     bold at one of Word's heading sizes is read as the heading it plainly is,
 *     so a document built without styles still imports as a hierarchy.
 *
 * What it maps, in the vocabulary of `ThemedBlock`:
 *
 *     heading        w:p with a heading style, or bold + a heading size
 *     paragraph      every other w:p with text
 *     list           consecutive list items (`numPr`, or an indented marker)
 *     table          w:tbl; the first row is the header row when it is marked
 *                    `w:tblHeader` (which is what our own writer sets)
 *     code           consecutive `Code`-styled paragraphs, one line each
 *     quote          `Quote`-family styles
 *     divider        a paragraph whose only content is a bottom border
 *     callout        the `[INFO]`/`[WARN]`/`[SUCCESS]` prefix our writer emits
 *
 * What it deliberately does not do, so nothing is promised that is not kept:
 *
 *   - **No images.** Word stores bytes in `word/media`, and the DOCX writer does
 *     not embed any — it writes a labelled placeholder instead. Placeholders are
 *     imported as the paragraph text they are; no image block is invented.
 *   - **No quiz or slide-outline reconstruction.** Those blocks were already
 *     flattened into headings, paragraphs and lists on the way out; the import
 *     returns that flattened form, which is what the file contains.
 *   - **No tracked-change, comment, or field text.** Deleted revision text and
 *     field instructions are not document content and are skipped.
 *   - **No numbering of nested levels.** A nested list item is kept as an item of
 *     the enclosing list, flattened in document order, matching how the HTML
 *     reader already treats nesting.
 *   - **No headers, footers, footnotes, or text boxes.** The main document part
 *     is the document; the rest are separate parts with their own content.
 */

import type { ThemedBlock, ThemedCalloutTone, ThemedHeadingLevel } from "@/lib/ai/format-response"
import { readZip, normalizePartNames } from "@/lib/export/zip"
import {
  attribute,
  childElements,
  childNamed,
  childrenNamed,
  decodeXmlBytes,
  descendants,
  findFirst,
  parseXml,
  textOf,
  textWithBreaks,
  type XmlElement,
} from "@/lib/export/xml-read"

export interface DocxImport {
  /** Core-property title, falling back to the first heading, then to `""`. */
  title: string
  blocks: ThemedBlock[]
}

/** Bound on imported blocks, so a pathological document cannot flood the editor. */
const MAX_BLOCKS = 4000
const MAX_TABLE_ROWS = 500
const MAX_TABLE_COLUMNS = 64
/** Half-point sizes our own writer stamps on headings, largest first. */
const HEADING_SIZES: Array<[number, ThemedHeadingLevel]> = [
  [36, 1],
  [32, 2],
  [28, 3],
  [24, 4],
]
/** Style ids Word and other producers use for a code-like paragraph. */
const CODE_STYLE = /^(code|sourcecode|macro ?text|htmlpreformatted|preformatted|plaintext)$/i
const QUOTE_STYLE = /quote/i
const CALLOUT_PREFIX = /^\[(INFO|WARN|SUCCESS)\]\s*/
const LANGUAGE_LABEL = /^[a-z0-9+#.-]{1,24}$/i
/** Inline elements that are never content: deleted revisions and field codes. */
const SKIPPED_INLINE = new Set(["del", "delText", "instrText", "fldChar", "annotationRef", "commentReference"])

/**
 * Read a `.docx` into blocks.
 *
 * The document part is required: without it the archive is a ZIP but not a Word
 * document, and saying so is more useful than returning no blocks. Everything
 * else a package can contain — styles, numbering, core properties — is optional
 * and only enriches the result.
 */
export async function importDocx(bytes: Uint8Array): Promise<DocxImport> {
  const parts = await readParts(bytes, "Word document")
  const documentXml = parts["word/document.xml"]
  if (documentXml === undefined) {
    throw new Error("Not a Word document: the archive has no word/document.xml part.")
  }

  const document = parseXml(decodeXmlBytes(documentXml), "word/document.xml")
  const body = findFirst(document, "body") ?? document
  const numbering = numberingFormats(parts["word/numbering.xml"])
  const blocks = blocksFromBody(body, numbering)
  const title = coreTitle(parts["docProps/core.xml"]) || firstHeadingText(blocks)

  return { title, blocks }
}

/**
 * Read the archive, adding the file kind to whatever the ZIP reader rejects and
 * normalizing part separators (a Windows-written archive uses `\`).
 */
async function readParts(bytes: Uint8Array, kind: string): Promise<Record<string, Uint8Array>> {
  try {
    return normalizePartNames(await readZip(bytes))
  } catch (error) {
    throw new Error(`${kind}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

// ---------------------------------------------------------------------------
// Body walk
// ---------------------------------------------------------------------------

function blocksFromBody(body: XmlElement, numbering: NumberingFormats): ThemedBlock[] {
  const blocks: ThemedBlock[] = []
  /** Items collected so far, flushed when the list style changes or a block ends. */
  let list: { ordered: boolean; items: string[] } | null = null
  /** Lines collected so far for the code block being built. */
  let code: { language: string; lines: string[] } | null = null
  /** The paragraph just added, if a code language label could still claim it. */
  let lastParagraph: { index: number; text: string; italic: boolean } | null = null

  const flushList = () => {
    if (!list) return
    blocks.push({ type: "list", ordered: list.ordered, items: list.items })
    list = null
  }
  const flushCode = () => {
    if (!code) return
    blocks.push({ type: "code", language: code.language, code: trimBlankEdges(code.lines).join("\n") })
    code = null
  }
  const flush = () => {
    flushList()
    flushCode()
  }

  for (const node of childElements(body)) {
    if (blocks.length >= MAX_BLOCKS) break

    if (node.name === "tbl") {
      flush()
      lastParagraph = null
      const table = tableBlock(node)
      if (table) blocks.push(table)
      continue
    }
    if (node.name !== "p") {
      // Anything else at body level (content controls, bookmarks, section
      // properties) carries no block of its own.
      continue
    }

    const rawText = textWithBreaks(node, { skip: SKIPPED_INLINE })
    const text = collapse(rawText)
    const style = paragraphStyle(node)

    if (CODE_STYLE.test(style)) {
      flushList()
      if (!code) {
        // Our writer puts the language on the line above a code block as an
        // italic paragraph. Claim it back when that is exactly what it is.
        const label = lastParagraph
        if (label && label.italic && LANGUAGE_LABEL.test(label.text) && blocks[label.index]?.type === "paragraph") {
          blocks.splice(label.index, 1)
          code = { language: label.text.toLowerCase(), lines: [] }
        } else {
          code = { language: "", lines: [] }
        }
      }
      code.lines.push(rawText.replace(/[ \t]+$/, ""))
      lastParagraph = null
      continue
    }
    flushCode()

    const item = listItemOf(node, numbering, text)
    if (item) {
      if (list && list.ordered !== item.ordered) flushList()
      if (!list) list = { ordered: item.ordered, items: [] }
      if (item.text) list.items.push(item.text)
      lastParagraph = null
      continue
    }
    flushList()

    if (isDivider(node, text)) {
      blocks.push({ type: "divider" })
      lastParagraph = null
      continue
    }

    if (QUOTE_STYLE.test(style)) {
      if (text) blocks.push({ type: "quote", text })
      lastParagraph = null
      continue
    }

    const headingLevel = headingLevelOf(style, node, text)
    if (headingLevel !== 0) {
      blocks.push({ type: "heading", level: headingLevel, text })
      lastParagraph = null
      continue
    }

    const callout = calloutBlock(text)
    if (callout) {
      blocks.push(callout)
      lastParagraph = null
      continue
    }

    if (!text) {
      lastParagraph = null
      continue
    }

    lastParagraph = { index: blocks.length, text, italic: isItalicParagraph(node) }
    blocks.push({ type: "paragraph", text })
  }

  flush()
  return blocks
}

// ---------------------------------------------------------------------------
// Paragraph classification
// ---------------------------------------------------------------------------

/** `w:pStyle/@w:val`, or `""` when the paragraph is Normal. */
function paragraphStyle(paragraph: XmlElement): string {
  const properties = childNamed(paragraph, "pPr")
  return attribute(childNamed(properties ?? paragraph, "pStyle"), "val")
}

/**
 * Heading level from a style name, or from bold runs at a heading size.
 *
 * The fallback is what makes a styles-free document (or one produced by a tool
 * that only sets direct formatting) import as headings instead of as a wall of
 * paragraphs. It requires *both* signals, so a bold sentence at body size stays
 * a paragraph.
 */
function headingLevelOf(style: string, paragraph: XmlElement, text: string): 0 | ThemedHeadingLevel {
  if (!text) return 0
  const named = /^heading\s*([1-9])$/i.exec(style.trim())
  if (named) return clampHeading(Number.parseInt(named[1], 10))
  if (/^title$/i.test(style)) return 1
  if (/^subtitle$/i.test(style)) return 2

  const own = runProperties(paragraph)
  if (!own.bold) return 0
  if (own.size === 0) return 0
  const match = HEADING_SIZES.find(([size]) => own.size >= size)
  return match ? match[1] : 0
}

function clampHeading(level: number): ThemedHeadingLevel {
  return Math.min(4, Math.max(1, Math.floor(level) || 1)) as ThemedHeadingLevel
}

/**
 * Aggregate run properties across a paragraph's runs: bold when every run that
 * carries text is bold, and the largest explicit half-point size.
 */
function runProperties(paragraph: XmlElement): { bold: boolean; size: number } {
  const runs: XmlElement[] = []
  const collect = (node: XmlElement) => {
    for (const child of childElements(node)) {
      // A run inside a hyperlink or a tracked-insert is still a run; a run
      // nested in a table inside the paragraph is not part of this paragraph.
      if (child.name === "r") runs.push(child)
      else if (child.name !== "tbl") collect(child)
    }
  }
  collect(paragraph)

  let bold = runs.length > 0
  let size = 0
  for (const run of runs) {
    const properties = childNamed(run, "rPr")
    if (!properties) {
      if (textOf(run).trim()) bold = false
      continue
    }
    if (!isOn(childNamed(properties, "b"))) bold = false
    const declared = Number.parseInt(attribute(childNamed(properties, "sz"), "val"), 10)
    if (Number.isFinite(declared)) size = Math.max(size, declared)
  }
  return { bold, size }
}

/** True when every run is italic — used only to recognise a code-language label. */
function isItalicParagraph(paragraph: XmlElement): boolean {
  let checked = 0
  let italic = true
  for (const run of descendants(paragraph, "r")) {
    if (!textOf(run).trim()) continue
    checked += 1
    if (!isOn(childNamed(childNamed(run, "rPr") ?? run, "i"))) italic = false
  }
  return checked > 0 && italic
}

/**
 * `w:b`/`w:i` without a value mean "on"; `w:val="0"`, `"false"` and `"off"` mean
 * off. A document that spells the value out explicitly is as common as one that
 * does not.
 */
function isOn(element: XmlElement | null): boolean {
  if (!element) return false
  const value = attribute(element, "val")
  if (!value) return true
  return !/^(0|false|off|none)$/i.test(value)
}

/** A paragraph carrying a bottom border and no text is the writer's divider. */
function isDivider(paragraph: XmlElement, text: string): boolean {
  if (text) return false
  return childNamed(childNamed(paragraph, "pPr") ?? paragraph, "pBdr") !== null
}

function calloutBlock(text: string): ThemedBlock | null {
  const match = CALLOUT_PREFIX.exec(text)
  if (!match) return null
  const tone = match[1].toLowerCase() as ThemedCalloutTone
  return { type: "callout", tone, text: text.slice(match[0].length) }
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

/** `numId -> ordered`, read from `numbering.xml` when a package provides one. */
type NumberingFormats = Map<string, boolean>

/**
 * List item detection, in the two shapes a document actually uses.
 *
 * A Word list item is a paragraph with `w:numPr` pointing at a numbering
 * definition, and the text carries no marker. Our writer's lists are indented
 * paragraphs whose text starts with the marker, because a DOCX with no
 * `numbering.xml` still has to look like a list. Both are recognised here, so a
 * document round-trips whether it came from Word or from us.
 */
function listItemOf(
  paragraph: XmlElement,
  numbering: NumberingFormats,
  text: string,
): { ordered: boolean; text: string } | null {
  const numberingProperties = findFirst(paragraph, "numPr")
  if (numberingProperties) {
    const numId = attribute(childNamed(numberingProperties, "numId"), "val")
    const ordered = numbering.get(numId) ?? !BULLET_MARKER.test(text)
    return { ordered, text: stripMarker(text) }
  }

  if (!isIndented(paragraph)) return null
  const ordered = /^\s*\d{1,9}[.)]\s+/.test(text)
  const bulleted = BULLET_MARKER.test(text)
  if (!ordered && !bulleted) return null
  const stripped = stripMarker(text)
  return stripped ? { ordered, text: stripped } : null
}

const BULLET_MARKER = /^\s*(?:[•·▪‣◦]|[-*+]\s)\s*/

function stripMarker(text: string): string {
  return text.replace(/^\s*\d{1,9}[.)]\s+/, "").replace(BULLET_MARKER, "").trim()
}

/** `w:ind` — the writer's marker for "this paragraph was a list item". */
function isIndented(paragraph: XmlElement): boolean {
  const properties = childNamed(paragraph, "pPr")
  if (!properties) return false
  const indent = childNamed(properties, "ind")
  if (!indent) return false
  return Boolean(attribute(indent, "left") || attribute(indent, "start") || attribute(indent, "hanging"))
}

/**
 * Number formats from `numbering.xml`: every `w:num` resolved through its
 * abstract definition to the format of its first level. A part that cannot be
 * parsed is not fatal — the text heuristic above takes over.
 */
function numberingFormats(part: Uint8Array | undefined): NumberingFormats {
  const formats: NumberingFormats = new Map()
  if (!part) return formats

  let root: XmlElement
  try {
    root = parseXml(decodeXmlBytes(part), "word/numbering.xml")
  } catch {
    return formats
  }

  const abstractFormats = new Map<string, string>()
  for (const abstractNum of descendants(root, "abstractNum")) {
    const id = attribute(abstractNum, "abstractNumId")
    if (!id) continue
    const level = childrenNamed(abstractNum, "lvl")[0]
    abstractFormats.set(id, attribute(childNamed(level ?? abstractNum, "numFmt"), "val"))
  }

  for (const num of descendants(root, "num")) {
    const numId = attribute(num, "numId")
    if (!numId) continue
    const abstractId = attribute(childNamed(num, "abstractNumId"), "val")
    // A level override inside the instance wins over the abstract definition.
    const override = childNamed(num, "lvlOverride")
    const overrideFormat = override ? attribute(childNamed(childNamed(override, "lvl") ?? override, "numFmt"), "val") : ""
    const format = overrideFormat || abstractFormats.get(abstractId) || ""
    formats.set(numId, !/^bullet$/i.test(format))
  }
  return formats
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

function tableBlock(table: XmlElement): ThemedBlock | null {
  const rowNodes = childrenNamed(table, "tr")
  const rows = (rowNodes.length ? rowNodes : descendants(table, "tr")).slice(0, MAX_TABLE_ROWS)
  const grid = rows.map((row) => childrenNamed(row, "tc").slice(0, MAX_TABLE_COLUMNS).map(cellText))
  if (!grid.length) return null

  // Only a row the file marks as a header becomes one — `w:tblHeader` is what a
  // repeating header row is, and what our writer sets. Nothing is promoted by
  // position, so a headerless table keeps all of its data rows.
  const firstRow = rows[0]
  const markedHeader = childNamed(childNamed(firstRow, "trPr") ?? firstRow, "tblHeader") !== null
  const headers = markedHeader ? grid[0] : []
  const body = (markedHeader ? grid.slice(1) : grid).filter((row) => row.length > 0)

  const width = body.reduce((widest, row) => Math.max(widest, row.length), headers.length)
  if (!width) return null

  // Alignment (`w:jc` per cell) is not restored: it is presentation, and the
  // importer's contract is content and structure. A table with no header row
  // reports no headers rather than a row of empty ones.
  const paddedBody = body.map((row) => padRow(row, width))
  return markedHeader
    ? { type: "table", headers: padRow(headers, width), rows: paddedBody }
    : { type: "table", headers: [], rows: paddedBody }
}

/** A cell is its paragraphs, one per line — which is how the writer emits them. */
function cellText(cell: XmlElement): string {
  const paragraphs = childrenNamed(cell, "p")
  const texts = (paragraphs.length ? paragraphs : [cell]).map((paragraph) => collapse(textWithBreaks(paragraph, { skip: SKIPPED_INLINE })))
  return texts.filter((text) => text.length > 0).join("\n")
}

function padRow(row: string[], width: number): string[] {
  const padded = row.slice(0, width)
  while (padded.length < width) padded.push("")
  return padded
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

/** Trim the edges and drop stray carriage returns; interior spacing is content. */
function collapse(value: string): string {
  return value.replace(/\r/g, "").trim()
}

function trimBlankEdges(lines: string[]): string[] {
  const result = lines.slice()
  while (result.length && !result[0].trim()) result.shift()
  while (result.length && !result[result.length - 1].trim()) result.pop()
  return result
}

function firstHeadingText(blocks: ThemedBlock[]): string {
  const heading = blocks.find((block) => block.type === "heading")
  return heading && heading.type === "heading" ? heading.text : ""
}

/** `dc:title` from the core properties, or `""` — metadata is never required. */
function coreTitle(part: Uint8Array | undefined): string {
  if (!part) return ""
  try {
    const root = parseXml(decodeXmlBytes(part), "docProps/core.xml")
    return textOf(findFirst(root, "title") ?? root).trim()
  } catch {
    return ""
  }
}
