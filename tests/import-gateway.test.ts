import assert from "node:assert/strict"
import test from "node:test"
import { buildImportFollowupAction, detectImportTarget, getImportDestinationView, labelImportTarget, previewImportedLearningContent, shapeImportedLearningContent } from "../lib/import-gateway"

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

test("import gateway exposes shared labels and destinations", () => {
  assert.equal(labelImportTarget("auto"), "Auto detect")
  assert.equal(labelImportTarget("doc"), "Document")
  assert.equal(labelImportTarget("sheet"), "Sheet")
  assert.equal(labelImportTarget("slides"), "Slides")
  assert.equal(labelImportTarget("note"), "Note")
  assert.equal(getImportDestinationView("doc"), "docs")
  assert.equal(getImportDestinationView("sheet"), "sheets")
  assert.equal(getImportDestinationView("slides"), "slides")
  assert.equal(getImportDestinationView("note"), "notes")
})

test("import gateway follow-up actions load complete AI workflows", () => {
  const practice = buildImportFollowupAction({ kind: "practice", target: "doc", title: "Database Indexing" })
  const flashcards = buildImportFollowupAction({ kind: "flashcards", target: "sheet", title: "Topic Tracker" })
  const cleanup = buildImportFollowupAction({ kind: "cleanup", target: "slides", title: "Lesson Deck" })
  const sheetCleanup = buildImportFollowupAction({ kind: "cleanup", target: "sheet", title: "Tracker" })
  const docCleanup = buildImportFollowupAction({ kind: "cleanup", target: "doc", title: "Study Guide" })
  const noteCleanup = buildImportFollowupAction({ kind: "cleanup", target: "note", title: "Daily Capture" })

  assert.equal(practice.taskKey, "practice_generator")
  assert.equal(practice.aiMode, "quiz")
  assert.equal(practice.insertTarget, "quiz")
  assert.equal(practice.sourceScope, "Uploaded files")
  assert.match(practice.message, /mixed question types/)

  assert.equal(flashcards.taskKey, "flashcard_generation")
  assert.equal(flashcards.insertTarget, "flashcards")
  assert.match(flashcards.message, /matching pairs/)

  assert.equal(cleanup.taskKey, "slide_builder")
  assert.equal(cleanup.insertTarget, "slide-outline")
  assert.match(cleanup.message, /Build slides from/)
  assert.match(cleanup.status, /Cleanup workflow loaded/)

  assert.equal(sheetCleanup.taskKey, "sheet_organizer")
  assert.equal(sheetCleanup.insertTarget, "sheet-rows")
  assert.match(sheetCleanup.message, /Organize/)

  assert.equal(docCleanup.taskKey, "document_formatter")
  assert.equal(docCleanup.insertTarget, "doc-section")

  assert.equal(noteCleanup.taskKey, "note_design")
  assert.equal(noteCleanup.insertTarget, "note-block")
  assert.match(noteCleanup.message, /Rewrite/)
})
