import assert from "node:assert/strict"
import test from "node:test"
import {
  normalizeAiTutorDraft,
  normalizeAiTutorLaunchPreset,
  parseStoredAiTutorDraft,
  parseStoredAiTutorLaunchPreset,
} from "../../lib/ai/tutor-drafts"

test("AI tutor draft parser rejects invalid JSON and non-object payloads", () => {
  assert.equal(parseStoredAiTutorDraft("{bad json"), null)
  assert.equal(parseStoredAiTutorDraft(JSON.stringify(["not", "a", "draft"])), null)
  assert.equal(parseStoredAiTutorLaunchPreset(JSON.stringify(null)), null)
})

test("AI tutor draft normalization keeps known values and repairs unsafe fields", () => {
  const draft = normalizeAiTutorDraft({
    message: "Build a quiz",
    reply: 42,
    importTarget: "slides",
    lastImport: { target: "sheet", title: "CSV import" },
    sourceScope: "Uploaded files",
    difficulty: "Exam prep",
    tone: "Socratic",
    outputLength: "Max",
    language: "Khmer",
    providerFamily: "groq",
    insertTarget: "quiz",
    targetAudience: "Year 12",
    requiredOutput: "Timed practice",
    activeTaskKey: "practice_generator",
    updatedAt: "2026-05-29T00:00:00.000Z",
  })

  assert.equal(draft?.message, "Build a quiz")
  assert.equal(draft?.reply, "")
  assert.equal(draft?.importTarget, "slides")
  assert.deepEqual(draft?.lastImport, { target: "sheet", title: "CSV import" })
  assert.equal(draft?.sourceScope, "Uploaded files")
  assert.equal(draft?.difficulty, "Exam prep")
  assert.equal(draft?.tone, "Socratic")
  assert.equal(draft?.outputLength, "Max")
  assert.equal(draft?.language, "Khmer")
  assert.equal(draft?.providerFamily, "groq")
  assert.equal(draft?.insertTarget, "quiz")
  assert.equal(draft?.targetAudience, "Year 12")
  assert.equal(draft?.requiredOutput, "Timed practice")
  assert.equal(draft?.activeTaskKey, "practice_generator")
  assert.equal(draft?.updatedAt, "2026-05-29T00:00:00.000Z")
})

test("AI tutor draft normalization falls back for unknown choices", () => {
  const draft = normalizeAiTutorDraft({
    sourceScope: "Everything",
    difficulty: "Impossible",
    tone: "Loud",
    outputLength: "Tiny",
    language: "Emoji",
    insertTarget: "unsafe-target",
    activeTaskKey: "not-a-task",
    lastImport: { target: "unknown", title: "Bad import" },
    updatedAt: "not-a-date",
  })

  assert.equal(draft?.message, "Create a study plan from my recent notes.")
  assert.equal(draft?.sourceScope, "Recent notes")
  assert.equal(draft?.difficulty, "Adaptive")
  assert.equal(draft?.tone, "Kind")
  assert.equal(draft?.outputLength, "Balanced")
  assert.equal(draft?.language, "English")
  assert.equal(draft?.insertTarget, "ai-note")
  assert.equal(draft?.activeTaskKey, "answer_explanation")
  assert.equal(draft?.lastImport, null)
  assert.equal(draft?.updatedAt, "")
})

test("AI tutor launch preset parser normalizes saved navigation presets", () => {
  const launch = parseStoredAiTutorLaunchPreset(JSON.stringify({
    activeTaskKey: "slide_builder",
    insertTarget: "slide-outline",
    message: "Create a deck",
    modeGroup: "practice",
    outputLength: "Deep",
    sourceScope: "Active Studio item",
    status: "Ready",
  }))

  assert.equal(launch?.activeTaskKey, "slide_builder")
  assert.equal(launch?.insertTarget, "slide-outline")
  assert.equal(launch?.message, "Create a deck")
  assert.equal(launch?.modeGroup, "practice")
  assert.equal(launch?.outputLength, "Deep")
  assert.equal(launch?.sourceScope, "Active Studio item")
  assert.equal(launch?.status, "Ready")
})
