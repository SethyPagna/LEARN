/**
 * `zip` — a minimal, dependency-free ZIP writer *and* reader.
 *
 * A DOCX or XLSX file is a ZIP container of XML parts, so exporting those
 * formats needs a writer and importing them needs a reader. The product
 * constraint is that the app ships no new dependencies (the PPTX path uses a
 * vendored browser bundle for the same reason), and `zlib` inside this bundle
 * would drag a Node built-in into browser code — so the writer emits **STORE
 * (0)** entries only: every byte of every part is copied verbatim, with a
 * correct CRC-32 so unzippers still validate the archive. A `.docx` has no
 * requirement that its parts be deflated.
 *
 * What the file contains, in order:
 *
 *     [local file header + data] * n    one per entry, offsets recorded
 *     [central directory header] * n    name, size, crc, local offset
 *     [end of central directory]        entry count, central size + offset
 *
 * `readZip` walks those same three structures. It accepts both methods a real
 * Word or Excel file can use: **STORE (0)** and **DEFLATE (8)**, inflating the
 * latter with the platform's `DecompressionStream("deflate-raw")` rather than a
 * vendored inflate implementation. It is the strict counterpart of the writer:
 * every signature is checked, both sizes are honoured, and every entry is
 * CRC-verified before its bytes are handed back.
 *
 * Deliberate properties:
 *   - **Deterministic.** No clock read, no randomness: unless a `date` is
 *     passed, entries stamp the fixed DOS epoch (1980-01-01 00:00), so the same
 *     input always produces byte-identical output. A passed `date` is packed
 *     with its UTC fields, so the bytes do not depend on the host timezone.
 *   - **Browser-safe.** `Uint8Array` and `TextEncoder` only, no `Buffer`, no
 *     `node:zlib` — the same module runs in the browser and in a Worker.
 *   - **No ZIP64.** Sizes and counts are limited to the 32-bit/16-bit fields.
 *     The writer throws instead of writing a corrupt archive; the reader
 *     rejects a ZIP64 archive with a clear message instead of mis-parsing one.
 *   - **UTF-8 names.** General purpose bit 11 is always set on write, so
 *     non-ASCII part names survive; on read, names are decoded as UTF-8 (what
 *     every current producer emits) regardless of that bit.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50

/** 2.0 — enough for STORE with sizes in the local header (no data descriptor). */
const VERSION_NEEDED = 20
/** 2.0, MS-DOS/FAT host — the least surprising provenance for a generic writer. */
const VERSION_MADE_BY = 20
/** Bit 11: the filename and comment fields are UTF-8. */
const UTF8_NAME_FLAG = 0x0800
const METHOD_STORE = 0

const LOCAL_FILE_HEADER_SIZE = 30
const CENTRAL_DIRECTORY_HEADER_SIZE = 46
const END_OF_CENTRAL_DIRECTORY_SIZE = 22

const MAX_UINT16 = 0xffff
const MAX_UINT32 = 0xffffffff

/**
 * Fixed 1980-01-01T00:00:00Z — the earliest representable DOS timestamp, and
 * the value that keeps an unspecified `date` deterministic. Exported so the
 * OOXML builders stamp their metadata with the same instant.
 */
export const DEFAULT_ENTRY_DATE = new Date(Date.UTC(1980, 0, 1))

// ---------------------------------------------------------------------------
// CRC-32 (IEEE 802.3, polynomial 0xEDB88320 reflected)
// ---------------------------------------------------------------------------

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[index] = value >>> 0
  }
  return table
})()

/**
 * CRC-32 of a byte sequence, as an unsigned 32-bit integer.
 *
 * Initial value all-ones, byte reflected through the table, final XOR — the
 * variant ZIP (and PNG) use. `crc32(encode("123456789")) === 0xcbf43926`.
 */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let index = 0; index < bytes.length; index += 1) {
    crc = CRC32_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

// ---------------------------------------------------------------------------
// Public shape
// ---------------------------------------------------------------------------

export interface ZipEntry {
  /** Part name, e.g. `word/document.xml`. Always stored as UTF-8. */
  name: string
  /** Part contents; a string is encoded as UTF-8. */
  data: string | Uint8Array
}

export interface ZipOptions {
  /**
   * Timestamp stamped on every entry. Omit it for reproducible archives: the
   * default is the fixed DOS epoch rather than "now".
   */
  date?: Date
}

// ---------------------------------------------------------------------------
// Byte writer — fixed-size buffer, little-endian fields
// ---------------------------------------------------------------------------

class ByteWriter {
  private readonly bytes: Uint8Array
  private readonly view: DataView
  private cursor = 0

  constructor(size: number) {
    this.bytes = new Uint8Array(size)
    this.view = new DataView(this.bytes.buffer)
  }

  get offset(): number {
    return this.cursor
  }

  u16(value: number): void {
    this.view.setUint16(this.cursor, value, true)
    this.cursor += 2
  }

  u32(value: number): void {
    this.view.setUint32(this.cursor, value >>> 0, true)
    this.cursor += 4
  }

  bytesOf(chunk: Uint8Array): void {
    this.bytes.set(chunk, this.cursor)
    this.cursor += chunk.length
  }

  finish(): Uint8Array {
    return this.bytes
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Build an uncompressed ZIP archive.
 *
 * Entry order is preserved as given (callers conventionally put
 * `[Content_Types].xml` first). An empty entry list is still a valid archive.
 */
export function createZip(entries: ZipEntry[], options: ZipOptions = {}): Uint8Array {
  if (entries.length > MAX_UINT16) {
    throw new Error(`ZIP archive cannot hold more than ${MAX_UINT16} entries.`)
  }

  const encoder = new TextEncoder()
  const stamp = dosDateTime(options.date ?? DEFAULT_ENTRY_DATE)

  const prepared = entries.map((entry) => {
    const nameBytes = encoder.encode(String(entry.name ?? ""))
    const dataBytes = typeof entry.data === "string" ? encoder.encode(entry.data) : entry.data
    if (!nameBytes.length) throw new Error("ZIP entry names cannot be empty.")
    if (nameBytes.length > MAX_UINT16) throw new Error(`ZIP entry name is too long: ${entry.name}`)
    if (dataBytes.length > MAX_UINT32) throw new Error(`ZIP entry is too large for STORE mode: ${entry.name}`)
    return { nameBytes, dataBytes, crc: crc32(dataBytes) }
  })

  const localSize = prepared.reduce((total, entry) => total + LOCAL_FILE_HEADER_SIZE + entry.nameBytes.length + entry.dataBytes.length, 0)
  const centralSize = prepared.reduce((total, entry) => total + CENTRAL_DIRECTORY_HEADER_SIZE + entry.nameBytes.length, 0)
  const writer = new ByteWriter(localSize + centralSize + END_OF_CENTRAL_DIRECTORY_SIZE)

  // Local headers first, remembering where each one starts.
  const offsets: number[] = []
  for (const entry of prepared) {
    offsets.push(writer.offset)

    writer.u32(LOCAL_FILE_HEADER_SIGNATURE)
    writer.u16(VERSION_NEEDED)
    writer.u16(UTF8_NAME_FLAG)
    writer.u16(METHOD_STORE)
    writer.u16(stamp.time)
    writer.u16(stamp.date)
    writer.u32(entry.crc)
    writer.u32(entry.dataBytes.length)
    writer.u32(entry.dataBytes.length)
    writer.u16(entry.nameBytes.length)
    writer.u16(0)
    writer.bytesOf(entry.nameBytes)
    writer.bytesOf(entry.dataBytes)
  }

  // Central directory mirrors every local header and records its offset.
  const centralOffset = writer.offset
  prepared.forEach((entry, index) => {
    writer.u32(CENTRAL_DIRECTORY_SIGNATURE)
    writer.u16(VERSION_MADE_BY)
    writer.u16(VERSION_NEEDED)
    writer.u16(UTF8_NAME_FLAG)
    writer.u16(METHOD_STORE)
    writer.u16(stamp.time)
    writer.u16(stamp.date)
    writer.u32(entry.crc)
    writer.u32(entry.dataBytes.length)
    writer.u32(entry.dataBytes.length)
    writer.u16(entry.nameBytes.length)
    writer.u16(0)
    writer.u16(0)
    writer.u16(0)
    writer.u16(0)
    writer.u32(0)
    writer.u32(offsets[index])
    writer.bytesOf(entry.nameBytes)
  })

  // End of central directory: counts plus where the directory lives.
  writer.u32(END_OF_CENTRAL_DIRECTORY_SIGNATURE)
  writer.u16(0)
  writer.u16(0)
  writer.u16(prepared.length)
  writer.u16(prepared.length)
  writer.u32(centralSize)
  writer.u32(centralOffset)
  writer.u16(0)

  return writer.finish()
}

// ---------------------------------------------------------------------------
// DOS timestamps
// ---------------------------------------------------------------------------

/**
 * Pack a `Date` into the two 16-bit MS-DOS fields.
 *
 * Read with the UTC accessors on purpose: the same archive is produced on any
 * machine, rather than shifting with the host timezone. Seconds have 2-second
 * resolution in this format, and the year field is clamped to 1980-2107.
 */
function dosDateTime(value: Date): { time: number; date: number } {
  const moment = Number.isFinite(value.getTime()) ? value : DEFAULT_ENTRY_DATE
  const year = Math.min(2107, Math.max(1980, moment.getUTCFullYear()))
  const month = Math.min(11, Math.max(0, moment.getUTCMonth()))
  const day = Math.min(31, Math.max(1, moment.getUTCDate()))
  const hours = Math.min(23, Math.max(0, moment.getUTCHours()))
  const minutes = Math.min(59, Math.max(0, moment.getUTCMinutes()))
  const seconds = Math.min(59, Math.max(0, moment.getUTCSeconds()))

  return {
    time: (hours << 11) | (minutes << 5) | (seconds >> 1),
    date: ((year - 1980) << 9) | ((month + 1) << 5) | day,
  }
}

// ---------------------------------------------------------------------------
// Reading — STORE and DEFLATE
// ---------------------------------------------------------------------------

/** The second method this reader understands: raw DEFLATE, as ZIP defines it. */
const METHOD_DEFLATE = 8
/** The values ZIP reserves to mean "the real value is in the ZIP64 record". */
const ZIP64_UINT16 = 0xffff
const ZIP64_UINT32 = 0xffffffff
/**
 * A comment cannot exceed 65535 bytes, so the end-of-central-directory record
 * starts within this many bytes of the end. Bounding the backward scan keeps a
 * corrupt file from searching its whole length for a signature.
 */
const END_OF_CENTRAL_DIRECTORY_WINDOW = MAX_UINT16 + END_OF_CENTRAL_DIRECTORY_SIZE

/** One central directory record, as parsed. */
interface ZipDirectoryEntry {
  name: string
  method: number
  crc: number
  compressedSize: number
  uncompressedSize: number
  localHeaderOffset: number
}

/**
 * Read a ZIP archive into a `part name -> contents` map.
 *
 * The order of the walk is the order ZIP requires and the order this reader
 * needs: find the end-of-central-directory record, follow it to the central
 * directory, then follow each record's offset to its local header. The central
 * directory — not the local header — is the source of truth for sizes, because
 * an entry written with a data descriptor leaves zeros in the local header.
 *
 * Both methods a real `.docx`/`.xlsx` uses are supported: **STORE (0)** and
 * **DEFLATE (8)**. DEFLATE is inflated by the platform's
 * `DecompressionStream("deflate-raw")`, so nothing is vendored and no Node
 * built-in is pulled into the bundle; a runtime without it fails with an
 * actionable message rather than a wrong result.
 *
 * Everything that can be wrong is rejected here, with the offending part named:
 * a truncated or non-ZIP file, a bad signature, an archive that claims more
 * entry bytes than it holds, an unsupported method, a size that disagrees with
 * what the entry actually inflated to, and a CRC mismatch. Rejecting a bad CRC
 * is the point of storing one: a silently corrupted part would become silently
 * corrupted content.
 */
export async function readZip(bytes: Uint8Array): Promise<Record<string, Uint8Array>> {
  if (!bytes || bytes.length < END_OF_CENTRAL_DIRECTORY_SIZE) {
    throw new Error("Not a ZIP archive: the file is smaller than an end-of-central-directory record.")
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const endOffset = findEndOfCentralDirectory(view)

  const diskNumber = view.getUint16(endOffset + 4, true)
  const directoryDisk = view.getUint16(endOffset + 6, true)
  const entriesOnDisk = view.getUint16(endOffset + 8, true)
  const entryCount = view.getUint16(endOffset + 10, true)
  const directorySize = view.getUint32(endOffset + 12, true)
  const directoryOffset = view.getUint32(endOffset + 16, true)

  // ZIP64 first: its end record sets these fields to their sentinel values, and
  // an archive that needs the 64-bit record cannot be read by this reader at all,
  // which is a more useful thing to say than "single-disk only".
  if (entryCount === ZIP64_UINT16 || entriesOnDisk === ZIP64_UINT16 || directorySize === ZIP64_UINT32 || directoryOffset === ZIP64_UINT32) {
    throw new Error(
      "Unsupported ZIP archive: it is ZIP64 (more than 65535 entries or a directory beyond 4 GB), which this reader does not handle.",
    )
  }
  if (diskNumber !== 0 || directoryDisk !== 0 || entriesOnDisk !== entryCount) {
    throw new Error("Unsupported ZIP archive: this reader handles single-disk archives only.")
  }
  if (directoryOffset + directorySize > endOffset || directoryOffset > bytes.length) {
    throw new Error("Malformed ZIP archive: the central directory is not where the end record says it is.")
  }

  const directory: ZipDirectoryEntry[] = []
  let cursor = directoryOffset
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + CENTRAL_DIRECTORY_HEADER_SIZE > bytes.length || view.getUint32(cursor, true) !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw new Error(`Malformed ZIP archive: central directory record ${index + 1} is missing or has a bad signature.`)
    }

    const method = view.getUint16(cursor + 10, true)
    const crc = view.getUint32(cursor + 16, true)
    const compressedSize = view.getUint32(cursor + 20, true)
    const uncompressedSize = view.getUint32(cursor + 24, true)
    const nameLength = view.getUint16(cursor + 28, true)
    const extraLength = view.getUint16(cursor + 30, true)
    const commentLength = view.getUint16(cursor + 32, true)
    const localHeaderOffset = view.getUint32(cursor + 42, true)

    if (compressedSize === ZIP64_UINT32 || uncompressedSize === ZIP64_UINT32 || localHeaderOffset === ZIP64_UINT32) {
      const name = decodeName(bytes.subarray(cursor + CENTRAL_DIRECTORY_HEADER_SIZE, cursor + CENTRAL_DIRECTORY_HEADER_SIZE + nameLength))
      throw new Error(`Unsupported ZIP archive: "${name}" needs a ZIP64 size or offset, which this reader does not handle.`)
    }

    const name = decodeName(bytes.subarray(cursor + CENTRAL_DIRECTORY_HEADER_SIZE, cursor + CENTRAL_DIRECTORY_HEADER_SIZE + nameLength))
    if (!name) throw new Error(`Malformed ZIP archive: central directory record ${index + 1} has an empty name.`)
    directory.push({ name, method, crc, compressedSize, uncompressedSize, localHeaderOffset })
    cursor += CENTRAL_DIRECTORY_HEADER_SIZE + nameLength + extraLength + commentLength
  }

  const entries: Record<string, Uint8Array> = {}
  for (const entry of directory) {
    const { name } = entry
    if (entry.localHeaderOffset + LOCAL_FILE_HEADER_SIZE > bytes.length || view.getUint32(entry.localHeaderOffset, true) !== LOCAL_FILE_HEADER_SIGNATURE) {
      throw new Error(`Malformed ZIP archive: the local file header for "${name}" is missing or has a bad signature.`)
    }

    const localNameLength = view.getUint16(entry.localHeaderOffset + 26, true)
    const localExtraLength = view.getUint16(entry.localHeaderOffset + 28, true)
    const dataStart = entry.localHeaderOffset + LOCAL_FILE_HEADER_SIZE + localNameLength + localExtraLength
    const dataEnd = dataStart + entry.compressedSize
    if (dataEnd > bytes.length) {
      throw new Error(
        `Malformed ZIP archive: "${name}" claims ${entry.compressedSize} compressed bytes but the archive ends after ${bytes.length - dataStart}.`,
      )
    }
    const raw = bytes.subarray(dataStart, dataEnd)

    let data: Uint8Array
    if (entry.method === METHOD_STORE) {
      if (raw.length !== entry.uncompressedSize) {
        throw new Error(`Malformed ZIP archive: "${name}" stores ${raw.length} bytes but the directory records ${entry.uncompressedSize}.`)
      }
      // `slice`, not `subarray`: the returned parts must not alias the input, so a
      // caller mutating a parsed part cannot corrupt the archive it came from.
      data = raw.slice()
    } else if (entry.method === METHOD_DEFLATE) {
      // Only the compressed bytes are needed: the directory already holds the
      // real sizes, so an entry written with a data descriptor (bit 3, zeros in
      // its local header) reads exactly like any other.
      data = await inflateRaw(raw, name)
      if (data.length !== entry.uncompressedSize) {
        throw new Error(`Malformed ZIP archive: "${name}" inflated to ${data.length} bytes but the directory records ${entry.uncompressedSize}.`)
      }
    } else {
      throw new Error(`Unsupported ZIP compression method ${entry.method} on "${name}": only STORE (0) and DEFLATE (8) can be read.`)
    }

    const actual = crc32(data)
    if (actual !== entry.crc) {
      throw new Error(`Corrupt ZIP entry "${name}": CRC-32 mismatch (directory says ${hex32(entry.crc)}, contents compute to ${hex32(actual)}).`)
    }
    entries[name] = data
  }

  return entries
}

/** Locate the end-of-central-directory record by scanning backwards from the end. */
function findEndOfCentralDirectory(view: DataView): number {
  const start = Math.max(0, view.byteLength - END_OF_CENTRAL_DIRECTORY_WINDOW)
  for (let offset = view.byteLength - END_OF_CENTRAL_DIRECTORY_SIZE; offset >= start; offset -= 1) {
    if (view.getUint32(offset, true) === END_OF_CENTRAL_DIRECTORY_SIGNATURE) return offset
  }
  throw new Error("Not a ZIP archive: no end-of-central-directory record was found in the last 65557 bytes.")
}

/** ZIP names are UTF-8 in practice, whether or not bit 11 is set. */
function decodeName(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes)
}

/**
 * Re-key an archive's parts with `/` as the only separator.
 *
 * ZIP says `/`, and every OOXML part name is written with `/`, but an archive
 * produced on Windows can carry `\` instead — the .NET `ZipFile` writer did
 * exactly that for years, and a file round-tripped through it comes back with
 * `word\document.xml`. Both spellings name the same part, so the OOXML readers
 * normalize before looking one up rather than failing to find a part that is
 * plainly there. `readZip` itself reports names verbatim: it describes the
 * archive, and normalizing is the container format's business, not ZIP's.
 */
export function normalizePartNames(parts: Record<string, Uint8Array>): Record<string, Uint8Array> {
  const normalized: Record<string, Uint8Array> = {}
  for (const [name, data] of Object.entries(parts)) {
    const key = name.replace(/\\/g, "/")
    if (!(key in normalized)) normalized[key] = data
  }
  return normalized
}

function hex32(value: number): string {
  return `0x${(value >>> 0).toString(16).padStart(8, "0")}`
}

/**
 * Inflate one raw DEFLATE stream with the platform implementation.
 *
 * `"deflate-raw"` is the format ZIP stores: DEFLATE without the zlib wrapper.
 * It is available in every current browser, in Node from 21.2 (and 20.x builds
 * shipping the same streams), and in Workers — but not everywhere, so its
 * absence is reported as what it is instead of being papered over.
 */
async function inflateRaw(compressed: Uint8Array, name: string): Promise<Uint8Array> {
  const factory = globalThis.DecompressionStream
  if (typeof factory !== "function") {
    throw new Error(
      `"${name}" is DEFLATE-compressed and this runtime has no DecompressionStream("deflate-raw") to inflate it. ` +
        "Re-save the file with no compression, or read it in a runtime that provides raw DEFLATE.",
    )
  }

  let stream: DecompressionStream
  try {
    stream = new factory("deflate-raw")
  } catch {
    throw new Error(`"${name}" is DEFLATE-compressed but this runtime does not implement DecompressionStream("deflate-raw").`)
  }

  const writer = stream.writable.getWriter()
  // The write side is awaited at the end; its failure is the same failure the
  // read side reports, so it is swallowed here rather than surfacing later as an
  // unhandled rejection. The copy is what makes the argument a plain
  // `ArrayBuffer`-backed view: `BufferSource` in the DOM typings excludes
  // `SharedArrayBuffer`, which the stream accepts at runtime either way.
  const pump = (async () => {
    try {
      await writer.write(new Uint8Array(compressed))
      await writer.close()
    } catch {
      /* reported below */
    }
  })()

  const chunks: Uint8Array[] = []
  let total = 0
  try {
    const reader = stream.readable.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        chunks.push(value)
        total += value.length
      }
    }
  } catch {
    await pump
    throw new Error(`Corrupt ZIP entry "${name}": the DEFLATE stream could not be inflated.`)
  }
  await pump

  const data = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    data.set(chunk, offset)
    offset += chunk.length
  }
  return data
}
