/**
 * Manual authoring parity — the same content, two paths, one output.
 *
 * The product clause under test is literal: *for every content type the AI
 * supports, a user can start from a blank item, build it manually with the same
 * tools, and produce output that is visually and structurally equal to the AI
 * path.* That is a claim about the *mappers*, and it is only settled by running
 * both of them over the same content and comparing the bytes they hand to the
 * writers — not by reading the source.
 *
 * The two paths, per content type:
 *
 *   documents  AI:  reply (JSON or markdown) -> `formatAiResponse` -> `ThemedBlock[]`
 *              manual: editor HTML -> `blocksFromDocumentHtml` -> `ThemedBlock[]`
 *              output: `buildDocx` / `buildPdf` (fixed date, so bytes are comparable)
 *   sheets     AI:  reply -> `buildInsertBackPayload("sheet-rows")` -> cells
 *              manual: the `cells` grid the sheet editor posts
 *              output: `buildXlsx`
 *   slides     AI:  reply -> `formatAiResponse` outline, and -> insert-back deck
 *              manual: the `slides` payload the deck editor posts
 *              output: the outline (PPTX is browser-only — see below)
 *   quizzes    AI:  reply -> `formatAiResponse` quiz block
 *              manual: the `questions` payload `/api/quizzes` accepts
 *              output: question text, choice ids/texts, correct-answer ids
 *   canvas     AI:  block -> `parseDroppedBlock` -> `blockToElement`
 *              manual: `createElement`
 *              output: `serializeCanvas`
 *
 * Each fixture below is expressed **once**, as a neutral spec, and encoded into
 * the AI reply and the editor payload from that one object — otherwise the test
 * would only prove that two hand-written literals match.
 *
 * What the test is allowed to find, and what it does with it:
 *
 *   - **identical** — byte-equal output. Nothing to say.
 *   - **structurally equal** — the output differs only in a construct that is
 *     not content, with a `TODO` below naming the exact pair and why.
 *   - **divergent** — the mappers disagree about content. That is a bug, and it
 *     fails the suite.
 *
 * Nothing here is a proxy for the criterion: the DOCX/PDF/XLSX writers are
 * deterministic for a fixed date, so byte equality of the produced files is the
 * criterion itself, and `serializeCanvas` is the canvas's own export format.
 */

import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { formatAiResponse, type ThemedBlock } from "../../lib/ai/format-response"
import { buildInsertBackPayload } from "../../lib/ai/insert-back"
import { buildDocx } from "../../lib/export/docx"
import { blocksFromDocumentHtml } from "../../lib/export/html-blocks"
import { buildPdf } from "../../lib/export/pdf"
import { documentHtmlToDocx, documentHtmlToPdf, sheetCellsToXlsx } from "../../lib/export/studio-export"
import { buildXlsx } from "../../lib/export/xlsx"
import { blockToElement, parseDroppedBlock, type BlockDropPoint } from "../../lib/studio/block-drop"
import {
  addElement,
  createCanvasDoc,
  createElement,
  serializeCanvas,
  type CanvasDoc,
  type CanvasElement,
  type CanvasElementType,
} from "../../lib/studio/canvas-engine"
import { blankDeckSlides, blankSheetCells } from "../../lib/studio-defaults"

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")

/** One fixed instant for every writer, so two runs of the same input are comparable. */
const FIXED_DATE = new Date(Date.UTC(2026, 8, 22, 12, 0, 0))

// ---------------------------------------------------------------------------
// Evidence helpers — a failure has to be readable, not mysterious
// ---------------------------------------------------------------------------

function bytesLabel(bytes: Uint8Array): string {
  return `${bytes.length} bytes sha256:${createHash("sha256").update(bytes).digest("hex").slice(0, 16)}`
}

/** Byte equality, reported with sizes and hashes so the match is visible. */
function assertSameBytes(what: string, left: Uint8Array, right: Uint8Array): void {
  if (Buffer.compare(Buffer.from(left), Buffer.from(right)) !== 0) {
    assert.fail(`${what} differs: AI ${bytesLabel(left)} vs manual ${bytesLabel(right)}`)
  }
  console.log(`  ${what}: identical — ${bytesLabel(left)}`)
}

/** The first place two block arrays disagree, as a diagnosable sentence. */
function firstBlockDivergence(left: ThemedBlock[], right: ThemedBlock[]): string | null {
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const a = left[index]
    const b = right[index]
    if (!a || !b) {
      return `block #${index}: ${a ? `${a.type} ${JSON.stringify(textOfBlock(a))}` : "missing"} on the left vs ${b ? `${b.type} ${JSON.stringify(textOfBlock(b))}` : "missing"} on the right`
    }
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      return [
        `block #${index} diverges:`,
        `  left  ${a.type}: ${JSON.stringify(textOfBlock(a))} ${extraOf(a)}`,
        `  right ${b.type}: ${JSON.stringify(textOfBlock(b))} ${extraOf(b)}`,
      ].join("\n")
    }
  }
  return null
}

function textOfBlock(block: ThemedBlock): string {
  switch (block.type) {
    case "heading":
    case "paragraph":
    case "quote":
    case "callout":
      return block.text
    case "list":
      return block.items.join(" / ")
    case "table":
      return [...block.headers, ...block.rows.map((row) => row.join(" | "))].join(" / ")
    case "code":
      return block.code
    case "image":
      return block.url
    case "divider":
      return ""
    case "quiz":
      return block.questions.map((question) => question.question).join(" / ")
    case "slideOutline":
      return block.slides.map((slide) => slide.title).join(" / ")
    default:
      return ""
  }
}

function extraOf(block: ThemedBlock): string {
  if (block.type === "heading") return `level=${block.level}`
  if (block.type === "code") return `language=${block.language}`
  if (block.type === "list") return `ordered=${block.ordered}`
  if (block.type === "table") return `headers=${block.headers.length} rows=${block.rows.length}`
  if (block.type === "callout") return `tone=${block.tone}`
  if (block.type === "quiz") return `questions=${block.questions.length}`
  if (block.type === "slideOutline") return `slides=${block.slides.length}`
  return ""
}

function assertSameBlocks(what: string, left: ThemedBlock[], right: ThemedBlock[]): void {
  const divergence = firstBlockDivergence(left, right)
  assert.equal(divergence, null, `${what} produced different blocks:\n${divergence ?? ""}`)
}

// ---------------------------------------------------------------------------
// Documents — one spec, three encodings
// ---------------------------------------------------------------------------

type DocumentSpecItem =
  | { kind: "heading"; level: 1 | 2; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "bullets"; items: string[] }
  | { kind: "table"; headers: string[]; rows: string[][] }
  | { kind: "code"; language: string; code: string }

interface DocumentSpec {
  title: string
  items: DocumentSpecItem[]
}

/** Title, H1/H2, paragraphs, a bullet list, a 3-column table, a fenced code block. */
const DOCUMENT_SPEC: DocumentSpec = {
  title: "Photosynthesis",
  items: [
    { kind: "heading", level: 1, text: "Photosynthesis" },
    { kind: "paragraph", text: "Plants convert light energy into chemical energy." },
    { kind: "paragraph", text: "The light reaction happens in the thylakoid membrane." },
    { kind: "heading", level: 2, text: "Checklist" },
    {
      kind: "bullets",
      items: ["Chloroplasts contain chlorophyll", "Light splits water", "ATP and NADPH are produced"],
    },
    {
      kind: "table",
      headers: ["Stage", "Where", "Output"],
      rows: [
        ["Light reaction", "Thylakoid", "ATP"],
        ["Calvin cycle", "Stroma", "Glucose"],
      ],
    },
    { kind: "code", language: "js", code: "const atp = 32\nconst nadph = 24" },
  ],
}

/**
 * The editor HTML a person produces with the rich-text editor.
 *
 * Written the way TipTap actually serializes its schema — a `<p>` inside every
 * list item and table cell, `colspan`/`rowspan` on cells, and the language in a
 * `class` on the `<code>` — because `blocksFromDocumentHtml` is a tolerant
 * reader of *that* markup, not of hand-minimized HTML.
 */
function documentSpecToEditorHtml(spec: DocumentSpec): string {
  return spec.items
    .map((item) => {
      switch (item.kind) {
        case "heading":
          return `<h${item.level}>${item.text}</h${item.level}>`
        case "paragraph":
          return `<p>${item.text}</p>`
        case "bullets":
          return `<ul>${item.items.map((entry) => `<li><p>${entry}</p></li>`).join("")}</ul>`
        case "table": {
          const head = `<tr>${item.headers.map((header) => `<th colspan="1" rowspan="1"><p>${header}</p></th>`).join("")}</tr>`
          const body = item.rows
            .map((row) => `<tr>${row.map((cell) => `<td colspan="1" rowspan="1"><p>${cell}</p></td>`).join("")}</tr>`)
            .join("")
          return `<table><tbody>${head}${body}</tbody></table>`
        }
        case "code":
          return `<pre><code class="language-${item.language}">${item.code}</code></pre>`
        default:
          return ""
      }
    })
    .join("")
}

/** The same content as a markdown reply a model would send back. */
function documentSpecToMarkdownReply(spec: DocumentSpec): string {
  const lines: string[] = []
  for (const item of spec.items) {
    switch (item.kind) {
      case "heading":
        lines.push(`${"#".repeat(item.level)} ${item.text}`, "")
        break
      case "paragraph":
        lines.push(item.text, "")
        break
      case "bullets":
        lines.push(...item.items.map((entry) => `- ${entry}`), "")
        break
      case "table":
        lines.push(
          `| ${item.headers.join(" | ")} |`,
          `| ${item.headers.map(() => "---").join(" | ")} |`,
          ...item.rows.map((row) => `| ${row.join(" | ")} |`),
          "",
        )
        break
      case "code":
        lines.push("```" + item.language, item.code, "```", "")
        break
      default:
        break
    }
  }
  return lines.join("\n").trim()
}

/** The same content as the JSON payload a model would send back. */
function documentSpecToJsonReply(spec: DocumentSpec): string {
  return JSON.stringify({
    title: spec.title,
    blocks: spec.items.map((item) => {
      switch (item.kind) {
        case "heading":
          return { type: "heading", level: item.level, text: item.text }
        case "paragraph":
          return { type: "paragraph", text: item.text }
        case "bullets":
          return { type: "list", ordered: false, items: item.items }
        case "table":
          return { type: "table", headers: item.headers, rows: item.rows }
        case "code":
          return { type: "code", language: item.language, code: item.code }
        default:
          return null
      }
    }),
  })
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

test("documents: the AI replies and the editor HTML produce the same blocks", () => {
  const manual = blocksFromDocumentHtml(documentSpecToEditorHtml(DOCUMENT_SPEC))
  const fromJson = formatAiResponse({ reply: documentSpecToJsonReply(DOCUMENT_SPEC) })
  const fromMarkdown = formatAiResponse({ reply: documentSpecToMarkdownReply(DOCUMENT_SPEC) })

  assert.equal(fromJson.sourceFormat, "json", "the JSON reply must be detected as JSON")
  assert.equal(fromMarkdown.sourceFormat, "markdown", "the markdown reply must be detected as markdown")
  // A warning means the normalizer dropped, capped or degraded something on the
  // way in; parity is only meaningful when nothing was lost.
  assert.deepEqual(fromJson.warnings, [], "the AI JSON path must not warn")
  assert.deepEqual(fromMarkdown.warnings, [], "the AI markdown path must not warn")

  assertSameBlocks("AI JSON vs editor HTML", fromJson.blocks, manual)
  assertSameBlocks("AI markdown vs editor HTML", fromMarkdown.blocks, manual)
  assertSameBlocks("AI JSON vs AI markdown", fromJson.blocks, fromMarkdown.blocks)
  assert.deepEqual(fromJson.blocks, manual)
})

test("documents: both paths write byte-identical DOCX and PDF for a fixed date", () => {
  const html = documentSpecToEditorHtml(DOCUMENT_SPEC)
  const aiJson = formatAiResponse({ reply: documentSpecToJsonReply(DOCUMENT_SPEC) }).blocks
  const aiMarkdown = formatAiResponse({ reply: documentSpecToMarkdownReply(DOCUMENT_SPEC) }).blocks

  const manualDocx = documentHtmlToDocx({ title: DOCUMENT_SPEC.title, html, date: FIXED_DATE })
  const manualPdf = documentHtmlToPdf({ title: DOCUMENT_SPEC.title, html, date: FIXED_DATE })

  console.log(`documents: editor HTML -> ${aiJson.length} blocks`)
  assertSameBytes("DOCX AI-JSON vs manual", buildDocx({ title: DOCUMENT_SPEC.title, blocks: aiJson, date: FIXED_DATE }), manualDocx)
  assertSameBytes("DOCX AI-markdown vs manual", buildDocx({ title: DOCUMENT_SPEC.title, blocks: aiMarkdown, date: FIXED_DATE }), manualDocx)
  assertSameBytes("PDF AI-JSON vs manual", buildPdf({ title: DOCUMENT_SPEC.title, blocks: aiJson, createdAt: FIXED_DATE }), manualPdf)
  assertSameBytes("PDF AI-markdown vs manual", buildPdf({ title: DOCUMENT_SPEC.title, blocks: aiMarkdown, createdAt: FIXED_DATE }), manualPdf)

  // A fixed date is what makes the comparison legitimate; without it the ZIP
  // entry stamps and the core properties would move with the clock.
  const later = new Date(FIXED_DATE.getTime() + 86_400_000)
  assert.notEqual(
    bytesLabel(buildDocx({ title: DOCUMENT_SPEC.title, blocks: aiJson, date: later })),
    bytesLabel(manualDocx),
    "the fixture must be date-sensitive, or byte equality would prove nothing",
  )
})

// ---------------------------------------------------------------------------
// Sheets
// ---------------------------------------------------------------------------

/** Column headers plus two data rows — the matrix a person types by hand. */
const SHEET_SPEC: { title: string; cells: string[][] } = {
  title: "Study tracker",
  cells: [
    ["Topic", "Status", "Score", "Next step"],
    ["React", "Review", "72", "Practice hooks"],
    ["Databases", "Weak", "48", "Index questions"],
  ],
}

test("sheets: the AI cells and the editor's cells are the same values and types", () => {
  const reply = JSON.stringify({ title: SHEET_SPEC.title, columns: SHEET_SPEC.cells[0], rows: SHEET_SPEC.cells.slice(1) })
  const aiPayload = buildInsertBackPayload("sheet-rows", reply)
  const aiCells = aiPayload.body.cells as string[][]

  // The editor's own payload: the same grid inside the 12x6 canvas a new sheet
  // starts life with (`blankSheetCells`), which is what `POST /api/sheets`
  // receives from a hand-authored sheet.
  const editorCells = blankSheetCells.map((row, rowIndex) =>
    row.map((value, columnIndex) => SHEET_SPEC.cells[rowIndex]?.[columnIndex] ?? value),
  )

  assert.deepEqual(aiCells, SHEET_SPEC.cells, "the AI cells must be the spec")
  for (const [rowIndex, row] of editorCells.entries()) {
    for (const [columnIndex, value] of row.entries()) {
      assert.equal(typeof value, "string", `editor cell ${rowIndex}:${columnIndex} must be a string`)
      assert.equal(value, SHEET_SPEC.cells[rowIndex]?.[columnIndex] ?? "", `editor cell ${rowIndex}:${columnIndex} must match the spec`)
    }
  }
  // Both paths hold text: neither the AI cell mapper nor the sheet editor has a
  // numeric cell type, so "values and types equal" means exactly this.
  assert.equal(aiCells.every((row) => row.every((cell) => typeof cell === "string")), true)
})

test("sheets: the AI cells and the editor's cells write byte-identical XLSX", () => {
  const reply = JSON.stringify({ title: SHEET_SPEC.title, columns: SHEET_SPEC.cells[0], rows: SHEET_SPEC.cells.slice(1) })
  const aiCells = buildInsertBackPayload("sheet-rows", reply).body.cells as string[][]
  const editorCells = blankSheetCells.map((row, rowIndex) =>
    row.map((value, columnIndex) => SHEET_SPEC.cells[rowIndex]?.[columnIndex] ?? value),
  )

  const aiXlsx = buildXlsx({ title: SHEET_SPEC.title, cells: aiCells, date: FIXED_DATE })
  const manualXlsx = sheetCellsToXlsx({ title: SHEET_SPEC.title, cells: editorCells, date: FIXED_DATE })
  assertSameBytes("XLSX AI cells vs editor grid", aiXlsx, manualXlsx)
})

// ---------------------------------------------------------------------------
// Slides
// ---------------------------------------------------------------------------

interface SlideSpec {
  title: string
  bullets: string[]
}

const SLIDE_SPEC: SlideSpec[] = [
  { title: "Hook", bullets: ["Why this matters", "One sharp question"] },
  { title: "Key idea", bullets: ["One visual explanation"] },
  { title: "Practice", bullets: ["Recall one example", "Say it out loud"] },
]

/**
 * The deck editor's payload. A slide's body holds its lines: that is the
 * convention the AI deck mapper uses too (its markdown fallback splits the reply
 * into `title` plus a newline-joined `body`), and it is what the deck editor's
 * body field stores.
 */
function manualDeckPayload(spec: SlideSpec[]) {
  return spec.map((slide, index) => ({
    ...blankDeckSlides[0],
    title: slide.title,
    accent: `Slide ${index + 1}`,
    body: slide.bullets.join("\n"),
  }))
}

function bulletsOf(body: string): string[] {
  return body.split("\n").map((line) => line.trim()).filter(Boolean)
}

test("slides: the AI outline and the manual outline have the same titles and bullets", () => {
  // The AI reply carries the bullets under both spellings the app's two readers
  // use: `bullets` for the reply panel's outline block, `body` for the deck
  // payload `insert-back` builds. See the note below — this is a real asymmetry.
  const reply = JSON.stringify({
    title: "Lesson deck",
    slides: SLIDE_SPEC.map((slide) => ({ title: slide.title, bullets: slide.bullets, body: slide.bullets.join("\n") })),
  })

  const outline = formatAiResponse({ reply }).blocks[0]
  assert.equal(outline.type, "slideOutline", "a slide reply must normalize to a slide outline")
  if (outline.type !== "slideOutline") return

  assert.deepEqual(outline.slides, SLIDE_SPEC, "the AI outline must carry the spec's titles and bullets")

  const manual = manualDeckPayload(SLIDE_SPEC)
  assert.deepEqual(
    manual.map((slide) => ({ title: slide.title, bullets: bulletsOf(slide.body) })),
    SLIDE_SPEC,
    "the manual deck's titles and bullets must be the spec",
  )
  assert.deepEqual(
    outline.slides.map((slide) => ({ title: slide.title, bullets: slide.bullets })),
    manual.map((slide) => ({ title: slide.title, bullets: bulletsOf(slide.body) })),
    "AI outline and manual deck must describe the same slides",
  )
})

test("slides: the AI deck payload and the manual deck payload agree on what they author", () => {
  const reply = JSON.stringify({
    title: "Lesson deck",
    slides: SLIDE_SPEC.map((slide, index) => ({
      title: slide.title,
      bullets: slide.bullets,
      body: slide.bullets.join("\n"),
      accent: `Slide ${index + 1}`,
      layout: "title",
      theme: "midnight",
      speakerNotes: "",
    })),
  })

  const aiSlides = buildInsertBackPayload("slide-outline", reply).body.slides as ReturnType<typeof manualDeckPayload>
  const manualSlides = manualDeckPayload(SLIDE_SPEC)

  assert.equal(aiSlides.length, manualSlides.length, "the decks must have the same slide count")
  for (const [index, aiSlide] of aiSlides.entries()) {
    const manualSlide = manualSlides[index]
    assert.equal(aiSlide.title, manualSlide.title, `slide ${index}: title`)
    assert.equal(aiSlide.body, manualSlide.body, `slide ${index}: body (the bullets)`)
    assert.equal(aiSlide.accent, manualSlide.accent, `slide ${index}: accent`)
    assert.equal(aiSlide.layout, manualSlide.layout, `slide ${index}: layout`)
    assert.equal(aiSlide.theme, manualSlide.theme, `slide ${index}: theme`)
    assert.equal(aiSlide.speakerNotes, manualSlide.speakerNotes, `slide ${index}: speaker notes`)
  }

  // TODO(parity): `insert-back`'s deck mapper emits no `background`, `transition`
  // or `animation` for a slide. The pair is exactly:
  //   AI     { title, body, accent, layout, theme, speakerNotes, objects }
  //   manual { …, background: "#111827", transition: "none", animation: "none", … }
  // (`objects` is present on the AI slide but always `undefined` for an outline
  // reply, and a JSON round-trip through storage drops the key.)
  // The deck loader (`slidesFromDeck` in `views/studio-view.tsx`) fills background,
  // transition and animation from the theme when the deck is opened — with
  // "#111827" for the midnight theme, i.e. the value the editor's blank slide
  // hardcodes — so the *loaded* decks converge. The payloads differ before that
  // load, and closing the gap would mean changing the insert-back payload shape
  // (a product change beyond this test), so it is recorded here rather than
  // asserted away.
  assert.deepEqual(
    Object.keys(aiSlides[0]).sort(),
    ["accent", "body", "layout", "objects", "speakerNotes", "theme", "title"],
    "if insert-back gains background/transition/animation, tighten this test",
  )
  assert.equal(blankDeckSlides[0].background, "#111827", "the manual blank slide's background is the midnight default the loader fills")
})

test("slides: the PPTX writer is browser-only, so the outline is the export compared here", () => {
  // Studio and Designs share the browser writer. The pure plan is covered by
  // design/from-deck tests; binary download still requires the browser runtime.
  const studioView = fs.readFileSync(path.join(PROJECT_ROOT, "src", "components", "learn", "views", "studio-view.tsx"), "utf8")
  const exporter = fs.readFileSync(path.join(PROJECT_ROOT, "src", "components", "learn", "design", "design-export.ts"), "utf8")
  assert.match(studioView, /exportDesign\(deckToDesign\(/)
  assert.match(exporter, /\/vendor\/pptxgen\.min\.js/)
  assert.match(exporter, /pptx\.writeFile\(/)

})

// ---------------------------------------------------------------------------
// Quizzes
// ---------------------------------------------------------------------------

interface QuizSpecQuestion {
  question: string
  choices: { id: string; text: string }[]
  correctAnswerId: string
  explanation: string
}

const QUIZ_SPEC: QuizSpecQuestion[] = [
  {
    question: "Which gas do plants absorb?",
    choices: [
      { id: "a", text: "Oxygen" },
      { id: "b", text: "Carbon dioxide" },
    ],
    correctAnswerId: "b",
    explanation: "CO2 enters through the stomata.",
  },
  {
    question: "Where does the Calvin cycle happen?",
    choices: [
      { id: "a", text: "Stroma" },
      { id: "b", text: "Thylakoid" },
      { id: "c", text: "Cytoplasm" },
    ],
    correctAnswerId: "a",
    explanation: "The stroma holds the enzymes that fix carbon.",
  },
]

/** The `questions` array `POST /api/quizzes` receives from the manual builder. */
function manualQuizPayload(spec: QuizSpecQuestion[]) {
  return spec.map((entry) => ({
    question: entry.question,
    choices: entry.choices,
    correct_answer_id: entry.correctAnswerId,
    topic: "Biology",
    explanation: entry.explanation,
  }))
}

/** One comparison shape for both spellings: `correct_answer_id` is the storage name. */
function canonicalQuestions(
  spec: { question: string; choices: { id: string; text: string }[]; answerId: string; explanation: string }[],
) {
  return spec.map((entry) => ({
    question: entry.question,
    choices: entry.choices.map((choice) => ({ id: choice.id, text: choice.text })),
    answerId: entry.answerId,
    explanation: entry.explanation,
  }))
}

test("quizzes: the AI quiz and the manual quiz payload agree on questions, choices and answers", () => {
  const reply = JSON.stringify({
    title: "Check yourself",
    questions: QUIZ_SPEC.map((entry) => ({
      question: entry.question,
      choices: entry.choices,
      answerId: entry.correctAnswerId,
      explanation: entry.explanation,
    })),
  })

  const block = formatAiResponse({ reply }).blocks[0]
  assert.equal(block.type, "quiz", "a quiz reply must normalize to a quiz block")
  if (block.type !== "quiz") return

  const aiQuestions = canonicalQuestions(
    block.questions.map((question) => ({
      question: question.question,
      choices: question.choices,
      answerId: question.answerId ?? "",
      explanation: question.explanation ?? "",
    })),
  )
  const manualQuestions = canonicalQuestions(
    manualQuizPayload(QUIZ_SPEC).map((entry) => ({
      question: entry.question,
      choices: entry.choices,
      answerId: entry.correct_answer_id,
      explanation: entry.explanation,
    })),
  )

  assert.deepEqual(aiQuestions, manualQuestions, "the AI quiz and the manual payload must describe the same questions")

  // The quiz also reaches a document writer: the AI block goes in as-is, and the
  // manual payload goes in through the one rename the two types define
  // (`correct_answer_id` -> `answerId`). Same questions, same file.
  const manualBlock: ThemedBlock = {
    type: "quiz",
    title: "Check yourself",
    questions: manualQuizPayload(QUIZ_SPEC).map((entry) => ({
      question: entry.question,
      choices: entry.choices,
      answerId: entry.correct_answer_id,
      explanation: entry.explanation,
    })),
  }
  assertSameBytes(
    "DOCX quiz AI block vs manual payload",
    buildDocx({ title: "Quiz", blocks: [block], date: FIXED_DATE }),
    buildDocx({ title: "Quiz", blocks: [manualBlock], date: FIXED_DATE }),
  )
})

test("quizzes: choice ids are the one thing the manual author has to type", () => {
  // The AI normalizer letters the choices when the reply omits their ids. The
  // manual builder has no such rule — the author types ids — so a reply without
  // ids and a manual payload converge only when the author uses the same letters.
  const reply = JSON.stringify({
    title: "Check yourself",
    questions: [
      {
        question: "Which gas do plants absorb?",
        choices: ["Oxygen", "Carbon dioxide"],
        answer: 1,
      },
    ],
  })

  const block = formatAiResponse({ reply }).blocks[0]
  assert.equal(block.type, "quiz")
  if (block.type !== "quiz") return
  assert.deepEqual(block.questions[0].choices, [{ id: "A", text: "Oxygen" }, { id: "B", text: "Carbon dioxide" }])
  assert.equal(block.questions[0].answerId, "B", "the numeric answer resolves to the lettered choice")

  const manual = manualQuizPayload([
    {
      question: "Which gas do plants absorb?",
      choices: [{ id: "A", text: "Oxygen" }, { id: "B", text: "Carbon dioxide" }],
      correctAnswerId: "B",
      explanation: "",
    },
  ])
  assert.deepEqual(
    block.questions[0].choices,
    manual[0].choices,
    "typed ids must match the letters the AI normalizer assigns",
  )
  assert.equal(block.questions[0].answerId, manual[0].correct_answer_id)
})

// ---------------------------------------------------------------------------
// Canvas
// ---------------------------------------------------------------------------

interface CanvasPlacement {
  /** The block the AI reply carries; it is dropped at `at`. */
  block: ThemedBlock
  at: BlockDropPoint
  /**
   * What a person sets in the inspector to make the same element by hand.
   *
   * The box is authored, not derived: the drop sizes a text element to fit its
   * content, and a person reaches the same box by dragging the handles. The
   * numbers below are that box, pinned on purpose — if the drop's sizing rule
   * changes, this test fails so the two paths are re-checked instead of
   * silently diverging.
   */
  authored: {
    type: CanvasElementType
    width: number
    height: number
    content: string
    style: Record<string, unknown>
  }
}

const CANVAS_SPEC: CanvasPlacement[] = [
  {
    block: { type: "heading", level: 2, text: "The light reaction" },
    at: { x: 140, y: 260 },
    authored: {
      type: "text",
      width: 520,
      height: 61,
      content: "The light reaction",
      style: { fontSize: 30, fontWeight: 700, color: "#1f2937" },
    },
  },
  {
    block: { type: "paragraph", text: "Plants convert light energy into chemical energy." },
    at: { x: 140, y: 360 },
    authored: {
      type: "text",
      width: 460,
      height: 70,
      content: "Plants convert light energy into chemical energy.",
      style: { fontSize: 18, fontWeight: 400, color: "#1f2937" },
    },
  },
  {
    block: { type: "list", ordered: true, items: ["Chloroplasts contain chlorophyll", "Light splits water"] },
    at: { x: 140, y: 460 },
    authored: {
      type: "text",
      width: 460,
      height: 70,
      content: "1. Chloroplasts contain chlorophyll\n2. Light splits water",
      style: { fontSize: 18, fontWeight: 400, color: "#1f2937" },
    },
  },
  {
    block: {
      type: "table",
      headers: ["Stage", "Where"],
      rows: [["Light reaction", "Thylakoid"], ["Calvin cycle", "Stroma"]],
    },
    at: { x: 640, y: 260 },
    authored: {
      type: "text",
      width: 520,
      height: 84,
      content: "Stage | Where\nLight reaction | Thylakoid\nCalvin cycle | Stroma",
      style: { fontSize: 15, fontWeight: 400, color: "#1f2937" },
    },
  },
  {
    block: { type: "code", language: "js", code: "const atp = 32" },
    at: { x: 640, y: 380 },
    authored: {
      type: "text",
      width: 560,
      height: 37,
      content: "const atp = 32",
      style: { fontSize: 14, fontWeight: 400, color: "#0f172a", backgroundColor: "#f8fafc", borderRadius: 12 },
    },
  },
  {
    block: { type: "callout", tone: "info", text: "Check the stomata." },
    at: { x: 640, y: 460 },
    authored: {
      type: "text",
      width: 460,
      height: 43,
      content: "Check the stomata.",
      style: { fontSize: 18, fontWeight: 500, backgroundColor: "#eef2ff", color: "#3730a3", borderRadius: 12 },
    },
  },
  {
    block: { type: "image", url: "https://example.com/leaf.png", alt: "Leaf cross-section" },
    at: { x: 140, y: 560 },
    authored: {
      type: "image",
      width: 320,
      height: 220,
      content: "https://example.com/leaf.png",
      style: { backgroundColor: "#f1f5f9", borderRadius: 16, label: "Leaf cross-section", name: "Leaf cross-section" },
    },
  },
  {
    block: { type: "divider" },
    at: { x: 640, y: 560 },
    authored: {
      type: "shape",
      width: 360,
      height: 4,
      content: "",
      style: { backgroundColor: "#cbd5e1", borderRadius: 2, name: "Divider" },
    },
  },
]

const CANVAS_DOC = { id: "parity-canvas", name: "Parity canvas", width: 1080, height: 720, background: "#ffffff" }

/** Path A: the AI reply's block, dropped onto the canvas. */
function dropDocument(placements: CanvasPlacement[]): CanvasDoc {
  let doc = createCanvasDoc(CANVAS_DOC)
  placements.forEach((placement, index) => {
    // Through the drag payload parser, like the editor does — a drop is
    // untrusted input, so the block is re-derived rather than cast.
    const parsed = parseDroppedBlock(JSON.stringify(placement.block))
    assert.ok(parsed, `the ${placement.block.type} payload must survive parseDroppedBlock`)
    const element = blockToElement(parsed, placement.at, index)
    assert.ok(element, `the ${placement.block.type} block must become an element`)
    doc = addElement(doc, element)
  })
  return doc
}

/** Path B: a person inserting and formatting each element by hand. */
function authorDocument(placements: CanvasPlacement[]): CanvasDoc {
  let doc = createCanvasDoc(CANVAS_DOC)
  for (const placement of placements) {
    doc = addElement(
      doc,
      createElement({
        type: placement.authored.type,
        x: placement.at.x,
        y: placement.at.y,
        width: placement.authored.width,
        height: placement.authored.height,
        content: placement.authored.content,
        style: placement.authored.style,
      }),
    )
  }
  return doc
}

test("canvas: a hand-made element is the element the block drop produces", () => {
  const dropped = dropDocument(CANVAS_SPEC).elements
  const authored = authorDocument(CANVAS_SPEC).elements

  assert.equal(dropped.length, CANVAS_SPEC.length)
  assert.equal(authored.length, CANVAS_SPEC.length)

  for (const [index, placement] of CANVAS_SPEC.entries()) {
    const ai = dropped[index]
    const manual = authored[index]
    // Everything a reader sees, plus the stacking the document keeps: identical.
    assert.deepEqual(
      { ...ai, id: "#" },
      { ...manual, id: "#" },
      `canvas element #${index} (${placement.block.type}) differs from the hand-made one`,
    )
    assert.equal(ai.z, index, "each drop lands on top of the stack, in spec order")
    assert.equal(canvasElementIsVisible(ai), true)
  }
})

test("canvas: both paths serialize to the same canvas once element ids are aligned", () => {
  const aiDoc = dropDocument(CANVAS_SPEC)
  const manualDoc = authorDocument(CANVAS_SPEC)

  const aiJson = serializeCanvas(aiDoc)
  const manualJson = serializeCanvas(manualDoc)

  // The one construct the paths legitimately disagree on is the element id:
  //   AI     `ai-block-<index>-<type>-<sequence>` (block-drop's per-call counter)
  //   manual `<type>_<counter>_<random>`          (createElement's generator)
  // TODO(parity): the id is a handle, not content — it never reaches a rendered
  // canvas — but it *is* in the export, so the two documents are not byte-equal
  // as written. Making them converge would mean either a deterministic id scheme
  // shared by both paths or dropping ids from `serializeCanvas`, both product
  // changes beyond this test. The pair, exactly:
  //   AI     "ai-block-0-heading-1"
  //   manual "text_7_k3f9qz"
  const masked = (json: string) => json.replace(/"id": "[^"]*"/g, '"id": "#"')
  assert.notEqual(aiJson, manualJson, "unmasked, the two documents must differ in the ids — otherwise this test is vacuous")
  assert.equal(masked(aiJson), masked(manualJson), "apart from element ids the two canvases must be byte-identical")
  assert.match(aiDoc.elements[0].id, /^ai-block-0-heading-/, "the dropped element's id names the block it came from")
  assert.equal(aiDoc.id, manualDoc.id, "the canvas-level identity is authored on both sides")

  console.log(`canvas: ${aiDoc.elements.length} elements — ${bytesLabel(new TextEncoder().encode(masked(aiJson)))} (ids masked)`)
  assertSameBytes(
    "canvas AI drop vs hand built (ids aligned)",
    new TextEncoder().encode(masked(aiJson)),
    new TextEncoder().encode(masked(manualJson)),
  )
})

function canvasElementIsVisible(element: CanvasElement): boolean {
  return element.hidden === false && element.locked === false && element.width > 0 && element.height > 0
}

// ---------------------------------------------------------------------------
// The guard: this file has to stay in the suite it claims to be part of
// ---------------------------------------------------------------------------

test("the parity test is picked up by the standard test runner", () => {
  const runner = fs.readFileSync(path.join(PROJECT_ROOT, "ops", "scripts", "test", "run-tests.ts"), "utf8")
  const pattern = /const TEST_FILE_PATTERN = (\/.+\/[a-z]*)/.exec(runner)?.[1]
  assert.ok(pattern, "the runner must declare a test-file pattern")
  assert.equal(pattern, "/\\.test\\.ts$/", "the runner's pattern must still match *.test.ts")

  const ownFile = fileURLToPath(import.meta.url)
  assert.match(path.basename(ownFile), new RegExp(pattern.slice(1, -1)), "this file must match the runner's pattern")
  assert.ok(
    path.relative(PROJECT_ROOT, ownFile).split(path.sep).slice(0, 2).join("/") === "src/tests",
    "this file must live under src/tests, the directory the runner walks",
  )
  assert.match(runner, /path\.resolve\(rootDir, "src", "tests"\)/, "the runner must walk src/tests")
})
