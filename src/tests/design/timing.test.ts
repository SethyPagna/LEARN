import assert from "node:assert/strict"
import test from "node:test"
import { ELEMENT_ANIMATION_EFFECTS, ENTRANCE_GAP_MS, ENTRANCE_START_MS } from "../../lib/design/animation"
import { createDesignDoc, createDesignPage } from "../../lib/design/document"
import { designOutline } from "../../lib/design/outline"
import { serializeTableCells } from "../../lib/design/table"
import {
  clockElapsed,
  clockPageElapsed,
  countWords,
  entrancesMs,
  estimateDesignSeconds,
  estimatePageSeconds,
  formatClock,
  formatDuration,
  markClockPage,
  MIN_PAGE_SECONDS,
  startClock,
  toggleClock,
} from "../../lib/design/timing"
import { createElement } from "../../lib/studio/canvas-engine"

const text = (id: string, content: string, x: number, y: number, extra: Record<string, unknown> = {}) => createElement({ id, type: "text", content, x, y, ...extra })
const words = (count: number) => Array.from({ length: count }, (_, index) => `word${index}`).join(" ")

test("words are counted in any script, including ones without spaces", () => {
  assert.equal(countWords(""), 0)
  assert.equal(countWords("  Light in, sugar out!  "), 4)
  assert.ok(countWords("ខ្ញុំស្រលាញ់ភាសាខ្មែរ") >= 3, "Khmer is split into words")
  assert.ok(countWords("我喜欢学习") >= 2, "Chinese is split into words")
})

test("a page's time is its words and notes at a speaking pace, at least a few seconds, plus its entrances", () => {
  assert.equal(estimatePageSeconds(createDesignPage({ elements: [] })), MIN_PAGE_SECONDS)
  assert.equal(estimatePageSeconds(createDesignPage({ elements: [text("a", words(24), 0, 0)], notes: words(24) })), 20, "48 words at 2.4 a second")
  const table = createElement({ id: "t", type: "table", content: serializeTableCells([["one", "two"], ["three", "four"]]) })
  const hidden = text("h", words(100), 0, 0, { hidden: true })
  const picture = createElement({ id: "p", type: "image", content: "/api/files/x" })
  assert.equal(estimatePageSeconds(createDesignPage({ elements: [table, hidden, picture], notes: words(20) })), 10, "table cells count; hidden text and pictures do not")
  const animated = [text("a", "Hi", 0, 0, { style: { animation: "rise" } }), text("b", "There", 0, 0, { z: 1, style: { animation: "emphasis" } })]
  assert.equal(entrancesMs(animated), ENTRANCE_START_MS + ENTRANCE_GAP_MS + ELEMENT_ANIMATION_EFFECTS.emphasis.duration)
  assert.equal(estimatePageSeconds(createDesignPage({ elements: animated })), MIN_PAGE_SECONDS + 1)
})

test("a design's time counts the pages that are presented", () => {
  const doc = createDesignDoc({ pages: [
    createDesignPage({ elements: [text("a", words(24), 0, 0)] }),
    createDesignPage({ elements: [text("b", words(240), 0, 0)], hidden: true }),
    createDesignPage({ elements: [] }),
  ] })
  assert.equal(estimateDesignSeconds(doc), 10 + MIN_PAGE_SECONDS)
  assert.equal(estimateDesignSeconds(doc, [1]), 100)
})

test("lengths and clocks read the usual way", () => {
  assert.deepEqual([formatDuration(0), formatDuration(40), formatDuration(59.4), formatDuration(90), formatDuration(3600), formatDuration(3900)], ["0 s", "40 s", "59 s", "2 min", "1 h", "1 h 5 min"])
  assert.deepEqual([formatClock(0), formatClock(83_900), formatClock(3_723_000), formatClock(-5)], ["00:00", "01:23", "1:02:03", "00:00"])
})

test("the rehearsal clock pauses, goes on, and times each page from when it showed", () => {
  let clock = startClock(1_000)
  assert.equal(clockElapsed(clock, 11_000), 10_000)
  clock = markClockPage(clock, 11_000)
  assert.equal(clockPageElapsed(clock, 15_000), 4_000)
  clock = toggleClock(clock, 15_000)
  assert.equal(clock.since, null)
  assert.equal(clockElapsed(clock, 60_000), 14_000, "paused: the time stands still")
  assert.equal(clockPageElapsed(clock, 60_000), 4_000)
  clock = toggleClock(clock, 60_000)
  assert.equal(clockElapsed(clock, 62_000), 16_000)
  assert.equal(clockPageElapsed(clock, 62_000), 6_000)
  assert.equal(clockPageElapsed(markClockPage(startClock(0), 5_000), 1_000), 0, "never below zero")
})

test("the outline lists each page's words in reading order, its notes and times", () => {
  const doc = createDesignDoc({ name: "Plants and light", pages: [
    createDesignPage({ notes: "Start with a question.", elements: [
      text("body", "Light in\nSugar out", 40, 200),
      text("title", "Photosynthesis", 40, 40),
      text("side", "LEAF", 600, 200),
      createElement({ id: "shape", type: "shape", content: "", x: 0, y: 0 }),
      createElement({ id: "grid", type: "table", x: 40, y: 400, content: serializeTableCells([["In", "Out"], ["Light", "Sugar"]]) }),
    ] }),
    createDesignPage({ hidden: true, elements: [text("x", "Backup", 0, 0)] }),
    createDesignPage({ elements: [] }),
  ] })
  assert.equal(designOutline(doc), [
    "Plants and light",
    "2 pages · about 10 s",
    "",
    "Page 1 · about 6 s",
    "Photosynthesis",
    "Light in\nSugar out",
    "LEAF",
    "In | Out\nLight | Sugar",
    "",
    "Notes:",
    "Start with a question.",
    "",
    "Page 3 · about 4 s",
    "(no text)",
    "",
  ].join("\n"))
  assert.match(designOutline(doc, [1]), /^Plants and light\n1 page · about 4 s\n\nPage 2 \(hidden\) · about 4 s\nBackup\n$/)
})
