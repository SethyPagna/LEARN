import assert from "node:assert/strict"
import test from "node:test"
import {
  buildGamePracticeSessionDraft,
  buildQuizPracticeSessionDraft,
  buildReviewCardsFromPracticeItems,
  normalizePracticeSessionType,
} from "../lib/practice-sessions"

const questions = [
  {
    id: "q1",
    question: "What does Round-robin scheduling improve?",
    topic: "Operating systems",
    choices: [
      { id: "a", text: "Fairness" },
      { id: "b", text: "Disk capacity" },
    ],
    correct_answer_id: "a",
    explanation: "Round-robin gives processes equal time slices.",
  },
  {
    id: "q2",
    question: "What prevents priority starvation?",
    topic: "Operating systems",
    choices: [
      { id: "a", text: "Paging" },
      { id: "b", text: "Aging" },
    ],
    correct_answer_id: "b",
    explanation: "Aging gradually raises waiting process priority.",
  },
]

test("quiz practice session draft scores answers and stores rich item metadata", () => {
  const draft = buildQuizPracticeSessionDraft({
    quizId: "quiz_os",
    quizTitle: "Operating Systems",
    questions,
    answers: [
      { questionId: "q1", selectedAnswerId: "a", elapsedMs: 1000 },
      { questionId: "q2", selectedAnswerId: "a", elapsedMs: 2000 },
    ],
    durationSeconds: 75,
  })

  assert.equal(draft.sessionType, "quiz")
  assert.equal(draft.score, 1)
  assert.equal(draft.total, 2)
  assert.equal(draft.durationSeconds, 75)
  assert.equal(draft.items[0].correct, true)
  assert.equal(draft.items[1].correct, false)
  assert.equal(draft.items[1].userAnswer, "Paging")
  assert.match(draft.items[1].answer, /Aging/)
  assert.equal(draft.items[1].metadata.topic, "Operating systems")
})

test("game practice session draft preserves optional item data", () => {
  const draft = buildGamePracticeSessionDraft({
    gameKey: "flashcard-sprint",
    score: 3,
    total: 4,
    durationSeconds: 60,
    metadata: { targetSeconds: 90 },
    items: [
      { questionId: "q1", prompt: "Recall FSRS", answer: "Scheduling", userAnswer: "Scheduling", correct: true },
      { question_id: "q2", prompt: "Recall D1", correct_answer: "Database", selected_answer: "Storage", correct: false },
    ],
  })

  assert.equal(draft.sessionType, "sprint")
  assert.equal(draft.score, 3)
  assert.equal(draft.total, 4)
  assert.equal(draft.metadata.gameKey, "flashcard-sprint")
  assert.equal(draft.items[1].questionId, "q2")
  assert.equal(draft.items[1].answer, "Database")
})

test("missed practice items become bounded review card candidates", () => {
  const draft = buildQuizPracticeSessionDraft({
    quizId: "quiz_os",
    quizTitle: "Operating Systems",
    questions,
    answers: [
      { questionId: "q1", selectedAnswerId: "b" },
      { questionId: "q2", selectedAnswerId: "a" },
    ],
  })
  const cards = buildReviewCardsFromPracticeItems({ sessionId: "session_1", items: draft.items, limit: 1 })

  assert.equal(cards.length, 1)
  assert.equal(cards[0].sourceId, "session_1:q1")
  assert.equal(cards[0].topic, "Operating systems")
  assert.match(cards[0].prompt, /Round-robin/)
})

test("practice session type falls back to quiz for unknown values", () => {
  assert.equal(normalizePracticeSessionType("battle"), "battle")
  assert.equal(normalizePracticeSessionType("nope"), "quiz")
})
