import assert from "node:assert/strict"
import test from "node:test"
import { CHAT_DRAFT_KEY, normalizeChatDraft, parseStoredChatDraft, serializeChatDraft } from "../../lib/chat-drafts"

test("chat draft storage key stays stable", () => {
  assert.equal(CHAT_DRAFT_KEY, "learn_chat_draft_v1")
})

test("chat draft parser rejects invalid saved payloads", () => {
  assert.equal(parseStoredChatDraft("{bad json"), null)
  assert.equal(parseStoredChatDraft(JSON.stringify(["not", "a", "draft"])), null)
  assert.equal(normalizeChatDraft(null), null)
})

test("chat draft parser normalizes channel intent and reply metadata", () => {
  const draft = parseStoredChatDraft(JSON.stringify({
    body: "  Can someone check this proof?  ",
    title: "  Logic help  ",
    intent: "question",
    channel: "study group",
    replyThreadId: " thread_1 ",
  }))

  assert.equal(draft?.body, "Can someone check this proof?")
  assert.equal(draft?.title, "Logic help")
  assert.equal(draft?.intent, "question")
  assert.equal(draft?.channel, "#study-group")
  assert.equal(draft?.replyThreadId, "thread_1")
})

test("chat draft parser falls back for unsafe choices", () => {
  const draft = normalizeChatDraft({
    body: "",
    title: "",
    intent: "admin",
    channel: "",
    replyThreadId: "",
  })

  assert.equal(draft?.body, "")
  assert.equal(draft?.title, "Study room")
  assert.equal(draft?.intent, "update")
  assert.equal(draft?.channel, "#general")
  assert.equal(draft?.replyThreadId, undefined)
})

test("chat draft serializer writes normalized payloads only", () => {
  const parsed = JSON.parse(serializeChatDraft({
    body: " Win ",
    title: "  Weekly recap ",
    intent: "win",
    channel: "wins",
  }))

  assert.deepEqual(parsed, {
    body: "Win",
    title: "Weekly recap",
    intent: "win",
    channel: "#wins",
  })
})
