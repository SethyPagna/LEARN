import { classifyUploadContentType } from "./file-security"

export interface FileLibraryRecord {
  id: string
  filename: string
  content_type: string
  size_bytes: number
  created_at: string
  source: string
}

export type FileLibraryKind = ReturnType<typeof classifyUploadContentType>
export type FileLibraryFilter = "all" | FileLibraryKind

export interface FileLibrarySummary {
  totalFiles: number
  totalBytes: number
  mediaCount: number
  documentCount: number
  kindCounts: Record<FileLibraryKind, number>
}

export type FileLibraryNextAction = "upload" | "select" | "preview" | "open-studio" | "download" | "clear-filter"

export interface FileLibraryActionPlan {
  headline: string
  detail: string
  nextAction: FileLibraryNextAction
  targetFileId?: string
  chips: string[]
}

export interface FileLibraryFilterSummary {
  active: boolean
  label: string
}

export interface FileLibraryActionInput {
  selectedId?: string
  query?: string
  filter?: FileLibraryFilter
  visibleFileCount?: number
}

const FILE_KIND_LABELS: Record<FileLibraryKind, string> = {
  audio: "Audio",
  doc: "Docs",
  file: "Files",
  image: "Images",
  pdf: "PDFs",
  sheet: "Sheets",
  slides: "Slides",
  video: "Videos",
}

export function fileKindLabel(kind: FileLibraryFilter) {
  if (kind === "all") return "All"
  return FILE_KIND_LABELS[kind] ?? "Files"
}

export function summarizeFileLibrary(files: readonly FileLibraryRecord[]): FileLibrarySummary {
  const kindCounts = createEmptyKindCounts()
  let totalBytes = 0
  let mediaCount = 0
  let documentCount = 0

  for (const file of files) {
    totalBytes += Number(file.size_bytes || 0)
    const kind = classifyUploadContentType(file.content_type)
    kindCounts[kind] += 1
    if (kind === "image" || kind === "video" || kind === "audio") mediaCount += 1
    if (kind === "pdf" || kind === "doc" || kind === "sheet" || kind === "slides") documentCount += 1
  }

  return {
    totalFiles: files.length,
    totalBytes,
    mediaCount,
    documentCount,
    kindCounts,
  }
}

export function filterFileLibrary(
  files: readonly FileLibraryRecord[],
  input: { query?: string; kind?: FileLibraryFilter },
) {
  const needle = (input.query || "").trim().toLowerCase()
  const kindFilter = input.kind || "all"

  return files.filter((file) => {
    const kind = classifyUploadContentType(file.content_type)
    const matchesKind = kindFilter === "all" || kind === kindFilter
    if (!matchesKind) return false
    if (!needle) return true

    return `${file.filename} ${file.content_type} ${file.source} ${kind} ${fileKindLabel(kind)}`
      .toLowerCase()
      .includes(needle)
  })
}

export function buildFileLibraryActionPlan(
  files: readonly FileLibraryRecord[],
  summary: FileLibrarySummary,
  input: FileLibraryActionInput = {},
): FileLibraryActionPlan {
  const selectedFile = files.find((file) => file.id === input.selectedId)
  const hasActiveFilter = Boolean((input.query || "").trim()) || Boolean(input.filter && input.filter !== "all")
  const visibleFileCount = input.visibleFileCount ?? files.length

  if (summary.totalFiles === 0) {
    return {
      headline: "Upload a learning source",
      detail: "Add a PDF, image, video, doc, sheet, or slide deck before connecting it to Studio or AI.",
      nextAction: "upload",
      chips: ["empty library", "R2 storage", "validated uploads"],
    }
  }

  if (hasActiveFilter && visibleFileCount === 0) {
    return {
      headline: "Clear the current filter",
      detail: "No files match this view, so reset filters before uploading duplicates.",
      nextAction: "clear-filter",
      chips: [`${summary.totalFiles} total`, "no matches", "reset view"],
    }
  }

  if (!selectedFile) {
    const recentFile = findMostRecentFile(files)
    return {
      headline: recentFile ? `Select ${recentFile.filename}` : "Select a file",
      detail: "Choose one resource to preview, copy, download, or send into the learning workflow.",
      nextAction: "select",
      targetFileId: recentFile?.id,
      chips: [`${summary.mediaCount} media`, `${summary.documentCount} docs`, `${summary.totalFiles} total`],
    }
  }

  const selectedKind = classifyUploadContentType(selectedFile.content_type)
  if (selectedKind === "pdf" || selectedKind === "doc" || selectedKind === "sheet" || selectedKind === "slides") {
    return {
      headline: "Convert into Studio",
      detail: "Use this document as source material for notes, cleanup, practice, or AI-guided study.",
      nextAction: "open-studio",
      targetFileId: selectedFile.id,
      chips: [fileKindLabel(selectedKind), "AI-ready", "study source"],
    }
  }

  if (selectedKind === "image" || selectedKind === "video" || selectedKind === "audio") {
    return {
      headline: "Preview and attach media",
      detail: "Check the media before using it in notes, slides, explanations, or generated lessons.",
      nextAction: "preview",
      targetFileId: selectedFile.id,
      chips: [fileKindLabel(selectedKind), "media", "preview"],
    }
  }

  return {
    headline: "Download or copy source",
    detail: "Keep this file available for manual review or attach it to the next Studio item.",
    nextAction: "download",
    targetFileId: selectedFile.id,
    chips: [fileKindLabel(selectedKind), "stored", "download"],
  }
}

export function buildFileLibraryFilterSummary(input: {
  filter?: FileLibraryFilter
  query?: string
  total: number
  visible: number
}): FileLibraryFilterSummary {
  const query = input.query?.trim() || ""
  const filter = input.filter || "all"
  const active = Boolean(query) || filter !== "all"

  if (!active) {
    return { active: false, label: `${input.visible}/${input.total} visible` }
  }

  const parts = [
    query ? `"${query}"` : "",
    filter !== "all" ? fileKindLabel(filter) : "",
  ].filter(Boolean)

  return {
    active: true,
    label: `Filtered: ${parts.join(" + ")} (${input.visible}/${input.total})`,
  }
}

function createEmptyKindCounts(): Record<FileLibraryKind, number> {
  return {
    audio: 0,
    doc: 0,
    file: 0,
    image: 0,
    pdf: 0,
    sheet: 0,
    slides: 0,
    video: 0,
  }
}

function findMostRecentFile(files: readonly FileLibraryRecord[]) {
  let recentFile: FileLibraryRecord | undefined
  let recentTime = Number.NEGATIVE_INFINITY

  for (const file of files) {
    const time = Date.parse(file.created_at)
    const comparableTime = Number.isFinite(time) ? time : 0
    if (comparableTime > recentTime) {
      recentFile = file
      recentTime = comparableTime
    }
  }

  return recentFile
}
