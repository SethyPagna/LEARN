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
