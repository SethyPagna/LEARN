import type { StudioKind } from "@/components/learn/types"

export type StudioViewMode = "list" | "board" | "gallery"
export type StudioSectionFilter = "All" | "Notes" | "Docs" | "Sheets" | "Slides" | "Recent" | "Favorites" | "Archived"
export type StudioInspectorTab = "Info" | "Outline" | "Comments" | "History" | "AI" | "Export"

export type StudioKindOption = {
  description: string
  kind: StudioKind
  label: string
}

export const studioKindOptions: StudioKindOption[] = [
  { kind: "notes", label: "Notes", description: "Fast capture, review seeds, and daily learning reflections." },
  { kind: "docs", label: "Docs", description: "Rich study guides with headings, lists, tables, images, and AI cleanup." },
  { kind: "sheets", label: "Sheets", description: "Track topics, scores, resources, schedules, and lightweight formulas." },
  { kind: "slides", label: "Slides", description: "Build lesson decks with thumbnails, canvas editing, notes, and PPTX export." },
]

export const studioSectionFilters: StudioSectionFilter[] = ["All", "Notes", "Docs", "Sheets", "Slides", "Recent", "Favorites", "Archived"]

export const studioViewModeOptions: Array<{ id: StudioViewMode; label: string }> = [
  { id: "list", label: "List" },
  { id: "board", label: "Board" },
  { id: "gallery", label: "Gallery" },
]

export const studioInspectorTabs: StudioInspectorTab[] = ["Info", "Outline", "Comments", "History", "AI", "Export"]

export const studioEmptyTabLabels: Record<StudioKind, string> = {
  notes: "Notes",
  docs: "Docs",
  sheets: "Sheets",
  slides: "Slides",
}

export function getStudioKindOption(kind: StudioKind) {
  return studioKindOptions.find((option) => option.kind === kind) || studioKindOptions[0]
}

export function getStudioViewModeOption(viewMode: StudioViewMode) {
  return studioViewModeOptions.find((option) => option.id === viewMode) || studioViewModeOptions[0]
}
