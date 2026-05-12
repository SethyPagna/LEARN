"use client"

import { Trophy, RotateCcw, Target } from "lucide-react"
import { cn } from "@/lib/utils"

interface QuizCompleteProps {
  totalQuestions: number
  correctAnswers: number
  onRestart: () => void
}

export function QuizComplete({
  totalQuestions,
  correctAnswers,
  onRestart,
}: QuizCompleteProps) {
  const percentage = Math.round((correctAnswers / totalQuestions) * 100)
  
  const getMessage = () => {
    if (percentage >= 90) return "Outstanding! You're a master!"
    if (percentage >= 70) return "Great job! Keep it up!"
    if (percentage >= 50) return "Good effort! Room to improve."
    return "Keep practicing! You'll get there!"
  }

  const getEmoji = () => {
    if (percentage >= 90) return "🏆"
    if (percentage >= 70) return "🌟"
    if (percentage >= 50) return "👍"
    return "💪"
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="bg-card rounded-2xl shadow-xl border border-border p-8 text-center">
        {/* Trophy Icon */}
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-accent/20 flex items-center justify-center">
          <Trophy className="w-10 h-10 text-accent" />
        </div>

        {/* Title */}
        <h2 className="text-3xl font-bold text-card-foreground mb-2">
          Quiz Complete! {getEmoji()}
        </h2>
        <p className="text-muted-foreground mb-8">{getMessage()}</p>

        {/* Score Circle */}
        <div className="relative w-40 h-40 mx-auto mb-8">
          <svg className="w-full h-full transform -rotate-90">
            <circle
              cx="80"
              cy="80"
              r="70"
              stroke="currentColor"
              strokeWidth="12"
              fill="none"
              className="text-muted"
            />
            <circle
              cx="80"
              cy="80"
              r="70"
              stroke="currentColor"
              strokeWidth="12"
              fill="none"
              strokeDasharray={`${percentage * 4.4} 440`}
              strokeLinecap="round"
              className={cn(
                percentage >= 70 ? "text-success" : percentage >= 50 ? "text-accent" : "text-destructive"
              )}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-4xl font-bold text-card-foreground">{percentage}%</span>
            <span className="text-sm text-muted-foreground">Score</span>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="bg-success/10 rounded-xl p-4">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Target className="w-5 h-5 text-success" />
              <span className="text-2xl font-bold text-success">{correctAnswers}</span>
            </div>
            <p className="text-sm text-muted-foreground">Correct</p>
          </div>
          <div className="bg-destructive/10 rounded-xl p-4">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Target className="w-5 h-5 text-destructive" />
              <span className="text-2xl font-bold text-destructive">{totalQuestions - correctAnswers}</span>
            </div>
            <p className="text-sm text-muted-foreground">Incorrect</p>
          </div>
        </div>

        {/* Restart Button */}
        <button
          onClick={onRestart}
          className="w-full py-4 rounded-xl font-semibold text-lg bg-primary text-primary-foreground hover:opacity-90 transition-all duration-200 flex items-center justify-center gap-2"
        >
          <RotateCcw className="w-5 h-5" />
          Try Again
        </button>
      </div>
    </div>
  )
}
