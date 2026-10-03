/**
 * Local draft for the design canvas.
 *
 * The same shape as `lib/studio-drafts.ts`: the parsing/normalizing half is pure
 * and unit tested, and the `window.localStorage` access is a thin guarded
 * wrapper. A canvas is expensive to lose — a drag session can be minutes of
 * work — so the editor writes a draft on every change and only clears it once
 * the server has acknowledged the save.
 *
 * The draft is deliberately *not* part of the open canvas format in
 * `canvas-engine.ts`: it is throwaway local state with a reason attached, and
 * it must never leak into an exported document.
 */

import { normalizeCanvasDoc, serializeCanvas, type CanvasDoc } from "./canvas-engine"

export const CANVAS_DRAFT_KEY = "learn_canvas_draft_v1"

export type CanvasDraftReason = "unsaved" | "save-failed"

export interface CanvasDraftRecord {
  /** The server row this draft belongs to, when it came from a saved canvas. */
  id?: string
  title: string
  canvas: CanvasDoc
  updatedAt: string
  reason: CanvasDraftReason
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Normalize any stored timestamp into something `Date.parse` treats consistently. */
function timestampOf(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) return null
  const normalized = value.includes("T") ? value : value.replace(" ", "T")
  const parsed = Date.parse(normalized)
  return Number.isNaN(parsed) ? null : parsed
}

function normalizeReason(value: unknown): CanvasDraftReason {
  return value === "save-failed" ? "save-failed" : "unsaved"
}

/**
 * Parse a stored draft. Junk (bad JSON, a string, a missing canvas) returns
 * null so the caller falls back to the saved document rather than to a blank
 * canvas, which would look like data loss.
 */
export function parseStoredCanvasDraft(raw: string | null): CanvasDraftRecord | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(parsed)) return null
  const canvas = normalizeCanvasDoc(parsed.canvas)
  if (!isRecord(parsed.canvas)) return null
  return {
    ...(typeof parsed.id === "string" && parsed.id ? { id: parsed.id } : {}),
    title: typeof parsed.title === "string" && parsed.title.trim() ? parsed.title : canvas.name,
    canvas,
    updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
    reason: normalizeReason(parsed.reason),
  }
}

/** Serialize a draft into local storage shape. */
export function serializeCanvasDraft(record: CanvasDraftRecord): string {
  return JSON.stringify({
    version: 1,
    ...(record.id ? { id: record.id } : {}),
    title: record.title,
    updatedAt: record.updatedAt,
    reason: normalizeReason(record.reason),
    canvas: JSON.parse(serializeCanvas(record.canvas)) as unknown,
  })
}

/**
 * Whether a draft should win over the saved row. A draft with no comparable
 * timestamp is only trusted when there is no server copy at all.
 */
export function shouldRestoreCanvasDraft(draft: CanvasDraftRecord | null, serverUpdatedAt?: string | null): boolean {
  if (!draft) return false
  const draftTime = timestampOf(draft.updatedAt)
  const serverTime = timestampOf(serverUpdatedAt)
  if (!serverTime) return true
  if (!draftTime) return false
  return draftTime > serverTime
}

export function readCanvasDraft(): CanvasDraftRecord | null {
  if (typeof window === "undefined") return null
  return parseStoredCanvasDraft(window.localStorage.getItem(CANVAS_DRAFT_KEY))
}

export function writeCanvasDraft(record: CanvasDraftRecord): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(CANVAS_DRAFT_KEY, serializeCanvasDraft(record))
  } catch {
    // A full or disabled storage must not break editing; the draft is best effort.
  }
}

export function clearCanvasDraft(): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(CANVAS_DRAFT_KEY)
  } catch {
    // Ignore: a draft that cannot be cleared is cleared on the next successful save.
  }
}
