/**
 * `docx` — build a WordprocessingML document from themed blocks.
 *
 * The input is the *existing* `ThemedBlock` union from
 * `@/lib/ai/format-response`, so an AI reply that already renders as themed
 * blocks in the app can be written straight out as a `.docx` without a second
 * normalizer. Blocks whose shape has no Word equivalent degrade instead of
 * failing: an image becomes a labelled placeholder paragraph, a quiz or slide
 * outline becomes headings and lists.
 *
 * The package is assembled here and zipped by `./zip` — no dependency, no
 * template file:
 *
 *     [Content_Types].xml                 part MIME map
 *     _rels/.rels                         package -> document, core properties
 *     word/document.xml                   the body (required main part)
 *     word/_rels/document.xml.rels        document -> styles
 *     word/styles.xml                     Normal, Title, Heading1-4, Code, Quote
 *     docProps/core.xml                   title, creator, created/modified
 *
 * `[Content_Types].xml`, `_rels/.rels` and `word/document.xml` are what makes
 * the file openable; the rest are the parts Word expects to find alongside it.
 *
 * Every text value goes through `escapeXml`, so user text can never close a
 * tag; runs are additionally emitted with `xml:space="preserve"` so leading and
 * trailing spaces survive round-tripping. Output is deterministic: with a fixed
 * `date` (or none at all) the same input yields byte-identical bytes.
 */

import type { QuizQuestion, ThemedBlock, ThemedSlide, ThemedTableAlign } from "@/lib/ai/format-response"
import { DEFAULT_ENTRY_DATE, createZip } from "@/lib/export/zip"
import { escapeXml, sanitizeXmlText, xmlDeclaration } from "@/lib/export/xml"

/** A DOCX block is exactly a themed block — one shape, two renderers. */
export type DocxBlock = ThemedBlock

export interface BuildDocxInput {
  /** Document title; also stored as the file's core-property title. */
  title: string
  blocks: DocxBlock[]
  /** Core-property author. Defaults to `LEARN`. */
  creator?: string
  /** Core-property timestamps, and the ZIP entry date. Omit for reproducible output. */
  date?: Date
}

// Word's own units: page geometry in twentieths of a point (twips), font sizes
// in half-points.
const PAGE_WIDTH = 12240
const PAGE_MARGIN = 1440
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2
const LIST_INDENT = 720
const LIST_HANGING = 360

/** Half-points per heading level, and the point size they render as. */
const HEADING_SIZES: Record<1 | 2 | 3 | 4, number> = { 1: 36, 2: 32, 3: 28, 4: 24 }
const CODE_SIZE = 20
const QUOTE_SIZE = 22

const TABLE_BORDER =
  '<w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="B8BCC4"/><w:left w:val="single" w:sz="4" w:space="0" w:color="B8BCC4"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="B8BCC4"/><w:right w:val="single" w:sz="4" w:space="0" w:color="B8BCC4"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="B8BCC4"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="B8BCC4"/></w:tblBorders>'

const HEADER_FILL = '<w:shd w:val="clear" w:color="auto" w:fill="EEF1F5"/>'

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/** Serialize blocks into a complete `.docx` package. */
export function buildDocx(input: BuildDocxInput): Uint8Array {
  const title = sanitizeXmlText(input.title).trim()
  const creator = sanitizeXmlText(input.creator ?? "LEARN").trim() || "LEARN"
  const date = input.date ?? DEFAULT_ENTRY_DATE

  return createZip(
    [
      { name: "[Content_Types].xml", data: contentTypesXml() },
      { name: "_rels/.rels", data: packageRelsXml() },
      { name: "word/document.xml", data: documentXml(input.blocks) },
      { name: "word/_rels/document.xml.rels", data: documentRelsXml() },
      { name: "word/styles.xml", data: stylesXml() },
      { name: "docProps/core.xml", data: corePropertiesXml(title, creator, date) },
    ],
    { date },
  )
}

// ---------------------------------------------------------------------------
// Package parts
// ---------------------------------------------------------------------------

function contentTypesXml(): string {
  return [
    xmlDeclaration(),
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>',
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>',
    "</Types>",
  ].join("")
}

function packageRelsXml(): string {
  return [
    xmlDeclaration(),
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>',
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>',
    "</Relationships>",
  ].join("")
}

function documentRelsXml(): string {
  return [
    xmlDeclaration(),
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
    "</Relationships>",
  ].join("")
}

function corePropertiesXml(title: string, creator: string, date: Date): string {
  const stamp = Number.isFinite(date.getTime()) ? date.toISOString() : DEFAULT_ENTRY_DATE.toISOString()
  return [
    xmlDeclaration(),
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
    `<dc:title>${escapeXml(title)}</dc:title>`,
    `<dc:creator>${escapeXml(creator)}</dc:creator>`,
    `<cp:lastModifiedBy>${escapeXml(creator)}</cp:lastModifiedBy>`,
    `<dcterms:created xsi:type="dcterms:W3CDTF">${escapeXml(stamp)}</dcterms:created>`,
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${escapeXml(stamp)}</dcterms:modified>`,
    "</cp:coreProperties>",
  ].join("")
}

/**
 * Style definitions, including the one run-level rule the body relies on: the
 * `Code` style's monospace font. Sizes are restated on heading runs as well, so
 * a reader that ignores stylesheet inheritance still shows hierarchy.
 */
function stylesXml(): string {
  const headingStyles = ([1, 2, 3, 4] as const)
    .map((level) => {
      const size = HEADING_SIZES[level]
      return [
        `<w:style w:type="paragraph" w:styleId="Heading${level}">`,
        `<w:name w:val="heading ${level}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>`,
        `<w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="${level - 1}"/></w:pPr>`,
        `<w:rPr><w:b/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr>`,
        "</w:style>",
      ].join("")
    })
    .join("")

  return [
    xmlDeclaration(),
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
    "<w:docDefaults>",
    '<w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault>',
    '<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault>',
    "</w:docDefaults>",
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>',
    '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:b/><w:sz w:val="56"/><w:szCs w:val="56"/></w:rPr></w:style>',
    headingStyles,
    `<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:shd w:val="clear" w:color="auto" w:fill="F4F5F7"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="${CODE_SIZE}"/><w:szCs w:val="${CODE_SIZE}"/></w:rPr></w:style>`,
    `<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:ind w:left="${LIST_INDENT}"/></w:pPr><w:rPr><w:i/><w:color w:val="44506B"/><w:sz w:val="${QUOTE_SIZE}"/><w:szCs w:val="${QUOTE_SIZE}"/></w:rPr></w:style>`,
    "</w:styles>",
  ].join("")
}

// ---------------------------------------------------------------------------
// Body
// ---------------------------------------------------------------------------

function documentXml(blocks: DocxBlock[]): string {
  const body = blocks.map(blockXml).join("")
  return [
    xmlDeclaration(),
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
    "<w:body>",
    body,
    // Section properties must be the last child of the body.
    `<w:sectPr><w:pgSz w:w="${PAGE_WIDTH}" w:h="15840"/><w:pgMar w:top="${PAGE_MARGIN}" w:right="${PAGE_MARGIN}" w:bottom="${PAGE_MARGIN}" w:left="${PAGE_MARGIN}" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>`,
    "</w:body>",
    "</w:document>",
  ].join("")
}

function blockXml(block: DocxBlock): string {
  switch (block.type) {
    case "heading":
      return headingXml(block.level, block.text)
    case "paragraph":
      return paragraph([run(block.text)])
    case "list":
      return listXml(block.ordered, block.items)
    case "table":
      return tableXml(block.headers, block.rows, block.align)
    case "code":
      return codeXml(block.code, block.language)
    case "quote":
      return paragraph([run(block.text)], { style: "Quote" })
    case "divider":
      return block.pageBreak ? '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' : dividerXml()
    case "image":
      return paragraph([run(imagePlaceholder(block.alt, block.url), italicRunProps())])
    case "callout":
      return paragraph([run(`[${block.tone.toUpperCase()}] `, boldRunProps()), run(block.text)])
    case "quiz":
      return quizXml(block.title, block.questions)
    case "slideOutline":
      return slideOutlineXml(block.title, block.slides)
    default:
      return ""
  }
}

function headingXml(level: number, text: string): string {
  const safeLevel = (Math.min(4, Math.max(1, Math.floor(level) || 1)) as 1 | 2 | 3 | 4)
  const size = HEADING_SIZES[safeLevel]
  return paragraph([run(text, `<w:b/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/>`)], { style: `Heading${safeLevel}` })
}

function listXml(ordered: boolean, items: string[]): string {
  return items
    .map((item, index) => paragraph([run(`${ordered ? `${index + 1}.` : "•"} ${item}`)], { indent: `<w:ind w:left="${LIST_INDENT}" w:hanging="${LIST_HANGING}"/>` }))
    .join("")
}

function codeXml(code: string, language: string): string {
  const lines = sanitizeXmlText(code).split("\n")
  const label = language ? paragraph([run(language, italicRunProps())]) : ""
  const body = lines.map((line) => paragraph([run(line, CODE_RUN_PROPS)], { style: "Code" })).join("")
  return label + body
}

function dividerXml(): string {
  return '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="A1A8B5"/></w:pBdr></w:pPr></w:p>'
}

function quizXml(title: string, questions: QuizQuestion[]): string {
  const parts: string[] = []
  if (title) parts.push(headingXml(2, title))
  questions.forEach((question, index) => {
    parts.push(paragraph([run(`${index + 1}. ${question.question}`)]))
    if (question.choices.length) {
      parts.push(listXml(false, question.choices.map((choice) => `${choice.id}. ${choice.text}`)))
    }
    if (question.answerId) parts.push(paragraph([run("Answer: ", boldRunProps()), run(question.answerId)]))
    if (question.explanation) parts.push(paragraph([run(question.explanation, italicRunProps())], { indent: `<w:ind w:left="${LIST_INDENT}"/>` }))
  })
  return parts.join("")
}

function slideOutlineXml(title: string, slides: ThemedSlide[]): string {
  const parts: string[] = []
  if (title) parts.push(headingXml(1, title))
  slides.forEach((slide, index) => {
    parts.push(headingXml(2, `Slide ${index + 1}: ${slide.title}`))
    if (slide.bullets.length) parts.push(listXml(false, slide.bullets))
  })
  return parts.join("")
}

/**
 * Word tables need a fixed grid, so columns are spaced evenly across the text
 * width (a capped single-row height keeps very long cells readable).
 */
function tableXml(headers: string[], rows: string[][], align?: ThemedTableAlign[]): string {
  const columns = Math.max(headers.length, ...rows.map((row) => row.length), 0)
  if (!columns) return ""

  const columnWidth = Math.max(1, Math.floor(CONTENT_WIDTH / columns))
  const grid = `<w:tblGrid>${Array.from({ length: columns }, () => `<w:gridCol w:w="${columnWidth}"/>`).join("")}</w:tblGrid>`
  const justify = (index: number) => {
    const value = align?.[index]
    return value && value !== "left" ? `<w:jc w:val="${value === "center" ? "center" : "right"}"/>` : ""
  }

  const headerRow = headers.length
    ? `<w:tr><w:trPr><w:tblHeader/></w:trPr>${headers
        .map((header, index) => tableCell(header, columnWidth, boldRunProps(), HEADER_FILL, justify(index)))
        .join("")}</w:tr>`
    : ""

  const bodyRows = rows
    .map(
      (row) =>
        `<w:tr>${Array.from({ length: columns }, (_, index) => tableCell(row[index] ?? "", columnWidth, "", "", justify(index))).join("")}</w:tr>`,
    )
    .join("")

  return [
    "<w:tbl>",
    `<w:tblPr><w:tblW w:w="${CONTENT_WIDTH}" w:type="dxa"/>${TABLE_BORDER}<w:tblLook w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>`,
    grid,
    headerRow,
    bodyRows,
    "</w:tbl>",
  ].join("")
}

function tableCell(text: string, width: number, runProps: string, fill: string, justify: string): string {
  return [
    "<w:tc>",
    `<w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${fill}</w:tcPr>`,
    paragraph([run(text, runProps)], { justify, rowHeightCap: true }),
    "</w:tc>",
  ].join("")
}

function imagePlaceholder(alt: string, url: string): string {
  const label = sanitizeXmlText(alt).trim()
  const target = sanitizeXmlText(url).trim()
  // Images are not embedded (that would mean fetching and re-encoding binary
  // data); the caption plus location is written so nothing is silently lost.
  if (label && target) return `[Image: ${label} — ${target}]`
  return `[Image: ${label || target || "untitled"}]`
}

// ---------------------------------------------------------------------------
// Runs and paragraphs
// ---------------------------------------------------------------------------

const CODE_RUN_PROPS = `<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="${CODE_SIZE}"/><w:szCs w:val="${CODE_SIZE}"/>`

function boldRunProps(): string {
  return "<w:b/>"
}

function italicRunProps(): string {
  return "<w:i/>"
}

/**
 * One run. Embedded newlines become `<w:br/>`, and every `w:t` carries
 * `xml:space="preserve"` so meaningful spaces are not collapsed away.
 */
function run(text: string, runProps = ""): string {
  const lines = sanitizeXmlText(text).split("\n")
  const content = lines
    .map((line, index) => `${index ? "<w:br/>" : ""}<w:t xml:space="preserve">${escapeXml(line)}</w:t>`)
    .join("")
  return `<w:r>${runProps ? `<w:rPr>${runProps}</w:rPr>` : ""}${content}</w:r>`
}

/**
 * One paragraph from one or more runs. Children are emitted in schema order
 * (`pStyle` before borders/indent/justification) — Word is lenient, validators
 * are not.
 */
function paragraph(runs: string[], options: { style?: string; indent?: string; justify?: string; rowHeightCap?: boolean } = {}): string {
  const properties = [
    options.style ? `<w:pStyle w:val="${escapeXml(options.style)}"/>` : "",
    options.rowHeightCap ? `<w:spacing w:before="40" w:after="40" w:line="240" w:lineRule="auto"/>` : "",
    options.indent ?? "",
    options.justify ?? "",
  ].join("")
  return `<w:p>${properties ? `<w:pPr>${properties}</w:pPr>` : ""}${runs.join("")}</w:p>`
}
