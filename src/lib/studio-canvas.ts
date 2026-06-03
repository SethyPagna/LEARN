import type { StudioKind } from "@/components/learn/types"

export type StudioCanvasFormatGroup = "document" | "presentation" | "social" | "poster"

export type StudioCanvasFormatGroupMeta = {
  id: StudioCanvasFormatGroup
  label: string
  description: string
}

export type StudioCanvasFormat = {
  id: string
  label: string
  group: StudioCanvasFormatGroup
  width: number
  height: number
  description: string
  supportedKinds: StudioKind[]
}

export const studioCanvasFormats: StudioCanvasFormat[] = [
  { id: "presentation-16-9", label: "Presentation 16:9", group: "presentation", width: 16, height: 9, description: "Wide slides, lessons, and decks", supportedKinds: ["slides"] },
  { id: "presentation-16-10", label: "Presentation 16:10", group: "presentation", width: 16, height: 10, description: "Modern classroom and laptop decks", supportedKinds: ["slides"] },
  { id: "presentation-4-3", label: "Presentation 4:3", group: "presentation", width: 4, height: 3, description: "Classic classroom and projector decks", supportedKinds: ["slides"] },
  { id: "presentation-a4", label: "PPT handout A4", group: "presentation", width: 210, height: 297, description: "Printable slide notes and handouts", supportedKinds: ["slides"] },
  { id: "a4", label: "A4 document", group: "document", width: 210, height: 297, description: "Reports, guides, notes, and worksheets", supportedKinds: ["notes", "docs"] },
  { id: "a4-landscape", label: "A4 landscape", group: "document", width: 297, height: 210, description: "Wide worksheets, maps, and comparison pages", supportedKinds: ["notes", "docs", "sheets"] },
  { id: "worksheet-grid", label: "Worksheet grid", group: "document", width: 16, height: 10, description: "Spreadsheet-style practice and tables", supportedKinds: ["sheets"] },
  { id: "gradebook-wide", label: "Gradebook wide", group: "document", width: 21, height: 9, description: "Wide Excel-style gradebooks and trackers", supportedKinds: ["sheets"] },
  { id: "a3-poster", label: "A3 poster", group: "poster", width: 297, height: 420, description: "Large one-page summaries and classroom posters", supportedKinds: ["notes", "docs", "slides"] },
  { id: "a5", label: "A5 note", group: "document", width: 148, height: 210, description: "Compact handouts and study cards", supportedKinds: ["notes", "docs"] },
  { id: "letter", label: "US Letter", group: "document", width: 8.5, height: 11, description: "Printable North American documents", supportedKinds: ["notes", "docs"] },
  { id: "legal", label: "US Legal", group: "document", width: 8.5, height: 14, description: "Long outlines, rubrics, and policy notes", supportedKinds: ["notes", "docs"] },
  { id: "square", label: "Square post", group: "social", width: 1, height: 1, description: "Cards, moments, and visual summaries", supportedKinds: ["notes", "docs", "slides"] },
  { id: "portrait-post", label: "Portrait post 4:5", group: "social", width: 4, height: 5, description: "Feed posts, quote cards, and visual recaps", supportedKinds: ["notes", "docs", "slides"] },
  { id: "story", label: "Story 9:16", group: "social", width: 9, height: 16, description: "Mobile story-style learning visuals", supportedKinds: ["slides"] },
  { id: "thumbnail", label: "Thumbnail 16:9", group: "social", width: 16, height: 9, description: "Video thumbnails and lesson covers", supportedKinds: ["slides"] },
  { id: "poster", label: "Poster", group: "poster", width: 3, height: 4, description: "Infographics, one-pagers, and wall notes", supportedKinds: ["notes", "docs", "slides"] },
  { id: "infographic", label: "Infographic", group: "poster", width: 9, height: 21, description: "Tall visual explanations and process flows", supportedKinds: ["notes", "docs", "slides"] },
]

export const studioCanvasFormatGroups: StudioCanvasFormatGroupMeta[] = [
  { id: "presentation", label: "Presentation", description: "Slides, lessons, and deck workflows" },
  { id: "document", label: "Document", description: "Notes, docs, worksheets, and print pages" },
  { id: "social", label: "Social", description: "Square cards and mobile story visuals" },
  { id: "poster", label: "Poster", description: "One-pagers, infographics, and wall notes" },
]

export function getStudioCanvasFormat(id: string | undefined, kind: StudioKind) {
  const direct = studioCanvasFormats.find((format) => format.id === id && format.supportedKinds.includes(kind))
  if (direct) return direct
  return studioCanvasFormats.find((format) => format.supportedKinds.includes(kind)) || studioCanvasFormats[0]
}

export function canvasAspectRatio(format: StudioCanvasFormat) {
  return `${format.width} / ${format.height}`
}

export function groupStudioCanvasFormats(kind: StudioKind) {
  return studioCanvasFormats
    .filter((format) => format.supportedKinds.includes(kind))
    .reduce<Record<StudioCanvasFormatGroup, StudioCanvasFormat[]>>((groups, format) => {
      groups[format.group] = [...(groups[format.group] || []), format]
      return groups
    }, { document: [], presentation: [], social: [], poster: [] })
}

export function listStudioCanvasFormatGroups(kind: StudioKind) {
  const groups = groupStudioCanvasFormats(kind)
  return studioCanvasFormatGroups
    .map((group) => ({ ...group, formats: groups[group.id] }))
    .filter((group) => group.formats.length > 0)
}

export function listStudioCanvasFormats(kind: StudioKind) {
  return listStudioCanvasFormatGroups(kind).flatMap((group) => group.formats)
}

export function canvasPreviewWidth(format: StudioCanvasFormat) {
  const ratio = format.width / format.height
  if (format.group === "document") return ratio < 0.75 ? 780 : 860
  if (format.group === "social") return ratio < 1 ? 420 : 560
  if (format.group === "poster") return 520
  return 900
}
