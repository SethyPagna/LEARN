PRAGMA foreign_keys = ON;

ALTER TABLE notes ADD COLUMN archived_at text;
ALTER TABLE ai_provider_configs ADD COLUMN provider_type text DEFAULT 'chat';
ALTER TABLE ai_provider_configs ADD COLUMN account_email text;
ALTER TABLE ai_provider_configs ADD COLUMN project_name text;
ALTER TABLE ai_provider_configs ADD COLUMN api_key_encrypted text;
ALTER TABLE ai_provider_configs ADD COLUMN supported_models_json text DEFAULT '[]';
ALTER TABLE ai_provider_configs ADD COLUMN endpoint_override text;
ALTER TABLE ai_provider_configs ADD COLUMN notes text;
ALTER TABLE ai_provider_configs ADD COLUMN priority integer DEFAULT 50;
ALTER TABLE ai_provider_configs ADD COLUMN requests_per_minute integer DEFAULT 10;
ALTER TABLE ai_provider_configs ADD COLUMN max_input_chars integer DEFAULT 1200;
ALTER TABLE ai_provider_configs ADD COLUMN max_completion_tokens integer DEFAULT 1800;
ALTER TABLE ai_provider_configs ADD COLUMN timeout_ms integer DEFAULT 18000;
ALTER TABLE ai_provider_configs ADD COLUMN cooldown_seconds integer DEFAULT 20;
ALTER TABLE ai_provider_configs ADD COLUMN last_status text DEFAULT 'untested';
ALTER TABLE ai_provider_configs ADD COLUMN last_error text DEFAULT '';
ALTER TABLE ai_provider_configs ADD COLUMN last_checked_at text;
ALTER TABLE ai_provider_configs ADD COLUMN updated_at text;

CREATE TABLE IF NOT EXISTS note_versions (
  id text PRIMARY KEY,
  note_id text NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  user_id text REFERENCES users(id) ON DELETE SET NULL,
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  metadata text NOT NULL DEFAULT '{}',
  created_at text NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS editor_documents (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  document_type text NOT NULL DEFAULT 'doc',
  content text NOT NULL DEFAULT '{}',
  tags text NOT NULL DEFAULT '[]',
  archived_at text,
  created_at text NOT NULL DEFAULT (datetime('now')),
  updated_at text NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sheet_documents (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  cells text NOT NULL DEFAULT '[]',
  history text NOT NULL DEFAULT '[]',
  archived_at text,
  created_at text NOT NULL DEFAULT (datetime('now')),
  updated_at text NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS slide_decks (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  slides text NOT NULL DEFAULT '[]',
  speaker_notes text NOT NULL DEFAULT '{}',
  archived_at text,
  created_at text NOT NULL DEFAULT (datetime('now')),
  updated_at text NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS calendar_events (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  event_type text NOT NULL DEFAULT 'study',
  starts_at text NOT NULL,
  ends_at text NOT NULL,
  timezone text NOT NULL DEFAULT 'UTC',
  notes text NOT NULL DEFAULT '',
  linked_note_id text REFERENCES notes(id) ON DELETE SET NULL,
  created_at text NOT NULL DEFAULT (datetime('now')),
  updated_at text NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'learner',
  status text NOT NULL DEFAULT 'active',
  created_at text NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS workspace_invites (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  invited_email text NOT NULL,
  role text NOT NULL DEFAULT 'learner',
  status text NOT NULL DEFAULT 'pending',
  token_hash text NOT NULL,
  expires_at text NOT NULL,
  created_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  created_at text NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS workspace_groups (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  created_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  created_at text NOT NULL DEFAULT (datetime('now')),
  updated_at text NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id text NOT NULL REFERENCES workspace_groups(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at text NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS chat_threads (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  group_id text REFERENCES workspace_groups(id) ON DELETE SET NULL,
  title text NOT NULL,
  created_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  created_at text NOT NULL DEFAULT (datetime('now')),
  updated_at text NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id text PRIMARY KEY,
  thread_id text NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  user_id text REFERENCES users(id) ON DELETE SET NULL,
  body text NOT NULL,
  metadata text NOT NULL DEFAULT '{}',
  created_at text NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS game_attempts (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_key text NOT NULL,
  score integer NOT NULL DEFAULT 0,
  total integer NOT NULL DEFAULT 0,
  duration_seconds integer NOT NULL DEFAULT 0,
  metadata text NOT NULL DEFAULT '{}',
  created_at text NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  key_hash text PRIMARY KEY,
  count integer NOT NULL DEFAULT 0,
  reset_at text NOT NULL,
  updated_at text NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_note_versions_note_id ON note_versions(note_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_editor_documents_workspace ON editor_documents(workspace_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_sheet_documents_workspace ON sheet_documents(workspace_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_slide_decks_workspace ON slide_decks(workspace_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_calendar_events_owner ON calendar_events(owner_user_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_workspace_invites_workspace ON workspace_invites(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_threads_workspace ON chat_threads(workspace_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON chat_messages(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_game_attempts_user ON game_attempts(user_id, created_at DESC);
