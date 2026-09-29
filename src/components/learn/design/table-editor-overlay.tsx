"use client"

import { useLayoutEffect, useRef, type CSSProperties } from "react"

import type { CanvasElement } from "@/lib/studio/canvas-engine"
import { designFontStack } from "@/lib/design/fonts"
import { insertTableRow, layoutTable, pasteIntoTable, tableCellRoom, withTableCell } from "@/lib/design/table"
import { layoutText, type MeasureText } from "@/lib/design/text"

/**
 * Typing into a table, one cell at a time, right where the cell sits: a
 * transparent textarea over the cell with the cell's face, size, padding and
 * alignment, while the page hides that cell's own lines underneath.
 *
 * Tab moves to the next cell (and adds a row after the last one), Shift+Tab
 * goes back, Enter moves down, and a click on another cell moves there.
 * Pasting rows copied from a spreadsheet fills the cells from here on.
 * Escape, Enter in the last row, or a click off the table ends typing.
 */

export interface TableCell {
  row: number
  column: number
}

export interface TableEditorOverlayProps {
  element: CanvasElement
  zoom: number
  measure: MeasureText
  cell: TableCell
  onCell: (cell: TableCell) => void
  /** Change the table; edits to one cell share `coalesce`, so undo takes back a word run, not a letter. */
  onUpdate: (change: (element: CanvasElement) => CanvasElement, coalesce?: string) => void
  onDone: (refocus: boolean) => void
  onUndo: (redo: boolean) => void
}

export function TableEditorOverlay({ element, zoom, measure, cell, onCell, onUpdate, onDone, onUndo }: TableEditorOverlayProps) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const table = layoutTable(element, measure)
  const row = Math.min(cell.row, table.rows - 1)
  const column = Math.min(cell.column, table.columns - 1)
  const box = table.cells[row * table.columns + column]

  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    node.focus({ preventScroll: true })
    node.select()
  }, [row, column])

  const text = box.text
  const laid = layoutText(text || " ", { width: box.width, height: box.height }, box.input, measure)
  const padding = Math.max(0, box.input.padding)

  const frame: CSSProperties = {
    position: "absolute",
    left: element.x * zoom,
    top: element.y * zoom,
    width: element.width * zoom,
    height: element.height * zoom,
    transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
    pointerEvents: "none",
    zIndex: 2,
  }
  const field: CSSProperties = {
    position: "absolute",
    left: box.x * zoom,
    top: box.y * zoom,
    width: box.width * zoom,
    height: box.height * zoom,
    margin: 0,
    padding: `${(padding + laid.offsetY) * zoom}px ${padding * zoom}px 0`,
    boxSizing: "border-box",
    fontFamily: designFontStack(box.input.font),
    fontSize: laid.size * zoom,
    fontWeight: box.input.weight,
    fontStyle: box.input.italic ? "italic" : "normal",
    lineHeight: `${laid.lineHeight * zoom}px`,
    textAlign: table.style.align,
    color: box.color,
    caretColor: box.color,
    background: "transparent",
    border: 0,
    outline: "2px solid #6d5ce8",
    outlineOffset: -1,
    resize: "none",
    overflow: "hidden",
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    pointerEvents: "auto",
  }

  const move = (next: TableCell) => onCell(next)
  const next = () => {
    if (column < table.columns - 1) return move({ row, column: column + 1 })
    if (row < table.rows - 1) return move({ row: row + 1, column: 0 })
    onUpdate((current) => insertTableRow(current, table.rows))
    move({ row: row + 1, column: 0 })
  }
  const previous = () => {
    if (column > 0) move({ row, column: column - 1 })
    else if (row > 0) move({ row: row - 1, column: table.columns - 1 })
  }

  return (
    <div style={frame} data-table-editor="">
      {table.cells.map((other) =>
        other.row === row && other.column === column ? null : (
          <button
            key={`${other.row}:${other.column}`}
            type="button"
            tabIndex={-1}
            data-keep-editing="true"
            aria-label={`Row ${other.row + 1}, column ${other.column + 1}`}
            style={{ position: "absolute", left: other.x * zoom, top: other.y * zoom, width: other.width * zoom, height: other.height * zoom, padding: 0, border: 0, background: "transparent", cursor: "text", pointerEvents: "auto" }}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => move({ row: other.row, column: other.column })}
          />
        ),
      )}
      <textarea
        ref={ref}
        data-text-editor=""
        data-keep-editing="true"
        aria-label={`Row ${row + 1}, column ${column + 1}`}
        value={text}
        spellCheck
        maxLength={tableCellRoom(element, row, column)}
        style={field}
        onPointerDown={(event) => event.stopPropagation()}
        onChange={(event) => onUpdate((current) => withTableCell(current, row, column, event.target.value), `table:${element.id}:${row}:${column}`)}
        onPaste={(event) => {
          const pasted = event.clipboardData.getData("text/plain")
          if (!/[\t\n]/.test(pasted.replace(/\r?\n$/, ""))) return
          event.preventDefault()
          onUpdate((current) => pasteIntoTable(current, row, column, pasted))
        }}
        onKeyDown={(event) => {
          const mod = event.ctrlKey || event.metaKey
          const key = event.key.toLowerCase()
          if (event.key === "Escape") {
            event.preventDefault()
            event.stopPropagation()
            onDone(true)
          } else if (event.key === "Tab") {
            event.preventDefault()
            event.stopPropagation()
            if (event.shiftKey) previous()
            else next()
          } else if (event.key === "Enter" && !mod && !event.altKey) {
            event.preventDefault()
            event.stopPropagation()
            if (event.shiftKey) {
              if (row > 0) move({ row: row - 1, column })
            } else if (row < table.rows - 1) move({ row: row + 1, column })
            else onDone(true)
          } else if (mod && !event.altKey && (key === "z" || key === "y")) {
            event.preventDefault()
            onUndo(key === "y" || event.shiftKey)
          }
        }}
        onBlur={(event) => {
          const target = event.relatedTarget
          if (target instanceof HTMLElement && target.closest("[data-keep-editing]")) return
          onDone(false)
        }}
      />
    </div>
  )
}
