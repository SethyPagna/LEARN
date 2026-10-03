/**
 * `image-pdf` — a PDF with one full-page picture per page, with no dependency.
 *
 * The design editor draws each page to a canvas, encodes it as JPEG and hands
 * the bytes here. JPEG is a format PDF embeds as-is (`/Filter /DCTDecode`), so
 * nothing is decoded or re-compressed: the file is the pictures plus a few
 * hundred bytes of structure.
 *
 *     %PDF-1.4 + binary marker
 *     1 0 obj   catalogue          -> page tree
 *     2 0 obj   page tree          /Kids, /Count
 *     3 0 obj   document info      /Title, /Producer, /CreationDate
 *     then per page: page object, content stream, image XObject
 *     xref / trailer / startxref / %%EOF
 *
 * Like `./pdf`, output is deterministic (no clock unless `createdAt` is given,
 * no randomness) and the module has no imports.
 */

export interface ImagePdfPage {
  /** A JPEG file (baseline or progressive). */
  jpeg: Uint8Array
  /** Page size in PDF points (1/72 in). */
  width: number
  height: number
}

export interface BuildImagePdfInput {
  title?: string
  pages: readonly ImagePdfPage[]
  /** `/CreationDate`; omit for reproducible bytes. */
  createdAt?: Date
}

export interface JpegInfo {
  width: number
  height: number
  /** 1 = grey, 3 = colour (YCbCr/RGB), 4 = CMYK. */
  components: number
}

const FIXED_DATE = new Date(Date.UTC(1980, 0, 1))

/** Size and colour components from a JPEG's start-of-frame marker, or null for a non-JPEG. */
export function readJpegInfo(bytes: Uint8Array): JpegInfo | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  let offset = 2
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null
    const marker = bytes[offset + 1]
    // Fill bytes and markers without a length.
    if (marker === 0xff) {
      offset += 1
      continue
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2
      continue
    }
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3]
    if (length < 2) return null
    // SOF0..SOF15 except DHT (C4), JPG (C8) and DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (offset + 9 >= bytes.length) return null
      const height = (bytes[offset + 5] << 8) | bytes[offset + 6]
      const width = (bytes[offset + 7] << 8) | bytes[offset + 8]
      const components = bytes[offset + 9]
      if (!width || !height || ![1, 3, 4].includes(components)) return null
      return { width, height, components }
    }
    if (marker === 0xda) return null
    offset += 2 + length
  }
  return null
}

function pdfDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0")
  return `D:${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
}

/** A PDF text string: literal for plain ASCII, UTF-16BE with a byte-order mark otherwise. */
export function pdfTextString(text: string): string {
  if (/^[\x20-\x7e]*$/.test(text)) return `(${text.replace(/[\\()]/g, (character) => `\\${character}`)})`
  let hex = "FEFF"
  for (let index = 0; index < text.length; index += 1) hex += text.charCodeAt(index).toString(16).toUpperCase().padStart(4, "0")
  return `<${hex}>`
}

function ascii(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length)
  for (let index = 0; index < text.length; index += 1) bytes[index] = text.charCodeAt(index) & 0xff
  return bytes
}

function num(value: number): string {
  const rounded = Math.round(value * 1000) / 1000
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(3).replace(/0+$/, "")
}

/** One PDF with a full-bleed JPEG per page. Throws when a page is not a JPEG. */
export function buildImagePdf(input: BuildImagePdfInput): Uint8Array {
  if (!input.pages.length) throw new Error("A PDF needs at least one page.")
  const objects: Array<Uint8Array[]> = []
  const pageIds: number[] = []
  const firstPageObject = 4
  input.pages.forEach((page, index) => {
    const info = readJpegInfo(page.jpeg)
    if (!info) throw new Error(`Page ${index + 1} is not a JPEG image.`)
    const pageId = firstPageObject + index * 3
    const contentId = pageId + 1
    const imageId = pageId + 2
    const width = Math.max(1, page.width)
    const height = Math.max(1, page.height)
    pageIds.push(pageId)
    objects[pageId] = [
      ascii(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(width)} ${num(height)}] /Resources << /XObject << /Im${index + 1} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`),
    ]
    const content = `q\n${num(width)} 0 0 ${num(height)} 0 0 cm\n/Im${index + 1} Do\nQ\n`
    objects[contentId] = [ascii(`<< /Length ${content.length} >>\nstream\n${content}endstream`)]
    const colorSpace = info.components === 1 ? "/DeviceGray" : info.components === 4 ? "/DeviceCMYK" : "/DeviceRGB"
    // Adobe writes CMYK JPEGs inverted; the decode array flips them back.
    const decode = info.components === 4 ? " /Decode [1 0 1 0 1 0 1 0]" : ""
    objects[imageId] = [
      ascii(`<< /Type /XObject /Subtype /Image /Width ${info.width} /Height ${info.height} /ColorSpace ${colorSpace} /BitsPerComponent 8${decode} /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`),
      page.jpeg,
      ascii("\nendstream"),
    ]
  })
  objects[1] = [ascii("<< /Type /Catalog /Pages 2 0 R >>")]
  objects[2] = [ascii(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`)]
  const title = (input.title ?? "").trim().slice(0, 200)
  objects[3] = [ascii(`<< ${title ? `/Title ${pdfTextString(title)} ` : ""}/Producer (LEARN) /CreationDate (${pdfDate(input.createdAt ?? FIXED_DATE)}) >>`)]

  const chunks: Uint8Array[] = []
  let length = 0
  const push = (bytes: Uint8Array) => {
    chunks.push(bytes)
    length += bytes.length
  }
  push(ascii("%PDF-1.4\n"))
  // A comment with high bytes marks the file as binary for transfer tools.
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]))
  const offsets: number[] = []
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = length
    push(ascii(`${id} 0 obj\n`))
    for (const part of objects[id]) push(part)
    push(ascii("\nendobj\n"))
  }
  const xrefOffset = length
  const entries = ["0000000000 65535 f "]
  for (let id = 1; id < objects.length; id += 1) entries.push(`${String(offsets[id]).padStart(10, "0")} 00000 n `)
  push(ascii(`xref\n0 ${objects.length}\n${entries.join("\n")}\n`))
  push(ascii(`trailer\n<< /Size ${objects.length} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`))

  const out = new Uint8Array(length)
  let at = 0
  for (const chunk of chunks) {
    out.set(chunk, at)
    at += chunk.length
  }
  return out
}
