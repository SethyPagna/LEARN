import type { AiInsertBackAction, AiPromptContract, StudioInsertTarget } from "@/components/learn/types"
import { getPromptTemplate, renderPrompt, type AiTaskKey } from "./prompt-library"

export interface GuidedPromptInput {
  taskKey: AiTaskKey
  fields: Record<string, unknown>
  filters: {
    sourceScope: string
    difficulty: string
    tone: string
    language: string
    outputLength: string
    providerFamily: string
    insertTarget: StudioInsertTarget
  }
}

export interface GuidedPromptResult {
  ok: boolean
  missing: string[]
  preview: string
  system: string
  user: string
  outputContract: string
}

const commonInsertActions: AiInsertBackAction[] = [
  { target: "note-block", label: "Insert note block", description: "Append the result to the active note." },
  { target: "doc-section", label: "Append doc section", description: "Add formatted output to the active document." },
  { target: "sheet-rows", label: "Create sheet rows", description: "Turn structured output into spreadsheet rows." },
  { target: "slide-outline", label: "Build slides", description: "Create a deck outline from the response." },
  { target: "quiz", label: "Create quiz", description: "Save generated questions as practice." },
  { target: "flashcards", label: "Create flashcards", description: "Save active-recall cards for review." },
  { target: "review-cards", label: "Save review cards", description: "Schedule the result for recall." },
  { target: "ai-note", label: "Save AI note", description: "Store the result as a Studio note." },
]

export const promptContracts: AiPromptContract[] = [
  contract("answer_explanation", "Explain Mistake", ["question", "selectedAnswer", "correctAnswer", "context"], ["note-block", "review-cards"]),
  contract("note_design", "Rewrite", ["input"], ["note-block", "doc-section", "quiz", "flashcards"]),
  contract("quiz_generation", "Quiz", ["context", "difficulty", "count"], ["quiz", "review-cards"]),
  contract("flashcard_generation", "Flashcards", ["blocks"], ["flashcards", "review-cards"]),
  contract("study_plan", "Study Plan", ["goals", "availableTime"], ["doc-section", "note-block"]),
  contract("document_formatter", "Document Formatter", ["input", "purpose"], ["doc-section", "note-block"]),
  contract("sheet_organizer", "Sheet Organizer", ["input", "goal"], ["sheet-rows"]),
  contract("slide_builder", "Slide Builder", ["input", "goal"], ["slide-outline"]),
  contract("practice_generator", "Practice Generator", ["context", "mode", "count"], ["quiz", "flashcards", "review-cards"]),
  contract("graph_edge_suggestion", "Graph Connector", ["node", "graph"], ["note-block"]),
  contract("personalized_prompt", "Prompt Composer", ["task", "source"], ["ai-note"]),
]

export function listInsertActions(targets: StudioInsertTarget[] = commonInsertActions.map((action) => action.target)) {
  const allowed = new Set(targets)
  return commonInsertActions.filter((action) => allowed.has(action.target))
}

export function buildGuidedPrompt(input: GuidedPromptInput): GuidedPromptResult {
  const template = getPromptTemplate(input.taskKey)
  const contractSpec = promptContracts.find((item) => item.mode === input.taskKey)
  if (!template || !contractSpec) {
    return emptyResult([input.taskKey], "Unknown AI task.")
  }

  const missing = contractSpec.requiredFields.filter((field) => field.required && isEmpty(input.fields[field.id])).map((field) => field.label)
  const values = {
    ...input.fields,
    difficulty: input.fields.difficulty ?? input.filters.difficulty,
    tone: input.filters.tone,
    language: input.filters.language,
    outputLength: input.filters.outputLength,
    sourceScope: input.filters.sourceScope,
    providerFamily: input.filters.providerFamily,
    insertTarget: input.filters.insertTarget,
  }
  const rendered = renderPrompt(template, values)
  const requirements = [
    `Source scope: ${input.filters.sourceScope}`,
    `Difficulty: ${input.filters.difficulty}`,
    `Tone: ${input.filters.tone}`,
    `Language: ${input.filters.language}`,
    `Length: ${input.filters.outputLength}`,
    `Insert target: ${input.filters.insertTarget}`,
    input.filters.providerFamily !== "auto" ? `Preferred provider family: ${input.filters.providerFamily}` : "Provider: auto failover",
  ]

  return {
    ok: missing.length === 0,
    missing,
    preview: [`Task: ${contractSpec.title}`, ...requirements, `Output: ${rendered.outputContract}`].join("\n"),
    system: rendered.system,
    user: `${rendered.user}\n\nRequirements:\n${requirements.map((item) => `- ${item}`).join("\n")}`,
    outputContract: rendered.outputContract,
  }
}

function contract(mode: AiTaskKey, title: string, required: string[], insertTargets: StudioInsertTarget[]): AiPromptContract {
  const template = getPromptTemplate(mode)
  return {
    mode,
    title,
    requiredFields: required.map((id) => ({ id, label: labelFromId(id), required: true })),
    outputContract: template?.outputContract || "",
    insertTargets,
  }
}

function emptyResult(missing: string[], preview: string): GuidedPromptResult {
  return { ok: false, missing, preview, system: "", user: "", outputContract: "" }
}

function isEmpty(value: unknown) {
  return value === undefined || value === null || (typeof value === "string" && value.trim().length === 0)
}

function labelFromId(id: string) {
  return id.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase())
}
