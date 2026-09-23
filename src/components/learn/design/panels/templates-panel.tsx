"use client"

import { useMemo, useState } from "react"
import { LayoutTemplate } from "lucide-react"

import { composeFromTemplate, isBlankDesign } from "@/lib/design/compose"
import type { DesignDoc } from "@/lib/design/document"
import { designFormat, designFormatGroups, type DesignFormatGroup } from "@/lib/design/formats"
import type { MeasureText } from "@/lib/design/text"
import { DESIGN_TEMPLATES, designFromTemplate, type DesignTemplate } from "@/lib/design/templates"

import { useNearViewport } from "../editor-hooks"
import type { DesignEditorApi } from "../editor-types"
import { FitThumbnail } from "../fit-thumbnail"
import { EmptyHint, PanelSearch } from "./panel-kit"

/**
 * Starting points. A template is content laid out by the layout engine, so it
 * fits this design's size: on a blank design it replaces the empty page (and
 * brings its theme); otherwise its pages are added after the current one in
 * this design's theme.
 */

const previewCache = new WeakMap<MeasureText, Map<string, DesignDoc>>()

/** The template in its own format and theme, laid out once per font set. */
export function templatePreview(template: DesignTemplate, measure: MeasureText): DesignDoc {
  let byTemplate = previewCache.get(measure)
  if (!byTemplate) {
    byTemplate = new Map()
    previewCache.set(measure, byTemplate)
  }
  let doc = byTemplate.get(template.id)
  if (!doc) {
    doc = designFromTemplate(template, { measure, pageIdPrefix: `tpl-${template.id}-` })
    byTemplate.set(template.id, doc)
  }
  return doc
}

function TemplateCard({ template, measure, onUse }: { template: DesignTemplate; measure: MeasureText; onUse: (template: DesignTemplate) => void }) {
  const [ref, near] = useNearViewport<HTMLButtonElement>()
  const doc = near ? templatePreview(template, measure) : null
  const format = designFormat(template.format)
  return (
    <button
      ref={ref}
      type="button"
      onClick={() => onUse(template)}
      className="group flex w-full flex-col overflow-hidden rounded-2xl bg-muted/60 text-left transition hover:-translate-y-0.5 hover:bg-muted hover:shadow-[0_16px_32px_-22px_rgba(15,23,42,0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      title={`${template.name}: ${template.description}`}
    >
      <span className="relative block w-full">
        {doc?.pages[0] ? (
          <FitThumbnail width={doc.width} height={doc.height} theme={doc.theme} page={doc.pages[0]} measure={measure} maxHeight={220} className="pointer-events-none" />
        ) : (
          <span className="block w-full animate-pulse bg-muted" style={{ aspectRatio: `${format.width} / ${format.height}`, maxHeight: 220 }} />
        )}
        {doc ? <span className="absolute right-1.5 top-1.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[0.62rem] font-semibold text-white">{doc.pages.length} p</span> : null}
      </span>
      <span className="block px-2.5 py-2">
        <span className="block truncate text-[0.8rem] font-semibold">{template.name}</span>
        <span className="block truncate text-[0.7rem] text-muted-foreground">{format.label}</span>
      </span>
    </button>
  )
}

export function TemplatesPanel({ api }: { api: DesignEditorApi }) {
  const [query, setQuery] = useState("")
  const [group, setGroup] = useState<DesignFormatGroup | "all">("all")
  const blank = isBlankDesign(api.design)

  const templates = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return DESIGN_TEMPLATES.filter((template) => {
      if (group !== "all" && template.group !== group) return false
      if (!needle) return true
      return [template.name, template.description, ...template.tags].some((text) => text.toLowerCase().includes(needle))
    })
  }, [group, query])

  const use = (template: DesignTemplate) => {
    let summary = ""
    api.update((design) => {
      const result = composeFromTemplate(design, template, { pageIndex: api.pageIndex, measure: api.measure })
      summary = result.replaced
        ? `${template.name} is ready: ${result.added} page${result.added === 1 ? "" : "s"}.`
        : result.added
          ? `Added ${result.added} page${result.added === 1 ? "" : "s"} from ${template.name}${result.dropped ? ` (${result.dropped} did not fit the 60-page limit)` : ""}.`
          : "This design already has the most pages it can hold."
      return { doc: result.doc, page: result.index }
    })
    if (summary) api.notify(summary)
  }

  return (
    <div>
      <PanelSearch value={query} onChange={setQuery} placeholder="Search templates" label="Search templates" />
      <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Template type">
        {[{ id: "all" as const, label: "All" }, ...designFormatGroups].map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setGroup(entry.id)}
            aria-pressed={group === entry.id}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${group === entry.id ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"}`}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <p className="mb-3 flex items-start gap-2 rounded-xl bg-muted/70 px-3 py-2 text-xs leading-5 text-muted-foreground">
        <LayoutTemplate className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {blank ? "Pick one to start: it fills this design and sets its theme." : "Its pages are added after the current page, in this design's theme."}
      </p>
      {templates.length ? (
        <div className="grid grid-cols-2 items-start gap-2.5">
          {templates.map((template) => (
            <TemplateCard key={template.id} template={template} measure={api.measure} onUse={use} />
          ))}
        </div>
      ) : (
        <EmptyHint>No template matches “{query}”.</EmptyHint>
      )}
    </div>
  )
}
