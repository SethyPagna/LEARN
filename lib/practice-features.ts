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

export type PracticeWorkspaceTarget = "quizzes" | "games"
export type PracticeWorkspaceActionId = "resume" | "careful" | "speed" | "repair" | "create"
export type PracticePlayStyleId = "live" | "study" | "assessment" | "arcade" | "strategy"
export type PracticeGameModeId = "classic" | "team-race" | "match" | "redemption" | "arcade-quest" | "economy"

export interface PracticeWorkspaceAction {
  id: PracticeWorkspaceActionId
  label: string
  caption: string
  target: PracticeWorkspaceTarget
  badge: string
}

export interface PracticeWorkspacePlan {
  headline: string
  caption: string
  primaryAction: PracticeWorkspaceAction
  actions: PracticeWorkspaceAction[]
  signals: Array<{ label: string; value: string }>
}

export interface PracticeLiveJoinCard {
  pin: string
  headline: string
  caption: string
  primaryAction: PracticeWorkspaceActionId
  primaryLabel: string
  ready: boolean
  stats: Array<{ label: string; value: string }>
  scoringRules: Array<{ label: string; value: string; detail: string }>
}

export interface PracticePlayStyle {
  id: PracticePlayStyleId
  label: string
  model: string
  detail: string
  badge: string
  target: PracticeWorkspaceTarget
  recommended: boolean
}

export interface PracticeGameMode {
  id: PracticeGameModeId
  label: string
  source: string
  detail: string
  badge: string
  target: PracticeWorkspaceTarget
  practiceMode: PracticeMode
  recommended: boolean
}

export type PracticeRunActionId = "submit" | "retry-missed" | "save-review-cards" | "full-set"

export interface PracticeRunActionState {
  id: PracticeRunActionId
  label: string
  busyLabel: string
  helper: string
  disabled: boolean
  busy: boolean
}

export interface PracticeSessionSummary {
  answeredLabel: string
  draftLabel: string
  progressPercent: number
  statusLabel: string
  statusTone: "critical" | "neutral" | "steady" | "watch"
  timerLabel: string
  timerTone: "critical" | "neutral"
  visibleDetails: Array<{ label: string; value: string }>
}

export type GameRunActionId = "next-prompt" | "finish-run" | "restart"

export interface GameRunActionState {
  id: GameRunActionId
  label: string
  busyLabel: string
  helper: string
  disabled: boolean
  busy: boolean
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

export function buildPracticeRunActions(input: {
  busyAction?: PracticeRunActionId | null
  hasAttempt?: boolean
  hasQuiz?: boolean
  missedCount?: number
  retryActive?: boolean
}): PracticeRunActionState[] {
  const busy = Boolean(input.busyAction)
  const hasMisses = (input.missedCount ?? 0) > 0
  const hasAttempt = Boolean(input.hasAttempt)
  const actions: Array<Omit<PracticeRunActionState, "busy" | "disabled"> & { disabled: boolean }> = [
    {
      id: "submit",
      label: "Submit",
      busyLabel: "Submitting",
      helper: "Score this run and clear the saved draft.",
      disabled: !input.hasQuiz,
    },
    {
      id: "retry-missed",
      label: "Retry missed",
      busyLabel: "Preparing",
      helper: "Start a focused run using only missed questions.",
      disabled: !hasAttempt || !hasMisses,
    },
    {
      id: "save-review-cards",
      label: "Save review cards",
      busyLabel: "Saving",
      helper: "Turn missed questions into scheduled Reviews.",
      disabled: !hasAttempt || !hasMisses,
    },
    {
      id: "full-set",
      label: "Full set",
      busyLabel: "Resetting",
      helper: "Return to every question in the quiz bank.",
      disabled: !input.retryActive,
    },
  ]

  return actions.map((action) => ({
    ...action,
    busy: input.busyAction === action.id,
    disabled: busy || action.disabled,
  }))
}

export function buildPracticeSessionSummary(input: {
  answeredCount: number
  draftStatus?: string
  elapsedLabel: string
  markedCount: number
  progressPercent: number
  remainingLabel: string
  remainingSeconds: number
  revealAnswers: boolean
  totalCount: number
}): PracticeSessionSummary {
  const safeTotal = Math.max(0, input.totalCount)
  const safeAnswered = Math.min(Math.max(0, input.answeredCount), safeTotal)
  const progressPercent = safeTotal ? Math.min(100, Math.max(0, input.progressPercent)) : 0
  const complete = safeTotal > 0 && safeAnswered >= safeTotal
  const outOfTime = input.remainingSeconds === 0
  const statusTone = outOfTime ? "critical" : complete ? "steady" : input.markedCount ? "watch" : "neutral"

  return {
    answeredLabel: `${safeAnswered}/${safeTotal}`,
    draftLabel: input.draftStatus?.trim() || "No local draft",
    progressPercent,
    statusLabel: complete ? "Ready to submit" : input.markedCount ? `${input.markedCount} marked` : input.revealAnswers ? "Guided" : "Exam",
    statusTone,
    timerLabel: `${input.elapsedLabel} elapsed / ${input.remainingLabel} left`,
    timerTone: outOfTime ? "critical" : "neutral",
    visibleDetails: [
      { label: "Elapsed", value: input.elapsedLabel },
      { label: "Left", value: input.remainingLabel },
      { label: "Marked", value: String(input.markedCount) },
      { label: "Answers", value: `${safeAnswered}/${safeTotal}` },
    ],
  }
}

export function buildGameRunActions(input: {
  busyAction?: GameRunActionId | null
  hasFeedback?: boolean
  isComplete?: boolean
  isLastPrompt?: boolean
}): GameRunActionState[] {
  const busy = Boolean(input.busyAction)
  const nextId: GameRunActionId = input.isLastPrompt ? "finish-run" : "next-prompt"
  const actions: Array<Omit<GameRunActionState, "busy" | "disabled"> & { disabled: boolean }> = [
    {
      id: nextId,
      label: input.isLastPrompt ? "Finish run" : "Next prompt",
      busyLabel: input.isLastPrompt ? "Finishing" : "Loading",
      helper: input.isLastPrompt ? "Save this sprint result." : "Move to the next prompt.",
      disabled: !input.hasFeedback || Boolean(input.isComplete),
    },
    {
      id: "restart",
      label: "Restart",
      busyLabel: "Restarting",
      helper: "Start this sprint from the first prompt.",
      disabled: false,
    },
  ]

  return actions.map((action) => ({
    ...action,
    busy: input.busyAction === action.id,
    disabled: busy || action.disabled,
  }))
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

export function buildPracticeWorkspacePlan(input: {
  activeTarget: PracticeWorkspaceTarget
  quizCount: number
  draftCount?: number
  answeredDraftCount?: number
  markedDraftCount?: number
  retryDraftCount?: number
}): PracticeWorkspacePlan {
  const draftCount = input.draftCount ?? 0
  const answeredDraftCount = input.answeredDraftCount ?? 0
  const markedDraftCount = input.markedDraftCount ?? 0
  const retryDraftCount = input.retryDraftCount ?? 0
  const hasDrafts = draftCount > 0
  const hasRepairWork = retryDraftCount > 0 || markedDraftCount > 0
  const hasQuizBanks = input.quizCount > 0

  const resumeAction: PracticeWorkspaceAction = {
    id: "resume",
    label: "Continue",
    caption: "Pick up a saved run without losing answers, marks, or timer progress.",
    target: "quizzes",
    badge: `${draftCount} saved`,
  }
  const carefulAction: PracticeWorkspaceAction = {
    id: "careful",
    label: "Quiz",
    caption: "Work through questions slowly, mark hard ones, then review explanations.",
    target: "quizzes",
    badge: "Accuracy",
  }
  const speedAction: PracticeWorkspaceAction = {
    id: "speed",
    label: "Sprint",
    caption: "Turn the same question banks into a short recall game.",
    target: "games",
    badge: "Speed",
  }
  const repairAction: PracticeWorkspaceAction = {
    id: "repair",
    label: "Fix misses",
    caption: "Return to marked or missed questions before starting something new.",
    target: "quizzes",
    badge: `${Math.max(markedDraftCount, retryDraftCount)} flagged`,
  }
  const createAction: PracticeWorkspaceAction = {
    id: "create",
    label: "Make practice",
    caption: "Use Studio or AI Tutor to generate a quiz, flashcards, or review cards.",
    target: "quizzes",
    badge: "New",
  }

  const actions = [
    ...(hasDrafts ? [resumeAction] : []),
    carefulAction,
    speedAction,
    ...(hasRepairWork ? [repairAction] : []),
    createAction,
  ]

  const primaryAction = hasDrafts
    ? resumeAction
    : hasRepairWork
      ? repairAction
      : !hasQuizBanks
        ? createAction
        : input.activeTarget === "games"
          ? speedAction
          : carefulAction

  return {
    headline: hasDrafts
      ? "Continue where you stopped"
      : hasQuizBanks
        ? "Pick a simple practice path"
        : "Create practice from your learning material",
    caption: hasDrafts
      ? "Saved answers, marks, timers, and retry sets stay available until you submit or clear them."
      : hasQuizBanks
        ? "Choose accuracy first, speed next, or generate practice from Studio when you need new material."
        : "Practice works best after you add notes, docs, or quiz questions.",
    primaryAction,
    actions,
    signals: [
      { label: "Banks", value: String(input.quizCount) },
      { label: "Drafts", value: String(draftCount) },
      { label: "Answered", value: String(answeredDraftCount) },
      { label: "Flagged", value: String(markedDraftCount + retryDraftCount) },
    ],
  }
}

export function buildPracticeLiveJoinCard(input: {
  quizCount: number
  draftCount?: number
  answeredDraftCount?: number
  markedDraftCount?: number
  retryDraftCount?: number
  seed?: string
}): PracticeLiveJoinCard {
  const draftCount = input.draftCount ?? 0
  const answeredDraftCount = input.answeredDraftCount ?? 0
  const flaggedCount = (input.markedDraftCount ?? 0) + (input.retryDraftCount ?? 0)
  const ready = input.quizCount > 0
  const pin = practicePinFromSeed(`${input.seed || "learn"}:${input.quizCount}:${draftCount}:${answeredDraftCount}:${flaggedCount}`)

  return {
    pin,
    headline: ready ? "Live challenge ready" : "Create a live challenge",
    caption: ready
      ? "Start a fast round with points for accuracy, speed, and streaks."
      : "Generate practice from Studio or AI, then launch it as a live game.",
    primaryAction: ready ? "speed" : "create",
    primaryLabel: ready ? "Start live game" : "Generate with AI",
    ready,
    stats: [
      { label: "Banks", value: String(input.quizCount) },
      { label: "Drafts", value: String(draftCount) },
      { label: "Answered", value: String(answeredDraftCount) },
      { label: "Flagged", value: String(flaggedCount) },
    ],
    scoringRules: [
      { label: "Points", value: "1000", detail: "Correct answers earn the base score." },
      { label: "Speed", value: "+300", detail: "Faster correct answers add a time bonus." },
      { label: "Accuracy", value: "x1.5", detail: "Clean streaks multiply the final round score." },
    ],
  }
}

function practicePinFromSeed(seed: string) {
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0
  }
  return String((hash % 900000) + 100000)
}

export function buildPracticePlayStyles(input: {
  draftCount?: number
  hasQuizBanks?: boolean
  markedCount?: number
  retryCount?: number
}): PracticePlayStyle[] {
  const hasDrafts = (input.draftCount ?? 0) > 0
  const hasRepairWork = (input.markedCount ?? 0) + (input.retryCount ?? 0) > 0
  const hasQuizBanks = Boolean(input.hasQuizBanks)

  return [
    {
      id: "live",
      label: "Live quiz",
      model: "Kahoot style",
      detail: "Fast host-led rounds, clear choices, and visible progress.",
      badge: hasQuizBanks ? "Ready" : "Needs quiz",
      target: "quizzes",
      recommended: hasQuizBanks && !hasDrafts && !hasRepairWork,
    },
    {
      id: "study",
      label: "Study tools",
      model: "Quizlet style",
      detail: "Flashcards, matching, learn mode, and steady recall.",
      badge: hasDrafts ? "Resume" : "Memory",
      target: "quizzes",
      recommended: hasDrafts,
    },
    {
      id: "assessment",
      label: "Assessment",
      model: "Quizizz style",
      detail: "Exam timing, explanations, retry missed, and mastery checks.",
      badge: hasRepairWork ? "Repair" : "Mastery",
      target: "quizzes",
      recommended: hasRepairWork,
    },
    {
      id: "arcade",
      label: "Arcade",
      model: "Blooket style",
      detail: "Playful review with short rounds and immediate feedback.",
      badge: "Fun",
      target: "games",
      recommended: false,
    },
    {
      id: "strategy",
      label: "Strategy",
      model: "Gimkit style",
      detail: "Score economy, streak pressure, team modes, and rematches.",
      badge: "Team",
      target: "games",
      recommended: !hasQuizBanks,
    },
  ]
}

export function buildPracticeGameModes(input: {
  draftCount?: number
  hasQuizBanks?: boolean
  markedCount?: number
  retryCount?: number
}): PracticeGameMode[] {
  const hasDrafts = (input.draftCount ?? 0) > 0
  const hasRepairWork = (input.markedCount ?? 0) + (input.retryCount ?? 0) > 0
  const hasQuizBanks = Boolean(input.hasQuizBanks)

  return [
    {
      id: "classic",
      label: "Classic",
      source: "Kahoot",
      detail: "Clear choices, fast feedback, and a visible score loop.",
      badge: hasQuizBanks ? "Ready" : "Needs bank",
      target: "quizzes",
      practiceMode: "quiz",
      recommended: hasQuizBanks && !hasDrafts && !hasRepairWork,
    },
    {
      id: "team-race",
      label: "Team race",
      source: "Quizlet Live",
      detail: "Collaborative recall with shared pressure and quick rounds.",
      badge: "Group",
      target: "games",
      practiceMode: "sprint",
      recommended: false,
    },
    {
      id: "match",
      label: "Match",
      source: "Quizlet",
      detail: "Pair terms and answers for fast memory warmups.",
      badge: hasDrafts ? "Resume" : "Memory",
      target: "quizzes",
      practiceMode: "matching",
      recommended: hasDrafts,
    },
    {
      id: "redemption",
      label: "Redemption",
      source: "Quizizz",
      detail: "Retry misses with explanations before the final score.",
      badge: hasRepairWork ? "Misses" : "Repair",
      target: "quizzes",
      practiceMode: "mistake-retry",
      recommended: hasRepairWork,
    },
    {
      id: "arcade-quest",
      label: "Arcade quest",
      source: "Blooket",
      detail: "Short playful runs where correct answers unlock momentum.",
      badge: "Fun",
      target: "games",
      practiceMode: "sprint",
      recommended: false,
    },
    {
      id: "economy",
      label: "Economy battle",
      source: "Gimkit",
      detail: "Streaks, multipliers, and strategic rematches for high-energy review.",
      badge: hasQuizBanks ? "Power" : "Create first",
      target: "games",
      practiceMode: "sprint",
      recommended: !hasQuizBanks,
    },
  ]
}

export function practiceModeLabel(mode: PracticeMode) {
  return mode.split("-").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ")
}
