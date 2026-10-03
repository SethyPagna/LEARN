PRAGMA foreign_keys = ON;

-- Two additive columns for "connect with local schedule apps, able to add alarm".
--
-- `calendar_feed_token` is the bearer credential in a subscription URL
-- (`/api/calendar/ics?token=…`). Calendar apps fetch a URL on a timer and
-- cannot sign in, so the URL itself has to carry the identity. It is stored as
-- plain text rather than hashed, unlike `user_sessions.token_hash`: the server
-- must be able to hand the user their own link back at any time, and a
-- calendar client re-fetches the same URL indefinitely, so the value has to be
-- recoverable. Clearing the column revokes the feed. The index makes the
-- lookup an exact-match seek instead of a table scan.
ALTER TABLE users ADD COLUMN calendar_feed_token text;

CREATE INDEX IF NOT EXISTS idx_users_calendar_feed_token ON users(calendar_feed_token);

-- Per-event alarm lead in minutes, written into the exported VEVENT as a
-- VALARM. NULL means "the user never chose", which falls back to the app-wide
-- default lead; 0 is an explicit "no alarm" and suppresses the VALARM. The two
-- are different states, so NULL is not normalised to 0 on write.
ALTER TABLE calendar_events ADD COLUMN reminder_minutes integer;
