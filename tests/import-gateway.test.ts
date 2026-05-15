import assert from "node:assert/strict"
import test from "node:test"
import { detectImportTarget, shapeImportedLearningContent } from "../lib/import-gateway"

test("import gateway detects sheets slides docs and notes", () => {
  assert.equal(detectImportTarget("Topic,Status\nReact,Review\nSQL,Weak"), "sheet")
  assert.equal(detectImportTarget("Hook|Why it matters|Open\nPractice|Try it|Do"), "slides")
  assert.equal(detectImportTarget("## Summary\nLong point\n## Practice\nQuestion"), "doc")
  assert.equal(detectImportTarget("Small note about indexing"), "note")
})

test("import gateway shapes spreadsheet payloads", () => {
  const shaped = shapeImportedLearningContent({ raw: "Topic,Status\nReact,Review", target: "auto" })

  assert.equal(shaped.target, "sheet")
  assert.equal(shaped.payload.title, "Topic,Status")
  assert.deepEqual(shaped.payload.cells, [["Topic", "Status"], ["React", "Review"]])
})

test("import gateway shapes slide payloads", () => {
  const shaped = shapeImportedLearningContent({ raw: "Hook|Why it matters|Open", target: "slides", title: "Lesson" })

  assert.equal(shaped.target, "slides")
  assert.equal(shaped.payload.title, "Lesson")
  assert.equal((shaped.payload.slides as any[])[0].accent, "Open")
})
