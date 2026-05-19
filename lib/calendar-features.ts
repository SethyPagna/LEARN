export type CalendarAgendaFilter = "all" | "today" | "upcoming" | "review" | "completed"

export interface CalendarEventLike {
  id: string
  event_type: string
  starts_at: string
  ends_at: string
}

export interface CalendarAgendaSummary {
  total: number
  today: number
  upcoming: number
  completed: number
  review: number
  scheduledMinutes: number
}

export interface CalendarPlanningInput {
  defaultMinutes: number
  leadMinutes: number
  now?: Date
}

export interface CalendarPlanningSuggestion {
  title: string
  eventType: string
  durationMinutes: number
  startsAt: Date
  reason: string
}

export interface CalendarPlanningSummary {
  headline: string
  tone: "good" | "watch" | "neutral"
  chips: string[]
  suggestion: CalendarPlanningSuggestion
}

export interface CalendarDaySegment<T extends CalendarEventLike = CalendarEventLike> {
  events: T[]
  id: "morning" | "afternoon" | "evening"
  label: string
  totalMinutes: number
}

export interface CalendarMonthDay<T extends CalendarEventLike = CalendarEventLike> {
  completedCount: number
  events: T[]
  firstEventTime?: string
  inMonth: boolean
  isToday: boolean
  key: string
  label: string
  reviewCount: number
  totalEvents: number
  totalMinutes: number
}

const MINUTES_PER_HOUR = 60
const MS_PER_MINUTE = 60_000
const HIGH_SCHEDULED_MINUTES = 240

export function summarizeCalendarAgenda(events: CalendarEventLike[], now = new Date()): CalendarAgendaSummary {
  const todayKey = dateKey(now)
  let today = 0
  let upcoming = 0
  let completed = 0
  let review = 0
  let scheduledMinutes = 0

  for (const event of events) {
    const startsAt = new Date(event.starts_at)
    if (dateKey(startsAt) === todayKey) today += 1
    if (startsAt.getTime() >= now.getTime() && event.event_type !== "completed") upcoming += 1
    if (event.event_type === "completed") completed += 1
    if (event.event_type === "review") review += 1
    if (event.event_type !== "completed") scheduledMinutes += calendarEventDurationMinutes(event)
  }

  return { total: events.length, today, upcoming, completed, review, scheduledMinutes }
}

export function filterCalendarAgenda<T extends CalendarEventLike>(events: T[], filter: CalendarAgendaFilter, now = new Date()) {
  const todayKey = dateKey(now)
  const nowTime = now.getTime()
  return events.filter((event) => {
    if (filter === "all") return true
    if (filter === "today") return dateKey(new Date(event.starts_at)) === todayKey
    if (filter === "upcoming") return new Date(event.starts_at).getTime() >= nowTime && event.event_type !== "completed"
    return event.event_type === filter
  })
}

export function calendarEventDurationMinutes(event: Pick<CalendarEventLike, "starts_at" | "ends_at">) {
  const start = Date.parse(event.starts_at)
  const end = Date.parse(event.ends_at)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0
  return Math.round((end - start) / MS_PER_MINUTE)
}

export function formatCalendarDuration(minutes: number) {
  if (minutes < MINUTES_PER_HOUR) return `${minutes}m`
  const hours = Math.floor(minutes / MINUTES_PER_HOUR)
  const remainder = minutes % MINUTES_PER_HOUR
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`
}

export function buildCalendarDaySegments<T extends CalendarEventLike>(events: readonly T[]): Array<CalendarDaySegment<T>> {
  const segments: Array<CalendarDaySegment<T>> = [
    { events: [], id: "morning", label: "Morning", totalMinutes: 0 },
    { events: [], id: "afternoon", label: "Afternoon", totalMinutes: 0 },
    { events: [], id: "evening", label: "Evening", totalMinutes: 0 },
  ]

  for (const event of [...events].sort((first, second) => Date.parse(first.starts_at) - Date.parse(second.starts_at))) {
    const hour = new Date(event.starts_at).getHours()
    const segment = hour < 12 ? segments[0] : hour < 17 ? segments[1] : segments[2]
    segment.events.push(event)
    segment.totalMinutes += calendarEventDurationMinutes(event)
  }

  return segments
}

export function buildCalendarMonthGrid<T extends CalendarEventLike>(
  month: Date,
  events: readonly T[],
  now = new Date(),
): Array<CalendarMonthDay<T>> {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const start = new Date(first)
  start.setDate(first.getDate() - first.getDay())
  const todayKey = localDateKey(now)
  const eventsByDay = new Map<string, T[]>()

  for (const event of events) {
    const key = localDateKey(new Date(event.starts_at))
    const dayEvents = eventsByDay.get(key) || []
    dayEvents.push(event)
    eventsByDay.set(key, dayEvents)
  }

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    const key = localDateKey(date)
    const dayEvents = [...(eventsByDay.get(key) || [])].sort(compareCalendarEventTimes)
    const firstEvent = dayEvents[0]

    return {
      completedCount: dayEvents.filter((event) => event.event_type === "completed").length,
      events: dayEvents,
      firstEventTime: firstEvent ? formatCalendarClockTime(new Date(firstEvent.starts_at)) : undefined,
      inMonth: date.getMonth() === month.getMonth(),
      isToday: key === todayKey,
      key,
      label: String(date.getDate()),
      reviewCount: dayEvents.filter((event) => event.event_type === "review").length,
      totalEvents: dayEvents.length,
      totalMinutes: dayEvents.reduce((sum, event) => sum + calendarEventDurationMinutes(event), 0),
    }
  })
}

export function buildCalendarPlanningSummary(
  events: CalendarEventLike[],
  input: CalendarPlanningInput,
): CalendarPlanningSummary {
  const now = input.now ?? new Date()
  const summary = summarizeCalendarAgenda(events, now)
  const startsAt = new Date(now.getTime() + Math.max(0, input.leadMinutes) * MS_PER_MINUTE)

  if (summary.today === 0) {
    return {
      headline: "Plan the first block for today",
      tone: "watch",
      chips: [`${summary.upcoming} upcoming`, "today empty"],
      suggestion: {
        title: `${Math.max(5, input.defaultMinutes)} min focus block`,
        eventType: "focus",
        durationMinutes: Math.max(5, input.defaultMinutes),
        startsAt,
        reason: "A first block makes the dashboard route actionable.",
      },
    }
  }

  if (summary.review === 0) {
    return {
      headline: "Add one review checkpoint",
      tone: "neutral",
      chips: [`${summary.today} today`, "no review block"],
      suggestion: {
        title: "Review weak topics",
        eventType: "review",
        durationMinutes: Math.min(30, Math.max(10, input.defaultMinutes)),
        startsAt,
        reason: "A short review block keeps practice connected to retention.",
      },
    }
  }

  if (summary.scheduledMinutes > HIGH_SCHEDULED_MINUTES) {
    return {
      headline: "Schedule looks heavy",
      tone: "watch",
      chips: [`${formatCalendarDuration(summary.scheduledMinutes)} planned`, `${summary.upcoming} upcoming`],
      suggestion: {
        title: "Recovery or reflection block",
        eventType: "study",
        durationMinutes: 15,
        startsAt,
        reason: "Heavy days need a small reflection block instead of more load.",
      },
    }
  }

  return {
    headline: "Calendar is ready",
    tone: "good",
    chips: [`${summary.today} today`, `${formatCalendarDuration(summary.scheduledMinutes)} planned`],
    suggestion: {
      title: "Next study block",
      eventType: "study",
      durationMinutes: Math.max(5, input.defaultMinutes),
      startsAt,
      reason: "Add the next block only when the current route needs it.",
    },
  }
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function localDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function compareCalendarEventTimes(first: CalendarEventLike, second: CalendarEventLike) {
  return Date.parse(first.starts_at) - Date.parse(second.starts_at)
}

function formatCalendarClockTime(date: Date) {
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
}
