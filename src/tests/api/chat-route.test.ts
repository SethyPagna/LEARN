import assert from "node:assert/strict"
import test from "node:test"
import { installDatabaseStub, primeDatabase, request, stubSessionLookup, TEST_USER_ROW } from "./harness"
import { setLocalRealtimeHub } from "../../lib/realtime/hub-core"

test("chat handlers enforce conversation destinations and attachment privacy", async (t) => {
  const stub = installDatabaseStub()
  await primeDatabase(stub)
  const { GET, POST } = await import("../../app/api/chat/route")
  const events: Array<{ channel: string; payload: Record<string, unknown> }> = []
  setLocalRealtimeHub({
    broadcast(_kind, channel, event) { events.push({ channel, payload: event.payload }); return 1 },
    snapshot() { return { connections: 0, users: [], events: [] } },
    onlineUserIds() { return [] },
  })
  function reset() { stub.reset(); stubSessionLookup(stub); events.length = 0 }
  const post = (body: Record<string, unknown>) => POST(request("/api/chat", { method: "POST", body: { body: "Private message", ...body } }))
  try {
    await t.test("hybrid DM/group targets are rejected without writing a message", async () => {
      reset()
      const response = await post({ groupId: "group-a", targetUserId: "bob" })
      assert.equal(response.status, 400)
      assert.equal(stub.writesMatching(/chat_(threads|messages)/).length, 0)
      assert.equal(events.length, 0)
    })
    await t.test("nonparticipants cannot read or append to another conversation", async () => {
      reset()
      stub.on(/SELECT id, group_id, target_user_id, created_by_user_id FROM chat_threads/, { rows: [{ id: "private", created_by_user_id: "alice", target_user_id: "bob" }] })
      assert.equal((await GET(request("/api/chat?threadId=private"))).status, 400)
      assert.equal((await post({ threadId: "private" })).status, 400)
      assert.equal(stub.writesMatching(/chat_(threads|messages)/).length, 0)
      assert.equal(stub.matching(/SELECT \* FROM chat_messages/).length, 0)
    })
    await t.test("an old reply thread cannot override a newly selected recipient", async () => {
      reset()
      stub.on(/SELECT id, group_id, target_user_id, created_by_user_id FROM chat_threads/, { rows: [{ id: "old", created_by_user_id: TEST_USER_ROW.id, target_user_id: "alice" }] })
      stub.on(/SELECT 1 FROM chat_threads t/, { rows: [{ allowed: 1 }] })
      assert.equal((await post({ threadId: "old", targetUserId: "bob" })).status, 400)
      assert.equal(stub.writesMatching(/chat_(threads|messages)/).length, 0)
    })
    await t.test("group membership is checked before writes", async () => {
      reset()
      assert.equal((await post({ groupId: "private-group" })).status, 400)
      assert.equal(stub.writesMatching(/chat_(threads|messages)/).length, 0)
    })
    await t.test("consecutive group messages reuse the existing group conversation", async () => {
      reset()
      stub.on(/SELECT 1 FROM group_members/, { rows: [{ member: 1 }] })
      stub.on(/SELECT id FROM chat_threads WHERE group_id/, { rows: [{ id: "group-thread" }] })
      stub.on(/SELECT group_id, target_user_id, created_by_user_id FROM chat_threads/, { rows: [{ group_id: "group-a", target_user_id: null, created_by_user_id: TEST_USER_ROW.id }] })
      for (let attempt = 0; attempt < 2; attempt++) assert.equal((await post({ groupId: "group-a" })).status, 201)
      assert.deepEqual(stub.writesMatching(/INSERT INTO chat_messages/).map((entry) => entry.params[1]), ["group-thread", "group-thread"])
      assert.deepEqual(events.map((event) => event.channel), ["group__group-a", "group__group-a"])
    })
    await t.test("DM writes and notifications stay on the two-party conversation", async () => {
      reset()
      stub.on(/SELECT id FROM chat_threads\s+WHERE group_id IS NULL/, { rows: [{ id: "dm-thread" }] })
      stub.on(/SELECT group_id, target_user_id, created_by_user_id FROM chat_threads/, { rows: [{ group_id: null, target_user_id: "bob", created_by_user_id: TEST_USER_ROW.id }] })
      assert.equal((await post({ targetUserId: "bob" })).status, 201)
      const inserted = stub.writesMatching(/INSERT INTO chat_threads/)[0]
      assert.equal(inserted.params[1], null)
      assert.equal(inserted.params[2], "bob")
      assert.equal(events[0]?.channel, [TEST_USER_ROW.id, "bob"].sort().join("__"))
      assert.deepEqual(events[0]?.payload, { threadId: "dm-thread" })
    })
    await t.test("another person's uploaded file cannot be attached", async () => {
      reset()
      assert.equal((await post({ targetUserId: "bob", metadata: { attachment: { fileId: "alice-file" } } })).status, 400)
      assert.equal(stub.writesMatching(/chat_(threads|messages)/).length, 0)
      assert.equal(stub.matching(/FROM media_assets/)[0]?.params[1], TEST_USER_ROW.id)
    })
    await t.test("clients cannot forge a game result card", async () => {
      reset()
      assert.equal((await post({ metadata: { kind: "live-game-result", participants: [{ name: "Me", score: 999 }] } })).status, 201)
      const stored = stub.writesMatching(/INSERT INTO chat_messages/)[0]
      assert.deepEqual(JSON.parse(String(stored.params[4])), {})
    })
    await t.test("a private quiz cannot be copied into a hosted game by another user", async () => {
      reset()
      const { POST: launch } = await import("../../app/api/live-sessions/route")
      stub.on(/SELECT \* FROM quizzes WHERE/, { rows: [{ id: "private-quiz", created_by_user_id: "alice" }] })
      const response = await launch(request("/api/live-sessions", { method: "POST", body: { quizId: "private-quiz" } }))
      assert.equal(response.status, 400)
      assert.match((await response.json()).error, /access to this quiz/)
      assert.equal(stub.writesMatching(/live_quiz_sessions|chat_messages/).length, 0)
    })
    await t.test("hosting honors a direct viewer grant but never an unpresented public link", async () => {
      const { POST: launch } = await import("../../app/api/live-sessions/route")
      for (const grantType of ["public_link", "user"]) {
        reset()
        stub.on(/SELECT \* FROM quizzes WHERE/, { rows: [{ id: "shared-quiz", title: "Shared", created_by_user_id: "alice" }] })
        stub.on(/SELECT \* FROM quiz_questions WHERE/, { rows: [{ id: "q1", question: "Two plus two?", choices: JSON.stringify([{ id: "a", text: "Four" }, { id: "b", text: "Five" }]), correct_answer_id: "a" }] })
        stub.on(/FROM content_items WHERE source_table/, { rows: [{ id: "item", owner_user_id: "alice", visibility: "private" }] })
        stub.on(/FROM shared_access WHERE content_item_id/, { rows: [{ content_item_id: "item", grantee_type: grantType, grantee_id: TEST_USER_ROW.id, role: "viewer" }] })
        const response = await launch(request("/api/live-sessions", { method: "POST", body: { quizId: "shared-quiz" } }))
        assert.equal(response.status, grantType === "user" ? 201 : 400)
        assert.equal(stub.writesMatching(/INSERT INTO live_quiz_sessions/).length, grantType === "user" ? 1 : 0)
      }
    })
    await t.test("game invitations and final results notify the originating chat exactly once", async () => {
      reset()
      const { POST: launch } = await import("../../app/api/live-sessions/route")
      const { POST: control } = await import("../../app/api/live-sessions/[code]/route")
      stub.on(/SELECT \* FROM quizzes WHERE/, { rows: [{ id: "quiz", title: "Quiz", created_by_user_id: TEST_USER_ROW.id }] })
      stub.on(/SELECT \* FROM quiz_questions WHERE/, { rows: [{ id: "q1", question: "Two plus two?", choices: JSON.stringify([{ id: "a", text: "Four" }, { id: "b", text: "Five" }]), correct_answer_id: "a" }] })
      stub.on(/SELECT 1 FROM group_members/, { rows: [{ member: 1 }] })
      stub.on(/SELECT id FROM chat_threads WHERE group_id/, { rows: [{ id: "game-thread" }] })
      stub.on(/SELECT group_id, target_user_id, created_by_user_id FROM chat_threads/, { rows: [{ group_id: "group-a", target_user_id: null, created_by_user_id: TEST_USER_ROW.id }] })
      let state = ""
      stub.on(/UPDATE live_quiz_sessions SET state_json/, (_sql, params) => { state = String(params[0]); return { rowCount: 1 } })
      stub.on(/UPDATE live_quiz_sessions\s+SET phase/, (_sql, params) => { state = String(params[2]); return { rowCount: 1 } })
      stub.on(/SELECT \* FROM live_quiz_sessions WHERE code/, () => ({ rows: [{ id: "session", state_json: state }] }))
      stub.on(/INSERT INTO chat_messages/, { rowCount: 1 })
      const response = await launch(request("/api/live-sessions", { method: "POST", body: { quizId: "quiz", groupId: "group-a" } }))
      assert.equal(response.status, 201)
      const launched = await response.json()
      const code = String(launched.item.code)
      assert.deepEqual(events.filter((event) => event.channel === "group__group-a").map((event) => event.payload), [{ threadId: "game-thread" }])
      for (let attempt = 0; attempt < 2; attempt++) {
        assert.equal((await control(request(`/api/live-sessions/${code}`, { method: "POST", body: { action: "close" } }), { params: Promise.resolve({ code }) })).status, 200)
      }
      const descriptors = stub.writesMatching(/INSERT INTO chat_messages/).map((entry) => JSON.parse(String(entry.params[4])))
      assert.deepEqual(descriptors.map((entry) => entry.kind), ["live-game", "live-game-result"])
      assert.equal(events.filter((event) => event.channel === "group__group-a").length, 2)
    })
  } finally { setLocalRealtimeHub(null); stub.restore() }
})
