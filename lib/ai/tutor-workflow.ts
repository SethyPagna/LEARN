import type { StudioInsertTarget } from "@/components/learn/types"
import type { AiGatewayReadiness } from "./gateway-readiness"
import type { GuidedPromptResult } from "./prompt-builder"

export type AiPromptReadinessStatus = "ready" | "warning" | "blocked"

export interface AiTutorWorkflowSummary {
  status: AiPromptReadinessStatus
  statusLabel: string
  taskLabel: string
  promptLabel: string
  providerLabel: string
  insertLabel: string
  contextLabel: string
  nextAction: string
  cards: Array<{
    id: "task" | "prompt" | "provider" | "insert" | "context" | "draft"
    label: string
    value: string
    detail: string
    tone: "good" | "watch" | "blocked" | "neutral"
  }>
}

export function summarizeAiTutorWorkflow(input: {
  taskLabel: string
  sourceScope: string
  insertTarget: StudioInsertTarget
  prompt: GuidedPromptResult
  gateway: AiGatewayReadiness
  recentNoteCount: number
  draftSaved: boolean
}) {
  const status = workflowStatus(input.prompt, input.gateway)
  const promptLabel = input.prompt.ok ? "Complete" : `${input.prompt.missing.length} missing`
  const providerLabel = input.gateway.readyProviderCount
    ? `${input.gateway.readyProviderCount} ready`
    : "Not ready"
  const insertLabel = labelInsertTarget(input.insertTarget)
  const contextLabel = input.sourceScope === "Manual only"
    ? "Manual"
    : `${input.sourceScope} (${input.recentNoteCount} notes)`

  return {
    status,
    statusLabel: status === "ready" ? "Ready to run" : status === "warning" ? "Review first" : "Blocked",
    taskLabel: input.taskLabel,
    promptLabel,
    providerLabel,
    insertLabel,
    contextLabel,
    nextAction: nextAiAction({ prompt: input.prompt, gateway: input.gateway, insertTarget: input.insertTarget }),
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
        value: providerLabel,
        detail: input.gateway.checks.join(" "),
        tone: input.gateway.status === "ready" ? "good" as const : input.gateway.status === "blocked" ? "blocked" as const : "watch" as const,
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

function workflowStatus(prompt: GuidedPromptResult, gateway: AiGatewayReadiness): AiPromptReadinessStatus {
  if (!prompt.ok || gateway.status === "blocked") return "blocked"
  if (prompt.warnings.length || gateway.status === "warning") return "warning"
  return "ready"
}

function nextAiAction(input: {
  prompt: GuidedPromptResult
  gateway: AiGatewayReadiness
  insertTarget: StudioInsertTarget
}) {
  if (!input.prompt.ok) return `Fill: ${input.prompt.missing.join(", ")}`
  if (input.gateway.status === "blocked") return "Fix provider route"
  if (input.gateway.status === "warning") return "Review gateway"
  return `Run and insert as ${labelInsertTarget(input.insertTarget)}`
}

function labelInsertTarget(target: StudioInsertTarget) {
  return target.replace(/-/g, " ")
}
