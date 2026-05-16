export type ChatIntent = "update" | "question" | "win"
export type ChatThreadFilter = "all" | "questions" | "wins" | "saved"
export type SocialWorkspaceKind = "spaces" | "rooms" | "battles"
export type SocialRecordFilter = "all" | "active" | "private" | "public" | "team" | "focus"

export interface ChatThreadLike {
  id?: string
  title?: string
  last_message?: string | null
  lastMessage?: string | null
  updated_at?: string
  updatedAt?: string
}

export interface SocialRecordLike {
  id?: string
  name?: string
  title?: string
  description?: string
  visibility?: string
  status?: string
  mode?: string
  topic?: string
  topic_tags?: string[]
  topicTags?: string[]
  member_count?: number
  memberCount?: number
  pomodoro_minutes?: number
  pomodoroMinutes?: number
}

export interface SocialWorkspaceSummary {
  total: number
  primaryCount: number
  secondaryCount: number
  primaryLabel: string
  secondaryLabel: string
  suggestedAction: string
  modeCounts: Array<{ label: string; count: number }>
}

export interface SocialWorkspacePlan {
  headline: string
  primaryAction: string
  safetyCue: string
  emptyHint: string
}

export function parseThreadTitle(title = "") {
  const [maybeChannel, ...rest] = title.split(" - ")
  const channel = maybeChannel.startsWith("#") ? maybeChannel : "#general"
  return {
    channel,
    title: (channel === maybeChannel ? rest.join(" - ") : title).trim() || "Study thread",
  }
}

export function buildChatDraftPayload(input: {
  body: string
  channel: string
  title: string
  intent: ChatIntent
  threadId?: string
}) {
  const body = input.body.trim()
  const channel = input.channel.startsWith("#") ? input.channel : `#${input.channel}`
  const title = input.title.trim() || "Study room"
  return {
    threadId: input.threadId,
    title: `${channel} - ${title}`,
    body: `[${input.intent}] ${body}`,
    metadata: {
      channel,
      intent: input.intent,
      hasMention: /(^|\s)@\w+/.test(body),
      hasStudioLink: /\/(studio|notes|docs|sheets|slides)\b/.test(body),
    },
  }
}

export function filterChatThreads(threads: ChatThreadLike[], input: { query?: string; filter?: ChatThreadFilter }) {
  const query = input.query?.trim().toLowerCase() || ""
  const filter = input.filter || "all"

  return threads.filter((thread) => {
    const title = String(thread.title || "")
    const lastMessage = String(thread.last_message || thread.lastMessage || "")
    const haystack = `${title} ${lastMessage}`.toLowerCase()
    if (query && !haystack.includes(query)) return false
    if (filter === "all") return true
    if (filter === "questions") return haystack.includes("[question]") || haystack.includes("?")
    if (filter === "wins") return haystack.includes("[win]") || haystack.includes("#wins")
    return haystack.includes("[saved]") || haystack.includes(" saved ") || haystack.includes("bookmark")
  })
}

export function summarizeSocialWorkspace(kind: SocialWorkspaceKind, records: SocialRecordLike[]): SocialWorkspaceSummary {
  const modeCounts = countSocialModes(kind, records)
  if (kind === "spaces") {
    const publicCount = records.filter((record) => record.visibility === "public").length
    const privateCount = records.filter((record) => record.visibility === "private").length
    return {
      total: records.length,
      primaryCount: publicCount,
      secondaryCount: privateCount,
      primaryLabel: "Public",
      secondaryLabel: "Private",
      suggestedAction: records.length ? "Invite or publish selectively" : "Create a private circle",
      modeCounts,
    }
  }
  if (kind === "rooms") {
    const openCount = records.filter((record) => record.status === "open" || record.status === "active").length
    const focusCount = records.filter((record) => record.mode === "focus").length
    return {
      total: records.length,
      primaryCount: openCount,
      secondaryCount: focusCount,
      primaryLabel: "Open",
      secondaryLabel: "Focus",
      suggestedAction: openCount ? "Join or run Pomodoro" : "Open a focus room",
      modeCounts,
    }
  }
  const activeCount = records.filter((record) => record.status === "waiting" || record.status === "active").length
  const teamCount = records.filter((record) => record.mode === "team").length
  return {
    total: records.length,
    primaryCount: activeCount,
    secondaryCount: teamCount,
    primaryLabel: "Playable",
    secondaryLabel: "Team",
    suggestedAction: activeCount ? "Start the next round" : "Create a fresh battle",
    modeCounts,
  }
}

export function buildSocialWorkspacePlan(kind: SocialWorkspaceKind, summary: SocialWorkspaceSummary): SocialWorkspacePlan {
  if (kind === "spaces") {
    return {
      headline: summary.total ? "Curate circles deliberately" : "Start with a private circle",
      primaryAction: summary.primaryCount ? "Review public spaces" : "Create private space",
      safetyCue: "Sharing is opt-in. Keep new spaces private until the purpose is clear.",
      emptyHint: "Create a small topic circle before inviting others.",
    }
  }
  if (kind === "rooms") {
    return {
      headline: summary.primaryCount ? "Run the next focus block" : "Open a quiet study room",
      primaryAction: summary.primaryCount ? "Join active room" : "Create focus room",
      safetyCue: "Presence is for accountability, not surveillance.",
      emptyHint: "Create a room with a Pomodoro length and a clear mode.",
    }
  }
  return {
    headline: summary.primaryCount ? "Continue playable battles" : "Create a short study battle",
    primaryAction: summary.secondaryCount ? "Run team round" : "Start solo battle",
    safetyCue: "Battles should reinforce recall, not punish mistakes.",
    emptyHint: "Create a 3-5 minute battle from a shared topic.",
  }
}

export function filterSocialRecords(records: SocialRecordLike[], input: { query?: string; filter?: SocialRecordFilter }) {
  const query = input.query?.trim().toLowerCase() || ""
  const filter = input.filter || "all"
  const results: SocialRecordLike[] = []

  for (const record of records) {
    const haystack = socialRecordSearchText(record)
    if (query && !haystack.includes(query)) continue
    if (!matchesSocialRecordFilter(record, filter)) continue
    results.push(record)
  }

  return results
}

export function socialRecordTitle(record: SocialRecordLike) {
  return String(record.title || record.name || "Untitled").trim()
}

export function socialRecordStatus(record: SocialRecordLike) {
  return String(record.status || record.visibility || record.mode || "ready").trim()
}

function socialRecordSearchText(record: SocialRecordLike) {
  return [
    record.id,
    record.name,
    record.title,
    record.description,
    record.visibility,
    record.status,
    record.mode,
    record.topic,
    ...(record.topic_tags ?? record.topicTags ?? []),
  ].join(" ").toLowerCase()
}

function matchesSocialRecordFilter(record: SocialRecordLike, filter: SocialRecordFilter) {
  if (filter === "all") return true
  if (filter === "active") return record.status === "active" || record.status === "open" || record.status === "waiting"
  if (filter === "private") return record.visibility === "private"
  if (filter === "public") return record.visibility === "public"
  if (filter === "team") return record.mode === "team"
  return record.mode === "focus"
}

function countSocialModes(kind: SocialWorkspaceKind, records: SocialRecordLike[]) {
  const counts = new Map<string, number>()
  for (const record of records) {
    const label = modeLabel(kind, record)
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((first, second) => second.count - first.count || first.label.localeCompare(second.label))
}

function modeLabel(kind: SocialWorkspaceKind, record: SocialRecordLike) {
  if (kind === "spaces") return String(record.visibility || "private")
  if (kind === "rooms") return String(record.mode || record.status || "focus")
  return String(record.mode || record.status || "solo")
}
