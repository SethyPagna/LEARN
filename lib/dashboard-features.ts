export type DashboardCommandTarget = "ai" | "calendar" | "files" | "practice" | "reviews" | "studio"

export interface DashboardWeakTopic {
  topic: string
  accuracy?: number
  attempts?: number
}

export interface DashboardSnapshotLike {
  goalCompletion?: number
  weakTopics?: DashboardWeakTopic[]
  recommendedFocus?: string[]
  recentNotes?: unknown[]
}

export interface DashboardCommandInput {
  snapshot?: DashboardSnapshotLike | null
  noteCount: number
  quizCount: number
}

export interface DashboardCommandPlan {
  headline: string
  detail: string
  target: DashboardCommandTarget
  targetTopic?: string
  chips: string[]
}

export interface DashboardSignal {
  label: string
  value: string
  tone: "critical" | "steady" | "watch"
}

export function buildDashboardCommandPlan(input: DashboardCommandInput): DashboardCommandPlan {
  const snapshot = input.snapshot ?? {}
  const weakTopic = pickWeakestTopic(snapshot.weakTopics ?? [])
  if (weakTopic && (weakTopic.accuracy ?? 100) < 60) {
    return {
      headline: `Repair ${weakTopic.topic}`,
      detail: "Start with the weakest topic, then send misses into reviews.",
      target: input.quizCount > 0 ? "practice" : "reviews",
      targetTopic: weakTopic.topic,
      chips: [`${weakTopic.accuracy ?? 0}% accuracy`, `${weakTopic.attempts ?? 0} attempts`, "highest risk"],
    }
  }

  const focus = firstNonEmpty(snapshot.recommendedFocus ?? [])
  if (focus) {
    return {
      headline: `Continue ${focus}`,
      detail: "Keep today narrow: one concept, one practice loop, one review.",
      target: "reviews",
      targetTopic: focus,
      chips: ["today route", "active recall", `${clampPercentage(snapshot.goalCompletion ?? 0)}% goal`],
    }
  }

  if (input.noteCount === 0) {
    return {
      headline: "Create your first Studio seed",
      detail: "Capture a note, import a file, or upload source material to start the Vault.",
      target: "studio",
      chips: ["empty Studio", "private by default", "start here"],
    }
  }

  if (input.quizCount === 0) {
    return {
      headline: "Generate practice",
      detail: "Turn recent Studio material into quizzes, flashcards, or a short study route.",
      target: "ai",
      chips: [`${input.noteCount} Studio items`, "AI tutor", "practice-ready"],
    }
  }

  return {
    headline: "Schedule the next block",
    detail: "Protect a short study window so progress continues without overload.",
    target: "calendar",
    chips: [`${input.quizCount} practice sets`, `${input.noteCount} Studio items`, "time block"],
  }
}

export function buildDashboardSignals(input: DashboardCommandInput): DashboardSignal[] {
  const snapshot = input.snapshot ?? {}
  const goalCompletion = clampPercentage(snapshot.goalCompletion ?? 0)
  const weakCount = snapshot.weakTopics?.length ?? 0
  const focusCount = uniqueNonEmpty(snapshot.recommendedFocus ?? []).length

  return [
    { label: "Goal", value: `${goalCompletion}%`, tone: goalCompletion >= 70 ? "steady" : "watch" },
    { label: "Weak", value: String(weakCount), tone: weakCount ? "critical" : "steady" },
    { label: "Focus", value: String(focusCount), tone: focusCount ? "steady" : "watch" },
    { label: "Studio", value: String(Math.max(0, input.noteCount)), tone: input.noteCount ? "steady" : "watch" },
  ]
}

function pickWeakestTopic(topics: DashboardWeakTopic[]) {
  let weakest: DashboardWeakTopic | undefined
  let weakestAccuracy = Number.POSITIVE_INFINITY

  for (const topic of topics) {
    const name = topic.topic.trim()
    if (!name) continue
    const accuracy = clampPercentage(topic.accuracy ?? 100)
    if (accuracy < weakestAccuracy) {
      weakest = { ...topic, topic: name, accuracy }
      weakestAccuracy = accuracy
    }
  }

  return weakest
}

function firstNonEmpty(values: string[]) {
  return uniqueNonEmpty(values)[0]
}

function uniqueNonEmpty(values: string[]) {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const normalized = value.trim()
    const key = normalized.toLowerCase()
    if (!normalized || seen.has(key)) continue
    seen.add(key)
    result.push(normalized)
  }
  return result
}

function clampPercentage(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, Math.round(value)))
}
