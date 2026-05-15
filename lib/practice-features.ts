import type { PracticeAttemptSummary, PracticeMode, QuizQuestion } from "@/components/learn/types"

export interface PracticeAnswer {
  questionId: string
  selectedAnswerId: string
}

export type PracticeQuestionFilter = "all" | "unanswered" | "marked" | "missed"

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

export function practiceModeLabel(mode: PracticeMode) {
  return mode.split("-").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ")
}
