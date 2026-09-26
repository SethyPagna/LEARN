CREATE TABLE IF NOT EXISTS calendar_connections (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google', 'outlook', 'apple')),
  label text NOT NULL,
  credentials text NOT NULL,
  created_at text NOT NULL DEFAULT (datetime('now')),
  updated_at text NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_calendar_connections_user ON calendar_connections(user_id);
