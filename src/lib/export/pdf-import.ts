import type { ThemedBlock } from "@/lib/ai/format-response"
import type { getDocument } from "pdfjs-dist"
import { blocksToDocumentHtml } from "@/lib/export/html-blocks"

const MAX_FILE_BYTES = 25 * 1024 * 1024
const MAX_PAGES = 200
const MAX_CHARACTERS = 1_000_000
const IMPORT_TIMEOUT_MS = 60_000

export interface ImportedPdfDocument {
  title: string
  pages: string[]
  blocks: ThemedBlock[]
  html: string
  warnings: string[]
}

/** PDF.js is served as a same-origin module, fetched only after a PDF is selected. */
export async function studioDocumentFromPdfFile(file: Blob): Promise<ImportedPdfDocument> {
  if (file.size > MAX_FILE_BYTES) throw new Error("PDF exceeds the 25 MB import limit.")
  const moduleUrl = "/vendor/pdfjs/pdf.min.mjs"
  const pdfjs: typeof import("pdfjs-dist") = await import(/* webpackIgnore: true */ moduleUrl)
  pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.mjs"
  return importPdf(new Uint8Array(await file.arrayBuffer()), pdfjs)
}

/** Dependency injection keeps extraction testable against the real parser without browser globals. */
export async function importPdf(bytes: Uint8Array, engine: { getDocument: typeof getDocument }): Promise<ImportedPdfDocument> {
  if (bytes.length > MAX_FILE_BYTES) throw new Error("PDF exceeds the 25 MB import limit.")
  const task = engine.getDocument({
    data: bytes,
    stopAtErrors: true,
    disableFontFace: true,
    cMapUrl: "/vendor/pdfjs/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: "/vendor/pdfjs/standard_fonts/",
  })
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      extractDocument(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("PDF text import timed out. Try a smaller file.")), IMPORT_TIMEOUT_MS) }),
    ])
  } finally {
    clearTimeout(timer)
    await task.destroy()
  }

  async function extractDocument(): Promise<ImportedPdfDocument> {
    const document = await task.promise
    if (document.numPages > MAX_PAGES) throw new Error(`PDF import supports at most ${MAX_PAGES} pages.`)
    const pages: string[] = []
    const warnings = ["Imported editable text with page boundaries. Original layout, images, annotations, and form fields are not preserved; OCR is not included."]
    let totalCharacters = 0
    for (let number = 1; number <= document.numPages; number += 1) {
      const page = await document.getPage(number)
      try {
        let text = ""
        const reader = page.streamTextContent().getReader()
        try {
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            for (const item of value.items) {
              if (!("str" in item)) continue
              text += `${item.str}${item.hasEOL ? "\n" : " "}`
              if (text.length > 100_000 || totalCharacters + text.length > MAX_CHARACTERS) throw new Error("PDF text exceeds the import limit.")
            }
          }
        } finally {
          await reader.cancel().catch(() => undefined)
        }
        const pageText = text.replace(/ +\n/g, "\n").trim()
        pages.push(pageText)
        totalCharacters += text.length
        if (!pageText) warnings.push(`Page ${number} has no extractable text; a scanned page needs OCR.`)
      } finally {
        page.cleanup()
      }
    }
    if (pages.every((page) => !page)) throw new Error("This PDF has no extractable text. Use OCR on scanned pages before importing.")
    const metadata = await document.getMetadata()
    const info = metadata.info as { Title?: unknown }
    const title = typeof info?.Title === "string" ? info.Title : ""
    const blocks: ThemedBlock[] = []
    pages.forEach((page, index) => {
      if (index > 0) blocks.push({ type: "divider", pageBreak: true })
      blocks.push({ type: "heading", level: 2, text: `Page ${index + 1}` })
      blocks.push({ type: "paragraph", text: page || "[No extractable text on this page]" })
    })
    return { title, pages, blocks, html: blocksToDocumentHtml(blocks), warnings }
  }
}
