"use client"

import { useEffect, useMemo, useState } from "react"
import { CheckCircle2, ChevronDown, Clock, Flag, Info, ListFilter, MoreHorizontal, Pause, Play, RotateCcw, Sparkles, Trash2, XCircle } from "lucide-react"
import type { WorkspaceOptions } from "../preferences"
import type { PracticeAttemptSummary, PracticeMode, Quiz, QuizAttemptResult } from "../types"
import { api } from "../api"
import { ControlButton, EmptyState, Panel, StatusPill } from "../ui"
import { menuSurfaceClasses, toneTextClasses } from "@/lib/design-system"
import { clearPracticeDraft, hasPracticeDraftContent, readPracticeDraft, writePracticeDraft } from "@/lib/practice-drafts"
import { buildMistakeRetrySet, buildPracticeReviewCards, buildPracticeReviewPlan, buildPracticeRunActions, buildPracticeSessionSummary, filterPracticeQuestions, practiceModeGroups, practiceModeLabel, summarizePracticeAttempt, summarizePracticeMode, type PracticeQuestionFilter, type PracticeRunActionId, type PracticeSessionSummary } from "@/lib/practice-features"

const questionFilters: Array<{ id: PracticeQuestionFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "unanswered", label: "Unanswered" },
  { id: "marked", label: "Marked" },
  { id: "missed", label: "Missed" },
]

export function QuizView({
  quizzes,
  selectedQuizId,
  setSelectedQuizId,
  options,
}: {
  quizzes: Quiz[]
  selectedQuizId: string
  setSelectedQuizId: (id: string) => void
  options: WorkspaceOptions
}) {
  const [quiz, setQuiz] = useState<Quiz | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [result, setResult] = useState<QuizAttemptResult | null>(null)
  const [startedAt, setStartedAt] = useState(() => Date.now())
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [targetMinutes, setTargetMinutes] = useState(options.quizMode === "exam" ? 20 : 10)
  const [paused, setPaused] = useState(false)
  const [practiceMode, setPracticeMode] = useState<PracticeMode>(options.quizMode === "exam" ? "exam" : "quiz")
  const [attemptSummary, setAttemptSummary] = useState<PracticeAttemptSummary | null>(null)
  const [retryQuestionIds, setRetryQuestionIds] = useState<string[]>([])
  const [markedQuestionIds, setMarkedQuestionIds] = useState<string[]>([])
  const [questionFilter, setQuestionFilter] = useState<PracticeQuestionFilter>("all")
  const [reviewCardStatus, setReviewCardStatus] = useState("")
  const [draftStatus, setDraftStatus] = useState("")
  const [practiceAction, setPracticeAction] = useState<PracticeRunActionId | null>(null)
  const [practiceStatus, setPracticeStatus] = useState("")
  const [archivedQuizIds, setArchivedQuizIds] = useState<string[]>([])
  const visibleQuizBank = useMemo(() => quizzes.filter((item) => !archivedQuizIds.includes(item.id)), [archivedQuizIds, quizzes])
  const selected = selectedQuizId && visibleQuizBank.some((item) => item.id === selectedQuizId) ? selectedQuizId : visibleQuizBank[0]?.id
  const defaultPracticeMode: PracticeMode = options.quizMode === "exam" ? "exam" : "quiz"
  const visibleQuestions = useMemo(() => {
    const questions = quiz?.questions || []
    return retryQuestionIds.length ? buildMistakeRetrySet(questions, retryQuestionIds) : questions
  }, [quiz?.questions, retryQuestionIds])
  const answeredQuestionIds = useMemo(() => Object.keys(answers), [answers])
  const filteredQuestions = useMemo(() => filterPracticeQuestions(visibleQuestions, {
    filter: questionFilter,
    answeredQuestionIds,
    markedQuestionIds,
    missedQuestionIds: attemptSummary?.missedQuestionIds || retryQuestionIds,
  }), [answeredQuestionIds, attemptSummary?.missedQuestionIds, markedQuestionIds, questionFilter, retryQuestionIds, visibleQuestions])

  useEffect(() => {
    if (!selected) return
    api<{ item: Quiz }>(`/api/quizzes/${selected}`).then((response) => {
      setQuiz(response.item)
      const draft = readPracticeDraft(response.item.id)
      setAnswers(draft?.answers || {})
      setResult(null)
      setAttemptSummary(null)
      setReviewCardStatus("")
      setPracticeAction(null)
      setPracticeStatus("")
      setRetryQuestionIds(draft?.retryQuestionIds || [])
      setMarkedQuestionIds(draft?.markedQuestionIds || [])
      setQuestionFilter(draft?.questionFilter || "all")
      setPracticeMode(draft?.practiceMode || defaultPracticeMode)
      setTargetMinutes(draft?.targetMinutes || (options.quizMode === "exam" ? 20 : 10))
      setStartedAt(Date.now() - (draft?.elapsedSeconds || 0) * 1000)
      setElapsedSeconds(draft?.elapsedSeconds || 0)
      setDraftStatus(draft ? `Restored draft from ${formatDraftTime(draft.updatedAt)}.` : "")
    })
  }, [defaultPracticeMode, options.quizMode, selected])

  useEffect(() => {
    if (!selectedQuizId && visibleQuizBank[0]?.id) setSelectedQuizId(visibleQuizBank[0].id)
  }, [selectedQuizId, setSelectedQuizId, visibleQuizBank])

  useEffect(() => {
    if (result || paused) return
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [paused, result, startedAt])

  const draftElapsedBucket = Math.floor(elapsedSeconds / 10)

  useEffect(() => {
    if (!quiz || result) return
    const elapsed = paused ? elapsedSeconds : currentElapsedSeconds(startedAt)
    const draft = {
      quizId: quiz.id,
      answers,
      markedQuestionIds,
      retryQuestionIds,
      questionFilter,
      practiceMode,
      targetMinutes,
      elapsedSeconds: elapsed,
      updatedAt: new Date().toISOString(),
    }
    if (!hasPracticeDraftContent(draft, defaultPracticeMode)) return
    const timeout = window.setTimeout(() => {
      writePracticeDraft(draft)
      setDraftStatus(`Draft saved at ${formatDuration(elapsed)}.`)
    }, 500)
    return () => window.clearTimeout(timeout)
  }, [answers, defaultPracticeMode, draftElapsedBucket, markedQuestionIds, paused, practiceMode, questionFilter, quiz, result, retryQuestionIds, startedAt, targetMinutes])

  async function submit() {
    if (!quiz || practiceAction) return
    const durationSeconds = paused ? elapsedSeconds : currentElapsedSeconds(startedAt)
    const submittedAnswers = Object.entries(answers).map(([questionId, selectedAnswerId]) => ({ questionId, selectedAnswerId }))
    const summary = summarizePracticeAttempt({
      mode: practiceMode,
      questions: visibleQuestions,
      answers: submittedAnswers,
      durationSeconds,
    })
    setPracticeAction("submit")
    setPracticeStatus("")
    try {
      const response = await api<QuizAttemptResult>("/api/quizzes/attempts", {
        method: "POST",
        body: JSON.stringify({
          quizId: quiz.id,
          answers: submittedAnswers,
          durationSeconds,
        }),
      })
      setElapsedSeconds(durationSeconds)
      setResult(response)
      setAttemptSummary(summary)
      setReviewCardStatus("")
      setPracticeStatus(`Submitted: ${summary.score}/${summary.total}.`)
      clearPracticeDraft(quiz.id)
      setDraftStatus("Attempt submitted. Draft cleared.")
    } catch (error) {
      setPracticeStatus(error instanceof Error ? error.message : "Unable to submit this attempt.")
    } finally {
      setPracticeAction(null)
    }
  }

  function discardDraft() {
    if (!quiz || practiceAction) return
    clearPracticeDraft(quiz.id)
    setAnswers({})
    setRetryQuestionIds([])
    setMarkedQuestionIds([])
    setQuestionFilter("all")
    setPracticeMode(defaultPracticeMode)
    resetTimer()
    setDraftStatus("Draft cleared.")
    setPracticeStatus("")
  }

  function resetTimer() {
    setStartedAt(Date.now())
    setElapsedSeconds(0)
    setPaused(false)
  }

  function setPracticePaused(nextPaused: boolean) {
    if (nextPaused) {
      setElapsedSeconds(currentElapsedSeconds(startedAt))
      setPaused(true)
      return
    }
    setStartedAt(Date.now() - elapsedSeconds * 1000)
    setPaused(false)
  }

  function retryMissed() {
    if (practiceAction || !attemptSummary?.missedQuestionIds.length) return
    setRetryQuestionIds(attemptSummary.missedQuestionIds)
    setMarkedQuestionIds(attemptSummary.missedQuestionIds)
    setQuestionFilter("all")
    setAnswers({})
    setResult(null)
    setAttemptSummary(null)
    setPracticeMode("mistake-retry")
    setReviewCardStatus("")
    setPracticeStatus(`Retrying ${attemptSummary.missedQuestionIds.length} missed questions.`)
    resetTimer()
  }

  async function saveMissesToReviews() {
    if (!quiz || practiceAction || !attemptSummary?.missedQuestionIds.length) return
    const items = buildPracticeReviewCards({
      quizId: quiz.id,
      quizTitle: quiz.title,
      questions: visibleQuestions,
      missedQuestionIds: attemptSummary.missedQuestionIds,
    })
    if (!items.length) {
      setReviewCardStatus("No missed questions are ready for review cards.")
      return
    }
    setPracticeAction("save-review-cards")
    setReviewCardStatus("Saving review cards...")
    try {
      const response = await api<{ item: { count: number } }>("/api/reviews", {
        method: "POST",
        body: JSON.stringify({ items }),
      })
      setReviewCardStatus(`Saved ${response.item.count} review cards.`)
    } catch (error) {
      setReviewCardStatus(error instanceof Error ? error.message : "Unable to save review cards.")
    } finally {
      setPracticeAction(null)
    }
  }

  const remainingSeconds = Math.max(0, targetMinutes * 60 - elapsedSeconds)
  const elapsedLabel = formatDuration(elapsedSeconds)
  const remainingLabel = formatDuration(remainingSeconds)
  const answeredCount = answeredQuestionIds.filter((id) => visibleQuestions.some((question) => question.id === id)).length
  const progressPercent = visibleQuestions.length ? Math.round((answeredCount / visibleQuestions.length) * 100) : 0
  const sessionSummary = useMemo(() => buildPracticeSessionSummary({
    answeredCount,
    draftStatus,
    elapsedLabel,
    markedCount: markedQuestionIds.length,
    progressPercent,
    remainingLabel,
    remainingSeconds,
    revealAnswers: options.revealAnswers,
    totalCount: visibleQuestions.length,
  }), [answeredCount, draftStatus, elapsedLabel, markedQuestionIds.length, options.revealAnswers, progressPercent, remainingLabel, remainingSeconds, visibleQuestions.length])
  const missedCount = attemptSummary?.missedQuestionIds.length || 0
  const modeSummary = summarizePracticeMode({
    mode: practiceMode,
    missedCount,
    answeredCount,
    totalCount: visibleQuestions.length,
  })
  const reviewPlan = useMemo(() => (
    attemptSummary ? buildPracticeReviewPlan({ summary: attemptSummary, questions: visibleQuestions }) : null
  ), [attemptSummary, visibleQuestions])
  const runActions = useMemo(() => buildPracticeRunActions({
    busyAction: practiceAction,
    hasAttempt: Boolean(attemptSummary),
    hasQuiz: Boolean(quiz && visibleQuestions.length),
    missedCount,
    retryActive: retryQuestionIds.length > 0,
  }), [attemptSummary, missedCount, practiceAction, quiz, retryQuestionIds.length, visibleQuestions.length])
  const runActionById = useMemo(() => new Map(runActions.map((action) => [action.id, action])), [runActions])

  function toggleMarked(questionId: string) {
    setMarkedQuestionIds((current) => (
      current.includes(questionId) ? current.filter((id) => id !== questionId) : [...current, questionId]
    ))
  }

  function clearAnswer(questionId: string) {
    setAnswers((current) => {
      const next = { ...current }
      delete next[questionId]
      return next
    })
  }

  async function archiveCurrentQuiz() {
    if (!quiz || practiceAction) return
    if (!window.confirm(`Archive "${quiz.title}"? Existing attempts stay saved, but this set leaves active practice.`)) return
    setPracticeAction("submit")
    setPracticeStatus("Archiving practice set...")
    try {
      await api(`/api/quizzes/${quiz.id}`, { method: "DELETE" })
      setArchivedQuizIds((current) => [...new Set([...current, quiz.id])])
      const nextQuiz = visibleQuizBank.find((item) => item.id !== quiz.id)
      setSelectedQuizId(nextQuiz?.id || "")
      setQuiz(null)
      setAttemptSummary(null)
      setPracticeStatus("Practice set archived.")
    } catch (error) {
      setPracticeStatus(error instanceof Error ? error.message : "Unable to archive this practice set.")
    } finally {
      setPracticeAction(null)
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[300px_1fr]">
      <Panel className="p-3">
        <details open>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-md bg-secondary px-3 py-2 text-sm font-semibold text-secondary-foreground xl:hidden">
            Quiz bank
            <ChevronDown className="h-4 w-4" />
          </summary>
          <div className="mt-2 xl:mt-0">
            {visibleQuizBank.map((item) => (
              <button
                key={item.id}
                onClick={() => setSelectedQuizId(item.id)}
                className={`mb-2 w-full rounded-md p-3 text-left ${selected === item.id ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-accent hover:text-accent-foreground"}`}
              >
                <p className="font-semibold">{item.title}</p>
                <p className="mt-1 text-sm opacity-70">{item.question_count || 0} questions</p>
              </button>
            ))}
            {!visibleQuizBank.length ? <EmptyState title="No active practice sets" body="Generate a quiz from Studio or Tutor to practice." /> : null}
          </div>
        </details>
      </Panel>
      <Panel className="p-4">
        {quiz ? (
          <>
            <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-start">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-2xl font-semibold text-foreground">{quiz.title}</h2>
                  <details className="group relative">
                    <summary className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-md border border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground [&::-webkit-details-marker]:hidden" title="About this practice set">
                      <Info className="h-3.5 w-3.5" />
                    </summary>
                    <div className={`absolute left-0 top-9 z-40 w-72 text-sm ${menuSurfaceClasses()}`}>
                      <p className="font-semibold text-popover-foreground">Practice set</p>
                      <p className="mt-1 text-muted-foreground">{quiz.description || "Answer the questions, submit once, then repair missed items."}</p>
                    </div>
                  </details>
                </div>
                <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{visibleQuestions.length} questions - {progressPercent}% complete</p>
              </div>
              <div className="flex flex-wrap gap-2 lg:justify-end">
                <ModeStatusChip label={modeSummary.activeGroup.label} value={modeSummary.activeModeLabel} />
                <PracticeMenu label="Mode" icon={Sparkles}>
                  <PracticeMenuAction icon={Sparkles} label={`Next: ${practiceModeLabel(modeSummary.recommendedNextMode)}`} onClick={() => setPracticeMode(modeSummary.recommendedNextMode)} meta={modeSummary.caption} />
                  {practiceModeGroups.map((group) => (
                    <div key={group.id} className="grid gap-1">
                      <p className="px-2 pt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground first:pt-0">{group.label}</p>
                      {group.modes.map((mode) => (
                        <PracticeMenuAction key={mode} active={practiceMode === mode} icon={CheckCircle2} label={practiceModeLabel(mode)} onClick={() => setPracticeMode(mode)} meta={group.caption} />
                      ))}
                    </div>
                  ))}
                </PracticeMenu>
                <PracticeMenu label="Filters" icon={ListFilter}>
                  {questionFilters.map((filter) => {
                    const count = filter.id === "all"
                      ? visibleQuestions.length
                      : filterPracticeQuestions(visibleQuestions, {
                        filter: filter.id,
                        answeredQuestionIds,
                        markedQuestionIds,
                        missedQuestionIds: attemptSummary?.missedQuestionIds || retryQuestionIds,
                      }).length
                    return (
                      <PracticeMenuAction key={filter.id} active={questionFilter === filter.id} icon={ListFilter} label={filter.label} onClick={() => setQuestionFilter(filter.id)} meta={`${count} question${count === 1 ? "" : "s"}`} />
                    )
                  })}
                </PracticeMenu>
                <PracticeMenu label="Set" icon={MoreHorizontal}>
                  <PracticeMenuAction icon={Trash2} label="Archive set" onClick={archiveCurrentQuiz} meta="Hide from active practice" />
                </PracticeMenu>
                <ControlButton onClick={submit} active size="compact" disabled={runActionById.get("submit")?.disabled}>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {runActionById.get("submit")?.busy ? runActionById.get("submit")?.busyLabel : "Submit"}
                </ControlButton>
              </div>
            </div>
            <PracticeProgressBar
              elapsedSeconds={elapsedSeconds}
              onClearDraft={discardDraft}
              paused={paused}
              resetTimer={resetTimer}
              session={sessionSummary}
              setPaused={setPracticePaused}
              setTargetMinutes={setTargetMinutes}
              targetMinutes={targetMinutes}
            />
            {practiceStatus ? <p className="mt-3 rounded-md bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground">{practiceStatus}</p> : null}
            {missedCount ? <div className="mt-3"><StatusPill label={`${missedCount} to repair`} tone="watch" /></div> : null}
            <div className="mt-5 space-y-3">
              {filteredQuestions.map((question, index) => {
                const marked = markedQuestionIds.includes(question.id)
                return (
                <article key={question.id} className="rounded-lg border border-border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm text-muted-foreground">Question {index + 1}</p>
                      <h3 className="mt-1 font-semibold text-foreground">{question.question}</h3>
                    </div>
                    <PracticeMenu align="right" compact label="Question actions" icon={MoreHorizontal}>
                      <PracticeMenuAction active={marked} icon={Flag} label={marked ? "Unmark" : "Mark for review"} onClick={() => toggleMarked(question.id)} />
                      <PracticeMenuAction disabled={!answers[question.id]} icon={XCircle} label="Clear answer" onClick={() => clearAnswer(question.id)} />
                    </PracticeMenu>
                  </div>
                  <div className="mt-4 grid gap-2 md:grid-cols-2">
                    {question.choices.map((choice) => (
                      <button
                        key={choice.id}
                        onClick={() => setAnswers((current) => ({ ...current, [question.id]: choice.id }))}
                        className={`rounded-md border p-3 text-left text-sm ${
                          answers[question.id] === choice.id ? "border-success bg-accent text-accent-foreground" : "border-border hover:bg-muted"
                        }`}
                      >
                        {choice.text}
                        {options.revealAnswers && answers[question.id] === choice.id ? (
                          <span className="mt-2 block text-xs font-semibold">
                            {choice.id === question.correct_answer_id ? "Correct choice" : "Try reviewing this topic after submit"}
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </article>
              )})}
              {!filteredQuestions.length ? <EmptyState title="No questions in this view" body="Switch filters or clear answers/marks to continue." /> : null}
            </div>
            {attemptSummary ? (
              <div className="mt-4 rounded-md border border-border bg-accent p-3 text-accent-foreground">
                <p className="font-semibold">Score: {attemptSummary.score} / {attemptSummary.total} - Duration: {formatDuration(attemptSummary.durationSeconds)}</p>
                <p className="mt-1 text-sm opacity-80">Next: {attemptSummary.nextAction.replace(/-/g, " ")} {attemptSummary.missedQuestionIds.length ? `- ${attemptSummary.missedQuestionIds.length} missed` : ""}</p>
                {reviewPlan ? (
                  <div className="mt-3 grid gap-2 rounded-md bg-background/90 p-3 text-foreground md:grid-cols-[1fr_auto]">
                    <div>
                      <p className="text-sm font-semibold">Repair plan</p>
                      <p className="mt-1 text-xs text-muted-foreground">{reviewPlan.primaryAction}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 md:justify-end">
                      <StatusPill label={`${reviewPlan.accuracy}% accuracy`} />
                      <StatusPill label={`${reviewPlan.durationMinutes} min`} />
                      <StatusPill label={`${reviewPlan.cardsToCreate} cards`} />
                    </div>
                    {reviewPlan.weakTopics.length ? (
                      <details className="md:col-span-2">
                        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs font-semibold text-muted-foreground [&::-webkit-details-marker]:hidden">
                          <ChevronDown className="h-3.5 w-3.5" />
                          Weak topics
                          <span className="rounded bg-secondary px-1.5 py-0.5 text-secondary-foreground">{reviewPlan.weakTopics.length}</span>
                        </summary>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {reviewPlan.weakTopics.map((topic) => (
                            <StatusPill key={topic.topic} label={`${topic.topic}: ${topic.missed}`} tone="watch" />
                          ))}
                        </div>
                      </details>
                    ) : null}
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <ControlButton onClick={retryMissed} disabled={runActionById.get("retry-missed")?.disabled} size="compact" title={runActionById.get("retry-missed")?.helper}>
                    {runActionById.get("retry-missed")?.busy ? runActionById.get("retry-missed")?.busyLabel : "Retry missed"}
                  </ControlButton>
                  <ControlButton onClick={saveMissesToReviews} disabled={runActionById.get("save-review-cards")?.disabled} size="compact" title={runActionById.get("save-review-cards")?.helper}>
                    {runActionById.get("save-review-cards")?.busy ? runActionById.get("save-review-cards")?.busyLabel : "Save review cards"}
                  </ControlButton>
                  <ControlButton onClick={() => { setRetryQuestionIds([]); setPracticeStatus("Full question set restored.") }} disabled={runActionById.get("full-set")?.disabled} size="compact" title={runActionById.get("full-set")?.helper}>Full set</ControlButton>
                </div>
                {reviewCardStatus ? <p className="mt-2 rounded-md bg-background px-3 py-2 text-xs font-semibold text-foreground">{reviewCardStatus}</p> : null}
              </div>
            ) : null}
          </>
        ) : (
          <>
            <QuizTimerControls paused={paused} setPaused={setPracticePaused} targetMinutes={targetMinutes} elapsedSeconds={elapsedSeconds} remainingSeconds={remainingSeconds} resetTimer={resetTimer} setTargetMinutes={setTargetMinutes} />
            <EmptyState title="No quiz selected" body="Choose a quiz bank to start." />
          </>
        )}
      </Panel>
    </div>
  )
}

function ModeStatusChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-xs font-semibold text-muted-foreground">
      {label}
      <span className="rounded bg-secondary px-1.5 py-0.5 text-secondary-foreground">{value}</span>
    </span>
  )
}

function PracticeProgressBar({
  elapsedSeconds,
  onClearDraft,
  paused,
  resetTimer,
  session,
  setPaused,
  setTargetMinutes,
  targetMinutes,
}: {
  elapsedSeconds: number
  onClearDraft: () => void
  paused: boolean
  resetTimer: () => void
  session: PracticeSessionSummary
  setPaused: (paused: boolean) => void
  setTargetMinutes: (minutes: number) => void
  targetMinutes: number
}) {
  return (
    <div className="mt-4 rounded-md border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{session.answeredLabel} answered</p>
          <p className="truncate text-xs text-muted-foreground">{session.timerLabel}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusPill label={session.statusLabel} tone={session.statusTone} />
          <ControlButton onClick={() => setPaused(!paused)} size="compact">
            {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            {paused ? "Resume" : "Pause"}
          </ControlButton>
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${session.progressPercent}%` }} />
      </div>
      <details className="mt-3 rounded-md border border-border bg-background">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold text-muted-foreground [&::-webkit-details-marker]:hidden">
          <ChevronDown className="h-3.5 w-3.5" />
          Timer, draft, and target
          <span className={`ml-auto rounded-md px-2 py-0.5 ${session.timerTone === "critical" ? "bg-destructive text-destructive-foreground" : "bg-secondary text-secondary-foreground"}`}>{formatDuration(elapsedSeconds)}</span>
        </summary>
        <div className="grid gap-2 border-t border-border p-2 text-xs sm:grid-cols-2 xl:grid-cols-4">
          {session.visibleDetails.map((detail) => (
            <PracticeStat key={detail.label} label={detail.label} value={detail.value} tone={detail.label === "Left" && session.timerTone === "critical" ? "danger" : "neutral"} />
          ))}
        </div>
        <div className="grid gap-2 border-t border-border p-2 lg:grid-cols-[1fr_auto_auto] lg:items-center">
          <span className="truncate rounded-md bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground">{session.draftLabel}</span>
          <div className="flex flex-wrap gap-1.5">
            {[5, 10, 20, 45].map((minutes) => (
              <ControlButton
                key={minutes}
                onClick={() => setTargetMinutes(minutes)}
                active={targetMinutes === minutes}
                size="compact"
              >
                {minutes}m
              </ControlButton>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5 lg:justify-end">
            <ControlButton onClick={resetTimer} size="compact">
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </ControlButton>
            <ControlButton onClick={onClearDraft} size="compact">
              Clear
            </ControlButton>
          </div>
        </div>
      </details>
    </div>
  )
}

function PracticeStat({ label, tone = "neutral", value }: { label: string; tone?: "danger" | "neutral"; value: string }) {
  const valueClass = toneTextClasses(tone === "danger" ? "critical" : "neutral")
  return (
    <div className="rounded-md bg-background px-2.5 py-2">
      <p className="text-[0.66rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
      <p className={`mt-1 truncate font-semibold ${valueClass}`}>{value}</p>
    </div>
  )
}

function PracticeMenu({
  align = "left",
  children,
  compact,
  icon: Icon,
  label,
}: {
  align?: "left" | "right"
  children: React.ReactNode
  compact?: boolean
  icon: React.ComponentType<{ className?: string }>
  label: string
}) {
  return (
    <details className="group relative inline-block">
      <summary className={`flex h-9 cursor-pointer list-none items-center gap-2 rounded-md border border-border bg-secondary px-3 text-xs font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground [&::-webkit-details-marker]:hidden ${compact ? "px-2" : ""}`} title={label}>
        <Icon className="h-3.5 w-3.5" />
        <span className={compact ? "sr-only" : ""}>{label}</span>
        {!compact ? <ChevronDown className="h-3.5 w-3.5 opacity-70" /> : null}
      </summary>
      <div className={`absolute top-10 z-40 max-h-[min(32rem,calc(100vh-8rem))] w-64 overflow-y-auto ${menuSurfaceClasses()} ${align === "right" ? "right-0" : "left-0"}`}>
        {children}
      </div>
    </details>
  )
}

function PracticeMenuAction({
  active,
  disabled,
  icon: Icon,
  label,
  meta,
  onClick,
}: {
  active?: boolean
  disabled?: boolean
  icon: React.ComponentType<{ className?: string }>
  label: string
  meta?: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
        active ? "bg-primary text-primary-foreground" : "text-popover-foreground hover:bg-accent hover:text-accent-foreground"
      }`}
      type="button"
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="min-w-0">
        <span className="block truncate">{label}</span>
        {meta ? <span className={`mt-0.5 block line-clamp-2 text-xs font-medium ${active ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{meta}</span> : null}
      </span>
    </button>
  )
}

function QuizTimerControls({
  elapsedSeconds,
  paused,
  remainingSeconds,
  resetTimer,
  setPaused,
  setTargetMinutes,
  targetMinutes,
}: {
  elapsedSeconds: number
  paused: boolean
  remainingSeconds: number
  resetTimer: () => void
  setPaused: (paused: boolean) => void
  setTargetMinutes: (minutes: number) => void
  targetMinutes: number
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-card p-2">
      <span className="inline-flex h-8 items-center gap-1.5 rounded-md bg-muted px-2 text-xs font-semibold text-muted-foreground">
        <Clock className="h-3.5 w-3.5" />
        {formatDuration(elapsedSeconds)}
      </span>
      <span className={`inline-flex h-8 items-center rounded-md px-2 text-xs font-semibold ${remainingSeconds === 0 ? "bg-destructive text-destructive-foreground" : "bg-muted text-muted-foreground"}`}>
        {formatDuration(remainingSeconds)} left
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        {[5, 10, 20, 45].map((minutes) => (
          <ControlButton
            key={minutes}
            onClick={() => setTargetMinutes(minutes)}
            active={targetMinutes === minutes}
            size="compact"
          >
            {minutes}m
          </ControlButton>
        ))}
      </div>
      <ControlButton onClick={resetTimer} className="ml-auto" size="compact">
        <RotateCcw className="h-3.5 w-3.5" />
        Reset
      </ControlButton>
      <ControlButton onClick={() => setPaused(!paused)} size="compact">
        {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
        {paused ? "Resume" : "Pause"}
      </ControlButton>
    </div>
  )
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

function formatDraftTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "earlier"
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

function currentElapsedSeconds(startedAt: number) {
  return Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
}
