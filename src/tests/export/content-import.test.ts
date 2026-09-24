import assert from "node:assert/strict"
import test from "node:test"
import { deflateRawSync } from "node:zlib"
import { createZip, readZip } from "../../lib/export/zip"
import { importPptx } from "../../lib/export/pptx-import"
import { importPdf } from "../../lib/export/pdf-import"
import { buildPdf } from "../../lib/export/pdf"
import { parseXml } from "../../lib/export/xml-read"
import type { ThemedBlock } from "../../lib/ai/format-response"

const relationships = (content: string) => `<Relationships>${content}</Relationships>`
const relation = (id: string, target: string, type: string, extra = "") => `<Relationship Id="${id}" Target="${target}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" ${extra}/>`
const shape = (text: string, type = "body") => `<p:sp><p:nvSpPr><p:nvPr><p:ph type="${type}"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>`
function presentation(overrides: Record<string, string> = {}) {
  const parts = {
    "ppt/presentation.xml": '<p:presentation xmlns:p="p" xmlns:rel="relationships"><p:sldIdLst><p:sldId id="260" rel:id="first"/><p:sldId id="255" rel:id="second"/></p:sldIdLst></p:presentation>',
    "ppt/_rels/presentation.xml.rels": relationships(relation("second", "slides/slide1.xml", "slide") + relation("first", "slides/custom.xml", "slide")),
    "ppt/slides/custom.xml": `<p:sld show="0"><p:cSld><p:spTree>${shape("First &amp; ordered", "title")}${shape("Body <a:br/> continuation")}</p:spTree></p:cSld></p:sld>`,
    "ppt/slides/slide1.xml": `<p:sld><p:cSld><p:spTree>${shape("Second", "ctrTitle")}${shape("Other body")}</p:spTree></p:cSld></p:sld>`,
    "ppt/slides/_rels/custom.xml.rels": relationships(relation("notes", "../notesSlides/unrelated.xml", "notesSlide")),
    "ppt/notesSlides/unrelated.xml": `<p:notes>${shape("Speaker note preserved")}${shape("57", "sldNum")}</p:notes>`,
    "docProps/core.xml": "<coreProperties><title>Imported deck</title></coreProperties>",
    ...overrides,
  }
  return createZip(Object.entries(parts).map(([name, data]) => ({ name, data })))
}

test("PPTX follows relationship order, resolves notes, excludes slide numbers, preserves hidden slides", async () => {
  const result = await importPptx(presentation())
  assert.equal(result.title, "Imported deck")
  assert.deepEqual(result.slides.map((slide) => slide.title), ["First & ordered", "Second"])
  assert.equal(result.slides[0].body, "Body \n continuation")
  assert.equal(result.slides[0].speakerNotes, "Speaker note preserved")
  assert.equal(result.slides[0].hidden, true)
  assert.match(result.warnings.join(" "), /images.*not preserved/)
})

test("PPTX refuses external, escaping, or missing slide relationships", async () => {
  for (const rel of [relation("first", "https://example.org/slide.xml", "slide", 'TargetMode="External"'), relation("first", "../../outside.xml", "slide"), relation("different", "slides/custom.xml", "slide")]) {
    await assert.rejects(importPptx(presentation({ "ppt/_rels/presentation.xml.rels": relationships(rel) })), /relationship/)
  }
})

test("PPTX resolves package-relative percent-encoded content filenames", async () => {
  const result = await importPptx(presentation({
    "ppt/slides/_rels/custom.xml.rels": relationships(relation("notes", "../notesSlides/my%20notes.xml", "notesSlide")),
    "ppt/notesSlides/my notes.xml": `<p:notes>${shape("Encoded filename notes")}</p:notes>`,
  }))
  assert.equal(result.slides[0].speakerNotes, "Encoded filename notes")
})

test("PPTX bounds slide count and XML complexity before traversal", async () => {
  const ids = Array.from({ length: 101 }, (_, index) => `<p:sldId id="${index}" r:id="first"/>`).join("")
  await assert.rejects(importPptx(presentation({ "ppt/presentation.xml": `<p:presentation><p:sldIdLst>${ids}</p:sldIdLst></p:presentation>` })), /at most 100/)
  assert.throws(() => parseXml("<a>".repeat(50) + "x" + "</a>".repeat(50), "deep", { maxDepth: 40 }), /complexity/)
  assert.throws(() => parseXml("<a><b/><b/></a>", "wide", { maxNodes: 2 }), /complexity/)
})

test("ZIP rejects declared and actual expanded content beyond limits", async () => {
  const archive = createZip([{ name: "x", data: "a".repeat(1000) }])
  await assert.rejects(readZip(archive, { maxEntryBytes: 999 }), /size limit/)
  await assert.rejects(readZip(archive, { maxTotalBytes: 999 }), /size limit/)
  await assert.rejects(readZip(archive, { maxEntries: 0 }), /too many/)
  await assert.rejects(readZip(archive, { maxArchiveBytes: 50 }), /size limit/)
  // A malicious directory understates DEFLATE output: stop while reading, before allocating it all.
  const compressed = deflateRawSync(Buffer.from("a".repeat(100_000)))
  const packed = createZip([{ name: "x", data: compressed }])
  const view = new DataView(packed.buffer)
  const directory = 31 + compressed.length
  view.setUint16(8, 8, true)
  view.setUint16(directory + 10, 8, true)
  view.setUint32(directory + 24, 1, true)
  await assert.rejects(readZip(packed, { maxEntryBytes: 10 }), /could not be inflated/)
})

test("real PDF.js reads exported text and keeps explicit page boundaries editable", async () => {
  const engine = await import("pdfjs-dist/legacy/build/pdf.mjs")
  const bytes = buildPdf({ title: "Text lesson", footer: false, blocks: [{ type: "paragraph", text: "First page text" }, { type: "divider", pageBreak: true }, { type: "paragraph", text: "Second page text" }] })
  const result = await importPdf(bytes, engine)
  assert.equal(result.title, "Text lesson")
  assert.equal(result.pages.length, 2)
  assert.match(result.pages[0], /First page text/)
  assert.match(result.pages[1], /Second page text/)
  assert.match(result.html, /data-studio-page="true"/)
  assert.match(result.warnings[0], /OCR is not included/)
})

test("PDF rejects corrupt and textless input instead of pretending to import", async () => {
  const engine = await import("pdfjs-dist/legacy/build/pdf.mjs")
  await assert.rejects(importPdf(new TextEncoder().encode("not a pdf"), engine))
  const blank = buildPdf({ title: "Untitled", footer: false, blocks: [] })
  const marker = new TextEncoder().encode("(Untitled) Tj")
  const markerOffset = Buffer.from(blank).indexOf(marker)
  assert.ok(markerOffset > 0)
  blank.fill(32, markerOffset, markerOffset + marker.length)
  await assert.rejects(importPdf(blank, engine), /no extractable text/)
  await assert.rejects(importPdf(new Uint8Array(25 * 1024 * 1024 + 1), engine), /25 MB/)
})

test("PDF enforces its page limit with a real multi-page document", async () => {
  const engine = await import("pdfjs-dist/legacy/build/pdf.mjs")
  const blocks: ThemedBlock[] = []
  for (let page = 0; page < 201; page += 1) {
    if (page) blocks.push({ type: "divider", pageBreak: true })
    blocks.push({ type: "paragraph", text: `Text on page ${page + 1}` })
  }
  await assert.rejects(importPdf(buildPdf({ title: "Many pages", footer: false, blocks }), engine), /at most 200 pages/)
})
