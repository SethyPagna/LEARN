import { addElement, moveElements, type CanvasElement } from "../studio/canvas-engine"
import { DESIGN_LIMITS, pageCanvas, withPageCanvas, type DesignDoc } from "./document"
import { placeElement } from "./editing"
import { fillFrame, frameAt, snapSelectionMove, type Point } from "./gestures"
import { validPage } from "./editor-state"

export function insertDesignElements(doc: DesignDoc, elements: readonly CanvasElement[], options: { page: number; at?: Point; snap?: boolean }) {
  const page = validPage(doc, options.page)
  let canvas = pageCanvas(doc, page)
  const frame = options.at && elements.length === 1 && elements[0].type === "image" ? frameAt(canvas.elements, options.at) : null
  if (frame) {
    canvas = { ...canvas, elements: canvas.elements.map((element) => element.id === frame.id ? fillFrame(element, elements[0].content) : element) }
    return { doc: withPageCanvas(doc, page, canvas), page, select: [frame.id] }
  }
  const room = DESIGN_LIMITS.elementsPerPage - canvas.elements.length
  const placed = elements.slice(0, Math.max(0, room)).map((element) => {
    const next = placeElement(canvas, element, options.at)
    canvas = addElement(canvas, next)
    return next
  })
  if (options.at && placed.length) {
    const snap = snapSelectionMove(canvas, placed, 0, 0, { threshold: 6, snap: options.snap ?? true })
    canvas = moveElements(canvas, placed.map((element) => element.id), snap.dx, snap.dy)
  }
  return { doc: withPageCanvas(doc, page, canvas), page, select: placed.map((element) => element.id) }
}
