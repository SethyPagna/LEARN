import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { buildStudioProjectBrowserHeader, buildStudioProjectBrowserState, buildStudioProjectBrowserSummary, buildStudioProjectSubtitle, buildStudioTemplatePreview, buildStudioTemplateSubtitle, countStudioProjects, filterStudioProjectsByDraftStatus, getStudioProjectDisplayMeta, getStudioProjectFilterOption, listStudioProjectFilterOptions, matchesStudioBrowserQuery, normalizeStudioBrowserQuery, selectStudioBrowserTemplate, selectStudioProjectShelf, selectStudioTemplateShelf, sortStudioProjectsByModified, templateMatchesFormatGroup } from "../../lib/studio-project-browser"
import { getStudioToolActions, groupStudioToolActions, resolveStudioToolActionKind, studioToolPanels } from "../../lib/studio-tool-library"

const projects = [
  { id: "note_1", kind: "notes" as const, title: "Operating systems note", summary: "Scheduling" },
  { id: "doc_1", kind: "docs" as const, title: "Research brief", summary: "Indexing" },
  { id: "sheet_1", kind: "sheets" as const, title: "Study tracker", summary: "12 rows" },
  { id: "deck_1", kind: "slides" as const, title: "Database review deck", summary: "6 slides" },
]

const templates = [
  { label: "Lesson", title: "Lesson deck", body: "Hook|Explain|Practice", style: "midnight" },
  { label: "Pitch", title: "Idea pitch", body: "Problem|Solution|Proof", style: "sunrise" },
]

test("studio project browser normalizes noisy search input", () => {
  assert.equal(normalizeStudioBrowserQuery("  Database   Deck "), "database deck")
})

test("studio project browser counts every Studio kind", () => {
  assert.deepEqual(countStudioProjects(projects), {
    docs: 1,
    notes: 1,
    sheets: 1,
    slides: 1,
  })
})

test("studio project browser exposes project-first filter labels", () => {
  assert.deepEqual(listStudioProjectFilterOptions().map((option) => option.label), ["All templates", "Notes", "Docs", "Sheets", "PPT / Slides"])
  assert.equal(getStudioProjectFilterOption("docs").label, "Docs")
  assert.equal(getStudioProjectFilterOption("all").description, "Show every Studio project and reusable design")
})

test("studio project browser uses project-first display labels", () => {
  assert.equal(getStudioProjectDisplayMeta("notes").badge, "Capture")
  assert.equal(buildStudioProjectSubtitle(projects[2]), "Data - 12 rows")
  assert.equal(buildStudioProjectSubtitle({ kind: "slides" as const, summary: "" }), "Deck - 16:9 / poster canvas")
  assert.equal(buildStudioTemplateSubtitle({ kind: "docs" as const, style: "Editorial" }), "Editorial - A4 / Letter page")
})

test("studio project browser limits the project drawer shelf", () => {
  assert.deepEqual(selectStudioProjectShelf(projects, 2).map((item) => item.id), ["note_1", "doc_1"])
  assert.deepEqual(selectStudioProjectShelf(projects, 0), [])
})

test("studio project browser filters project shelves by draft status", () => {
  assert.deepEqual(filterStudioProjectsByDraftStatus(projects, ["notes", "slides"], "drafts").map((item) => item.id), ["note_1", "deck_1"])
  assert.deepEqual(filterStudioProjectsByDraftStatus(projects, ["notes", "slides"], "saved").map((item) => item.id), ["doc_1", "sheet_1"])
  assert.deepEqual(filterStudioProjectsByDraftStatus(projects, ["notes"], "all"), projects)
})

test("studio project browser limits template shelves", () => {
  assert.deepEqual(selectStudioTemplateShelf(templates, 1).map((item) => item.label), ["Lesson"])
  assert.deepEqual(selectStudioTemplateShelf(templates, 0), [])
})

test("studio project browser sorts project shelves by modified time", () => {
  const sorted = sortStudioProjectsByModified([
    { ...projects[0], updated_at: "2026-01-01T00:00:00.000Z" },
    { ...projects[1], updated_at: "2026-01-03T00:00:00.000Z" },
    { ...projects[2], updated_at: "2026-01-02T00:00:00.000Z" },
  ])

  assert.deepEqual(sorted.map((item) => item.id), ["doc_1", "sheet_1", "note_1"])
  assert.deepEqual(sortStudioProjectsByModified(sorted, "oldest").map((item) => item.id), ["note_1", "sheet_1", "doc_1"])
})

test("studio project browser filters active-kind projects and matching templates", () => {
  const state = buildStudioProjectBrowserState({
    kindFilter: "slides",
    items: projects,
    query: "deck",
    templates,
  })

  assert.deepEqual(state.projects.map((item) => item.id), ["deck_1"])
  assert.deepEqual(state.templates.map((template) => template.label), ["Lesson"])
})

test("studio project browser can show every project type as one workspace", () => {
  const state = buildStudioProjectBrowserState({
    kindFilter: "all",
    items: projects,
    query: "",
    templates: [
      { ...templates[0], kind: "slides" as const },
      { ...templates[1], kind: "docs" as const },
    ],
  })

  assert.deepEqual(state.projects.map((item) => item.id), ["note_1", "doc_1", "sheet_1", "deck_1"])
  assert.deepEqual(state.templates.map((template) => template.label), ["Lesson", "Pitch"])
})

test("studio project browser summary keeps the launcher compact", () => {
  const summary = buildStudioProjectBrowserSummary({
    draftCount: 2,
    filterLabel: "All templates",
    formatLabel: "A4 document",
    projectCount: 4,
    query: "",
    templateCount: 10,
  })
  const searched = buildStudioProjectBrowserSummary({
    draftCount: 0,
    filterLabel: "PPT / Slides",
    formatLabel: "Presentation 16:9",
    projectCount: 1,
    query: "database",
    templateCount: 2,
  })

  assert.equal(summary.title, "All projects")
  assert.equal(summary.chips.find((chip) => chip.label === "Format")?.value, "A4 document")
  assert.equal(searched.title, "Search results")
  assert.equal(searched.chips.find((chip) => chip.label === "Format")?.value, "PPT / Slides")
  assert.match(buildStudioProjectBrowserHeader(summary), /4 visible/)
})

test("studio project launcher keeps edit tools behind project entry", () => {
  const source = readFileSync("components/learn/views/studio-view.tsx", "utf8")
  const start = source.indexOf("function StudioProjectBrowser(")
  const end = source.indexOf("function StudioToolRail(")
  const launcherSource = source.slice(start, end)

  assert.ok(start > -1)
  assert.ok(end > start)
  assert.match(launcherSource, /Recent projects/)
  assert.match(launcherSource, /New project/)
  assert.doesNotMatch(launcherSource, /Canvas preview|Use Daily note|<StudioToolRail/)
})

test("studio project browser filters template designs by canvas format", () => {
  const state = buildStudioProjectBrowserState({
    formatGroup: "document",
    kindFilter: "all",
    items: projects,
    query: "",
    templates: [
      { ...templates[0], kind: "slides" as const },
      { ...templates[1], kind: "docs" as const },
      { label: "Tracker", title: "Study tracker", body: "Topic,Status", kind: "sheets" as const },
    ],
  })

  assert.deepEqual(state.templates.map((template) => template.label), ["Pitch", "Tracker"])
})

test("template format matching falls back to useful kind defaults", () => {
  assert.equal(templateMatchesFormatGroup({ kind: "slides" }, "presentation"), true)
  assert.equal(templateMatchesFormatGroup({ kind: "slides" }, "document"), false)
  assert.equal(templateMatchesFormatGroup({ kind: "sheets" }, "document"), true)
  assert.equal(templateMatchesFormatGroup({ formatGroups: ["poster"], kind: "docs" }, "document"), false)
})

test("studio project browser searches summaries and template bodies", () => {
  assert.equal(matchesStudioBrowserQuery(projects[0], "scheduling"), true)
  assert.equal(matchesStudioBrowserQuery(templates[1], "solution"), true)
  assert.equal(matchesStudioBrowserQuery(templates[1], "missing"), false)
})

test("studio project browser keeps a stable template preview fallback", () => {
  assert.equal(selectStudioBrowserTemplate(templates, "Pitch")?.label, "Pitch")
  assert.equal(selectStudioBrowserTemplate(templates, "Missing")?.label, "Lesson")
  assert.equal(selectStudioBrowserTemplate([], "Pitch"), null)
})

test("studio template preview trims sections and labels the next action", () => {
  const preview = buildStudioTemplatePreview(templates[0], {
    accent: "#10b981",
    background: "#07111f",
    description: "A lesson flow",
    sections: ["Hook", "Explain", "Practice", "Close"],
    style: "midnight",
  }, "Presentation 16:9")

  assert.equal(preview.actionLabel, "Use Lesson")
  assert.deepEqual(preview.sections, ["Hook", "Explain", "Practice"])
  assert.equal(preview.style, "midnight")
})

test("studio template preview falls back to canvas label without a template", () => {
  const preview = buildStudioTemplatePreview(null, null, "A4 document")

  assert.equal(preview.label, "A4 document")
  assert.deepEqual(preview.sections, [])
  assert.equal(preview.actionLabel, "")
})

test("studio tool library exposes varied Canva-style insert targets", () => {
  assert.ok(getStudioToolActions("elements", "slides").some((action) => action.slideObjectType === "table"))
  assert.ok(getStudioToolActions("media", "docs").some((action) => action.id === "media-video"))
  assert.ok(getStudioToolActions("text", "notes").some((action) => action.id === "text-checklist"))
  assert.ok(getStudioToolActions("ai", "sheets").some((action) => action.sheetAction === "table"))
  assert.ok(getStudioToolActions("animate", "slides").some((action) => action.slideTransition === "fade"))
  assert.ok(getStudioToolActions("effects", "slides").some((action) => action.slideTheme === "obsidian"))
  assert.ok(getStudioToolActions("apps", "docs").some((action) => action.id === "app-quiz-widget"))
  assert.ok(getStudioToolActions("position", "slides").some((action) => action.slideLayout === "two-column"))
  assert.deepEqual(studioToolPanels.map((panel) => panel.label), ["Templates", "Elements", "Text", "Media", "Brand", "Effects", "Animate", "Position", "Apps", "AI", "Projects"])
})

test("studio tool action kind resolver keeps launcher actions compatible", () => {
  assert.equal(resolveStudioToolActionKind({ supportedKinds: ["notes", "docs"] }, "docs"), "docs")
  assert.equal(resolveStudioToolActionKind({ supportedKinds: ["sheets"] }, "slides"), "sheets")
  assert.equal(resolveStudioToolActionKind({ supportedKinds: [] }, "slides"), "slides")
})

test("studio tool actions group into compact launcher sections", () => {
  const elementGroups = groupStudioToolActions("elements", "slides")
  assert.deepEqual(elementGroups.map((group) => group.label), ["Pages", "Visuals", "Data", "Inserts"])
  assert.equal(elementGroups.find((group) => group.label === "Pages")?.actions[0]?.id, "page-new")

  const mediaGroups = groupStudioToolActions("media", "docs")
  assert.deepEqual(mediaGroups.map((group) => group.label), ["Media"])
  assert.ok(mediaGroups[0]?.actions.some((action) => action.id === "media-video"))

  assert.deepEqual(groupStudioToolActions("animate", "slides").map((group) => group.label), ["Transitions", "Motion"])
  assert.deepEqual(groupStudioToolActions("effects", "slides").map((group) => group.label), ["Visuals", "Themes"])
  assert.deepEqual(groupStudioToolActions("apps", "docs").map((group) => group.label), ["Learning apps", "Data"])
  assert.deepEqual(groupStudioToolActions("position", "slides").map((group) => group.label), ["Layout"])
})
