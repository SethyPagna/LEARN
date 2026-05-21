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

export type StudioTemplatePreviewMeta = {
  accent: string
  background: string
  description: string
  sections: string[]
  style: string
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

export function selectStudioBrowserTemplate<TTemplate extends StudioBrowserTemplate>(templates: TTemplate[], selectedLabel: string) {
  if (!templates.length) return null
  return templates.find((template) => template.label === selectedLabel) || templates[0]
}

export function buildStudioTemplatePreview(template: StudioBrowserTemplate | null, meta: StudioTemplatePreviewMeta | null, fallbackLabel: string) {
  if (!template || !meta) {
    return {
      actionLabel: "",
      accent: "",
      background: "",
      description: "",
      label: fallbackLabel,
      sections: [],
      style: "",
    }
  }

  return {
    actionLabel: `Use ${template.label}`,
    accent: meta.accent,
    background: meta.background,
    description: meta.description,
    label: template.label,
    sections: meta.sections.slice(0, 3),
    style: meta.style,
  }
}
