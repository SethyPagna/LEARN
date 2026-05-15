import assert from "node:assert/strict"
import { test } from "node:test"
import {
  formatNavigationBadge,
  rankNavigationMatches,
  summarizeActiveNavigationGroup,
  viewBelongsToNavigationItem,
  type NavigationGroupLike,
} from "../lib/navigation-features"

type TestView = "dashboard" | "learn" | "reviews" | "studio" | "docs" | "practice" | "games"

const groups: NavigationGroupLike<TestView>[] = [
  { label: "Home", caption: "Daily command center", items: [{ view: "dashboard" }] },
  { label: "Learn", caption: "Route, graph, reviews", items: [{ view: "learn", aliases: ["reviews"] }] },
  { label: "Studio", caption: "Notes, docs, sheets, slides", items: [{ view: "studio", aliases: ["docs"] }] },
  { label: "Practice", caption: "Quizzes and games", items: [{ view: "practice", aliases: ["games"] }] },
]

test("viewBelongsToNavigationItem resolves direct views and aliases", () => {
  assert.equal(viewBelongsToNavigationItem("studio", groups[2].items[0]), true)
  assert.equal(viewBelongsToNavigationItem("docs", groups[2].items[0]), true)
  assert.equal(viewBelongsToNavigationItem("games", groups[2].items[0]), false)
})

test("summarizeActiveNavigationGroup explains merged destinations", () => {
  assert.deepEqual(summarizeActiveNavigationGroup("reviews", groups), {
    groupLabel: "Learn",
    caption: "Route, graph, reviews",
    activeView: "learn",
    activeItemIndex: 0,
  })
  assert.equal(summarizeActiveNavigationGroup("docs", groups)?.groupLabel, "Studio")
  assert.equal(summarizeActiveNavigationGroup("dashboard", groups)?.caption, "Daily command center")
})

test("rankNavigationMatches prioritizes exact and prefix matches", () => {
  const results = rankNavigationMatches("stud", [
    { value: "settings", label: "Settings", detail: "Theme and language", keywords: ["profile"] },
    { value: "studio", label: "Studio", detail: "Create notes and docs", keywords: ["documents"] },
    { value: "reviews", label: "Reviews", detail: "Study recall", keywords: ["study"] },
  ])

  assert.deepEqual(results.map((result) => result.value), ["Studio", "Reviews"].map((value) => value.toLowerCase()))
})

test("rankNavigationMatches returns stable default matches for empty queries", () => {
  const results = rankNavigationMatches("", [
    { value: "dashboard", label: "Dashboard", detail: "Home" },
    { value: "studio", label: "Studio", detail: "Create" },
    { value: "practice", label: "Practice", detail: "Quiz" },
  ], 2)

  assert.deepEqual(results.map((result) => result.value), ["dashboard", "studio"])
})

test("formatNavigationBadge hides empty counts and pluralizes labels", () => {
  assert.equal(formatNavigationBadge(0, "draft", "drafts"), "")
  assert.equal(formatNavigationBadge(1, "draft", "drafts"), "1 draft")
  assert.equal(formatNavigationBadge(3, "draft", "drafts"), "3 drafts")
})
