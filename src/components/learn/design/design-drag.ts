import type { CanvasElement } from "@/lib/studio/canvas-engine"
import {
  cardElement,
  frameElement,
  pictureElement,
  shapeElement,
  stickerElement,
  textPresetElement,
  TEXT_PRESET_IDS,
  type PageBox,
  type TextPresetId,
} from "@/lib/design/editing"
import { isShapeKind, type ShapeKind } from "@/lib/design/shapes"
import { IMAGE_MASKS, type ImageMask } from "@/lib/design/style"
import type { MeasureText } from "@/lib/design/text"
import type { DesignTheme } from "@/lib/design/themes"

/**
 * Dragging something from a side panel onto a page.
 *
 * The drag carries a small description of the item (a shape kind, a text
 * preset, a sticker, a picture's address), never a built element: the page it
 * lands on decides the size, and the drop is validated field by field because
 * any page can start a drag carrying anything.
 *
 * Clicking the same panel tile builds the same element through
 * `elementForItem`, so a click and a drag always agree.
 */

export const DESIGN_ITEM_MIME = "application/x-learn-design-item"

export type DesignDragItem =
  | { kind: "shape"; shape: ShapeKind }
  | { kind: "text"; preset: TextPresetId }
  | { kind: "sticker"; glyph: string }
  | { kind: "frame"; mask: ImageMask }
  | { kind: "card" }
  | { kind: "picture"; src: string; width: number | null; height: number | null }

const MAX_GLYPH = 16

/** Same-origin paths and inline pictures only: the page policy blocks anything else anyway. */
export function isPlaceablePictureSource(src: unknown): src is string {
  if (typeof src !== "string" || src.length > 2_000_000) return false
  if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml|avif);base64,[a-z0-9+/=\s]+$/i.test(src)) return true
  return /^\/(?!\/)[^\s\\]*$/.test(src)
}

function positiveOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value < 100000 ? value : null
}

export function parseDesignDragItem(value: unknown): DesignDragItem | null {
  if (typeof value !== "object" || value === null) return null
  const input = value as Record<string, unknown>
  switch (input.kind) {
    case "shape":
      return isShapeKind(input.shape) ? { kind: "shape", shape: input.shape } : null
    case "text":
      return typeof input.preset === "string" && (TEXT_PRESET_IDS as readonly string[]).includes(input.preset) ? { kind: "text", preset: input.preset as TextPresetId } : null
    case "sticker": {
      const glyph = typeof input.glyph === "string" ? input.glyph.trim() : ""
      return glyph && glyph.length <= MAX_GLYPH ? { kind: "sticker", glyph } : null
    }
    case "frame":
      return typeof input.mask === "string" && (IMAGE_MASKS as readonly string[]).includes(input.mask) ? { kind: "frame", mask: input.mask as ImageMask } : null
    case "card":
      return { kind: "card" }
    case "picture":
      return isPlaceablePictureSource(input.src) ? { kind: "picture", src: input.src, width: positiveOrNull(input.width), height: positiveOrNull(input.height) } : null
    default:
      return null
  }
}

export function setDesignDragItem(transfer: DataTransfer, item: DesignDragItem): void {
  transfer.setData(DESIGN_ITEM_MIME, JSON.stringify(item))
  transfer.effectAllowed = "copy"
}

export function hasDesignDragItem(transfer: DataTransfer | null | undefined): boolean {
  return Boolean(transfer && Array.from(transfer.types ?? []).includes(DESIGN_ITEM_MIME))
}

export function readDesignDragItem(transfer: DataTransfer | null | undefined): DesignDragItem | null {
  if (!transfer) return null
  const raw = transfer.getData(DESIGN_ITEM_MIME)
  if (!raw || raw.length > 2_100_000) return null
  try {
    return parseDesignDragItem(JSON.parse(raw))
  } catch {
    return null
  }
}

/** The element an item makes on a page of this size and theme (not yet placed). */
export function elementForItem(item: DesignDragItem, theme: DesignTheme, page: PageBox, measure: MeasureText): CanvasElement {
  switch (item.kind) {
    case "shape":
      return shapeElement(item.shape, theme, page)
    case "text":
      return textPresetElement(item.preset, theme, page, measure)
    case "sticker":
      return stickerElement(item.glyph, page, measure)
    case "frame":
      return frameElement(item.mask, page)
    case "card":
      return cardElement(theme, page)
    case "picture":
      return pictureElement(item.src, item.width && item.height ? { width: item.width, height: item.height } : null, page)
  }
}
