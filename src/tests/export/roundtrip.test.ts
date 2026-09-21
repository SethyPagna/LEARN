/**
 * Export round-trip: what this app writes, it can read back.
 *
 * Two kinds of test live here, and the distinction matters:
 *
 *   - **Our writer, our reader.** `buildDocx`/`buildXlsx` produce the file,
 *     `readZip` opens it, the importer reconstructs the content. This is the
 *     clause the Brief asks for — re-importing reproduces the same content and
 *     structure — checked as a deep equality against the exact input, so a
 *     dropped cell or a flattened list fails rather than passes quietly.
 *   - **A foreign writer, our reader.** Half of these fixtures were not produced
 *     by this repository: the DEFLATE archive is compressed by the platform's
 *     `CompressionStream`, and the "foreign" DOCX/XLSX packages below are
 *     hand-written the way Word and Excel write them (different namespace
 *     prefixes, `numbering.xml` list definitions, cells addressed sparsely,
 *     inline strings, tracked changes). Those are the files a user re-imports in
 *     practice, so the reader is held to them, not only to our own bytes.
 */

import assert from "node:assert/strict"
import test from "node:test"
import type { ThemedBlock } from "../../lib/ai/format-response"
import { buildDocx } from "../../lib/export/docx"
import { importDocx } from "../../lib/export/docx-import"
import { blocksFromDocumentHtml, blocksToDocumentHtml } from "../../lib/export/html-blocks"
import { describeImportFailure, studioDocumentFromDocxFile, studioSheetFromXlsxFile } from "../../lib/export/studio-import"
import { buildXlsx } from "../../lib/export/xlsx"
import { importXlsx } from "../../lib/export/xlsx-import"
import { crc32, createZip, readZip } from "../../lib/export/zip"

const encoder = new TextEncoder()
const decoder = new TextDecoder()

// ---------------------------------------------------------------------------
// A foreign (DEFLATE) ZIP writer, for the archives our writer cannot produce
// ---------------------------------------------------------------------------

/** Compress with the platform, the same path the reader inflates through. */
async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new CompressionStream("deflate-raw")
  const writer = stream.writable.getWriter()
  const pump = writer.write(new Uint8Array(bytes)).then(() => writer.close())
  const chunks: Uint8Array[] = []
  const reader = stream.readable.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) chunks.push(value)
  }
  await pump
  return concat(chunks)
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const result = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}

/**
 * A ZIP whose entries use **DEFLATE (8)**, which `createZip` never writes.
 *
 * It is assembled here rather than by a library so the test can prove the reader
 * inflates a stream it did not compress: the bytes come from
 * `CompressionStream("deflate-raw")`, a different implementation from anything
 * in `src/lib`.
 */
async function createDeflatedZip(entries: Array<{ name: string; data: string }>): Promise<Uint8Array> {
  const prepared: Array<{ nameBytes: Uint8Array; raw: Uint8Array; deflated: Uint8Array; crc: number }> = []
  for (const entry of entries) {
    const raw = encoder.encode(entry.data)
    prepared.push({ nameBytes: encoder.encode(entry.name), raw, deflated: await deflateRaw(raw), crc: crc32(raw) })
  }

  const localSize = prepared.reduce((total, entry) => total + 30 + entry.nameBytes.length + entry.deflated.length, 0)
  const centralSize = prepared.reduce((total, entry) => total + 46 + entry.nameBytes.length, 0)
  const archive = new Uint8Array(localSize + centralSize + 22)
  const view = new DataView(archive.buffer)

  let offset = 0
  const offsets: number[] = []
  for (const entry of prepared) {
    offsets.push(offset)
    view.setUint32(offset, 0x04034b50, true)
    view.setUint16(offset + 4, 20, true)
    view.setUint16(offset + 6, 0x0800, true)
    view.setUint16(offset + 8, 8, true) // method: DEFLATE
    view.setUint16(offset + 10, 0, true)
    view.setUint16(offset + 12, 0x0021, true) // 1980-01-01
    view.setUint32(offset + 14, entry.crc, true)
    view.setUint32(offset + 18, entry.deflated.length, true)
    view.setUint32(offset + 22, entry.raw.length, true)
    view.setUint16(offset + 26, entry.nameBytes.length, true)
    view.setUint16(offset + 28, 0, true)
    archive.set(entry.nameBytes, offset + 30)
    archive.set(entry.deflated, offset + 30 + entry.nameBytes.length)
    offset += 30 + entry.nameBytes.length + entry.deflated.length
  }

  const centralOffset = offset
  prepared.forEach((entry, index) => {
    view.setUint32(offset, 0x02014b50, true)
    view.setUint16(offset + 4, 20, true)
    view.setUint16(offset + 6, 20, true)
    view.setUint16(offset + 8, 0x0800, true)
    view.setUint16(offset + 10, 8, true)
    view.setUint16(offset + 12, 0, true)
    view.setUint16(offset + 14, 0x0021, true)
    view.setUint32(offset + 16, entry.crc, true)
    view.setUint32(offset + 20, entry.deflated.length, true)
    view.setUint32(offset + 24, entry.raw.length, true)
    view.setUint16(offset + 28, entry.nameBytes.length, true)
    view.setUint16(offset + 30, 0, true)
    view.setUint16(offset + 32, 0, true)
    view.setUint16(offset + 34, 0, true)
    view.setUint16(offset + 36, 0, true)
    view.setUint32(offset + 38, 0, true)
    view.setUint32(offset + 42, offsets[index], true)
    archive.set(entry.nameBytes, offset + 46)
    offset += 46 + entry.nameBytes.length
  })

  view.setUint32(offset, 0x06054b50, true)
  view.setUint16(offset + 4, 0, true)
  view.setUint16(offset + 6, 0, true)
  view.setUint16(offset + 8, prepared.length, true)
  view.setUint16(offset + 10, prepared.length, true)
  view.setUint32(offset + 12, centralSize, true)
  view.setUint32(offset + 16, centralOffset, true)
  view.setUint16(offset + 20, 0, true)
  return archive
}

/** Re-package an archive's parts with DEFLATE, keeping the part names and text. */
async function recompress(archive: Uint8Array): Promise<Uint8Array> {
  const parts = await readZip(archive)
  return createDeflatedZip(Object.entries(parts).map(([name, data]) => ({ name, data: decoder.decode(data) })))
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * Every block shape the DOCX writer and importer agree on. Deliberately no
 * callout, quiz, slide outline or image: those have no Word element of their
 * own, and the test below says what happens to them instead of pretending they
 * survive.
 */
const documentBlocks: ThemedBlock[] = [
  { type: "heading", level: 1, text: "Lesson one" },
  { type: "heading", level: 3, text: "Detail & nuance" },
  { type: "paragraph", text: "First paragraph." },
  { type: "paragraph", text: "Line one\nline two" },
  { type: "list", ordered: false, items: ["alpha", "beta"] },
  { type: "list", ordered: true, items: ["step one", "step two"] },
  { type: "table", headers: ["Term", "Meaning"], rows: [["Cell", "A box"], ["Row", "Second"]] },
  { type: "quote", text: "Quoted line" },
  { type: "divider" },
]

const DOCUMENT_TITLE = "Lesson one"

// ---------------------------------------------------------------------------
// DOCX round-trip
// ---------------------------------------------------------------------------

test("a docx export re-imports as the same headings, paragraphs, lists and table", async () => {
  const archive = buildDocx({ title: DOCUMENT_TITLE, blocks: documentBlocks })
  const parts = await readZip(archive)
  assert.ok(parts["word/document.xml"], "the archive holds the document part the importer reads")

  const { title, blocks } = await importDocx(archive)
  assert.equal(title, DOCUMENT_TITLE, "the core-property title comes back")
  assert.deepEqual(blocks, documentBlocks)
})

test("the same docx re-imports unchanged when its parts are DEFLATE-compressed", async () => {
  const stored = buildDocx({ title: DOCUMENT_TITLE, blocks: documentBlocks })
  const deflated = await recompress(stored)

  // The fixture must really exercise the DEFLATE path, not fall back to STORE.
  const view = new DataView(deflated.buffer)
  assert.equal(view.getUint16(8, true), 8, "the fixture's first entry uses method 8")
  assert.ok(deflated.length !== stored.length, "the DEFLATE archive is not a byte copy of the STORE one")

  const { title, blocks } = await importDocx(deflated)
  assert.equal(title, DOCUMENT_TITLE)
  assert.deepEqual(blocks, documentBlocks)
})

test("docx import rebuilds a document written the way Word writes one", async () => {
  // Hand-written WordprocessingML: a prefix other than `w:` on one paragraph,
  // heading by style, heading by direct bold+size, a bulleted list defined in
  // numbering.xml, a numbered list, a table with no header row, a hyperlink, a
  // tracked insertion and a tracked deletion.
  const documentXml = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:x="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
    "<w:body>",
    '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Styled heading</w:t></w:r></w:p>',
    '<w:p><w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t>Bold heading without a style</w:t></w:r></w:p>',
    '<w:p><w:r><w:t>Plain </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>bold</w:t></w:r><w:r><w:t xml:space="preserve"> text</w:t></w:r></w:p>',
    '<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr></w:pPr><w:r><w:t>Bullet one</w:t></w:r></w:p>',
    '<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr></w:pPr><w:r><w:t>Bullet two</w:t></w:r></w:p>',
    '<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="3"/></w:numPr></w:pPr><w:r><w:t>Numbered one</w:t></w:r></w:p>',
    '<x:p><x:pPr><x:pStyle x:val="Heading2"/></x:pPr><x:r><x:t>Prefixed heading</x:t></x:r></x:p>',
    "<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w=\"2400\"/></w:tblGrid>",
    "<w:tr><w:tc><w:tcPr/><w:p><w:r><w:t>C1</w:t></w:r></w:p></w:tc><w:tc><w:tcPr/><w:p><w:r><w:t>C2</w:t></w:r></w:p></w:tc></w:tr>",
    "<w:tr><w:tc><w:tcPr/><w:p><w:r><w:t>D1</w:t></w:r></w:p></w:tc><w:tc><w:tcPr/><w:p><w:r><w:t>D2</w:t></w:r></w:p></w:tc></w:tr>",
    "</w:tbl>",
    '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6"/></w:pBdr></w:pPr></w:p>',
    '<w:p><w:hyperlink r:id="rId7"><w:r><w:t>Linked text</w:t></w:r></w:hyperlink></w:p>',
    '<w:p><w:ins w:id="1" w:author="Ada"><w:r><w:t>Inserted</w:t></w:r></w:ins><w:del w:id="2" w:author="Ada"><w:r><w:delText>Deleted</w:delText></w:r></w:del></w:p>',
    "<w:sectPr/>",
    "</w:body></w:document>",
  ].join("")

  const numberingXml = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
    '<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="&#61623;"/></w:lvl></w:abstractNum>',
    '<w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>',
    '<w:num w:numId="2"><w:abstractNumId w:val="0"/></w:num>',
    '<w:num w:numId="3"><w:abstractNumId w:val="1"/></w:num>',
    "</w:numbering>",
  ].join("")

  const coreXml = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">',
    "<dc:title>Foreign document</dc:title>",
    "</cp:coreProperties>",
  ].join("")

  const archive = createZip([
    { name: "word/document.xml", data: documentXml },
    { name: "word/numbering.xml", data: numberingXml },
    { name: "docProps/core.xml", data: coreXml },
  ])

  const { title, blocks } = await importDocx(archive)
  assert.equal(title, "Foreign document")
  assert.deepEqual(blocks, [
    { type: "heading", level: 1, text: "Styled heading" },
    { type: "heading", level: 2, text: "Bold heading without a style" },
    { type: "paragraph", text: "Plain bold text" },
    { type: "list", ordered: false, items: ["Bullet one", "Bullet two"] },
    { type: "list", ordered: true, items: ["Numbered one"] },
    { type: "heading", level: 2, text: "Prefixed heading" },
    { type: "table", headers: [], rows: [["C1", "C2"], ["D1", "D2"]] },
    { type: "divider" },
    { type: "paragraph", text: "Linked text" },
    { type: "paragraph", text: "Inserted" },
  ])
  // The deleted revision and the field-free hyperlink href are not content.
  assert.equal(JSON.stringify(blocks).includes("Deleted"), false)
})

test("docx import falls back to the first heading when a package has no core properties", async () => {
  const archive = createZip([
    {
      name: "word/document.xml",
      data: '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>From the body</w:t></w:r></w:p><w:p><w:r><w:t>Text</w:t></w:r></w:p></w:body></w:document>',
    },
  ])

  const { title, blocks } = await importDocx(archive)
  assert.equal(title, "From the body")
  assert.deepEqual(blocks, [
    { type: "heading", level: 2, text: "From the body" },
    { type: "paragraph", text: "Text" },
  ])
})

test("docx import keeps the callout prefix our writer emits and leaves images as text", async () => {
  const blocks: ThemedBlock[] = [
    { type: "callout", tone: "warn", text: "Careful" },
    { type: "image", url: "https://example.com/a.png", alt: "A diagram" },
    { type: "paragraph", text: "After" },
  ]
  const { blocks: imported } = await importDocx(buildDocx({ title: "T", blocks }))

  assert.deepEqual(imported, [
    { type: "callout", tone: "warn", text: "Careful" },
    { type: "paragraph", text: "[Image: A diagram — https://example.com/a.png]" },
    { type: "paragraph", text: "After" },
  ])
})

// ---------------------------------------------------------------------------
// XLSX round-trip
// ---------------------------------------------------------------------------

test("an xlsx export re-imports with its values and their types intact", async () => {
  const cells = [
    ["Label", "Count", "Done"],
    ["alpha", 12, true],
    ["beta", 3.5, false],
    ["gamma", -0.5, "text"],
    ["delta", 0, ""],
  ]
  const archive = buildXlsx({ title: "Tracker", cells })
  const imported = await importXlsx(archive)

  assert.equal(imported.title, "Tracker")
  assert.deepEqual(imported.cells, cells.map((row) => row.map((value) => (value === "" ? "" : value))))
  // Types survive, not just the text of them.
  assert.equal(typeof imported.cells[1][1], "number")
  assert.equal(typeof imported.cells[1][2], "boolean")
  assert.equal(typeof imported.cells[1][0], "string")
})

test("the same xlsx re-imports unchanged when its parts are DEFLATE-compressed", async () => {
  const cells = [["Label", "Count", "Done"], ["alpha", 12, true]]
  const deflated = await recompress(buildXlsx({ title: "Tracker", cells }))
  assert.equal(new DataView(deflated.buffer).getUint16(8, true), 8, "the fixture uses method 8")

  const imported = await importXlsx(deflated)
  assert.equal(imported.title, "Tracker")
  assert.deepEqual(imported.cells, cells)
})

test("xlsx import reads the sparsely addressed cells Excel actually writes", async () => {
  const archive = createZip([
    { name: "[Content_Types].xml", data: '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>' },
    {
      name: "xl/workbook.xml",
      data: '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets><sheet name="Grades" sheetId="1" r:id="rId1"/></sheets></workbook>',
    },
    {
      name: "xl/worksheets/sheet1.xml",
      data: [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>',
        // Row 1 skips B; row 2 is empty and therefore absent; row 4 is a formula
        // with a cached string result; row 5 pushes a blank cell far to the right.
        '<row r="1"><c r="A1" t="inlineStr"><is><t>Header</t></is></c><c r="C1" t="s"><v>0</v></c></row>',
        '<row r="3"><c r="B3"><v>7</v></c></row>',
        '<row r="4"><c r="A4" t="str"><f>CONCATENATE("a","b")</f><v>ab</v></c></row>',
        '<row r="5"><c r="E5"/></row>',
        "</sheetData></worksheet>",
      ].join(""),
    },
    { name: "xl/sharedStrings.xml", data: '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Shared text</t></si></sst>' },
  ])

  const imported = await importXlsx(archive)
  assert.equal(imported.title, "Grades")
  assert.deepEqual(imported.cells, [
    ["Header", "", "Shared text"],
    ["", "", ""],
    ["", 7, ""],
    ["ab", "", ""],
  ])
  // A formula's text is not its value, and trailing blank rows and columns drop.
  assert.equal(JSON.stringify(imported.cells).includes("CONCATENATE"), false)
})

test("both importers accept the backslash part separators a Windows ZIP writer emits", async () => {
  // Observed for real: re-zipping our own docx with the .NET `ZipFile` API on
  // Windows produced `word\document.xml` and `xl\worksheets\sheet1.xml`. The part
  // is there, so the importer has to find it.
  const parts = await readZip(buildDocx({ title: DOCUMENT_TITLE, blocks: documentBlocks }))
  const backslashed = Object.entries(parts).map(([name, data]) => ({ name: name.replace(/\//g, "\\"), data: decoder.decode(data) }))
  const archive = await createDeflatedZip(backslashed)

  const { title, blocks } = await importDocx(archive)
  assert.equal(title, DOCUMENT_TITLE)
  assert.deepEqual(blocks, documentBlocks)

  const sheet = await importXlsx(await createDeflatedZip(Object.entries(await readZip(buildXlsx({ title: "Tracker", cells: [["a", 1]] }))).map(([name, data]) => ({ name: name.replace(/\//g, "\\"), data: decoder.decode(data) }))))
  assert.deepEqual(sheet, { title: "Tracker", cells: [["a", 1]] })
})

test("xlsx import reads a workbook whose strings are all inline", async () => {  const archive = createZip([
    { name: "xl/workbook.xml", data: '<workbook><sheets><sheet name="Inline"/></sheets></workbook>' },
    {
      name: "xl/worksheets/sheet1.xml",
      data: '<worksheet><sheetData><row><c t="inlineStr"><is><t>One</t></is></c><c t="inlineStr"><is><t>Two</t></is></c></row></sheetData></worksheet>',
    },
  ])

  const imported = await importXlsx(archive)
  assert.equal(imported.title, "Inline")
  assert.deepEqual(imported.cells, [["One", "Two"]])
})

test("xlsx import returns an empty grid for a workbook with no cells", async () => {
  const archive = createZip([
    { name: "xl/worksheets/sheet1.xml", data: '<worksheet><sheetData><row r="1"/></sheetData></worksheet>' },
  ])
  assert.deepEqual(await importXlsx(archive), { title: "", cells: [] })
})

// ---------------------------------------------------------------------------
// Blocked input — every failure says what was wrong
// ---------------------------------------------------------------------------

test("malformed input is rejected with a message that names the problem", async () => {
  const random = new Uint8Array([0x1f, 0x8b, 0x08, 0x00, 0x99, 0x42, 0x7f, 0x5a, 0x00, 0x03])
  const docx = buildDocx({ title: "T", blocks: documentBlocks })

  await assert.rejects(readZip(random), /Not a ZIP archive/i)
  await assert.rejects(readZip(docx.slice(0, 64)), /Not a ZIP archive/i)
  await assert.rejects(importDocx(random), /Word document: Not a ZIP archive/i)
  await assert.rejects(importXlsx(random), /Excel workbook: Not a ZIP archive/i)
  // A ZIP that is not a Word document, or not a workbook, says which part is missing.
  const notADocument = await createDeflatedZip([{ name: "hello.txt", data: "hi" }])
  await assert.rejects(importDocx(notADocument), /no word\/document\.xml part/)
  await assert.rejects(importXlsx(notADocument), /no worksheet part/)
})

test("readZip rejects an archive whose stored bytes no longer match their CRC", async () => {
  const name = "word/document.xml"
  const archive = createZip([{ name, data: "<document>intact</document>" }])
  assert.equal(decoder.decode((await readZip(archive))[name]), "<document>intact</document>")

  // One flipped bit inside the stored payload, with sizes and signatures intact:
  // only the CRC can catch this, which is why the reader checks it.
  const tampered = archive.slice()
  tampered[30 + name.length] ^= 0x20
  await assert.rejects(readZip(tampered), /Corrupt ZIP entry "word\/document\.xml": CRC-32 mismatch/)
})

test("readZip names an unsupported compression method instead of guessing", async () => {
  const archive = await createDeflatedZip([{ name: "a.txt", data: "hello world hello world" }])
  const view = new DataView(archive.buffer)
  const centralOffset = view.getUint32(archive.length - 22 + 16, true)
  view.setUint16(8, 12, true) // local header: BZIP2
  view.setUint16(centralOffset + 10, 12, true) // central directory: BZIP2

  await assert.rejects(readZip(archive), /Unsupported ZIP compression method 12 on "a\.txt"/)
})

test("readZip refuses a ZIP64 archive rather than mis-parsing it", async () => {
  const archive = createZip([{ name: "a.txt", data: "x" }])
  const view = new DataView(archive.buffer)
  // Both counts set to the sentinel, as a ZIP64 end record writes them: the real
  // ones live in the 64-bit record this reader does not read.
  view.setUint16(archive.length - 22 + 8, 0xffff, true)
  view.setUint16(archive.length - 22 + 10, 0xffff, true)

  await assert.rejects(readZip(archive), /ZIP64/)
})

test("readZip returns an empty record for an empty archive", async () => {
  assert.deepEqual(await readZip(createZip([])), {})
})

test("readZip inflates a DEFLATE entry larger than one stream chunk", async () => {
  const body = "The quick brown fox jumps over the lazy dog. ".repeat(400)
  const archive = await createDeflatedZip([{ name: "word/document.xml", data: body }])
  const view = new DataView(archive.buffer)

  const parts = await readZip(archive)
  assert.equal(decoder.decode(parts["word/document.xml"]), body)
  // Really compressed: the stored bytes are shorter than the contents.
  assert.ok(view.getUint32(18, true) < body.length)
})

// ---------------------------------------------------------------------------
// The Studio seam: blocks <-> document HTML <-> blocks
// ---------------------------------------------------------------------------

test("blocks survive the document HTML the editor is handed", () => {
  const html = blocksToDocumentHtml(documentBlocks)
  assert.deepEqual(blocksFromDocumentHtml(html), documentBlocks)
  // The HTML is a skeleton of plain elements, not themed markup or script.
  assert.equal(html.includes("<script"), false)
  assert.equal(html.includes("class=\"learn-block"), false)
})

test("blocks with no document element degrade to readable text, never to nothing", () => {
  const html = blocksToDocumentHtml([
    { type: "callout", tone: "warn", text: "Careful" },
    { type: "image", url: "https://example.com/a.png", alt: "A diagram" },
    { type: "image", url: "javascript:alert(1)", alt: "Unsafe" },
    { type: "quiz", title: "Check", questions: [{ question: "2 + 2?", choices: [{ id: "A", text: "4" }], answerId: "A" }] },
    { type: "slideOutline", title: "Deck", slides: [{ title: "Intro", bullets: ["One"] }] },
  ])

  assert.match(html, /\[WARN\] Careful/)
  assert.match(html, /<img src="https:\/\/example\.com\/a\.png" alt="A diagram">/)
  assert.match(html, /<p>Unsafe<\/p>/, "an unsafe URL keeps the text and drops the target")
  assert.equal(html.includes("javascript:"), false)
  assert.match(html, /<h2>Check<\/h2>/)
  assert.match(html, /<li>A\. 4<\/li>/)
  assert.match(html, /<h1>Deck<\/h1>/)
  assert.match(html, /<h2>Slide 1: Intro<\/h2>/)
})

test("document HTML escapes text instead of emitting it as markup", () => {
  const hostile = `<img src=x onerror="alert(1)"> & 'quotes'`
  const html = blocksToDocumentHtml([
    { type: "paragraph", text: hostile },
    { type: "heading", level: 2, text: "<script>alert(1)</script>" },
    { type: "table", headers: ["<b>bold</b>"], rows: [[hostile]] },
    { type: "code", language: "html", code: `<div class="x">&</div>` },
  ])

  assert.equal(html.includes("<script>"), false)
  assert.equal(html.includes("onerror=\"alert"), false)
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt; &amp; 'quotes'/)
  assert.match(html, /&lt;b&gt;bold&lt;\/b&gt;/)
  assert.match(html, /&lt;div class=&quot;x&quot;&gt;&amp;&lt;\/div&gt;/)
})

// ---------------------------------------------------------------------------
// The file-level seam the Studio buttons call
// ---------------------------------------------------------------------------

test("a picked File becomes the payload each Studio editor holds", async () => {
  const docx = new Blob([buildDocx({ title: DOCUMENT_TITLE, blocks: documentBlocks }) as BlobPart])
  const document = await studioDocumentFromDocxFile(docx)
  assert.equal(document.title, DOCUMENT_TITLE)
  assert.deepEqual(document.blocks, documentBlocks)
  assert.deepEqual(blocksFromDocumentHtml(document.html), documentBlocks)

  const xlsx = new Blob([buildXlsx({ title: "Tracker", cells: [["Label", "Count", "Done"], ["alpha", 12, true]] }) as BlobPart])
  const sheet = await studioSheetFromXlsxFile(xlsx)
  assert.equal(sheet.title, "Tracker")
  assert.deepEqual(sheet.cells, [["Label", "Count", "Done"], ["alpha", "12", "TRUE"]], "a sheet grid is text")
  assert.deepEqual({ rows: sheet.rowCount, columns: sheet.columnCount }, { rows: 2, columns: 3 })
})

test("a failed import produces a message, never an unhandled rejection", async () => {
  const junk = new Blob([new Uint8Array([1, 2, 3, 4]) as BlobPart])
  await assert.rejects(studioDocumentFromDocxFile(junk), (error: unknown) => {
    assert.match(describeImportFailure(error), /^Import failed: Word document: Not a ZIP archive/)
    return true
  })
  assert.match(describeImportFailure(new Error("boom")), /^Import failed: boom$/)
  assert.equal(describeImportFailure(undefined), "Import failed: the file could not be read.")
})
