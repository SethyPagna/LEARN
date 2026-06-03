export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024
export const UPLOAD_HELP_TEXT = "Images, video, audio, PDFs, Office files, CSV, Markdown, and plain text. Max 100 MB."

const BLOCKED_EXTENSIONS = new Set([
  "apk",
  "app",
  "bat",
  "bin",
  "cmd",
  "com",
  "dll",
  "dmg",
  "exe",
  "html",
  "hta",
  "iso",
  "jar",
  "js",
  "msi",
  "ps1",
  "scr",
  "sh",
  "vbs",
  "wsf",
  "zip",
])

const ALLOWED_EXACT_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/csv",
  "text/markdown",
  "text/plain",
])

function extensionFor(filename: string) {
  const match = filename.toLowerCase().match(/\.([a-z0-9]+)$/)
  return match?.[1] || ""
}

function hasExecutableSignature(bytes: Uint8Array) {
  const first4 = Array.from(bytes.slice(0, 4))
  const first2 = String.fromCharCode(...bytes.slice(0, 2))
  return (
    first2 === "MZ"
    || (first4[0] === 0x7f && first4[1] === 0x45 && first4[2] === 0x4c && first4[3] === 0x46)
    || (first4[0] === 0xca && first4[1] === 0xfe && first4[2] === 0xba && first4[3] === 0xbe)
    || (first4[0] === 0xcf && first4[1] === 0xfa && first4[2] === 0xed && first4[3] === 0xfe)
    || (first4[0] === 0xfe && first4[1] === 0xed && first4[2] === 0xfa && first4[3] === 0xcf)
  )
}

function isAllowedContentType(contentType: string) {
  const normalized = contentType.split(";")[0].toLowerCase()
  return (
    normalized.startsWith("image/")
    || normalized.startsWith("video/")
    || normalized.startsWith("audio/")
    || ALLOWED_EXACT_TYPES.has(normalized)
  )
}

export function classifyUploadContentType(contentType: string) {
  const normalized = contentType.split(";")[0].toLowerCase()
  if (normalized.startsWith("image/")) return "image"
  if (normalized.startsWith("video/")) return "video"
  if (normalized.startsWith("audio/")) return "audio"
  if (normalized === "application/pdf") return "pdf"
  if (normalized.includes("presentation")) return "slides"
  if (normalized.includes("spreadsheet") || normalized === "text/csv") return "sheet"
  if (normalized.includes("wordprocessing") || normalized === "text/markdown" || normalized === "text/plain") return "doc"
  return "file"
}

export function validateUploadFileShape(file: Pick<File, "name" | "size" | "type">) {
  const extension = extensionFor(file.name)
  const contentType = (file.type || "").toLowerCase()

  if (file.size <= 0) return "Upload a non-empty file."
  if (file.size > MAX_UPLOAD_BYTES) return "File is too large. Keep uploads under 100 MB."
  if (BLOCKED_EXTENSIONS.has(extension)) return "This file type is blocked for safety."
  if (!isAllowedContentType(contentType)) return "Upload images, videos, audio, PDFs, documents, spreadsheets, slides, CSV, Markdown, or plain text."
  return null
}

export function validateUploadFile(file: File, body: ArrayBuffer) {
  const shapeError = validateUploadFileShape(file)
  if (shapeError) return shapeError

  const bytes = new Uint8Array(body.slice(0, 16))
  if (hasExecutableSignature(bytes)) return "Executable files are blocked for safety."

  return null
}
