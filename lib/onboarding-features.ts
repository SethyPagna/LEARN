export type OnboardingWorkflow = "create" | "review" | "practice" | "schedule" | "ai"
export type OnboardingStudioKind = "notes" | "docs" | "sheets" | "slides"

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

const workflows = new Set<OnboardingWorkflow>(["create", "review", "practice", "schedule", "ai"])
const studioKinds = new Set<OnboardingStudioKind>(["notes", "docs", "sheets", "slides"])

export function normalizeOnboardingPreferences(input: OnboardingInput, now = new Date()): OnboardingPreferences {
  const preferredWorkflow = String(input.preferredWorkflow || "create").toLowerCase()
  const firstStudioKind = String(input.firstStudioKind || "notes").toLowerCase()
  const learningGoal = String(input.learningGoal || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 240)

  return {
    firstRun: false,
    firstStudioKind: studioKinds.has(firstStudioKind as OnboardingStudioKind) ? firstStudioKind as OnboardingStudioKind : "notes",
    learningGoal: learningGoal || "Build a reusable learning vault.",
    onboardingCompletedAt: now.toISOString(),
    preferredWorkflow: workflows.has(preferredWorkflow as OnboardingWorkflow) ? preferredWorkflow as OnboardingWorkflow : "create",
  }
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
