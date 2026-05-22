import assert from "node:assert/strict"
import test from "node:test"
import type { QuizQuestion } from "../components/learn/types"
import { hasPracticeDraftContent, listPracticeDraftCards, normalizePracticeDraft, summarizePracticeDrafts } from "../lib/practice-drafts"
import { buildGameRunActions, buildMistakeRetrySet, buildPracticeGameModes, buildPracticeLiveJoinCard, buildPracticePlayStyles, buildPracticeReviewCards, buildPracticeReviewPlan, buildPracticeRunActions, buildPracticeSessionSummary, buildPracticeWorkspacePlan, evaluateGameChoice, filterPracticeQuestions, getPracticeModeGroup, practiceModeGroups, practiceModeLabel, summarizeGameRun, summarizePracticeAttempt, summarizePracticeMode } from "../lib/practice-features"

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

test("practice workspace plan turns quiz state into friendly next actions", () => {
  const plan = buildPracticeWorkspacePlan({
    activeTarget: "quizzes",
    quizCount: 3,
    draftCount: 2,
    answeredDraftCount: 4,
    markedDraftCount: 1,
    retryDraftCount: 2,
  })

  assert.equal(plan.primaryAction.id, "resume")
  assert.equal(plan.headline, "Continue where you stopped")
  assert.deepEqual(plan.signals.map((signal) => signal.value), ["3", "2", "4", "3"])
  assert.deepEqual(plan.actions.map((action) => action.id), ["resume", "careful", "speed", "repair", "create"])

  const emptyPlan = buildPracticeWorkspacePlan({ activeTarget: "games", quizCount: 0 })
  assert.equal(emptyPlan.primaryAction.id, "create")
  assert.match(emptyPlan.caption, /Practice works best/)
})

test("practice play styles map popular product patterns to clean targets", () => {
  const ready = buildPracticePlayStyles({ hasQuizBanks: true })
  const drafts = buildPracticePlayStyles({ draftCount: 2, hasQuizBanks: true })
  const repair = buildPracticePlayStyles({ hasQuizBanks: true, markedCount: 1, retryCount: 2 })
  const empty = buildPracticePlayStyles({ hasQuizBanks: false })

  assert.deepEqual(ready.map((style) => style.model), ["Kahoot style", "Quizlet style", "Quizizz style", "Blooket style", "Gimkit style"])
  assert.equal(ready.find((style) => style.id === "live")?.recommended, true)
  assert.equal(drafts.find((style) => style.id === "study")?.recommended, true)
  assert.equal(repair.find((style) => style.id === "assessment")?.badge, "Repair")
  assert.equal(empty.find((style) => style.id === "strategy")?.recommended, true)
  assert.equal(empty.find((style) => style.id === "arcade")?.target, "games")
})

test("practice live join card creates Kahoot-style ready and generation states", () => {
  const ready = buildPracticeLiveJoinCard({ quizCount: 4, draftCount: 1, answeredDraftCount: 3, markedDraftCount: 1, retryDraftCount: 2, seed: "quiz_a" })
  const empty = buildPracticeLiveJoinCard({ quizCount: 0, seed: "quiz_a" })

  assert.match(ready.pin, /^\d{6}$/)
  assert.equal(ready.ready, true)
  assert.equal(ready.primaryAction, "speed")
  assert.deepEqual(ready.stats.map((stat) => stat.value), ["4", "1", "3", "3"])
  assert.deepEqual(ready.scoringRules.map((rule) => rule.label), ["Points", "Speed", "Accuracy"])
  assert.equal(empty.ready, false)
  assert.equal(empty.primaryAction, "create")
  assert.match(empty.caption, /Generate practice/)
})

test("practice game modes expose familiar quiz and game loops", () => {
  const ready = buildPracticeGameModes({ hasQuizBanks: true })
  const drafts = buildPracticeGameModes({ draftCount: 1, hasQuizBanks: true })
  const repair = buildPracticeGameModes({ hasQuizBanks: true, markedCount: 1 })
  const empty = buildPracticeGameModes({ hasQuizBanks: false })

  assert.deepEqual(ready.map((mode) => mode.label), ["Classic", "Team race", "Match", "Redemption", "Arcade quest", "Economy battle"])
  assert.equal(ready.find((mode) => mode.id === "classic")?.recommended, true)
  assert.equal(drafts.find((mode) => mode.id === "match")?.recommended, true)
  assert.equal(repair.find((mode) => mode.id === "redemption")?.practiceMode, "mistake-retry")
  assert.equal(empty.find((mode) => mode.id === "economy")?.recommended, true)
  assert.equal(empty.find((mode) => mode.id === "classic")?.badge, "Needs bank")
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

test("practice run actions explain disabled and busy states", () => {
  const initialActions = buildPracticeRunActions({ hasQuiz: true })
  const completedActions = buildPracticeRunActions({ hasAttempt: true, hasQuiz: true, missedCount: 2, retryActive: true })
  const busyActions = buildPracticeRunActions({ busyAction: "save-review-cards", hasAttempt: true, hasQuiz: true, missedCount: 2 })

  assert.equal(initialActions.find((action) => action.id === "submit")?.disabled, false)
  assert.equal(initialActions.find((action) => action.id === "retry-missed")?.disabled, true)
  assert.equal(completedActions.find((action) => action.id === "save-review-cards")?.disabled, false)
  assert.equal(completedActions.find((action) => action.id === "full-set")?.disabled, false)
  assert.equal(busyActions.find((action) => action.id === "save-review-cards")?.busy, true)
  assert.equal(busyActions.every((action) => action.disabled), true)
})

test("practice session summary keeps progress timer and drafts compact", () => {
  const summary = buildPracticeSessionSummary({
    answeredCount: 5,
    draftStatus: "Draft saved at 2:00.",
    elapsedLabel: "2:00",
    markedCount: 1,
    progressPercent: 50,
    remainingLabel: "8:00",
    remainingSeconds: 480,
    revealAnswers: true,
    totalCount: 10,
  })
  const complete = buildPracticeSessionSummary({
    answeredCount: 12,
    elapsedLabel: "12:00",
    markedCount: 0,
    progressPercent: 150,
    remainingLabel: "0:00",
    remainingSeconds: 0,
    revealAnswers: false,
    totalCount: 10,
  })

  assert.equal(summary.answeredLabel, "5/10")
  assert.equal(summary.statusLabel, "1 marked")
  assert.equal(summary.statusTone, "watch")
  assert.equal(summary.draftLabel, "Draft saved at 2:00.")
  assert.equal(complete.answeredLabel, "10/10")
  assert.equal(complete.progressPercent, 100)
  assert.equal(complete.timerTone, "critical")
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

test("game run actions gate next and finish states", () => {
  const waitingActions = buildGameRunActions({ hasFeedback: false })
  const nextActions = buildGameRunActions({ hasFeedback: true })
  const finishActions = buildGameRunActions({ hasFeedback: true, isLastPrompt: true, busyAction: "finish-run" })

  assert.equal(waitingActions.find((action) => action.id === "next-prompt")?.disabled, true)
  assert.equal(nextActions.find((action) => action.id === "next-prompt")?.disabled, false)
  assert.equal(finishActions.find((action) => action.id === "finish-run")?.busy, true)
  assert.equal(finishActions.every((action) => action.disabled), true)
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
