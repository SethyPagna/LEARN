import assert from "node:assert/strict"
import test from "node:test"
import {
  applyReputationAction,
  buildFeedActionPlan,
  buildKnowledgeGraphActionPlan,
  buildReviewActionPlan,
  buildReviewRatingActions,
  buildReviewSchedule,
  buildReviewSummaryChips,
  canPostInCommunity,
  calculateLevelFromXp,
  detectOrphanKnowledgeNodes,
  filterPublicProfileArtifacts,
  reviewAnswerText,
  reviewPromptText,
  reviewSourceLabel,
  selectFeedLessons,
  summarizeFeedWorkspace,
  summarizeKnowledgeGraph,
  summarizeReviewSession,
  updateLearningStreak,
  type FeedLessonCandidate,
  type KnowledgeEdge,
  type KnowledgeNode,
} from "../lib/learning-ecosystem"

test("review schedule respects caps, rest days, and due order", () => {
  const due = [
    item("review_quote", "2026-05-13T01:00:00.000Z", 0.62),
    item("review_code", "2026-05-12T01:00:00.000Z", 0.48),
    item("review_diagram", "2026-05-14T01:00:00.000Z", 0.83),
  ]

  const schedule = buildReviewSchedule({
    items: due,
    now: new Date("2026-05-13T09:00:00.000Z"),
    dailyCap: 1,
    restDay: "sunday",
  })

  assert.equal(schedule.isRestDay, false)
  assert.deepEqual(schedule.items.map((entry) => entry.id), ["review_code"])
  assert.equal(schedule.remainingDueCount, 1)

  const restSchedule = buildReviewSchedule({
    items: due,
    now: new Date("2026-05-10T09:00:00.000Z"),
    dailyCap: 20,
    restDay: "sunday",
  })
  assert.equal(restSchedule.isRestDay, true)
  assert.deepEqual(restSchedule.items, [])
})

test("review card helpers expose practice mistake context", () => {
  const mistake = {
    ...item("review_miss", "2026-05-13T01:00:00.000Z", 0.4),
    sourceType: "practice_mistake" as const,
    prompt: "What is the scheduler optimizing?",
    answer: "It minimizes daily review load while maintaining target retention.",
    topic: "FSRS",
  }

  assert.equal(reviewSourceLabel(mistake), "Practice miss | FSRS")
  assert.equal(reviewPromptText(mistake), "What is the scheduler optimizing?")
  assert.equal(reviewAnswerText(mistake), "It minimizes daily review load while maintaining target retention.")
  assert.equal(reviewPromptText(item("review_plain", "2026-05-13T01:00:00.000Z", 0.8)), 'Recall the core idea behind "review_plain".')
})

test("review session summary and action plan guide reveal and grade loops", () => {
  const schedule = {
    items: [
      { ...item("review_code", "2026-05-13T01:00:00.000Z", 0.4), sourceType: "block" as const, topic: "Systems" },
      { ...item("review_note", "2026-05-13T01:00:00.000Z", 0.7), sourceType: "note" as const, topic: "Systems" },
    ],
    isRestDay: false,
    remainingDueCount: 3,
  }

  const hiddenSummary = summarizeReviewSession(schedule)
  const hiddenPlan = buildReviewActionPlan(schedule, hiddenSummary)
  const revealedSummary = summarizeReviewSession(schedule, ["review_code"])
  const revealedPlan = buildReviewActionPlan(schedule, revealedSummary, ["review_code"])

  assert.equal(hiddenSummary.totalDue, 2)
  assert.equal(hiddenSummary.hiddenCount, 2)
  assert.equal(hiddenSummary.sourceCounts.block, 1)
  assert.deepEqual(hiddenSummary.topTopics, [{ topic: "Systems", count: 2 }])
  assert.equal(hiddenPlan.nextAction, "reveal")
  assert.equal(hiddenPlan.targetItemId, "review_code")
  assert.equal(revealedPlan.nextAction, "grade")
  assert.equal(revealedPlan.targetItemId, "review_code")
})

test("review summary chips keep primary queue signals compact", () => {
  const summary = summarizeReviewSession({
    items: [
      { ...item("miss_1", "2026-05-13T01:00:00.000Z", 0.33), sourceType: "practice_mistake" as const },
      { ...item("note_1", "2026-05-13T01:00:00.000Z", 0.74), sourceType: "note" as const },
    ],
    remainingDueCount: 5,
  }, ["note_1"])

  const chips = buildReviewSummaryChips(summary)

  assert.deepEqual(chips.filter((chip) => chip.priority === "primary").map((chip) => chip.id), ["due", "revealed", "recall", "misses", "later"])
  assert.deepEqual(chips.map((chip) => [chip.label, chip.value]), [
    ["Due", "2"],
    ["Revealed", "1"],
    ["Recall", "54%"],
    ["Misses", "1"],
    ["Later", "5"],
  ])
})

test("review action plan handles rest days empty queues and practice misses", () => {
  const emptySummary = summarizeReviewSession({ items: [], remainingDueCount: 0 })
  assert.equal(buildReviewActionPlan({ items: [], isRestDay: true, remainingDueCount: 4 }, emptySummary).nextAction, "rest")
  assert.equal(buildReviewActionPlan({ items: [], isRestDay: false, remainingDueCount: 0 }, emptySummary).nextAction, "studio")

  const missSchedule = {
    items: [
      { ...item("miss_1", "2026-05-13T01:00:00.000Z", 0.3), sourceType: "practice_mistake" as const },
      { ...item("miss_2", "2026-05-13T01:00:00.000Z", 0.35), sourceType: "practice_mistake" as const },
      { ...item("note_1", "2026-05-13T01:00:00.000Z", 0.55), sourceType: "note" as const },
    ],
    isRestDay: false,
    remainingDueCount: 0,
  }
  const missSummary = summarizeReviewSession(missSchedule)
  const missPlan = buildReviewActionPlan(missSchedule, missSummary)

  assert.equal(missSummary.practiceMissCount, 2)
  assert.equal(missPlan.nextAction, "practice")
  assert.equal(missPlan.targetItemId, "miss_1")
})

test("review rating actions stay gated until the answer is revealed", () => {
  const hiddenActions = buildReviewRatingActions({ isRevealed: false })
  const busyActions = buildReviewRatingActions({ isRevealed: true, isBusy: true, busyRating: "hard" })

  assert.equal(hiddenActions.length, 4)
  assert.equal(hiddenActions.every((action) => action.disabled), true)
  assert.equal(busyActions.find((action) => action.rating === "hard")?.busy, true)
  assert.equal(busyActions.every((action) => action.disabled), true)
})

test("streak updates support rest days and earned freezes", () => {
  const protectedStreak = updateLearningStreak({
    current: 21,
    longest: 40,
    freezesAvailable: 1,
    lastActivityDate: "2026-05-11",
    today: "2026-05-13",
    restDay: "tuesday",
  })

  assert.equal(protectedStreak.current, 22)
  assert.equal(protectedStreak.freezesAvailable, 1)

  const frozen = updateLearningStreak({
    current: 22,
    longest: 40,
    freezesAvailable: 1,
    lastActivityDate: "2026-05-11",
    today: "2026-05-13",
    restDay: "friday",
  })

  assert.equal(frozen.current, 22)
  assert.equal(frozen.freezesAvailable, 0)
  assert.equal(frozen.usedFreeze, true)
})

test("xp levels are deterministic and reward steady progress", () => {
  assert.deepEqual(calculateLevelFromXp(0), { level: 1, nextLevelXp: 120, progress: 0 })
  assert.deepEqual(calculateLevelFromXp(260), { level: 3, nextLevelXp: 360, progress: 20 })
})

test("feed selection keeps mandatory serendipity while honoring topic controls", () => {
  const lessons: FeedLessonCandidate[] = [
    lesson("math-1", ["math"], 0.92),
    lesson("math-2", ["math"], 0.88),
    lesson("history-1", ["history"], 0.2),
    lesson("biology-1", ["biology"], 0.19),
  ]

  const feed = selectFeedLessons({
    lessons,
    preferredTopics: ["math"],
    count: 4,
    serendipityRatio: 0.25,
  })

  assert.equal(feed.length, 4)
  assert.ok(feed.some((entry) => entry.reason === "serendipity"))
  assert.ok(feed.filter((entry) => entry.reason === "preferred").every((entry) => entry.topicTags.includes("math")))
})

test("feed workspace summary tracks answered state and next action", () => {
  const feed = selectFeedLessons({
    lessons: [
      lesson("math-1", ["math"], 0.92),
      lesson("history-1", ["history"], 0.2),
    ],
    preferredTopics: ["math"],
    count: 2,
    serendipityRatio: 0.5,
  })
  const partialSummary = summarizeFeedWorkspace(feed, { "math-1": "a" })
  const partialPlan = buildFeedActionPlan(feed, partialSummary, { "math-1": "a" })
  const doneSummary = summarizeFeedWorkspace(feed, { "math-1": "a", "history-1": "b" })
  const donePlan = buildFeedActionPlan(feed, doneSummary, { "math-1": "a", "history-1": "b" })

  assert.equal(partialSummary.answered, 1)
  assert.equal(partialSummary.unanswered, 1)
  assert.equal(partialSummary.serendipity, 1)
  assert.equal(partialPlan.nextAction, "answer")
  assert.equal(partialPlan.targetLessonId, "history-1")
  assert.equal(donePlan.nextAction, "save")
})

test("knowledge graph detects orphan nodes and filters private artifacts", () => {
  const nodes: KnowledgeNode[] = [
    node("n1", "Operating systems", "private"),
    node("n2", "Round robin", "public"),
    node("n3", "Stoicism", "connections"),
  ]
  const edges: KnowledgeEdge[] = [{ id: "e1", sourceId: "n1", targetId: "n2", type: "related", strength: 0.8 }]

  assert.deepEqual(detectOrphanKnowledgeNodes(nodes, edges).map((entry) => entry.id), ["n3"])
  assert.deepEqual(filterPublicProfileArtifacts(nodes, "public").map((entry) => entry.id), ["n2"])
  assert.deepEqual(filterPublicProfileArtifacts(nodes, "connections").map((entry) => entry.id), ["n2", "n3"])
})

test("knowledge graph summary and action plan guide graph hygiene", () => {
  const nodes: KnowledgeNode[] = [
    { ...node("n1", "Operating systems", "private"), mastery: 0.7 },
    { ...node("n2", "Round robin", "public"), mastery: 0.35 },
    { ...node("n3", "Stoicism", "connections"), mastery: 0.9 },
  ]
  const edges: KnowledgeEdge[] = [{ id: "e1", sourceId: "n1", targetId: "n2", type: "related", strength: 0.8 }]
  const summary = summarizeKnowledgeGraph(nodes, edges)
  const plan = buildKnowledgeGraphActionPlan(nodes, edges, summary)

  assert.equal(summary.totalNodes, 3)
  assert.equal(summary.orphanCount, 1)
  assert.equal(summary.privateCount, 1)
  assert.equal(summary.connectionCount, 1)
  assert.equal(summary.publicCount, 1)
  assert.equal(summary.seedCount, 1)
  assert.equal(summary.masteredCount, 1)
  assert.equal(summary.strongestEdges[0].id, "e1")
  assert.equal(plan.nextAction, "connect-orphan")
  assert.equal(plan.targetNodeId, "n3")
})

test("knowledge graph action plan catches weak connected nodes", () => {
  const nodes: KnowledgeNode[] = [
    { ...node("n1", "Operating systems", "private"), mastery: 0.72 },
    { ...node("n2", "Round robin", "public"), mastery: 0.38 },
  ]
  const edges: KnowledgeEdge[] = [{ id: "e1", sourceId: "n1", targetId: "n2", type: "related", strength: 0.8 }]
  const summary = summarizeKnowledgeGraph(nodes, edges)
  const plan = buildKnowledgeGraphActionPlan(nodes, edges, summary)

  assert.equal(plan.nextAction, "review-weak")
  assert.equal(plan.targetNodeId, "n2")
})

test("reputation gates posting and rewards high-signal actions", () => {
  assert.equal(canPostInCommunity({ reputation: 14, role: "member" }), false)
  assert.equal(canPostInCommunity({ reputation: 15, role: "member" }), true)
  assert.equal(canPostInCommunity({ reputation: 0, role: "moderator" }), true)

  assert.equal(applyReputationAction(20, "helpful_answer"), 32)
  assert.equal(applyReputationAction(2, "moderation_flag"), 0)
})

function item(id: string, dueAt: string, retrievability: number) {
  return {
    id,
    title: id,
    dueAt,
    retrievability,
    difficulty: 0.5,
    stability: 2,
  }
}

function lesson(id: string, topicTags: string[], readinessScore: number): FeedLessonCandidate {
  return {
    id,
    title: id,
    topicTags,
    readinessScore,
    durationSeconds: 90,
  }
}

function node(id: string, title: string, visibility: KnowledgeNode["visibility"]): KnowledgeNode {
  return {
    id,
    title,
    type: "concept",
    mastery: 0.4,
    visibility,
  }
}
