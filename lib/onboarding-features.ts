export type OnboardingWorkflow = "create" | "review" | "practice" | "schedule" | "ai"
export type OnboardingStudioKind = "notes" | "docs" | "sheets" | "slides"

export const onboardingWorkflowOptions: Array<{ value: OnboardingWorkflow; label: string }> = [
  { value: "create", label: "Create in Studio" },
  { value: "review", label: "Review existing material" },
  { value: "practice", label: "Practice questions" },
  { value: "schedule", label: "Plan calendar time" },
  { value: "ai", label: "Ask AI tutor" },
]

export const onboardingStudioKindOptions: Array<{ value: OnboardingStudioKind; label: string }> = [
  { value: "notes", label: "Notes" },
  { value: "docs", label: "Docs" },
  { value: "sheets", label: "Sheets" },
  { value: "slides", label: "Slides" },
]

export interface OnboardingInput {
  firstStudioKind?: unknown
  learningGoal?: unknown
  preferredWorkflow?: unknown
}

export interface OnboardingPreferences {
  firstRun: false
  firstStudioKind: OnboardingStudioKind
  learningGoal: string
  onboardingCompletedAt: string
  preferredWorkflow: OnboardingWorkflow
}

const workflows = new Set(onboardingWorkflowOptions.map((option) => option.value))
const studioKinds = new Set(onboardingStudioKindOptions.map((option) => option.value))

export function normalizeOnboardingPreferences(input: OnboardingInput, now = new Date()): OnboardingPreferences {
  const preferredWorkflow = String(input.preferredWorkflow || "create").toLowerCase()
  const firstStudioKind = String(input.firstStudioKind || "notes").toLowerCase()
  const learningGoal = String(input.learningGoal || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 240)

  return {
    firstRun: false,
    firstStudioKind: normalizeOnboardingStudioKind(firstStudioKind),
    learningGoal: learningGoal || "Build a reusable learning vault.",
    onboardingCompletedAt: now.toISOString(),
    preferredWorkflow: normalizeOnboardingWorkflow(preferredWorkflow),
  }
}

export function normalizeOnboardingWorkflow(value: unknown): OnboardingWorkflow {
  const normalized = String(value || "").toLowerCase()
  return workflows.has(normalized as OnboardingWorkflow) ? normalized as OnboardingWorkflow : "create"
}

export function normalizeOnboardingStudioKind(value: unknown): OnboardingStudioKind {
  const normalized = String(value || "").toLowerCase()
  return studioKinds.has(normalized as OnboardingStudioKind) ? normalized as OnboardingStudioKind : "notes"
}

export function onboardingTargetView(preferences: Pick<OnboardingPreferences, "firstStudioKind" | "preferredWorkflow">) {
  if (preferences.preferredWorkflow === "review") return "reviews" as const
  if (preferences.preferredWorkflow === "practice") return "practice" as const
  if (preferences.preferredWorkflow === "schedule") return "calendar" as const
  if (preferences.preferredWorkflow === "ai") return "ai" as const
  return preferences.firstStudioKind
}

export function shouldShowOnboarding(input: { force?: boolean; preferences?: Record<string, unknown> | null }) {
  if (input.force) return true
  return input.preferences?.firstRun === true && !input.preferences?.onboardingCompletedAt
}
