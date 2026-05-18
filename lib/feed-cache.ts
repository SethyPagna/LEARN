import { selectFeedLessons, type FeedLessonCandidate, type FeedLessonSelection } from "./learning-ecosystem"

export interface FeedRankCacheEntry {
  lessonId: string
  topicKey: string
  reason: "preferred" | "serendipity"
  rankScore: number
  topicTags: string[]
  expiresAt: string
}

export function feedTopicKey(topics: readonly string[]) {
  return [...new Set(topics.map((topic) => topic.trim().toLowerCase()).filter(Boolean))]
    .sort()
    .join("|")
}

export function buildFeedRankCacheEntries(input: {
  userId: string
  selected: FeedLessonSelection[]
  topicKey: string
  now: Date
  ttlMinutes?: number
}) {
  const ttlMs = Math.max(1, input.ttlMinutes || 30) * 60 * 1000
  const expiresAt = new Date(input.now.getTime() + ttlMs).toISOString()
  return input.selected.map((lesson, index) => ({
    id: `feed_cache_${input.userId}_${input.topicKey || "all"}_${lesson.id}`,
    userId: input.userId,
    lessonId: lesson.id,
    topicKey: input.topicKey,
    reason: lesson.reason,
    rankScore: Math.max(0, lesson.readinessScore) + (input.selected.length - index) / 100,
    topicTags: lesson.topicTags,
    expiresAt,
  }))
}

export function selectCachedFeedLessons(input: {
  cacheEntries: FeedRankCacheEntry[]
  lessonsById: Map<string, FeedLessonCandidate>
  now: Date
  count: number
  fallbackTopics: string[]
}) {
  const nowTime = input.now.getTime()
  const validEntries = input.cacheEntries
    .filter((entry) => Date.parse(entry.expiresAt) > nowTime && input.lessonsById.has(entry.lessonId))
    .sort((left, right) => right.rankScore - left.rankScore || left.lessonId.localeCompare(right.lessonId))

  if (validEntries.length >= input.count) {
    return validEntries.slice(0, input.count).map((entry) => {
      const lesson = input.lessonsById.get(entry.lessonId)!
      return { ...lesson, reason: entry.reason }
    })
  }

  return selectFeedLessons({
    lessons: [...input.lessonsById.values()],
    preferredTopics: input.fallbackTopics,
    count: input.count,
    serendipityRatio: 0.15,
  })
}
