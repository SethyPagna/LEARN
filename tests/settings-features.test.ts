import assert from "node:assert/strict"
import test from "node:test"
import { buildSettingsControlPlan, buildSettingsSummaryChips, normalizeSettingsNumber, summarizeSettingsOptions } from "../lib/settings-features"

test("summarizeSettingsOptions counts enabled controls and flags risky settings", () => {
  const summary = summarizeSettingsOptions({
    aiMaxTokens: 5000,
    calendarDefaultMinutes: 120,
    collaborationPresence: true,
    dailyReviewCap: 80,
    dyslexiaFriendly: true,
    feedSerendipity: 10,
    filePreview: true,
    highContrast: true,
    notesAutosave: false,
    notificationDraftWarnings: true,
    notificationReviewReminders: true,
    notificationSocialUpdates: false,
    notificationSystemHealth: true,
    privacyDefault: "public",
    reducedMotion: false,
    revealAnswers: true,
  })

  assert.equal(summary.enabledAccessibilityCount, 2)
  assert.equal(summary.enabledNotificationCount, 3)
  assert.equal(summary.enabledWorkflowCount, 3)
  assert.equal(summary.privacyLabel, "Public")
  assert.equal(summary.statuses.find((status) => status.id === "privacy")?.tone, "watch")
  assert.equal(summary.statuses.find((status) => status.id === "review-cap")?.tone, "watch")
  assert.equal(summary.statuses.find((status) => status.id === "serendipity")?.value, "15%")
})

test("settings summary chips keep header controls compact", () => {
  const summary = summarizeSettingsOptions({
    aiMaxTokens: 8192,
    calendarDefaultMinutes: 45,
    collaborationPresence: true,
    dailyReviewCap: 30,
    dyslexiaFriendly: false,
    feedSerendipity: 15,
    filePreview: true,
    highContrast: true,
    notesAutosave: true,
    notificationDraftWarnings: true,
    notificationReviewReminders: true,
    notificationSocialUpdates: false,
    notificationSystemHealth: true,
    privacyDefault: "private",
    reducedMotion: false,
    revealAnswers: true,
  })

  const chips = buildSettingsSummaryChips(summary)

  assert.deepEqual(chips.filter((chip) => chip.priority === "primary").map((chip) => chip.id), ["privacy", "reviews", "comfort"])
  assert.deepEqual(chips.map((chip) => [chip.label, chip.value]), [
    ["Privacy", "Private"],
    ["Reviews", "30 reviews/day"],
    ["Comfort", "1/3"],
    ["Workflow", "4/4"],
    ["Notifications", "3/4"],
  ])
})

test("normalizeSettingsNumber clamps invalid preference numbers", () => {
  assert.equal(normalizeSettingsNumber({ value: "abc", fallback: 45, min: 5, max: 180 }), 45)
  assert.equal(normalizeSettingsNumber({ value: "2", fallback: 45, min: 5, max: 180 }), 5)
  assert.equal(normalizeSettingsNumber({ value: "220", fallback: 45, min: 5, max: 180 }), 180)
  assert.equal(normalizeSettingsNumber({ value: "44.6", fallback: 45, min: 5, max: 180 }), 45)
})

test("buildSettingsControlPlan recommends the riskiest settings section", () => {
  const summary = summarizeSettingsOptions({
    aiMaxTokens: 1200,
    calendarDefaultMinutes: 45,
    collaborationPresence: true,
    dailyReviewCap: 30,
    dyslexiaFriendly: false,
    feedSerendipity: 15,
    filePreview: true,
    highContrast: false,
    notesAutosave: true,
    privacyDefault: "public",
    reducedMotion: false,
    revealAnswers: true,
  })

  const plan = buildSettingsControlPlan(summary)

  assert.equal(plan.suggestedSection, "privacy")
  assert.equal(plan.guides.length, 4)
  assert.equal(plan.guides.find((guide) => guide.id === "privacy")?.tone, "watch")
  assert.match(plan.nextAction, /sharing/i)
})
