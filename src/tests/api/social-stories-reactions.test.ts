import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { DatabaseSync, type SQLInputValue } from "node:sqlite"
import test from "node:test"
import { installDatabaseStub, primeDatabase, request, TEST_USER_ROW } from "./harness"

test("story audiences, expiry, media access and reactions run against actual SQLite", async (t) => {
  const db = new DatabaseSync(":memory:")
  const migrations = path.resolve("ops/migrations")
  for (const file of readdirSync(migrations).filter((file) => file.endsWith(".sql")).sort()) db.exec(readFileSync(path.join(migrations, file), "utf8"))
  const stub = installDatabaseStub()
  function bindSql() {
    stub.on(/[\s\S]*/, (sql, params) => {
      const statement = db.prepare(sql)
      if (/^\s*(SELECT|WITH|PRAGMA)\b/i.test(sql)) return { rows: statement.all(...params as SQLInputValue[]) }
      return { rowCount: Number(statement.run(...params as SQLInputValue[]).changes) }
    })
  }
  bindSql()
  await primeDatabase(stub)
  bindSql()
  const stories = await import("../../app/api/stories/route")
  const reactions = await import("../../app/api/chat/reactions/route")
  const chat = await import("../../app/api/chat/route")
  const { isFileSharedViaStory } = await import("../../lib/social-data")
  for (const id of ["alice", "bob", "carol"]) db.prepare("INSERT INTO users (id, username, email, name, password_hash) VALUES (?, ?, ?, ?, 'test')").run(id, id, `${id}@example.test`, id)
  db.prepare("INSERT INTO workspace_groups (id, workspace_id, name, created_by_user_id) VALUES ('group-a', 'workspace_demo', 'Group A', 'alice')").run()
  for (const id of ["alice", "bob"]) db.prepare("INSERT INTO group_members (group_id, user_id) VALUES ('group-a', ?)").run(id)
  db.prepare("INSERT INTO media_assets (id, workspace_id, owner_user_id, bucket, object_key, filename, content_type, size_bytes) VALUES ('picture', 'workspace_demo', 'alice', 'files', 'picture', 'picture.png', 'image/png', 64)").run()
  function user(id: string) {
    stub.on(/FROM user_sessions/, { rows: [{ ...TEST_USER_ROW, id, name: id }] })
  }
  async function postStory(body: Record<string, unknown>) {
    const response = await stories.POST(request("/api/stories", { method: "POST", body }))
    return { status: response.status, result: await response.json() }
  }
  async function listIds() {
    const response = await stories.GET(request("/api/stories"))
    assert.equal(response.status, 200)
    return (await response.json()).items.map((item: { id: string }) => item.id) as string[]
  }
  try {
    await t.test("private and friend stories never appear to strangers or pending followers", async () => {
      user("alice")
      const privateStory = await postStory({ body: "Private", audience: "private" })
      const friendStory = await postStory({ body: "Friends", audience: "friends", fileId: "picture" })
      assert.equal(privateStory.status, 201); assert.equal(friendStory.status, 201)
      assert.ok((await listIds()).includes(privateStory.result.item.id))
      user("bob")
      assert.deepEqual(await listIds(), [])
      db.prepare("INSERT INTO user_connections (requester_user_id, target_user_id, connection_type, status) VALUES ('alice', 'bob', 'friend', 'pending')").run()
      assert.deepEqual(await listIds(), [])
      db.prepare("UPDATE user_connections SET status = 'accepted' WHERE requester_user_id = 'alice' AND target_user_id = 'bob'").run()
      assert.deepEqual(await listIds(), [friendStory.result.item.id])
      const bob = { ...TEST_USER_ROW, id: "bob" } as unknown as Parameters<typeof isFileSharedViaStory>[1]
      assert.equal(await isFileSharedViaStory("picture", bob), true)
      db.prepare("INSERT INTO user_connections (requester_user_id, target_user_id, connection_type, status) VALUES ('bob', 'alice', 'follow', 'blocked')").run()
      assert.deepEqual(await listIds(), [])
      assert.equal(await isFileSharedViaStory("picture", bob), false)
      db.prepare("DELETE FROM user_connections WHERE status = 'blocked'").run()
      user("carol")
      assert.deepEqual(await listIds(), [])
    })
    await t.test("server expiry bounds both story reads and attachment access", async () => {
      user("alice")
      const before = Date.now()
      const created = await postStory({ body: "Soon gone", audience: "group", groupId: "group-a", fileId: "picture", expiresAt: "2099-01-01" })
      assert.equal(created.status, 201)
      assert.ok(Date.parse(created.result.item.expiresAt) >= before + 86400000)
      assert.ok(Date.parse(created.result.item.expiresAt) <= Date.now() + 86400000)
      user("bob")
      assert.ok((await listIds()).includes(created.result.item.id))
      db.prepare("UPDATE social_stories SET expires_at = '2000-01-01T00:00:00.000Z'").run()
      assert.deepEqual(await listIds(), [])
      const bob = { ...TEST_USER_ROW, id: "bob" } as unknown as Parameters<typeof isFileSharedViaStory>[1]
      assert.equal(await isFileSharedViaStory("picture", bob), false)
    })
    await t.test("only owners delete stories; group membership and uploaded-file ownership are enforced", async () => {
      user("carol")
      assert.equal((await postStory({ body: "Intrude", audience: "group", groupId: "group-a" })).status, 400)
      assert.equal((await postStory({ body: "Stolen", audience: "private", fileId: "picture" })).status, 400)
      user("alice")
      const created = await postStory({ body: "Delete me", audience: "group", groupId: "group-a" })
      user("bob")
      assert.equal((await stories.DELETE(request(`/api/stories?id=${created.result.item.id}`, { method: "DELETE" }))).status, 400)
      assert.ok((await listIds()).includes(created.result.item.id))
      user("alice")
      assert.equal((await stories.DELETE(request(`/api/stories?id=${created.result.item.id}`, { method: "DELETE" }))).status, 200)
      assert.ok(!(await listIds()).includes(created.result.item.id))
    })
    await t.test("reactions are idempotent, scoped to the actor and restricted to conversation members", async () => {
      db.prepare("INSERT INTO chat_threads (id, workspace_id, title, created_by_user_id, target_user_id) VALUES ('dm', 'workspace_demo', 'Private DM', 'alice', 'bob')").run()
      db.prepare("INSERT INTO chat_messages (id, thread_id, user_id, body) VALUES ('message', 'dm', 'alice', 'Hello')").run()
      const react = (active: boolean) => reactions.POST(request("/api/chat/reactions", { method: "POST", body: { messageId: "message", emoji: "👍", active, userId: "alice" } }))
      user("carol")
      assert.equal((await react(true)).status, 400)
      user("bob")
      assert.equal((await react(true)).status, 200); assert.equal((await react(true)).status, 200)
      let response = await chat.GET(request("/api/chat?threadId=dm"))
      assert.deepEqual((await response.json()).reactions.message, [{ emoji: "👍", count: 1, mine: true }])
      assert.equal(db.prepare("SELECT user_id FROM chat_message_reactions").get()?.user_id, "bob")
      user("alice")
      assert.equal((await react(false)).status, 200)
      response = await chat.GET(request("/api/chat?threadId=dm"))
      assert.deepEqual((await response.json()).reactions.message, [{ emoji: "👍", count: 1, mine: false }])
      user("bob")
      assert.equal((await react(false)).status, 200)
      assert.equal(db.prepare("SELECT count(*) AS n FROM chat_message_reactions").get()?.n, 0)
    })
  } finally { stub.restore(); db.close() }
})
