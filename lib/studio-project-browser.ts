import type { StudioKind } from "@/components/learn/types"
import type { StudioCanvasFormatGroup } from "./studio-canvas"

export type StudioProjectKindFilter = StudioKind | "all"

export type StudioBrowserProject = {
  id: string
  kind: StudioKind
  summary?: string
  title: string
  updated_at?: string
}

export type StudioBrowserTemplate = {
  body?: string
  description?: string
  formatGroups?: StudioCanvasFormatGroup[]
  kind?: StudioKind
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

export type StudioProjectDisplayMeta = {
  badge: string
  detail: string
  format: string
}

export type StudioProjectFilterOption = {
  description: string
  label: string
  value: StudioProjectKindFilter
}

export type StudioTemplatePreviewMeta = {
  accent: string
  background: string
  description: string
  sections: string[]
  style: string
}

const studioKinds: StudioKind[] = ["notes", "docs", "sheets", "slides"]

const studioKindDisplayMeta: Record<StudioKind, StudioProjectDisplayMeta> = {
  notes: { badge: "Capture", detail: "quick learning page", format: "A5 / A4 page" },
  docs: { badge: "Document", detail: "rich guide page", format: "A4 / Letter page" },
  sheets: { badge: "Data", detail: "grid workspace", format: "worksheet grid" },
  slides: { badge: "Deck", detail: "presentation canvas", format: "16:9 / poster canvas" },
}

const studioProjectFilterOptions: StudioProjectFilterOption[] = [
  { description: "Show every Studio project and template", label: "All designs", value: "all" },
  { description: "Learning pages, journals, and quick captures", label: "Pages", value: "notes" },
  { description: "Guides, reports, handouts, and long-form work", label: "Guides", value: "docs" },
  { description: "Trackers, tables, imports, and spreadsheet layouts", label: "Tables", value: "sheets" },
  { description: "Decks, posters, galleries, and presentation canvases", label: "Decks", value: "slides" },
]

export function buildStudioProjectBrowserState<TProject extends StudioBrowserProject, TTemplate extends StudioBrowserTemplate>({
  formatGroup,
  kindFilter,
  items,
  query,
  templates,
}: {
  formatGroup?: StudioCanvasFormatGroup | "all"
  kindFilter: StudioProjectKindFilter
  items: TProject[]
  query: string
  templates: TTemplate[]
}): StudioProjectBrowserState<TProject, TTemplate> {
  const needle = normalizeStudioBrowserQuery(query)
  const counts = countStudioProjects(items)
  const acceptsKind = (kind: StudioKind) => kindFilter === "all" || kind === kindFilter
  const projects = items.filter((item) => acceptsKind(item.kind) && matchesStudioBrowserQuery(item, needle))
  const filteredTemplates = templates.filter((template) => (
    (!template.kind || acceptsKind(template.kind))
    && templateMatchesFormatGroup(template, formatGroup || "all")
    && matchesStudioBrowserQuery(template, needle)
  ))
  return { counts, projects, templates: filteredTemplates }
}

export function countStudioProjects(items: Array<Pick<StudioBrowserProject, "kind">>) {
  const counts = Object.fromEntries(studioKinds.map((kind) => [kind, 0])) as Record<StudioKind, number>
  for (const item of items) counts[item.kind] += 1
  return counts
}

export function listStudioProjectFilterOptions() {
  return studioProjectFilterOptions
}

export function getStudioProjectFilterOption(value: StudioProjectKindFilter) {
  return studioProjectFilterOptions.find((option) => option.value === value) || studioProjectFilterOptions[0]
}

export function selectStudioProjectShelf<TProject extends StudioBrowserProject>(projects: TProject[], limit = 12) {
  return projects.slice(0, Math.max(0, limit))
}

export function selectStudioTemplateShelf<TTemplate extends StudioBrowserTemplate>(templates: TTemplate[], limit = 10) {
  return templates.slice(0, Math.max(0, limit))
}

export function sortStudioProjectsByModified<TProject extends StudioBrowserProject>(projects: TProject[], direction: "newest" | "oldest" = "newest") {
  const multiplier = direction === "newest" ? -1 : 1
  return [...projects].sort((left, right) => multiplier * (modifiedTime(left) - modifiedTime(right)))
}

function modifiedTime(project: Pick<StudioBrowserProject, "updated_at">) {
  const value = project.updated_at ? Date.parse(project.updated_at) : 0
  return Number.isFinite(value) ? value : 0
}

export function getStudioProjectDisplayMeta(kind: StudioKind) {
  return studioKindDisplayMeta[kind]
}

export function buildStudioProjectSubtitle(project: Pick<StudioBrowserProject, "kind" | "summary">) {
  const meta = getStudioProjectDisplayMeta(project.kind)
  return `${meta.badge} - ${project.summary || meta.format}`
}

export function buildStudioTemplateSubtitle(template: Pick<StudioBrowserTemplate, "kind" | "style">, fallbackStyle = "") {
  const meta = template.kind ? getStudioProjectDisplayMeta(template.kind) : null
  return [fallbackStyle || template.style, meta?.format].filter(Boolean).join(" - ")
}

export function matchesStudioBrowserQuery(item: StudioBrowserProject | StudioBrowserTemplate, needle: string) {
  if (!needle) return true
  const haystack = [
    item.title,
    "summary" in item ? item.summary : undefined,
    "label" in item ? item.label : undefined,
    "description" in item ? item.description : undefined,
    "formatGroups" in item ? item.formatGroups?.join(" ") : undefined,
    "sections" in item ? item.sections?.join(" ") : undefined,
    "style" in item ? item.style : undefined,
    "body" in item ? item.body : undefined,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
  return haystack.includes(needle)
}

export function templateMatchesFormatGroup(template: Pick<StudioBrowserTemplate, "formatGroups" | "kind">, formatGroup: StudioCanvasFormatGroup | "all") {
  if (formatGroup === "all") return true
  if (template.formatGroups?.length) return template.formatGroups.includes(formatGroup)
  if (template.kind === "sheets") return formatGroup === "document"
  if (template.kind === "slides") return formatGroup !== "document"
  return formatGroup !== "presentation"
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
