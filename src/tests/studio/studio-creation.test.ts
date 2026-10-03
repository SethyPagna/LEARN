import assert from "node:assert/strict"
import test from "node:test"
import { artifactCreationPlan, parseStudioCreationKind, studioCreationKindFromSearch, withoutStudioCreationQuery } from "../../lib/studio-creation"

test("writing and spreadsheet Add actions use the Studio creator with the intended kind", () => {
  for (const [id, kind] of [["note", "notes"], ["doc", "docs"], ["sheet", "sheets"], ["deck", "slides"]] as const) {
    const plan = artifactCreationPlan(id)
    assert.equal(plan.type, "project")
    assert.equal(plan.href, `/studio?add=${kind}`)
    assert.equal(studioCreationKindFromSearch(new URL(plan.href, "https://learn.test").search), kind)
  }
})

test("Canvas asks for a size and practice entries open their real setup flows", () => {
  assert.deepEqual(artifactCreationPlan("canvas"), { type: "canvas", href: "/canvas?new=1" })
  assert.deepEqual(artifactCreationPlan("quiz"), { type: "quiz", href: "/ai" })
  assert.deepEqual(artifactCreationPlan("live-game"), { type: "live", href: "/live" })
})

test("Studio creation ignores unsupported, malformed and ambiguous Add values", () => {
  for (const value of ["canvas", "quiz", "doc", "__proto__", "constructor", "DOCS", null, 1, {}]) assert.equal(parseStudioCreationKind(value), null)
  for (const search of ["", "?add=unknown", "?add=docs&add=notes", "?add=docs&add=docs", "?add="]) assert.equal(studioCreationKindFromSearch(search), null)
  assert.equal(studioCreationKindFromSearch("?add=%64ocs"), "docs")
})

test("consuming or reloading a transient Add URL preserves ordinary query parameters", () => {
  assert.equal(withoutStudioCreationQuery("?add=docs"), "")
  assert.equal(withoutStudioCreationQuery("?filter=Writing&add=docs&query=cell+one"), "?filter=Writing&query=cell+one")
  assert.equal(withoutStudioCreationQuery("?add=docs&add=notes&query=topic"), "?query=topic")
})
