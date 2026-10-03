/**
 * `xml-read` — the small XML reader the OOXML importers share.
 *
 * WordprocessingML and SpreadsheetML are XML, so reading a `.docx`/`.xlsx` back
 * means reading XML. The app ships no XML parser dependency, and a DOM parser is
 * not available in every runtime this module runs in, so this is a focused,
 * tolerant reader: enough to walk element structure, attributes and text, and
 * nothing else.
 *
 * It is deliberately **not** a validating parser, and that is the requirement
 * rather than a shortcut. The files being read are produced by Word, Excel, and
 * third-party tools, and they differ from ours in ways that are legal but easy
 * to trip over:
 *
 *   - **Namespace prefixes vary** (`w:` in Word, `x:` in some producers, a
 *     default namespace in others), so every name is compared by its *local*
 *     name, and `xmlns` declarations are ignored. Attributes are matched by
 *     local name too, which is how `w:val` and `val` are found alike.
 *   - **Element order and extra parts** carry no meaning here: callers search for
 *     the element they want instead of assuming a position.
 *   - **Mismatched close tags are tolerated** rather than fatal: the parser
 *     unwinds to the matching open tag, so one unusual construct does not throw
 *     away the rest of the document. Unclosed tags close at the end.
 *   - **`<w:p>` and friends can nest content directly** (runs, hyperlinks,
 *     tracked-change wrappers), so text lives in a recursive walk, not in a
 *     fixed pattern.
 *
 * Text is decoded as it is read: the five XML entities, numeric character
 * references (decimal and hex), and the handful of HTML-ish named entities some
 * producers emit anyway. The decoder is the same one the document HTML path
 * uses (`decodeEntities`), so an entity is interpreted identically in both.
 *
 * The one thing that *is* an error is a part with no root element at all, which
 * means the part is not XML; that throws with the part name so the caller can
 * say which file was unusable.
 */

import { decodeEntities } from "@/lib/export/html-blocks"

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

export interface XmlElement {
  /** Local tag name, prefix stripped (e.g. `p` for `<w:p>`). */
  name: string
  /** Attributes by local name, e.g. `val` for `w:val`. First one wins. */
  attributes: Record<string, string>
  /** Children in document order; a string is character data, already decoded. */
  children: Array<XmlElement | string>
}

/** Elements whose contents are markup, not text, and are skipped when walking. */
const SKIPPED_SUBTREES = new Set(["pPr", "rPr", "tblPr", "tblPrEx", "trPr", "tcPr", "sectPr", "sectPrChange"])

// ---------------------------------------------------------------------------
// Bytes -> text
// ---------------------------------------------------------------------------

/**
 * Decode one XML part.
 *
 * The OOXML parts are UTF-8 in every file this app writes and in everything
 * current Word and Excel write, but the format *permits* UTF-16 with a byte
 * order mark, and a UTF-16 part read as UTF-8 would be garbage rather than an
 * error. Sniffing the BOM is three lines and removes that failure mode.
 */
export function decodeXmlBytes(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return stripBom(new TextDecoder("utf-16le").decode(bytes))
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return stripBom(new TextDecoder("utf-16be").decode(bytes))
  return stripBom(new TextDecoder("utf-8").decode(bytes))
}

function stripBom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * A tag: its name, its attributes, and whether it closes itself.
 *
 * The attribute group excludes `/` on purpose. Attribute values are quoted in
 * XML, and letting the attribute group match `/` would make it greedily eat the
 * slash of a self-closing tag — `<w:br/>` would then open an element and swallow
 * everything until the next close tag.
 */
const TAG_PATTERN = /<(\/?)([A-Za-z_][\w.:-]*)((?:"[^"]*"|'[^']*'|[^>"'/])*)(\/?)>/g
const ATTRIBUTE_PATTERN = /([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g

/**
 * Parse a document into its root element.
 *
 * Rejects missing root elements and optional caller-supplied complexity limits.
 * Other structural oddities are tolerated for existing OOXML producers.
 */
export interface XmlReadOptions {
  preserveQualifiedAttributes?: boolean
  maxDepth?: number
  maxNodes?: number
}

export function parseXml(xml: string, label: string, options: XmlReadOptions = {}): XmlElement {
  const root: XmlElement = { name: "#root", attributes: {}, children: [] }
  const stack: XmlElement[] = [root]
  // Comments, CDATA sections and declarations carry '<' but no element, so they
  // are removed before tokenizing; CDATA becomes its text.
  const source = String(xml ?? "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_match, text: string) => escapeAsText(text))
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\?[\s\S]*?\?>/g, "")
    .replace(/<![^>]*>/g, "")

  let cursor = 0
  let nodes = 0
  const pushText = (text: string) => {
    if (text) stack[stack.length - 1].children.push(decodeEntities(text))
  }

  TAG_PATTERN.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = TAG_PATTERN.exec(source)) !== null) {
    pushText(source.slice(cursor, match.index))
    cursor = match.index + match[0].length

    const [, closing, rawName, rawAttributes, selfClosing] = match
    if (closing) {
      const localName = localNameOf(rawName)
      const position = lastIndexOfName(stack, localName)
      // Only unwinds to a real ancestor: a stray close tag in a fragment is
      // ignored instead of emptying the stack.
      if (position > 0) stack.length = position
      continue
    }

    nodes += 1
    if (nodes > (options.maxNodes ?? Infinity) || stack.length > (options.maxDepth ?? Infinity)) {
      throw new Error(`XML complexity exceeds the import limit in ${label}.`)
    }
    const element: XmlElement = {
      name: localNameOf(rawName),
      attributes: parseAttributes(rawAttributes, options),
      children: [],
    }
    stack[stack.length - 1].children.push(element)
    if (!selfClosing) stack.push(element)
  }
  pushText(source.slice(cursor))

  const rootElement = root.children.find(isElement)
  if (!rootElement) throw new Error(`Malformed XML in ${label}: the part has no root element.`)
  return rootElement
}

function lastIndexOfName(stack: XmlElement[], name: string): number {
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    if (stack[index].name === name) return index
  }
  return -1
}

/** `w:p` -> `p`; a name with no prefix is returned unchanged. */
function localNameOf(rawName: string): string {
  const colon = rawName.indexOf(":")
  return colon === -1 ? rawName : rawName.slice(colon + 1)
}

function parseAttributes(raw: string, options: XmlReadOptions): Record<string, string> {
  const attributes: Record<string, string> = {}
  if (!raw) return attributes
  ATTRIBUTE_PATTERN.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = ATTRIBUTE_PATTERN.exec(raw)) !== null) {
    const rawName = match[1]
    // Namespace declarations are not data; a document's prefix choice must not
    // change what it means to us.
    if (rawName === "xmlns" || rawName.startsWith("xmlns:")) continue
    const name = localNameOf(rawName)
    if (options.preserveQualifiedAttributes && rawName.includes(":")) {
      attributes[rawName] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "")
    }
    if (name in attributes) continue
    attributes[name] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "")
  }
  return attributes
}

/** Re-escape text so a CDATA body survives the entity decoding applied later. */
function escapeAsText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

function isElement(child: XmlElement | string): child is XmlElement {
  return typeof child !== "string"
}

/** Child elements only, in order. */
export function childElements(node: XmlElement): XmlElement[] {
  return node.children.filter(isElement)
}

/** The first child element with this local name, or `null`. */
export function childNamed(node: XmlElement, name: string): XmlElement | null {
  for (const child of node.children) {
    if (isElement(child) && child.name === name) return child
  }
  return null
}

/** Every child element with this local name, in order. */
export function childrenNamed(node: XmlElement, name: string): XmlElement[] {
  return childElements(node).filter((child) => child.name === name)
}

/** The first element with this local name anywhere below `node` (depth-first). */
export function findFirst(node: XmlElement, name: string): XmlElement | null {
  for (const child of node.children) {
    if (!isElement(child)) continue
    if (child.name === name) return child
    const found = findFirst(child, name)
    if (found) return found
  }
  return null
}

/** Every element with this local name anywhere below `node`, in document order. */
export function descendants(node: XmlElement, name: string): XmlElement[] {
  const found: XmlElement[] = []
  for (const child of node.children) {
    if (!isElement(child)) continue
    if (child.name === name) found.push(child)
    found.push(...descendants(child, name))
  }
  return found
}

/** An attribute by local name, or `""` — attribute lookups are never fatal. */
export function attribute(node: XmlElement | null | undefined, name: string): string {
  if (!node) return ""
  return node.attributes[name] ?? ""
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

export interface TextWalkOptions {
  /**
   * Element names whose whole subtree is dropped. Used to leave out deleted
   * revision text (`del`) and field instructions (`instrText`), which are not
   * document content.
   */
  skip?: Set<string>
  /** Called for every element visited, so a caller can add breaks or tabs. */
  onElement?: (element: XmlElement) => string | null
}

/**
 * Concatenate the text of a subtree in document order.
 *
 * Property elements (`w:pPr`, `w:rPr`, table/cell properties) are skipped by
 * default: they contain formatting, not content, and walking into them would
 * leak things like `w:val` values into the text.
 */
export function textOf(node: XmlElement, options: TextWalkOptions = {}): string {
  let text = ""
  const visit = (current: XmlElement, depth: number) => {
    if (depth > 40) return
    if (SKIPPED_SUBTREES.has(current.name)) return
    if (options.skip?.has(current.name)) return

    const replacement = options.onElement?.(current)
    if (typeof replacement === "string") {
      text += replacement
      return
    }
    for (const child of current.children) {
      if (typeof child === "string") text += child
      else visit(child, depth + 1)
    }
  }
  visit(node, 0)
  return text
}

/**
 * Text with a literal `<w:br/>`/`<w:cr/>` as a newline and `<w:tab/>` as a tab.
 *
 * The caller decides what to skip (`delText`, `instrText`, ...); this adds only
 * the inline elements that carry meaning as characters.
 */
export function textWithBreaks(node: XmlElement, options: TextWalkOptions = {}): string {
  return textOf(node, {
    skip: options.skip,
    onElement: (element) => {
      if (element.name === "br" || element.name === "cr") return "\n"
      if (element.name === "tab") return "\t"
      if (element.name === "noBreakHyphen") return "-"
      if (element.name === "softHyphen") return ""
      return options.onElement?.(element) ?? null
    },
  })
}
