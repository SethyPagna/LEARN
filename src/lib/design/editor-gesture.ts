import { boundsOf, moveElements, type CanvasDoc, type ResizeHandle, type SnapGuide } from "../studio/canvas-engine"
import { resizeDesignElement, scaleSelection } from "./editing"
import { angleAt, constrainAxis, rotateSelection, snapSelectionMove, type Point } from "./gestures"
import type { MeasureText } from "./text"

export interface ElementGesture {
  kind: "move" | "resize" | "rotate"
  canvas: CanvasDoc
  ids: readonly string[]
  start: Point
  handle?: ResizeHandle
}

/** Every frame is calculated from the pointer-down snapshot, never the last frame. */
export function previewElementGesture(gesture: ElementGesture, input: { point: Point; shift: boolean; snap: boolean; grid: boolean; zoom: number; measure: MeasureText }): { canvas: CanvasDoc; guides: SnapGuide[] } {
  const starts = gesture.canvas.elements.filter((element) => gesture.ids.includes(element.id) && !element.locked && !element.hidden)
  let dx = input.point.x - gesture.start.x
  let dy = input.point.y - gesture.start.y
  if (!starts.length) return { canvas: gesture.canvas, guides: [] }
  if (gesture.kind === "move") {
    if (input.shift) ({ dx, dy } = constrainAxis(dx, dy))
    if (input.grid && input.snap) {
      const bounds = boundsOf(starts)!
      dx = Math.round((bounds.x + dx) / 8) * 8 - bounds.x
      dy = Math.round((bounds.y + dy) / 8) * 8 - bounds.y
    }
    const snapped = snapSelectionMove(gesture.canvas, starts, dx, dy, { snap: input.snap, threshold: 6 / input.zoom })
    return { canvas: moveElements(gesture.canvas, starts.map((element) => element.id), snapped.dx, snapped.dy), guides: snapped.guides }
  }
  let changed = starts
  if (gesture.kind === "resize") {
    const handle = gesture.handle ?? "se"
    changed = starts.length === 1 ? [resizeDesignElement(starts[0], { handle, dx, dy, shift: input.shift, measure: input.measure })] : scaleSelection(starts, handle, dx, dy, input.measure)
  } else {
    const bounds = boundsOf(starts)!
    const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
    changed = rotateSelection(starts, center, angleAt(center, input.point) - angleAt(center, gesture.start), input.shift).elements
  }
  const replacements = new Map(changed.map((element) => [element.id, element]))
  return { canvas: { ...gesture.canvas, elements: gesture.canvas.elements.map((element) => replacements.get(element.id) ?? element) }, guides: [] }
}
