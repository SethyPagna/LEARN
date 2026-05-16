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
  sourceType?: "note" | "block" | "flashcard" | "lesson" | "practice_mistake"
  prompt?: string
  answer?: string
  topic?: string
}

export interface ReviewSchedule {
  items: ReviewItem[]
  isRestDay: boolean
  remainingDueCount: number
}

export interface ReviewSessionSummary {
  totalDue: number
  revealedCount: number
  hiddenCount: number
  practiceMissCount: number
  remainingAfterCap: number
  averageRetrievability: number
  sourceCounts: Record<NonNullable<ReviewItem["sourceType"]>, number>
  topTopics: Array<{ topic: string; count: number }>
}

export interface ReviewActionPlan {
  headline: string
  detail: string
  nextAction: "rest" | "reveal" | "grade" | "practice" | "studio"
  targetItemId?: string
  chips: string[]
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

export interface FeedWorkspaceSummary {
  total: number
  preferred: number
  serendipity: number
  answered: number
  unanswered: number
  totalDurationSeconds: number
  topTopics: Array<{ topic: string; count: number }>
}

export interface FeedActionPlan {
  headline: string
  nextAction: "answer" | "refresh" | "save" | "review"
  targetLessonId?: string
  chips: string[]
}

export interface KnowledgeGraphSummary {
  totalNodes: number
  totalEdges: number
  orphanCount: number
  privateCount: number
  connectionCount: number
  publicCount: number
  averageMastery: number
  seedCount: number
  developingCount: number
  masteredCount: number
  edgeDensity: number
  strongestEdges: KnowledgeEdge[]
}

export interface KnowledgeGraphActionPlan {
  headline: string
  detail: string
  nextAction: "add-node" | "connect-orphan" | "review-weak" | "open-ai" | "celebrate"
  targetNodeId?: string
  chips: string[]
}

export function buildReviewSchedule(input: {
  items: ReviewItem[]
  now: Date
  dailyCap: number
  restDay?: Weekday
}): ReviewSchedule {
  const isRestDay = input.restDay ? weekdayForDate(input.now) === input.restDay : false
  const nowTime = input.now.getTime()
  const dueItems: Array<{ item: ReviewItem; dueTime: number }> = []
  for (const item of input.items) {
    const dueTime = Date.parse(item.dueAt)
    if (dueTime <= nowTime) dueItems.push({ item, dueTime })
  }
  dueItems.sort((left, right) => {
    const dueDelta = left.dueTime - right.dueTime
    if (dueDelta !== 0) return dueDelta
    return left.item.retrievability - right.item.retrievability
  })

  if (isRestDay) {
    return { items: [], isRestDay: true, remainingDueCount: dueItems.length }
  }

  const cap = Math.max(0, Math.floor(input.dailyCap))
  return {
    items: dueItems.slice(0, cap).map((entry) => entry.item),
    isRestDay: false,
    remainingDueCount: Math.max(0, dueItems.length - cap),
  }
}

export function reviewSourceLabel(item: ReviewItem) {
  const labels: Record<NonNullable<ReviewItem["sourceType"]>, string> = {
    note: "Note",
    block: "Vault block",
    flashcard: "Flashcard",
    lesson: "Feed lesson",
    practice_mistake: "Practice miss",
  }
  const base = labels[item.sourceType || "note"]
  return item.topic ? `${base} | ${item.topic}` : base
}

export function reviewPromptText(item: ReviewItem) {
  const prompt = item.prompt?.trim()
  if (prompt) return prompt
  return `Recall the core idea behind "${item.title}".`
}

export function reviewAnswerText(item: ReviewItem) {
  const answer = item.answer?.trim()
  if (answer) return answer
  return "Check your Studio notes, then grade the recall honestly before moving on."
}

export function summarizeReviewSession(
  schedule: Pick<ReviewSchedule, "items" | "remainingDueCount">,
  revealedIds: readonly string[] = [],
): ReviewSessionSummary {
  const revealed = new Set(revealedIds)
  const sourceCounts = createEmptyReviewSourceCounts()
  const topicCounts = new Map<string, number>()
  let retrievabilityTotal = 0
  let practiceMissCount = 0

  for (const item of schedule.items) {
    const sourceType = item.sourceType || "note"
    sourceCounts[sourceType] += 1
    retrievabilityTotal += clampMastery(item.retrievability)
    if (sourceType === "practice_mistake") practiceMissCount += 1
    if (item.topic?.trim()) {
      const topic = item.topic.trim()
      topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1)
    }
  }

  const revealedCount = schedule.items.filter((item) => revealed.has(item.id)).length
  return {
    totalDue: schedule.items.length,
    revealedCount,
    hiddenCount: Math.max(0, schedule.items.length - revealedCount),
    practiceMissCount,
    remainingAfterCap: Math.max(0, schedule.remainingDueCount),
    averageRetrievability: schedule.items.length ? retrievabilityTotal / schedule.items.length : 0,
    sourceCounts,
    topTopics: [...topicCounts.entries()]
      .map(([topic, count]) => ({ topic, count }))
      .sort((left, right) => right.count - left.count || left.topic.localeCompare(right.topic))
      .slice(0, 4),
  }
}

export function buildReviewActionPlan(
  schedule: Pick<ReviewSchedule, "items" | "isRestDay" | "remainingDueCount">,
  summary: ReviewSessionSummary,
  revealedIds: readonly string[] = [],
): ReviewActionPlan {
  if (schedule.isRestDay) {
    return {
      headline: "Protect the rest day",
      detail: "Today is intentionally light. You can still add a Studio note if something useful appears.",
      nextAction: "rest",
      chips: ["rest day", `${summary.remainingAfterCap} waiting`, "no guilt"],
    }
  }

  if (summary.totalDue === 0) {
    return {
      headline: "No reviews due",
      detail: "Capture one useful idea or generate cards from Studio to prepare tomorrow's queue.",
      nextAction: "studio",
      chips: ["queue clear", "build tomorrow", "Studio"],
    }
  }

  const revealed = new Set(revealedIds)
  const revealedItem = schedule.items.find((item) => revealed.has(item.id))
  if (revealedItem) {
    return {
      headline: `Grade ${revealedItem.title}`,
      detail: "Choose again, hard, good, or easy while the answer is visible.",
      nextAction: "grade",
      targetItemId: revealedItem.id,
      chips: [`${summary.revealedCount} revealed`, "rate honestly", `${summary.hiddenCount} hidden`],
    }
  }

  const firstPracticeMiss = schedule.items.find((item) => item.sourceType === "practice_mistake")
  if (firstPracticeMiss && summary.practiceMissCount >= Math.max(2, Math.ceil(summary.totalDue / 2))) {
    return {
      headline: "Retry missed practice",
      detail: "Most of this queue came from misses. Run a short correction loop before adding new cards.",
      nextAction: "practice",
      targetItemId: firstPracticeMiss.id,
      chips: [`${summary.practiceMissCount} misses`, "retry", "explain"],
    }
  }

  const firstItem = schedule.items[0]
  if (firstItem) {
    return {
      headline: `Reveal ${firstItem.title}`,
      detail: "Recall first, then reveal. Keep the loop small and accurate.",
      nextAction: "reveal",
      targetItemId: firstItem.id,
      chips: [`${summary.totalDue} due`, `${Math.round(summary.averageRetrievability * 100)}% recall`, `${summary.remainingAfterCap} later`],
    }
  }

  return {
    headline: "Keep the queue light",
    detail: "You are within today's review dose. Continue when ready or capture a new source.",
    nextAction: "studio",
    chips: ["minimum dose", "capture", "review later"],
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
  const preferred: FeedLessonSelection[] = []
  const outsideBubble: FeedLessonSelection[] = []
  const selectionById = new Map<string, FeedLessonSelection>()

  for (const lesson of sorted) {
    const isPreferred = lesson.topicTags.some((topic) => preferredTopics.has(topic.toLowerCase()))
    const next = { ...lesson, reason: isPreferred ? "preferred" as const : "serendipity" as const }
    selectionById.set(lesson.id, next)
    if (isPreferred) preferred.push(next)
    else outsideBubble.push(next)
  }

  const selectedPreferred = preferred.slice(0, preferredCount)
  const selectedSerendipity = outsideBubble.slice(0, serendipityCount)
  const chosenIds = new Set(selectedPreferred.map((lesson) => lesson.id))
  for (const lesson of selectedSerendipity) chosenIds.add(lesson.id)

  const fallback: FeedLessonSelection[] = []
  const needed = Math.max(0, input.count - selectedPreferred.length - selectedSerendipity.length)
  if (needed) {
    for (const lesson of sorted) {
      if (chosenIds.has(lesson.id)) continue
      const candidate = selectionById.get(lesson.id)
      if (candidate) fallback.push(candidate)
      if (fallback.length >= needed) break
    }
  }

  return [...selectedPreferred, ...selectedSerendipity, ...fallback].slice(0, input.count)
}

export function summarizeFeedWorkspace(
  lessons: Array<FeedLessonSelection | FeedLessonCandidate>,
  answeredByLessonId: Record<string, unknown> = {},
): FeedWorkspaceSummary {
  const answeredIds = new Set(Object.keys(answeredByLessonId).filter((id) => Boolean(answeredByLessonId[id])))
  const topicCounts = new Map<string, number>()
  let preferred = 0
  let serendipity = 0
  let totalDurationSeconds = 0

  for (const lesson of lessons) {
    const reason = "reason" in lesson ? lesson.reason : "preferred"
    if (reason === "serendipity") serendipity += 1
    else preferred += 1
    totalDurationSeconds += Math.max(0, lesson.durationSeconds || 0)
    for (const topic of lesson.topicTags) {
      const normalized = topic.trim()
      if (!normalized) continue
      topicCounts.set(normalized, (topicCounts.get(normalized) ?? 0) + 1)
    }
  }

  const answered = lessons.filter((lesson) => answeredIds.has(lesson.id)).length
  return {
    total: lessons.length,
    preferred,
    serendipity,
    answered,
    unanswered: Math.max(0, lessons.length - answered),
    totalDurationSeconds,
    topTopics: [...topicCounts.entries()]
      .map(([topic, count]) => ({ topic, count }))
      .sort((first, second) => second.count - first.count || first.topic.localeCompare(second.topic))
      .slice(0, 5),
  }
}

export function buildFeedActionPlan(
  lessons: Array<FeedLessonSelection | FeedLessonCandidate>,
  summary: FeedWorkspaceSummary,
  answeredByLessonId: Record<string, unknown> = {},
): FeedActionPlan {
  if (summary.total === 0) {
    return {
      headline: "Refresh discovery",
      nextAction: "refresh",
      chips: ["no lessons", "keep serendipity on"],
    }
  }

  const firstUnanswered = lessons.find((lesson) => !answeredByLessonId[lesson.id])
  if (firstUnanswered) {
    return {
      headline: `Answer ${firstUnanswered.title}`,
      nextAction: "answer",
      targetLessonId: firstUnanswered.id,
      chips: [`${summary.unanswered} unanswered`, `${summary.serendipity} serendipity`],
    }
  }

  if (summary.serendipity === 0) {
    return {
      headline: "Add more variety",
      nextAction: "refresh",
      chips: [`${summary.preferred} preferred`, "no outside topic"],
    }
  }

  return {
    headline: "Save one useful insight",
    nextAction: "save",
    targetLessonId: lessons[0]?.id,
    chips: [`${summary.answered} answered`, `${formatFeedDuration(summary.totalDurationSeconds)}`],
  }
}

export function detectOrphanKnowledgeNodes(nodes: KnowledgeNode[], edges: KnowledgeEdge[]) {
  const connected = new Set<string>()
  for (const edge of edges) {
    connected.add(edge.sourceId)
    connected.add(edge.targetId)
  }
  const orphans: KnowledgeNode[] = []
  for (const node of nodes) {
    if (!connected.has(node.id)) orphans.push(node)
  }
  return orphans
}

export function summarizeKnowledgeGraph(nodes: KnowledgeNode[], edges: KnowledgeEdge[]): KnowledgeGraphSummary {
  const kindCounts = {
    private: 0,
    connections: 0,
    public: 0,
  }
  let masteryTotal = 0
  let seedCount = 0
  let developingCount = 0
  let masteredCount = 0

  for (const node of nodes) {
    kindCounts[node.visibility] += 1
    const mastery = clampMastery(node.mastery)
    masteryTotal += mastery
    if (mastery >= 0.8) masteredCount += 1
    else if (mastery >= 0.4) developingCount += 1
    else seedCount += 1
  }

  const possibleEdges = Math.max(1, nodes.length * Math.max(0, nodes.length - 1))
  return {
    totalNodes: nodes.length,
    totalEdges: edges.length,
    orphanCount: detectOrphanKnowledgeNodes(nodes, edges).length,
    privateCount: kindCounts.private,
    connectionCount: kindCounts.connections,
    publicCount: kindCounts.public,
    averageMastery: nodes.length ? masteryTotal / nodes.length : 0,
    seedCount,
    developingCount,
    masteredCount,
    edgeDensity: edges.length / possibleEdges,
    strongestEdges: [...edges].sort((left, right) => right.strength - left.strength).slice(0, 3),
  }
}

export function buildKnowledgeGraphActionPlan(
  nodes: KnowledgeNode[],
  edges: KnowledgeEdge[],
  summary: KnowledgeGraphSummary,
): KnowledgeGraphActionPlan {
  if (summary.totalNodes === 0) {
    return {
      headline: "Create the first node",
      detail: "Add a note, flashcard, or resource so the graph can start mapping your learning.",
      nextAction: "add-node",
      chips: ["empty graph", "private by default", "start in Studio"],
    }
  }

  const orphan = detectOrphanKnowledgeNodes(nodes, edges)[0]
  if (orphan) {
    return {
      headline: `Connect ${orphan.title}`,
      detail: "This node is not linked yet. Add a relationship so it does not become a forgotten note.",
      nextAction: "connect-orphan",
      targetNodeId: orphan.id,
      chips: [`${summary.orphanCount} orphaned`, "AI edge suggestion", "graph hygiene"],
    }
  }

  const weakNode = findWeakestNode(nodes)
  if (weakNode && weakNode.mastery < 0.55) {
    return {
      headline: `Review ${weakNode.title}`,
      detail: "This connected concept is still fragile. Turn it into a review card or practice prompt.",
      nextAction: "review-weak",
      targetNodeId: weakNode.id,
      chips: [`${Math.round(clampMastery(weakNode.mastery) * 100)}% mastery`, "review loop", "retain"],
    }
  }

  if (summary.edgeDensity < 0.16) {
    return {
      headline: "Ask AI for links",
      detail: "The graph has content, but not many relationships. Generate candidate edges from nearby concepts.",
      nextAction: "open-ai",
      chips: [`${summary.totalEdges} edges`, "connector mode", "suggest links"],
    }
  }

  return {
    headline: "Graph is healthy",
    detail: "Your nodes are connected and mastery is trending up. Keep adding evidence and reviewing weak spots.",
    nextAction: "celebrate",
    chips: [`${Math.round(summary.averageMastery * 100)}% avg mastery`, `${summary.masteredCount} mastered`, "keep going"],
  }
}

function formatFeedDuration(totalSeconds: number) {
  const minutes = Math.max(0, Math.round(totalSeconds / 60))
  return `${minutes} min`
}

export function filterPublicProfileArtifacts(nodes: KnowledgeNode[], viewer: "public" | "connections" | "owner") {
  if (viewer === "owner") return nodes
  const visible: KnowledgeNode[] = []
  for (const node of nodes) {
    if (viewer === "connections" ? node.visibility !== "private" : node.visibility === "public") {
      visible.push(node)
    }
  }
  return visible
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

function createEmptyReviewSourceCounts(): Record<NonNullable<ReviewItem["sourceType"]>, number> {
  return {
    block: 0,
    flashcard: 0,
    lesson: 0,
    note: 0,
    practice_mistake: 0,
  }
}

function clampMastery(value: number) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0))
}

function findWeakestNode(nodes: KnowledgeNode[]) {
  let weakest: KnowledgeNode | undefined
  let weakestMastery = Number.POSITIVE_INFINITY

  for (const node of nodes) {
    const mastery = clampMastery(node.mastery)
    if (mastery < weakestMastery) {
      weakest = node
      weakestMastery = mastery
    }
  }

  return weakest
}
