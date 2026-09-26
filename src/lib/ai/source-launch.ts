import { AI_TUTOR_LAUNCH_KEY, type AiTutorLaunchPreset } from "./tutor-workflow"

export interface TutorSource {
  title: string
  content: string
  task?: "explain" | "quiz" | "rewrite" | "flashcards" | "activity" | "discussion"
}

export function buildSourceTutorLaunch(source: TutorSource): AiTutorLaunchPreset {
  const task = source.task ?? "explain"
  const actions = {
    explain: { activeTaskKey: "source_explanation", insertTarget: "ai-note", message: "Explain the key ideas in this source with examples and a recall question.", modeGroup: "tutor" },
    rewrite: { activeTaskKey: "note_design", insertTarget: "ai-note", message: "Rewrite this source as a clear study note.", modeGroup: "studio" },
    quiz: { activeTaskKey: "quiz_generation", insertTarget: "quiz", message: "Create a playable multiple-choice quiz from this source, with explanations.", modeGroup: "practice" },
    flashcards: { activeTaskKey: "flashcard_generation", insertTarget: "flashcards", message: "Create question and answer review cards from this source.", modeGroup: "practice" },
    activity: { activeTaskKey: "study_plan", insertTarget: "study-activity", message: "Create one study activity from this source. Ask me for its start, end and timezone before producing the calendar output.", modeGroup: "tutor" },
    discussion: { activeTaskKey: "personalized_prompt", insertTarget: "discussion-space", message: "Create a discussion protocol from this source for a private learning space.", modeGroup: "tutor" },
  } as const
  return { ...actions[task], outputLength: "Balanced", sourceScope: "Active Studio item", sourceTitle: source.title.slice(0, 200), sourceContent: source.content.slice(0, 12_000), status: `Source loaded: ${source.title}. Review the prompt, then run.` }
}

export function launchAiTutorFromSource(source: TutorSource): void {
  window.localStorage.setItem(AI_TUTOR_LAUNCH_KEY, JSON.stringify(buildSourceTutorLaunch(source)))
}
