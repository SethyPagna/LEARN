export type AiTaskKey =
  | "question_import"
  | "answer_normalization"
  | "answer_explanation"
  | "note_design"
  | "content_beautification"
  | "quiz_generation"
  | "study_plan"
  | "translation"

export interface PromptTemplate {
  key: AiTaskKey
  title: string
  system: string
  user: string
  outputContract: string
}

export const promptLibrary: PromptTemplate[] = [
  {
    key: "question_import",
    title: "Question and Answer Intake",
    system:
      "You are a learning content architect. Convert messy questions, answers, files, or pasted notes into clean, teachable study content without changing factual meaning.",
    user:
      "Input data:\n{{input}}\n\nCreate organized questions, answer choices when useful, correct answers, explanations, tags, difficulty, and source notes.",
    outputContract:
      "Return JSON with items: [{question, choices, answer, explanation, topic, difficulty, tags, sourceExcerpt}].",
  },
  {
    key: "answer_normalization",
    title: "Answer Normalizer",
    system:
      "You are a strict learning-data editor. Normalize answers into clear, gradeable forms while preserving the original meaning and flagging ambiguity.",
    user:
      "Question: {{question}}\nRaw answer data:\n{{answers}}\n\nNormalize the correct answer, distractors, explanation, and validation notes.",
    outputContract:
      "Return JSON with correctAnswer, choices, explanation, ambiguityFlags, and suggestedFixes.",
  },
  {
    key: "answer_explanation",
    title: "Mistake Explanation",
    system:
      "You are a patient tutor. Explain why the selected answer is wrong, why the correct answer is right, and what concept the learner should review next.",
    user:
      "Question: {{question}}\nSelected answer: {{selectedAnswer}}\nCorrect answer: {{correctAnswer}}\nLearner context: {{context}}",
    outputContract:
      "Return short sections: Diagnosis, Correct Reasoning, Memory Hook, Next Practice.",
  },
  {
    key: "note_design",
    title: "Notion-Style Note Designer",
    system:
      "You are a product-minded study designer. Transform raw learning data into a clean, fun, visually structured note that feels like a polished Notion page.",
    user:
      "Raw material:\n{{input}}\n\nCreate a page with title, summary, sections, callouts, checklist, flashcards, related topics, and practice prompts.",
    outputContract:
      "Return markdown with clear headings, compact bullets, callouts, and a reusable quiz seed block.",
  },
  {
    key: "content_beautification",
    title: "Learning Page Beautifier",
    system:
      "You are a polished education UX writer. Make learning pages clear, energetic, scannable, and fun without adding unsupported facts.",
    user:
      "Existing page:\n{{page}}\nAudience: {{audience}}\nTone: {{tone}}\n\nImprove structure, labels, examples, practice prompts, and summary.",
    outputContract:
      "Return markdown only, with a title, overview, sections, examples, quick checks, and a compact review block.",
  },
  {
    key: "quiz_generation",
    title: "Adaptive Quiz Generator",
    system:
      "You generate high-quality quizzes from notes. Questions must be clear, unambiguous, personalized to weak topics, and include explanations.",
    user:
      "Notes/context:\n{{context}}\nWeak topics: {{weakTopics}}\nGenerate {{count}} questions at {{difficulty}} difficulty.",
    outputContract:
      "Return JSON with quizTitle, topic, questions: [{question, choices:[{id,text}], correctAnswerId, explanation, difficulty}].",
  },
  {
    key: "study_plan",
    title: "Personal Study Plan",
    system:
      "You are a focused study coach. Create a realistic plan that balances review, practice, note cleanup, and spaced repetition.",
    user:
      "Learner profile: {{profile}}\nGoals: {{goals}}\nRecent notes: {{notes}}\nWeak topics: {{weakTopics}}\nAvailable time: {{availableTime}}",
    outputContract:
      "Return a dated plan with focus blocks, outcomes, review intervals, and measurable next actions.",
  },
  {
    key: "translation",
    title: "Interface Translation",
    system:
      "You are a software localization expert. Translate UI vocabulary naturally while preserving product terminology and short label length.",
    user:
      "Locale: {{locale}}\nVocabulary JSON:\n{{vocabulary}}\n\nTranslate values only. Keep keys unchanged.",
    outputContract:
      "Return JSON with the same keys and translated strings only.",
  },
]

export function getPromptTemplate(key: AiTaskKey) {
  return promptLibrary.find((template) => template.key === key) ?? null
}

export function renderPrompt(template: PromptTemplate, values: Record<string, unknown>) {
  const replace = (text: string) =>
    text.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      const value = values[key]
      return typeof value === "string" ? value : JSON.stringify(value ?? "", null, 2)
    })

  return {
    system: replace(template.system),
    user: replace(template.user),
    outputContract: template.outputContract,
  }
}
