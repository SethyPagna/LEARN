"use client"

import { useState } from "react"
import { Upload } from "lucide-react"
import type { ImportedPresentation } from "@/lib/export/pptx-import"
import type { ImportedPdfDocument } from "@/lib/export/pdf-import"

export type ImportedStudioContent = ({ kind: "slides" } & ImportedPresentation) | ({ kind: "docs" } & ImportedPdfDocument)

export function StudioContentImport({ onImport, format }: {
  onImport: (content: ImportedStudioContent) => void | Promise<void>
  format?: "pptx" | "pdf"
}) {
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState("")
  const label = format ? format.toUpperCase() : "PPTX or PDF"
  return <div className="flex flex-wrap items-center gap-2">
    <label title="Brings in the text; the original layout is not kept." className={`inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border border-border bg-card px-3.5 text-xs font-semibold transition hover:bg-muted focus-within:ring-2 focus-within:ring-ring${busy ? " pointer-events-none opacity-60" : ""}`}>
      <Upload className="h-4 w-4" aria-hidden="true" />
      {busy ? "Importing…" : `Import ${label}`}
      <input type="file" className="sr-only" aria-label={`Import ${label} content`} accept={format ? `.${format}` : ".pptx,.pdf"} disabled={busy} onChange={async (event) => {
        const file = event.currentTarget.files?.[0]
        event.currentTarget.value = ""
        if (!file || busy) return
        setBusy(true)
        setStatus("Reading file locally…")
        try {
          if (file.size > 25 * 1024 * 1024) throw new Error("Choose a file smaller than 25 MB.")
          let result: ImportedStudioContent
          if (/\.pptx$/i.test(file.name) && format !== "pdf") {
            const { importPptx } = await import("@/lib/export/pptx-import")
            result = { kind: "slides", ...await importPptx(new Uint8Array(await file.arrayBuffer())) }
          } else if (/\.pdf$/i.test(file.name) && format !== "pptx") {
            const { studioDocumentFromPdfFile } = await import("@/lib/export/pdf-import")
            result = { kind: "docs", ...await studioDocumentFromPdfFile(file) }
          } else throw new Error("Choose a supported PPTX or PDF file.")
          if (!result.title.trim()) result.title = file.name.replace(/\.(pptx|pdf)$/i, "")
          await onImport(result)
          setStatus(`Imported ${result.kind === "slides" ? result.slides.length + " slides" : result.pages.length + " pages"}: text only, layout not kept. ${result.warnings.join(" ")}`.trim())
        } catch (error) {
          setStatus(`Import failed: ${error instanceof Error ? error.message : "The file could not be read."}`)
        } finally { setBusy(false) }
      }} />
    </label>
    {status && <p role="status" className="text-xs text-muted-foreground">{status}</p>}
  </div>
}
