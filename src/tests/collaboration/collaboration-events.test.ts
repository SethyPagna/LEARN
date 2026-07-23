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
  assert.equal(validateCollaborationEvent({ type: "chat-message", threadId: "t1" }).ok, false)
  assert.equal(validateCollaborationEvent({ type: "typing" }).ok, false)
  assert.equal(validateCollaborationEvent({ type: "call-signal", kind: "offer" }).ok, false)
  assert.equal(validateCollaborationEvent({ type: "call-signal", callId: "c1", kind: "not-a-kind" }).ok, false)
  assert.equal(validateCollaborationEvent({ type: "call-signal", callId: "c1", kind: "ice-candidate" }).ok, false)
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

  assert.deepEqual(validateCollaborationEvent({ type: "chat-message", threadId: "dm_a__b", messageId: "msg_1", body: "hey", userId: "user_1" }).event, {
    type: "chat-message",
    userId: "user_1",
    payload: { threadId: "dm_a__b", messageId: "msg_1", body: "hey", createdAt: "", attachment: undefined },
  })

  assert.deepEqual(validateCollaborationEvent({
    type: "chat-message",
    threadId: "dm_a__b",
    messageId: "msg_2",
    body: "Shared a photo",
    userId: "user_1",
    attachment: { fileId: "asset_1", filename: "photo.png", contentType: "image/png" },
  }).event, {
    type: "chat-message",
    userId: "user_1",
    payload: {
      threadId: "dm_a__b",
      messageId: "msg_2",
      body: "Shared a photo",
      createdAt: "",
      attachment: { fileId: "asset_1", filename: "photo.png", contentType: "image/png" },
    },
  })

  assert.deepEqual(validateCollaborationEvent({ type: "typing", threadId: "dm_a__b", isTyping: true, userId: "user_1" }).event, {
    type: "typing",
    userId: "user_1",
    payload: { threadId: "dm_a__b", isTyping: true },
  })
  assert.equal(validateCollaborationEvent({ type: "typing", threadId: "dm_a__b", isTyping: false }).event?.payload.isTyping, false)

  assert.deepEqual(validateCollaborationEvent({ type: "call-signal", callId: "call_1", kind: "offer", sdp: "v=0...", video: true, userId: "user_1" }).event, {
    type: "call-signal",
    userId: "user_1",
    payload: { callId: "call_1", kind: "offer", video: true, sdp: "v=0...", candidate: undefined },
  })

  assert.deepEqual(validateCollaborationEvent({ type: "call-signal", callId: "call_1", kind: "ice-candidate", candidate: "candidate:1 1 UDP..." }).event, {
    type: "call-signal",
    userId: undefined,
    payload: { callId: "call_1", kind: "ice-candidate", video: false, sdp: undefined, candidate: "candidate:1 1 UDP..." },
  })

  for (const kind of ["hangup", "decline", "busy"]) {
    const result = validateCollaborationEvent({ type: "call-signal", callId: "call_1", kind })
    assert.equal(result.ok, true)
    assert.equal(result.event?.payload.kind, kind)
  }
})

test("collaboration session helpers keep durable object ids stable", () => {
  assert.equal(sessionTypeForRealtimeKind("rooms"), "room")
  assert.equal(sessionTypeForRealtimeKind("battles"), "battle")
  assert.equal(sessionTypeForRealtimeKind("presence"), "presence")
  assert.equal(sessionTypeForRealtimeKind("chat"), "chat")
  assert.equal(collaborationSessionId("rooms", "Study Room #1"), "collab_rooms_Study_Room_1")
})

test("collaboration persistence skips transient presence, chat, and call-signal events", () => {
  assert.equal(shouldPersistCollaborationEvent("presence"), false)
  assert.equal(shouldPersistCollaborationEvent("typing"), false)
  assert.equal(shouldPersistCollaborationEvent("chat-message"), false)
  assert.equal(shouldPersistCollaborationEvent("call-signal"), false)
  assert.equal(shouldPersistCollaborationEvent("pomodoro"), true)
  assert.equal(shouldPersistCollaborationEvent("battle-answer"), true)
  assert.equal(shouldPersistCollaborationEvent("editor-change"), true)
  assert.equal(shouldPersistCollaborationEvent("snapshot"), true)
})
