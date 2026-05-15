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

const MINUTES_PER_HOUR = 60
const MS_PER_MINUTE = 60_000

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

export function filterCalendarAgenda(events: CalendarEventLike[], filter: CalendarAgendaFilter, now = new Date()) {
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

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}
