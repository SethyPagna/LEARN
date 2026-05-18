export type PracticeSessionType = "quiz" | "exam" | "flashcards" | "matching" | "sprint" | "review" | "battle"

export interface PracticeSessionAnswer {
  questionId: string
  selectedAnswerId: string
  elapsedMs?: number
}

export interface PracticeSessionQuestion {
  id: string
  question: string
  topic?: string
  choices?: Array<{ id: string; text: string }>
  correct_answer_id?: string
  explanation?: string
}

export interface PracticeSessionItemDraft {
  questionId?: string
  reviewItemId?: string | null
  contentItemId?: string | null
  prompt: string
  answer: string
  userAnswer: string
  correct: boolean
  elapsedMs: number
  metadata: Record<string, unknown>
}

export interface PracticeSessionDraft {
  sessionType: PracticeSessionType
  durationSeconds: number
  score: number
  total: number
  metadata: Record<string, unknown>
  items: PracticeSessionItemDraft[]
}

export function normalizePracticeSessionType(value: unknown): PracticeSessionType {
  const type = String(value || "quiz").trim().toLowerCase()
  if (type === "exam" || type === "flashcards" || type === "matching" || type === "sprint" || type === "review" || type === "battle") return type
  return "quiz"
}

export function findChoiceText(question: PracticeSessionQuestion, choiceId?: string) {
  if (!choiceId) return ""
  return question.choices?.find((choice) => choice.id === choiceId)?.text || choiceId
}

export function buildQuizPracticeSessionDraft(input: {
  quizId: string
  quizTitle: string
  questions: PracticeSessionQuestion[]
  answers: PracticeSessionAnswer[]
  durationSeconds?: number
  mode?: PracticeSessionType
}): PracticeSessionDraft {
  const questionById = new Map(input.questions.map((question) => [question.id, question]))
  let score = 0
  const items = input.answers.map((answer) => {
    const question = questionById.get(answer.questionId)
    const correct = Boolean(question?.correct_answer_id) && question?.correct_answer_id === answer.selectedAnswerId
    if (correct) score += 1
    const correctAnswer = question ? findChoiceText(question, question.correct_answer_id) : ""
    const selectedAnswer = question ? findChoiceText(question, answer.selectedAnswerId) : answer.selectedAnswerId
    return {
      questionId: answer.questionId,
      prompt: question?.question || "Question",
      answer: [correctAnswer, question?.explanation].filter(Boolean).join("\n\n"),
      userAnswer: selectedAnswer,
      correct,
      elapsedMs: Math.max(0, Math.round(Number(answer.elapsedMs || 0))),
      metadata: {
        quizId: input.quizId,
        topic: question?.topic || "General",
        selectedAnswerId: answer.selectedAnswerId,
        correctAnswerId: question?.correct_answer_id || "",
      },
    }
  })

  return {
    sessionType: normalizePracticeSessionType(input.mode || "quiz"),
    durationSeconds: Math.max(0, Math.round(Number(input.durationSeconds || 0))),
    score,
    total: items.length,
    metadata: { quizId: input.quizId, quizTitle: input.quizTitle },
    items,
  }
}

export function buildGamePracticeSessionDraft(input: {
  gameKey: string
  score: number
  total: number
  durationSeconds?: number
  metadata?: Record<string, unknown>
  items?: Array<Record<string, unknown>>
}): PracticeSessionDraft {
  const items = (input.items || []).map((item) => ({
    questionId: typeof item.questionId === "string" ? item.questionId : typeof item.question_id === "string" ? item.question_id : undefined,
    reviewItemId: typeof item.reviewItemId === "string" ? item.reviewItemId : typeof item.review_item_id === "string" ? item.review_item_id : null,
    contentItemId: typeof item.contentItemId === "string" ? item.contentItemId : typeof item.content_item_id === "string" ? item.content_item_id : null,
    prompt: String(item.prompt || item.question || "Game item"),
    answer: String(item.answer || item.correctAnswer || item.correct_answer || ""),
    userAnswer: String(item.userAnswer || item.user_answer || item.selectedAnswer || item.selected_answer || ""),
    correct: Boolean(item.correct),
    elapsedMs: Math.max(0, Math.round(Number(item.elapsedMs || item.elapsed_ms || 0))),
    metadata: item.metadata && typeof item.metadata === "object" ? item.metadata as Record<string, unknown> : {},
  }))

  return {
    sessionType: "sprint",
    durationSeconds: Math.max(0, Math.round(Number(input.durationSeconds || 0))),
    score: Math.max(0, Math.round(Number(input.score || 0))),
    total: Math.max(0, Math.round(Number(input.total || items.length))),
    metadata: { ...(input.metadata || {}), gameKey: input.gameKey },
    items,
  }
}

export function buildReviewCardsFromPracticeItems(input: {
  sessionId: string
  items: PracticeSessionItemDraft[]
  limit?: number
}) {
  const limit = Math.max(1, Math.min(20, input.limit || 10))
  return input.items
    .filter((item) => !item.correct && item.prompt.trim())
    .slice(0, limit)
    .map((item) => ({
      sourceId: `${input.sessionId}:${item.questionId || item.prompt.slice(0, 48)}`,
      title: String(item.metadata.topic || "Practice mistake").slice(0, 160),
      prompt: item.prompt,
      answer: item.answer || "Review the source material, then retry this item.",
      topic: String(item.metadata.topic || "General").slice(0, 80),
    }))
}
