export interface AutomationJob {
  key: string
  label: string
  cadence: string
  promptKey: string
  enabledByDefault: boolean
  description: string
}

export const automationJobs: AutomationJob[] = [
  {
    key: "daily_study_brief",
    label: "Daily study brief",
    cadence: "Every morning",
    promptKey: "study_plan",
    enabledByDefault: true,
    description: "Summarizes goals, weak topics, due review, and the next best study block.",
  },
  {
    key: "daily_spark",
    label: "Daily Spark connector",
    cadence: "Every morning",
    promptKey: "daily_spark",
    enabledByDefault: true,
    description: "Suggests one surprising connection between two Vault concepts and prepares a reviewable graph edge.",
  },
  {
    key: "graph_edge_suggestions",
    label: "Graph edge suggestions",
    cadence: "When notes or lessons change",
    promptKey: "graph_edge_suggestion",
    enabledByDefault: true,
    description: "Finds pending prerequisite, related, extends, or contradicts edges for the learner to approve.",
  },
  {
    key: "note_to_quiz",
    label: "Note-to-quiz generator",
    cadence: "When notes change",
    promptKey: "quiz_generation",
    enabledByDefault: true,
    description: "Turns fresh notes into practice questions with explanations.",
  },
  {
    key: "block_to_flashcards",
    label: "Block-to-flashcards generator",
    cadence: "When reviewable blocks change",
    promptKey: "flashcard_generation",
    enabledByDefault: true,
    description: "Creates active-recall flashcard candidates from selected note, doc, and lesson blocks.",
  },
  {
    key: "mistake_review",
    label: "Mistake review",
    cadence: "After each quiz attempt",
    promptKey: "answer_explanation",
    enabledByDefault: true,
    description: "Explains missed questions and creates follow-up practice.",
  },
  {
    key: "content_design",
    label: "Content design pass",
    cadence: "On imported data",
    promptKey: "note_design",
    enabledByDefault: true,
    description: "Captures raw questions, answers, and data into clean, fun, reusable learning pages.",
  },
  {
    key: "localization_sync",
    label: "Localization vocabulary sync",
    cadence: "On release",
    promptKey: "translation",
    enabledByDefault: false,
    description: "Keeps all supported language vocabularies aligned as the UI grows.",
  },
  {
    key: "provider_health_check",
    label: "AI provider health check",
    cadence: "Every 30 minutes",
    promptKey: "provider_health_check",
    enabledByDefault: true,
    description: "Reviews encrypted provider configs, status, rate limits, cooldowns, and recent errors without exposing keys.",
  },
  {
    key: "provider_failover_review",
    label: "AI failover review",
    cadence: "On provider changes",
    promptKey: "provider_failover_review",
    enabledByDefault: true,
    description: "Recommends safe provider priority, timeout, cooldown, and request-limit adjustments for learning tasks.",
  },
]

export function getEnabledAutomationJobs() {
  return automationJobs.filter((job) => job.enabledByDefault)
}

export function getAutomationJob(key: string) {
  return automationJobs.find((job) => job.key === key) ?? null
}
