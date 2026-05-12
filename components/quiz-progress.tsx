"use client"

import { cn } from "@/lib/utils"
import { Check, X } from "lucide-react"

interface QuizProgressProps {
  totalQuestions: number
  currentQuestion: number
  answers: { questionId: string; isCorrect: boolean }[]
}

export function QuizProgress({
  totalQuestions,
  currentQuestion,
  answers,
}: QuizProgressProps) {
  const correctCount = answers.filter((a) => a.isCorrect).length
  const incorrectCount = answers.filter((a) => !a.isCorrect).length

  return (
    <div className="w-full max-w-2xl mx-auto mb-8">
      {/* Progress bar */}
      <div className="flex gap-2 mb-4">
        {Array.from({ length: totalQuestions }).map((_, index) => {
          const answer = answers[index]
          const isCurrent = index === currentQuestion

          return (
            <div
              key={index}
              className={cn(
                "h-2 flex-1 rounded-full transition-all duration-300",
                answer?.isCorrect && "bg-success",
                answer && !answer.isCorrect && "bg-destructive",
                !answer && isCurrent && "bg-accent",
                !answer && !isCurrent && "bg-muted"
              )}
            />
          )
        })}
      </div>

      {/* Stats */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-full bg-success flex items-center justify-center">
              <Check className="w-3 h-3 text-success-foreground" />
            </div>
            <span className="text-muted-foreground font-medium">{correctCount}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-full bg-destructive flex items-center justify-center">
              <X className="w-3 h-3 text-destructive-foreground" />
            </div>
            <span className="text-muted-foreground font-medium">{incorrectCount}</span>
          </div>
        </div>
        <span className="text-muted-foreground">
          {answers.length} of {totalQuestions} answered
        </span>
      </div>
    </div>
  )
}
