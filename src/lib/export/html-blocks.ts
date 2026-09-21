/**
 * `html-blocks` — turn a Studio document body (TipTap HTML) into themed blocks.
 *
 * The DOCX builder speaks `ThemedBlock[]`; a document is stored as HTML. Rather
 * than duplicate the document model, this module converts one into the other so
 * both AI replies and documents reach the same writer.
 *
 * It is a *pragmatic* reader, not a spec-compliant HTML parser: a tolerant
 * open/close tag stack, entity decoding, and a mapping from block elements to
 * blocks. Structure that has no block equivalent degrades rather than
 * disappearing:
 *
 *   - containers (`div`, `section`, `figure`, ...) are transparent — their
 *     children are promoted,
 *   - nested lists are flattened into their parent item's text,
 *   - an inline image becomes `[Image: alt]` inside the surrounding text,
 *   - a `<table>` without `<th>` cells has no header row (and says so).
 *
 * Nothing here is trusted: the output is plain text carried in block objects,
 * and the OOXML writers escape every value on the way out. Caps keep a hostile
 * or accidental megabyte of HTML from producing an unbounded file.
 */

import { isSafeUrl, type ThemedBlock, type ThemedHeadingLevel } from "@/lib/ai/format-response"

const MAX_DOCUMENT_BLOCKS = 4000
const MAX_TABLE_COLUMNS = 64
const MAX_TABLE_ROWS = 500

/** Elements that never have children, so the stack must not wait for a close tag. */
const VOID_TAGS = new Set(["br", "img", "hr", "input", "meta", "link", "col", "source", "wbr"])

/** Elements whose contents are dropped entirely. */
const DROPPED_TAGS = new Set(["script", "style", "head", "title", "noscript", "template", "svg"])

/** Block elements, so the tree walk knows where a line ends. */
const BLOCK_TAGS = new Set([
  "p", "div", "section", "article", "main", "aside", "header", "footer", "figure", "figcaption",
  "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote", "pre", "table", "thead",
  "tbody", "tfoot", "tr", "td", "th", "hr", "details", "summary", "dl", "dt", "dd",
])

/** Containers that carry no semantics of their own — their children are promoted. */

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

const namedEntities: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  times: "×",
  middot: "·",
  copy: "©",
  reg: "®",
  trade: "™",
  deg: "°",
  bull: "•",
  emsp: " ",
  ensp: " ",
}

/** Decode the entities TipTap and browsers actually emit; unknown ones pass through. */
export function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, entity: string) => {
    if (entity.startsWith("#")) {
      const hexadecimal = entity[1] === "x" || entity[1] === "X"
      const codePoint = Number.parseInt(hexadecimal ? entity.slice(2) : entity.slice(1), hexadecimal ? 16 : 10)
      if (!Number.isFinite(codePoint) || codePoint <= 0 || codePoint > 0x10ffff) return match
      try {
        return String.fromCodePoint(codePoint)
      } catch {
        return match
      }
    }
    return namedEntities[entity] ?? namedEntities[entity.toLowerCase()] ?? match
  })
}

// ---------------------------------------------------------------------------
// Tag stream -> tolerant tree
// ---------------------------------------------------------------------------

interface HtmlNode {
  tag: string
  attributes: Record<string, string>
  children: HtmlChild[]
}

type HtmlChild = string | HtmlNode

const tagPattern = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)(\/?)>/g
const attributePattern = /([a-zA-Z_:][-\w:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g

/**
 * Parse HTML into a tree. Unclosed tags are closed implicitly at the end and a
 * stray close tag is ignored, so malformed input still produces a tree.
 */
export function parseHtmlFragment(html: string): HtmlNode {
  const root: HtmlNode = { tag: "#root", attributes: {}, children: [] }
  const stack: HtmlNode[] = [root]
  // Comments and declarations are removed up front: they contain '<' but no tag
  // name, so the tokenizer below would otherwise emit them as literal text.
  const source = String(html ?? "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<![^>]*>/g, "")
  let cursor = 0

  const pushText = (text: string) => {
    if (!text) return
    const top = stack[stack.length - 1]
    if (DROPPED_TAGS.has(top.tag)) return
    top.children.push(decodeEntities(text))
  }

  tagPattern.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = tagPattern.exec(source)) !== null) {
    pushText(source.slice(cursor, match.index))
    cursor = match.index + match[0].length

    const [, closing, rawName, rawAttributes, selfClosing] = match
    const tag = rawName.toLowerCase()

    if (closing) {
      // Unwind to the matching open tag; anything above it was never closed.
      const position = stack.map((node) => node.tag).lastIndexOf(tag)
      if (position > 0) stack.length = position
      continue
    }

    if (DROPPED_TAGS.has(tag)) {
      // Skip the whole element, including its text.
      const closePattern = new RegExp(`</${tag}\\s*>`, "i")
      const close = closePattern.exec(source.slice(cursor))
      cursor = close ? cursor + close.index + close[0].length : source.length
      continue
    }

    const node: HtmlNode = { tag, attributes: parseAttributes(rawAttributes), children: [] }
    stack[stack.length - 1].children.push(node)
    if (!selfClosing && !VOID_TAGS.has(tag)) stack.push(node)
  }

  pushText(source.slice(cursor))
  return root
}

function parseAttributes(raw: string): Record<string, string> {
  const attributes: Record<string, string> = {}
  if (!raw) return attributes
  attributePattern.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = attributePattern.exec(raw)) !== null) {
    const value = match[2] ?? match[3] ?? match[4] ?? ""
    attributes[match[1].toLowerCase()] = decodeEntities(value)
  }
  return attributes
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/** Convert a document body into themed blocks, capped so output stays bounded. */
export function blocksFromDocumentHtml(html: string): ThemedBlock[] {
  const blocks = blocksFromChildren(parseHtmlFragment(html).children)
  return blocks.length > MAX_DOCUMENT_BLOCKS ? blocks.slice(0, MAX_DOCUMENT_BLOCKS) : blocks
}

// ---------------------------------------------------------------------------
// Tree -> blocks
// ---------------------------------------------------------------------------

function blocksFromChildren(children: HtmlChild[]): ThemedBlock[] {
  const blocks: ThemedBlock[] = []
  for (const child of children) {
    blocks.push(...blocksFromChild(child))
  }
  return blocks
}

function blocksFromChild(child: HtmlChild): ThemedBlock[] {
  if (typeof child === "string") {
    const text = normalizeInlineText(child)
    return text ? [{ type: "paragraph", text }] : []
  }
  return blocksFromNode(child)
}

function blocksFromNode(node: HtmlNode): ThemedBlock[] {
  const tag = node.tag

  if (/^h[1-6]$/.test(tag)) {
    const text = normalizeInlineText(textOf(node))
    if (!text) return []
    const level = Math.min(4, Math.max(1, Number.parseInt(tag.slice(1), 10) || 1)) as ThemedHeadingLevel
    return [{ type: "heading", level, text }]
  }

  switch (tag) {
    case "p": {
      const text = normalizeInlineText(textOf(node))
      return text ? [{ type: "paragraph", text }] : []
    }
    case "ul":
    case "ol": {
      const items = listItemsOf(node)
      return items.length ? [{ type: "list", ordered: tag === "ol", items }] : []
    }
    case "blockquote": {
      const text = normalizeInlineText(textOf(node))
      return text ? [{ type: "quote", text }] : []
    }
    case "pre":
      return [codeBlockOf(node)]
    case "hr":
      return [{ type: "divider" }]
    case "img": {
      const url = (node.attributes.src || "").trim()
      const alt = normalizeInlineText(node.attributes.alt || "")
      if (isSafeUrl(url)) return [{ type: "image", url, alt }]
      return alt ? [{ type: "paragraph", text: `[Image: ${alt}]` }] : []
    }
    case "table": {
      const table = tableBlockOf(node)
      return table ? [table] : []
    }
    case "li":
    case "td":
    case "th": {
      // A cell or item outside a list/table still has readable content.
      const text = normalizeInlineText(textOf(node))
      return text ? [{ type: "paragraph", text }] : []
    }
    default:
      break
  }

  // Everything else is a container: promote block-level children, and only if
  // there are none fall back to treating the whole subtree as one paragraph.
  const nested = blocksFromChildren(node.children)
  if (nested.length) return nested
  const text = normalizeInlineText(textOf(node))
  return text ? [{ type: "paragraph", text }] : []
}

function listItemsOf(node: HtmlNode): string[] {
  const items: string[] = []
  for (const child of node.children) {
    // A stray text node inside a list is malformed but still content; nested
    // lists are folded into the item text by `textOf` rather than dropped.
    const text = normalizeInlineText(textOf(child))
    if (text) items.push(text)
  }
  return items
}

function codeBlockOf(node: HtmlNode): ThemedBlock {
  const code = findChild(node, "code")
  const language = code ? languageOf(code.attributes.class || "") : ""
  const value = (code ? textOf(code) : textOf(node)).replace(/^\n+|\n+$/g, "")
  return { type: "code", language, code: value }
}

function languageOf(className: string): string {
  const match = /(?:^|\s)(?:language|lang)-([a-z0-9+#.-]+)/i.exec(className)
  return match ? match[1].toLowerCase().slice(0, 24) : ""
}

/**
 * A table becomes a header row plus body rows. Only an explicit first row of
 * `<th>` cells is treated as a header; otherwise the block reports no headers
 * and every row is data, so no row is silently promoted.
 */
function tableBlockOf(node: HtmlNode): ThemedBlock | null {
  const tableRows = descendants(node, "tr")
  const rows = tableRows
    .slice(0, MAX_TABLE_ROWS)
    .map((row) => row.children.filter(isCell).map((cell) => normalizeInlineText(textOf(cell))).slice(0, MAX_TABLE_COLUMNS))
    .filter((row) => row.length > 0)

  if (!rows.length) return null

  // Only an explicit first row of `<th>` cells becomes the header; otherwise
  // the block reports no headers, so no row is silently promoted.
  const headerCells = tableRows[0]?.children.filter(isCell) ?? []
  const hasHeaderRow = headerCells.length > 0 && headerCells.every((cell) => cell.tag === "th")

  return hasHeaderRow ? { type: "table", headers: rows[0], rows: rows.slice(1) } : { type: "table", headers: [], rows }
}

function isCell(child: HtmlChild): child is HtmlNode {
  return typeof child !== "string" && (child.tag === "td" || child.tag === "th")
}

function findChild(node: HtmlNode, tag: string): HtmlNode | null {
  for (const child of node.children) {
    if (typeof child !== "string" && child.tag === tag) return child
  }
  return null
}

/** Direct descendants with a given tag, one level down (no recursion). */
function descendants(node: HtmlNode, tag: string): HtmlNode[] {
  const found: HtmlNode[] = []
  const visit = (current: HtmlNode) => {
    for (const child of current.children) {
      if (typeof child === "string") continue
      if (child.tag === tag) {
        found.push(child)
        continue
      }
      // `thead`/`tbody` sit between `table` and `tr`; keep looking through them.
      if (child.tag === "thead" || child.tag === "tbody" || child.tag === "tfoot") visit(child)
    }
  }
  visit(node)
  return found
}

// ---------------------------------------------------------------------------
// Text extraction
// ---------------------------------------------------------------------------

/** Concatenate the text of a subtree, breaking lines at block boundaries. */
function textOf(node: HtmlNode | string): string {
  return textOfChild(node, 0)
}

function textOfChild(node: HtmlNode | string, depth: number): string {
  if (depth > 24) return ""
  if (typeof node === "string") return node

  if (node.tag === "br") return "\n"
  if (node.tag === "img") {
    const alt = normalizeInlineText(node.attributes.alt || "")
    return alt ? `[Image: ${alt}]` : ""
  }
  if (VOID_TAGS.has(node.tag)) return ""

  let text = ""
  for (const child of node.children) {
    const isBlock = typeof child !== "string" && BLOCK_TAGS.has(child.tag)
    if (isBlock && text && !text.endsWith("\n")) text += "\n"
    text += textOfChild(child, depth + 1)
  }
  return text
}

/** Collapse inline whitespace but keep intentional line breaks. */
function normalizeInlineText(value: unknown): string {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\u00a0\u200b\ufeff]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}
