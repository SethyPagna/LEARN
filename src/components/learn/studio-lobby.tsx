"use client"

import { useEffect, useMemo, useState } from "react"
import { ArrowRight, ArrowUpRight, FileText, LayoutTemplate, Loader2, Plus, Presentation, Search, SlidersHorizontal, Table2, X } from "lucide-react"
import { createDesignDoc, designPreview } from "@/lib/design/document"
import { readDesignDrafts } from "@/lib/design/draft"
import { formatRelativeTime } from "@/lib/format-time"
import { api } from "./api"
import { DesignThumbnail } from "./design/design-renderer"
import { useDesignMeasure } from "./design/text-measure"
import { openPlaceGuide } from "./place-guide"
import type { WorkspaceOptions } from "./preferences"
import type { Note, User } from "./types"

type ProjectKind = "canvas" | "notes" | "docs" | "slides" | "sheets"
type Project = { id: string; title: string; kind: ProjectKind; updated_at?: string | null; content?: unknown }
const projectKinds = {
  canvas: { label: "Canvas", description: "Think visually", icon: LayoutTemplate, endpoint: "/api/canvas" },
  notes: { label: "Note", description: "Catch an idea", icon: FileText, endpoint: "/api/notes" },
  docs: { label: "Document", description: "Find your words", icon: FileText, endpoint: "/api/docs" },
  slides: { label: "Slides", description: "Tell your story", icon: Presentation, endpoint: "/api/slides" },
  sheets: { label: "Sheet", description: "Make sense of it", icon: Table2, endpoint: "/api/sheets" },
} as const
const filters = ["All", "Canvas", "Writing", "Slides", "Sheets"] as const
type Filter = (typeof filters)[number]

export function StudioLobby({ user, notes, options, setOptions, onOpen, onNoteCreated, initialFilter = "All" }: {
  user: User | null
  notes: readonly Note[]
  options: WorkspaceOptions
  setOptions: (options: Partial<WorkspaceOptions>) => void
  onOpen: (href: string) => void
  onNoteCreated: (note: Note) => void
  initialFilter?: Filter
}) {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [creating, setCreating] = useState<ProjectKind | null>(null)
  const [filter, setFilter] = useState<Filter>(initialFilter)
  const [query, setQuery] = useState("")
  const [limit, setLimit] = useState(6)
  const [greeting, setGreeting] = useState("Welcome back")
  const measure = useDesignMeasure()

  useEffect(() => {
    const hour = new Date().getHours()
    setGreeting(hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening")
    let active = true
    async function load() {
      const kinds = ["canvas", "docs", "slides", "sheets"] as const
      const results = await Promise.allSettled(kinds.map(async (kind) => {
        const response = await api<{ items: Omit<Project, "kind">[] }>(`${projectKinds[kind].endpoint}${kind === "canvas" ? "?view=summary" : ""}`)
        return response.items.map((item) => ({ ...item, kind }))
      }))
      if (!active) return
      const saved = results.flatMap((result) => result.status === "fulfilled" ? result.value : [])
      const merged = new Map(saved.map((item) => [`${item.kind}:${item.id}`, item as Project]))
      for (const draft of readDesignDrafts()) {
        const key = `canvas:${draft.id}`
        const current = merged.get(key)
        if (!current?.updated_at || draft.updatedAt > current.updated_at) merged.set(key, { id: draft.id, title: draft.title, kind: "canvas", content: draft.design, updated_at: draft.updatedAt })
      }
      setProjects([...merged.values()])
      if (results.some((result) => result.status === "rejected")) setError("Some projects couldn't load. Your available work is shown below.")
      setLoading(false)
    }
    void load()
    return () => { active = false }
  }, [])

  const matches = useMemo(() => {
    const all: Project[] = [...projects, ...notes.map((note) => ({ ...note, kind: "notes" as const }))]
    return all.filter((project) => {
      const category = project.kind === "notes" || project.kind === "docs" ? "Writing" : project.kind === "canvas" ? "Canvas" : project.kind === "slides" ? "Slides" : "Sheets"
      return (filter === "All" || category === filter) && project.title.toLowerCase().includes(query.toLowerCase().trim())
    }).sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""))
  }, [projects, notes, filter, query])

  function openProject(project: Project) {
    onOpen(project.kind === "canvas" ? `/canvas?design=${encodeURIComponent(project.id)}` : `/${project.kind}?item=${encodeURIComponent(`${project.kind}:${project.id}`)}`)
  }

  async function create(kind: ProjectKind) {
    if (creating) return
    setCreating(kind)
    setError("")
    try {
      const title = `Untitled ${projectKinds[kind].label.toLowerCase()}`
      const design = kind === "canvas" ? createDesignDoc({ name: title, format: "presentation" }) : null
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

  const firstName = user?.name?.trim().split(/\s+/)[0]
  return <section className="studio-lobby mx-auto max-w-6xl pb-8" aria-label="Your Studio home">
    <div className="mb-9 flex items-center justify-between gap-4 pt-4 sm:pt-7">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{options.workspaceName || "Your personal studio"}</p>
      <button type="button" className="inline-flex min-h-9 items-center gap-2 rounded-lg px-2 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground" onClick={() => onOpen("/settings?section=experience")}><SlidersHorizontal className="h-3.5 w-3.5" /> Make it yours</button>
    </div>
    <header className="mb-9 sm:mb-11">
      <h2 className="text-balance text-3xl font-medium tracking-[-0.045em] sm:text-5xl">{greeting}{firstName ? `, ${firstName}` : ""}<span className="text-primary">.</span></h2>
      <p className="mt-3 text-sm text-muted-foreground sm:text-base">A little space for your next idea.</p>
    </header>
    <div className="lobby-create-grid grid grid-cols-2 gap-3 sm:grid-cols-5" aria-label="Create a project">
      {(Object.keys(projectKinds) as ProjectKind[]).map((kind) => {
        const item = projectKinds[kind]
        const Icon = item.icon
        return <button key={kind} type="button" disabled={Boolean(creating)} onClick={() => void create(kind)} className={`lobby-create group relative flex min-h-32 flex-col items-start rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-paper focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 sm:p-5 ${kind === "canvas" ? "col-span-2 border-primary/25 bg-primary text-primary-foreground sm:col-span-1" : "border-border bg-card hover:border-primary/40"}`}>
          {creating === kind ? <Loader2 className="mb-5 h-6 w-6 animate-spin" /> : <Icon className="mb-5 h-6 w-6" strokeWidth={1.5} />}
          <Plus className="absolute right-4 top-4 h-4 w-4 opacity-50 transition group-hover:opacity-100" />
          <span className="text-sm font-semibold">{item.label}</span>
          <span className={`mt-1 text-xs ${kind === "canvas" ? "opacity-80" : "text-muted-foreground"}`}>{item.description}</span>
        </button>
      })}
    </div>
    <label className="my-7 flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border pb-6 text-sm">
      <span className="shrink-0 text-muted-foreground">Today, I'm thinking about</span>
      <input maxLength={160} aria-label="Today's focus" value={options.dailyFocus} onChange={(event) => setOptions({ dailyFocus: event.target.value })} placeholder="One thing you'd like to explore…" className="min-h-9 min-w-0 flex-1 basis-48 bg-transparent text-foreground outline-none placeholder:text-muted-foreground/75 focus:underline focus:decoration-primary focus:underline-offset-8" />
    </label>
    {error ? <p role="alert" className="mb-5 flex items-center justify-between gap-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}<button type="button" aria-label="Dismiss error" onClick={() => setError("")}><X className="h-4 w-4" /></button></p> : null}
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <h3 className="text-lg font-semibold tracking-tight">Pick up where you left off</h3>
      <label className="flex min-h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-muted-foreground"><Search className="h-4 w-4" /><input aria-label="Find a project" placeholder="Find a project" value={query} onChange={(event) => { setQuery(event.target.value); setLimit(6) }} className="w-36 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground" /></label>
    </div>
    <div className="mb-5 flex gap-1 overflow-auto" aria-label="Project filters">
      {filters.map((value) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => { setFilter(value); setLimit(6) }} className={`min-h-9 shrink-0 rounded-lg px-3 text-xs font-medium ${filter === value ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/60"}`}>{value}</button>)}
    </div>
    {loading ? <p role="status" className="py-10 text-center text-sm text-muted-foreground">Gathering your projects…</p> : matches.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {matches.slice(0, limit).map((project) => {
        const spec = projectKinds[project.kind]
        const Icon = spec.icon
        const preview = project.kind === "canvas" ? designPreview(project.content).preview : null
        return <button type="button" key={`${project.kind}:${project.id}`} onClick={() => openProject(project)} className="lobby-project group min-w-0 overflow-hidden rounded-xl border border-border bg-card text-left transition hover:border-primary/40 hover:shadow-paper focus-visible:ring-2 focus-visible:ring-ring">
          <div className="lobby-project-cover relative flex h-32 items-center justify-center overflow-hidden border-b border-border bg-secondary/50 p-5" aria-hidden="true">
            {preview ? <div className="pointer-events-none overflow-hidden rounded-sm shadow-sm"><DesignThumbnail displayWidth={Math.min(208, 88 * preview.width / preview.height)} width={preview.width} height={preview.height} theme={preview.theme} page={preview.pages[0]} measure={measure} /></div> : <div className={`lobby-paper-preview ${project.kind === "slides" ? "is-slide" : project.kind === "sheets" ? "is-sheet" : ""}`}><Icon className="h-5 w-5 text-primary/75" strokeWidth={1.5} /><span /><span /><span /></div>}
            <ArrowUpRight className="absolute right-3 top-3 h-4 w-4 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
          </div>
          <div className="p-4"><span className="block truncate text-sm font-medium">{project.title || "Untitled"}</span><span className="mt-1.5 block text-xs text-muted-foreground">{spec.label}{project.updated_at ? ` · ${formatRelativeTime(project.updated_at)}` : ""}</span></div>
        </button>
      })}
    </div> : <div className="rounded-2xl border border-dashed border-border py-12 text-center"><p className="text-sm font-medium">{query ? "No projects match that search." : "Your next idea starts here."}</p><p className="mt-2 text-xs text-muted-foreground">{query ? "Try a different title or filter." : "Choose a canvas, note or document above."}</p></div>}
    {matches.length > limit ? <button type="button" onClick={() => setLimit((current) => current + 12)} className="mx-auto mt-6 flex min-h-10 items-center gap-2 rounded-lg px-4 text-sm text-muted-foreground hover:bg-secondary">Show more projects <ArrowRight className="h-4 w-4" /></button> : null}
    <button type="button" onClick={openPlaceGuide} className="mt-8 min-h-9 text-xs text-muted-foreground underline-offset-4 hover:underline">What can LEARN do?</button>
  </section>
}
