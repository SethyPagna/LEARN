import assert from "node:assert/strict"
import test from "node:test"
import type { QuizQuestion } from "../components/learn/types"
import { hasPracticeDraftContent, listPracticeDraftCards, normalizePracticeDraft, summarizePracticeDrafts } from "../lib/practice-drafts"
import { buildMistakeRetrySet, buildPracticeReviewCards, buildPracticeReviewPlan, evaluateGameChoice, filterPracticeQuestions, getPracticeModeGroup, practiceModeGroups, practiceModeLabel, summarizeGameRun, summarizePracticeAttempt, summarizePracticeMode } from "../lib/practice-features"

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

test("practice modes are grouped by learner intent", () => {
  assert.equal(practiceModeGroups.length, 4)
  assert.equal(getPracticeModeGroup("sprint").id, "speed")
  assert.equal(getPracticeModeGroup("mistake-retry").id, "repair")
  assert.equal(getPracticeModeGroup("generated").label, "Generated")
})

test("practice mode summary recommends the next useful loop", () => {
  assert.deepEqual(summarizePracticeMode({ mode: "quiz", missedCount: 2, answeredCount: 3, totalCount: 5 }).recommendedNextMode, "mistake-retry")
  assert.equal(summarizePracticeMode({ mode: "exam", answeredCount: 5, totalCount: 5 }).recommendedNextMode, "flashcards")
  assert.match(summarizePracticeMode({ mode: "matching" }).caption, /Fast retrieval/)
})

test("practice review plan groups misses by topic and recommends next loop", () => {
  const summary = summarizePracticeAttempt({
    mode: "quiz",
    questions,
    answers: [{ questionId: "q1", selectedAnswerId: "b" }],
    durationSeconds: 75,
  })
  const plan = buildPracticeReviewPlan({ summary, questions })

  assert.equal(plan.accuracy, 0)
  assert.equal(plan.durationMinutes, 2)
  assert.deepEqual(plan.weakTopics, [{ topic: "Math", missed: 2 }])
  assert.match(plan.primaryAction, /Retry missed/)
  assert.equal(plan.cardsToCreate, 2)
})

test("practice review cards preserve missed question prompts and explanations", () => {
  const cards = buildPracticeReviewCards({
    quizId: "quiz_math",
    quizTitle: "Math quiz",
    questions,
    missedQuestionIds: ["q2"],
  })

  assert.equal(cards.length, 1)
  assert.equal(cards[0].sourceId, "quiz_math:q2")
  assert.equal(cards[0].prompt, "Two?")
  assert.match(cards[0].answer, /Two/)
  assert.equal(cards[0].topic, "Math")
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

test("practice drafts normalize saved attempts and ignore empty defaults", () => {
  const draft = normalizePracticeDraft({
    quizId: "quiz_math",
    answers: { q1: "a", q2: "" },
    markedQuestionIds: ["q2", "q2", ""],
    retryQuestionIds: ["q3"],
    questionFilter: "marked",
    practiceMode: "mistake-retry",
    targetMinutes: 500,
    elapsedSeconds: 42,
    updatedAt: "2026-05-16T00:00:00.000Z",
  }, "quiz_math")

  assert.ok(draft)
  assert.deepEqual(draft.answers, { q1: "a" })
  assert.deepEqual(draft.markedQuestionIds, ["q2"])
  assert.equal(draft.targetMinutes, 180)
  assert.equal(hasPracticeDraftContent(draft, "quiz"), true)

  const empty = normalizePracticeDraft({ quizId: "quiz_math", answers: {}, practiceMode: "quiz" }, "quiz_math")
  assert.ok(empty)
  assert.equal(hasPracticeDraftContent(empty, "quiz"), false)
  assert.equal(normalizePracticeDraft({ quizId: "other" }, "quiz_math"), null)
})

test("practice draft summary counts unfinished quiz work", () => {
  const summary = summarizePracticeDrafts({
    quiz_math: {
      quizId: "quiz_math",
      answers: { q1: "a" },
      markedQuestionIds: [],
      retryQuestionIds: [],
      questionFilter: "all",
      practiceMode: "quiz",
      targetMinutes: 10,
      elapsedSeconds: 12,
      updatedAt: "2026-05-16T01:00:00.000Z",
    },
    quiz_empty: {
      quizId: "quiz_empty",
      answers: {},
      markedQuestionIds: [],
      retryQuestionIds: [],
      questionFilter: "all",
      practiceMode: "quiz",
      targetMinutes: 10,
      elapsedSeconds: 0,
      updatedAt: "2026-05-16T02:00:00.000Z",
    },
  })

  assert.equal(summary.count, 1)
  assert.deepEqual(summary.quizIds, ["quiz_math"])
  assert.equal(summary.latestAt, "2026-05-16T01:00:00.000Z")
})

test("practice draft cards sort recent work and show useful counts", () => {
  const cards = listPracticeDraftCards({
    quiz_old: {
      quizId: "quiz_old",
      answers: { q1: "a" },
      markedQuestionIds: [],
      retryQuestionIds: [],
      questionFilter: "all",
      practiceMode: "quiz",
      targetMinutes: 10,
      elapsedSeconds: 20,
      updatedAt: "2026-05-16T01:00:00.000Z",
    },
    quiz_new: {
      quizId: "quiz_new",
      answers: { q1: "a", q2: "b" },
      markedQuestionIds: ["q2"],
      retryQuestionIds: ["q3"],
      questionFilter: "marked",
      practiceMode: "mistake-retry",
      targetMinutes: 10,
      elapsedSeconds: 80,
      updatedAt: "2026-05-16T02:00:00.000Z",
    },
  }, { quiz_new: "New quiz" })

  assert.equal(cards[0].quizId, "quiz_new")
  assert.equal(cards[0].title, "New quiz")
  assert.equal(cards[0].answeredCount, 2)
  assert.equal(cards[0].markedCount, 1)
  assert.equal(cards[0].retryCount, 1)
  assert.equal(cards[1].title, "Saved practice")
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
