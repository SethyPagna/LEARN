/**
 * `xlsx` — build a SpreadsheetML workbook from a cell grid.
 *
 * Same reasoning as `./docx`: a `.xlsx` is a ZIP of XML parts, so the writer in
 * `./zip` is all the packaging this needs, and `rows.map(cells)` is all the
 * content model. The grid the Studio sheet editor already holds maps one-to-one
 * onto rows and cells, so no intermediate document type is introduced.
 *
 *     [Content_Types].xml                 part MIME map
 *     _rels/.rels                         package -> workbook
 *     xl/workbook.xml                     sheet list (the title becomes the sheet name)
 *     xl/_rels/workbook.xml.rels          workbook -> worksheet, shared strings
 *     xl/worksheets/sheet1.xml            the cells
 *     xl/sharedStrings.xml                deduplicated string table
 *
 * Typing rules: a finite `number` is written as `t="n"`, a `boolean` as
 * `t="b"`, and every other value (string, date, object, `NaN`, `Infinity`) as a
 * shared string via `String(value)`, so nothing is ever guessed into a formula
 * or dropped. `null`, `undefined` and `""` mean "empty cell" and are omitted,
 * which is how a spreadsheet represents a blank.
 *
 * Every value is escaped by `escapeXml` before it reaches a `<t>` or `<v>`
 * element, so a cell containing `<script>` or `&` is text in the file, not
 * markup. Output is deterministic for a fixed `date` (or none).
 */

import { DEFAULT_ENTRY_DATE, createZip } from "@/lib/export/zip"
import { escapeXml, sanitizeXmlText, xmlDeclaration } from "@/lib/export/xml"

export interface BuildXlsxInput {
  /** Becomes the worksheet name (sanitized to Excel's rules). */
  title: string
  /** Row-major cells; rows may be ragged. */
  cells: unknown[][]
  /** ZIP entry date. Omit for reproducible output. */
  date?: Date
}

// Excel's hard ceilings, applied as a cap so a pathological grid cannot produce
// a file the format itself rejects.
const MAX_ROWS = 1048576
const MAX_COLUMNS = 16384

const MIN_COLUMN_WIDTH = 8
const MAX_COLUMN_WIDTH = 48
const MAX_SHEET_NAME_LENGTH = 31

/** Characters Excel forbids in a sheet name, plus the apostrophe edge cases. */
const INVALID_SHEET_NAME_CHARACTERS = /[[\]:*?/\\]/g

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/** Serialize a cell grid into a complete single-sheet `.xlsx` package. */
export function buildXlsx(input: BuildXlsxInput): Uint8Array {
  const sheetName = sheetNameOf(input.title)
  const rows = normalizeRows(input.cells)
  const table = buildSharedStrings(rows)

  return createZip(
    [
      { name: "[Content_Types].xml", data: contentTypesXml() },
      { name: "_rels/.rels", data: packageRelsXml() },
      { name: "xl/workbook.xml", data: workbookXml(sheetName) },
      { name: "xl/_rels/workbook.xml.rels", data: workbookRelsXml() },
      { name: "xl/worksheets/sheet1.xml", data: worksheetXml(rows, table) },
      { name: "xl/sharedStrings.xml", data: sharedStringsXml(table) },
    ],
    { date: input.date ?? DEFAULT_ENTRY_DATE },
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
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>',
    '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>',
    "</Types>",
  ].join("")
}

function packageRelsXml(): string {
  return [
    xmlDeclaration(),
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>',
    "</Relationships>",
  ].join("")
}

function workbookRelsXml(): string {
  return [
    xmlDeclaration(),
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>',
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>',
    "</Relationships>",
  ].join("")
}

function workbookXml(sheetName: string): string {
  return [
    xmlDeclaration(),
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
    `<sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets>`,
    "</workbook>",
  ].join("")
}

function sharedStringsXml(table: SharedStrings): string {
  const items = table.values
    .map((value) => `<si><t xml:space="preserve">${escapeXml(value)}</t></si>`)
    .join("")
  return [
    xmlDeclaration(),
    `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${table.references}" uniqueCount="${table.values.length}">`,
    items,
    "</sst>",
  ].join("")
}

/**
 * Worksheet XML. Element order follows the schema — `dimension`, `sheetViews`,
 * `sheetFormatPr`, `cols`, `sheetData` — and each cell is typed by value.
 */
function worksheetXml(rows: unknown[][], table: SharedStrings): string {
  const columns = columnCount(rows)
  const cells = rows.map((row, rowIndex) => {
    const body = row
      .slice(0, MAX_COLUMNS)
      .map((value, columnIndex) => cellXml(value, rowIndex, columnIndex, table))
      .join("")
    return `<row r="${rowIndex + 1}">${body}</row>`
  })

  const dimension = rows.length ? `A1:${columnName(Math.max(0, columns - 1))}${rows.length}` : "A1"
  const cols = columns
    ? `<cols>${Array.from({ length: columns }, (_, index) => {
        const width = columnWidth(rows, index)
        return `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`
      }).join("")}</cols>`
    : ""

  return [
    xmlDeclaration(),
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    `<dimension ref="${dimension}"/>`,
    '<sheetViews><sheetView workbookViewId="0"/></sheetViews>',
    '<sheetFormatPr defaultRowHeight="15"/>',
    cols,
    `<sheetData>${cells.join("")}</sheetData>`,
    "</worksheet>",
  ].join("")
}

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------

function cellXml(value: unknown, rowIndex: number, columnIndex: number, table: SharedStrings): string {
  // A blank is the absence of a cell, not an empty value — and an empty string
  // is a blank cell, not an empty entry in the string table.
  if (isBlank(value)) return ""
  const reference = `${columnName(columnIndex)}${rowIndex + 1}`

  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${reference}" t="n"><v>${escapeXml(numberText(value))}</v></c>`
  }
  if (typeof value === "boolean") {
    return `<c r="${reference}" t="b"><v>${value ? 1 : 0}</v></c>`
  }
  return `<c r="${reference}" t="s"><v>${table.index(value)}</v></c>`
}

/** `null`, `undefined` and the empty string all mean "no cell". */
function isBlank(value: unknown): boolean {
  return value === null || value === undefined || value === ""
}

/** True for values written as something other than a shared string. */
function isTypedValue(value: unknown): boolean {
  return (typeof value === "number" && Number.isFinite(value)) || typeof value === "boolean"
}

/** Numbers are written at full precision without exponent form for the common range. */
function numberText(value: number): string {
  if (Object.is(value, -0)) return "0"
  return String(value)
}

/**
 * Shared string table: one `<si>` per distinct value, deduplicated by exact
 * match. `references` counts every string cell so the `count` attribute stays
 * truthful even when the same text repeats.
 */
interface SharedStrings {
  values: string[]
  references: number
  index(value: unknown): number
}

function buildSharedStrings(rows: unknown[][]): SharedStrings {
  const values: string[] = []
  const lookup = new Map<string, number>()
  const table: SharedStrings = {
    values,
    references: 0,
    index(value: unknown) {
      const text = sanitizeXmlText(value)
      const existing = lookup.get(text)
      if (existing !== undefined) {
        table.references += 1
        return existing
      }
      const position = values.length
      values.push(text)
      lookup.set(text, position)
      table.references += 1
      return position
    },
  }
  // Pre-walk the grid so the string table is complete before cell XML is
  // generated (cell order and table order stay independent).
  for (const row of rows) {
    for (const value of row) {
      if (isBlank(value) || isTypedValue(value)) continue
      table.index(value)
    }
  }
  table.references = 0
  return table
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/** A1-style column label: 0 -> A, 25 -> Z, 26 -> AA. */
function columnName(index: number): string {
  let remaining = Math.max(0, Math.floor(index)) + 1
  let name = ""
  while (remaining > 0) {
    const remainder = (remaining - 1) % 26
    name = String.fromCharCode(65 + remainder) + name
    remaining = Math.floor((remaining - 1) / 26)
  }
  return name
}

function columnCount(rows: unknown[][]): number {
  return Math.min(MAX_COLUMNS, rows.reduce((widest, row) => Math.max(widest, row.length), 0))
}

/**
 * A "sensible default column width": wide enough for the longest value in the
 * column, clamped so an empty or a very long cell does not produce a column you
 * cannot see.
 */
function columnWidth(rows: unknown[][], index: number): number {
  let longest = MIN_COLUMN_WIDTH
  for (const row of rows) {
    const value = row[index]
    if (value === null || value === undefined) continue
    longest = Math.max(longest, plainWidth(value))
  }
  return Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, longest + 2))
}

/** Approximate display width of a value; CJK-width detail is not worth the bytes. */
function plainWidth(value: unknown): number {
  if (typeof value === "number" || typeof value === "boolean") return String(value).length
  return sanitizeXmlText(value).length
}

function normalizeRows(cells: unknown[][]): unknown[][] {
  const rows = Array.isArray(cells) ? cells.slice(0, MAX_ROWS) : []
  return rows.map((row) => (Array.isArray(row) ? row.slice(0, MAX_COLUMNS) : [row]))
}

// ---------------------------------------------------------------------------
// Sheet name
// ---------------------------------------------------------------------------

/**
 * Reduce a title to a legal worksheet name: Excel rejects `[]:*?/\`, caps the
 * name at 31 characters, and refuses a leading or trailing apostrophe.
 */
export function sheetNameOf(title: string): string {
  const cleaned = sanitizeXmlText(title)
    .replace(INVALID_SHEET_NAME_CHARACTERS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^'+|'+$/g, "")
    .trim()
  if (!cleaned) return "Sheet1"
  return cleaned.slice(0, MAX_SHEET_NAME_LENGTH)
}
