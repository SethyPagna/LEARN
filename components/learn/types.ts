export type View =
  | "dashboard"
  | "learn"
  | "vault"
  | "feed"
  | "graph"
  | "reviews"
  | "studio"
  | "notes"
  | "docs"
  | "sheets"
  | "slides"
  | "quizzes"
  | "practice"
  | "games"
  | "ai"
  | "files"
  | "chat"
  | "social"
  | "progress"
  | "calendar"
  | "discover"
  | "spaces"
  | "rooms"
  | "battles"
  | "profile"
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
  content?: {
    text?: string
    blocks?: unknown
    markdown?: string
    plainText?: string
    [key: string]: unknown
  }
  tags?: string[]
  updated_at?: string
}

export interface WorkspaceSheet {
  id: string
  title: string
  cells: string[][]
  columnWidths?: number[]
  rowHeights?: number[]
  frozenRows?: number
  filters?: Record<string, unknown>
  formatting?: Record<string, unknown>
  updated_at?: string
}

export interface WorkspaceDeck {
  id: string
  title: string
  slides: {
    title: string
    body: string
    accent?: string
    layout?: "title" | "two-column" | "image" | "quote"
    theme?: string
    objects?: Array<{ id: string; type: "text" | "image" | "shape"; x: number; y: number; w: number; h: number; text?: string; src?: string }>
    speakerNotes?: string
  }[]
  updated_at?: string
}

export type StudioKind = "notes" | "docs" | "sheets" | "slides"
export type StudioAction = "new" | "save" | "undo" | "redo" | "copy" | "duplicate" | "archive" | "download" | "export"
export type StudioExportFormat = "markdown" | "text" | "csv" | "json" | "outline"
export type StudioCommand =
  | StudioAction
  | "open"
  | "format"
  | "insert"
  | "data"
  | "review"
  | "share"
  | "split-right"
  | "split-down"
  | "close-pane"
  | "close-others"
  | "pin-pane"
  | "ask-ai"

export interface StudioTab {
  id: string
  kind: StudioKind
  itemId?: string
  title: string
  pinned?: boolean
}

export interface StudioPane {
  id: string
  order: number
  label: string
  activeTabId: string
  tabs: StudioTab[]
  pinned?: boolean
}

export interface StudioPaneGroup {
  id: string
  direction: "horizontal" | "vertical"
  panes: StudioPane[]
}

export interface StudioLayoutState {
  version: 1
  activePaneId: string
  groups: StudioPaneGroup[]
  inspectorOpen: boolean
  density: "compact" | "comfortable"
}

export interface StudioContextTarget {
  type: "record" | "editor" | "cell" | "slide" | "pane"
  kind?: StudioKind
  id?: string
  rowIndex?: number
  columnIndex?: number
  paneId?: string
}

export interface StudioItem {
  id: string
  kind: StudioKind
  title: string
  updated_at?: string
  favorite?: boolean
  summary?: string
}

export interface WorkspaceState {
  user: User | null
  notes: Note[]
  quizzes: Quiz[]
  dashboard: any
  adminData: any
  automationData: any
}

export type VaultMode = "vault" | "graph" | "reviews"
export type FeedMode = "discover" | "following" | "circles"

export interface KnowledgeNode {
  id: string
  title: string
  type: "concept" | "note" | "flashcard" | "lesson" | "resource"
  mastery: number
  visibility: "private" | "connections" | "public"
  summary?: string
  position?: { x: number; y: number; z: number }
}

export interface KnowledgeEdge {
  id: string
  sourceId: string
  targetId: string
  type: "link" | "prerequisite" | "related" | "extends" | "contradicts"
  strength: number
}

export interface FsrsState {
  difficulty: number
  stability: number
  retrievability: number
  dueAt: string
}

export interface ReviewItem extends FsrsState {
  id: string
  title: string
  sourceType?: "note" | "block" | "flashcard" | "lesson"
}

export interface MicroLesson {
  id: string
  title: string
  summary: string
  topic_tags?: string[]
  topicTags?: string[]
  durationSeconds?: number
  duration_seconds?: number
  question?: string
  choices?: { id: string; text: string }[]
  correct_choice_id?: string
  explanation?: string
  reason?: "preferred" | "serendipity"
}

export interface LearningSpace {
  id: string
  name: string
  description: string
  visibility: "private" | "public" | "connections"
  topic_tags?: string[]
  member_count?: number
}

export interface StudyRoom {
  id: string
  name: string
  mode: "focus" | "discussion" | "stage"
  pomodoro_minutes: number
  break_minutes: number
  status: "open" | "active" | "closed"
  presence?: unknown[]
}

export interface StudyBattle {
  id: string
  title: string
  topic: string
  mode: "solo" | "team"
  status: "waiting" | "active" | "completed"
  leaderboard?: unknown[]
}

export interface Achievement {
  id: string
  name: string
  description: string
  icon: string
  xp_reward: number
  unlocked?: boolean
}

export interface PublicProfile {
  id: string
  username: string
  name: string
  bio: string
  avatar_url: string
  metrics: Record<string, number>
  artifacts: KnowledgeNode[]
}

export interface SocialAction {
  id: string
  target_type: string
  target_id: string
  action_type: string
  body?: string
}
