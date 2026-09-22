/**
 * `format-response` — normalize *any* AI reply into themed, structured blocks.
 *
 * The product requirement is literal: a model answer can come back as markdown,
 * as a JSON object, as JSON inside a code fence, as a quiz payload, as a slide
 * outline, as a pipe table, or as a wall of plain text — and every one of those
 * has to render inside the visual theme instead of as raw unstyled text.
 *
 * This module owns the pure half of that: reply string in, `ThemedBlock[]` out.
 * It is deliberately dependency-free (no imports at all), DOM-free, React-free,
 * and free of randomness and clock reads, so the same reply always produces
 * identical blocks and the module can be unit-tested in plain Node.
 *
 * The reply is untrusted model output that ends up in the DOM, so sanitization
 * is part of the contract, not an afterthought:
 *   - raw HTML tags are stripped (a `<script>` in the reply becomes inert text),
 *   - only `http:`, `https:` and raster `data:image/*` URLs survive; everything
 *     else (`javascript:`, `data:text/html`, `file:`, protocol-relative, ...) is
 *     dropped with a warning,
 *   - every collection and string is capped, so a hostile reply cannot produce
 *     unbounded output.
 *
 * A malformed JSON candidate never throws: it falls back to markdown/text and
 * records a warning.
 */

// ---------------------------------------------------------------------------
// Limits — capped with a warning rather than unbounded output
// ---------------------------------------------------------------------------

const MAX_BLOCKS = 400
const MAX_TEXT_LENGTH = 12000
const MAX_CODE_LENGTH = 24000
const MAX_LIST_ITEMS = 250
const MAX_TABLE_ROWS = 200
const MAX_TABLE_COLUMNS = 24
const MAX_TABLE_CELLS = 2400
const MAX_QUIZ_QUESTIONS = 60
const MAX_QUIZ_CHOICES = 12
const MAX_SLIDES = 60
const MAX_SLIDE_BULLETS = 20
const MAX_WARNINGS = 40
const MAX_JSON_DEPTH = 4
const MAX_INLINE_TARGETS = 200

// ---------------------------------------------------------------------------
// Block union
// ---------------------------------------------------------------------------

export type ThemedHeadingLevel = 1 | 2 | 3 | 4
export type ThemedTableAlign = "left" | "center" | "right"
export type ThemedCalloutTone = "info" | "warn" | "success"

interface ThemedHeadingBlock {
  type: "heading"
  level: ThemedHeadingLevel
  text: string
}

interface ThemedParagraphBlock {
  type: "paragraph"
  text: string
}

interface ThemedListBlock {
  type: "list"
  ordered: boolean
  items: string[]
}

interface ThemedTableBlock {
  type: "table"
  headers: string[]
  rows: string[][]
  align?: ThemedTableAlign[]
}

interface ThemedCodeBlock {
  type: "code"
  language: string
  code: string
}

interface ThemedQuoteBlock {
  type: "quote"
  text: string
}

interface ThemedDividerBlock {
  type: "divider"
}

interface ThemedImageBlock {
  type: "image"
  url: string
  alt: string
}

interface ThemedCalloutBlock {
  type: "callout"
  tone: ThemedCalloutTone
  text: string
}

/**
 * One answer option of a parsed quiz.
 *
 * Exported because the React quiz types in `src/components/learn/types.ts`
 * describe the same option and must not declare a second copy: `components` may
 * import from `lib`, never the reverse, so the single declaration lives here.
 */
export interface QuizChoice {
  id: string
  text: string
}

export interface QuizQuestion {
  question: string
  choices: QuizChoice[]
  answerId?: string
  explanation?: string
}

interface ThemedQuizBlock {
  type: "quiz"
  title: string
  questions: QuizQuestion[]
}

export interface ThemedSlide {
  title: string
  bullets: string[]
}

interface ThemedSlideOutlineBlock {
  type: "slideOutline"
  title: string
  slides: ThemedSlide[]
}

export type ThemedBlock =
  | ThemedHeadingBlock
  | ThemedParagraphBlock
  | ThemedListBlock
  | ThemedTableBlock
  | ThemedCodeBlock
  | ThemedQuoteBlock
  | ThemedDividerBlock
  | ThemedImageBlock
  | ThemedCalloutBlock
  | ThemedQuizBlock
  | ThemedSlideOutlineBlock

export type ResponseSourceFormat = "json" | "markdown" | "text"

export interface FormatAiResponseInput {
  reply: string
  /**
   * Accepted for callers that thread a clock through their pipeline. The
   * normalizer never stamps a date into a block, so output stays deterministic.
   */
  now?: Date
}

interface FormatAiResponseResult {
  blocks: ThemedBlock[]
  warnings: string[]
  sourceFormat: ResponseSourceFormat
  shapes: string[]
}

// ---------------------------------------------------------------------------
// Warnings — deduped and capped so a noisy reply cannot flood the panel
// ---------------------------------------------------------------------------

interface WarningLog {
  add(message: string): void
  list(): string[]
}

function createWarningLog(): WarningLog {
  const messages: string[] = []
  return {
    add(message: string) {
      if (!message || messages.length >= MAX_WARNINGS) return
      if (!messages.includes(message)) messages.push(message)
    },
    list() {
      return messages
    },
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Normalize one AI reply.
 *
 * Detection order is deterministic:
 *   1. the whole reply is JSON,
 *   2. the whole reply is a single ```json fence,
 *   3. otherwise markdown / plain text.
 */
export function formatAiResponse(input: FormatAiResponseInput): FormatAiResponseResult {
  const log = createWarningLog()
  const reply = input && typeof input.reply === "string" ? input.reply : ""
  const trimmed = reply.trim()

  if (!trimmed) {
    return { blocks: [], warnings: [], sourceFormat: "text", shapes: [] }
  }

  // A JSON candidate that failed to parse still falls back to markdown, and the
  // source format says so even when the fallback reads as plain prose.
  let jsonFallback = false

  // 1. Whole reply is JSON.
  if (looksLikeJson(trimmed)) {
    const whole = tryParseJson(trimmed)
    if (whole.ok) {
      return fromJson(whole.value, log)
    }
    log.add("Reply looked like JSON but could not be parsed; rendered as markdown instead.")
    jsonFallback = true
  }

  // 2. Whole reply is a single ```json fence.
  const fence = matchWholeJsonFence(trimmed)
  if (fence !== null) {
    const parsed = tryParseJson(fence)
    if (parsed.ok) {
      return fromJson(parsed.value, log)
    }
    log.add("JSON code fence could not be parsed; rendered as markdown instead.")
    jsonFallback = true
  }

  // 3. Markdown / plain text.
  const blocks = capBlocks(parseMarkdown(trimmed, log), log)
  const sourceFormat: ResponseSourceFormat = jsonFallback || blocks.some((block) => block.type !== "paragraph")
    ? "markdown"
    : "text"
  return { blocks, warnings: log.list(), sourceFormat, shapes: shapesOf(blocks) }
}

function fromJson(value: unknown, log: WarningLog): FormatAiResponseResult {
  const blocks = capBlocks(blocksFromJson(value, log, 0), log)
  return { blocks, warnings: log.list(), sourceFormat: "json", shapes: shapesOf(blocks) }
}

/** Distinct block types, in order of first appearance. */
function shapesOf(blocks: ThemedBlock[]): string[] {
  const shapes: string[] = []
  for (const block of blocks) {
    if (!shapes.includes(block.type)) shapes.push(block.type)
  }
  return shapes
}

// ---------------------------------------------------------------------------
// JSON detection
// ---------------------------------------------------------------------------

function looksLikeJson(value: string): boolean {
  return value.startsWith("{") || value.startsWith("[")
}

function tryParseJson(value: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(value) }
  } catch {
    return { ok: false }
  }
}

/** Returns the fenced body only when the whole reply is one ```json fence. */
function matchWholeJsonFence(value: string): string | null {
  const match = /^```[ \t]*(?:json|JSON)[ \t]*\r?\n([\s\S]*?)\r?\n?```$/.exec(value)
  return match ? match[1] : null
}

// ---------------------------------------------------------------------------
// JSON shapes — detected by structure, never by a required key
// ---------------------------------------------------------------------------

function blocksFromJson(value: unknown, log: WarningLog, depth: number): ThemedBlock[] {
  if (depth > MAX_JSON_DEPTH) {
    log.add("Reply JSON nested too deeply; rendered as code.")
    return [codeBlockFromJson(value, log)]
  }

  if (Array.isArray(value)) {
    const blocks: ThemedBlock[] = []
    for (const item of value) blocks.push(...jsonValueToBlocks(item, log, depth + 1))
    return blocks.length ? blocks : [codeBlockFromJson(value, log)]
  }

  if (isRecord(value)) return jsonObjectToBlocks(value, log, depth)

  if (typeof value === "string") {
    const text = sanitizeInline(value, log)
    return text.trim() ? [{ type: "paragraph", text: text.trim() }] : []
  }

  return [codeBlockFromJson(value, log)]
}

function jsonObjectToBlocks(value: Record<string, unknown>, log: WarningLog, depth: number): ThemedBlock[] {
  // `{ blocks: [...] }` maps element-wise.
  if (Array.isArray(value.blocks)) {
    const blocks: ThemedBlock[] = []
    for (const item of value.blocks) blocks.push(...jsonValueToBlocks(item, log, depth + 1))
    if (blocks.length) return blocks
  }

  if (Array.isArray(value.questions) && value.questions.length) {
    const quiz = jsonQuizBlock(value, log)
    if (quiz) return [quiz]
  }

  if (Array.isArray(value.slides) && value.slides.length) {
    const outline = jsonSlideOutlineBlock(value, log)
    if (outline) return [outline]
  }

  if (Array.isArray(value.headers) || Array.isArray(value.columns)) {
    return [jsonTableBlock(value, log)]
  }

  if (typeof value.type === "string") {
    const typed = typedJsonBlock(value, log, depth)
    if (typed) return [typed]
  }

  return [codeBlockFromJson(value, log)]
}

function jsonValueToBlocks(value: unknown, log: WarningLog, depth: number): ThemedBlock[] {
  if (depth > MAX_JSON_DEPTH) {
    log.add("Reply JSON nested too deeply; rendered as code.")
    return [codeBlockFromJson(value, log)]
  }

  if (typeof value === "string") {
    // A bare string inside a JSON array/`blocks` list is content: parse it as
    // markdown so `"# Title"` still lands as a heading.
    return capBlocks(parseMarkdown(value, log), log)
  }

  if (isRecord(value)) {
    if (typeof value.type === "string") {
      const typed = typedJsonBlock(value, log, depth)
      if (typed) return [typed]
      return [codeBlockFromJson(value, log)]
    }
    return jsonObjectToBlocks(value, log, depth)
  }

  if (value === null || value === undefined) return []
  return [{ type: "paragraph", text: String(value) }]
}

function typedJsonBlock(value: Record<string, unknown>, log: WarningLog, depth: number): ThemedBlock | null {
  const type = readString(value, "type").toLowerCase()
  switch (type) {
    case "heading":
    case "title":
      return headingBlock(levelFromJson(value.level), readFirstString(value, ["text", "title", "heading", "content"]), log)
    case "paragraph":
    case "text":
    case "body":
      return textBlock(readFirstString(value, ["text", "content", "body", "value"]), log)
    case "list":
    case "bullets":
    case "ul":
    case "ol": {
      const items = readStringList(value.items ?? value.bullets ?? value.values ?? value.rows, log)
      if (!items.length) return null
      const ordered = typeof value.ordered === "boolean" ? value.ordered : type === "ol"
      return { type: "list", ordered, items }
    }
    case "table":
      return jsonTableBlock(value, log)
    case "code":
    case "pre":
      return {
        type: "code",
        language: normalizeLanguage(readFirstString(value, ["language", "lang"])),
        code: readFirstString(value, ["code", "text", "content"]),
      }
    case "quote":
    case "blockquote":
      return textBlock(readFirstString(value, ["text", "quote", "content"]), log, true)
    case "callout":
    case "note":
    case "warning":
      return {
        type: "callout",
        tone: normalizeTone(readFirstString(value, ["tone", "variant", "level"]), type),
        text: sanitizeInline(readFirstString(value, ["text", "message", "content"]), log),
      }
    case "divider":
    case "hr":
    case "separator":
      return { type: "divider" }
    case "image":
    case "img": {
      const raw = readFirstString(value, ["url", "src", "href"])
      const alt = sanitizeInline(readFirstString(value, ["alt", "title", "caption"]), log)
      if (!isSafeUrl(raw)) {
        log.add(unsafeUrlWarning)
        return alt ? { type: "paragraph", text: alt } : null
      }
      return { type: "image", url: raw.trim(), alt }
    }
    case "quiz":
    case "questions": {
      const quiz = jsonQuizBlock(value, log)
      if (quiz) return quiz
      break
    }
    case "slides":
    case "slideoutline":
    case "deck":
    case "outline": {
      const outline = jsonSlideOutlineBlock(value, log)
      if (outline) return outline
      break
    }
    default:
      break
  }

  // Unknown `type`: fall back to structural detection before giving up.
  if (Array.isArray(value.questions) || Array.isArray(value.slides) || Array.isArray(value.headers) || Array.isArray(value.blocks)) {
    const nested = jsonObjectToBlocks(value, log, depth + 1)
    if (nested.length && !(nested.length === 1 && nested[0].type === "code")) return nested[0]
  }
  return null
}

function jsonQuizBlock(value: Record<string, unknown>, log: WarningLog): ThemedQuizBlock | null {
  const rawQuestions = asArray(value.questions)
  const questions: QuizQuestion[] = []
  let choicesCapped = false
  let questionsCapped = false

  for (const raw of rawQuestions) {
    if (questions.length >= MAX_QUIZ_QUESTIONS) {
      questionsCapped = true
      break
    }
    if (!isRecord(raw)) continue

    const question = sanitizeInline(readFirstString(raw, ["question", "prompt", "text", "title"]), log).trim()
    if (!question) continue

    const rawChoices = asArray(raw.choices ?? raw.options ?? raw.answers)
    const choices: QuizChoice[] = []
    for (const rawChoice of rawChoices) {
      if (choices.length >= MAX_QUIZ_CHOICES) {
        choicesCapped = true
        break
      }
      const choice = normalizeChoice(rawChoice, choices.length, log)
      if (choice) choices.push(choice)
    }

    if (isRecord(raw.choices) && !choices.length) {
      let index = 0
      for (const [key, choiceText] of Object.entries(raw.choices as Record<string, unknown>)) {
        if (choices.length >= MAX_QUIZ_CHOICES) {
          choicesCapped = true
          break
        }
        const text = sanitizeInline(String(choiceText ?? ""), log).trim()
        if (!text) continue
        choices.push({ id: sanitizeInline(key, log).trim() || choiceIdAt(index), text })
        index += 1
      }
    }

    const explanation = sanitizeInline(readFirstString(raw, ["explanation", "rationale", "why"]), log).trim()
    const answerId = resolveAnswerId(raw, choices, log)
    questions.push({
      question,
      choices,
      ...(answerId ? { answerId } : {}),
      ...(explanation ? { explanation } : {}),
    })
  }

  if (!questions.length) return null
  if (questionsCapped) log.add(`Quiz truncated to ${MAX_QUIZ_QUESTIONS} questions.`)
  if (choicesCapped) log.add(`Quiz choices truncated to ${MAX_QUIZ_CHOICES} per question.`)
  return { type: "quiz", title: sanitizeInline(readFirstString(value, ["title", "name"]), log).trim(), questions }
}

function jsonSlideOutlineBlock(value: Record<string, unknown>, log: WarningLog): ThemedSlideOutlineBlock | null {
  const rawSlides = asArray(value.slides)
  const slides: ThemedSlide[] = []
  let capped = false

  for (const raw of rawSlides) {
    if (slides.length >= MAX_SLIDES) {
      capped = true
      break
    }
    if (isRecord(raw)) {
      const bullets = readStringList(raw.bullets ?? raw.points ?? raw.content ?? raw.body, log)
      slides.push({
        title: sanitizeInline(readFirstString(raw, ["title", "heading", "name"]) || `Slide ${slides.length + 1}`, log).trim(),
        bullets,
      })
      continue
    }
    const text = sanitizeInline(String(raw ?? ""), log).trim()
    if (text) slides.push({ title: text, bullets: [] })
  }

  if (!slides.length) return null
  if (capped) log.add(`Slide outline truncated to ${MAX_SLIDES} slides.`)
  return { type: "slideOutline", title: sanitizeInline(readFirstString(value, ["title", "name"]), log).trim(), slides }
}

function jsonTableBlock(value: Record<string, unknown>, log: WarningLog): ThemedTableBlock {
  const headers = asArray(value.headers ?? value.columns).map((cell) => tableCell(cell, log))
  const rows = asArray(value.rows).map((row) => {
    if (Array.isArray(row)) return row.map((cell) => tableCell(cell, log))
    if (isRecord(row)) return headers.map((header) => tableCell((row as Record<string, unknown>)[header], log))
    return [tableCell(row, log)]
  })
  return { type: "table", headers, rows }
}

function codeBlockFromJson(value: unknown, log: WarningLog): ThemedCodeBlock {
  let code: string
  try {
    code = JSON.stringify(value, null, 2) ?? String(value)
  } catch {
    code = String(value)
    log.add("Reply JSON could not be re-serialized; rendered as text.")
  }
  return { type: "code", language: "json", code }
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

function parseMarkdown(source: string, log: WarningLog): ThemedBlock[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n")
  const blocks: ThemedBlock[] = []
  let paragraph: string[] = []
  let index = 0

  const flush = () => {
    if (!paragraph.length) return
    const text = sanitizeInline(paragraph.join("\n"), log).replace(/\s+$/, "")
    paragraph = []
    if (text.trim()) blocks.push({ type: "paragraph", text })
  }

  while (index < lines.length) {
    const line = lines[index]

    if (!line.trim()) {
      flush()
      index += 1
      continue
    }

    const fence = /^\s{0,3}```+\s*([^\s`]*)/.exec(line)
    if (fence) {
      flush()
      const language = normalizeLanguage(fence[1])
      const body: string[] = []
      let closed = false
      index += 1
      while (index < lines.length) {
        if (/^\s{0,3}```+\s*$/.test(lines[index])) {
          closed = true
          index += 1
          break
        }
        body.push(lines[index])
        index += 1
      }
      if (!closed) log.add("Unterminated code fence; closed at the end of the reply.")
      const code = trimBlankEdges(body.join("\n"))

      if (language === "json" && code) {
        const parsed = tryParseJson(code)
        if (parsed.ok) {
          blocks.push(...blocksFromJson(parsed.value, log, 0))
          continue
        }
        log.add("JSON code fence could not be parsed; rendered as code.")
      }

      blocks.push({ type: "code", language, code })
      continue
    }

    const heading = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line)
    if (heading) {
      flush()
      blocks.push(headingBlock(heading[1].length, heading[2], log))
      index += 1
      continue
    }

    if (/^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flush()
      blocks.push({ type: "divider" })
      index += 1
      continue
    }

    if (/^\s{0,3}>\s?/.test(line)) {
      flush()
      const quoted: string[] = []
      while (index < lines.length && /^\s{0,3}>\s?/.test(lines[index])) {
        quoted.push(lines[index].replace(/^\s{0,3}>\s?/, ""))
        index += 1
      }
      const text = sanitizeInline(quoted.join("\n"), log).replace(/\s+$/, "")
      if (text.trim()) blocks.push({ type: "quote", text })
      continue
    }

    if (line.includes("|") && index + 1 < lines.length && isTableDelimiterRow(lines[index + 1])) {
      flush()
      const headers = splitTableRow(line).map((cell) => sanitizeInline(cell, log))
      const align = alignmentsOf(lines[index + 1])
      index += 2
      const rows: string[][] = []
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        rows.push(splitTableRow(lines[index]).map((cell) => sanitizeInline(cell, log)))
        index += 1
      }
      blocks.push(align ? { type: "table", headers, rows, align } : { type: "table", headers, rows })
      continue
    }

    const unordered = /^\s{0,3}[-*+]\s+(.*)$/.exec(line)
    const ordered = /^\s{0,3}\d{1,9}[.)]\s+(.*)$/.exec(line)
    if (unordered || ordered) {
      flush()
      const isOrdered = Boolean(ordered)
      const items: string[] = []
      while (index < lines.length) {
        const next = isOrdered
          ? /^\s{0,3}\d{1,9}[.)]\s+(.*)$/.exec(lines[index])
          : /^\s{0,3}[-*+]\s+(.*)$/.exec(lines[index])
        if (!next) break
        const item = sanitizeInline(next[1], log).trim()
        if (item) items.push(item)
        index += 1
      }
      if (items.length) blocks.push({ type: "list", ordered: isOrdered, items })
      continue
    }

    const image = /^\s{0,3}!\[([^\]]*)\]\(\s*([^\s)]*)(?:\s+"[^"]*")?\s*\)\s*$/.exec(line)
    if (image) {
      flush()
      const alt = sanitizeInline(image[1], log).trim()
      const url = image[2].trim()
      if (isSafeUrl(url)) {
        blocks.push({ type: "image", url, alt })
      } else {
        log.add(unsafeUrlWarning)
        if (alt) blocks.push({ type: "paragraph", text: alt })
      }
      index += 1
      continue
    }

    paragraph.push(line)
    index += 1
  }

  flush()
  return blocks
}

function headingBlock(level: number, rawText: string, log: WarningLog): ThemedHeadingBlock {
  const clamped = Math.min(4, Math.max(1, Math.floor(level))) as ThemedHeadingLevel
  return { type: "heading", level: clamped, text: sanitizeInline(rawText, log).trim() }
}

function textBlock(rawText: string, log: WarningLog, quote = false): ThemedBlock | null {
  const text = sanitizeInline(rawText, log).replace(/\s+$/, "")
  if (!text.trim()) return null
  return quote ? { type: "quote", text } : { type: "paragraph", text }
}

function isTableDelimiterRow(line: string): boolean {
  if (!line.includes("|")) return false
  return /^\s*\|?\s*:?-{1,}:?\s*(?:\|\s*:?-{1,}:?\s*)*\|?\s*$/.test(line)
}

function splitTableRow(line: string): string[] {
  let value = line.trim()
  if (value.startsWith("|")) value = value.slice(1)
  if (value.endsWith("|")) value = value.slice(0, -1)
  return value.split("|").map((cell) => cell.trim())
}

/** Alignment is only reported when the delimiter row actually asks for it. */
function alignmentsOf(delimiter: string): ThemedTableAlign[] | null {
  const cells = splitTableRow(delimiter)
  if (!cells.some((cell) => cell.includes(":"))) return null
  return cells.map<ThemedTableAlign>((cell) => {
    const left = cell.startsWith(":")
    const right = cell.endsWith(":")
    if (left && right) return "center"
    if (right) return "right"
    return "left"
  })
}

function trimBlankEdges(value: string): string {
  const lines = value.split("\n")
  while (lines.length && !lines[0].trim()) lines.shift()
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop()
  return lines.join("\n")
}

function normalizeLanguage(value: string): string {
  const language = String(value || "").trim().toLowerCase().replace(/[^a-z0-9+#.-]/g, "")
  return language.slice(0, 24)
}

// ---------------------------------------------------------------------------
// Sanitization — untrusted model text headed for the DOM
// ---------------------------------------------------------------------------

const unsafeUrlWarning = "Rejected unsafe URL: only http, https, and data:image/* are allowed."

/**
 * `http:`, `https:` and raster `data:image/*` only.
 *
 * The allowlist is applied to a whitespace-stripped copy, so `java\nscript:`
 * cannot sneak a scheme past the check, and anything without an allowed scheme
 * (relative, protocol-relative, `file:`, `blob:`, `data:text/html`, ...) is
 * rejected by default. SVG data URLs are refused because that subtype can carry
 * script.
 */
export function isSafeUrl(raw: string): boolean {
  if (typeof raw !== "string") return false
  const value = raw.trim().replace(/[\u0000-\u0020\u007f]/g, "")
  if (!value) return false
  if (/^https?:\/\//i.test(value)) return true
  const data = /^data:image\/([a-z0-9.+-]+)/i.exec(value)
  if (!data) return false
  const subtype = data[1].toLowerCase()
  return subtype !== "svg+xml" && !subtype.includes("svg")
}

const htmlTagPattern = /<\/?[A-Za-z](?:[^<>"']|"[^"]*"|'[^']*')*>/g

/**
 * Strip raw HTML, then validate markdown link/image targets.
 *
 * Tags are removed but their inner text is kept, so `<script>alert(1)</script>`
 * degrades to the inert text `alert(1)` — never markup, never a live handler.
 */
function sanitizeInline(raw: string, log: WarningLog): string {
  const text = typeof raw === "string" ? raw : String(raw ?? "")
  if (!text) return ""

  let value = text
  if (/[<>]/.test(value)) {
    for (let pass = 0; pass < 4; pass += 1) {
      const next = value
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(htmlTagPattern, "")
        .replace(/<[A-Za-z][^<>]*$/, "")
      if (next === value) break
      value = next
    }
    if (value !== text) log.add("Removed raw HTML from the reply text.")
  }

  return sanitizeInlineTargets(value, log)
}

const inlineTargetPattern = /(!?)\[([^\]]*)\]\(\s*([^\s)]*)(?:\s+"[^"]*")?\s*\)/g

function sanitizeInlineTargets(value: string, log: WarningLog): string {
  let count = 0
  return value.replace(inlineTargetPattern, (match, bang: string, label: string, url: string) => {
    count += 1
    if (count > MAX_INLINE_TARGETS) return label
    if (isSafeUrl(url)) return `${bang}[${label}](${url.trim()})`
    log.add(unsafeUrlWarning)
    // The label survives, the target does not: an image degrades to its alt text.
    return label
  })
}

// ---------------------------------------------------------------------------
// Caps
// ---------------------------------------------------------------------------

function capBlocks(blocks: ThemedBlock[], log: WarningLog): ThemedBlock[] {
  const capped: ThemedBlock[] = []
  for (const block of blocks) {
    if (capped.length >= MAX_BLOCKS) {
      log.add(`Reply truncated at ${MAX_BLOCKS} blocks.`)
      break
    }
    capped.push(capBlock(block, log))
  }
  return capped
}

function capBlock(block: ThemedBlock, log: WarningLog): ThemedBlock {
  switch (block.type) {
    case "heading":
      return { ...block, text: capText(block.text, log) }
    case "paragraph":
    case "quote":
      return { ...block, text: capText(block.text, log) }
    case "callout":
      return { ...block, text: capText(block.text, log) }
    case "list": {
      let items = block.items
      if (items.length > MAX_LIST_ITEMS) {
        log.add(`List truncated to ${MAX_LIST_ITEMS} items.`)
        items = items.slice(0, MAX_LIST_ITEMS)
      }
      return { ...block, items: items.map((item) => capText(item, log)) }
    }
    case "table":
      return capTable(block, log)
    case "code": {
      let code = block.code
      if (code.length > MAX_CODE_LENGTH) {
        log.add(`Code block truncated at ${MAX_CODE_LENGTH} characters.`)
        code = code.slice(0, MAX_CODE_LENGTH)
      }
      return { ...block, language: normalizeLanguage(block.language), code }
    }
    case "image":
      if (!isSafeUrl(block.url)) {
        log.add(unsafeUrlWarning)
        return { type: "paragraph", text: capText(block.alt, log) }
      }
      return { ...block, alt: capText(block.alt, log) }
    case "divider":
      return block
    case "quiz": {
      let questions = block.questions
      if (questions.length > MAX_QUIZ_QUESTIONS) {
        log.add(`Quiz truncated to ${MAX_QUIZ_QUESTIONS} questions.`)
        questions = questions.slice(0, MAX_QUIZ_QUESTIONS)
      }
      return {
        ...block,
        title: capText(block.title, log),
        questions: questions.map((question) => ({
          question: capText(question.question, log),
          choices: question.choices.slice(0, MAX_QUIZ_CHOICES).map((choice) => ({
            id: capText(choice.id, log),
            text: capText(choice.text, log),
          })),
          ...(question.answerId ? { answerId: capText(question.answerId, log) } : {}),
          ...(question.explanation ? { explanation: capText(question.explanation, log) } : {}),
        })),
      }
    }
    case "slideOutline": {
      let slides = block.slides
      if (slides.length > MAX_SLIDES) {
        log.add(`Slide outline truncated to ${MAX_SLIDES} slides.`)
        slides = slides.slice(0, MAX_SLIDES)
      }
      return {
        ...block,
        title: capText(block.title, log),
        slides: slides.map((slide) => ({
          title: capText(slide.title, log),
          bullets: slide.bullets.slice(0, MAX_SLIDE_BULLETS).map((bullet) => capText(bullet, log)),
        })),
      }
    }
    default:
      return block
  }
}

function capTable(block: ThemedTableBlock, log: WarningLog): ThemedTableBlock {
  let headers = block.headers
  if (headers.length > MAX_TABLE_COLUMNS) {
    log.add(`Table truncated to ${MAX_TABLE_COLUMNS} columns.`)
    headers = headers.slice(0, MAX_TABLE_COLUMNS)
  }

  let rows = block.rows
  if (rows.length > MAX_TABLE_ROWS) {
    log.add(`Table truncated to ${MAX_TABLE_ROWS} rows.`)
    rows = rows.slice(0, MAX_TABLE_ROWS)
  }

  const width = headers.length
  if (width && (rows.length + 1) * width > MAX_TABLE_CELLS) {
    const allowedRows = Math.max(1, Math.floor(MAX_TABLE_CELLS / width) - 1)
    if (allowedRows < rows.length) {
      log.add(`Table truncated at ${MAX_TABLE_CELLS} cells.`)
      rows = rows.slice(0, allowedRows)
    }
  }

  const cappedRows = rows.map((row) => {
    const cells = row.slice(0, width || row.length).map((cell) => capText(cell, log))
    while (width && cells.length < width) cells.push("")
    return cells
  })

  const align = block.align && width ? block.align.slice(0, width) : block.align
  return align
    ? { type: "table", headers: headers.map((header) => capText(header, log)), rows: cappedRows, align }
    : { type: "table", headers: headers.map((header) => capText(header, log)), rows: cappedRows }
}

function capText(value: string, log: WarningLog): string {
  const text = typeof value === "string" ? value : String(value ?? "")
  if (text.length <= MAX_TEXT_LENGTH) return text
  log.add(`Text truncated at ${MAX_TEXT_LENGTH} characters.`)
  return text.slice(0, MAX_TEXT_LENGTH)
}

// ---------------------------------------------------------------------------
// Plain text
// ---------------------------------------------------------------------------

/** Flatten blocks back into readable text (round-trips through markdown). */
export function blocksToPlainText(blocks: ThemedBlock[]): string {
  const parts: string[] = []
  for (const block of blocks) {
    switch (block.type) {
      case "heading":
        parts.push(`${"#".repeat(block.level)} ${block.text}`)
        break
      case "paragraph":
        parts.push(block.text)
        break
      case "list":
        parts.push(block.items.map((item, index) => (block.ordered ? `${index + 1}. ${item}` : `- ${item}`)).join("\n"))
        break
      case "table": {
        const table = [
          `| ${block.headers.join(" | ")} |`,
          `| ${block.headers.map((_, index) => alignMarker(block.align?.[index])).join(" | ")} |`,
          ...block.rows.map((row) => `| ${row.join(" | ")} |`),
        ]
        parts.push(table.join("\n"))
        break
      }
      case "code":
        parts.push(`\`\`\`${block.language}\n${block.code}\n\`\`\``)
        break
      case "quote":
        parts.push(block.text.split("\n").map((line) => `> ${line}`).join("\n"))
        break
      case "divider":
        parts.push("---")
        break
      case "image":
        parts.push(`![${block.alt}](${block.url})`)
        break
      case "callout":
        parts.push(`[${block.tone.toUpperCase()}] ${block.text}`)
        break
      case "quiz": {
        const lines = [`Quiz: ${block.title || "Untitled"}`]
        block.questions.forEach((question, index) => {
          lines.push(`${index + 1}. ${question.question}`)
          question.choices.forEach((choice) => lines.push(`   - ${choice.id}. ${choice.text}`))
          if (question.answerId) lines.push(`   Answer: ${question.answerId}`)
          if (question.explanation) lines.push(`   Explanation: ${question.explanation}`)
        })
        parts.push(lines.join("\n"))
        break
      }
      case "slideOutline": {
        const lines = [block.title || "Slide outline"]
        block.slides.forEach((slide, index) => {
          lines.push(`Slide ${index + 1}: ${slide.title}`)
          slide.bullets.forEach((bullet) => lines.push(`- ${bullet}`))
        })
        parts.push(lines.join("\n"))
        break
      }
      default:
        break
    }
  }
  return parts.filter((part) => part.trim()).join("\n\n")
}

function alignMarker(align: ThemedTableAlign | undefined): string {
  if (align === "center") return ":---:"
  if (align === "right") return "---:"
  return "---"
}

// ---------------------------------------------------------------------------
// Themed HTML
// ---------------------------------------------------------------------------

/**
 * Serialize blocks as themed HTML using app class names only.
 *
 * Every text value is escaped and no script, style attribute, event handler or
 * iframe is ever emitted — the markup is a themed skeleton, nothing more. The
 * React renderer does not use this string; it exists for export/clipboard paths
 * that need themed markup without a DOM.
 */
export function blocksToThemedHtml(blocks: ThemedBlock[]): string {
  return blocks.map((block, index) => themedBlockHtml(block, index)).join("\n")
}

function themedBlockHtml(block: ThemedBlock, index: number): string {
  const open = `<div class="learn-block learn-block--${block.type}" data-block-type="${escapeHtml(block.type)}" data-block-index="${index}">`
  const close = "</div>"
  const alignClass = (align: ThemedTableAlign | undefined) => (align && align !== "left" ? ` learn-block__cell--${align}` : "")

  switch (block.type) {
    case "heading":
      return `${open}<h${block.level} class="learn-block__heading learn-block__heading--${block.level}">${escapeHtml(block.text)}</h${block.level}>${close}`
    case "paragraph":
      return `${open}<p class="learn-block__paragraph">${escapeHtml(block.text)}</p>${close}`
    case "list": {
      const tag = block.ordered ? "ol" : "ul"
      const items = block.items.map((item) => `<li class="learn-block__item">${escapeHtml(item)}</li>`).join("")
      return `${open}<${tag} class="learn-block__list">${items}</${tag}>${close}`
    }
    case "table": {
      const head = block.headers
        .map((header, column) => `<th class="learn-block__cell${alignClass(block.align?.[column])}" scope="col">${escapeHtml(header)}</th>`)
        .join("")
      const body = block.rows
        .map((row) => `<tr>${row.map((cell, column) => `<td class="learn-block__cell${alignClass(block.align?.[column])}">${escapeHtml(cell)}</td>`).join("")}</tr>`)
        .join("")
      return `${open}<div class="learn-block__table-scroll"><table class="learn-block__table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>${close}`
    }
    case "code":
      return `${open}<div class="learn-block__code-scroll"><pre class="learn-block__code"><code class="learn-block__code-body" data-language="${escapeHtml(block.language)}">${escapeHtml(block.code)}</code></pre></div>${close}`
    case "quote":
      return `${open}<blockquote class="learn-block__quote">${escapeHtml(block.text)}</blockquote>${close}`
    case "divider":
      return `${open}<hr class="learn-block__divider" />${close}`
    case "image":
      if (!isSafeUrl(block.url)) return `${open}<p class="learn-block__paragraph">${escapeHtml(block.alt)}</p>${close}`
      return `${open}<img class="learn-block__image" src="${escapeHtml(block.url)}" alt="${escapeHtml(block.alt)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" />${close}`
    case "callout":
      return `${open}<div class="learn-block__callout learn-block__callout--${block.tone}" role="note">${escapeHtml(block.text)}</div>${close}`
    case "quiz": {
      const questions = block.questions
        .map((question) => {
          const choices = question.choices
            .map((choice) => {
              const correct = question.answerId && question.answerId === choice.id
              return `<li class="learn-block__choice" data-choice-id="${escapeHtml(choice.id)}" data-state="${correct ? "correct" : "idle"}">${escapeHtml(`${choice.id}. ${choice.text}`)}</li>`
            })
            .join("")
          const answer = question.answerId ? `<p class="learn-block__answer">Answer: ${escapeHtml(question.answerId)}</p>` : ""
          const explanation = question.explanation ? `<p class="learn-block__explanation">${escapeHtml(question.explanation)}</p>` : ""
          return `<li class="learn-block__question"><p class="learn-block__question-text">${escapeHtml(question.question)}</p><ul class="learn-block__choices">${choices}</ul>${answer}${explanation}</li>`
        })
        .join("")
      return `${open}<p class="learn-block__quiz-title">${escapeHtml(block.title)}</p><ol class="learn-block__questions">${questions}</ol>${close}`
    }
    case "slideOutline": {
      const slides = block.slides
        .map((slide, slideIndex) => {
          const bullets = slide.bullets.map((bullet) => `<li class="learn-block__bullet">${escapeHtml(bullet)}</li>`).join("")
          return `<li class="learn-block__slide"><p class="learn-block__slide-title">${escapeHtml(`Slide ${slideIndex + 1}: ${slide.title}`)}</p><ul class="learn-block__bullets">${bullets}</ul></li>`
        })
        .join("")
      return `${open}<p class="learn-block__deck-title">${escapeHtml(block.title)}</p><ol class="learn-block__slides">${slides}</ol>${close}`
    }
    default:
      return open + close
  }
}

function escapeHtml(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

// ---------------------------------------------------------------------------
// Small readers
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (value === null || value === undefined) return []
  return [value]
}

function readString(value: Record<string, unknown>, key: string): string {
  const item = value[key]
  return typeof item === "string" ? item : ""
}

function readFirstString(value: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const item = value[key]
    if (typeof item === "string") return item
    if (typeof item === "number" && Number.isFinite(item)) return String(item)
  }
  return ""
}

function readStringList(value: unknown, log: WarningLog): string[] {
  const items: string[] = []
  // A single string is still a list: bullets arrive as newline-separated text.
  const raws = typeof value === "string" ? value.split(/\r?\n/) : asArray(value)
  for (const raw of raws) {
    const text = sanitizeInline(typeof raw === "string" ? raw : String(raw ?? ""), log)
      .replace(/^\s{0,3}(?:[-*+]|\d{1,9}[.)])\s+/, "")
      .trim()
    if (text) items.push(text)
  }
  return items.slice(0, MAX_LIST_ITEMS)
}

function tableCell(value: unknown, log: WarningLog): string {
  if (value === null || value === undefined) return ""
  if (isRecord(value) || Array.isArray(value)) return sanitizeInline(JSON.stringify(value), log)
  return sanitizeInline(String(value), log).trim()
}

function levelFromJson(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10)
    if (Number.isFinite(parsed)) return parsed
  }
  return 2
}

function normalizeTone(raw: string, fallback = ""): ThemedCalloutTone {
  const value = `${raw} ${fallback}`.toLowerCase()
  if (value.includes("warn") || value.includes("error") || value.includes("danger")) return "warn"
  if (value.includes("success") || value.includes("ok") || value.includes("done")) return "success"
  return "info"
}

function normalizeChoice(raw: unknown, index: number, log: WarningLog): QuizChoice | null {
  if (raw === null || raw === undefined) return null
  if (isRecord(raw)) {
    const text = sanitizeInline(readFirstString(raw, ["text", "label", "value", "choice", "answer"]), log).trim()
    if (!text) return null
    const id = sanitizeInline(readFirstString(raw, ["id", "key", "letter"]), log).trim() || choiceIdAt(index)
    return { id, text }
  }
  const text = sanitizeInline(String(raw), log).trim()
  if (!text) return null
  return { id: choiceIdAt(index), text }
}

function choiceIdAt(index: number): string {
  return String.fromCharCode(65 + (index % 26))
}

function resolveAnswerId(value: Record<string, unknown>, choices: QuizChoice[], log: WarningLog): string {
  const raw = value.answerId ?? value.answer_id ?? value.answer ?? value.correctAnswer ?? value.correct
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return choices[raw]?.id ?? ""
  }
  if (typeof raw !== "string") return ""

  const answer = sanitizeInline(raw, log).trim()
  if (!answer) return ""
  if (choices.some((choice) => choice.id === answer)) return answer

  const upper = answer.toUpperCase()
  if (/^[A-Z]$/.test(upper)) {
    const byIndex = choices[upper.charCodeAt(0) - 65]
    if (byIndex) return byIndex.id
  }

  const byText = choices.find((choice) => choice.text === answer)
  return byText ? byText.id : ""
}
