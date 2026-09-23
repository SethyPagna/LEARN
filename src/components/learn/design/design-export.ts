import type { CanvasElement } from "@/lib/studio/canvas-engine"
import { pageUnit, serializeDesign, type DesignDoc } from "@/lib/design/document"
import {
  designFileBase,
  exportFontSpecs,
  exportPageIndices,
  exportPixelScale,
  pageFileName,
  rasterCanBeJpeg,
  rasterPadding,
  rasterPixelScale,
  type DesignExportFormat,
  type ExportQuality,
} from "@/lib/design/export-plan"
import { pagePoints } from "@/lib/design/formats"
import { buildPptxPlan } from "@/lib/design/pptx"
import { contextMeasure, designImageSources, drawDesignElement, drawDesignPage, type RasterContext, type RasterImage, type RasterOptions } from "@/lib/design/raster"
import { buildImagePdf, type ImagePdfPage } from "@/lib/export/image-pdf"
import { createZip, type ZipEntry } from "@/lib/export/zip"

import { loadDesignFonts, resolvedFontFamily } from "./text-measure"

/**
 * Exports a design from the browser.
 *
 * PNG, JPG and PDF pages are drawn by the canvas renderer (lib/design/raster.ts),
 * which lays text out with the same rules as the editor, so the file matches
 * the screen. PowerPoint keeps text and simple shapes editable and places a
 * picture only for what PowerPoint cannot draw the same way (the plan in
 * lib/design/pptx.ts decides which). JSON is the design itself, for backup or
 * moving between accounts.
 *
 * Only same-origin and inline pictures are drawn: anything else would taint
 * the canvas (and the CSP blocks it on screen too, so screen and file agree).
 */

export interface DesignExportOptions {
  format: DesignExportFormat
  /** Page indices; default is every visible page (PowerPoint: every page, hidden ones as hidden slides). */
  pages?: readonly number[]
  quality?: ExportQuality
  /** Called before each page is drawn and once at the end. */
  onProgress?: (done: number, total: number) => void
  signal?: AbortSignal
}

export interface DesignExportResult {
  filename: string
  pages: number
}

const IMAGE_TIMEOUT_MS = 15_000
const SCRIPT_TIMEOUT_MS = 20_000
const PDF_JPEG_QUALITY = 0.88
const JPG_QUALITY = 0.92

// ---------------------------------------------------------------------------
// Pictures, fonts and canvases
// ---------------------------------------------------------------------------

function exportableSource(src: string): boolean {
  if (src.startsWith("data:image/")) return true
  try {
    return new URL(src, window.location.href).origin === window.location.origin
  } catch {
    return false
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer = 0
  const timeout = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => reject(new Error(message)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timer))
}

async function loadImage(src: string): Promise<RasterImage | null> {
  const image = new Image()
  image.decoding = "async"
  image.src = src
  try {
    await withTimeout(image.decode(), IMAGE_TIMEOUT_MS, "Picture took too long")
  } catch {
    // A picture that cannot be loaded draws as its empty frame, as on screen.
    return null
  }
  const width = image.naturalWidth
  const height = image.naturalHeight
  return width > 0 && height > 0 ? { source: image, width, height } : null
}

async function loadImages(sources: readonly string[]): Promise<Map<string, RasterImage>> {
  const images = new Map<string, RasterImage>()
  await Promise.all(
    sources.filter(exportableSource).map(async (src) => {
      const image = await loadImage(src)
      if (image) images.set(src, image)
    }),
  )
  return images
}

/** Load the faces and decode the pictures that pages `indices` of `doc` use. */
async function prepare(doc: DesignDoc, indices: readonly number[]): Promise<Map<string, RasterImage>> {
  await loadDesignFonts(exportFontSpecs(indices.map((index) => doc.pages[index]).filter(Boolean)))
  return loadImages(designImageSources(doc, indices))
}

function rasterOptions(scale: number, images: ReadonlyMap<string, RasterImage>): RasterOptions {
  return { scale, makePath: (d) => new Path2D(d), fontFamily: resolvedFontFamily, images }
}

function createCanvas(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("This browser could not start drawing the export.")
  return { canvas, ctx }
}

/** Give the pixels back straight away (a large canvas holds tens of megabytes until collected). */
function release(canvas: HTMLCanvasElement) {
  canvas.width = 0
  canvas.height = 0
}

function asRaster(ctx: CanvasRenderingContext2D): RasterContext {
  return ctx as unknown as RasterContext
}

function drawPageCanvas(doc: DesignDoc, index: number, scale: number, images: ReadonlyMap<string, RasterImage>, opaque: boolean): HTMLCanvasElement {
  const { canvas, ctx } = createCanvas(doc.width * scale, doc.height * scale)
  if (opaque) {
    // JPEG has no transparency: a see-through background must not turn black.
    ctx.fillStyle = "#FFFFFF"
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  // The canvas is whole pixels; stretch by the rounding so no sliver is left at the edges.
  ctx.scale(canvas.width / (doc.width * scale), canvas.height / (doc.height * scale))
  drawDesignPage(asRaster(ctx), doc, index, rasterOptions(scale, images))
  return canvas
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The browser could not encode the picture (the page may be too large)."))), type, quality)
  })
}

async function canvasBytes(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Uint8Array> {
  const blob = await canvasBlob(canvas, type, quality)
  return new Uint8Array(await blob.arrayBuffer())
}

function blobDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the picture."))
    reader.readAsDataURL(blob)
  })
}

/** Let the page repaint (progress, spinner) between heavy pages. */
function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0))
}

function checkAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("The export was cancelled.", "AbortError")
}

// ---------------------------------------------------------------------------
// Downloads
// ---------------------------------------------------------------------------

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  anchor.rel = "noopener"
  anchor.style.display = "none"
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // Revoking at once can cancel the download in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

function downloadBytes(filename: string, bytes: Uint8Array, type: string) {
  downloadBlob(filename, new Blob([new Uint8Array(bytes)], { type }))
}

// ---------------------------------------------------------------------------
// PowerPoint (pptxgenjs is vendored and loaded on first use)
// ---------------------------------------------------------------------------

type PptxGenConstructor = typeof import("pptxgenjs").default
type PptxSlide = ReturnType<InstanceType<PptxGenConstructor>["addSlide"]>
type SlideTextOptions = Parameters<PptxSlide["addText"]>[1]
type SlideShapeName = Parameters<PptxSlide["addShape"]>[0]
type SlideShapeOptions = Parameters<PptxSlide["addShape"]>[1]

let pptxLoading: Promise<PptxGenConstructor> | null = null

function pptxGlobal(): PptxGenConstructor | undefined {
  return (window as unknown as { PptxGenJS?: PptxGenConstructor }).PptxGenJS
}

function loadPptxGen(): Promise<PptxGenConstructor> {
  const ready = pptxGlobal()
  if (ready) return Promise.resolve(ready)
  if (pptxLoading) return pptxLoading
  const loading = new Promise<void>((resolve, reject) => {
    const fail = () => reject(new Error("Unable to load the PowerPoint exporter."))
    const existing = document.querySelector<HTMLScriptElement>('script[data-learn-pptxgen="true"]')
    if (existing && existing.dataset.learnPptxgenFailed !== "true") {
      existing.addEventListener("load", () => resolve(), { once: true })
      existing.addEventListener("error", fail, { once: true })
      return
    }
    existing?.remove()
    const script = document.createElement("script")
    script.src = "/vendor/pptxgen.min.js"
    script.async = true
    script.dataset.learnPptxgen = "true"
    script.onload = () => resolve()
    script.onerror = () => {
      script.dataset.learnPptxgenFailed = "true"
      fail()
    }
    document.head.appendChild(script)
  })
  pptxLoading = withTimeout(loading, SCRIPT_TIMEOUT_MS, "The PowerPoint exporter took too long to load.")
    .then(() => {
      const loaded = pptxGlobal()
      if (!loaded) throw new Error("The PowerPoint exporter did not start.")
      return loaded
    })
    .catch((error: unknown) => {
      pptxLoading = null
      throw error
    })
  return pptxLoading
}

/** One element drawn on its own, unrotated (PowerPoint applies the rotation), with room for its shadow. */
async function elementPicture(element: CanvasElement, transparent: boolean, unit: number, images: ReadonlyMap<string, RasterImage>): Promise<{ data: string; padding: number }> {
  const padding = rasterPadding(element, unit)
  const width = element.width + padding * 2
  const height = element.height + padding * 2
  const scale = rasterPixelScale(width, height)
  const { canvas, ctx } = createCanvas(width * scale, height * scale)
  try {
    ctx.scale(canvas.width / width, canvas.height / height)
    ctx.translate(padding, padding)
    const raster = asRaster(ctx)
    drawDesignElement(raster, { ...element, x: 0, y: 0, rotation: 0 }, rasterOptions(scale, images), contextMeasure(raster, resolvedFontFamily), unit)
    const jpeg = rasterCanBeJpeg(element, transparent, padding)
    const blob = await canvasBlob(canvas, jpeg ? "image/jpeg" : "image/png", jpeg ? JPG_QUALITY : undefined)
    return { data: await blobDataUrl(blob), padding }
  } finally {
    release(canvas)
  }
}

/** A patterned background as one picture (PowerPoint has no matching fills). */
async function backgroundPicture(doc: DesignDoc, index: number): Promise<string> {
  const page = doc.pages[index]
  const bare: DesignDoc = { ...doc, pages: [{ ...page, elements: [] }] }
  const canvas = drawPageCanvas(bare, 0, exportPixelScale(doc.width, doc.height), new Map(), false)
  try {
    return await blobDataUrl(await canvasBlob(canvas, "image/png"))
  } finally {
    release(canvas)
  }
}

async function exportPptx(doc: DesignDoc, requested: readonly number[] | undefined, base: string, options: DesignExportOptions): Promise<DesignExportResult> {
  const PptxGen = await loadPptxGen()
  const indices = requested?.length ? exportPageIndices(doc, requested) : doc.pages.map((_, index) => index)
  const subset: DesignDoc = { ...doc, pages: indices.map((index) => doc.pages[index]) }
  const all = subset.pages.map((_, index) => index)
  const images = await prepare(subset, all)
  // Measured with the loaded faces, so each text box keeps the size it has on screen.
  const scratch = createCanvas(1, 1)
  const plan = buildPptxPlan(subset, { measure: contextMeasure(asRaster(scratch.ctx), resolvedFontFamily), includeHidden: true })
  release(scratch.canvas)

  const pptx = new PptxGen()
  pptx.defineLayout(plan.layout)
  pptx.layout = plan.layout.name
  pptx.title = plan.title
  pptx.author = "LEARN"
  const inch = plan.layout.width / doc.width
  const unit = pageUnit(doc)

  for (const [position, slidePlan] of plan.slides.entries()) {
    checkAborted(options.signal)
    options.onProgress?.(position, plan.slides.length)
    const page = subset.pages.find((candidate) => candidate.id === slidePlan.pageId) ?? subset.pages[position]
    const slide = pptx.addSlide()
    slide.background = { color: slidePlan.background }
    if (slidePlan.hidden) slide.hidden = true
    if (slidePlan.backgroundRaster) {
      const data = await backgroundPicture(subset, subset.pages.indexOf(page))
      slide.addImage({ data, x: 0, y: 0, w: plan.layout.width, h: plan.layout.height })
    }
    for (const op of slidePlan.ops) {
      if (op.kind === "text") {
        slide.addText(op.text, op.options as unknown as SlideTextOptions)
      } else if (op.kind === "shape") {
        slide.addShape(op.shape as SlideShapeName, op.options as unknown as SlideShapeOptions)
      } else {
        const element = page.elements.find((candidate) => candidate.id === op.id)
        if (!element) continue
        const picture = await elementPicture(element, op.transparent, unit, images)
        const pad = picture.padding * inch
        slide.addImage({
          data: picture.data,
          x: op.box.x - pad,
          y: op.box.y - pad,
          w: op.box.w + pad * 2,
          h: op.box.h + pad * 2,
          ...(op.box.rotate ? { rotate: op.box.rotate } : {}),
        })
      }
    }
    if (slidePlan.notes.trim()) slide.addNotes(slidePlan.notes)
    await yieldToBrowser()
  }
  checkAborted(options.signal)
  options.onProgress?.(plan.slides.length, plan.slides.length)
  const filename = `${base}.pptx`
  await pptx.writeFile({ fileName: filename })
  return { filename, pages: plan.slides.length }
}

// ---------------------------------------------------------------------------
// Pictures and PDF
// ---------------------------------------------------------------------------

async function exportPictures(doc: DesignDoc, indices: readonly number[], base: string, options: DesignExportOptions): Promise<DesignExportResult> {
  const jpeg = options.format === "jpg"
  const type = jpeg ? "image/jpeg" : "image/png"
  const extension = jpeg ? "jpg" : "png"
  const scale = exportPixelScale(doc.width, doc.height, options.quality)
  const images = await prepare(doc, indices)
  const files: Array<ZipEntry & { data: Uint8Array }> = []
  for (const [position, index] of indices.entries()) {
    checkAborted(options.signal)
    options.onProgress?.(position, indices.length)
    const canvas = drawPageCanvas(doc, index, scale, images, jpeg)
    try {
      files.push({ name: pageFileName(base, index, doc.pages.length, extension), data: await canvasBytes(canvas, type, jpeg ? JPG_QUALITY : undefined) })
    } finally {
      release(canvas)
    }
    await yieldToBrowser()
  }
  checkAborted(options.signal)
  options.onProgress?.(indices.length, indices.length)
  if (files.length === 1) {
    const filename = doc.pages.length === 1 ? `${base}.${extension}` : files[0].name
    downloadBytes(filename, files[0].data, type)
    return { filename, pages: 1 }
  }
  const filename = `${base}-${extension}.zip`
  downloadBytes(filename, createZip(files), "application/zip")
  return { filename, pages: files.length }
}

async function exportPdf(doc: DesignDoc, indices: readonly number[], base: string, options: DesignExportOptions): Promise<DesignExportResult> {
  const scale = exportPixelScale(doc.width, doc.height, options.quality)
  const points = pagePoints(doc.width, doc.height)
  const images = await prepare(doc, indices)
  const pages: ImagePdfPage[] = []
  for (const [position, index] of indices.entries()) {
    checkAborted(options.signal)
    options.onProgress?.(position, indices.length)
    const canvas = drawPageCanvas(doc, index, scale, images, true)
    try {
      pages.push({ jpeg: await canvasBytes(canvas, "image/jpeg", PDF_JPEG_QUALITY), width: points.width, height: points.height })
    } finally {
      release(canvas)
    }
    await yieldToBrowser()
  }
  checkAborted(options.signal)
  options.onProgress?.(indices.length, indices.length)
  const filename = `${base}.pdf`
  downloadBytes(filename, buildImagePdf({ title: doc.name, pages }), "application/pdf")
  return { filename, pages: pages.length }
}

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

/** Export and download a design. Rejects with an `AbortError` when `signal` fires. */
export async function exportDesign(doc: DesignDoc, options: DesignExportOptions): Promise<DesignExportResult> {
  const base = designFileBase(doc.name)
  if (options.format === "json") {
    const filename = `${base}.learn-design.json`
    downloadBlob(filename, new Blob([serializeDesign(doc)], { type: "application/json" }))
    return { filename, pages: doc.pages.length }
  }
  if (options.format === "pptx") return exportPptx(doc, options.pages, base, options)
  const indices = exportPageIndices(doc, options.pages)
  if (options.format === "pdf") return exportPdf(doc, indices, base, options)
  return exportPictures(doc, indices, base, options)
}

export interface PagePictureOptions {
  type?: "image/png" | "image/jpeg"
  /** Longest edge in pixels (default 1600). */
  maxEdge?: number
}

/** One page as a picture file, for sharing into a chat or saving to the vault. */
export async function designPagePicture(doc: DesignDoc, index: number, options: PagePictureOptions = {}): Promise<Blob> {
  const type = options.type ?? "image/png"
  const safeIndex = Math.max(0, Math.min(doc.pages.length - 1, index))
  const scale = Math.max(0.05, Math.min(2, (options.maxEdge ?? 1600) / Math.max(1, doc.width, doc.height)))
  const images = await prepare(doc, [safeIndex])
  const canvas = drawPageCanvas(doc, safeIndex, scale, images, type === "image/jpeg")
  try {
    return await canvasBlob(canvas, type, type === "image/jpeg" ? JPG_QUALITY : undefined)
  } finally {
    release(canvas)
  }
}
