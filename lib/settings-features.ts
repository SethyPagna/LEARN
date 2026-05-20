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

export interface SettingsSummaryChip {
  id: "privacy" | "reviews" | "comfort" | "workflow" | "notifications"
  label: string
  value: string
  priority: "primary" | "secondary"
}

export type SettingsSectionId = "profile" | "experience" | "learning" | "privacy"

export interface SettingsSectionGuide {
  id: SettingsSectionId
  label: string
  detail: string
  badge: string
  tone: "good" | "watch" | "neutral"
}

export interface SettingsControlPlan {
  suggestedSection: SettingsSectionId
  nextAction: string
  guides: SettingsSectionGuide[]
}

const MIN_SERENDIPITY_PERCENT = 15
const HIGH_REVIEW_CAP = 60
const HIGH_TOKEN_BUDGET = 8192
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

export function buildSettingsSummaryChips(summary: SettingsOptionSummary): SettingsSummaryChip[] {
  return [
    { id: "privacy", label: "Privacy", value: summary.privacyLabel, priority: "primary" },
    { id: "reviews", label: "Reviews", value: summary.dailyReviewLabel, priority: "primary" },
    { id: "comfort", label: "Comfort", value: `${summary.enabledAccessibilityCount}/3`, priority: summary.enabledAccessibilityCount ? "primary" : "secondary" },
    { id: "workflow", label: "Workflow", value: `${summary.enabledWorkflowCount}/4`, priority: summary.enabledWorkflowCount < 4 ? "primary" : "secondary" },
    { id: "notifications", label: "Notifications", value: `${summary.enabledNotificationCount}/4`, priority: summary.enabledNotificationCount ? "secondary" : "primary" },
  ]
}

export function buildSettingsControlPlan(summary: SettingsOptionSummary): SettingsControlPlan {
  const statusById = new Map(summary.statuses.map((status) => [status.id, status]))
  const privacyTone = statusById.get("privacy")?.tone ?? "neutral"
  const reviewTone = statusById.get("review-cap")?.tone ?? "neutral"
  const focusTone = statusById.get("focus-block")?.tone ?? "neutral"
  const aiTone = statusById.get("ai-budget")?.tone ?? "neutral"
  const serendipityTone = statusById.get("serendipity")?.tone ?? "neutral"
  const learningTone = strongestTone([reviewTone, focusTone, aiTone, serendipityTone])
  const experienceTone = summary.enabledAccessibilityCount > 0 ? "good" : "neutral"
  const privacySectionTone = privacyTone === "watch" ? "watch" : summary.enabledNotificationCount > 0 ? "good" : "neutral"

  const guides: SettingsSectionGuide[] = [
    {
      id: "profile",
      label: "Profile",
      detail: "Identity, email, role, and daily goal.",
      badge: summary.dailyReviewLabel,
      tone: "neutral",
    },
    {
      id: "experience",
      label: "Experience",
      detail: "Theme comfort, density, language, and previews.",
      badge: `${summary.enabledAccessibilityCount}/3 comfort`,
      tone: experienceTone,
    },
    {
      id: "learning",
      label: "Learning",
      detail: "Review caps, games, calendar defaults, and AI budget.",
      badge: `${summary.enabledWorkflowCount}/4 workflow`,
      tone: learningTone,
    },
    {
      id: "privacy",
      label: "Privacy",
      detail: "Default sharing, presence, notifications, and admin verbosity.",
      badge: summary.privacyLabel,
      tone: privacySectionTone,
    },
  ]

  const suggestedSection = chooseSuggestedSection(guides)
  return {
    suggestedSection,
    nextAction: actionForSection(suggestedSection),
    guides,
  }
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

function strongestTone(values: SettingsOptionStatus["tone"][]): SettingsOptionStatus["tone"] {
  if (values.includes("watch")) return "watch"
  if (values.includes("good")) return "good"
  return "neutral"
}

function chooseSuggestedSection(guides: SettingsSectionGuide[]): SettingsSectionId {
  return guides.find((guide) => guide.tone === "watch")?.id ?? guides.find((guide) => guide.tone === "neutral")?.id ?? "profile"
}

function actionForSection(section: SettingsSectionId) {
  if (section === "privacy") return "Review sharing and notification defaults"
  if (section === "learning") return "Tune review load, focus length, and AI budget"
  if (section === "experience") return "Enable comfort controls for this device"
  return "Confirm profile and daily goal"
}
