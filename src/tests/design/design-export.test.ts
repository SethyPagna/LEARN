import assert from "node:assert/strict"
import test from "node:test"
import type { CanvasElement } from "../../lib/studio/canvas-engine"
import { createDesignDoc, createDesignPage, type DesignDoc } from "../../lib/design/document"
import { designFromSpec } from "../../lib/design/layout"
import { buildPptxPlan } from "../../lib/design/pptx"
import { designFileBase, exportFontSpecs, exportPageIndices, exportPixelScale, pageFileName, rasterCanBeJpeg, rasterPadding } from "../../lib/design/export-plan"
import { designImageSources, drawDesignPage, pageFonts, type RasterContext } from "../../lib/design/raster"
import { parseTextToSpec } from "../../lib/design/spec"
import { designTemplate, designFromTemplate } from "../../lib/design/templates"
import { buildImagePdf, pdfTextString, readJpegInfo } from "../../lib/export/image-pdf"

type Call = { op: string; args: unknown[]; state: Record<string, unknown> }

/** A 2D context that records what is drawn (enough of the API for the renderer). */
function recordingContext(): { ctx: RasterContext; calls: Call[] } {
  const calls: Call[] = []
  const state: Record<string, unknown> = { fillStyle: "#000", strokeStyle: "#000", lineWidth: 1, lineJoin: "miter", lineCap: "butt", globalAlpha: 1, font: "10px sans-serif", textBaseline: "alphabetic", textAlign: "left", shadowColor: "rgba(0,0,0,0)", shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0, filter: "none" }
  const stack: Array<Record<string, unknown>> = []
  const record = (op: string) => (...args: unknown[]) => {
    calls.push({ op, args, state: { ...state } })
  }
  const ctx = {
    save: () => stack.push({ ...state }),
    restore: () => Object.assign(state, stack.pop() ?? {}),
    translate: record("translate"),
    rotate: record("rotate"),
    scale: record("scale"),
    beginPath: record("beginPath"),
    rect: record("rect"),
    clip: record("clip"),
    fill: record("fill"),
    stroke: record("stroke"),
    fillRect: record("fillRect"),
    fillText: record("fillText"),
    strokeText: record("strokeText"),
    drawImage: record("drawImage"),
    setLineDash: record("setLineDash"),
    createLinearGradient: (...args: unknown[]) => {
      calls.push({ op: "createLinearGradient", args, state: { ...state } })
      return { addColorStop: record("addColorStop") }
    },
    measureText: (text: string) => ({ width: text.length * 10, fontBoundingBoxAscent: 8, fontBoundingBoxDescent: 2 }),
  } as unknown as RasterContext
  for (const key of Object.keys(state)) {
    Object.defineProperty(ctx, key, { get: () => state[key], set: (value) => (state[key] = value), enumerable: true })
  }
  return { ctx, calls }
}

const RASTER_OPTIONS = { scale: 2, makePath: (d: string) => ({ d }), fontFamily: () => "Test Sans" }

function element(input: Partial<CanvasElement> & Pick<CanvasElement, "id" | "type">): CanvasElement {
  return { x: 100, y: 100, width: 400, height: 200, rotation: 0, z: 0, groupId: null, locked: false, hidden: false, content: "", style: {}, ...input }
}

function oneElementDoc(elements: CanvasElement[], pattern: "none" | "lines" = "none"): DesignDoc {
  return createDesignDoc({ format: "presentation", theme: "minimal", pages: [createDesignPage({ id: "p1", background: "#FAFAFA", pattern, elements })] })
}

test("a page is drawn at the export scale: background first, then elements in order", () => {
  const doc = oneElementDoc([
    element({ id: "t", type: "text", content: "Hello world", style: { fontSize: 40, color: "#112233" } }),
    element({ id: "s", type: "shape", style: { shape: "rect", fill: "#FF0000", fill2: "#0000FF", gradientAngle: 90 } }),
    element({ id: "gone", type: "text", content: "Hidden", hidden: true }),
  ])
  const { ctx, calls } = recordingContext()
  drawDesignPage(ctx, doc, 0, RASTER_OPTIONS)
  assert.deepEqual(calls.find((call) => call.op === "scale")?.args, [2, 2])
  const background = calls.find((call) => call.op === "fillRect")
  assert.deepEqual(background?.args, [0, 0, 1920, 1080])
  assert.equal(background?.state.fillStyle, "#FAFAFA")
  const text = calls.filter((call) => call.op === "fillText").map((call) => call.args[0])
  assert.deepEqual(text, ["Hello world"])
  assert.equal(calls.find((call) => call.op === "fillText")?.state.font, "400 40px Test Sans")
  assert.ok(calls.some((call) => call.op === "createLinearGradient"), "a two-colour fill is a gradient")
  assert.ok(!calls.some((call) => call.op === "fillText" && call.args[0] === "Hidden"), "hidden elements are not exported")
})

test("a text effect follows the size the text was shrunk to", () => {
  const long = "A heading far too long for its little box ".repeat(4).trim()
  const doc = oneElementDoc([element({ id: "t", type: "text", content: long, width: 300, height: 80, style: { fontSize: 120, fit: "shrink", effect: "shadow", effectColor: "#000000" } })])
  const { ctx, calls } = recordingContext()
  drawDesignPage(ctx, doc, 0, RASTER_OPTIONS)
  const shadowed = calls.find((call) => call.op === "fillText" && Number(call.state.shadowOffsetY) > 0)
  assert.ok(shadowed)
  const size = Number(/ (\d+(?:\.\d+)?)px /.exec(String(shadowed.state.font))?.[1])
  assert.ok(size < 120, "the text was shrunk")
  // shadow effect: y = 0.06 × size, times the export scale of 2.
  assert.ok(Math.abs(Number(shadowed.state.shadowOffsetY) - Math.round(size * 0.06 * 100) / 100 * 2) < 0.05)
})

test("canvas shadows are scaled by hand (they ignore the transform)", () => {
  const doc = oneElementDoc([element({ id: "s", type: "shape", style: { shape: "rounded", fill: "#FFFFFF", shadow: "soft" } })])
  const { ctx, calls } = recordingContext()
  drawDesignPage(ctx, doc, 0, RASTER_OPTIONS)
  const fill = calls.find((call) => call.op === "fill" && call.state.fillStyle === "#FFFFFF")
  assert.ok(fill)
  // soft: 8px down, 24px blur at a 1080px short side, times the export scale.
  assert.equal(fill.state.shadowOffsetY, 16)
  assert.equal(fill.state.shadowBlur, 48)
})

test("a picture that has not loaded draws as an empty frame, a loaded one is cropped into its box", () => {
  const picture = element({ id: "i", type: "image", content: "/api/files/abc/download", style: { mask: "circle" } })
  const doc = oneElementDoc([picture])
  const empty = recordingContext()
  drawDesignPage(empty.ctx, doc, 0, RASTER_OPTIONS)
  assert.ok(!empty.calls.some((call) => call.op === "drawImage"))
  const placeholder = empty.calls.find((call) => call.op === "fill" && call.state.fillStyle === "#EEF0F4")
  assert.ok(placeholder && (placeholder.args[0] as { d: string }).d.includes("A"), "the empty frame already has the circle's outline")
  // Sources are keyed the way the renderer resolves them (absolute, same origin).
  const [source] = designImageSources(doc)
  assert.equal(source, "https://learn.local/api/files/abc/download")
  const loaded = recordingContext()
  const images = new Map([[source, { source: {}, width: 800, height: 400 }]])
  drawDesignPage(loaded.ctx, doc, 0, { ...RASTER_OPTIONS, images })
  const draw = loaded.calls.find((call) => call.op === "drawImage")
  assert.ok(draw)
  assert.deepEqual(draw.args.slice(1), [0, 0, 800, 400, 0, -0, 400, 200].map((value) => value || 0))
  assert.ok(loaded.calls.some((call) => call.op === "clip" && Boolean((call.args[0] as { d?: string } | undefined)?.d?.includes("A"))), "the circle mask clips the picture")
})

test("pages report the fonts they need before drawing", () => {
  const doc = designFromTemplate(designTemplate("lesson")!, { pageIdPrefix: "p" })
  const fonts = pageFonts(doc.pages[0])
  assert.ok(fonts.includes("display") && fonts.includes("sans"))
})

function fakeJpeg(width: number, height: number, components = 3): Uint8Array {
  const sof = [0xff, 0xc0, 0x00, 8 + components * 3, 8, height >> 8, height & 0xff, width >> 8, width & 0xff, components]
  for (let index = 0; index < components; index += 1) sof.push(index + 1, 0x11, 0)
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]
  return new Uint8Array([0xff, 0xd8, ...app0, ...sof, 0xff, 0xda, 0x00, 0x02, 0x12, 0x34, 0xff, 0xd9])
}

test("JPEG size is read from the frame header", () => {
  assert.deepEqual(readJpegInfo(fakeJpeg(1920, 1080)), { width: 1920, height: 1080, components: 3 })
  assert.deepEqual(readJpegInfo(fakeJpeg(10, 20, 1)), { width: 10, height: 20, components: 1 })
  assert.equal(readJpegInfo(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), null, "a PNG is not a JPEG")
})

test("the picture PDF has one page per picture and a byte-exact cross-reference table", () => {
  const pages = [
    { jpeg: fakeJpeg(1920, 1080), width: 960, height: 540 },
    { jpeg: fakeJpeg(1080, 1080, 1), width: 540, height: 540 },
  ]
  const bytes = buildImagePdf({ title: "Cells · Unit 2", pages })
  assert.deepEqual(bytes, buildImagePdf({ title: "Cells · Unit 2", pages }), "the same input gives the same bytes")
  const text = new TextDecoder("latin1").decode(bytes)
  assert.ok(text.startsWith("%PDF-1.4\n"))
  assert.ok(text.endsWith("%%EOF\n"))
  assert.match(text, /\/Count 2/)
  assert.match(text, /\/MediaBox \[0 0 960 540\]/)
  assert.match(text, /\/ColorSpace \/DeviceGray/)
  const startxref = Number(/startxref\n(\d+)\n%%EOF/.exec(text)?.[1])
  assert.equal(text.slice(startxref, startxref + 4), "xref")
  const entries = text.slice(startxref).split("\n").slice(2).filter((line) => / 00000 n $/.test(line))
  assert.equal(entries.length, 9, "catalogue, pages, info and three objects per page")
  entries.forEach((entry, index) => {
    const offset = Number(entry.slice(0, 10))
    assert.equal(text.slice(offset, offset + `${index + 1} 0 obj`.length), `${index + 1} 0 obj`)
  })
  assert.throws(() => buildImagePdf({ pages: [{ jpeg: new Uint8Array([1, 2, 3]), width: 10, height: 10 }] }), /not a JPEG/)
  assert.equal(pdfTextString("Plain (1)"), "(Plain \\(1\\))")
  assert.equal(pdfTextString("é"), "<FEFF00E9>")
})

test("the PowerPoint plan keeps text editable at the size the editor fitted", () => {
  const doc = designFromSpec(parseTextToSpec("# Cells\nThe building blocks of life\n\n## Parts\n- Nucleus\n- Membrane\n- Cytoplasm"), { theme: "notebook", pageIdPrefix: "p" })
  const plan = buildPptxPlan(doc)
  assert.deepEqual(plan.layout, { name: "LEARN_1920x1080", width: 13.3333, height: 7.5 })
  assert.equal(plan.slides.length, doc.pages.length)
  const slide = plan.slides[0]
  assert.equal(slide.backgroundRaster, true, "the notebook lines are drawn, not approximated")
  const title = slide.ops.find((op) => op.kind === "text" && op.text === "Cells")
  assert.ok(title && title.kind === "text")
  assert.equal(title.options.fontFace, "Bricolage Grotesque")
  const source = doc.pages[0].elements.find((element) => element.content === "Cells")
  assert.ok(source)
  assert.ok(title.options.fontSize <= Number(source.style.fontSize) * 0.5 + 0.05, "points are half the design px on a 1920px slide")
  assert.equal(title.options.margin, 0)
  const visible = doc.pages[0].elements.filter((element) => !element.hidden).length
  assert.equal(slide.ops.length, visible, "one operation per visible element")
})

test("pictures and fancy shapes are rasterised, hidden pages are left out", () => {
  const doc = oneElementDoc([
    element({ id: "pic", type: "image", content: "/api/files/x/download" }),
    element({ id: "blob", type: "shape", style: { shape: "blob", fill: "#FF00AA" } }),
    element({ id: "box", type: "shape", content: "Label", style: { shape: "rounded", fill: "#00AAFF" } }),
    element({ id: "rule", type: "shape", rotation: 30, style: { shape: "line", stroke: "#111111", strokeWidth: 4 } }),
  ])
  const withHidden: DesignDoc = { ...doc, pages: [...doc.pages, createDesignPage({ id: "p2", hidden: true })] }
  const plan = buildPptxPlan(withHidden)
  assert.equal(plan.slides.length, 1)
  const kinds = Object.fromEntries(plan.slides[0].ops.map((op) => [op.id, op.kind]))
  assert.deepEqual(kinds, { pic: "raster", blob: "raster", box: "text", rule: "shape" })
  const rule = plan.slides[0].ops.find((op) => op.id === "rule")
  assert.ok(rule && rule.kind === "shape")
  assert.equal(rule.options.rotate, 30)
  assert.equal(rule.options.h, 0)
  assert.equal(buildPptxPlan(withHidden, { includeHidden: true }).slides.length, 2)
})

test("export pages: an explicit choice wins, otherwise visible pages, and never nothing", () => {
  const doc = createDesignDoc({ pages: [createDesignPage({ id: "a" }), createDesignPage({ id: "b", hidden: true }), createDesignPage({ id: "c" })] })
  assert.deepEqual(exportPageIndices(doc), [0, 2])
  assert.deepEqual(exportPageIndices(doc, [2, 1, 2, 9, -1, 0.5]), [1, 2], "deduplicated, sorted, out-of-range dropped")
  assert.deepEqual(exportPageIndices(doc, [42]), [0, 2], "a choice with no real page falls back")
  const allHidden = createDesignDoc({ pages: [createDesignPage({ hidden: true }), createDesignPage({ hidden: true })] })
  assert.deepEqual(exportPageIndices(allHidden), [0, 1])
})

test("export pixel size: 2x for small pages, capped on the long edge and by canvas area", () => {
  assert.equal(exportPixelScale(1080, 1080), 2)
  assert.equal(exportPixelScale(1920, 1080), 1.5)
  assert.ok(exportPixelScale(4000, 4000, "high") * 4000 <= 4000.01, "a 4000px square stays under the area cap")
  const big = exportPixelScale(4000, 4000, "high")
  assert.ok(4000 * big * 4000 * big <= 16_000_000 + 1)
})

test("file names keep any script, drop what a file system rejects, and pad page numbers", () => {
  assert.equal(designFileBase("Cell Biology: Unit 3 / Review?"), "cell-biology-unit-3-review")
  assert.equal(designFileBase("  "), "design")
  assert.equal(designFileBase("មេរៀន ទី១"), "មេរៀន-ទី១")
  assert.equal(pageFileName("deck", 2, 12, "png"), "deck-03.png")
  assert.equal(pageFileName("deck", 99, 120, "jpg"), "deck-100.jpg")
})

test("fonts to load before drawing: every face, weight and slant in use, once", () => {
  const page = createDesignPage({
    elements: [
      element({ id: "a", type: "text", content: "A", style: { fontFamily: "poppins", fontWeight: 700 } }),
      element({ id: "b", type: "text", content: "B", style: { fontFamily: "poppins", fontWeight: 700 } }),
      element({ id: "c", type: "text", content: "C", style: { fontFamily: "lora", italic: true } }),
      element({ id: "d", type: "text", content: "hidden", hidden: true, style: { fontFamily: "anton" } }),
      element({ id: "e", type: "shape", content: "", style: { shape: "rect" } }),
    ],
  })
  const specs = exportFontSpecs([page])
  assert.deepEqual(specs.map((spec) => `${spec.font}:${spec.weight}:${spec.italic}`).sort(), ["lora:400:true", "poppins:700:false"])
})

test("an element picture gets room for its shadow and stroke; only plain photos become JPEG", () => {
  const photo = element({ id: "p", type: "image", content: "/api/files/p/download" })
  assert.equal(rasterPadding(photo, 1), 0)
  assert.equal(rasterCanBeJpeg(photo, false, 0), true)
  assert.equal(rasterCanBeJpeg(photo, true, 0), false, "masked or rounded pictures need transparency")
  assert.equal(rasterCanBeJpeg({ ...photo, style: { opacity: 0.5 } }, false, 0), false)
  const lifted = element({ id: "s", type: "shape", style: { shape: "blob", fill: "#FF0000", shadow: "lifted", stroke: "#000000", strokeWidth: 6 } })
  assert.equal(rasterPadding(lifted, 1), 18 + 40 + 4)
  assert.equal(rasterCanBeJpeg(lifted, true, rasterPadding(lifted, 1)), false)
})
