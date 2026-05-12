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
    key: "note_to_quiz",
    label: "Note-to-quiz generator",
    cadence: "When notes change",
    promptKey: "quiz_generation",
    enabledByDefault: true,
    description: "Turns fresh notes into practice questions with explanations.",
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
]

export function getEnabledAutomationJobs() {
  return automationJobs.filter((job) => job.enabledByDefault)
}

export function getAutomationJob(key: string) {
  return automationJobs.find((job) => job.key === key) ?? null
}
