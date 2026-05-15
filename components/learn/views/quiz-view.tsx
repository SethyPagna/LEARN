"use client"

import { useEffect, useState } from "react"
import { Clock, RotateCcw } from "lucide-react"
import type { WorkspaceOptions } from "../preferences"
import type { Quiz } from "../types"
import { api } from "../api"
import { EmptyState, Panel } from "../ui"

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
  const selected = selectedQuizId || quizzes[0]?.id

  useEffect(() => {
    if (!selected) return
    api<{ item: Quiz }>(`/api/quizzes/${selected}`).then((response) => {
      setQuiz(response.item)
      setAnswers({})
      setResult(null)
      setStartedAt(Date.now())
      setElapsedSeconds(0)
    })
  }, [selected])

  useEffect(() => {
    if (!selectedQuizId && quizzes[0]?.id) setSelectedQuizId(quizzes[0].id)
  }, [quizzes, selectedQuizId, setSelectedQuizId])

  useEffect(() => {
    if (result) return
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [result, startedAt])

  async function submit() {
    if (!quiz) return
    const response = await api<any>("/api/quizzes/attempts", {
      method: "POST",
      body: JSON.stringify({
        quizId: quiz.id,
        answers: Object.entries(answers).map(([questionId, selectedAnswerId]) => ({ questionId, selectedAnswerId })),
        durationSeconds: elapsedSeconds,
      }),
    })
    setResult(response)
  }

  function resetTimer() {
    setStartedAt(Date.now())
    setElapsedSeconds(0)
  }

  const remainingSeconds = Math.max(0, targetMinutes * 60 - elapsedSeconds)
  const elapsedLabel = formatDuration(elapsedSeconds)
  const remainingLabel = formatDuration(remainingSeconds)

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
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground">Mode: {options.quizMode}</span>
              <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground">{options.revealAnswers ? "Answers reveal after selection" : "Exam-style hidden answers"}</span>
              <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-muted-foreground"><Clock className="h-3.5 w-3.5" /> {elapsedLabel} elapsed</span>
              <span className={`rounded-md px-2 py-1 ${remainingSeconds === 0 ? "bg-destructive text-destructive-foreground" : "bg-muted text-muted-foreground"}`}>{remainingLabel} left</span>
            </div>
            <QuizTimerControls targetMinutes={targetMinutes} elapsedSeconds={elapsedSeconds} remainingSeconds={remainingSeconds} resetTimer={resetTimer} setTargetMinutes={setTargetMinutes} />
            <div className="mt-5 space-y-3">
              {quiz.questions?.map((question, index) => (
                <article key={question.id} className="rounded-lg border border-border p-4">
                  <p className="text-sm text-muted-foreground">Question {index + 1}</p>
                  <h3 className="mt-1 font-semibold text-foreground">{question.question}</h3>
                  <div className="mt-4 grid gap-2 md:grid-cols-2">
                    {question.choices.map((choice) => (
                      <button
                        key={choice.id}
                        onClick={() => setAnswers({ ...answers, [question.id]: choice.id })}
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
              ))}
            </div>
            {result ? <p className="mt-4 rounded-md bg-accent p-3 font-semibold text-accent-foreground">Score: {result.score} / {result.total} - Duration: {formatDuration(result.durationSeconds || elapsedSeconds)}</p> : null}
            <button onClick={submit} className="mt-4 rounded-md bg-success px-4 py-2 text-sm font-semibold text-success-foreground">Submit attempt</button>
          </>
        ) : (
          <>
            <QuizTimerControls targetMinutes={targetMinutes} elapsedSeconds={elapsedSeconds} remainingSeconds={remainingSeconds} resetTimer={resetTimer} setTargetMinutes={setTargetMinutes} />
            <EmptyState title="No quiz selected" body="Choose a quiz bank to start practice." />
          </>
        )}
      </Panel>
    </div>
  )
}

function QuizTimerControls({
  elapsedSeconds,
  remainingSeconds,
  resetTimer,
  setTargetMinutes,
  targetMinutes,
}: {
  elapsedSeconds: number
  remainingSeconds: number
  resetTimer: () => void
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
    </div>
  )
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}
