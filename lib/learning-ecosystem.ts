export type Weekday =
  | "sunday"
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"

const WEEKDAYS: Weekday[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
const BASE_LEVEL_XP = 120
const COMMUNITY_POST_REPUTATION = 15

export interface FsrsState {
  difficulty: number
  stability: number
  retrievability: number
  dueAt: string
}

export interface ReviewItem extends FsrsState {
  id: string
  title: string
  sourceType?: "note" | "block" | "flashcard" | "lesson"
}

export interface ReviewSchedule {
  items: ReviewItem[]
  isRestDay: boolean
  remainingDueCount: number
}

export interface LearningStreak {
  current: number
  longest: number
  freezesAvailable: number
  lastActivityDate?: string | null
  usedFreeze?: boolean
}

export interface KnowledgeNode {
  id: string
  title: string
  type: "concept" | "note" | "flashcard" | "lesson" | "resource"
  mastery: number
  visibility: "private" | "connections" | "public"
}

export interface KnowledgeEdge {
  id: string
  sourceId: string
  targetId: string
  type: "link" | "prerequisite" | "related" | "extends" | "contradicts"
  strength: number
}

export interface FeedLessonCandidate {
  id: string
  title: string
  topicTags: string[]
  readinessScore: number
  durationSeconds: number
}

export type FeedSelectionReason = "preferred" | "serendipity"
export type CommunityRole = "member" | "moderator" | "admin"
export type ReputationAction = "helpful_answer" | "accepted_answer" | "quality_comment" | "moderation_flag"

export interface FeedLessonSelection extends FeedLessonCandidate {
  reason: FeedSelectionReason
}

export function buildReviewSchedule(input: {
  items: ReviewItem[]
  now: Date
  dailyCap: number
  restDay?: Weekday
}): ReviewSchedule {
  const isRestDay = input.restDay ? weekdayForDate(input.now) === input.restDay : false
  const dueItems = input.items
    .filter((item) => new Date(item.dueAt).getTime() <= input.now.getTime())
    .sort((left, right) => {
      const dueDelta = new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime()
      if (dueDelta !== 0) return dueDelta
      return left.retrievability - right.retrievability
    })

  if (isRestDay) {
    return { items: [], isRestDay: true, remainingDueCount: dueItems.length }
  }

  const cap = Math.max(0, Math.floor(input.dailyCap))
  return {
    items: dueItems.slice(0, cap),
    isRestDay: false,
    remainingDueCount: Math.max(0, dueItems.length - cap),
  }
}

export function updateLearningStreak(input: LearningStreak & {
  today: string
  restDay?: Weekday
}): LearningStreak {
  if (!input.lastActivityDate) {
    return {
      current: 1,
      longest: Math.max(input.longest, 1),
      freezesAvailable: input.freezesAvailable,
      lastActivityDate: input.today,
    }
  }

  const elapsedLearningDays = countRequiredLearningDays(input.lastActivityDate, input.today, input.restDay)
  if (elapsedLearningDays <= 0) {
    return { ...input, lastActivityDate: input.today, usedFreeze: false }
  }

  if (elapsedLearningDays === 1) {
    const current = input.current + 1
    return {
      current,
      longest: Math.max(input.longest, current),
      freezesAvailable: input.freezesAvailable,
      lastActivityDate: input.today,
      usedFreeze: false,
    }
  }

  if (input.freezesAvailable > 0 && elapsedLearningDays === 2) {
    return {
      current: input.current,
      longest: input.longest,
      freezesAvailable: input.freezesAvailable - 1,
      lastActivityDate: input.today,
      usedFreeze: true,
    }
  }

  return {
    current: 1,
    longest: input.longest,
    freezesAvailable: input.freezesAvailable,
    lastActivityDate: input.today,
    usedFreeze: false,
  }
}

export function calculateLevelFromXp(xp: number) {
  const safeXp = Math.max(0, Math.floor(xp))
  const completedLevels = Math.floor(safeXp / BASE_LEVEL_XP)
  const level = completedLevels + 1
  return {
    level,
    nextLevelXp: level * BASE_LEVEL_XP,
    progress: safeXp % BASE_LEVEL_XP,
  }
}

export function selectFeedLessons(input: {
  lessons: FeedLessonCandidate[]
  preferredTopics: string[]
  count: number
  serendipityRatio?: number
}): FeedLessonSelection[] {
  const preferredTopics = new Set(input.preferredTopics.map((topic) => topic.toLowerCase()))
  const sorted = [...input.lessons].sort((left, right) => right.readinessScore - left.readinessScore)
  const serendipityCount = Math.max(1, Math.ceil(input.count * (input.serendipityRatio ?? 0.15)))
  const preferredCount = Math.max(0, input.count - serendipityCount)
  const preferred = sorted
    .filter((lesson) => lesson.topicTags.some((topic) => preferredTopics.has(topic.toLowerCase())))
    .slice(0, preferredCount)
    .map((lesson) => ({ ...lesson, reason: "preferred" as const }))

  const chosenIds = new Set(preferred.map((lesson) => lesson.id))
  const serendipity = sorted
    .filter((lesson) => !chosenIds.has(lesson.id))
    .filter((lesson) => !lesson.topicTags.some((topic) => preferredTopics.has(topic.toLowerCase())))
    .slice(0, serendipityCount)
    .map((lesson) => ({ ...lesson, reason: "serendipity" as const }))

  const fallback = sorted
    .filter((lesson) => !chosenIds.has(lesson.id) && !serendipity.some((entry) => entry.id === lesson.id))
    .slice(0, Math.max(0, input.count - preferred.length - serendipity.length))
    .map((lesson) => ({
      ...lesson,
      reason: lesson.topicTags.some((topic) => preferredTopics.has(topic.toLowerCase()))
        ? "preferred" as const
        : "serendipity" as const,
    }))

  return [...preferred, ...serendipity, ...fallback].slice(0, input.count)
}

export function detectOrphanKnowledgeNodes(nodes: KnowledgeNode[], edges: KnowledgeEdge[]) {
  const connected = new Set<string>()
  for (const edge of edges) {
    connected.add(edge.sourceId)
    connected.add(edge.targetId)
  }
  return nodes.filter((node) => !connected.has(node.id))
}

export function filterPublicProfileArtifacts(nodes: KnowledgeNode[], viewer: "public" | "connections" | "owner") {
  if (viewer === "owner") return nodes
  if (viewer === "connections") return nodes.filter((node) => node.visibility !== "private")
  return nodes.filter((node) => node.visibility === "public")
}

export function canPostInCommunity(input: { reputation: number; role: CommunityRole }) {
  return input.role === "admin" || input.role === "moderator" || input.reputation >= COMMUNITY_POST_REPUTATION
}

export function applyReputationAction(current: number, action: ReputationAction) {
  const deltaByAction: Record<ReputationAction, number> = {
    helpful_answer: 12,
    accepted_answer: 20,
    quality_comment: 4,
    moderation_flag: -5,
  }
  return Math.max(0, current + deltaByAction[action])
}

function weekdayForDate(date: Date): Weekday {
  return WEEKDAYS[date.getUTCDay()]
}

function countRequiredLearningDays(fromDate: string, toDate: string, restDay?: Weekday) {
  const from = parseDateOnly(fromDate)
  const to = parseDateOnly(toDate)
  let count = 0
  for (let cursor = addDays(from, 1); cursor.getTime() <= to.getTime(); cursor = addDays(cursor, 1)) {
    if (!restDay || weekdayForDate(cursor) !== restDay) count += 1
  }
  return count
}

function parseDateOnly(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}
