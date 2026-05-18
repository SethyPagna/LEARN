PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS collaboration_sessions (
  id text PRIMARY KEY,
  content_item_id text REFERENCES content_items(id) ON DELETE CASCADE,
  room_id text REFERENCES study_rooms(id) ON DELETE SET NULL,
  battle_id text REFERENCES study_battles(id) ON DELETE SET NULL,
  session_type text NOT NULL CHECK (session_type IN ('editor', 'room', 'battle', 'presence')),
  status text NOT NULL DEFAULT 'active',
  started_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  started_at text NOT NULL DEFAULT (datetime('now')),
  ended_at text
);

CREATE TABLE IF NOT EXISTS collaboration_events (
  id text PRIMARY KEY,
  session_id text NOT NULL REFERENCES collaboration_sessions(id) ON DELETE CASCADE,
  user_id text REFERENCES users(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('presence', 'pomodoro', 'battle-answer', 'editor-change', 'snapshot')),
  payload text NOT NULL DEFAULT '{}',
  durable_object_key text,
  created_at text NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS client_mutations (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_item_id text REFERENCES content_items(id) ON DELETE CASCADE,
  mutation_type text NOT NULL,
  payload text NOT NULL DEFAULT '{}',
  client_created_at text NOT NULL,
  server_received_at text NOT NULL DEFAULT (datetime('now')),
  applied_at text,
  status text NOT NULL DEFAULT 'pending'
);

CREATE INDEX IF NOT EXISTS idx_collaboration_sessions_type_status
  ON collaboration_sessions(session_type, status, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_collaboration_sessions_content
  ON collaboration_sessions(content_item_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_collaboration_events_session
  ON collaboration_events(session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_collaboration_events_type
  ON collaboration_events(event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_client_mutations_user_status
  ON client_mutations(user_id, status, server_received_at DESC);

CREATE INDEX IF NOT EXISTS idx_client_mutations_content
  ON client_mutations(content_item_id, server_received_at DESC);
