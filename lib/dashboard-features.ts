export type DashboardCommandTarget = "ai" | "calendar" | "files" | "practice" | "reviews" | "studio"
export type DashboardQuickActionTarget =
  | DashboardCommandTarget
  | "graph"
  | "learn"
  | "rooms"
  | "settings"
  | "social"

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

export interface DashboardRouteAction {
  id: string
  label: string
  detail: string
  target: DashboardCommandTarget
  primary: boolean
}

export interface DashboardSignal {
  label: string
  value: string
  tone: "critical" | "steady" | "watch"
}

export interface DashboardEmptyState {
  id: "practice" | "route" | "studio"
  title: string
  detail: string
  actionLabel: string
  target: DashboardCommandTarget
}

export interface DashboardUserMetrics {
  streakCurrent?: number
  xpTotal?: number
}

export interface DashboardMetricInput extends DashboardCommandInput {
  calendarDefaultMinutes: number
  practiceDraftCount: number
  studioDraftCount: number
  userMetrics?: DashboardUserMetrics | null
}

export interface DashboardMetricTile {
  id: "drafts" | "focus" | "reviews" | "streak" | "xp"
  label: string
  value: string
  detail: string
  tone: "critical" | "steady" | "watch"
}

export interface DashboardWeakTopicCard {
  accuracy: number
  attempts: number
  label: string
  tone: "critical" | "steady" | "watch"
}

export interface DashboardRecentNoteLike {
  id: string
  title: string
  updated_at?: string
  updatedAt?: string
}

export interface DashboardRecentAiLike {
  id: string
  title: string
  updated_at?: string
  updatedAt?: string
}

export interface DashboardRecentAttemptLike {
  id: string
  quiz_title?: string
  title?: string
  score?: number
  total?: number
  created_at?: string
  createdAt?: string
}

export interface DashboardRecentFileLike {
  id: string
  filename: string
  content_type?: string
  contentType?: string
  created_at?: string
  createdAt?: string
}

export interface DashboardRecentWorkInput {
  aiChats?: DashboardRecentAiLike[]
  files?: DashboardRecentFileLike[]
  notes?: DashboardRecentNoteLike[]
  quizAttempts?: DashboardRecentAttemptLike[]
}

export interface DashboardRecentWorkItem {
  id: string
  kind: "ai" | "file" | "practice" | "studio"
  title: string
  detail: string
  target: DashboardCommandTarget
  timestamp: string
}

export type DashboardQuickActionIcon = "brain" | "calendar" | "compass" | "file" | "game" | "graph" | "message" | "plus" | "repeat" | "stats"

export interface DashboardQuickAction {
  id: string
  label: string
  detail: string
  target: DashboardQuickActionTarget
  icon: DashboardQuickActionIcon
}

export interface DashboardQuickActionGroup {
  id: "create" | "manage" | "practice" | "review" | "share"
  label: string
  actions: DashboardQuickAction[]
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

export function buildDashboardRouteActions(input: DashboardCommandInput): DashboardRouteAction[] {
  const plan = buildDashboardCommandPlan(input)
  const actions: DashboardRouteAction[] = [
    {
      id: `primary-${plan.target}`,
      label: primaryActionLabel(plan),
      detail: primaryActionDetail(plan),
      target: plan.target,
      primary: true,
    },
  ]

  const snapshot = input.snapshot ?? {}
  const hasWeakTopics = (snapshot.weakTopics ?? []).length > 0
  const hasFocus = uniqueNonEmpty(snapshot.recommendedFocus ?? []).length > 0
  const backupCandidates: DashboardRouteAction[] = []

  if (input.noteCount === 0) {
    backupCandidates.push(
      { id: "backup-files", label: "Upload source", detail: "Add a file, image, or video.", target: "files", primary: false },
      { id: "backup-calendar", label: "Plan time", detail: "Reserve a short study block.", target: "calendar", primary: false },
      { id: "backup-ai", label: "Ask tutor", detail: "Get a starter route.", target: "ai", primary: false },
    )
  } else if (input.quizCount === 0) {
    backupCandidates.push(
      { id: "backup-studio", label: "Refine Studio", detail: "Clean up the source material.", target: "studio", primary: false },
      { id: "backup-calendar", label: "Plan time", detail: "Reserve a short study block.", target: "calendar", primary: false },
      { id: "backup-files", label: "Upload source", detail: "Add more raw material.", target: "files", primary: false },
    )
  } else if (hasWeakTopics || hasFocus) {
    backupCandidates.push(
      { id: "backup-reviews", label: "Review queue", detail: "Recall before more input.", target: "reviews", primary: false },
      { id: "backup-ai", label: "Ask tutor", detail: "Get an explanation or route.", target: "ai", primary: false },
      { id: "backup-calendar", label: "Plan time", detail: "Schedule the next block.", target: "calendar", primary: false },
    )
  } else {
    backupCandidates.push(
      { id: "backup-practice", label: "Practice", detail: "Run a short quiz loop.", target: "practice", primary: false },
      { id: "backup-reviews", label: "Review", detail: "Refresh older concepts.", target: "reviews", primary: false },
      { id: "backup-ai", label: "Ask tutor", detail: "Create a focused plan.", target: "ai", primary: false },
    )
  }

  const usedTargets = new Set<DashboardCommandTarget>([plan.target])
  for (const candidate of backupCandidates) {
    if (usedTargets.has(candidate.target)) continue
    actions.push(candidate)
    usedTargets.add(candidate.target)
    if (actions.length === 3) break
  }

  return actions
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

export function buildDashboardEmptyStates(input: DashboardCommandInput): DashboardEmptyState[] {
  const snapshot = input.snapshot ?? {}
  const states: DashboardEmptyState[] = []
  const hasRecentWork = input.noteCount > 0 || (snapshot.recentNotes?.length ?? 0) > 0
  const hasRoute = uniqueNonEmpty(snapshot.recommendedFocus ?? []).length > 0 || (snapshot.weakTopics?.length ?? 0) > 0

  if (!hasRecentWork) {
    states.push({
      id: "studio",
      title: "No Studio seed yet",
      detail: "Capture one note, file, table, or deck so LEARN has material to work with.",
      actionLabel: "Create in Studio",
      target: "studio",
    })
  }

  if (input.quizCount === 0) {
    states.push({
      id: "practice",
      title: "No practice set",
      detail: "Generate a quiz or flashcards from Studio when you are ready to test recall.",
      actionLabel: "Generate practice",
      target: hasRecentWork ? "ai" : "studio",
    })
  }

  if (!hasRoute && clampPercentage(snapshot.goalCompletion ?? 0) === 0) {
    states.push({
      id: "route",
      title: "No route signal",
      detail: "Add a goal or complete one practice loop so the dashboard can prioritize today.",
      actionLabel: "Tune settings",
      target: "calendar",
    })
  }

  return states.slice(0, 3)
}

export function buildDashboardMetricTiles(input: DashboardMetricInput): DashboardMetricTile[] {
  const snapshot = input.snapshot ?? {}
  const streak = Math.max(0, Math.floor(input.userMetrics?.streakCurrent ?? 0))
  const xp = Math.max(0, Math.floor(input.userMetrics?.xpTotal ?? 0))
  const reviewCount = Math.max((snapshot.weakTopics ?? []).length, uniqueNonEmpty(snapshot.recommendedFocus ?? []).length)
  const totalDrafts = Math.max(0, input.studioDraftCount) + Math.max(0, input.practiceDraftCount)
  const focusMinutes = Math.max(0, Math.floor(input.calendarDefaultMinutes))

  return [
    {
      id: "streak",
      label: "Streak",
      value: String(streak),
      detail: streak ? `${streak} active learning day${streak === 1 ? "" : "s"}` : "Start with one small action today",
      tone: streak ? "steady" : "watch",
    },
    {
      id: "xp",
      label: "XP",
      value: String(xp),
      detail: xp ? "Progress earned from learning actions" : "Practice and reviews will build XP",
      tone: xp ? "steady" : "watch",
    },
    {
      id: "reviews",
      label: "Reviews",
      value: String(reviewCount),
      detail: reviewCount ? "Due focus and weak-topic signals" : "No review pressure yet",
      tone: reviewCount ? "critical" : "steady",
    },
    {
      id: "drafts",
      label: "Drafts",
      value: String(totalDrafts),
      detail: `${input.studioDraftCount} Studio and ${input.practiceDraftCount} practice draft${input.practiceDraftCount === 1 ? "" : "s"}`,
      tone: totalDrafts ? "watch" : "steady",
    },
    {
      id: "focus",
      label: "Focus",
      value: `${focusMinutes}m`,
      detail: "Default calendar block length",
      tone: focusMinutes >= 20 ? "steady" : "watch",
    },
  ]
}

export function buildDashboardWeakTopicCards(topics: DashboardWeakTopic[], limit = 5): DashboardWeakTopicCard[] {
  return topics
    .map((topic) => {
      const accuracy = clampPercentage(topic.accuracy ?? 0)
      return {
        accuracy,
        attempts: Math.max(0, Math.floor(topic.attempts ?? 0)),
        label: topic.topic.trim(),
        tone: dashboardWeakTopicTone(accuracy),
      }
    })
    .filter((topic) => topic.label.length > 0)
    .sort((left, right) => left.accuracy - right.accuracy || right.attempts - left.attempts || left.label.localeCompare(right.label))
    .slice(0, Math.max(0, limit))
}

function dashboardWeakTopicTone(accuracy: number): "critical" | "steady" | "watch" {
  if (accuracy < 50) return "critical"
  if (accuracy < 75) return "watch"
  return "steady"
}

export function buildDashboardRecentWork(input: DashboardRecentWorkInput): DashboardRecentWorkItem[] {
  const items: DashboardRecentWorkItem[] = []

  for (const note of input.notes ?? []) {
    items.push({
      id: `studio:${note.id}`,
      kind: "studio",
      title: cleanTitle(note.title, "Untitled Studio item"),
      detail: "Studio item",
      target: "studio",
      timestamp: normalizeTimestamp(note.updated_at ?? note.updatedAt),
    })
  }

  for (const chat of input.aiChats ?? []) {
    items.push({
      id: `ai:${chat.id}`,
      kind: "ai",
      title: cleanTitle(chat.title, "AI tutor chat"),
      detail: "AI result",
      target: "ai",
      timestamp: normalizeTimestamp(chat.updated_at ?? chat.updatedAt),
    })
  }

  for (const attempt of input.quizAttempts ?? []) {
    const score = Number.isFinite(Number(attempt.score)) ? Number(attempt.score) : 0
    const total = Number.isFinite(Number(attempt.total)) ? Number(attempt.total) : 0
    items.push({
      id: `practice:${attempt.id}`,
      kind: "practice",
      title: cleanTitle(attempt.quiz_title ?? attempt.title, "Practice attempt"),
      detail: total ? `${score}/${total} score` : "Practice attempt",
      target: "practice",
      timestamp: normalizeTimestamp(attempt.created_at ?? attempt.createdAt),
    })
  }

  for (const file of input.files ?? []) {
    items.push({
      id: `file:${file.id}`,
      kind: "file",
      title: cleanTitle(file.filename, "Uploaded file"),
      detail: readableContentType(file.content_type ?? file.contentType),
      target: "files",
      timestamp: normalizeTimestamp(file.created_at ?? file.createdAt),
    })
  }

  return items
    .sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp) || left.title.localeCompare(right.title))
    .slice(0, 6)
}

export function buildDashboardQuickActionGroups(): DashboardQuickActionGroup[] {
  return [
    {
      id: "create",
      label: "Create",
      actions: [
        { id: "open-studio", label: "Open Studio", detail: "Notes, docs, sheets, and slides", target: "studio", icon: "file" },
        { id: "upload-media", label: "Upload media", detail: "Images, video, and files", target: "files", icon: "plus" },
      ],
    },
    {
      id: "review",
      label: "Review",
      actions: [
        { id: "learn-route", label: "Learn route", detail: "Route, graph, reviews, calendar", target: "learn", icon: "brain" },
        { id: "review-queue", label: "Review queue", detail: "Due concepts and mistakes", target: "reviews", icon: "repeat" },
        { id: "knowledge-map", label: "Knowledge map", detail: "Links and weak areas", target: "graph", icon: "graph" },
      ],
    },
    {
      id: "practice",
      label: "Practice",
      actions: [
        { id: "practice-hub", label: "Practice hub", detail: "Quizzes, games, exams", target: "practice", icon: "brain" },
        { id: "sprint-mode", label: "Sprint mode", detail: "Timed recall and matching", target: "practice", icon: "game" },
      ],
    },
    {
      id: "share",
      label: "Share",
      actions: [
        { id: "social-hub", label: "Social hub", detail: "Chat, groups, rooms", target: "social", icon: "message" },
        { id: "focus-room", label: "Focus room", detail: "Pomodoro presence", target: "rooms", icon: "compass" },
      ],
    },
    {
      id: "manage",
      label: "Manage",
      actions: [
        { id: "calendar", label: "Calendar", detail: "Plan study blocks", target: "calendar", icon: "calendar" },
        { id: "settings", label: "Settings", detail: "Tune the workspace", target: "settings", icon: "stats" },
      ],
    },
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

function primaryActionLabel(plan: DashboardCommandPlan) {
  if (plan.target === "practice") return "Practice weak topic"
  if (plan.target === "reviews") return "Start review"
  if (plan.target === "studio") return "Create Studio seed"
  if (plan.target === "ai") return "Generate practice"
  if (plan.target === "calendar") return "Schedule block"
  if (plan.target === "files") return "Upload source"
  return "Start now"
}

function primaryActionDetail(plan: DashboardCommandPlan) {
  if (plan.target === "practice") return plan.targetTopic ? `Repair ${plan.targetTopic}.` : "Retry the highest-risk material."
  if (plan.target === "reviews") return plan.targetTopic ? `Recall ${plan.targetTopic}.` : "Open the active recall queue."
  if (plan.target === "studio") return "Capture the first reusable learning item."
  if (plan.target === "ai") return "Turn recent material into practice."
  if (plan.target === "calendar") return "Protect the next focus window."
  if (plan.target === "files") return "Add source material."
  return plan.detail
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

function cleanTitle(value: unknown, fallback: string) {
  const title = String(value || "").trim()
  return title || fallback
}

function normalizeTimestamp(value: unknown) {
  const timestamp = String(value || "").trim()
  const parsed = Date.parse(timestamp)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date(0).toISOString()
}

function readableContentType(value: unknown) {
  const type = String(value || "").toLowerCase()
  if (type.startsWith("image/")) return "Image upload"
  if (type.startsWith("video/")) return "Video upload"
  if (type.includes("pdf")) return "PDF upload"
  if (type.includes("csv") || type.includes("spreadsheet")) return "Sheet upload"
  if (type.includes("presentation")) return "Slide upload"
  if (type.includes("text")) return "Text upload"
  return "File upload"
}
