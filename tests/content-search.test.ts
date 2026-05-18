import assert from "node:assert/strict"
import test from "node:test"
import { buildContentSearchText, rankContentSearchRows, type SearchableContentRow } from "../lib/content-search"
import { buildFeedRankCacheEntries, feedTopicKey, selectCachedFeedLessons } from "../lib/feed-cache"
import type { FeedLessonCandidate, FeedLessonSelection } from "../lib/learning-ecosystem"

const rows: SearchableContentRow[] = [
  {
    contentItemId: "owned_note",
    ownerUserId: "user_a",
    itemType: "note",
    title: "Database Indexing",
    summary: "B-tree indexes speed up selective reads.",
    body: "Covering indexes can reduce table lookups.",
    tags: ["databases", "systems"],
    visibility: "private",
    updatedAt: "2026-05-18T08:00:00.000Z",
  },
  {
    contentItemId: "friend_doc",
    ownerUserId: "user_b",
    itemType: "doc",
    title: "Statistics Review",
    summary: "Bayesian inference and probability drills.",
    body: "",
    tags: ["math"],
    visibility: "connections",
    updatedAt: "2026-05-18T07:00:00.000Z",
  },
  {
    contentItemId: "public_sheet",
    ownerUserId: "user_c",
    itemType: "sheet",
    title: "Chemistry Lab Tracker",
    summary: "Molarity and titration rows.",
    body: "",
    tags: ["science"],
    visibility: "public",
    updatedAt: "2026-05-18T06:00:00.000Z",
  },
  {
    contentItemId: "shared_slide",
    ownerUserId: "user_d",
    itemType: "slide_deck",
    title: "Systems Diagrams",
    summary: "Memory hierarchy and cache diagrams.",
    body: "",
    tags: ["systems"],
    visibility: "private",
    updatedAt: "2026-05-18T05:00:00.000Z",
  },
]

test("content search normalizes indexed text for compact fallback search", () => {
  assert.equal(buildContentSearchText(rows[0]), "database indexing b-tree indexes speed up selective reads covering indexes can reduce table lookups databases systems")
})

test("content search respects owner connection public and shared visibility", () => {
  const results = rankContentSearchRows({
    rows,
    query: "systems",
    context: {
      viewerUserId: "user_a",
      connectedUserIds: ["user_b"],
      sharedContentItemIds: ["shared_slide"],
    },
  })

  assert.deepEqual(results.map((result) => result.contentItemId), ["shared_slide", "owned_note"])
  assert.ok(results[0].score > 0)
  assert.ok(results[0].matchedFields.includes("title") || results[0].matchedFields.includes("tags"))
})

test("content search shows connection rows but hides private non-shared rows", () => {
  const connectionResults = rankContentSearchRows({
    rows,
    query: "bayesian",
    context: {
      viewerUserId: "user_b",
      connectedUserIds: ["user_a"],
      sharedContentItemIds: [],
    },
  })
  assert.deepEqual(connectionResults.map((result) => result.contentItemId), ["friend_doc"])

  const privateResults = rankContentSearchRows({
    rows,
    query: "cache",
    context: {
      viewerUserId: "user_b",
      connectedUserIds: ["user_a"],
      sharedContentItemIds: [],
    },
  })
  assert.deepEqual(privateResults.map((result) => result.contentItemId), [])
})

test("feed cache key is stable and cached selection preserves serendipity", () => {
  const topicKey = feedTopicKey(["Math", "study", "math"])
  assert.equal(topicKey, "math|study")

  const selected: FeedLessonSelection[] = [
    lesson("math_1", ["math"], "preferred", 0.9),
    lesson("history_1", ["history"], "serendipity", 0.8),
  ]
  const cacheEntries = buildFeedRankCacheEntries({
    userId: "user_a",
    selected,
    topicKey,
    now: new Date("2026-05-18T08:00:00.000Z"),
  })
  const cached = selectCachedFeedLessons({
    cacheEntries,
    lessonsById: new Map(selected.map((entry) => [entry.id, entry])),
    now: new Date("2026-05-18T08:05:00.000Z"),
    count: 2,
    fallbackTopics: ["math"],
  })

  assert.deepEqual(cached.map((entry) => entry.reason), ["preferred", "serendipity"])
})

test("feed cache falls back to fresh selection when expired", () => {
  const lessons: FeedLessonCandidate[] = [
    lesson("math_1", ["math"], "preferred", 0.9),
    lesson("history_1", ["history"], "serendipity", 0.8),
    lesson("science_1", ["science"], "serendipity", 0.7),
  ]
  const cached = selectCachedFeedLessons({
    cacheEntries: [
      {
        lessonId: "history_1",
        topicKey: "math",
        reason: "serendipity",
        rankScore: 1,
        topicTags: ["history"],
        expiresAt: "2026-05-18T07:00:00.000Z",
      },
    ],
    lessonsById: new Map(lessons.map((entry) => [entry.id, entry])),
    now: new Date("2026-05-18T08:00:00.000Z"),
    count: 2,
    fallbackTopics: ["math"],
  })

  assert.equal(cached.length, 2)
  assert.ok(cached.some((entry) => entry.reason === "serendipity"))
})

function lesson(id: string, topicTags: string[], reason: "preferred" | "serendipity", readinessScore: number): FeedLessonSelection {
  return {
    id,
    title: id,
    topicTags,
    readinessScore,
    durationSeconds: 90,
    reason,
  }
}
