/**
 * Dropping an AI-formatted block onto the design canvas.
 *
 * `format-response` produces `ThemedBlock[]` and `ai-block-renderer.tsx` renders
 * them with a drag grip; `canvas-engine.ts` knows nothing about blocks. This
 * module is the single bridge: it names the drag payload the renderer writes,
 * validates what a drop delivers, and converts a block into a canvas element.
 *
 * Two rules make it safe to put model output on a canvas:
 *
 *   1. `parseDroppedBlock` re-derives the block from the JSON instead of casting
 *      it. A `dataTransfer` payload is attacker-influenced (any page can start a
 *      drag carrying arbitrary data), so the parsed value is narrowed field by
 *      field and every block is capped.
 *   2. `blockToElement` re-checks an image URL with `isSafeUrl`, even though the
 *      parser already did: the conversion is the last gate before a URL becomes
 *      an element, and the element can later be serialized and served.
 *
 * Everything here is pure and environment-free except the id counter and the
 * `DataTransfer` helpers, which are thin wrappers over the platform's own type —
 * `blockToElement` and `parseDroppedBlock` take and return plain values, so the
 * mapping is unit tested without a browser.
 *
 * The mapping is deliberately lossy in one direction only: a table becomes a
 * text element with its rows joined as lines and a callout becomes styled text.
 * No new element type is invented for either, because `canvas-engine`'s four
 * types are the document format the editor, the share preview and the JSON
 * export all agree on.
 */

import { isSafeUrl, type QuizQuestion, type ThemedBlock, type ThemedCalloutTone, type ThemedHeadingLevel } from "@/lib/ai/format-response"
import { createElement, type CanvasElement } from "./canvas-engine"

/** The `dragstart` type that carries one block. */
export const LEARN_BLOCK_MIME = "application/x-learn-block"

/**
 * The block's index in the rendered list, carried alongside it.
 *
 * Separate from the block JSON because the index is not part of the block: it
 * is the renderer's position for it, and it keeps a dropped element's id and
 * layer name traceable back to the reply it came from.
 */
export const LEARN_BLOCK_INDEX_MIME = "application/x-learn-block-index"

export interface BlockDropPoint {
  x: number
  y: number
}

export interface DroppedBlock {
  block: ThemedBlock
  index: number
}

// Caps: a hostile or accidental drag must not be able to hand the canvas a
// megabyte-long text element or a table with a million rows.
const MAX_TEXT = 20000
const MAX_TITLE = 300
const MAX_LIST_ITEMS = 200
const MAX_TABLE_COLUMNS = 32
const MAX_TABLE_ROWS = 500
const MAX_QUESTIONS = 60
const MAX_CHOICES = 12
const MAX_SLIDES = 60
const MAX_LANGUAGE = 40
const MAX_URL = 2048

// ---------------------------------------------------------------------------
// Narrowing — a drop is untrusted input, not a `ThemedBlock`
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readText(value: unknown, max = MAX_TEXT): string {
  return typeof value === "string" ? value.slice(0, max) : ""
}

function readStringList(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, maxItems).map((item) => readText(item))
}

function readChoiceList(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.slice(0, MAX_CHOICES).flatMap((raw) => {
    if (!isRecord(raw)) return []
    const text = readText(raw.text, 500).trim()
    const id = readText(raw.id, 20).trim()
    return text && id ? [{ id, text }] : []
  })
}

function readQuestions(value: unknown): QuizQuestion[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, MAX_QUESTIONS).flatMap((raw) => {
    if (!isRecord(raw)) return []
    const question = readText(raw.question, 1000).trim()
    const choices = readChoiceList(raw.choices)
    // A question with fewer than two choices is not answerable, so it is not
    // rendered anywhere in the app and is not placed on the canvas either.
    if (!question || choices.length < 2) return []
    const answerId = readText(raw.answerId, 20).trim()
    const explanation = readText(raw.explanation, 1000).trim()
    return [{
      question,
      choices,
      ...(answerId ? { answerId } : {}),
      ...(explanation ? { explanation } : {}),
    }]
  })
}

function readSlides(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.slice(0, MAX_SLIDES).flatMap((raw) => {
    if (!isRecord(raw)) return []
    const title = readText(raw.title, MAX_TITLE).trim()
    const bullets = readStringList(raw.bullets, MAX_LIST_ITEMS).filter((bullet) => bullet.trim() !== "")
    return title || bullets.length ? [{ title, bullets }] : []
  })
}

function readTableRows(value: unknown): string[][] {
  if (!Array.isArray(value)) return []
  return value
    .slice(0, MAX_TABLE_ROWS)
    .filter((row): row is unknown[] => Array.isArray(row))
    .map((row) => readStringList(row, MAX_TABLE_COLUMNS))
}

/**
 * Re-derive a block from raw drag payload text.
 *
 * Returns `null` for anything that is not one of the eleven block shapes the
 * renderer knows how to draw — junk, a future block type, or a block whose
 * required text is missing. An unsafe image URL is refused here as well as in
 * `blockToElement`, so a drag that can never become an element is rejected
 * before the canvas is touched.
 */
export function parseDroppedBlock(raw: string): ThemedBlock | null {
  if (typeof raw !== "string" || !raw.trim()) return null
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(value)) return null

  switch (value.type) {
    case "heading": {
      const text = readText(value.text)
      if (!text.trim()) return null
      const level = value.level
      const safeLevel: ThemedHeadingLevel = level === 1 || level === 2 || level === 3 || level === 4 ? level : 2
      return { type: "heading", level: safeLevel, text }
    }
    case "paragraph": {
      const text = readText(value.text)
      return text.trim() ? { type: "paragraph", text } : null
    }
    case "quote": {
      const text = readText(value.text)
      return text.trim() ? { type: "quote", text } : null
    }
    case "list": {
      const items = readStringList(value.items, MAX_LIST_ITEMS).filter((item) => item.trim() !== "")
      return items.length ? { type: "list", ordered: value.ordered === true, items } : null
    }
    case "table": {
      const headers = readStringList(value.headers, MAX_TABLE_COLUMNS)
      const rows = readTableRows(value.rows)
      if (!headers.length && !rows.length) return null
      return { type: "table", headers, rows }
    }
    case "code": {
      const code = readText(value.code)
      return code.trim() ? { type: "code", language: readText(value.language, MAX_LANGUAGE), code } : null
    }
    case "divider":
      return { type: "divider" }
    case "image": {
      const url = readText(value.url, MAX_URL)
      if (!isSafeUrl(url)) return null
      return { type: "image", url, alt: readText(value.alt, MAX_TITLE) }
    }
    case "callout": {
      const text = readText(value.text)
      if (!text.trim()) return null
      const tone: ThemedCalloutTone = value.tone === "warn" || value.tone === "success" ? value.tone : "info"
      return { type: "callout", tone, text }
    }
    case "quiz": {
      const questions = readQuestions(value.questions)
      return questions.length ? { type: "quiz", title: readText(value.title, MAX_TITLE), questions } : null
    }
    case "slideOutline": {
      const slides = readSlides(value.slides)
      return slides.length ? { type: "slideOutline", title: readText(value.title, MAX_TITLE), slides } : null
    }
    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Drag payload — written by the renderer, read by the canvas
// ---------------------------------------------------------------------------

/** Attach a block and its list index to a drag the canvas can accept. */
export function setBlockDragPayload(dataTransfer: DataTransfer, block: ThemedBlock, index: number): void {
  dataTransfer.setData(LEARN_BLOCK_MIME, JSON.stringify(block))
  dataTransfer.setData(LEARN_BLOCK_INDEX_MIME, String(Math.max(0, Math.floor(Number(index) || 0))))
  dataTransfer.effectAllowed = "copy"
}

/**
 * Whether a drag carries a block.
 *
 * `dragover` can only inspect `types`: reading the data itself is forbidden
 * until the drop, which is why accepting a drop has to be decided here and the
 * payload read in `drop`.
 */
export function hasBlockDragPayload(dataTransfer: DataTransfer | null): boolean {
  return Boolean(dataTransfer && Array.from(dataTransfer.types).includes(LEARN_BLOCK_MIME))
}

/** Read back a block drag; `null` when the drag carries no usable block. */
export function readBlockDragPayload(dataTransfer: DataTransfer): DroppedBlock | null {
  const block = parseDroppedBlock(dataTransfer.getData(LEARN_BLOCK_MIME))
  if (!block) return null
  const parsedIndex = Number(dataTransfer.getData(LEARN_BLOCK_INDEX_MIME))
  return { block, index: Number.isFinite(parsedIndex) && parsedIndex > 0 ? Math.floor(parsedIndex) : 0 }
}

// ---------------------------------------------------------------------------
// Block -> element
// ---------------------------------------------------------------------------

/** Enough lines to hold the text at this width, so a drop is not clipped. */
function estimatedHeight(content: string, width: number, fontSize: number): number {
  const charsPerLine = Math.max(1, Math.floor(width / (fontSize * 0.55)))
  const lines = content
    .split("\n")
    .reduce((total, line) => total + Math.max(1, Math.ceil(line.length / charsPerLine)), 0)
  return Math.max(Math.ceil(fontSize * 2), Math.ceil(lines * fontSize * 1.5) + 16)
}

const HEADING_SIZE: Record<ThemedHeadingLevel, number> = { 1: 36, 2: 30, 3: 25, 4: 21 }

/** Callout tones, in the same palette the canvas starter document uses. */
const CALLOUT_STYLE: Record<ThemedCalloutTone, { backgroundColor: string; color: string }> = {
  info: { backgroundColor: "#eef2ff", color: "#3730a3" },
  warn: { backgroundColor: "#fef3c7", color: "#92400e" },
  success: { backgroundColor: "#dcfce7", color: "#166534" },
}

/** A table as text: one line per row, cells separated the way a reader expects. */
function tableBlockText(block: Extract<ThemedBlock, { type: "table" }>): string {
  const lines = [block.headers.join(" | "), ...block.rows.map((row) => row.join(" | "))]
  return lines.join("\n").trimEnd()
}

function listBlockText(block: Extract<ThemedBlock, { type: "list" }>): string {
  return block.items.map((item, position) => (block.ordered ? `${position + 1}. ${item}` : `- ${item}`)).join("\n")
}

function quizBlockText(block: Extract<ThemedBlock, { type: "quiz" }>): string {
  const lines = block.title ? [block.title, ""] : []
  block.questions.forEach((question, position) => {
    lines.push(`${position + 1}. ${question.question}`)
    for (const choice of question.choices) lines.push(`   ${choice.id}. ${choice.text}`)
    if (question.answerId) lines.push(`   Answer: ${question.answerId}`)
  })
  return lines.join("\n")
}

function slideOutlineText(block: Extract<ThemedBlock, { type: "slideOutline" }>): string {
  const lines = block.title ? [block.title, ""] : []
  block.slides.forEach((slide, position) => {
    lines.push(`Slide ${position + 1}: ${slide.title}`)
    for (const bullet of slide.bullets) lines.push(`   - ${bullet}`)
  })
  return lines.join("\n")
}

let dropSequence = 0

/**
 * Convert one themed block into a canvas element placed at `at`.
 *
 * `index` is the block's index in the reply it came from; together with a
 * per-call sequence it gives the element a stable, unique id — dropping the
 * same block twice must not replace the first element the way a fixed id would
 * (`addElement` de-duplicates by id).
 *
 * Returns `null` when the block has no canvas representation: currently only an
 * image whose URL fails the allowlist. Everything else maps:
 *
 *   heading / paragraph / quote / list / code / callout -> text, styled by type
 *   table                                               -> text, rows as lines
 *   quiz / slideOutline                                 -> text, outline as lines
 *   image                                               -> image, URL in content
 *   divider                                             -> thin shape
 */
export function blockToElement(block: ThemedBlock, at: BlockDropPoint, index = 0): CanvasElement | null {
  dropSequence += 1
  const id = `ai-block-${Math.max(0, Math.floor(index))}-${block.type}-${dropSequence.toString(36)}`
  const x = Number.isFinite(at?.x) ? at.x : 0
  const y = Number.isFinite(at?.y) ? at.y : 0

  switch (block.type) {
    case "heading": {
      const fontSize = HEADING_SIZE[block.level]
      const width = 520
      return createElement({
        id,
        type: "text",
        x,
        y,
        width,
        height: estimatedHeight(block.text, width, fontSize),
        content: block.text,
        style: { fontSize, fontWeight: 700, color: "#1f2937" },
      })
    }
    case "paragraph":
      return textElement(id, x, y, block.text, { fontSize: 18, fontWeight: 400, color: "#1f2937" })
    case "quote":
      return textElement(id, x, y, block.text, { fontSize: 18, fontWeight: 500, color: "#374151", backgroundColor: "#f1f5f9", borderRadius: 12 })
    case "list":
      return textElement(id, x, y, listBlockText(block), { fontSize: 18, fontWeight: 400, color: "#1f2937" })
    case "code":
      return textElement(id, x, y, block.code, { fontSize: 14, fontWeight: 400, color: "#0f172a", backgroundColor: "#f8fafc", borderRadius: 12 }, 560)
    case "callout":
      return textElement(id, x, y, block.text, { fontSize: 18, fontWeight: 500, ...CALLOUT_STYLE[block.tone], borderRadius: 12 })
    case "table": {
      const content = tableBlockText(block)
      const width = 520
      return createElement({
        id,
        type: "text",
        x,
        y,
        width,
        height: estimatedHeight(content, width, 15),
        content,
        style: { fontSize: 15, fontWeight: 400, color: "#1f2937" },
      })
    }
    case "quiz":
      return textElement(id, x, y, quizBlockText(block), { fontSize: 16, fontWeight: 400, color: "#1f2937" }, 520)
    case "slideOutline":
      return textElement(id, x, y, slideOutlineText(block), { fontSize: 16, fontWeight: 400, color: "#1f2937" }, 480)
    case "image": {
      // Re-checked here, not only in the parser: this is the last gate before a
      // URL becomes an element that can be stored and served to somebody else.
      if (!isSafeUrl(block.url)) return null
      return createElement({
        id,
        type: "image",
        x,
        y,
        width: 320,
        height: 220,
        content: block.url,
        style: { backgroundColor: "#f1f5f9", borderRadius: 16, label: block.alt || "Image", ...(block.alt ? { name: block.alt } : {}) },
      })
    }
    case "divider":
      return createElement({
        id,
        type: "shape",
        x,
        y,
        width: 360,
        height: 4,
        content: "",
        style: { backgroundColor: "#cbd5e1", borderRadius: 2, name: "Divider" },
      })
    default:
      return null
  }
}

function textElement(
  id: string,
  x: number,
  y: number,
  content: string,
  style: Record<string, unknown>,
  width = 460,
): CanvasElement {
  const fontSize = typeof style.fontSize === "number" ? style.fontSize : 18
  return createElement({ id, type: "text", x, y, width, height: estimatedHeight(content, width, fontSize), content, style })
}
