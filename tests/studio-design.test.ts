import assert from "node:assert/strict"
import test from "node:test"
import { applySlideDesignPreset, createSlideDesignObject, getDocumentInsertBlock, removeSlideDesignObject, updateSlideDesignObject } from "../lib/studio-design"

test("document insert blocks expose reusable editor snippets", () => {
  assert.match(getDocumentInsertBlock("callout"), /Callout/)
  assert.match(getDocumentInsertBlock("two-column"), /<table>/)
})

test("slide design presets add theme and background metadata", () => {
  const slide = applySlideDesignPreset({ title: "One", body: "Body" }, "forest")

  assert.equal(slide.theme, "forest")
  assert.equal(slide.background, "#052e2b")
})

test("slide design objects create editable placeholders", () => {
  const shape = createSlideDesignObject("shape")
  const text = createSlideDesignObject("text")

  assert.equal(shape.type, "shape")
  assert.equal(text.type, "text")
  assert.ok(text.text)
})

test("slide design objects can be updated and removed", () => {
  const object = createSlideDesignObject("text")
  const slide = { title: "One", body: "Body", objects: [object] }
  const updated = updateSlideDesignObject(slide, object.id, { text: "Updated point" })
  const removed = removeSlideDesignObject(updated, object.id)

  assert.equal(updated.objects?.[0]?.text, "Updated point")
  assert.equal(removed.objects?.length, 0)
})
