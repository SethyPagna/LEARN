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
  canvasAction?: "new-page" | "duplicate-page"
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
    { id: "ai-quiz", label: "Quiz prompt", description: "Add a structured quiz-generation brief", richHtml: "<h2>Quiz brief</h2><ul><li>Question types:</li><li>Difficulty:</li><li>Source:</li></ul>", supportedKinds: ["notes", "docs"] },
    { id: "ai-practice-loop", label: "Practice loop", description: "Add prompt slots for mistake retry and reviews", richHtml: "<h2>Practice loop</h2><p>Mistake -> explanation -> retry -> review card.</p>", supportedKinds: ["notes", "docs"] },
    { id: "ai-slide-outline", label: "Slide outline", description: "Add an outline object for AI-generated decks", slideObjectType: "text", supportedKinds: ["slides"] },
    { id: "ai-sheet-organizer", label: "Sheet organizer", description: "Prepare columns for AI cleanup or imported tables", sheetAction: "table", supportedKinds: ["sheets"] },
  ],
  brand: [
    { id: "brand-cover", label: "Cover system", description: "Add a branded cover and visual hierarchy", richHtml: "<h1>Title</h1><blockquote>Key promise or learning goal</blockquote>", slideObjectType: "shape", supportedKinds: ["notes", "docs", "slides"] },
    { id: "brand-callout", label: "Accent callout", description: "Add a reusable highlighted callout", richHtml: "<blockquote>Important idea</blockquote>", slideObjectType: "shape", supportedKinds: ["notes", "docs", "slides"] },
    { id: "brand-palette", label: "Palette guide", description: "Add a small brand color and font reference", richHtml: "<h2>Design system</h2><table><tbody><tr><th>Role</th><th>Color</th><th>Use</th></tr><tr><td>Accent</td><td></td><td>Highlights</td></tr></tbody></table>", supportedKinds: ["notes", "docs"] },
    { id: "brand-footer", label: "Page footer", description: "Add a footer area for source, date, or course", richHtml: "<hr><p><small>Source / date / course</small></p>", slideObjectType: "text", supportedKinds: ["notes", "docs", "slides"] },
  ],
  elements: [
    { id: "page-new", label: "New page", description: "Add another page/canvas to the current design", canvasAction: "new-page", supportedKinds: ["notes", "docs", "slides"] },
    { id: "page-duplicate", label: "Duplicate page", description: "Copy the current page or selected slide", canvasAction: "duplicate-page", supportedKinds: ["notes", "docs", "slides"] },
    { id: "element-shape", label: "Shape", description: "Add a visual shape or callout frame", richHtml: "<blockquote>Shape callout</blockquote>", slideObjectType: "shape", supportedKinds: ["notes", "docs", "slides"] },
    { id: "element-frame", label: "Frame", description: "Add a bordered visual frame", richHtml: "<blockquote><strong>Frame title</strong><br>Drop notes, image notes, or evidence here.</blockquote>", slideObjectType: "shape", supportedKinds: ["notes", "docs", "slides"] },
    { id: "element-chart", label: "Chart area", description: "Add a chart-ready table or slide chart placeholder", richHtml: "<h3>Chart</h3><table><tbody><tr><th>Label</th><th>Value</th></tr><tr><td></td><td></td></tr></tbody></table>", sheetAction: "table", slideObjectType: "table", supportedKinds: ["notes", "docs", "sheets", "slides"] },
    { id: "element-table", label: "Table", description: "Add a table or grid area", richHtml: "<table><tbody><tr><th>Item</th><th>Detail</th></tr><tr><td></td><td></td></tr></tbody></table>", sheetAction: "table", slideObjectType: "table", supportedKinds: ["notes", "docs", "sheets", "slides"] },
    { id: "element-row", label: "Row", description: "Insert a spreadsheet row at the active cell", sheetAction: "add-row", supportedKinds: ["sheets"] },
    { id: "element-column", label: "Column", description: "Insert a spreadsheet column at the active cell", sheetAction: "add-column", supportedKinds: ["sheets"] },
    { id: "element-section", label: "Section page", description: "Add a new page-like section", richHtml: "<hr><h2>New section</h2><p></p>", slideObjectType: "text", supportedKinds: ["notes", "docs", "slides"] },
    { id: "element-timeline", label: "Timeline", description: "Add a sequence for process or history notes", richHtml: "<h2>Timeline</h2><ol><li>Step one</li><li>Step two</li><li>Step three</li></ol>", slideObjectType: "text", supportedKinds: ["notes", "docs", "slides"] },
  ],
  media: [
    { id: "media-image", label: "Image frame", description: "Add an image placeholder", richHtml: "<p><img src=\"\" alt=\"Image placeholder\"></p>", slideObjectType: "image", supportedKinds: ["notes", "docs", "slides"] },
    { id: "media-caption", label: "Caption block", description: "Add media notes and attribution", richHtml: "<h3>Caption</h3><p>Source and notes</p>", supportedKinds: ["notes", "docs"] },
    { id: "media-video", label: "Video notes", description: "Add a video reference block with timestamps", richHtml: "<h2>Video notes</h2><table><tbody><tr><th>Time</th><th>Moment</th><th>Question</th></tr><tr><td>00:00</td><td></td><td></td></tr></tbody></table>", supportedKinds: ["notes", "docs"] },
    { id: "media-audio", label: "Audio recap", description: "Add transcript and recall sections", richHtml: "<h2>Audio recap</h2><h3>Transcript notes</h3><p></p><h3>Recall prompts</h3><ul><li></li></ul>", supportedKinds: ["notes", "docs"] },
    { id: "media-gallery", label: "Image gallery", description: "Add a multi-image layout placeholder", richHtml: "<table><tbody><tr><td>Image</td><td>Image</td><td>Image</td></tr><tr><td>Caption</td><td>Caption</td><td>Caption</td></tr></tbody></table>", slideObjectType: "image", supportedKinds: ["notes", "docs", "slides"] },
  ],
  projects: [],
  templates: [],
  text: [
    { id: "text-heading", label: "Heading", description: "Add a clean heading", richHtml: "<h1>Heading</h1><p></p>", slideObjectType: "text", supportedKinds: ["notes", "docs", "slides"] },
    { id: "text-subheading", label: "Subheading", description: "Add a section subheading", richHtml: "<h2>Subheading</h2><p></p>", slideObjectType: "text", supportedKinds: ["notes", "docs", "slides"] },
    { id: "text-body", label: "Body copy", description: "Add a paragraph block", richHtml: "<p>Body text</p>", slideObjectType: "text", supportedKinds: ["notes", "docs", "slides"] },
    { id: "text-pullquote", label: "Pull quote", description: "Add a prominent quote or takeaway", richHtml: "<blockquote>Memorable takeaway</blockquote>", slideObjectType: "text", supportedKinds: ["notes", "docs", "slides"] },
    { id: "text-checklist", label: "Checklist", description: "Add a task list for study steps", richHtml: "<ul data-type=\"taskList\"><li data-type=\"taskItem\" data-checked=\"false\">First action</li><li data-type=\"taskItem\" data-checked=\"false\">Second action</li></ul>", slideObjectType: "text", supportedKinds: ["notes", "docs", "slides"] },
    { id: "text-equation", label: "Equation note", description: "Add an equation placeholder with explanation", richHtml: "<h3>Equation</h3><pre><code>f(x) = </code></pre><p>Meaning:</p>", supportedKinds: ["notes", "docs"] },
  ],
}

export function getStudioToolPanel(id: StudioToolPanelId) {
  return studioToolPanels.find((panel) => panel.id === id) || studioToolPanels[0]
}

export function getStudioToolActions(panel: StudioToolPanelId, kind: StudioKind) {
  return (studioToolActions[panel] || []).filter((action) => action.supportedKinds.includes(kind))
}

export function resolveStudioToolActionKind(action: Pick<StudioToolAction, "supportedKinds">, preferredKind: StudioKind) {
  return action.supportedKinds.includes(preferredKind) ? preferredKind : action.supportedKinds[0] || preferredKind
}
