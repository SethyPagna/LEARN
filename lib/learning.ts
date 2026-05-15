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

  const weakTopics: WeakTopic[] = []
  for (const [topic, stats] of topicStats.entries()) {
    const next = {
      topic,
      attempts: stats.attempts,
      correct: stats.correct,
      accuracy: Math.round((stats.correct / stats.attempts) * 100),
    }
    if (next.accuracy < 80) weakTopics.push(next)
  }

  return weakTopics.sort((first, second) => {
    if (first.accuracy !== second.accuracy) return first.accuracy - second.accuracy
    return second.attempts - first.attempts
  })
}

export function buildLearningSnapshot(input: {
  goals: LearningGoalSummary[]
  notes: NoteSummary[]
  answers: TopicAnswer[]
}) {
  let completedGoals = 0
  for (const goal of input.goals) {
    if (goal.completed) completedGoals += 1
  }
  const goalCompletion = input.goals.length
    ? Math.round((completedGoals / input.goals.length) * 100)
    : 0
  const recentNotes = topRecentNotes(input.notes, 5)
  const weakTopics = rankWeakTopics(input.answers)

  return {
    goalCompletion,
    recentNotes,
    weakTopics,
    recommendedFocus: weakTopics.slice(0, 3).map((topic) => topic.topic),
  }
}

function topRecentNotes(notes: NoteSummary[], limit: number) {
  const recent: Array<{ note: NoteSummary; time: number }> = []
  for (const note of notes) {
    const noteTime = Date.parse(note.updatedAt)
    let insertAt = recent.length
    for (let index = 0; index < recent.length; index += 1) {
      if (noteTime > recent[index].time) {
        insertAt = index
        break
      }
    }
    recent.splice(insertAt, 0, { note, time: noteTime })
    if (recent.length > limit) recent.pop()
  }
  return recent.map((entry) => entry.note)
}
