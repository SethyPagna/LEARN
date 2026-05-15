export type ProgressActionTarget = "reviews" | "quizzes" | "ai" | "calendar" | "studio"

export interface ProgressWeakTopic {
  topic: string
  attempts?: number
  accuracy: number
}

export interface ProgressRecentItem {
  id?: string
  title?: string
}

export interface ProgressSnapshotLike {
  goalCompletion?: number
  weakTopics?: ProgressWeakTopic[]
  recommendedFocus?: string[]
  recentNotes?: ProgressRecentItem[]
}

export interface ProgressNextAction {
  id: string
  label: string
  detail: string
  target: ProgressActionTarget
  urgency: "high" | "medium" | "low"
}

export interface ProgressMetric {
  id: string
  label: string
  value: string
  detail: string
}

export interface ProgressTopicCard {
  topic: string
  accuracy: number
  attempts: number
  severity: "critical" | "watch" | "steady"
}

export interface ProgressSummary {
  goalCompletion: number
  quizCount: number
  reviewCount: number
  recentCount: number
  focusTopics: string[]
  weakTopics: ProgressTopicCard[]
  momentumLabel: string
  metrics: ProgressMetric[]
  nextActions: ProgressNextAction[]
}

const LOW_ACCURACY = 50
const WATCH_ACCURACY = 80
const STRONG_GOAL_COMPLETION = 80
const BUILDING_GOAL_COMPLETION = 50
const MAX_FOCUS_TOPICS = 4
const MAX_WEAK_TOPICS = 6

export function summarizeLearningProgress(input: {
  snapshot?: ProgressSnapshotLike | null
  quizCount: number
}): ProgressSummary {
  const snapshot = input.snapshot ?? {}
  const goalCompletion = clampPercentage(snapshot.goalCompletion ?? 0)
  const focusTopics = uniqueNonEmpty(snapshot.recommendedFocus ?? []).slice(0, MAX_FOCUS_TOPICS)
  const weakTopics = normalizeWeakTopics(snapshot.weakTopics ?? []).slice(0, MAX_WEAK_TOPICS)
  const recentCount = snapshot.recentNotes?.length ?? 0
  const reviewCount = Math.max(weakTopics.length, focusTopics.length)
  const momentumLabel = labelMomentum(goalCompletion, weakTopics.length)
  const quizCount = Math.max(0, input.quizCount)

  return {
    goalCompletion,
    quizCount,
    reviewCount,
    recentCount,
    focusTopics,
    weakTopics,
    momentumLabel,
    metrics: [
      {
        id: "goal",
        label: "Goal",
        value: `${goalCompletion}%`,
        detail: `${momentumLabel} completion signal`,
      },
      {
        id: "reviews",
        label: "Reviews",
        value: String(reviewCount),
        detail: reviewCount ? "Concepts ready for recall" : "No review pressure yet",
      },
      {
        id: "practice",
        label: "Practice",
        value: String(quizCount),
        detail: quizCount ? "Quiz banks available" : "Generate a quiz from Studio",
      },
      {
        id: "studio",
        label: "Recent",
        value: String(recentCount),
        detail: recentCount ? "Recent Studio items feeding progress" : "Create a Studio item to start",
      },
    ],
    nextActions: buildProgressActions({ focusTopics, goalCompletion, quizCount, weakTopics }),
  }
}

function buildProgressActions(input: {
  focusTopics: string[]
  goalCompletion: number
  quizCount: number
  weakTopics: ProgressTopicCard[]
}): ProgressNextAction[] {
  const actions: ProgressNextAction[] = []
  const weakestTopic = input.weakTopics[0]
  const focusTopic = weakestTopic?.topic ?? input.focusTopics[0]

  if (focusTopic) {
    actions.push({
      id: "review-focus",
      label: `Review ${focusTopic}`,
      detail: weakestTopic ? `${weakestTopic.accuracy}% accuracy across ${weakestTopic.attempts} attempts` : "Turn the current focus into active recall",
      target: "reviews",
      urgency: weakestTopic?.severity === "critical" ? "high" : "medium",
    })
  }

  actions.push(
    input.quizCount
      ? {
          id: "retry-practice",
          label: "Retry practice",
          detail: "Use quiz attempts to close weak-topic gaps",
          target: "quizzes",
          urgency: weakestTopic ? "high" : "medium",
        }
      : {
          id: "generate-practice",
          label: "Generate practice",
          detail: "Ask AI to turn Studio work into questions",
          target: "ai",
          urgency: "medium",
        },
  )

  actions.push(
    input.goalCompletion < STRONG_GOAL_COMPLETION
      ? {
          id: "schedule-block",
          label: "Schedule focus",
          detail: "Give the next learning block a time slot",
          target: "calendar",
          urgency: "medium",
        }
      : {
          id: "capture-progress",
          label: "Capture insight",
          detail: "Save what worked as a Studio note",
          target: "studio",
          urgency: "low",
        },
  )

  return actions
}

function normalizeWeakTopics(topics: ProgressWeakTopic[]) {
  return topics
    .filter((topic) => topic.topic.trim())
    .map((topic) => {
      const accuracy = clampPercentage(topic.accuracy)
      return {
        topic: topic.topic.trim(),
        accuracy,
        attempts: Math.max(0, topic.attempts ?? 0),
        severity: topicSeverity(accuracy),
      }
    })
    .sort((first, second) => {
      if (first.accuracy !== second.accuracy) return first.accuracy - second.accuracy
      return second.attempts - first.attempts
    })
}

function uniqueNonEmpty(values: string[]) {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const normalized = value.trim()
    if (!normalized || seen.has(normalized.toLocaleLowerCase())) continue
    seen.add(normalized.toLocaleLowerCase())
    result.push(normalized)
  }
  return result
}

function clampPercentage(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, Math.round(value)))
}

function topicSeverity(accuracy: number): ProgressTopicCard["severity"] {
  if (accuracy < LOW_ACCURACY) return "critical"
  if (accuracy < WATCH_ACCURACY) return "watch"
  return "steady"
}

function labelMomentum(goalCompletion: number, weakTopicCount: number) {
  if (goalCompletion >= STRONG_GOAL_COMPLETION && weakTopicCount === 0) return "steady"
  if (goalCompletion >= BUILDING_GOAL_COMPLETION) return "building"
  return "needs route"
}
