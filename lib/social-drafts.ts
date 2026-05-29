export type SocialKind = "spaces" | "rooms" | "battles"

export interface SocialDraft {
  id: string
  name: string
  title: string
  description: string
  visibility: string
  topicTags: string
  mode: string
  status: string
  topic: string
  pomodoroMinutes: number
  breakMinutes: number
}

export interface SocialDraftStore {
  selectedId: string
  query: string
  draft: SocialDraft
  updatedAt: string
}

export const SOCIAL_DRAFT_KEY_PREFIX = "learn_social_draft_v1"

const VISIBILITY_OPTIONS = ["private", "connections", "public"]
const BATTLE_MODES = ["solo", "team"]
const BATTLE_STATUSES = ["waiting", "active", "completed"]
const ROOM_MODES = ["focus", "discussion", "stage"]
const ROOM_STATUSES = ["open", "active", "closed"]
const MIN_BLOCK_MINUTES = 1
const MAX_BLOCK_MINUTES = 180

export function createSocialDraft(kind: SocialKind): SocialDraft {
  if (kind === "battles") {
    return { id: "", name: "", title: "Quick study battle", description: "", visibility: "private", topicTags: "review", mode: "solo", status: "waiting", topic: "Review", pomodoroMinutes: 25, breakMinutes: 5 }
  }
  if (kind === "rooms") {
    return { id: "", name: "Focus room", title: "", description: "", visibility: "private", topicTags: "study", mode: "focus", status: "open", topic: "Review", pomodoroMinutes: 25, breakMinutes: 5 }
  }
  return { id: "", name: "Personal learning circle", title: "", description: "A focused group for shared study routes.", visibility: "private", topicTags: "study", mode: "focus", status: "open", topic: "Review", pomodoroMinutes: 25, breakMinutes: 5 }
}

export function socialDraftStorageKey(kind: SocialKind): string {
  return `${SOCIAL_DRAFT_KEY_PREFIX}_${kind}`
}

export function parseStoredSocialDraftStore(kind: SocialKind, raw: string | null): SocialDraftStore | null {
  return normalizeSocialDraftStore(kind, parseJson(raw))
}

export function normalizeSocialDraftStore(kind: SocialKind, value: unknown): SocialDraftStore | null {
  if (!isRecord(value)) return null
  return {
    selectedId: readString(value.selectedId, ""),
    query: readString(value.query, ""),
    draft: normalizeSocialDraft(kind, value.draft),
    updatedAt: normalizeIsoDate(value.updatedAt),
  }
}

export function normalizeSocialDraft(kind: SocialKind, value: unknown): SocialDraft {
  const fallback = createSocialDraft(kind)
  if (!isRecord(value)) return fallback
  const modes = kind === "battles" ? BATTLE_MODES : ROOM_MODES
  const statuses = kind === "battles" ? BATTLE_STATUSES : ROOM_STATUSES

  return {
    id: readString(value.id, fallback.id),
    name: readString(value.name, fallback.name),
    title: readString(value.title, fallback.title),
    description: readString(value.description, fallback.description),
    visibility: normalizeChoice(value.visibility, VISIBILITY_OPTIONS, fallback.visibility),
    topicTags: readString(value.topicTags, fallback.topicTags),
    mode: normalizeChoice(value.mode, modes, fallback.mode),
    status: normalizeChoice(value.status, statuses, fallback.status),
    topic: readString(value.topic, fallback.topic),
    pomodoroMinutes: normalizeMinutes(value.pomodoroMinutes, fallback.pomodoroMinutes),
    breakMinutes: normalizeMinutes(value.breakMinutes, fallback.breakMinutes),
  }
}

function parseJson(raw: string | null): unknown {
  if (!raw) return null
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

function normalizeChoice(value: unknown, options: string[], fallback: string): string {
  return typeof value === "string" && options.includes(value) ? value : fallback
}

function normalizeIsoDate(value: unknown): string {
  if (typeof value !== "string") return ""
  return Number.isNaN(Date.parse(value)) ? "" : value
}

function normalizeMinutes(value: unknown, fallback: number): number {
  const numberValue = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(numberValue)) return fallback
  return Math.min(MAX_BLOCK_MINUTES, Math.max(MIN_BLOCK_MINUTES, Math.round(numberValue)))
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}
