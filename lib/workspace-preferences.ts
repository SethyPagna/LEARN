export type Density = "compact" | "comfortable"
export type AppAccent = "teal" | "sky" | "violet" | "rose" | "amber"

export const WORKSPACE_OPTIONS_KEY = "learn_workspace_options"

export type WorkspaceOptions = {
  dashboardDetail: "focused" | "detailed"
  showWeakTopicBars: boolean
  notesAutosave: boolean
  noteEditorSize: "standard" | "large"
  docsTemplate: "study" | "cornell" | "project"
  sheetRows: number
  slidesAspect: "16:9" | "4:3"
  fileLayout: "list" | "grid"
  filePreview: boolean
  quizMode: "practice" | "exam" | "review"
  revealAnswers: boolean
  gameMode: "sprint" | "matching" | "memory"
  gameQuestionLimit: number
  calendarLeadMinutes: number
  calendarDefaultMinutes: number
  aiMode: "coach" | "route" | "rewrite" | "quiz" | "flashcards" | "translate" | "cleanup" | "mistake"
  aiIncludeNotes: boolean
  aiTemperature: number
  aiMaxTokens: number
  collaborationPresence: boolean
  chatCompact: boolean
  adminVerbose: boolean
  highContrast: boolean
  reducedMotion: boolean
  dyslexiaFriendly: boolean
  privacyDefault: "private" | "connections" | "public"
  dailyReviewCap: number
  restDay: "sunday" | "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday"
  feedSerendipity: number
  notificationReviewReminders: boolean
  notificationDraftWarnings: boolean
  notificationSocialUpdates: boolean
  notificationSystemHealth: boolean
  appAccent: AppAccent
}

export const defaultWorkspaceOptions: WorkspaceOptions = {
  dashboardDetail: "detailed",
  showWeakTopicBars: true,
  notesAutosave: false,
  noteEditorSize: "standard",
  docsTemplate: "study",
  sheetRows: 8,
  slidesAspect: "16:9",
  fileLayout: "list",
  filePreview: true,
  quizMode: "practice",
  revealAnswers: true,
  gameMode: "sprint",
  gameQuestionLimit: 12,
  calendarLeadMinutes: 15,
  calendarDefaultMinutes: 45,
  aiMode: "route",
  aiIncludeNotes: true,
  aiTemperature: 0.45,
  aiMaxTokens: 8192,
  collaborationPresence: true,
  chatCompact: false,
  adminVerbose: true,
  highContrast: false,
  reducedMotion: false,
  dyslexiaFriendly: false,
  privacyDefault: "private",
  dailyReviewCap: 30,
  restDay: "sunday",
  feedSerendipity: 15,
  notificationReviewReminders: true,
  notificationDraftWarnings: true,
  notificationSocialUpdates: true,
  notificationSystemHealth: true,
  appAccent: "teal",
}

const dashboardDetails = ["focused", "detailed"] as const
const noteEditorSizes = ["standard", "large"] as const
const docsTemplates = ["study", "cornell", "project"] as const
const slideAspects = ["16:9", "4:3"] as const
const fileLayouts = ["list", "grid"] as const
const quizModes = ["practice", "exam", "review"] as const
const gameModes = ["sprint", "matching", "memory"] as const
const aiModes = ["coach", "route", "rewrite", "quiz", "flashcards", "translate", "cleanup", "mistake"] as const
const privacyDefaults = ["private", "connections", "public"] as const
const restDays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const
const appAccents = ["teal", "sky", "violet", "rose", "amber"] as const

export function normalizeWorkspaceOptions(value: unknown): WorkspaceOptions {
  if (!isRecord(value)) return defaultWorkspaceOptions
  return {
    ...defaultWorkspaceOptions,
    dashboardDetail: choice(value.dashboardDetail, dashboardDetails, defaultWorkspaceOptions.dashboardDetail),
    showWeakTopicBars: bool(value.showWeakTopicBars, defaultWorkspaceOptions.showWeakTopicBars),
    notesAutosave: bool(value.notesAutosave, defaultWorkspaceOptions.notesAutosave),
    noteEditorSize: choice(value.noteEditorSize, noteEditorSizes, defaultWorkspaceOptions.noteEditorSize),
    docsTemplate: choice(value.docsTemplate, docsTemplates, defaultWorkspaceOptions.docsTemplate),
    sheetRows: intRange(value.sheetRows, 1, 200, defaultWorkspaceOptions.sheetRows),
    slidesAspect: choice(value.slidesAspect, slideAspects, defaultWorkspaceOptions.slidesAspect),
    fileLayout: choice(value.fileLayout, fileLayouts, defaultWorkspaceOptions.fileLayout),
    filePreview: bool(value.filePreview, defaultWorkspaceOptions.filePreview),
    quizMode: choice(value.quizMode, quizModes, defaultWorkspaceOptions.quizMode),
    revealAnswers: bool(value.revealAnswers, defaultWorkspaceOptions.revealAnswers),
    gameMode: choice(value.gameMode, gameModes, defaultWorkspaceOptions.gameMode),
    gameQuestionLimit: intRange(value.gameQuestionLimit, 1, 100, defaultWorkspaceOptions.gameQuestionLimit),
    calendarLeadMinutes: intRange(value.calendarLeadMinutes, 0, 180, defaultWorkspaceOptions.calendarLeadMinutes),
    calendarDefaultMinutes: intRange(value.calendarDefaultMinutes, 5, 240, defaultWorkspaceOptions.calendarDefaultMinutes),
    aiMode: choice(value.aiMode, aiModes, defaultWorkspaceOptions.aiMode),
    aiIncludeNotes: bool(value.aiIncludeNotes, defaultWorkspaceOptions.aiIncludeNotes),
    aiTemperature: numberRange(value.aiTemperature, 0, 2, defaultWorkspaceOptions.aiTemperature),
    aiMaxTokens: intRange(value.aiMaxTokens, 256, 16384, defaultWorkspaceOptions.aiMaxTokens),
    collaborationPresence: bool(value.collaborationPresence, defaultWorkspaceOptions.collaborationPresence),
    chatCompact: bool(value.chatCompact, defaultWorkspaceOptions.chatCompact),
    adminVerbose: bool(value.adminVerbose, defaultWorkspaceOptions.adminVerbose),
    highContrast: bool(value.highContrast, defaultWorkspaceOptions.highContrast),
    reducedMotion: bool(value.reducedMotion, defaultWorkspaceOptions.reducedMotion),
    dyslexiaFriendly: bool(value.dyslexiaFriendly, defaultWorkspaceOptions.dyslexiaFriendly),
    privacyDefault: choice(value.privacyDefault, privacyDefaults, defaultWorkspaceOptions.privacyDefault),
    dailyReviewCap: intRange(value.dailyReviewCap, 1, 200, defaultWorkspaceOptions.dailyReviewCap),
    restDay: choice(value.restDay, restDays, defaultWorkspaceOptions.restDay),
    feedSerendipity: intRange(value.feedSerendipity, 0, 50, defaultWorkspaceOptions.feedSerendipity),
    notificationReviewReminders: bool(value.notificationReviewReminders, defaultWorkspaceOptions.notificationReviewReminders),
    notificationDraftWarnings: bool(value.notificationDraftWarnings, defaultWorkspaceOptions.notificationDraftWarnings),
    notificationSocialUpdates: bool(value.notificationSocialUpdates, defaultWorkspaceOptions.notificationSocialUpdates),
    notificationSystemHealth: bool(value.notificationSystemHealth, defaultWorkspaceOptions.notificationSystemHealth),
    appAccent: choice(value.appAccent, appAccents, defaultWorkspaceOptions.appAccent),
  }
}

export function parseStoredWorkspaceOptions(raw: string | null): WorkspaceOptions {
  return normalizeWorkspaceOptions(parseJson(raw))
}

export function serializeWorkspaceOptions(options: Partial<WorkspaceOptions>): string {
  return JSON.stringify(normalizeWorkspaceOptions(options))
}

function parseJson(raw: string | null): unknown {
  if (!raw) return null
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function bool(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback
}

function choice<const T extends readonly string[]>(value: unknown, options: T, fallback: T[number]): T[number] {
  return typeof value === "string" && options.includes(value) ? value : fallback
}

function intRange(value: unknown, min: number, max: number, fallback: number) {
  return Math.round(numberRange(value, min, max, fallback))
}

function numberRange(value: unknown, min: number, max: number, fallback: number) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(max, Math.max(min, numeric))
}
