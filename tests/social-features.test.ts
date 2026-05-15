import assert from "node:assert/strict"
import test from "node:test"
import { buildChatDraftPayload, filterChatThreads, parseThreadTitle } from "../lib/social-features"

test("chat draft payload normalizes channel intent and metadata", () => {
  const payload = buildChatDraftPayload({
    body: "Can @alex review /studio notes?",
    channel: "study-help",
    title: "Database review",
    intent: "question",
  })

  assert.equal(payload.title, "#study-help - Database review")
  assert.equal(payload.body, "[question] Can @alex review /studio notes?")
  assert.equal(payload.metadata.hasMention, true)
  assert.equal(payload.metadata.hasStudioLink, true)
})

test("chat thread title parsing keeps channel and readable title", () => {
  assert.deepEqual(parseThreadTitle("#wins - Weekly review"), { channel: "#wins", title: "Weekly review" })
  assert.deepEqual(parseThreadTitle("Plain thread"), { channel: "#general", title: "Plain thread" })
})

test("chat thread filtering supports query questions wins and saved", () => {
  const threads = [
    { title: "#study-help - React", last_message: "[question] Why hooks?" },
    { title: "#wins - Streak", last_message: "[win] Finished reviews" },
    { title: "#general - Links", last_message: "[saved] bookmark this resource" },
  ]

  assert.equal(filterChatThreads(threads, { query: "react" }).length, 1)
  assert.equal(filterChatThreads(threads, { filter: "questions" }).length, 1)
  assert.equal(filterChatThreads(threads, { filter: "wins" }).length, 1)
  assert.equal(filterChatThreads(threads, { filter: "saved" }).length, 1)
})
