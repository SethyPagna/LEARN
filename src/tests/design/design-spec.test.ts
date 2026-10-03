import assert from "node:assert/strict"
import test from "node:test"
import { normalizeBlock, normalizeDesignSpec, parseTextToSpec, pickLayout, SPEC_LIMITS } from "../../lib/design/spec"
import { designFont, designFontStack, estimateTextWidth, nearestFontWeight } from "../../lib/design/fonts"
import { designTheme, themeTextStyle } from "../../lib/design/themes"

test("untrusted blocks are rebuilt field by field, and unknown types are dropped", () => {
  assert.equal(normalizeBlock({ type: "script", text: "<b>x</b>" }), null)
  assert.equal(normalizeBlock({ type: "title", text: "   " }), null)
  assert.deepEqual(normalizeBlock({ type: "title", text: " Cells \u0007", subtitle: "", extra: 1 }), { type: "title", text: "Cells" })
  assert.deepEqual(normalizeBlock({ type: "list", items: ["a", "", 3, { text: "b" }] }), { type: "bullets", items: ["a", "3", "b"] })

  const question = normalizeBlock({ type: "quiz", question: "2+2?", options: ["3", "4"], answer: 1 })
  assert.deepEqual(question, { type: "question", question: "2+2?", choices: ["3", "4"], answer: 1 })
  const outOfRange = normalizeBlock({ type: "question", question: "?", choices: ["a"], answer: 4 })
  assert.equal(outOfRange && "answer" in outOfRange, false, "an answer index outside the choices is dropped, not trusted")
})

test("image sources are limited to same-origin paths, data images and http(s)", () => {
  assert.deepEqual(normalizeBlock({ type: "image", src: "/api/files/abc/download" }), { type: "image", src: "/api/files/abc/download" })
  assert.deepEqual(normalizeBlock({ type: "image", src: "https://example.com/a.png" }), { type: "image", src: "https://example.com/a.png" })
  assert.deepEqual(normalizeBlock({ type: "image", src: "javascript:alert(1)" }), { type: "image" })
  assert.deepEqual(normalizeBlock({ type: "image", src: "//evil.example/x.png" }), { type: "image" })
  assert.deepEqual(normalizeBlock({ type: "image", src: "data:text/html;base64,PGI+" }), { type: "image" })
})

test("a spec is capped: pages, blocks per page and list items", () => {
  const many = { pages: Array.from({ length: 80 }, () => ({ blocks: Array.from({ length: 20 }, () => ({ type: "bullets", items: Array.from({ length: 30 }, (_, i) => `item ${i}`) })) })) }
  const spec = normalizeDesignSpec(many)
  assert.equal(spec.pages.length, SPEC_LIMITS.pages)
  assert.equal(spec.pages[0].blocks.length, SPEC_LIMITS.blocksPerPage)
  const first = spec.pages[0].blocks[0]
  assert.equal(first.type === "bullets" ? first.items.length : 0, SPEC_LIMITS.items)
  assert.deepEqual(normalizeDesignSpec({ slides: [{ blocks: [{ type: "heading", text: "Alias" }] }] }).pages.length, 1, "`slides` is accepted as an alias for `pages`")
})

test("layouts are picked from what a page contains", () => {
  const page = (blocks: unknown[]) => normalizeDesignSpec({ pages: [{ blocks }] }).pages[0]
  assert.equal(pickLayout(page([{ type: "title", text: "Hi" }]), 0, 5), "cover")
  assert.equal(pickLayout(page([{ type: "title", text: "Part 2" }]), 2, 5), "section")
  assert.equal(pickLayout(page([{ type: "title", text: "Thanks" }]), 4, 5), "closing")
  assert.equal(pickLayout(page([{ type: "heading", text: "H" }, { type: "bullets", items: ["a"] }]), 1, 5), "bullets")
  assert.equal(pickLayout(page([{ type: "heading", text: "H" }, { type: "bullets", items: ["a"] }, { type: "image" }]), 1, 5), "split")
  assert.equal(pickLayout(page([{ type: "quote", text: "Q" }]), 1, 5), "quote")
  assert.equal(pickLayout(page([{ type: "stats", items: [{ value: "42%", label: "x" }] }]), 1, 5), "stats")
  assert.equal(pickLayout(page([{ type: "question", question: "?", choices: ["a", "b"] }]), 1, 5), "question")
  assert.equal(pickLayout(page([{ type: "meme", top: "top" }]), 0, 1), "meme")
  assert.equal(pickLayout({ layout: "timeline", blocks: [{ type: "text", text: "x" }] }, 0, 1), "timeline", "an explicit layout always wins")
})

test("plain notes become a deck without any model", () => {
  const spec = parseTextToSpec([
    "# Photosynthesis",
    "",
    "## Why it matters",
    "- Plants make food",
    "- Oxygen for us",
    "",
    "## By the numbers",
    "- 70% of oxygen comes from the ocean",
    "- 3 stages in the Calvin cycle",
    "",
    "> The sun is the source of all life — Someone",
    "",
    "Chlorophyll: the green pigment that captures light energy.",
    "",
    "---",
    "Q: Which gas do plants release?",
    "a) Carbon dioxide",
    "b) Oxygen *",
    "c) Nitrogen",
  ].join("\n"))

  assert.equal(spec.title, "Photosynthesis")
  const types = spec.pages.map((page) => page.blocks.map((block) => block.type).join("+"))
  assert.deepEqual(types, ["title", "heading+bullets", "heading+stats+quote+definition", "question"])
  const question = spec.pages[3].blocks[0]
  assert.equal(question.type === "question" ? question.answer : -1, 1, "the starred choice is the answer")
  assert.equal(pickLayout(spec.pages[0], 0, spec.pages.length), "cover")
})

test("a long list is split over two pages instead of shrinking to fit", () => {
  const spec = parseTextToSpec(["## Parts of a cell", ...Array.from({ length: 10 }, (_, i) => `- part ${i + 1}`)].join("\n"))
  assert.equal(spec.pages.length, 2)
  const second = spec.pages[1].blocks
  assert.equal(second[0].type === "heading" ? second[0].text : "", "Parts of a cell (cont.)")
})

test("font ids resolve safely and weights snap to what the face ships", () => {
  assert.equal(designFont("does-not-exist").id, "sans")
  assert.equal(designFont("url(evil)").id, "sans")
  assert.match(designFontStack("poppins"), /^var\(--font-design-poppins\), /)
  assert.equal(nearestFontWeight("bebas", 700), 400, "Bebas only ships 400, so bold is not faked")
  assert.equal(nearestFontWeight("poppins", 650), 600)
  assert.ok(estimateTextWidth("WWWW", "sans", 40) > estimateTextWidth("iiii", "sans", 40))
  assert.ok(estimateTextWidth("abc", "bebas", 40) < estimateTextWidth("abc", "poppins", 40), "condensed faces measure narrower")
})

test("themes give every role a look and fall back to the default theme", () => {
  assert.equal(designTheme("nope").id, "notebook")
  const pop = designTheme("pop")
  assert.equal(themeTextStyle(pop, "title").uppercase, true)
  assert.equal(themeTextStyle(pop, "title").font, "bebas")
  assert.equal(themeTextStyle(pop, "body").font, "poppins")
  assert.match(themeTextStyle(designTheme("midnight"), "stat-value").color, /^#[0-9A-F]{6}$/i)
})
