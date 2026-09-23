"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { Download, FileImage, FileJson, FileText, LoaderCircle, Presentation } from "lucide-react"

import type { DesignDoc } from "@/lib/design/document"
import { exportPageIndices, exportPixelScale, type DesignExportFormat, type ExportQuality } from "@/lib/design/export-plan"

import { exportDesign } from "./design-export"
import { PopoverButton } from "./popover"

/**
 * The Download menu: file type, which pages, and quality. The export runs in
 * the page (nothing is uploaded), reports progress page by page and can be
 * cancelled. Its state lives here rather than in the popover, so closing the
 * menu does not lose a running export.
 */

interface FormatChoice {
  id: DesignExportFormat
  label: string
  hint: string
  icon: ReactNode
}

const FORMATS: readonly FormatChoice[] = [
  { id: "png", label: "PNG", hint: "Sharp pictures, best for text and graphics", icon: <FileImage className="h-4 w-4" /> },
  { id: "jpg", label: "JPG", hint: "Small pictures, good for photos", icon: <FileImage className="h-4 w-4" /> },
  { id: "pdf", label: "PDF", hint: "One file to print or hand in", icon: <FileText className="h-4 w-4" /> },
  { id: "pptx", label: "PowerPoint", hint: "Editable slides with speaker notes", icon: <Presentation className="h-4 w-4" /> },
  { id: "json", label: "Design file", hint: "A backup you can open here again", icon: <FileJson className="h-4 w-4" /> },
]

type PageScope = "all" | "current" | "custom"

export interface ExportMenuProps {
  design: DesignDoc
  pageIndex: number
  onNotify: (message: string) => void
  /** Runs before the export reads the design (for example, to finish typing). */
  onBeforeExport?: () => void
  buttonClassName?: string
}

export function ExportMenu({ design, pageIndex, onNotify, onBeforeExport, buttonClassName = "canvas-tool" }: ExportMenuProps) {
  const [format, setFormat] = useState<DesignExportFormat>(() => (design.pages.length > 1 ? "pdf" : "png"))
  const [scope, setScope] = useState<PageScope>("all")
  const [chosen, setChosen] = useState<number[]>([])
  const [quality, setQuality] = useState<ExportQuality>("standard")
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => () => controllerRef.current?.abort(), [])

  const pageCount = design.pages.length
  const hiddenCount = design.pages.filter((page) => page.hidden).length
  const validChosen = chosen.filter((index) => index < pageCount)
  const requested = scope === "all" ? undefined : scope === "current" ? [pageIndex] : validChosen
  const pagesOut = format === "json" ? pageCount : format === "pptx" && scope === "all" ? pageCount : exportPageIndices(design, requested).length
  const pictures = format === "png" || format === "jpg"
  const scale = exportPixelScale(design.width, design.height, quality)
  const running = progress !== null
  const blocked = format !== "json" && scope === "custom" && !validChosen.length

  const run = async () => {
    if (running || blocked) return
    onBeforeExport?.()
    const controller = new AbortController()
    controllerRef.current = controller
    setProgress({ done: 0, total: Math.max(1, pagesOut) })
    try {
      const result = await exportDesign(design, {
        format,
        pages: format === "json" ? undefined : requested,
        quality,
        signal: controller.signal,
        onProgress: (done, total) => setProgress({ done, total: Math.max(1, total) }),
      })
      onNotify(result.pages > 1 ? `Downloaded ${result.filename} (${result.pages} pages).` : `Downloaded ${result.filename}.`)
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") onNotify("Download cancelled.")
      else if (error instanceof Error && error.name === "AbortError") onNotify("Download cancelled.")
      else onNotify(error instanceof Error && error.message ? `Download failed: ${error.message}` : "Download failed. Please try again.")
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null
      setProgress(null)
    }
  }

  const togglePage = (index: number) => setChosen((current) => (current.includes(index) ? current.filter((value) => value !== index) : [...current, index].sort((a, b) => a - b)))

  const percent = progress ? Math.round((Math.min(progress.done, progress.total) / progress.total) * 100) : 0

  return (
    <PopoverButton
      label={running ? `Downloading… ${percent}%` : "Download"}
      buttonClassName={buttonClassName}
      placement="bottom-end"
      width={340}
      active={running}
      panel={() => (
        <div className="w-[19rem] space-y-3">
          <p className="text-sm font-bold">Download</p>
          <div role="radiogroup" aria-label="File type" className="grid gap-1">
            {FORMATS.map((choice) => (
              <button
                key={choice.id}
                type="button"
                role="radio"
                aria-checked={format === choice.id}
                disabled={running}
                onClick={() => setFormat(choice.id)}
                className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition disabled:opacity-60 ${format === choice.id ? "bg-primary/12 ring-2 ring-primary" : "hover:bg-muted"}`}
              >
                <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${format === choice.id ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{choice.icon}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{choice.label}</span>
                  <span className="block truncate text-[0.72rem] text-muted-foreground">{choice.hint}</span>
                </span>
              </button>
            ))}
          </div>

          {format !== "json" && pageCount > 1 ? (
            <div>
              <p className="mb-1 text-xs font-semibold">Pages</p>
              <div role="radiogroup" aria-label="Pages to download" className="grid grid-cols-3 gap-1">
                {(
                  [
                    ["all", `All (${pageCount - (format === "pptx" ? 0 : hiddenCount) || pageCount})`],
                    ["current", `Page ${pageIndex + 1}`],
                    ["custom", "Choose"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={scope === value}
                    disabled={running}
                    onClick={() => {
                      setScope(value)
                      if (value === "custom" && !validChosen.length) setChosen([pageIndex])
                    }}
                    className={`rounded-lg px-2 py-1.5 text-xs font-semibold transition ${scope === value ? "bg-foreground text-background" : "bg-muted hover:bg-accent"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {scope === "custom" ? (
                <div className="mt-2 grid max-h-32 grid-cols-6 gap-1 overflow-y-auto pr-0.5" aria-label="Choose pages">
                  {design.pages.map((page, index) => (
                    <button
                      key={page.id}
                      type="button"
                      aria-pressed={validChosen.includes(index)}
                      disabled={running}
                      onClick={() => togglePage(index)}
                      title={page.hidden ? `Page ${index + 1} (hidden)` : `Page ${index + 1}`}
                      className={`h-8 rounded-lg text-xs font-semibold tabular-nums transition ${validChosen.includes(index) ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"} ${page.hidden ? "italic opacity-70" : ""}`}
                    >
                      {index + 1}
                    </button>
                  ))}
                </div>
              ) : null}
              {hiddenCount && scope === "all" ? (
                <p className="mt-1.5 text-[0.7rem] text-muted-foreground">
                  {format === "pptx" ? `${hiddenCount} hidden page${hiddenCount === 1 ? "" : "s"} become hidden slides.` : `${hiddenCount} hidden page${hiddenCount === 1 ? " is" : "s are"} left out.`}
                </p>
              ) : null}
            </div>
          ) : null}

          {format === "png" || format === "jpg" || format === "pdf" ? (
            <div>
              <p className="mb-1 text-xs font-semibold">Quality</p>
              <div role="radiogroup" aria-label="Quality" className="grid grid-cols-2 gap-1">
                {(
                  [
                    ["standard", "Standard"],
                    ["high", "High (print)"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={quality === value}
                    disabled={running}
                    onClick={() => setQuality(value)}
                    className={`rounded-lg px-2 py-1.5 text-xs font-semibold transition ${quality === value ? "bg-foreground text-background" : "bg-muted hover:bg-accent"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {pictures ? (
                <p className="mt-1.5 text-[0.7rem] tabular-nums text-muted-foreground">
                  {Math.round(design.width * scale)} × {Math.round(design.height * scale)} px{pagesOut > 1 ? ` · ${pagesOut} files in a .zip` : ""}
                </p>
              ) : null}
            </div>
          ) : null}

          {running ? (
            <div className="space-y-2" aria-live="polite">
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${Math.max(4, percent)}%` }} />
              </div>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  {progress && progress.done < progress.total ? `Preparing page ${progress.done + 1} of ${progress.total}…` : "Saving the file…"}
                </span>
                <button type="button" className="rounded-lg px-2 py-1 font-semibold text-destructive hover:bg-destructive/10" onClick={() => controllerRef.current?.abort()}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void run()}
              disabled={blocked}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              {format === "json" ? "Download design file" : `Download ${pagesOut} page${pagesOut === 1 ? "" : "s"}`}
            </button>
          )}
        </div>
      )}
    >
      {running ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
      <span className="hidden text-xs sm:inline">{running ? `${percent}%` : "Download"}</span>
    </PopoverButton>
  )
}
