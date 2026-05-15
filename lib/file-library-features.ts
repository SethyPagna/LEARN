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
