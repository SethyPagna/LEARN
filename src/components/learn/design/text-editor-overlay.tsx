"use client"

import { useLayoutEffect, useRef, type CSSProperties } from "react"

import type { CanvasElement } from "@/lib/studio/canvas-engine"
import { DESIGN_LIMITS } from "@/lib/design/document"
import { designFontStack } from "@/lib/design/fonts"
import { readShapeStyle, readTextStyle } from "@/lib/design/style"
import { layoutText, type MeasureText, type TextLayoutInput } from "@/lib/design/text"

import { shapeLabelInput } from "./design-renderer"

/**
 * Typing into a text box, or a shape's label, right where it sits on the
 * page: a transparent textarea laid over the element with the same font,
 * size, line height, padding, alignment and turn, while the page hides the
 * element's own lines underneath. What is typed reflows exactly as it will
 * be drawn, so there is no separate "edit box" to learn.
 *
 * Escape or a click elsewhere ends typing; a click on a control marked
 * `data-keep-editing` (the toolbar, a colour popover) does not, so the text
 * can be styled while it is being written.
 */

export type TextSelectMode = "all" | "end"

export interface TextEditorOverlayProps {
  element: CanvasElement
  zoom: number
  measure: MeasureText
  /** Select everything (double-click, Enter) or put the caret at the end (a click on a selected box). */
  select: TextSelectMode
  /** Changes when the caller asks for the selection again while the editor is already open. */
  selectToken: number
  onChange: (content: string) => void
  onDone: (refocus: boolean) => void
  /** Undo/redo pressed while typing: the editor's history, not the textarea's. */
  onUndo: (redo: boolean) => void
}

export function TextEditorOverlay({ element, zoom, measure, select, selectToken, onChange, onDone, onUndo }: TextEditorOverlayProps) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const selectRef = useRef(select)
  selectRef.current = select

  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    node.focus({ preventScroll: true })
    if (selectRef.current === "all") node.select()
    else node.setSelectionRange(node.value.length, node.value.length)
  }, [selectToken])

  const shape = element.type === "shape"
  const textStyle = shape ? null : readTextStyle(element)
  const input: TextLayoutInput = textStyle ?? shapeLabelInput(element)
  const color = textStyle ? textStyle.color : readShapeStyle(element).label.color
  const align = textStyle ? textStyle.align : "center"
  const layout = layoutText(element.content || " ", { width: element.width, height: element.height }, input, measure)
  const padding = Math.max(0, input.padding)

  const style: CSSProperties = {
    position: "absolute",
    left: element.x * zoom,
    top: element.y * zoom,
    width: element.width * zoom,
    height: element.height * zoom,
    transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
    margin: 0,
    padding: `${(padding + layout.offsetY) * zoom}px ${padding * zoom}px 0 ${(padding + layout.markerWidth) * zoom}px`,
    boxSizing: "border-box",
    fontFamily: designFontStack(input.font),
    fontSize: layout.size * zoom,
    fontWeight: input.weight,
    fontStyle: input.italic ? "italic" : "normal",
    lineHeight: `${layout.lineHeight * zoom}px`,
    letterSpacing: input.letterSpacing ? `${input.letterSpacing * layout.size * zoom}px` : undefined,
    textTransform: input.uppercase ? "uppercase" : undefined,
    textAlign: align,
    color,
    caretColor: color,
    background: "transparent",
    border: 0,
    outline: "none",
    resize: "none",
    overflow: "hidden",
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    pointerEvents: "auto",
    zIndex: 2,
  }

  return (
    <textarea
      ref={ref}
      data-text-editor=""
      data-keep-editing="true"
      aria-label={shape ? "Shape label" : "Text"}
      value={element.content}
      spellCheck
      maxLength={DESIGN_LIMITS.contentLength}
      style={style}
      onPointerDown={(event) => event.stopPropagation()}
      onChange={(event) => onChange(event.target.value.slice(0, DESIGN_LIMITS.contentLength))}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault()
          event.stopPropagation()
          onDone(true)
          return
        }
        const mod = event.ctrlKey || event.metaKey
        const key = event.key.toLowerCase()
        if (mod && !event.altKey && (key === "z" || key === "y")) {
          event.preventDefault()
          onUndo(key === "y" || event.shiftKey)
        }
      }}
      onBlur={(event) => {
        const next = event.relatedTarget
        if (next instanceof HTMLElement && next.closest("[data-keep-editing]")) return
        onDone(false)
      }}
    />
  )
}
