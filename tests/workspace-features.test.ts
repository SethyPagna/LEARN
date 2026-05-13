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
import { getVocabulary, supportedLocales } from "../lib/i18n/vocabulary"

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

test("all supported vocabularies return usable text without mojibake", () => {
  for (const locale of supportedLocales) {
    const text = getVocabulary(locale)
    assert.equal(typeof text.dashboard, "string")
    assert.ok(text.dashboard.length > 0)
    assert.doesNotMatch(Object.values(text).join(" "), /Ã|Â|áž|Ù|à[¸¤¥]|�/)
  }
})
