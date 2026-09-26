"use client"

import { useMemo, useState, type ReactNode } from "react"
import { Archive, ArrowRight, Ellipsis, FilePlus2, LayoutTemplate, LoaderCircle, NotebookText, Plus, RefreshCw, Ruler, Search, Sparkles, TriangleAlert } from "lucide-react"

import { createDesignDoc, type DesignDoc } from "@/lib/design/document"
import { timestampMs } from "@/lib/design/draft"
import { designFormatGroups, designFormats, MAX_PAGE_EDGE, MIN_PAGE_EDGE, type DesignFormat, type DesignFormatGroup } from "@/lib/design/formats"
import { htmlToDesignSpec, specHasContent } from "@/lib/design/from-content"
import { designFromSpec } from "@/lib/design/layout"
import type { MeasureText } from "@/lib/design/text"
import { DEFAULT_DESIGN_THEME } from "@/lib/design/themes"
import { DESIGN_TEMPLATES, designFromTemplate, type DesignTemplate } from "@/lib/design/templates"
import { formatRelativeTime } from "@/lib/format-time"

import type { Note } from "../types"
import { useNearViewport } from "./editor-hooks"
import { FitThumbnail } from "./fit-thumbnail"
import { templatePreview } from "./panels/templates-panel"
import { PopoverButton } from "./popover"

/**
 * The designs home: start a design at any size, from a template or from one
 * of your notes, and find the designs you already have. The list shows covers
 * only (the API's summary view), so it stays quick with many designs.
 */

export interface DesignSummary {
  id: string
  title: string
  updatedAt: string | null
  pageCount: number
  /** The cover page only. */
  preview: DesignDoc
}

export interface DesignsHomeProps {
  items: readonly DesignSummary[] | null
  error: string
  notes: readonly Note[]
  measure: MeasureText
  /** The design being opened, while it loads. */
  openingId: string | null
  onOpen: (id: string) => void
  /** Open a new (not yet saved) design in the editor. */
  onCreate: (doc: DesignDoc, message?: string) => void
  onArchive: (id: string) => void
  onRetry: () => void
  onNotify: (message: string) => void
}

const GROUP_TINT: Record<DesignFormatGroup, string> = {
  presentation: "from-violet-500 to-fuchsia-500",
  document: "from-sky-500 to-cyan-400",
  social: "from-pink-500 to-orange-400",
  poster: "from-amber-400 to-rose-500",
  fun: "from-emerald-400 to-lime-400",
}

function relativeUpdated(value: string | null): string {
  const ms = timestampMs(value)
  if (ms === null) return ""
  const label = formatRelativeTime(new Date(ms).toISOString())
  return label === "now" ? "just now" : /^\d+[mh]$/.test(label) ? `${label} ago` : label
}

function SectionTitle({ icon, children, action }: { icon: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 mt-8 flex items-center justify-between gap-3 first:mt-0">
      <h3 className="flex items-center gap-2 text-base font-bold tracking-tight">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-primary/12 text-primary" aria-hidden="true">
          {icon}
        </span>
        {children}
      </h3>
      {action}
    </div>
  )
}

function FormatShape({ format }: { format: Pick<DesignFormat, "width" | "height" | "group"> }) {
  const box = 52
  const ratio = format.width / format.height
  const width = ratio >= 1 ? box : Math.max(18, box * ratio)
  const height = ratio >= 1 ? Math.max(18, box / ratio) : box
  return (
    <span className="flex h-14 w-14 items-center justify-center" aria-hidden="true">
      <span className={`block rounded-[6px] bg-gradient-to-br shadow-[0_6px_14px_-8px_rgba(15,23,42,0.6)] ${GROUP_TINT[format.group]}`} style={{ width, height }} />
    </span>
  )
}

function CustomSizeForm({ onCreate }: { onCreate: (width: number, height: number) => void }) {
  const [width, setWidth] = useState("1600")
  const [height, setHeight] = useState("900")
  const w = Number(width)
  const h = Number(height)
  const valid = Number.isFinite(w) && Number.isFinite(h) && w >= MIN_PAGE_EDGE && h >= MIN_PAGE_EDGE && w <= MAX_PAGE_EDGE && h <= MAX_PAGE_EDGE
  return (
    <form
      className="w-[15rem] space-y-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (valid) onCreate(Math.round(w), Math.round(h))
      }}
    >
      <p className="text-sm font-bold">Custom size</p>
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
        <label className="text-xs font-semibold">
          Width
          <input value={width} onChange={(event) => setWidth(event.target.value.replace(/[^\d]/g, "").slice(0, 4))} inputMode="numeric" className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-2 text-sm tabular-nums outline-none focus:border-primary" />
        </label>
        <span className="pb-2 text-muted-foreground">×</span>
        <label className="text-xs font-semibold">
          Height
          <input value={height} onChange={(event) => setHeight(event.target.value.replace(/[^\d]/g, "").slice(0, 4))} inputMode="numeric" className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-2 text-sm tabular-nums outline-none focus:border-primary" />
        </label>
      </div>
      <p className={`text-[0.7rem] ${valid ? "text-muted-foreground" : "text-destructive"}`}>
        Pixels, from {MIN_PAGE_EDGE} to {MAX_PAGE_EDGE} on each side.
      </p>
      <button type="submit" disabled={!valid} className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50">
        <FilePlus2 className="h-4 w-4" aria-hidden="true" />
        Create design
      </button>
    </form>
  )
}

function TemplateTile({ template, measure, onUse }: { template: DesignTemplate; measure: MeasureText; onUse: (template: DesignTemplate) => void }) {
  const [ref, near] = useNearViewport<HTMLButtonElement>()
  const doc = near ? templatePreview(template, measure) : null
  return (
    <button
      ref={ref}
      type="button"
      onClick={() => onUse(template)}
      className="group flex flex-col overflow-hidden rounded-2xl bg-card text-left ring-1 ring-border transition hover:-translate-y-0.5 hover:shadow-[0_18px_36px_-24px_rgba(15,23,42,0.6)] hover:ring-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      title={`${template.name}: ${template.description}`}
    >
      <span className="relative block w-full bg-muted/50">
        {doc?.pages[0] ? (
          <FitThumbnail width={doc.width} height={doc.height} theme={doc.theme} page={doc.pages[0]} measure={measure} maxHeight={200} className="pointer-events-none" />
        ) : (
          <span className="block aspect-video w-full animate-pulse bg-muted" />
        )}
        {doc ? <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[0.65rem] font-semibold text-white">{doc.pages.length} pages</span> : null}
      </span>
      <span className="block px-3 py-2.5">
        <span className="block truncate text-sm font-semibold">{template.name}</span>
        <span className="block truncate text-xs text-muted-foreground">{template.description}</span>
      </span>
    </button>
  )
}

function DesignCard({ item, measure, opening, onOpen, onArchive }: { item: DesignSummary; measure: MeasureText; opening: boolean; onOpen: () => void; onArchive: () => void }) {
  const [ref, near] = useNearViewport<HTMLDivElement>()
  const cover = item.preview.pages[0]
  return (
    <div ref={ref} className="group relative">
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full flex-col overflow-hidden rounded-2xl bg-card text-left ring-1 ring-border transition hover:-translate-y-0.5 hover:shadow-[0_18px_36px_-24px_rgba(15,23,42,0.6)] hover:ring-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Open ${item.title}`}
      >
        <span className="relative block w-full bg-muted/50">
          {near && cover ? (
            <FitThumbnail width={item.preview.width} height={item.preview.height} theme={item.preview.theme} page={cover} measure={measure} maxHeight={220} className="pointer-events-none" />
          ) : (
            <span className="block w-full bg-muted" style={{ aspectRatio: `${item.preview.width} / ${item.preview.height}`, maxHeight: 220 }} />
          )}
          {opening ? (
            <span className="absolute inset-0 flex items-center justify-center bg-background/60">
              <LoaderCircle className="h-6 w-6 animate-spin text-primary" aria-label="Opening" />
            </span>
          ) : null}
        </span>
        <span className="block px-3 py-2.5">
          <span className="block truncate text-sm font-semibold">{item.title || "Untitled design"}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {[relativeUpdated(item.updatedAt) && `Edited ${relativeUpdated(item.updatedAt)}`, `${item.pageCount} page${item.pageCount === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}
          </span>
        </span>
      </button>
      <span className="absolute right-2 top-2 opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100 [@media(pointer:coarse)]:opacity-100">
        <PopoverButton
          label={`${item.title || "Design"} options`}
          buttonClassName="inline-flex h-8 w-8 items-center justify-center rounded-full bg-background/90 text-foreground shadow ring-1 ring-border transition hover:bg-accent"
          placement="bottom-end"
          width={200}
          panel={(close) => (
            <div className="grid min-w-44 gap-0.5 text-sm">
              <button type="button" className="context-item w-full text-left" onClick={() => { close(); onOpen() }}>
                <ArrowRight className="h-4 w-4" /> Open
              </button>
              <button type="button" className="context-item w-full text-left text-destructive" onClick={() => { close(); onArchive() }}>
                <Archive className="h-4 w-4" /> Move to archive
              </button>
            </div>
          )}
        >
          <Ellipsis className="h-4 w-4" />
        </PopoverButton>
      </span>
    </div>
  )
}

export function DesignsHome({ items, error, notes, measure, openingId, onOpen, onCreate, onArchive, onRetry, onNotify }: DesignsHomeProps) {
  const [query, setQuery] = useState("")
  const [group, setGroup] = useState<DesignFormatGroup | "all">("all")
  const [allTemplates, setAllTemplates] = useState(false)

  const formats = group === "all" ? designFormats : designFormats.filter((format) => format.group === group)
  const needle = query.trim().toLowerCase()
  const filtered = useMemo(() => (items ?? []).filter((item) => !needle || item.title.toLowerCase().includes(needle)), [items, needle])
  const templates = allTemplates ? DESIGN_TEMPLATES : DESIGN_TEMPLATES.slice(0, 8)
  const recentNotes = useMemo(
    () =>
      [...notes]
        .filter((note) => !note.archived_at && note.content.replace(/<[^>]*>/g, "").trim())
        .sort((a, b) => (timestampMs(b.updated_at) ?? 0) - (timestampMs(a.updated_at) ?? 0))
        .slice(0, 6),
    [notes],
  )

  const createFormat = (format: DesignFormat) => onCreate(createDesignDoc({ format: format.id, theme: "minimal" }), `New ${format.label.toLowerCase()}. Pick a template or start adding.`)
  const createCustom = (width: number, height: number) => onCreate(createDesignDoc({ format: "custom", width, height, theme: "minimal" }), `New ${width} × ${height} design.`)
  const useTemplate = (template: DesignTemplate) => onCreate(designFromTemplate(template, { measure }), `${template.name} is ready to edit.`)
  const fromNote = (note: Note) => {
    const spec = htmlToDesignSpec(note.content, { title: note.title })
    if (!specHasContent(spec)) {
      onNotify(`“${note.title || "This note"}” has nothing to lay out yet.`)
      return
    }
    const doc = designFromSpec(spec, { format: "presentation", theme: DEFAULT_DESIGN_THEME, name: note.title || "Notes", measure })
    onCreate(doc, `Designed ${doc.pages.length} slide${doc.pages.length === 1 ? "" : "s"} from “${note.title || "your note"}”.`)
  }

  return (
    <div className="mx-auto w-full max-w-6xl pb-10">
      <div className="relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 via-fuchsia-500 to-orange-400 p-6 text-white shadow-[0_30px_60px_-36px_rgba(124,58,237,0.8)] sm:p-8">
        <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-white/15 blur-2xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-20 left-1/3 h-48 w-48 rounded-full bg-amber-300/30 blur-2xl" aria-hidden="true" />
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/80">Design studio</p>
        <h2 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">What will you make today?</h2>
        <p className="mt-1 max-w-xl text-sm text-white/85">Slides, worksheets, posters, flashcards and memes. Drag things around, or write an outline and let the layouts do the arranging.</p>
        <label className="mt-5 flex h-11 max-w-lg items-center gap-2 rounded-2xl bg-white/95 px-3 text-slate-900 shadow-lg ring-1 ring-white/40 focus-within:ring-2 focus-within:ring-white">
          <Search className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your designs" aria-label="Search your designs" className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-500" type="search" />
        </label>
      </div>

      <SectionTitle icon={<Plus className="h-4 w-4" />}>Start something new</SectionTitle>
      <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Design type">
        {[{ id: "all" as const, label: "All" }, ...designFormatGroups].map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setGroup(entry.id)}
            aria-pressed={group === entry.id}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${group === entry.id ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"}`}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {formats.map((format) => (
          <button
            key={format.id}
            type="button"
            onClick={() => createFormat(format)}
            className="flex items-center gap-3 rounded-2xl bg-card p-2.5 text-left ring-1 ring-border transition hover:-translate-y-0.5 hover:shadow-[0_14px_28px_-22px_rgba(15,23,42,0.6)] hover:ring-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title={format.description}
          >
            <FormatShape format={format} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{format.label}</span>
              <span className="block truncate text-[0.7rem] tabular-nums text-muted-foreground">
                {format.width} × {format.height}
              </span>
            </span>
          </button>
        ))}
        <PopoverButton
          label="Custom size"
          buttonClassName="flex items-center gap-3 rounded-2xl border-2 border-dashed border-border bg-transparent p-2.5 text-left transition hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          width={260}
          panel={() => <CustomSizeForm onCreate={createCustom} />}
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted" aria-hidden="true">
            <Ruler className="h-5 w-5 text-muted-foreground" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">Custom size</span>
            <span className="block text-[0.7rem] text-muted-foreground">Any width and height</span>
          </span>
        </PopoverButton>
      </div>

      <SectionTitle
        icon={<LayoutTemplate className="h-4 w-4" />}
        action={
          DESIGN_TEMPLATES.length > 8 ? (
            <button type="button" className="text-xs font-semibold text-primary hover:underline" onClick={() => setAllTemplates((current) => !current)}>
              {allTemplates ? "Show fewer" : `See all ${DESIGN_TEMPLATES.length}`}
            </button>
          ) : null
        }
      >
        Templates
      </SectionTitle>
      <div className="grid grid-cols-2 items-start gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {templates.map((template) => (
          <TemplateTile key={template.id} template={template} measure={measure} onUse={useTemplate} />
        ))}
      </div>

      {recentNotes.length ? (
        <>
          <SectionTitle icon={<Sparkles className="h-4 w-4" />}>Turn a note into slides</SectionTitle>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {recentNotes.map((note) => (
              <button
                key={note.id}
                type="button"
                onClick={() => fromNote(note)}
                className="flex items-center gap-3 rounded-2xl bg-card px-3 py-2.5 text-left ring-1 ring-border transition hover:-translate-y-0.5 hover:ring-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                title={`Design slides from ${note.title || "this note"}`}
              >
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-lg text-amber-900 dark:bg-amber-400/15 dark:text-amber-200" aria-hidden="true">
                  {note.icon || <NotebookText className="h-5 w-5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{note.title || "Untitled note"}</span>
                  <span className="block truncate text-xs text-muted-foreground">Make a slide deck from this note</span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </button>
            ))}
          </div>
        </>
      ) : null}

      <SectionTitle icon={<FilePlus2 className="h-4 w-4" />}>Your designs</SectionTitle>
      {error ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">{error}</span>
          <button type="button" onClick={onRetry} className="inline-flex items-center gap-1.5 rounded-lg bg-background px-3 py-1.5 text-xs font-semibold text-foreground ring-1 ring-border hover:bg-accent">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Try again
          </button>
        </div>
      ) : items === null ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-label="Loading your designs">
          {Array.from({ length: 4 }, (_, index) => (
            <span key={index} className="block aspect-[4/3] animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : filtered.length ? (
        <div className="grid grid-cols-2 items-start gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((item) => (
            <DesignCard key={item.id} item={item} measure={measure} opening={openingId === item.id} onOpen={() => onOpen(item.id)} onArchive={() => onArchive(item.id)} />
          ))}
        </div>
      ) : (
        <p className="rounded-2xl bg-muted/60 px-4 py-6 text-center text-sm text-muted-foreground">
          {needle ? `No design is called “${query.trim()}”.` : "No designs yet. Pick a size or a template above and it appears here as soon as you edit it."}
        </p>
      )}
    </div>
  )
}
