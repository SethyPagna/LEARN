"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { Check, X } from "lucide-react"

interface Choice {
  id: string
  text: string
}

interface FlashcardProps {
  question: string
  choices: Choice[]
  correctAnswerId: string
  topic: string
  onNext: (isCorrect: boolean) => void
  questionNumber: number
  totalQuestions: number
}

export function Flashcard({
  question,
  choices,
  correctAnswerId,
  topic,
  onNext,
  questionNumber,
  totalQuestions,
}: FlashcardProps) {
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null)
  const [isFlipped, setIsFlipped] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)

  const isCorrect = selectedAnswer === correctAnswerId

  const handleSubmit = () => {
    if (!selectedAnswer || isFlipped) return
    setIsAnimating(true)
    setTimeout(() => {
      setIsFlipped(true)
      setIsAnimating(false)
    }, 300)
  }

  const handleNext = () => {
    const wasCorrect = isCorrect
    setIsFlipped(false)
    setSelectedAnswer(null)
    onNext(wasCorrect)
  }

  return (
    <div className="w-full max-w-2xl mx-auto perspective-[1000px]">
      <div
        className={cn(
          "relative w-full min-h-[500px] transition-transform duration-500 transform-style-3d",
          isFlipped && "rotate-y-180"
        )}
      >
        {/* Front of card */}
        <div
          className={cn(
            "absolute inset-0 backface-hidden",
            isFlipped && "invisible"
          )}
        >
          <div className="bg-card rounded-2xl shadow-xl border border-border p-8 h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <span className="px-3 py-1 bg-secondary text-secondary-foreground rounded-full text-sm font-medium">
                {topic}
              </span>
              <span className="text-muted-foreground text-sm font-medium">
                {questionNumber} / {totalQuestions}
              </span>
            </div>

            {/* Question */}
            <h2 className="text-2xl font-bold text-card-foreground mb-8 leading-relaxed">
              {question}
            </h2>

            {/* Choices */}
            <div className="flex-1 space-y-3">
              {choices.map((choice, index) => (
                <button
                  key={choice.id}
                  onClick={() => !isFlipped && setSelectedAnswer(choice.id)}
                  className={cn(
                    "w-full p-4 rounded-xl border-2 text-left transition-all duration-200",
                    "hover:border-accent hover:bg-accent/5",
                    selectedAnswer === choice.id
                      ? "border-accent bg-accent/10"
                      : "border-border bg-card"
                  )}
                >
                  <span className="flex items-center gap-3">
                    <span
                      className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold",
                        selectedAnswer === choice.id
                          ? "bg-accent text-accent-foreground"
                          : "bg-secondary text-secondary-foreground"
                      )}
                    >
                      {String.fromCharCode(65 + index)}
                    </span>
                    <span className="text-card-foreground font-medium">
                      {choice.text}
                    </span>
                  </span>
                </button>
              ))}
            </div>

            {/* Submit Button */}
            <button
              onClick={handleSubmit}
              disabled={!selectedAnswer || isAnimating}
              className={cn(
                "mt-6 w-full py-4 rounded-xl font-semibold text-lg transition-all duration-200",
                selectedAnswer
                  ? "bg-primary text-primary-foreground hover:opacity-90"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
            >
              {isAnimating ? "Checking..." : "Submit Answer"}
            </button>
          </div>
        </div>

        {/* Back of card */}
        <div
          className={cn(
            "absolute inset-0 backface-hidden rotate-y-180",
            !isFlipped && "invisible"
          )}
        >
          <div
            className={cn(
              "rounded-2xl shadow-xl p-8 h-full flex flex-col",
              isCorrect
                ? "bg-success text-success-foreground"
                : "bg-destructive text-destructive-foreground"
            )}
          >
            {/* Result Icon */}
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <div
                className={cn(
                  "w-24 h-24 rounded-full flex items-center justify-center mb-6",
                  isCorrect ? "bg-success-foreground/20" : "bg-destructive-foreground/20"
                )}
              >
                {isCorrect ? (
                  <Check className="w-12 h-12" strokeWidth={3} />
                ) : (
                  <X className="w-12 h-12" strokeWidth={3} />
                )}
              </div>

              <h2 className="text-3xl font-bold mb-4">
                {isCorrect ? "Correct!" : "Incorrect"}
              </h2>

              {!isCorrect && (
                <div className="bg-foreground/10 rounded-xl p-4 mb-4 max-w-md">
                  <p className="text-sm opacity-90 mb-2">The correct answer was:</p>
                  <p className="font-semibold text-lg">
                    {choices.find((c) => c.id === correctAnswerId)?.text}
                  </p>
                </div>
              )}

              <p className="opacity-90 max-w-md">
                {isCorrect
                  ? "Great job! You're mastering this topic."
                  : "Don't worry, keep practicing and you'll get it next time!"}
              </p>
            </div>

            {/* Next Button */}
            <button
              onClick={handleNext}
              className="mt-6 w-full py-4 rounded-xl font-semibold text-lg bg-foreground/20 hover:bg-foreground/30 transition-all duration-200"
            >
              Next Question
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
