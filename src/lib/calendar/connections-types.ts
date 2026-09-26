import type { CalendarEvent } from "@/components/learn/types"

export type CalendarProvider = "google" | "outlook" | "apple"
export type CalendarCredentials = { accessToken?: string; refreshToken?: string; expiresAt?: number; username?: string; password?: string; homeUrl?: string }
export type CalendarConnection = { id: string; user_id: string; provider: CalendarProvider; label: string; credentials: string }
export type ConnectedCalendar = { id: string; connectionId: string; name: string; provider: CalendarProvider; writable: boolean; color?: string }
export type RemoteEvent = CalendarEvent & { remote: NonNullable<CalendarEvent["remote"]> }
export type ConnectedEventChange = { eventId?: string; etag?: string; recurrenceId?: string; input?: CalendarEventInput; remove?: boolean }
export type CalendarEventInput = { title: string; startsAt: string; endsAt: string; notes: string; reminderMinutes: number; allDay: boolean }
export type CalendarRange = { start: string; end: string }

export function parseEventInput(value: Record<string, unknown>): CalendarEventInput {
  const title = typeof value.title === "string" ? value.title.trim() : ""
  const start = Date.parse(String(value.startsAt || "")), end = Date.parse(String(value.endsAt || ""))
  if (!title || title.length > 200 || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error("Add a title and a valid start and end time.")
  const reminder = Number(value.reminderMinutes ?? 15)
  if (!Number.isFinite(reminder) || reminder < 0 || reminder > 40320) throw new Error("Choose a valid reminder.")
  return { title, startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString(), notes: String(value.notes || "").slice(0, 10000), reminderMinutes: Math.floor(reminder), allDay: value.allDay === true }
}

export function parseCalendarRange(start: string | null, end: string | null): CalendarRange {
  const first = Date.parse(start || ""), last = Date.parse(end || "")
  if (!Number.isFinite(first) || !Number.isFinite(last) || last <= first || last - first > 100 * 86400000) throw new Error("Choose a calendar window of up to 100 days.")
  return { start: new Date(first).toISOString(), end: new Date(last).toISOString() }
}
