/**
 * GET /api/calendar/ics — the calendar export and the subscription feed.
 *
 * Two ways in, one response:
 *
 *   1. With a session cookie, this exports the caller's own events. The
 *      "Download .ics" control in the Calendar view uses this.
 *   2. With `?token=<calendar_feed_token>`, it serves that user's events with
 *      **no session at all**. This is the one intentionally unauthenticated
 *      surface in the product, and it has to exist: a calendar app fetches a
 *      subscription URL on a timer from its own servers and cannot log in or
 *      hold a CSRF origin. The token in the URL *is* the identity.
 *
 * What keeps that acceptable:
 *   - It is read-only. No method other than GET is exported, so there is no
 *     state a caller can change through this route.
 *   - It is scoped to one user by exact token match, and the read behind it is
 *     `listOwnerCalendarEvents`, which cannot widen to other users even for an
 *     admin. One leaked URL exposes one person's schedule, never the workspace.
 *   - It is revocable: clearing `users.calendar_feed_token` invalidates every
 *     copy of the link at once, without touching sessions.
 *
 * The token is accepted as a query parameter, not a header, because that is the
 * only thing calendar clients can send. It will therefore land in access logs
 * and browser history — a deliberate trade for the feature working at all.
 */

import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

import { fail, withApiErrorBoundary } from "@/lib/api"
import { buildCalendarIcs, DEFAULT_ALARM_LEAD_MINUTES, type IcsEvent } from "@/lib/calendar/ics"
import { getCurrentUserFromToken, getUserByCalendarFeedToken, listOwnerCalendarEvents, SESSION_COOKIE } from "@/lib/data"
import { isDatabaseConfigured } from "@/lib/db"

/** Map one `calendar_events` row onto the exporter's schema-independent shape. */
function toIcsEvent(row: Record<string, unknown>): IcsEvent {
  const reminder = row.reminder_minutes
  return {
    id: String(row.id),
    title: String(row.title || "Study block"),
    startsAt: String(row.starts_at || ""),
    endsAt: String(row.ends_at || ""),
    description: String(row.notes || ""),
    reminderMinutes: reminder === null || reminder === undefined ? null : Number(reminder),
  }
}

export const GET = withApiErrorBoundary(async (request: NextRequest) => {
  // `requireApiUser` is not usable here: half of this route's purpose is to
  // answer without a session. Its first check still applies, so it is repeated.
  if (!(await isDatabaseConfigured())) {
    return fail("Cloudflare D1 is not configured. Set LEARN_DB binding or Cloudflare D1 API credentials.", 503)
  }

  const token = new URL(request.url).searchParams.get("token")?.trim() || ""
  // One identity per request. A supplied-but-invalid token is not retried
  // against the session cookie: a rotated or revoked link should fail loudly
  // rather than quietly start serving whichever account happens to be signed in
  // on the device that opened it.
  const user = token
    ? await getUserByCalendarFeedToken(token)
    : await getCurrentUserFromToken(request.cookies.get(SESSION_COOKIE)?.value)

  if (!user) {
    // Deliberately plain text, not the JSON `{ error }` shape: the consumers are
    // calendar clients, and an expired subscription is shown to them as the
    // response body. A sentence explains it; `{"error":…}` does not.
    return new NextResponse("Please sign in, or subscribe with a valid calendar feed URL.\n", {
      status: 401,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    })
  }

  const events = await listOwnerCalendarEvents(user.id)
  const body = buildCalendarIcs({
    calendarName: `${user.name} — Learn`,
    events: events.map(toIcsEvent),
    now: new Date(),
    alarmLeadMinutes: DEFAULT_ALARM_LEAD_MINUTES,
  })

  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'attachment; filename="learn-calendar.ics"',
      "cache-control": "no-store",
    },
  })
})
