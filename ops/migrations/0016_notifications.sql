PRAGMA foreign_keys = ON;

-- Per-person notifications: connection requests, mentions, missed calls,
-- shares, game invites. Rows are written by the server only; the bell in the
-- top bar reads them, and a live copy is pushed to the owner's realtime inbox.
--
-- `created_at` is an ISO-8601 string with milliseconds written by the app, so
-- two notifications in the same second still sort in the order they happened.
-- `group_key` lets a burst of the same thing (five messages in one group) fold
-- into one row instead of five: an unread row with the same key is updated in
-- place rather than inserted again.
CREATE TABLE IF NOT EXISTS notifications (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  link text NOT NULL DEFAULT '',
  actor_user_id text REFERENCES users(id) ON DELETE SET NULL,
  group_key text,
  metadata text NOT NULL DEFAULT '{}',
  created_at text NOT NULL,
  read_at text
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_recent ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_notifications_group ON notifications(user_id, group_key, read_at);
