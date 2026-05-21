import type { SlideObject, WorkspaceDeck } from "@/components/learn/types"

export type DocumentInsertKind =
  | "callout"
  | "reference"
  | "equation"
  | "page-break"
  | "two-column"
  | "study-summary"
  | "cornell-notes"
  | "quiz-seed"
  | "citation-list"

export const documentInsertBlocks: Record<DocumentInsertKind, string> = {
  callout: `<blockquote><p><strong>Callout:</strong> Add the idea, warning, or insight here.</p></blockquote>`,
  reference: `<p><strong>Reference:</strong> Author, title, link, and why it matters.</p>`,
  equation: `<p><code>Equation:</code> f(x) = ax + b</p>`,
  "page-break": `<hr><p></p>`,
  "two-column": `<table><tbody><tr><th>Concept</th><th>Evidence / example</th></tr><tr><td></td><td></td></tr></tbody></table>`,
  "study-summary": `<h2>Study summary</h2><p><strong>Main idea:</strong> </p><ul><li>Key point</li><li>Example</li><li>Next review action</li></ul>`,
  "cornell-notes": `<table><tbody><tr><th>Cues / questions</th><th>Notes</th></tr><tr><td>What should I recall?</td><td>Add explanation, example, and source.</td></tr><tr><td colspan="2"><strong>Summary:</strong> Write the takeaway in your own words.</td></tr></tbody></table>`,
  "quiz-seed": `<h2>Quiz seed</h2><ol><li><p><strong>Question:</strong> </p><p><strong>Answer:</strong> </p><p><strong>Why:</strong> </p></li></ol>`,
  "citation-list": `<h2>References</h2><ul><li>Author. <em>Title</em>. Link or source note. Why it matters.</li></ul>`,
}

export const documentInsertGroups: Array<{ label: string; items: DocumentInsertKind[] }> = [
  { label: "Blocks", items: ["callout", "reference", "equation", "page-break"] },
  { label: "Layouts", items: ["two-column", "cornell-notes"] },
  { label: "Learning", items: ["study-summary", "quiz-seed", "citation-list"] },
]

export const richTemplateDesigns = [
  { name: "Library", background: "#f8fafc", accent: "#0f766e", foreground: "#0f172a", font: "Georgia, serif" },
  { name: "Blueprint", background: "#eff6ff", accent: "#2563eb", foreground: "#172554", font: "Inter, sans-serif" },
  { name: "Field notes", background: "#f7fee7", accent: "#65a30d", foreground: "#1a2e05", font: "Atkinson Hyperlegible, Inter, sans-serif" },
  { name: "Research", background: "#faf5ff", accent: "#7c3aed", foreground: "#2e1065", font: "Inter, sans-serif" },
  { name: "Warm brief", background: "#fff7ed", accent: "#c2410c", foreground: "#431407", font: "Georgia, serif" },
  { name: "Minimal", background: "#ffffff", accent: "#334155", foreground: "#0f172a", font: "Inter, sans-serif" },
  { name: "Focus", background: "#ecfeff", accent: "#0891b2", foreground: "#083344", font: "Inter, sans-serif" },
  { name: "Review", background: "#fef2f2", accent: "#dc2626", foreground: "#450a0a", font: "Inter, sans-serif" },
  { name: "Studio", background: "#fdf2f8", accent: "#db2777", foreground: "#500724", font: "Georgia, serif" },
  { name: "Archive", background: "#f5f5f4", accent: "#78716c", foreground: "#292524", font: "Inter, sans-serif" },
] as const

export const sheetTemplateDesigns = [
  { name: "Tracker", accent: "Emerald", status: ["Ready", "Review", "Blocked"] },
  { name: "Planner", accent: "Blue", status: ["Next", "Doing", "Done"] },
  { name: "Scoreboard", accent: "Amber", status: ["Low", "Target", "Strong"] },
  { name: "Inventory", accent: "Slate", status: ["New", "Owned", "Archived"] },
  { name: "Rubric", accent: "Purple", status: ["1", "2", "3", "4"] },
  { name: "Lab", accent: "Cyan", status: ["Draft", "Run", "Reviewed"] },
  { name: "Budget", accent: "Green", status: ["Planned", "Spent", "Saved"] },
  { name: "Schedule", accent: "Indigo", status: ["Queued", "Today", "Moved"] },
  { name: "Vocabulary", accent: "Rose", status: ["New", "Due", "Known"] },
  { name: "Roadmap", accent: "Orange", status: ["Idea", "Build", "Ship"] },
] as const

export const slideDesignPresets = {
  midnight: { background: "#111827", accent: "#a7f3d0", foreground: "#ffffff" },
  sunrise: { background: "#fff3d6", accent: "#92400e", foreground: "#111827" },
  plain: { background: "#f8fafc", accent: "#2563eb", foreground: "#0f172a" },
  forest: { background: "#052e2b", accent: "#bbf7d0", foreground: "#ecfeff" },
  grape: { background: "#2e1065", accent: "#f0abfc", foreground: "#faf5ff" },
  atlas: { background: "#f7f2e8", accent: "#0f766e", foreground: "#172554" },
  obsidian: { background: "#05070a", accent: "#38bdf8", foreground: "#f8fafc" },
  blossom: { background: "#fff1f2", accent: "#be123c", foreground: "#3f1d2b" },
  circuit: { background: "#031b1f", accent: "#22d3ee", foreground: "#ecfeff" },
  parchment: { background: "#fffbeb", accent: "#a16207", foreground: "#292524" },
}

export const slideTemplateDesigns = [
  { theme: "midnight", layout: "title", transition: "fade", animation: "rise" },
  { theme: "atlas", layout: "two-column", transition: "push", animation: "reveal" },
  { theme: "plain", layout: "image", transition: "wipe", animation: "rise" },
  { theme: "forest", layout: "quote", transition: "zoom", animation: "emphasis" },
  { theme: "sunrise", layout: "title", transition: "fade", animation: "reveal" },
  { theme: "obsidian", layout: "two-column", transition: "push", animation: "rise" },
  { theme: "blossom", layout: "image", transition: "wipe", animation: "emphasis" },
  { theme: "circuit", layout: "quote", transition: "zoom", animation: "reveal" },
  { theme: "parchment", layout: "title", transition: "fade", animation: "rise" },
  { theme: "grape", layout: "two-column", transition: "push", animation: "emphasis" },
] as const

export const slideTransitionPresets = {
  none: { label: "None", description: "Instant slide change for fast reviews.", durationMs: 0 },
  fade: { label: "Fade", description: "Soft crossfade for calm teaching decks.", durationMs: 450 },
  push: { label: "Push", description: "Directional movement for step-by-step stories.", durationMs: 500 },
  zoom: { label: "Zoom", description: "Emphasizes a major idea or section break.", durationMs: 550 },
  wipe: { label: "Wipe", description: "Clear visual handoff for process slides.", durationMs: 500 },
}

export const slideAnimationPresets = {
  none: { label: "None", description: "No object entrance animation.", durationMs: 0 },
  rise: { label: "Rise", description: "Content lifts in gently for modern decks.", durationMs: 350 },
  reveal: { label: "Reveal", description: "Best for bullets, steps, and progressive teaching.", durationMs: 400 },
  emphasis: { label: "Emphasis", description: "Subtle scale cue for key moments.", durationMs: 300 },
}

export function getDocumentInsertBlock(kind: DocumentInsertKind) {
  return documentInsertBlocks[kind]
}

export function buildDesignedRichTemplate(input: {
  body: string
  description: string
  kind: "notes" | "docs"
  label: string
  sections: string[]
}) {
  const design = richTemplateDesignFor(input.label)
  const sections = input.sections.slice(0, 4)
  const isDoc = input.kind === "docs"
  return [
    `<blockquote style="border-left: 6px solid ${design.accent}; background: ${design.background}; color: ${design.foreground}; padding: 14px 16px; border-radius: 12px; font-family: ${design.font};">`,
    `<p><strong>${escapeHtml(input.label)} - ${design.name}</strong></p>`,
    `<p>${escapeHtml(input.description)}</p>`,
    "</blockquote>",
    input.body,
    `<table><tbody><tr><th>Focus</th><th>Evidence</th><th>Next action</th></tr><tr><td>${escapeHtml(sections[0] || "Main idea")}</td><td>${escapeHtml(sections[1] || "Example or source")}</td><td>${isDoc ? "Polish and export" : "Turn into review"}</td></tr></tbody></table>`,
    "<h2>Media / visual area</h2>",
    `<blockquote style="border-style: dashed; border-color: ${design.accent}; background: ${design.background}; color: ${design.foreground};">Add an image, diagram, equation, source, or screenshot here.</blockquote>`,
    "<h2>Review loop</h2>",
    "<ul><li>Create one recall question.</li><li>Mark one weak point.</li><li>Link one related Studio item.</li></ul>",
  ].join("")
}

export function buildDesignedSheetTemplateCsv(body: string, label: string) {
  const design = sheetTemplateDesignFor(label)
  const rows = parseCsvRows(body)
  const header = rows[0] || []
  const extras = ["Priority", "Owner", "Due", "Notes", "View"].filter((column) => !header.includes(column))
  const styledRows = rows.map((row, index) => {
    if (index === 0) return [...row, ...extras].join(",")
    const defaults = extras.map((column) => {
      if (column === "Priority") return index === 1 ? "High" : "Medium"
      if (column === "Owner") return "Me"
      if (column === "View") return design.accent
      return ""
    })
    return [...row, ...defaults].join(",")
  })
  return [
    styledRows.join("\n"),
    `\n\nTemplate,${design.name}`,
    `Accent,${design.accent}`,
    `Status options,${design.status.join(" / ")}`,
  ].join("")
}

export function richTemplateDesignFor(label: string) {
  return pickTemplateDesign(richTemplateDesigns, label)
}

export function sheetTemplateDesignFor(label: string) {
  return pickTemplateDesign(sheetTemplateDesigns, label)
}

export function applySlideDesignPreset(slide: WorkspaceDeck["slides"][number], preset: keyof typeof slideDesignPresets) {
  const design = slideDesignPresets[preset]
  return {
    ...slide,
    theme: preset,
    background: design.background,
    accent: slide.accent || "LEARN",
    objects: recolorSlideObjects(slide.objects || [], design),
  }
}

export function applySlideDesignPresetToDeck(slides: WorkspaceDeck["slides"], preset: keyof typeof slideDesignPresets) {
  return slides.map((slide) => applySlideDesignPreset(slide, preset))
}

export function buildDesignedSlideTemplateDeck(body: string, templateLabel = "Deck") {
  const lines = body.split("\n").map((line) => line.trim()).filter(Boolean)
  const safeLines = lines.length ? lines : ["Opening|Start with one useful idea|LEARN"]
  return safeLines.map((line, index) => {
    const [rawTitle, rawBody, rawAccent] = line.split("|")
    const design = slideTemplateDesigns[index % slideTemplateDesigns.length]
    const theme = design.theme as keyof typeof slideDesignPresets
    const palette = slideDesignPresets[theme]
    const title = (rawTitle || `Slide ${index + 1}`).trim()
    const bodyText = (rawBody || "Add the point.").trim()
    const accent = (rawAccent || templateLabel).trim()
    return {
      title,
      body: bodyText,
      accent,
      layout: design.layout,
      theme,
      background: palette.background,
      transition: design.transition,
      animation: design.animation,
      speakerNotes: `${templateLabel}: explain "${title}" with one example, one visual cue, and one learner action.`,
      objects: buildTemplateSlideObjects({ accent: palette.accent, body: bodyText, foreground: palette.foreground, index, layout: design.layout }),
    } satisfies WorkspaceDeck["slides"][number]
  })
}

function buildTemplateSlideObjects(input: {
  accent: string
  body: string
  foreground: string
  index: number
  layout: typeof slideTemplateDesigns[number]["layout"]
}) {
  const mutedFill = input.foreground === "#ffffff" || input.foreground === "#f8fafc" || input.foreground === "#ecfeff" || input.foreground === "#faf5ff"
    ? "rgba(255,255,255,0.13)"
    : "rgba(15,23,42,0.08)"
  const baseText = {
    color: input.foreground,
    fontSize: 14,
  }
  if (input.layout === "image") {
    return [
      { id: `image_cue_${input.index}`, type: "image", x: 60, y: 20, w: 28, h: 36, text: "Image / diagram", src: "", style: { background: mutedFill, color: input.foreground } },
      { id: `caption_${input.index}`, type: "text", x: 12, y: 72, w: 52, h: 10, text: "Add a visual example or screenshot here.", style: baseText },
    ] satisfies SlideObject[]
  }
  if (input.layout === "two-column") {
    return [
      { id: `left_${input.index}`, type: "shape", x: 10, y: 58, w: 34, h: 20, text: "Idea", style: { background: mutedFill, color: input.foreground, borderRadius: 10, fontSize: 15 } },
      { id: `right_${input.index}`, type: "shape", x: 52, y: 58, w: 34, h: 20, text: "Example", style: { background: input.accent, color: "#071014", borderRadius: 10, fontSize: 15 } },
    ] satisfies SlideObject[]
  }
  if (input.layout === "quote") {
    return [
      { id: `quote_bar_${input.index}`, type: "shape", x: 10, y: 26, w: 2, h: 45, text: "", style: { background: input.accent, color: input.accent, borderRadius: 4 } },
      { id: `quote_note_${input.index}`, type: "text", x: 16, y: 60, w: 68, h: 14, text: "Turn the idea into a memorable line.", style: { ...baseText, fontSize: 16 } },
    ] satisfies SlideObject[]
  }
  return [
    { id: `pill_${input.index}`, type: "shape", x: 10, y: 70, w: 28, h: 9, text: "Key move", style: { background: input.accent, color: "#071014", borderRadius: 999, fontSize: 13 } },
    { id: `prompt_${input.index}`, type: "text", x: 42, y: 70, w: 45, h: 10, text: input.body.slice(0, 72) || "Add a learner action.", style: baseText },
  ] satisfies SlideObject[]
}

function recolorSlideObjects(objects: SlideObject[], design: typeof slideDesignPresets[keyof typeof slideDesignPresets]) {
  return objects.map((object) => {
    const style = object.style || {}
    const nextStyle = {
      ...style,
      color: object.type === "shape" ? style.color || "#071014" : design.foreground,
    }
    if (object.type === "shape" && style.background && String(style.background).startsWith("#")) return { ...object, style: nextStyle }
    if (object.type === "text") return { ...object, style: { ...nextStyle, background: "transparent" } }
    return {
      ...object,
      style: {
        ...nextStyle,
        background: object.type === "image" ? "rgba(255,255,255,0.14)" : style.background || "rgba(255,255,255,0.12)",
      },
    }
  })
}

export function createSlideDesignObject(type: SlideObject["type"]) {
  if (type === "shape") {
    return { id: `shape_${Date.now().toString(36)}`, type, x: 10, y: 68, w: 28, h: 10, text: "Label", style: { background: "#2563eb", color: "#ffffff", borderRadius: 8 } }
  }
  if (type === "image") {
    return { id: `image_${Date.now().toString(36)}`, type, x: 58, y: 24, w: 30, h: 34, src: "", text: "Image cue", style: { background: "rgba(255,255,255,0.14)", color: "#ffffff" } }
  }
  if (type === "table") {
    return { id: `table_${Date.now().toString(36)}`, type, x: 12, y: 58, w: 60, h: 22, text: "Concept | Evidence | Action", style: { background: "rgba(255,255,255,0.12)", color: "#ffffff", fontSize: 12 } }
  }
  return { id: `text_${Date.now().toString(36)}`, type, x: 12, y: 54, w: 70, h: 12, text: "Supporting point", style: { color: "#ffffff", fontSize: 16 } }
}

export function updateSlideDesignObject(
  slide: WorkspaceDeck["slides"][number],
  objectId: string,
  patch: Partial<SlideObject>,
) {
  return {
    ...slide,
    objects: (slide.objects || []).map((object) => (
      object.id === objectId ? { ...object, ...patch } : object
    )),
  }
}

export function removeSlideDesignObject(slide: WorkspaceDeck["slides"][number], objectId: string) {
  return {
    ...slide,
    objects: (slide.objects || []).filter((object) => object.id !== objectId),
  }
}

export function summarizeSlideShow(slides: WorkspaceDeck["slides"]) {
  const slideTimings = slides.map((slide, index) => {
    const bodyWords = `${slide.title} ${slide.body} ${slide.speakerNotes || ""}`.trim().split(/\s+/).filter(Boolean).length
    const readingMs = Math.max(3500, Math.ceil(bodyWords / 2.4) * 1000)
    const transitionMs = slideTransitionPresets[slide.transition || "none"]?.durationMs || 0
    const animationMs = slideAnimationPresets[slide.animation || "none"]?.durationMs || 0
    return {
      index,
      title: slide.title || `Slide ${index + 1}`,
      durationMs: readingMs + transitionMs + animationMs,
    }
  })
  const totalMs = slideTimings.reduce((total, item) => total + item.durationMs, 0)
  return {
    slideCount: slides.length,
    totalSeconds: Math.ceil(totalMs / 1000),
    totalMinutes: Math.max(1, Math.ceil(totalMs / 60000)),
    slideTimings,
  }
}

export function buildSlidePresenterOutline(slides: WorkspaceDeck["slides"]) {
  return slides.map((slide, index) => {
    const objects = (slide.objects || []).map((object) => `${object.type}: ${object.text || object.src || "empty"}`).join("; ")
    return [
      `Slide ${index + 1}: ${slide.title || "Untitled"}`,
      `Accent: ${slide.accent || "Slide"}`,
      `Layout: ${slide.layout || "title"} | Transition: ${slide.transition || "none"} | Animation: ${slide.animation || "none"}`,
      `Body: ${slide.body || ""}`,
      objects ? `Objects: ${objects}` : "",
      slide.speakerNotes ? `Speaker notes: ${slide.speakerNotes}` : "",
    ].filter(Boolean).join("\n")
  }).join("\n\n")
}

export function buildSlideExportPayload(title: string, slides: WorkspaceDeck["slides"]) {
  const summary = summarizeSlideShow(slides)
  return {
    title,
    summary,
    presenterOutline: buildSlidePresenterOutline(slides),
    slides: slides.map((slide, index) => ({
      index: index + 1,
      title: slide.title || `Slide ${index + 1}`,
      accent: slide.accent || "Slide",
      body: slide.body || "",
      layout: slide.layout || "title",
      theme: slide.theme || "midnight",
      background: slide.background || slideDesignPresets[(slide.theme || "midnight") as keyof typeof slideDesignPresets]?.background || "#111827",
      transition: slide.transition || "none",
      animation: slide.animation || "none",
      objects: slide.objects || [],
      speakerNotes: slide.speakerNotes || "",
      estimatedSeconds: Math.ceil((summary.slideTimings[index]?.durationMs || 0) / 1000),
    })),
  }
}

function pickTemplateDesign<const T extends readonly unknown[]>(items: T, label: string): T[number] {
  const checksum = label.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0)
  return items[checksum % items.length] || items[0]
}

function parseCsvRows(body: string) {
  return body.split("\n").map((row) => row.split(",").map((cell) => cell.trim()))
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}
