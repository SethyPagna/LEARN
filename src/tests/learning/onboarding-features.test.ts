import assert from "node:assert/strict"
import test from "node:test"
import { normalizeOnboardingPreferences, normalizeOnboardingStudioKind, normalizeOnboardingWorkflow, onboardingStudioKindOptions, onboardingTargetView, onboardingWorkflowOptions, shouldShowOnboarding } from "../../lib/onboarding-features"

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
  assert.equal(onboardingTargetView({ firstStudioKind: "notes", preferredWorkflow: "review" }), "practice")
  assert.equal(onboardingTargetView({ firstStudioKind: "slides", preferredWorkflow: "ai" }), "ai")
})

test("onboarding options and normalizers keep select values safe", () => {
  assert.deepEqual(onboardingWorkflowOptions.map((option) => option.value), ["create", "review", "practice", "schedule", "ai"])
  assert.deepEqual(onboardingStudioKindOptions.map((option) => option.value), ["notes", "docs", "sheets", "slides"])
  assert.equal(normalizeOnboardingWorkflow("SCHEDULE"), "schedule")
  assert.equal(normalizeOnboardingWorkflow("unknown"), "create")
  assert.equal(normalizeOnboardingStudioKind("DOCS"), "docs")
  assert.equal(normalizeOnboardingStudioKind("unknown"), "notes")
})

test("shouldShowOnboarding respects invite first-run and forced entry", () => {
  assert.equal(shouldShowOnboarding({ force: true, preferences: {} }), true)
  assert.equal(shouldShowOnboarding({ preferences: { firstRun: true } }), true)
  assert.equal(shouldShowOnboarding({ preferences: { firstRun: true, onboardingCompletedAt: "done" } }), false)
  assert.equal(shouldShowOnboarding({ preferences: {} }), false)
})
