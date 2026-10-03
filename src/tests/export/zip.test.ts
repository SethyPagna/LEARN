import assert from "node:assert/strict"
import test from "node:test"
import { crc32, createZip } from "../../lib/export/zip"
import { readZip } from "./zip-reader"

const encoder = new TextEncoder()

function bytesOf(value: string): Uint8Array {
  return encoder.encode(value)
}

function signatureAt(archive: Uint8Array, offset: number): number {
  return new DataView(archive.buffer, archive.byteOffset, archive.byteLength).getUint32(offset, true)
}

// ---------------------------------------------------------------------------
// CRC-32
// ---------------------------------------------------------------------------

test("crc32 matches the published IEEE 802.3 test vectors", () => {
  // The canonical check value for "123456789" — the same constant ZIP, PNG and
  // gzip tooling is verified against.
  assert.equal(crc32(bytesOf("123456789")), 0xcbf43926)
  assert.equal(crc32(bytesOf("")), 0)
  assert.equal(crc32(bytesOf("a")), 0xe8b7be43)
  assert.equal(crc32(bytesOf("The quick brown fox jumps over the lazy dog")), 0x414fa339)
  assert.equal(crc32(new Uint8Array([0, 0, 0, 0])), 0x2144df1c)
  // Cross-checked against `node:zlib`'s independent crc32 implementation, which
  // returns the same value for the same bytes.
  assert.equal(crc32(bytesOf("hello world")), 0x0d4a1185)
})

test("crc32 is position and byte sensitive", () => {
  assert.notEqual(crc32(bytesOf("ab")), crc32(bytesOf("ba")))
  assert.notEqual(crc32(bytesOf("a")), crc32(bytesOf("A")))
  // Always an unsigned 32-bit value, never a negative JS number.
  assert.ok(crc32(bytesOf("\u00ff\u00ff")) >= 0)
})

test("crc32 covers bytes, not characters", () => {
  const encoded = bytesOf("é")
  assert.equal(encoded.length, 2)
  assert.equal(crc32(encoded), crc32(new Uint8Array([0xc3, 0xa9])))
})

// ---------------------------------------------------------------------------
// Archive structure
// ---------------------------------------------------------------------------

test("createZip writes local headers, a central directory, and an end record", () => {
  const archive = createZip([
    { name: "a.txt", data: "alpha" },
    { name: "nested/b.txt", data: "beta" },
  ])

  // Local file header, central directory header, end of central directory.
  assert.equal(signatureAt(archive, 0), 0x04034b50)
  const { entries } = readZip(archive)
  assert.equal(entries.length, 2)

  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength)
  const endOffset = archive.length - 22
  assert.equal(view.getUint32(endOffset, true), 0x06054b50)
  assert.equal(view.getUint16(endOffset + 10, true), 2, "entries on disk")
  assert.equal(view.getUint16(endOffset + 8, true), 2, "total entries")
  assert.equal(view.getUint32(endOffset + 12, true) + view.getUint32(endOffset + 16, true) + 22, archive.length)
})

test("createZip round-trips every entry name, size and CRC", () => {
  const input = [
    { name: "[Content_Types].xml", data: "<?xml version=\"1.0\"?><Types/>" },
    { name: "word/document.xml", data: "x".repeat(5000) },
    { name: "empty.bin", data: new Uint8Array(0) },
    { name: "unicode/名前.xml", data: "naïve ✨" },
  ]
  const archive = createZip(input)
  const { entries } = readZip(archive)

  assert.deepEqual(entries.map((entry) => entry.name), input.map((entry) => entry.name))
  for (const entry of entries) {
    const source = input.find((candidate) => candidate.name === entry.name)
    assert.ok(source, `${entry.name} came from the input`)
    const expected = typeof source.data === "string" ? bytesOf(source.data) : source.data
    assert.equal(entry.method, 0, `${entry.name} uses STORE`)
    assert.equal(entry.uncompressedSize, expected.length, `${entry.name} uncompressed size`)
    // STORE: bytes are copied verbatim, so both sizes are the byte length.
    assert.equal(entry.compressedSize, expected.length, `${entry.name} compressed size`)
    assert.equal(entry.crc, crc32(expected), `${entry.name} crc`)
    assert.deepEqual(Array.from(entry.data), Array.from(expected), `${entry.name} payload`)
    // Bit 11: the name field is UTF-8, which is what makes non-ASCII names work.
    assert.equal(entry.flags & 0x0800, 0x0800, `${entry.name} sets the UTF-8 name flag`)
  }
})

test("createZip records local header offsets that point at the real headers", () => {
  const archive = createZip([
    { name: "one", data: "1" },
    { name: "two-two", data: "22" },
    { name: "three-three-three", data: "333" },
  ])

  let expectedOffset = 0
  for (const entry of readZip(archive).entries) {
    assert.equal(entry.localHeaderOffset, expectedOffset)
    assert.equal(signatureAt(archive, entry.localHeaderOffset), 0x04034b50)
    expectedOffset += 30 + encoder.encode(entry.name).length + entry.uncompressedSize
  }
})

test("createZip writes the sizes a reader needs without a data descriptor", () => {
  const archive = createZip([{ name: "a.txt", data: "hello world" }])
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength)

  assert.equal(view.getUint16(4, true), 20, "version needed to extract is 2.0")
  assert.equal(view.getUint16(6, true), 0x0800, "general purpose flag: UTF-8 name, no data descriptor")
  assert.equal(view.getUint16(8, true), 0, "method STORE")
  // A literal, not `crc32(...)`: asserting the header against the function that
  // wrote it would pass even if both were wrong.
  assert.equal(view.getUint32(14, true), 0x0d4a1185, "CRC-32 of \"hello world\" in the local header")
  assert.equal(view.getUint32(18, true), 11, "compressed size in the local header")
  assert.equal(view.getUint32(22, true), 11, "uncompressed size in the local header")
  assert.equal(view.getUint16(26, true), 5, "filename length")
  assert.equal(view.getUint16(28, true), 0, "no extra field")
  assert.equal(new TextDecoder().decode(archive.subarray(30, 35)), "a.txt")
})

test("createZip accepts an empty archive", () => {
  const archive = createZip([])
  assert.equal(archive.length, 22)
  assert.equal(signatureAt(archive, 0), 0x06054b50)
  assert.deepEqual(readZip(archive).entries, [])
  assert.equal(new DataView(archive.buffer).getUint16(10, true), 0)
})

// ---------------------------------------------------------------------------
// Determinism and timestamps
// ---------------------------------------------------------------------------

test("createZip output is byte-identical for identical input", () => {
  const entries = [{ name: "a.xml", data: "<a/>" }]
  assert.deepEqual(Array.from(createZip(entries)), Array.from(createZip(entries)))
})

test("an explicit date is packed with its UTC fields", () => {
  const date = new Date(Date.UTC(2026, 8, 22, 10, 30, 44))
  const archive = createZip([{ name: "a.xml", data: "<a/>" }], { date })
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength)

  const expectedTime = (10 << 11) | (30 << 5) | (44 >> 1)
  const expectedDate = ((2026 - 1980) << 9) | ((8 + 1) << 5) | 22
  assert.equal(view.getUint16(10, true), expectedTime, "local header time")
  assert.equal(view.getUint16(12, true), expectedDate, "local header date")

  // Same instant described in another timezone must produce identical bytes.
  const sameInstant = new Date(date.getTime())
  assert.deepEqual(Array.from(createZip([{ name: "a.xml", data: "<a/>" }], { date: sameInstant })), Array.from(archive))
})

test("the default date is the fixed DOS epoch, not the current clock", () => {
  const archive = createZip([{ name: "a.xml", data: "<a/>" }])
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength)
  assert.equal(view.getUint16(10, true), 0, "00:00:00")
  assert.equal(view.getUint16(12, true), ((1980 - 1980) << 9) | (1 << 5) | 1, "1980-01-01")
})

test("createZip rejects entries the format cannot hold", () => {
  assert.throws(() => createZip([{ name: "", data: "x" }]), /empty/)
  assert.throws(() => createZip([{ name: "x".repeat(70000), data: "x" }]), /too long/)
})
