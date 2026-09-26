/**
 * `studio-import` — the single seam between an imported OOXML file and the
 * Studio editor's own payloads.
 *
 * The mirror image of `./studio-export`: the editor holds a document as HTML and
 * a sheet as a grid of strings, and this module is the only place that knows
 * both those payloads and the importers, so the editor component stays a caller.
 *
 * The conversions are not gratuitous, they are what the two editors can hold:
 *
 *   - **A document is HTML.** `importDocx` returns blocks (the shared
 *     vocabulary), and the document editor stores the HTML rendering of them, so
 *     the blocks are serialized rather than stored.
 *   - **A sheet is text.** The grid is `string[][]` — a cell is what the user
 *     typed — so a numeric or boolean cell from the file is stringified (`41`,
 *     `TRUE`) exactly as it would read in Excel's formula bar. The typed value
 *     survives in the `.xlsx` the sheet exports again, because the sheet writer
 *     re-types anything numeric-looking that a user types.
 *
 * Nothing here reads `File`, only `Blob`: the same functions work for a picked
 * file, a fetched response, or a byte array a test already holds.
 */

import type { ThemedBlock } from "@/lib/ai/format-response"
import { importDocx } from "@/lib/export/docx-import"
import { blocksToDocumentHtml } from "@/lib/export/html-blocks"
import { importXlsx } from "@/lib/export/xlsx-import"

export interface ImportedStudioDocument {
  /** Title from the file's core properties, or `""` when it has none. */
  title: string
  /** The blocks the document was read as, for callers that want more than HTML. */
  blocks: ThemedBlock[]
  /** The document editor's payload. */
  html: string
}

/** A picked `.docx` as document HTML, ready for the rich-text editor. */
export async function studioDocumentFromDocxFile(file: Blob): Promise<ImportedStudioDocument> {
  const { title, blocks } = await importDocx(await bytesOf(file))
  return { title, blocks, html: blocksToDocumentHtml(blocks) }
}

export interface ImportedStudioSheet {
  /** Worksheet name from the file, or `""` when it has none. */
  title: string
  /** The sheet editor's payload: every cell as text. */
  cells: string[][]
  rowCount: number
  columnCount: number
}

/** A picked `.xlsx` as a grid of text cells, ready for the sheet editor. */
export async function studioSheetFromXlsxFile(file: Blob): Promise<ImportedStudioSheet> {
  const { title, cells } = await importXlsx(await bytesOf(file))
  const grid = cells.map((row) => row.map(cellText))
  return { title, cells: grid, rowCount: grid.length, columnCount: grid[0]?.length ?? 0 }
}

async function bytesOf(file: Blob): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer())
}

/**
 * One cell as text. A boolean is `TRUE`/`FALSE` because that is what Excel shows
 * and what it writes back; a number keeps its digits; a blank stays blank.
 */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE"
  return String(value)
}

/**
 * A message safe to show a user: the importers already say which part was
 * unreadable and why, so this only guarantees that something is always said.
 */
export function describeImportFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "")
  return message ? `Import failed: ${message}` : "Import failed: the file could not be read."
}
