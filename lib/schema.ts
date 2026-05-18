import crypto from "node:crypto"
import { quizQuestions } from "./quiz-data"
import { hashPassword } from "./auth"
import { query, type DatabaseClient } from "./db"

let ensurePromise: Promise<void> | null = null

const D1_SCHEMA_SQL = `
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
  duration_seconds integer NOT NULL DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS content_items (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_type text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  title text NOT NULL,
  summary text NOT NULL DEFAULT '',
  visibility text NOT NULL DEFAULT 'private',
  archived_at text,
  created_at text NOT NULL DEFAULT (datetime('now')),
  updated_at text NOT NULL DEFAULT (datetime('now')),
  UNIQUE (source_table, source_id)
);

CREATE TABLE IF NOT EXISTS shared_access (
  id text PRIMARY KEY,
  content_item_id text NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  grantee_type text NOT NULL,
  grantee_id text,
  role text NOT NULL,
  created_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  expires_at text,
  created_at text NOT NULL DEFAULT (datetime('now')),
  UNIQUE (content_item_id, grantee_type, grantee_id, role)
);

CREATE TABLE IF NOT EXISTS content_versions (
  id text PRIMARY KEY,
  content_item_id text NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  source_table text NOT NULL,
  source_id text NOT NULL,
  user_id text REFERENCES users(id) ON DELETE SET NULL,
  version_number integer NOT NULL,
  title text NOT NULL,
  payload text NOT NULL DEFAULT '{}',
  plain_text text NOT NULL DEFAULT '',
  change_summary text NOT NULL DEFAULT '',
  created_at text NOT NULL DEFAULT (datetime('now')),
  UNIQUE (content_item_id, version_number)
);

CREATE TABLE IF NOT EXISTS content_attachments (
  content_item_id text NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  media_asset_id text NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  attachment_role text NOT NULL DEFAULT 'source',
  sort_order integer NOT NULL DEFAULT 0,
  created_at text NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (content_item_id, media_asset_id, attachment_role)
);

CREATE TABLE IF NOT EXISTS user_connections (
  requester_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_type text NOT NULL,
  status text NOT NULL,
  created_at text NOT NULL DEFAULT (datetime('now')),
  updated_at text NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (requester_user_id, target_user_id, connection_type)
);

CREATE TABLE IF NOT EXISTS practice_sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  session_type text NOT NULL,
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
CREATE INDEX IF NOT EXISTS idx_content_items_workspace_recent ON content_items(workspace_id, archived_at, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_items_owner_type_recent ON content_items(owner_user_id, item_type, archived_at, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_items_visibility_recent ON content_items(visibility, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_shared_access_grantee ON shared_access(grantee_type, grantee_id, role);
CREATE INDEX IF NOT EXISTS idx_shared_access_content ON shared_access(content_item_id, role);
CREATE INDEX IF NOT EXISTS idx_content_versions_item ON content_versions(content_item_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_content_attachments_media ON content_attachments(media_asset_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_connections_requester ON user_connections(requester_user_id, connection_type, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_connections_target ON user_connections(target_user_id, connection_type, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_shared_access_grantee_active ON shared_access(grantee_type, grantee_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_shared_access_created_by ON shared_access(created_by_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_practice_sessions_user_recent ON practice_sessions(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_practice_sessions_type_recent ON practice_sessions(session_type, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_practice_sessions_source ON practice_sessions(source_content_item_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_practice_session_items_session ON practice_session_items(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_practice_session_items_review ON practice_session_items(review_item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_practice_session_items_content ON practice_session_items(content_item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_runs_job_key ON automation_runs(job_key);
`

export function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`
}

async function seedUser(client: DatabaseClient, input: {
  id: string
  username: string
  email: string
  name: string
  password: string
  role: string
}) {
  const existing = await client.query("SELECT id FROM users WHERE username = $1 LIMIT 1", [input.username])
  if (existing.rowCount) return

  await client.query(
    `INSERT INTO users (id, username, email, name, password_hash, role, preferences)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [
      input.id,
      input.username,
      input.email,
      input.name,
      await hashPassword(input.password),
      input.role,
      JSON.stringify({ theme: "system", focusMode: "balanced", dailyGoalMinutes: 45 }),
    ],
  )
}

async function seedStarterData(client: DatabaseClient) {
  await seedUser(client, {
    id: "user_admin",
    username: "admin",
    email: "admin@learn.local",
    name: "LEARN Admin",
    password: "Admin123456!",
    role: "admin",
  })
  await seedUser(client, {
    id: "user_learner",
    username: "learner",
    email: "learner@learn.local",
    name: "Demo Learner",
    password: "Learn123456!",
    role: "learner",
  })

  await client.query(
    `INSERT INTO workspaces (id, owner_user_id, name)
     VALUES ('workspace_demo', 'user_admin', 'LEARN Workspace')
     ON CONFLICT (id) DO NOTHING`,
  )

  const noteCount = await client.query("SELECT count(*)::int AS count FROM notes")
  if (Number(noteCount.rows[0]?.count || 0) === 0) {
    const notes = [
      {
        id: "note_operating_systems",
        title: "Operating Systems Review",
        icon: "Cpu",
        template: "study-note",
        content: "## Scheduling\nRound-robin is best for fairness. Priority scheduling needs aging to avoid starvation.\n\n## Memory\nUse spaced repetition for paging, segmentation, and virtual memory terms.",
      },
      {
        id: "note_react_patterns",
        title: "React Patterns",
        icon: "Blocks",
        template: "knowledge-base",
        content: "Keep server data close to Server Components. Push client interactivity down to focused components.",
      },
      {
        id: "note_database_indexing",
        title: "Database Indexing",
        icon: "Database",
        template: "exam-prep",
        content: "Indexes speed reads but add write overhead. B-tree indexes support equality and range queries.",
      },
    ]
    for (const note of notes) {
      await client.query(
        `INSERT INTO notes (id, workspace_id, owner_user_id, title, icon, content, favorite, template)
         VALUES ($1, 'workspace_demo', 'user_admin', $2, $3, $4, $5, $6)`,
        [note.id, note.title, note.icon, note.content, note.id === "note_operating_systems" ? 1 : 0, note.template],
      )
      await client.query(
        `INSERT INTO note_blocks (id, note_id, block_type, content, sort_order)
         VALUES ($1, $2, 'markdown', $3::jsonb, 0)`,
        [createId("block"), note.id, JSON.stringify({ text: note.content })],
      )
    }
  }

  const goalCount = await client.query("SELECT count(*)::int AS count FROM learning_goals")
  if (Number(goalCount.rows[0]?.count || 0) === 0) {
    for (const [index, title] of ["Finish OS revision", "Practice React MCQs", "Summarize database notes"].entries()) {
      await client.query(
        `INSERT INTO learning_goals (id, user_id, title, completed)
         VALUES ($1, 'user_admin', $2, $3)`,
        [createId("goal"), title, index === 0 ? 1 : 0],
      )
    }
  }

  const quizCount = await client.query("SELECT count(*)::int AS count FROM quizzes")
  if (Number(quizCount.rows[0]?.count || 0) === 0) {
    const questionsByTopic = new Map<string, typeof quizQuestions>()
    for (const question of quizQuestions) {
      const topicQuestions = questionsByTopic.get(question.topic) ?? []
      topicQuestions.push(question)
      questionsByTopic.set(question.topic, topicQuestions)
    }

    for (const [topic, topicQuestions] of questionsByTopic.entries()) {
      const quizId = `quiz_${topic.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`
      await client.query(
        `INSERT INTO quizzes (id, workspace_id, title, topic, description, source)
         VALUES ($1, 'workspace_demo', $2, $3, $4, 'seed')`,
        [quizId, `${topic} Practice`, topic, `Adaptive MCQ practice for ${topic}.`],
      )
      for (const question of topicQuestions) {
        await client.query(
          `INSERT INTO quiz_questions (id, quiz_id, question, choices, correct_answer_id, topic, explanation)
           VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)`,
          [
            `seed_${question.id}`,
            quizId,
            question.question,
            JSON.stringify(question.choices),
            question.correctAnswerId,
            question.topic,
            "Review the related note and retry this question in adaptive practice.",
          ],
        )
      }
    }
  }
}

export async function ensureDatabase() {
  ensurePromise ??= (async () => {
    await seedStarterData({ query })
  })()
  return ensurePromise
}

export async function logAudit(input: {
  userId?: string | null
  action: string
  entity: string
  entityId?: string | null
  details?: Record<string, unknown>
}) {
  await query(
    `INSERT INTO audit_logs (id, user_id, action, entity, entity_id, details)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      createId("audit"),
      input.userId || null,
      input.action,
      input.entity,
      input.entityId || null,
      JSON.stringify(input.details || {}),
    ],
  )
}
