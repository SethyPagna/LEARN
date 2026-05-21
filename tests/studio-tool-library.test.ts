import assert from "node:assert/strict"
import test from "node:test"

import { getStudioToolActions, getStudioToolPanel, studioToolPanels } from "../lib/studio-tool-library"

test("studio tool panels keep Canva-style library sections discoverable", () => {
  assert.deepEqual(studioToolPanels.map((panel) => panel.id), ["templates", "elements", "text", "media", "brand", "ai", "projects"])
  assert.equal(getStudioToolPanel("text").label, "Text")
})

test("studio tool actions are filtered by current Studio kind", () => {
  assert.ok(getStudioToolActions("elements", "slides").some((action) => action.slideObjectType === "shape"))
  assert.ok(getStudioToolActions("elements", "sheets").some((action) => action.sheetAction === "table"))
  assert.equal(getStudioToolActions("media", "sheets").length, 0)
  assert.ok(getStudioToolActions("text", "docs").every((action) => action.richHtml))
})
