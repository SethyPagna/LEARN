export type ChatIntent = "update" | "question" | "win"
export type ChatThreadFilter = "all" | "questions" | "wins" | "saved"
export type SocialWorkspaceKind = "spaces" | "rooms" | "battles"
export type SocialRecordFilter = "all" | "active" | "private" | "public" | "team" | "focus"
export type SocialMomentTypeId = "win" | "question" | "resource" | "milestone"

export interface ChatThreadLike {
  id?: string
  title?: string
  last_message?: string | null
  lastMessage?: string | null
  helpful?: boolean
  saved?: boolean
  updated_at?: string
  updatedAt?: string
}

export interface ChatWorkspaceSummary {
  total: number
  questions: number
  wins: number
  saved: number
  mentions: number
  studioLinks: number
  channels: Array<{ label: string; count: number }>
}

export interface ChatComposerPlan {
  headline: string
  recommendedIntent: ChatIntent
  nextAction: string
  chips: string[]
}

export type ChatComposerActionId = "send" | "clear-draft" | "use-suggestion"
export type ChatThreadActionId = "helpful" | "save" | "reply"

export interface ChatComposerActionState {
  id: ChatComposerActionId
  label: string
  busyLabel: string
  helper: string
  disabled: boolean
  busy: boolean
}

export interface ChatThreadActionState {
  id: ChatThreadActionId
  label: string
  busyLabel: string
  helper: string
  active: boolean
  disabled: boolean
  busy: boolean
}

export interface ChatThreadStatus {
  label: string
  tone: "accent" | "muted" | "success" | "warning"
}

export interface SocialMomentOption {
  id: SocialMomentTypeId
  label: string
  detail: string
  prompt: string
  channel: string
  intent: ChatIntent
  badge: string
  recommended: boolean
}

export type ChatQuickPromptId = "question" | "win" | "resource" | "recap"

export interface ChatQuickPrompt {
  id: ChatQuickPromptId
  label: string
  detail: string
  prompt: string
  channel: string
  intent: ChatIntent
  badge: string
  recommended: boolean
}

export type ChatInboxShortcutId = "all" | "help" | "wins" | "saved" | "mentions" | "studio"

export interface ChatInboxShortcut {
  id: ChatInboxShortcutId
  label: string
  count: number
  filter: ChatThreadFilter
  query: string
  recommended: boolean
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

export interface SocialRecordCard {
  action: string
  meta: string[]
  recommended: boolean
  status: string
  title: string
}

export interface SocialRecordEmptyState {
  action: "clear" | "create"
  body: string
  title: string
}

export interface SocialRecordFilterSummary {
  active: boolean
  label: string
}

export type SocialActionTarget = "invite" | "chat" | "calendar" | "practice" | "files"

export interface SocialActionItem {
  id: SocialActionTarget
  label: string
  detail: string
}

export interface SocialActionReadiness extends SocialActionItem {
  enabled: boolean
}

export interface SocialActionKit {
  headline: string
  brief: string
  inviteText: string
  chips: string[]
  actions: SocialActionItem[]
}

export type SocialInviteRole = "learner" | "admin"

export const socialInviteRoleOptions: Array<{ value: SocialInviteRole; label: string }> = [
  { value: "learner", label: "Learner" },
  { value: "admin", label: "Admin" },
]

export interface SocialInviteDraft {
  email: string
  role: SocialInviteRole
}

export interface WorkspaceMemberLike {
  id?: string
  name?: string
  email?: string
  role?: string
  status?: string
  created_at?: string
  createdAt?: string
}

export interface WorkspaceMemberSummary {
  total: number
  admins: number
  learners: number
  active: number
  pending: number
  newest?: WorkspaceMemberLike
}

export interface UserConnectionLike {
  target_user_id?: string
  targetUserId?: string
  connection_type?: string
  connectionType?: string
  status?: string
  username?: string
  name?: string
  avatar_url?: string
  avatarUrl?: string
}

export type ConnectionActionId = "friend" | "follow" | "remove"

export interface ConnectionActionState {
  id: ConnectionActionId
  label: string
  busyLabel: string
  disabled: boolean
  busy: boolean
}

export interface SocialCommandSummary {
  headline: string
  peopleReady: boolean
  chatReady: boolean
  groupsReady: boolean
  liveReady: boolean
  chips: string[]
}

export type SocialFlowId = "chat" | "spaces" | "rooms" | "battles"
export type SocialCommandPrimaryActionId = "find" | "invite" | "post" | SocialFlowId
export type SocialCommandRunId = "sync" | "post" | "invite" | SocialFlowId

export interface SocialCommandPrimaryAction {
  id: SocialCommandPrimaryActionId
  detail: string
  label: string
}

export interface SocialCommandRunActionState {
  id: SocialCommandRunId
  label: string
  busyLabel: string
  disabled: boolean
  busy: boolean
}

export interface SocialCommandModelInput {
  battleCount: number
  connectionCount: number
  memberCount: number
  roomCount: number
  spaceCount: number
  threadCount: number
}

export interface SocialCommandModel {
  callModes: SocialCallMode[]
  flowCards: SocialFlowCard[]
  homeLanes: SocialHomeLane[]
  momentOptions: SocialMomentOption[]
  primaryAction: SocialCommandPrimaryAction
  starterActions: SocialStarterAction[]
  summary: SocialCommandSummary
}

export type SocialUnifiedSearchAction = "people" | "invite" | "chat" | "groups" | "sync"
export type SocialUnifiedSearchScope = "all" | "people" | "chats" | "groups"

export interface SocialUnifiedSearchCommand {
  action: SocialUnifiedSearchAction
  badge: string
  detail: string
  label: string
  scope: SocialUnifiedSearchScope
}

export interface SocialUnifiedSearchSections {
  activeScope: SocialUnifiedSearchScope
  showChats: boolean
  showGroups: boolean
  showInvite: boolean
  showPeople: boolean
}

export type SocialHomeLaneId = "friends" | "chats" | "moments" | "groups" | "calls"
export type SocialHomeLaneTarget =
  | { kind: "command"; value: "people" | "post" | "invite" | "connections" }
  | { kind: "tab"; value: SocialFlowId }

export interface SocialHomeLane {
  id: SocialHomeLaneId
  label: string
  detail: string
  action: string
  count: number
  primary: boolean
  target: SocialHomeLaneTarget
}

export type SocialStarterActionId = "add-friend" | "chat" | "moment" | "group" | "call"

export interface SocialStarterAction {
  id: SocialStarterActionId
  label: string
  detail: string
  badge: string
  primary: boolean
  target: SocialHomeLaneTarget
}

export type SocialContactQuickActionId = "chat" | "group" | "call"

export interface SocialContactQuickAction {
  id: SocialContactQuickActionId
  label: string
  detail: string
  badge: string
  disabled: boolean
  primary: boolean
  target: Extract<SocialHomeLaneTarget, { kind: "tab" }>
}

export type PeopleSearchShortcutId = "all" | "learners" | "admins" | "active" | "email"

export interface PeopleSearchShortcut {
  id: PeopleSearchShortcutId
  label: string
  query: string
  count: number
  recommended: boolean
}

export type SocialCallModeId = "voice" | "video" | "group" | "focus" | "battle"

export interface SocialCallMode {
  id: SocialCallModeId
  label: string
  detail: string
  action: string
  badge: string
  target: Extract<SocialFlowId, "rooms" | "battles">
  recommended: boolean
}

export interface SocialFlowCard {
  id: SocialFlowId
  label: string
  action: string
  createAction: string
  count: number
  ready: boolean
}

export interface SocialActivityItem {
  id: string
  label: string
  detail: string
  tone: "ready" | "draft" | "next"
}

export interface SocialActionLike {
  id?: string
  actor_name?: string
  actorName?: string
  target_type?: string
  targetType?: string
  action_type?: string
  actionType?: string
  body?: string
  created_at?: string
  createdAt?: string
}

export type SocialInviteValidation =
  | { ok: true; value: SocialInviteDraft }
  | { ok: false; error: string }

export interface SocialInviteReadiness {
  enabled: boolean
  label: string
  message: string
  tone: "blocked" | "invalid" | "ready" | "created"
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
  const threadId = input.threadId?.trim() || undefined
  return {
    threadId,
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

export function buildSocialMomentOptions(input: {
  connectionCount: number
  threadCount: number
}): SocialMomentOption[] {
  const hasAudience = input.connectionCount > 0
  const hasPosted = input.threadCount > 0

  return [
    {
      id: "win",
      label: "Win",
      detail: "Share a small learning victory.",
      prompt: "Today I finally understood ",
      channel: "#wins",
      intent: "win",
      badge: "spark",
      recommended: hasAudience && !hasPosted,
    },
    {
      id: "question",
      label: "Question",
      detail: "Ask friends for help or examples.",
      prompt: "Can someone explain ",
      channel: "#questions",
      intent: "question",
      badge: "help",
      recommended: !hasAudience,
    },
    {
      id: "resource",
      label: "Resource",
      detail: "Share a useful note, link, or file.",
      prompt: "Useful resource: ",
      channel: "#resources",
      intent: "update",
      badge: "save",
      recommended: hasAudience && hasPosted,
    },
    {
      id: "milestone",
      label: "Milestone",
      detail: "Mark a streak, quiz score, or completed topic.",
      prompt: "Milestone reached: ",
      channel: "#wins",
      intent: "win",
      badge: "level",
      recommended: false,
    },
  ]
}

export function buildChatQuickPrompts(input: {
  hasDraft: boolean
  questionCount?: number
  savedCount?: number
  threadCount: number
  winCount?: number
}): ChatQuickPrompt[] {
  const questionCount = input.questionCount ?? 0
  const savedCount = input.savedCount ?? 0
  const winCount = input.winCount ?? 0
  const canRecommend = !input.hasDraft

  return [
    {
      id: "question",
      label: "Question",
      detail: "Ask friends for an example or explanation.",
      prompt: "Can someone help me understand ",
      channel: "#study-help",
      intent: "question",
      badge: "help",
      recommended: canRecommend && (input.threadCount === 0 || questionCount <= winCount),
    },
    {
      id: "win",
      label: "Win",
      detail: "Post one small learning victory.",
      prompt: "Small win: ",
      channel: "#wins",
      intent: "win",
      badge: "spark",
      recommended: canRecommend && input.threadCount > 0 && winCount < questionCount,
    },
    {
      id: "resource",
      label: "Resource",
      detail: "Share a note, file, link, or saved reference.",
      prompt: "Resource worth saving: ",
      channel: "#resources",
      intent: "update",
      badge: "save",
      recommended: canRecommend && savedCount > 0,
    },
    {
      id: "recap",
      label: "Recap",
      detail: "Summarize what the group should remember.",
      prompt: "Quick recap: today we learned ",
      channel: "#general",
      intent: "update",
      badge: "sum",
      recommended: canRecommend && input.threadCount > 2 && questionCount === 0 && winCount > 0,
    },
  ]
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
    return Boolean(thread.saved) || haystack.includes("[saved]") || haystack.includes(" saved ") || haystack.includes("bookmark")
  })
}

export function summarizeChatWorkspace(threads: ChatThreadLike[]): ChatWorkspaceSummary {
  const channelCounts = new Map<string, number>()
  let questions = 0
  let wins = 0
  let saved = 0
  let mentions = 0
  let studioLinks = 0

  for (const thread of threads) {
    const parsed = parseThreadTitle(thread.title)
    const body = String(thread.last_message || thread.lastMessage || "")
    const searchable = `${thread.title || ""} ${body}`.toLowerCase()
    channelCounts.set(parsed.channel, (channelCounts.get(parsed.channel) ?? 0) + 1)
    if (searchable.includes("[question]") || searchable.includes("?")) questions += 1
    if (searchable.includes("[win]") || searchable.includes("#wins")) wins += 1
    if (thread.saved || searchable.includes("[saved]") || searchable.includes(" saved ") || searchable.includes("bookmark")) saved += 1
    if (/(^|\s)@\w+/.test(body)) mentions += 1
    if (/\/(studio|notes|docs|sheets|slides)\b/.test(body)) studioLinks += 1
  }

  return {
    total: threads.length,
    questions,
    wins,
    saved,
    mentions,
    studioLinks,
    channels: [...channelCounts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((first, second) => second.count - first.count || first.label.localeCompare(second.label)),
  }
}

export function buildChatInboxShortcuts(summary: ChatWorkspaceSummary): ChatInboxShortcut[] {
  const hasQuestions = summary.questions > 0
  const hasSaved = summary.saved > 0
  const hasMentions = summary.mentions > 0
  const hasStudioLinks = summary.studioLinks > 0

  return [
    {
      id: "all",
      label: "All",
      count: summary.total,
      filter: "all",
      query: "",
      recommended: summary.total === 0,
    },
    {
      id: "help",
      label: "Help",
      count: summary.questions,
      filter: "questions",
      query: "",
      recommended: hasQuestions,
    },
    {
      id: "wins",
      label: "Wins",
      count: summary.wins,
      filter: "wins",
      query: "",
      recommended: !hasQuestions && summary.wins > 0,
    },
    {
      id: "saved",
      label: "Saved",
      count: summary.saved,
      filter: "saved",
      query: "",
      recommended: !hasQuestions && hasSaved,
    },
    {
      id: "mentions",
      label: "Mentions",
      count: summary.mentions,
      filter: "all",
      query: "@",
      recommended: !hasQuestions && !hasSaved && hasMentions,
    },
    {
      id: "studio",
      label: "Studio",
      count: summary.studioLinks,
      filter: "all",
      query: "/studio",
      recommended: !hasQuestions && !hasSaved && !hasMentions && hasStudioLinks,
    },
  ]
}

export function buildChatComposerPlan(summary: ChatWorkspaceSummary, draftBody = ""): ChatComposerPlan {
  const hasDraft = Boolean(draftBody.trim())
  if (hasDraft) {
    return {
      headline: "Finish the current draft",
      recommendedIntent: detectDraftIntent(draftBody),
      nextAction: "Send or clear the saved draft",
      chips: [`${draftBody.trim().split(/\s+/).length} words`, summary.total ? `${summary.total} threads` : "first thread"],
    }
  }
  if (summary.questions > summary.wins) {
    return {
      headline: "Answer an open question",
      recommendedIntent: "question",
      nextAction: "Filter questions and reply with context",
      chips: [`${summary.questions} questions`, `${summary.mentions} mentions`],
    }
  }
  if (summary.wins === 0 && summary.total > 0) {
    return {
      headline: "Capture one learning win",
      recommendedIntent: "win",
      nextAction: "Post a short win from today",
      chips: [`${summary.total} threads`, "no wins yet"],
    }
  }
  return {
    headline: summary.total ? "Keep the channel tidy" : "Start a study thread",
    recommendedIntent: "update",
    nextAction: summary.total ? "Share one focused update" : "Create the first group update",
    chips: [`${summary.saved} saved`, `${summary.studioLinks} Studio links`],
  }
}

export function buildChatComposerActions(input: {
  busyAction?: ChatComposerActionId | null
  hasDraft?: boolean
  hasSuggestion?: boolean
}): ChatComposerActionState[] {
  const busy = Boolean(input.busyAction)
  const hasDraft = Boolean(input.hasDraft)
  const actions: Array<Omit<ChatComposerActionState, "busy" | "disabled"> & { disabled: boolean }> = [
    {
      id: "send",
      label: "Send",
      busyLabel: "Sending",
      helper: "Post this draft to the selected channel.",
      disabled: !hasDraft,
    },
    {
      id: "clear-draft",
      label: "Clear draft",
      busyLabel: "Clearing",
      helper: "Remove the local draft without changing saved threads.",
      disabled: !hasDraft,
    },
    {
      id: "use-suggestion",
      label: "Use suggestion",
      busyLabel: "Applying",
      helper: "Apply the recommended intent, filter, or channel.",
      disabled: !input.hasSuggestion,
    },
  ]

  return actions.map((action) => ({
    ...action,
    busy: input.busyAction === action.id,
    disabled: busy || action.disabled,
  }))
}

export function buildChatThreadActions(input: {
  busyAction?: ChatThreadActionId | null
  helpful?: boolean
  hasThread?: boolean
  saved?: boolean
}): ChatThreadActionState[] {
  const busy = Boolean(input.busyAction)
  const hasThread = Boolean(input.hasThread)
  const actions: Array<Omit<ChatThreadActionState, "active" | "busy" | "disabled"> & { active: boolean; disabled: boolean }> = [
    {
      id: "helpful",
      label: input.helpful ? "Helpful" : "Mark helpful",
      busyLabel: "Saving",
      helper: "Mark this thread as useful.",
      active: Boolean(input.helpful),
      disabled: !hasThread,
    },
    {
      id: "save",
      label: input.saved ? "Saved" : "Save",
      busyLabel: "Saving",
      helper: "Bookmark this thread for later.",
      active: Boolean(input.saved),
      disabled: !hasThread,
    },
    {
      id: "reply",
      label: "Reply",
      busyLabel: "Opening",
      helper: "Prepare a reply draft.",
      active: false,
      disabled: !hasThread,
    },
  ]

  return actions.map((action) => ({
    ...action,
    busy: input.busyAction === action.id,
    disabled: busy || action.disabled,
  }))
}

export function buildChatThreadStatus(thread: ChatThreadLike, nowMs = Date.now()): ChatThreadStatus {
  if (thread.saved) return { label: "saved", tone: "success" }
  if (thread.helpful) return { label: "helpful", tone: "accent" }

  const body = String(thread.last_message || thread.lastMessage || "").toLowerCase()
  if (body.includes("[question]") || body.includes("?")) return { label: "needs reply", tone: "warning" }
  if (body.includes("[win]")) return { label: "win", tone: "success" }

  const updatedAt = thread.updated_at || thread.updatedAt
  const updatedMs = updatedAt ? new Date(updatedAt).getTime() : Number.NaN
  const isRecent = Number.isFinite(updatedMs) && nowMs - updatedMs < 1000 * 60 * 60 * 24
  return isRecent ? { label: "new", tone: "accent" } : { label: "read", tone: "muted" }
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

function detectDraftIntent(body: string): ChatIntent {
  const text = body.toLowerCase()
  if (text.includes("?")) return "question"
  if (text.includes("finished") || text.includes("completed") || text.includes("win")) return "win"
  return "update"
}

export function buildSocialWorkspacePlan(kind: SocialWorkspaceKind, summary: SocialWorkspaceSummary): SocialWorkspacePlan {
  if (kind === "spaces") {
    return {
      headline: summary.total ? "Curate circles deliberately" : "Start with a private circle",
      primaryAction: summary.primaryCount ? "Review public groups" : "Create private group",
      safetyCue: "Sharing is opt-in. Keep new groups private until the purpose is clear.",
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

export function buildSocialActionKit(kind: SocialWorkspaceKind, input: {
  title?: string
  saved?: boolean
  status?: string
  visibility?: string
  mode?: string
  topic?: string
}) {
  const title = (input.title || "").trim() || fallbackSocialTitle(kind)
  const savedCue = input.saved ? "Ready" : "Save first"
  const status = input.status || input.visibility || input.mode || "draft"
  const topic = input.topic?.trim() || (kind === "battles" ? "review" : "study")

  if (kind === "rooms") {
    return {
      headline: input.saved ? "Run the room" : "Set up the room",
      brief: "Invite learners, run a focus timer, then post a short recap.",
      inviteText: `Join my LEARN study room: ${title}. Mode: ${input.mode || "focus"}. We will focus, recap, and save next steps.`,
      chips: [savedCue, status, input.mode || "focus"],
      actions: [
        { id: "invite", label: "Invite", detail: "Copy a room invite." },
        { id: "chat", label: "Chat", detail: "Open discussion." },
        { id: "calendar", label: "Schedule", detail: "Plan the next block." },
        { id: "files", label: "Resources", detail: "Attach study files." },
      ],
    } satisfies SocialActionKit
  }

  if (kind === "battles") {
    return {
      headline: input.saved ? "Play and review" : "Prepare the battle",
      brief: "Invite players, run a short round, then save missed questions to reviews.",
      inviteText: `Join my LEARN study battle: ${title}. Topic: ${topic}. We will play a short round and review missed questions together.`,
      chips: [savedCue, status, input.mode || "solo"],
      actions: [
        { id: "invite", label: "Invite", detail: "Copy a battle invite." },
        { id: "practice", label: "Practice", detail: "Open drills." },
        { id: "chat", label: "Recap", detail: "Discuss misses." },
        { id: "calendar", label: "Rematch", detail: "Schedule another round." },
      ],
    } satisfies SocialActionKit
  }

  return {
    headline: input.saved ? "Grow the circle" : "Shape the circle",
    brief: "Keep the circle private until it has a topic, invite a small group, then share useful Studio items.",
    inviteText: `Join my LEARN learning group: ${title}. It is for ${topic} study, shared notes, questions, and focused practice.`,
    chips: [savedCue, status, input.visibility || "private"],
    actions: [
      { id: "invite", label: "Invite", detail: "Copy a group invite." },
      { id: "chat", label: "Chat", detail: "Start a thread." },
      { id: "files", label: "Resources", detail: "Add files." },
      { id: "practice", label: "Practice", detail: "Create a drill." },
    ],
  } satisfies SocialActionKit
}

export function buildSocialActionReadiness(kind: SocialWorkspaceKind, action: SocialActionItem, saved: boolean): SocialActionReadiness {
  if (saved) return { ...action, enabled: true }

  const noun = socialKindNoun(kind)
  return {
    ...action,
    detail: `Save this ${noun} before using ${action.label.toLowerCase()}.`,
    enabled: false,
    label: "Save first",
  }
}

export function buildSocialInviteReadiness(input: {
  email?: string
  kind: SocialWorkspaceKind
  linkReady?: boolean
  loading?: boolean
  saved: boolean
}): SocialInviteReadiness {
  const noun = socialKindNoun(input.kind)
  if (input.loading) {
    return { enabled: false, label: "Creating...", message: "Creating secure invite link.", tone: "ready" }
  }
  if (!input.saved) {
    return {
      enabled: false,
      label: "Save first",
      message: `Save this ${noun} before creating a secure invite link.`,
      tone: "blocked",
    }
  }

  const validation = normalizeSocialInviteDraft({ email: input.email })
  if (!validation.ok) {
    return { enabled: false, label: "Enter email", message: validation.error, tone: "invalid" }
  }
  if (input.linkReady) {
    return { enabled: true, label: "Refresh link", message: "Invite link is ready.", tone: "created" }
  }
  return { enabled: true, label: "Create link", message: "Ready to create a secure invite.", tone: "ready" }
}

export function normalizeSocialInviteDraft(input: { email?: string; role?: string }): SocialInviteValidation {
  const email = String(input.email || "").trim().toLowerCase()
  const role = normalizeSocialInviteRole(input.role)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Enter a valid email address." }
  return { ok: true, value: { email, role } }
}

export function normalizeSocialInviteRole(value: unknown): SocialInviteRole {
  return value === "admin" ? "admin" : "learner"
}

export function summarizeWorkspaceMembers(members: WorkspaceMemberLike[]): WorkspaceMemberSummary {
  let admins = 0
  let learners = 0
  let active = 0
  let pending = 0
  let newest: WorkspaceMemberLike | undefined
  let newestTime = 0

  for (const member of members) {
    const role = String(member.role || "learner").toLowerCase()
    const status = String(member.status || "active").toLowerCase()
    if (role === "admin") admins += 1
    else learners += 1
    if (status === "pending") pending += 1
    else active += 1

    const created = Date.parse(String(member.created_at || member.createdAt || ""))
    if (Number.isFinite(created) && created >= newestTime) {
      newest = member
      newestTime = created
    }
  }

  return { total: members.length, admins, learners, active, pending, newest }
}

export function filterWorkspaceMembers(members: WorkspaceMemberLike[], query = "") {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return members
  return members.filter((member) => [
    member.name,
    member.email,
    member.role,
    member.status,
  ].join(" ").toLowerCase().includes(normalized))
}

export function buildWorkspaceMembersPage(members: WorkspaceMemberLike[], query = "", limit = 10) {
  const all = filterWorkspaceMembers(members, query)
  const safeLimit = Math.max(1, limit)
  const items = all.slice(0, safeLimit)

  return {
    emptyAction: query.trim() ? "clear-search" : "invite",
    hiddenCount: Math.max(0, all.length - items.length),
    items,
    total: all.length,
  }
}

export function summarizeConnections(connections: UserConnectionLike[]) {
  let friends = 0
  let follows = 0
  let pending = 0
  let blocked = 0

  for (const connection of connections) {
    const type = String(connection.connection_type || connection.connectionType || "follow")
    const status = String(connection.status || "accepted")
    if (type === "friend") friends += 1
    else follows += 1
    if (status === "pending") pending += 1
    if (status === "blocked") blocked += 1
  }

  return { total: connections.length, friends, follows, pending, blocked }
}

export function filterConnectableMembers(members: WorkspaceMemberLike[], connections: UserConnectionLike[], currentUserId?: string, query = "") {
  const connected = new Set(connections.map((connection) => String(connection.target_user_id || connection.targetUserId || "")))
  return filterWorkspaceMembers(members, query).filter((member) => {
    const id = String(member.id || "")
    if (!id || id === currentUserId) return false
    return !connected.has(id)
  })
}

export function buildConnectablePeoplePage({
  connections,
  currentUserId,
  limit = 5,
  members,
  query = "",
}: {
  connections: UserConnectionLike[]
  currentUserId?: string
  limit?: number
  members: WorkspaceMemberLike[]
  query?: string
}) {
  const all = filterConnectableMembers(members, connections, currentUserId, query)
  const safeLimit = Math.max(1, limit)
  const items = all.slice(0, safeLimit)

  return {
    emptyAction: query.trim() ? "invite" : "search",
    hiddenCount: Math.max(0, all.length - items.length),
    items,
    total: all.length,
  }
}

export function buildPeopleSearchShortcuts(input: {
  connections: UserConnectionLike[]
  currentUserId?: string
  members: WorkspaceMemberLike[]
}): PeopleSearchShortcut[] {
  const connectable = filterConnectableMembers(input.members, input.connections, input.currentUserId)
  const countMatching = (query: string) => filterWorkspaceMembers(connectable, query).length
  const total = connectable.length

  return [
    { id: "all", label: "All", query: "", count: total, recommended: total > 0 },
    { id: "learners", label: "Learners", query: "learner", count: countMatching("learner"), recommended: false },
    { id: "admins", label: "Admins", query: "admin", count: countMatching("admin"), recommended: false },
    { id: "active", label: "Active", query: "active", count: countMatching("active"), recommended: false },
    { id: "email", label: "Email", query: "@", count: countMatching("@"), recommended: false },
  ]
}

export function buildConnectionsPage(connections: UserConnectionLike[], limit = 6) {
  const safeLimit = Math.max(1, limit)
  const items = connections.slice(0, safeLimit)
  const summary = summarizeConnections(connections)

  return {
    hiddenCount: Math.max(0, connections.length - items.length),
    items,
    summary,
    total: connections.length,
  }
}

export function buildConnectionActions(input: {
  busyAction?: ConnectionActionId | null
  busyTargetId?: string | null
  connected?: boolean
  targetId?: string
}): ConnectionActionState[] {
  const hasTarget = Boolean(input.targetId?.trim())
  const busy = Boolean(input.busyAction && input.busyTargetId === input.targetId)
  const connected = Boolean(input.connected)
  const actions: Array<Omit<ConnectionActionState, "busy" | "disabled"> & { disabled: boolean }> = [
    {
      id: "friend",
      label: "Add",
      busyLabel: "Adding",
      disabled: !hasTarget || connected,
    },
    {
      id: "follow",
      label: "Follow",
      busyLabel: "Following",
      disabled: !hasTarget || connected,
    },
    {
      id: "remove",
      label: "Remove",
      busyLabel: "Removing",
      disabled: !hasTarget || !connected,
    },
  ]

  return actions.map((action) => ({
    ...action,
    busy: busy && input.busyAction === action.id,
    disabled: busy || action.disabled,
  }))
}

export function buildSocialContactQuickActions(connection: UserConnectionLike): SocialContactQuickAction[] {
  const status = String(connection.status || "accepted").toLowerCase()
  const type = String(connection.connection_type || connection.connectionType || "follow").toLowerCase()
  const active = status !== "pending" && status !== "blocked"
  const isFriend = type === "friend"

  return [
    {
      id: "chat",
      label: "Chat",
      detail: active ? "Open direct study chat." : "Chat unlocks after this connection is accepted.",
      badge: active ? "now" : status,
      disabled: !active,
      primary: active,
      target: { kind: "tab", value: "chat" },
    },
    {
      id: "group",
      label: "Group",
      detail: active ? "Add this person to a study group." : "Groups need an accepted connection.",
      badge: isFriend ? "friend" : "follow",
      disabled: !active,
      primary: false,
      target: { kind: "tab", value: "spaces" },
    },
    {
      id: "call",
      label: "Call",
      detail: active ? "Start a focus, voice, or video room." : "Calls need an accepted connection.",
      badge: "live",
      disabled: !active,
      primary: false,
      target: { kind: "tab", value: "rooms" },
    },
  ]
}

export function buildSocialCommandSummary(input: {
  memberCount: number
  connectionCount: number
  threadCount: number
  spaceCount: number
  roomCount: number
  battleCount: number
}): SocialCommandSummary {
  const peopleReady = input.memberCount > 1 || input.connectionCount > 0
  const chatReady = input.threadCount > 0
  const groupsReady = input.spaceCount > 0
  const liveReady = input.roomCount > 0 || input.battleCount > 0
  const readyCount = [peopleReady, chatReady, groupsReady, liveReady].filter(Boolean).length

  return {
    headline: readyCount >= 3 ? "Social is ready" : readyCount ? "Finish setup" : "Start with people",
    peopleReady,
    chatReady,
    groupsReady,
    liveReady,
    chips: [
      `${input.memberCount} people`,
      `${input.connectionCount} connections`,
      `${input.threadCount} chats`,
      `${input.spaceCount + input.roomCount + input.battleCount} study areas`,
    ],
  }
}

export function buildSocialCommandPrimaryAction(input: {
  memberCount: number
  connectionCount: number
  threadCount: number
  spaceCount: number
  roomCount: number
  battleCount: number
}): SocialCommandPrimaryAction {
  if (input.memberCount <= 1 && input.connectionCount === 0) {
    return { id: "invite", label: "Invite learner", detail: "Bring one trusted learner into the workspace first." }
  }
  if (input.connectionCount === 0) {
    return { id: "find", label: "Find people", detail: "Add a friend or follow someone before starting live work." }
  }
  if (input.threadCount === 0) {
    return { id: "post", label: "Post update", detail: "Start a lightweight thread so collaborators know what to do." }
  }
  if (input.spaceCount === 0) {
    return { id: "spaces", label: "Create group", detail: "Make a small learning circle for shared goals and resources." }
  }
  if (input.roomCount === 0) {
    return { id: "rooms", label: "Start room", detail: "Open a focus room for Pomodoro, presence, and recap." }
  }
  if (input.battleCount === 0) {
    return { id: "battles", label: "Create battle", detail: "Add one short challenge for practice and retry loops." }
  }
  return { id: "rooms", label: "Open live work", detail: "Jump into the active collaboration surface." }
}

export function buildSocialCommandRunActions(input: {
  busyAction?: SocialCommandRunId | null
  hasPostDraft?: boolean
  inviteReady?: boolean
}): SocialCommandRunActionState[] {
  const busy = Boolean(input.busyAction)
  const actions: Array<Omit<SocialCommandRunActionState, "busy" | "disabled"> & { disabled: boolean }> = [
    { id: "sync", label: "Sync", busyLabel: "Syncing", disabled: false },
    { id: "post", label: "Post", busyLabel: "Posting", disabled: !input.hasPostDraft },
    { id: "invite", label: "Send", busyLabel: "Sending", disabled: !input.inviteReady },
    { id: "chat", label: "Open chat", busyLabel: "Opening", disabled: false },
    { id: "spaces", label: "Start group", busyLabel: "Creating", disabled: false },
    { id: "rooms", label: "Start room", busyLabel: "Starting", disabled: false },
    { id: "battles", label: "Start battle", busyLabel: "Creating", disabled: false },
  ]

  return actions.map((action) => ({
    ...action,
    busy: input.busyAction === action.id,
    disabled: busy || action.disabled,
  }))
}

export function buildSocialCommandModel(input: SocialCommandModelInput): SocialCommandModel {
  return {
    callModes: buildSocialCallModes({
      battleCount: input.battleCount,
      connectionCount: input.connectionCount,
      roomCount: input.roomCount,
    }),
    flowCards: buildSocialFlowCards({
      battleCount: input.battleCount,
      roomCount: input.roomCount,
      spaceCount: input.spaceCount,
      threadCount: input.threadCount,
    }),
    homeLanes: buildSocialHomeLanes({
      battleCount: input.battleCount,
      connectionCount: input.connectionCount,
      roomCount: input.roomCount,
      spaceCount: input.spaceCount,
      threadCount: input.threadCount,
    }),
    momentOptions: buildSocialMomentOptions({
      connectionCount: input.connectionCount,
      threadCount: input.threadCount,
    }),
    primaryAction: buildSocialCommandPrimaryAction(input),
    starterActions: buildSocialStarterActions({
      battleCount: input.battleCount,
      connectionCount: input.connectionCount,
      roomCount: input.roomCount,
      spaceCount: input.spaceCount,
      threadCount: input.threadCount,
    }),
    summary: buildSocialCommandSummary(input),
  }
}

export function buildSocialUnifiedSearchCommand(input: {
  connectionCount: number
  groupResultCount: number
  peopleResultCount: number
  query?: string
  roomCount: number
  threadResultCount: number
}): SocialUnifiedSearchCommand {
  const query = input.query?.trim() || ""
  const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(query)
  const connectionCount = Math.max(0, input.connectionCount)
  const groupCount = Math.max(0, input.groupResultCount)
  const peopleCount = Math.max(0, input.peopleResultCount)
  const roomCount = Math.max(0, input.roomCount)
  const threadCount = Math.max(0, input.threadResultCount)

  if (looksLikeEmail) {
    return {
      action: "invite",
      badge: "email",
      detail: "Open a secure invite for this address.",
      label: "Invite",
      scope: "people",
    }
  }

  if (query) {
    if (peopleCount > 0) {
      return {
        action: "people",
        badge: `${peopleCount}`,
        detail: "Review matching people.",
        label: "View people",
        scope: "people",
      }
    }
    if (threadCount > 0) {
      return {
        action: "chat",
        badge: `${threadCount}`,
        detail: "Open matching chats.",
        label: "Open chat",
        scope: "chats",
      }
    }
    if (groupCount > 0) {
      return {
        action: "groups",
        badge: `${groupCount}`,
        detail: "Show matching groups, rooms, or battles.",
        label: "Open group",
        scope: "groups",
      }
    }
    return {
      action: "invite",
      badge: "new",
      detail: "No match yet. Invite or refine the search.",
      label: "Invite",
      scope: "people",
    }
  }

  if (connectionCount === 0) {
    return {
      action: "people",
      badge: "start",
      detail: "Find or invite the first trusted learner.",
      label: "Find people",
      scope: "people",
    }
  }

  if (threadCount === 0) {
    return {
      action: "chat",
      badge: `${connectionCount}`,
      detail: "Start a chat with your connections.",
      label: "Start chat",
      scope: "chats",
    }
  }

  if (roomCount === 0) {
    return {
      action: "groups",
      badge: "live",
      detail: "Create a group, focus room, or battle.",
      label: "Create group",
      scope: "groups",
    }
  }

  return {
    action: "sync",
    badge: "ready",
    detail: "Refresh people, chats, groups, and live rooms.",
    label: "Refresh",
    scope: "all",
  }
}

export function buildSocialUnifiedSearchSections(input: {
  commandScope: SocialUnifiedSearchScope
  inviteEmail?: string
  query?: string
  queryLooksLikeEmail?: boolean
  selectedScope: SocialUnifiedSearchScope
}): SocialUnifiedSearchSections {
  const selectedScope = input.selectedScope
  const activeScope = selectedScope === "all" ? input.commandScope : selectedScope
  const showInvite = Boolean(input.queryLooksLikeEmail || input.inviteEmail?.trim())

  return {
    activeScope,
    showChats: activeScope === "chats",
    showGroups: activeScope === "groups",
    showInvite,
    showPeople: activeScope === "people" || (activeScope === "all" && !input.query?.trim()),
  }
}

export function buildSocialHomeLanes(input: {
  battleCount: number
  connectionCount: number
  roomCount: number
  spaceCount: number
  threadCount: number
}): SocialHomeLane[] {
  const hasFriends = input.connectionCount > 0
  const hasChats = input.threadCount > 0
  const hasGroups = input.spaceCount > 0
  const liveCount = input.roomCount + input.battleCount

  return [
    {
      id: "friends",
      label: "Friends",
      detail: hasFriends ? "People you can study with" : "Add a friend or follow someone",
      action: hasFriends ? "Open friends" : "Find people",
      count: input.connectionCount,
      primary: !hasFriends,
      target: { kind: "command", value: hasFriends ? "connections" : "people" },
    },
    {
      id: "chats",
      label: "Chats",
      detail: hasChats ? "Messages and study threads" : "Start the first chat",
      action: hasChats ? "Open chats" : "New chat",
      count: input.threadCount,
      primary: hasFriends && !hasChats,
      target: { kind: "tab", value: "chat" },
    },
    {
      id: "moments",
      label: "Moments",
      detail: "Share a short win, question, or update",
      action: "Post moment",
      count: input.threadCount,
      primary: hasChats && !hasGroups,
      target: { kind: "command", value: "post" },
    },
    {
      id: "groups",
      label: "Groups",
      detail: hasGroups ? "Circles, resources, and shared goals" : "Create a small study group",
      action: hasGroups ? "Open groups" : "Create group",
      count: input.spaceCount,
      primary: hasChats && !hasGroups,
      target: { kind: "tab", value: "spaces" },
    },
    {
      id: "calls",
      label: "Calls",
      detail: liveCount ? "Live rooms and challenge calls" : "Start focus, voice, or video study",
      action: liveCount ? "Open live" : "Start call",
      count: liveCount,
      primary: hasGroups && liveCount === 0,
      target: { kind: "tab", value: "rooms" },
    },
  ]
}

export function buildSocialStarterActions(input: {
  battleCount: number
  connectionCount: number
  roomCount: number
  spaceCount: number
  threadCount: number
}): SocialStarterAction[] {
  const hasFriends = input.connectionCount > 0
  const hasChats = input.threadCount > 0
  const hasGroups = input.spaceCount > 0
  const liveCount = input.roomCount + input.battleCount

  return [
    {
      id: "add-friend",
      label: "Add",
      detail: hasFriends ? "Open friends and requests." : "Find or invite your first study friend.",
      badge: hasFriends ? String(input.connectionCount) : "new",
      primary: !hasFriends,
      target: { kind: "command", value: hasFriends ? "connections" : "people" },
    },
    {
      id: "chat",
      label: "Chat",
      detail: hasChats ? "Open study conversations." : "Start the first chat thread.",
      badge: String(input.threadCount),
      primary: hasFriends && !hasChats,
      target: { kind: "tab", value: "chat" },
    },
    {
      id: "moment",
      label: "Moment",
      detail: "Share a short win, question, or learning update.",
      badge: "post",
      primary: hasChats && !hasGroups,
      target: { kind: "command", value: "post" },
    },
    {
      id: "group",
      label: "Group",
      detail: hasGroups ? "Open circles and shared resources." : "Create a small study group.",
      badge: String(input.spaceCount),
      primary: hasChats && !hasGroups,
      target: { kind: "tab", value: "spaces" },
    },
    {
      id: "call",
      label: "Call",
      detail: liveCount ? "Open live rooms and battles." : "Start a focus, voice, video, or battle room.",
      badge: String(liveCount),
      primary: hasGroups && liveCount === 0,
      target: { kind: "tab", value: "rooms" },
    },
  ]
}

export function buildSocialCallModes(input: {
  battleCount: number
  connectionCount: number
  roomCount: number
}): SocialCallMode[] {
  const hasFriends = input.connectionCount > 0
  const hasRooms = input.roomCount > 0
  const hasBattles = input.battleCount > 0

  return [
    {
      id: "voice",
      label: "Voice call",
      detail: "Open a low-friction study room for quick questions.",
      action: hasRooms ? "Open room" : "Start voice room",
      badge: hasFriends ? "Friends" : "Invite first",
      target: "rooms",
      recommended: hasFriends && !hasRooms,
    },
    {
      id: "video",
      label: "Video call",
      detail: "Use a room for face-to-face explanations and screen-friendly recap.",
      action: hasRooms ? "Open video room" : "Start video room",
      badge: "Room",
      target: "rooms",
      recommended: false,
    },
    {
      id: "group",
      label: "Group call",
      detail: "Gather a small circle around one topic, then save the recap.",
      action: hasRooms ? "Open group room" : "Start group call",
      badge: `${input.connectionCount} friends`,
      target: "rooms",
      recommended: hasFriends && hasRooms,
    },
    {
      id: "focus",
      label: "Focus room",
      detail: "Run Pomodoro presence with quiet accountability.",
      action: hasRooms ? "Join focus" : "Start focus",
      badge: `${input.roomCount} rooms`,
      target: "rooms",
      recommended: !hasFriends,
    },
    {
      id: "battle",
      label: "Battle huddle",
      detail: "Jump into a challenge call, then retry missed questions together.",
      action: hasBattles ? "Open battle" : "Create battle",
      badge: `${input.battleCount} battles`,
      target: "battles",
      recommended: hasFriends && !hasBattles,
    },
  ]
}

export function buildSocialFlowCards(input: {
  threadCount: number
  spaceCount: number
  roomCount: number
  battleCount: number
}): SocialFlowCard[] {
  return [
    { id: "chat", label: "Chat", action: input.threadCount ? "Open threads" : "Post first update", createAction: "Post update", count: input.threadCount, ready: input.threadCount > 0 },
    { id: "spaces", label: "Groups", action: input.spaceCount ? "Open groups" : "Create group", createAction: input.spaceCount ? "New group" : "Create group", count: input.spaceCount, ready: input.spaceCount > 0 },
    { id: "rooms", label: "Live", action: input.roomCount ? "Open room" : "Start room", createAction: input.roomCount ? "New room" : "Start room", count: input.roomCount, ready: input.roomCount > 0 },
    { id: "battles", label: "Battles", action: input.battleCount ? "Play battle" : "Create battle", createAction: input.battleCount ? "New battle" : "Create battle", count: input.battleCount, ready: input.battleCount > 0 },
  ]
}

export function buildSocialActivityTimeline(input: {
  kind: SocialWorkspaceKind
  title?: string
  saved?: boolean
  inviteLinkReady?: boolean
  memberSummary: WorkspaceMemberSummary
  suggestedAction: string
}) {
  const title = (input.title || "").trim() || fallbackSocialTitle(input.kind)
  const noun = socialKindNoun(input.kind)
  const items: SocialActivityItem[] = [
    {
      id: "record",
      label: input.saved ? `${capitalize(noun)} saved` : `${capitalize(noun)} draft`,
      detail: input.saved ? `${title} is ready for invites and coordination.` : `Save ${title} before sharing live links.`,
      tone: input.saved ? "ready" : "draft",
    },
    {
      id: "invite",
      label: input.inviteLinkReady ? "Secure invite ready" : "Invite can be created",
      detail: input.inviteLinkReady ? "A secure invite link is available for onboarding." : "Use the invite drawer to copy text or create a secure link.",
      tone: input.inviteLinkReady ? "ready" : "next",
    },
    {
      id: "people",
      label: `${input.memberSummary.total} people visible`,
      detail: `${input.memberSummary.active} active, ${input.memberSummary.pending} pending, ${input.memberSummary.admins} admin.`,
      tone: input.memberSummary.pending ? "next" : "ready",
    },
    {
      id: "next",
      label: "Next move",
      detail: input.suggestedAction,
      tone: "next",
    },
  ]

  return items
}

export function summarizeSocialActions(actions: SocialActionLike[]) {
  const actionCounts = new Map<string, number>()
  let comments = 0
  let saves = 0
  let newest: SocialActionLike | undefined
  let newestTime = 0

  for (const action of actions) {
    const type = String(action.action_type || action.actionType || "activity")
    actionCounts.set(type, (actionCounts.get(type) ?? 0) + 1)
    if (type === "comment" || Boolean(action.body)) comments += 1
    if (type === "save" || type === "bookmark") saves += 1
    const created = Date.parse(String(action.created_at || action.createdAt || ""))
    if (Number.isFinite(created) && created >= newestTime) {
      newest = action
      newestTime = created
    }
  }

  return {
    total: actions.length,
    comments,
    saves,
    newest,
    topActions: [...actionCounts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((first, second) => second.count - first.count || first.label.localeCompare(second.label)),
  }
}

export function buildSocialActionsPage(actions: SocialActionLike[], limit = 4) {
  const safeLimit = Math.max(1, limit)
  const items = actions.slice(0, safeLimit)

  return {
    hiddenCount: Math.max(0, actions.length - items.length),
    items,
    total: actions.length,
  }
}

export function formatSocialAction(action: SocialActionLike) {
  const actor = String(action.actor_name || action.actorName || "Someone")
  const type = String(action.action_type || action.actionType || "activity").replace(/_/g, " ")
  const target = String(action.target_type || action.targetType || "item").replace(/_/g, " ")
  const body = String(action.body || "").trim()
  return {
    label: `${actor} ${type}`,
    detail: body || `Updated ${target}.`,
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

export function findRecommendedSocialRecord(kind: SocialWorkspaceKind, records: SocialRecordLike[]) {
  if (kind === "spaces") {
    return records.find((record) => record.visibility === "public") ?? records[0]
  }
  if (kind === "rooms") {
    return records.find((record) => record.status === "active" || record.status === "open") ?? records[0]
  }
  return records.find((record) => record.mode === "team") ?? records.find((record) => record.status === "waiting" || record.status === "active") ?? records[0]
}

export function buildSocialRecordCard(kind: SocialWorkspaceKind, record: SocialRecordLike, recommendedId?: string): SocialRecordCard {
  const id = String(record.id || "")
  return {
    action: socialRecordAction(kind, record),
    meta: socialRecordMeta(kind, record),
    recommended: Boolean(id && recommendedId === id),
    status: socialRecordStatus(record),
    title: socialRecordTitle(record),
  }
}

export function buildSocialRecordSelectionMessage(kind: SocialWorkspaceKind, record: SocialRecordLike) {
  const title = socialRecordTitle(record)
  if (kind === "spaces") return `${title} opened. Invite, chat, or share resources next.`
  if (kind === "rooms") return `${title} opened. Join, schedule, or attach resources next.`
  return `${title} opened. Play, recap misses, or schedule a rematch next.`
}

export function buildSocialRecordEmptyState(input: {
  emptyHint: string
  filter: SocialRecordFilter
  query?: string
  title: string
  total: number
  visible: number
}): SocialRecordEmptyState {
  const query = input.query?.trim() || ""
  if (input.total > 0 && input.visible === 0) {
    const filterLabel = input.filter === "all" ? "current filters" : `${input.filter} filter`
    return {
      action: "clear",
      body: query
        ? `No results for "${query}". Clear search or filters to see all records.`
        : `No records match the ${filterLabel}. Clear filters to see everything.`,
      title: "No matching records",
    }
  }

  return {
    action: "create",
    body: input.emptyHint,
    title: `No ${input.title.toLowerCase()} yet`,
  }
}

export function buildSocialRecordFilterSummary(input: {
  filter: SocialRecordFilter
  query?: string
  total: number
  visible: number
}): SocialRecordFilterSummary {
  const query = input.query?.trim() || ""
  const active = Boolean(query) || input.filter !== "all"
  if (!active) {
    return { active: false, label: `${input.visible}/${input.total} visible` }
  }

  const parts = [
    query ? `"${query}"` : "",
    input.filter !== "all" ? input.filter : "",
  ].filter(Boolean)

  return {
    active: true,
    label: `Filtered: ${parts.join(" + ")} (${input.visible}/${input.total})`,
  }
}

export function buildSocialRecordsPage(records: SocialRecordLike[], input: { query?: string; filter?: SocialRecordFilter; limit?: number }) {
  const all = filterSocialRecords(records, input)
  const safeLimit = Math.max(1, input.limit ?? 12)
  const items = all.slice(0, safeLimit)

  return {
    hiddenCount: Math.max(0, all.length - items.length),
    items,
    total: all.length,
  }
}

export function socialRecordTitle(record: SocialRecordLike) {
  return String(record.title || record.name || "Untitled").trim()
}

export function socialRecordStatus(record: SocialRecordLike) {
  return String(record.status || record.visibility || record.mode || "ready").trim()
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function fallbackSocialTitle(kind: SocialWorkspaceKind) {
  if (kind === "rooms") return "Focus room"
  if (kind === "battles") return "Study battle"
  return "Learning group"
}

function socialKindNoun(kind: SocialWorkspaceKind) {
  if (kind === "rooms") return "room"
  if (kind === "battles") return "battle"
  return "group"
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

function socialRecordAction(kind: SocialWorkspaceKind, record: SocialRecordLike) {
  if (kind === "spaces") return record.visibility === "public" ? "Review" : "Open"
  if (kind === "rooms") return record.status === "active" || record.status === "open" ? "Join" : "Plan"
  if (record.status === "waiting" || record.status === "active") return "Play"
  return "Review"
}

function socialRecordMeta(kind: SocialWorkspaceKind, record: SocialRecordLike) {
  if (kind === "spaces") {
    const memberCount = record.member_count ?? record.memberCount ?? 1
    return [String(record.visibility || "private"), `${memberCount} ${memberCount === 1 ? "member" : "members"}`]
  }
  if (kind === "rooms") {
    const minutes = record.pomodoro_minutes ?? record.pomodoroMinutes ?? 25
    return [String(record.mode || "focus"), `${minutes} min`]
  }
  return [String(record.mode || "solo"), String(record.topic || "review")]
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
