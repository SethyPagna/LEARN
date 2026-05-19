export type LearnRouteActionId = "practice" | "create" | "tutor"
export type LearnRouteView = "practice" | "studio" | "ai"

export interface LearnRouteAction {
  id: LearnRouteActionId
  title: string
  body: string
  view: LearnRouteView
  priority: number
}

export interface LearnRouteSignal {
  label: string
  value: string
}

export interface LearnRoutePlan {
  headline: string
  primaryAction: LearnRouteAction
  actions: LearnRouteAction[]
  signals: LearnRouteSignal[]
}

export function buildLearnRoutePlan(input: {
  goalCompletion?: number
  recommendedFocus?: string[]
  weakTopics?: Array<{ topic: string; accuracy?: number }>
  quizCount?: number
}) {
  const goalCompletion = clampPercent(input.goalCompletion ?? 0)
  const recommendedFocus = input.recommendedFocus ?? []
  const weakTopics = input.weakTopics ?? []
  const quizCount = Math.max(0, Math.floor(input.quizCount ?? 0))
  const focusTopic = weakTopics[0]?.topic || recommendedFocus[0] || "your next concept"
  const headline = weakTopics.length
    ? `Repair ${focusTopic}`
    : recommendedFocus.length
      ? `Continue ${focusTopic}`
      : "Build today's learning route"

  const actions = rankLearnRouteActions([
    {
      id: "practice",
      title: weakTopics.length ? "Practice weak topic" : "Practice set",
      body: quizCount ? "Run a focused quiz, sprint, or retry loop." : "Create a quiz from Studio first.",
      view: "practice",
      priority: weakTopics.length && quizCount ? 100 : quizCount ? 90 : 40,
    },
    {
      id: "create",
      title: "Shape in Studio",
      body: "Capture or refine notes, docs, sheets, slides, and imports.",
      view: "studio",
      priority: recommendedFocus.length ? 80 : 95,
    },
    {
      id: "tutor",
      title: "Ask AI tutor",
      body: weakTopics.length ? `Get a short explanation for ${focusTopic}.` : "Generate a route, quiz, or flashcards from current material.",
      view: "ai",
      priority: weakTopics.length || recommendedFocus.length ? 85 : 70,
    },
  ])

  return {
    headline,
    primaryAction: actions[0],
    actions,
    signals: [
      { label: "Weak", value: String(weakTopics.length) },
      { label: "Focus", value: String(recommendedFocus.length) },
      { label: "Practice", value: String(quizCount) },
      { label: "Route", value: goalCompletion >= 70 ? "steady" : "building" },
    ],
  }
}

function rankLearnRouteActions(actions: LearnRouteAction[]) {
  return [...actions].sort((left, right) => right.priority - left.priority || left.title.localeCompare(right.title))
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}
