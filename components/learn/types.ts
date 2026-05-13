export type View =
  | "dashboard"
  | "notes"
  | "docs"
  | "sheets"
  | "slides"
  | "quizzes"
  | "games"
  | "ai"
  | "files"
  | "chat"
  | "progress"
  | "calendar"
  | "settings"
  | "admin"

export interface User {
  id: string
  name: string
  username: string
  email: string
  role: "admin" | "learner"
  preferences: Record<string, unknown>
}

export interface Note {
  id: string
  title: string
  icon: string
  content: string
  favorite: boolean
  template: string
  updated_at: string
  tags?: string[]
}

export interface QuizChoice {
  id: string
  text: string
}

export interface QuizQuestion {
  id: string
  question: string
  choices: QuizChoice[]
  correct_answer_id: string
  topic: string
  explanation: string
}

export interface Quiz {
  id: string
  title: string
  topic: string
  description: string
  question_count?: number
  questions?: QuizQuestion[]
}

export interface MediaFile {
  id: string
  filename: string
  content_type: string
  size_bytes: number
  created_at: string
  source: string
}

export interface CalendarEvent {
  id: string
  title: string
  event_type: string
  starts_at: string
  ends_at: string
  timezone: string
  notes?: string
}

export interface WorkspaceDocument {
  id: string
  title: string
  content?: Record<string, unknown>
  tags?: string[]
  updated_at?: string
}

export interface WorkspaceSheet {
  id: string
  title: string
  cells: string[][]
  updated_at?: string
}

export interface WorkspaceDeck {
  id: string
  title: string
  slides: { title: string; body: string; accent?: string }[]
  updated_at?: string
}

export interface WorkspaceState {
  user: User | null
  notes: Note[]
  quizzes: Quiz[]
  dashboard: any
  adminData: any
  automationData: any
}
