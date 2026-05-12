"use client"

import { useState, useMemo } from "react"
import { Flashcard } from "@/components/flashcard"
import { QuizProgress } from "@/components/quiz-progress"
import { TopicFilter } from "@/components/topic-filter"
import { QuizComplete } from "@/components/quiz-complete"
import { quizQuestions } from "@/lib/quiz-data"
import { BookOpen, Sparkles } from "lucide-react"

export default function QuizApp() {
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null)
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState<{ questionId: string; isCorrect: boolean }[]>([])
  const [hasStarted, setHasStarted] = useState(false)

  // Get unique topics
  const topics = useMemo(() => {
    return [...new Set(quizQuestions.map((q) => q.topic))]
  }, [])

  // Filter questions by selected topic
  const filteredQuestions = useMemo(() => {
    if (!selectedTopic) return quizQuestions
    return quizQuestions.filter((q) => q.topic === selectedTopic)
  }, [selectedTopic])

  const currentQuestion = filteredQuestions[currentQuestionIndex]
  const isComplete = answers.length === filteredQuestions.length

  const handleNext = (isCorrect: boolean) => {
    setAnswers([...answers, { questionId: currentQuestion.id, isCorrect }])
    if (currentQuestionIndex < filteredQuestions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1)
    }
  }

  const handleRestart = () => {
    setCurrentQuestionIndex(0)
    setAnswers([])
    setHasStarted(false)
  }

  const handleTopicChange = (topic: string | null) => {
    setSelectedTopic(topic)
    setCurrentQuestionIndex(0)
    setAnswers([])
  }

  const handleStart = () => {
    setHasStarted(true)
  }

  // Landing screen
  if (!hasStarted) {
    return (
      <main className="min-h-screen bg-background">
        <div className="max-w-4xl mx-auto px-4 py-12">
          {/* Header */}
          <header className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-accent/10 rounded-full text-accent mb-6">
              <Sparkles className="w-4 h-4" />
              <span className="text-sm font-medium">Practice Mode</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4 text-balance">
              Master Your Knowledge
            </h1>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto text-pretty">
              Test your understanding with interactive flashcards. Select a topic and start practicing!
            </p>
          </header>

          {/* Topic Selection */}
          <div className="bg-card rounded-2xl shadow-xl border border-border p-8 mb-8">
            <h2 className="text-xl font-semibold text-card-foreground mb-6 text-center">
              Choose a Topic
            </h2>
            <TopicFilter
              topics={topics}
              selectedTopic={selectedTopic}
              onSelectTopic={handleTopicChange}
            />

            {/* Question count */}
            <div className="text-center text-muted-foreground mb-8">
              <BookOpen className="w-5 h-5 inline-block mr-2" />
              {filteredQuestions.length} questions available
            </div>

            {/* Start Button */}
            <button
              onClick={handleStart}
              className="w-full py-4 rounded-xl font-semibold text-lg bg-primary text-primary-foreground hover:opacity-90 transition-all duration-200"
            >
              Start Practice
            </button>
          </div>

          {/* Topic Preview Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {topics.map((topic) => {
              const count = quizQuestions.filter((q) => q.topic === topic).length
              return (
                <button
                  key={topic}
                  onClick={() => {
                    handleTopicChange(topic)
                    handleStart()
                  }}
                  className="bg-card rounded-xl border border-border p-4 text-left hover:border-accent hover:shadow-lg transition-all duration-200 group"
                >
                  <h3 className="font-semibold text-card-foreground group-hover:text-accent transition-colors">
                    {topic}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {count} {count === 1 ? "question" : "questions"}
                  </p>
                </button>
              )
            })}
          </div>
        </div>
      </main>
    )
  }

  // Quiz complete screen
  if (isComplete) {
    return (
      <main className="min-h-screen bg-background">
        <div className="max-w-4xl mx-auto px-4 py-12">
          <QuizComplete
            totalQuestions={filteredQuestions.length}
            correctAnswers={answers.filter((a) => a.isCorrect).length}
            onRestart={handleRestart}
          />
        </div>
      </main>
    )
  }

  // Quiz in progress
  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-12">
        {/* Header */}
        <header className="text-center mb-8">
          <h1 className="text-2xl font-bold text-foreground mb-2">MCQ Practice</h1>
          <p className="text-muted-foreground">
            {selectedTopic ? `Topic: ${selectedTopic}` : "All Topics"}
          </p>
        </header>

        {/* Progress */}
        <QuizProgress
          totalQuestions={filteredQuestions.length}
          currentQuestion={currentQuestionIndex}
          answers={answers}
        />

        {/* Flashcard */}
        <Flashcard
          key={currentQuestion.id}
          question={currentQuestion.question}
          choices={currentQuestion.choices}
          correctAnswerId={currentQuestion.correctAnswerId}
          topic={currentQuestion.topic}
          questionNumber={currentQuestionIndex + 1}
          totalQuestions={filteredQuestions.length}
          onNext={(isCorrect) => handleNext(isCorrect)}
        />

        {/* Back button */}
        <div className="text-center mt-8">
          <button
            onClick={handleRestart}
            className="text-muted-foreground hover:text-foreground transition-colors text-sm"
          >
            ← Back to Topics
          </button>
        </div>
      </div>
    </main>
  )
}
