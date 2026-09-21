import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

/**
 * Quality-bar guards.
 *
 * These read source files and assert the *invariants* behind the accessibility
 * and polish work, rather than importing the components: an invariant that is
 * asserted once and never again silently rots the first time someone adds a
 * screen, so each check below exists to make a regression fail loudly instead of
 * shipping.
 *
 * The checks are JSX-aware on purpose. The original audit found defects with
 * single-line regular expressions, which both missed real problems (an `<img>`
 * whose `alt` sat on a continuation line) and reported problems that did not
 * exist (a `<select>` named only inside a JSDoc comment). Every helper here
 * therefore ignores comment lines and walks a tag across newlines.
 */

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
const COMPONENTS_ROOT = path.join(PROJECT_ROOT, "src", "components")
const SRC_ROOT = path.join(PROJECT_ROOT, "src")
const LEARN_SHELL = path.join(COMPONENTS_ROOT, "learn", "learn-shell.tsx")

/**
 * `dangerouslySetInnerHTML` is the one React API that can turn stored text into
 * executable markup, so it is allowed in exactly one place: the root layout's
 * pre-hydration shim, whose payload is a literal defined in this repository.
 * The AI block renderer and the public share page render user/AI content, so a
 * `dangerouslySetInnerHTML` appearing there would be an injection boundary, not
 * a formatting choice — this list is the whole boundary, and adding to it must
 * be a deliberate, reviewable act.
 */
const DANGEROUS_HTML_ALLOWLIST = new Set(["src/app/layout.tsx"])

/**
 * The surfaces that animate something (keyframes injected by the landing pages,
 * scroll/pointer-driven hero motion, a cross-fade navigation) must keep offering
 * a `prefers-reduced-motion` path for people who ask their OS for less motion.
 * The counts are the ones measured when this guard was written; `>=` rather than
 * `==` because adding another fallback is fine and deleting one is not.
 */
const REDUCED_MOTION_SURFACES: ReadonlyArray<[file: string, minimum: number]> = [
  ["src/app/page.tsx", 1],
  ["src/components/intro-workflow-emil.tsx", 3],
  ["src/components/intro-workflow.tsx", 1],
  ["src/components/launch-showcase.tsx", 1],
  ["src/components/public-workflow-link.tsx", 1],
]

function listSourceFiles(rootDir: string): string[] {
  const files: string[] = []
  const pending = [rootDir]

  while (pending.length) {
    const current = pending.pop()
    if (!current) continue

    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        pending.push(entryPath)
        continue
      }
      if (entry.isFile() && /\.tsx?$/.test(entry.name)) files.push(entryPath)
    }
  }

  return files.sort()
}

const COMPONENT_FILES = listSourceFiles(COMPONENTS_ROOT)

// Images are checked across `src`, not just `src/components`: the public share
// page renders a stored canvas with a server component, so it is exactly the
// kind of render path that would otherwise slip past a components-only scan.
//
// Only `.tsx` counts. A `<img` written inside a `.ts` file is part of an HTML
// *string* — the document exporter in `lib/export/html-blocks.ts` and the
// `richHtml` templates in `lib/studio-tool-library.ts` — so it is data that gets
// stored or downloaded, not an element this app paints, and a loading hint there
// would follow the text into someone else's file.
const RENDERED_FILES = listSourceFiles(SRC_ROOT).filter(
  (file) => file.endsWith(".tsx") && !relative(file).startsWith("src/tests/"),
)

function relative(file: string) {
  return path.relative(PROJECT_ROOT, file).split(path.sep).join("/")
}

function readSource(file: string) {
  return fs.readFileSync(file, "utf8")
}

/**
 * Blank out comment lines before scanning.
 *
 * A comment that *names* a tag is documentation, not markup: the share page and
 * the AI block renderer both contain a sentence saying they never use
 * `dangerouslySetInnerHTML`, and the calendar's option-list helper explains what
 * a `<select>` does without rendering one. Masking whole comment lines (rather
 * than stripping `//` anywhere) keeps URLs such as `https://…` intact.
 */
function withoutComments(source: string) {
  return source
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim()
      return trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*") ? "" : line
    })
    .join("\n")
}

function lineOf(source: string, index: number) {
  return source.slice(0, index).split(/\r?\n/).length
}

function skipString(source: string, index: number) {
  const quote = source[index]
  let cursor = index + 1
  while (cursor < source.length) {
    if (source[cursor] === "\\") {
      cursor += 2
      continue
    }
    if (source[cursor] === quote) return cursor + 1
    cursor += 1
  }
  return source.length
}

function skipBraces(source: string, index: number) {
  let depth = 0
  let cursor = index
  while (cursor < source.length) {
    const char = source[cursor]
    if (char === '"' || char === "'" || char === "`") {
      cursor = skipString(source, cursor)
      continue
    }
    if (char === "{") depth += 1
    else if (char === "}") {
      depth -= 1
      if (depth === 0) return cursor + 1
    }
    cursor += 1
  }
  return source.length
}

/** Index just past the `>` that closes the tag starting at `from`. */
function endOfTag(source: string, from: number) {
  let cursor = from + 1
  while (cursor < source.length) {
    const char = source[cursor]
    if (char === '"' || char === "'" || char === "`") {
      cursor = skipString(source, cursor)
      continue
    }
    // A `>` inside `{cond ? a > b : c}` or inside a template literal is data,
    // not the end of the tag — without this the tag would be truncated and its
    // later attributes (including `alt`) would be invisible.
    if (char === "{") {
      cursor = skipBraces(source, cursor)
      continue
    }
    if (char === ">") return cursor + 1
    cursor += 1
  }
  return source.length
}

type OpenTag = { raw: string; index: number; end: number }

/** Every opening tag for `tagName`, including tags spread over several lines. */
function findOpenTags(source: string, tagName: string): OpenTag[] {
  const tags: OpenTag[] = []
  const pattern = new RegExp(`<${tagName}(?=[\\s/>])`, "g")
  let match: RegExpExecArray | null

  while ((match = pattern.exec(source))) {
    const end = endOfTag(source, match.index)
    tags.push({ raw: source.slice(match.index, end), index: match.index, end })
  }

  return tags
}

/** The children of the element that opens at `openTag.end`, up to its close tag. */
function elementBody(source: string, openTagEnd: number, tagName: string) {
  let cursor = openTagEnd
  let depth = 0

  while (cursor < source.length) {
    const char = source[cursor]
    if (char === "{") {
      cursor = skipBraces(source, cursor)
      continue
    }
    if (char === "<") {
      if (source.startsWith(`</${tagName}`, cursor) && depth === 0) return source.slice(openTagEnd, cursor)
      const end = endOfTag(source, cursor)
      const isClosing = source[cursor + 1] === "/"
      const isSelfClosing = source.slice(cursor, end).trimEnd().endsWith("/>")
      if (isClosing) depth -= 1
      else if (!isSelfClosing) depth += 1
      cursor = end
      continue
    }
    cursor += 1
  }

  return source.slice(openTagEnd)
}

/**
 * Split an element's children into literal text, inline expressions and nested
 * elements. A button's accessible name has to come from one of the first two,
 * so the difference is exactly what the icon-only check needs.
 */
function summarizeChildren(body: string) {
  let text = ""
  let expressions = 0
  let elements = 0
  let firstElement: string | null = null
  let cursor = 0

  while (cursor < body.length) {
    const char = body[cursor]
    if (char === "{") {
      expressions += 1
      cursor = skipBraces(body, cursor)
      continue
    }
    if (char === "<") {
      const nameMatch = /^<\/?([A-Za-z][A-Za-z0-9.]*)/.exec(body.slice(cursor, cursor + 40))
      if (nameMatch && body[cursor + 1] !== "/") {
        elements += 1
        firstElement = firstElement ?? nameMatch[1]
      }
      cursor = endOfTag(body, cursor)
      continue
    }
    text += char
    cursor += 1
  }

  return { text: text.replace(/\s+/g, " ").trim(), expressions, elements, firstElement }
}

const ACCESSIBLE_NAME = /aria-label=|aria-labelledby=|\btitle=/

test("every <img> in a component carries an alt attribute", () => {
  // An image without `alt` is announced by screen readers as the file name, or
  // not at all, which reads as noise or silence in the middle of a sentence.
  // `alt=""` is a valid answer for a decorative image — the point is that the
  // author decided.
  const failures: string[] = []

  for (const file of RENDERED_FILES) {
    const source = withoutComments(readSource(file))
    for (const tag of findOpenTags(source, "img")) {
      if (!/\balt=/.test(tag.raw)) failures.push(`${relative(file)}:${lineOf(source, tag.index)}`)
    }
  }

  assert.deepEqual(failures, [], "these <img> elements need an alt attribute (alt=\"\" if decorative)")
})

test("an icon-only <button> still needs an accessible name", () => {
  // A button whose children are only an icon reads as "button" with no name, so
  // it is unusable with a screen reader and untestable by voice control. The
  // shape checked here is "nested element, no literal text, no expression child"
  // — the unambiguous icon-only case. A button that also renders text (even via
  // `{label}`) gets its name from that text and is left alone.
  const failures: string[] = []

  for (const file of COMPONENT_FILES) {
    const source = withoutComments(readSource(file))
    for (const tag of findOpenTags(source, "button")) {
      const children = summarizeChildren(elementBody(source, tag.end, "button"))
      if (!children.elements || children.expressions || children.text) continue
      if (ACCESSIBLE_NAME.test(tag.raw)) continue
      failures.push(`${relative(file)}:${lineOf(source, tag.index)} <${children.firstElement ?? "svg"}…>`)
    }
  }

  assert.deepEqual(failures, [], "add aria-label (or visible text) to these icon-only buttons")
})

test("every form control in a component has an accessible name", () => {
  // The audit's single-line pattern claimed 74 unlabelled inputs; a JSX-aware
  // scan found 15, because most of those inputs are either wrapped in a
  // <label> or carry their own `id` on a continuation line. This check keeps the
  // real number at zero: a control that only has a placeholder is announced as
  // nothing once the user types.
  const failures: string[] = []

  for (const file of COMPONENT_FILES) {
    const source = withoutComments(readSource(file))
    for (const tagName of ["input", "textarea", "select"]) {
      for (const tag of findOpenTags(source, tagName)) {
        if (/aria-label=|aria-labelledby=|\btitle=|\bplaceholder=/.test(tag.raw)) continue

        // Wrapped in a <label>: the label element names the control it contains.
        const before = source.slice(0, tag.index)
        const openLabels = (before.match(/<label\b/g) || []).length
        const closeLabels = (before.match(/<\/label>/g) || []).length
        if (openLabels > closeLabels) continue

        // Or referenced by a <label htmlFor> elsewhere in the same file.
        const id = /\bid=["']([^"'{}]+)["']/.exec(tag.raw)?.[1]
        const references = id ? [`htmlFor="${id}"`, `htmlFor='${id}'`, `htmlFor={"${id}"}`, `htmlFor={'${id}'}`] : []
        if (references.some((token) => source.includes(token))) continue

        failures.push(`${relative(file)}:${lineOf(source, tag.index)} <${tagName}>`)
      }
    }
  }

  assert.deepEqual(failures, [], "add aria-label, a placeholder, or a label htmlFor to these controls")
})

test("every <img> in a component declares its loading strategy", () => {
  // `loading="lazy"` keeps a grid of file thumbnails or chat attachments from
  // competing with the page's own data. Above-the-fold art opts out on purpose
  // with `loading="eager"`, so the invariant is "declared", not "lazy".
  const failures: string[] = []

  for (const file of RENDERED_FILES) {
    const source = withoutComments(readSource(file))
    for (const tag of findOpenTags(source, "img")) {
      if (!/\bloading=/.test(tag.raw)) failures.push(`${relative(file)}:${lineOf(source, tag.index)}`)
    }
  }

  assert.deepEqual(failures, [], 'these <img> elements need loading="lazy" or loading="eager"')
})

test("the shell starts with a skip link that lands on the main landmark", () => {
  const source = withoutComments(readSource(LEARN_SHELL))

  const link = findOpenTags(source, "a").find((tag) => tag.raw.includes('href="#learn-main-content"'))
  assert.ok(link, 'the shell must link to #learn-main-content as the first focusable element')

  // Without a visible label the link is a nameless jump target of its own.
  const label = elementBody(source, link.end, "a").replace(/<[^>]*>/g, "").trim()
  assert.notEqual(label, "", "the skip link needs text a screen reader can announce")

  // A skip link placed after the sidebar would skip nothing: the point of WCAG
  // 2.4.1 is that the repeated navigation is bypassed, so it must come first.
  const sidebarIndex = source.indexOf("<Sidebar")
  assert.ok(sidebarIndex > -1, "the shell renders <Sidebar>; the skip link is measured against it")
  assert.ok(link.index < sidebarIndex, "the skip link must precede the navigation it bypasses")

  // The target has to be focusable, or the browser scrolls without moving focus
  // and the next Tab returns the user to the top of the page.
  const main = findOpenTags(source, "main").find((tag) => tag.raw.includes('id="learn-main-content"'))
  assert.ok(main, "the main landmark must carry id=learn-main-content")
  assert.match(main.raw, /tabIndex=\{-1\}/, "the skip target must accept programmatic focus")
  assert.equal(
    (source.match(/id="learn-main-content"/g) || []).length,
    1,
    "a duplicated id would make the skip link's destination ambiguous",
  )
})

test("dangerouslySetInnerHTML stays confined to the theme bootstrap", () => {
  const usages: string[] = []
  const mentions: string[] = []

  for (const file of listSourceFiles(SRC_ROOT)) {
    const fileRelative = relative(file)
    if (fileRelative.startsWith("src/tests/")) continue

    const raw = readSource(file)
    // Comments are blanked first: prose that says "there is no
    // dangerouslySetInnerHTML here" is a guarantee worth keeping, not a usage.
    withoutComments(raw)
      .split(/\r?\n/)
      .forEach((line, index) => {
        if (line.includes("dangerouslySetInnerHTML")) usages.push(`${fileRelative}:${index + 1}`)
      })
    raw.split(/\r?\n/).forEach((line, index) => {
      if (line.includes("dangerouslySetInnerHTML") && /^\s*(\*|\/\/|\/\*)/.test(line)) {
        mentions.push(`${fileRelative}:${index + 1}`)
      }
    })
  }

  assert.deepEqual(
    usages.filter((site) => ![...DANGEROUS_HTML_ALLOWLIST].some((allowed) => site.startsWith(`${allowed}:`))),
    [],
    "the AI renderer and the public share page render untrusted text; a dangerouslySetInnerHTML there is an injection boundary",
  )
  assert.equal(
    usages.length,
    DANGEROUS_HTML_ALLOWLIST.size,
    "exactly one allowlisted usage is expected; a second one — even in the layout — should be justified before it lands",
  )

  // The allowlisted use is the pre-hydration `__html` shim, whose payload is a
  // literal in this repository — not a value that ever came from a request.
  assert.match(
    readSource(path.join(PROJECT_ROOT, "src/app/layout.tsx")),
    /dangerouslySetInnerHTML=\{\{\s*__html:/,
    "the allowlisted usage must be the { __html } shim",
  )

  // Comment mentions are recorded so the distinction stays visible: prose about
  // the absence of the API is documentation, an `=` makes it executable.
  assert.ok(
    mentions.length >= 2,
    "the AI renderer and the share page document why they never inject markup; keep those notes",
  )
})

test("the motion-bearing surfaces keep a prefers-reduced-motion fallback", () => {
  for (const [file, minimum] of REDUCED_MOTION_SURFACES) {
    const source = readSource(path.join(PROJECT_ROOT, file))
    const occurrences = source.split("prefers-reduced-motion").length - 1

    assert.ok(
      occurrences >= minimum,
      `${file} must keep at least ${minimum} prefers-reduced-motion check(s); deleting one makes the animation unconditional again`,
    )
  }
})
