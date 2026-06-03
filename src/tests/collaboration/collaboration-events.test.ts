import assert from "node:assert/strict"
import test from "node:test"
import {
  collaborationSessionId,
  parseCollaborationEventInput,
  sessionTypeForRealtimeKind,
  shouldPersistCollaborationEvent,
  validateCollaborationEvent,
} from "../../lib/collaboration-events"

test("collaboration event parser separates malformed JSON from validation", () => {
  assert.deepEqual(parseCollaborationEventInput("not json"), { ok: false, error: "Message must be valid JSON." })
  assert.deepEqual(parseCollaborationEventInput(JSON.stringify({ type: "presence", count: 2 })), {
    ok: true,
    input: { type: "presence", count: 2 },
  })
  assert.deepEqual(parseCollaborationEventInput({ type: "presence", count: 1 }), {
    ok: true,
    input: { type: "presence", count: 1 },
  })
})

test("collaboration event validation rejects unknown and malformed messages", () => {
  assert.equal(validateCollaborationEvent("not json").ok, false)
  assert.equal(validateCollaborationEvent({ type: "unknown" }).ok, false)
  assert.equal(validateCollaborationEvent({ type: "pomodoro", status: "sleep" }).ok, false)
  assert.equal(validateCollaborationEvent({ type: "battle-answer", questionId: "q1" }).ok, false)
  assert.equal(validateCollaborationEvent({ type: "editor-change", operation: "insert" }).ok, false)
})

test("collaboration event validation normalizes useful realtime events", () => {
  assert.deepEqual(validateCollaborationEvent({ type: "presence", count: 3 }).event, {
    type: "presence",
    userId: undefined,
    payload: { count: 3 },
  })

  assert.deepEqual(validateCollaborationEvent({ type: "pomodoro", status: "start", minutes: 45, userId: "user_1" }).event, {
    type: "pomodoro",
    userId: "user_1",
    payload: { status: "start", minutes: 45 },
  })

  assert.deepEqual(validateCollaborationEvent({ type: "battle-answer", question_id: "q1", selected_answer_id: "a2" }).event, {
    type: "battle-answer",
    userId: undefined,
    payload: { questionId: "q1", answerId: "a2" },
  })

  assert.deepEqual(validateCollaborationEvent({ type: "editor-change", content_item_id: "content_1", operation: "replace" }).event, {
    type: "editor-change",
    userId: undefined,
    payload: { contentItemId: "content_1", operation: "replace", clientMutationId: "" },
  })
})

test("collaboration session helpers keep durable object ids stable", () => {
  assert.equal(sessionTypeForRealtimeKind("rooms"), "room")
  assert.equal(sessionTypeForRealtimeKind("battles"), "battle")
  assert.equal(sessionTypeForRealtimeKind("presence"), "presence")
  assert.equal(collaborationSessionId("rooms", "Study Room #1"), "collab_rooms_Study_Room_1")
})

test("collaboration persistence skips transient presence only", () => {
  assert.equal(shouldPersistCollaborationEvent("presence"), false)
  assert.equal(shouldPersistCollaborationEvent("pomodoro"), true)
  assert.equal(shouldPersistCollaborationEvent("battle-answer"), true)
  assert.equal(shouldPersistCollaborationEvent("editor-change"), true)
  assert.equal(shouldPersistCollaborationEvent("snapshot"), true)
})
