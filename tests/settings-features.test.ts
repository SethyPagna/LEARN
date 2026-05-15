import assert from "node:assert/strict"
import test from "node:test"
import { normalizeSettingsNumber, summarizeSettingsOptions } from "../lib/settings-features"

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

test("normalizeSettingsNumber clamps invalid preference numbers", () => {
  assert.equal(normalizeSettingsNumber({ value: "abc", fallback: 45, min: 5, max: 180 }), 45)
  assert.equal(normalizeSettingsNumber({ value: "2", fallback: 45, min: 5, max: 180 }), 5)
  assert.equal(normalizeSettingsNumber({ value: "220", fallback: 45, min: 5, max: 180 }), 180)
  assert.equal(normalizeSettingsNumber({ value: "44.6", fallback: 45, min: 5, max: 180 }), 45)
})
