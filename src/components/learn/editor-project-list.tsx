"use client"

import { useState } from "react"
import { ChevronDown, Search } from "lucide-react"
import { projectHref, projectKinds, useStudioProjects } from "./studio-projects"
import type { Note, View } from "./types"

export function EditorProjectList({ notes, view, search, onOpen }: { notes: readonly Note[]; view: View; search: string; onOpen: (href: string) => void }) {
  const [query, setQuery] = useState("")
  const [mobileOpen, setMobileOpen] = useState(false)
  const { projects, loading, error } = useStudioProjects(notes, `${view}:${search}`)
  const params = new URLSearchParams(search)
  const selected = view === "canvas" ? `canvas:${params.get("design")}` : params.get("item")
  const matches = projects.filter((project) => project.title.toLowerCase().includes(query.trim().toLowerCase()))
  return <aside className="editor-projects" aria-label="Project browser">
    <div className="flex h-[60px] shrink-0 items-center justify-between gap-2 border-b border-border px-4">
      <button type="button" className="text-sm font-semibold hover:text-primary" onClick={() => onOpen("/dashboard")}>Studio</button>
      <button type="button" className="editor-projects-toggle editor-command" aria-expanded={mobileOpen} aria-label="Toggle project list" onClick={() => setMobileOpen(!mobileOpen)}>Projects<ChevronDown className="h-3.5 w-3.5" /></button>
      <span className="hidden text-xs text-muted-foreground lg:block">{projects.length} projects</span>
    </div>
    <div className={`editor-projects-body ${mobileOpen ? "is-open" : ""}`}>
      <label className="mx-3 my-3 flex items-center gap-2 rounded-md border border-input bg-background px-2 py-2"><Search className="h-3.5 w-3.5 text-muted-foreground" /><input aria-label="Search projects" className="min-w-0 w-full bg-transparent text-xs outline-none" placeholder="Search projects" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      {error ? <p role="status" className="px-3 text-xs text-muted-foreground">{error}</p> : null}
      <nav className="grid gap-0.5 px-2 pb-4" aria-label="Open a project">
        {matches.map((project) => { const spec = projectKinds[project.kind]; const Icon = spec.icon; const active = selected === `${project.kind}:${project.id}`; return <button key={`${project.kind}:${project.id}`} type="button" aria-current={active ? "page" : undefined} title={`${project.title} · ${spec.label}`} onClick={() => { onOpen(projectHref(project)); setMobileOpen(false) }} className={`flex min-w-0 items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-accent ${active ? "bg-accent font-medium" : ""}`}><span data-project-kind={project.kind} className="studio-project-icon shrink-0 rounded-md p-1.5"><Icon className="h-3.5 w-3.5" /></span><span className="truncate text-xs">{project.title || "Untitled"}</span></button> })}
        {!matches.length ? <p className="px-2 py-4 text-xs text-muted-foreground">{loading ? "Loading projects…" : "No matching projects."}</p> : null}
      </nav>
    </div>
  </aside>
}
