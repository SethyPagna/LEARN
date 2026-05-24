import assert from "node:assert/strict"
import test from "node:test"
import { buildDashboardCommandPlan, buildDashboardEmptyStates, buildDashboardMetricTiles, buildDashboardQuickActionGroups, buildDashboardRecentWork, buildDashboardRouteActions, buildDashboardSignals, buildDashboardWeakTopicCards } from "../lib/dashboard-features"

test("buildDashboardCommandPlan prioritizes weak topic repair", () => {
  const plan = buildDashboardCommandPlan({
    noteCount: 4,
    quizCount: 2,
    snapshot: {
      goalCompletion: 64,
      recommendedFocus: ["React"],
      weakTopics: [
        { topic: "React", accuracy: 62, attempts: 4 },
        { topic: "Databases", accuracy: 25, attempts: 3 },
      ],
    },
  })

  assert.equal(plan.headline, "Repair Databases")
  assert.equal(plan.target, "practice")
  assert.equal(plan.targetTopic, "Databases")
  assert.deepEqual(plan.chips, ["25% accuracy", "3 attempts", "highest risk"])
})

test("buildDashboardCommandPlan falls through to focus studio ai and calendar routes", () => {
  assert.equal(buildDashboardCommandPlan({ noteCount: 0, quizCount: 0 }).target, "studio")
  assert.equal(buildDashboardCommandPlan({ noteCount: 2, quizCount: 0 }).target, "ai")
  assert.equal(buildDashboardCommandPlan({ noteCount: 2, quizCount: 1 }).target, "calendar")

  const focusPlan = buildDashboardCommandPlan({
    noteCount: 1,
    quizCount: 1,
    snapshot: { recommendedFocus: ["  Graphs  "] },
  })

  assert.equal(focusPlan.headline, "Continue Graphs")
  assert.equal(focusPlan.target, "practice")
})

test("buildDashboardRouteActions gives one primary and unique backups", () => {
  const actions = buildDashboardRouteActions({
    noteCount: 4,
    quizCount: 2,
    snapshot: { weakTopics: [{ topic: "Indexes", accuracy: 25, attempts: 4 }] },
  })

  assert.equal(actions[0].primary, true)
  assert.equal(actions[0].target, "practice")
  assert.equal(actions[0].label, "Practice weak topic")
  assert.equal(new Set(actions.map((action) => action.target)).size, actions.length)
  assert.ok(actions.length <= 3)
})

test("buildDashboardRouteActions keeps empty learner moves useful", () => {
  const actions = buildDashboardRouteActions({ noteCount: 0, quizCount: 0, snapshot: { goalCompletion: 0 } })

  assert.deepEqual(actions.map((action) => action.target), ["studio", "files", "calendar"])
  assert.equal(actions[0].detail, "Capture the first reusable learning item.")
})

test("buildDashboardSignals summarizes dashboard state with tones", () => {
  const signals = buildDashboardSignals({
    noteCount: 3,
    quizCount: 1,
    snapshot: {
      goalCompletion: 140,
      recommendedFocus: ["FSRS", "FSRS", "Graph"],
      weakTopics: [{ topic: "FSRS", accuracy: 40 }],
    },
  })

  assert.deepEqual(signals.map((signal) => signal.value), ["100%", "1", "2", "3"])
  assert.deepEqual(signals.map((signal) => signal.tone), ["steady", "critical", "steady", "steady"])
})

test("buildDashboardEmptyStates guides new learners without noisy copy", () => {
  const emptyStates = buildDashboardEmptyStates({ noteCount: 0, quizCount: 0, snapshot: { goalCompletion: 0 } })

  assert.deepEqual(emptyStates.map((state) => state.id), ["studio", "practice", "route"])
  assert.equal(emptyStates[0].actionLabel, "Create in Studio")
  assert.equal(emptyStates[0].target, "studio")
  assert.ok(emptyStates.every((state) => state.detail.length <= 86))
})

test("buildDashboardEmptyStates stays quiet when the loop has material", () => {
  const emptyStates = buildDashboardEmptyStates({
    noteCount: 4,
    quizCount: 2,
    snapshot: {
      goalCompletion: 50,
      recommendedFocus: ["SQL"],
      recentNotes: [{ title: "Indexes" }],
      weakTopics: [{ topic: "SQL", accuracy: 75 }],
    },
  })

  assert.deepEqual(emptyStates, [])
})

test("buildDashboardMetricTiles combines learner progress drafts and focus time", () => {
  const metrics = buildDashboardMetricTiles({
    calendarDefaultMinutes: 45,
    noteCount: 5,
    practiceDraftCount: 1,
    quizCount: 3,
    snapshot: {
      recommendedFocus: ["Databases"],
      weakTopics: [{ topic: "Databases", accuracy: 42 }, { topic: "Memory", accuracy: 71 }],
    },
    studioDraftCount: 2,
    userMetrics: { streakCurrent: 6, xpTotal: 260 },
  })

  assert.deepEqual(metrics.map((metric) => metric.id), ["streak", "xp", "reviews", "drafts", "focus"])
  assert.equal(metrics.find((metric) => metric.id === "xp")?.value, "260")
  assert.equal(metrics.find((metric) => metric.id === "reviews")?.value, "2")
  assert.equal(metrics.find((metric) => metric.id === "drafts")?.detail, "2 Studio and 1 practice draft")
})

test("buildDashboardWeakTopicCards sorts real topics and avoids fake empty progress", () => {
  const cards = buildDashboardWeakTopicCards([
    { topic: "  ", accuracy: 10, attempts: 99 },
    { topic: "Memory", accuracy: 72, attempts: 5 },
    { topic: "Indexes", accuracy: 42, attempts: 2 },
    { topic: "Graphs", accuracy: 42, attempts: 8 },
    { topic: "Review", accuracy: 90, attempts: 1 },
  ], 3)

  assert.deepEqual(cards.map((card) => card.label), ["Graphs", "Indexes", "Memory"])
  assert.deepEqual(cards.map((card) => card.tone), ["critical", "critical", "watch"])
  assert.deepEqual(buildDashboardWeakTopicCards([], 5), [])
})

test("buildDashboardRecentWork sorts mixed work and maps routes", () => {
  const recents = buildDashboardRecentWork({
    aiChats: [{ id: "chat_1", title: "Explain indexes", updated_at: "2026-05-17T03:00:00.000Z" }],
    files: [{ id: "asset_1", filename: "syllabus.pdf", created_at: "2026-05-17T04:00:00.000Z", content_type: "application/pdf" }],
    notes: [
      { id: "note_1", title: "Database notes", updated_at: "2026-05-17T02:00:00.000Z" },
      { id: "note_2", title: " ", updated_at: "2026-05-17T01:00:00.000Z" },
    ],
    quizAttempts: [{ id: "attempt_1", quiz_title: "SQL quiz", score: 4, total: 5, created_at: "2026-05-17T05:00:00.000Z" }],
  })

  assert.deepEqual(recents.map((recent) => recent.kind), ["practice", "file", "ai", "studio", "studio"])
  assert.equal(recents[0].detail, "4/5 score")
  assert.equal(recents[1].target, "files")
  assert.equal(recents[2].target, "ai")
  assert.equal(recents[4].title, "Studio item")
})

test("buildDashboardQuickActionGroups keeps dashboard buttons routeable and compact", () => {
  const groups = buildDashboardQuickActionGroups()
  const actions = groups.flatMap((group) => group.actions)

  assert.deepEqual(groups.map((group) => group.label), ["Create", "Review", "Practice", "Share", "Manage"])
  assert.ok(actions.length >= 10)
  assert.ok(actions.every((action) => action.label.length <= 18))
  assert.ok(actions.every((action) => action.detail.length <= 52))
  assert.ok(actions.every((action) => action.target))
  assert.equal(actions.find((action) => action.id === "social-hub")?.detail, "Chat, groups, rooms")
  assert.equal(new Set(actions.map((action) => `${action.label}:${action.target}`)).size, actions.length)
})
