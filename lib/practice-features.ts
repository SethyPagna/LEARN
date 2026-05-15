import type { PracticeAttemptSummary, PracticeMode, QuizQuestion } from "@/components/learn/types"

export interface PracticeAnswer {
  questionId: string
  selectedAnswerId: string
}

export interface PracticeReviewCard {
  sourceId: string
  title: string
  prompt: string
  answer: string
  topic: string
}

export type PracticeQuestionFilter = "all" | "unanswered" | "marked" | "missed"
export type PracticeModeGroupId = "core" | "speed" | "repair" | "generated"

export interface PracticeModeGroup {
  id: PracticeModeGroupId
  label: string
  caption: string
  modes: PracticeMode[]
}

export interface PracticeModeSummary {
  activeGroup: PracticeModeGroup
  activeModeLabel: string
  recommendedNextMode: PracticeMode
  caption: string
}

export const practiceModeGroups: PracticeModeGroup[] = [
  {
    id: "core",
    label: "Core",
    caption: "Accuracy-first practice with explanations and exam timing.",
    modes: ["quiz", "exam", "true-false", "fill-blank"],
  },
  {
    id: "speed",
    label: "Speed",
    caption: "Fast retrieval for warmups, memory checks, and confidence.",
    modes: ["flashcards", "matching", "sprint"],
  },
  {
    id: "repair",
    label: "Repair",
    caption: "Focus only on misses, marked questions, and weak topics.",
    modes: ["mistake-retry"],
  },
  {
    id: "generated",
    label: "Generated",
    caption: "Practice created from Studio notes, AI cleanup, or imports.",
    modes: ["generated"],
  },
]

export function summarizePracticeAttempt(input: {
  mode: PracticeMode
  questions: QuizQuestion[]
  answers: PracticeAnswer[]
  durationSeconds: number
}): PracticeAttemptSummary {
  const answerById = new Map(input.answers.map((answer) => [answer.questionId, answer.selectedAnswerId]))
  let score = 0
  const missedQuestionIds: string[] = []

  for (const question of input.questions) {
    const selectedAnswerId = answerById.get(question.id)
    if (selectedAnswerId && question.correct_answer_id === selectedAnswerId) score += 1
    else missedQuestionIds.push(question.id)
  }

  const nextAction = missedQuestionIds.length
    ? "retry"
    : input.durationSeconds > 45 * 60
      ? "rest"
      : "review"

  return {
    mode: input.mode,
    score,
    total: input.questions.length,
    durationSeconds: input.durationSeconds,
    missedQuestionIds,
    nextAction,
  }
}

export function buildPracticeReviewPlan(input: {
  summary: PracticeAttemptSummary
  questions: QuizQuestion[]
}) {
  const questionById = new Map(input.questions.map((question) => [question.id, question]))
  const topicCounts = new Map<string, number>()
  for (const questionId of input.summary.missedQuestionIds) {
    const topic = questionById.get(questionId)?.topic || "General"
    topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1)
  }

  const weakTopics = [...topicCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([topic, missed]) => ({ topic, missed }))

  const accuracy = input.summary.total ? Math.round((input.summary.score / input.summary.total) * 100) : 0
  const durationMinutes = Math.max(1, Math.ceil(input.summary.durationSeconds / 60))
  const primaryAction = input.summary.missedQuestionIds.length
    ? "Retry missed questions, then save the hardest misses as review cards."
    : accuracy >= 90
      ? "Level up with a harder mode or generate a follow-up quiz from Studio notes."
      : "Do a short review pass, then repeat the full set."

  return {
    accuracy,
    durationMinutes,
    weakTopics,
    primaryAction,
    cardsToCreate: Math.min(5, input.summary.missedQuestionIds.length),
  }
}

export function buildPracticeReviewCards(input: {
  quizId: string
  quizTitle: string
  questions: QuizQuestion[]
  missedQuestionIds: string[]
}): PracticeReviewCard[] {
  const missed = new Set(input.missedQuestionIds)
  return input.questions
    .filter((question) => missed.has(question.id))
    .map((question) => {
      const answer = question.choices.find((choice) => choice.id === question.correct_answer_id)?.text || question.correct_answer_id
      return {
        sourceId: `${input.quizId}:${question.id}`,
        title: `${input.quizTitle} - ${question.topic || "Review"}`,
        prompt: question.question,
        answer: [answer, question.explanation].filter(Boolean).join("\n\n"),
        topic: question.topic || "General",
      }
    })
}

export function buildMistakeRetrySet(questions: QuizQuestion[], missedQuestionIds: string[]) {
  const missed = new Set(missedQuestionIds)
  return questions.filter((question) => missed.has(question.id))
}

export function filterPracticeQuestions(
  questions: QuizQuestion[],
  input: {
    filter: PracticeQuestionFilter
    answeredQuestionIds?: string[]
    markedQuestionIds?: string[]
    missedQuestionIds?: string[]
  },
) {
  if (input.filter === "all") return questions
  const answered = new Set(input.answeredQuestionIds || [])
  const marked = new Set(input.markedQuestionIds || [])
  const missed = new Set(input.missedQuestionIds || [])

  if (input.filter === "unanswered") return questions.filter((question) => !answered.has(question.id))
  if (input.filter === "marked") return questions.filter((question) => marked.has(question.id))
  return questions.filter((question) => missed.has(question.id))
}

export function evaluateGameChoice(question: QuizQuestion, selectedChoiceId: string) {
  const selectedChoice = question.choices.find((choice) => choice.id === selectedChoiceId)
  const correctChoice = question.choices.find((choice) => choice.id === question.correct_answer_id)
  const correct = question.correct_answer_id === selectedChoiceId

  return {
    correct,
    selectedChoiceText: selectedChoice?.text || "",
    correctChoiceText: correctChoice?.text || "",
    explanation: question.explanation || (correct ? "Nice recall." : "Review this concept, then retry it."),
  }
}

export function summarizeGameRun(input: {
  score: number
  total: number
  durationSeconds: number
  targetSeconds: number
}) {
  const accuracy = input.total ? Math.round((input.score / input.total) * 100) : 0
  const pace = input.durationSeconds <= input.targetSeconds ? "on-target" : "over-target"
  const nextAction = accuracy < 70 ? "retry-missed" : pace === "over-target" ? "speed-review" : "level-up"

  return {
    ...input,
    accuracy,
    pace,
    nextAction,
  }
}

export function getPracticeModeGroup(mode: PracticeMode) {
  return practiceModeGroups.find((group) => group.modes.includes(mode)) ?? practiceModeGroups[0]
}

export function summarizePracticeMode(input: {
  mode: PracticeMode
  missedCount?: number
  answeredCount?: number
  totalCount?: number
}): PracticeModeSummary {
  const activeGroup = getPracticeModeGroup(input.mode)
  const hasMisses = (input.missedCount ?? 0) > 0
  const hasAnsweredAll = (input.totalCount ?? 0) > 0 && (input.answeredCount ?? 0) >= (input.totalCount ?? 0)
  const recommendedNextMode: PracticeMode = hasMisses
    ? "mistake-retry"
    : hasAnsweredAll
      ? "flashcards"
      : input.mode

  return {
    activeGroup,
    activeModeLabel: practiceModeLabel(input.mode),
    recommendedNextMode,
    caption: hasMisses
      ? "Repair misses first, then save the hardest ones to Reviews."
      : hasAnsweredAll
        ? "You have a complete pass. Switch to fast recall or level up."
        : activeGroup.caption,
  }
}

export function practiceModeLabel(mode: PracticeMode) {
  return mode.split("-").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ")
}
