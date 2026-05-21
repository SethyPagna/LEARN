import type { StudioKind } from "@/components/learn/types"

export type StudioBrowserProject = {
  id: string
  kind: StudioKind
  summary?: string
  title: string
}

export type StudioBrowserTemplate = {
  body?: string
  description?: string
  label: string
  sections?: string[]
  style?: string
  title: string
}

export type StudioProjectBrowserState<TProject extends StudioBrowserProject, TTemplate extends StudioBrowserTemplate> = {
  counts: Record<StudioKind, number>
  projects: TProject[]
  templates: TTemplate[]
}

const studioKinds: StudioKind[] = ["notes", "docs", "sheets", "slides"]

export function buildStudioProjectBrowserState<TProject extends StudioBrowserProject, TTemplate extends StudioBrowserTemplate>({
  activeKind,
  items,
  query,
  templates,
}: {
  activeKind: StudioKind
  items: TProject[]
  query: string
  templates: TTemplate[]
}): StudioProjectBrowserState<TProject, TTemplate> {
  const needle = normalizeStudioBrowserQuery(query)
  const counts = countStudioProjects(items)
  const projects = items.filter((item) => item.kind === activeKind && matchesStudioBrowserQuery(item, needle))
  const filteredTemplates = templates.filter((template) => matchesStudioBrowserQuery(template, needle))
  return { counts, projects, templates: filteredTemplates }
}

export function countStudioProjects(items: Array<Pick<StudioBrowserProject, "kind">>) {
  const counts = Object.fromEntries(studioKinds.map((kind) => [kind, 0])) as Record<StudioKind, number>
  for (const item of items) counts[item.kind] += 1
  return counts
}

export function matchesStudioBrowserQuery(item: StudioBrowserProject | StudioBrowserTemplate, needle: string) {
  if (!needle) return true
  const haystack = [
    item.title,
    "summary" in item ? item.summary : undefined,
    "label" in item ? item.label : undefined,
    "description" in item ? item.description : undefined,
    "sections" in item ? item.sections?.join(" ") : undefined,
    "style" in item ? item.style : undefined,
    "body" in item ? item.body : undefined,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
  return haystack.includes(needle)
}

export function normalizeStudioBrowserQuery(query: string) {
  return query.trim().replace(/\s+/g, " ").toLowerCase()
}
