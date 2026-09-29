import type { DesignDoc } from "./document"
import { exportPageIndices } from "./export-plan"
import { elementText, estimateDesignSeconds, estimatePageSeconds, formatDuration } from "./timing"

/**
 * A presenter's outline as plain text: the design's name and length, then
 * each page's words in reading order (top to bottom, then left to right),
 * its speaker notes and a rough time. Pages follow the Download menu's
 * choice; by default every page that is presented.
 */
export function designOutline(doc: DesignDoc, requested?: readonly number[]): string {
  const indices = exportPageIndices(doc, requested)
  const lines = [doc.name.trim() || "Untitled design", `${indices.length} page${indices.length === 1 ? "" : "s"} · about ${formatDuration(estimateDesignSeconds(doc, indices))}`]
  for (const index of indices) {
    const page = doc.pages[index]
    lines.push("", `Page ${index + 1}${page.hidden ? " (hidden)" : ""} · about ${formatDuration(estimatePageSeconds(page))}`)
    const texts = [...page.elements]
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map(elementText)
      .filter(Boolean)
    lines.push(...(texts.length ? texts : ["(no text)"]))
    const notes = page.notes.trim()
    if (notes) lines.push("", "Notes:", notes)
  }
  return `${lines.join("\n").replace(/\r\n?/g, "\n")}\n`
}
