import type { PracticeMode } from "@/components/learn/types"
import type { PracticeQuestionFilter } from "./practice-features"

export const PRACTICE_DRAFTS_KEY = "learn_practice_drafts_v1"
export const PRACTICE_DRAFT_EVENT = "learn:practice-drafts"

export interface PracticeDraftState {
  quizId: string
  answers: Record<string, string>
  markedQuestionIds: string[]
  retryQuestionIds: string[]
  questionFilter: PracticeQuestionFilter
  practiceMode: PracticeMode
  targetMinutes: number
  elapsedSeconds: number
  updatedAt: string
}

export type PracticeDraftStore = Record<string, PracticeDraftState>

export type PracticeDraftSummary = {
  count: number
  quizIds: string[]
  latestAt?: string
}

export interface PracticeDraftCard {
  quizId: string
  title: string
  practiceMode: PracticeMode
  answeredCount: number
  markedCount: number
  retryCount: number
  elapsedSeconds: number
  updatedAt: string
}

const questionFilters: PracticeQuestionFilter[] = ["all", "unanswered", "marked", "missed"]
const practiceModes: PracticeMode[] = ["quiz", "exam", "flashcards", "matching", "sprint", "mistake-retry", "fill-blank", "true-false", "generated"]

export function normalizePracticeDraft(value: unknown, quizId: string): PracticeDraftState | null {
  if (!isRecord(value)) return null
  const input = value
  if (String(input.quizId || "") !== quizId) return null

  const questionFilter = questionFilters.includes(input.questionFilter as PracticeQuestionFilter)
    ? input.questionFilter as PracticeQuestionFilter
    : "all"
  const practiceMode = practiceModes.includes(input.practiceMode as PracticeMode)
    ? input.practiceMode as PracticeMode
    : "quiz"

  return {
    quizId,
    answers: normalizeAnswers(input.answers),
    markedQuestionIds: normalizeStringList(input.markedQuestionIds),
    retryQuestionIds: normalizeStringList(input.retryQuestionIds),
    questionFilter,
    practiceMode,
    targetMinutes: clampNumber(input.targetMinutes, 1, 180, 10),
    elapsedSeconds: clampNumber(input.elapsedSeconds, 0, 24 * 60 * 60, 0),
    updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : new Date(0).toISOString(),
  }
}

export function hasPracticeDraftContent(draft: PracticeDraftState, defaultMode: PracticeMode) {
  return Object.keys(draft.answers).length > 0
    || draft.markedQuestionIds.length > 0
    || draft.retryQuestionIds.length > 0
    || draft.questionFilter !== "all"
    || draft.practiceMode !== defaultMode
    || draft.elapsedSeconds > 3
}

export function readPracticeDraft(quizId: string): PracticeDraftState | null {
  if (typeof window === "undefined") return null
  return normalizePracticeDraft(readPracticeDrafts()[quizId], quizId)
}

export function readPracticeDrafts(): PracticeDraftStore {
  if (typeof window === "undefined") return {}
  return readPracticeDraftStore()
}

export function writePracticeDraft(draft: PracticeDraftState) {
  if (typeof window === "undefined") return
  const next = { ...readPracticeDraftStore(), [draft.quizId]: draft }
  window.localStorage.setItem(PRACTICE_DRAFTS_KEY, JSON.stringify(next))
  publishPracticeDraftSummary(next)
}

export function clearPracticeDraft(quizId: string) {
  if (typeof window === "undefined") return
  const store = readPracticeDraftStore()
  delete store[quizId]
  window.localStorage.setItem(PRACTICE_DRAFTS_KEY, JSON.stringify(store))
  publishPracticeDraftSummary(store)
}

export function summarizePracticeDrafts(store: Record<string, unknown>): PracticeDraftSummary {
  const quizIds: string[] = []
  let latestAt: string | undefined

  for (const [quizId, value] of Object.entries(store)) {
    const draft = normalizePracticeDraft(value, quizId)
    if (!draft || !hasPracticeDraftContent(draft, "quiz")) continue
    quizIds.push(quizId)
    if (draft.updatedAt && (!latestAt || draft.updatedAt > latestAt)) latestAt = draft.updatedAt
  }

  return { count: quizIds.length, quizIds, latestAt }
}

export function listPracticeDraftCards(store: Record<string, unknown>, quizTitles: Record<string, string> = {}): PracticeDraftCard[] {
  const cards: PracticeDraftCard[] = []
  for (const [quizId, value] of Object.entries(store)) {
    const draft = normalizePracticeDraft(value, quizId)
    if (!draft || !hasPracticeDraftContent(draft, "quiz")) continue
    cards.push({
      quizId,
      title: quizTitles[quizId] || "Saved practice",
      practiceMode: draft.practiceMode,
      answeredCount: Object.keys(draft.answers).length,
      markedCount: draft.markedQuestionIds.length,
      retryCount: draft.retryQuestionIds.length,
      elapsedSeconds: draft.elapsedSeconds,
      updatedAt: draft.updatedAt,
    })
  }
  return cards.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

export function publishPracticeDraftSummary(store: Record<string, unknown>) {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(PRACTICE_DRAFT_EVENT, { detail: summarizePracticeDrafts(store) }))
}

function readPracticeDraftStore(): PracticeDraftStore {
  try {
    const stored = window.localStorage.getItem(PRACTICE_DRAFTS_KEY)
    const parsed = stored ? JSON.parse(stored) : {}
    if (!isRecord(parsed)) return {}
    const store: PracticeDraftStore = {}
    for (const [quizId, value] of Object.entries(parsed)) {
      const draft = normalizePracticeDraft(value, quizId)
      if (draft) store[quizId] = draft
    }
    return store
  } catch {
    return {}
  }
}

function normalizeAnswers(value: unknown) {
  if (!isRecord(value)) return {}
  const answers: Record<string, string> = {}
  for (const [questionId, choiceId] of Object.entries(value)) {
    if (typeof choiceId === "string" && questionId.trim() && choiceId.trim()) answers[questionId] = choiceId
  }
  return answers
}

function normalizeStringList(value: unknown) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim())))]
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(max, Math.max(min, Math.floor(numeric)))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}
