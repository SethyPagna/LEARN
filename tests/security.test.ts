import assert from "node:assert/strict"
import test from "node:test"
import { buildFileLibraryActionPlan, buildFileLibraryEmptyState, buildFileLibraryFilterSummary, filterFileLibrary, fileKindLabel, resolveVisibleFileSelection, summarizeFileLibrary } from "../lib/file-library-features"
import { classifyUploadContentType, MAX_UPLOAD_BYTES, validateUploadFile, validateUploadFileShape } from "../lib/file-security"
import { checkRateLimit } from "../lib/rate-limit"

test("validateUploadFile allows regular image uploads", () => {
  const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xdb])], "note.jpg", { type: "image/jpeg" })
  assert.equal(validateUploadFile(file, new ArrayBuffer(4)), null)
})

test("validateUploadFile blocks executable signatures", () => {
  const file = new File([new Uint8Array([0x4d, 0x5a, 0x90, 0x00])], "study.pdf", { type: "application/pdf" })
  assert.equal(validateUploadFile(file, new Uint8Array([0x4d, 0x5a, 0x90, 0x00]).buffer), "Executable files are blocked for safety.")
})

test("upload file shape validation blocks unsafe or oversized files early", () => {
  assert.equal(validateUploadFileShape({ name: "notes.js", size: 100, type: "text/javascript" }), "This file type is blocked for safety.")
  assert.equal(validateUploadFileShape({ name: "huge.pdf", size: MAX_UPLOAD_BYTES + 1, type: "application/pdf" }), "File is too large. Keep uploads under 100 MB.")
  assert.equal(validateUploadFileShape({ name: "deck.pptx", size: 100, type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }), null)
})

test("upload content types classify files for UI grouping", () => {
  assert.equal(classifyUploadContentType("image/png"), "image")
  assert.equal(classifyUploadContentType("video/mp4"), "video")
  assert.equal(classifyUploadContentType("text/csv"), "sheet")
  assert.equal(classifyUploadContentType("application/pdf"), "pdf")
})

test("file library summary groups media and document files", () => {
  const files = [
    { id: "image", filename: "diagram.png", content_type: "image/png", size_bytes: 10, created_at: "", source: "r2" },
    { id: "pdf", filename: "reading.pdf", content_type: "application/pdf", size_bytes: 20, created_at: "", source: "r2" },
    { id: "sheet", filename: "scores.csv", content_type: "text/csv", size_bytes: 30, created_at: "", source: "r2" },
  ]
  const summary = summarizeFileLibrary(files)

  assert.equal(summary.totalFiles, 3)
  assert.equal(summary.totalBytes, 60)
  assert.equal(summary.mediaCount, 1)
  assert.equal(summary.documentCount, 2)
  assert.equal(summary.kindCounts.sheet, 1)
  assert.equal(fileKindLabel("slides"), "Slides")
})

test("file library filter matches kind labels and query text", () => {
  const files = [
    { id: "image", filename: "diagram.png", content_type: "image/png", size_bytes: 10, created_at: "", source: "r2" },
    { id: "pdf", filename: "reading.pdf", content_type: "application/pdf", size_bytes: 20, created_at: "", source: "r2" },
  ]

  assert.deepEqual(filterFileLibrary(files, { kind: "image" }).map((file) => file.id), ["image"])
  assert.deepEqual(filterFileLibrary(files, { query: "pdfs" }).map((file) => file.id), ["pdf"])
})

test("file library action plan guides upload selection and Studio conversion", () => {
  const files = [
    { id: "image", filename: "diagram.png", content_type: "image/png", size_bytes: 10, created_at: "2026-01-01T00:00:00.000Z", source: "r2" },
    { id: "pdf", filename: "reading.pdf", content_type: "application/pdf", size_bytes: 20, created_at: "2026-01-02T00:00:00.000Z", source: "r2" },
  ]
  const summary = summarizeFileLibrary(files)

  assert.equal(buildFileLibraryActionPlan([], summarizeFileLibrary([])).nextAction, "upload")
  assert.equal(buildFileLibraryActionPlan(files, summary, { visibleFileCount: 0, query: "missing" }).nextAction, "clear-filter")

  const selectPlan = buildFileLibraryActionPlan(files, summary)
  assert.equal(selectPlan.nextAction, "select")
  assert.equal(selectPlan.targetFileId, "pdf")

  const studioPlan = buildFileLibraryActionPlan(files, summary, { selectedId: "pdf" })
  assert.equal(studioPlan.nextAction, "open-studio")
  assert.deepEqual(studioPlan.chips, ["PDFs", "AI-ready", "study source"])
})

test("file library filter summary explains active file views", () => {
  const idle = buildFileLibraryFilterSummary({ filter: "all", total: 4, visible: 4 })
  const filtered = buildFileLibraryFilterSummary({ filter: "pdf", query: "lesson", total: 4, visible: 1 })

  assert.equal(idle.active, false)
  assert.equal(idle.label, "4/4 visible")
  assert.equal(filtered.active, true)
  assert.equal(filtered.label, 'Filtered: "lesson" + PDFs (1/4)')
})

test("file library empty state separates empty uploads from filtered misses", () => {
  const empty = buildFileLibraryEmptyState({ total: 0 })
  const filtered = buildFileLibraryEmptyState({ filter: "image", query: "diagram", total: 3 })

  assert.equal(empty.action, "upload")
  assert.equal(empty.title, "No files yet")
  assert.equal(filtered.action, "clear-filter")
  assert.match(filtered.body, /diagram/)
})

test("visible file selection ignores files hidden by filters", () => {
  const files = [
    { id: "image", filename: "diagram.png", content_type: "image/png", size_bytes: 10, created_at: "", source: "r2" },
    { id: "pdf", filename: "reading.pdf", content_type: "application/pdf", size_bytes: 20, created_at: "", source: "r2" },
  ]

  assert.equal(resolveVisibleFileSelection(files, "pdf")?.id, "pdf")
  assert.equal(resolveVisibleFileSelection([files[0]], "pdf")?.id, "image")
  assert.equal(resolveVisibleFileSelection([], "pdf"), undefined)
})

test("checkRateLimit blocks after the configured burst", async () => {
  const key = `test:${Date.now()}:${Math.random()}`
  assert.equal((await checkRateLimit({ key, limit: 2, windowMs: 60_000 })).allowed, true)
  assert.equal((await checkRateLimit({ key, limit: 2, windowMs: 60_000 })).allowed, true)
  assert.equal((await checkRateLimit({ key, limit: 2, windowMs: 60_000 })).allowed, false)
})
