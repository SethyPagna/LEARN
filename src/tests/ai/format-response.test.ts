import assert from "node:assert/strict"
import test from "node:test"
import {
  blocksToPlainText,
  blocksToThemedHtml,
  formatAiResponse,
  isSafeUrl,
  type ThemedBlock,
} from "../../lib/ai/format-response"

function format(reply: string) {
  return formatAiResponse({ reply })
}

function blocksOf(reply: string): ThemedBlock[] {
  return format(reply).blocks
}

function firstBlock(reply: string): ThemedBlock {
  const blocks = blocksOf(reply)
  assert.ok(blocks.length > 0, "expected at least one block")
  return blocks[0]
}

// ---------------------------------------------------------------------------
// JSON shapes — detected by structure, not by a required key
// ---------------------------------------------------------------------------

test("a quiz payload becomes a quiz block with choices, answer, and explanation", () => {
  const reply = JSON.stringify({
    title: "Cell biology check",
    questions: [
      {
        question: "Which organelle makes ATP?",
        choices: [
          { id: "A", text: "Mitochondrion" },
          { id: "B", text: "Ribosome" },
        ],
        answerId: "A",
        explanation: "Mitochondria run oxidative phosphorylation.",
      },
      {
        question: "Where is DNA stored?",
        choices: ["Nucleus", "Golgi"],
        answer: "A",
      },
    ],
  })

  const result = format(reply)
  assert.equal(result.sourceFormat, "json")
  assert.deepEqual(result.shapes, ["quiz"])

  const block = firstBlock(reply)
  assert.equal(block.type, "quiz")
  if (block.type !== "quiz") return
  assert.equal(block.title, "Cell biology check")
  assert.equal(block.questions.length, 2)
  assert.deepEqual(block.questions[0].choices, [
    { id: "A", text: "Mitochondrion" },
    { id: "B", text: "Ribosome" },
  ])
  assert.equal(block.questions[0].answerId, "A")
  assert.equal(block.questions[0].explanation, "Mitochondria run oxidative phosphorylation.")
  // A bare string choice list still gets stable ids, and `answer: "A"` resolves.
  assert.deepEqual(block.questions[1].choices, [
    { id: "A", text: "Nucleus" },
    { id: "B", text: "Golgi" },
  ])
  assert.equal(block.questions[1].answerId, "A")
})

test("a slide outline payload becomes a slideOutline block", () => {
  const reply = JSON.stringify({
    title: "Photosynthesis deck",
    slides: [
      { title: "Light reactions", bullets: ["Thylakoid", "Water split"] },
      { title: "Calvin cycle", body: "Fix CO2\nBuild sugar" },
    ],
  })

  const block = firstBlock(reply)
  assert.equal(block.type, "slideOutline")
  if (block.type !== "slideOutline") return
  assert.equal(block.title, "Photosynthesis deck")
  assert.deepEqual(block.slides[0], { title: "Light reactions", bullets: ["Thylakoid", "Water split"] })
  assert.deepEqual(block.slides[1].bullets, ["Fix CO2", "Build sugar"])
})

test("a {headers, rows} payload becomes a table block, including object rows", () => {
  const block = firstBlock(JSON.stringify({
    headers: ["Topic", "Status"],
    rows: [["Mitosis", "Done"], { Topic: "Meiosis", Status: "Review" }],
  }))

  assert.equal(block.type, "table")
  if (block.type !== "table") return
  assert.deepEqual(block.headers, ["Topic", "Status"])
  assert.deepEqual(block.rows, [["Mitosis", "Done"], ["Meiosis", "Review"]])
})

test("a {blocks:[...]} payload maps element-wise, including nested shapes", () => {
  const reply = JSON.stringify({
    blocks: [
      { type: "heading", level: 2, text: "Summary" },
      { type: "paragraph", text: "Two ideas matter." },
      { type: "list", ordered: true, items: ["First", "Second"] },
      { title: "Quick check", questions: [{ question: "Why?", choices: ["Because"] }] },
    ],
  })

  const blocks = blocksOf(reply)
  assert.deepEqual(blocks.map((block) => block.type), ["heading", "paragraph", "list", "quiz"])
  assert.deepEqual(blocks[0], { type: "heading", level: 2, text: "Summary" })
  assert.deepEqual(blocks[2], { type: "list", ordered: true, items: ["First", "Second"] })
})

test("markdown strings inside a JSON block list are still parsed as markdown", () => {
  const blocks = blocksOf(JSON.stringify({ blocks: ["## Notes", "- one\n- two"] }))
  assert.deepEqual(blocks.map((block) => block.type), ["heading", "list"])
})

test("an unrecognized JSON object becomes a code block of pretty-printed JSON", () => {
  const block = firstBlock(JSON.stringify({ totals: { a: 1, b: 2 } }))
  assert.equal(block.type, "code")
  if (block.type !== "code") return
  assert.equal(block.language, "json")
  assert.match(block.code, /"totals"/)
  assert.match(block.code, /\n {4}"a": 1/)
})

test("a whole-reply JSON array maps element-wise", () => {
  const blocks = blocksOf(JSON.stringify([{ type: "paragraph", text: "a" }, { type: "paragraph", text: "b" }]))
  assert.deepEqual(blocks.map((block) => block.type), ["paragraph", "paragraph"])
})

// ---------------------------------------------------------------------------
// Detection order
// ---------------------------------------------------------------------------

test("a single ```json fence is detected as json", () => {
  const result = format('```json\n{"blocks":[{"type":"paragraph","text":"fenced"}]}\n```')
  assert.equal(result.sourceFormat, "json")
  assert.deepEqual(result.blocks, [{ type: "paragraph", text: "fenced" }])
})

test("whole-reply JSON wins over the fence check", () => {
  const result = format('{"blocks":[{"type":"paragraph","text":"bare"}]}')
  assert.equal(result.sourceFormat, "json")
  assert.equal(result.warnings.length, 0)
})

test("malformed JSON falls back to markdown with a warning instead of throwing", () => {
  const result = format('{"title": "broken", "questions": [')
  assert.equal(result.sourceFormat, "markdown")
  assert.ok(result.warnings.some((warning) => /could not be parsed/.test(warning)), "expected a parse warning")
  assert.ok(result.blocks.length > 0)
})

test("a malformed ```json fence falls back to markdown with a warning", () => {
  const result = format('```json\n{"title": "broken",\n```')
  assert.equal(result.sourceFormat, "markdown")
  assert.ok(result.warnings.some((warning) => /could not be parsed/.test(warning)))
  assert.equal(firstBlock('```json\n{"title": "broken",\n```').type, "code")
})

test("plain prose is reported as text and empty replies produce nothing", () => {
  const prose = format("Just a sentence with no structure at all.")
  assert.equal(prose.sourceFormat, "text")
  assert.deepEqual(prose.blocks, [{ type: "paragraph", text: "Just a sentence with no structure at all." }])
  assert.deepEqual(format("   \n  "), { blocks: [], warnings: [], sourceFormat: "text", shapes: [] })
})

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

test("ATX headings map to levels 1-4 and clamp deeper levels", () => {
  const blocks = blocksOf("# One\n\n## Two\n\n### Three\n\n#### Four\n\n###### Six")
  assert.deepEqual(blocks, [
    { type: "heading", level: 1, text: "One" },
    { type: "heading", level: 2, text: "Two" },
    { type: "heading", level: 3, text: "Three" },
    { type: "heading", level: 4, text: "Four" },
    { type: "heading", level: 4, text: "Six" },
  ])
})

test("unordered and ordered lists keep their kind and items", () => {
  const unordered = firstBlock("- alpha\n* beta\n+ gamma")
  assert.deepEqual(unordered, { type: "list", ordered: false, items: ["alpha", "beta", "gamma"] })

  const ordered = firstBlock("1. first\n2. second")
  assert.deepEqual(ordered, { type: "list", ordered: true, items: ["first", "second"] })
})

test("a pipe table with an alignment row becomes a table block with align", () => {
  const block = firstBlock("| Topic | Score |\n| :--- | ---: |\n| Mitosis | 8 |\n| Meiosis | 6 |")
  assert.deepEqual(block, {
    type: "table",
    headers: ["Topic", "Score"],
    rows: [["Mitosis", "8"], ["Meiosis", "6"]],
    align: ["left", "right"],
  })
})

test("a pipe table without alignment markers omits align", () => {
  const block = firstBlock("| A | B |\n| --- | --- |\n| 1 | 2 |")
  assert.deepEqual(block, { type: "table", headers: ["A", "B"], rows: [["1", "2"]] })
})

test("fenced code captures the language and body", () => {
  const blocks = blocksOf("Here:\n\n```ts\nconst x: number = 1;\nreturn x\n```\n\nDone.")
  assert.deepEqual(blocks.map((block) => block.type), ["paragraph", "code", "paragraph"])
  assert.deepEqual(blocks[1], { type: "code", language: "ts", code: "const x: number = 1;\nreturn x" })
})

test("an unterminated fence closes at the end of the reply with a warning", () => {
  const result = format("```js\nlet a = 1")
  assert.equal(result.blocks[0].type, "code")
  assert.ok(result.warnings.some((warning) => /Unterminated code fence/.test(warning)))
})

test("blockquotes and dividers map to quote and divider blocks", () => {
  const blocks = blocksOf("> First line\n> Second line\n\n---\n\nAfter.")
  assert.deepEqual(blocks, [
    { type: "quote", text: "First line\nSecond line" },
    { type: "divider" },
    { type: "paragraph", text: "After." },
  ])
})

test("a standalone image line becomes an image block for safe URLs", () => {
  const block = firstBlock("![diagram](https://example.com/a.png)")
  assert.deepEqual(block, { type: "image", url: "https://example.com/a.png", alt: "diagram" })
})

test("inline emphasis and inline code markers are preserved as text, not HTML", () => {
  const block = firstBlock("Use **bold**, _italic_, and `code` in one line.")
  assert.equal(block.type, "paragraph")
  if (block.type !== "paragraph") return
  assert.equal(block.text, "Use **bold**, _italic_, and `code` in one line.")
  assert.ok(!block.text.includes("<"))
})

test("mixed markdown containing a fenced quiz json yields a quiz block among the others", () => {
  const reply = [
    "# Cell biology",
    "",
    "Key structures:",
    "",
    "- Nucleus",
    "- Mitochondrion",
    "",
    "```json",
    JSON.stringify({ title: "Quick check", questions: [{ question: "Makes ATP?", choices: ["Mitochondrion", "Nucleus"], answerId: "A" }] }),
    "```",
    "",
    "| Organelle | Role |",
    "| --- | --- |",
    "| Nucleus | Stores DNA |",
  ].join("\n")

  const result = format(reply)
  assert.equal(result.sourceFormat, "markdown")
  assert.deepEqual(result.blocks.map((block) => block.type), ["heading", "paragraph", "list", "quiz", "table"])
  assert.deepEqual(result.shapes, ["heading", "paragraph", "list", "quiz", "table"])

  const quiz = result.blocks[3]
  assert.equal(quiz.type, "quiz")
  if (quiz.type !== "quiz") return
  assert.equal(quiz.title, "Quick check")
  assert.equal(quiz.questions[0].answerId, "A")
})

// ---------------------------------------------------------------------------
// Security — the reply is untrusted model output headed for the DOM
// ---------------------------------------------------------------------------

test("raw HTML is stripped to inert text and no markup survives", () => {
  const reply = "Before <script>alert('pwned')</script> after <img src=x onerror=alert(1)> end"
  const result = format(reply)
  const text = blocksToPlainText(result.blocks)

  assert.ok(text.includes("Before"), "surrounding text must survive")
  assert.ok(text.includes("after"), "surrounding text must survive")
  assert.ok(text.includes("end"), "surrounding text must survive")
  assert.ok(!text.includes("<"), `no markup may survive, got: ${text}`)
  assert.ok(!text.includes(">"), `no markup may survive, got: ${text}`)
  assert.ok(!/onerror/i.test(text), "event handler names must not survive")
  assert.ok(!/script/i.test(text), "tag names must not survive")
  assert.ok(result.warnings.some((warning) => /Removed raw HTML/.test(warning)))
})

test("HTML in a JSON payload is stripped too", () => {
  const blocks = blocksOf(JSON.stringify({ blocks: [{ type: "paragraph", text: "<b>bold</b><img src=x onerror=alert(1)>" }] }))
  const block = blocks[0]
  assert.equal(block.type, "paragraph")
  if (block.type !== "paragraph") return
  assert.equal(block.text, "bold")
})

test("nested and attribute-quoted tags cannot smuggle markup through", () => {
  const html = blocksToThemedHtml(blocksOf('<a title="a>b">x</a><iframe src="https://evil.example"></iframe>'))
  assert.ok(!html.includes("<iframe"), "no iframe may be emitted")
  assert.ok(!html.includes("evil.example"), "iframe source must not survive")
})

test("dangerous URLs are rejected with a warning for images and links", () => {
  for (const url of ["javascript:alert(1)", "JavaScript:alert(1)", "data:text/html;base64,PHNjcmlwdD4=", "file:///etc/passwd", "//evil.example/x.png", "blob:https://x/y"]) {
    assert.equal(isSafeUrl(url), false, `${url} must be rejected`)
  }

  const image = format(`![chart](${"javascript:alert(1)"})`)
  assert.equal(image.blocks[0].type, "paragraph")
  assert.ok(image.warnings.some((warning) => /Rejected unsafe URL/.test(warning)))

  const link = format("See [the plan](data:text/html;base64,PHNjcmlwdD4=) for details.")
  assert.equal(link.blocks[0].type, "paragraph")
  if (link.blocks[0].type !== "paragraph") return
  assert.equal(link.blocks[0].text, "See the plan for details.")
  assert.ok(link.warnings.some((warning) => /Rejected unsafe URL/.test(warning)))
})

test("a whitespace-split scheme cannot slip past the allowlist", () => {
  assert.equal(isSafeUrl("java\nscript:alert(1)"), false)
  assert.equal(isSafeUrl("\tjavascript:alert(1)"), false)
  assert.equal(isSafeUrl("data:image/svg+xml;base64,PHN2Zz4="), false, "SVG data URLs can carry script")
})

test("only http, https, and raster data:image URLs are allowed", () => {
  assert.equal(isSafeUrl("https://example.com/a.png"), true)
  assert.equal(isSafeUrl("HTTP://example.com/a.png"), true)
  assert.equal(isSafeUrl("data:image/png;base64,iVBORw0KGgo="), true)
  assert.equal(isSafeUrl("data:image/webp;base64,UklGRg=="), true)
  assert.equal(isSafeUrl(""), false)
  assert.equal(isSafeUrl("/relative/a.png"), false)
})

test("an unsafe JSON image payload degrades to its alt text", () => {
  const blocks = blocksOf(JSON.stringify({ type: "image", url: "javascript:alert(1)", alt: "diagram" }))
  assert.deepEqual(blocks, [{ type: "paragraph", text: "diagram" }])
})

test("size caps truncate unbounded output and warn instead of growing forever", () => {
  const manyBlocks = Array.from({ length: 900 }, (_, index) => `Paragraph ${index}`).join("\n\n")
  const capped = format(manyBlocks)
  assert.ok(capped.blocks.length <= 400, `expected at most 400 blocks, got ${capped.blocks.length}`)
  assert.ok(capped.warnings.some((warning) => /truncated/.test(warning)))

  const longCode = format(`\`\`\`txt\n${"x".repeat(30000)}\n\`\`\``)
  const codeBlock = longCode.blocks[0]
  assert.equal(codeBlock.type, "code")
  if (codeBlock.type === "code") assert.ok(codeBlock.code.length <= 24000)
  assert.ok(longCode.warnings.some((warning) => /truncated/.test(warning)))

  const wideHeaders = Array.from({ length: 40 }, (_, index) => `H${index}`)
  const wideRow = wideHeaders.map((_, index) => `c${index}`)
  const wideTable = firstBlock(`| ${wideHeaders.join(" | ")} |\n| ${wideHeaders.map(() => "---").join(" | ")} |\n| ${wideRow.join(" | ")} |`)
  assert.equal(wideTable.type, "table")
  if (wideTable.type === "table") {
    assert.ok(wideTable.headers.length <= 24)
    assert.equal(wideTable.rows[0].length, wideTable.headers.length)
  }

  const manyItems = firstBlock(Array.from({ length: 600 }, (_, index) => `- item ${index}`).join("\n"))
  assert.equal(manyItems.type, "list")
  if (manyItems.type === "list") assert.ok(manyItems.items.length <= 250)

  const manyQuestions = format(JSON.stringify({
    questions: Array.from({ length: 120 }, (_, index) => ({ question: `Q${index}`, choices: ["a", "b"] })),
  }))
  const quiz = manyQuestions.blocks[0]
  assert.equal(quiz.type, "quiz")
  if (quiz.type === "quiz") assert.ok(quiz.questions.length <= 60)
})

// ---------------------------------------------------------------------------
// blocksToPlainText
// ---------------------------------------------------------------------------

test("blocksToPlainText flattens every block type", () => {
  const plain = blocksToPlainText([
    { type: "heading", level: 2, text: "Title" },
    { type: "paragraph", text: "Body" },
    { type: "list", ordered: false, items: ["a", "b"] },
    { type: "quote", text: "Quoted" },
    { type: "divider" },
    { type: "code", language: "ts", code: "let x = 1" },
    { type: "image", url: "https://example.com/a.png", alt: "alt" },
    { type: "callout", tone: "warn", text: "Careful" },
    { type: "table", headers: ["A", "B"], rows: [["1", "2"]] },
    { type: "quiz", title: "Check", questions: [{ question: "Q?", choices: [{ id: "A", text: "yes" }], answerId: "A", explanation: "because" }] },
    { type: "slideOutline", title: "Deck", slides: [{ title: "S1", bullets: ["b1"] }] },
  ])

  assert.ok(plain.includes("## Title"))
  assert.ok(plain.includes("Body"))
  assert.ok(plain.includes("- a\n- b"))
  assert.ok(plain.includes("> Quoted"))
  assert.ok(plain.includes("---"))
  assert.ok(plain.includes("```ts\nlet x = 1\n```"))
  assert.ok(plain.includes("![alt](https://example.com/a.png)"))
  assert.ok(plain.includes("[WARN] Careful"))
  assert.ok(plain.includes("| A | B |"))
  assert.ok(plain.includes("Quiz: Check"))
  assert.ok(plain.includes("Answer: A"))
  assert.ok(plain.includes("Explanation: because"))
  assert.ok(plain.includes("Slide 1: S1"))
})

test("blocksToPlainText emits nothing for an empty block list", () => {
  assert.equal(blocksToPlainText([]), "")
})

// ---------------------------------------------------------------------------
// blocksToThemedHtml
// ---------------------------------------------------------------------------

test("blocksToThemedHtml escapes every text value and only emits app class names", () => {
  const html = blocksToThemedHtml([
    { type: "heading", level: 1, text: "<script>alert(1)</script>" },
    { type: "paragraph", text: 'quote " and apostrophe \' and amp & and <angle>' },
    { type: "table", headers: ["<th>"], rows: [["<td>"]] },
  ])

  assert.ok(!html.includes("<script"), "no script tag may be emitted")
  assert.ok(!/onerror/i.test(html))
  assert.ok(!html.includes("<iframe"))
  assert.ok(!/style="/i.test(html), "no inline style may be emitted")
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"))
  assert.ok(html.includes("&amp;"))
  assert.ok(html.includes("&quot;"))
  assert.ok(html.includes("&#39;"))
  assert.ok(html.includes("learn-block learn-block--heading"))
  assert.ok(html.includes("learn-block learn-block--table"))
  assert.ok(html.includes("learn-block--paragraph"))
  assert.ok(html.includes('class="learn-block__table"'))
})

test("blocksToThemedHtml never emits an unsafe image URL", () => {
  const html = blocksToThemedHtml([{ type: "image", url: "javascript:alert(1)", alt: "alt text" }])
  assert.ok(!html.includes("javascript:"))
  assert.ok(html.includes("alt text"))
})

test("blocksToThemedHtml marks the correct quiz choice without emitting script", () => {
  const html = blocksToThemedHtml([
    { type: "quiz", title: "Q", questions: [{ question: "?", choices: [{ id: "A", text: "yes" }, { id: "B", text: "no" }], answerId: "A" }] },
  ])
  assert.ok(html.includes('data-choice-id="A" data-state="correct"'))
  assert.ok(html.includes('data-choice-id="B" data-state="idle"'))
})

// ---------------------------------------------------------------------------
// Determinism and idempotence
// ---------------------------------------------------------------------------

test("formatting is deterministic for the same input", () => {
  const reply = "# Title\n\n- a\n\n| H |\n| --- |\n| c |\n\n```json\n{\"questions\":[{\"question\":\"q\",\"choices\":[\"a\"]}]}\n```"
  const first = format(reply)
  const second = format(reply)
  assert.deepEqual(first.blocks, second.blocks)
  assert.deepEqual(first.warnings, second.warnings)
  assert.equal(first.sourceFormat, second.sourceFormat)
})

test("markdown output is stable on a second pass", () => {
  const reply = [
    "# Heading",
    "",
    "A paragraph with **bold** text.",
    "",
    "- one",
    "- two",
    "",
    "1. first",
    "2. second",
    "",
    "> quoted",
    "",
    "---",
    "",
    "| A | B |",
    "| :--- | ---: |",
    "| 1 | 2 |",
    "",
    "```ts",
    "let x = 1",
    "```",
    "",
    "![alt](https://example.com/a.png)",
  ].join("\n")

  const first = format(reply)
  const flat = blocksToPlainText(first.blocks)
  const second = format(flat)
  assert.equal(blocksToPlainText(second.blocks), flat)
  assert.deepEqual(second.blocks.map((block) => block.type), first.blocks.map((block) => block.type))
})
