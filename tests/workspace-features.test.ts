import assert from "node:assert/strict"
import test from "node:test"
import {
  createHistoryState,
  exportSheetToCsv,
  importCsvToSheet,
  pushHistory,
  redoHistory,
  undoHistory,
} from "../lib/workspace-features"
import {
  addColumn,
  addRow,
  closeStudioPane,
  createDefaultStudioLayout,
  deleteColumn,
  deleteRow,
  duplicateSlide,
  moveColumn,
  moveRow,
  moveSlide,
  splitStudioPane,
} from "../lib/studio-features"
import { getVocabulary, isSupportedLocale, loadVocabulary, supportedLocales } from "../lib/i18n/vocabulary"

test("editor history supports undo and redo without losing future states", () => {
  const initial = createHistoryState("first")
  const second = pushHistory(initial, "second")
  const third = pushHistory(second, "third")

  const undone = undoHistory(third)
  assert.equal(undone.present, "second")
  assert.deepEqual(undone.future, ["third"])

  const redone = redoHistory(undone)
  assert.equal(redone.present, "third")
  assert.deepEqual(redone.future, [])
})

test("editor history ignores duplicate consecutive states", () => {
  const state = pushHistory(createHistoryState("same"), "same")

  assert.deepEqual(state.past, [])
  assert.equal(state.present, "same")
  assert.deepEqual(state.future, [])
})

test("sheet csv import and export preserve quoted commas", () => {
  const sheet = importCsvToSheet('Topic,Note\n"React, hooks","useMemo, useState"')

  assert.equal(sheet.cells[0][0], "Topic")
  assert.equal(sheet.cells[1][0], "React, hooks")
  assert.equal(sheet.cells[1][1], "useMemo, useState")
  assert.equal(exportSheetToCsv(sheet), 'Topic,Note\n"React, hooks","useMemo, useState"')
})

test("studio layout supports split and close pane operations", () => {
  const layout = createDefaultStudioLayout("docs", "Study doc", "doc_1")
  const split = splitStudioPane(layout, "pane_1", "horizontal")

  assert.equal(split.groups[0].panes.length, 2)
  assert.equal(split.groups[0].panes[1].label, "Order 2")
  assert.equal(split.activePaneId, split.groups[0].panes[1].id)

  const closed = closeStudioPane(split, split.groups[0].panes[1].id)
  assert.equal(closed.groups[0].panes.length, 1)
  assert.equal(closed.groups[0].panes[0].label, "Order 1")
})

test("studio sheet helpers add delete and move rows and columns", () => {
  const cells = [["A", "B"], ["1", "2"]]

  assert.deepEqual(addRow(cells, 0), [["A", "B"], ["", ""], ["1", "2"]])
  assert.deepEqual(deleteRow(cells, 1), [["A", "B"]])
  assert.deepEqual(addColumn(cells, 0), [["A", "", "B"], ["1", "", "2"]])
  assert.deepEqual(deleteColumn(cells, 0), [["B"], ["2"]])
  assert.deepEqual(moveRow(cells, 1, -1), [["1", "2"], ["A", "B"]])
  assert.deepEqual(moveColumn(cells, 0, 1), [["B", "A"], ["2", "1"]])
})

test("studio slide helpers duplicate and move slides", () => {
  const slides = [
    { title: "One", body: "A" },
    { title: "Two", body: "B" },
  ]

  assert.equal(duplicateSlide(slides, 0)[1].title, "One copy")
  assert.deepEqual(moveSlide(slides, 1, -1).map((slide) => slide.title), ["Two", "One"])
})

test("all supported vocabularies return usable text without mojibake", async () => {
  for (const locale of supportedLocales) {
    const text = await loadVocabulary(locale)
    assert.equal(typeof text.dashboard, "string")
    assert.ok(text.dashboard.length > 0)
    assert.doesNotMatch(Object.values(text).join(" "), /Ã|Â|áž|Ù|à[¸¤¥]|�/)
  }
})

test("vocabulary combines English fallback with only the requested locale", async () => {
  const english = getVocabulary("en")
  const french = await loadVocabulary("fr")

  assert.equal(getVocabulary("fr"), french)
  assert.equal(await loadVocabulary("unknown"), english)
  assert.equal(french.save, "Enregistrer")
  assert.equal(french.workspace, english.workspace)
  assert.equal(isSupportedLocale("fr"), true)
  assert.equal(isSupportedLocale("unknown"), false)
})
