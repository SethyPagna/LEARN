"use client"

import { useEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { formatRelativeTime } from "@/lib/format-time"
import type { MeasureText } from "@/lib/design/text"
import { useNearViewport } from "./design/editor-hooks"
import { useDesignMeasure } from "./design/text-measure"
import { projectKinds, type Project } from "./studio-projects"
import { StudioProjectPreview } from "./studio-project-preview"

function RecentCard({ project, measure, onOpen }: { project: Project; measure: MeasureText; onOpen: (project: Project) => void }) {
  const [ref, near] = useNearViewport<HTMLLIElement>()
  const Icon = projectKinds[project.kind].icon
  return <li ref={ref} className="studio-recent-card">
    <button type="button" onClick={() => onOpen(project)} aria-label={`Open ${project.title || "Untitled"}`}>
      <div className="studio-recent-preview" aria-hidden="true">{near ? <StudioProjectPreview project={project} measure={measure} /> : <div className="h-full animate-pulse bg-muted" />}</div>
      <div className="studio-recent-caption"><span data-project-kind={project.kind} className="studio-project-icon rounded-md p-1.5"><Icon className="h-3.5 w-3.5" /></span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{project.title || "Untitled"}</span><span className="block text-[10px] text-muted-foreground">{project.updated_at ? formatRelativeTime(project.updated_at) : projectKinds[project.kind].label}</span></span></div>
    </button>
  </li>
}

export function StudioRecents({ projects, onOpen }: { projects: readonly Project[]; onOpen: (project: Project) => void }) {
  const track = useRef<HTMLUListElement>(null)
  const [edges, setEdges] = useState({ start: true, end: true })
  const measure = useDesignMeasure()
  useEffect(() => {
    const node = track.current
    if (!node) return
    const update = () => setEdges({ start: node.scrollLeft <= 4, end: node.scrollLeft + node.clientWidth >= node.scrollWidth - 4 })
    node.scrollLeft = 0
    update()
    node.addEventListener("scroll", update, { passive: true })
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => { observer.disconnect(); node.removeEventListener("scroll", update) }
  }, [projects])
  function scroll(direction: number) {
    const node = track.current
    if (node) node.scrollBy({ left: direction * Math.max(240, node.clientWidth * 0.8), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })
  }
  if (!projects.length) return null
  return <section aria-label="Recent projects" className="studio-recents">
    <div className="mb-2 flex items-center justify-between"><h3 className="text-xs font-medium text-muted-foreground">Recent</h3><div className="flex gap-1"><button className="editor-command" aria-label="Previous recent projects" title="Previous" disabled={edges.start} onClick={() => scroll(-1)}><ChevronLeft className="h-4 w-4" /></button><button className="editor-command" aria-label="Next recent projects" title="Next" disabled={edges.end} onClick={() => scroll(1)}><ChevronRight className="h-4 w-4" /></button></div></div>
    <ul ref={track} tabIndex={0} aria-label="Recent project previews, newest first" className="studio-recents-track">{projects.map(project => <RecentCard key={`${project.kind}:${project.id}`} project={project} measure={measure} onOpen={onOpen} />)}</ul>
  </section>
}
