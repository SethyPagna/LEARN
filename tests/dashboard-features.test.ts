import assert from "node:assert/strict"
import test from "node:test"
import { buildDashboardCommandPlan, buildDashboardSignals } from "../lib/dashboard-features"

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
