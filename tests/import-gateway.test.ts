import assert from "node:assert/strict"
import test from "node:test"
import { detectImportTarget, previewImportedLearningContent, shapeImportedLearningContent } from "../lib/import-gateway"

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

test("import gateway previews detected targets and warnings", () => {
  const sheet = previewImportedLearningContent({ raw: "Topic,Status\nReact,Review\nSQL,Weak", target: "auto" })
  const short = previewImportedLearningContent({ raw: "tiny", target: "auto" })
  const forced = previewImportedLearningContent({ raw: "Hook\nPoint", target: "slides", title: "Deck" })

  assert.equal(sheet.ok, true)
  assert.equal(sheet.target, "sheet")
  assert.equal(sheet.destinationView, "sheets")
  assert.equal(sheet.itemLabel, "3 rows")
  assert.equal(sheet.confidence, "high")
  assert.equal(short.ok, false)
  assert.match(short.warnings.join(" "), /more learning material/)
  assert.equal(forced.confidence, "high")
  assert.equal(forced.title, "Deck")
})
