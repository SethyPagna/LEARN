import { cookies } from "next/headers"
import { createSessionToken, hashSessionToken, verifyPassword } from "./auth"
import { query } from "./db"
import { buildLearningSnapshot, type TopicAnswer } from "./learning"
import { createId, ensureDatabase, logAudit } from "./schema"

export const SESSION_COOKIE = "learn_session"

export interface User {
  id: string
  username: string
  email: string
  name: string
  role: "admin" | "learner"
  preferences: Record<string, unknown>
}

export interface NoteRecord {
  id: string
  title: string
  icon: string
  content: string
  favorite: boolean
  template: string
  created_at: string
  updated_at: string
  tags?: string[]
}

function normalizeUser(row: Record<string, unknown>): User {
  const preferences = parseJsonObject(row.preferences)
  return {
    id: String(row.id),
    username: String(row.username),
    email: String(row.email),
    name: String(row.name),
    role: row.role === "admin" ? "admin" : "learner",
    preferences,
  }
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value) return value as Record<string, unknown>
  if (typeof value !== "string" || !value.trim()) return {}
  try {
    const parsed = JSON.parse(value)
    return typeof parsed === "object" && parsed ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function parseJsonArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[]
  if (typeof value !== "string" || !value.trim()) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed as T[] : []
  } catch {
    return []
  }
}

function normalizeNote(row: NoteRecord): NoteRecord {
  const favorite: unknown = (row as unknown as Record<string, unknown>).favorite
  return {
    ...row,
    favorite: favorite === true || favorite === 1 || favorite === "1",
    tags: parseJsonArray<string>(row.tags),
  }
}

function normalizeQuizQuestion(row: Record<string, unknown>) {
  return {
    ...row,
    choices: parseJsonArray(row.choices),
  }
}

export async function getCurrentUserFromToken(token?: string) {
  await ensureDatabase()
  const value = token?.trim()
  if (!value) return null

  const result = await query(
    `SELECT u.*
     FROM user_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()
     LIMIT 1`,
    [hashSessionToken(value)],
  )
  if (!result.rows[0]) return null

  await query("UPDATE user_sessions SET last_seen_at = now() WHERE token_hash = $1", [hashSessionToken(value)])
  return normalizeUser(result.rows[0])
}

export async function getCurrentUser() {
  const cookieStore = await cookies()
  return getCurrentUserFromToken(cookieStore.get(SESSION_COOKIE)?.value)
}

export async function authenticateUser(identifier: string, password: string) {
  await ensureDatabase()
  const result = await query(
    `SELECT * FROM users
     WHERE lower(username) = lower($1) OR lower(email) = lower($1)
     LIMIT 1`,
    [identifier.trim()],
  )
  const row = result.rows[0]
  if (!row || !(await verifyPassword(password, String(row.password_hash)))) {
    return null
  }

  return normalizeUser(row)
}

export async function createUserSession(userId: string) {
  await ensureDatabase()
  const token = createSessionToken()
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14)
  await query(
    `INSERT INTO user_sessions (id, user_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [createId("session"), userId, hashSessionToken(token), expiresAt.toISOString()],
  )
  await logAudit({ userId, action: "login", entity: "auth", entityId: userId })
  return { token, expiresAt }
}

export async function revokeSession(token: string) {
  await ensureDatabase()
  await query("DELETE FROM user_sessions WHERE token_hash = $1", [hashSessionToken(token)])
}

export async function getDashboardData(user: User) {
  await ensureDatabase()
  const [notes, goals, answers, chats] = await Promise.all([
    query<NoteRecord>(
      `SELECT n.*,
        COALESCE((
          SELECT json_group_array(t.name)
          FROM note_tags nt
          JOIN tags t ON t.id = nt.tag_id
          WHERE nt.note_id = n.id
        ), '[]') AS tags
       FROM notes n
       ORDER BY n.updated_at DESC
       LIMIT 8`,
    ),
    query<{ title: string; completed: boolean }>(
      "SELECT title, completed FROM learning_goals WHERE user_id = $1 ORDER BY created_at DESC",
      [user.id],
    ),
    query<TopicAnswer>(
      `SELECT qa.topic, qa.correct AS "isCorrect"
       FROM quiz_attempt_answers qa
       JOIN quiz_attempts a ON a.id = qa.attempt_id
       WHERE a.user_id = $1`,
      [user.id],
    ),
    query("SELECT id, title, updated_at FROM ai_chats WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 5", [user.id]),
  ])

  const snapshot = buildLearningSnapshot({
    goals: goals.rows,
    notes: notes.rows.map(normalizeNote).map((note) => ({
      id: note.id,
      title: note.title,
      updatedAt: new Date(note.updated_at).toISOString(),
    })),
    answers: answers.rows,
  })

  return {
    user,
    snapshot,
    notes: notes.rows.map(normalizeNote),
    goals: goals.rows,
    chats: chats.rows,
  }
}

export async function listNotes() {
  await ensureDatabase()
  const result = await query<NoteRecord>(
    `SELECT n.*,
      COALESCE((
        SELECT json_group_array(t.name)
        FROM note_tags nt
        JOIN tags t ON t.id = nt.tag_id
        WHERE nt.note_id = n.id
      ), '[]') AS tags
     FROM notes n
     ORDER BY n.favorite DESC, n.updated_at DESC`,
  )
  return result.rows.map(normalizeNote)
}

export async function getNote(id: string) {
  await ensureDatabase()
  const result = await query<NoteRecord>("SELECT * FROM notes WHERE id = $1 LIMIT 1", [id])
  return result.rows[0] ? normalizeNote(result.rows[0]) : null
}

export async function saveNote(user: User, input: Partial<NoteRecord> & { title: string; content: string }) {
  await ensureDatabase()
  const id = input.id || createId("note")
  const workspaceId = "workspace_demo"
  await query(
    `INSERT INTO notes (id, workspace_id, owner_user_id, title, icon, content, favorite, template, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
     ON CONFLICT (id) DO UPDATE
     SET title = EXCLUDED.title,
         icon = EXCLUDED.icon,
         content = EXCLUDED.content,
         favorite = EXCLUDED.favorite,
         template = EXCLUDED.template,
         updated_at = now()`,
    [
      id,
      workspaceId,
      user.id,
      input.title.trim() || "Untitled",
      input.icon || "FileText",
      input.content,
      Boolean(input.favorite),
      input.template || "blank",
    ],
  )
  await logAudit({ userId: user.id, action: input.id ? "update" : "create", entity: "note", entityId: id })
  return getNote(id)
}

export async function deleteNote(user: User, id: string) {
  await ensureDatabase()
  await query("DELETE FROM notes WHERE id = $1", [id])
  await logAudit({ userId: user.id, action: "delete", entity: "note", entityId: id })
}

export async function listQuizzes() {
  await ensureDatabase()
  const result = await query(
    `SELECT q.*, count(qq.id)::int AS question_count
     FROM quizzes q
     LEFT JOIN quiz_questions qq ON qq.quiz_id = q.id
     GROUP BY q.id
     ORDER BY q.topic ASC`,
  )
  return result.rows
}

export async function getQuiz(id: string) {
  await ensureDatabase()
  const [quiz, questions] = await Promise.all([
    query("SELECT * FROM quizzes WHERE id = $1 LIMIT 1", [id]),
    query("SELECT * FROM quiz_questions WHERE quiz_id = $1 ORDER BY id ASC", [id]),
  ])
  if (!quiz.rows[0]) return null
  return { ...quiz.rows[0], questions: questions.rows.map(normalizeQuizQuestion) }
}

export async function recordQuizAttempt(user: User, input: {
  quizId: string
  answers: { questionId: string; selectedAnswerId: string }[]
}) {
  await ensureDatabase()
  const quiz = await getQuiz(input.quizId)
  if (!quiz) throw new Error("Quiz not found")

  const questionMap = new Map(quiz.questions.map((question: any) => [String(question.id), question]))
  const normalizedAnswers = input.answers.map((answer) => {
    const question = questionMap.get(answer.questionId)
    return {
      ...answer,
      topic: String(question?.topic || "General"),
      correct: String(question?.correct_answer_id || "") === answer.selectedAnswerId,
    }
  })
  const score = normalizedAnswers.filter((answer) => answer.correct).length
  const attemptId = createId("attempt")
  await query(
    "INSERT INTO quiz_attempts (id, quiz_id, user_id, score, total) VALUES ($1, $2, $3, $4, $5)",
    [attemptId, input.quizId, user.id, score, input.answers.length],
  )
  for (const answer of normalizedAnswers) {
    await query(
      `INSERT INTO quiz_attempt_answers (id, attempt_id, question_id, topic, selected_answer_id, correct)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [createId("answer"), attemptId, answer.questionId, answer.topic, answer.selectedAnswerId, answer.correct],
    )
  }
  await logAudit({ userId: user.id, action: "complete", entity: "quiz_attempt", entityId: attemptId })
  return { attemptId, score, total: input.answers.length }
}

export async function listAdminData() {
  await ensureDatabase()
  const [users, providers, audit] = await Promise.all([
    query("SELECT id, username, email, name, role, created_at FROM users ORDER BY created_at ASC"),
    query("SELECT id, name, provider, env_key, default_model, enabled, created_at FROM ai_provider_configs ORDER BY provider ASC"),
    query("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 80"),
  ])
  return { users: users.rows, providers: providers.rows, audit: audit.rows }
}

export async function saveAiTurn(input: {
  user: User
  chatId?: string
  prompt: string
  response: string
  provider?: string | null
  model?: string | null
  status: string
}) {
  await ensureDatabase()
  const chatId = input.chatId || createId("chat")
  await query(
    `INSERT INTO ai_chats (id, user_id, title, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (id) DO UPDATE SET updated_at = now()`,
    [chatId, input.user.id, input.prompt.slice(0, 64) || "AI Tutor Chat"],
  )
  await query(
    `INSERT INTO ai_messages (id, chat_id, role, content, provider, model)
     VALUES ($1, $2, 'user', $3, $4, $5), ($6, $2, 'assistant', $7, $4, $5)`,
    [
      createId("msg"),
      chatId,
      input.prompt,
      input.provider || null,
      input.model || null,
      createId("msg"),
      input.response,
    ],
  )
  await query(
    `INSERT INTO ai_response_logs (id, user_id, provider, model, prompt, response, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      createId("ailog"),
      input.user.id,
      input.provider || null,
      input.model || null,
      input.prompt,
      input.response,
      input.status,
    ],
  )
  return { chatId }
}
