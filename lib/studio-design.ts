import type { SlideObject, WorkspaceDeck } from "@/components/learn/types"

export type DocumentInsertKind = "callout" | "reference" | "equation" | "page-break" | "two-column"

export const documentInsertBlocks: Record<DocumentInsertKind, string> = {
  callout: `<blockquote><p><strong>Callout:</strong> Add the idea, warning, or insight here.</p></blockquote>`,
  reference: `<p><strong>Reference:</strong> Author, title, link, and why it matters.</p>`,
  equation: `<p><code>Equation:</code> f(x) = ax + b</p>`,
  "page-break": `<hr><p></p>`,
  "two-column": `<table><tbody><tr><th>Concept</th><th>Evidence / example</th></tr><tr><td></td><td></td></tr></tbody></table>`,
}

export const slideDesignPresets = {
  midnight: { background: "#111827", accent: "#a7f3d0", foreground: "#ffffff" },
  sunrise: { background: "#fff3d6", accent: "#92400e", foreground: "#111827" },
  plain: { background: "#f8fafc", accent: "#2563eb", foreground: "#0f172a" },
  forest: { background: "#052e2b", accent: "#bbf7d0", foreground: "#ecfeff" },
  grape: { background: "#2e1065", accent: "#f0abfc", foreground: "#faf5ff" },
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

export function createSlideDesignObject(type: "text" | "shape" | "image") {
  if (type === "shape") {
    return { id: `shape_${Date.now().toString(36)}`, type, x: 10, y: 68, w: 28, h: 10, text: "Label" }
  }
  if (type === "image") {
    return { id: `image_${Date.now().toString(36)}`, type, x: 58, y: 24, w: 30, h: 34, src: "", text: "Image cue" }
  }
  return { id: `text_${Date.now().toString(36)}`, type, x: 12, y: 54, w: 70, h: 12, text: "Supporting point" }
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
