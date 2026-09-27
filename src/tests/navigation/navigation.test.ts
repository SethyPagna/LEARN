import assert from "node:assert/strict"
import test from "node:test"
import {
  getStudioKind,
  navigationGroups,
  navigationItems,
  placeTabForView,
  placeTabsForView,
  resolveNavigationTarget,
  sectionTabForView,
  viewFromPath,
  viewRoutes,
} from "../../lib/navigation"
import type { View } from "../../components/learn/types"

const views = Object.keys(viewRoutes) as View[]

test("the app has five places, one sidebar item each", () => {
  assert.deepEqual(navigationGroups.map((group) => group.label), ["Today", "Create", "Practice", "Friends", "Me"])
  for (const group of navigationGroups) assert.equal(group.items.length, 1, `${group.label} must be one sidebar item`)
  assert.deepEqual(navigationItems.map((item) => item.view), ["dashboard", "studio", "practice", "social", "profile"])
  assert.deepEqual(navigationItems.map((item) => item.labelKey), ["today", "create", "practice", "friends", "me"])
})

test("every view belongs to exactly one place", () => {
  for (const view of views) {
    const owners = navigationItems.filter((item) => item.view === view || item.aliases?.includes(view))
    assert.equal(owners.length, 1, `${view} belongs to ${owners.map((item) => item.view).join(", ") || "no place"}`)
  }
})

test("each place's tabs are its own pages, and every tab resolves back to it", () => {
  for (const item of navigationItems) {
    assert.ok(item.tabs?.length, `${item.view} needs a tab row`)
    for (const tab of item.tabs ?? []) {
      assert.equal(resolveNavigationTarget(tab).primaryView, item.view, `the ${tab} tab must live in ${item.view}`)
    }
  }
})

test("the tab rows follow the five-place map", () => {
  const rows = Object.fromEntries(navigationItems.map((item) => [item.view, item.tabs]))
  assert.deepEqual(rows, {
    dashboard: ["dashboard", "calendar", "progress", "reviews"],
    studio: ["studio", "vault", "files"],
    practice: ["quizzes", "live", "games", "ai", "graph"],
    social: ["chat", "spaces", "rooms", "battles", "feed"],
    profile: ["profile", "settings", "admin"],
  })
})

test("pages resolve to their place", () => {
  const expected: Record<string, View> = {
    calendar: "dashboard",
    progress: "dashboard",
    reviews: "dashboard",
    notes: "studio",
    docs: "studio",
    sheets: "studio",
    slides: "studio",
    canvas: "studio",
    vault: "studio",
    files: "studio",
    quizzes: "practice",
    live: "practice",
    games: "practice",
    ai: "practice",
    graph: "practice",
    chat: "social",
    spaces: "social",
    rooms: "social",
    battles: "social",
    feed: "social",
    discover: "social",
    settings: "profile",
    admin: "profile",
  }
  for (const [view, place] of Object.entries(expected)) {
    const target = resolveNavigationTarget(view as View)
    assert.equal(target.primaryView, place, `${view} must live in ${place}`)
    assert.equal(target.isAlias, true)
    assert.equal(target.route, viewRoutes[view as View])
  }
  for (const item of navigationItems) assert.equal(resolveNavigationTarget(item.view).isAlias, false)
  assert.equal(resolveNavigationTarget("spaces").route, "/groups")
  for (const view of ["notes", "docs", "sheets", "slides"] as const) assert.equal(getStudioKind(view), view)
})

test("each view lights one tab of its row, and an editor lights none", () => {
  assert.equal(placeTabForView("dashboard"), "dashboard")
  assert.equal(placeTabForView("reviews"), "reviews")
  assert.equal(placeTabForView("practice"), "quizzes")
  assert.equal(placeTabForView("social"), "chat")
  assert.equal(placeTabForView("discover"), "feed")
  assert.equal(placeTabForView("canvas"), "studio")
  assert.equal(placeTabForView("admin"), "admin")
  for (const editor of ["notes", "docs", "sheets", "slides"] as const) assert.equal(placeTabForView(editor), null)
  for (const view of views) {
    const tab = placeTabForView(view)
    if (tab) assert.ok(placeTabsForView(view, true).includes(tab), `${view} lights ${tab}, which is not in its row`)
  }
})

test("Admin is a tab only for admins", () => {
  assert.deepEqual(placeTabsForView("settings"), ["profile", "settings"])
  assert.deepEqual(placeTabsForView("settings", true), ["profile", "settings", "admin"])
})

test("each place wears one colour on all of its pages", () => {
  assert.equal(sectionTabForView("calendar"), sectionTabForView("dashboard"))
  assert.equal(sectionTabForView("files"), sectionTabForView("studio"))
  assert.equal(sectionTabForView("ai"), sectionTabForView("practice"))
  assert.equal(sectionTabForView("feed"), sectionTabForView("social"))
  assert.equal(sectionTabForView("settings"), sectionTabForView("profile"))
  assert.equal(new Set(navigationItems.map((item) => sectionTabForView(item.view))).size, 5, "the five places wear five colours")
})

test("viewFromPath preserves public route compatibility", () => {
  assert.equal(viewFromPath("/"), "dashboard")
  assert.equal(viewFromPath("/notes"), "notes")
  assert.equal(viewFromPath("/docs/some-id"), "docs")
  assert.equal(viewFromPath("/groups"), "spaces")
  assert.equal(viewFromPath("/learn"), "dashboard")
  assert.equal(viewFromPath("/reviews"), "reviews")
  assert.equal(viewFromPath("/spaces"), "spaces")
  assert.equal(viewFromPath("/quiz/quiz_operating_systems"), "quizzes")
  assert.equal(viewFromPath("/unknown"), null)
})
