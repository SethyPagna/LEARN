import ICAL from "ical.js"
import { randomUUID } from "node:crypto"
import { descendants, findFirst, parseXml, textWithBreaks, type XmlElement } from "@/lib/export/xml-read"
import { calendarResponseText } from "./provider-http"
import type { CalendarCredentials, CalendarEventInput, CalendarRange, ConnectedCalendar, ConnectedEventChange, RemoteEvent } from "./connections-types"

const DAV_ROOT = "https://caldav.icloud.com/"
const xmlText = (node: XmlElement, name: string) => { const found = findFirst(node, name); return found ? textWithBreaks(found).trim() : "" }

export function appleCalendarUrl(value: string, base = DAV_ROOT) {
  const url = new URL(value, base)
  if (url.protocol !== "https:" || url.port && url.port !== "443" || url.username || url.password || !(url.hostname === "caldav.icloud.com" || /^p\d+-caldav\.icloud\.com$/.test(url.hostname))) throw new Error("Unexpected Apple Calendar address.")
  return url.href
}

async function davRequest(credentials: CalendarCredentials, address: string, init: RequestInit = {}) {
  let url = appleCalendarUrl(address)
  if (!credentials.username || !credentials.password) throw new Error("Reconnect Apple Calendar to continue.")
  const authorization = `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64")}`
  for (let redirects = 0; redirects < 4; redirects++) {
    let response: Response
    try { response = await fetch(url, { ...init, cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(15000), headers: { ...init.headers, Authorization: authorization } }) }
    catch { throw new Error("Apple Calendar is unavailable. Try again shortly.") }
    if ([301, 302, 307, 308].includes(response.status)) { url = appleCalendarUrl(response.headers.get("location") || "", url); continue }
    if (response.status === 401 || response.status === 403) throw new Error("Apple could not authorize this calendar. Check your app-specific password and permissions.")
    if (response.status === 412) throw new Error("This event changed in another app. Close and reopen it before editing.")
    if (!response.ok) throw new Error(`Apple Calendar could not complete this action (${response.status}).`)
    return response
  }
  throw new Error("Apple Calendar redirected too many times.")
}

async function davXml(credentials: CalendarCredentials, url: string, body: string, method = "PROPFIND", depth = "0") {
  return parseXml(await calendarResponseText(await davRequest(credentials, url, { method, headers: { "Content-Type": "application/xml; charset=utf-8", Depth: depth }, body })), "Apple Calendar")
}
const propfind = (props: string) => `<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop>${props}</d:prop></d:propfind>`

export async function discoverAppleCredentials(username: string, password: string): Promise<CalendarCredentials> {
  if (!/^[^\s@:]+@[^\s@]+\.[^\s@]+$/.test(username) || !/^[a-z]{4}(?:-[a-z]{4}){3}$/i.test(password)) throw new Error("Enter your Apple Account email and its app-specific password.")
  const credentials = { username, password }
  const principal = await davXml(credentials, DAV_ROOT, propfind("<d:current-user-principal/>"))
  const principalNode = findFirst(principal, "current-user-principal")
  if (!principalNode) throw new Error("Apple Calendar did not return an account.")
  const principalUrl = appleCalendarUrl(xmlText(principalNode, "href"))
  const home = await davXml(credentials, principalUrl, propfind("<c:calendar-home-set/>"))
  const homeNode = findFirst(home, "calendar-home-set")
  if (!homeNode) throw new Error("Apple Calendar did not return a calendar collection.")
  return { ...credentials, homeUrl: appleCalendarUrl(xmlText(homeNode, "href"), principalUrl) }
}

export async function listAppleCalendars(credentials: CalendarCredentials, connectionId: string): Promise<ConnectedCalendar[]> {
  if (!credentials.homeUrl) throw new Error("Reconnect Apple Calendar to continue.")
  const xml = await davXml(credentials, credentials.homeUrl, propfind("<d:resourcetype/><d:displayname/><d:current-user-privilege-set/>"), "PROPFIND", "1")
  return descendants(xml, "response").filter(item => Boolean(findFirst(item, "calendar"))).map(item => ({ id: appleCalendarUrl(xmlText(item, "href"), credentials.homeUrl), name: xmlText(item, "displayname") || "Apple Calendar", connectionId, provider: "apple", writable: Boolean(findFirst(item, "write") || findFirst(item, "write-content") || findFirst(item, "all")) }))
}

export function parseAppleEvents(ics: string, calendar: ConnectedCalendar, address: string, etag: string): RemoteEvent[] {
  const component = new ICAL.Component(ICAL.parse(ics))
  for (const zone of component.getAllSubcomponents("vtimezone")) {
    const tzid = String(zone.getFirstPropertyValue("tzid") || "")
    if (tzid) ICAL.TimezoneService.register(new ICAL.Timezone({ component: zone, tzid }))
  }
  return component.getAllSubcomponents("vevent").flatMap(part => {
    const event = new ICAL.Event(part)
    if (part.getFirstPropertyValue("status") === "CANCELLED") return []
    const recurring = event.isRecurring() || Boolean(part.getFirstPropertyValue("recurrence-id"))
    const occurrence = part.getFirstPropertyValue("recurrence-id")
    const recurrenceId = occurrence instanceof ICAL.Time ? (occurrence.isDate ? occurrence : occurrence.convertToZone(ICAL.Timezone.utcTimezone)).toString() : undefined
    const trigger = part.getFirstSubcomponent("valarm")?.getFirstPropertyValue("trigger")
    const reminder = trigger instanceof ICAL.Duration ? Math.max(0, Math.round(-trigger.toSeconds() / 60)) : 0
    const start = event.startDate.toJSDate(), end = event.endDate.toJSDate()
    return [{ id: `${calendar.connectionId}:${address}:${start.toISOString()}`, title: event.summary || "Untitled event", event_type: "study", starts_at: start.toISOString(), ends_at: end.toISOString(), timezone: "UTC", notes: event.description || "", reminder_minutes: reminder, allDay: event.startDate.isDate, remote: { connectionId: calendar.connectionId, calendarId: calendar.id, eventId: appleCalendarUrl(address, calendar.id), etag, provider: "apple", writable: calendar.writable && (!recurring || Boolean(recurrenceId)), recurring, recurrenceId } } satisfies RemoteEvent]
  })
}

export async function listAppleEvents(credentials: CalendarCredentials, calendar: ConnectedCalendar, range: CalendarRange) {
  const compact = (date: string) => new Date(date).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")
  const bounds = `start="${compact(range.start)}" end="${compact(range.end)}"`
  const body = `<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data><c:expand ${bounds}/></c:calendar-data></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range ${bounds}/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`
  const xml = await davXml(credentials, calendar.id, body, "REPORT", "1")
  return descendants(xml, "response").flatMap(item => {
    const data = xmlText(item, "calendar-data")
    return data ? parseAppleEvents(data, calendar, xmlText(item, "href"), xmlText(item, "getetag")) : []
  })
}

export function updateAppleEvent(ics: string | null, input: CalendarEventInput, recurrenceId?: string) {
  const calendar = ics ? new ICAL.Component(ICAL.parse(ics)) : new ICAL.Component("vcalendar")
  calendar.updatePropertyWithValue("version", "2.0")
  calendar.updatePropertyWithValue("prodid", "-//LEARN//Calendar//EN")
  const existing = calendar.getAllSubcomponents("vevent")
  const master = existing.find(event => !event.hasProperty("recurrence-id"))
  if (!recurrenceId && (existing.length > 1 || existing.some(event => event.hasProperty("rrule") || event.hasProperty("recurrence-id") || event.hasProperty("rdate")))) throw new Error("Reopen an individual occurrence to edit this repeating event.")
  let component = existing[0] || new ICAL.Component("vevent")
  if (recurrenceId) {
    if (!master) throw new Error("The repeating event is no longer available.")
    const instance = ICAL.Time.fromString(recurrenceId, undefined)
    const exception = existing.find(item => { const value = item.getFirstPropertyValue("recurrence-id"); return value instanceof ICAL.Time && value.compare(instance) === 0 })
    component = exception || new ICAL.Component(JSON.parse(JSON.stringify(master.toJSON())))
    if (!exception) {
      for (const property of ["rrule", "rdate", "exdate"]) component.removeAllProperties(property)
      component.updatePropertyWithValue("recurrence-id", instance)
      calendar.addSubcomponent(component)
    }
  }
  if (!existing.length) calendar.addSubcomponent(component)
  const event = new ICAL.Event(component)
  if (!event.uid) event.uid = randomUUID()
  event.summary = input.title; event.description = input.notes
  event.startDate = input.allDay ? ICAL.Time.fromDateString(input.startsAt.slice(0, 10)) : ICAL.Time.fromJSDate(new Date(input.startsAt), true)
  component.removeAllProperties("duration")
  event.endDate = input.allDay ? ICAL.Time.fromDateString(input.endsAt.slice(0, 10)) : ICAL.Time.fromJSDate(new Date(input.endsAt), true)
  component.updatePropertyWithValue("dtstamp", ICAL.Time.fromJSDate(new Date(), true))
  component.updatePropertyWithValue("sequence", Number(component.getFirstPropertyValue("sequence") || 0) + 1)
  component.removeAllSubcomponents("valarm")
  if (input.reminderMinutes) {
    const alarm = new ICAL.Component("valarm")
    alarm.updatePropertyWithValue("action", "DISPLAY"); alarm.updatePropertyWithValue("description", input.title)
    alarm.updatePropertyWithValue("trigger", ICAL.Duration.fromSeconds(-input.reminderMinutes * 60))
    component.addSubcomponent(alarm)
  }
  return calendar.toString()
}

export function removeAppleOccurrence(ics: string, recurrenceId: string) {
  const calendar = new ICAL.Component(ICAL.parse(ics)), instance = ICAL.Time.fromString(recurrenceId, undefined)
  const events = calendar.getAllSubcomponents("vevent")
  const master = events.find(event => !event.hasProperty("recurrence-id"))
  if (!master) throw new Error("The repeating event is no longer available.")
  for (const event of events) { const id = event.getFirstPropertyValue("recurrence-id"); if (id instanceof ICAL.Time && id.compare(instance) === 0) calendar.removeSubcomponent(event) }
  master.addPropertyWithValue("exdate", instance)
  master.updatePropertyWithValue("sequence", Number(master.getFirstPropertyValue("sequence") || 0) + 1)
  master.updatePropertyWithValue("dtstamp", ICAL.Time.fromJSDate(new Date(), true))
  return calendar.toString()
}

export async function writeAppleEvent(credentials: CalendarCredentials, calendarId: string, change: ConnectedEventChange) {
  const base = appleCalendarUrl(calendarId)
  const address = appleCalendarUrl(change.eventId || `${randomUUID()}.ics`, base)
  if (new URL(address).origin !== new URL(base).origin || !new URL(address).pathname.startsWith(new URL(base).pathname)) throw new Error("The event does not belong to this calendar.")
  if (change.eventId && !change.etag) throw new Error("Reopen this event before editing.")
  let original: string | null = null
  if (change.eventId) {
    original = await calendarResponseText(await davRequest(credentials, address, { headers: { "If-Match": change.etag! } }))
    const components = new ICAL.Component(ICAL.parse(original)).getAllSubcomponents("vevent")
    if (!change.recurrenceId && (components.length !== 1 || components[0].hasProperty("rrule") || components[0].hasProperty("rdate") || components[0].hasProperty("recurrence-id"))) throw new Error("Reopen an individual occurrence to edit this repeating event.")
  }
  const occurrenceDelete = Boolean(change.remove && change.recurrenceId && original)
  const body = occurrenceDelete ? removeAppleOccurrence(original!, change.recurrenceId!) : change.input ? updateAppleEvent(original, change.input, change.recurrenceId) : undefined
  await davRequest(credentials, address, { method: change.remove && !occurrenceDelete ? "DELETE" : "PUT", headers: { "Content-Type": "text/calendar; charset=utf-8", ...(change.eventId ? { "If-Match": change.etag! } : { "If-None-Match": "*" }) }, ...(body ? { body } : {}) })
}
