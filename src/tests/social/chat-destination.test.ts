import assert from "node:assert/strict"
import test from "node:test"
import { chatDestinationPayload, chatDestinationStorageKey, selectConversationThread } from "../../lib/chat-destination"
import { acceptsCallSignal } from "../../lib/chat-call"

const threads = [
  { id: "group-thread", group_id: "group-a", dm_peer_id: null },
  { id: "dm-thread", group_id: null, dm_peer_id: "bob" },
]

test("a selected DM never falls back to a joined group or another recipient", () => {
  assert.equal(selectConversationThread(threads, { kind: "dm", targetUserId: "bob" })?.id, "dm-thread")
  assert.equal(selectConversationThread(threads, { kind: "dm", targetUserId: "carol" }), null)
  assert.deepEqual(chatDestinationPayload({ kind: "dm", targetUserId: "carol" }), { targetUserId: "carol" })
})

test("switching destinations cannot carry the old reply thread into a new send", () => {
  assert.deepEqual(chatDestinationPayload({ kind: "thread", threadId: "old-thread" }), { threadId: "old-thread" })
  assert.deepEqual(chatDestinationPayload({ kind: "group", groupId: "new-group" }), { groupId: "new-group" })
  assert.equal(selectConversationThread(threads, { kind: "group", groupId: "new-group" }), null)
  assert.equal(selectConversationThread(threads, { kind: "thread", threadId: "deleted-thread" }), null)
})

test("the remembered conversation is kept per learner under the chat draft key", () => {
  assert.equal(chatDestinationStorageKey("user_a"), "learn_chat_draft_v1:user_a:destination")
  assert.equal(chatDestinationStorageKey("a:b/c"), "learn_chat_draft_v1:a%3Ab%2Fc:destination", "an id cannot reach another learner's key")
})

test("group invitations accept one peer and ignore other members' decline and negotiation", () => {
  const ringing = { callId: "c1", peerUserId: "", status: "outgoing" as const }
  assert.equal(acceptsCallSignal(ringing, { callId: "c1", kind: "busy", userId: "carol" }), false)
  assert.equal(acceptsCallSignal(ringing, { callId: "c1", kind: "answer", userId: "bob" }), true)
  const connected = { ...ringing, status: "connected" as const, peerUserId: "bob", peerDevice: "phone" }
  assert.equal(acceptsCallSignal(connected, { callId: "c1", kind: "hangup", userId: "carol" }), false)
  assert.equal(acceptsCallSignal(connected, { callId: "c1", kind: "hangup", userId: "bob", device: "laptop" }), false)
  assert.equal(acceptsCallSignal(connected, { callId: "c1", kind: "answer", userId: "bob", device: "phone" }), false)
  assert.equal(acceptsCallSignal(connected, { callId: "c1", kind: "hangup", userId: "bob", device: "phone" }), true)
})
