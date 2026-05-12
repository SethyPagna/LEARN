"use client"

import { useEffect, useState } from "react"
import type { Quiz } from "../types"
import { api } from "../api"
import { EmptyState, Panel } from "../ui"

export function QuizView({
  quizzes,
  selectedQuizId,
  setSelectedQuizId,
}: {
  quizzes: Quiz[]
  selectedQuizId: string
  setSelectedQuizId: (id: string) => void
}) {
  const [quiz, setQuiz] = useState<Quiz | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [result, setResult] = useState<any>(null)
  const selected = selectedQuizId || quizzes[0]?.id

  useEffect(() => {
    if (!selected) return
    api<{ item: Quiz }>(`/api/quizzes/${selected}`).then((response) => {
      setQuiz(response.item)
      setAnswers({})
      setResult(null)
    })
  }, [selected])

  async function submit() {
    if (!quiz) return
    const response = await api<any>("/api/quizzes/attempts", {
      method: "POST",
      body: JSON.stringify({
        quizId: quiz.id,
        answers: Object.entries(answers).map(([questionId, selectedAnswerId]) => ({ questionId, selectedAnswerId })),
      }),
    })
    setResult(response)
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[300px_1fr]">
      <Panel className="p-3">
        {quizzes.map((item) => (
          <button
            key={item.id}
            onClick={() => setSelectedQuizId(item.id)}
            className={`mb-2 w-full rounded-md p-3 text-left ${selected === item.id ? "bg-[#17202a] text-white" : "bg-[#f2f5f8] text-[#17202a] hover:bg-[#e9edf2]"}`}
          >
            <p className="font-semibold">{item.title}</p>
            <p className="mt-1 text-sm opacity-70">{item.question_count || 0} questions</p>
          </button>
        ))}
      </Panel>
      <Panel className="p-4">
        {quiz ? (
          <>
            <h2 className="text-2xl font-semibold text-[#17202a]">{quiz.title}</h2>
            <p className="mt-2 text-sm text-[#5e6a78]">{quiz.description}</p>
            <div className="mt-5 space-y-3">
              {quiz.questions?.map((question, index) => (
                <article key={question.id} className="rounded-lg border border-[#e4e8ee] p-4">
                  <p className="text-sm text-[#697586]">Question {index + 1}</p>
                  <h3 className="mt-1 font-semibold text-[#17202a]">{question.question}</h3>
                  <div className="mt-4 grid gap-2 md:grid-cols-2">
                    {question.choices.map((choice) => (
                      <button
                        key={choice.id}
                        onClick={() => setAnswers({ ...answers, [question.id]: choice.id })}
                        className={`rounded-md border p-3 text-left text-sm ${
                          answers[question.id] === choice.id ? "border-[#2c7a64] bg-[#e7f3ef]" : "border-[#d8dce2] hover:bg-[#f7f9fb]"
                        }`}
                      >
                        {choice.text}
                      </button>
                    ))}
                  </div>
                </article>
              ))}
            </div>
            {result ? <p className="mt-4 rounded-md bg-[#e7f3ef] p-3 font-semibold text-[#17202a]">Score: {result.score} / {result.total}</p> : null}
            <button onClick={submit} className="mt-4 rounded-md bg-[#2c7a64] px-4 py-2 text-sm font-semibold text-white">Submit attempt</button>
          </>
        ) : (
          <EmptyState title="No quiz selected" body="Choose a quiz bank to start practice." />
        )}
      </Panel>
    </div>
  )
}
