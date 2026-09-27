/**
 * Pure helpers for the select-to-act pill: which selections are worth acting
 * on, what text the actions receive, and where the pill sits: clear of the
 * words you picked whenever there is room, and always on screen.
 */

/** Shorter than this reads as a stray click, not a passage to study. */
export const MIN_SELECTION_CHARS = 12
/** Enough for a few paragraphs; the AI hand-off caps sources at 12,000 characters. */
export const MAX_SELECTION_CHARS = 4000

const GAP = 10
const MARGIN = 8

export interface BoxRect {
  left: number
  top: number
  right: number
  bottom: number
}

export interface DockPlacement {
  left: number
  top: number
  side: "above" | "below"
}

/** Selected text with the editor's spacing quirks removed, capped at a word boundary. */
export function cleanSelectionText(text: string, max = MAX_SELECTION_CHARS) {
  const cleaned = text
    .replace(/ /g, " ")
    .replace(/[ \t\f\v]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  if (cleaned.length <= max) return cleaned
  const cut = cleaned.slice(0, max)
  const lastSpace = cut.lastIndexOf(" ")
  return `${(lastSpace > max * 0.8 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

// A RegExp object, not a literal: the ES6 target rejects `\p{…}` in literals.
const WORDLIKE = new RegExp("\\p{L}|\\p{N}", "u")

/** At least two words and a dozen characters: enough to quiz, share or play with. */
export function isActionableSelection(text: string) {
  const cleaned = cleanSelectionText(text)
  return cleaned.length >= MIN_SELECTION_CHARS && cleaned.split(/\s+/).filter((word) => WORDLIKE.test(word)).length >= 2
}

/**
 * Where the pill goes: centred on the selection, on the preferred side (above
 * with a mouse, below on touch where the system menu sits above), flipped when
 * that side has no room and clamped into the viewport. `first` and `last` are
 * the first and last line boxes of the selection. Returns null once the
 * selection has scrolled out of view.
 */
export function placeSelectionDock(
  first: BoxRect,
  last: BoxRect,
  dock: { width: number; height: number },
  viewport: { width: number; height: number },
  prefer: "above" | "below" = "above",
): DockPlacement | null {
  if (last.bottom < 0 || first.top > viewport.height) return null
  const above = first.top - GAP - dock.height
  const below = last.bottom + GAP
  const fitsAbove = above >= MARGIN
  const fitsBelow = below + dock.height <= viewport.height - MARGIN
  const side = prefer === "above" ? (fitsAbove || !fitsBelow ? "above" : "below") : (fitsBelow || !fitsAbove ? "below" : "above")
  const line = side === "above" ? first : last
  const centre = (line.left + line.right) / 2
  const left = Math.max(MARGIN, Math.min(centre - dock.width / 2, viewport.width - dock.width - MARGIN))
  const top = Math.max(MARGIN, Math.min(side === "above" ? above : below, viewport.height - dock.height - MARGIN))
  return { left: Math.round(left), top: Math.round(top), side }
}
