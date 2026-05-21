import type { StudioKind } from "@/components/learn/types"

export type StudioToolPanelId = "projects" | "templates" | "elements" | "text" | "media" | "brand" | "ai"

export type StudioToolPanel = {
  id: StudioToolPanelId
  label: string
  description: string
}

export type StudioToolAction = {
  id: string
  label: string
  description: string
  supportedKinds: StudioKind[]
  richHtml?: string
  sheetAction?: "add-row" | "add-column" | "table"
  slideObjectType?: "text" | "shape" | "image" | "table"
}

export const studioToolPanels: StudioToolPanel[] = [
  { id: "templates", label: "Templates", description: "Start from designed layouts" },
  { id: "elements", label: "Elements", description: "Add shapes, tables, frames, and page parts" },
  { id: "text", label: "Text", description: "Add headings, body styles, and callouts" },
  { id: "media", label: "Media", description: "Insert image areas and upload-ready placeholders" },
  { id: "brand", label: "Brand", description: "Apply colors, surfaces, and reusable styles" },
  { id: "ai", label: "AI", description: "Generate, rewrite, and organize content" },
  { id: "projects", label: "Projects", description: "Browse existing Studio work" },
]

export const studioToolActions: Record<StudioToolPanelId, StudioToolAction[]> = {
  ai: [
    { id: "ai-summary", label: "Summary block", description: "Add an AI-ready summary section", richHtml: "<h2>AI summary</h2><p></p>", supportedKinds: ["notes", "docs"] },
    { id: "ai-slide-outline", label: "Slide outline", description: "Add an outline object for AI-generated decks", slideObjectType: "text", supportedKinds: ["slides"] },
  ],
  brand: [
    { id: "brand-cover", label: "Cover system", description: "Add a branded cover and visual hierarchy", richHtml: "<h1>Title</h1><blockquote>Key promise or learning goal</blockquote>", slideObjectType: "shape", supportedKinds: ["notes", "docs", "slides"] },
    { id: "brand-callout", label: "Accent callout", description: "Add a reusable highlighted callout", richHtml: "<blockquote>Important idea</blockquote>", slideObjectType: "shape", supportedKinds: ["notes", "docs", "slides"] },
  ],
  elements: [
    { id: "element-shape", label: "Shape", description: "Add a visual shape or callout frame", richHtml: "<blockquote>Shape callout</blockquote>", slideObjectType: "shape", supportedKinds: ["notes", "docs", "slides"] },
    { id: "element-table", label: "Table", description: "Add a table or grid area", richHtml: "<table><tbody><tr><th>Item</th><th>Detail</th></tr><tr><td></td><td></td></tr></tbody></table>", sheetAction: "table", slideObjectType: "table", supportedKinds: ["notes", "docs", "sheets", "slides"] },
    { id: "element-section", label: "Section page", description: "Add a new page-like section", richHtml: "<hr><h2>New section</h2><p></p>", slideObjectType: "text", supportedKinds: ["notes", "docs", "slides"] },
  ],
  media: [
    { id: "media-image", label: "Image frame", description: "Add an image placeholder", richHtml: "<p><img src=\"\" alt=\"Image placeholder\"></p>", slideObjectType: "image", supportedKinds: ["notes", "docs", "slides"] },
    { id: "media-caption", label: "Caption block", description: "Add media notes and attribution", richHtml: "<h3>Caption</h3><p>Source and notes</p>", supportedKinds: ["notes", "docs"] },
  ],
  projects: [],
  templates: [],
  text: [
    { id: "text-heading", label: "Heading", description: "Add a clean heading", richHtml: "<h1>Heading</h1><p></p>", slideObjectType: "text", supportedKinds: ["notes", "docs", "slides"] },
    { id: "text-subheading", label: "Subheading", description: "Add a section subheading", richHtml: "<h2>Subheading</h2><p></p>", slideObjectType: "text", supportedKinds: ["notes", "docs", "slides"] },
    { id: "text-body", label: "Body copy", description: "Add a paragraph block", richHtml: "<p>Body text</p>", slideObjectType: "text", supportedKinds: ["notes", "docs", "slides"] },
  ],
}

export function getStudioToolPanel(id: StudioToolPanelId) {
  return studioToolPanels.find((panel) => panel.id === id) || studioToolPanels[0]
}

export function getStudioToolActions(panel: StudioToolPanelId, kind: StudioKind) {
  return (studioToolActions[panel] || []).filter((action) => action.supportedKinds.includes(kind))
}
