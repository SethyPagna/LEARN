import type { StudioInsertTarget, WorkspaceDeck } from "@/components/learn/types"

export interface InsertBackPayload {
  endpoint: "/api/notes" | "/api/docs" | "/api/sheets" | "/api/slides"
  view: "notes" | "docs" | "sheets" | "slides"
  body: Record<string, unknown>
}

export function buildInsertBackPayload(target: StudioInsertTarget, reply: string, titlePrefix = "AI result"): InsertBackPayload {
  const parsed = parseAiJson(reply)
  const title = cleanTitle(readString(parsed, "title") || `${titlePrefix} - ${new Date().toLocaleDateString()}`)

  if (target === "doc-section") {
    return {
      endpoint: "/api/docs",
      view: "docs",
      body: {
        title,
        content: {
          text: toHtmlDocument(parsed, reply),
          markdown: toMarkdownDocument(parsed, reply),
          plainText: toPlainText(parsed, reply),
          blocks: Array.isArray(parsed?.blocks) ? parsed.blocks : undefined,
        },
        tags: ["ai", "studio"],
      },
    }
  }

  if (target === "sheet-rows") {
    return {
      endpoint: "/api/sheets",
      view: "sheets",
      body: {
        title,
        cells: toSheetCells(parsed, reply),
        history: [{ action: "ai-insert", at: new Date().toISOString() }],
        frozenRows: 1,
      },
    }
  }

  if (target === "slide-outline") {
    return {
      endpoint: "/api/slides",
      view: "slides",
      body: {
        title,
        slides: toSlides(parsed, reply),
        speakerNotes: {},
      },
    }
  }

  return {
    endpoint: "/api/notes",
    view: "notes",
    body: {
      title,
      content: toHtmlDocument(parsed, reply),
      icon: target === "flashcards" || target === "review-cards" ? "Brain" : "Sparkles",
      favorite: target === "review-cards",
      template: target,
    },
  }
}

export function parseAiJson(reply: string): Record<string, unknown> | null {
  const trimmed = reply.trim()
  const candidates = [
    trimmed,
    trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] || "",
    trimmed.slice(trimmed.indexOf("{"), trimmed.lastIndexOf("}") + 1),
  ].filter(Boolean)

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
    } catch {
      // Try the next candidate.
    }
  }
  return null
}

function toSheetCells(parsed: Record<string, unknown> | null, reply: string) {
  const columns = readArray(parsed, "columns").map(String)
  const rows = readArray(parsed, "rows")
  if (columns.length && rows.length) {
    return [
      columns,
      ...rows.map((row) => Array.isArray(row)
        ? row.map(String)
        : columns.map((column) => String((row as Record<string, unknown>)?.[column] ?? ""))),
    ]
  }

  const lines = reply.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  return [
    ["Item", "Detail", "Next step"],
    ...lines.slice(0, 30).map((line, index) => [`${index + 1}`, line, "Review"]),
  ]
}

function toSlides(parsed: Record<string, unknown> | null, reply: string): WorkspaceDeck["slides"] {
  const slides = readArray(parsed, "slides")
  if (slides.length) {
    return slides.map((slide, index) => {
      const item = slide as Record<string, unknown>
      return {
        title: readString(item, "title") || `Slide ${index + 1}`,
        body: readString(item, "body") || readString(item, "summary") || "",
        accent: readString(item, "accent") || "LEARN",
        layout: normalizeLayout(readString(item, "layout")),
        theme: readString(item, "theme") || "midnight",
        objects: Array.isArray(item.objects) ? item.objects as WorkspaceDeck["slides"][number]["objects"] : undefined,
        speakerNotes: readString(item, "speakerNotes") || readString(item, "notes") || "",
      }
    })
  }

  return reply.split(/\r?\n{2,}/).filter(Boolean).slice(0, 8).map((block, index) => {
    const [first, ...rest] = block.split(/\r?\n/)
    return {
      title: first.replace(/^#+\s*/, "").slice(0, 80) || `Slide ${index + 1}`,
      body: rest.join("\n").trim() || block.slice(0, 240),
      accent: "AI",
      layout: "title",
      theme: "midnight",
      speakerNotes: "",
    }
  })
}

function toHtmlDocument(parsed: Record<string, unknown> | null, reply: string) {
  const blocks = readArray(parsed, "blocks")
  if (blocks.length) {
    return blocks.map((block) => {
      const item = block as Record<string, unknown>
      const type = readString(item, "type") || "paragraph"
      const text = escapeHtml(readString(item, "text") || "")
      if (type === "heading") return `<h2>${text}</h2>`
      if (type === "callout") return `<blockquote>${text}</blockquote>`
      if (type === "code") return `<pre><code>${text}</code></pre>`
      return `<p>${text}</p>`
    }).join("")
  }

  const summary = readString(parsed, "summary")
  const text = summary || reply
  return text.split(/\r?\n{2,}/).filter(Boolean).map((block) => {
    const clean = escapeHtml(block.trim())
    return block.startsWith("#") ? `<h2>${clean.replace(/^#+\s*/, "")}</h2>` : `<p>${clean.replace(/\r?\n/g, "<br />")}</p>`
  }).join("")
}

function toMarkdownDocument(parsed: Record<string, unknown> | null, reply: string) {
  const summary = readString(parsed, "summary")
  return summary || reply
}

function toPlainText(parsed: Record<string, unknown> | null, reply: string) {
  return toMarkdownDocument(parsed, reply).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

function readArray(value: Record<string, unknown> | null, key: string) {
  const item = value?.[key]
  return Array.isArray(item) ? item : []
}

function readString(value: Record<string, unknown> | null, key: string) {
  const item = value?.[key]
  return typeof item === "string" ? item : ""
}

function cleanTitle(value: string) {
  return value.trim().slice(0, 96) || "AI result"
}

function normalizeLayout(value: string): WorkspaceDeck["slides"][number]["layout"] {
  return value === "two-column" || value === "image" || value === "quote" ? value : "title"
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}
