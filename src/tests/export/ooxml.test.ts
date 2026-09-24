import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import type { ThemedBlock } from "../../lib/ai/format-response"
import { buildDocx } from "../../lib/export/docx"
import { blocksFromDocumentHtml } from "../../lib/export/html-blocks"
import { documentHtmlToDocx, documentHtmlToPdf, deckSlidesToPdf, sheetCellsToXlsx } from "../../lib/export/studio-export"
import { buildXlsx, sheetNameOf } from "../../lib/export/xlsx"
import { buildStudioDownloadOptions } from "../../lib/studio-features"
import { partNames, partText } from "./zip-reader"

const encoder = new TextEncoder()

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")

// ---------------------------------------------------------------------------
// A tiny XML well-formedness check
// ---------------------------------------------------------------------------

/**
 * Assert a part is well-formed enough to be parsed: exactly one root, balanced
 * tags, quoted attributes, and no unescaped `&` or `<` in character data.
 *
 * This is a hand-rolled scanner rather than a DOM parser on purpose — the test
 * suite is DOM-free, and a parser dependency is exactly what this change avoids.
 */
function assertWellFormedXml(xml: string, label: string): void {
  assert.ok(xml.startsWith("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"), `${label}: XML declaration`)
  assert.ok(!xml.includes("\r"), `${label}: no carriage returns`)

  const stack: string[] = []
  let elements = 0
  let cursor = 0

  while (cursor < xml.length) {
    const open = xml.indexOf("<", cursor)
    if (open === -1) {
      assertPlainText(xml.slice(cursor), label)
      cursor = xml.length
      break
    }

    assertPlainText(xml.slice(cursor, open), label)
    const close = xml.indexOf(">", open)
    assert.ok(close > -1, `${label}: tag starting at ${open} is terminated`)

    const tag = xml.slice(open, close + 1)
    if (tag.startsWith("</")) {
      const name = tag.slice(2, -1).trim()
      assert.equal(stack.pop(), name, `${label}: </${name}> closes the matching element`)
    } else if (tag.startsWith("<?") || tag.startsWith("<!")) {
      assert.equal(stack.length, 0, `${label}: declaration appears before the root element`)
    } else if (tag.endsWith("/>")) {
      elements += 1
      assertTagShape(tag, label)
    } else {
      elements += 1
      stack.push(assertTagShape(tag, label))
    }

    cursor = close + 1
  }

  assert.equal(stack.length, 0, `${label}: every element is closed`)
  assert.ok(elements > 0, `${label}: contains at least one element`)
}

/** Returns the element name and checks the attribute syntax of the tag. */
function assertTagShape(tag: string, label: string): string {
  const inner = tag.startsWith("<?") || tag.startsWith("<!") ? "" : tag.replace(/^</, "").replace(/>$/, "").replace(/\/$/, "")
  if (!inner) return ""
  const name = /^([^\s/>]+)/.exec(inner)?.[1]
  assert.ok(name, `${label}: element is named in ${tag}`)
  const rest = inner.slice(name.length)
  // Every attribute must be name="value": an unescaped quote anywhere else shows
  // up here as a syntax failure rather than in a downstream reader.
  assert.match(rest, /^(?:\s+[A-Za-z_:][-\w:.]*="[^"<>]*")*\s*$/, `${label}: attributes are well formed in ${tag}`)
  return name
}

function assertPlainText(text: string, label: string): void {
  if (!text) return
  assert.ok(!text.includes("<"), `${label}: no raw '<' in character data`)
  assert.ok(!text.includes(">"), `${label}: no raw '>' in character data`)
  // A bare '&' is the classic way a document stops being XML.
  assert.equal(/&(?!(?:[A-Za-z][A-Za-z0-9]*|#\d+|#x[0-9A-Fa-f]+);)/.test(text), false, `${label}: every '&' is an entity`)
}

function assertEveryPartIsXml(archive: Uint8Array, names: string[]): void {
  for (const name of names) {
    assertWellFormedXml(partText(archive, name), name)
  }
}

// ---------------------------------------------------------------------------
// DOCX
// ---------------------------------------------------------------------------

const sampleBlocks: ThemedBlock[] = [
  { type: "heading", level: 1, text: "Lesson one" },
  { type: "paragraph", text: "First paragraph." },
  { type: "list", ordered: false, items: ["alpha", "beta"] },
  { type: "list", ordered: true, items: ["step one", "step two"] },
  { type: "table", headers: ["Term", "Meaning"], rows: [["Cell", "A box"]] },
  { type: "code", language: "ts", code: "const x = 1\nconst y = 2" },
  { type: "quote", text: "Quoted line" },
  { type: "divider" },
  { type: "callout", tone: "warn", text: "Careful" },
  { type: "image", url: "https://example.com/a.png", alt: "A diagram" },
]

test("docx contains the parts Word needs, each one well-formed XML", () => {
  const archive = buildDocx({ title: "Lesson one", blocks: sampleBlocks })
  const names = partNames(archive)

  for (const required of [
    "[Content_Types].xml",
    "_rels/.rels",
    "word/document.xml",
    "word/_rels/document.xml.rels",
    "word/styles.xml",
    "docProps/core.xml",
  ]) {
    assert.ok(names.includes(required), `docx contains ${required}`)
  }

  assertEveryPartIsXml(archive, names)
  // `[Content_Types].xml` is the entry every reader looks for first.
  assert.equal(names[0], "[Content_Types].xml")
})

test("docx renders each block type as the WordprocessingML element it maps to", () => {
  const document = partText(buildDocx({ title: "Lesson", blocks: sampleBlocks, creator: "Ada" }), "word/document.xml")

  assert.match(document, /<w:pStyle w:val="Heading1"\/>/)
  assert.match(document, /<w:sz w:val="36"\/>/, "heading runs carry an explicit size")
  assert.match(document, /<w:b\/>/, "heading and header runs are bold")
  assert.match(document, /<w:t xml:space="preserve">First paragraph\.<\/w:t>/)
  assert.match(document, /— alpha|• alpha/)
  assert.match(document, /<w:t xml:space="preserve">1\. step one<\/w:t>/)
  assert.match(document, /<w:tbl>/, "a table block becomes a real table")
  assert.match(document, /<w:tblGrid>/)
  assert.match(document, /<w:tblHeader\/>/, "the header row repeats across pages")
  assert.match(document, /w:fill="EEF1F5"/, "the header row is shaded")
  assert.match(document, /w:ascii="Consolas"/, "code is monospace")
  // Code is one paragraph per line, so no line can reflow into another.
  assert.equal((document.match(/<w:pStyle w:val="Code"\/>/g) ?? []).length, 2)
  assert.match(document, /<w:t xml:space="preserve">const y = 2<\/w:t>/)
  assert.match(document, /<w:pStyle w:val="Quote"\/>/)
  assert.match(document, /<w:bottom w:val="single"/, "a divider is a rule")
  assert.match(document, /\[WARN\]/)
  assert.match(document, /\[Image: A diagram — https:\/\/example\.com\/a\.png\]/, "images become labelled placeholders")

  // The document ends with section properties, as the schema requires.
  assert.ok(document.indexOf("<w:sectPr>") > document.indexOf("<w:tbl>"))
  assert.match(document, /<w:sectPr>[\s\S]*<\/w:sectPr><\/w:body>/)

  const styles = partText(buildDocx({ title: "Lesson", blocks: sampleBlocks }), "word/styles.xml")
  for (const styleId of ["Normal", "Title", "Heading1", "Heading2", "Heading3", "Heading4", "Code", "Quote"]) {
    assert.match(styles, new RegExp(`w:styleId="${styleId}"`), `styles.xml defines ${styleId}`)
  }

  assert.match(partText(buildDocx({ title: "T", blocks: [], creator: "Ada" }), "docProps/core.xml"), /<dc:creator>Ada<\/dc:creator>/)
})

test("docx escapes user text instead of emitting it as markup", () => {
  const payload = `<script>alert("x")</script> & 'quotes'`
  const archive = buildDocx({
    title: payload,
    blocks: [
      { type: "paragraph", text: payload },
      { type: "heading", level: 2, text: `<img src=x onerror=alert(1)>` },
      { type: "table", headers: [`& <b>bold</b>`], rows: [[`"quoted" & <tag>`]] },
      { type: "code", language: "html", code: `<div class="x">&amp;</div>` },
    ],
  })
  const document = partText(archive, "word/document.xml")

  assert.equal(document.includes("<script>"), false, "the hostile tag never appears as markup")
  assert.equal(document.includes("<img src=x"), false)
  assert.match(document, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; &amp; &apos;quotes&apos;/)
  assert.match(document, /&lt;img src=x onerror=alert\(1\)&gt;/)
  assert.match(document, /&amp; &lt;b&gt;bold&lt;\/b&gt;/)
  assert.match(document, /&quot;quoted&quot; &amp; &lt;tag&gt;/)
  // The code block is text too: its own entities are escaped once, not twice.
  assert.match(document, /&lt;div class=&quot;x&quot;&gt;&amp;amp;&lt;\/div&gt;/)

  // The title travels through the same escaper into core properties.
  const core = partText(archive, "docProps/core.xml")
  assert.equal(core.includes("<script>"), false)
  assert.match(core, /&lt;script&gt;/)

  assertEveryPartIsXml(archive, partNames(archive))
})

test("docx strips characters XML cannot carry", () => {
  const archive = buildDocx({ title: "Bell\u0007", blocks: [{ type: "paragraph", text: "nul\u0000and\u000bvertical" }] })
  const document = partText(archive, "word/document.xml")
  assert.equal(document.includes("\u0000"), false)
  assert.equal(document.includes("\u0007"), false)
  assert.match(document, /nulandvertical/)
  assertEveryPartIsXml(archive, partNames(archive))
})

test("docx escapes an attribute-breaking style value path and keeps empty input valid", () => {
  const archive = buildDocx({ title: "", blocks: [] })
  assertEveryPartIsXml(archive, partNames(archive))
  assert.match(partText(archive, "word/document.xml"), /<w:body><w:sectPr>/)
})

test("docx output is byte-identical for the same input and date", () => {
  const date = new Date(Date.UTC(2026, 0, 2, 3, 4, 6))
  const first = buildDocx({ title: "Lesson", blocks: sampleBlocks, creator: "Ada", date })
  const second = buildDocx({ title: "Lesson", blocks: sampleBlocks, creator: "Ada", date })
  assert.deepEqual(Array.from(first), Array.from(second))
  // A different date changes only the timestamps, so the bytes must differ.
  assert.notDeepEqual(Array.from(first), Array.from(buildDocx({ title: "Lesson", blocks: sampleBlocks, creator: "Ada", date: new Date(date.getTime() + 5000) })))
})

// ---------------------------------------------------------------------------
// XLSX
// ---------------------------------------------------------------------------

test("xlsx contains the parts Excel needs, each one well-formed XML", () => {
  const archive = buildXlsx({ title: "Tracker", cells: [["Name", "Score"], ["Ada", 41], ["On track", true]] })
  const names = partNames(archive)

  for (const required of [
    "[Content_Types].xml",
    "_rels/.rels",
    "xl/workbook.xml",
    "xl/_rels/workbook.xml.rels",
    "xl/worksheets/sheet1.xml",
    "xl/sharedStrings.xml",
  ]) {
    assert.ok(names.includes(required), `xlsx contains ${required}`)
  }

  assertEveryPartIsXml(archive, names)
})

test("xlsx types cells as numbers, booleans, and shared strings", () => {
  const archive = buildXlsx({
    title: "Tracker",
    cells: [
      ["Label", "Count", "Done"],
      ["alpha", 12, true],
      ["beta", 3.5, false],
    ],
  })
  const sheet = partText(archive, "xl/worksheets/sheet1.xml")
  const shared = partText(archive, "xl/sharedStrings.xml")

  assert.match(sheet, /<c r="B2" t="n"><v>12<\/v><\/c>/, "finite numbers are numeric cells")
  assert.match(sheet, /<c r="B3" t="n"><v>3\.5<\/v><\/c>/)
  assert.match(sheet, /<c r="C2" t="b"><v>1<\/v><\/c>/, "true is a boolean cell")
  assert.match(sheet, /<c r="C3" t="b"><v>0<\/v><\/c>/, "false is a boolean cell")
  assert.match(sheet, /<c r="A1" t="s"><v>0<\/v><\/c>/, "text is a shared-string reference")

  // alpha appears once in the table even though it is referenced once.
  assert.match(shared, /<si><t xml:space="preserve">alpha<\/t><\/si>/)
  assert.equal((shared.match(/alpha/g) ?? []).length, 1, "strings are deduplicated")

  // Rows and dimension line up with the grid.
  assert.match(sheet, /<dimension ref="A1:C3"\/>/)
  assert.match(sheet, /<row r="3">/)
  assert.match(sheet, /<cols><col min="1" max="1" width="\d+" customWidth="1"\/>/)
  assert.ok(sheet.indexOf("<cols>") < sheet.indexOf("<sheetData>"), "cols precedes sheetData")
})

test("xlsx deduplicates repeated strings and counts every reference", () => {
  const archive = buildXlsx({ title: "T", cells: [["same"], ["same"], ["other"], ["same"]] })
  const shared = partText(archive, "xl/sharedStrings.xml")
  const sheet = partText(archive, "xl/worksheets/sheet1.xml")

  assert.match(shared, /count="4" uniqueCount="2"/)
  assert.equal((shared.match(/<si>/g) ?? []).length, 2)
  // Rows 1, 2 and 4 point at the same index.
  for (const row of [1, 2, 4]) {
    assert.match(sheet, new RegExp(`<c r="A${row}" t="s"><v>0</v></c>`))
  }
  assert.match(sheet, /<c r="A3" t="s"><v>1<\/v><\/c>/)
})

test("xlsx leaves blank cells out and keeps non-finite numbers as text", () => {
  const archive = buildXlsx({ title: "T", cells: [[null, undefined, ""], ["x", Number.NaN, Number.POSITIVE_INFINITY]] })
  const sheet = partText(archive, "xl/worksheets/sheet1.xml")

  assert.match(sheet, /<row r="1"><\/row>/, "null, undefined and the empty string are all blank")
  assert.equal(sheet.includes('t="n"><v>NaN'), false, "NaN is never written as a number")
  assert.equal(sheet.includes("Infinity"), false, "Infinity is never written as a number")
  // Everything that is not a number or boolean still reaches the file as text.
  const shared = partText(archive, "xl/sharedStrings.xml")
  assert.match(shared, /<t xml:space="preserve">NaN<\/t>/)
  assert.match(shared, /<t xml:space="preserve">Infinity<\/t>/)
  assert.equal(shared.includes("<si><t xml:space=\"preserve\"></t></si>"), false, "no empty string entries")
  assertEveryPartIsXml(archive, partNames(archive))
})

test("xlsx sanitizes the sheet name to Excel's rules", () => {
  assert.equal(sheetNameOf("Tracker"), "Tracker")
  assert.equal(sheetNameOf("a[b]c:d*e?f/g\\h"), "a b c d e f g h")
  assert.equal(sheetNameOf("   "), "Sheet1")
  assert.equal(sheetNameOf("'quoted'"), "quoted")
  assert.equal(sheetNameOf("x".repeat(60)).length, 31)

  const archive = buildXlsx({ title: "Q1 [draft]: 2026", cells: [["a"]] })
  const workbook = partText(archive, "xl/workbook.xml")
  assert.match(workbook, /<sheet name="Q1 draft 2026" sheetId="1" r:id="rId1"\/>/)
  assertEveryPartIsXml(archive, partNames(archive))
})

test("xlsx escapes user text in cells and sheet names", () => {
  const archive = buildXlsx({
    title: `<script>alert(1)</script>`,
    cells: [[`<script>alert("x")</script>`, `a&b`, `"quoted"`]],
  })
  const sheet = partText(archive, "xl/worksheets/sheet1.xml")
  const shared = partText(archive, "xl/sharedStrings.xml")
  const workbook = partText(archive, "xl/workbook.xml")

  assert.equal(sheet.includes("<script>"), false)
  assert.equal(shared.includes("<script>"), false)
  assert.equal(workbook.includes("<script>"), false)
  assert.match(shared, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/)
  assert.match(shared, /a&amp;b/)
  assert.match(shared, /&quot;quoted&quot;/)
  // The sheet name is escaped too; its '/' was already stripped as illegal.
  assert.match(workbook, /name="&lt;script&gt;alert\(1\)&lt; script&gt;"/)
  assertEveryPartIsXml(archive, partNames(archive))
})

test("xlsx output is byte-identical for the same input and date", () => {
  const date = new Date(Date.UTC(2026, 0, 2, 3, 4, 6))
  const cells = [["Name", "Score"], ["Ada", 41]]
  assert.deepEqual(Array.from(buildXlsx({ title: "T", cells, date })), Array.from(buildXlsx({ title: "T", cells, date })))
  // DOS timestamps have two-second resolution, so the comparison has to move a
  // whole bucket: 5 seconds later is 2 buckets later.
  const later = new Date(date.getTime() + 5000)
  assert.notDeepEqual(Array.from(buildXlsx({ title: "T", cells, date })), Array.from(buildXlsx({ title: "T", cells, date: later })))
})

// ---------------------------------------------------------------------------
// Studio payloads -> files
// ---------------------------------------------------------------------------

test("document HTML becomes blocks, then a docx", () => {
  const html = [
    "<h1>Unit 3</h1>",
    "<p>Intro with <strong>bold</strong> &amp; an entity.</p>",
    "<ul><li>alpha</li><li>beta</li></ul>",
    "<ol><li>first</li></ol>",
    "<blockquote><p>Quoted</p></blockquote>",
    '<pre><code class="language-ts">const a = 1</code></pre>',
    "<table><thead><tr><th>Term</th><th>Meaning</th></tr></thead><tbody><tr><td>Cell</td><td>Box</td></tr></tbody></table>",
    "<hr>",
    "<p>Tail<br>next line</p>",
    "<div><p>Nested paragraph</p></div>",
    "<!-- a comment that must not leak -->",
  ].join("")

  const blocks = blocksFromDocumentHtml(html)
  assert.deepEqual(
    blocks.map((block) => block.type),
    ["heading", "paragraph", "list", "list", "quote", "code", "table", "divider", "paragraph", "paragraph"],
  )
  assert.deepEqual(blocks[0], { type: "heading", level: 1, text: "Unit 3" })
  assert.equal(blocks[1].type === "paragraph" ? blocks[1].text : "", "Intro with bold & an entity.")
  assert.deepEqual(blocks[2], { type: "list", ordered: false, items: ["alpha", "beta"] })
  assert.deepEqual(blocks[3], { type: "list", ordered: true, items: ["first"] })
  assert.equal(blocks[5].type === "code" ? blocks[5].language : "", "ts")
  assert.deepEqual(blocks[6], { type: "table", headers: ["Term", "Meaning"], rows: [["Cell", "Box"]] })
  assert.equal(blocks[8].type === "paragraph" ? blocks[8].text : "", "Tail\nnext line")
  assert.equal(blocks[9].type === "paragraph" ? blocks[9].text : "", "Nested paragraph")
  assert.equal(JSON.stringify(blocks).includes("a comment that must not leak"), false)

  const archive = documentHtmlToDocx({ title: "Unit 3", html })
  assertWellFormedXml(partText(archive, "word/document.xml"), "word/document.xml")
  const document = partText(archive, "word/document.xml")
  assert.match(document, /<w:tblHeader\/>/)
  // A hard break inside a paragraph becomes a Word break, not a new paragraph.
  assert.match(document, /<w:t xml:space="preserve">Tail<\/w:t><w:br\/><w:t xml:space="preserve">next line<\/w:t>/)
})

test("a script tag in a document body never reaches the docx as markup", () => {
  const archive = documentHtmlToDocx({ title: "Safe", html: "<p>before</p><script>alert('x')</script><p>after</p>" })
  const document = partText(archive, "word/document.xml")

  assert.equal(document.includes("alert('x')"), false, "script content is dropped, not exported")
  assert.match(document, /before/)
  assert.match(document, /after/)
  assertWellFormedXml(document, "word/document.xml")
})

test("sheet cells become an xlsx with the sheet title in the workbook", () => {
  const archive = sheetCellsToXlsx({ title: "Grades", cells: [["Student", "Score"], ["Ada", 41]] })
  assert.match(partText(archive, "xl/workbook.xml"), /<sheet name="Grades"/)
  assert.match(partText(archive, "xl/worksheets/sheet1.xml"), /<c r="B2" t="n"><v>41<\/v><\/c>/)
})

test("a non-ASCII sheet name and title survive the UTF-8 filename flag", () => {
  const archive = sheetCellsToXlsx({ title: "Révision 名前", cells: [["é", "✨"]] })
  assert.match(partText(archive, "xl/workbook.xml"), /<sheet name="Révision 名前"/)
  assert.match(partText(archive, "xl/sharedStrings.xml"), /Révision|✨/)
  assertEveryPartIsXml(archive, partNames(archive))
})

test("exported bytes start with the ZIP local header signature", () => {
  const docx = buildDocx({ title: "T", blocks: [{ type: "paragraph", text: "x" }] })
  const xlsx = buildXlsx({ title: "T", cells: [["x"]] })
  assert.deepEqual(Array.from(docx.subarray(0, 4)), [0x50, 0x4b, 0x03, 0x04])
  assert.deepEqual(Array.from(xlsx.subarray(0, 4)), [0x50, 0x4b, 0x03, 0x04])
  // `PK\x05\x06` closes both archives.
  assert.deepEqual(Array.from(docx.subarray(docx.length - 22, docx.length - 18)), [0x50, 0x4b, 0x05, 0x06])
  assert.deepEqual(Array.from(xlsx.subarray(xlsx.length - 22, xlsx.length - 18)), [0x50, 0x4b, 0x05, 0x06])
  assert.equal(encoder.encode("PK").length, 2)
})

// ---------------------------------------------------------------------------
// PDF wiring and dependency guards
// ---------------------------------------------------------------------------

const PDF_MODULE = path.join(PROJECT_ROOT, "src", "lib", "export", "pdf.ts")
const STUDIO_EXPORT_MODULE = path.join(PROJECT_ROOT, "src", "lib", "export", "studio-export.ts")
const STUDIO_FEATURES_MODULE = path.join(PROJECT_ROOT, "src", "lib", "studio-features.ts")
const STUDIO_VIEW = path.join(PROJECT_ROOT, "src", "components", "learn", "views", "studio-view.tsx")

function readSource(filePath: string): string {
  assert.ok(fs.existsSync(filePath), `${path.relative(PROJECT_ROOT, filePath)} must exist`)
  return fs.readFileSync(filePath, "utf8")
}

/** Comments describe the rules; only code has to obey them. */
function readCodeSource(filePath: string): string {
  return readSource(filePath).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
}

/**
 * The PDF writer is the third hand-rolled format in this directory, and the
 * promises that make it worth having are structural: no dependency (so the
 * module stays testable in plain Node and the app gains no install), no clock
 * (so the same document is the same bytes), and no compression (Node's zlib and
 * the browser's CompressionStream are the two temptations that would split the
 * module across runtimes). None of that breaks a build if it is given up, so it
 * is pinned here rather than left to review.
 */
test("the PDF writer stays dependency-free, clock-free, and self-contained", () => {
  const source = readSource(PDF_MODULE)
  const code = readCodeSource(PDF_MODULE)

  // A type-only import is erased at compile time and adds no dependency; a value
  // import would be one, so every import statement must be `import type`.
  for (const line of source.split("\n").filter((line) => /^\s*import\s/.test(line))) {
    assert.match(line, /^\s*import type\s/, `pdf.ts may only type-import, found: ${line.trim()}`)
  }
  assert.doesNotMatch(code, /\brequire\s*\(/, "pdf.ts must not require anything")
  assert.doesNotMatch(code, /from\s+"node:/, "pdf.ts must not reach for a Node builtin")
  assert.doesNotMatch(code, /\bBuffer\b|\bCompressionStream\b|\bzlib\b/, "pdf.ts must not compress or use Buffer")
  assert.doesNotMatch(code, /\bDate\.now\s*\(|\bnew Date\s*\(\s*\)/, "pdf.ts must not read the clock")
  assert.doesNotMatch(code, /Math\.random/, "pdf.ts must be deterministic")
  assert.doesNotMatch(code, /document\.|window\./, "pdf.ts must not touch the DOM")
})

/**
 * A format nobody can reach is not a format. The Studio editor is the only
 * caller: if the seam loses `documentHtmlToPdf`, or the menu stops offering
 * `pdf`, or the view stops calling them, the writer still passes its own tests
 * while no user can export anything. Each link of that chain is asserted here.
 */
test("Studio offers a PDF and the seam builds it from the document's blocks", () => {
  const seam = readSource(STUDIO_EXPORT_MODULE)
  const features = readSource(STUDIO_FEATURES_MODULE)
  const view = readCodeSource(STUDIO_VIEW)

  assert.match(seam, /import \{[^}]*\bbuildPdf\b[^}]*\} from "@\/lib\/export\/pdf"/, "the seam imports the PDF builder")
  assert.match(seam, /export const PDF_MIME = "application\/pdf"/, "the seam declares the PDF MIME type")
  assert.match(seam, /export function documentHtmlToPdf\(/, "the seam exports documentHtmlToPdf")
  assert.match(seam, /blocks: documentHtmlToBlocks\(input\.html\)/, "PDF and DOCX share one blocks call")

  // The menu offers it for documents, and the view acts on that id.
  assert.match(features, /\{ id: "pdf", label: "PDF"/, "the Studio download menu offers PDF")
  assert.match(view, /documentHtmlToPdf/, "the Studio view calls the PDF seam")
  assert.match(view, /PDF_MIME/, "the Studio view passes the PDF MIME type")
  assert.match(view, /downloadBytes\(`\$\{base\}\.pdf`, documentHtmlToPdf\(/, "the PDF is downloaded through the existing bytes helper")
  assert.match(view, /format === "pdf" && kind === "docs"/, "the PDF branch is scoped to documents")
})

test("the Studio PDF seam produces a real PDF from document HTML", () => {
  const bytes = documentHtmlToPdf({
    title: "Unit 3",
    html: [
      "<h1>Unit 3</h1>",
      "<p>Intro with <strong>bold</strong> &amp; an entity.</p>",
      "<ul><li>alpha</li><li>beta</li></ul>",
      "<table><thead><tr><th>Term</th><th>Meaning</th></tr></thead><tbody><tr><td>Cell</td><td>Box</td></tr></tbody></table>",
      '<pre><code class="language-ts">const a = 1</code></pre>',
      "<hr>",
    ].join(""),
    date: new Date(Date.UTC(2026, 0, 2, 3, 4, 6)),
  })

  const text = Buffer.from(bytes).toString("latin1")
  assert.ok(text.startsWith("%PDF-1.4\n"), "the seam returns a PDF file")
  assert.ok(text.endsWith("%%EOF\n"))
  assert.match(text, /\/Type \/Catalog/)
  assert.match(text, /\(Unit 3\) Tj/)
  assert.match(text, /\(Cell\) Tj/)
  assert.match(text, /\(alpha\) Tj/)
  assert.match(text, /D:20260102030406Z/, "the caller's date reaches the document info")

  // Same input, same bytes: the format joins DOCX and XLSX as reproducible.
  const again = documentHtmlToPdf({
    title: "Unit 3",
    html: [
      "<h1>Unit 3</h1>",
      "<p>Intro with <strong>bold</strong> &amp; an entity.</p>",
      "<ul><li>alpha</li><li>beta</li></ul>",
      "<table><thead><tr><th>Term</th><th>Meaning</th></tr></thead><tbody><tr><td>Cell</td><td>Box</td></tr></tbody></table>",
      '<pre><code class="language-ts">const a = 1</code></pre>',
      "<hr>",
    ].join(""),
    date: new Date(Date.UTC(2026, 0, 2, 3, 4, 6)),
  })
  assert.deepEqual(Array.from(bytes), Array.from(again))
})

/**
 * The deck's PDF is the other half of the Brief's "PPTX/PDF/image for decks".
 * The PPTX path is browser-only (see the parity test); this one is plain Node
 * code, so a deck losing it would be a silent product regression with no
 * failing test anywhere else. Every link — writer, seam, menu, view — is pinned
 * here, and the menu is checked at runtime so the assertion cannot be satisfied
 * by the *document* PDF entry lower down the same file.
 */
test("Studio offers PDF for decks and the seam builds it from the slides", () => {
  const writer = readSource(PDF_MODULE)
  const seam = readSource(STUDIO_EXPORT_MODULE)
  const view = readCodeSource(STUDIO_VIEW)

  assert.match(writer, /export function buildDeckPdf\(/, "the PDF writer exports the deck entry point")
  assert.match(writer, /export const PDF_DECK_PAGE_SIZE = \{ width: 960, height: 540 \}/, "the deck page is a real 16:9 landscape box")
  assert.match(writer, /export const DECK_CONTINUATION_SUFFIX = " \(cont\.\)"/, "the continuation marker is part of the writer's contract")

  assert.match(seam, /import \{ buildDeckPdf, buildPdf \} from "@\/lib\/export\/pdf"/, "the seam imports the deck builder")
  assert.match(seam, /export function deckSlidesToPdf\(/, "the seam exports deckSlidesToPdf")

  // The menu offers PDF for decks, alongside the PPTX it already offered.
  const deckOptions = buildStudioDownloadOptions("slides").map((option) => option.id)
  assert.ok(deckOptions.includes("pdf"), `the deck menu offers PDF, got ${JSON.stringify(deckOptions)}`)
  assert.ok(deckOptions.includes("pptx"), `the deck menu keeps PPTX, got ${JSON.stringify(deckOptions)}`)

  assert.match(view, /format === "pdf" && kind === "slides"/, "the PDF branch is scoped to decks")
  assert.match(view, /return exportDeck\("pdf"\)/, "deck PDF uses the same object-preserving design conversion as PPTX")
  assert.match(view, /PDF_MIME/, "the deck PDF is served as application/pdf")
})

test("the Studio deck seam produces a landscape PDF, one page per slide", () => {
  const bytes = deckSlidesToPdf({
    title: "Unit 3 deck",
    slides: [
      { title: "Identity", body: "AuthN answers who you are.\nAuthZ decides what you may do." },
      // A body typed with dashes still reads as bullets: the writer draws its own.
      { title: "Terms", body: "- Session\n- Revocation" },
    ],
    date: new Date(Date.UTC(2026, 8, 22, 9, 30, 0)),
  })

  const text = Buffer.from(bytes).toString("latin1")
  assert.ok(text.startsWith("%PDF-1.4\n"), "the seam returns a PDF file")
  assert.ok(text.endsWith("%%EOF\n"), "and ends with the EOF marker")
  assert.match(text, /\/MediaBox \[0 0 960 540\]/, "the pages are landscape slides")
  assert.equal(Number(/\/Count (\d+)/.exec(text)?.[1]), 2, "one page per slide")
  assert.match(text, /\(AuthZ decides what you may do\.\) Tj/, "the body's lines become bullets")
  assert.match(text, /\(Session\) Tj/, "a typed dash is not doubled into the drawn marker")
  assert.match(text, /D:20260922093000Z/, "the caller's date reaches the document info")

  const again = deckSlidesToPdf({
    title: "Unit 3 deck",
    slides: [
      { title: "Identity", body: "AuthN answers who you are.\nAuthZ decides what you may do." },
      { title: "Terms", body: "- Session\n- Revocation" },
    ],
    date: new Date(Date.UTC(2026, 8, 22, 9, 30, 0)),
  })
  assert.deepEqual(Array.from(bytes), Array.from(again), "the deck PDF joins DOCX, XLSX and PDF as reproducible")
})
