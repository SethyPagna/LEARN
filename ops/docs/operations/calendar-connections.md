# Calendar connections

LEARN supports Google Calendar, Outlook and Apple iCloud Calendar through its
Calendar → Connections panel. Connected events are read directly from each
provider. Create, edit and delete actions write back to the selected calendar;
events are not copied into LEARN's local event table.

While LEARN is open, the visible calendar range refreshes every two minutes and
when the window regains focus. This is automatic polling, not a background
webhook service. Offline writes are not queued. A failed provider remains visibly
marked unavailable, with its last successful results retained in the session.

## Server setup

1. Apply migration `0018_calendar_connections.sql` with the normal D1 migration
   workflow. It has been applied locally; remote deployment needs its own migration.
2. Set a persistent random `CALENDAR_ENCRYPTION_KEY` of at least 32 characters.
   Use the deployment secret store; for development use ignored `.env.local`.
   Restart the development server after adding it. Never commit this key.
3. Set `APP_BASE_URL` to the actual application origin and register the exact
   redirect URL `<APP_BASE_URL>/api/calendar/connections/callback` with both OAuth
   providers. Local development uses
   `http://localhost:3000/api/calendar/connections/callback`.
4. Configure the provider credentials below. Users then authorize their own
   accounts from Connections. Missing provider configuration displays “Setup needed”.

Credentials are encrypted with AES-256-GCM and bound to the owning user and
connection. Changing the encryption key makes existing credentials unreadable;
users must reconnect. A sufficiently long `SESSION_SECRET` is a fallback, but a
dedicated persistent calendar key is preferred. Disconnect removes LEARN's stored
connection, not provider events. Users may also revoke access at their provider.

## Google Calendar

Enable the Google Calendar API, configure the OAuth consent screen, and create
a web application OAuth client with the redirect above. Set:

```text
GOOGLE_CALENDAR_CLIENT_ID
GOOGLE_CALENDAR_CLIENT_SECRET
```

The application requests `calendar.calendarlist.readonly` and `calendar.events`,
with offline access and PKCE. Add intended accounts as test users while the OAuth
app is in testing. Public rollout may require Google's consent/verification steps.
See [Google Calendar authorization](https://developers.google.com/workspace/calendar/api/auth)
and [web server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server).

## Outlook

Register a Microsoft identity web application supporting the intended Microsoft
accounts, add the redirect above, and configure delegated Microsoft Graph
`Calendars.ReadWrite` access. The implementation uses the `common` authority and
requests `offline_access` so it can refresh access tokens. Set:

```text
MICROSOFT_CALENDAR_CLIENT_ID
MICROSOFT_CALENDAR_CLIENT_SECRET
```

Tenant policy may require administrator consent. Calendar views expand recurring
events; see [Microsoft calendarView](https://learn.microsoft.com/en-us/graph/api/calendar-list-calendarview?view=graph-rest-1.0)
and [creating calendar events](https://learn.microsoft.com/en-us/graph/api/calendar-post-events?view=graph-rest-1.0).

## Apple Calendar

This connects calendars hosted in **iCloud**, not every account displayed inside
the Apple Calendar desktop application. Users enter their Apple Account email and
an [app-specific password](https://support.apple.com/102654) in Connections.
An encryption key is required; no Google/Microsoft OAuth application is needed.
Passwords are accepted only by LEARN's authenticated server route and used only
against allowlisted HTTPS iCloud CalDAV hosts.

The implementation discovers calendars through CalDAV, expands recurring events
for the visible range, and edits/deletes individual occurrences while preserving
the series. Whole-series editing is intentionally unavailable. Protocol reference:
[CalDAV RFC 4791](https://www.rfc-editor.org/rfc/rfc4791).

## Behavior and verification limits

- Read-only calendars remain viewable; saving and deleting are disabled.
- Existing edits use provider ETags. A concurrent edit asks the user to reopen
  the event instead of overwriting a newer version.
- Category and individual-calendar filters affect visibility. Planning suggestions
  still consider hidden events when avoiding scheduling conflicts.
- Connected event editing covers title, timing, notes and reminders. Attendee
  management, calendar moves and recurring-series creation are not editor features.
- Automated tests cover ownership, encrypted storage, request pagination, bounded
  ranges, write payloads, concurrency conflicts and recurring Apple occurrences.
  Live authorization and create/edit/delete round trips still need configured
  Google, Microsoft and iCloud test accounts before production rollout.

No provider credentials or live calendar accounts were available during this
implementation. Do not interpret passing mocked-provider tests as live-provider
verification.
