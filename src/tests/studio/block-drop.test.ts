/**
 * Dropping an AI block onto the design canvas.
 *
 * Two halves, tested for different reasons:
 *
 *   1. **The pure conversion** — `blockToElement` and `parseDroppedBlock` are the
 *      whole mapping from `ThemedBlock` to `CanvasElement`, and they run in plain
 *      Node, so every block type is pinned here: what it becomes, what it
 *      carries, and what is refused.
 *   2. **The wiring** — a conversion nothing calls and a drag nothing can accept
 *      would both be invisible failures: the canvas and the renderer sit on
 *      different surfaces, and only the payload type connects them. The last
 *      tests read those two files and assert the contract between them.
 */

import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import type { ThemedBlock } from "../../lib/ai/format-response"
import {
  LEARN_BLOCK_INDEX_MIME,
  LEARN_BLOCK_MIME,
  blockToElement,
  hasBlockDragPayload,
  parseDroppedBlock,
  readBlockDragPayload,
  setBlockDragPayload,
} from "../../lib/studio/block-drop"

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")

const AT = { x: 140, y: 260 }

const UNSAFE_IMAGE_URLS = [
  "javascript:alert(1)",
  "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
  "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
  "file:///etc/passwd",
]

/** A `DataTransfer` good enough for the three methods this feature uses. */
function fakeDataTransfer(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  const transfer = {
    get types() {
      return [...data.keys()]
    },
    getData: (type: string) => data.get(type) ?? "",
    setData: (type: string, value: string) => {
      data.set(type, value)
    },
    effectAllowed: "none",
  }
  return { transfer: transfer as unknown as DataTransfer, data }
}

// ---------------------------------------------------------------------------
// Every block type maps to an element
// ---------------------------------------------------------------------------

const ALL_BLOCKS: ThemedBlock[] = [
  { type: "heading", level: 2, text: "Cell division" },
  { type: "paragraph", text: "Mitosis produces two identical cells." },
  { type: "list", ordered: true, items: ["Interphase", "Prophase", "Metaphase"] },
  { type: "table", headers: ["Stage", "Duration"], rows: [["Prophase", "20 min"], ["Metaphase", "10 min"]] },
  { type: "code", language: "ts", code: "const cells = 2" },
  { type: "quote", text: "Every cell from a cell." },
  { type: "divider" },
  { type: "image", url: "https://example.com/mitosis.png", alt: "Mitosis diagram" },
  { type: "callout", tone: "warn", text: "Check the spindle fibres." },
  {
    type: "quiz",
    title: "Check yourself",
    questions: [{ question: "How many cells?", choices: [{ id: "a", text: "One" }, { id: "b", text: "Two" }], answerId: "b" }],
  },
  { type: "slideOutline", title: "Mitosis", slides: [{ title: "Prophase", bullets: ["Chromatin condenses"] }] },
]

test("every themed block type converts to a canvas element", () => {
  for (const block of ALL_BLOCKS) {
    const element = blockToElement(block, AT, 0)
    assert.ok(element, `${block.type} must convert`)
    assert.ok(["text", "image", "shape", "embed"].includes(element.type), `${block.type} must use an engine element type`)
    assert.equal(element.x, AT.x, `${block.type} must be placed at the pointer`)
    assert.equal(element.y, AT.y, `${block.type} must be placed at the pointer`)
    assert.ok(element.width > 0 && element.height > 0, `${block.type} must have a real box`)
    assert.equal(element.rotation, 0)
    assert.equal(element.locked, false)
    assert.equal(element.hidden, false)
  }
})

test("text-bearing blocks carry their text, styled by block type", () => {
  const heading = blockToElement({ type: "heading", level: 1, text: "Title" }, AT, 0)
  assert.equal(heading?.type, "text")
  assert.equal(heading?.content, "Title")
  assert.equal(heading?.style.fontSize, 36)
  assert.equal(heading?.style.fontWeight, 700)

  const smaller = blockToElement({ type: "heading", level: 4, text: "Smaller" }, AT, 0)
  assert.ok(Number(smaller?.style.fontSize) < Number(heading?.style.fontSize), "a deeper heading must be smaller")

  const paragraph = blockToElement({ type: "paragraph", text: "Body text" }, AT, 0)
  assert.equal(paragraph?.type, "text")
  assert.equal(paragraph?.content, "Body text")
  assert.equal(paragraph?.style.fontSize, 18)
  assert.equal(paragraph?.style.fontWeight, 400)

  const quote = blockToElement({ type: "quote", text: "Quoted" }, AT, 0)
  assert.equal(quote?.content, "Quoted")
  assert.ok(quote?.style.backgroundColor, "a quote must be visually distinct from a paragraph")

  const code = blockToElement({ type: "code", language: "ts", code: "const x = 1" }, AT, 0)
  assert.equal(code?.content, "const x = 1")
  assert.ok(code?.style.backgroundColor, "a code block must be visually distinct from a paragraph")

  const callout = blockToElement({ type: "callout", tone: "success", text: "Well done" }, AT, 0)
  assert.equal(callout?.content, "Well done")
  const otherTone = blockToElement({ type: "callout", tone: "warn", text: "Well done" }, AT, 0)
  assert.notEqual(callout?.style.backgroundColor, otherTone?.style.backgroundColor, "tones must differ")
})

test("a list keeps its items and its ordering", () => {
  const ordered = blockToElement({ type: "list", ordered: true, items: ["One", "Two"] }, AT, 0)
  assert.equal(ordered?.content, "1. One\n2. Two")

  const unordered = blockToElement({ type: "list", ordered: false, items: ["One", "Two"] }, AT, 0)
  assert.equal(unordered?.content, "- One\n- Two")
})

test("a table becomes text with one line per row, not a new element type", () => {
  const element = blockToElement(
    { type: "table", headers: ["Stage", "Duration"], rows: [["Prophase", "20 min"], ["Metaphase", "10 min"]] },
    AT,
    0,
  )

  assert.equal(element?.type, "text", "a table must not invent an element type")
  assert.equal(element?.content, "Stage | Duration\nProphase | 20 min\nMetaphase | 10 min")
  // The box has to grow with the rows, or the last line is clipped on drop.
  const taller = blockToElement(
    { type: "table", headers: ["Stage"], rows: Array.from({ length: 20 }, (_, index) => [`Row ${index}`]) },
    AT,
    0,
  )
  assert.ok(Number(taller?.height) > Number(element?.height))
})

test("a quiz and a slide outline become readable outlines", () => {
  const quiz = blockToElement(
    {
      type: "quiz",
      title: "Check yourself",
      questions: [
        { question: "How many cells?", choices: [{ id: "a", text: "One" }, { id: "b", text: "Two" }], answerId: "b" },
      ],
    },
    AT,
    0,
  )
  assert.equal(quiz?.type, "text")
  assert.match(String(quiz?.content), /Check yourself/)
  assert.match(String(quiz?.content), /1\. How many cells\?/)
  assert.match(String(quiz?.content), /a\. One/)
  assert.match(String(quiz?.content), /Answer: b/)

  const deck = blockToElement(
    { type: "slideOutline", title: "Mitosis", slides: [{ title: "Prophase", bullets: ["Chromatin condenses"] }] },
    AT,
    0,
  )
  assert.match(String(deck?.content), /Mitosis/)
  assert.match(String(deck?.content), /Slide 1: Prophase/)
  assert.match(String(deck?.content), /- Chromatin condenses/)
})

test("a divider becomes a thin shape, an image becomes an image", () => {
  const divider = blockToElement({ type: "divider" }, AT, 0)
  assert.equal(divider?.type, "shape")
  assert.ok(Number(divider?.height) <= 8, "a divider must be thin")
  assert.ok(Number(divider?.width) > Number(divider?.height))

  const image = blockToElement({ type: "image", url: "https://example.com/a.png", alt: "A diagram" }, AT, 0)
  assert.equal(image?.type, "image")
  assert.equal(image?.content, "https://example.com/a.png")
  assert.equal(image?.style.name, "A diagram", "the alt text must survive as the layer name")
})

// ---------------------------------------------------------------------------
// Refusals — the mutation target is the URL allowlist
// ---------------------------------------------------------------------------

test("an image whose URL fails the allowlist is never placed", () => {
  for (const url of UNSAFE_IMAGE_URLS) {
    assert.equal(parseDroppedBlock(JSON.stringify({ type: "image", url, alt: "x" })), null, `${url} must not parse`)
    assert.equal(blockToElement({ type: "image", url, alt: "x" }, AT, 0), null, `${url} must not become an element`)
  }

  // The allowed schemes still work, so the check is an allowlist and not a ban.
  for (const url of ["http://example.com/a.png", "https://example.com/a.png", "data:image/png;base64,iVBORw0KGgo="]) {
    assert.ok(blockToElement({ type: "image", url, alt: "" }, AT, 0), `${url} must be accepted`)
  }
})

test("junk and unrepresentable blocks are refused rather than guessed at", () => {
  for (const raw of ["", "  ", "not json", "[]", "null", "42", '{"type":"future-block"}', '{"type":"heading"}', '{"type":"divider","x":1}']) {
    const parsed = parseDroppedBlock(raw)
    if (raw === '{"type":"divider","x":1}') {
      assert.ok(parsed, "a divider carries no content, so it is always valid")
      continue
    }
    assert.equal(parsed, null, `${JSON.stringify(raw)} must be refused`)
  }

  // A quiz question with fewer than two choices is not answerable anywhere in
  // the app, so it is not worth an element either.
  assert.equal(parseDroppedBlock(JSON.stringify({ type: "quiz", title: "x", questions: [{ question: "q", choices: [{ id: "a", text: "one" }] }] })), null)
  assert.equal(parseDroppedBlock(JSON.stringify({ type: "list", ordered: false, items: [] })), null)
  assert.equal(parseDroppedBlock(JSON.stringify({ type: "callout", tone: "warn", text: "   " })), null)
})

test("a parsed block is re-derived, not cast: unknown fields and oversized lists are dropped", () => {
  const parsed = parseDroppedBlock(JSON.stringify({ type: "list", ordered: true, items: ["a", "b"], onclick: "alert(1)" }))
  assert.deepEqual(parsed, { type: "list", ordered: true, items: ["a", "b"] })

  const huge = parseDroppedBlock(JSON.stringify({ type: "list", ordered: false, items: Array.from({ length: 5000 }, (_, index) => `item ${index}`) }))
  assert.equal(huge?.type === "list" ? huge.items.length : 0, 200, "a hostile payload must be capped")

  const badLevel = parseDroppedBlock(JSON.stringify({ type: "heading", level: 99, text: "Hi" }))
  assert.deepEqual(badLevel, { type: "heading", level: 2, text: "Hi" }, "an unknown level falls back to a real one")
})

// ---------------------------------------------------------------------------
// Drag payload round trip
// ---------------------------------------------------------------------------

test("the drag payload round-trips the block and its index", () => {
  const { transfer, data } = fakeDataTransfer()
  const block: ThemedBlock = { type: "paragraph", text: "Dragged" }

  setBlockDragPayload(transfer, block, 3)

  assert.equal(data.get(LEARN_BLOCK_MIME), JSON.stringify(block), "the payload is the block JSON")
  assert.equal(data.get(LEARN_BLOCK_INDEX_MIME), "3")
  assert.equal(transfer.effectAllowed, "copy")
  assert.deepEqual(readBlockDragPayload(transfer), { block, index: 3 })
})

test("reading a drag that carries no block answers null, and an index defaults to 0", () => {
  const empty = fakeDataTransfer({ "text/plain": "hello" })
  assert.equal(hasBlockDragPayload(empty.transfer), false, "a plain text drag is not a block drag")
  assert.equal(hasBlockDragPayload(null), false)
  assert.equal(readBlockDragPayload(empty.transfer), null)

  const noIndex = fakeDataTransfer({ [LEARN_BLOCK_MIME]: JSON.stringify({ type: "paragraph", text: "x" }) })
  assert.equal(hasBlockDragPayload(noIndex.transfer), true)
  assert.equal(readBlockDragPayload(noIndex.transfer)?.index, 0)

  const negative = fakeDataTransfer({ [LEARN_BLOCK_MIME]: JSON.stringify({ type: "paragraph", text: "x" }), [LEARN_BLOCK_INDEX_MIME]: "-4" })
  assert.equal(readBlockDragPayload(negative.transfer)?.index, 0)

  const unsafe = fakeDataTransfer({ [LEARN_BLOCK_MIME]: JSON.stringify({ type: "image", url: "javascript:alert(1)" }) })
  assert.equal(readBlockDragPayload(unsafe.transfer), null, "an unsafe block must not survive the drop")
})

test("dropping the same block twice produces two elements, not one replacement", () => {
  const block: ThemedBlock = { type: "paragraph", text: "Same text" }
  const first = blockToElement(block, AT, 2)
  const second = blockToElement(block, { x: AT.x + 40, y: AT.y + 40 }, 2)

  assert.ok(first && second)
  assert.notEqual(first.id, second.id, "identical blocks dropped twice must not share an id")
  assert.match(first.id, /^ai-block-2-paragraph-/, "the id must carry the block's index and type")
  assert.match(second.id, /^ai-block-2-paragraph-/)
})

// ---------------------------------------------------------------------------
// Wiring — the two halves only meet if both files honour the payload
// ---------------------------------------------------------------------------

function readSource(relativePath: string): string {
  const filePath = path.join(PROJECT_ROOT, relativePath)
  assert.ok(fs.existsSync(filePath), `${relativePath} must exist`)
  return fs.readFileSync(filePath, "utf8")
}

test("the design canvas accepts a dropped block and commits it as one step", () => {
  const source = readSource("src/components/learn/design/design-stage.tsx")

  assert.match(
    source,
    /import\s*\{[^}]*\bblockToElement\b[^}]*\bhasBlockDragPayload\b[^}]*\breadBlockDragPayload\b[^}]*\}\s*from\s*"@\/lib\/studio\/block-drop"/,
    "the canvas must read the drop through the shared payload helpers",
  )
  assert.match(source, /onDragOver=/, "the stage must accept dragover")
  assert.match(source, /onDrop=\{drop\}/, "the stage must accept the drop")
  assert.match(source, /api\.insertElements\(\[adaptDroppedElement\(/, "AI blocks use the same insertion command as palette elements")
  const controller = readSource("src/components/learn/design/use-design-controller.ts")
  assert.match(controller, /update\(\(doc\) => insertDesignElements\(/, "the shared insertion enters document history once")
  // Coordinates, frame replacement, selection and undo are exercised as actual
  // state transitions in design/editor-integration.test.ts, rather than guessed
  // from the spelling of a view-local implementation.
})

test("the AI block renderer starts a drag carrying the block payload", () => {
  const source = readSource("src/components/learn/ai-block-renderer.tsx")

  assert.match(
    source,
    /import\s*\{[^}]*\bsetBlockDragPayload\b[^}]*\}\s*from\s*"@\/lib\/studio\/block-drop"/,
    "the renderer must write the payload the canvas reads",
  )
  assert.match(source, /function startBlockDrag\(/, "the drag must be started in one place")
  assert.match(source, /setBlockDragPayload\(event\.dataTransfer, block, index\)/, "the payload must carry the block and its index")

  // The grip is always draggable and the whole block is draggable when asked, so
  // both have to start the same drag.
  const handleStart = source.slice(source.indexOf('className="learn-block__handle"'), source.indexOf("<BlockBody"))
  assert.match(handleStart, /onDragStart=\{\(event\) => startBlockDrag\(event, block, index\)\}/, "the grip must start the block drag")
})

test("the block payload type has exactly one definition", () => {
  const blockDrop = readSource("src/lib/studio/block-drop.ts")
  assert.match(blockDrop, /export const LEARN_BLOCK_MIME = "application\/x-learn-block"/)
  assert.equal(LEARN_BLOCK_MIME, "application/x-learn-block")

  // A second copy of the literal elsewhere would be a drag that can never be
  // dropped, which no test of either half alone would catch.
  for (const relativePath of ["src/components/learn/design/design-stage.tsx", "src/components/learn/ai-block-renderer.tsx"]) {
    assert.equal(
      readSource(relativePath).includes("application/x-learn-block"),
      false,
      `${relativePath} must import the payload type, not spell it out`,
    )
  }
})
