"use client"

import { useEffect, useMemo, useState, type ComponentType } from "react"
import { BookOpen, Bot, ChevronDown, Clock, Gamepad2, Info, Mail, MessageSquare, MoreHorizontal, PhoneCall, Play, Plus, Radio, Repeat2, Search, Send, Sparkles, Swords, Target, Trash2, Users, UsersRound } from "lucide-react"
import type { DashboardData, LearningSpace, Quiz, StudyBattle, StudyRoom, User, View } from "../../types"
import type { WorkspaceOptions } from "../../preferences"
import { api } from "../../api"
import { Panel } from "../../ui"
import { SocialLearningView } from "../ecosystem-views"
import { ChatView, GamesView } from "../productivity-views"
import { QuizView } from "../quiz-view"
import { buildLearnRoutePlan } from "@/lib/learn-route-features"
import { AI_TUTOR_LAUNCH_KEY, buildPracticeAiTutorLaunch } from "@/lib/ai/tutor-workflow"
import {
  practiceWorkspaceTabs,
  socialWorkspaceTabFromView,
  socialWorkspaceTabs,
  viewFromPracticeWorkspaceTab,
  viewFromSocialWorkspaceTab,
  type PracticeWorkspaceTab,
  type SocialWorkspaceTab,
} from "@/lib/learn-workspace-navigation"
import { clearPracticeDraft, listPracticeDraftCards, PRACTICE_DRAFT_EVENT, readPracticeDrafts, type PracticeDraftCard } from "@/lib/practice-drafts"
import { buildPracticeArenaPresets, buildPracticeGameModes, buildPracticeLiveJoinCard, buildPracticePlayStyles, buildPracticeReadyLoops, buildPracticeWorkspacePlan, type PracticeArenaPreset, type PracticeGameMode, type PracticeLiveJoinCard, type PracticePlayStyle, type PracticeReadyLoop, type PracticeWorkspaceAction, type PracticeWorkspaceActionId, type PracticeWorkspacePlan, type PracticeWorkspaceTarget } from "@/lib/practice-features"
import { buildChatDraftPayload, buildConnectablePeoplePage, buildConnectionActions, buildConnectionsPage, buildSocialCommandModel, buildSocialCommandRunActions, buildSocialContactQuickActions, buildSocialUnifiedSearchCommand, normalizeSocialInviteDraft, normalizeSocialInviteRole, socialInviteRoleOptions, summarizeConnections, type ChatThreadLike, type ConnectionActionId, type SocialCommandRunId, type SocialContactQuickAction, type SocialFlowId, type SocialInviteRole, type SocialMomentOption, type SocialMomentTypeId, type SocialUnifiedSearchScope, type UserConnectionLike, type WorkspaceMemberLike } from "@/lib/social-features"

const practiceTabIcons: Record<PracticeWorkspaceTab, ComponentType<{ className?: string }>> = {
  quizzes: BookOpen,
  games: Gamepad2,
}

const socialTabIcons: Record<SocialWorkspaceTab, ComponentType<{ className?: string }>> = {
  home: Sparkles,
  chat: MessageSquare,
  spaces: Users,
  rooms: Radio,
  battles: Swords,
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

const socialFlowIcons: Record<SocialFlowId, ComponentType<{ className?: string }>> = {
  chat: MessageSquare,
  spaces: Users,
  rooms: Radio,
  battles: Swords,
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

const practiceArenaPresetIcons: Record<PracticeArenaPreset["id"], ComponentType<{ className?: string }>> = {
  classic: Swords,
  accuracy: Target,
  team: UsersRound,
  flashcards: BookOpen,
  redemption: Repeat2,
  "ai-generated": Sparkles,
}

const practiceReadyLoopIcons: Record<PracticeReadyLoop["id"], ComponentType<{ className?: string }>> = {
  generate: Sparkles,
  play: Play,
  battle: Swords,
  share: Send,
}

type SocialThreadRecord = ChatThreadLike & {
  body?: string
  channel?: string
}

type PracticeGuideStep = "start" | "live" | "setup" | "drafts"
type PracticeSetupStep = "arena" | "styles" | "modes" | "actions"

export function LearnWorkspaceView({
  dashboard,
  quizzes,
  setView,
}: {
  dashboard: DashboardData | null
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
  const [tab, setTab] = useState<PracticeWorkspaceTab>(initialView === "games" ? "games" : "quizzes")
  const [draftCards, setDraftCards] = useState<PracticeDraftCard[]>([])
  const quizTitles = useMemo(() => Object.fromEntries(quizzes.map((quiz) => [quiz.id, quiz.title])), [quizzes])
  const draftCounts = useMemo(() => draftCards.reduce((counts, draft) => ({
    answered: counts.answered + draft.answeredCount,
    marked: counts.marked + draft.markedCount,
    retry: counts.retry + draft.retryCount,
  }), { answered: 0, marked: 0, retry: 0 }), [draftCards])
  const practicePlan = useMemo(() => buildPracticeWorkspacePlan({
    activeTarget: tab,
    quizCount: quizzes.length,
    draftCount: draftCards.length,
    answeredDraftCount: draftCounts.answered,
    markedDraftCount: draftCounts.marked,
    retryDraftCount: draftCounts.retry,
  }), [draftCards.length, draftCounts, quizzes.length, tab])
  const liveJoinCard = useMemo(() => buildPracticeLiveJoinCard({
    quizCount: quizzes.length,
    draftCount: draftCards.length,
    answeredDraftCount: draftCounts.answered,
    markedDraftCount: draftCounts.marked,
    retryDraftCount: draftCounts.retry,
    seed: selectedQuizId || "practice",
  }), [draftCards.length, draftCounts, quizzes.length, selectedQuizId])
  const arenaPresets = useMemo(() => buildPracticeArenaPresets({
    quizCount: quizzes.length,
    draftCount: draftCards.length,
    markedDraftCount: draftCounts.marked,
    retryDraftCount: draftCounts.retry,
  }), [draftCards.length, draftCounts, quizzes.length])
  const playStyles = useMemo(() => buildPracticePlayStyles({
    draftCount: draftCards.length,
    hasQuizBanks: quizzes.length > 0,
    markedCount: draftCounts.marked,
    retryCount: draftCounts.retry,
  }), [draftCards.length, draftCounts, quizzes.length])
  const gameModes = useMemo(() => buildPracticeGameModes({
    draftCount: draftCards.length,
    hasQuizBanks: quizzes.length > 0,
    markedCount: draftCounts.marked,
    retryCount: draftCounts.retry,
  }), [draftCards.length, draftCounts, quizzes.length])
  const readyLoops = useMemo(() => buildPracticeReadyLoops({
    quizCount: quizzes.length,
    draftCount: draftCards.length,
  }), [draftCards.length, quizzes.length])
  const practiceTabs = useMemo(() => practiceWorkspaceTabs.map((item) => ({
    ...item,
    caption: item.caption || "",
    icon: practiceTabIcons[item.id],
  })), [])

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
    setView(viewFromPracticeWorkspaceTab(target))
  }

  function openAiPracticeGenerator() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(AI_TUTOR_LAUNCH_KEY, JSON.stringify(buildPracticeAiTutorLaunch({
        draftCount: draftCards.length,
        quizCount: quizzes.length,
        selectedQuizTitle: quizTitles[selectedQuizId],
      })))
    }
    setView("ai")
  }

  return (
    <WorkspaceFrame
      eyebrow="Practice workspace"
      title="Practice"
      body="Quiz, retry, play, and save mistakes."
      tabs={practiceTabs}
      activeTab={tab}
      setActiveTab={(value) => {
        const nextTab = value as PracticeWorkspaceTab
        setTab(nextTab)
        setView(viewFromPracticeWorkspaceTab(nextTab))
      }}
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_270px]">
        <div>{tab === "quizzes" ? <QuizView quizzes={quizzes} selectedQuizId={selectedQuizId} setSelectedQuizId={setSelectedQuizId} options={options} /> : <GamesView quizzes={quizzes} options={options} />}</div>
        <PracticeGuide arenaPresets={arenaPresets} draftCards={draftCards} gameModes={gameModes} liveJoinCard={liveJoinCard} onClearDraft={discardDraft} onCreatePractice={openAiPracticeGenerator} onOpenTarget={openPracticeTarget} onOpenView={setView} onResumeDraft={resumeDraft} plan={practicePlan} playStyles={playStyles} readyLoops={readyLoops} />
      </div>
    </WorkspaceFrame>
  )
}

export function SocialWorkspaceView({ initialView, options, setView, user }: { initialView: View; options: WorkspaceOptions; setView: (view: View) => void; user: User | null }) {
  const [tab, setTab] = useState<SocialWorkspaceTab>(socialWorkspaceTabFromView(initialView))
  const socialTabs = useMemo(() => socialWorkspaceTabs.map((item) => ({
    ...item,
    caption: item.caption || "",
    icon: socialTabIcons[item.id],
  })), [])

  useEffect(() => {
    setTab(socialWorkspaceTabFromView(initialView))
  }, [initialView])

  return (
    <div className="grid gap-3 lg:grid-cols-[72px_1fr]">
      <SocialSectionNav
        activeTab={tab}
        tabs={socialTabs}
        setActiveTab={(value) => {
          const nextTab = value as SocialWorkspaceTab
          setTab(nextTab)
          setView(viewFromSocialWorkspaceTab(nextTab))
        }}
      />
      <div className="min-w-0">
        {tab === "home" ? <SocialCommandCenter currentUserId={user?.id} setActiveTab={setTab} setView={setView} /> : null}
        {tab === "chat" ? <ChatView options={options} /> : null}
        {tab === "spaces" ? <SocialLearningView kind="spaces" setView={setView} /> : null}
        {tab === "rooms" ? <SocialLearningView kind="rooms" setView={setView} /> : null}
        {tab === "battles" ? <SocialLearningView kind="battles" setView={setView} /> : null}
      </div>
    </div>
  )
}

function SocialSectionNav({
  activeTab,
  setActiveTab,
  tabs,
}: {
  activeTab: SocialWorkspaceTab
  setActiveTab: (tab: SocialWorkspaceTab) => void
  tabs: Array<{ id: SocialWorkspaceTab; label: string; icon: ComponentType<{ className?: string }>; caption: string }>
}) {
  return (
    <Panel className="p-1.5 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:self-start lg:overflow-y-auto">
      <div className="flex gap-1.5 overflow-x-auto lg:flex-col lg:overflow-visible">
        {tabs.map((item) => {
          const Icon = item.icon
          const active = activeTab === item.id
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`relative inline-flex h-12 min-w-[4rem] shrink-0 flex-col items-center justify-center gap-0.5 rounded-md px-1.5 text-[0.68rem] font-semibold transition lg:min-w-0 ${
                active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              }`}
              title={item.caption}
              type="button"
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          )
        })}
      </div>
    </Panel>
  )
}

function SocialCommandCenter({ currentUserId, setActiveTab, setView }: { currentUserId?: string; setActiveTab: (tab: SocialWorkspaceTab) => void; setView: (view: View) => void }) {
  const [members, setMembers] = useState<WorkspaceMemberLike[]>([])
  const [connections, setConnections] = useState<UserConnectionLike[]>([])
  const [threads, setThreads] = useState<SocialThreadRecord[]>([])
  const [counts, setCounts] = useState({ spaces: 0, rooms: 0, battles: 0 })
  const [query, setQuery] = useState("")
  const [searchScope, setSearchScope] = useState<SocialUnifiedSearchScope>("people")
  const [quickPost, setQuickPost] = useState("")
  const [momentType, setMomentType] = useState<SocialMomentTypeId>("win")
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<SocialInviteRole>("learner")
  const [status, setStatus] = useState("Loading")
  const [peopleLimit, setPeopleLimit] = useState(5)
  const [connectionLimit, setConnectionLimit] = useState(6)
  const [connectionAction, setConnectionAction] = useState<{ action: ConnectionActionId; targetId: string } | null>(null)
  const [commandAction, setCommandAction] = useState<SocialCommandRunId | null>(null)
  const connectionSummary = useMemo(() => summarizeConnections(connections), [connections])
  const peoplePage = useMemo(() => buildConnectablePeoplePage({ members, connections, currentUserId, query, limit: peopleLimit }), [connections, currentUserId, members, peopleLimit, query])
  const connectionPage = useMemo(() => buildConnectionsPage(connections, connectionLimit), [connectionLimit, connections])
  const connectableMembers = peoplePage.items
  const queryLooksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(query.trim())
  const pendingInviteEmail = queryLooksLikeEmail ? query.trim() : inviteEmail.trim()
  const inviteValidation = useMemo(() => normalizeSocialInviteDraft({ email: pendingInviteEmail, role: inviteRole }), [pendingInviteEmail, inviteRole])
  const inviteReady = Boolean(pendingInviteEmail) && inviteValidation.ok
  const inviteStatus = pendingInviteEmail ? inviteValidation.ok ? "Ready" : inviteValidation.error : "Paste an email in search"
  const socialModel = useMemo(() => buildSocialCommandModel({
    memberCount: members.length,
    connectionCount: connectionSummary.total,
    threadCount: threads.length,
    spaceCount: counts.spaces,
    roomCount: counts.rooms,
    battleCount: counts.battles,
  }), [connectionSummary.total, counts.battles, counts.rooms, counts.spaces, members.length, threads.length])
  const { flowCards, momentOptions } = socialModel
  const activeMomentOption = momentOptions.find((option) => option.id === momentType) ?? momentOptions[0]
  const commandActions = useMemo(() => buildSocialCommandRunActions({
    busyAction: commandAction,
    hasPostDraft: Boolean(quickPost.trim()),
    inviteReady,
  }), [commandAction, inviteReady, quickPost])
  const commandActionById = useMemo(() => new Map(commandActions.map((action) => [action.id, action])), [commandActions])
  const matchingThreads = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return threads.slice(0, 4)
    return threads.filter((thread) => `${thread.title || ""} ${thread.body || ""} ${thread.channel || ""}`.toLowerCase().includes(needle)).slice(0, 4)
  }, [query, threads])
  const filteredFlowCards = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return flowCards
    return flowCards.filter((card) => `${card.label} ${card.action} ${card.createAction}`.toLowerCase().includes(needle))
  }, [flowCards, query])
  const filteredPlaceCards = useMemo(() => filteredFlowCards.filter((card) => card.id !== "chat"), [filteredFlowCards])
  const searchCommand = useMemo(() => buildSocialUnifiedSearchCommand({
    connectionCount: connectionSummary.total,
    groupResultCount: filteredPlaceCards.length,
    peopleResultCount: peoplePage.total,
    query,
    roomCount: counts.rooms,
    threadResultCount: matchingThreads.length,
  }), [connectionSummary.total, counts.rooms, filteredPlaceCards.length, matchingThreads.length, peoplePage.total, query])
  const activeSocialScope = searchScope === "all"
    ? searchCommand.scope === "all" ? "people" : searchCommand.scope
    : searchScope
  const showPeople = activeSocialScope === "people"
  const showChats = activeSocialScope === "chats"
  const showGroups = activeSocialScope === "groups"
  const showInvite = showPeople && Boolean(pendingInviteEmail)

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
        api<{ items: SocialThreadRecord[] }>("/api/chat"),
        api<{ items: LearningSpace[] }>("/api/learning-spaces"),
        api<{ items: StudyRoom[] }>("/api/study-rooms"),
        api<{ items: StudyBattle[] }>("/api/study-battles"),
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
      if (query.trim() === pendingInviteEmail) setQuery("")
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

  function open(tab: SocialWorkspaceTab) {
    setActiveTab(tab)
    setView(viewFromSocialWorkspaceTab(tab))
  }

  function openContactAction(action: SocialContactQuickAction) {
    if (action.disabled) return
    open(action.target.value)
  }

  function runSearchCommand() {
    if (commandAction) return
    if (searchCommand.action === "invite") {
      setSearchScope("people")
      if (queryLooksLikeEmail) setInviteEmail(query.trim())
      return
    }
    if (searchCommand.action === "people") {
      setSearchScope("people")
      return
    }
    if (searchCommand.action === "chat") {
      open("chat")
      return
    }
    if (searchCommand.action === "groups") {
      if (filteredPlaceCards.length > 0) {
        setSearchScope("groups")
        return
      }
      void createSocialPlace("spaces")
      return
    }
    void refresh()
  }

  const syncAction = commandActionById.get("sync")
  const postAction = commandActionById.get("post")
  const inviteAction = commandActionById.get("invite")
  const scopeTabs: Array<{ id: SocialUnifiedSearchScope; label: string; count: number }> = [
    { id: "people", label: "People", count: peoplePage.total + connectionPage.total },
    { id: "chats", label: "Chats", count: matchingThreads.length },
    { id: "groups", label: "Groups", count: filteredPlaceCards.length },
  ]

  return (
    <Panel className="overflow-visible p-0">
      <div className="grid gap-3 border-b border-border bg-card p-3">
        <div className="grid gap-2 lg:grid-cols-[1fr_auto] lg:items-center">
          <label className="flex h-11 min-w-0 items-center gap-2 rounded-md border border-input bg-background px-3">
            <Search className="h-4 w-4 text-primary" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search people, chats, groups, or paste an email" className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-foreground outline-none" />
          </label>
          <div className="flex min-w-0 items-center gap-2 overflow-x-auto">
            <button onClick={runSearchCommand} disabled={Boolean(commandAction)} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60" title={searchCommand.detail} type="button">
              <Sparkles className="h-4 w-4" />
              <span>{searchCommand.label}</span>
              <span className="rounded bg-primary-foreground/20 px-1.5 py-0.5 text-[0.65rem] uppercase">{searchCommand.badge}</span>
            </button>
            <button onClick={() => void refresh()} disabled={syncAction?.disabled} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-60" title={syncAction?.busy ? syncAction.busyLabel : syncAction?.label || status} type="button">
              <Repeat2 className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex gap-1.5 overflow-x-auto">
          {scopeTabs.map((scope) => (
            <button
              key={scope.id}
              onClick={() => setSearchScope(scope.id)}
              className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-md border px-3 text-xs font-semibold transition ${searchScope === scope.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground"}`}
              type="button"
            >
              {scope.label}
              <span className={`rounded px-1.5 py-0.5 text-[0.65rem] ${searchScope === scope.id ? "bg-primary-foreground/20 text-primary-foreground" : "bg-background text-foreground"}`}>{scope.count}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-3 p-3 lg:p-4">
        {showPeople ? (
          <section className="grid gap-3 rounded-lg border border-border bg-background p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground">People</h3>
              <div className="flex flex-wrap gap-1.5">
                <span className="rounded-md bg-secondary px-2 py-1 text-xs font-semibold text-secondary-foreground">{connectionPage.total} friends</span>
                <span className="rounded-md bg-secondary px-2 py-1 text-xs font-semibold text-secondary-foreground">{peoplePage.total} available</span>
              </div>
            </div>
            {connections.length ? (
              <div className="grid gap-2 md:grid-cols-2">
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
              </div>
            ) : null}
            <details className="group/find rounded-md border border-border bg-card" open={!connections.length || Boolean(query.trim())}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-semibold text-foreground">
                <span>{connections.length ? "Find more people" : "Find people"}</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition group-open/find:rotate-180" />
              </summary>
              <div className="grid gap-2 border-t border-border p-2">
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
                    <div key={member.id || member.email} className="grid gap-2 rounded-md border border-border bg-background p-2 sm:grid-cols-[1fr_auto] sm:items-center">
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
                  <div className="grid gap-2 rounded-md border border-dashed border-border bg-background p-3 text-sm text-muted-foreground sm:grid-cols-[1fr_auto] sm:items-center">
                    <span>{peoplePage.emptyAction === "invite" ? "No matching learner yet." : "Search members or invite a new learner."}</span>
                    <button onClick={() => setInviteEmail(queryLooksLikeEmail ? query.trim() : inviteEmail)} disabled={!queryLooksLikeEmail} className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50" title={queryLooksLikeEmail ? "Invite this email" : "Paste an email in search first"} type="button">
                      <Mail className="h-3.5 w-3.5" />
                      {queryLooksLikeEmail ? "Invite" : "Paste email"}
                    </button>
                  </div>
                ) : null}
                {peoplePage.hiddenCount ? (
                  <button onClick={() => setPeopleLimit((limit) => limit + 5)} className="h-9 rounded-md border border-border bg-secondary px-3 text-xs font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground" type="button">
                    Show more
                  </button>
                ) : null}
              </div>
            </details>
          </section>
        ) : null}

        {showChats ? (
          <section className="grid gap-3 rounded-lg border border-border bg-background p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground">Chats</h3>
              <button onClick={() => open("chat")} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-secondary px-3 text-xs font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground" type="button">
                <MessageSquare className="h-3.5 w-3.5" />
                Open
              </button>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {matchingThreads.map((thread) => (
                <button key={thread.id || thread.title} onClick={() => open("chat")} className="rounded-md border border-border bg-card p-3 text-left hover:bg-accent hover:text-accent-foreground" type="button">
                  <p className="truncate text-sm font-semibold text-foreground">{thread.title || "Chat"}</p>
                  <p className="truncate text-xs text-muted-foreground">{thread.channel || "message"}</p>
                </button>
              ))}
              {!matchingThreads.length ? <p className="rounded-md border border-dashed border-border bg-card p-3 text-sm text-muted-foreground">No chats match.</p> : null}
            </div>
            <details className="group/post rounded-md border border-border bg-card">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-semibold text-foreground">
                <span>Share update</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition group-open/post:rotate-180" />
              </summary>
              <div className="grid gap-3 border-t border-border p-3">
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
            </details>
          </section>
        ) : null}

        {showGroups ? (
          <section className="grid gap-3 rounded-lg border border-border bg-background p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground">Groups, calls, games</h3>
              <span className="rounded-md bg-secondary px-2 py-1 text-xs font-semibold text-secondary-foreground">{filteredPlaceCards.length} actions</span>
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              {filteredPlaceCards.map((card) => {
                const Icon = socialFlowIcons[card.id]
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
                  />
                )
              })}
            </div>
          </section>
        ) : null}

        {showInvite ? (
        <details className="group/invite rounded-lg border border-border bg-background" open>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-semibold text-foreground">
            <span>Invite {pendingInviteEmail}</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground transition group-open/invite:rotate-180" />
          </summary>
          <div className="grid gap-2 border-t border-border p-3 sm:grid-cols-[1fr_120px_auto] sm:items-center">
                <span className="truncate rounded-md border border-input bg-card px-3 py-2 text-sm font-semibold text-foreground">{pendingInviteEmail}</span>
                <select value={inviteRole} onChange={(event) => setInviteRole(normalizeSocialInviteRole(event.target.value))} className="h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none">
                  {socialInviteRoleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <button onClick={() => void createInvite()} disabled={inviteAction?.disabled} className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50" title={inviteStatus}>
                  <Plus className="h-4 w-4" />
                  {inviteAction?.busy ? inviteAction.busyLabel : inviteAction?.label || "Send"}
                </button>
                <span className="rounded-md bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground sm:col-span-3">Use the search bar to change the email. {inviteStatus}</span>
          </div>
        </details>
        ) : null}
      </div>
    </Panel>
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

function SocialFlowButton({
  action,
  count,
  createDisabled,
  createLabel,
  icon: Icon,
  label,
  onCreate,
  onOpen,
}: {
  action: string
  count: number
  createDisabled?: boolean
  createLabel?: string
  icon: ComponentType<{ className?: string }>
  label: string
  onCreate: () => void
  onOpen: () => void
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-1 rounded-md border border-border bg-card p-1">
      <button onClick={onOpen} className="flex h-10 min-w-0 items-center gap-2 rounded-md px-2 text-left hover:bg-accent hover:text-accent-foreground" type="button">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/12 text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{label}</span>
        <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[0.65rem] font-semibold text-secondary-foreground">{count}</span>
      </button>
      <button onClick={onCreate} disabled={createDisabled} className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-60" title={createLabel || action}>
        <Plus className="h-4 w-4" />
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

function LearnRoute({ dashboard, quizzes, setView }: { dashboard: DashboardData | null; quizzes: Quiz[]; setView: (view: View) => void }) {
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
            <PatternCard icon={Sparkles} title="Capture" body="Save work in Studio." />
            <PatternCard icon={Repeat2} title="Practice" body="Quiz, retry, review." />
            <PatternCard icon={MessageSquare} title="Reflect" body="Share when useful." />
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
  arenaPresets,
  draftCards,
  gameModes,
  liveJoinCard,
  onClearDraft,
  onCreatePractice,
  onOpenTarget,
  onOpenView,
  onResumeDraft,
  plan,
  playStyles,
  readyLoops,
}: {
  arenaPresets: PracticeArenaPreset[]
  draftCards: PracticeDraftCard[]
  gameModes: PracticeGameMode[]
  liveJoinCard: PracticeLiveJoinCard
  onClearDraft: (quizId: string) => void
  onCreatePractice: () => void
  onOpenTarget: (target: PracticeWorkspaceTarget) => void
  onOpenView: (view: View) => void
  onResumeDraft: (quizId: string) => void
  plan: PracticeWorkspacePlan
  playStyles: PracticePlayStyle[]
  readyLoops: PracticeReadyLoop[]
}) {
  const [activeStep, setActiveStep] = useState<PracticeGuideStep>("start")
  const [activeSetupStep, setActiveSetupStep] = useState<PracticeSetupStep>("arena")
  const guideSteps: Array<{ id: PracticeGuideStep; label: string; count?: number }> = [
    { id: "start", label: "Start", count: plan.signals.length },
    { id: "live", label: "Live", count: liveJoinCard.ready ? 1 : 0 },
    { id: "setup", label: "Setup", count: arenaPresets.length + gameModes.length },
    { id: "drafts", label: "Drafts", count: draftCards.length },
  ]
  const setupSteps: Array<{ id: PracticeSetupStep; label: string; count?: number }> = [
    { id: "arena", label: "Arena", count: arenaPresets.length },
    { id: "styles", label: "Styles", count: playStyles.length },
    { id: "modes", label: "Modes", count: gameModes.length },
    { id: "actions", label: "Actions", count: plan.actions.length },
  ]

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

  function runActionId(actionId: PracticeWorkspaceActionId, target: PracticeWorkspaceTarget) {
    const action = plan.actions.find((item) => item.id === actionId)
    if (action) {
      runAction(action)
      return
    }
    if (actionId === "create") {
      onCreatePractice()
      return
    }
    onOpenTarget(target)
  }

  function runLiveAction() {
    const action = plan.actions.find((item) => item.id === liveJoinCard.primaryAction) || plan.primaryAction
    runAction(action)
  }

  function runReadyLoop(loop: PracticeReadyLoop) {
    if (!loop.enabled) return
    if (loop.target === "ai") {
      onCreatePractice()
      return
    }
    if (loop.target === "battles" || loop.target === "social") {
      onOpenView(loop.target)
      return
    }
    onOpenTarget(loop.target)
  }

  return (
    <Panel className="h-max p-3 xl:sticky xl:top-3 xl:max-h-[calc(100vh-6rem)] xl:overflow-auto">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold text-foreground">Next</h3>
        <InfoMenu title="Practice" body="Pick one loop. Live, setup, and drafts stay grouped here." />
      </div>
      <div className="mt-3 grid grid-cols-4 gap-1 rounded-lg border border-border bg-background p-1">
        {guideSteps.map((step) => (
          <button
            key={step.id}
            onClick={() => setActiveStep(step.id)}
            className={`inline-flex h-9 min-w-0 items-center justify-center gap-1 rounded-md px-2 text-xs font-semibold transition ${
              activeStep === step.id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            }`}
            type="button"
          >
            <span className="truncate">{step.label}</span>
            {typeof step.count === "number" ? <span className={`rounded px-1 text-[0.62rem] ${activeStep === step.id ? "bg-primary-foreground/20" : "bg-secondary text-secondary-foreground"}`}>{step.count}</span> : null}
          </button>
        ))}
      </div>
      {activeStep === "start" ? (
      <div className="mt-3 rounded-md border border-primary/25 bg-primary/10 p-3">
        <p className="text-sm font-semibold text-foreground">{plan.headline}</p>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {plan.signals.slice(0, 3).map((signal) => (
            <span key={signal.label} className="rounded-md bg-background/80 px-2 py-1 text-center text-[0.65rem] font-semibold uppercase text-muted-foreground" title={`${signal.label}: ${signal.value}`}>
              <strong className="block text-sm text-foreground">{signal.value}</strong>
              {signal.label}
            </span>
          ))}
        </div>
        <button onClick={() => runAction(plan.primaryAction)} className="mt-3 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground">
          <Play className="h-3.5 w-3.5" />
          {plan.primaryAction.label}
        </button>
      </div>
      ) : null}
      {activeStep === "start" ? (
      <div className="mt-3 grid grid-cols-2 gap-2">
        {readyLoops.map((loop) => (
          <PracticeReadyLoopButton key={loop.id} loop={loop} onClick={() => runReadyLoop(loop)} />
        ))}
      </div>
      ) : null}
      {activeStep === "live" ? (
      <div className="mt-3 overflow-hidden rounded-lg border border-violet-500/30 bg-[radial-gradient(circle_at_top_right,rgba(168,85,247,0.32),transparent_38%),linear-gradient(135deg,#1f1147,#5b21b6_52%,#111827)] p-3 text-white shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-white/70">Live</p>
            <p className="mt-1 truncate text-base font-bold">{liveJoinCard.headline}</p>
          </div>
          <span className={`rounded-full px-2 py-1 text-[0.68rem] font-bold ${liveJoinCard.ready ? "bg-emerald-400 text-emerald-950" : "bg-white/15 text-white"}`}>
            {liveJoinCard.ready ? "Ready" : "Needs bank"}
          </span>
        </div>
        <div className="mt-3 rounded-md bg-white p-2 text-center shadow-inner">
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.12em] text-slate-500">Game PIN</p>
          <p className="font-mono text-3xl font-black tracking-[0.18em] text-slate-950">{liveJoinCard.pin}</p>
        </div>
        <button onClick={runLiveAction} className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-white px-3 text-sm font-black text-violet-950 shadow-sm transition hover:-translate-y-0.5" type="button">
          <Swords className="h-4 w-4" />
          {liveJoinCard.primaryLabel}
        </button>
        <details className="group/live-rules mt-2 rounded-md bg-white/10">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2 py-1.5 text-xs font-bold text-white/80">
            Rules
            <ChevronDown className="h-3.5 w-3.5 transition group-open/live-rules:rotate-180" />
          </summary>
          <div className="grid gap-1 border-t border-white/10 p-2">
            {liveJoinCard.scoringRules.map((rule) => (
              <div key={rule.label} className="flex items-center justify-between gap-2 text-xs" title={rule.detail}>
                <span className="text-white/65">{rule.label}</span>
                <strong>{rule.value}</strong>
              </div>
            ))}
          </div>
        </details>
      </div>
      ) : null}
      {activeStep === "setup" ? (
        <div className="mt-3 grid gap-2 rounded-md border border-border bg-background p-2">
          <div className="grid grid-cols-4 gap-1">
            {setupSteps.map((step) => (
              <button
                key={step.id}
                onClick={() => setActiveSetupStep(step.id)}
                className={`inline-flex h-8 min-w-0 items-center justify-center gap-1 rounded-md px-2 text-[0.68rem] font-semibold transition ${
                  activeSetupStep === step.id ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground"
                }`}
                type="button"
              >
                <span className="truncate">{step.label}</span>
                <span className={`rounded px-1 text-[0.58rem] ${activeSetupStep === step.id ? "bg-primary-foreground/20" : "bg-background text-foreground"}`}>{step.count}</span>
              </button>
            ))}
          </div>
          <div className="grid gap-2 border-t border-border pt-2">
            {activeSetupStep === "arena" ? arenaPresets.map((preset) => (
              <PracticeArenaPresetButton key={preset.id} onClick={() => runActionId(preset.action, preset.target)} preset={preset} />
            )) : null}
            {activeSetupStep === "styles" ? playStyles.map((style) => (
              <PracticePlayStyleButton key={style.id} onClick={() => onOpenTarget(style.target)} style={style} />
            )) : null}
            {activeSetupStep === "modes" ? gameModes.map((mode) => (
              <PracticeGameModeButton key={mode.id} mode={mode} onClick={() => onOpenTarget(mode.target)} />
            )) : null}
            {activeSetupStep === "actions" ? plan.actions.map((action) => (
              <PracticeActionButton key={action.id} action={action} onClick={() => runAction(action)} />
            )) : null}
          </div>
        </div>
      ) : null}
      {activeStep === "drafts" && draftCards.length ? (
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
      {activeStep === "drafts" && !draftCards.length ? (
        <div className="mt-3 rounded-md border border-dashed border-border bg-background p-3 text-sm text-muted-foreground">
          No drafts yet. Unfinished practice reappears here.
        </div>
      ) : null}
    </Panel>
  )
}

function PracticeReadyLoopButton({ loop, onClick }: { loop: PracticeReadyLoop; onClick: () => void }) {
  const Icon = practiceReadyLoopIcons[loop.id]
  return (
    <button
      aria-disabled={!loop.enabled}
      className={`group relative min-w-0 rounded-md border p-2 text-left transition ${
        !loop.enabled
          ? "cursor-not-allowed border-border bg-muted/45 opacity-70"
          : loop.recommended
            ? "border-primary/45 bg-primary/10 hover:-translate-y-0.5 hover:bg-primary hover:text-primary-foreground"
            : "border-border bg-background hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground"
      }`}
      onClick={onClick}
      title={loop.reason}
      type="button"
    >
      <div className="flex items-center gap-2">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${loop.recommended && loop.enabled ? "bg-primary text-primary-foreground group-hover:bg-primary-foreground group-hover:text-primary" : "bg-secondary text-secondary-foreground"}`}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-foreground group-hover:text-inherit">{loop.label}</span>
          <span className="block truncate text-[0.65rem] font-bold uppercase text-muted-foreground group-hover:text-inherit">{loop.badge}</span>
        </span>
      </div>
    </button>
  )
}

function PracticeArenaPresetButton({ onClick, preset }: { onClick: () => void; preset: PracticeArenaPreset }) {
  const Icon = practiceArenaPresetIcons[preset.id]
  return (
    <button
      aria-disabled={Boolean(preset.disabledReason)}
      className={`group rounded-md border p-2.5 text-left transition ${
        preset.disabledReason
          ? "cursor-not-allowed border-border bg-muted/45 opacity-70"
          : preset.recommended
            ? "border-violet-400/60 bg-violet-500/10 hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground"
            : "border-border bg-background hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground"
      }`}
      onClick={() => {
        if (!preset.disabledReason) onClick()
      }}
      title={preset.disabledReason || preset.caption}
      type="button"
    >
      <div className="flex items-center gap-2">
        <span className={`flex h-9 w-9 items-center justify-center rounded-md ${preset.recommended ? "bg-violet-600 text-white" : "bg-secondary text-secondary-foreground"}`}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-foreground group-hover:text-accent-foreground">{preset.label}</span>
            {preset.recommended ? <span className="rounded-full bg-success px-1.5 py-0.5 text-[0.6rem] font-black uppercase text-success-foreground">Best</span> : null}
          </span>
          <span className="block truncate text-[0.68rem] font-semibold text-muted-foreground">{preset.model}</span>
        </span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1">
        {preset.scoring.map((score) => (
          <span key={score.label} className="rounded-md bg-secondary px-1.5 py-1 text-center text-[0.62rem] font-semibold text-secondary-foreground" title={`${score.label}: ${score.value}`}>
            {score.value}
          </span>
        ))}
      </div>
    </button>
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


