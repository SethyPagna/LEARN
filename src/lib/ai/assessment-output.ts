export interface GeneratedQuestion {
  question: string
  choices: Array<{ id: string; text: string }>
  correct_answer_id: string
  explanation: string
  topic: string
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

/** Validate every question before persisting anything; never silently drop an AI question. */
export function generatedQuizQuestions(value: unknown): GeneratedQuestion[] {
  if (!Array.isArray(value) || !value.length || value.length > 100) {
    throw new Error("A generated quiz needs 1–100 questions with choices and a correct answer.")
  }
  return value.map((raw, index) => {
    const item = record(raw)
    const source = item.choices ?? item.options
    const choices = Array.isArray(source) ? source.map((rawChoice, choiceIndex) => {
      const choice = record(rawChoice)
      return { id: text(choice.id) || String.fromCharCode(97 + choiceIndex), text: text(rawChoice) || text(choice.text) }
    }) : []
    const answer = item.correct_answer_id ?? item.correctAnswerId ?? item.answer
    const answerText = typeof answer === "boolean" ? String(answer) : text(answer)
    const correct = choices.find((choice) => choice.id === answerText)
      ?? choices.find((choice) => choice.text.toLowerCase() === answerText.toLowerCase())
    if (!text(item.question) || choices.length < 2 || choices.length > 10 || choices.some((choice) => !choice.text)
      || new Set(choices.map((choice) => choice.id)).size !== choices.length || !correct) {
      throw new Error(`Question ${index + 1} needs text, 2–10 distinct choices and an answer matching one choice. Ask AI to repair the quiz before inserting.`)
    }
    return { question: text(item.question).slice(0, 4000), choices: choices.map((choice) => ({ ...choice, text: choice.text.slice(0, 2000) })), correct_answer_id: correct.id, explanation: text(item.explanation).slice(0, 4000), topic: text(item.topic).slice(0, 80) }
  })
}

export function generatedReviewCards(value: unknown, title: string) {
  if (!Array.isArray(value) || !value.length || value.length > 100) {
    throw new Error("Review cards need a JSON cards array containing 1–100 question/answer pairs.")
  }
  const batch = crypto.randomUUID()
  return value.map((raw, index) => {
    const item = record(raw)
    const prompt = text(item.prompt) || text(item.front) || text(item.question)
    const answer = text(item.answer) || text(item.back)
    if (!prompt || !answer) throw new Error(`Card ${index + 1} needs both a question and an answer.`)
    return { sourceId: `ai:${batch}:${index}`, title, prompt: prompt.slice(0, 4000), answer: answer.slice(0, 2000), topic: text(item.topic).slice(0, 80) || "General" }
  })
}

export function assessmentOutputInstruction(target: string): string {
  if (target === "quiz") return 'Return JSON only: {"title":"...","questions":[{"question":"...","choices":[{"id":"a","text":"..."},{"id":"b","text":"..."}],"correct_answer_id":"a","explanation":"..."}]}. Every question must have 2–10 choices and a matching answer id. Represent true/false as two choices; use multiple choice for recall questions.'
  if (target === "flashcards" || target === "review-cards") return 'Return JSON only: {"title":"...","cards":[{"prompt":"Question","answer":"Answer","topic":"Topic"}]}. Every card needs both sides.'
  return ""
}
