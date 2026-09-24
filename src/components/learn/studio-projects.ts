"use client"

import { useEffect, useMemo, useState } from "react"
import { FileText, PenTool, Presentation, StickyNote, Table2 } from "lucide-react"
import { readDesignDrafts, timestampMs } from "@/lib/design/draft"
import { api } from "./api"
import type { Note } from "./types"

export type ProjectKind = "canvas" | "notes" | "docs" | "slides" | "sheets"
export type Project = { id: string; title: string; kind: ProjectKind; updated_at?: string | null; content?: unknown }
export const projectKinds = {
  canvas: { label: "Canvas", icon: PenTool, endpoint: "/api/canvas" },
  notes: { label: "Note", icon: StickyNote, endpoint: "/api/notes" },
  docs: { label: "Document", icon: FileText, endpoint: "/api/docs" },
  slides: { label: "Slides", icon: Presentation, endpoint: "/api/slides" },
  sheets: { label: "Sheet", icon: Table2, endpoint: "/api/sheets" },
} as const

export function projectHref(project: Project) {
  return project.kind === "canvas" ? `/canvas?design=${encodeURIComponent(project.id)}` : `/${project.kind}?item=${encodeURIComponent(`${project.kind}:${project.id}`)}`
}

export function useStudioProjects(notes: readonly Note[], revision = "") {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  useEffect(() => {
    let active = true
    setLoading(true)
    setError("")
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
        if ((timestampMs(draft.updatedAt) ?? 0) > (timestampMs(current?.updated_at) ?? 0)) merged.set(key, { id: draft.id, title: draft.title, kind: "canvas", content: draft.design, updated_at: draft.updatedAt })
      }
      setProjects([...merged.values()])
      if (results.some((result) => result.status === "rejected")) setError("Some projects couldn't load. Your available work is shown below.")
      setLoading(false)
    }
    void load()
    return () => { active = false }
  }, [revision])

  const allProjects = useMemo(() => [...projects, ...notes.map((note) => ({ ...note, kind: "notes" as const }))].sort((a, b) => (timestampMs(b.updated_at) ?? 0) - (timestampMs(a.updated_at) ?? 0)), [projects, notes])
  return { projects: allProjects, loading, error }
}
