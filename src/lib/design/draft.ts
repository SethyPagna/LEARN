import { parseStoredCanvasDraft } from "@/lib/studio/canvas-draft"

import { normalizeDesignDoc, serializeDesign, type DesignDoc } from "./document"

/**
 * Local drafts for designs.
 *
 * A design can be an hour of work, so the editor writes a draft on every
 * change and drops it only once the server has acknowledged the save. Unlike
 * the first canvas editor (one draft, key `learn_canvas_draft_v1`) a person
 * can have several designs open over time, so drafts are kept per design,
 * newest first, and capped: local storage is small and a draft is a whole
 * document.
 *
 * The parsing half is pure; the `localStorage` access is a thin guarded
 * wrapper, and storage that is full or disabled never breaks editing.
 */

export const DESIGN_DRAFT_KEY = "learn_design_drafts_v2"
/** The first editor's single draft; read once and carried over. */
export const LEGACY_CANVAS_DRAFT_KEY = "learn_canvas_draft_v1"

const MAX_DRAFTS = 4
/** Characters of JSON, about 3 MB of UTF-16: leaves room for the rest of the app. */
const MAX_STORED_CHARS = 1_500_000

export type DesignDraftReason = "unsaved" | "save-failed"

export interface DesignDraftRecord {
  /** The server record the draft belongs to (new designs get their id up front). */
  id: string
  title: string
  design: DesignDoc
  updatedAt: string
  reason: DesignDraftReason
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Milliseconds for a server timestamp (`"2026-09-21 06:45:10"`, UTC without a
 * zone) or an ISO string. A bare SQLite timestamp would otherwise be read as
 * local time and skew the draft-or-server decision by the UTC offset.
 */
export function timestampMs(value: unknown): number | null {
  const text = typeof value === "string" ? value.trim() : ""
  if (!text) return null
  const iso = text.replace(" ", "T")
  const utc = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso) ? iso : `${iso}Z`
  const parsed = Date.parse(utc)
  return Number.isNaN(parsed) ? null : parsed
}

function normalizeDraft(value: unknown): DesignDraftRecord | null {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id.trim() || !isRecord(value.design)) return null
  const design = normalizeDesignDoc(value.design)
  return {
    id: value.id.slice(0, 120),
    title: typeof value.title === "string" && value.title.trim() ? value.title.slice(0, 200) : design.name,
    design,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
    reason: value.reason === "save-failed" ? "save-failed" : "unsaved",
  }
}

/** Parse stored drafts; junk entries are dropped, junk storage is an empty list. */
export function parseStoredDesignDrafts(raw: string | null): DesignDraftRecord[] {
  if (!raw) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.drafts)) return []
  const seen = new Set<string>()
  const drafts: DesignDraftRecord[] = []
  for (const entry of parsed.drafts) {
    const draft = normalizeDraft(entry)
    if (!draft || seen.has(draft.id)) continue
    seen.add(draft.id)
    drafts.push(draft)
  }
  return drafts
}

export function serializeDesignDrafts(drafts: readonly DesignDraftRecord[]): string {
  return JSON.stringify({
    version: 2,
    drafts: drafts.map((draft) => ({
      id: draft.id,
      title: draft.title,
      updatedAt: draft.updatedAt,
      reason: draft.reason,
      design: JSON.parse(serializeDesign(draft.design)) as unknown,
    })),
  })
}

/** The first editor's draft as a design draft (its canvas becomes page one). */
export function legacyDraftAsDesign(raw: string | null): DesignDraftRecord | null {
  const legacy = parseStoredCanvasDraft(raw)
  if (!legacy) return null
  const design = normalizeDesignDoc({ ...legacy.canvas, name: legacy.title })
  const id = legacy.id || design.id
  return { id, title: legacy.title, design: { ...design, id }, updatedAt: legacy.updatedAt, reason: legacy.reason }
}

/**
 * Put a draft first, keep the newest few, and stay under the storage budget
 * (older drafts go first; the current one is always kept).
 */
export function upsertDraft(drafts: readonly DesignDraftRecord[], draft: DesignDraftRecord): DesignDraftRecord[] {
  const next = [draft, ...drafts.filter((entry) => entry.id !== draft.id)].slice(0, MAX_DRAFTS)
  while (next.length > 1 && serializeDesignDrafts(next).length > MAX_STORED_CHARS) next.pop()
  return next
}

/**
 * Whether a draft should win over the saved record. A draft with no
 * comparable timestamp is only trusted when there is no server copy at all.
 */
export function shouldRestoreDesignDraft(draft: DesignDraftRecord | null, serverUpdatedAt?: string | null): boolean {
  if (!draft) return false
  const serverTime = timestampMs(serverUpdatedAt)
  if (serverTime === null) return true
  const draftTime = timestampMs(draft.updatedAt)
  if (draftTime === null) return false
  return draftTime > serverTime
}

function storage(): Storage | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** Every stored draft, including a carried-over first-editor draft. */
export function readDesignDrafts(): DesignDraftRecord[] {
  const store = storage()
  if (!store) return []
  let drafts: DesignDraftRecord[] = []
  try {
    drafts = parseStoredDesignDrafts(store.getItem(DESIGN_DRAFT_KEY))
    const legacy = legacyDraftAsDesign(store.getItem(LEGACY_CANVAS_DRAFT_KEY))
    if (legacy) {
      if (!drafts.some((draft) => draft.id === legacy.id)) drafts = upsertDraft(drafts, legacy)
      store.setItem(DESIGN_DRAFT_KEY, serializeDesignDrafts(drafts))
      store.removeItem(LEGACY_CANVAS_DRAFT_KEY)
    }
  } catch {
    // Unreadable storage: nothing to restore.
  }
  return drafts
}

export function readDesignDraft(id: string): DesignDraftRecord | null {
  return readDesignDrafts().find((draft) => draft.id === id) ?? null
}

export function writeDesignDraft(draft: DesignDraftRecord): void {
  const store = storage()
  if (!store) return
  try {
    const drafts = upsertDraft(parseStoredDesignDrafts(store.getItem(DESIGN_DRAFT_KEY)), draft)
    store.setItem(DESIGN_DRAFT_KEY, serializeDesignDrafts(drafts))
  } catch {
    // A full or disabled storage must not break editing; the draft is best effort.
  }
}

export function clearDesignDraft(id: string): void {
  const store = storage()
  if (!store) return
  try {
    const drafts = parseStoredDesignDrafts(store.getItem(DESIGN_DRAFT_KEY)).filter((draft) => draft.id !== id)
    if (drafts.length) store.setItem(DESIGN_DRAFT_KEY, serializeDesignDrafts(drafts))
    else store.removeItem(DESIGN_DRAFT_KEY)
  } catch {
    // Ignore: a draft that cannot be cleared is replaced by the next save's.
  }
}
