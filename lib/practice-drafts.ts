import type { PracticeMode } from "@/components/learn/types"
import type { PracticeQuestionFilter } from "./practice-features"

export const PRACTICE_DRAFTS_KEY = "learn_practice_drafts_v1"

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

type PracticeDraftStore = Record<string, PracticeDraftState>

const questionFilters: PracticeQuestionFilter[] = ["all", "unanswered", "marked", "missed"]
const practiceModes: PracticeMode[] = ["quiz", "exam", "flashcards", "matching", "sprint", "mistake-retry", "fill-blank", "true-false", "generated"]

export function normalizePracticeDraft(value: unknown, quizId: string): PracticeDraftState | null {
  if (!value || typeof value !== "object") return null
  const input = value as Record<string, unknown>
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
  return normalizePracticeDraft(readPracticeDraftStore()[quizId], quizId)
}

export function writePracticeDraft(draft: PracticeDraftState) {
  if (typeof window === "undefined") return
  const store = readPracticeDraftStore()
  window.localStorage.setItem(PRACTICE_DRAFTS_KEY, JSON.stringify({ ...store, [draft.quizId]: draft }))
}

export function clearPracticeDraft(quizId: string) {
  if (typeof window === "undefined") return
  const store = readPracticeDraftStore()
  delete store[quizId]
  window.localStorage.setItem(PRACTICE_DRAFTS_KEY, JSON.stringify(store))
}

function readPracticeDraftStore(): PracticeDraftStore {
  try {
    const stored = window.localStorage.getItem(PRACTICE_DRAFTS_KEY)
    const parsed = stored ? JSON.parse(stored) : {}
    return parsed && typeof parsed === "object" ? parsed as PracticeDraftStore : {}
  } catch {
    return {}
  }
}

function normalizeAnswers(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const answers: Record<string, string> = {}
  for (const [questionId, choiceId] of Object.entries(value as Record<string, unknown>)) {
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
