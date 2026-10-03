import assert from "node:assert/strict"
import test from "node:test"
import {
  AI_TUTOR_DRAFT_KEY,
  archiveAiTutorDraft,
  normalizeAiTutorDraft,
  normalizeAiTutorLaunchPreset,
  parseStoredAiTutorDraft,
  parseStoredAiTutorLaunchPreset,
  persistAiTutorDraft,
  readPreviousAiTutorDraft,
} from "../../lib/ai/tutor-drafts"

function draftStorage() {
  const values = new Map<string, string>()
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
}

test("a new source can replace the active draft while its original prompt, reply and source remain restorable", () => {
  const saved = draftStorage()
  const original = normalizeAiTutorDraft({ message: "My unfinished prompt", reply: "Original provider reply", sourceTitle: "Original note", sourceContent: "Original selected words", sourceScope: "Active Studio item" })!
  const incoming = normalizeAiTutorDraft({ message: "New source prompt", sourceTitle: "New note", sourceContent: "New selected words", sourceScope: "Active Studio item" })!
  persistAiTutorDraft(saved, original)
  archiveAiTutorDraft(saved, original)
  persistAiTutorDraft(saved, incoming)
  assert.deepEqual(parseStoredAiTutorDraft(saved.getItem(AI_TUTOR_DRAFT_KEY)), incoming)
  assert.deepEqual(readPreviousAiTutorDraft(saved, incoming), original)
  archiveAiTutorDraft(saved, incoming)
  persistAiTutorDraft(saved, original)
  assert.deepEqual(readPreviousAiTutorDraft(saved, original), incoming, "restoring one draft also preserves the outgoing source")
})

test("archiving never removes older drafts and timestamps do not make duplicate snapshots", () => {
  const saved = draftStorage()
  const first = normalizeAiTutorDraft({ message: "First", reply: "Keep first reply" })!
  const second = normalizeAiTutorDraft({ message: "Second", reply: "Keep second reply" })!
  archiveAiTutorDraft(saved, first)
  archiveAiTutorDraft(saved, second)
  archiveAiTutorDraft(saved, { ...first, updatedAt: "2026-10-01T09:00:00Z" })
  assert.equal(readPreviousAiTutorDraft(saved, first)?.reply, second.reply)
})

test("failed draft archiving leaves the existing active prompt and reply intact", () => {
  const saved = draftStorage()
  const original = normalizeAiTutorDraft({ message: "Unfinished", reply: "Never lose this reply" })!
  persistAiTutorDraft(saved, original)
  const denied = { ...saved, setItem: () => { throw new Error("quota") } }
  assert.throws(() => archiveAiTutorDraft(denied, original), /quota/)
  assert.deepEqual(parseStoredAiTutorDraft(saved.getItem(AI_TUTOR_DRAFT_KEY)), original)
})

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
