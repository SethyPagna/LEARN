import type { StudioInsertTarget } from "@/components/learn/types"
import type { AiGatewayReadiness } from "./gateway-readiness"
import type { GuidedPromptResult } from "./prompt-builder"

export type AiPromptReadinessStatus = "ready" | "warning" | "blocked"
const SHORT_OUTPUT_TOKENS = 2048
const BALANCED_OUTPUT_TOKENS = 4096
const DEEP_OUTPUT_TOKENS = 8192
const MAX_OUTPUT_TOKENS = 16_384

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

export function buildAiTutorSourceContext(input: {
  message: string
  recentContext: string
  sourceScope: string
  includeRecentNotes: boolean
}) {
  const message = input.message.trim()
  const recentContext = input.recentContext.trim()
  if (input.sourceScope === "Manual only") return message
  if (input.sourceScope === "Recent notes") return [message, recentContext].filter(Boolean).join("\n\n")
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
}) {
  const recommendedTokenBudget = getRecommendedAiTutorTokens(input.outputLength)
  const tokenBudgetIsLow = input.tokenBudget < recommendedTokenBudget
  const status = workflowStatus(input.prompt, input.gateway, tokenBudgetIsLow)
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
      : input.sourceScope

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
        detail: contextLabel,
        tone: input.recentNoteCount || input.sourceScope === "Manual only" ? "good" as const : "watch" as const,
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
        detail: "Controls what the prompt includes",
        tone: input.recentNoteCount || input.sourceScope === "Manual only" ? "good" as const : "watch" as const,
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

function workflowStatus(prompt: GuidedPromptResult, gateway: AiGatewayReadiness, tokenBudgetIsLow: boolean): AiPromptReadinessStatus {
  if (!prompt.ok || gateway.status === "blocked") return "blocked"
  if (prompt.warnings.length || gateway.status === "warning" || tokenBudgetIsLow) return "warning"
  return "ready"
}

function nextAiAction(input: {
  prompt: GuidedPromptResult
  gateway: AiGatewayReadiness
  insertTarget: StudioInsertTarget
  tokenBudgetIsLow: boolean
  recommendedTokenBudget: number
}) {
  if (!input.prompt.ok) return `Fill: ${input.prompt.missing.join(", ")}`
  if (input.gateway.status === "blocked") return "Fix provider route"
  if (input.gateway.status === "warning") return "Review gateway"
  if (input.tokenBudgetIsLow) return `Use ${input.recommendedTokenBudget} tokens`
  return `Run and insert as ${labelInsertTarget(input.insertTarget)}`
}

function labelInsertTarget(target: StudioInsertTarget) {
  return target.replace(/-/g, " ")
}
