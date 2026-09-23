/**
 * The semantic design spec: what a page *says*, not where things go.
 *
 * AI (or the plain-text parser below) only ever produces this small JSON —
 * "a title, three bullets and an image" — and the deterministic layout engine
 * (`layout.ts`) turns it into positioned, themed elements. Keeping the model's
 * output this small is what makes generation cheap on a local model, and
 * keeping placement out of the model is what makes every result look designed
 * rather than scattered.
 *
 * Everything that arrives here is untrusted (model output, pasted text, stored
 * JSON), so `normalizeDesignSpec` rebuilds it field by field with hard caps.
 */

export type LayoutId =
  | "cover"
  | "section"
  | "bullets"
  | "split"
  | "compare"
  | "quote"
  | "stats"
  | "timeline"
  | "steps"
  | "question"
  | "definition"
  | "text"
  | "meme"
  | "closing"

export const LAYOUT_IDS: readonly LayoutId[] = ["cover", "section", "bullets", "split", "compare", "quote", "stats", "timeline", "steps", "question", "definition", "text", "meme", "closing"]

export type SemanticBlock =
  | { type: "title"; text: string; subtitle?: string; kicker?: string }
  | { type: "heading"; text: string }
  | { type: "text"; text: string }
  | { type: "bullets"; items: string[]; ordered?: boolean }
  | { type: "quote"; text: string; by?: string }
  | { type: "image"; src?: string; alt?: string; caption?: string }
  | { type: "stats"; items: Array<{ value: string; label: string }> }
  | { type: "timeline"; items: Array<{ label: string; text: string }> }
  | { type: "compare"; left: { title: string; items: string[] }; right: { title: string; items: string[] } }
  | { type: "steps"; items: Array<{ title: string; text?: string }> }
  | { type: "question"; question: string; choices?: string[]; answer?: number; explanation?: string }
  | { type: "definition"; term: string; text: string }
  | { type: "callout"; text: string; tone?: "tip" | "note" | "warning" }
  | { type: "meme"; top?: string; bottom?: string; src?: string }

export type SemanticBlockType = SemanticBlock["type"]

export interface PageSpec {
  layout?: LayoutId
  blocks: SemanticBlock[]
  /** Speaker notes (decks) — never drawn on the page. */
  notes?: string
}

export interface DesignSpec {
  title?: string
  theme?: string
  pages: PageSpec[]
}

// ---------------------------------------------------------------------------
// Normalisation (untrusted input -> safe spec)
// ---------------------------------------------------------------------------

export const SPEC_LIMITS = {
  pages: 40,
  blocksPerPage: 8,
  items: 8,
  shortText: 160,
  longText: 900,
  choices: 6,
} as const

function clean(value: unknown, max: number): string {
  if (typeof value !== "string" && typeof value !== "number") return ""
  return String(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max)
}

function cleanList(value: unknown, max: number = SPEC_LIMITS.items, length: number = SPEC_LIMITS.shortText): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => clean(typeof item === "object" && item ? (item as { text?: unknown }).text : item, length)).filter(Boolean).slice(0, max)
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

/** Only same-origin paths, data images and http(s) URLs; anything else is dropped. */
function cleanSrc(value: unknown): string | undefined {
  const src = clean(value, 2048)
  if (!src) return undefined
  if (/^\/(?!\/)[\w\-./?=&%]+$/.test(src)) return src
  if (/^data:image\/(?:png|jpe?g|gif|webp|avif);base64,[a-z0-9+/=]+$/i.test(src)) return src
  if (/^https?:\/\/[^\s"'<>]+$/i.test(src)) return src
  return undefined
}

export function normalizeBlock(input: unknown): SemanticBlock | null {
  const raw = record(input)
  const type = clean(raw.type, 20).toLowerCase()
  switch (type) {
    case "title": {
      const text = clean(raw.text ?? raw.title, SPEC_LIMITS.shortText)
      if (!text) return null
      const subtitle = clean(raw.subtitle, SPEC_LIMITS.shortText * 2)
      const kicker = clean(raw.kicker, 60)
      return { type: "title", text, ...(subtitle ? { subtitle } : {}), ...(kicker ? { kicker } : {}) }
    }
    case "heading": {
      const text = clean(raw.text, SPEC_LIMITS.shortText)
      return text ? { type: "heading", text } : null
    }
    case "text":
    case "paragraph": {
      const text = clean(raw.text, SPEC_LIMITS.longText)
      return text ? { type: "text", text } : null
    }
    case "bullets":
    case "list": {
      const items = cleanList(raw.items)
      return items.length ? { type: "bullets", items, ...(raw.ordered === true ? { ordered: true } : {}) } : null
    }
    case "quote": {
      const text = clean(raw.text, SPEC_LIMITS.shortText * 2)
      if (!text) return null
      const by = clean(raw.by ?? raw.author, 80)
      return { type: "quote", text, ...(by ? { by } : {}) }
    }
    case "image": {
      const src = cleanSrc(raw.src ?? raw.url)
      const alt = clean(raw.alt, 160)
      const caption = clean(raw.caption, SPEC_LIMITS.shortText)
      return { type: "image", ...(src ? { src } : {}), ...(alt ? { alt } : {}), ...(caption ? { caption } : {}) }
    }
    case "stats": {
      const items = (Array.isArray(raw.items) ? raw.items : [])
        .map((item) => {
          const entry = record(item)
          return { value: clean(entry.value, 16), label: clean(entry.label, 80) }
        })
        .filter((item) => item.value)
        .slice(0, 4)
      return items.length ? { type: "stats", items } : null
    }
    case "timeline": {
      const items = (Array.isArray(raw.items) ? raw.items : [])
        .map((item) => {
          const entry = record(item)
          return { label: clean(entry.label ?? entry.date, 40), text: clean(entry.text, SPEC_LIMITS.shortText) }
        })
        .filter((item) => item.label || item.text)
        .slice(0, 6)
      return items.length ? { type: "timeline", items } : null
    }
    case "compare": {
      const left = record(raw.left)
      const right = record(raw.right)
      const block = {
        type: "compare" as const,
        left: { title: clean(left.title, 60), items: cleanList(left.items, 5) },
        right: { title: clean(right.title, 60), items: cleanList(right.items, 5) },
      }
      return block.left.title || block.right.title || block.left.items.length || block.right.items.length ? block : null
    }
    case "steps": {
      const items = (Array.isArray(raw.items) ? raw.items : [])
        .map((item) => {
          if (typeof item === "string") return { title: clean(item, 80) }
          const entry = record(item)
          const text = clean(entry.text, SPEC_LIMITS.shortText)
          return { title: clean(entry.title ?? entry.label, 80), ...(text ? { text } : {}) }
        })
        .filter((item) => item.title)
        .slice(0, 5)
      return items.length ? { type: "steps", items } : null
    }
    case "question":
    case "quiz": {
      const question = clean(raw.question ?? raw.text, SPEC_LIMITS.shortText * 2)
      if (!question) return null
      const choices = cleanList(raw.choices ?? raw.options, SPEC_LIMITS.choices, 120)
      const answer = typeof raw.answer === "number" && Number.isInteger(raw.answer) && raw.answer >= 0 && raw.answer < choices.length ? raw.answer : undefined
      const explanation = clean(raw.explanation, SPEC_LIMITS.shortText * 2)
      return { type: "question", question, ...(choices.length ? { choices } : {}), ...(answer !== undefined ? { answer } : {}), ...(explanation ? { explanation } : {}) }
    }
    case "definition": {
      const term = clean(raw.term, 80)
      const text = clean(raw.text ?? raw.definition, SPEC_LIMITS.shortText * 2)
      return term && text ? { type: "definition", term, text } : null
    }
    case "callout":
    case "tip":
    case "note": {
      const text = clean(raw.text, SPEC_LIMITS.shortText * 2)
      const toneValue = clean(raw.tone ?? type, 10)
      const tone = toneValue === "tip" || toneValue === "warning" ? toneValue : "note"
      return text ? { type: "callout", text, tone } : null
    }
    case "meme": {
      const top = clean(raw.top, 120)
      const bottom = clean(raw.bottom, 120)
      const src = cleanSrc(raw.src)
      return top || bottom ? { type: "meme", ...(top ? { top } : {}), ...(bottom ? { bottom } : {}), ...(src ? { src } : {}) } : null
    }
    default:
      return null
  }
}

export function normalizePageSpec(input: unknown): PageSpec | null {
  const raw = record(input)
  const blocks = (Array.isArray(raw.blocks) ? raw.blocks : [])
    .map(normalizeBlock)
    .filter((block): block is SemanticBlock => Boolean(block))
    .slice(0, SPEC_LIMITS.blocksPerPage)
  if (!blocks.length) return null
  const layout = LAYOUT_IDS.includes(raw.layout as LayoutId) ? (raw.layout as LayoutId) : undefined
  const notes = clean(raw.notes, SPEC_LIMITS.longText)
  return { ...(layout ? { layout } : {}), blocks, ...(notes ? { notes } : {}) }
}

export function normalizeDesignSpec(input: unknown): DesignSpec {
  const raw = record(input)
  const pages = (Array.isArray(raw.pages) ? raw.pages : Array.isArray(raw.slides) ? raw.slides : [])
    .map(normalizePageSpec)
    .filter((page): page is PageSpec => Boolean(page))
    .slice(0, SPEC_LIMITS.pages)
  const title = clean(raw.title, SPEC_LIMITS.shortText)
  const theme = clean(raw.theme, 40)
  return { ...(title ? { title } : {}), ...(theme ? { theme } : {}), pages }
}

// ---------------------------------------------------------------------------
// Choosing a layout
// ---------------------------------------------------------------------------

/**
 * The layout a page gets when the spec does not name one. Order matters: the
 * most specific content wins (a quote page with a heading is still a quote).
 */
export function pickLayout(page: PageSpec, index: number, total: number): LayoutId {
  if (page.layout) return page.layout
  const types = new Set(page.blocks.map((block) => block.type))
  if (types.has("meme")) return "meme"
  if (types.has("question")) return "question"
  if (types.has("compare")) return "compare"
  if (types.has("stats")) return "stats"
  if (types.has("timeline")) return "timeline"
  if (types.has("steps")) return "steps"
  if (types.has("quote") && !types.has("bullets")) return "quote"
  if (types.has("definition")) return "definition"
  // A cover may carry one picture beside the title; section and closing pages are text only.
  const images = page.blocks.filter((block) => block.type === "image").length
  const words = page.blocks.filter((block) => block.type !== "image")
  const onlyTitle = words.every((block) => block.type === "title" || block.type === "heading" || block.type === "text") && words.some((block) => block.type === "title")
  if (onlyTitle && images <= (index === 0 ? 1 : 0)) {
    const textLength = page.blocks.filter((block) => block.type === "text").reduce((sum, block) => sum + (block.type === "text" ? block.text.length : 0), 0)
    if (textLength < 140) {
      if (index === 0) return "cover"
      if (index === total - 1 && total > 2) return "closing"
      return "section"
    }
  }
  if (types.has("image") && (types.has("bullets") || types.has("text") || types.has("callout"))) return "split"
  if (types.has("bullets")) return "bullets"
  return "text"
}

// ---------------------------------------------------------------------------
// Plain text -> spec (the no-AI path)
// ---------------------------------------------------------------------------

const IMAGE_LINE = /^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/
const BULLET_LINE = /^\s*(?:[-*•+]|\d+[.)])\s+(.*)$/
const ORDERED_LINE = /^\s*\d+[.)]\s+/
const STAT_LINE = /^\s*(?:[-*•]\s+)?([$€£]?\d[\d.,]*\s?(?:%|x|k|m|bn|[a-z]{0,3})?)\s*(?:[-–—:]\s*|\s+)(.{2,80})$/i
const QUESTION_CHOICE = /^\s*(?:[-*]\s+)?\(?([a-f])[.)]\s+(.*?)(\s*[*✓✔]|\s*\(correct\))?\s*$/i

/**
 * Turns notes or markdown into a spec without any model:
 *   `# Title` starts the deck (cover), `## Heading` or `---` starts a page,
 *   lists become bullets, `> quote — Name` a quote, `![alt](src)` an image,
 *   "Term: definition" a definition, `Q:` with lettered choices a question,
 *   and a list where every line starts with a number ("42% of …") becomes stats.
 */
export function parseTextToSpec(source: string, options: { title?: string; maxPages?: number } = {}): DesignSpec {
  const lines = String(source || "").replace(/\r\n?/g, "\n").split("\n")
  const pages: PageSpec[] = []
  let current: SemanticBlock[] = []
  let paragraph: string[] = []
  let list: string[] = []
  let listOrdered = false
  let deckTitle = clean(options.title, SPEC_LIMITS.shortText)

  const flushParagraph = () => {
    const text = paragraph.join(" ").trim()
    paragraph = []
    if (!text) return
    const definition = /^([^:]{2,60}):\s+(.{8,})$/.exec(text)
    if (definition && !/https?:$/i.test(definition[1])) {
      current.push({ type: "definition", term: clean(definition[1], 80), text: clean(definition[2], SPEC_LIMITS.shortText * 2) })
      return
    }
    current.push({ type: "text", text: clean(text, SPEC_LIMITS.longText) })
  }
  const flushList = () => {
    if (!list.length) return
    const items = list.map((item) => clean(item, SPEC_LIMITS.shortText)).filter(Boolean)
    list = []
    if (!items.length) return
    const stats = items.map((item) => STAT_LINE.exec(item)).filter(Boolean) as RegExpExecArray[]
    if (stats.length === items.length && items.length >= 2 && items.length <= 4) {
      current.push({ type: "stats", items: stats.map((match) => ({ value: clean(match[1], 16), label: clean(match[2], 80) })) })
    } else {
      current.push({ type: "bullets", items: items.slice(0, SPEC_LIMITS.items), ...(listOrdered ? { ordered: true } : {}) })
    }
    listOrdered = false
  }
  const flushPage = () => {
    flushParagraph()
    flushList()
    if (current.length) pages.push({ blocks: current.slice(0, SPEC_LIMITS.blocksPerPage) })
    current = []
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const trimmed = line.trim()
    if (!trimmed) {
      flushParagraph()
      flushList()
      continue
    }
    if (/^(?:---+|\*\*\*+)$/.test(trimmed)) {
      flushPage()
      continue
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed)
    if (heading) {
      const level = heading[1].length
      const text = clean(heading[2].replace(/[*_`]/g, ""), SPEC_LIMITS.shortText)
      if (level === 1) {
        flushPage()
        if (!deckTitle) deckTitle = text
        current.push({ type: "title", text })
      } else {
        flushPage()
        current.push({ type: "heading", text })
      }
      continue
    }
    const image = IMAGE_LINE.exec(trimmed)
    if (image) {
      flushParagraph()
      flushList()
      const block = normalizeBlock({ type: "image", src: image[2], alt: image[1] })
      if (block) current.push(block)
      continue
    }
    if (trimmed.startsWith(">")) {
      flushParagraph()
      flushList()
      const quote = trimmed.replace(/^>\s?/, "")
      const attributed = /^(.*?)\s*[—–-]{1,2}\s*([^—–-]{2,60})$/.exec(quote)
      current.push(attributed ? { type: "quote", text: clean(attributed[1].replace(/^["“]|["”]$/g, ""), 320), by: clean(attributed[2], 80) } : { type: "quote", text: clean(quote.replace(/^["“]|["”]$/g, ""), 320) })
      continue
    }
    const questionMatch = /^(?:q(?:uestion)?\s*\d*[:.)])\s*(.+)$/i.exec(trimmed)
    if (questionMatch) {
      flushParagraph()
      flushList()
      const choices: string[] = []
      let answer: number | undefined
      while (index + 1 < lines.length && QUESTION_CHOICE.test(lines[index + 1])) {
        index += 1
        const choice = QUESTION_CHOICE.exec(lines[index]) as RegExpExecArray
        if (choice[3]) answer = choices.length
        choices.push(clean(choice[2], 120))
      }
      const block = normalizeBlock({ type: "question", question: questionMatch[1], choices, answer })
      if (block) current.push(block)
      continue
    }
    const bullet = BULLET_LINE.exec(line)
    if (bullet) {
      flushParagraph()
      if (!list.length) listOrdered = ORDERED_LINE.test(line)
      list.push(bullet[1].replace(/[*_`]/g, ""))
      continue
    }
    flushList()
    paragraph.push(trimmed.replace(/[*_`]/g, ""))
  }
  flushPage()

  // A spec with no explicit title page still opens with one when we know a title.
  if (deckTitle && !(pages[0]?.blocks[0]?.type === "title")) {
    pages.unshift({ blocks: [{ type: "title", text: deckTitle }] })
  }
  const maxPages = Math.max(1, Math.min(options.maxPages ?? SPEC_LIMITS.pages, SPEC_LIMITS.pages))
  return normalizeDesignSpec({ title: deckTitle, pages: splitCrowdedPages(pages).slice(0, maxPages) })
}

/** A page with a heading and a long list reads better as two pages. */
function splitCrowdedPages(pages: PageSpec[]): PageSpec[] {
  const result: PageSpec[] = []
  for (const page of pages) {
    const bullets = page.blocks.find((block) => block.type === "bullets")
    if (bullets && bullets.type === "bullets" && bullets.items.length > 6) {
      const heading = page.blocks.find((block) => block.type === "heading" || block.type === "title")
      const half = Math.ceil(bullets.items.length / 2)
      const first = page.blocks.map((block) => (block === bullets ? { ...bullets, items: bullets.items.slice(0, half) } : block))
      const secondHeading = heading && (heading.type === "heading" || heading.type === "title") ? [{ type: "heading" as const, text: `${heading.text} (cont.)` }] : []
      result.push({ ...page, blocks: first })
      result.push({ blocks: [...secondHeading, { ...bullets, items: bullets.items.slice(half) }] })
      continue
    }
    result.push(page)
  }
  return result
}
