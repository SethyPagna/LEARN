import assert from "node:assert/strict"
import test from "node:test"
import type { CanvasElement } from "../../lib/studio/canvas-engine"
import { applyTheme, createDesignDoc, createDesignPage, designPlainText, DESIGN_LIMITS, normalizeDesignDoc } from "../../lib/design/document"
import { resizeDesignElement, setElementStyle, tableElement } from "../../lib/design/editing"
import { exportFontSpecs, rasterPadding } from "../../lib/design/export-plan"
import { buildPptxPlan } from "../../lib/design/pptx"
import { drawDesignPage, pageFonts, type RasterContext } from "../../lib/design/raster"
import {
  cleanCell,
  insertTableColumn,
  insertTableRow,
  layoutTable,
  parseTableCells,
  pasteIntoTable,
  readTableStyle,
  removeTableColumn,
  removeTableRow,
  serializeTableCells,
  TABLE_LIMITS,
  tableCellAt,
  tableCellRoom,
  tableGridPath,
  tablePlainText,
  tableRowFills,
  withTableCell,
} from "../../lib/design/table"
import { designTheme } from "../../lib/design/themes"

function table(input: Partial<CanvasElement> = {}): CanvasElement {
  return {
    id: "t1",
    type: "table",
    x: 100,
    y: 100,
    width: 600,
    height: 300,
    rotation: 0,
    z: 0,
    groupId: null,
    locked: false,
    hidden: false,
    content: "Term\tMeaning\nCell\tThe unit of life\nAtom\tThe unit of matter",
    style: { fontSize: 24, header: true, headerFill: "#3355FF", fill: "#FFFFFF", banded: true, stroke: "#999999", strokeWidth: 2, padding: 10 },
    ...input,
  }
}

test("cells are tab-separated lines, padded to a rectangle and capped", () => {
  assert.deepEqual(parseTableCells("a\tb\tc\nd"), [["a", "b", "c"], ["d", "", ""]])
  assert.deepEqual(parseTableCells(""), [[""]])
  assert.deepEqual(parseTableCells("a\r\nb"), [["a"], ["b"]])
  const big = Array.from({ length: 40 }, () => Array.from({ length: 14 }, () => "x").join("\t")).join("\n")
  const grid = parseTableCells(big)
  assert.equal(grid.length, TABLE_LIMITS.rows)
  assert.equal(grid[0].length, TABLE_LIMITS.columns)
  assert.equal(cleanCell("one\ttwo\r\nthree"), "one two three")
  assert.equal(serializeTableCells([["a\tb", "c"], ["d", "e\nf"]]), "a b\tc\nd\te f")
  assert.equal(tablePlainText("Term\tMeaning\n\t\nCell\t"), "Term | Meaning\nCell")
})

test("the text cap matches the design's and bounds what one cell can take", () => {
  assert.equal(TABLE_LIMITS.characters, DESIGN_LIMITS.contentLength)
  const element = table({ content: "a\tb" })
  assert.equal(tableCellRoom(element, 0, 0), TABLE_LIMITS.characters - 2)
  const full = withTableCell(element, 0, 0, "x".repeat(5000))
  assert.equal(full.content.length, TABLE_LIMITS.characters)
  assert.ok(full.content.endsWith("\tb"))
  assert.equal(withTableCell(element, 5, 0, "nope"), element)
  assert.equal(withTableCell(element, 0, 0, "a"), element)
})

test("the look: a header only when asked, a readable header text, and a derived band colour", () => {
  const plain = readTableStyle({ style: {} })
  assert.equal(plain.header, false)
  assert.equal(plain.banded, false)
  assert.equal(plain.bandFill, null)
  assert.equal(plain.stroke, null)
  assert.equal(plain.strokeWidth, 0)
  assert.equal(plain.size, 24)
  const styled = readTableStyle(table())
  assert.equal(styled.header, true)
  assert.equal(styled.headerColor, "#FFFFFF")
  assert.equal(styled.headerWeight, 700)
  assert.ok(styled.bandFill && styled.bandFill !== "#FFFFFF")
  assert.equal(readTableStyle({ style: { banded: true, bandFill: "#EEEEEE" } }).bandFill, "#EEEEEE")
})

test("layout: column and row edges follow the stored shares, or even shares when they do not fit", () => {
  const even = layoutTable(table())
  assert.deepEqual(even.xs, [0, 300, 600])
  assert.deepEqual(even.ys, [0, 100, 200, 300])
  const shaped = layoutTable(table({ style: { ...table().style, columns: [1, 3], rows: [2, 1, 1] } }))
  assert.deepEqual(shaped.xs, [0, 150, 600])
  assert.deepEqual(shaped.ys, [0, 150, 225, 300])
  const broken = layoutTable(table({ style: { ...table().style, columns: [1, -1] } }))
  assert.deepEqual(broken.xs, [0, 300, 600])
})

test("layout: the header row, banded body rows, and one shared size", () => {
  const four = table({ content: "H1\tH2\na\tb\nc\td\ne\tf", height: 400 })
  const layout = layoutTable(four)
  assert.equal(layout.cells.length, 8)
  const header = layout.cells[0]
  assert.equal(header.header, true)
  assert.equal(header.fill, "#3355FF")
  assert.equal(header.color, "#FFFFFF")
  assert.equal(header.input.weight, 700)
  const fills = [1, 2, 3].map((row) => layout.cells[row * 2].fill)
  assert.equal(fills[0], "#FFFFFF")
  assert.notEqual(fills[1], "#FFFFFF")
  assert.equal(fills[2], "#FFFFFF")
  assert.equal(layout.size, 24)
  assert.ok(layout.cells.every((cell) => cell.input.size === layout.size))

  const crowded = table({ width: 200, height: 80, content: "Short\tA much longer sentence that cannot fit in this little cell at all" })
  const small = layoutTable(crowded)
  assert.ok(small.size < 24, `size ${small.size}`)
  assert.ok(small.size >= 24 * 0.3)
})

test("grid lines, merged row fills and the cell under a point", () => {
  const layout = layoutTable(table({ width: 200, height: 100, content: "a\tb\nc\td" }))
  assert.equal(tableGridPath(layout), "M0 0H200V100H0ZM100 0V100M0 50H200")
  const plain = layoutTable(table({ content: "a\nb\nc", style: { fill: "#FFFFFF" } }))
  assert.deepEqual(tableRowFills(plain), [{ y: 0, height: 300, fill: "#FFFFFF" }])
  const none = layoutTable(table({ style: {} }))
  assert.deepEqual(tableRowFills(none), [])
  assert.deepEqual(tableCellAt(layout, 150, 20), { row: 0, column: 1 })
  assert.deepEqual(tableCellAt(layout, 10, 99), { row: 1, column: 0 })
  assert.deepEqual(tableCellAt(layout, 500, 500), { row: 1, column: 1 })
})

test("rows: added rows take the neighbour's height and grow the table downwards; the last row stays", () => {
  const start = table()
  const added = insertTableRow(start, 1)
  assert.deepEqual(parseTableCells(added.content).map((row) => row[0]), ["Term", "", "Cell", "Atom"])
  assert.equal(added.height, 400)
  assert.equal(added.y, 100)
  assert.deepEqual(added.style.rows, [0.25, 0.25, 0.25, 0.25])
  const removed = removeTableRow(added, 0)
  assert.equal(removed.height, 300)
  assert.equal(removed.y, 100)
  assert.deepEqual(parseTableCells(removed.content).map((row) => row[0]), ["", "Cell", "Atom"])
  const single = table({ content: "only" })
  assert.equal(removeTableRow(single, 0), single)
  const full = table({ content: Array.from({ length: 30 }, () => "x").join("\n") })
  assert.equal(insertTableRow(full, 0), full)

  // A turned table grows along its own "down".
  const turned = insertTableRow(table({ rotation: 90 }), 3)
  assert.equal(turned.height, 400)
  assert.equal(turned.x, 50)
  assert.equal(turned.y, 50)
})

test("columns: the table keeps its width, the new column takes an even share", () => {
  const start = table({ style: { ...table().style, columns: [1, 3] } })
  const added = insertTableColumn(start, 2)
  assert.equal(added.width, 600)
  assert.deepEqual(parseTableCells(added.content)[0], ["Term", "Meaning", ""])
  const shares = added.style.columns as number[]
  assert.equal(shares.length, 3)
  assert.ok(Math.abs(shares[2] - 1 / 3) < 0.001)
  assert.ok(Math.abs(shares.reduce((sum, value) => sum + value, 0) - 1) < 0.001)
  const removed = removeTableColumn(added, 0)
  assert.deepEqual(parseTableCells(removed.content)[0], ["Meaning", ""])
  assert.equal(removed.width, 600)
  assert.equal(removeTableColumn(table({ content: "a\nb" }), 0).content, "a\nb")
})

test("pasting spreadsheet rows fills from the cell and adds the rows and columns it needs", () => {
  const start = table({ content: "a\tb\nc\td" })
  const pasted = pasteIntoTable(start, 1, 1, "1\t2\r\n3\t4\r\n")
  assert.deepEqual(parseTableCells(pasted.content), [["a", "b", ""], ["c", "1", "2"], ["", "3", "4"]])
  assert.ok(pasted.height > start.height)
  assert.equal(pasted.width, start.width)
})

test("a new table follows the theme; a theme change restyles it but keeps what was set by hand", () => {
  const theme = designTheme("minimal")
  const made = tableElement(theme, { width: 1920, height: 1080 })
  assert.equal(made.type, "table")
  assert.deepEqual(parseTableCells(made.content).length, 3)
  assert.equal(readTableStyle(made).header, true)
  assert.equal(readTableStyle(made).headerFill, theme.palette.primary)

  const custom = setElementStyle(made, { fill: "#FFEECC" })
  const doc = createDesignDoc({ format: "presentation", theme: "minimal", pages: [createDesignPage({ id: "p1", elements: [custom] })] })
  const other = designTheme("midnight")
  const themed = applyTheme(doc, "midnight").pages[0].elements[0]
  const style = readTableStyle(themed)
  assert.equal(style.headerFill, other.palette.primary)
  assert.equal(style.color, other.palette.text)
  assert.equal(style.fill, "#FFEECC")
  assert.equal(style.font, other.fonts.body)
})

test("a stored table stays a table and joins the design's plain text", () => {
  const doc = normalizeDesignDoc(createDesignDoc({ format: "presentation", pages: [createDesignPage({ id: "p1", elements: [table()] })] }))
  assert.equal(doc.pages[0].elements[0].type, "table")
  assert.match(designPlainText(doc), /Term \| Meaning\nCell \| The unit of life/)
})

test("a corner drag scales the table and its type; a side drag only stretches it", () => {
  const start = table()
  const measure = (text: string, font: { size: number }) => text.length * font.size * 0.5
  const corner = resizeDesignElement(start, { handle: "se", dx: 300, dy: 150, shift: false, measure })
  assert.equal(corner.width, 900)
  assert.equal(corner.style.fontSize, 36)
  assert.equal(corner.style.padding, 15)
  const side = resizeDesignElement(start, { handle: "e", dx: 300, dy: 0, shift: false, measure })
  assert.equal(side.width, 900)
  assert.equal(side.style.fontSize, 24)
})

test("the picture export draws the fills, the grid and every cell's text", () => {
  const calls: Array<{ op: string; args: unknown[]; fill: unknown }> = []
  const state: Record<string, unknown> = { fillStyle: "#000", strokeStyle: "#000", lineWidth: 1, globalAlpha: 1, font: "", textBaseline: "", textAlign: "", lineJoin: "", lineCap: "", shadowColor: "", shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0 }
  const stack: Array<Record<string, unknown>> = []
  const record = (op: string) => (...args: unknown[]) => calls.push({ op, args, fill: state.fillStyle })
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
    createLinearGradient: () => ({ addColorStop: () => undefined }),
    measureText: (text: string) => ({ width: text.length * 10, fontBoundingBoxAscent: 8, fontBoundingBoxDescent: 2 }),
  } as unknown as RasterContext
  for (const key of Object.keys(state)) Object.defineProperty(ctx, key, { get: () => state[key], set: (value) => (state[key] = value) })

  const doc = createDesignDoc({ format: "presentation", pages: [createDesignPage({ id: "p1", background: "#FAFAFA", elements: [table()] })] })
  drawDesignPage(ctx, doc, 0, { scale: 1, makePath: (d: string) => ({ d }), fontFamily: () => "Test Sans" })
  const fills = calls.filter((call) => call.op === "fillRect").map((call) => call.fill)
  assert.deepEqual(fills.slice(0, 2), ["#FAFAFA", "#3355FF"])
  const grid = calls.find((call) => call.op === "stroke")
  assert.deepEqual(grid?.args[0], { d: "M0 0H600V300H0ZM300 0V300M0 100H600M0 200H600" })
  const words = calls.filter((call) => call.op === "fillText").map((call) => call.args[0])
  for (const word of ["Term", "Meaning", "Cell", "Atom"]) assert.ok(words.includes(word), `${word} drawn`)
  assert.deepEqual(pageFonts(doc.pages[0]), ["sans"])
  assert.deepEqual(exportFontSpecs(doc.pages).map((spec) => spec.weight).sort(), [400, 700])
  assert.equal(rasterPadding(table(), 1), 2)
})

test("PowerPoint gets a real table with its column widths, row heights and inch margins", () => {
  const doc = createDesignDoc({ format: "presentation", pages: [createDesignPage({ id: "p1", elements: [table({ style: { ...table().style, columns: [1, 3] } })] })] })
  const op = buildPptxPlan(doc).slides[0].ops[0]
  assert.equal(op.kind, "table")
  if (op.kind !== "table") return
  const width = op.options.colW.reduce((sum, value) => sum + value, 0)
  const height = op.options.rowH.reduce((sum, value) => sum + value, 0)
  assert.ok(Math.abs(width - op.options.w) < 0.001)
  assert.ok(Math.abs(height - op.options.h) < 0.001)
  assert.ok(Math.abs(op.options.colW[1] - op.options.colW[0] * 3) < 0.001)
  assert.equal(op.rows.length, 3)
  assert.equal(op.rows[0][0].text, "Term")
  assert.equal(op.rows[0][0].options.bold, true)
  assert.equal(op.rows[0][0].options.fill?.color, "3355FF")
  assert.equal(op.rows[1][0].options.bold, false)
  assert.ok(op.rows[1][1].options.margin.every((value) => value > 0 && value < 1))
  assert.deepEqual(op.rows[1][1].options.border[0], { type: "solid", pt: 1, color: "999999" })

  const turned = createDesignDoc({ format: "presentation", pages: [createDesignPage({ id: "p1", elements: [table({ rotation: 30 })] })] })
  assert.equal(buildPptxPlan(turned).slides[0].ops[0].kind, "raster")
})
