import assert from "node:assert/strict"
import test from "node:test"
import { installDatabaseStub, primeDatabase, request, stubSessionLookup, TEST_USER_ROW } from "./harness"
import { setLocalRealtimeHub } from "../../lib/realtime/hub-core"
import { createSqliteFixture } from "./sqlite-store"

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
    await t.test("thread lists restore only the current actor's saved and helpful flags", async () => {
      reset()
      stub.on(/SELECT t\.\*/, { rows: [
        { id: "saved-thread", saved: 1, helpful: 0 },
        { id: "helpful-thread", saved: 0, helpful: 1 },
      ] })
      const response = await GET(request("/api/chat"))
      assert.equal(response.status, 200)
      assert.deepEqual((await response.json()).items, [
        { id: "saved-thread", saved: true, helpful: false },
        { id: "helpful-thread", saved: false, helpful: true },
      ])
      const lookup = stub.matching(/SELECT t\.\*/)[0]
      assert.equal((lookup.sql.match(/sa\.actor_user_id\s*=\s*\?/g) || []).length, 2)
      assert.equal((lookup.sql.match(/sa\.target_id\s*=\s*t\.id/g) || []).length, 2)
      assert.match(lookup.sql, /sa\.action_type IN \('save', 'bookmark'\)/)
      assert.ok(lookup.params.length > 0 && lookup.params.every(value => value === TEST_USER_ROW.id))
      assert.match(lookup.sql, /group_members WHERE user_id/)
    })
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
    await t.test("game results persist once and host retries notify the originating chat again", async () => {
      reset()
      const fixture = await createSqliteFixture()
      try {
        const { database } = fixture
        database.prepare("INSERT INTO users (id, username, email, name, password_hash) VALUES (?, ?, ?, ?, 'test')")
          .run(TEST_USER_ROW.id, TEST_USER_ROW.username, TEST_USER_ROW.email, TEST_USER_ROW.name)
        database.prepare("INSERT INTO workspaces (id, owner_user_id, name) VALUES ('workspace_demo', ?, 'Fixture workspace')").run(TEST_USER_ROW.id)
        database.prepare("INSERT INTO workspace_groups (id, workspace_id, name, created_by_user_id) VALUES ('group-a', 'workspace_demo', 'Fixture group', ?)").run(TEST_USER_ROW.id)
        database.prepare("INSERT INTO group_members (group_id, user_id) VALUES ('group-a', ?)").run(TEST_USER_ROW.id)
        database.prepare("INSERT INTO chat_threads (id, workspace_id, group_id, title, created_by_user_id) VALUES ('game-thread', 'workspace_demo', 'group-a', 'Fixture chat', ?)").run(TEST_USER_ROW.id)
        database.prepare("INSERT INTO quizzes (id, workspace_id, title, topic, created_by_user_id) VALUES ('quiz', 'workspace_demo', 'Fixture quiz', 'math', ?)").run(TEST_USER_ROW.id)
        database.prepare("INSERT INTO quiz_questions (id, quiz_id, question, choices, correct_answer_id, topic) VALUES ('q1', 'quiz', 'Two plus two?', ?, 'a', 'math')")
          .run(JSON.stringify([{ id: "a", text: "Four" }, { id: "b", text: "Five" }]))
        stubSessionLookup(fixture.stub)
        const { POST: launch } = await import("../../app/api/live-sessions/route")
        const { POST: control } = await import("../../app/api/live-sessions/[code]/route")
        const response = await launch(request("/api/live-sessions", { method: "POST", body: { quizId: "quiz", groupId: "group-a" } }))
        assert.equal(response.status, 201)
        const launched = await response.json()
        const code = String(launched.item.code)
        assert.equal(launched.threadId, "game-thread")
        assert.equal(launched.item.session.threadId, "game-thread", "attachment reads back the actual stored state")
        const chatEvents = () => events.filter((event) => event.channel === "group__group-a")
        assert.deepEqual(chatEvents().map((event) => event.payload), [{ threadId: "game-thread" }])
        for (let attempt = 0; attempt < 2; attempt++) {
          const closed = await control(request(`/api/live-sessions/${code}`, { method: "POST", body: { action: "close" } }), { params: Promise.resolve({ code }) })
          assert.equal(closed.status, 200)
          assert.equal(chatEvents().length, attempt + 2, "each confirmed finish or repair wakes the same conversation")
          assert.equal(database.prepare("SELECT count(*) AS count FROM chat_messages WHERE json_extract(metadata, '$.kind') = 'live-game-result'").get()?.count, 1)
        }
        const descriptors = database.prepare("SELECT metadata FROM chat_messages WHERE thread_id = 'game-thread'").all()
          .map((row) => JSON.parse(String(row.metadata)))
        assert.deepEqual(descriptors.map((entry) => entry.kind).sort(), ["live-game", "live-game-result"])
        assert.equal(database.prepare("SELECT count(*) AS count FROM audit_logs WHERE entity = 'chat_message' AND entity_id = ?").get(`chatmsg_liveresult_${code}`)?.count, 1)
        assert.ok(chatEvents().every((event) => event.payload.threadId === "game-thread"))
      } finally { fixture.close() }
    })
  } finally { setLocalRealtimeHub(null); stub.restore() }
})
