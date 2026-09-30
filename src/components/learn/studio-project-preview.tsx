"use client"

import { useMemo, type ReactNode } from "react"
import { FileText } from "lucide-react"
import { designPreview } from "@/lib/design/document"
import { deckToDesign } from "@/lib/design/from-deck"
import { blocksFromDocumentHtml } from "@/lib/export/html-blocks"
import { createSheetFormulaEvaluator } from "@/lib/sheet-formulas"
import { sanitizeImageUrl } from "@/lib/studio/canvas-styles"
import { formatAiResponse, type ThemedBlock } from "@/lib/ai/format-response"
import type { MeasureText } from "@/lib/design/text"
import { FitThumbnail } from "./design/fit-thumbnail"
import type { Project } from "./studio-projects"

function DocumentBlock({ block }: { block: ThemedBlock }) {
  switch (block.type) {
    case "heading": return <strong className="preview-heading">{block.text}</strong>
    case "paragraph": case "quote": return <p>{block.text}</p>
    case "list": return <ul>{block.items.slice(0, 5).map((item, index) => <li key={index}>{item}</li>)}</ul>
    case "table": return <table><tbody>{[block.headers, ...block.rows].slice(0, 5).map((row, index) => <tr key={index}>{row.slice(0, 4).map((cell, column) => <td key={column}>{cell}</td>)}</tr>)}</tbody></table>
    case "code": return <pre>{block.code}</pre>
    case "image": { const src = sanitizeImageUrl(block.url); return src ? <img src={src} alt="" loading="lazy" /> : null }
    case "divider": return <hr />
    default: return null
  }
}

/**
 * Read-only excerpts of stored content, never generated placeholder artwork.
 * With nothing stored yet it shows `fallback`, or says the page is empty.
 */
export function StudioProjectPreview({ project, measure, fallback }: { project: Project; measure: MeasureText; fallback?: ReactNode }) {
  const preview = useMemo(() => {
    try {
      if (project.kind === "canvas" && project.content) return designPreview(project.content).preview
      if (project.kind === "slides") {
        const slide = project.slides?.find(item => !item.hidden) ?? project.slides?.[0]
        return slide ? deckToDesign({ title: project.title, slides: [slide] }) : null
      }
    } catch { /* A malformed record must not prevent other projects from opening. */ }
    return null
  }, [project])
  const blocks = useMemo(() => {
    if (project.kind !== "notes" && project.kind !== "docs") return []
    const content = project.content
    const fields = content && typeof content === "object" ? content as Record<string, unknown> : {}
    const source = typeof content === "string" ? content : [fields.text, fields.markdown, fields.plainText].find(value => typeof value === "string")
    const text = typeof source === "string" ? source.slice(0, 40_000) : ""
    if (!text.trim()) return []
    return (/<[a-z][a-z0-9]*[\s>]/i.test(text) ? blocksFromDocumentHtml(text) : formatAiResponse({ reply: text }).blocks).slice(0, 8)
  }, [project])

  const sheetFormulas = useMemo(() => createSheetFormulaEvaluator(project.cells ?? []), [project.cells])

  if (preview) return <FitThumbnail width={preview.width} height={preview.height} theme={preview.theme} page={preview.pages[0]} measure={measure} />
  if (project.kind === "sheets" && project.cells?.length) return <div className="project-sheet-preview"><table><thead><tr><th />{["A", "B", "C", "D"].map(name => <th key={name}>{name}</th>)}</tr></thead><tbody>{project.cells.slice(0, 7).map((row, index) => <tr key={index}><th>{index + 1}</th>{Array.from({ length: 4 }, (_, column) => {
    const value = row[column] ?? ""
    const result = value.trim().startsWith("=") ? sheetFormulas.evaluateCell({ row: index, column }) : null
    return <td key={column}>{result?.ok ? result.value : value}</td>
  })}</tr>)}</tbody></table></div>
  if (blocks.length) return <div className="project-document-preview">{blocks.map((block, index) => <DocumentBlock key={index} block={block} />)}</div>
  if (fallback) return fallback
  return <div className="project-preview-empty"><FileText aria-hidden="true" /><span>{project.kind === "notes" || project.kind === "docs" ? "Empty page" : "No preview"}</span></div>
}
