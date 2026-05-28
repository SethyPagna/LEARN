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
  avatarUrl?: string
  bio?: string
  profileVisibility?: string
  role: "admin" | "learner"
  preferences: Record<string, unknown>
  metrics?: {
    streakCurrent: number
    streakLongest: number
    streakFreezesAvailable: number
    xpTotal: number
  }
}

export interface Note {
  id: string
  title: string
  icon: string
  content: string
  favorite: boolean
  template: string
  updated_at: string
  archived_at?: string | null
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
  archived_at?: string | null
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
  archived_at?: string | null
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
    background?: string
    transition?: "none" | "fade" | "push" | "zoom" | "wipe"
    animation?: "none" | "rise" | "reveal" | "emphasis"
    hidden?: boolean
    locked?: boolean
    objects?: SlideObject[]
    speakerNotes?: string
  }[]
  updated_at?: string
  archived_at?: string | null
}

export type StudioKind = "notes" | "docs" | "sheets" | "slides"
export type StudioAction = "new" | "save" | "undo" | "redo" | "copy" | "duplicate" | "archive" | "download" | "export"
export type StudioExportFormat = "markdown" | "text" | "csv" | "json" | "outline"
export type StudioDraftStatus = "saved" | "dirty" | "local-draft" | "saving" | "conflict"
export interface StudioDirtyBadge {
  kind: StudioKind
  count: number
  latestAt?: string
}
export type StudioPaneAction = "split-right" | "split-down" | "close" | "close-others" | "duplicate" | "pin" | "reset"
export type StudioInsertTarget = "note-block" | "doc-section" | "sheet-rows" | "slide-outline" | "quiz" | "flashcards" | "review-cards" | "ai-note"
export interface RichDocumentContent {
  blocks?: unknown
  html?: string
  markdown?: string
  plainText?: string
}
export interface SheetMetadata {
  columnWidths?: number[]
  rowHeights?: number[]
  frozenRows?: number
  selectedRange?: { startRow: number; startColumn: number; endRow: number; endColumn: number }
  filters?: Record<string, unknown>
  formatting?: Record<string, unknown>
}
export interface SlideObject {
  id: string
  type: "text" | "image" | "shape" | "table"
  x: number
  y: number
  w: number
  h: number
  text?: string
  src?: string
  style?: Record<string, unknown>
}
export interface AiPromptField {
  id: string
  label: string
  required?: boolean
  placeholder?: string
  options?: string[]
}
export interface AiPromptContract {
  mode: string
  title: string
  requiredFields: AiPromptField[]
  outputContract: string
  insertTargets: StudioInsertTarget[]
}
export interface AiInsertBackAction {
  target: StudioInsertTarget
  label: string
  description: string
}
export type PracticeMode = "quiz" | "exam" | "flashcards" | "matching" | "sprint" | "mistake-retry" | "fill-blank" | "true-false" | "generated"
export interface PracticeAttemptSummary {
  mode: PracticeMode
  score: number
  total: number
  durationSeconds: number
  missedQuestionIds: string[]
  nextAction: "retry" | "review" | "save-to-studio" | "rest"
}
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

export interface DashboardWeakTopic {
  topic: string
  accuracy: number
  attempts: number
}

export interface DashboardSnapshot {
  goalCompletion?: number
  todayStudyMinutes?: number
  weakTopics?: DashboardWeakTopic[]
  recommendedFocus?: string[]
  recentNotes?: Array<{ id?: string; title?: string }>
  [key: string]: unknown
}

export interface DashboardChat {
  id: string
  title: string
  updated_at?: string
  updatedAt?: string
}

export interface DashboardQuizAttempt {
  id: string
  quiz_title?: string
  title?: string
  score?: number
  total?: number
  created_at?: string
  createdAt?: string
}

export interface DashboardFile {
  id: string
  filename: string
  content_type?: string
  contentType?: string
  created_at?: string
  createdAt?: string
}

export interface DashboardGoal {
  title: string
  completed: boolean
}

export interface DashboardData {
  user?: User
  snapshot?: DashboardSnapshot
  notes?: Note[]
  goals?: DashboardGoal[]
  chats?: DashboardChat[]
  attempts?: DashboardQuizAttempt[]
  files?: DashboardFile[]
}

export interface AdminUserRecord {
  id: string
  username?: string
  email?: string
  name?: string
  role?: string
  created_at?: string
}

export interface AdminProviderRecord {
  id?: string
  name?: string
  provider?: string
  provider_type?: string
  enabled?: boolean
  has_key?: boolean
  key_masked?: string
  last_status?: string
  last_error?: string
  priority?: number
  default_model?: string
  [key: string]: unknown
}

export interface AdminAuditRecord {
  id?: string
  action?: string
  entity?: string
  entity_id?: string
  details?: Record<string, unknown> | string
  created_at?: string
  user_id?: string
}

export interface AdminData {
  users?: AdminUserRecord[]
  providers?: AdminProviderRecord[]
  audit?: AdminAuditRecord[]
  counters?: Record<string, number>
}

export interface AutomationJobRecord {
  key: string
  label: string
  cadence?: string
  promptKey?: string
  enabledByDefault?: boolean
  description?: string
}

export interface AutomationPromptRecord {
  key: string
  title?: string
  label?: string
  mode?: string
  description?: string
  outputContract?: string
}

export interface AutomationData {
  jobs?: AutomationJobRecord[]
  prompts?: AutomationPromptRecord[]
}

export interface WorkspaceState {
  user: User | null
  notes: Note[]
  quizzes: Quiz[]
  dashboard: DashboardData | null
  adminData: AdminData | null
  automationData: AutomationData | null
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
  sourceType?: "note" | "block" | "flashcard" | "lesson" | "practice_mistake"
  prompt?: string
  answer?: string
  topic?: string
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
  profile_visibility?: string
  social_links?: {
    facebook?: string
    intro?: string
    website?: string
  }
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
