import assert from "node:assert/strict"
import test from "node:test"
import type { QuizQuestion } from "../components/learn/types"
import { buildMistakeRetrySet, evaluateGameChoice, filterPracticeQuestions, practiceModeLabel, summarizeGameRun, summarizePracticeAttempt } from "../lib/practice-features"

const questions: QuizQuestion[] = [
  { id: "q1", question: "One?", choices: [{ id: "a", text: "1" }, { id: "b", text: "2" }], correct_answer_id: "a", topic: "Math", explanation: "One" },
  { id: "q2", question: "Two?", choices: [{ id: "a", text: "1" }, { id: "b", text: "2" }], correct_answer_id: "b", topic: "Math", explanation: "Two" },
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

test("game choice evaluation returns feedback and correct answer text", () => {
  const feedback = evaluateGameChoice(questions[1], "a")

  assert.equal(feedback.correct, false)
  assert.equal(feedback.selectedChoiceText, "1")
  assert.equal(feedback.correctChoiceText, "2")
  assert.equal(feedback.explanation, "Two")
})

test("game run summary captures accuracy pace and next action", () => {
  assert.deepEqual(summarizeGameRun({ score: 8, total: 10, durationSeconds: 80, targetSeconds: 90 }), {
    score: 8,
    total: 10,
    durationSeconds: 80,
    targetSeconds: 90,
    accuracy: 80,
    pace: "on-target",
    nextAction: "level-up",
  })
  assert.equal(summarizeGameRun({ score: 3, total: 10, durationSeconds: 70, targetSeconds: 90 }).nextAction, "retry-missed")
})
