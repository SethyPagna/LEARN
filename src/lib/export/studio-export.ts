/**
 * `studio-export` — the single seam between Studio payloads and the file
 * writers.
 *
 * The Studio editor holds a document as HTML and a sheet as a cell grid. This
 * module is the only place that knows both those payloads and the builders, so
 * the editor component stays a caller: one import, one function per format.
 *
 * The return direction lives in `./studio-import`, which reads `buildDocx` and
 * `buildXlsx` output back into the same two payloads. Together they are the
 * round-trip the Brief asks for: what this module writes, that one reads.
 *
 * What this module deliberately does *not* do:
 *
 *   - **No network.** Nothing is fetched: images inside a document become
 *     labelled placeholders instead of being downloaded and re-encoded.
 *   - **No second layout engine.** DOCX, XLSX and PDF are all built in-process
 *     from the same blocks: `./docx` and `./pdf` are two renderers over one
 *     `ThemedBlock[]`, so a document cannot look like two different documents.
 */

import type { ThemedBlock } from "@/lib/ai/format-response"
import { buildDocx } from "@/lib/export/docx"
import { blocksFromDocumentHtml } from "@/lib/export/html-blocks"
import { buildPdf } from "@/lib/export/pdf"
import { buildXlsx } from "@/lib/export/xlsx"

/** MIME types for the three formats, as registered with IANA. */
export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
export const PDF_MIME = "application/pdf"

export interface DocumentExportInput {
  /** Document title; becomes the Word core-property title and the PDF's. */
  title: string
  /** The editor's HTML body. */
  html: string
  creator?: string
  date?: Date
}

/** Document HTML -> themed blocks -> `.docx` bytes. */
export function documentHtmlToDocx(input: DocumentExportInput): Uint8Array {
  return buildDocx({
    title: input.title,
    blocks: documentHtmlToBlocks(input.html),
    ...(input.creator ? { creator: input.creator } : {}),
    ...(input.date ? { date: input.date } : {}),
  })
}

/**
 * Document HTML -> themed blocks -> PDF bytes.
 *
 * The same blocks the DOCX path builds, so the two files describe the same
 * document. The PDF is produced by this repository's own writer: no print
 * dialog, no headless browser, no dependency.
 */
export function documentHtmlToPdf(input: DocumentExportInput): Uint8Array {
  return buildPdf({
    title: input.title,
    blocks: documentHtmlToBlocks(input.html),
    ...(input.date ? { createdAt: input.date } : {}),
  })
}

/** The HTML-to-blocks step on its own, for callers that do not want a file. */
export function documentHtmlToBlocks(html: string): ThemedBlock[] {
  return blocksFromDocumentHtml(html)
}

export interface SheetExportInput {
  /** Sheet title; becomes the worksheet name. */
  title: string
  /** Row-major cells, exactly as the sheet editor stores them. */
  cells: unknown[][]
  date?: Date
}

/** Sheet cells -> `.xlsx` bytes. */
export function sheetCellsToXlsx(input: SheetExportInput): Uint8Array {
  return buildXlsx({
    title: input.title,
    cells: input.cells,
    ...(input.date ? { date: input.date } : {}),
  })
}
