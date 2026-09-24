"use client"

import { memo, useEffect, useRef, type ComponentType } from "react"
import { Layers, LayoutTemplate, Palette, Shapes, Type, Upload, WandSparkles, X } from "lucide-react"

import type { DesignEditorApi, DesignPanelId } from "./editor-types"
import { ElementsPanel } from "./panels/elements-panel"
import { LayersPanel } from "./panels/layers-panel"
import { MagicPanel } from "./panels/magic-panel"
import { StylesPanel } from "./panels/styles-panel"
import { TemplatesPanel } from "./panels/templates-panel"
import { TextPanel } from "./panels/text-panel"
import { UploadsPanel } from "./panels/uploads-panel"

/**
 * The editor's left rail and the panel it opens: templates, elements, text,
 * uploads, Magic (layouts from text or a note), styles and layers.
 *
 * On a wide screen the rail is a column of labelled icons and the panel sits
 * beside the page; on a phone the rail is a bar under the page and the panel
 * rises as a sheet over it, so the page keeps the whole width.
 */

interface RailItem {
  id: DesignPanelId
  label: string
  title: string
  icon: ComponentType<{ className?: string }>
  panel: ComponentType<{ api: DesignEditorApi }>
}

export const RAIL_ITEMS: readonly RailItem[] = [
  { id: "templates", label: "Design", title: "Templates and layouts", icon: LayoutTemplate, panel: TemplatesPanel },
  { id: "elements", label: "Elements", title: "Shapes, frames, stickers and cards", icon: Shapes, panel: ElementsPanel },
  { id: "text", label: "Text", title: "Headings, body text and lists", icon: Type, panel: TextPanel },
  { id: "uploads", label: "Uploads", title: "Your pictures", icon: Upload, panel: UploadsPanel },
  { id: "magic", label: "Magic", title: "Turn text or a note into designed pages", icon: WandSparkles, panel: MagicPanel },
  { id: "styles", label: "Styles", title: "Themes, colours and page backgrounds", icon: Palette, panel: StylesPanel },
  { id: "layers", label: "Layers", title: "Everything on this page, front to back", icon: Layers, panel: LayersPanel },
]

interface EditorRailProps {
  api: DesignEditorApi
  panel: DesignPanelId | null
  onPanel: (panel: DesignPanelId | null) => void
  compact: boolean
}

/** The rail buttons (a column, or a bar on a phone). */
export const EditorRail = memo(function EditorRail({ panel, onPanel, compact }: Omit<EditorRailProps, "api">) {
  return (
    <nav
      aria-label="Design tools"
      className={
        compact
          ? "flex shrink-0 items-stretch justify-between gap-0.5 overflow-x-auto border-t border-border bg-card px-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-1"
          : "flex w-[4.25rem] shrink-0 flex-col items-stretch gap-1 overflow-y-auto border-r border-border bg-card px-1.5 py-2"
      }
    >
      {RAIL_ITEMS.map((item) => {
        const Icon = item.icon
        const active = panel === item.id
        return (
          <button
            key={item.id}
            type="button"
            data-design-rail={item.id}
            aria-label={item.label}
            aria-pressed={active}
            title={item.title}
            onClick={() => onPanel(active ? null : item.id)}
            className={`group flex min-w-[3.25rem] flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[0.64rem] font-semibold transition ${
              active ? "bg-primary/12 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition ${active ? "bg-primary text-primary-foreground shadow-[0_8px_18px_-10px_var(--primary)]" : "group-hover:scale-105"}`}>
              <Icon className="h-[1.1rem] w-[1.1rem]" />
            </span>
            {item.label}
          </button>
        )
      })}
    </nav>
  )
})

/** The open panel: beside the page, or a sheet over it on a phone. */
export function EditorPanel({ api, panel, onPanel, compact }: EditorRailProps) {
  const item = RAIL_ITEMS.find((entry) => entry.id === panel)
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 })
  }, [panel])

  if (!item) return null
  const Body = item.panel
  return (
    <aside
      aria-label={item.title}
      className={
        compact
          ? "learn-pop-in absolute inset-x-0 bottom-0 z-40 flex max-h-[62%] flex-col rounded-t-3xl border-t border-border bg-card shadow-[0_-24px_48px_-28px_rgba(15,23,42,0.55)]"
          : "flex w-[19.5rem] shrink-0 flex-col border-r border-border bg-card xl:w-[21rem]"
      }
    >
      {compact ? <span className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-border" aria-hidden="true" /> : null}
      <div className="flex shrink-0 items-center justify-between gap-2 px-4 pb-2 pt-3">
        <h3 className="text-sm font-bold tracking-tight">{item.title}</h3>
        <button type="button" onClick={() => onPanel(null)} aria-label="Close panel" className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <Body api={api} />
      </div>
    </aside>
  )
}
