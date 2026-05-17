import assert from "node:assert/strict"
import test from "node:test"
import { normalizeOnboardingPreferences, onboardingTargetView, shouldShowOnboarding } from "../lib/onboarding-features"

test("normalizeOnboardingPreferences creates safe first-run preferences", () => {
  const result = normalizeOnboardingPreferences(
    {
      firstStudioKind: "SHEETS",
      learningGoal: "  Build   a stats exam plan from notes.  ",
      preferredWorkflow: "practice",
    },
    new Date("2026-05-17T00:00:00.000Z"),
  )

  assert.deepEqual(result, {
    firstRun: false,
    firstStudioKind: "sheets",
    learningGoal: "Build a stats exam plan from notes.",
    onboardingCompletedAt: "2026-05-17T00:00:00.000Z",
    preferredWorkflow: "practice",
  })
})

test("onboarding target routes match learner workflow", () => {
  assert.equal(onboardingTargetView({ firstStudioKind: "docs", preferredWorkflow: "create" }), "docs")
  assert.equal(onboardingTargetView({ firstStudioKind: "notes", preferredWorkflow: "review" }), "reviews")
  assert.equal(onboardingTargetView({ firstStudioKind: "slides", preferredWorkflow: "ai" }), "ai")
})

test("shouldShowOnboarding respects invite first-run and forced entry", () => {
  assert.equal(shouldShowOnboarding({ force: true, preferences: {} }), true)
  assert.equal(shouldShowOnboarding({ preferences: { firstRun: true } }), true)
  assert.equal(shouldShowOnboarding({ preferences: { firstRun: true, onboardingCompletedAt: "done" } }), false)
  assert.equal(shouldShowOnboarding({ preferences: {} }), false)
})
