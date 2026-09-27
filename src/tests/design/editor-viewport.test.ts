import assert from "node:assert/strict"
import test from "node:test"
import { DESIGN_ZOOM, fitZoom, stepZoom } from "../../lib/design/gestures"

const slide = { width: 1920, height: 1080 }

test("fit remains at minimum zoom when editor chrome consumes the viewport", () => {
  for (const viewport of [{ width: 300, height: 0 }, { width: 700, height: 50 }, { width: 0, height: 600 }]) {
    assert.equal(fitZoom(slide, viewport, 64), DESIGN_ZOOM.min)
  }
  assert.equal(fitZoom(slide, { width: Number.NaN, height: 600 }), DESIGN_ZOOM.min)
})

test("fit recovers after viewport space returns and stays bounded", () => {
  const viewport = { width: 1200, height: 600 }
  const zoom = fitZoom(slide, viewport, 64)
  assert.ok(zoom > DESIGN_ZOOM.min)
  assert.ok(slide.width * zoom <= viewport.width - 64)
  assert.ok(slide.height * zoom <= viewport.height - 64)
  assert.equal(fitZoom(slide, { width: 10000, height: 10000 }), 2)
})

test("zooming out never enlarges a design already below the first preset", () => {
  for (const zoom of [0.05, 0.07, 0.1]) assert.equal(stepZoom(zoom, -1), DESIGN_ZOOM.min)
  assert.equal(stepZoom(0.25, -1), 0.1)
  assert.equal(stepZoom(DESIGN_ZOOM.min, 1), 0.1)
})
