import type { CalendarConnection, CalendarRange, ConnectedCalendar, ConnectedEventChange } from "./connections-types"
import { readCredentials } from "./connection-store"
import { listAppleCalendars, listAppleEvents, writeAppleEvent } from "./apple"
import { listOAuthCalendars, listOAuthEvents, writeOAuthEvent } from "./google-outlook"

export async function listProviderCalendars(connection: CalendarConnection) {
  return connection.provider === "apple" ? listAppleCalendars(await readCredentials(connection), connection.id) : listOAuthCalendars(connection)
}

export async function readConnectedCalendar(connection: CalendarConnection, range: CalendarRange) {
  const calendars = await listProviderCalendars(connection)
  if (calendars.length > 50) throw new Error("This account has more than 50 calendars; connect a smaller calendar account.")
  const items = []
  // Bounded batches avoid a burst of provider requests for large accounts.
  for (let index = 0; index < calendars.length; index += 4) {
    const batch = await Promise.all(calendars.slice(index, index + 4).map(async calendar => connection.provider === "apple" ? listAppleEvents(await readCredentials(connection), calendar, range) : listOAuthEvents(connection, calendar, range)))
    items.push(...batch.flat())
  }
  return { calendars, items }
}

export async function changeConnectedEvent(connection: CalendarConnection, calendarId: string, change: ConnectedEventChange) {
  const calendar: ConnectedCalendar | undefined = (await listProviderCalendars(connection)).find(item => item.id === calendarId)
  if (!calendar?.writable) throw new Error("This calendar is read-only or no longer available.")
  if (connection.provider === "apple") await writeAppleEvent(await readCredentials(connection), calendar.id, change)
  else await writeOAuthEvent(connection, calendar.id, change)
}
