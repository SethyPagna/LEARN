import assert from "node:assert/strict"
import test from "node:test"
import type { QuizQuestion } from "../components/learn/types"
import { buildMistakeRetrySet, filterPracticeQuestions, practiceModeLabel, summarizePracticeAttempt } from "../lib/practice-features"

const questions: QuizQuestion[] = [
  { id: "q1", question: "One?", choices: [], correct_answer_id: "a", topic: "Math", explanation: "One" },
  { id: "q2", question: "Two?", choices: [], correct_answer_id: "b", topic: "Math", explanation: "Two" },
]

test("practice attempt summary scores answers and recommends retry", () => {
  const summary = summarizePracticeAttempt({
    mode: "quiz",
    questions,
    answers: [
      { questionId: "q1", selectedAnswerId: "a" },
      { questionId: "q2", selectedAnswerId: "c" },
    ],
    durationSeconds: 120,
  })

  assert.equal(summary.score, 1)
  assert.deepEqual(summary.missedQuestionIds, ["q2"])
  assert.equal(summary.nextAction, "retry")
})

test("practice retry set contains only missed questions", () => {
  assert.deepEqual(buildMistakeRetrySet(questions, ["q2"]).map((question) => question.id), ["q2"])
  assert.equal(practiceModeLabel("mistake-retry"), "Mistake Retry")
})

test("practice summary treats unanswered questions as missed", () => {
  const summary = summarizePracticeAttempt({
    mode: "exam",
    questions,
    answers: [{ questionId: "q1", selectedAnswerId: "a" }],
    durationSeconds: 60,
  })

  assert.equal(summary.score, 1)
  assert.deepEqual(summary.missedQuestionIds, ["q2"])
})

test("practice question filters support unanswered marked and missed views", () => {
  assert.deepEqual(filterPracticeQuestions(questions, { filter: "unanswered", answeredQuestionIds: ["q1"] }).map((question) => question.id), ["q2"])
  assert.deepEqual(filterPracticeQuestions(questions, { filter: "marked", markedQuestionIds: ["q1"] }).map((question) => question.id), ["q1"])
  assert.deepEqual(filterPracticeQuestions(questions, { filter: "missed", missedQuestionIds: ["q2"] }).map((question) => question.id), ["q2"])
})
