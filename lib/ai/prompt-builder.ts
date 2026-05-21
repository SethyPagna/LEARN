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
  warnings: string[]
  preview: string
  system: string
  user: string
  outputContract: string
  requirements: string[]
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

export const studioInsertTargets: StudioInsertTarget[] = commonInsertActions.map((action) => action.target)

export const promptContracts: AiPromptContract[] = [
  contract("answer_explanation", "Explain Mistake", ["question", "selectedAnswer", "correctAnswer", "context"], ["note-block", "review-cards"]),
  contract("note_design", "Rewrite", ["input"], ["note-block", "doc-section", "quiz", "flashcards"]),
  contract("quiz_generation", "Quiz", ["context", "difficulty", "count"], ["quiz", "review-cards"]),
  contract("flashcard_generation", "Flashcards", ["blocks"], ["flashcards", "review-cards"]),
  contract("study_plan", "Study Plan", ["goals", "availableTime"], ["doc-section", "note-block"]),
  contract("document_formatter", "Document Formatter", ["input", "purpose"], ["doc-section", "note-block"]),
  contract("document_editor", "Document Editor", ["input", "editGoal"], ["doc-section", "note-block"]),
  contract("sheet_organizer", "Sheet Organizer", ["input", "goal"], ["sheet-rows"]),
  contract("sheet_formula_builder", "Formula Builder", ["input", "goal"], ["sheet-rows", "doc-section"]),
  contract("slide_builder", "Slide Builder", ["input", "goal"], ["slide-outline"]),
  contract("slide_design_director", "Slide Designer", ["input", "goal"], ["slide-outline", "doc-section"]),
  contract("practice_generator", "Practice Generator", ["context", "mode", "count"], ["quiz", "flashcards", "review-cards"]),
  contract("graph_edge_suggestion", "Graph Connector", ["node", "graph"], ["note-block"]),
  contract("personalized_prompt", "Prompt Composer", ["task", "source"], ["ai-note"]),
]

const taskRequirements: Partial<Record<AiTaskKey, string[]>> = {
  document_formatter: [
    "Use a clear heading hierarchy, compact paragraphs, callouts, and review questions.",
    "Preserve source meaning and flag missing citations instead of inventing references.",
    "Return blocks that can be inserted into Studio documents without extra cleanup.",
  ],
  document_editor: [
    "Track what changed and why so the learner can trust the edit.",
    "Improve paragraph flow, headings, lists, references, and accessibility.",
    "Keep unsupported facts out of the rewritten document.",
  ],
  sheet_organizer: [
    "Normalize columns before rows and keep empty or uncertain values explicit.",
    "Suggest filters, validation, and formulas that reduce manual spreadsheet cleanup.",
    "Return rows in a consistent shape for direct Studio insertion.",
  ],
  sheet_formula_builder: [
    "Prefer readable formulas and explain each formula's purpose.",
    "Include sort, filter, validation, and chart suggestions where useful.",
    "Avoid destructive operations unless the learner explicitly requests cleanup.",
  ],
  slide_builder: [
    "Keep one main idea per slide with short body text and speaker notes.",
    "Use layout, theme, objects, and practice moments to support teaching.",
    "Return a deck outline that can be inserted into Studio slides.",
  ],
  slide_design_director: [
    "Specify visual hierarchy, transition, animation, object roles, and presenter notes.",
    "Use motion sparingly and tie it to comprehension, not decoration.",
    "Include a presenter checklist and approximate timing.",
  ],
  practice_generator: [
    "Mix question types and include explanations, retry guidance, and review-card seeds.",
    "Respect target difficulty and keep questions answerable from the source.",
    "Make duration and scoring explicit.",
  ],
}

export function listInsertActions(targets: StudioInsertTarget[] = studioInsertTargets) {
  const allowed = new Set(targets)
  return commonInsertActions.filter((action) => allowed.has(action.target))
}

export function normalizeStudioInsertTarget(value: unknown, fallback: StudioInsertTarget = "ai-note"): StudioInsertTarget {
  const safeFallback = studioInsertTargets.includes(fallback) ? fallback : "ai-note"
  return typeof value === "string" && studioInsertTargets.includes(value as StudioInsertTarget)
    ? value as StudioInsertTarget
    : safeFallback
}

export function buildGuidedPrompt(input: GuidedPromptInput): GuidedPromptResult {
  const template = getPromptTemplate(input.taskKey)
  const contractSpec = promptContracts.find((item) => item.mode === input.taskKey)
  if (!template || !contractSpec) {
    return emptyResult([input.taskKey], "Unknown AI task.")
  }

  const missing = contractSpec.requiredFields.filter((field) => field.required && isEmpty(input.fields[field.id])).map((field) => field.label)
  const allowedTargets = new Set(contractSpec.insertTargets)
  const warnings = allowedTargets.has(input.filters.insertTarget)
    ? []
    : [`Insert target ${input.filters.insertTarget} is not ideal for ${contractSpec.title}.`]
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
  const taskRules = taskRequirements[input.taskKey] || []
  const outputRequirements = [...requirements, ...taskRules]

  return {
    ok: missing.length === 0,
    missing,
    warnings,
    preview: [`Task: ${contractSpec.title}`, ...outputRequirements, ...warnings.map((item) => `Warning: ${item}`), `Output: ${rendered.outputContract}`].join("\n"),
    system: rendered.system,
    user: `${rendered.user}\n\nRequirements:\n${outputRequirements.map((item) => `- ${item}`).join("\n")}`,
    outputContract: rendered.outputContract,
    requirements: outputRequirements,
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
  return { ok: false, missing, warnings: [], preview, system: "", user: "", outputContract: "", requirements: [] }
}

function isEmpty(value: unknown) {
  return value === undefined || value === null || (typeof value === "string" && value.trim().length === 0)
}

function labelFromId(id: string) {
  return id.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase())
}
