import type { StudioKind, WorkspaceDeck } from "@/components/learn/types"

export const STUDIO_DRAFTS_KEY = "learn_studio_drafts_v1"
export const STUDIO_DRAFT_EVENT = "learn:studio-drafts"

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
  const records = Object.values(store).filter(Boolean) as StudioDraftRecord[]
  const latest = records
    .map((record) => record.updatedAt)
    .filter(Boolean)
    .sort()
    .at(-1)
  return {
    count: records.length,
    labels: records.map((record) => record.kind),
    latestAt: latest,
  }
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
