import assert from "node:assert/strict"
import test from "node:test"
import {
  createSocialDraft,
  normalizeSocialDraft,
  normalizeSocialDraftStore,
  parseStoredSocialDraftStore,
  socialDraftStorageKey,
} from "../../lib/social-drafts"

test("social draft keys stay isolated per social surface", () => {
  assert.equal(socialDraftStorageKey("spaces"), "learn_social_draft_v1_spaces")
  assert.equal(socialDraftStorageKey("rooms"), "learn_social_draft_v1_rooms")
  assert.equal(socialDraftStorageKey("battles"), "learn_social_draft_v1_battles")
})

test("social draft parser rejects invalid storage payloads", () => {
  assert.equal(parseStoredSocialDraftStore("spaces", "{bad json"), null)
  assert.equal(parseStoredSocialDraftStore("rooms", JSON.stringify(["not", "a", "store"])), null)
  assert.equal(normalizeSocialDraftStore("battles", null), null)
})

test("social draft normalization keeps valid room choices and clamps durations", () => {
  const draft = normalizeSocialDraft("rooms", {
    id: "room_1",
    name: "Deep focus",
    mode: "stage",
    status: "active",
    pomodoroMinutes: 240,
    breakMinutes: "0",
  })

  assert.equal(draft.id, "room_1")
  assert.equal(draft.name, "Deep focus")
  assert.equal(draft.mode, "stage")
  assert.equal(draft.status, "active")
  assert.equal(draft.pomodoroMinutes, 180)
  assert.equal(draft.breakMinutes, 1)
})

test("social draft normalization falls back for incompatible kind choices", () => {
  const draft = normalizeSocialDraft("battles", {
    mode: "focus",
    status: "closed",
    visibility: "everyone",
    pomodoroMinutes: Number.NaN,
    breakMinutes: "not a number",
  })
  const fallback = createSocialDraft("battles")

  assert.equal(draft.mode, fallback.mode)
  assert.equal(draft.status, fallback.status)
  assert.equal(draft.visibility, fallback.visibility)
  assert.equal(draft.pomodoroMinutes, fallback.pomodoroMinutes)
  assert.equal(draft.breakMinutes, fallback.breakMinutes)
})

test("social draft store parser repairs saved query and draft fields", () => {
  const store = parseStoredSocialDraftStore("spaces", JSON.stringify({
    selectedId: 123,
    query: "algebra",
    draft: {
      name: "Math circle",
      description: "Review together",
      visibility: "public",
      topicTags: "math, review",
      mode: "discussion",
      status: "active",
    },
    updatedAt: "2026-05-29T00:00:00.000Z",
  }))

  assert.equal(store?.selectedId, "")
  assert.equal(store?.query, "algebra")
  assert.equal(store?.draft.name, "Math circle")
  assert.equal(store?.draft.visibility, "public")
  assert.equal(store?.draft.topicTags, "math, review")
  assert.equal(store?.draft.mode, "discussion")
  assert.equal(store?.draft.status, "active")
  assert.equal(store?.updatedAt, "2026-05-29T00:00:00.000Z")
})
