import assert from "node:assert/strict"
import test from "node:test"

import { getStudioToolActions, getStudioToolPanel, studioToolPanels } from "../lib/studio-tool-library"

test("studio tool panels keep Canva-style library sections discoverable", () => {
  assert.deepEqual(studioToolPanels.map((panel) => panel.id), ["templates", "elements", "text", "media", "brand", "effects", "animate", "position", "apps", "ai", "projects"])
  assert.equal(getStudioToolPanel("text").label, "Text")
  assert.equal(getStudioToolPanel("animate").description, "Choose slide transitions and entrance motion")
})

test("studio tool actions are filtered by current Studio kind", () => {
  assert.ok(getStudioToolActions("elements", "slides").some((action) => action.slideObjectType === "shape"))
  assert.ok(getStudioToolActions("elements", "docs").some((action) => action.canvasAction === "new-page"))
  assert.ok(getStudioToolActions("elements", "sheets").some((action) => action.sheetAction === "table"))
  assert.equal(getStudioToolActions("media", "sheets").length, 0)
  assert.ok(getStudioToolActions("text", "docs").every((action) => action.richHtml))
  assert.ok(getStudioToolActions("animate", "slides").every((action) => action.slideAnimation || action.slideTransition))
  assert.equal(getStudioToolActions("animate", "docs").length, 0)
  assert.ok(getStudioToolActions("apps", "sheets").some((action) => action.sheetAction === "table"))
})
