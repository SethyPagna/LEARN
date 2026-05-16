export type LearnRouteActionId = "review" | "practice" | "create" | "schedule"
export type LearnRouteView = "reviews" | "practice" | "studio" | "calendar"

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
      id: "review",
      title: weakTopics.length ? "Repair weak topics" : "Review queue",
      body: weakTopics.length ? "Start with the lowest accuracy concept." : "Open due cards and keep recall fresh.",
      view: "reviews",
      priority: weakTopics.length ? 100 : 70,
    },
    {
      id: "practice",
      title: "Practice set",
      body: quizCount ? "Run a quiz, sprint, or retry loop." : "Create a quiz from Studio first.",
      view: "practice",
      priority: quizCount ? 90 : 40,
    },
    {
      id: "create",
      title: "Create in Studio",
      body: "Capture notes, docs, sheets, slides, and import cleanup.",
      view: "studio",
      priority: recommendedFocus.length ? 80 : 95,
    },
    {
      id: "schedule",
      title: "Plan time",
      body: "Put the next review or deep work block on the calendar.",
      view: "calendar",
      priority: goalCompletion < 50 ? 85 : 60,
    },
  ])

  return {
    headline,
    primaryAction: actions[0],
    actions,
    signals: [
      { label: "Goal", value: `${goalCompletion}%` },
      { label: "Quiz banks", value: String(quizCount) },
      { label: "Focus", value: String(recommendedFocus.length) },
      { label: "Weak", value: String(weakTopics.length) },
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
