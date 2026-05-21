import { importCsvToSheet } from "./workspace-features"
import type { StudioInsertTarget } from "@/components/learn/types"
import type { AiTaskKey } from "./ai/prompt-library"

export type ImportTarget = "note" | "doc" | "sheet" | "slides"
export type ImportFollowupKind = "cleanup" | "practice" | "flashcards"
export type ImportDestinationView = "notes" | "docs" | "sheets" | "slides"

export interface ShapedImport {
  target: ImportTarget
  title: string
  payload: Record<string, unknown>
}

export interface ImportPreviewSummary {
  ok: boolean
  target: ImportTarget
  title: string
  confidence: "low" | "medium" | "high"
  itemCount: number
  itemLabel: string
  destinationView: ImportDestinationView
  warnings: string[]
}

export interface ImportFollowupAction {
  kind: ImportFollowupKind
  taskKey: AiTaskKey
  aiMode: "cleanup" | "quiz" | "flashcards"
  insertTarget: StudioInsertTarget
  sourceScope: "Uploaded files"
  message: string
  status: string
}

interface ImportCleanupWorkflow {
  taskKey: AiTaskKey
  insertTarget: StudioInsertTarget
  messageVerb: string
}

export function shapeImportedLearningContent(input: { raw: string; title?: string; target?: ImportTarget | "auto" }): ShapedImport {
  const raw = input.raw.trim()
  const target = input.target && input.target !== "auto" ? input.target : detectImportTarget(raw)
  const title = cleanTitle(input.title || inferTitle(raw))

  if (target === "sheet") {
    const sheet = importCsvToSheet(raw)
    return {
      target,
      title,
      payload: {
        title,
        cells: sheet.cells.length > 1 ? sheet.cells : fallbackSheet(raw),
        history: [{ action: "import", at: new Date().toISOString() }],
      },
    }
  }

  if (target === "slides") {
    return {
      target,
      title,
      payload: {
        title,
        slides: shapeSlides(raw),
        speakerNotes: {},
      },
    }
  }

  if (target === "doc") {
    const text = shapeDocumentMarkdown(raw)
    return {
      target,
      title,
      payload: {
        title,
        content: { text: markdownToHtml(text), markdown: text, plainText: raw },
        tags: ["import", "studio"],
      },
    }
  }

  const content = shapeDocumentMarkdown(raw)
  return {
    target,
    title,
    payload: {
      title,
      content,
      icon: "Sparkles",
      favorite: true,
      template: "import-gateway",
    },
  }
}

export function previewImportedLearningContent(input: { raw: string; title?: string; target?: ImportTarget | "auto" }): ImportPreviewSummary {
  const raw = input.raw.trim()
  const forcedTarget = input.target && input.target !== "auto"
  const target = forcedTarget ? input.target as ImportTarget : detectImportTarget(raw)
  const title = cleanTitle(input.title || inferTitle(raw))
  const warnings: string[] = []

  if (raw.length < 12) warnings.push("Paste more learning material before importing.")
  if (!forcedTarget && target === "note" && raw.length > 500) warnings.push("Auto-detect chose note; document may fit better for longer material.")

  const itemCount = countImportItems(target, raw)
  return {
    ok: raw.length >= 12,
    target,
    title,
    confidence: importConfidence({ forcedTarget: Boolean(forcedTarget), itemCount, raw, target }),
    itemCount,
    itemLabel: labelImportItems(target, itemCount),
    destinationView: getImportDestinationView(target),
    warnings,
  }
}

export function buildImportFollowupAction(input: {
  kind: ImportFollowupKind
  title: string
  target: ImportTarget
}): ImportFollowupAction {
  const title = cleanTitle(input.title)
  const targetLabel = labelImportTarget(input.target)

  if (input.kind === "practice") {
    return {
      kind: input.kind,
      taskKey: "practice_generator",
      aiMode: "quiz",
      insertTarget: "quiz",
      sourceScope: "Uploaded files",
      message: `Generate timed practice from the imported ${targetLabel.toLowerCase()} "${title}" with mixed question types, explanations, retry missed items, and review-card seeds.`,
      status: `Practice workflow loaded for ${title}.`,
    }
  }

  if (input.kind === "flashcards") {
    return {
      kind: input.kind,
      taskKey: "flashcard_generation",
      aiMode: "flashcards",
      insertTarget: "flashcards",
      sourceScope: "Uploaded files",
      message: `Create active-recall flashcards from the imported ${targetLabel.toLowerCase()} "${title}" with front/back cards, matching pairs, and one memory game.`,
      status: `Flashcard workflow loaded for ${title}.`,
    }
  }

  const cleanupWorkflow = resolveImportCleanupWorkflow(input.target)
  return {
    kind: input.kind,
    taskKey: cleanupWorkflow.taskKey,
    aiMode: "cleanup",
    insertTarget: cleanupWorkflow.insertTarget,
    sourceScope: "Uploaded files",
    message: `${cleanupWorkflow.messageVerb} the imported ${targetLabel.toLowerCase()} "${title}" into a polished Studio-ready structure with headings, concise sections, and one useful next action.`,
    status: `Cleanup workflow loaded for ${title}.`,
  }
}

export function detectImportTarget(raw: string): ImportTarget {
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const commaRows = lines.filter((line) => line.includes(",")).length
  const pipeRows = lines.filter((line) => line.includes("|")).length
  const headingRows = lines.filter((line) => /^#{1,3}\s+/.test(line)).length

  if (lines.length >= 2 && commaRows / lines.length > 0.65) return "sheet"
  if (lines.length >= 2 && pipeRows / lines.length > 0.5) return "slides"
  if (headingRows >= 2 || raw.length > 900) return "doc"
  return "note"
}

function countImportItems(target: ImportTarget, raw: string) {
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (target === "sheet") return Math.max(1, lines.length)
  if (target === "slides") return Math.max(1, Math.min(16, lines.length))
  if (target === "doc") return Math.max(1, lines.filter((line) => /^#{1,3}\s+/.test(line)).length || Math.ceil(raw.length / 500))
  return Math.max(1, Math.ceil(raw.length / 240))
}

function importConfidence(input: { forcedTarget: boolean; itemCount: number; raw: string; target: ImportTarget }): ImportPreviewSummary["confidence"] {
  if (input.forcedTarget) return "high"
  if (input.target === "sheet" && input.itemCount >= 2) return "high"
  if (input.target === "slides" && input.raw.includes("|")) return "high"
  if (input.target === "doc" && input.raw.includes("##")) return "high"
  if (input.raw.length < 40) return "low"
  return "medium"
}

function labelImportItems(target: ImportTarget, count: number) {
  if (target === "sheet") return `${count} row${count === 1 ? "" : "s"}`
  if (target === "slides") return `${count} slide${count === 1 ? "" : "s"}`
  if (target === "doc") return `${count} section${count === 1 ? "" : "s"}`
  return `${count} block${count === 1 ? "" : "s"}`
}

export function getImportDestinationView(target: ImportTarget): ImportDestinationView {
  if (target === "doc") return "docs"
  if (target === "sheet") return "sheets"
  if (target === "slides") return "slides"
  return "notes"
}

export function labelImportTarget(target: ImportTarget | "auto") {
  if (target === "auto") return "Auto detect"
  if (target === "doc") return "Document"
  if (target === "sheet") return "Sheet"
  if (target === "slides") return "Slides"
  return "Note"
}

function resolveImportCleanupWorkflow(target: ImportTarget): ImportCleanupWorkflow {
  if (target === "sheet") {
    return {
      taskKey: "sheet_organizer",
      insertTarget: "sheet-rows",
      messageVerb: "Organize",
    }
  }
  if (target === "slides") {
    return {
      taskKey: "slide_builder",
      insertTarget: "slide-outline",
      messageVerb: "Build slides from",
    }
  }
  if (target === "note") {
    return {
      taskKey: "note_design",
      insertTarget: "note-block",
      messageVerb: "Rewrite",
    }
  }
  return {
    taskKey: "document_formatter",
    insertTarget: "doc-section",
    messageVerb: "Clean up",
  }
}

function shapeDocumentMarkdown(raw: string) {
  return [
    "## Capture",
    raw,
    "",
    "## Study Design",
    "- Key ideas:",
    "- Questions to practice:",
    "- Terms to remember:",
    "- Next action:",
  ].join("\n")
}

function shapeSlides(raw: string) {
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const slideLines = lines.length ? lines : ["Imported lesson|Add a concise explanation|AI"]
  return slideLines.slice(0, 16).map((line, index) => {
    const [title, body, accent] = line.includes("|") ? line.split("|") : [line, "Add supporting points, examples, or visual cues.", "Import"]
    return {
      title: cleanTitle(title || `Slide ${index + 1}`),
      body: body?.trim() || "Add supporting points, examples, or visual cues.",
      accent: accent?.trim() || "Import",
      layout: index === 0 ? "title" : "two-column",
      theme: "midnight",
      speakerNotes: "",
    }
  })
}

function fallbackSheet(raw: string) {
  return [
    ["Item", "Detail", "Next step"],
    ...raw.split(/\r?\n/).map((line, index) => [`${index + 1}`, line.trim(), "Review"]).filter((row) => row[1]),
  ]
}

function markdownToHtml(markdown: string) {
  return markdown.split(/\r?\n/).map((line) => {
    if (line.startsWith("## ")) return `<h2>${escapeHtml(line.slice(3))}</h2>`
    if (line.startsWith("- ")) return `<p>${escapeHtml(line)}</p>`
    if (!line.trim()) return ""
    return `<p>${escapeHtml(line)}</p>`
  }).join("")
}

function inferTitle(raw: string) {
  return raw.split(/\r?\n/).find((line) => line.trim().length > 8)?.trim().slice(0, 72) || "Imported Learning Capture"
}

function cleanTitle(value: string) {
  return value.replace(/^#+\s*/, "").trim().slice(0, 96) || "Imported Learning Capture"
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}
