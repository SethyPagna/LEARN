"use client"

import { useEffect, useState } from "react"
import type { MediaFile } from "./types"

/** Render private files locally; previews never send uploads to an outside viewer. */
export function FilePreview({ file }: { file: MediaFile }) {
  const source = `/api/files/${encodeURIComponent(file.id)}/download`
  const [text, setText] = useState("")
  const [error, setError] = useState("")
  const kind = file.content_type
  const nativePreview = /^(image|video|audio)\//.test(kind) || kind === "application/pdf"
  useEffect(() => {
    setText(""); setError("")
    if (nativePreview) return
    const controller = new AbortController()
    async function read() {
      try {
        if (file.size_bytes > 25 * 1024 * 1024) throw new Error("Download this file to view it; it exceeds the preview limit.")
        const response = await fetch(source, { signal: controller.signal })
        if (!response.ok) throw new Error("This file could not be previewed.")
        const bytes = new Uint8Array(await response.arrayBuffer())
        let result = ""
        if (kind.startsWith("text/")) result = new TextDecoder().decode(bytes)
        else if (kind.includes("wordprocessingml")) {
          const { importDocx } = await import("@/lib/export/docx-import")
          const { blocksToDocumentHtml } = await import("@/lib/export/html-blocks")
          result = new DOMParser().parseFromString(blocksToDocumentHtml((await importDocx(bytes)).blocks), "text/html").body.textContent || ""
        } else if (kind.includes("spreadsheetml")) {
          const { importXlsx } = await import("@/lib/export/xlsx-import")
          result = (await importXlsx(bytes)).cells.map(row => row.join("\t")).join("\n")
        } else if (kind.includes("presentationml")) {
          const { importPptx } = await import("@/lib/export/pptx-import")
          result = (await importPptx(bytes)).slides.map(slide => `${slide.title}\n${slide.body}`).join("\n\n")
        } else throw new Error("Preview isn't available for this format. You can download it below.")
        if (!controller.signal.aborted) setText(result.slice(0, 200_000) || "This file has no readable text.")
      } catch (reason) { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Preview unavailable.") }
    }
    void read()
    return () => controller.abort()
  }, [file.id, file.size_bytes, kind, nativePreview, source])

  if (error) return <p role="status" className="p-4 text-sm text-muted-foreground">{error}</p>
  if (kind.startsWith("image/")) return <img loading="lazy" src={source} alt={file.filename} className="max-h-[65dvh] w-full object-contain" onError={() => setError("Image could not be loaded.")} />
  if (kind.startsWith("video/")) return <video controls preload="metadata" src={source} className="max-h-[65dvh] w-full" onError={() => setError("Video could not be loaded. Download it to try another player.")} />
  if (kind.startsWith("audio/")) return <audio controls preload="metadata" src={source} className="my-10 w-full" onError={() => setError("Audio could not be loaded. Download it to try another player.")} />
  if (kind === "application/pdf") return <iframe title={`Preview of ${file.filename}`} src={`${source}?preview=1`} className="h-[65dvh] w-full rounded-md border-0" />
  return <div className="min-h-60 overflow-auto rounded-md bg-background p-4">{text ? <pre className="whitespace-pre-wrap break-words text-sm leading-6">{text}</pre> : <p role="status" className="text-sm text-muted-foreground">Loading preview…</p>}</div>
}
