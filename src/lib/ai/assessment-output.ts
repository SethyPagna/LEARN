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

const MAX_GENERATED_REVIEW_CARDS = 40

function reviewPairKey(prompt: string, answer: string): string {
  const pair = JSON.stringify([prompt, answer])
  let first = 0x811c9dc5
  let second = 0x9e3779b9
  for (let index = 0; index < pair.length; index += 1) {
    const code = pair.charCodeAt(index)
    first = Math.imul(first ^ code, 0x01000193)
    second = Math.imul(second ^ code, 0x5bd1e995)
  }
  return `${(first >>> 0).toString(36)}:${(second >>> 0).toString(36)}`
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
    const storedChoices = choices.map((choice) => ({ ...choice, text: choice.text.slice(0, 2000) }))
    const distinctChoiceTexts = new Set(storedChoices.map((choice) => choice.text.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase()))
    if (!text(item.question) || choices.length < 2 || choices.length > 10 || choices.some((choice) => !choice.text)
      || new Set(choices.map((choice) => choice.id)).size !== choices.length || distinctChoiceTexts.size !== choices.length || !correct) {
      throw new Error(`Question ${index + 1} needs text, 2–10 distinct choices and an answer matching one choice. Ask AI to repair the quiz before inserting.`)
    }
    return { question: text(item.question).slice(0, 4000), choices: storedChoices, correct_answer_id: correct.id, explanation: text(item.explanation).slice(0, 4000), topic: text(item.topic).slice(0, 80) }
  })
}

export function generatedReviewCards(value: unknown, title: string) {
  if (!Array.isArray(value) || !value.length || value.length > MAX_GENERATED_REVIEW_CARDS) {
    throw new Error(`Review cards need a JSON cards array containing 1–${MAX_GENERATED_REVIEW_CARDS} question/answer pairs.`)
  }
  return value.map((raw, index) => {
    const item = record(raw)
    const prompt = (text(item.prompt) || text(item.front) || text(item.question)).slice(0, 4000).trim()
    const answer = (text(item.answer) || text(item.back)).slice(0, 2000)
    if (!prompt || !answer) throw new Error(`Card ${index + 1} needs both a question and an answer.`)
    return { sourceId: `ai:pair:${reviewPairKey(prompt, answer)}`, title, prompt, answer, topic: text(item.topic).slice(0, 80) || "General" }
  })
}

export function assessmentOutputInstruction(target: string): string {
  if (target === "quiz") return 'Return JSON only: {"title":"...","questions":[{"question":"...","choices":[{"id":"a","text":"..."},{"id":"b","text":"..."}],"correct_answer_id":"a","explanation":"..."}]}. Every question must have 2–10 choices and a matching answer id. Represent true/false as two choices; use multiple choice for recall questions.'
  if (target === "flashcards" || target === "review-cards") return 'Return JSON only: {"title":"...","cards":[{"prompt":"Question","answer":"Answer","topic":"Topic"}]}. Every card needs both sides.'
  return ""
}
