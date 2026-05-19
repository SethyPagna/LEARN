import type { StudioKind, WorkspaceDeck } from "@/components/learn/types"

export const STUDIO_DRAFTS_KEY = "learn_studio_drafts_v1"
export const STUDIO_DRAFT_EVENT = "learn:studio-drafts"
export const STUDIO_DRAFT_NOTICE_COOLDOWN_MS = 12000

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
    return stored ? JSON.parse(stored) : {}
  } catch {
    return {}
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
