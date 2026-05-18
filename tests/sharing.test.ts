import assert from "node:assert/strict"
import test from "node:test"
import {
  canUseContentRole,
  normalizeConnectionInput,
  normalizeSocialActionInput,
  resolveContentPermission,
} from "../lib/sharing"

test("connection input normalizes follow friend and block states", () => {
  assert.deepEqual(
    normalizeConnectionInput({
      requesterUserId: "user_a",
      targetUserId: "user_b",
      connectionType: "friend",
      status: "pending",
    }),
    {
      requesterUserId: "user_a",
      targetUserId: "user_b",
      connectionType: "friend",
      status: "pending",
    },
  )

  assert.deepEqual(
    normalizeConnectionInput({
      requesterUserId: "user_a",
      targetUserId: "user_c",
      connectionType: "unknown",
      status: "unknown",
    }),
    {
      requesterUserId: "user_a",
      targetUserId: "user_c",
      connectionType: "follow",
      status: "accepted",
    },
  )

  assert.throws(
    () => normalizeConnectionInput({ requesterUserId: "user_a", targetUserId: "user_a" }),
    /cannot connect/,
  )
})

test("content permissions prefer owner admin shared grants and public visibility", () => {
  const contentItem = {
    id: "content_1",
    owner_user_id: "owner",
    visibility: "private",
  }
  const grants = [
    { content_item_id: "content_1", grantee_type: "user" as const, grantee_id: "viewer", role: "viewer" as const },
    { content_item_id: "content_1", grantee_type: "group" as const, grantee_id: "group_edit", role: "editor" as const },
    { content_item_id: "content_1", grantee_type: "space" as const, grantee_id: "expired", role: "owner" as const, expires_at: "2000-01-01T00:00:00.000Z" },
  ]

  assert.equal(resolveContentPermission({ user: { id: "owner" }, contentItem }), "owner")
  assert.equal(resolveContentPermission({ user: { id: "admin", role: "admin" }, contentItem }), "owner")
  assert.equal(resolveContentPermission({ user: { id: "viewer" }, contentItem, grants }), "viewer")
  assert.equal(resolveContentPermission({ user: { id: "member" }, contentItem, grants, groupIds: ["group_edit"] }), "editor")
  assert.equal(resolveContentPermission({ user: { id: "stranger" }, contentItem, grants }), "none")
  assert.equal(resolveContentPermission({ user: { id: "stranger" }, contentItem: { ...contentItem, visibility: "public" } }), "viewer")
  assert.equal(canUseContentRole("editor", "commenter"), true)
  assert.equal(canUseContentRole("viewer", "editor"), false)
})

test("social action input accepts canonical targets and maps old content targets", () => {
  assert.deepEqual(
    normalizeSocialActionInput({
      targetType: "content_item",
      targetId: "content_1",
      actionType: "save",
      body: "Useful",
      metadata: { source: "feed" },
    }),
    {
      targetType: "content_item",
      targetId: "content_1",
      actionType: "save",
      body: "Useful",
      metadata: { source: "feed" },
    },
  )

  assert.equal(normalizeSocialActionInput({ targetType: "note", targetId: "note_1" }).targetType, "content_item")
  assert.equal(normalizeSocialActionInput({ target_type: "study_battle", target_id: "battle_1", action_type: "high-five" }).targetType, "study_battle")
  assert.throws(() => normalizeSocialActionInput({ targetType: "unsafe", targetId: "x" }), /Unsupported social target/)
  assert.throws(() => normalizeSocialActionInput({ targetType: "profile" }), /target id/)
})
