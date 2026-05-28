import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { alignSlideDesignObject, applySlideDesignPreset, applySlideDesignPresetToDeck, buildDesignedRichTemplate, buildDesignedSheetTemplateCsv, buildDesignedSlideTemplateDeck, buildSlideExportPayload, buildSlidePresenterOutline, createSlideDesignObject, documentInsertGroups, duplicateSlideDesignObject, getDocumentInsertBlock, nudgeSlideDesignObject, removeSlideDesignObject, reorderSlideDesignObject, resizeSlideDesignObject, richTemplateDesigns, sheetTemplateDesigns, slideAnimationPresets, slideDesignPresets, slideTemplateDesigns, slideTransitionPresets, summarizeSlideShow, updateSlideDesignObject } from "../../lib/studio-design"

test("document insert blocks expose reusable editor snippets", () => {
  assert.match(getDocumentInsertBlock("callout"), /Callout/)
  assert.match(getDocumentInsertBlock("two-column"), /<table>/)
  assert.match(getDocumentInsertBlock("cornell-notes"), /Cues/)
  assert.match(getDocumentInsertBlock("quiz-seed"), /Question/)
  assert.deepEqual(documentInsertGroups.map((group) => group.label), ["Blocks", "Layouts", "Learning"])
})

test("rich document templates apply design surfaces and learning tools", () => {
  const html = buildDesignedRichTemplate({
    body: "<h1>Concept</h1><p>Explain it.</p>",
    description: "Use this to capture and review a concept.",
    kind: "notes",
    label: "Concept card",
    sections: ["Concept", "Example"],
  })

  assert.equal(richTemplateDesigns.length, 10)
  assert.match(html, /Media \/ visual area/)
  assert.match(html, /Review loop/)
  assert.match(html, /border-left/)
  assert.match(html, /<table>/)
})

test("sheet templates add design metadata and operational columns", () => {
  const csv = buildDesignedSheetTemplateCsv("Topic,Status\nReact,Review", "Tracker")

  assert.equal(sheetTemplateDesigns.length, 10)
  assert.match(csv.split("\n")[0], /Priority,Owner,Due,Notes,View/)
  assert.match(csv, /Template,/)
  assert.match(csv, /Status options,/)
})

test("slide design presets add theme and background metadata", () => {
  const slide = applySlideDesignPreset({ title: "One", body: "Body", objects: [{ id: "text", type: "text", x: 1, y: 1, w: 10, h: 10, text: "Point", style: { color: "#000000" } }] }, "forest")

  assert.equal(Object.keys(slideDesignPresets).length >= 10, true)
  assert.equal(slide.theme, "forest")
  assert.equal(slide.background, "#052e2b")
  assert.equal(slide.objects?.[0]?.style?.color, "#ecfeff")
})

test("slide design presets can apply across a whole deck", () => {
  const deck = applySlideDesignPresetToDeck([
    { title: "One", body: "Body" },
    { title: "Two", body: "Body", objects: [{ id: "shape", type: "shape", x: 1, y: 1, w: 10, h: 10, text: "Box", style: {} }] },
  ], "grape")

  assert.equal(deck.length, 2)
  assert.equal(deck[0].theme, "grape")
  assert.equal(deck[1].background, "#2e1065")
})

test("slide template deck applies real design metadata and editable objects", () => {
  const slides = buildDesignedSlideTemplateDeck("Hook|Why it matters|Open\nPractice|Try it|Do", "Lesson")

  assert.equal(slides.length, 2)
  assert.equal(slideTemplateDesigns.length, 10)
  assert.equal(slides[0].theme, "midnight")
  assert.equal(slides[1].layout, "two-column")
  assert.ok(slides[0].background)
  assert.ok(slides[0].objects?.length)
  assert.match(slides[0].speakerNotes || "", /Lesson/)
})

test("slide design objects create editable placeholders", () => {
  const shape = createSlideDesignObject("shape")
  const text = createSlideDesignObject("text")
  const table = createSlideDesignObject("table")

  assert.equal(shape.type, "shape")
  assert.equal(shape.style?.background, "#2563eb")
  assert.equal(text.type, "text")
  assert.ok(text.text)
  assert.equal(table.type, "table")
  assert.match(table.text || "", /Concept/)
})

test("slide design objects can be updated and removed", () => {
  const object = createSlideDesignObject("text")
  const slide = { title: "One", body: "Body", objects: [object] }
  const updated = updateSlideDesignObject(slide, object.id, { text: "Updated point" })
  const removed = removeSlideDesignObject(updated, object.id)

  assert.equal(updated.objects?.[0]?.text, "Updated point")
  assert.equal(removed.objects?.length, 0)
})

test("slide design objects support arrange duplicate nudge and resize operations", () => {
  const object = { ...createSlideDesignObject("shape"), id: "shape_one", x: 10, y: 10, w: 20, h: 10 }
  const second = { ...createSlideDesignObject("text"), id: "text_two" }
  const slide = { title: "One", body: "Body", objects: [object, second] }
  const duplicated = duplicateSlideDesignObject(slide, object.id)
  const nudged = nudgeSlideDesignObject(slide, object.id, "right", 5)
  const resized = resizeSlideDesignObject(slide, object.id, "hero")
  const reordered = reorderSlideDesignObject(slide, object.id, "front")
  const centered = alignSlideDesignObject(slide, object.id, "center")
  const bottom = alignSlideDesignObject(slide, object.id, "bottom")

  assert.equal(duplicated.objects?.length, 3)
  assert.equal(duplicated.objects?.[2]?.x, 14)
  assert.equal(nudged.objects?.[0]?.x, 15)
  assert.equal(resized.objects?.[0]?.w, 68)
  assert.equal(reordered.objects?.at(-1)?.id, object.id)
  assert.equal(centered.objects?.[0]?.x, 40)
  assert.equal(bottom.objects?.[0]?.y, 90)
})

test("slide motion presets summarize deck duration", () => {
  const summary = summarizeSlideShow([
    { title: "Intro", body: "A short teaching point.", transition: "fade", animation: "rise" },
    { title: "Practice", body: "Try the question and explain your reasoning.", transition: "push", animation: "reveal" },
  ])

  assert.equal(slideTransitionPresets.fade.label, "Fade")
  assert.equal(slideAnimationPresets.reveal.label, "Reveal")
  assert.equal(summary.slideCount, 2)
  assert.ok(summary.totalSeconds >= 8)
  assert.equal(summary.slideTimings[0].title, "Intro")
})

test("slide export payload includes presenter outline and timings", () => {
  const object = createSlideDesignObject("table")
  const slides = [
    { title: "Intro", body: "A short teaching point.", accent: "Open", objects: [object], speakerNotes: "Ask a warmup question." },
  ]
  const outline = buildSlidePresenterOutline(slides)
  const payload = buildSlideExportPayload("Lesson", slides)

  assert.match(outline, /Slide 1: Intro/)
  assert.match(outline, /Objects: table/)
  assert.equal(payload.title, "Lesson")
  assert.equal(payload.slides[0].estimatedSeconds >= 3, true)
  assert.match(payload.presenterOutline, /Speaker notes/)
})

test("slide editor toolbar keeps visible controls actionable", () => {
  const source = readFileSync("components/learn/views/studio-view.tsx", "utf8")
  const start = source.indexOf("BG remover")
  const end = source.indexOf("<div className=\"mb-2 flex items-center gap-2", start)
  const toolbarSource = source.slice(start, end)

  assert.ok(start > -1)
  assert.ok(end > start)
  assert.match(toolbarSource, /Apply style/)
  assert.match(toolbarSource, /label="Animate"/)
  assert.match(toolbarSource, /label="Position"/)
  assert.match(toolbarSource, /disabled=\{!selectedObject\}/)
  assert.doesNotMatch(toolbarSource, /setSelectedObjectId\(selectedObject\?\.id/)

  const bottomBarStart = source.indexOf("<FileText className=\"h-3.5 w-3.5\" /> Notes")
  const bottomBarSource = source.slice(bottomBarStart, source.indexOf("aria-label=\"Slide zoom\"", bottomBarStart))
  assert.match(bottomBarSource, /Speaker notes/)
  assert.match(bottomBarSource, /Timer: 5 min/)
})

test("studio shared button helpers avoid accidental form submits", () => {
  const source = readFileSync("components/learn/views/studio-view.tsx", "utf8")
  for (const helperName of ["ViewModeButton", "StudioButton", "MiniAction", "ToolbarIcon", "SheetButton"]) {
    const start = source.indexOf(`function ${helperName}`)
    const end = source.indexOf("\nfunction ", start + 1)
    const helperSource = source.slice(start, end > start ? end : undefined)

    assert.ok(start > -1, `${helperName} exists`)
    assert.match(helperSource, /type="button"/, `${helperName} uses button type`)
  }
})

test("studio menu actions close their dropdown after selection", () => {
  const source = readFileSync("components/learn/views/studio-view.tsx", "utf8")
  const start = source.indexOf("function MenuAction(")
  const end = source.indexOf("\nfunction MenuSelect", start)
  const helperSource = source.slice(start, end)

  assert.ok(start > -1)
  assert.ok(end > start)
  assert.match(helperSource, /closest\("details"\)\?\.removeAttribute\("open"\)/)
  assert.match(helperSource, /onClick=\{handleClick\}/)
})

test("studio action menus support keyboard escape closing", () => {
  const source = readFileSync("components/learn/views/studio-view.tsx", "utf8")
  const start = source.indexOf("function ActionMenu(")
  const end = source.indexOf("\nfunction MenuAction", start)
  const helperSource = source.slice(start, end)

  assert.ok(start > -1)
  assert.ok(end > start)
  assert.match(helperSource, /React\.KeyboardEvent<HTMLDetailsElement>/)
  assert.match(helperSource, /event\.key !== "Escape"/)
  assert.match(helperSource, /removeAttribute\("open"\)/)
  assert.match(helperSource, /querySelector\("summary"\)/)
  assert.match(helperSource, /aria-label=\{label\}/)
})

test("studio action menus expose accessible menu semantics", () => {
  const source = readFileSync("components/learn/views/studio-view.tsx", "utf8")
  const menuStart = source.indexOf("function ActionMenu(")
  const menuEnd = source.indexOf("\nfunction MenuAction", menuStart)
  const menuSource = source.slice(menuStart, menuEnd)
  const actionStart = source.indexOf("function MenuAction(")
  const actionEnd = source.indexOf("\nfunction MenuSelect", actionStart)
  const actionSource = source.slice(actionStart, actionEnd)

  assert.ok(menuStart > -1)
  assert.ok(menuEnd > menuStart)
  assert.ok(actionStart > -1)
  assert.ok(actionEnd > actionStart)
  assert.match(menuSource, /aria-haspopup="menu"/)
  assert.match(menuSource, /aria-expanded=\{isOpen\}/)
  assert.match(menuSource, /React\.SyntheticEvent<HTMLDetailsElement>/)
  assert.match(menuSource, /setIsOpen\(event\.currentTarget\.open\)/)
  assert.match(menuSource, /onToggle=\{syncOpenState\}/)
  assert.match(menuSource, /role="menu"/)
  assert.match(menuSource, /aria-label=\{label\}/)
  assert.match(actionSource, /role="menuitem"/)
})

test("studio action menus keep visible keyboard focus styles", () => {
  const source = readFileSync("components/learn/views/studio-view.tsx", "utf8")
  const menuStart = source.indexOf("function ActionMenu(")
  const menuEnd = source.indexOf("\nfunction MenuAction", menuStart)
  const menuSource = source.slice(menuStart, menuEnd)
  const actionStart = source.indexOf("function MenuAction(")
  const actionEnd = source.indexOf("\nfunction MenuSelect", actionStart)
  const actionSource = source.slice(actionStart, actionEnd)

  assert.ok(menuStart > -1)
  assert.ok(menuEnd > menuStart)
  assert.ok(actionStart > -1)
  assert.ok(actionEnd > actionStart)
  assert.match(menuSource, /focus-visible:ring-2/)
  assert.match(menuSource, /focus-visible:ring-offset-2/)
  assert.match(actionSource, /focus-visible:ring-2/)
  assert.match(actionSource, /focus-visible:ring-offset-popover/)
})

test("studio action menus close when focus leaves the menu", () => {
  const source = readFileSync("components/learn/views/studio-view.tsx", "utf8")
  const start = source.indexOf("function ActionMenu(")
  const end = source.indexOf("\nfunction MenuAction", start)
  const helperSource = source.slice(start, end)

  assert.ok(start > -1)
  assert.ok(end > start)
  assert.match(helperSource, /React\.FocusEvent<HTMLDetailsElement>/)
  assert.match(helperSource, /event\.relatedTarget/)
  assert.match(helperSource, /event\.currentTarget\.contains\(nextFocusedElement\)/)
  assert.match(helperSource, /onBlur=\{closeMenuOnFocusLeave\}/)
})

test("studio menu selects close their dropdown after choosing a value", () => {
  const source = readFileSync("components/learn/views/studio-view.tsx", "utf8")
  const start = source.indexOf("function MenuSelect(")
  const end = source.indexOf("\nfunction StudioContextContent", start)
  const helperSource = source.slice(start, end)

  assert.ok(start > -1)
  assert.ok(end > start)
  assert.match(helperSource, /React\.ChangeEvent<HTMLSelectElement>/)
  assert.match(helperSource, /event\.currentTarget\.value = ""/)
  assert.match(helperSource, /closest\("details"\)\?\.removeAttribute\("open"\)/)
  assert.match(helperSource, /onChange=\{handleChange\}/)
})

test("studio menu selects keep accessible labels and focus styles", () => {
  const source = readFileSync("components/learn/views/studio-view.tsx", "utf8")
  const start = source.indexOf("function MenuSelect(")
  const end = source.indexOf("\nfunction StudioContextContent", start)
  const helperSource = source.slice(start, end)

  assert.ok(start > -1)
  assert.ok(end > start)
  assert.match(helperSource, /aria-label=\{label\}/)
  assert.match(helperSource, /focus-visible:ring-2/)
  assert.match(helperSource, /focus-visible:ring-offset-popover/)
})

test("studio context menu items expose highlighted and keyboard focus styles", () => {
  const styles = readFileSync("app/globals.css", "utf8")
  const start = styles.indexOf(".context-item")
  const end = styles.indexOf("\n  }", start)
  const contextItemStyles = styles.slice(start, end)

  assert.ok(start > -1)
  assert.ok(end > start)
  assert.match(contextItemStyles, /data-\[highlighted\]:bg-accent/)
  assert.match(contextItemStyles, /data-\[highlighted\]:text-accent-foreground/)
  assert.match(contextItemStyles, /focus-visible:ring-2/)
  assert.match(contextItemStyles, /focus-visible:ring-offset-popover/)
})
