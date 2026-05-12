PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  username text UNIQUE NOT NULL,
  email text UNIQUE NOT NULL,
  name text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'learner',
  preferences text NOT NULL DEFAULT '{}',
  created_at text NOT NULL DEFAULT (datetime('now')),
  updated_at text NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text UNIQUE NOT NULL,
  expires_at text NOT NULL,
  created_at text NOT NULL DEFAULT (datetime('now')),
  last_seen_at text
);

CREATE TABLE IF NOT EXISTS workspaces (
  id text PRIMARY KEY,
  owner_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at text NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notes (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  icon text NOT NULL DEFAULT 'BookOpen',
  content text NOT NULL DEFAULT '',
  favorite integer NOT NULL DEFAULT 0,
  template text NOT NULL DEFAULT 'blank',
  created_at text NOT NULL DEFAULT (datetime('now')),
  updated_at text NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS note_blocks (
  id text PRIMARY KEY,
  note_id text NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  block_type text NOT NULL,
  content text NOT NULL DEFAULT '{}',
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tags (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#2563eb',
  UNIQUE (workspace_id, name)
);

CREATE TABLE IF NOT EXISTS note_tags (
  note_id text NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  tag_id text NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (note_id, tag_id)
);

CREATE TABLE IF NOT EXISTS learning_goals (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  target_date text,
  completed integer NOT NULL DEFAULT 0,
  created_at text NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quizzes (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title text NOT NULL,
  topic text NOT NULL,
  description text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'seed',
  created_at text NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quiz_questions (
  id text PRIMARY KEY,
  quiz_id text NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  question text NOT NULL,
  choices text NOT NULL,
  correct_answer_id text NOT NULL,
  topic text NOT NULL,
  explanation text NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id text PRIMARY KEY,
  quiz_id text NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score integer NOT NULL,
  total integer NOT NULL,
  created_at text NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quiz_attempt_answers (
  id text PRIMARY KEY,
  attempt_id text NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
  question_id text NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
  topic text NOT NULL,
  selected_answer_id text NOT NULL,
  correct integer NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_provider_configs (
  id text PRIMARY KEY,
  name text NOT NULL,
  provider text NOT NULL,
  env_key text NOT NULL,
  default_model text NOT NULL,
  enabled integer NOT NULL DEFAULT 1,
  created_at text NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_chats (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  created_at text NOT NULL DEFAULT (datetime('now')),
  updated_at text NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_messages (
  id text PRIMARY KEY,
  chat_id text NOT NULL REFERENCES ai_chats(id) ON DELETE CASCADE,
  role text NOT NULL,
  content text NOT NULL,
  provider text,
  model text,
  created_at text NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_response_logs (
  id text PRIMARY KEY,
  user_id text REFERENCES users(id) ON DELETE SET NULL,
  provider text,
  model text,
  prompt text NOT NULL,
  response text NOT NULL,
  status text NOT NULL,
  created_at text NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS automation_jobs (
  id text PRIMARY KEY,
  job_key text UNIQUE NOT NULL,
  label text NOT NULL,
  cadence text NOT NULL,
  prompt_key text NOT NULL,
  enabled integer NOT NULL DEFAULT 1,
  description text NOT NULL DEFAULT '',
  created_at text NOT NULL DEFAULT (datetime('now')),
  updated_at text NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS automation_runs (
  id text PRIMARY KEY,
  job_key text NOT NULL,
  user_id text REFERENCES users(id) ON DELETE SET NULL,
  status text NOT NULL,
  input text NOT NULL DEFAULT '{}',
  output text NOT NULL DEFAULT '{}',
  error text,
  created_at text NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS media_assets (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bucket text NOT NULL,
  object_key text UNIQUE NOT NULL,
  filename text NOT NULL,
  content_type text NOT NULL,
  size_bytes integer NOT NULL DEFAULT 0,
  note_id text REFERENCES notes(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'upload',
  metadata text NOT NULL DEFAULT '{}',
  created_at text NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id text PRIMARY KEY,
  user_id text REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text,
  details text NOT NULL DEFAULT '{}',
  created_at text NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON user_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user_id ON quiz_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_workspace_id ON media_assets(workspace_id);
CREATE INDEX IF NOT EXISTS idx_automation_runs_job_key ON automation_runs(job_key);
