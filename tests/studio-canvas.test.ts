import assert from "node:assert/strict"
import test from "node:test"

import { canvasAspectRatio, canvasPreviewWidth, getStudioCanvasFormat, groupStudioCanvasFormats } from "../lib/studio-canvas"

test("studio canvas formats fall back to a compatible kind", () => {
  assert.equal(getStudioCanvasFormat("presentation-16-9", "slides").label, "Presentation 16:9")
  assert.equal(getStudioCanvasFormat("presentation-16-9", "docs").label, "A4 document")
  assert.equal(getStudioCanvasFormat("missing", "notes").label, "A4 document")
})

test("studio canvas format helpers expose aspect and grouped choices", () => {
  const slide = getStudioCanvasFormat("story", "slides")
  assert.equal(canvasAspectRatio(slide), "9 / 16")
  assert.ok(canvasPreviewWidth(slide) < canvasPreviewWidth(getStudioCanvasFormat("presentation-16-9", "slides")))
  assert.ok(groupStudioCanvasFormats("slides").presentation.length >= 2)
  assert.equal(groupStudioCanvasFormats("sheets").document.length, 0)
})
