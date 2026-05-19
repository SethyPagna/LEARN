import assert from "node:assert/strict"
import test from "node:test"
import { buildCalendarDaySegments, buildCalendarMonthGrid, buildCalendarPlanningSummary, buildCalendarSummaryChips, calendarEventDurationMinutes, filterCalendarAgenda, formatCalendarDuration, summarizeCalendarAgenda } from "../lib/calendar-features"

const events = [
  event("study_today", "study", "2026-05-16T02:00:00.000Z", "2026-05-16T02:45:00.000Z"),
  event("review_today", "review", "2026-05-16T04:00:00.000Z", "2026-05-16T04:30:00.000Z"),
  event("done", "completed", "2026-05-15T04:00:00.000Z", "2026-05-15T05:00:00.000Z"),
  event("future", "focus", "2026-05-18T03:00:00.000Z", "2026-05-18T05:00:00.000Z"),
]

test("calendar agenda summary counts actionable blocks", () => {
  const summary = summarizeCalendarAgenda(events, new Date("2026-05-16T01:00:00.000Z"))

  assert.equal(summary.total, 4)
  assert.equal(summary.today, 2)
  assert.equal(summary.upcoming, 3)
  assert.equal(summary.completed, 1)
  assert.equal(summary.review, 1)
  assert.equal(summary.scheduledMinutes, 195)
})

test("calendar summary chips separate visible planning signals from details", () => {
  const summary = summarizeCalendarAgenda(events, new Date("2026-05-16T01:00:00.000Z"))
  const chips = buildCalendarSummaryChips(summary)

  assert.deepEqual(chips.filter((chip) => chip.priority === "primary").map((chip) => chip.id), ["today", "upcoming", "planned"])
  assert.deepEqual(chips.map((chip) => [chip.label, chip.value]), [
    ["Today", "2"],
    ["Upcoming", "3"],
    ["Planned", "3h 15m"],
    ["Review", "1"],
    ["Done", "1"],
    ["Total", "4"],
  ])
})

test("calendar agenda filters by today upcoming review and completed", () => {
  const now = new Date("2026-05-16T01:00:00.000Z")

  assert.deepEqual(filterCalendarAgenda(events, "today", now).map((item) => item.id), ["study_today", "review_today"])
  assert.deepEqual(filterCalendarAgenda(events, "upcoming", now).map((item) => item.id), ["study_today", "review_today", "future"])
  assert.deepEqual(filterCalendarAgenda(events, "review", now).map((item) => item.id), ["review_today"])
  assert.deepEqual(filterCalendarAgenda(events, "completed", now).map((item) => item.id), ["done"])
})

test("calendar duration helpers handle readable time labels", () => {
  assert.equal(calendarEventDurationMinutes(events[3]), 120)
  assert.equal(formatCalendarDuration(45), "45m")
  assert.equal(formatCalendarDuration(120), "2h")
  assert.equal(formatCalendarDuration(135), "2h 15m")
})

test("calendar day segments group blocks into readable day parts", () => {
  const segments = buildCalendarDaySegments([
    localEvent("evening", "review", 19, 30),
    localEvent("morning", "study", 9, 45),
    localEvent("afternoon", "focus", 13, 60),
  ])

  assert.deepEqual(segments.map((segment) => segment.id), ["morning", "afternoon", "evening"])
  assert.deepEqual(segments.map((segment) => segment.events[0]?.id), ["morning", "afternoon", "evening"])
  assert.deepEqual(segments.map((segment) => segment.totalMinutes), [45, 60, 30])
})

test("calendar month grid summarizes visible day workload", () => {
  const grid = buildCalendarMonthGrid(new Date(2026, 4, 1), [
    localEvent("review", "review", 9, 30),
    localEvent("study", "study", 13, 45),
    localEvent("done", "completed", 18, 15),
  ], new Date(2026, 4, 16, 8, 0))
  const day = grid.find((item) => item.key === "2026-05-16")

  assert.equal(grid.length, 42)
  assert.equal(day?.isToday, true)
  assert.equal(day?.totalEvents, 3)
  assert.equal(day?.totalMinutes, 90)
  assert.equal(day?.reviewCount, 1)
  assert.equal(day?.completedCount, 1)
  assert.deepEqual(day?.events.map((item) => item.id), ["review", "study", "done"])
  assert.ok(day?.firstEventTime)
})

test("calendar planning summary suggests useful next blocks", () => {
  const now = new Date("2026-05-16T01:00:00.000Z")
  const emptyPlan = buildCalendarPlanningSummary([], { defaultMinutes: 45, leadMinutes: 15, now })
  const noReviewPlan = buildCalendarPlanningSummary([events[0]], { defaultMinutes: 45, leadMinutes: 15, now })
  const readyPlan = buildCalendarPlanningSummary(events, { defaultMinutes: 45, leadMinutes: 15, now })

  assert.equal(emptyPlan.suggestion.eventType, "focus")
  assert.equal(emptyPlan.tone, "watch")
  assert.equal(noReviewPlan.suggestion.eventType, "review")
  assert.equal(readyPlan.tone, "good")
})

function event(id: string, event_type: string, starts_at: string, ends_at: string) {
  return { id, event_type, starts_at, ends_at }
}

function localEvent(id: string, event_type: string, hour: number, minutes: number) {
  const start = new Date(2026, 4, 16, hour, 0)
  const end = new Date(start.getTime() + minutes * 60_000)
  return event(id, event_type, start.toISOString(), end.toISOString())
}
