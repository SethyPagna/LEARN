import assert from "node:assert/strict"
import test from "node:test"
import type { PublicProfile, User } from "../../components/learn/types"
import {
  beginProfileIdentitySave, createProfileIdentityDraft, MAX_PROFILE_AVATAR_BYTES, profileAvatarFileError,
  profileIdentityDraftError, profileIdentityUpdate, profileWithSavedIdentity, reconcileProfileIdentityDraft,
} from "../../lib/profile-identity"

const user: User = {
  id: "learner", username: "learner", name: "Learner", email: "learner@example.test", role: "learner",
  bio: "Learning together", avatarUrl: "https://example.test/avatar.png", profileVisibility: "connections",
  preferences: { introUrl: "https://example.test/intro", websiteUrl: "https://example.test", facebookUrl: "", density: "compact" },
}
const profile: PublicProfile = {
  id: user.id, username: user.username, name: "Server identity", bio: "Server bio", avatar_url: "", profile_visibility: "private",
  social_links: { intro: "", website: "https://example.test/current", facebook: "" }, metrics: { xp: 42 }, artifacts: [],
}

test("profile drafts share the signed-in identity and normalize malformed optional preferences", () => {
  const draft = createProfileIdentityDraft(user)
  assert.equal(draft.name, user.name)
  assert.equal(draft.visibility, "connections")
  assert.equal(draft.websiteUrl, "https://example.test")
  const malformed = createProfileIdentityDraft({ ...user, profileVisibility: "invalid", preferences: { websiteUrl: 42, introUrl: null } })
  assert.equal(malformed.visibility, "private")
  assert.equal(malformed.websiteUrl, "")
  assert.equal(malformed.introUrl, "")
})

test("loaded profile fields including explicit removals initialize the direct-route editor", () => {
  const draft = createProfileIdentityDraft(user, profile)
  assert.equal(draft.name, "Server identity")
  assert.equal(draft.bio, "Server bio")
  assert.equal(draft.avatarUrl, "")
  assert.equal(draft.introUrl, "")
  assert.equal(draft.visibility, "private")
})

test("profile validation rejects whitespace-only names and active or relative links", () => {
  const draft = createProfileIdentityDraft(user)
  assert.equal(profileIdentityDraftError({ ...draft, name: "  " }), "Enter your name.")
  for (const websiteUrl of ["javascript:alert(1)", "data:text/html,example", "/relative", "example.test"])
    assert.equal(profileIdentityDraftError({ ...draft, websiteUrl }), "Links need to start with https:// or http://.")
  assert.equal(profileIdentityDraftError({ ...draft, introUrl: " http://example.test/intro ", websiteUrl: " https://example.test " }), null)
})

test("the shared profile payload trims name and links and preserves intentional avatar removal", () => {
  const payload = profileIdentityUpdate({ ...createProfileIdentityDraft(user), name: " New name ", bio: "Line one\nLine two", avatarUrl: "", websiteUrl: " https://example.test/new " })
  assert.deepEqual(payload, {
    name: "New name", bio: "Line one\nLine two", avatarUrl: "", profileVisibility: "connections",
    preferences: { introUrl: "https://example.test/intro", websiteUrl: "https://example.test/new", facebookUrl: "" },
  })
  assert.equal("email" in payload, false)
  assert.equal("density" in payload.preferences, false)
})

test("avatar selection rejects non-images and enforces the existing size boundary", () => {
  assert.equal(profileAvatarFileError({ type: "image/png", size: MAX_PROFILE_AVATAR_BYTES }), null)
  assert.equal(profileAvatarFileError({ type: "image/png", size: MAX_PROFILE_AVATAR_BYTES + 1 }), "Use an avatar under 256 KB.")
  assert.equal(profileAvatarFileError({ type: "text/plain", size: 10 }), "Choose an image file.")
})

test("saved identity immediately updates the displayed profile without replacing its learning data", () => {
  const saved = { ...user, name: "Updated", bio: "", avatarUrl: "", profileVisibility: "public", preferences: { ...user.preferences, websiteUrl: "" } }
  const updated = profileWithSavedIdentity(profile, saved)
  assert.equal(updated.name, "Updated")
  assert.equal(updated.bio, "")
  assert.equal(updated.avatar_url, "")
  assert.equal(updated.profile_visibility, "public")
  assert.equal(updated.social_links?.website, "")
  assert.strictEqual(updated.metrics, profile.metrics)
  assert.strictEqual(updated.artifacts, profile.artifacts)
})

test("the account panel and direct profile editor cannot overlap saves for one user", () => {
  const releaseFirst = beginProfileIdentitySave("same-user")
  assert.ok(releaseFirst)
  assert.equal(beginProfileIdentitySave("same-user"), null)
  const releaseOther = beginProfileIdentitySave("other-user")
  assert.ok(releaseOther)
  releaseOther()
  releaseFirst()
  const releaseNext = beginProfileIdentitySave("same-user")
  assert.ok(releaseNext)
  releaseFirst()
  assert.equal(beginProfileIdentitySave("same-user"), null, "an old release cannot unlock a newer save")
  releaseNext()
})

test("a retained draft refreshes untouched fields after another editor saves", () => {
  const baseline = createProfileIdentityDraft(user)
  const dirty = { ...baseline, name: "My unsaved name", websiteUrl: "" }
  const incoming = { ...baseline, name: "Saved elsewhere", bio: "New bio", avatarUrl: "", visibility: "public" as const, introUrl: "https://example.test/new-intro", websiteUrl: "https://example.test/new-website" }
  const merged = reconcileProfileIdentityDraft(dirty, baseline, incoming)
  assert.equal(merged.name, "My unsaved name")
  assert.equal(merged.websiteUrl, "")
  assert.equal(merged.bio, "New bio")
  assert.equal(merged.avatarUrl, "")
  assert.equal(merged.visibility, "public")
  assert.equal(merged.introUrl, incoming.introUrl)
  const next = reconcileProfileIdentityDraft(merged, incoming, { ...incoming, bio: "Second update", introUrl: "" })
  assert.equal(next.bio, "Second update")
  assert.equal(next.introUrl, "")
  assert.equal(next.name, dirty.name)
  assert.equal(next.websiteUrl, "")
})
