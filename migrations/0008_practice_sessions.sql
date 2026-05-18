PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS practice_sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  session_type text NOT NULL CHECK (session_type IN ('quiz', 'exam', 'flashcards', 'matching', 'sprint', 'review', 'battle')),
  source_content_item_id text REFERENCES content_items(id) ON DELETE SET NULL,
  started_at text NOT NULL DEFAULT (datetime('now')),
  ended_at text,
  duration_seconds integer NOT NULL DEFAULT 0,
  score integer NOT NULL DEFAULT 0,
  total integer NOT NULL DEFAULT 0,
  metadata text NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS practice_session_items (
  id text PRIMARY KEY,
  session_id text NOT NULL REFERENCES practice_sessions(id) ON DELETE CASCADE,
  question_id text,
  review_item_id text REFERENCES review_items(id) ON DELETE SET NULL,
  content_item_id text REFERENCES content_items(id) ON DELETE SET NULL,
  prompt text NOT NULL DEFAULT '',
  answer text NOT NULL DEFAULT '',
  user_answer text NOT NULL DEFAULT '',
  correct integer NOT NULL DEFAULT 0,
  elapsed_ms integer NOT NULL DEFAULT 0,
  metadata text NOT NULL DEFAULT '{}',
  created_at text NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_practice_sessions_user_recent
  ON practice_sessions(user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_practice_sessions_type_recent
  ON practice_sessions(session_type, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_practice_sessions_source
  ON practice_sessions(source_content_item_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_practice_session_items_session
  ON practice_session_items(session_id, created_at);

CREATE INDEX IF NOT EXISTS idx_practice_session_items_review
  ON practice_session_items(review_item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_practice_session_items_content
  ON practice_session_items(content_item_id, created_at DESC);
