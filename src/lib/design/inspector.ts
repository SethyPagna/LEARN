import { normalizeAngle, type CanvasElement } from "../studio/canvas-engine"

export type GeometryField = "x" | "y" | "width" | "height" | "rotation"
const MAX_GEOMETRY = 20_000

export function editGeometry(element: CanvasElement, field: GeometryField, input: string): CanvasElement {
  if (element.locked || !input.trim()) return element
  const value = Number(input)
  if (!Number.isFinite(value)) return element
  const bounded = field === "rotation" ? normalizeAngle(value)
    : field === "width" || field === "height" ? Math.max(1, Math.min(MAX_GEOMETRY, value))
    : Math.max(-MAX_GEOMETRY, Math.min(MAX_GEOMETRY, value))
  return element[field] === bounded ? element : { ...element, [field]: bounded }
}
