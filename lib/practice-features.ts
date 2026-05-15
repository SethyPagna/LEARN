import type { PracticeAttemptSummary, PracticeMode, QuizQuestion } from "@/components/learn/types"

export interface PracticeAnswer {
  questionId: string
  selectedAnswerId: string
}

export function summarizePracticeAttempt(input: {
  mode: PracticeMode
  questions: QuizQuestion[]
  answers: PracticeAnswer[]
  durationSeconds: number
}): PracticeAttemptSummary {
  const correctById = new Map(input.questions.map((question) => [question.id, question.correct_answer_id]))
  let score = 0
  const missedQuestionIds: string[] = []

  for (const answer of input.answers) {
    if (correctById.get(answer.questionId) === answer.selectedAnswerId) score += 1
    else missedQuestionIds.push(answer.questionId)
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

export function practiceModeLabel(mode: PracticeMode) {
  return mode.split("-").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ")
}
