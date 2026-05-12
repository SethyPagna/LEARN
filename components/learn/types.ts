export type View = "dashboard" | "notes" | "quizzes" | "ai" | "files" | "progress" | "calendar" | "settings" | "admin"

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

export interface WorkspaceState {
  user: User | null
  notes: Note[]
  quizzes: Quiz[]
  dashboard: any
  adminData: any
  automationData: any
}
