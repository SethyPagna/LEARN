import type { StudioInsertTarget } from "@/components/learn/types"
import { normalizeImportTargetSelection, type ImportTarget, type ImportTargetSelection } from "@/lib/import-gateway"
import { normalizeStudioInsertTarget } from "./prompt-builder"
import {
  aiTutorDifficulties,
  aiTutorLanguages,
  aiTutorModeGroups,
  aiTutorModeOptions,
  aiTutorOutputLengths,
  aiTutorSourceScopes,
  aiTutorTones,
  getAiTutorModeGroupForTask,
  getAiTutorModeOption,
  type AiTutorLaunchPreset,
  type AiTutorModeGroupId,
} from "./tutor-workflow"
import type { AiTaskKey } from "./prompt-library"

export const AI_TUTOR_DRAFT_KEY = "learn_ai_tutor_draft_v1"
export const AI_TUTOR_DRAFT_HISTORY_KEY = "learn_ai_tutor_draft_history_v1"
type DraftStorage = Pick<Storage, "getItem" | "setItem">

export interface AiTutorDraft {
  message: string
  reply: string
  importText?: string
  importTitle?: string
  importTarget?: ImportTargetSelection
  lastImport?: { target: ImportTarget; title: string } | null
  lastImportText?: string
  sourceScope: string
  difficulty: string
  tone: string
  outputLength: string
  language: string
  providerFamily: string
  insertTarget: StudioInsertTarget
  targetAudience: string
  requiredOutput: string
  activeTaskKey: AiTaskKey
  updatedAt: string
  sourceTitle?: string
  sourceContent?: string
}

const DEFAULT_MESSAGE = "Create a study plan from my recent notes."
const DEFAULT_AUDIENCE = "Self-directed learner"
const DEFAULT_OUTPUT = "Clear sections, compact examples, and one next action."

export function parseStoredAiTutorDraft(raw: string | null): AiTutorDraft | null {
  return normalizeAiTutorDraft(parseJson(raw))
}

function draftFingerprint(draft: AiTutorDraft) {
  const { updatedAt: _updatedAt, ...content } = normalizeAiTutorDraft(draft)!
  return JSON.stringify(content)
}

function readDraftHistory(storage: DraftStorage): AiTutorDraft[] {
  const history = parseJson(storage.getItem(AI_TUTOR_DRAFT_HISTORY_KEY))
  return Array.isArray(history) ? history.map(normalizeAiTutorDraft).filter((draft): draft is AiTutorDraft => Boolean(draft)) : []
}

/** Archive before replacing a draft. A failed write leaves the active draft untouched. */
export function archiveAiTutorDraft(storage: DraftStorage, draft: AiTutorDraft) {
  const fingerprint = draftFingerprint(draft)
  const history = readDraftHistory(storage).filter(saved => draftFingerprint(saved) !== fingerprint)
  storage.setItem(AI_TUTOR_DRAFT_HISTORY_KEY, JSON.stringify([...history, draft]))
}

export function readPreviousAiTutorDraft(storage: DraftStorage, current?: AiTutorDraft | null): AiTutorDraft | null {
  const fingerprint = current ? draftFingerprint(current) : null
  return readDraftHistory(storage).reverse().find(saved => draftFingerprint(saved) !== fingerprint) || null
}

export function persistAiTutorDraft(storage: DraftStorage, draft: AiTutorDraft) {
  storage.setItem(AI_TUTOR_DRAFT_KEY, JSON.stringify(draft))
}

export function parseStoredAiTutorLaunchPreset(raw: string | null): AiTutorLaunchPreset | null {
  return normalizeAiTutorLaunchPreset(parseJson(raw))
}

export function normalizeAiTutorDraft(value: unknown): AiTutorDraft | null {
  if (!isRecord(value)) return null
  const task = getAiTutorModeOption(readString(value.activeTaskKey, aiTutorModeOptions[0].id))

  return {
    message: readString(value.message, DEFAULT_MESSAGE),
    reply: readString(value.reply, ""),
    importText: readString(value.importText, ""),
    importTitle: readString(value.importTitle, ""),
    importTarget: normalizeImportTargetSelection(value.importTarget),
    lastImport: normalizeLastImport(value.lastImport),
    lastImportText: readString(value.lastImportText, ""),
    sourceScope: normalizeChoice(value.sourceScope, aiTutorSourceScopes, aiTutorSourceScopes[0]),
    difficulty: normalizeChoice(value.difficulty, aiTutorDifficulties, aiTutorDifficulties[0]),
    tone: normalizeChoice(value.tone, aiTutorTones, aiTutorTones[0]),
    outputLength: normalizeChoice(value.outputLength, aiTutorOutputLengths, aiTutorOutputLengths[1]),
    language: normalizeChoice(value.language, aiTutorLanguages, aiTutorLanguages[0]),
    providerFamily: readString(value.providerFamily, "auto"),
    insertTarget: normalizeStudioInsertTarget(value.insertTarget),
    targetAudience: readString(value.targetAudience, DEFAULT_AUDIENCE),
    requiredOutput: readString(value.requiredOutput, DEFAULT_OUTPUT),
    activeTaskKey: task.id,
    updatedAt: normalizeIsoDate(value.updatedAt),
    sourceTitle: readString(value.sourceTitle, "").slice(0, 200),
    sourceContent: readString(value.sourceContent, "").slice(0, 12_000),
  }
}

export function normalizeAiTutorLaunchPreset(value: unknown): AiTutorLaunchPreset | null {
  if (!isRecord(value)) return null
  const task = getAiTutorModeOption(readString(value.activeTaskKey, aiTutorModeOptions[0].id))
  const requestedGroup = readString(value.modeGroup, getAiTutorModeGroupForTask(task.id))
  const modeGroup = normalizeModeGroup(requestedGroup, task.id)

  return {
    activeTaskKey: task.id,
    insertTarget: normalizeStudioInsertTarget(value.insertTarget),
    message: readString(value.message, DEFAULT_MESSAGE),
    modeGroup,
    outputLength: normalizeChoice(value.outputLength, aiTutorOutputLengths, aiTutorOutputLengths[1]),
    sourceScope: normalizeChoice(value.sourceScope, aiTutorSourceScopes, aiTutorSourceScopes[0]),
    status: readString(value.status, ""),
    sourceTitle: readString(value.sourceTitle, "").slice(0, 200),
    sourceContent: readString(value.sourceContent, "").slice(0, 12_000),
  }
}

function parseJson(raw: string | null): unknown {
  if (!raw) return null
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

function normalizeChoice(value: unknown, options: string[], fallback: string): string {
  return typeof value === "string" && options.includes(value) ? value : fallback
}

function normalizeIsoDate(value: unknown): string {
  if (typeof value !== "string") return ""
  return Number.isNaN(Date.parse(value)) ? "" : value
}

function normalizeLastImport(value: unknown): AiTutorDraft["lastImport"] {
  if (!isRecord(value)) return null
  const target = value.target
  if (target !== "note" && target !== "doc" && target !== "sheet" && target !== "slides") return null
  return {
    target,
    title: readString(value.title, "Imported learning material"),
  }
}

function normalizeModeGroup(value: string, taskId: AiTaskKey): AiTutorModeGroupId {
  const group = aiTutorModeGroups.find((item) => item.id === value)
  if (group) return group.id
  return getAiTutorModeGroupForTask(taskId)
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}
