"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { CircleHelp, ArrowRight, ChevronDown, ChevronRight, FileText, Loader2, PenTool, Plus, Search, SlidersHorizontal, X } from "lucide-react"
import { createDesignDoc } from "@/lib/design/document"
import { projectHref, projectKinds, useStudioProjects, type ProjectKind, type Project } from "./studio-projects"
import { formatRelativeTime } from "@/lib/format-time"
import { api } from "./api"
import { CREATE_MENU_EVENT } from "./create-menu"
import { useMenuKeyboard } from "./menu-keyboard"
import { openPlaceGuide } from "./place-guide"
import type { WorkspaceOptions } from "./preferences"
import type { Note } from "./types"

const filters = ["All", "Canvas", "Writing", "Slides", "Sheets"] as const
type Filter = (typeof filters)[number]
const projectKindOrder = Object.keys(projectKinds) as ProjectKind[]
const PAGE_SIZE = 12

export function StudioLobby({ notes, options, onOpen, onNoteCreated, initialFilter = "All" }: {
  notes: readonly Note[]
  options: WorkspaceOptions
  onOpen: (href: string) => void
  onNoteCreated: (note: Note) => void
  initialFilter?: Filter
}) {
  const [error, setError] = useState("")
  const [creating, setCreating] = useState<ProjectKind | null>(null)
  const [filter, setFilter] = useState<Filter>(initialFilter)
  const [query, setQuery] = useState("")
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const menuRef = useRef<HTMLDivElement>(null)
  const addRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    function openMenu() { setActiveIndex(0); setMenuOpen(true) }
    window.addEventListener(CREATE_MENU_EVENT, openMenu)
    return () => window.removeEventListener(CREATE_MENU_EVENT, openMenu)
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    menuRef.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus()
    function closeOutside(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    document.addEventListener("pointerdown", closeOutside)
    return () => document.removeEventListener("pointerdown", closeOutside)
  }, [menuOpen])

  const menuKeyDown = useMenuKeyboard({
    activeIndex, containerRef: menuRef, entries: projectKindOrder,
    entrySelector: "[role=menuitem]", onChoose: (kind) => void create(kind),
    open: menuOpen, setActiveIndex, setOpen: setMenuOpen,
  })


  const { projects: allProjects, loading, error: loadError } = useStudioProjects(notes)
  useEffect(() => { if (loadError) setError(loadError) }, [loadError])
  const recentProject = allProjects[0]

  const matches = useMemo(() => {
    return allProjects.filter((project) => {
      const category = project.kind === "notes" || project.kind === "docs" ? "Writing" : project.kind === "canvas" ? "Canvas" : project.kind === "slides" ? "Slides" : "Sheets"
      return (filter === "All" || category === filter) && project.title.toLowerCase().includes(query.toLowerCase().trim())
    }).sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""))
  }, [allProjects, filter, query])

  function openProject(project: Project) {
    onOpen(projectHref(project))
  }

  async function create(kind: ProjectKind) {
    if (creating) return
    setMenuOpen(false)
    addRef.current?.focus()
    setCreating(kind)
    setError("")
    try {
      const title = `Untitled ${projectKinds[kind].label.toLowerCase()}`
      const design = kind === "canvas" ? createDesignDoc({ name: title, format: "presentation", theme: "minimal" }) : null
      const payload = design ? { id: design.id, title, content: design }
        : kind === "notes" ? { title, content: "", template: "blank" }
        : kind === "docs" ? { title, content: { text: "<p></p>" } }
        : kind === "sheets" ? { title, cells: [["", "", ""], ["", "", ""], ["", "", ""]] }
        : { title, slides: [{ id: crypto.randomUUID(), title: "Your first idea", body: "", layout: "title", theme: "plain", notes: "" }] }
      const result = await api<{ item: Project & Note }>(projectKinds[kind].endpoint, { method: "POST", body: JSON.stringify(payload) })
      if (kind === "notes") onNoteCreated(result.item)
      openProject({ ...result.item, kind })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "This project couldn't be created. Please try again.")
    } finally { setCreating(null) }
  }

  return <section className="studio-lobby mx-auto max-w-6xl pb-4" aria-label="Your Studio home">
    <header className="mb-5 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <h2 className="truncate text-xl font-semibold tracking-tight">{options.workspaceName && options.workspaceName !== "Your personal studio" ? options.workspaceName : "Studio"}</h2>
        {options.dailyFocus ? <p className="mt-1 text-xs text-muted-foreground">{options.dailyFocus}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button type="button" aria-label="Workspace appearance" title="Workspace appearance" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onOpen("/settings?section=experience")}><SlidersHorizontal className="h-4 w-4" /></button>
        <div ref={menuRef} className="relative" onKeyDown={(event) => { menuKeyDown(event); if (event.key === "Escape") addRef.current?.focus() }} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setMenuOpen(false) }}>
          <button ref={addRef} type="button" aria-haspopup="menu" aria-expanded={menuOpen} disabled={Boolean(creating)} onClick={() => { setActiveIndex(0); setMenuOpen(!menuOpen) }} className="flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add <ChevronDown className="h-3.5 w-3.5 opacity-70" />
          </button>
          {menuOpen ? <div role="menu" aria-label="Add a project" className="absolute right-0 top-11 z-40 w-48 rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-lift">
            {projectKindOrder.map((kind, index) => {
              const item = projectKinds[kind]
              const Icon = item.icon
              return <button key={kind} type="button" role="menuitem" disabled={Boolean(creating)} onClick={() => void create(kind)} onMouseEnter={() => setActiveIndex(index)} onFocus={() => setActiveIndex(index)} className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${activeIndex === index ? "bg-secondary" : "hover:bg-secondary"}`}><span data-project-kind={kind} className="studio-project-icon rounded-md p-1.5"><Icon className="h-4 w-4" /></span>{item.label}</button>
            })}
          </div> : null}
        </div>
      </div>
    </header>
    {recentProject && !query && filter === "All" ? <div className="studio-resume mb-5">
      <div className="min-w-0 py-1">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">Recent</p>
        <h3 className="truncate text-lg font-semibold tracking-tight">{recentProject.title}</h3>

        {recentProject ? <button type="button" onClick={() => openProject(recentProject)} title="Continue working" className="editor-command mt-2"><span className="sr-only">Continue working</span><ArrowRight className="h-3.5 w-3.5" /></button> : null}
      </div>
      <div className="studio-paper-stack" aria-hidden="true"><span className="studio-paper studio-paper-back"><PenTool /></span><span className="studio-paper studio-paper-front"><FileText /><i /><i /><i /></span><span className="studio-paper-spark">✳</span></div>
    </div> : null}
    {error ? <p role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}<button type="button" aria-label="Dismiss error" onClick={() => setError("")}><X className="h-4 w-4" /></button></p> : null}
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <div className="flex max-w-full gap-1 overflow-auto" aria-label="Project filters">
        {filters.map((value) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => { setFilter(value); setLimit(PAGE_SIZE) }} className={`min-h-9 shrink-0 rounded-lg px-3 text-xs font-medium ${filter === value ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/60"}`}>{value}</button>)}
      </div>
      <label className="flex min-h-9 w-full items-center gap-2 rounded-lg border border-border bg-card px-3 text-muted-foreground sm:w-auto"><Search className="h-4 w-4" /><input aria-label="Find a project" placeholder="Find a project" value={query} onChange={(event) => { setQuery(event.target.value); setLimit(PAGE_SIZE) }} className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground sm:w-40" /></label>
    </div>
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="hidden grid-cols-[minmax(0,1fr)_7rem_7rem_1rem] gap-4 border-b border-border bg-secondary/35 px-4 py-2.5 text-xs text-muted-foreground sm:grid" aria-hidden="true"><span>Name</span><span>Type</span><span>Last edited</span><span /></div>
      {loading ? <p role="status" className="px-4 py-10 text-center text-sm text-muted-foreground">Loading projects…</p> : matches.length ? <ul aria-label="Projects" className="divide-y divide-border">
        {matches.slice(0, limit).map((project) => {
          const spec = projectKinds[project.kind]
          const Icon = spec.icon
          const edited = project.updated_at ? formatRelativeTime(project.updated_at) : "—"
          return <li key={`${project.kind}:${project.id}`}>
            <button type="button" onClick={() => openProject(project)} className="group grid min-h-16 w-full grid-cols-[minmax(0,1fr)_1rem] items-center gap-3 px-4 py-3 text-left transition hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:min-h-14 sm:grid-cols-[minmax(0,1fr)_7rem_7rem_1rem] sm:gap-4">
              <span className="flex min-w-0 items-center gap-3"><span data-project-kind={project.kind} className="studio-project-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"><Icon className="h-4 w-4" /></span><span className="min-w-0"><span className="block truncate text-sm font-medium">{project.title || "Untitled"}</span><span className="mt-0.5 block text-xs text-muted-foreground sm:hidden">{spec.label} · {edited}</span></span></span>
              <span className="hidden text-xs text-muted-foreground sm:block">{spec.label}</span>
              <span className="hidden text-xs text-muted-foreground sm:block">{edited}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-foreground" />
            </button>
          </li>
        })}
      </ul> : <div className="px-4 py-12 text-center"><p className="text-sm text-muted-foreground">{query || filter !== "All" ? "No matching projects." : "No projects yet"}</p></div>}
    </div>
    {matches.length > limit ? <button type="button" onClick={() => setLimit((current) => current + PAGE_SIZE)} className="mx-auto mt-3 flex min-h-9 items-center gap-2 rounded-lg px-4 text-xs text-muted-foreground hover:bg-secondary">Show more <ArrowRight className="h-3.5 w-3.5" /></button> : null}
    <button type="button" onClick={openPlaceGuide} aria-label="What can LEARN do?" title="Help" className="editor-command mt-3"><CircleHelp className="h-4 w-4" /></button>
  </section>
}
