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

export function applySlideDesignPreset(slide: WorkspaceDeck["slides"][number], preset: keyof typeof slideDesignPresets) {
  const design = slideDesignPresets[preset]
  return {
    ...slide,
    theme: preset,
    background: design.background,
    accent: slide.accent || "LEARN",
  }
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
