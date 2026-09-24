import assert from "node:assert/strict"
import test from "node:test"
import { deckToDesign } from "../../lib/design/from-deck"
import { buildPptxPlan } from "../../lib/design/pptx"

test("authored deck objects retain positions, content, notes and hidden pages in 4:3 exports", () => {
  const doc = deckToDesign({ title: "Field notes", aspect: "4:3", slides: [
    { title: "Unused template heading", body: "Unused template body", background: "#123456", locked: true, transition: "push", speakerNotes: "Present this example", objects: [
      { id: "label", type: "text", x: 10, y: 20, w: 50, h: 30, text: "Authored heading", style: { fontSize: 32, color: "#ffffff" } },
      { id: "photo", type: "image", x: 65, y: 20, w: 30, h: 50, src: "/api/files/photo", style: {} },
    ] },
    { title: "Backup", body: "Optional detail", hidden: true },
  ] })
  assert.equal(doc.width / doc.height, 4 / 3)
  assert.equal(doc.pages[0].elements.length, 2)
  assert.equal(doc.pages[0].elements[0].content, "Authored heading")
  assert.deepEqual([doc.pages[0].elements[0].x, doc.pages[0].elements[0].y, doc.pages[0].elements[0].width, doc.pages[0].elements[0].height], [96, 144, 480, 216])
  assert.equal(doc.pages[0].elements[0].locked, true)
  assert.equal(doc.pages[0].elements[1].content, "/api/files/photo")
  assert.equal(doc.pages[0].background, "#123456")
  const plan = buildPptxPlan(doc, { includeHidden: true })
  assert.equal(plan.layout.width / plan.layout.height, 4 / 3)
  assert.equal(plan.slides[0].notes, "Present this example")
  assert.equal(plan.slides[1].hidden, true)
  assert.ok(plan.slides[0].ops.some((op) => op.kind === "text" && op.text.includes("Authored heading")))
  assert.equal(buildPptxPlan(doc).slides.length, 1)
})

test("simple decks keep title, accent and body; limits reject instead of silently truncating", () => {
  const slide = { title: "Title", body: "Body", accent: "Topic" }
  const doc = deckToDesign({ title: "Deck", slides: [slide] })
  assert.equal(doc.width / doc.height, 16 / 9)
  assert.deepEqual(doc.pages[0].elements.map((element) => element.content), ["Topic", "Title", "Body"])
  assert.throws(() => deckToDesign({ title: "Deck", slides: Array.from({ length: 61 }, () => slide) }), /60 pages/)
  assert.throws(() => deckToDesign({ title: "Deck", slides: [{ ...slide, body: "x".repeat(4001) }] }), /text limit/)
  assert.throws(() => deckToDesign({ title: "Deck", slides: [] }), /Add a slide/)
})
