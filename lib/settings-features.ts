export interface SettingsOptionSummaryInput {
  highContrast: boolean
  reducedMotion: boolean
  dyslexiaFriendly: boolean
  notesAutosave: boolean
  filePreview: boolean
  revealAnswers: boolean
  collaborationPresence: boolean
  notificationReviewReminders?: boolean
  notificationDraftWarnings?: boolean
  notificationSocialUpdates?: boolean
  notificationSystemHealth?: boolean
  privacyDefault: "private" | "connections" | "public"
  dailyReviewCap: number
  feedSerendipity: number
  calendarDefaultMinutes: number
  aiMaxTokens: number
}

export interface SettingsOptionStatus {
  id: string
  label: string
  value: string
  tone: "good" | "watch" | "neutral"
}

export interface SettingsOptionSummary {
  enabledAccessibilityCount: number
  enabledNotificationCount: number
  enabledWorkflowCount: number
  privacyLabel: string
  dailyReviewLabel: string
  statuses: SettingsOptionStatus[]
}

const MIN_SERENDIPITY_PERCENT = 15
const HIGH_REVIEW_CAP = 60
const HIGH_TOKEN_BUDGET = 4000
const LONG_CALENDAR_BLOCK_MINUTES = 90

export function summarizeSettingsOptions(options: SettingsOptionSummaryInput): SettingsOptionSummary {
  const enabledAccessibilityCount = countEnabled([
    options.highContrast,
    options.reducedMotion,
    options.dyslexiaFriendly,
  ])
  const enabledNotificationCount = countEnabled([
    options.notificationReviewReminders ?? true,
    options.notificationDraftWarnings ?? true,
    options.notificationSocialUpdates ?? true,
    options.notificationSystemHealth ?? true,
  ])
  const enabledWorkflowCount = countEnabled([
    options.notesAutosave,
    options.filePreview,
    options.revealAnswers,
    options.collaborationPresence,
  ])

  return {
    enabledAccessibilityCount,
    enabledNotificationCount,
    enabledWorkflowCount,
    privacyLabel: labelPrivacy(options.privacyDefault),
    dailyReviewLabel: `${Math.max(0, options.dailyReviewCap)} reviews/day`,
    statuses: [
      {
        id: "privacy",
        label: "Privacy",
        value: labelPrivacy(options.privacyDefault),
        tone: options.privacyDefault === "private" ? "good" : "watch",
      },
      {
        id: "review-cap",
        label: "Review load",
        value: `${Math.max(0, options.dailyReviewCap)} cards`,
        tone: options.dailyReviewCap > HIGH_REVIEW_CAP ? "watch" : "good",
      },
      {
        id: "serendipity",
        label: "Feed variety",
        value: `${Math.max(MIN_SERENDIPITY_PERCENT, options.feedSerendipity)}%`,
        tone: options.feedSerendipity < MIN_SERENDIPITY_PERCENT ? "watch" : "neutral",
      },
      {
        id: "focus-block",
        label: "Focus block",
        value: `${Math.max(5, options.calendarDefaultMinutes)} min`,
        tone: options.calendarDefaultMinutes > LONG_CALENDAR_BLOCK_MINUTES ? "watch" : "neutral",
      },
      {
        id: "ai-budget",
        label: "AI budget",
        value: `${Math.max(0, options.aiMaxTokens)} tokens`,
        tone: options.aiMaxTokens > HIGH_TOKEN_BUDGET ? "watch" : "neutral",
      },
    ],
  }
}

export function normalizeSettingsNumber(input: {
  value: string
  fallback: number
  min: number
  max: number
}) {
  const parsed = Number(input.value)
  if (!Number.isFinite(parsed)) return input.fallback
  return Math.min(input.max, Math.max(input.min, Math.round(parsed)))
}

function countEnabled(values: boolean[]) {
  let count = 0
  for (const value of values) {
    if (value) count += 1
  }
  return count
}

function labelPrivacy(value: SettingsOptionSummaryInput["privacyDefault"]) {
  if (value === "public") return "Public"
  if (value === "connections") return "Connections"
  return "Private"
}
