"use client"

import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import * as ContextMenu from "@radix-ui/react-context-menu"
import { DndContext, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { SortableContext, horizontalListSortingStrategy, useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { ArrowLeft, ArrowRight, CopyPlus, Ellipsis, Eye, EyeOff, FilePlus2, NotebookPen, Plus, Trash2 } from "lucide-react"

import { DESIGN_LIMITS, type DesignDoc, type DesignPage } from "@/lib/design/document"
import type { MeasureText } from "@/lib/design/text"

import { DesignThumbnail } from "./design-renderer"
import { useCoarsePointer, useLatest, useNearViewport } from "./editor-hooks"
import { PopoverButton } from "./popover"

/**
 * The row of page thumbnails under the editor. Click a page to go to it,
 * drag to reorder, right-click (or the ⋯ button) for add, duplicate, hide,
 * move and delete. Thumbnails are drawn only once they scroll near view and
 * are memoised per page, so a 60-page design stays light.
 */

export interface PagesStripProps {
  design: DesignDoc
  pageIndex: number
  measure: MeasureText
  onSelect: (index: number) => void
  onAdd: (afterIndex: number) => void
  onDuplicate: (index: number) => void
  onRemove: (index: number) => void
  onMove: (from: number, to: number) => void
  onToggleHidden: (index: number) => void
}

type PageCommand = "select" | "add" | "duplicate" | "remove" | "left" | "right" | "hide"

/** Thumbnails fit a 96×60 box, so tall formats stay readable. */
const THUMB_BOX = { width: 96, height: 60 }

export function PagesStrip(props: PagesStripProps) {
  const { design, pageIndex, measure } = props
  const latest = useLatest(props)
  const coarse = useCoarsePointer()
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null)
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 260, tolerance: 8 } }))
  const ids = useMemo(() => design.pages.map((page) => page.id), [design.pages])
  const displayWidth = Math.max(24, Math.round(Math.min(THUMB_BOX.width, (THUMB_BOX.height * design.width) / Math.max(1, design.height))))
  const total = design.pages.length
  const full = total >= DESIGN_LIMITS.pages

  // One stable dispatcher, so a memoised thumbnail does not re-render because
  // the editor made new callbacks.
  const run = useCallback(
    (command: PageCommand, index: number) => {
      const current = latest.current
      if (command === "select") current.onSelect(index)
      else if (command === "add") current.onAdd(index)
      else if (command === "duplicate") current.onDuplicate(index)
      else if (command === "remove") current.onRemove(index)
      else if (command === "left") current.onMove(index, index - 1)
      else if (command === "right") current.onMove(index, index + 1)
      else current.onToggleHidden(index)
    },
    [latest],
  )

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from >= 0 && to >= 0) props.onMove(from, to)
  }

  return (
    <div ref={setScroller} className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto overscroll-x-contain px-1 py-1.5 [scrollbar-width:thin]" aria-label="Pages">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
          <ol className="flex items-center gap-2">
            {design.pages.map((page, index) => (
              <PageThumb
                key={page.id}
                page={page}
                index={index}
                total={total}
                full={full}
                active={index === pageIndex}
                width={design.width}
                height={design.height}
                theme={design.theme}
                measure={measure}
                displayWidth={displayWidth}
                coarse={coarse}
                root={scroller}
                run={run}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      <button
        type="button"
        onClick={() => props.onAdd(pageIndex)}
        disabled={full}
        className="flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-dashed border-primary/40 text-[0.65rem] font-bold text-primary transition hover:border-primary hover:bg-primary/10 disabled:opacity-40"
        style={{ width: Math.max(56, displayWidth), height: THUMB_BOX.height + 4 }}
        title={full ? `A design holds up to ${DESIGN_LIMITS.pages} pages` : `Add a page after page ${pageIndex + 1} (Ctrl+Enter)`}
        aria-label="Add page"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Page
      </button>
    </div>
  )
}

interface PageThumbProps {
  page: DesignPage
  index: number
  total: number
  full: boolean
  active: boolean
  width: number
  height: number
  theme: string
  measure: MeasureText
  displayWidth: number
  coarse: boolean
  root: HTMLDivElement | null
  run: (command: PageCommand, index: number) => void
}

interface PageAction {
  key: PageCommand
  label: string
  icon: ReactNode
  disabled?: boolean
  danger?: boolean
}

function pageActions({ page, index, total, full }: Pick<PageThumbProps, "page" | "index" | "total" | "full">): PageAction[] {
  return [
    { key: "add", label: "Add page after", icon: <FilePlus2 className="h-4 w-4" />, disabled: full },
    { key: "duplicate", label: "Duplicate page", icon: <CopyPlus className="h-4 w-4" />, disabled: full },
    { key: "hide", label: page.hidden ? "Show page" : "Hide page", icon: page.hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" /> },
    { key: "left", label: "Move left", icon: <ArrowLeft className="h-4 w-4" />, disabled: index === 0 },
    { key: "right", label: "Move right", icon: <ArrowRight className="h-4 w-4" />, disabled: index >= total - 1 },
    { key: "remove", label: total > 1 ? "Delete page" : "Clear page", icon: <Trash2 className="h-4 w-4" />, danger: true },
  ]
}

const PageThumb = memo(function PageThumb(props: PageThumbProps) {
  const { page, index, active, width, height, theme, measure, displayWidth, coarse, root, run } = props
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: page.id })
  const [nearRef, near] = useNearViewport<HTMLSpanElement>({ root, rootMargin: "0px 480px" })
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const actions = pageActions(props)
  const thumbHeight = Math.round((displayWidth * height) / Math.max(1, width))

  useEffect(() => {
    if (active) buttonRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }, [active])

  return (
    <li
      ref={setNodeRef}
      className="group relative shrink-0"
      style={{ transform: CSS.Translate.toString(transform), transition, zIndex: isDragging ? 5 : undefined }}
    >
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild disabled={coarse}>
          <button
            ref={(node) => {
              buttonRef.current = node
              setActivatorNodeRef(node)
            }}
            type="button"
            {...attributes}
            {...listeners}
            onClick={() => run("select", index)}
            aria-current={active ? "page" : undefined}
            aria-label={`Page ${index + 1}${page.hidden ? " (hidden)" : ""}`}
            title={`Page ${index + 1}${page.hidden ? " · hidden when presenting" : ""} · drag to reorder, right-click for more`}
            className={`relative block overflow-hidden rounded-[10px] bg-card shadow-[0_1px_2px_rgba(15,23,42,0.18)] outline-none transition [touch-action:manipulation] focus-visible:ring-2 focus-visible:ring-ring ${
              active ? "ring-[2.5px] ring-primary ring-offset-2 ring-offset-background" : "ring-1 ring-border hover:ring-2 hover:ring-primary/50"
            } ${isDragging ? "scale-105 shadow-xl" : ""}`}
            style={{ width: displayWidth, height: thumbHeight }}
          >
            <span ref={nearRef} className={`block h-full w-full ${page.hidden ? "opacity-45" : ""}`} style={{ background: page.background }}>
              {near || active ? <DesignThumbnail width={width} height={height} theme={theme} page={page} measure={measure} displayWidth={displayWidth} /> : null}
            </span>
            <span className={`absolute bottom-0.5 left-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-md px-1 text-[0.6rem] font-bold tabular-nums ${active ? "bg-primary text-primary-foreground" : "bg-background/85 text-foreground"}`}>
              {index + 1}
            </span>
            {page.hidden ? (
              <span className="absolute right-0.5 top-0.5 inline-flex h-4 w-4 items-center justify-center rounded-md bg-background/85 text-foreground" aria-hidden="true">
                <EyeOff className="h-2.5 w-2.5" />
              </span>
            ) : null}
            {page.notes.trim() ? (
              <span className="absolute bottom-0.5 right-0.5 inline-flex h-4 w-4 items-center justify-center rounded-md bg-background/85 text-foreground" title="Has speaker notes" aria-hidden="true">
                <NotebookPen className="h-2.5 w-2.5" />
              </span>
            ) : null}
          </button>
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content className="z-[80] min-w-48 rounded-xl border border-border bg-popover p-1 text-sm text-popover-foreground shadow-xl" aria-label={`Page ${index + 1}`}>
            <ContextMenu.Label className="px-2 py-1 text-[0.65rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">Page {index + 1}</ContextMenu.Label>
            {actions.map((action) => (
              <ContextMenu.Item key={action.key} disabled={action.disabled} onSelect={() => run(action.key, index)} className={`context-item data-[disabled]:opacity-40 ${action.danger ? "text-destructive" : ""}`}>
                {action.icon}
                {action.label}
              </ContextMenu.Item>
            ))}
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
      <span className={`absolute -right-1.5 -top-1.5 transition ${active || coarse ? "opacity-100" : "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"}`}>
        <PopoverButton
          label={`Page ${index + 1} options`}
          buttonClassName="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm transition hover:bg-accent"
          width={210}
          placement="top-start"
          panel={(close) => (
            <div className="grid min-w-44 gap-0.5 text-sm">
              {actions.map((action) => (
                <button
                  key={action.key}
                  type="button"
                  disabled={action.disabled}
                  onClick={() => {
                    close()
                    run(action.key, index)
                  }}
                  className={`context-item w-full text-left disabled:opacity-40 ${action.danger ? "text-destructive" : ""}`}
                >
                  {action.icon}
                  {action.label}
                </button>
              ))}
            </div>
          )}
        >
          <Ellipsis className="h-3.5 w-3.5" />
        </PopoverButton>
      </span>
    </li>
  )
})
