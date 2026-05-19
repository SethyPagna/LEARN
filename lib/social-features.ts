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
  meta: string[]
  recommended: boolean
  status: string
  title: string
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

export interface SocialInviteDraft {
  email: string
  role: "learner" | "admin"
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

export interface SocialCommandSummary {
  headline: string
  peopleReady: boolean
  chatReady: boolean
  groupsReady: boolean
  liveReady: boolean
  chips: string[]
}

export type SocialFlowId = "chat" | "spaces" | "rooms" | "battles"

export interface SocialFlowCard {
  id: SocialFlowId
  label: string
  action: string
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
    if (searchable.includes("[saved]") || searchable.includes(" saved ") || searchable.includes("bookmark")) saved += 1
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
    inviteText: `Join my LEARN learning space: ${title}. It is for ${topic} study, shared notes, questions, and focused practice.`,
    chips: [savedCue, status, input.visibility || "private"],
    actions: [
      { id: "invite", label: "Invite", detail: "Copy a space invite." },
      { id: "chat", label: "Chat", detail: "Start a thread." },
      { id: "files", label: "Resources", detail: "Add files." },
      { id: "practice", label: "Practice", detail: "Create a drill." },
    ],
  } satisfies SocialActionKit
}

export function buildSocialActionReadiness(kind: SocialWorkspaceKind, action: SocialActionItem, saved: boolean): SocialActionReadiness {
  if (saved) return { ...action, enabled: true }

  const noun = kind === "rooms" ? "room" : kind === "battles" ? "battle" : "space"
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
  const noun = input.kind === "rooms" ? "room" : input.kind === "battles" ? "battle" : "space"
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
  const role = input.role === "admin" ? "admin" : "learner"
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Enter a valid email address." }
  return { ok: true, value: { email, role } }
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

export function buildSocialFlowCards(input: {
  threadCount: number
  spaceCount: number
  roomCount: number
  battleCount: number
}): SocialFlowCard[] {
  return [
    { id: "chat", label: "Chat", action: input.threadCount ? "Open threads" : "Post first update", count: input.threadCount, ready: input.threadCount > 0 },
    { id: "spaces", label: "Groups", action: input.spaceCount ? "Open groups" : "Create group", count: input.spaceCount, ready: input.spaceCount > 0 },
    { id: "rooms", label: "Live", action: input.roomCount ? "Open room" : "Start room", count: input.roomCount, ready: input.roomCount > 0 },
    { id: "battles", label: "Battles", action: input.battleCount ? "Play battle" : "Create battle", count: input.battleCount, ready: input.battleCount > 0 },
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
  const noun = input.kind === "rooms" ? "room" : input.kind === "battles" ? "battle" : "space"
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
    meta: socialRecordMeta(kind, record),
    recommended: Boolean(id && recommendedId === id),
    status: socialRecordStatus(record),
    title: socialRecordTitle(record),
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
  return "Learning space"
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
