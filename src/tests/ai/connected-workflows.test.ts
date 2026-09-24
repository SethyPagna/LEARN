import assert from "node:assert/strict"
import test from "node:test"
import { buildInsertBackPayload } from "../../lib/ai/insert-back"
import { buildSourceTutorLaunch } from "../../lib/ai/source-launch"
import { normalizeAiTutorLaunchPreset, normalizeAiTutorDraft } from "../../lib/ai/tutor-drafts"
import { buildAiTutorSourceContext } from "../../lib/ai/tutor-workflow"

test("quiz insertion targets playable quiz storage and preserves the correct choice", () => {
  const payload = buildInsertBackPayload("quiz", JSON.stringify({ title: "Cells", questions: [{ question: "Cell boundary?", choices: ["Membrane", "Nucleus"], answer: "Membrane", explanation: "The membrane encloses the cell." }] }))
  assert.equal(payload.endpoint, "/api/quizzes")
  assert.equal(payload.view, "quizzes")
  assert.deepEqual(payload.body.questions, [{ question: "Cell boundary?", choices: [{ id: "a", text: "Membrane" }, { id: "b", text: "Nucleus" }], correct_answer_id: "a", explanation: "The membrane encloses the cell.", topic: "" }])
})

test("malformed quiz output is rejected instead of silently becoming a note", () => {
  for (const reply of ["Try studying cells", '{"questions":[]}', '{"questions":[null]}', JSON.stringify({ questions: [{ question: "Q", choices: [{ id: "a", text: "A" }, { id: "a", text: "B" }], answer: "a" }] }), JSON.stringify({ questions: [{ question: "Q", choices: ["A", "B"], answer: "missing" }] })]) {
    assert.throws(() => buildInsertBackPayload("quiz", reply), /quiz|Question/)
  }
})

test("both flashcard actions create review queue items and reject missing answers", () => {
  for (const target of ["flashcards", "review-cards"] as const) {
    const payload = buildInsertBackPayload(target, '{"title":"Cells","cards":[{"front":"Boundary?","back":"Membrane"}]}')
    assert.equal(payload.endpoint, "/api/reviews")
    assert.equal(payload.view, "reviews")
    const items = payload.body.items as Array<{ sourceId: string; prompt: string; answer: string }>
    assert.match(items[0].sourceId, /^ai:/)
    assert.equal(items[0].prompt, "Boundary?")
    assert.equal(items[0].answer, "Membrane")
    assert.throws(() => buildInsertBackPayload(target, '{"cards":[{"prompt":"Q"}]}'), /both/)
  }
})

test("source handoff survives launch and draft parsing and excludes unrelated recent notes", () => {
  const launch = normalizeAiTutorLaunchPreset(buildSourceTutorLaunch({ title: "Cell biology", content: "Selected block content", task: "quiz" }))!
  const draft = normalizeAiTutorDraft(launch)!
  assert.equal(draft.sourceContent, "Selected block content")
  assert.equal(launch.insertTarget, "quiz")
  const context = buildAiTutorSourceContext({ message: launch.message, sourceScope: launch.sourceScope, recentContext: "Unrelated private notes", includeRecentNotes: true, activeSourceContext: `${launch.sourceTitle}\n${launch.sourceContent}` })
  assert.match(context, /Cell biology\nSelected block content/)
  assert.doesNotMatch(context, /Unrelated/)
})

test("quiz result can become review cards with resolved answer text and its explanation", () => {
  const result = buildInsertBackPayload("review-cards", JSON.stringify({ title: "Arithmetic", questions: [{ question: "What is 2+2?", choices: ["3", "4"], correct_answer_id: "b", explanation: "Two pairs make four." }] }))
  assert.equal(result.view, "reviews")
  assert.equal(result.endpoint, "/api/reviews")
  const cards = result.body.items as Array<{ prompt: string; answer: string }>
  assert.equal(cards[0].prompt, "What is 2+2?\na. 3\nb. 4")
  assert.equal(cards[0].answer, "4\n\nTwo pairs make four.")
  assert.throws(() => buildInsertBackPayload("review-cards", JSON.stringify({ questions: [{ question: "Invalid?", choices: ["A", "B"], answer: "absent" }] })), /matching one choice/)
})

test("study activity preserves instructions and requires an explicit valid schedule", () => {
  const activity = { title: "Recall cells", notes: "Draw a cell, label its parts, then check the source.", startsAt: "2026-10-01T10:00:00+08:00", endsAt: "2026-10-01T10:30:00+08:00", timezone: "Asia/Hong_Kong" }
  const payload = buildInsertBackPayload("study-activity", JSON.stringify(activity))
  assert.equal(payload.endpoint, "/api/calendar")
  assert.equal(payload.view, "calendar")
  assert.equal(payload.body.notes, activity.notes)
  assert.equal(payload.body.startsAt, "2026-10-01T02:00:00.000Z")
  for (const invalid of [{ ...activity, startsAt: "tomorrow" }, { ...activity, startsAt: activity.endsAt }, { ...activity, timezone: "made-up" }, { ...activity, notes: "" }]) {
    assert.throws(() => buildInsertBackPayload("study-activity", JSON.stringify(invalid)))
  }
})

test("discussion output becomes a private learning space with the complete protocol", () => {
  const payload = buildInsertBackPayload("discussion-space", '{"title":"Cell debate","description":"Compare evidence, take turns, and reflect.","visibility":"public"}')
  assert.equal(payload.endpoint, "/api/learning-spaces")
  assert.equal(payload.view, "spaces")
  assert.equal(payload.body.visibility, "private")
  assert.equal(payload.body.description, "Compare evidence, take turns, and reflect.")
  assert.throws(() => buildInsertBackPayload("discussion-space", '{"title":"No protocol"}'), /protocol/)
  assert.equal(buildSourceTutorLaunch({ title: "Note", content: "Evidence", task: "discussion" }).insertTarget, "discussion-space")
})
