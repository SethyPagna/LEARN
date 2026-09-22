import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { getVocabulary } from "../../lib/i18n/vocabulary"
import { navigationGroups, viewFromPath, viewLabelKeys, viewRoutes } from "../../lib/navigation"
import {
  ARTIFACT_GROUP_ORDER,
  ARTIFACT_TYPE_IDS,
  ARTIFACT_TYPES,
  PLACE_GROUP_ORDER,
  PLACE_IDS,
  PLACES,
  catalogForGroup,
  describePlace,
  findArtifact,
  findPlace,
  groupArtifactTypes,
  groupPlaces,
  type ArtifactGroupLabel,
  type NavigationGroupLabel,
} from "../../lib/ux/artifact-catalog"
import type { View } from "../../components/learn/types"

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
const LEARN_SHELL = path.join(PROJECT_ROOT, "src", "components", "learn", "learn-shell.tsx")

const views = Object.keys(viewRoutes) as View[]

test("every artifact explains itself in plain language", () => {
  for (const artifact of ARTIFACT_TYPES) {
    assert.ok(artifact.label.trim().length > 0, `${artifact.id} needs a label`)
    assert.ok(artifact.oneLine.trim().length > 0, `${artifact.id} needs a oneLine sentence`)
    assert.ok(artifact.whenToUse.trim().length > 0, `${artifact.id} needs a whenToUse hint`)
    assert.ok(artifact.keywords.length >= 4, `${artifact.id} needs enough keywords to be searchable`)
    assert.ok(ARTIFACT_GROUP_ORDER.includes(artifact.groupLabel), `${artifact.id} is in an undeclared group`)
    // A "one sentence" promise, not a placeholder: real words, and it ends.
    assert.ok(artifact.oneLine.split(/\s+/).length >= 6, `${artifact.id}'s oneLine is too thin to explain anything`)
  }
})

test("artifact ids are unique, ordered, and match the declared list", () => {
  const ids = ARTIFACT_TYPES.map((artifact) => artifact.id)

  assert.deepEqual(ids, [...ARTIFACT_TYPE_IDS], "ARTIFACT_TYPE_IDS must list every artifact, in menu order")
  assert.equal(new Set(ids).size, ids.length, "two artifacts cannot share an id")
  assert.deepEqual(
    new Set(ARTIFACT_TYPE_IDS),
    new Set(["note", "doc", "sheet", "deck", "canvas", "quiz", "live-game"]),
    "the artifact list is a product decision; adding one needs a label and a sentence",
  )
})

test("every artifact and place route is the real navigation route for its view", () => {
  for (const entry of [...ARTIFACT_TYPES, ...PLACES]) {
    assert.equal(entry.route, viewRoutes[entry.view], `${entry.id} must read its route from viewRoutes`)
  }
})

test("every artifact and place view is a real view", () => {
  for (const entry of [...ARTIFACT_TYPES, ...PLACES]) {
    assert.ok(views.includes(entry.view), `${entry.id} points at "${entry.view}", which is not a View`)
  }
})

test("artifact and place ids are unique and match the declared id lists", () => {
  const placeIds = PLACES.map((place) => place.id)

  assert.deepEqual(placeIds, [...PLACE_IDS], "PLACE_IDS must list every place, in guide order")
  assert.equal(new Set(placeIds).size, placeIds.length, "two places cannot share an id")
  assert.equal(new Set(PLACES.map((place) => place.view)).size, placeIds.length, "a view cannot own two place entries")
})

test("the place guide covers every navigation group", () => {
  const coveredGroups = new Set<NavigationGroupLabel>(PLACES.map((place) => place.groupLabel))
  const navigationGroupLabels = navigationGroups.map((group) => group.label) as NavigationGroupLabel[]

  assert.deepEqual(
    navigationGroupLabels.filter((label) => !coveredGroups.has(label)),
    [],
    "every sidebar group must be represented in the guide, or the guide silently drops a whole area",
  )
  assert.deepEqual([...coveredGroups].sort(), [...PLACE_GROUP_ORDER].sort(), "PLACE_GROUP_ORDER must match the groups actually used")
})

test("grouping renders every entry exactly once, in a deterministic order", () => {
  const artifactGroups = groupArtifactTypes()
  const placeGroups = groupPlaces()

  assert.deepEqual(artifactGroups.map((group) => group.groupLabel), [...ARTIFACT_GROUP_ORDER])
  assert.deepEqual(placeGroups.map((group) => group.groupLabel), [...PLACE_GROUP_ORDER])
  assert.deepEqual(
    artifactGroups.flatMap((group) => group.items.map((item) => item.id)),
    [...ARTIFACT_TYPE_IDS],
    "the Create menu's render order must equal ARTIFACT_TYPE_IDS",
  )
  assert.deepEqual(
    placeGroups.flatMap((group) => group.items.map((item) => item.id)),
    [...PLACE_IDS],
    "the guide's render order must equal PLACE_IDS",
  )

  for (const groupLabel of ARTIFACT_GROUP_ORDER) {
    assert.deepEqual(catalogForGroup(groupLabel as ArtifactGroupLabel).map((item) => item.id), artifactGroups.find((group) => group.groupLabel === groupLabel)?.items.map((item) => item.id))
  }
})

test("the guide names each place the same thing the sidebar does", () => {
  const text = getVocabulary("en")

  for (const place of PLACES) {
    assert.equal(
      place.label,
      text[viewLabelKeys[place.view]],
      `the guide calls ${place.view} "${place.label}" while the sidebar calls it "${text[viewLabelKeys[place.view]]}"`,
    )
  }
})

test("the helpers agree with the arrays they read", () => {
  for (const artifact of ARTIFACT_TYPES) assert.equal(findArtifact(artifact.id)?.label, artifact.label)
  for (const place of PLACES) assert.equal(findPlace(place.id)?.label, place.label)
  assert.equal(findArtifact("not-a-real-artifact"), null)
  assert.equal(findPlace("not-a-real-place"), null)
})

/**
 * What the app cannot currently explain.
 *
 * `describePlace` is expected to answer for every view, so this test enumerates
 * the views it cannot. The single entry is an alias of a place that *is* in the
 * guide, which is why it is a gap rather than a missing sentence:
 *
 * - `discover` resolves to its own view, which renders the same `FeedView` as
 *   `feed`, so a second identical sentence would be filler.
 *
 * `learn` used to be here too. It was never an alias — it was dead code: a
 * `View` member with no branch in `learn-shell.tsx`, whose route the shell
 * already rewrote to the dashboard. It was removed rather than described, and
 * the test below pins both halves of that retirement.
 */
const VIEWS_WITHOUT_A_PLACE: Partial<Record<View, string>> = {
  discover: "/discover resolves to the discover view, which renders the same FeedView as /feed (already described as Feed)",
}

test("describePlace answers for every view except the pinned aliases", () => {
  const unanswered = views.filter((view) => !describePlace(view)).sort()

  assert.deepEqual(
    unanswered,
    (Object.keys(VIEWS_WITHOUT_A_PLACE) as View[]).sort(),
    "a view with no place needs a reason in VIEWS_WITHOUT_A_PLACE, or the guide has a real hole",
  )

  for (const [view, reason] of Object.entries(VIEWS_WITHOUT_A_PLACE)) {
    assert.ok(reason && reason.trim().split(/\s+/).length >= 8, `${view} needs a reason, not a placeholder`)
  }
})

test("described places return the place whose route and view match", () => {
  for (const place of PLACES) {
    const described = describePlace(place.view)

    assert.equal(described?.id, place.id)
    assert.equal(described?.route, place.route)
    assert.equal(described?.oneLine, place.oneLine)
  }
})

/**
 * The dead-view retirement and the Feed alias.
 *
 * Both halves of the `VIEWS_WITHOUT_A_PLACE` note are pinned here. `learn` must
 * stay out of the view tables so it cannot quietly return as a `View` member
 * that no branch renders; `/learn` must keep resolving to the dashboard. And
 * `/discover` must keep resolving to the (single) feed screen instead of
 * drifting into a second implementation that the guide would then have to
 * describe separately.
 */
test("the retired learn view stays out of the view tables", () => {
  assert.equal("learn" in viewRoutes, false, "learn is dead code; it must not have a route of its own")
  assert.equal("learn" in viewLabelKeys, false, "learn has no sidebar label")
  assert.equal(views.includes("learn" as View), false, "learn must not be a View")
  assert.equal(viewFromPath("/learn"), "dashboard", "/learn must keep resolving to the dashboard")
})

test("discover remains a documented alias of the feed screen", () => {
  assert.equal(viewFromPath("/discover"), "discover", "/discover must resolve to the discover view")

  const shell = fs.readFileSync(LEARN_SHELL, "utf8")
  assert.match(
    shell,
    /view === "feed" \|\| view === "discover" \? <FeedView/,
    "feed and discover must keep rendering the one FeedView; the shared render is an intentional alias, not a second screen",
  )
  assert.ok(
    shell.includes("documented alias of `feed`"),
    "the shared feed/discover render needs a comment saying why it is shared",
  )
})
