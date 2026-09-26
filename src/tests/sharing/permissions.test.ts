/**
 * The content permission model, on its own.
 *
 * `src/lib/sharing.ts` shipped with the collaboration schema and then sat unused:
 * `resolveContentPermission` decided nothing, because nothing called it. These
 * tests pin the rules it encodes before `lib/data.ts` starts reading its answers
 * as access decisions — every case below is a rule the app now enforces on a
 * write path, so a change in behaviour here is a change in who can edit whose
 * work.
 *
 * Pure: no database, no stub, no session. The one integration seam — which
 * grants a caller is allowed to see — is tested in `src/tests/api/share-routes.test.ts`.
 */

import assert from "node:assert/strict"
import test from "node:test"

import {
  canUseContentRole,
  higherRole,
  isGrantActive,
  normalizeSocialTargetType,
  resolveContentPermission,
  type PermissionRole,
  type SharedAccessLike,
} from "../../lib/sharing"

const ITEM = { id: "content_1", owner_user_id: "owner", visibility: "private" }

function grant(
  granteeType: SharedAccessLike["grantee_type"],
  granteeId: string | null,
  role: SharedAccessLike["role"],
  overrides: Partial<SharedAccessLike> = {},
): SharedAccessLike {
  return { content_item_id: ITEM.id, grantee_type: granteeType, grantee_id: granteeId, role, ...overrides }
}

// ---------------------------------------------------------------------------
// Owner and admin
// ---------------------------------------------------------------------------

test("the owner holds owner on their own item whatever its visibility or grants say", () => {
  assert.equal(resolveContentPermission({ user: { id: "owner" }, contentItem: ITEM }), "owner")
  // Grants cannot be used to hand an owner *less* access than ownership implies.
  assert.equal(
    resolveContentPermission({
      user: { id: "owner" },
      contentItem: ITEM,
      grants: [grant("user", "owner", "viewer")],
    }),
    "owner",
  )
})

test("an admin holds owner on somebody else's private item", () => {
  assert.equal(resolveContentPermission({ user: { id: "admin", role: "admin" }, contentItem: ITEM }), "owner")
})

test("a missing item is none, not a default role", () => {
  assert.equal(resolveContentPermission({ user: { id: "anyone" }, contentItem: null }), "none")
})

// ---------------------------------------------------------------------------
// Visibility and the four grantee kinds
// ---------------------------------------------------------------------------

test("public visibility is viewer to a stranger and never more", () => {
  assert.equal(
    resolveContentPermission({ user: { id: "stranger" }, contentItem: { ...ITEM, visibility: "public" } }),
    "viewer",
  )
})

test("a user grant applies to its own grantee id and nobody else", () => {
  const grants = [grant("user", "collaborator", "editor")]
  assert.equal(resolveContentPermission({ user: { id: "collaborator" }, contentItem: ITEM, grants }), "editor")
  assert.equal(resolveContentPermission({ user: { id: "stranger" }, contentItem: ITEM, grants }), "none")
})

test("a group grant resolves through the groups the viewer belongs to", () => {
  const grants = [grant("group", "group_editors", "editor")]
  assert.equal(
    resolveContentPermission({ user: { id: "member" }, contentItem: ITEM, grants, groupIds: ["group_editors"] }),
    "editor",
  )
  assert.equal(
    resolveContentPermission({ user: { id: "member" }, contentItem: ITEM, grants, groupIds: ["group_other"] }),
    "none",
  )
  assert.equal(resolveContentPermission({ user: { id: "member" }, contentItem: ITEM, grants }), "none")
})

test("a space grant resolves through the spaces the viewer belongs to", () => {
  const grants = [grant("space", "space_study", "commenter")]
  assert.equal(
    resolveContentPermission({ user: { id: "member" }, contentItem: ITEM, grants, spaceIds: ["space_study"] }),
    "commenter",
  )
  assert.equal(
    resolveContentPermission({ user: { id: "member" }, contentItem: ITEM, grants, spaceIds: ["space_elsewhere"] }),
    "none",
  )
})

test("a public_link grant is the link's role for whoever presents it, including a visitor with no id", () => {
  // The model cannot see the token — that check belongs to `resolveShareToken`,
  // which is why `lib/data.ts` filters these rows out of the session path.
  assert.equal(resolveContentPermission({ user: { id: "" }, contentItem: ITEM, grants: [grant("public_link", "tok", "viewer")] }), "viewer")
  assert.equal(resolveContentPermission({ user: { id: "" }, contentItem: ITEM, grants: [grant("public_link", "tok", "editor")] }), "editor")
})

// ---------------------------------------------------------------------------
// Grants that must not count
// ---------------------------------------------------------------------------

test("an expired grant is ignored, whatever role it carries", () => {
  const expired = { expires_at: "2000-01-01T00:00:00.000Z" }
  assert.equal(resolveContentPermission({ user: { id: "member" }, contentItem: ITEM, grants: [grant("user", "member", "editor", expired)] }), "none")
  assert.equal(
    resolveContentPermission({ user: { id: "member" }, contentItem: ITEM, grants: [grant("group", "g", "owner", expired)], groupIds: ["g"] }),
    "none",
  )
  // A past expiry on a public item drops the viewer back to the visibility rule.
  assert.equal(
    resolveContentPermission({
      user: { id: "" },
      contentItem: { ...ITEM, visibility: "public" },
      grants: [grant("public_link", "tok", "editor", expired)],
    }),
    "viewer",
  )
})

test("an unparseable expiry is treated as expired, not as no expiry", () => {
  assert.equal(isGrantActive({ ...grant("user", "member", "editor"), expires_at: "not a date" }), false)
  assert.equal(resolveContentPermission({ user: { id: "member" }, contentItem: ITEM, grants: [grant("user", "member", "editor", { expires_at: "not a date" })] }), "none")
})

test("a grant for a different item does not leak across items", () => {
  assert.equal(
    resolveContentPermission({ user: { id: "member" }, contentItem: ITEM, grants: [grant("user", "member", "owner", { content_item_id: "content_other" })] }),
    "none",
  )
})

test("an archived item is none to everyone, including its owner and an admin", () => {
  const archived = { ...ITEM, archived_at: "2026-01-01 00:00:00" }
  assert.equal(resolveContentPermission({ user: { id: "owner" }, contentItem: archived }), "none")
  assert.equal(resolveContentPermission({ user: { id: "admin", role: "admin" }, contentItem: archived }), "none")
  assert.equal(
    resolveContentPermission({ user: { id: "admin", role: "admin" }, contentItem: archived, grants: [grant("user", "admin", "owner")] }),
    "none",
  )
})

test("a grant with no grantee id matches nobody", () => {
  assert.equal(resolveContentPermission({ user: { id: "member" }, contentItem: ITEM, grants: [grant("user", null, "editor")] }), "none")
  assert.equal(resolveContentPermission({ user: { id: "member" }, contentItem: ITEM, grants: [grant("group", null, "editor")], groupIds: [""] }), "none")
})

// ---------------------------------------------------------------------------
// Precedence
// ---------------------------------------------------------------------------

test("higherRole keeps the broadest of the roles it is given", () => {
  const pairs: [PermissionRole, PermissionRole, PermissionRole][] = [
    ["none", "viewer", "viewer"],
    ["viewer", "commenter", "commenter"],
    ["commenter", "editor", "editor"],
    ["editor", "owner", "owner"],
    ["owner", "none", "owner"],
    ["viewer", "viewer", "viewer"],
  ]
  for (const [a, b, expected] of pairs) {
    assert.equal(higherRole(a, b), expected, `${a} vs ${b}`)
    assert.equal(higherRole(b, a), expected, `${b} vs ${a} (order must not matter)`)
  }
})

test("the broadest matching grant wins across grantee kinds", () => {
  const grants = [
    grant("user", "member", "viewer"),
    grant("group", "group_editors", "editor"),
    grant("space", "space_study", "commenter"),
  ]
  assert.equal(
    resolveContentPermission({
      user: { id: "member" },
      contentItem: ITEM,
      grants,
      groupIds: ["group_editors"],
      spaceIds: ["space_study"],
    }),
    "editor",
  )
  // …and a narrower set of memberships keeps only what still matches: dropping
  // the group membership leaves the space's commenter above the user's viewer.
  assert.equal(
    resolveContentPermission({ user: { id: "member" }, contentItem: ITEM, grants, spaceIds: ["space_study"] }),
    "commenter",
  )
})

test("a grant can raise a public item but never above the grant itself", () => {
  const publicItem = { ...ITEM, visibility: "public" }
  assert.equal(resolveContentPermission({ user: { id: "member" }, contentItem: publicItem, grants: [grant("user", "member", "editor")] }), "editor")
  assert.equal(resolveContentPermission({ user: { id: "stranger" }, contentItem: publicItem, grants: [grant("user", "member", "editor")] }), "viewer")
})

// ---------------------------------------------------------------------------
// The capability check the write guard uses
// ---------------------------------------------------------------------------

test("canUseContentRole separates writing from reading", () => {
  // What the savers require.
  assert.equal(canUseContentRole("owner", "editor"), true)
  assert.equal(canUseContentRole("editor", "editor"), true)
  assert.equal(canUseContentRole("commenter", "editor"), false)
  assert.equal(canUseContentRole("viewer", "editor"), false)
  assert.equal(canUseContentRole("none", "editor"), false)

  // Reading is reachable from everything above `none`.
  assert.equal(canUseContentRole("viewer", "viewer"), true)
  assert.equal(canUseContentRole("none", "viewer"), false)

  // Commenting sits strictly between reading and editing.
  assert.equal(canUseContentRole("commenter", "commenter"), true)
  assert.equal(canUseContentRole("viewer", "commenter"), false)
})

test("canUseContentRole agrees with the ranks higherRole orders", () => {
  const ladder: PermissionRole[] = ["none", "viewer", "commenter", "editor", "owner"]
  for (const actual of ladder) {
    for (const required of ladder.slice(1) as Exclude<PermissionRole, "none">[]) {
      const expected = ladder.indexOf(actual) >= ladder.indexOf(required)
      assert.equal(canUseContentRole(actual, required), expected, `${actual} >= ${required}`)
    }
  }
})

// ---------------------------------------------------------------------------
// Untouched neighbour, re-pinned because this file now owns the module's coverage
// ---------------------------------------------------------------------------

test("normalizeSocialTargetType still maps the legacy content targets", () => {
  assert.equal(normalizeSocialTargetType("content_item"), "content_item")
  assert.equal(normalizeSocialTargetType("note"), "content_item")
  assert.equal(normalizeSocialTargetType("slide_deck"), "content_item")
  assert.equal(normalizeSocialTargetType("study_room"), "study_room")
  assert.equal(normalizeSocialTargetType("nonsense"), null)
  assert.equal(normalizeSocialTargetType(undefined), "content_item")
})
