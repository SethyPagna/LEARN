export interface TopicAnswer {
  topic: string
  isCorrect: boolean
}

export interface LearningGoalSummary {
  title: string
  completed: boolean
}

export interface NoteSummary {
  id: string
  title: string
  updatedAt: string
}

export interface WeakTopic {
  topic: string
  attempts: number
  correct: number
  accuracy: number
}

export function rankWeakTopics(answers: TopicAnswer[]) {
  const topicStats = new Map<string, { attempts: number; correct: number }>()

  for (const answer of answers) {
    const topic = answer.topic.trim()
    if (!topic) continue
    const stats = topicStats.get(topic) ?? { attempts: 0, correct: 0 }
    stats.attempts += 1
    if (answer.isCorrect) stats.correct += 1
    topicStats.set(topic, stats)
  }

  return Array.from(topicStats.entries())
    .map<WeakTopic>(([topic, stats]) => ({
      topic,
      attempts: stats.attempts,
      correct: stats.correct,
      accuracy: Math.round((stats.correct / stats.attempts) * 100),
    }))
    .filter((topic) => topic.accuracy < 80)
    .sort((first, second) => {
      if (first.accuracy !== second.accuracy) return first.accuracy - second.accuracy
      return second.attempts - first.attempts
    })
}

export function buildLearningSnapshot(input: {
  goals: LearningGoalSummary[]
  notes: NoteSummary[]
  answers: TopicAnswer[]
}) {
  const completedGoals = input.goals.filter((goal) => goal.completed).length
  const goalCompletion = input.goals.length
    ? Math.round((completedGoals / input.goals.length) * 100)
    : 0
  const recentNotes = [...input.notes]
    .sort((first, second) => Date.parse(second.updatedAt) - Date.parse(first.updatedAt))
    .slice(0, 5)
  const weakTopics = rankWeakTopics(input.answers)

  return {
    goalCompletion,
    recentNotes,
    weakTopics,
    recommendedFocus: weakTopics.slice(0, 3).map((topic) => topic.topic),
  }
}
