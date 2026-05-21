import type { StudioInsertTarget } from "@/components/learn/types"
import type { AiGatewayReadiness } from "./gateway-readiness"
import type { GuidedPromptResult } from "./prompt-builder"
import type { AiTaskKey } from "./prompt-library"
import type { TutorMode } from "./tutor"

export type AiPromptReadinessStatus = "ready" | "warning" | "blocked"
const SHORT_OUTPUT_TOKENS = 2048
const BALANCED_OUTPUT_TOKENS = 4096
const DEEP_OUTPUT_TOKENS = 8192
const MAX_OUTPUT_TOKENS = 16_384

export type AiTutorModeGroupId = "all" | "tutor" | "studio" | "practice"

export interface AiTutorModeOption {
  id: AiTaskKey
  mode: TutorMode
  label: string
  prompt: string
}

export const aiTutorModeOptions: AiTutorModeOption[] = [
  { id: "answer_explanation", mode: "mistake", label: "Mistake", prompt: "Explain the mistake, repair the misconception, and create a short retry drill." },
  { id: "note_design", mode: "rewrite", label: "Rewrite", prompt: "Rewrite this into a clean study page with headings, callouts, examples, and review prompts." },
  { id: "quiz_generation", mode: "quiz", label: "Quiz", prompt: "Generate a mixed quiz with MCQ, true/false, fill-in-the-blank, and explanations." },
  { id: "flashcard_generation", mode: "flashcards", label: "Flashcards", prompt: "Create active-recall flashcards and a tiny memory game from this context." },
  { id: "study_plan", mode: "route", label: "Study Plan", prompt: "Create a targeted 7-day study route with daily focus, review, and practice." },
  { id: "document_formatter", mode: "cleanup", label: "Docs", prompt: "Format raw material into a Studio document with blocks, callouts, and review questions." },
  { id: "document_editor", mode: "cleanup", label: "Doc Edit", prompt: "Edit this document for hierarchy, flow, references, and study usefulness." },
  { id: "sheet_organizer", mode: "cleanup", label: "Sheets", prompt: "Organize messy data into spreadsheet columns, rows, filters, and validation notes." },
  { id: "sheet_formula_builder", mode: "cleanup", label: "Formulas", prompt: "Design useful formulas, validation rules, filters, and chart suggestions for this sheet." },
  { id: "slide_builder", mode: "cleanup", label: "Slides", prompt: "Build a concise lesson deck with layouts, objects, and speaker notes." },
  { id: "slide_design_director", mode: "cleanup", label: "Deck Design", prompt: "Design a teaching deck with visual hierarchy, transitions, animations, timing, and presenter notes." },
  { id: "practice_generator", mode: "quiz", label: "Practice", prompt: "Create targeted practice with timing, explanations, retry set, and review cards." },
  { id: "personalized_prompt", mode: "coach", label: "Prompt", prompt: "Compose a precise personalized prompt with requirements and output format." },
  { id: "translation", mode: "translate", label: "Translate", prompt: "Translate and simplify this learning material while preserving key terms." },
]

export const aiTutorSourceScopes = ["Recent notes", "Active Studio item", "Weak topics", "Uploaded files", "Manual only"]
export const aiTutorDifficulties = ["Adaptive", "Beginner", "Intermediate", "Advanced", "Exam prep"]
export const aiTutorTones = ["Kind", "Direct", "Socratic", "Concise", "Detailed"]
export const aiTutorOutputLengths = ["Short", "Balanced", "Deep", "Max"]
export const aiTutorLanguages = ["English", "Khmer", "French", "Spanish", "Korean", "Japanese", "Chinese"]
export const aiTutorTokenPresets = [SHORT_OUTPUT_TOKENS, BALANCED_OUTPUT_TOKENS, DEEP_OUTPUT_TOKENS, MAX_OUTPUT_TOKENS] as const

export const aiTutorModeGroups: Array<{ id: AiTutorModeGroupId; label: string; modes: AiTaskKey[] }> = [
  { id: "all", label: "All", modes: aiTutorModeOptions.map((mode) => mode.id) },
  { id: "tutor", label: "Tutor", modes: ["answer_explanation", "study_plan", "personalized_prompt", "translation"] },
  { id: "studio", label: "Studio", modes: ["note_design", "document_formatter", "document_editor", "sheet_organizer", "sheet_formula_builder", "slide_builder", "slide_design_director"] },
  { id: "practice", label: "Practice", modes: ["quiz_generation", "flashcard_generation", "practice_generator"] },
]

export function getAiTutorModeOption(taskId: string) {
  return aiTutorModeOptions.find((mode) => mode.id === taskId) || aiTutorModeOptions[0]
}

export function getAiTutorModeGroupForTask(taskId: string): AiTutorModeGroupId {
  return aiTutorModeGroups.find((group) => group.id !== "all" && group.modes.includes(taskId as AiTaskKey))?.id ?? "all"
}

export interface AiTutorWorkflowSummary {
  status: AiPromptReadinessStatus
  statusLabel: string
  taskLabel: string
  promptLabel: string
  providerLabel: string
  insertLabel: string
  contextLabel: string
  tokenLabel: string
  nextAction: string
  overview: Array<{
    id: "task" | "context" | "output" | "gateway"
    label: string
    value: string
    detail: string
    tone: "good" | "watch" | "blocked" | "neutral"
  }>
  cards: Array<{
    id: "task" | "prompt" | "provider" | "insert" | "context" | "draft"
    label: string
    value: string
    detail: string
    tone: "good" | "watch" | "blocked" | "neutral"
  }>
}

export type AiTutorPrimaryActionKind = "run" | "prompt" | "import" | "gateway"

export interface AiTutorPrimaryActionPlan {
  action: AiTutorPrimaryActionKind
  label: string
  disabled: boolean
  statusMessage: string
}

export interface AiTutorUploadedSourceSummary {
  attached: boolean
  badgeCount: number
  label: string
  detail: string
  source: "pasted" | "saved" | "empty"
}

export function buildAiTutorSourceContext(input: {
  message: string
  recentContext: string
  sourceScope: string
  includeRecentNotes: boolean
  uploadedContext?: string
}) {
  const message = input.message.trim()
  const recentContext = input.recentContext.trim()
  const uploadedContext = input.uploadedContext?.trim() || ""
  if (input.sourceScope === "Manual only") return message
  if (input.sourceScope === "Recent notes") return [message, recentContext].filter(Boolean).join("\n\n")
  if (input.sourceScope === "Uploaded files") {
    return [
      message,
      uploadedContext ? `Uploaded files:\n${uploadedContext}` : "",
      input.includeRecentNotes && recentContext ? `Recent notes:\n${recentContext}` : "",
    ].filter(Boolean).join("\n\n")
  }
  if (input.includeRecentNotes && recentContext) return [message, `Recent notes:\n${recentContext}`].filter(Boolean).join("\n\n")
  return message
}

export function summarizeAiTutorWorkflow(input: {
  taskLabel: string
  sourceScope: string
  insertTarget: StudioInsertTarget
  prompt: GuidedPromptResult
  gateway: AiGatewayReadiness
  recentNoteCount: number
  draftSaved: boolean
  difficulty: string
  language: string
  outputLength: string
  providerFamily: string
  tokenBudget: number
  effectiveTokenBudget: number
  uploadedContextLength?: number
}) {
  const recommendedTokenBudget = getRecommendedAiTutorTokens(input.outputLength)
  const tokenBudgetIsLow = input.tokenBudget < recommendedTokenBudget
  const contextWarning = getAiTutorContextWarning(input.sourceScope, input.recentNoteCount, input.uploadedContextLength || 0)
  const status = workflowStatus(input.prompt, input.gateway, tokenBudgetIsLow, Boolean(contextWarning))
  const promptLabel = input.prompt.ok ? "Complete" : `${input.prompt.missing.length} missing`
  const providerLabel = input.gateway.readyProviderCount
    ? `${input.gateway.readyProviderCount} ready`
    : "Not ready"
  const insertLabel = labelInsertTarget(input.insertTarget)
  const tokenLabel = tokenBudgetIsLow
    ? `${input.effectiveTokenBudget} effective`
    : `${input.effectiveTokenBudget}`
  const contextLabel = input.sourceScope === "Manual only"
    ? "Manual"
    : input.sourceScope === "Recent notes"
      ? `${input.sourceScope} (${input.recentNoteCount} notes)`
      : input.sourceScope === "Uploaded files"
        ? input.uploadedContextLength
          ? `Uploaded files (${formatContextSize(input.uploadedContextLength)})`
          : "Uploaded files (empty)"
      : input.sourceScope
  const contextTone = contextWarning ? "watch" as const : "good" as const

  return {
    status,
    statusLabel: status === "ready" ? "Ready to run" : status === "warning" ? "Review first" : "Blocked",
    taskLabel: input.taskLabel,
    promptLabel,
    providerLabel,
    insertLabel,
    contextLabel,
    tokenLabel,
    nextAction: nextAiAction({
      prompt: input.prompt,
      gateway: input.gateway,
      insertTarget: input.insertTarget,
      tokenBudgetIsLow,
      recommendedTokenBudget,
      contextWarning,
    }),
    overview: [
      {
        id: "task" as const,
        label: "Task",
        value: input.taskLabel,
        detail: "Selected AI workflow",
        tone: "neutral" as const,
      },
      {
        id: "context" as const,
        label: "Context",
        value: `${input.sourceScope} / ${input.difficulty}`,
        detail: contextWarning || contextLabel,
        tone: contextTone,
      },
      {
        id: "output" as const,
        label: "Output",
        value: `${input.outputLength} / ${input.language} / ${tokenLabel}`,
        detail: tokenBudgetIsLow
          ? `Saved setting is ${input.tokenBudget}; LEARN will use ${input.effectiveTokenBudget} for this run.`
          : "Length and token budget are aligned.",
        tone: tokenBudgetIsLow ? "watch" as const : "good" as const,
      },
      {
        id: "gateway" as const,
        label: "Gateway",
        value: `${input.providerFamily === "auto" ? "Auto" : input.providerFamily} / ${providerLabel}`,
        detail: input.gateway.checks.join(" "),
        tone: input.gateway.status === "ready" ? "good" as const : input.gateway.status === "blocked" ? "blocked" as const : "watch" as const,
      },
    ],
    cards: [
      {
        id: "task" as const,
        label: "Task",
        value: input.taskLabel,
        detail: "Selected tutor workflow",
        tone: "neutral" as const,
      },
      {
        id: "prompt" as const,
        label: "Prompt",
        value: promptLabel,
        detail: input.prompt.ok ? "Required fields are filled" : `Missing ${input.prompt.missing.join(", ")}`,
        tone: input.prompt.ok ? "good" as const : "blocked" as const,
      },
      {
        id: "provider" as const,
        label: "Gateway",
        value: `${providerLabel} / ${tokenLabel}`,
        detail: [
          ...input.gateway.checks,
          tokenBudgetIsLow ? `Token budget raised from ${input.tokenBudget} to ${input.effectiveTokenBudget} for ${input.outputLength}.` : "",
        ].filter(Boolean).join(" "),
        tone: input.gateway.status === "ready" && !tokenBudgetIsLow ? "good" as const : input.gateway.status === "blocked" ? "blocked" as const : "watch" as const,
      },
      {
        id: "insert" as const,
        label: "Insert",
        value: insertLabel,
        detail: input.prompt.warnings.length ? input.prompt.warnings.join(" ") : "Insert target fits this task",
        tone: input.prompt.warnings.length ? "watch" as const : "good" as const,
      },
      {
        id: "context" as const,
        label: "Context",
        value: contextLabel,
        detail: contextWarning || "Controls what the prompt includes",
        tone: contextTone,
      },
      {
        id: "draft" as const,
        label: "Draft",
        value: input.draftSaved ? "Saved" : "Editing",
        detail: input.draftSaved ? "Local prompt draft is persisted" : "Autosave will persist shortly",
        tone: input.draftSaved ? "good" as const : "neutral" as const,
      },
    ],
  }
}

export function getRecommendedAiTutorTokens(outputLength: string) {
  if (outputLength === "Short") return SHORT_OUTPUT_TOKENS
  if (outputLength === "Deep") return DEEP_OUTPUT_TOKENS
  if (outputLength === "Max") return MAX_OUTPUT_TOKENS
  return BALANCED_OUTPUT_TOKENS
}

export function resolveAiTutorEffectiveTokens(input: {
  outputLength: string
  tokenBudget: number
}) {
  return Math.max(input.tokenBudget, getRecommendedAiTutorTokens(input.outputLength))
}

export function buildAiTutorPrimaryActionPlan(input: {
  prompt: GuidedPromptResult
  gateway: AiGatewayReadiness
  loading: boolean
  sourceScope: string
  uploadedContextLength: number
}) {
  if (input.loading) {
    return {
      action: "run" as const,
      label: "Thinking",
      disabled: true,
      statusMessage: "AI is working on the current prompt.",
    }
  }
  if (!input.prompt.ok) {
    return {
      action: "prompt" as const,
      label: "Complete prompt",
      disabled: false,
      statusMessage: `Missing: ${input.prompt.missing.join(", ")}`,
    }
  }
  if (input.sourceScope === "Uploaded files" && input.uploadedContextLength === 0) {
    return {
      action: "import" as const,
      label: "Add source",
      disabled: false,
      statusMessage: "Paste or import source material before running this workflow.",
    }
  }
  if (input.gateway.status === "blocked") {
    return {
      action: "gateway" as const,
      label: "Fix gateway",
      disabled: false,
      statusMessage: "Review provider keys or routing before running.",
    }
  }
  return {
    action: "run" as const,
    label: "Run tutor",
    disabled: false,
    statusMessage: "",
  }
}

export function summarizeAiTutorUploadedSource(input: {
  draftText: string
  savedText: string
  savedTitle?: string
}) {
  const draftLength = input.draftText.trim().length
  if (draftLength > 0) {
    return {
      attached: true,
      badgeCount: 1,
      label: "Pasted source",
      detail: formatContextSize(draftLength),
      source: "pasted" as const,
    }
  }

  const savedLength = input.savedText.trim().length
  if (savedLength > 0) {
    return {
      attached: true,
      badgeCount: 1,
      label: input.savedTitle ? `Saved: ${input.savedTitle}` : "Saved source",
      detail: formatContextSize(savedLength),
      source: "saved" as const,
    }
  }

  return {
    attached: false,
    badgeCount: 0,
    label: "No source",
    detail: "Paste or import material to attach context.",
    source: "empty" as const,
  }
}

export function resolveAiTutorSourceScopeAfterUpload(input: {
  currentScope: string
  uploadedContextLength: number
}) {
  if (input.uploadedContextLength > 0) return "Uploaded files"
  if (input.currentScope === "Uploaded files") return "Recent notes"
  return input.currentScope
}

export function splitPromptPreview(preview: string) {
  const lines = preview.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const requirements: string[] = []
  const warnings: string[] = []
  let task = ""
  let output = ""

  for (const line of lines) {
    if (line.startsWith("Task:")) task = line.replace("Task:", "").trim()
    else if (line.startsWith("Warning:")) warnings.push(line.replace("Warning:", "").trim())
    else if (line.startsWith("Output:")) output = line.replace("Output:", "").trim()
    else requirements.push(line)
  }

  return { task, requirements, warnings, output }
}

function workflowStatus(
  prompt: GuidedPromptResult,
  gateway: AiGatewayReadiness,
  tokenBudgetIsLow: boolean,
  hasContextWarning: boolean,
): AiPromptReadinessStatus {
  if (!prompt.ok || gateway.status === "blocked") return "blocked"
  if (prompt.warnings.length || gateway.status === "warning" || tokenBudgetIsLow || hasContextWarning) return "warning"
  return "ready"
}

function nextAiAction(input: {
  prompt: GuidedPromptResult
  gateway: AiGatewayReadiness
  insertTarget: StudioInsertTarget
  tokenBudgetIsLow: boolean
  recommendedTokenBudget: number
  contextWarning?: string
}) {
  if (!input.prompt.ok) return `Fill: ${input.prompt.missing.join(", ")}`
  if (input.gateway.status === "blocked") return "Fix provider route"
  if (input.contextWarning) return "Attach source material"
  if (input.gateway.status === "warning") return "Review gateway"
  if (input.tokenBudgetIsLow) return `Use ${input.recommendedTokenBudget} tokens`
  return `Run and insert as ${labelInsertTarget(input.insertTarget)}`
}

function labelInsertTarget(target: StudioInsertTarget) {
  return target.replace(/-/g, " ")
}

function getAiTutorContextWarning(sourceScope: string, recentNoteCount: number, uploadedContextLength: number) {
  if (sourceScope === "Uploaded files" && uploadedContextLength === 0) {
    return "Paste or import material before using Uploaded files as the source."
  }
  if (sourceScope === "Recent notes" && recentNoteCount === 0) {
    return "Create or import a note before using Recent notes as the source."
  }
  return ""
}

function formatContextSize(characterCount: number) {
  if (characterCount < 1000) return `${characterCount} chars`
  return `${Math.round(characterCount / 100) / 10}k chars`
}
