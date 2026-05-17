import assert from "node:assert/strict"
import test from "node:test"
import { buildDashboardCommandPlan, buildDashboardEmptyStates, buildDashboardMetricTiles, buildDashboardRecentWork, buildDashboardSignals } from "../lib/dashboard-features"

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
  assert.equal(focusPlan.target, "reviews")
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

test("buildDashboardRecentWork sorts mixed work and maps routes", () => {
  const recents = buildDashboardRecentWork({
    aiChats: [{ id: "chat_1", title: "Explain indexes", updated_at: "2026-05-17T03:00:00.000Z" }],
    files: [{ id: "asset_1", filename: "syllabus.pdf", created_at: "2026-05-17T04:00:00.000Z", content_type: "application/pdf" }],
    notes: [{ id: "note_1", title: "Database notes", updated_at: "2026-05-17T02:00:00.000Z" }],
    quizAttempts: [{ id: "attempt_1", quiz_title: "SQL quiz", score: 4, total: 5, created_at: "2026-05-17T05:00:00.000Z" }],
  })

  assert.deepEqual(recents.map((recent) => recent.kind), ["practice", "file", "ai", "studio"])
  assert.equal(recents[0].detail, "4/5 score")
  assert.equal(recents[1].target, "files")
  assert.equal(recents[2].target, "ai")
})
