/**
 * `xlsx-import` — read an Excel workbook back into a cell grid.
 *
 * The inverse of `./xlsx`, written against the format rather than against our
 * own output, because the workbook a user re-imports is usually Excel's. Three
 * parts carry everything this needs:
 *
 *     xl/workbook.xml        the sheet list; the first sheet's name is the title
 *     xl/worksheets/sheet1.xml   the cells
 *     xl/sharedStrings.xml   the string table most cells point into
 *
 * What Excel does differently from our writer, and is handled here:
 *
 *   - **Cells carry an address** (`r="B3"`), and rows and columns may be sparse,
 *     so values are placed by address rather than by position. A row that skips
 *     a cell, or a whole row that is missing because it is empty, still lands in
 *     the right place.
 *   - **Strings are shared strings** referenced by index, but a producer may
 *     also write an inline string (`t="inlineStr"`), a formula's cached text
 *     (`t="str"`), or no type at all. All four are read.
 *   - **Numbers, booleans and errors** are typed by the `t` attribute, and the
 *     type is preserved: a number comes back as a number, a boolean as a
 *     boolean, an error (`#REF!`) as the text Excel displays.
 *   - **The worksheet part may not be called `sheet1.xml`** — anything under
 *     `xl/worksheets/` is accepted, preferring `sheet1.xml` when it exists.
 *
 * What it deliberately does not do:
 *
 *   - **No formulas.** Only the cached value of a formula cell comes back, which
 *     is what the file stores for a reader that does not recalculate. The sheet
 *     editor's own `=` formulas are plain strings and survive as text.
 *   - **No styles, merged cells, formats or column widths.** A cell's value is
 *     its content; how it is painted is not structure.
 *   - **No dates as dates.** An Excel date is a serial number with a format
 *     attached; without style resolution it is a number, and is returned as one.
 *   - **Only the first worksheet.** A multi-sheet workbook imports the sheet the
 *     Studio sheet editor can hold; the others are a separate product decision,
 *     not something to silently concatenate.
 */

import { normalizePartNames, readZip } from "@/lib/export/zip"
import {
  attribute,
  childNamed,
  childrenNamed,
  decodeXmlBytes,
  findFirst,
  parseXml,
  textOf,
  type XmlElement,
} from "@/lib/export/xml-read"

export interface XlsxImport {
  /** Worksheet name from `xl/workbook.xml`, or `""` when the part is absent. */
  title: string
  /** Row-major cells: `number`, `boolean`, or `string`. Blank cells are `""`. */
  cells: unknown[][]
}

/** Excel's own ceilings, applied so a malformed file cannot allocate forever. */
const MAX_ROWS = 1048576
const MAX_COLUMNS = 16384

/**
 * Read a `.xlsx` into a cell grid.
 *
 * A workbook part is required; without a worksheet the archive is a ZIP but not
 * a spreadsheet, and saying so beats returning an empty grid that looks like a
 * successful import of nothing.
 */
export async function importXlsx(bytes: Uint8Array): Promise<XlsxImport> {
  const parts = await readParts(bytes, "Excel workbook")
  const sheetName = worksheetPartName(parts)
  if (!sheetName) {
    throw new Error("Not an Excel workbook: the archive has no worksheet part under xl/worksheets/.")
  }

  const worksheet = parseXml(decodeXmlBytes(parts[sheetName]), sheetName)
  const shared = sharedStrings(parts["xl/sharedStrings.xml"])
  return { title: workbookTitle(parts["xl/workbook.xml"]), cells: gridFromWorksheet(worksheet, shared) }
}

/** Read the archive with normalized part separators, keeping the error context. */
async function readParts(bytes: Uint8Array, kind: string): Promise<Record<string, Uint8Array>> {
  try {
    return normalizePartNames(await readZip(bytes))
  } catch (error) {
    throw new Error(`${kind}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/** `sheet1.xml` when present, otherwise the first worksheet part in the archive. */
function worksheetPartName(parts: Record<string, Uint8Array>): string | null {
  if (parts["xl/worksheets/sheet1.xml"]) return "xl/worksheets/sheet1.xml"
  return Object.keys(parts)
    .filter((name) => /^xl\/worksheets\/[^/]+\.xml$/i.test(name))
    .sort()[0] ?? null
}

function workbookTitle(part: Uint8Array | undefined): string {
  if (!part) return ""
  try {
    const root = parseXml(decodeXmlBytes(part), "xl/workbook.xml")
    return attribute(findFirst(root, "sheet") ?? root, "name").trim()
  } catch {
    return ""
  }
}

// ---------------------------------------------------------------------------
// Shared strings
// ---------------------------------------------------------------------------

/**
 * The shared string table, in index order.
 *
 * A `<si>` may hold one `<t>` or a run list (`<r><t>` per formatted run); both
 * are concatenated, because the string is the concatenation of its runs and the
 * formatting is not part of it.
 */
function sharedStrings(part: Uint8Array | undefined): string[] {
  if (!part) return []
  let root: XmlElement
  try {
    root = parseXml(decodeXmlBytes(part), "xl/sharedStrings.xml")
  } catch {
    return []
  }
  return childrenNamed(root, "si").map((item) => textOf(item))
}

// ---------------------------------------------------------------------------
// Worksheet
// ---------------------------------------------------------------------------

function gridFromWorksheet(worksheet: XmlElement, shared: string[]): unknown[][] {
  const sheetData = findFirst(worksheet, "sheetData")
  if (!sheetData) return []

  const rows: Array<{ index: number; cells: unknown[] }> = []
  let fallbackRow = 0

  for (const row of childrenNamed(sheetData, "row")) {
    const declared = Number.parseInt(attribute(row, "r"), 10)
    const rowIndex = Number.isFinite(declared) && declared > 0 ? declared - 1 : fallbackRow
    fallbackRow = rowIndex + 1
    if (rowIndex >= MAX_ROWS) break

    const cells: unknown[] = []
    let fallbackColumn = 0
    for (const cell of childrenNamed(row, "c")) {
      const address = attribute(cell, "r")
      const columnIndex = address ? columnIndexFromAddress(address) : fallbackColumn
      fallbackColumn = columnIndex + 1
      if (columnIndex < 0 || columnIndex >= MAX_COLUMNS) continue
      while (cells.length < columnIndex) cells.push("")
      cells[columnIndex] = cellValue(cell, shared)
    }
    rows.push({ index: rowIndex, cells })
  }

  return trimGrid(rows)
}

/** A1-style addresses: `B3` -> column 1, `AA10` -> column 26. */
function columnIndexFromAddress(address: string): number {
  let column = 0
  let letters = 0
  for (const character of address.toUpperCase()) {
    const code = character.charCodeAt(0)
    if (code < 65 || code > 90) break
    column = column * 26 + (code - 64)
    letters += 1
  }
  return letters ? column - 1 : 0
}

/**
 * One cell's value, typed by its `t` attribute.
 *
 * The default (no `t`) is a number in the format, but a producer that writes
 * text without a type is common enough that a non-numeric fallback to text is
 * safer than a `NaN`.
 */
function cellValue(cell: XmlElement, shared: string[]): unknown {
  const type = attribute(cell, "t")

  if (type === "inlineStr") return inlineString(cell)

  // Only `<v>` is a value. Falling back to the whole cell would return a
  // formula's own text (`SUM(A2:A3)`) as if it were the result.
  const valueNode = childNamed(cell, "v")
  const value = valueNode ? textOf(valueNode).trim() : ""
  if (!value) return ""

  if (type === "s") {
    const index = Number.parseInt(value, 10)
    return Number.isInteger(index) && index >= 0 ? shared[index] ?? "" : ""
  }
  if (type === "b") return value === "1" || /^true$/i.test(value)
  if (type === "str" || type === "e" || type === "d") return value

  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : value
}

function inlineString(cell: XmlElement): string {
  const inline = childNamed(cell, "is")
  return inline ? textOf(inline) : ""
}

/**
 * Place sparse rows into a dense grid and drop what Excel leaves at the edges.
 *
 * `sheetData` is sparse in both directions, so rows are ordered by their own
 * index (an empty row is missing entirely), and the result is trimmed of
 * trailing empty rows and columns — the same shape a CSV import produces, so a
 * round-tripped sheet does not grow phantom blank rows every time it is saved.
 */
function trimGrid(rows: Array<{ index: number; cells: unknown[] }>): unknown[][] {
  let width = 0
  for (const row of rows) {
    for (let index = row.cells.length - 1; index >= width; index -= 1) {
      if (!isBlank(row.cells[index])) {
        width = index + 1
        break
      }
    }
  }

  const dense: unknown[][] = []
  for (const row of rows) {
    if (row.index >= MAX_ROWS) break
    while (dense.length < row.index) dense.push([])
    const cells = row.cells.slice(0, width)
    while (cells.length < width) cells.push("")
    dense[row.index] = cells
  }

  let lastRow = -1
  dense.forEach((row, index) => {
    if (row.some((value) => !isBlank(value))) lastRow = index
  })
  if (lastRow < 0) return []

  return dense.slice(0, lastRow + 1).map((row) => {
    const cells = row.slice(0, width)
    while (cells.length < width) cells.push("")
    return cells
  })
}

function isBlank(value: unknown): boolean {
  return value === "" || value === null || value === undefined
}
