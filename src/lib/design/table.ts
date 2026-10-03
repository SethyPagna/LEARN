import type { CanvasElement } from "@/lib/studio/canvas-engine"
import { safeColor, safeNumber } from "@/lib/studio/canvas-styles"

import { isDesignFontId, nearestFontWeight, type DesignFontId } from "./fonts"
import { FONT_SIZE_RANGE, mixColors, readableOn, withAlpha } from "./style"
import { estimateMeasure, layoutText, MIN_FONT_SIZE, type MeasureText, type TextLayoutInput, type VerticalAlign } from "./text"

/**
 * Tables on a design page.
 *
 * A table is one element. Its cells live in `content`, one line per row with
 * the cells split by tabs, so the text reads naturally in search, outlines and
 * summaries, and the design's text cap bounds it like any text box. A cell
 * holds one paragraph: a tab or line break typed into it becomes a space.
 *
 * Its look lives in `style`: one face and size for every cell, a header row,
 * body and banded-row fills, grid lines, and the share of the width each
 * column takes (`columns`) and of the height each row takes (`rows`). Every
 * cell is laid out with `layoutText` at one shared size, which shrinks until
 * the fullest cell fits, so the editor, the picture exports and PowerPoint all
 * get the same table.
 *
 * Pure: no DOM, no React.
 */

/** `characters` is the design's text cap per element (`DESIGN_LIMITS.contentLength`). */
export const TABLE_LIMITS = { rows: 30, columns: 10, characters: 4000 } as const

export type TableGrid = string[][]

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function num(value: unknown, min: number, max: number, fallback: number): number {
  return safeNumber(value, min, max) ?? fallback
}

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------

/** One cell's text as stored: tabs and line breaks become spaces. */
export function cleanCell(value: unknown): string {
  return typeof value === "string" ? value.replace(/[\t\r\n]+/g, " ") : ""
}

/** The cells as a rectangular grid (short rows are padded), at least 1x1. */
export function parseTableCells(content: string): TableGrid {
  const lines = String(content ?? "").replace(/\r\n?/g, "\n").split("\n").slice(0, TABLE_LIMITS.rows)
  const rows = lines.map((line) => line.split("\t").slice(0, TABLE_LIMITS.columns))
  const columns = Math.max(1, ...rows.map((row) => row.length))
  return rows.map((row) => Array.from({ length: columns }, (_, index) => row[index] ?? ""))
}

export function serializeTableCells(grid: readonly (readonly string[])[]): string {
  return grid.map((row) => row.map(cleanCell).join("\t")).join("\n")
}

/** The table as plain lines ("Term | Meaning"), for search, outlines and summaries. */
export function tablePlainText(content: string): string {
  return parseTableCells(content)
    .map((row) => row.map((cell) => cell.trim()).filter(Boolean).join(" | "))
    .filter(Boolean)
    .join("\n")
}

// ---------------------------------------------------------------------------
// Look
// ---------------------------------------------------------------------------

export interface DesignTableStyle {
  font: DesignFontId
  size: number
  /** Body cells' weight; the header row is bold. */
  weight: number
  headerWeight: number
  italic: boolean
  color: string
  align: "left" | "center" | "right"
  verticalAlign: VerticalAlign
  lineHeight: number
  /** Space inside every cell, in design px. */
  padding: number
  /** The first row is a header: bold, in `headerColor` on `headerFill`. */
  header: boolean
  headerFill: string | null
  headerColor: string
  /** Body cells' fill (null: see-through). */
  fill: string | null
  banded: boolean
  /** Every other body row's fill, when banded. */
  bandFill: string | null
  /** Grid lines: the outer frame and every line between cells. */
  stroke: string | null
  strokeWidth: number
  opacity: number
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

export function readTableStyle(element: Pick<CanvasElement, "style">): DesignTableStyle {
  const style = element.style ?? {}
  const font: DesignFontId = isDesignFontId(style.fontFamily) ? style.fontFamily : "sans"
  const size = num(style.fontSize, FONT_SIZE_RANGE.min, FONT_SIZE_RANGE.max, 24)
  const weight = nearestFontWeight(font, num(style.fontWeight, 100, 900, 400))
  const color = safeColor(style.color) ?? "#1F2430"
  const headerFill = safeColor(style.headerFill) ?? null
  const fill = safeColor(style.fill) ?? null
  const banded = style.banded === true
  const stroke = safeColor(style.stroke) ?? null
  const accent = headerFill ?? color
  return {
    font,
    size,
    weight,
    headerWeight: nearestFontWeight(font, Math.max(weight, 700)),
    italic: style.italic === true,
    color,
    align: oneOf(style.textAlign, ["left", "center", "right"] as const, "left"),
    verticalAlign: oneOf(style.verticalAlign, ["top", "middle", "bottom"] as const, "middle"),
    lineHeight: num(style.lineHeight, 0.8, 3, 1.2),
    padding: num(style.padding, 0, 200, round2(size * 0.4)),
    header: style.header === true,
    headerFill,
    headerColor: safeColor(style.headerColor) ?? (headerFill ? readableOn(headerFill) : color),
    fill,
    banded,
    bandFill: banded ? (safeColor(style.bandFill) ?? (fill ? mixColors(fill, accent, 0.12) : withAlpha(accent, 0.1))) : null,
    stroke,
    strokeWidth: stroke ? num(style.strokeWidth, 0, 40, 1) : 0,
    opacity: num(style.opacity, 0.02, 1, 1),
  }
}

/** Shares of the whole (summing to 1); equal shares when the stored list doesn't fit the grid. */
function shares(value: unknown, count: number): number[] {
  const even = () => Array.from({ length: count }, () => 1 / count)
  if (!Array.isArray(value) || value.length !== count) return even()
  const raw = value.map((item) => (typeof item === "number" && Number.isFinite(item) && item > 0 ? item : 0))
  const total = raw.reduce((sum, item) => sum + item, 0)
  if (raw.some((item) => item <= 0) || total <= 0) return even()
  return raw.map((item) => item / total)
}

export function tableColumnShares(element: Pick<CanvasElement, "style">, columns: number): number[] {
  return shares(element.style?.columns, columns)
}

export function tableRowShares(element: Pick<CanvasElement, "style">, rows: number): number[] {
  return shares(element.style?.rows, rows)
}

function edges(parts: readonly number[], total: number): number[] {
  const out = [0]
  let at = 0
  for (const part of parts) {
    at += part * total
    out.push(round2(at))
  }
  out[out.length - 1] = round2(total)
  return out
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export interface TableCellBox {
  row: number
  column: number
  x: number
  y: number
  width: number
  height: number
  text: string
  header: boolean
  fill: string | null
  color: string
  /** How the cell's text is laid out (the shared size, fit "none"). */
  input: TextLayoutInput
}

export interface TableLayout {
  rows: number
  columns: number
  /** The size every cell uses: smaller than asked when the fullest cell needed it. */
  size: number
  /** Column edges from 0 to the width, then row edges from 0 to the height. */
  xs: number[]
  ys: number[]
  cells: TableCellBox[]
  style: DesignTableStyle
}

const SHRINK_STEP = 0.93

export function layoutTable(element: Pick<CanvasElement, "width" | "height" | "content" | "style">, measure: MeasureText = estimateMeasure): TableLayout {
  const style = readTableStyle(element)
  const grid = parseTableCells(element.content)
  const rows = grid.length
  const columns = grid[0].length
  const xs = edges(tableColumnShares(element, columns), Math.max(1, element.width))
  const ys = edges(tableRowShares(element, rows), Math.max(1, element.height))
  const isHeader = (row: number) => style.header && row === 0
  const input = (row: number, size: number): TextLayoutInput => ({
    font: style.font,
    size,
    weight: isHeader(row) ? style.headerWeight : style.weight,
    italic: style.italic,
    letterSpacing: 0,
    lineHeight: style.lineHeight,
    uppercase: false,
    list: "none",
    verticalAlign: style.verticalAlign,
    fit: "none",
    padding: style.padding,
  })
  // A cell fits when its lines fit its height without splitting a word.
  const fits = (size: number) =>
    grid.every((cells, row) =>
      cells.every((text, column) => {
        if (!text.trim()) return true
        const laid = layoutText(text, { width: xs[column + 1] - xs[column], height: ys[row + 1] - ys[row] }, input(row, size), measure)
        return !laid.overflow && !laid.brokeWord
      }),
    )

  let size = style.size
  const floor = Math.max(MIN_FONT_SIZE, style.size * 0.3)
  while (size > floor && !fits(size)) size = Math.max(floor, size * SHRINK_STEP)
  size = round2(size)

  const cells: TableCellBox[] = []
  let bodyRow = 0
  grid.forEach((row, rowIndex) => {
    const header = isHeader(rowIndex)
    const fill = header ? style.headerFill : style.banded && bodyRow % 2 === 1 ? style.bandFill : style.fill
    if (!header) bodyRow += 1
    row.forEach((text, column) => {
      cells.push({
        row: rowIndex,
        column,
        x: xs[column],
        y: ys[rowIndex],
        width: round2(xs[column + 1] - xs[column]),
        height: round2(ys[rowIndex + 1] - ys[rowIndex]),
        text,
        header,
        fill,
        color: header ? style.headerColor : style.color,
        input: input(rowIndex, size),
      })
    })
  })
  return { rows, columns, size, xs, ys, cells, style }
}

/** The grid lines as SVG path data: the outer frame, then every line between cells. */
export function tableGridPath(layout: Pick<TableLayout, "xs" | "ys">): string {
  const width = layout.xs[layout.xs.length - 1]
  const height = layout.ys[layout.ys.length - 1]
  const parts = [`M0 0H${width}V${height}H0Z`]
  for (const x of layout.xs.slice(1, -1)) parts.push(`M${x} 0V${height}`)
  for (const y of layout.ys.slice(1, -1)) parts.push(`M0 ${y}H${width}`)
  return parts.join("")
}

/** The cell under a point in the table's own (unrotated) frame, clamped to the grid. */
export function tableCellAt(layout: Pick<TableLayout, "xs" | "ys">, x: number, y: number): { row: number; column: number } {
  const find = (lines: readonly number[], value: number) => {
    for (let index = 1; index < lines.length; index += 1) if (value < lines[index]) return index - 1
    return lines.length - 2
  }
  return { row: Math.max(0, find(layout.ys, y)), column: Math.max(0, find(layout.xs, x)) }
}

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

/** Change the height keeping the top edge in place, turned with the table (as `editing.withHeightFromTop`). */
function withHeight(element: CanvasElement, height: number): CanvasElement {
  const next = Math.max(1, round2(height))
  const delta = next - element.height
  if (Math.abs(delta) < 0.01) return element
  const radians = (element.rotation * Math.PI) / 180
  const cx = element.x + element.width / 2 - (Math.sin(radians) * delta) / 2
  const cy = element.y + element.height / 2 + (Math.cos(radians) * delta) / 2
  return { ...element, height: next, x: round2(cx - element.width / 2), y: round2(cy - next / 2) }
}

function roundShares(values: readonly number[]): number[] {
  return values.map((value) => Math.round(value * 10000) / 10000)
}

/** How long cell (row, column) may grow before the table reaches the text cap. */
export function tableCellRoom(element: Pick<CanvasElement, "content">, row: number, column: number): number {
  const grid = parseTableCells(element.content)
  const current = grid[row]?.[column] ?? ""
  return Math.max(current.length, TABLE_LIMITS.characters - serializeTableCells(grid).length + current.length)
}

export function withTableCell(element: CanvasElement, row: number, column: number, text: string): CanvasElement {
  const grid = parseTableCells(element.content)
  if (!grid[row] || grid[row][column] === undefined) return element
  const next = grid.map((cells) => [...cells])
  next[row][column] = cleanCell(text).slice(0, tableCellRoom(element, row, column))
  const content = serializeTableCells(next)
  return content === element.content ? element : { ...element, content }
}

/**
 * Paste tab-separated rows (what a spreadsheet copies) from cell (row,
 * column) onwards: the table gains the rows and columns the paste needs, up
 * to the limits, and text past the cap is left out.
 */
export function pasteIntoTable(element: CanvasElement, row: number, column: number, text: string): CanvasElement {
  const pasted = String(text ?? "").replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n").map((line) => line.split("\t"))
  let next = element
  const needRows = Math.min(TABLE_LIMITS.rows, row + pasted.length)
  while (parseTableCells(next.content).length < needRows) next = insertTableRow(next, parseTableCells(next.content).length)
  const needColumns = Math.min(TABLE_LIMITS.columns, column + Math.max(...pasted.map((cells) => cells.length)))
  while (parseTableCells(next.content)[0].length < needColumns) next = insertTableColumn(next, parseTableCells(next.content)[0].length)
  pasted.forEach((cells, rowOffset) => {
    cells.forEach((value, columnOffset) => {
      next = withTableCell(next, row + rowOffset, column + columnOffset, value.trim())
    })
  })
  return next
}

/**
 * Add a row at `index` (0 puts it first), as tall as the row beside it. The
 * table grows by that much downwards, so no text has to shrink.
 */
export function insertTableRow(element: CanvasElement, index: number): CanvasElement {
  const grid = parseTableCells(element.content)
  if (grid.length >= TABLE_LIMITS.rows) return element
  const at = Math.max(0, Math.min(grid.length, Math.floor(index)))
  const heights = tableRowShares(element, grid.length).map((share) => share * element.height)
  const added = heights[Math.min(at, heights.length - 1)]
  const nextGrid = [...grid.slice(0, at), grid[0].map(() => ""), ...grid.slice(at)]
  const nextHeights = [...heights.slice(0, at), added, ...heights.slice(at)]
  const total = nextHeights.reduce((sum, value) => sum + value, 0)
  const grown = withHeight(element, element.height + added)
  return { ...grown, content: serializeTableCells(nextGrid), style: { ...element.style, rows: roundShares(nextHeights.map((value) => value / total)) } }
}

/** Remove row `index`; the table gets shorter by its height. The last row stays. */
export function removeTableRow(element: CanvasElement, index: number): CanvasElement {
  const grid = parseTableCells(element.content)
  if (grid.length <= 1 || index < 0 || index >= grid.length) return element
  const heights = tableRowShares(element, grid.length).map((share) => share * element.height)
  const removed = heights[index]
  const nextHeights = heights.filter((_, position) => position !== index)
  const total = nextHeights.reduce((sum, value) => sum + value, 0)
  const shrunk = withHeight(element, element.height - removed)
  const style = { ...element.style, rows: roundShares(nextHeights.map((value) => value / total)) }
  return { ...shrunk, content: serializeTableCells(grid.filter((_, position) => position !== index)), style }
}

/** Add a column at `index`. The table keeps its width: the new column takes an even share. */
export function insertTableColumn(element: CanvasElement, index: number): CanvasElement {
  const grid = parseTableCells(element.content)
  const columns = grid[0].length
  if (columns >= TABLE_LIMITS.columns) return element
  const at = Math.max(0, Math.min(columns, Math.floor(index)))
  const current = tableColumnShares(element, columns).map((share) => share * columns / (columns + 1))
  const nextShares = [...current.slice(0, at), 1 / (columns + 1), ...current.slice(at)]
  const nextGrid = grid.map((row) => [...row.slice(0, at), "", ...row.slice(at)])
  return { ...element, content: serializeTableCells(nextGrid), style: { ...element.style, columns: roundShares(nextShares) } }
}

/** Remove column `index`; the others widen to fill the table. The last column stays. */
export function removeTableColumn(element: CanvasElement, index: number): CanvasElement {
  const grid = parseTableCells(element.content)
  const columns = grid[0].length
  if (columns <= 1 || index < 0 || index >= columns) return element
  const kept = tableColumnShares(element, columns).filter((_, position) => position !== index)
  const total = kept.reduce((sum, value) => sum + value, 0)
  const nextGrid = grid.map((row) => row.filter((_, position) => position !== index))
  return { ...element, content: serializeTableCells(nextGrid), style: { ...element.style, columns: roundShares(kept.map((value) => value / total)) } }
}

/**
 * The row fills top to bottom, with neighbouring rows of one colour merged
 * into one band (so no hairline seam shows between them).
 */
export function tableRowFills(layout: Pick<TableLayout, "cells" | "columns" | "xs" | "ys">): Array<{ y: number; height: number; fill: string }> {
  const bands: Array<{ y: number; height: number; fill: string }> = []
  for (let row = 0; row < layout.ys.length - 1; row += 1) {
    const fill = layout.cells[row * layout.columns]?.fill
    const y = layout.ys[row]
    const height = round2(layout.ys[row + 1] - y)
    const last = bands[bands.length - 1]
    if (!fill) continue
    if (last && last.fill === fill && Math.abs(last.y + last.height - y) < 0.01) last.height = round2(last.height + height)
    else bands.push({ y, height, fill })
  }
  return bands
}
