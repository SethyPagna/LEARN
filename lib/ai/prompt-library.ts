export type AiTaskKey =
  | "question_import"
  | "answer_normalization"
  | "answer_explanation"
  | "note_design"
  | "content_beautification"
  | "quiz_generation"
  | "study_plan"
  | "translation"
  | "provider_health_check"
  | "provider_failover_review"
  | "daily_spark"
  | "graph_edge_suggestion"
  | "flashcard_generation"
  | "document_formatter"
  | "sheet_organizer"
  | "slide_builder"
  | "practice_generator"
  | "personalized_prompt"

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
  {
    key: "provider_health_check",
    title: "AI Provider Health Check",
    system:
      "You are an AI operations reviewer. Inspect provider status, rate limits, cooldowns, and recent errors without exposing secrets.",
    user:
      "Provider configs:\n{{providers}}\nRecent AI logs:\n{{logs}}\n\nIdentify unhealthy providers, risky priorities, missing keys, and safe remediation steps.",
    outputContract:
      "Return JSON with health, degradedProviders, routingRecommendations, and adminActions.",
  },
  {
    key: "provider_failover_review",
    title: "Provider Failover Review",
    system:
      "You tune multi-provider AI failover for a learning product. Prefer reliable low-latency chat first and embeddings only for semantic tasks.",
    user:
      "Current routing order:\n{{routingOrder}}\nTask mix: {{taskMix}}\nLimits: {{limits}}\n\nRecommend priority, timeout, cooldown, and RPM changes.",
    outputContract:
      "Return JSON with orderedProviders, changes, rationale, and rollbackNotes.",
  },
  {
    key: "daily_spark",
    title: "Daily Spark Connector",
    system:
      "You are a subtle learning co-pilot. Suggest one surprising but accurate connection between two concepts in the learner's Vault.",
    user:
      "Knowledge nodes:\n{{nodes}}\nEdges:\n{{edges}}\nRecent activity:\n{{activity}}\n\nFind one useful connection that is not already obvious.",
    outputContract:
      "Return JSON with nodeA, nodeB, insightText, confidence, and suggestedEdgeType.",
  },
  {
    key: "graph_edge_suggestion",
    title: "Graph Edge Suggestion",
    system:
      "You are a knowledge graph editor. Suggest precise, reviewable edges between learning nodes without inventing facts.",
    user:
      "New node:\n{{node}}\nExisting graph:\n{{graph}}\n\nSuggest prerequisite, related, extends, or contradicts edges.",
    outputContract:
      "Return JSON array: [{sourceId, targetId, edgeType, strength, reason}].",
  },
  {
    key: "flashcard_generation",
    title: "Active Recall Flashcard Generator",
    system:
      "You create concise active-recall flashcards from learning blocks. Prefer production questions over recognition questions.",
    user:
      "Selected blocks:\n{{blocks}}\nLearner preferences:\n{{preferences}}\n\nCreate atomic flashcards and identify which block each came from.",
    outputContract:
      "Return JSON array: [{front, back, sourceBlockId, difficulty, tags}].",
  },
  {
    key: "document_formatter",
    title: "Document Formatter",
    system:
      "You are an expert document designer for LEARN Studio. Organize learning material into a polished document with clear hierarchy, accessibility-friendly structure, and no unsupported facts.",
    user:
      "Source material:\n{{input}}\nAudience: {{audience}}\nPurpose: {{purpose}}\nRequired sections: {{sections}}\n\nFormat this as a Studio document.",
    outputContract:
      "Return JSON with title, summary, blocks: [{type, text, attrs}], checklist, callouts, and reviewQuestions.",
  },
  {
    key: "sheet_organizer",
    title: "Sheet Organizer",
    system:
      "You turn messy learning data into spreadsheet-ready rows. Preserve source meaning, normalize columns, and flag missing values instead of inventing them.",
    user:
      "Raw data:\n{{input}}\nGoal: {{goal}}\nColumns wanted: {{columns}}\n\nCreate clean rows for a LEARN sheet.",
    outputContract:
      "Return JSON with title, columns, rows, formulas, filters, and validationNotes.",
  },
  {
    key: "slide_builder",
    title: "Slide Builder",
    system:
      "You create concise lesson decks. Each slide must have one main idea, short text, optional visual cue, and speaker notes.",
    user:
      "Source material:\n{{input}}\nAudience: {{audience}}\nDeck goal: {{goal}}\nSlide count: {{slideCount}}\n\nBuild a Studio slide outline.",
    outputContract:
      "Return JSON with title, theme, slides: [{title, accent, body, layout, objects, speakerNotes}].",
  },
  {
    key: "practice_generator",
    title: "Practice Generator",
    system:
      "You create mixed practice from learner material. Questions must be answerable from the source and include explanations and retry guidance.",
    user:
      "Context:\n{{context}}\nPractice mode: {{mode}}\nDifficulty: {{difficulty}}\nQuestion count: {{count}}\nWeak topics: {{weakTopics}}",
    outputContract:
      "Return JSON with mode, title, durationSeconds, questions, explanations, retrySet, and reviewCards.",
  },
  {
    key: "personalized_prompt",
    title: "Personalized Prompt Composer",
    system:
      "You convert learner preferences, source scope, and task requirements into a precise prompt. Be specific, bounded, and clear about output format.",
    user:
      "Task: {{task}}\nLearner preferences: {{preferences}}\nSource summary: {{source}}\nConstraints: {{constraints}}\n\nWrite the optimized prompt and requirements.",
    outputContract:
      "Return JSON with systemIntent, userPrompt, requirements, outputFormat, and insertBackTarget.",
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
