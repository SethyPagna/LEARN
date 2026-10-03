import assert from "node:assert/strict"
import test from "node:test"
import { cleanSelectionText, isActionableSelection, MAX_SELECTION_CHARS, placeSelectionDock } from "../../lib/selection-dock"

test("selected text loses the editor's spacing quirks", () => {
  assert.equal(cleanSelectionText("  Round robin   gives\tevery  process \n\n\n\n a slice.  "), "Round robin gives every process\n\na slice.")
})

test("long selections are capped at a word boundary", () => {
  const words = Array.from({ length: 2000 }, (_, index) => `word${index}`).join(" ")
  const capped = cleanSelectionText(words)
  assert.ok(capped.length <= MAX_SELECTION_CHARS + 1)
  assert.ok(capped.endsWith("…"))
  assert.match(capped.slice(0, -1), /word\d+$/, "no word is cut in half")
})

test("only real passages are actionable", () => {
  assert.equal(isActionableSelection("Round robin gives every process a slice."), true)
  assert.equal(isActionableSelection("Mitochondria"), false, "one word is not a passage")
  assert.equal(isActionableSelection("a b"), false, "too short")
  assert.equal(isActionableSelection("------ ------ ------"), false, "no letters")
  assert.equal(isActionableSelection("ការរៀន គឺជាដំណើរ"), true, "any script counts")
})

const viewport = { width: 1200, height: 800 }
const dock = { width: 400, height: 44 }
const line = (left: number, top: number, right: number) => ({ left, top, right, bottom: top + 20 })

test("the pill centres above the first line, clear of the words", () => {
  const first = line(300, 300, 700)
  const placement = placeSelectionDock(first, line(300, 340, 500), dock, viewport)
  assert.deepEqual(placement, { left: 300, top: 300 - 10 - 44, side: "above" })
})

test("touch prefers below the last line, where the system menu is not", () => {
  const placement = placeSelectionDock(line(300, 300, 700), line(300, 340, 500), dock, viewport, "below")
  assert.deepEqual(placement, { left: 200, top: 360 + 10, side: "below" })
})

test("the pill flips when its side has no room and stays on screen", () => {
  const nearTop = placeSelectionDock(line(10, 20, 60), line(10, 20, 60), dock, viewport)
  assert.equal(nearTop?.side, "below")
  assert.equal(nearTop?.left, 8, "clamped to the left margin")
  const nearBottom = placeSelectionDock(line(1100, 760, 1190), line(1100, 760, 1190), dock, viewport, "below")
  assert.equal(nearBottom?.side, "above")
  assert.equal(nearBottom?.left, 1200 - 400 - 8, "clamped to the right margin")
})

test("the pill hides once the selection scrolls out of view", () => {
  assert.equal(placeSelectionDock(line(0, -200, 50), line(0, -120, 50), dock, viewport), null)
  assert.equal(placeSelectionDock(line(0, 900, 50), line(0, 940, 50), dock, viewport), null)
})
