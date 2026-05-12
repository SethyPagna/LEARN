import type { PoolClient } from "pg"
import crypto from "node:crypto"
import { quizQuestions } from "./quiz-data"
import { hashPassword } from "./auth"
import { query, withClient } from "./db"

let ensurePromise: Promise<void> | null = null

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  username text UNIQUE NOT NULL,
  email text UNIQUE NOT NULL,
  name text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'learner',
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz
);

CREATE TABLE IF NOT EXISTS workspaces (
  id text PRIMARY KEY,
  owner_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notes (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  icon text NOT NULL DEFAULT 'BookOpen',
  content text NOT NULL DEFAULT '',
  favorite boolean NOT NULL DEFAULT false,
  template text NOT NULL DEFAULT 'blank',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS note_blocks (
  id text PRIMARY KEY,
  note_id text NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  block_type text NOT NULL,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
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
  target_date date,
  completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quizzes (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title text NOT NULL,
  topic text NOT NULL,
  description text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'seed',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quiz_questions (
  id text PRIMARY KEY,
  quiz_id text NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  question text NOT NULL,
  choices jsonb NOT NULL,
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
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quiz_attempt_answers (
  id text PRIMARY KEY,
  attempt_id text NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
  question_id text NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
  topic text NOT NULL,
  selected_answer_id text NOT NULL,
  correct boolean NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_provider_configs (
  id text PRIMARY KEY,
  name text NOT NULL,
  provider text NOT NULL,
  env_key text NOT NULL,
  default_model text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_chats (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_messages (
  id text PRIMARY KEY,
  chat_id text NOT NULL REFERENCES ai_chats(id) ON DELETE CASCADE,
  role text NOT NULL,
  content text NOT NULL,
  provider text,
  model text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_response_logs (
  id text PRIMARY KEY,
  user_id text REFERENCES users(id) ON DELETE SET NULL,
  provider text,
  model text,
  prompt text NOT NULL,
  response text NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id text PRIMARY KEY,
  user_id text REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
`

export function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`
}

async function seedUser(client: PoolClient, input: {
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

async function seedStarterData(client: PoolClient) {
  await seedUser(client, {
    id: "user_admin",
    username: "admin",
    email: "admin@learning-os.local",
    name: "Learning OS Admin",
    password: "Admin123456!",
    role: "admin",
  })
  await seedUser(client, {
    id: "user_learner",
    username: "learner",
    email: "learner@learning-os.local",
    name: "Demo Learner",
    password: "Learn123456!",
    role: "learner",
  })

  await client.query(
    `INSERT INTO workspaces (id, owner_user_id, name)
     VALUES ('workspace_demo', 'user_admin', 'Learning OS Workspace')
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
        [note.id, note.title, note.icon, note.content, note.id === "note_operating_systems", note.template],
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
        [createId("goal"), title, index === 0],
      )
    }
  }

  const quizCount = await client.query("SELECT count(*)::int AS count FROM quizzes")
  if (Number(quizCount.rows[0]?.count || 0) === 0) {
    const topics = Array.from(new Set(quizQuestions.map((question) => question.topic)))
    for (const topic of topics) {
      const quizId = `quiz_${topic.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`
      await client.query(
        `INSERT INTO quizzes (id, workspace_id, title, topic, description, source)
         VALUES ($1, 'workspace_demo', $2, $3, $4, 'seed')`,
        [quizId, `${topic} Practice`, topic, `Adaptive MCQ practice for ${topic}.`],
      )
      for (const question of quizQuestions.filter((item) => item.topic === topic)) {
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
  ensurePromise ??= withClient(async (client) => {
    await client.query(SCHEMA_SQL)
    await seedStarterData(client)
  })
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
