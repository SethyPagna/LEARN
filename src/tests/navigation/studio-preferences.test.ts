import assert from "node:assert/strict"
import test from "node:test"
import { createDefaultStudioLayout } from "../../lib/studio-features"
import {
  DEFAULT_HEADING_STYLES,
  HEADING_STYLE_KEY,
  STUDIO_LAYOUT_KEY,
  normalizeHeadingStyles,
  normalizeStoredStudioLayout,
  parseStoredHeadingStyles,
  parseStoredStudioLayout,
} from "../../lib/studio-preferences"

test("studio preference keys stay stable for saved browser state", () => {
  assert.equal(STUDIO_LAYOUT_KEY, "learn_studio_layout_v2")
  assert.equal(HEADING_STYLE_KEY, "learn_heading_styles_v1")
})

test("studio layout parser rejects invalid saved state", () => {
  const fallback = createDefaultStudioLayout("docs", "Study guide", "doc_1")

  assert.deepEqual(parseStoredStudioLayout("{bad json", fallback), fallback)
  assert.deepEqual(normalizeStoredStudioLayout(null, fallback), fallback)
})

test("studio layout parser repairs panes tabs and active ids", () => {
  const fallback = createDefaultStudioLayout("docs", "Study guide", "doc_1")
  const layout = parseStoredStudioLayout(JSON.stringify({
    activePaneId: "missing",
    inspectorOpen: false,
    density: "tiny",
    groups: [{
      id: "group_saved",
      direction: "vertical",
      panes: [{
        id: "pane_a",
        label: "",
        activeTabId: "missing_tab",
        tabs: [
          { id: "tab_a", kind: "slides", title: "Lesson deck", itemId: "deck_1", pinned: true },
          { id: "", kind: "docs", title: "Broken" },
        ],
      }],
    }],
  }), fallback)

  assert.equal(layout.groups[0].id, "group_saved")
  assert.equal(layout.groups[0].direction, "vertical")
  assert.equal(layout.inspectorOpen, false)
  assert.equal(layout.density, fallback.density)
  assert.equal(layout.activePaneId, "pane_a")
  assert.equal(layout.groups[0].panes[0].label, "Order 1")
  assert.equal(layout.groups[0].panes[0].activeTabId, "tab_a")
  assert.equal(layout.groups[0].panes[0].tabs.length, 1)
  assert.equal(layout.groups[0].panes[0].tabs[0].kind, "slides")
})

test("heading style parser keeps safe values and restores unsafe fields", () => {
  const styles = parseStoredHeadingStyles(JSON.stringify({
    1: { color: "#123456", fontFamily: "Inter", fontSize: "36px" },
    2: { color: "", fontFamily: "x".repeat(130), fontSize: "24px" },
  }))

  assert.deepEqual(styles[1], { color: "#123456", fontFamily: "Inter", fontSize: "36px" })
  assert.equal(styles[2].color, DEFAULT_HEADING_STYLES[2].color)
  assert.equal(styles[2].fontFamily, DEFAULT_HEADING_STYLES[2].fontFamily)
  assert.equal(styles[2].fontSize, "24px")
  assert.deepEqual(styles[3], DEFAULT_HEADING_STYLES[3])
  assert.deepEqual(normalizeHeadingStyles(["not", "styles"]), DEFAULT_HEADING_STYLES)
})
