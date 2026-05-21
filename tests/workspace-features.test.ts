import assert from "node:assert/strict"
import test from "node:test"
import {
  createHistoryState,
  exportSheetToCsv,
  importCsvToSheet,
  pushHistory,
  redoHistory,
  replaceTextInHtml,
  stripHtmlToText,
  summarizeDocumentHtml,
  undoHistory,
} from "../lib/workspace-features"
import {
  addColumn,
  addRow,
  buildSheetFormula,
  buildStudioRecordActionGroups,
  closeStudioPane,
  closeOtherStudioPanes,
  computeStudioDirtyBadges,
  createSlideObject,
  createDefaultStudioLayout,
  deleteColumn,
  deleteRow,
  duplicateSlide,
  evaluateSheetFormula,
  fillSheetRange,
  moveColumn,
  moveRow,
  moveSlide,
  pinStudioPane,
  renameStudioPane,
  slideToObjects,
  sortSheetByColumn,
  splitStudioPane,
} from "../lib/studio-features"
import { shouldAnnounceStudioDraftSave, summarizeStudioDrafts } from "../lib/studio-drafts"
import {
  findStudioFormattingOption,
  studioFontOptions,
  studioFontSizeOptions,
  studioHighlightColorOptions,
  studioTextColorOptions,
} from "../lib/studio-formatting"
import {
  getStudioKindOption,
  getStudioViewModeOption,
  studioEmptyTabLabels,
  studioInspectorTabs,
  studioKindOptions,
  studioSectionFilters,
  studioViewModeOptions,
} from "../lib/studio-navigation"
import {
  blankDocTitle,
  blankDeckTitle,
  blankNoteTitle,
  blankRichText,
  blankSheetTitle,
  getBlankStudioTitle,
  parseDeckSlides,
  parseSheetCells,
} from "../lib/studio-defaults"
import {
  getSocialCommandTab,
  practiceWorkspaceTabs,
  socialCommandTabs,
  socialWorkspaceTabFromView,
  socialWorkspaceTabs,
  viewFromPracticeWorkspaceTab,
  viewFromSocialWorkspaceTab,
} from "../lib/learn-workspace-navigation"
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

test("document helpers summarize outline and replace text", () => {
  const html = "<h1>Photosynthesis</h1><p>Light makes energy. Light matters.</p>"
  const summary = summarizeDocumentHtml(html)
  const replaced = replaceTextInHtml(html, "Light", "Sunlight")

  assert.equal(stripHtmlToText(html), "Photosynthesis Light makes energy. Light matters.")
  assert.equal(summary.words, 6)
  assert.equal(summary.headings[0].title, "Photosynthesis")
  assert.equal(replaced.count, 2)
  assert.match(replaced.html, /Sunlight makes energy/)
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

test("studio layout supports rename pin and close-others operations", () => {
  const layout = splitStudioPane(createDefaultStudioLayout("docs", "Study doc", "doc_1"), "pane_1", "horizontal")
  const secondPaneId = layout.groups[0].panes[1].id
  const renamed = renameStudioPane(layout, secondPaneId, "Research")
  const pinned = pinStudioPane(renamed, secondPaneId)
  const focused = closeOtherStudioPanes(pinned, secondPaneId)

  assert.equal(focused.groups[0].panes.length, 1)
  assert.equal(focused.groups[0].panes[0].label, "Research")
  assert.equal(focused.groups[0].panes[0].pinned, true)
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

test("studio sheet helpers fill ranges and sort rows", () => {
  const cells = [["Topic", "Score"], ["React", "72"], ["Databases", "48"], ["Algorithms", "90"]]
  const filled = fillSheetRange(cells, { selectedRange: { startRow: 1, startColumn: 1, endRow: 3, endColumn: 1 } }, "down")
  const sorted = sortSheetByColumn(cells, 0, "asc")

  assert.deepEqual(filled.map((row) => row[1]), ["Score", "72", "72", "72"])
  assert.deepEqual(sorted.map((row) => row[0]), ["Topic", "Algorithms", "Databases", "React"])
})

test("studio sheet formulas build and evaluate common functions", () => {
  const cells = [["Topic", "Score"], ["React", "72"], ["Databases", "48"], ["Algorithms", "90"]]

  assert.equal(buildSheetFormula("SUM", 1, cells.length), "=SUM(B2:B4)")
  assert.deepEqual(evaluateSheetFormula(cells, "=SUM(B2:B4)"), { ok: true, value: "210", reason: "SUM across 3 cells" })
  assert.deepEqual(evaluateSheetFormula(cells, "=AVERAGE(B2:B4)"), { ok: true, value: "70", reason: "AVERAGE across 3 cells" })
  assert.deepEqual(evaluateSheetFormula(cells, "=MAX(B2:B4)"), { ok: true, value: "90", reason: "MAX across 3 cells" })
  assert.equal(evaluateSheetFormula(cells, "=MEDIAN(B2:B4)").ok, false)
})

test("studio slide helpers duplicate and move slides", () => {
  const slides = [
    { title: "One", body: "A" },
    { title: "Two", body: "B" },
  ]

  assert.equal(duplicateSlide(slides, 0)[1].title, "One copy")
  assert.deepEqual(moveSlide(slides, 1, -1).map((slide) => slide.title), ["Two", "One"])
})

test("studio slide helpers build editable objects from legacy slides", () => {
  const object = createSlideObject("shape", { text: "Box" })
  const legacyObjects = slideToObjects({ title: "One", body: "Body" })

  assert.equal(object.type, "shape")
  assert.equal(legacyObjects[0].text, "One")
  assert.equal(legacyObjects[1].text, "Body")
})

test("studio dirty badges summarize local drafts by kind", () => {
  const badges = computeStudioDirtyBadges({
    notes: { updatedAt: "2026-01-01T00:00:00.000Z" },
    slides: { updatedAt: "2026-01-02T00:00:00.000Z" },
  })

  assert.deepEqual(badges.map((badge) => badge.kind), ["notes", "slides"])
  assert.equal(badges[0].count, 1)
})

test("studio record action groups keep active item menus compact", () => {
  const groups = buildStudioRecordActionGroups()

  assert.deepEqual(groups.map((group) => group.id), ["open", "edit", "share", "manage"])
  assert.deepEqual(groups[0].actions, ["open", "split"])
  assert.equal(groups.find((group) => group.id === "manage")?.actions[0], "archive")
})

test("studio record action groups swap manage actions for archived items", () => {
  const groups = buildStudioRecordActionGroups({ archived: true })
  const openGroup = groups.find((group) => group.id === "open")
  const manageGroup = groups.find((group) => group.id === "manage")

  assert.deepEqual(openGroup?.actions, ["open"])
  assert.equal(manageGroup?.priority, "primary")
  assert.deepEqual(manageGroup?.actions, ["restore"])
})

test("studio draft summary counts typed workspace drafts", () => {
  const summary = summarizeStudioDrafts({
    docs: { kind: "docs", title: "Guide", content: "<p>Draft</p>", updatedAt: "2026-01-01T00:00:00.000Z" },
    sheets: { kind: "sheets", title: "Tracker", cells: [["A"]], updatedAt: "2026-01-02T00:00:00.000Z" },
  })

  assert.equal(summary.count, 2)
  assert.deepEqual(summary.labels.sort(), ["docs", "sheets"])
  assert.equal(summary.latestAt, "2026-01-02T00:00:00.000Z")
})

test("studio draft notice helper avoids noisy repeated announcements", () => {
  assert.equal(shouldAnnounceStudioDraftSave({ kind: "notes", now: 1000 }), true)
  assert.equal(shouldAnnounceStudioDraftSave({ kind: "notes", lastKind: "notes", lastShownAt: 1000, now: 2000, cooldownMs: 12000 }), false)
  assert.equal(shouldAnnounceStudioDraftSave({ kind: "docs", lastKind: "notes", lastShownAt: 1000, now: 2000, cooldownMs: 12000 }), true)
  assert.equal(shouldAnnounceStudioDraftSave({ kind: "notes", lastKind: "notes", lastShownAt: 1000, now: 14000, cooldownMs: 12000 }), true)
})

test("studio formatting options keep Office-like controls stable", () => {
  assert.equal(studioFontOptions[0].label, "Aptos")
  assert.ok(studioFontOptions.some((option) => option.value.includes("serif")))
  assert.deepEqual(studioFontSizeOptions.map((option) => option.value).slice(0, 4), ["8px", "9px", "10px", "11px"])
  assert.equal(studioFontSizeOptions.at(-1)?.value, "72px")
  assert.equal(findStudioFormattingOption(studioTextColorOptions, "inherit")?.label, "Default")
  assert.equal(findStudioFormattingOption(studioHighlightColorOptions, "#bfdbfe")?.label, "Blue")
  assert.equal(findStudioFormattingOption(studioTextColorOptions, "missing"), null)
})

test("studio navigation options keep unified routes and inspector labels stable", () => {
  assert.deepEqual(studioKindOptions.map((option) => option.kind), ["notes", "docs", "sheets", "slides"])
  assert.equal(getStudioKindOption("slides").label, "Slides")
  assert.match(getStudioKindOption("docs").description, /Rich study guides/)
  assert.deepEqual(studioSectionFilters, ["All", "Notes", "Docs", "Sheets", "Slides", "Recent", "Favorites", "Archived"])
  assert.deepEqual(studioViewModeOptions.map((option) => option.id), ["list", "board", "gallery"])
  assert.equal(getStudioViewModeOption("gallery").label, "Gallery")
  assert.deepEqual(studioInspectorTabs, ["Info", "Outline", "Comments", "History", "AI", "Export"])
  assert.equal(studioEmptyTabLabels.notes, "Notes")
})

test("combined workspace navigation keeps practice and social route mappings stable", () => {
  assert.deepEqual(practiceWorkspaceTabs.map((tab) => tab.id), ["quizzes", "games"])
  assert.equal(viewFromPracticeWorkspaceTab("games"), "games")
  assert.deepEqual(socialWorkspaceTabs.map((tab) => tab.id), ["home", "chat", "spaces", "rooms", "battles"])
  assert.equal(socialWorkspaceTabFromView("social"), "home")
  assert.equal(socialWorkspaceTabFromView("rooms"), "rooms")
  assert.equal(socialWorkspaceTabFromView("dashboard"), "home")
  assert.equal(viewFromSocialWorkspaceTab("home"), "social")
  assert.equal(viewFromSocialWorkspaceTab("battles"), "battles")
  assert.deepEqual(socialCommandTabs.map((tab) => tab.label), ["Find", "Message", "Invite", "Friends"])
  assert.equal(getSocialCommandTab("invite").label, "Invite")
})

test("Studio blank defaults do not seed new sheets or decks with sample content", () => {
  const cells = parseSheetCells()
  const slides = parseDeckSlides()

  assert.equal(blankNoteTitle, "Untitled note")
  assert.equal(blankDocTitle, "Untitled document")
  assert.equal(blankRichText, "<p></p>")
  assert.equal(blankSheetTitle, "Untitled sheet")
  assert.equal(blankDeckTitle, "Untitled deck")
  assert.equal(getBlankStudioTitle("notes"), blankNoteTitle)
  assert.equal(getBlankStudioTitle("slides"), blankDeckTitle)
  assert.equal(cells.length >= 8, true)
  assert.equal(cells.every((row) => row.every((cell) => cell === "")), true)
  assert.equal(slides.length, 1)
  assert.equal(slides[0].title, "")
  assert.equal(slides[0].body, "")
  assert.deepEqual(parseSheetCells({ cells: [["Topic", "Status"]] }), [["Topic", "Status"]])
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
