import type { StudioKind, WorkspaceDeck } from "@/components/learn/types"

export const STUDIO_DRAFTS_KEY = "learn_studio_drafts_v1"
export const STUDIO_DRAFT_EVENT = "learn:studio-drafts"
export const STUDIO_DRAFT_NOTICE_COOLDOWN_MS = 12000
const studioKinds: StudioKind[] = ["notes", "docs", "sheets", "slides"]

export type StudioDraftRecord =
  | { kind: "notes"; id?: string; title: string; content: string; updatedAt: string }
  | { kind: "docs"; id?: string; title: string; content: string; updatedAt: string }
  | { kind: "sheets"; id?: string; title: string; cells: string[][]; updatedAt: string }
  | { kind: "slides"; id?: string; title: string; slides: WorkspaceDeck["slides"]; updatedAt: string }

export type StudioDraftStore = Partial<Record<StudioKind, StudioDraftRecord>>

export type StudioDraftSummary = {
  count: number
  labels: string[]
  latestAt?: string
}

export type StudioDraftNoticeInput = {
  cooldownMs?: number
  kind: StudioKind
  lastKind?: StudioKind
  lastShownAt?: number
  now: number
}

export function readStudioDrafts(): StudioDraftStore {
  if (typeof window === "undefined") return {}
  try {
    const stored = window.localStorage.getItem(STUDIO_DRAFTS_KEY)
    const parsed = stored ? JSON.parse(stored) : {}
    if (!isRecord(parsed)) return {}
    const drafts: StudioDraftStore = {}
    for (const kind of studioKinds) {
      const draft = normalizeStudioDraftRecord(parsed[kind], kind)
      if (draft) drafts[kind] = draft
    }
    return drafts
  } catch {
    return {}
  }
}

export function normalizeStudioDraftRecord(value: unknown, kind: StudioKind): StudioDraftRecord | null {
  if (!isRecord(value) || value.kind !== kind) return null
  const title = typeof value.title === "string" ? value.title : ""
  const updatedAt = typeof value.updatedAt === "string" ? value.updatedAt : ""
  const id = typeof value.id === "string" ? value.id : undefined

  if (kind === "sheets") {
    return {
      kind,
      ...(id ? { id } : {}),
      title,
      cells: normalizeDraftCells(value.cells),
      updatedAt,
    }
  }

  if (kind === "slides") {
    return {
      kind,
      ...(id ? { id } : {}),
      title,
      slides: normalizeDraftSlides(value.slides),
      updatedAt,
    }
  }

  return {
    kind,
    ...(id ? { id } : {}),
    title,
    content: typeof value.content === "string" ? value.content : "",
    updatedAt,
  }
}

export function summarizeStudioDrafts(store: StudioDraftStore): StudioDraftSummary {
  let count = 0
  let latestAt: string | undefined
  const labels: string[] = []

  for (const record of Object.values(store)) {
    if (!record) continue
    count += 1
    labels.push(record.kind)
    if (record.updatedAt && (!latestAt || record.updatedAt > latestAt)) {
      latestAt = record.updatedAt
    }
  }

  return { count, labels, latestAt }
}

export function shouldAnnounceStudioDraftSave({
  cooldownMs = STUDIO_DRAFT_NOTICE_COOLDOWN_MS,
  kind,
  lastKind,
  lastShownAt,
  now,
}: StudioDraftNoticeInput) {
  if (!lastShownAt) return true
  if (lastKind && lastKind !== kind) return true
  return now - lastShownAt >= cooldownMs
}

export function publishStudioDraftSummary(store: StudioDraftStore) {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(STUDIO_DRAFT_EVENT, { detail: summarizeStudioDrafts(store) }))
}

export function writeStudioDraft(kind: StudioKind, draft: StudioDraftRecord) {
  if (typeof window === "undefined") return summarizeStudioDrafts({})
  const next = { ...readStudioDrafts(), [kind]: draft }
  window.localStorage.setItem(STUDIO_DRAFTS_KEY, JSON.stringify(next))
  publishStudioDraftSummary(next)
  return summarizeStudioDrafts(next)
}

export function clearStudioDraft(kind: StudioKind) {
  if (typeof window === "undefined") return summarizeStudioDrafts({})
  const next = { ...readStudioDrafts() }
  delete next[kind]
  window.localStorage.setItem(STUDIO_DRAFTS_KEY, JSON.stringify(next))
  publishStudioDraftSummary(next)
  return summarizeStudioDrafts(next)
}

function normalizeDraftCells(value: unknown): string[][] {
  if (!Array.isArray(value)) return []
  return value
    .filter((row): row is unknown[] => Array.isArray(row))
    .map((row) => row.map((cell) => String(cell ?? "")))
}

function normalizeDraftSlides(value: unknown): WorkspaceDeck["slides"] {
  if (!Array.isArray(value)) return []
  return value
    .filter(isRecord)
    .map((slide) => ({
      title: typeof slide.title === "string" ? slide.title : "",
      body: typeof slide.body === "string" ? slide.body : "",
      accent: typeof slide.accent === "string" ? slide.accent : undefined,
      layout: isSlideLayout(slide.layout) ? slide.layout : undefined,
      theme: typeof slide.theme === "string" ? slide.theme : undefined,
      background: typeof slide.background === "string" ? slide.background : undefined,
      transition: isSlideTransition(slide.transition) ? slide.transition : undefined,
      animation: isSlideAnimation(slide.animation) ? slide.animation : undefined,
      hidden: typeof slide.hidden === "boolean" ? slide.hidden : undefined,
      locked: typeof slide.locked === "boolean" ? slide.locked : undefined,
      objects: Array.isArray(slide.objects) ? slide.objects as WorkspaceDeck["slides"][number]["objects"] : undefined,
      speakerNotes: typeof slide.speakerNotes === "string" ? slide.speakerNotes : undefined,
    }))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function isSlideLayout(value: unknown): value is NonNullable<WorkspaceDeck["slides"][number]["layout"]> {
  return value === "title" || value === "two-column" || value === "image" || value === "quote"
}

function isSlideTransition(value: unknown): value is NonNullable<WorkspaceDeck["slides"][number]["transition"]> {
  return value === "none" || value === "fade" || value === "push" || value === "zoom" || value === "wipe"
}

function isSlideAnimation(value: unknown): value is NonNullable<WorkspaceDeck["slides"][number]["animation"]> {
  return value === "none" || value === "rise" || value === "reveal" || value === "emphasis"
}
