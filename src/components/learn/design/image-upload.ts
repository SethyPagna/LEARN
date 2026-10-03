"use client"

import { api } from "../api"
import type { UploadedPicture } from "./editor-types"

/**
 * Getting a picture from the person's device onto a page.
 *
 * Phone photos are routinely 4000px and 5 MB; a page never shows more than
 * ~2000px of one, so pictures are scaled down to `PICTURE_MAX_EDGE` before the
 * upload (JPEG when the picture has no transparency, PNG when it has). That
 * keeps uploads fast on a school connection, keeps exports light, and stays
 * well inside the upload limit. GIFs (they may move) and SVGs (they are
 * already small and sharp at any size) are sent as they are.
 *
 * The stored picture is addressed as `/api/files/<id>/download`: same-origin,
 * so the page's image policy (`img-src 'self'`) allows it, and it is only
 * readable by its owner (a share link serves it through its own route).
 */

export const PICTURE_MAX_EDGE = 2400
/** Larger originals are refused before any decoding work. */
export const PICTURE_MAX_INPUT_BYTES = 25 * 1024 * 1024
/** GIFs and SVGs are uploaded untouched, so they get a tighter cap. */
const PICTURE_MAX_PASSTHROUGH_BYTES = 8 * 1024 * 1024
/** Below this size and edge an original is kept as it is (re-encoding would only lose quality). */
const KEEP_ORIGINAL_BYTES = 1.2 * 1024 * 1024
const JPEG_QUALITY = 0.88

const PICTURE_TYPE = /^image\/(png|jpe?g|pjpeg|webp|gif|svg\+xml|avif|bmp)$/i
const PICTURE_EXTENSION = /\.(png|jpe?g|webp|gif|svg|avif|bmp)$/i

export function isPictureFile(file: Pick<File, "name" | "type">): boolean {
  return PICTURE_TYPE.test(file.type) || (!file.type && PICTURE_EXTENSION.test(file.name))
}

/** The picture files carried by a drop or paste, in order. */
export function pictureFilesFrom(transfer: DataTransfer | null | undefined): File[] {
  if (!transfer) return []
  const files: File[] = []
  if (transfer.files?.length) {
    for (const file of Array.from(transfer.files)) if (isPictureFile(file)) files.push(file)
    return files
  }
  for (const item of Array.from(transfer.items ?? [])) {
    if (item.kind !== "file") continue
    const file = item.getAsFile()
    if (file && isPictureFile(file)) files.push(file)
  }
  return files
}

/** Whether a drag carries files at all (the payload itself is unreadable until the drop). */
export function dragHasFiles(transfer: DataTransfer | null | undefined): boolean {
  return Boolean(transfer && Array.from(transfer.types ?? []).includes("Files"))
}

/** A picture's own size in pixels, or null when it cannot be loaded. */
export function naturalSize(src: string, timeoutMs = 15000): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    if (typeof Image === "undefined") {
      resolve(null)
      return
    }
    const image = new Image()
    let settled = false
    const finish = (value: { width: number; height: number } | null) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      resolve(value)
    }
    const timer = window.setTimeout(() => finish(null), timeoutMs)
    image.onload = () => finish(image.naturalWidth > 0 && image.naturalHeight > 0 ? { width: image.naturalWidth, height: image.naturalHeight } : null)
    image.onerror = () => finish(null)
    image.decoding = "async"
    image.src = src
  })
}

interface DecodedPicture {
  source: CanvasImageSource
  width: number
  height: number
  close: () => void
}

async function decodePicture(file: File): Promise<DecodedPicture | null> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" })
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() }
    } catch {
      // Fall through to an <img> (older Safari cannot decode every type as a bitmap).
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.decoding = "async"
    image.src = url
    await image.decode()
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL(url) }
  } catch {
    URL.revokeObjectURL(url)
    return null
  }
}

/** Whether any pixel of a small sample is see-through. */
function hasTransparency(source: CanvasImageSource, width: number, height: number): boolean {
  const sampleWidth = Math.max(1, Math.min(64, width))
  const sampleHeight = Math.max(1, Math.min(64, height))
  const canvas = document.createElement("canvas")
  canvas.width = sampleWidth
  canvas.height = sampleHeight
  const context = canvas.getContext("2d", { willReadFrequently: true })
  if (!context) return true
  context.drawImage(source, 0, 0, sampleWidth, sampleHeight)
  const data = context.getImageData(0, 0, sampleWidth, sampleHeight).data
  for (let index = 3; index < data.length; index += 4) if (data[index] < 250) return true
  return false
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

function renamed(name: string, extension: string): string {
  const base = name.replace(/\.[a-z0-9]+$/i, "").trim() || "picture"
  return `${base.slice(0, 80)}.${extension}`
}

export interface PreparedPicture {
  file: File
  width: number | null
  height: number | null
}

/**
 * The file to upload for a picture: scaled to fit `PICTURE_MAX_EDGE`, as JPEG
 * or PNG. Throws an Error with a message fit to show when the file is not a
 * usable picture.
 */
export async function preparePicture(file: File): Promise<PreparedPicture> {
  if (!isPictureFile(file)) throw new Error(`${file.name || "That file"} is not a picture.`)
  if (file.size > PICTURE_MAX_INPUT_BYTES) throw new Error(`${file.name} is too large (keep pictures under 25 MB).`)
  const type = file.type.toLowerCase()

  if (type === "image/gif" || type === "image/svg+xml" || /\.svg$/i.test(file.name)) {
    if (file.size > PICTURE_MAX_PASSTHROUGH_BYTES) throw new Error(`${file.name} is too large (keep GIFs and SVGs under 8 MB).`)
    const url = URL.createObjectURL(file)
    const size = await naturalSize(url, 8000)
    URL.revokeObjectURL(url)
    return { file, width: size?.width ?? null, height: size?.height ?? null }
  }

  const decoded = await decodePicture(file)
  if (!decoded || !decoded.width || !decoded.height) throw new Error(`${file.name || "That picture"} could not be read. Try a PNG or JPEG.`)
  try {
    const scale = Math.min(1, PICTURE_MAX_EDGE / Math.max(decoded.width, decoded.height))
    const width = Math.max(1, Math.round(decoded.width * scale))
    const height = Math.max(1, Math.round(decoded.height * scale))
    const keepable = type === "image/png" || type === "image/jpeg" || type === "image/jpg" || type === "image/pjpeg"
    if (scale === 1 && keepable && file.size <= KEEP_ORIGINAL_BYTES) return { file, width, height }

    const transparent = hasTransparency(decoded.source, decoded.width, decoded.height)
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext("2d")
    if (!context) return { file, width: decoded.width, height: decoded.height }
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = "high"
    context.drawImage(decoded.source, 0, 0, width, height)
    const outType = transparent ? "image/png" : "image/jpeg"
    const blob = await canvasBlob(canvas, outType, transparent ? undefined : JPEG_QUALITY)
    if (!blob) return { file, width: decoded.width, height: decoded.height }
    // A small PNG can grow when re-encoded; keep whichever is lighter when nothing was scaled.
    if (scale === 1 && keepable && blob.size >= file.size) return { file, width, height }
    const out = new File([blob], renamed(file.name, transparent ? "png" : "jpg"), { type: outType, lastModified: Date.now() })
    return { file: out, width, height }
  } finally {
    decoded.close()
  }
}

interface StoredFile {
  id: string
  filename: string
}

/** Prepare and upload one picture; the result is ready to place on a page. */
export async function uploadPicture(file: File, options: { signal?: AbortSignal } = {}): Promise<UploadedPicture> {
  const prepared = await preparePicture(file)
  const form = new FormData()
  form.append("file", prepared.file)
  form.append("source", "design")
  const { file: stored } = await api<{ file: StoredFile }>("/api/files", { method: "POST", body: form, signal: options.signal })
  if (!stored?.id) throw new Error("The upload did not return a file.")
  return {
    id: stored.id,
    src: `/api/files/${encodeURIComponent(stored.id)}/download`,
    name: stored.filename || prepared.file.name,
    width: prepared.width,
    height: prepared.height,
  }
}

interface ListedFile {
  id: string
  filename: string
  content_type: string
  source?: string
  created_at?: string
}

/** Pictures already in the person's files (newest first), for the Uploads panel. */
export async function listPictures(): Promise<UploadedPicture[]> {
  const { files } = await api<{ files: ListedFile[] }>("/api/files")
  return (files ?? [])
    .filter((file) => typeof file.content_type === "string" && file.content_type.startsWith("image/"))
    .map((file) => ({ id: file.id, src: `/api/files/${encodeURIComponent(file.id)}/download`, name: file.filename, width: null, height: null }))
}
