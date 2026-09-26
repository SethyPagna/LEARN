"use client"

import { useEffect, useRef } from "react"
import { ChevronDown, ChevronUp, CopyPlus, Eye, EyeOff, Plus, Trash2 } from "lucide-react"
import { DESIGN_LIMITS } from "@/lib/design/document"
import { DesignStage, type StageProps } from "./design-stage"
import { useNearViewport } from "./editor-hooks"
import type { PagesStripProps } from "./pages-strip"

type PageActions = Omit<PagesStripProps, "design" | "pageIndex" | "measure">
interface PageWorkspaceProps { stage: StageProps; actions: PageActions }

export function PageWorkspace({ stage, actions }: PageWorkspaceProps) {
  const container = useRef<HTMLDivElement>(null)
  const activeId = stage.api.design.pages[stage.api.pageIndex].id
  useEffect(() => {
    const active = Array.from(container.current?.children ?? []).find(node => node.getAttribute("data-page-id") === activeId)
    active?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }, [activeId])
  return <div ref={container} className="design-page-stack" aria-label="Page workspace">
    {stage.api.design.pages.map((page, index) => <WorkspacePage key={page.id} index={index} stage={stage} actions={actions} />)}
    <button type="button" className="design-add-page" disabled={stage.api.design.pages.length >= DESIGN_LIMITS.pages} onClick={() => actions.onAdd(stage.api.design.pages.length - 1)}><Plus size={16} />Add page</button>
  </div>
}

function WorkspacePage({ index, stage, actions }: PageWorkspaceProps & { index: number }) {
  const { api, zoom } = stage
  const page = api.design.pages[index]
  const active = api.pageIndex === index
  const [ref, near] = useNearViewport<HTMLElement>()
  const full = api.design.pages.length >= DESIGN_LIMITS.pages
  const pageApi = {
    ...api,
    pageIndex: index,
    selectedIds: active ? api.selectedIds : [],
    select: (ids: string[]) => { if (!active) api.goToPage(index); api.select(ids) },
    insertElements: (elements: Parameters<typeof api.insertElements>[0], options: Parameters<typeof api.insertElements>[1]) => api.insertElements(elements, { ...options, page: index }),
    uploadFiles: (files: File[], options: Parameters<typeof api.uploadFiles>[1]) => api.uploadFiles(files, { ...options, page: index }),
  }
  return <section ref={ref} data-page-id={page.id} data-active={active} className="design-workspace-page" aria-label={`Page ${index + 1}${page.hidden ? " (hidden from export)" : ""}`} style={{ width: api.design.width * zoom }}>
    <div className="design-page-actions">
      <button type="button" className="design-page-number" aria-label={`Select page ${index + 1}`} onClick={() => actions.onSelect(index)}>Page {index + 1}</button>
      <button type="button" title="Move up" aria-label={`Move page ${index + 1} up`} disabled={index === 0} onClick={() => actions.onMove(index, index - 1)}><ChevronUp size={15} /></button>
      <button type="button" title="Move down" aria-label={`Move page ${index + 1} down`} disabled={index === api.design.pages.length - 1} onClick={() => actions.onMove(index, index + 1)}><ChevronDown size={15} /></button>
      <button type="button" title={page.hidden ? "Show in export" : "Hide from export"} aria-label={`${page.hidden ? "Show" : "Hide"} page ${index + 1}`} aria-pressed={page.hidden} onClick={() => actions.onToggleHidden(index)}>{page.hidden ? <EyeOff size={15} /> : <Eye size={15} />}</button>
      <button type="button" title="Duplicate" aria-label={`Duplicate page ${index + 1}`} disabled={full} onClick={() => actions.onDuplicate(index)}><CopyPlus size={15} /></button>
      <button type="button" title="Delete" aria-label={`Delete page ${index + 1}`} disabled={api.design.pages.length === 1} onClick={() => actions.onRemove(index)}><Trash2 size={15} /></button>
      <button type="button" title="Add page" aria-label={`Add page after ${index + 1}`} disabled={full} onClick={() => actions.onAdd(index)}><Plus size={15} /></button>
    </div>
    <div className="design-page-paper" data-hidden={page.hidden} style={{ height: api.design.height * zoom }} onPointerDownCapture={() => { if (!active) actions.onSelect(index) }} onFocusCapture={() => { if (!active) actions.onSelect(index) }}>
      {near || active ? <DesignStage {...stage} api={pageApi} editingId={active ? stage.editingId : null} cropping={active && stage.cropping} /> : null}
    </div>
  </section>
}
