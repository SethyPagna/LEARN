import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
const MODULE_PATH = path.join(PROJECT_ROOT, "src", "lib", "ai", "format-response.ts")
const RENDERER_PATH = path.join(PROJECT_ROOT, "src", "components", "learn", "ai-block-renderer.tsx")
const AI_VIEW_PATH = path.join(PROJECT_ROOT, "src", "components", "learn", "views", "ai-view.tsx")

/**
 * "Never raw, never unsafe" guards.
 *
 * The product promise is that any AI reply renders themed and structured, and
 * never as live markup. Both halves fail silently: a stray import makes the
 * normalizer untestable in plain Node, and one `dangerouslySetInnerHTML` (or a
 * dropped sanitizer) turns untrusted model output into an injection point.
 * Neither breaks a build or a call site, so they are pinned by reading the
 * files instead.
 */

function read(filePath: string): string {
  assert.ok(fs.existsSync(filePath), `${path.relative(PROJECT_ROOT, filePath)} must exist`)
  return fs.readFileSync(filePath, "utf8")
}

/**
 * Assertions about what the code *emits* must not trip over prose: these files
 * document their own rules, and `"dangerouslySetInnerHTML"` in a comment is not
 * a call.
 */
function readCode(filePath: string): string {
  return read(filePath).replace(/\/\*[\s\S]*?\*\//g, "")
}

/** The normalizer must stay pure: no imports, no I/O, no clock, no randomness. */
test("the AI response normalizer stays dependency-free and pure", () => {
  const source = read(MODULE_PATH)

  assert.doesNotMatch(source, /^\s*import\s/m, "format-response.ts must not import anything")
  assert.doesNotMatch(source, /\brequire\s*\(/, "format-response.ts must not require anything")
  assert.doesNotMatch(source, /\bdocument\b|\bwindow\b/, "format-response.ts must not touch the DOM")
  assert.doesNotMatch(source, /Math\.random/, "format-response.ts must be deterministic")
  assert.doesNotMatch(source, /new Date\s*\(|Date\.now\s*\(/, "format-response.ts must not read the clock")
})

test("the normalizer exports the documented surface", () => {
  const source = read(MODULE_PATH)

  for (const name of ["formatAiResponse", "blocksToPlainText", "blocksToThemedHtml", "isSafeUrl"]) {
    assert.match(source, new RegExp(`export function ${name}\\(`), `format-response.ts must export ${name}`)
  }
  for (const name of ["ThemedBlock", "FormatAiResponseInput", "QuizQuestion"]) {
    assert.match(source, new RegExp(`export (?:type|interface) ${name}\\b`), `format-response.ts must export ${name}`)
  }
  for (const block of ["heading", "paragraph", "list", "table", "code", "quote", "divider", "image", "callout", "quiz", "slideOutline"]) {
    assert.match(source, new RegExp(`type: "${block}"`), `the block union must cover ${block}`)
  }
  assert.match(source, /export type ResponseSourceFormat = "json" \| "markdown" \| "text"/, "the source format union must be documented")
})

/** Untrusted model output must never reach the DOM as markup. */
test("the block renderer never injects HTML and never frames remote content", () => {
  const source = readCode(RENDERER_PATH)

  assert.doesNotMatch(source, /dangerouslySetInnerHTML/, "the renderer must render text nodes, not HTML strings")
  assert.doesNotMatch(source, /<iframe/i, "the renderer must not frame remote content")
  assert.doesNotMatch(source, /document\.write|innerHTML\s*=/, "the renderer must not write markup imperatively")
  assert.match(source, /^"use client"/, "the renderer is a client component")
  assert.match(source, /isSafeUrl/, "the renderer must re-validate image URLs before using them")
  assert.match(source, /data-block-id=/, "blocks must expose a stable id for a future canvas")
  assert.match(source, /draggable/, "blocks must expose drag hooks for a future canvas")
})

test("the AI result panel renders formatted blocks beside the raw reply", () => {
  const source = read(AI_VIEW_PATH)

  assert.match(source, /import \{ AiBlockRenderer \} from "\.\.\/ai-block-renderer"/, "ai-view must import the renderer")
  assert.match(source, /formatAiResponse\(\{ reply \}\)/, "ai-view must normalize the current reply")
  assert.match(source, /<AiBlockRenderer blocks=\{formattedReply\.blocks\}/, "ai-view must render the formatted blocks")
  assert.match(source, /\{reply\}/, "the existing raw rendering path must stay intact")
})

test("the themed HTML serializer emits class names only", () => {
  const source = readCode(MODULE_PATH)

  assert.match(source, /learn-block learn-block--/, "themed markup must use app class names")
  assert.doesNotMatch(source, /<script\b/i, "themed markup must not emit scripts")
  assert.doesNotMatch(source, /<iframe/i, "themed markup must not emit iframes")
  assert.doesNotMatch(source, /\son[a-z]+\s*=/i, "themed markup must not emit event handler attributes")
})
