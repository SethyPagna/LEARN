import { importCsvToSheet } from "./workspace-features"

export type ImportTarget = "note" | "doc" | "sheet" | "slides"

export interface ShapedImport {
  target: ImportTarget
  title: string
  payload: Record<string, unknown>
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
