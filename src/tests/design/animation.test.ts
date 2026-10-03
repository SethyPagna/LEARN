import assert from "node:assert/strict"
import test from "node:test"
import {
  ELEMENT_ANIMATION_EFFECTS,
  ELEMENT_ANIMATIONS,
  ENTRANCE_GAP_MS,
  ENTRANCE_START_MS,
  entranceKeyframes,
  entrancePlan,
  readElementAnimation,
  withElementAnimation,
} from "../../lib/design/animation"
import { createDesignDoc, createDesignPage, normalizeDesignDoc } from "../../lib/design/document"
import { deckToDesign } from "../../lib/design/from-deck"
import { createElement } from "../../lib/studio/canvas-engine"

const box = (id: string, z: number, extra: Record<string, unknown> = {}) => createElement({ id, type: "shape", z, ...extra })

test("an element's entrance is read, set and cleared on its style, and unknown values are ignored", () => {
  const plain = box("a", 0)
  assert.equal(readElementAnimation(plain), null)
  const risen = withElementAnimation(plain, "rise")
  assert.equal(readElementAnimation(risen), "rise")
  assert.equal(plain.style.animation, undefined, "the original is not changed")
  assert.equal(withElementAnimation(risen, "rise"), risen, "no change gives the same element")
  const cleared = withElementAnimation(risen, null)
  assert.equal("animation" in cleared.style, false)
  assert.equal(withElementAnimation(plain, null), plain)
  assert.equal(readElementAnimation(box("b", 0, { style: { animation: "spin" } })), null)
  assert.equal(withElementAnimation(box("c", 0, { style: { animation: "spin" } }), null).style.animation, undefined, "a stray value is cleared")
})

test("a page's entrances play bottom layer first, a group together, hidden and plain elements skipped", () => {
  const elements = [
    box("top", 4, { style: { animation: "emphasis" } }),
    box("plain", 0),
    box("bottom", 1, { style: { animation: "rise" } }),
    box("left", 2, { groupId: "pair", style: { animation: "reveal" } }),
    box("right", 3, { groupId: "pair", style: { animation: "reveal" } }),
    box("gone", 5, { hidden: true, style: { animation: "rise" } }),
  ]
  assert.deepEqual(entrancePlan(elements), [
    { id: "bottom", animation: "rise", delay: ENTRANCE_START_MS },
    { id: "left", animation: "reveal", delay: ENTRANCE_START_MS + ENTRANCE_GAP_MS },
    { id: "right", animation: "reveal", delay: ENTRANCE_START_MS + ENTRANCE_GAP_MS },
    { id: "top", animation: "emphasis", delay: ENTRANCE_START_MS + 2 * ENTRANCE_GAP_MS },
  ])
  assert.deepEqual(entrancePlan([box("x", 0)]), [])
})

test("effects end where the element rests: its own opacity, and no transform (so rotation is kept)", () => {
  for (const animation of ELEMENT_ANIMATIONS) {
    const frames = ELEMENT_ANIMATION_EFFECTS[animation].keyframes
    assert.ok(frames.every((frame) => !("transform" in frame)), `${animation} leaves transform alone`)
    const last = frames[frames.length - 1]
    if ("opacity" in last) assert.equal(last.opacity, 1)
  }
  const half = entranceKeyframes("rise", 0.5)
  assert.deepEqual(half.map((frame) => frame.opacity), [0, 0.5])
  assert.deepEqual(entranceKeyframes("emphasis", 0.4).map((frame) => frame.opacity), [0, 0.4, 0.4])
  assert.deepEqual(entranceKeyframes("rise"), ELEMENT_ANIMATION_EFFECTS.rise.keyframes, "an opaque element uses the effect as it is")
  assert.deepEqual(entranceKeyframes("reveal", 0.3), ELEMENT_ANIMATION_EFFECTS.reveal.keyframes, "a wipe has no fade")
})

test("an entrance survives saving and loading the design", () => {
  const doc = createDesignDoc({ name: "Animated", pages: [createDesignPage({ elements: [box("a", 0, { style: { animation: "reveal" } })] })] })
  const loaded = normalizeDesignDoc(JSON.parse(JSON.stringify(doc)))
  assert.equal(readElementAnimation(loaded.pages[0].elements[0]), "reveal")
})

test("an old slide's animation becomes the entrance of each of its elements", () => {
  const doc = deckToDesign({ title: "Deck", slides: [
    { title: "Title", body: "Body", accent: "", animation: "rise" },
    { title: "Objects", body: "", animation: "emphasis", objects: [
      { id: "t", type: "text", x: 0, y: 0, w: 50, h: 20, text: "Hello" },
      { id: "s", type: "shape", x: 50, y: 50, w: 20, h: 20 },
    ] },
    { title: "Still", body: "Body", animation: "none" },
  ] })
  assert.deepEqual(doc.pages[0].elements.map((element) => [element.content, readElementAnimation(element)]), [["", null], ["Title", "rise"], ["Body", "rise"]], "an empty text box has nothing to show")
  assert.deepEqual(doc.pages[1].elements.map(readElementAnimation), ["emphasis", "emphasis"])
  assert.deepEqual(doc.pages[2].elements.map(readElementAnimation), [null, null, null])
})
