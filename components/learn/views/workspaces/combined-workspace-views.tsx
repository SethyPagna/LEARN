"use client"

import { useEffect, useMemo, useState, type ComponentType } from "react"
import { BookOpen, Bot, ChevronDown, Clock, Gamepad2, ImageIcon, Info, Mail, MessageSquare, Mic, MoreHorizontal, PhoneCall, Play, Plus, Radio, Repeat2, Search, Send, Sparkles, Swords, Target, Trash2, Users, UsersRound, Video } from "lucide-react"
import type { Quiz, User, View } from "../../types"
import type { WorkspaceOptions } from "../../preferences"
import { api } from "../../api"
import { Panel } from "../../ui"
import { SocialLearningView } from "../ecosystem-views"
import { ChatView, GamesView } from "../productivity-views"
import { QuizView } from "../quiz-view"
import { buildLearnRoutePlan } from "@/lib/learn-route-features"
import { clearPracticeDraft, listPracticeDraftCards, PRACTICE_DRAFT_EVENT, readPracticeDrafts, type PracticeDraftCard } from "@/lib/practice-drafts"
import { buildPracticeGameModes, buildPracticePlayStyles, buildPracticeWorkspacePlan, type PracticeGameMode, type PracticePlayStyle, type PracticeWorkspaceAction, type PracticeWorkspacePlan, type PracticeWorkspaceTarget } from "@/lib/practice-features"
import { buildChatDraftPayload, buildConnectablePeoplePage, buildConnectionActions, buildConnectionsPage, buildPeopleSearchShortcuts, buildSocialCallModes, buildSocialCommandPrimaryAction, buildSocialCommandRunActions, buildSocialCommandSummary, buildSocialContactQuickActions, buildSocialFlowCards, buildSocialHomeLanes, buildSocialMomentOptions, buildSocialStarterActions, normalizeSocialInviteDraft, summarizeConnections, type ConnectionActionId, type PeopleSearchShortcut, type SocialCallMode, type SocialCommandPrimaryActionId, type SocialCommandRunId, type SocialContactQuickAction, type SocialFlowId, type SocialHomeLane, type SocialMomentOption, type SocialMomentTypeId, type SocialStarterAction, type UserConnectionLike, type WorkspaceMemberLike } from "@/lib/social-features"

type PracticeTab = "quizzes" | "games"
type SocialTab = "home" | "chat" | "spaces" | "rooms" | "battles"
type SocialCommandTab = "people" | "post" | "invite" | "connections"

const practiceTabs: Array<{ id: PracticeTab; label: string; icon: ComponentType<{ className?: string }>; caption: string }> = [
  { id: "quizzes", label: "Quizzes", icon: BookOpen, caption: "Question banks and attempts" },
  { id: "games", label: "Games", icon: Gamepad2, caption: "Fast recall and playful drills" },
]

const socialTabs: Array<{ id: SocialTab; label: string; icon: ComponentType<{ className?: string }>; caption: string }> = [
  { id: "home", label: "Start", icon: Sparkles, caption: "Find people, post, and choose the right social flow" },
  { id: "chat", label: "Chat", icon: MessageSquare, caption: "Messages and threads" },
  { id: "spaces", label: "Groups", icon: Users, caption: "Shared goals and resources" },
  { id: "rooms", label: "Live", icon: Radio, caption: "Focus rooms" },
  { id: "battles", label: "Battles", icon: Swords, caption: "Quiz challenges" },
]

const socialCommandTabs: Array<{ id: SocialCommandTab; label: string; icon: ComponentType<{ className?: string }> }> = [
  { id: "people", label: "Find", icon: Search },
  { id: "post", label: "Message", icon: Send },
  { id: "invite", label: "Invite", icon: Mail },
  { id: "connections", label: "Friends", icon: Users },
]

const socialHomeLaneIcons: Record<SocialHomeLane["id"], ComponentType<{ className?: string }>> = {
  friends: Users,
  chats: MessageSquare,
  moments: ImageIcon,
  groups: Users,
  calls: PhoneCall,
}

const socialCallModeIcons: Record<SocialCallMode["id"], ComponentType<{ className?: string }>> = {
  voice: Mic,
  video: Video,
  group: UsersRound,
  focus: Radio,
  battle: Swords,
}

const socialStarterActionIcons: Record<SocialStarterAction["id"], ComponentType<{ className?: string }>> = {
  "add-friend": Users,
  chat: MessageSquare,
  moment: ImageIcon,
  group: UsersRound,
  call: PhoneCall,
}

const socialContactQuickActionIcons: Record<SocialContactQuickAction["id"], ComponentType<{ className?: string }>> = {
  chat: MessageSquare,
  group: UsersRound,
  call: PhoneCall,
}

const socialMomentOptionIcons: Record<SocialMomentOption["id"], ComponentType<{ className?: string }>> = {
  win: Sparkles,
  question: MessageSquare,
  resource: BookOpen,
  milestone: Target,
}

const practicePlayStyleIcons: Record<PracticePlayStyle["id"], ComponentType<{ className?: string }>> = {
  live: Target,
  study: BookOpen,
  assessment: Clock,
  arcade: Gamepad2,
  strategy: Swords,
}

const practiceGameModeIcons: Record<PracticeGameMode["id"], ComponentType<{ className?: string }>> = {
  classic: Target,
  "team-race": Users,
  match: Repeat2,
  redemption: Clock,
  "arcade-quest": Gamepad2,
  economy: Swords,
}

export function LearnWorkspaceView({
  dashboard,
  quizzes,
  setView,
}: {
  dashboard: any
  quizzes: Quiz[]
  setView: (view: View) => void
}) {
  return (
    <WorkspaceFrame
      eyebrow="Learn workspace"
      title="Learn"
      body="Shape the next learning path without duplicating Dashboard, Reviews, or Calendar."
    >
      <LearnRoute dashboard={dashboard} quizzes={quizzes} setView={setView} />
    </WorkspaceFrame>
  )
}

export function PracticeWorkspaceView({
  initialView,
  options,
  quizzes,
  selectedQuizId,
  setSelectedQuizId,
  setView,
}: {
  initialView: View
  options: WorkspaceOptions
  quizzes: Quiz[]
  selectedQuizId: string
  setSelectedQuizId: (id: string) => void
  setView: (view: View) => void
}) {
  const [tab, setTab] = useState<PracticeTab>(initialView === "games" ? "games" : "quizzes")
  const [draftCards, setDraftCards] = useState<PracticeDraftCard[]>([])
  const quizTitles = useMemo(() => Object.fromEntries(quizzes.map((quiz) => [quiz.id, quiz.title])), [quizzes])
  const practicePlan = useMemo(() => buildPracticeWorkspacePlan({
    activeTarget: tab,
    quizCount: quizzes.length,
    draftCount: draftCards.length,
    answeredDraftCount: draftCards.reduce((sum, draft) => sum + draft.answeredCount, 0),
    markedDraftCount: draftCards.reduce((sum, draft) => sum + draft.markedCount, 0),
    retryDraftCount: draftCards.reduce((sum, draft) => sum + draft.retryCount, 0),
  }), [draftCards, quizzes.length, tab])
  const playStyles = useMemo(() => buildPracticePlayStyles({
    draftCount: draftCards.length,
    hasQuizBanks: quizzes.length > 0,
    markedCount: draftCards.reduce((sum, draft) => sum + draft.markedCount, 0),
    retryCount: draftCards.reduce((sum, draft) => sum + draft.retryCount, 0),
  }), [draftCards, quizzes.length])
  const gameModes = useMemo(() => buildPracticeGameModes({
    draftCount: draftCards.length,
    hasQuizBanks: quizzes.length > 0,
    markedCount: draftCards.reduce((sum, draft) => sum + draft.markedCount, 0),
    retryCount: draftCards.reduce((sum, draft) => sum + draft.retryCount, 0),
  }), [draftCards, quizzes.length])

  useEffect(() => {
    setTab(initialView === "games" ? "games" : "quizzes")
  }, [initialView])

  useEffect(() => {
    function syncDraftCards() {
      setDraftCards(listPracticeDraftCards(readPracticeDrafts(), quizTitles))
    }

    syncDraftCards()
    window.addEventListener(PRACTICE_DRAFT_EVENT, syncDraftCards)
    return () => window.removeEventListener(PRACTICE_DRAFT_EVENT, syncDraftCards)
  }, [quizTitles])

  function resumeDraft(quizId: string) {
    setSelectedQuizId(quizId)
    setTab("quizzes")
    setView("quizzes")
  }

  function discardDraft(quizId: string) {
    clearPracticeDraft(quizId)
    setDraftCards(listPracticeDraftCards(readPracticeDrafts(), quizTitles))
  }

  function openPracticeTarget(target: PracticeWorkspaceTarget) {
    setTab(target)
    setView(viewFromPracticeTab(target))
  }

  return (
    <WorkspaceFrame
      eyebrow="Practice workspace"
      title="Practice arena"
      body="Quizzes and games share one practice surface. Start simple, then use modes, timers, and retries when needed."
      tabs={practiceTabs}
      activeTab={tab}
      setActiveTab={(value) => {
        const nextTab = value as PracticeTab
        setTab(nextTab)
        setView(viewFromPracticeTab(nextTab))
      }}
    >
      <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
        <div>{tab === "quizzes" ? <QuizView quizzes={quizzes} selectedQuizId={selectedQuizId} setSelectedQuizId={setSelectedQuizId} options={options} /> : <GamesView quizzes={quizzes} options={options} />}</div>
        <PracticeGuide draftCards={draftCards} gameModes={gameModes} onClearDraft={discardDraft} onCreatePractice={() => setView("ai")} onOpenTarget={openPracticeTarget} onResumeDraft={resumeDraft} plan={practicePlan} playStyles={playStyles} />
      </div>
    </WorkspaceFrame>
  )
}

export function SocialWorkspaceView({ initialView, options, setView, user }: { initialView: View; options: WorkspaceOptions; setView: (view: View) => void; user: User | null }) {
  const [tab, setTab] = useState<SocialTab>(socialTabFromView(initialView))

  useEffect(() => {
    setTab(socialTabFromView(initialView))
  }, [initialView])

  return (
    <WorkspaceFrame
      eyebrow="Social workspace"
      title="Social"
      body="Find people first, then choose chat, groups, live rooms, or battles."
      tabs={socialTabs}
      activeTab={tab}
      setActiveTab={(value) => {
        const nextTab = value as SocialTab
        setTab(nextTab)
        setView(viewFromSocialTab(nextTab))
      }}
    >
      {tab === "home" ? <SocialCommandCenter currentUserId={user?.id} setActiveTab={setTab} setView={setView} /> : null}
      {tab === "chat" ? <ChatView options={options} /> : null}
      {tab === "spaces" ? <SocialLearningView kind="spaces" setView={setView} /> : null}
      {tab === "rooms" ? <SocialLearningView kind="rooms" setView={setView} /> : null}
      {tab === "battles" ? <SocialLearningView kind="battles" setView={setView} /> : null}
    </WorkspaceFrame>
  )
}

function SocialCommandCenter({ currentUserId, setActiveTab, setView }: { currentUserId?: string; setActiveTab: (tab: SocialTab) => void; setView: (view: View) => void }) {
  const [members, setMembers] = useState<WorkspaceMemberLike[]>([])
  const [connections, setConnections] = useState<UserConnectionLike[]>([])
  const [threads, setThreads] = useState<any[]>([])
  const [counts, setCounts] = useState({ spaces: 0, rooms: 0, battles: 0 })
  const [query, setQuery] = useState("")
  const [quickPost, setQuickPost] = useState("")
  const [momentType, setMomentType] = useState<SocialMomentTypeId>("win")
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<"learner" | "admin">("learner")
  const [status, setStatus] = useState("Loading")
  const [commandTab, setCommandTab] = useState<SocialCommandTab>("people")
  const [peopleLimit, setPeopleLimit] = useState(5)
  const [connectionLimit, setConnectionLimit] = useState(6)
  const [connectionAction, setConnectionAction] = useState<{ action: ConnectionActionId; targetId: string } | null>(null)
  const [commandAction, setCommandAction] = useState<SocialCommandRunId | null>(null)
  const connectionSummary = useMemo(() => summarizeConnections(connections), [connections])
  const peoplePage = useMemo(() => buildConnectablePeoplePage({ members, connections, currentUserId, query, limit: peopleLimit }), [connections, currentUserId, members, peopleLimit, query])
  const peopleShortcuts = useMemo(() => buildPeopleSearchShortcuts({ connections, currentUserId, members }), [connections, currentUserId, members])
  const connectionPage = useMemo(() => buildConnectionsPage(connections, connectionLimit), [connectionLimit, connections])
  const connectableMembers = peoplePage.items
  const inviteValidation = useMemo(() => normalizeSocialInviteDraft({ email: inviteEmail, role: inviteRole }), [inviteEmail, inviteRole])
  const inviteReady = Boolean(inviteEmail.trim()) && inviteValidation.ok
  const inviteStatus = inviteEmail.trim() ? inviteValidation.ok ? "Ready" : inviteValidation.error : "Enter email"
  const commandSummary = useMemo(() => buildSocialCommandSummary({
    memberCount: members.length,
    connectionCount: connectionSummary.total,
    threadCount: threads.length,
    spaceCount: counts.spaces,
    roomCount: counts.rooms,
    battleCount: counts.battles,
  }), [connectionSummary.total, counts.battles, counts.rooms, counts.spaces, members.length, threads.length])
  const primaryCommand = useMemo(() => buildSocialCommandPrimaryAction({
    memberCount: members.length,
    connectionCount: connectionSummary.total,
    threadCount: threads.length,
    spaceCount: counts.spaces,
    roomCount: counts.rooms,
    battleCount: counts.battles,
  }), [connectionSummary.total, counts.battles, counts.rooms, counts.spaces, members.length, threads.length])
  const flowCards = useMemo(() => buildSocialFlowCards({
    threadCount: threads.length,
    spaceCount: counts.spaces,
    roomCount: counts.rooms,
    battleCount: counts.battles,
  }), [counts.battles, counts.rooms, counts.spaces, threads.length])
  const homeLanes = useMemo(() => buildSocialHomeLanes({
    battleCount: counts.battles,
    connectionCount: connectionSummary.total,
    roomCount: counts.rooms,
    spaceCount: counts.spaces,
    threadCount: threads.length,
  }), [connectionSummary.total, counts.battles, counts.rooms, counts.spaces, threads.length])
  const starterActions = useMemo(() => buildSocialStarterActions({
    battleCount: counts.battles,
    connectionCount: connectionSummary.total,
    roomCount: counts.rooms,
    spaceCount: counts.spaces,
    threadCount: threads.length,
  }), [connectionSummary.total, counts.battles, counts.rooms, counts.spaces, threads.length])
  const callModes = useMemo(() => buildSocialCallModes({
    battleCount: counts.battles,
    connectionCount: connectionSummary.total,
    roomCount: counts.rooms,
  }), [connectionSummary.total, counts.battles, counts.rooms])
  const momentOptions = useMemo(() => buildSocialMomentOptions({
    connectionCount: connectionSummary.total,
    threadCount: threads.length,
  }), [connectionSummary.total, threads.length])
  const activeMomentOption = momentOptions.find((option) => option.id === momentType) ?? momentOptions[0]
  const commandCounts = useMemo<Record<SocialCommandTab, string>>(() => ({
    people: String(peoplePage.total),
    post: String(threads.length),
    invite: inviteReady ? "ready" : "0",
    connections: String(connectionSummary.total),
  }), [connectionSummary.total, inviteReady, peoplePage.total, threads.length])
  const commandActions = useMemo(() => buildSocialCommandRunActions({
    busyAction: commandAction,
    hasPostDraft: Boolean(quickPost.trim()),
    inviteReady,
  }), [commandAction, inviteReady, quickPost])
  const commandActionById = useMemo(() => new Map(commandActions.map((action) => [action.id, action])), [commandActions])

  useEffect(() => {
    setPeopleLimit(5)
  }, [query])

  async function refresh() {
    if (commandAction) return
    setCommandAction("sync")
    setStatus("Loading")
    try {
      const [memberData, connectionData, chatData, spaceData, roomData, battleData] = await Promise.all([
        api<{ items: WorkspaceMemberLike[] }>("/api/workspace/members"),
        api<{ items: UserConnectionLike[] }>("/api/connections"),
        api<{ items: any[] }>("/api/chat"),
        api<{ items: any[] }>("/api/learning-spaces"),
        api<{ items: any[] }>("/api/study-rooms"),
        api<{ items: any[] }>("/api/study-battles"),
      ])
      setMembers(memberData.items)
      setConnections(connectionData.items)
      setThreads(chatData.items)
      setCounts({ spaces: spaceData.items.length, rooms: roomData.items.length, battles: battleData.items.length })
      setStatus("Ready")
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to load social workspace")
    } finally {
      setCommandAction(null)
    }
  }

  useEffect(() => {
    refresh().catch(() => undefined)
  }, [])

  async function connect(member: WorkspaceMemberLike, type: "friend" | "follow") {
    if (!member.id || connectionAction) return
    setConnectionAction({ action: type, targetId: member.id })
    setStatus(type === "friend" ? "Adding friend..." : "Following...")
    try {
      await api("/api/connections", {
        method: "POST",
        body: JSON.stringify({ targetUserId: member.id, connectionType: type, status: type === "friend" ? "pending" : "accepted" }),
      })
      await refresh()
      setStatus(type === "friend" ? "Friend request ready" : "Following")
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to connect")
    } finally {
      setConnectionAction(null)
    }
  }

  async function removeConnection(connection: UserConnectionLike) {
    const targetUserId = String(connection.target_user_id || connection.targetUserId || "")
    if (!targetUserId || connectionAction) return
    const connectionType = String(connection.connection_type || connection.connectionType || "follow")
    setConnectionAction({ action: "remove", targetId: targetUserId })
    setStatus("Removing...")
    try {
      await api("/api/connections", {
        method: "DELETE",
        body: JSON.stringify({ targetUserId, connectionType }),
      })
      await refresh()
      setStatus("Removed")
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to remove")
    } finally {
      setConnectionAction(null)
    }
  }

  async function sendQuickPost() {
    if (commandActionById.get("post")?.disabled) return
    setCommandAction("post")
    setStatus("Posting...")
    try {
      await api("/api/chat", {
        method: "POST",
        body: JSON.stringify(buildChatDraftPayload({ body: quickPost, channel: activeMomentOption.channel, title: activeMomentOption.label, intent: activeMomentOption.intent })),
      })
      setQuickPost("")
      setActiveTab("chat")
      setView("chat")
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to post")
    } finally {
      setCommandAction(null)
    }
  }

  function chooseMoment(option: SocialMomentOption) {
    setMomentType(option.id)
    if (!quickPost.trim()) setQuickPost(option.prompt)
  }

  function applyPeopleShortcut(shortcut: PeopleSearchShortcut) {
    setQuery(shortcut.query)
    setPeopleLimit(5)
  }

  async function createInvite() {
    if (commandActionById.get("invite")?.disabled) return
    if (!inviteValidation.ok) {
      setStatus(inviteStatus)
      return
    }
    setCommandAction("invite")
    setStatus("Inviting...")
    try {
      await api("/api/invites", {
        method: "POST",
        body: JSON.stringify(inviteValidation.value),
      })
      setInviteEmail("")
      setStatus("Invite sent")
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to invite")
    } finally {
      setCommandAction(null)
    }
  }

  async function createSocialPlace(id: SocialFlowId) {
    if (id === "chat") {
      if (quickPost.trim()) {
        await sendQuickPost()
      } else {
        if (commandActionById.get("chat")?.disabled) return
        setCommandAction("chat")
        open("chat")
        setCommandAction(null)
      }
      return
    }
    if (commandActionById.get(id)?.disabled) return
    setCommandAction(id)
    setStatus(id === "spaces" ? "Creating group..." : id === "rooms" ? "Starting room..." : "Creating battle...")
    const createdAt = new Date().toLocaleDateString("en", { month: "short", day: "numeric" })
    const endpoint = id === "spaces" ? "/api/learning-spaces" : id === "rooms" ? "/api/study-rooms" : "/api/study-battles"
    const body =
      id === "spaces"
        ? { name: `Study group ${createdAt}`, description: "Shared notes, questions, and review plans.", visibility: "private", topicTags: ["study"] }
        : id === "rooms"
          ? { name: `Focus room ${createdAt}`, mode: "focus", status: "open", pomodoroMinutes: 25, breakMinutes: 5 }
          : { title: `Quick battle ${createdAt}`, topic: "Review", mode: "solo", status: "waiting" }
    try {
      await api(endpoint, { method: "POST", body: JSON.stringify(body) })
      await refresh()
      open(id)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to create")
    } finally {
      setCommandAction(null)
    }
  }

  function open(tab: SocialTab) {
    setActiveTab(tab)
    setView(viewFromSocialTab(tab))
  }

  function openHomeLane(lane: SocialHomeLane) {
    if (lane.target.kind === "command") {
      setCommandTab(lane.target.value)
      return
    }
    open(lane.target.value)
  }

  function openStarterAction(action: SocialStarterAction) {
    if (action.target.kind === "command") {
      setCommandTab(action.target.value)
      return
    }
    open(action.target.value)
  }

  function openContactAction(action: SocialContactQuickAction) {
    if (action.disabled) return
    open(action.target.value)
  }

  function openCallMode(mode: SocialCallMode) {
    const count = mode.target === "rooms" ? counts.rooms : counts.battles
    if (count > 0) {
      open(mode.target)
      return
    }
    void createSocialPlace(mode.target)
  }

  function runPrimaryCommand(id: SocialCommandPrimaryActionId) {
    if (commandAction) return
    if (id === "find") {
      setCommandTab("people")
      return
    }
    if (id === "invite") {
      setCommandTab("invite")
      return
    }
    if (id === "post") {
      setCommandTab("post")
      return
    }
    const count = id === "spaces" ? counts.spaces : id === "rooms" ? counts.rooms : id === "battles" ? counts.battles : threads.length
    if (count > 0) {
      open(id)
      return
    }
    void createSocialPlace(id)
  }

  const syncAction = commandActionById.get("sync")
  const postAction = commandActionById.get("post")
  const inviteAction = commandActionById.get("invite")
  const activeCommand = socialCommandTabs.find((item) => item.id === commandTab) ?? socialCommandTabs[0]
  const ActiveCommandIcon = activeCommand.icon

  return (
    <div className="grid gap-4">
      <Panel className="overflow-hidden p-0">
        <div className="border-b border-border bg-card px-4 py-3">
          <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-primary/12 text-primary">
                <Users className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h3 className="text-xl font-semibold text-foreground">Social hub</h3>
                <p className="mt-1 truncate text-xs font-semibold text-muted-foreground">{primaryCommand.detail}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <span className="rounded-md bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">{status}</span>
              <button onClick={() => runPrimaryCommand(primaryCommand.id)} disabled={Boolean(commandAction)} className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60" title={primaryCommand.detail} type="button">
                <Sparkles className="h-4 w-4" />
                {primaryCommand.label}
              </button>
              <details className="relative">
                <summary className="flex h-9 w-9 list-none items-center justify-center rounded-md border border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground" aria-label="Social options">
                  <MoreHorizontal className="h-4 w-4" />
                </summary>
                <div className="absolute right-0 top-11 z-50 w-64 rounded-md border border-border bg-popover p-2 text-sm text-popover-foreground shadow-xl">
                  <button onClick={() => void refresh()} disabled={syncAction?.disabled} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left font-semibold hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-60">
                    <Repeat2 className="h-4 w-4" />
                    {syncAction?.busy ? syncAction.busyLabel : syncAction?.label || "Sync"}
                  </button>
                  <div className="mt-2 grid grid-cols-2 gap-1 border-t border-border pt-2">
                    {commandSummary.chips.map((chip) => (
                      <span key={chip} className="rounded-md bg-secondary px-2 py-1 text-xs font-semibold text-secondary-foreground">{chip}</span>
                    ))}
                  </div>
                </div>
              </details>
            </div>
          </div>
        </div>
        <div className="grid gap-3 p-3 lg:p-4">
          <div className="grid grid-cols-5 gap-2 rounded-md border border-border bg-background p-2">
            {starterActions.map((action) => (
              <SocialStarterActionButton key={action.id} action={action} onClick={() => openStarterAction(action)} />
            ))}
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {homeLanes.map((lane) => {
              const Icon = socialHomeLaneIcons[lane.id]
              return (
                <button
                  key={lane.id}
                  onClick={() => openHomeLane(lane)}
                  className={`group flex min-w-0 items-center gap-3 rounded-md border p-2.5 text-left transition hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground ${
                    lane.primary ? "border-primary/40 bg-primary/10" : "border-border bg-background"
                  }`}
                  title={lane.detail}
                  type="button"
                >
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${lane.primary ? "bg-primary text-primary-foreground" : "bg-primary/12 text-primary group-hover:text-accent-foreground"}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground group-hover:text-accent-foreground">{lane.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">{lane.action}</span>
                  </span>
                  <span className={`rounded-md px-2 py-1 text-[0.68rem] font-semibold ${lane.count ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>{lane.count}</span>
                </button>
              )
            })}
          </div>

          <details className="group/calls rounded-md border border-border bg-background">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-foreground">
              <span className="flex min-w-0 items-center gap-2">
                <PhoneCall className="h-4 w-4 text-primary" />
                <span>Calls</span>
              </span>
              <span className="ml-auto rounded-md bg-secondary px-2 py-0.5 text-[0.68rem] font-semibold text-secondary-foreground">
                {counts.rooms + counts.battles}
              </span>
              <ChevronDown className="h-4 w-4 text-muted-foreground transition group-open/calls:rotate-180" />
            </summary>
            <div className="grid gap-2 border-t border-border p-2 md:grid-cols-2 xl:grid-cols-5">
              {callModes.map((mode) => (
                <SocialCallModeButton key={mode.id} mode={mode} onClick={() => openCallMode(mode)} />
              ))}
            </div>
          </details>

          <div className="flex gap-1 overflow-x-auto rounded-md border border-border bg-background p-1">
            {socialCommandTabs.map((item) => {
              const Icon = item.icon
              const active = commandTab === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => setCommandTab(item.id)}
                  className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-md px-3 text-xs font-semibold transition ${active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"}`}
                  type="button"
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[0.65rem] ${active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>{commandCounts[item.id]}</span>
                </button>
              )
            })}
          </div>

          <section className="rounded-lg border border-border bg-background">
            <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <ActiveCommandIcon className="h-4 w-4 text-primary" />
                <span className="truncate text-sm font-semibold text-foreground">{activeCommand.label}</span>
              </div>
              <span className="rounded-md bg-secondary px-2 py-1 text-[0.68rem] font-semibold text-secondary-foreground">{commandCounts[commandTab]}</span>
            </div>
            <div className="p-3">
            {commandTab === "people" ? (
              <div className="grid gap-3">
                <div className="flex items-center gap-2 rounded-md border border-input bg-card px-3">
                  <Search className="h-4 w-4 text-primary" />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find people by name or email" className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none" />
                </div>
                <div className="grid grid-cols-3 gap-2 md:grid-cols-5">
                  {peopleShortcuts.map((shortcut) => (
                    <button
                      key={shortcut.id}
                      onClick={() => applyPeopleShortcut(shortcut)}
                      className={`flex h-9 items-center justify-between gap-2 rounded-md border px-2 text-xs font-semibold transition hover:border-primary/40 hover:bg-accent hover:text-accent-foreground ${
                        shortcut.recommended && !query ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-secondary text-secondary-foreground"
                      }`}
                      type="button"
                    >
                      <span className="truncate">{shortcut.label}</span>
                      <span className="rounded bg-background px-1.5 py-0.5 text-[0.65rem] text-foreground">{shortcut.count}</span>
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="rounded-md bg-secondary px-2 py-1 text-xs font-semibold text-secondary-foreground">{peoplePage.total} available</span>
                  {peoplePage.hiddenCount ? (
                    <button onClick={() => setPeopleLimit((limit) => limit + 5)} className="rounded-md border border-border bg-secondary px-2.5 py-1.5 text-xs font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground" type="button">
                      Show {Math.min(5, peoplePage.hiddenCount)} more
                    </button>
                  ) : null}
                </div>
                <div className="grid gap-2">
                  {connectableMembers.map((member) => {
                    const targetId = String(member.id || "")
                    const actions = buildConnectionActions({
                      busyAction: connectionAction?.targetId === targetId ? connectionAction.action : null,
                      busyTargetId: connectionAction?.targetId,
                      targetId,
                    })
                    const friendAction = actions.find((action) => action.id === "friend")
                    const followAction = actions.find((action) => action.id === "follow")
                    return (
                      <div key={member.id || member.email} className="grid gap-2 rounded-md border border-border bg-card p-2 sm:grid-cols-[1fr_auto] sm:items-center">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">{member.name || member.email || "Learner"}</p>
                          <p className="truncate text-xs text-muted-foreground">{member.email || member.role || "Workspace member"}</p>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => void connect(member, "friend")} disabled={friendAction?.disabled} className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60">{friendAction?.busy ? friendAction.busyLabel : friendAction?.label || "Add"}</button>
                          <button onClick={() => void connect(member, "follow")} disabled={followAction?.disabled} className="rounded-md border border-border bg-secondary px-2.5 py-1.5 text-xs font-semibold text-secondary-foreground disabled:cursor-not-allowed disabled:opacity-60">{followAction?.busy ? followAction.busyLabel : followAction?.label || "Follow"}</button>
                        </div>
                      </div>
                    )
                  })}
                  {!connectableMembers.length ? (
                    <div className="grid gap-2 rounded-md border border-dashed border-border bg-card p-3 text-sm text-muted-foreground sm:grid-cols-[1fr_auto] sm:items-center">
                      <span>{peoplePage.emptyAction === "invite" ? "No matching learner yet." : "Search members or invite a new learner."}</span>
                      <button onClick={() => setCommandTab("invite")} className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground" type="button">
                        <Mail className="h-3.5 w-3.5" />
                        Invite
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {commandTab === "post" ? (
              <div className="grid gap-3">
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  {momentOptions.map((option) => (
                    <SocialMomentOptionButton key={option.id} active={option.id === momentType} option={option} onClick={() => chooseMoment(option)} />
                  ))}
                </div>
                <textarea value={quickPost} onChange={(event) => setQuickPost(event.target.value)} placeholder="Ask a question or share a quick update..." className="min-h-28 w-full resize-none rounded-md border border-input bg-card p-3 text-sm text-foreground outline-none" />
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={sendQuickPost} disabled={postAction?.disabled} className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">
                    <Send className="h-4 w-4" />
                    {postAction?.busy ? postAction.busyLabel : postAction?.label || "Post"}
                  </button>
                  <button onClick={() => open("chat")} disabled={Boolean(commandAction)} className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-secondary px-3 text-sm font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-60">
                    <MessageSquare className="h-4 w-4" />
                    Open chat
                  </button>
                  <span className="rounded-md bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">{threads.length} threads</span>
                  <span className="rounded-md bg-secondary px-2 py-1 text-xs font-semibold text-secondary-foreground">{activeMomentOption.channel}</span>
                </div>
              </div>
            ) : null}

            {commandTab === "invite" ? (
              <div className="grid gap-2 sm:grid-cols-[1fr_120px_auto]">
                <input value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="email@example.com" className="h-9 min-w-0 rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none" />
                <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as "learner" | "admin")} className="h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none">
                  <option value="learner">Learner</option>
                  <option value="admin">Admin</option>
                </select>
                <button onClick={() => void createInvite()} disabled={inviteAction?.disabled} className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50" title={inviteStatus}>
                  <Plus className="h-4 w-4" />
                  {inviteAction?.busy ? inviteAction.busyLabel : inviteAction?.label || "Send"}
                </button>
                <span className="rounded-md bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground sm:col-span-3">{inviteStatus}</span>
              </div>
            ) : null}

            {commandTab === "connections" ? (
              <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
                <div className="grid gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="rounded-md bg-secondary px-2 py-1 text-xs font-semibold text-secondary-foreground">{connectionPage.total} connected</span>
                    {connectionPage.hiddenCount ? (
                      <button onClick={() => setConnectionLimit((limit) => limit + 6)} className="rounded-md border border-border bg-secondary px-2.5 py-1.5 text-xs font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground" type="button">
                        Show {Math.min(6, connectionPage.hiddenCount)} more
                      </button>
                    ) : null}
                  </div>
                  {connectionPage.items.map((connection) => {
                    const targetUserId = String(connection.target_user_id || connection.targetUserId || "")
                    const label = connection.name || connection.username || targetUserId || "Connection"
                    const type = String(connection.connection_type || connection.connectionType || "follow")
                    const quickActions = buildSocialContactQuickActions(connection)
                    const removeAction = buildConnectionActions({
                      busyAction: connectionAction?.targetId === targetUserId ? connectionAction.action : null,
                      busyTargetId: connectionAction?.targetId,
                      connected: true,
                      targetId: targetUserId,
                    }).find((action) => action.id === "remove")
                    return (
                      <div key={`${targetUserId}-${type}`} className="grid gap-2 rounded-md border border-border bg-card p-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-foreground">{label}</p>
                            <p className="truncate text-xs text-muted-foreground">{type} - {connection.status || "accepted"}</p>
                          </div>
                          <button onClick={() => void removeConnection(connection)} disabled={removeAction?.disabled} className="inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-md border border-border px-2 text-xs font-semibold text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-60" aria-label={`Remove ${label}`}>
                            <Trash2 className="h-4 w-4" />
                            {removeAction?.busy ? removeAction.busyLabel : ""}
                          </button>
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                          {quickActions.map((action) => (
                            <SocialContactQuickActionButton key={action.id} action={action} onClick={() => openContactAction(action)} />
                          ))}
                        </div>
                      </div>
                    )
                  })}
                  {!connections.length ? <p className="rounded-md border border-dashed border-border bg-card p-3 text-sm text-muted-foreground">No connections yet.</p> : null}
                </div>
                <div className="grid content-start gap-2 sm:grid-cols-2">
                  <span className="rounded-md bg-secondary px-3 py-2 text-sm font-semibold text-secondary-foreground">{connectionPage.summary.friends} friends</span>
                  <span className="rounded-md bg-secondary px-3 py-2 text-sm font-semibold text-secondary-foreground">{connectionPage.summary.follows} follows</span>
                  <span className="rounded-md bg-secondary px-3 py-2 text-sm font-semibold text-secondary-foreground">{connectionPage.summary.pending} pending</span>
                  <span className="rounded-md bg-secondary px-3 py-2 text-sm font-semibold text-secondary-foreground">{connectionPage.summary.blocked} blocked</span>
                </div>
              </div>
            ) : null}
            </div>
          </section>
        </div>
      </Panel>

      <details className="group/advanced rounded-lg border border-border bg-card text-card-foreground shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-foreground">
          <span className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" />
            Create social space
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition group-open/advanced:rotate-180" />
        </summary>
        <div className="grid gap-2 border-t border-border p-2 md:grid-cols-2 xl:grid-cols-4">
          {flowCards.map((card) => {
            const Icon = card.id === "chat" ? MessageSquare : card.id === "spaces" ? Users : card.id === "rooms" ? Radio : Swords
            const createAction = commandActionById.get(card.id)
            return (
              <SocialFlowButton
                key={card.id}
                action={card.action}
                count={card.count}
                createDisabled={createAction?.disabled}
                createLabel={createAction?.busy ? createAction.busyLabel : card.createAction}
                icon={Icon}
                label={card.label}
                onCreate={() => void createSocialPlace(card.id)}
                onOpen={() => open(card.id)}
                ready={card.ready}
              />
            )
          })}
        </div>
      </details>
    </div>
  )
}

function SocialMomentOptionButton({ active, onClick, option }: { active: boolean; onClick: () => void; option: SocialMomentOption }) {
  const Icon = socialMomentOptionIcons[option.id]
  return (
    <button
      onClick={onClick}
      className={`group flex min-w-0 items-center gap-2 rounded-md border p-2 text-left transition hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground ${
        active || option.recommended ? "border-primary/40 bg-primary/10" : "border-border bg-card"
      }`}
      title={option.detail}
      type="button"
    >
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${active ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground group-hover:text-accent-foreground"}`}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold text-foreground group-hover:text-accent-foreground">{option.label}</span>
        <span className="block truncate text-[0.65rem] font-semibold text-muted-foreground">{option.badge}</span>
      </span>
    </button>
  )
}

function SocialContactQuickActionButton({ action, onClick }: { action: SocialContactQuickAction; onClick: () => void }) {
  const Icon = socialContactQuickActionIcons[action.id]
  return (
    <button
      onClick={onClick}
      disabled={action.disabled}
      className={`group inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-md border px-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
        action.primary ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground" : "border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground"
      }`}
      title={action.detail}
      type="button"
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{action.label}</span>
    </button>
  )
}

function SocialStarterActionButton({ action, onClick }: { action: SocialStarterAction; onClick: () => void }) {
  const Icon = socialStarterActionIcons[action.id]
  return (
    <button
      onClick={onClick}
      className={`group flex min-w-0 flex-col items-center justify-center gap-1 rounded-md border px-2 py-2 text-center transition hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground ${
        action.primary ? "border-primary/40 bg-primary/10" : "border-border bg-card"
      }`}
      title={action.detail}
      type="button"
    >
      <span className={`relative flex h-9 w-9 items-center justify-center rounded-md ${action.primary ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground group-hover:text-accent-foreground"}`}>
        <Icon className="h-4 w-4" />
        <span className={`absolute -right-1 -top-1 rounded-full px-1.5 py-0.5 text-[0.58rem] font-semibold ${action.primary ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"}`}>
          {action.badge}
        </span>
      </span>
      <span className="max-w-full truncate text-[0.7rem] font-semibold text-foreground group-hover:text-accent-foreground">{action.label}</span>
    </button>
  )
}

function SocialCallModeButton({ mode, onClick }: { mode: SocialCallMode; onClick: () => void }) {
  const Icon = socialCallModeIcons[mode.id]
  return (
    <button
      onClick={onClick}
      className={`group flex min-w-0 items-center gap-2 rounded-md border p-2.5 text-left transition hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground ${
        mode.recommended ? "border-primary/40 bg-primary/10" : "border-border bg-card"
      }`}
      title={mode.detail}
      type="button"
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${mode.recommended ? "bg-primary text-primary-foreground" : "bg-primary/12 text-primary group-hover:text-accent-foreground"}`}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-foreground group-hover:text-accent-foreground">{mode.label}</span>
        <span className="block truncate text-xs text-muted-foreground">{mode.action}</span>
      </span>
      <span className={`rounded-md px-2 py-1 text-[0.68rem] font-semibold ${mode.recommended ? "bg-primary/15 text-primary" : "bg-secondary text-secondary-foreground"}`}>
        {mode.badge}
      </span>
    </button>
  )
}

function SocialFlowButton({
  action,
  count,
  createDisabled,
  createLabel,
  icon: Icon,
  label,
  onCreate,
  onOpen,
  ready,
}: {
  action: string
  count: number
  createDisabled?: boolean
  createLabel?: string
  icon: ComponentType<{ className?: string }>
  label: string
  onCreate: () => void
  onOpen: () => void
  ready: boolean
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-md border border-border bg-card p-2">
      <button onClick={onOpen} className="flex min-w-0 items-center gap-3 rounded-md p-1.5 text-left hover:bg-accent hover:text-accent-foreground">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/12 text-primary">
          <Icon className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground">{label}</span>
          <span className="block text-xs text-muted-foreground">{count} saved</span>
        </span>
        <span className={`rounded-md px-2 py-1 text-[0.68rem] font-semibold ${ready ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>{ready ? "ready" : "new"}</span>
      </button>
      <button onClick={onCreate} disabled={createDisabled} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-border bg-secondary px-2.5 text-xs font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-60" title={createLabel || action}>
        <Plus className="h-4 w-4" />
        <span className="hidden sm:inline">{createLabel || action}</span>
      </button>
    </div>
  )
}

function WorkspaceFrame<T extends string>({
  activeTab,
  body,
  children,
  eyebrow,
  setActiveTab,
  tabs,
  title,
}: {
  activeTab?: T
  body: string
  children: React.ReactNode
  eyebrow: string
  setActiveTab?: (tab: T) => void
  tabs?: Array<{ id: T; label: string; icon: ComponentType<{ className?: string }>; caption: string }>
  title: string
}) {
  const visibleTabs = tabs ?? []
  return (
    <div className="grid gap-4">
      <Panel className="p-3 lg:p-4">
        <div className="grid gap-3 xl:grid-cols-[1fr_auto] xl:items-center">
          <div className="flex min-w-0 items-start gap-3">
            <InfoMenu title={eyebrow} body={body} />
            <div className="min-w-0">
              <h2 className="max-w-4xl text-2xl font-semibold leading-tight text-foreground lg:text-3xl">{title}</h2>
            </div>
          </div>
          {visibleTabs.length ? (
          <div className="flex max-w-full gap-1.5 overflow-x-auto pb-1 xl:w-auto xl:max-w-[720px]">
            {visibleTabs.map((tab) => {
              const Icon = tab.icon
              const active = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab?.(tab.id)}
                  className={`group relative inline-flex h-10 min-w-[6.25rem] flex-none items-center gap-2 rounded-md border px-2.5 text-left text-sm transition hover:-translate-y-0.5 ${active ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground"}`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate font-semibold">{tab.label}</span>
                  <MoreHorizontal className="ml-auto h-4 w-4 shrink-0 opacity-60" />
                  <p className="pointer-events-none absolute left-2 right-2 top-[calc(100%+0.35rem)] z-50 hidden rounded-md border border-border bg-popover p-2 text-xs leading-5 text-popover-foreground shadow-lg group-hover:block group-focus-visible:block">{tab.caption}</p>
                </button>
              )
            })}
          </div>
          ) : null}
        </div>
      </Panel>
      {children}
    </div>
  )
}

function LearnRoute({ dashboard, quizzes, setView }: { dashboard: any; quizzes: Quiz[]; setView: (view: View) => void }) {
  const focus = dashboard?.snapshot?.recommendedFocus ?? []
  const weakTopics = dashboard?.snapshot?.weakTopics ?? []
  const routePlan = useMemo(() => buildLearnRoutePlan({
    goalCompletion: dashboard?.snapshot?.goalCompletion ?? 0,
    quizCount: quizzes.length,
    recommendedFocus: focus,
    weakTopics,
  }), [dashboard?.snapshot?.goalCompletion, focus, quizzes.length, weakTopics])
  const actionIcons = useMemo(() => ({
    create: Sparkles,
    tutor: Bot,
    practice: BookOpen,
  }), [])

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <Panel className="p-4">
        <div className="mb-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Recommended route</p>
            <h3 className="mt-1 text-2xl font-semibold text-foreground">{routePlan.headline}</h3>
          </div>
          <button onClick={() => setView(routePlan.primaryAction.view)} className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">
            Start: {routePlan.primaryAction.title}
          </button>
        </div>
        <div className="grid gap-2 md:grid-cols-4">
          {routePlan.actions.map((action) => {
            const Icon = actionIcons[action.id]
            return (
              <button key={action.title} onClick={() => setView(action.view)} className="group relative rounded-md border border-border bg-background p-3 text-left transition hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground" title={action.body}>
                <div className="flex items-start justify-between gap-3">
                  <Icon className="h-6 w-6 text-success" />
                  <MoreHorizontal className="h-4 w-4 text-muted-foreground group-hover:text-accent-foreground" />
                </div>
                <h3 className="mt-3 font-semibold text-foreground group-hover:text-accent-foreground">{action.title}</h3>
                <span className="mt-2 inline-flex rounded-md bg-secondary px-2 py-0.5 text-[0.68rem] font-semibold uppercase text-secondary-foreground group-hover:bg-background/80">Open</span>
                <p className="pointer-events-none absolute left-3 right-3 top-[calc(100%+0.35rem)] z-50 hidden rounded-md border border-border bg-popover p-2 text-xs leading-5 text-popover-foreground shadow-lg group-hover:block group-focus-visible:block">{action.body}</p>
              </button>
            )
          })}
        </div>
      </Panel>
      <Panel className="p-4">
        <h3 className="font-semibold text-foreground">Route signal</h3>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {routePlan.signals.map((signal) => <MiniMetric key={signal.label} label={signal.label} value={signal.value} />)}
        </div>
        <details className="group/why mt-3 rounded-md border border-border bg-background">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-foreground">
            <span>Why this route</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground transition group-open/why:rotate-180" />
          </summary>
          <div className="border-t border-border px-3 py-2 text-sm leading-6 text-muted-foreground">{routePlan.primaryAction.body}</div>
        </details>
      </Panel>
      <Panel className="p-4 xl:col-span-2">
        <details className="group/loop">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-foreground">
            <span>Learning loop</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground transition group-open/loop:rotate-180" />
          </summary>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <PatternCard icon={Sparkles} title="Capture" body="Studio keeps notes, docs, sheets, slides, and imports together." />
            <PatternCard icon={Repeat2} title="Practice" body="Quiz, retry misses, and save hard items as review cards." />
            <PatternCard icon={MessageSquare} title="Reflect" body="Use Social only when you want collaboration or accountability." />
          </div>
        </details>
      </Panel>
    </div>
  )
}

function InfoMenu({ body, title }: { body: string; title: string }) {
  return (
    <details className="group/info relative">
      <summary className="flex h-9 w-9 list-none items-center justify-center rounded-md border border-border bg-secondary text-secondary-foreground transition hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground" aria-label={`About ${title}`}>
        <Info className="h-4 w-4" />
      </summary>
      <div className="absolute left-0 top-11 z-50 w-72 rounded-md border border-border bg-popover p-3 text-sm leading-6 text-popover-foreground shadow-xl">
        {body}
      </div>
    </details>
  )
}

function PracticeGuide({
  draftCards,
  gameModes,
  onClearDraft,
  onCreatePractice,
  onOpenTarget,
  onResumeDraft,
  plan,
  playStyles,
}: {
  draftCards: PracticeDraftCard[]
  gameModes: PracticeGameMode[]
  onClearDraft: (quizId: string) => void
  onCreatePractice: () => void
  onOpenTarget: (target: PracticeWorkspaceTarget) => void
  onResumeDraft: (quizId: string) => void
  plan: PracticeWorkspacePlan
  playStyles: PracticePlayStyle[]
}) {
  function runAction(action: PracticeWorkspaceAction) {
    if (action.id === "resume" && draftCards[0]) {
      onResumeDraft(draftCards[0].quizId)
      return
    }
    if (action.id === "create") {
      onCreatePractice()
      return
    }
    onOpenTarget(action.target)
  }

  return (
    <Panel className="h-max p-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold text-foreground">Practice next</h3>
        <InfoMenu title="Practice next" body="Choose the plain action first. The detailed quiz modes, timers, marks, drafts, and game runs stay inside each practice area." />
      </div>
      <div className="mt-3 rounded-md border border-primary/25 bg-primary/10 p-3">
        <p className="text-sm font-semibold text-foreground">{plan.headline}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {plan.signals.map((signal) => (
            <span key={signal.label} className="inline-flex items-center gap-1 rounded-md bg-background/80 px-2 py-1 text-[0.65rem] font-semibold uppercase text-muted-foreground" title={`${signal.label}: ${signal.value}`}>
              <strong className="text-sm text-foreground">{signal.value}</strong>
              {signal.label}
            </span>
          ))}
        </div>
        <button onClick={() => runAction(plan.primaryAction)} className="mt-3 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground">
          <Play className="h-3.5 w-3.5" />
          {plan.primaryAction.label}
        </button>
      </div>
      <details className="group/practice mt-3 rounded-md border border-border bg-background">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-foreground">
          <span>Play styles</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition group-open/practice:rotate-180" />
        </summary>
        <div className="grid gap-2 border-t border-border p-2">
          {playStyles.map((style) => (
            <PracticePlayStyleButton key={style.id} onClick={() => onOpenTarget(style.target)} style={style} />
          ))}
        </div>
      </details>
      <details className="group/modes mt-3 rounded-md border border-border bg-background">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-foreground">
          <span>Modes</span>
          <span className="ml-auto rounded-md bg-secondary px-2 py-0.5 text-[0.68rem] font-semibold text-secondary-foreground">{gameModes.length}</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition group-open/modes:rotate-180" />
        </summary>
        <div className="grid gap-2 border-t border-border p-2">
          {gameModes.map((mode) => (
            <PracticeGameModeButton key={mode.id} mode={mode} onClick={() => onOpenTarget(mode.target)} />
          ))}
        </div>
      </details>
      <details className="group/actions mt-3 rounded-md border border-border bg-background">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-foreground">
          <span>Actions</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition group-open/actions:rotate-180" />
        </summary>
        <div className="grid gap-2 border-t border-border p-2">
          {plan.actions.map((action) => (
            <PracticeActionButton key={action.id} action={action} onClick={() => runAction(action)} />
          ))}
        </div>
      </details>
      {draftCards.length ? (
        <details className="group/drafts mt-3 rounded-md border border-warning/50 bg-warning/10">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-foreground">
            <span>Drafts</span>
            <span className="ml-auto rounded-md bg-background px-2 py-0.5 text-[0.68rem] font-semibold text-foreground">{draftCards.length}</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground transition group-open/drafts:rotate-180" />
          </summary>
          <div className="grid gap-2 border-t border-warning/40 p-2">
            {draftCards.slice(0, 3).map((draft) => (
              <div key={draft.quizId} className="rounded-md border border-border bg-background p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{draft.title}</p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      {formatCompactDuration(draft.elapsedSeconds)} | {draft.answeredCount} answered | {draft.markedCount} marked
                    </p>
                  </div>
                  <span className="rounded-md bg-secondary px-2 py-1 text-[0.68rem] font-semibold text-secondary-foreground">{draft.practiceMode.replace(/-/g, " ")}</span>
                </div>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => onResumeDraft(draft.quizId)} className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-2 text-xs font-semibold text-primary-foreground">
                    <Play className="h-3.5 w-3.5" />
                    Resume
                  </button>
                  <button onClick={() => onClearDraft(draft.quizId)} className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-secondary px-2 text-xs font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground">
                    <Trash2 className="h-3.5 w-3.5" />
                    Clear
                  </button>
                </div>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </Panel>
  )
}

function PracticeActionButton({ action, onClick }: { action: PracticeWorkspaceAction; onClick: () => void }) {
  const Icon = action.id === "speed" ? Gamepad2 : action.id === "repair" ? Repeat2 : action.id === "create" ? Sparkles : BookOpen
  return (
    <button onClick={onClick} className="group relative rounded-md border border-border bg-background p-2.5 text-left transition hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-success" />
        <span className="min-w-0 truncate text-sm font-semibold text-foreground group-hover:text-accent-foreground">{action.label}</span>
      </div>
      <span className="mt-2 inline-flex rounded-md bg-secondary px-2 py-0.5 text-[0.68rem] font-semibold text-secondary-foreground">{action.badge}</span>
      <p className="pointer-events-none absolute right-0 top-[calc(100%+0.35rem)] z-20 hidden w-60 rounded-md border border-border bg-popover p-2 text-xs leading-5 text-popover-foreground shadow-lg group-hover:block group-focus-visible:block">{action.caption}</p>
    </button>
  )
}

function PracticeGameModeButton({ mode, onClick }: { mode: PracticeGameMode; onClick: () => void }) {
  const Icon = practiceGameModeIcons[mode.id]
  return (
    <button
      onClick={onClick}
      className={`group rounded-md border p-2.5 text-left transition hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground ${
        mode.recommended ? "border-primary/40 bg-primary/10" : "border-border bg-background"
      }`}
      title={mode.detail}
      type="button"
    >
      <div className="flex items-center gap-2">
        <span className={`flex h-8 w-8 items-center justify-center rounded-md ${mode.recommended ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground group-hover:text-accent-foreground">{mode.label}</span>
          <span className="block truncate text-[0.68rem] font-semibold text-muted-foreground">{mode.source} / {mode.practiceMode.replace(/-/g, " ")}</span>
        </span>
        <span className={`rounded-md px-2 py-0.5 text-[0.65rem] font-semibold ${mode.recommended ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>{mode.badge}</span>
      </div>
    </button>
  )
}

function PracticePlayStyleButton({ onClick, style }: { onClick: () => void; style: PracticePlayStyle }) {
  const Icon = practicePlayStyleIcons[style.id]
  return (
    <button
      onClick={onClick}
      className={`group rounded-md border p-2.5 text-left transition hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground ${
        style.recommended ? "border-primary/40 bg-primary/10" : "border-border bg-background"
      }`}
      title={style.detail}
      type="button"
    >
      <div className="flex items-center gap-2">
        <span className={`flex h-8 w-8 items-center justify-center rounded-md ${style.recommended ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground group-hover:text-accent-foreground">{style.label}</span>
          <span className="block truncate text-[0.68rem] font-semibold text-muted-foreground">{style.model}</span>
        </span>
        <span className={`rounded-md px-2 py-0.5 text-[0.65rem] font-semibold ${style.recommended ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>{style.badge}</span>
      </div>
    </button>
  )
}

function formatCompactDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold text-foreground">{value}</p>
    </div>
  )
}

function PatternCard({ body, icon: Icon, title }: { body: string; icon: ComponentType<{ className?: string }>; title: string }) {
  return (
    <div className="group relative flex items-center gap-3 rounded-md border border-border bg-background p-4">
      <Icon className="h-6 w-6 text-success" />
      <p className="font-semibold text-foreground">{title}</p>
      <p className="pointer-events-none absolute left-3 right-3 top-[calc(100%+0.35rem)] z-50 hidden rounded-md border border-border bg-popover p-2 text-xs leading-5 text-popover-foreground shadow-lg group-hover:block">{body}</p>
    </div>
  )
}

function viewFromPracticeTab(tab: PracticeTab): View {
  return tab
}

function socialTabFromView(view: View): SocialTab {
  if (view === "social") return "home"
  if (view === "chat") return "chat"
  if (view === "spaces") return "spaces"
  if (view === "rooms") return "rooms"
  if (view === "battles") return "battles"
  return "home"
}

function viewFromSocialTab(tab: SocialTab): View {
  if (tab === "home") return "social"
  return tab
}

