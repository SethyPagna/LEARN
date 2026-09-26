import type { CalendarConnection, CalendarEventInput, CalendarRange, ConnectedCalendar, RemoteEvent } from "./connections-types"
import { accessToken } from "./oauth"
import { calendarFetch, calendarJson } from "./provider-http"

type ProviderRecord = Record<string, unknown>
const record = (value: unknown): ProviderRecord => value && typeof value === "object" && !Array.isArray(value) ? value as ProviderRecord : {}
const string = (value: unknown) => typeof value === "string" ? value : ""
const rootFor = (connection: CalendarConnection) => connection.provider === "google" ? "https://www.googleapis.com/calendar/v3" : "https://graph.microsoft.com/v1.0"
async function headers(connection: CalendarConnection) { return { Authorization: `Bearer ${await accessToken(connection)}`, "Content-Type": "application/json", Prefer: 'outlook.timezone="UTC"' } }

async function paged(connection: CalendarConnection, path: string) {
  const root = rootFor(connection), items: ProviderRecord[] = [], auth = await headers(connection)
  let next = `${root}${path}`
  for (let page = 0; next && page < 20; page++) {
    if (new URL(next).origin !== new URL(root).origin || !new URL(next).pathname.startsWith(new URL(root).pathname)) throw new Error("Unexpected calendar page address.")
    const result = await calendarJson<ProviderRecord>(next, { headers: auth })
    const list = result.items || result.value
    if (Array.isArray(list)) items.push(...list.map(record))
    if (result.nextPageToken) { const url = new URL(`${root}${path}`); url.searchParams.set("pageToken", string(result.nextPageToken)); next = url.href }
    else next = string(result["@odata.nextLink"])
  }
  if (next) throw new Error("This calendar has too many events for this window. Choose a smaller date range.")
  return items
}

export async function listOAuthCalendars(connection: CalendarConnection): Promise<ConnectedCalendar[]> {
  const google = connection.provider === "google"
  const items = await paged(connection, google ? "/users/me/calendarList?maxResults=250" : "/me/calendars?$top=100")
  return items.map(item => ({ id: string(item.id), name: string(item.summary || item.name) || "Calendar", provider: connection.provider, connectionId: connection.id, color: string(item.backgroundColor || item.hexColor), writable: google ? ["owner", "writer"].includes(string(item.accessRole)) : item.canEdit === true }))
}

export function normalizeOAuthEvent(item: ProviderRecord, calendar: ConnectedCalendar): RemoteEvent | null {
  if (item.status === "cancelled" || item.isCancelled === true) return null
  const google = calendar.provider === "google", start = record(item.start), end = record(item.end)
  const allDay = Boolean(start.date || item.isAllDay)
  const normalizeTime = (part: ProviderRecord) => {
    const value = string(part.dateTime || part.date)
    if (!value) return ""
    if (allDay) return value.slice(0, 10) + "T00:00:00.000Z"
    return /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}Z`
  }
  const startsAt = normalizeTime(start), endsAt = normalizeTime(end)
  if (!Number.isFinite(Date.parse(startsAt)) || !Number.isFinite(Date.parse(endsAt))) return null
  const body = record(item.body), reminders = record(item.reminders), overrides = Array.isArray(reminders.overrides) ? reminders.overrides.map(record) : []
  const rawNotes = google ? string(item.description) : body.contentType === "text" ? string(body.content) : string(item.bodyPreview)
  return { id: `${calendar.connectionId}:${calendar.id}:${string(item.id)}`, title: string(item.summary || item.subject) || "Untitled event", event_type: "study", starts_at: startsAt, ends_at: endsAt, timezone: "UTC", notes: rawNotes, reminder_minutes: google ? Number(overrides[0]?.minutes || 0) : item.isReminderOn ? Number(item.reminderMinutesBeforeStart || 0) : 0, allDay, remote: { connectionId: calendar.connectionId, calendarId: calendar.id, eventId: string(item.id), etag: string(item.etag || item["@odata.etag"]), provider: calendar.provider, writable: calendar.writable, recurring: Boolean(item.recurringEventId || item.seriesMasterId) } }
}

export async function listOAuthEvents(connection: CalendarConnection, calendar: ConnectedCalendar, range: CalendarRange) {
  const google = connection.provider === "google"
  const query = google ? new URLSearchParams({ timeMin: range.start, timeMax: range.end, singleEvents: "true", maxResults: "2500", orderBy: "startTime" }) : new URLSearchParams({ startDateTime: range.start, endDateTime: range.end, "$top": "1000" })
  const path = google ? `/calendars/${encodeURIComponent(calendar.id)}/events` : `/me/calendars/${encodeURIComponent(calendar.id)}/calendarView`
  return (await paged(connection, `${path}?${query}`)).map(item => normalizeOAuthEvent(item, calendar)).filter((item): item is RemoteEvent => Boolean(item))
}

export function oauthEventPayload(input: CalendarEventInput, provider: string) {
  if (provider === "google") return { summary: input.title, description: input.notes, start: input.allDay ? { date: input.startsAt.slice(0, 10) } : { dateTime: input.startsAt }, end: input.allDay ? { date: input.endsAt.slice(0, 10) } : { dateTime: input.endsAt }, reminders: { useDefault: false, overrides: input.reminderMinutes ? [{ method: "popup", minutes: input.reminderMinutes }] : [] } }
  return { subject: input.title, body: { contentType: "text", content: input.notes }, start: { dateTime: input.startsAt.replace("Z", ""), timeZone: "UTC" }, end: { dateTime: input.endsAt.replace("Z", ""), timeZone: "UTC" }, isAllDay: input.allDay, isReminderOn: input.reminderMinutes > 0, reminderMinutesBeforeStart: input.reminderMinutes }
}

export async function writeOAuthEvent(connection: CalendarConnection, calendarId: string, change: { eventId?: string; etag?: string; input?: CalendarEventInput; remove?: boolean }) {
  const google = connection.provider === "google", base = google ? `/calendars/${encodeURIComponent(calendarId)}/events` : `/me/calendars/${encodeURIComponent(calendarId)}/events`
  const path = change.eventId ? `${base}/${encodeURIComponent(change.eventId)}` : base
  if (change.eventId && !change.etag) throw new Error("Reopen this event before editing so changes from another app are preserved.")
  const auth = await headers(connection)
  const payload: ProviderRecord | undefined = change.input ? oauthEventPayload(change.input, connection.provider) : undefined
  if (!google && change.eventId && change.input && payload) {
    const current = await calendarJson<ProviderRecord>(`${rootFor(connection)}${path}`, { headers: auth })
    const body = record(current.body)
    // Outlook's preview is plain text. A title-only edit must retain its rich body.
    if (change.input.notes === string(current.bodyPreview) || change.input.notes === string(body.content)) delete payload.body
  }
  await calendarFetch(`${rootFor(connection)}${path}`, { method: change.remove ? "DELETE" : change.eventId ? "PATCH" : "POST", headers: { ...auth, ...(change.etag ? { "If-Match": change.etag } : {}) }, ...(payload ? { body: JSON.stringify(payload) } : {}) })
}
