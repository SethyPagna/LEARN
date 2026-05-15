"use client"

import { useEffect, useMemo, useState } from "react"
import { Clock, Flag, Pause, Play, RotateCcw, XCircle } from "lucide-react"
import type { WorkspaceOptions } from "../preferences"
import type { PracticeAttemptSummary, PracticeMode, Quiz } from "../types"
import { api } from "../api"
import { EmptyState, Panel } from "../ui"
import { buildMistakeRetrySet, filterPracticeQuestions, practiceModeLabel, summarizePracticeAttempt, type PracticeQuestionFilter } from "@/lib/practice-features"

const practiceModes: PracticeMode[] = ["quiz", "exam", "flashcards", "matching", "sprint", "mistake-retry", "fill-blank", "true-false", "generated"]
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
  const selected = selectedQuizId || quizzes[0]?.id
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
      setAnswers({})
      setResult(null)
      setAttemptSummary(null)
      setRetryQuestionIds([])
      setMarkedQuestionIds([])
      setQuestionFilter("all")
      setStartedAt(Date.now())
      setElapsedSeconds(0)
    })
  }, [selected])

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

  const remainingSeconds = Math.max(0, targetMinutes * 60 - elapsedSeconds)
  const elapsedLabel = formatDuration(elapsedSeconds)
  const remainingLabel = formatDuration(remainingSeconds)
  const answeredCount = answeredQuestionIds.filter((id) => visibleQuestions.some((question) => question.id === id)).length
  const progressPercent = visibleQuestions.length ? Math.round((answeredCount / visibleQuestions.length) * 100) : 0
  const missedCount = attemptSummary?.missedQuestionIds.length || 0

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
      </Panel>
      <Panel className="p-4">
        {quiz ? (
          <>
            <h2 className="text-2xl font-semibold text-foreground">{quiz.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{quiz.description}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {practiceModes.map((mode) => (
                <button key={mode} onClick={() => setPracticeMode(mode)} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${practiceMode === mode ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground"}`}>
                  {practiceModeLabel(mode)}
                </button>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground">Mode: {practiceModeLabel(practiceMode)}</span>
              <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground">{options.revealAnswers ? "Answers reveal after selection" : "Exam-style hidden answers"}</span>
              <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground">{answeredCount}/{visibleQuestions.length} answered</span>
              <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground">{markedQuestionIds.length} marked</span>
              <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-muted-foreground"><Clock className="h-3.5 w-3.5" /> {elapsedLabel} elapsed</span>
              <span className={`rounded-md px-2 py-1 ${remainingSeconds === 0 ? "bg-destructive text-destructive-foreground" : "bg-muted text-muted-foreground"}`}>{remainingLabel} left</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progressPercent}%` }} />
            </div>
            <QuizTimerControls paused={paused} setPaused={setPracticePaused} targetMinutes={targetMinutes} elapsedSeconds={elapsedSeconds} remainingSeconds={remainingSeconds} resetTimer={resetTimer} setTargetMinutes={setTargetMinutes} />
            <div className="mt-4 flex flex-wrap gap-2 rounded-md border border-border bg-card p-2">
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
                  <button key={filter.id} onClick={() => setQuestionFilter(filter.id)} className={`h-8 rounded-md px-3 text-xs font-semibold ${questionFilter === filter.id ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground"}`}>
                    {filter.label} <span className="opacity-70">{count}</span>
                  </button>
                )
              })}
              {missedCount ? <span className="ml-auto rounded-md bg-warning px-2 py-1 text-xs font-semibold text-warning-foreground">{missedCount} to repair</span> : null}
            </div>
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
                    <div className="flex gap-2">
                      <button onClick={() => toggleMarked(question.id)} className={`flex h-8 items-center gap-1.5 rounded-md border px-2 text-xs font-semibold ${marked ? "border-warning bg-warning text-warning-foreground" : "border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground"}`}>
                        <Flag className="h-3.5 w-3.5" />
                        {marked ? "Marked" : "Mark"}
                      </button>
                      <button onClick={() => clearAnswer(question.id)} disabled={!answers[question.id]} className="flex h-8 items-center gap-1.5 rounded-md border border-border bg-secondary px-2 text-xs font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-50">
                        <XCircle className="h-3.5 w-3.5" />
                        Clear
                      </button>
                    </div>
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
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={retryMissed} disabled={!attemptSummary.missedQuestionIds.length} className="rounded-md bg-background px-3 py-1.5 text-xs font-semibold text-foreground disabled:opacity-50">Retry missed</button>
                  <button onClick={() => setRetryQuestionIds([])} className="rounded-md bg-background px-3 py-1.5 text-xs font-semibold text-foreground">Full set</button>
                </div>
              </div>
            ) : null}
            <button onClick={submit} className="mt-4 rounded-md bg-success px-4 py-2 text-sm font-semibold text-success-foreground">Submit attempt</button>
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
    <div className="mt-4 flex flex-wrap items-center gap-2 rounded-md border border-border bg-card p-2">
      <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">
        <Clock className="h-3.5 w-3.5" />
        {formatDuration(elapsedSeconds)} elapsed
      </span>
      <span className={`rounded-md px-2 py-1 text-xs font-semibold ${remainingSeconds === 0 ? "bg-destructive text-destructive-foreground" : "bg-muted text-muted-foreground"}`}>
        {formatDuration(remainingSeconds)} left
      </span>
      {[5, 10, 20, 45].map((minutes) => (
        <button
          key={minutes}
          onClick={() => setTargetMinutes(minutes)}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold ${targetMinutes === minutes ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground"}`}
        >
          {minutes}m
        </button>
      ))}
      <button onClick={resetTimer} className="ml-auto flex h-8 items-center gap-1.5 rounded-md border border-border bg-secondary px-3 text-xs font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground">
        <RotateCcw className="h-3.5 w-3.5" />
        Reset timer
      </button>
      <button onClick={() => setPaused(!paused)} className="flex h-8 items-center gap-1.5 rounded-md border border-border bg-secondary px-3 text-xs font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground">
        {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
        {paused ? "Resume" : "Pause"}
      </button>
    </div>
  )
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

function currentElapsedSeconds(startedAt: number) {
  return Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
}
