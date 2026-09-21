/**
 * A minimal ZIP reader for the export tests.
 *
 * It exists so the tests can look inside a generated archive and pull out the
 * XML parts. It is written against the ZIP spec directly (central directory
 * scanning, local header offsets) rather than by reusing `createZip`, so it
 * genuinely cross-checks names, sizes, offsets and CRCs.
 *
 * It is still a **structural self-check, not an independent unzip**: it lives in
 * this repository and shares its authors with the writer. The independent proof
 * is the PowerShell `Expand-Archive` run recorded in the change report, which
 * uses a foreign implementation.
 */

import assert from "node:assert/strict"

const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50

export interface ParsedZipEntry {
  name: string
  flags: number
  method: number
  crc: number
  compressedSize: number
  uncompressedSize: number
  localHeaderOffset: number
  data: Uint8Array
}

export interface ParsedZip {
  entries: ParsedZipEntry[]
  comment: string
}

/** Locate the end-of-central-directory record by scanning backwards. */
function findEndOfCentralDirectory(view: DataView): number {
  for (let offset = view.byteLength - 22; offset >= 0; offset -= 1) {
    if (view.getUint32(offset, true) === END_OF_CENTRAL_DIRECTORY_SIGNATURE) return offset
  }
  throw new Error("No end-of-central-directory record found.")
}

export function readZip(archive: Uint8Array): ParsedZip {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength)
  const endOffset = findEndOfCentralDirectory(view)

  const entryCount = view.getUint16(endOffset + 10, true)
  const centralSize = view.getUint32(endOffset + 12, true)
  const centralOffset = view.getUint32(endOffset + 16, true)
  const commentLength = view.getUint16(endOffset + 20, true)
  const decoder = new TextDecoder()

  const entries: ParsedZipEntry[] = []
  let cursor = centralOffset
  for (let index = 0; index < entryCount; index += 1) {
    assert.equal(view.getUint32(cursor, true), CENTRAL_DIRECTORY_SIGNATURE, "central directory signature")

    const flags = view.getUint16(cursor + 8, true)
    const method = view.getUint16(cursor + 10, true)
    const crc = view.getUint32(cursor + 16, true)
    const compressedSize = view.getUint32(cursor + 20, true)
    const uncompressedSize = view.getUint32(cursor + 24, true)
    const nameLength = view.getUint16(cursor + 28, true)
    const extraLength = view.getUint16(cursor + 30, true)
    const entryCommentLength = view.getUint16(cursor + 32, true)
    const localHeaderOffset = view.getUint32(cursor + 42, true)
    const name = decoder.decode(archive.subarray(cursor + 46, cursor + 46 + nameLength))

    // The local header must be where the central directory says it is.
    assert.equal(view.getUint32(localHeaderOffset, true), LOCAL_FILE_HEADER_SIGNATURE, `local header signature for ${name}`)
    const localNameLength = view.getUint16(localHeaderOffset + 26, true)
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true)
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength

    entries.push({
      name,
      flags,
      method,
      crc,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
      data: archive.subarray(dataStart, dataStart + compressedSize),
    })

    cursor += 46 + nameLength + extraLength + entryCommentLength
  }

  assert.equal(cursor, centralOffset + centralSize, "central directory size matches the headers walked")
  return { entries, comment: decoder.decode(archive.subarray(endOffset + 22, endOffset + 22 + commentLength)) }
}

export function entryByName(archive: Uint8Array, name: string): ParsedZipEntry {
  const entry = readZip(archive).entries.find((candidate) => candidate.name === name)
  assert.ok(entry, `archive contains ${name}`)
  return entry
}

/** Read one part as UTF-8 text. */
export function partText(archive: Uint8Array, name: string): string {
  return new TextDecoder().decode(entryByName(archive, name).data)
}

export function partNames(archive: Uint8Array): string[] {
  return readZip(archive).entries.map((entry) => entry.name)
}
