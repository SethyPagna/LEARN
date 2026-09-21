import crypto from "node:crypto"
import { quizQuestions } from "./quiz-data"
import { hashPassword } from "./auth"
import { query, type DatabaseClient } from "./db"

let ensurePromise: Promise<void> | null = null

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
