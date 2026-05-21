import assert from "node:assert/strict"
import test from "node:test"

import { buildStudioProjectBrowserState, buildStudioTemplatePreview, countStudioProjects, matchesStudioBrowserQuery, normalizeStudioBrowserQuery, selectStudioBrowserTemplate } from "../lib/studio-project-browser"

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

test("studio project browser filters active-kind projects and matching templates", () => {
  const state = buildStudioProjectBrowserState({
    activeKind: "slides",
    items: projects,
    query: "deck",
    templates,
  })

  assert.deepEqual(state.projects.map((item) => item.id), ["deck_1"])
  assert.deepEqual(state.templates.map((template) => template.label), ["Lesson"])
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
