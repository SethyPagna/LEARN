"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { CircleHelp, ArrowRight, FileUp, Plus, Search, SlidersHorizontal, X } from "lucide-react"
import { createDesignDoc } from "@/lib/design/document"
import { slidesFormatId } from "@/lib/design/formats"
import type { MeasureText } from "@/lib/design/text"
import type { StudioCreationIntent } from "@/lib/studio-creation"
import { projectHref, projectKinds, projectShownKind, useStudioProjects, type ProjectKind, type Project } from "./studio-projects"
import { formatRelativeTime } from "@/lib/format-time"
import { api } from "./api"
import { CREATE_MENU_EVENT } from "./create-menu"
import { useNearViewport } from "./design/editor-hooks"
import { importPowerPoint, PPTX_ACCEPT } from "./design/import-pptx"
import { useDesignMeasure } from "./design/text-measure"
import { KindArt } from "./kind-art"
import { useMenuKeyboard } from "./menu-keyboard"
import { openPlaceGuide } from "./place-guide"
import type { WorkspaceOptions } from "./preferences"
import { StudioProjectPreview } from "./studio-project-preview"
import { EmptyState } from "./ui"
import type { Note } from "./types"

const filters = ["All", "Canvas", "Writing", "Slides", "Sheets"] as const
type Filter = (typeof filters)[number]
const projectKindOrder = Object.keys(projectKinds) as ProjectKind[]
/** The Add menu: one entry per kind, then bringing in a PowerPoint file. */
type AddEntry = ProjectKind | "pptx"
const addEntries: AddEntry[] = [...projectKindOrder, "pptx"]
const PAGE_SIZE = 12

/** A project as a cover: its first page on the kind colour, or the kind drawing while it is empty. */
function ProjectCard({ project, measure, onOpen }: { project: Project; measure: MeasureText; onOpen: (project: Project) => void }) {
  const [ref, near] = useNearViewport<HTMLLIElement>()
  const kind = projectShownKind(project)
  const spec = projectKinds[kind]
  const Icon = spec.icon
  const art = <KindArt kind={kind} />
  return <li ref={ref}>
    <button type="button" className="studio-card" data-project-kind={kind} onClick={() => onOpen(project)}>
      <span className="studio-card-cover" aria-hidden="true">{near ? <StudioProjectPreview project={project} measure={measure} fallback={art} /> : art}</span>
      <span className="studio-card-caption">
        <span className="studio-project-icon flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" aria-hidden="true"><Icon className="h-4 w-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{project.title || "Untitled"}</span>
          <span className="sr-only">{spec.label}, </span>
          <span className="block truncate text-xs text-muted-foreground">{project.updated_at ? formatRelativeTime(project.updated_at) : spec.label}</span>
        </span>
      </span>
    </button>
  </li>
}

export function StudioLobby({ notes, options, onOpen, onNoteCreated, initialFilter = "All", creationIntent, onCreationConsumed }: {
  notes: readonly Note[]
  options: WorkspaceOptions
  onOpen: (href: string) => void
  onNoteCreated: (note: Note) => void
  initialFilter?: Filter
  creationIntent?: StudioCreationIntent | null
  onCreationConsumed?: (intent: StudioCreationIntent) => boolean
}) {
  const [error, setError] = useState("")
  const [creating, setCreating] = useState<AddEntry | null>(null)
  const [importStatus, setImportStatus] = useState("")
  const pptxInput = useRef<HTMLInputElement>(null)
  const [filter, setFilter] = useState<Filter>(initialFilter)
  const [query, setQuery] = useState("")
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const menuRef = useRef<HTMLDivElement>(null)
  const addRef = useRef<HTMLButtonElement>(null)
  const creationPending = useRef(false)
  const mounted = useRef(true)
  const consumedCreation = useRef<number | null>(null)
  const workspaceTitle = options.workspaceName && options.workspaceName !== "Your personal studio" ? options.workspaceName : "Studio"

  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

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
    activeIndex, containerRef: menuRef, entries: addEntries,
    entrySelector: "[role=menuitem]", onChoose: (entry) => entry === "pptx" ? choosePowerPoint() : void create(entry),
    open: menuOpen, setActiveIndex, setOpen: setMenuOpen,
  })


  const measure = useDesignMeasure()
  const { projects: allProjects, loading, error: loadError } = useStudioProjects(notes)
  useEffect(() => { if (loadError) setError(loadError) }, [loadError])

  const matches = useMemo(() => {
    return allProjects.filter((project) => {
      const kind = projectShownKind(project)
      const category = kind === "notes" || kind === "docs" ? "Writing" : kind === "canvas" ? "Canvas" : kind === "slides" ? "Slides" : "Sheets"
      return (filter === "All" || category === filter) && project.title.toLowerCase().includes(query.toLowerCase().trim())
    })
  }, [allProjects, filter, query])

  function openProject(project: Project) {
    onOpen(projectHref(project))
  }

  async function create(kind: ProjectKind) {
    if (!mounted.current || creationPending.current) return
    creationPending.current = true
    setMenuOpen(false)
    addRef.current?.focus()
    // A canvas starts with its size, like Canva: the picker makes it once you choose.
    if (kind === "canvas") { creationPending.current = false; onOpen("/canvas?new=1"); return }
    setCreating(kind)
    setError("")
    try {
      const title = `Untitled ${projectKinds[kind].label.toLowerCase()}`
      // Slides are presentation designs, in the Settings "Slides aspect".
      const design = kind === "slides" ? createDesignDoc({ name: title, format: slidesFormatId(options.slidesAspect), theme: "minimal" }) : null
      const payload = design ? { id: design.id, title, content: design }
        : kind === "notes" ? { title, content: "", template: "blank" }
        : kind === "docs" ? { title, content: { text: "<p></p>" } }
        : { title, cells: [["", "", ""], ["", "", ""], ["", "", ""]] }
      const result = await api<{ item: Project & Note }>(design ? "/api/canvas" : projectKinds[kind].endpoint, { method: "POST", body: JSON.stringify(payload) })
      if (kind === "notes") onNoteCreated(result.item)
      if (mounted.current) openProject(design ? { ...result.item, kind: "canvas", content: design } : { ...result.item, kind })
    } catch (reason) {
      if (mounted.current) setError(reason instanceof Error ? reason.message : "This project couldn't be created. Please try again.")
    } finally { creationPending.current = false; if (mounted.current) setCreating(null) }
  }

  useEffect(() => {
    if (!creationIntent || consumedCreation.current === creationIntent.id) return
    consumedCreation.current = creationIntent.id
    if (!onCreationConsumed?.(creationIntent)) return
    if (creationPending.current) { setError("Another project is still being created. Try Add again."); return }
    void create(creationIntent.kind)
  }, [creationIntent, onCreationConsumed, create])

  function choosePowerPoint() {
    if (creationPending.current) return
    setMenuOpen(false)
    addRef.current?.focus()
    pptxInput.current?.click()
  }

  async function importFile(file: File | undefined) {
    if (!file || !mounted.current || creationPending.current) return
    creationPending.current = true
    setCreating("pptx")
    setError("")
    try {
      const href = await importPowerPoint(file, (status) => { if (mounted.current) setImportStatus(status) })
      if (mounted.current) onOpen(href)
    } catch (reason) {
      if (mounted.current) setError(reason instanceof Error ? reason.message : "This file couldn't be imported. Please try again.")
    } finally {
      creationPending.current = false
      if (mounted.current) { setCreating(null); setImportStatus("") }
    }
  }

  return <section className="studio-lobby min-w-0 pb-4" aria-label="Your Studio home">
    <header className="studio-lobby-header">
      <div className="studio-lobby-topline">
      <div className="studio-lobby-heading min-w-0" data-personal={workspaceTitle !== "Studio"}>
        <h2 className={workspaceTitle === "Studio" ? "sr-only" : "truncate text-xl font-semibold tracking-tight"}>{workspaceTitle}</h2>
        {options.dailyFocus ? <p className="mt-1 text-xs text-muted-foreground">{options.dailyFocus}</p> : null}
      </div>
      <div className="studio-project-filters" role="group" aria-label="Project filters">
        {filters.map((value) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => { setFilter(value); setLimit(PAGE_SIZE) }} className={`min-h-9 shrink-0 rounded-lg px-2.5 text-xs font-medium ${filter === value ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/60"}`}>{value}</button>)}
      </div>
      </div>
      <div className="studio-project-tools" role="group" aria-label="Project search and actions">
      <label className="studio-project-search"><Search className="h-4 w-4 shrink-0" /><input aria-label="Find a project" placeholder="Find a project" value={query} onChange={(event) => { setQuery(event.target.value); setLimit(PAGE_SIZE) }} className="min-w-0 w-full bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground" /></label>
        <button type="button" aria-label="Workspace appearance" title="Workspace appearance" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onOpen("/settings?section=experience")}><SlidersHorizontal className="h-4 w-4" /></button>
        <div ref={menuRef} className="relative shrink-0" onKeyDown={(event) => { menuKeyDown(event); if (event.key === "Escape") addRef.current?.focus() }} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setMenuOpen(false) }}>
          <button ref={addRef} type="button" aria-haspopup="menu" aria-expanded={menuOpen} aria-busy={Boolean(creating)} disabled={Boolean(creating)} onClick={() => { setActiveIndex(0); setMenuOpen(!menuOpen) }} className="flex h-9 min-w-14 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
            {creating === "pptx" ? "Importing…" : creating ? "Adding…" : "Add"}
          </button>
          {menuOpen ? <div role="menu" aria-label="Add a project" className="absolute right-0 top-11 z-40 w-52 rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-lift">
            {projectKindOrder.map((kind, index) => {
              const item = projectKinds[kind]
              const Icon = item.icon
              return <button key={kind} type="button" role="menuitem" aria-label={item.label} disabled={Boolean(creating)} onClick={() => void create(kind)} onMouseEnter={() => setActiveIndex(index)} onFocus={() => setActiveIndex(index)} className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${activeIndex === index ? "bg-secondary" : "hover:bg-secondary"}`}><span data-project-kind={kind} className="studio-project-icon rounded-md p-1.5"><Icon className="h-4 w-4" /></span>{item.label}</button>
            })}
            <div role="separator" className="my-1 h-px bg-border" />
            <button type="button" role="menuitem" disabled={Boolean(creating)} onClick={choosePowerPoint} onMouseEnter={() => setActiveIndex(projectKindOrder.length)} onFocus={() => setActiveIndex(projectKindOrder.length)} className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${activeIndex === projectKindOrder.length ? "bg-secondary" : "hover:bg-secondary"}`}><span data-project-kind="slides" className="studio-project-icon rounded-md p-1.5"><FileUp className="h-4 w-4" /></span>Import PowerPoint</button>
          </div> : null}
          <input ref={pptxInput} type="file" accept={PPTX_ACCEPT} className="hidden" aria-label="Import a PowerPoint file" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; void importFile(file) }} />
        </div>
      </div>
    </header>
    {importStatus ? <p role="status" className="mb-3 text-sm text-muted-foreground">{importStatus}</p> : null}
    {error ? <p role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}<button type="button" aria-label="Dismiss error" onClick={() => setError("")}><X className="h-4 w-4" /></button></p> : null}
    {loading
      ? <ul className="studio-grid" aria-busy="true" aria-label="Loading projects">{Array.from({ length: 4 }, (_, index) => <li key={index} className="studio-card-skeleton" />)}</ul>
      : matches.length
        ? <ul aria-label="Projects" className="studio-grid">{matches.slice(0, limit).map((project) => <ProjectCard key={`${project.kind}:${project.id}`} project={project} measure={measure} onOpen={openProject} />)}</ul>
        : query || filter !== "All"
          ? <EmptyState title="No matching projects." action={<button type="button" className="editor-command" onClick={() => { setQuery(""); setFilter("All") }}><X className="h-4 w-4" />Clear</button>} />
          : <EmptyState title="No projects yet" action={<button type="button" className="editor-command" onClick={() => { setActiveIndex(0); setMenuOpen(true) }}><Plus className="h-4 w-4" />Add a project</button>} />}
    {matches.length > limit ? <button type="button" onClick={() => setLimit((current) => current + PAGE_SIZE)} className="mx-auto mt-3 flex min-h-9 items-center gap-2 rounded-lg px-4 text-xs text-muted-foreground hover:bg-secondary">Show more <ArrowRight className="h-3.5 w-3.5" /></button> : null}
    <button type="button" onClick={openPlaceGuide} aria-label="What can LEARN do?" title="Help" className="editor-command mt-3"><CircleHelp className="h-4 w-4" /></button>
  </section>
}
