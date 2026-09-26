"use client"

import type { DragEvent, ReactNode } from "react"
import { Search, X } from "lucide-react"

import { setDesignDragItem, type DesignDragItem } from "../design-drag"

/**
 * Pieces every side panel is built from: a heading, a search field, and the
 * tile that can be clicked (adds the item to the middle of the page) or
 * dragged (drops it where it is let go).
 */

export function PanelHeading({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 mt-4 flex items-center justify-between gap-2 first:mt-0">
      <h3 className="text-[0.7rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">{children}</h3>
      {action}
    </div>
  )
}

export function PanelSearch({ value, onChange, placeholder, label }: { value: string; onChange: (value: string) => void; placeholder: string; label: string }) {
  return (
    <label className="relative mb-3 block">
      <span className="sr-only">{label}</span>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-9 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
      {value ? (
        <button type="button" className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted" aria-label="Clear search" onClick={() => onChange("")}>
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </label>
  )
}

interface ItemTileProps {
  item: DesignDragItem
  label: string
  onPick: (item: DesignDragItem) => void
  children: ReactNode
  className?: string
  title?: string
}

/** A panel tile: click to add to the page, or drag it onto any page. */
export function ItemTile({ item, label, onPick, children, className = "", title }: ItemTileProps) {
  const onDragStart = (event: DragEvent<HTMLButtonElement>) => {
    setDesignDragItem(event.dataTransfer, item)
    const preview = event.currentTarget.querySelector("[data-drag-preview]") as HTMLElement | null
    if (preview) {
      const rect = preview.getBoundingClientRect()
      event.dataTransfer.setDragImage(preview, rect.width / 2, rect.height / 2)
    }
  }
  return (
    <button
      type="button"
      draggable
      onDragStart={onDragStart}
      onClick={() => onPick(item)}
      title={title ?? `${label} (click to add, or drag onto a page)`}
      aria-label={`Add ${label}`}
      className={`group relative flex items-center justify-center rounded-xl bg-muted/70 text-foreground transition hover:-translate-y-0.5 hover:bg-muted hover:shadow-[0_10px_24px_-18px_rgba(15,23,42,0.6)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:translate-y-0 ${className}`}
    >
      {children}
    </button>
  )
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs leading-5 text-muted-foreground">{children}</p>
}
