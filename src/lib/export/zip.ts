/**
 * `zip` — a minimal, dependency-free ZIP writer.
 *
 * A DOCX or XLSX file is a ZIP container of XML parts, so exporting those
 * formats needs a writer. The product constraint is that the app ships no new
 * dependencies (the PPTX path uses a vendored browser bundle for the same
 * reason), and `zlib` inside this bundle would drag a Node built-in into
 * browser code — so this module emits **STORE (0)** entries only: every byte of
 * every part is copied verbatim, with a correct CRC-32 so unzippers still
 * validate the archive. A `.docx` has no requirement that its parts be
 * deflated.
 *
 * What the file contains, in order:
 *
 *     [local file header + data] * n    one per entry, offsets recorded
 *     [central directory header] * n    name, size, crc, local offset
 *     [end of central directory]        entry count, central size + offset
 *
 * Deliberate properties:
 *   - **Deterministic.** No clock read, no randomness: unless a `date` is
 *     passed, entries stamp the fixed DOS epoch (1980-01-01 00:00), so the same
 *     input always produces byte-identical output. A passed `date` is packed
 *     with its UTC fields, so the bytes do not depend on the host timezone.
 *   - **Browser-safe.** `Uint8Array` and `TextEncoder` only, no `Buffer`.
 *   - **No ZIP64.** Sizes and counts are limited to the 32-bit/16-bit fields
 *     and oversized input throws instead of writing a corrupt archive.
 *   - **UTF-8 names.** General purpose bit 11 is always set, so non-ASCII part
 *     names survive.
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
