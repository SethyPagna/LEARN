"use client"

import { useEffect, useMemo, useState } from "react"
import { CheckCircle2, ChevronDown, Clock, Flag, ListFilter, MoreHorizontal, Pause, Play, RotateCcw, Sparkles, XCircle } from "lucide-react"
import type { WorkspaceOptions } from "../preferences"
import type { PracticeAttemptSummary, PracticeMode, Quiz } from "../types"
import { api } from "../api"
import { ControlButton, EmptyState, Panel, StatusPill } from "../ui"
import { menuSurfaceClasses, toneTextClasses } from "@/lib/design-system"
import { clearPracticeDraft, hasPracticeDraftContent, readPracticeDraft, writePracticeDraft } from "@/lib/practice-drafts"
import { buildMistakeRetrySet, buildPracticeReviewCards, buildPracticeReviewPlan, filterPracticeQuestions, practiceModeGroups, practiceModeLabel, summarizePracticeAttempt, summarizePracticeMode, type PracticeQuestionFilter } from "@/lib/practice-features"

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
  const [result, setResult] = useState<any>(null)
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
  const selected = selectedQuizId || quizzes[0]?.id
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
    if (!selectedQuizId && quizzes[0]?.id) setSelectedQuizId(quizzes[0].id)
  }, [quizzes, selectedQuizId, setSelectedQuizId])

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
    if (!quiz) return
    const durationSeconds = paused ? elapsedSeconds : currentElapsedSeconds(startedAt)
    const submittedAnswers = Object.entries(answers).map(([questionId, selectedAnswerId]) => ({ questionId, selectedAnswerId }))
    const summary = summarizePracticeAttempt({
      mode: practiceMode,
      questions: visibleQuestions,
      answers: submittedAnswers,
      durationSeconds,
    })
    const response = await api<any>("/api/quizzes/attempts", {
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
    clearPracticeDraft(quiz.id)
    setDraftStatus("Attempt submitted. Draft cleared.")
  }

  function discardDraft() {
    if (!quiz) return
    clearPracticeDraft(quiz.id)
    setAnswers({})
    setRetryQuestionIds([])
    setMarkedQuestionIds([])
    setQuestionFilter("all")
    setPracticeMode(defaultPracticeMode)
    resetTimer()
    setDraftStatus("Draft cleared.")
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
    if (!attemptSummary?.missedQuestionIds.length) return
    setRetryQuestionIds(attemptSummary.missedQuestionIds)
    setMarkedQuestionIds(attemptSummary.missedQuestionIds)
    setQuestionFilter("all")
    setAnswers({})
    setResult(null)
    setAttemptSummary(null)
    setPracticeMode("mistake-retry")
    resetTimer()
  }

  async function saveMissesToReviews() {
    if (!quiz || !attemptSummary?.missedQuestionIds.length) return
    const items = buildPracticeReviewCards({
      quizId: quiz.id,
      quizTitle: quiz.title,
      questions: visibleQuestions,
      missedQuestionIds: attemptSummary.missedQuestionIds,
    })
    if (!items.length) return
    setReviewCardStatus("Saving review cards...")
    const response = await api<{ item: { count: number } }>("/api/reviews", {
      method: "POST",
      body: JSON.stringify({ items }),
    })
    setReviewCardStatus(`Saved ${response.item.count} review cards.`)
  }

  const remainingSeconds = Math.max(0, targetMinutes * 60 - elapsedSeconds)
  const elapsedLabel = formatDuration(elapsedSeconds)
  const remainingLabel = formatDuration(remainingSeconds)
  const answeredCount = answeredQuestionIds.filter((id) => visibleQuestions.some((question) => question.id === id)).length
  const progressPercent = visibleQuestions.length ? Math.round((answeredCount / visibleQuestions.length) * 100) : 0
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

  return (
    <div className="grid gap-4 xl:grid-cols-[300px_1fr]">
      <Panel className="p-3">
        <details open>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-md bg-secondary px-3 py-2 text-sm font-semibold text-secondary-foreground xl:hidden">
            Quiz bank
            <ChevronDown className="h-4 w-4" />
          </summary>
          <div className="mt-2 xl:mt-0">
            {quizzes.map((item) => (
              <button
                key={item.id}
                onClick={() => setSelectedQuizId(item.id)}
                className={`mb-2 w-full rounded-md p-3 text-left ${selected === item.id ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-accent hover:text-accent-foreground"}`}
              >
                <p className="font-semibold">{item.title}</p>
                <p className="mt-1 text-sm opacity-70">{item.question_count || 0} questions</p>
              </button>
            ))}
          </div>
        </details>
      </Panel>
      <Panel className="p-4">
        {quiz ? (
          <>
            <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-start">
              <div>
                <h2 className="text-2xl font-semibold text-foreground">{quiz.title}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{quiz.description}</p>
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
                <ControlButton onClick={submit} active size="compact">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Submit
                </ControlButton>
              </div>
            </div>
            <PracticeProgressBar
              answeredCount={answeredCount}
              draftStatus={draftStatus}
              elapsedLabel={elapsedLabel}
              markedCount={markedQuestionIds.length}
              onClearDraft={discardDraft}
              progressPercent={progressPercent}
              revealAnswers={options.revealAnswers}
              remainingLabel={remainingLabel}
              remainingSeconds={remainingSeconds}
              totalCount={visibleQuestions.length}
            />
            <QuizTimerControls paused={paused} setPaused={setPracticePaused} targetMinutes={targetMinutes} elapsedSeconds={elapsedSeconds} remainingSeconds={remainingSeconds} resetTimer={resetTimer} setTargetMinutes={setTargetMinutes} />
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
                      <div className="flex flex-wrap gap-2 md:col-span-2">
                        {reviewPlan.weakTopics.map((topic) => (
                          <StatusPill key={topic.topic} label={`${topic.topic}: ${topic.missed}`} tone="watch" />
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <ControlButton onClick={retryMissed} disabled={!attemptSummary.missedQuestionIds.length} size="compact">Retry missed</ControlButton>
                  <ControlButton onClick={saveMissesToReviews} disabled={!attemptSummary.missedQuestionIds.length} size="compact">Save review cards</ControlButton>
                  <ControlButton onClick={() => setRetryQuestionIds([])} size="compact">Full set</ControlButton>
                </div>
                {reviewCardStatus ? <p className="mt-2 rounded-md bg-background px-3 py-2 text-xs font-semibold text-foreground">{reviewCardStatus}</p> : null}
              </div>
            ) : null}
          </>
        ) : (
          <>
            <QuizTimerControls paused={paused} setPaused={setPracticePaused} targetMinutes={targetMinutes} elapsedSeconds={elapsedSeconds} remainingSeconds={remainingSeconds} resetTimer={resetTimer} setTargetMinutes={setTargetMinutes} />
            <EmptyState title="No quiz selected" body="Choose a quiz bank to start practice." />
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
  answeredCount,
  draftStatus,
  elapsedLabel,
  markedCount,
  onClearDraft,
  progressPercent,
  revealAnswers,
  remainingLabel,
  remainingSeconds,
  totalCount,
}: {
  answeredCount: number
  draftStatus: string
  elapsedLabel: string
  markedCount: number
  onClearDraft: () => void
  progressPercent: number
  revealAnswers: boolean
  remainingLabel: string
  remainingSeconds: number
  totalCount: number
}) {
  return (
    <div className="mt-4 rounded-md border border-border bg-card p-3">
      <div className="grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-5">
        <PracticeStat label="Answered" value={`${answeredCount}/${totalCount}`} />
        <PracticeStat label="Marked" value={String(markedCount)} />
        <PracticeStat label="Mode" value={revealAnswers ? "Guided" : "Exam"} />
        <PracticeStat label="Elapsed" value={elapsedLabel} />
        <PracticeStat label="Left" value={remainingLabel} tone={remainingSeconds === 0 ? "danger" : "neutral"} />
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progressPercent}%` }} />
      </div>
      {draftStatus ? (
        <ControlButton onClick={onClearDraft} className="mt-3" size="compact">
          {draftStatus} Clear
        </ControlButton>
      ) : null}
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
    <details className="mt-4 rounded-md border border-border bg-card p-2">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        <span className="flex items-center gap-2">
          <Clock className="h-3.5 w-3.5" />
          Timer
          <span className="normal-case tracking-normal text-foreground">{formatDuration(elapsedSeconds)} elapsed</span>
          <span className={remainingSeconds === 0 ? "normal-case tracking-normal text-destructive" : "normal-case tracking-normal"}>{formatDuration(remainingSeconds)} left</span>
        </span>
        <ChevronDown className="h-3.5 w-3.5" />
      </summary>
      <div className="mt-3 flex flex-wrap items-center gap-2">
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
        <ControlButton onClick={resetTimer} className="ml-auto" size="compact">
          <RotateCcw className="h-3.5 w-3.5" />
          Reset
        </ControlButton>
        <ControlButton onClick={() => setPaused(!paused)} size="compact">
          {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          {paused ? "Resume" : "Pause"}
        </ControlButton>
      </div>
    </details>
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
