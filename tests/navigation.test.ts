import assert from "node:assert/strict"
import test from "node:test"
import {
  getStudioKind,
  navigationGroups,
  resolveNavigationTarget,
  viewFromPath,
  viewRoutes,
} from "../lib/navigation"

test("navigation keeps primary sidebar destinations compact", () => {
  const primaryItems = navigationGroups.flatMap((group) => group.items)

  assert.equal(primaryItems.length <= 9, true)
  assert.deepEqual(primaryItems.map((item) => item.view), [
    "dashboard",
    "learn",
    "reviews",
    "calendar",
    "studio",
    "ai",
    "practice",
    "social",
    "settings",
  ])
  assert.equal(navigationGroups.find((group) => group.label === "Social")?.caption, "Chat, groups, rooms, and battles")
})

test("stable Studio routes resolve to Studio with the matching tab", () => {
  for (const view of ["notes", "docs", "sheets", "slides"] as const) {
    const target = resolveNavigationTarget(view)

    assert.equal(target.primaryView, "studio")
    assert.equal(target.route, viewRoutes[view])
    assert.equal(getStudioKind(view), view)
  }
})

test("secondary product routes resolve to their grouped destinations", () => {
  assert.equal(resolveNavigationTarget("reviews").primaryView, "reviews")
  assert.equal(resolveNavigationTarget("vault").primaryView, "learn")
  assert.equal(resolveNavigationTarget("graph").primaryView, "learn")
  assert.equal(resolveNavigationTarget("files").primaryView, "studio")
  assert.equal(resolveNavigationTarget("quizzes").primaryView, "practice")
  assert.equal(resolveNavigationTarget("games").primaryView, "practice")
  assert.equal(resolveNavigationTarget("chat").primaryView, "social")
  assert.equal(resolveNavigationTarget("spaces").primaryView, "social")
  assert.equal(resolveNavigationTarget("profile").primaryView, "settings")
  assert.equal(resolveNavigationTarget("admin").primaryView, "settings")
})

test("viewFromPath preserves public route compatibility", () => {
  assert.equal(viewFromPath("/"), "dashboard")
  assert.equal(viewFromPath("/notes"), "notes")
  assert.equal(viewFromPath("/docs/some-id"), "docs")
  assert.equal(viewFromPath("/quiz/quiz_operating_systems"), "quizzes")
  assert.equal(viewFromPath("/unknown"), null)
})
