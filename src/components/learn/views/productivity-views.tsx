"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type React from "react"
import { ArrowDown, ArrowLeft, AtSign, Bookmark, CheckCircle2, Circle, Clock, Download, Gamepad2, Image as ImageIcon, LoaderCircle, MessageSquare, Mic, MicOff, MoreHorizontal, Paperclip, Phone, PhoneOff, Plus, RotateCcw, Search, Send, SlidersHorizontal, Smile, Sparkles, Trophy, UserRound, Users, Video, VideoOff, X, XCircle } from "lucide-react"
import type { WorkspaceOptions } from "../preferences"
import type { Quiz } from "../types"
import { api, formatDate } from "../api"
import { EmptyState, Panel, type ViewMenuProps } from "../ui"
import { Popover } from "../design/popover"
import { VoiceInput } from "../voice-input"
import { buildGameRunActions, evaluateGameChoice, summarizeGameRun, type GameRunActionId } from "@/lib/practice-features"
import { parseLiveGameInvite, parseLiveGameResult } from "@/lib/live/game-invite"
import { LiveGameCard, LiveGameResultCard } from "./live-game-cards"
import { LiveGameLauncher } from "./live-game-launcher"
import { ChatVoiceMessage } from "./chat-voice-message"
import { ChatMediaComposer } from "./chat-media-composer"
import { ChatStories } from "./chat-stories"
import chatStyles from "./chat-workspace.module.css"
import { CHAT_REACTION_EMOJI, type MessageReaction } from "@/lib/social-media"
import { CHAT_DRAFT_KEY, parseStoredChatDraft, serializeChatDraft, type ChatDraft } from "@/lib/chat-drafts"
import { dmChatChannelId, groupChatChannelId } from "@/lib/chat-channel"
import { RealtimeSocket, type RealtimeStatus, type RealtimeFrame } from "@/lib/realtime/client"
import { acceptsCallSignal } from "@/lib/chat-call"
import { chatDestinationPayload, chatDestinationStorageKey, selectConversationThread, type ChatDestination } from "@/lib/chat-destination"
import { buildChatComposerActions, buildChatDraftPayload, buildChatQuickPrompts, buildChatThreadActions, parseThreadTitle, summarizeChatWorkspace, type ChatComposerActionId, type ChatIntent, type ChatQuickPrompt, type ChatThreadActionId, type ChatThreadLike } from "@/lib/social-features"

const quizDetailCache = new Map<string, Quiz>()
type ChatMenuId = "attach" | "compose" | "chatMore" | `threadActions:${string}`
type ChatThreadRecord = ChatThreadLike & {
  threadId?: string
  thread_id?: string
  group_id?: string | null
  target_user_id?: string | null
  dm_peer_id?: string | null
  dm_peer_name?: string | null
}
type ChatMessageRecord = {
  id: string
  thread_id: string
  user_id: string
  body: string
  created_at: string
  /**
   * The message's machine-readable descriptor. `attachment` is an uploaded
   * file; `kind: "live-game"` is a launched game and `"live-game-result"` is a
   * finished one — both read back through `@/lib/live/game-invite`, which
   * returns `null` for anything it does not recognise.
   */
  metadata?: {
    attachment?: { fileId: string; filename: string; contentType: string }
    kind?: string
    [key: string]: unknown
  }
}
type GroupRecord = {
  id: string
  name: string
  description?: string
  member_count?: number
  is_member?: boolean
}
type ConnectionRecord = {
  target_user_id: string
  username: string
  name: string
  avatar_url?: string
}
type CallStatus = "outgoing" | "incoming" | "connected"
type ActiveCall = {
  callId: string
  peerUserId: string
  peerDevice?: string
  initiator?: boolean
  video: boolean
  status: CallStatus
  muted: boolean
  cameraOff: boolean
}

export function GamesView({ quizzes, options }: { quizzes: Quiz[]; options: WorkspaceOptions }) {
  const [quizBank, setQuizBank] = useState<Quiz[]>(quizzes)
  const questions = useMemo(() => quizBank.flatMap((quiz) => quiz.questions || []).slice(0, options.gameQuestionLimit), [quizBank, options.gameQuestionLimit])
  const quizIds = useMemo(() => quizzes.slice(0, 8).map((quiz) => quiz.id).join("|"), [quizzes])
  const [index, setIndex] = useState(0)
  const [score, setScore] = useState(0)
  const [startedAt, setStartedAt] = useState(() => Date.now())
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [targetSeconds, setTargetSeconds] = useState(90)
  const [feedback, setFeedback] = useState<ReturnType<typeof evaluateGameChoice> | null>(null)
  const [completedRun, setCompletedRun] = useState<ReturnType<typeof summarizeGameRun> | null>(null)
  const [gameAction, setGameAction] = useState<GameRunActionId | null>(null)
  const [gameStatus, setGameStatus] = useState("")
  const current = questions[index]
  const isLastPrompt = index + 1 >= questions.length
  const gameActions = useMemo(() => buildGameRunActions({
    busyAction: gameAction,
    hasFeedback: Boolean(feedback),
    isComplete: Boolean(completedRun),
    isLastPrompt,
  }), [completedRun, feedback, gameAction, isLastPrompt])
  const gameActionById = useMemo(() => new Map(gameActions.map((action) => [action.id, action])), [gameActions])

  useEffect(() => {
    let active = true
    const seed = quizzes.slice(0, 8)
    if (!seed.length) {
      setQuizBank([])
      return () => {
        active = false
      }
    }
    if (seed.every((quiz) => (quiz.questions?.length || 0) > 0)) {
      setQuizBank(seed)
      return () => {
        active = false
      }
    }
    Promise.all(seed.map(async (quiz) => {
      if (quiz.questions?.length) {
        quizDetailCache.set(quiz.id, quiz)
        return quiz
      }
      const cached = quizDetailCache.get(quiz.id)
      if (cached) return cached
      const response = await api<{ item: Quiz }>(`/api/quizzes/${quiz.id}`).catch(() => ({ item: quiz }))
      if (response.item.questions?.length) quizDetailCache.set(quiz.id, response.item)
      return response.item
    }))
      .then((items) => {
        if (active) setQuizBank(items)
      })
    return () => {
      active = false
    }
  }, [quizIds])

  useEffect(() => {
    if (completedRun) return undefined
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [completedRun, startedAt])

  function resetRun() {
    if (gameAction) return
    setIndex(0)
    setScore(0)
    setFeedback(null)
    setCompletedRun(null)
    setGameStatus("")
    setStartedAt(Date.now())
    setElapsedSeconds(0)
  }

  function choose(choiceId: string) {
    if (!current || feedback || completedRun || gameAction) return
    const result = evaluateGameChoice(current, choiceId)
    setFeedback(result)
    if (result.correct) setScore((value) => value + 1)
    setGameStatus("")
  }

  async function nextPrompt() {
    if (!current || gameAction) return
    const durationSeconds = currentElapsedSeconds(startedAt)
    if (isLastPrompt) {
      setGameAction("finish-run")
      setElapsedSeconds(durationSeconds)
      const run = summarizeGameRun({ score, total: questions.length, durationSeconds, targetSeconds })
      setCompletedRun(run)
      try {
        await api("/api/games", { method: "POST", body: JSON.stringify({ gameKey: "flashcard-sprint", score, total: questions.length, durationSeconds }) })
        setGameStatus("Run saved.")
      } catch (error) {
        setGameStatus(error instanceof Error ? error.message : "Run finished, but saving the score failed.")
      } finally {
        setGameAction(null)
      }
      return
    }
    setGameAction("next-prompt")
    setFeedback(null)
    setIndex((value) => value + 1)
    setGameStatus("")
    setGameAction(null)
  }

  if (!current) {
    return (
      <Panel className="p-4">
        <EmptyState title="No game questions yet" body="Add or open quizzes so question data can power flashcard sprint and matching games." />
      </Panel>
    )
  }

  return (
    <Panel className="p-4">
      <div className="mb-3 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--decor-mint-soft)] text-[var(--decor-mint-ink)]">
            <Gamepad2 className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-2xl font-semibold text-foreground">Flashcard sprint</h2>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{options.gameMode} mode</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 lg:justify-end">
          <GameStatusChip label="Score" value={`${score}/${questions.length}`} />
          <GameStatusChip label="Prompt" value={`${index + 1}/${questions.length}`} />
        </div>
      </div>
      <GameTimerControls disabled={Boolean(gameAction)} elapsedSeconds={elapsedSeconds} resetRun={resetRun} setTargetSeconds={setTargetSeconds} targetSeconds={targetSeconds} />
      {gameStatus ? <p className="mb-3 rounded-md bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground">{gameStatus}</p> : null}
      {completedRun ? (
        <div className="mb-4 rounded-lg border border-border bg-accent p-4 text-accent-foreground">
          <div className="flex flex-wrap items-center gap-3">
            <Trophy className="h-5 w-5" />
            <p className="font-semibold">Run complete: {completedRun.score}/{completedRun.total} - {completedRun.accuracy}%</p>
            <span className="rounded-md bg-background px-2 py-1 text-xs font-semibold text-foreground">{completedRun.nextAction.replace(/-/g, " ")}</span>
          </div>
          <p className="mt-2 text-sm opacity-80">Duration {formatDuration(completedRun.durationSeconds)} / target {formatDuration(completedRun.targetSeconds)}.</p>
          <button onClick={resetRun} disabled={gameActionById.get("restart")?.disabled} className="mt-3 rounded-md bg-background px-3 py-1.5 text-xs font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-60">Start another run</button>
        </div>
      ) : null}
      <div className="game-prompt rounded-lg border border-primary/30 bg-primary p-5 text-primary-foreground">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] opacity-75">Prompt {index + 1}</p>
        <h3 className="mt-2 text-2xl font-semibold leading-tight">{current.question}</h3>
      </div>
      <div className="game-choices mt-4 grid gap-2 md:grid-cols-2">
        {current.choices.map((choice) => (
          <button
            key={choice.id}
            onClick={() => choose(choice.id)}
            disabled={Boolean(feedback || completedRun || gameAction)}
            className={`rounded-md border p-4 text-left text-sm hover:bg-accent hover:text-accent-foreground disabled:opacity-80 ${
              feedback && choice.id === current.correct_answer_id
                ? "border-success bg-success text-success-foreground"
                : "border-border bg-card"
            }`}
          >
            {choice.text}
          </button>
        ))}
      </div>
      {feedback ? (
        <div className={`mt-4 rounded-md border p-4 ${feedback.correct ? "border-success bg-success text-success-foreground" : "border-destructive bg-destructive text-destructive-foreground"}`}>
          <div className="flex flex-wrap items-center gap-2">
            {feedback.correct ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
            <p className="font-semibold">{feedback.correct ? "Correct" : `Correct answer: ${feedback.correctChoiceText}`}</p>
          </div>
          <p className="mt-2 text-sm opacity-90">{feedback.explanation}</p>
          <button
            onClick={nextPrompt}
            disabled={gameActionById.get(isLastPrompt ? "finish-run" : "next-prompt")?.disabled}
            title={gameActionById.get(isLastPrompt ? "finish-run" : "next-prompt")?.helper}
            className="mt-3 rounded-md bg-background px-3 py-1.5 text-xs font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            {gameActionById.get(isLastPrompt ? "finish-run" : "next-prompt")?.busy
              ? gameActionById.get(isLastPrompt ? "finish-run" : "next-prompt")?.busyLabel
              : gameActionById.get(isLastPrompt ? "finish-run" : "next-prompt")?.label}
          </button>
        </div>
      ) : null}
    </Panel>
  )
}

function GameStatusChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2 text-xs font-semibold text-muted-foreground">
      {label}
      <span className="rounded bg-secondary px-1.5 py-0.5 text-secondary-foreground">{value}</span>
    </span>
  )
}

function GameTimerControls({
  disabled,
  elapsedSeconds,
  resetRun,
  setTargetSeconds,
  targetSeconds,
}: {
  disabled?: boolean
  elapsedSeconds: number
  resetRun: () => void
  setTargetSeconds: (seconds: number) => void
  targetSeconds: number
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-card p-2">
      <span className="inline-flex h-9 sm:h-8 items-center gap-1.5 rounded-md bg-muted px-2 text-xs font-semibold text-muted-foreground">
        <Clock className="h-3.5 w-3.5" />
        {formatDuration(elapsedSeconds)}
      </span>
      <span className={`inline-flex h-9 sm:h-8 items-center rounded-md px-2 text-xs font-semibold ${elapsedSeconds > targetSeconds ? "bg-destructive text-destructive-foreground" : "bg-muted text-muted-foreground"}`}>
        target {formatDuration(targetSeconds)}
      </span>
      <details className="group relative">
        <summary className="inline-flex h-9 sm:h-8 cursor-pointer list-none items-center gap-1.5 rounded-md border border-border bg-secondary px-2.5 text-xs font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground [&::-webkit-details-marker]:hidden" title="Round setup">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Setup
        </summary>
        <div className="absolute right-0 top-10 z-40 grid w-48 sm:left-0 sm:right-auto sm:top-9 gap-1 rounded-md border border-border bg-popover p-2 text-popover-foreground shadow-lg">
          <p className="px-1 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Target time</p>
          {[60, 90, 180].map((seconds) => (
            <button
              key={seconds}
              onClick={() => setTargetSeconds(seconds)}
              aria-pressed={targetSeconds === seconds}
              disabled={disabled}
              className={`h-9 sm:h-8 rounded-md px-2.5 text-left text-xs font-semibold ${targetSeconds === seconds ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground"}`}
              type="button"
            >
              {formatDuration(seconds)}
            </button>
          ))}
        </div>
      </details>
      <button onClick={resetRun} disabled={disabled} className="ml-auto flex h-9 sm:h-8 items-center gap-1.5 rounded-md border border-border bg-secondary px-3 text-xs font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-60">
        <RotateCcw className="h-3.5 w-3.5" />
        Restart
      </button>
    </div>
  )
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

function currentElapsedSeconds(startedAt: number) {
  return Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
}

export function ChatView({ options }: { options: WorkspaceOptions }) {
  const [threads, setThreads] = useState<ChatThreadRecord[]>([])
  const [body, setBody] = useState("")
  const [title, setTitle] = useState("Study room")
  const [intent, setIntent] = useState<ChatIntent>("update")
  const [channel, setChannel] = useState("#general")
  const [query, setQuery] = useState("")
  const [inboxKind, setInboxKind] = useState<"all" | "people" | "groups" | "saved">("all")
  const [inboxLoading, setInboxLoading] = useState(true)
  const [inboxError, setInboxError] = useState("")
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [messagesError, setMessagesError] = useState("")
  const [messageQuery, setMessageQuery] = useState("")
  const [searchOpen, setSearchOpen] = useState(false)
  const [recipientsOpen, setRecipientsOpen] = useState(false)
  const [recipientQuery, setRecipientQuery] = useState("")
  const [recipientError, setRecipientError] = useState("")
  const [groupName, setGroupName] = useState("")
  const [newGroupOpen, setNewGroupOpen] = useState(false)
  const [recipientBusy, setRecipientBusy] = useState(false)
  const [mediaOpen, setMediaOpen] = useState(false)
  const [reactionMessageId, setReactionMessageId] = useState("")
  const [awayFromLatest, setAwayFromLatest] = useState(false)
  const recipientDialogRef = useRef<HTMLDialogElement>(null)
  const recipientSearchRef = useRef<HTMLInputElement>(null)
  const messageListRef = useRef<HTMLDivElement>(null)
  const messageInputRef = useRef<HTMLTextAreaElement>(null)
  const messageSearchRef = useRef<HTMLInputElement>(null)
  const sendPendingRef = useRef(false)
  const recipientPendingRef = useRef(false)
  const mountedRef = useRef(true)
  const messageScrollRef = useRef({ threadId: "", count: 0 })
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])
  const [draftStatus, setDraftStatus] = useState("")
  const [replyThreadId, setReplyThreadId] = useState<string | undefined>(undefined)
  const [chatAction, setChatAction] = useState<ChatComposerActionId | null>(null)
  const [threadAction, setThreadAction] = useState<{ action: ChatThreadActionId; threadId: string } | null>(null)
  const [openChatMenu, setOpenChatMenu] = useState<ChatMenuId | null>(null)
  const [conversationOpen, setConversationOpen] = useState(false)
  const [destination, setDestination] = useState<ChatDestination>({ kind: "personal" })
  const destinationRef = useRef(destination)
  const currentDraftRef = useRef<ChatDraft>({ body, title, intent, channel, replyThreadId })
  const conversationDraftsRef = useRef(new Map<string, ChatDraft>())
  const draftsReadyRef = useRef(false)
  destinationRef.current = destination
  currentDraftRef.current = { body, title, intent, channel, replyThreadId }
  // The "Start a live game" composer flow: which mode, on which quiz. The
  // launcher owns the choices; this only owns whether it is open.
  const [liveGameOpen, setLiveGameOpen] = useState(false)
  const chatSummary = useMemo(() => summarizeChatWorkspace(threads), [threads])
  const quickPrompts = useMemo(() => buildChatQuickPrompts({
    hasDraft: Boolean(body.trim()),
    questionCount: chatSummary.questions,
    savedCount: chatSummary.saved,
    threadCount: chatSummary.total,
    winCount: chatSummary.wins,
  }), [body, chatSummary.questions, chatSummary.saved, chatSummary.total, chatSummary.wins])
  const chatActions = useMemo(() => buildChatComposerActions({
    busyAction: chatAction,
    hasDraft: Boolean(body.trim()),
    hasSuggestion: false,
  }), [body, chatAction])
  const chatActionById = useMemo(() => new Map(chatActions.map((action) => [action.id, action])), [chatActions])
  const visibleThreads = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return threads.filter((thread) => {
      const searchable = [thread.title, thread.dm_peer_name, thread.last_message, thread.lastMessage].filter(Boolean).join(" ").toLocaleLowerCase()
      if (needle && !searchable.includes(needle)) return false
      if (inboxKind === "people") return Boolean(thread.dm_peer_id) && !thread.group_id
      if (inboxKind === "groups") return Boolean(thread.group_id)
      if (inboxKind === "saved") return Boolean(thread.saved)
      return true
    }).sort((a, b) => (Date.parse(b.updated_at || b.updatedAt || "") || 0) - (Date.parse(a.updated_at || a.updatedAt || "") || 0))
  }, [inboxKind, query, threads])
  const activeThread = useMemo(() => selectConversationThread(threads, destination), [threads, destination])
  const groupId = destination.kind === "group" ? destination.groupId : activeThread?.group_id || ""
  const dmTargetUserId = destination.kind === "dm" ? destination.targetUserId : activeThread?.dm_peer_id || ""
  const activeThreadParsed = parseThreadTitle(activeThread?.title || `${channel} - ${title}`)
  const activeThreadId = activeThread ? chatThreadKey(activeThread) : ""
  const activeThreadIdRef = useRef(activeThreadId)
  activeThreadIdRef.current = activeThreadId

  // --- Groups: which group this conversation posts into, and live/message state ---
  const [groups, setGroups] = useState<GroupRecord[]>([])
  const [messages, setMessages] = useState<ChatMessageRecord[]>([])
  const [messageReactions, setMessageReactions] = useState<Record<string, MessageReaction[]>>({})
  const [reactionPending, setReactionPending] = useState(false)
  const [remoteTyping, setRemoteTyping] = useState(false)
  const [currentUserId, setCurrentUserId] = useState("")
  const socketRef = useRef<RealtimeSocket | null>(null)
  const [socketStatus, setSocketStatus] = useState<RealtimeStatus>("closed")
  const typingClearRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const typingStopRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTypingSentRef = useRef(0)
  const myGroups = useMemo(() => groups.filter((group) => group.is_member), [groups])
  const activeGroup = useMemo(() => myGroups.find((group) => group.id === groupId) || null, [groupId, myGroups])

  useEffect(() => {
    api<{ user?: { id?: string } }>("/api/auth/session").then((response) => {
      if (response.user?.id) setCurrentUserId(response.user.id)
    }).catch(() => undefined)
  }, [])

  async function refreshGroups() {
    try {
      const response = await api<{ items: GroupRecord[] }>("/api/groups")
      setGroups(response.items)
    } catch {
      setRecipientError("Couldn't load groups. Try again.")
    }
  }

  // --- Direct messages: 1:1 with a connection, mutually exclusive with the group selection above ---
  const [connections, setConnections] = useState<ConnectionRecord[]>([])
  const activeDmTarget = useMemo(() => connections.find((c) => c.target_user_id === dmTargetUserId) || null, [connections, dmTargetUserId])

  async function refreshConnections() {
    try {
      const response = await api<{ items: ConnectionRecord[] }>("/api/connections")
      setConnections(response.items)
    } catch { setRecipientError("Couldn't load connections. Try again.") }
  }

  useEffect(() => { void refreshConnections() }, [])

  useEffect(() => {
    if (recipientsOpen) {
      recipientDialogRef.current?.showModal()
      recipientSearchRef.current?.focus()
    } else recipientDialogRef.current?.close()
  }, [recipientsOpen])

  useEffect(() => {
    if (searchOpen) messageSearchRef.current?.focus()
    else setMessageQuery("")
  }, [searchOpen])

  function openRecipients() {
    setRecipientQuery("")
    setNewGroupOpen(false)
    setRecipientsOpen(true)
  }

  function closeRecipients() { if (!recipientBusy) setRecipientsOpen(false) }

  useEffect(() => {
    refreshGroups().catch(() => undefined)
  }, [])

  async function createGroup(name: string) {
    if (!name.trim() || recipientPendingRef.current) return
    recipientPendingRef.current = true
    setRecipientBusy(true)
    setRecipientError("")
    try {
      const response = await api<{ item: GroupRecord }>("/api/groups", { method: "POST", body: JSON.stringify({ name: name.trim() }) })
      await refreshGroups()
      switchToGroup(response.item.id)
      setDraftStatus(`Created "${name.trim()}"`)
      setGroupName("")
    } catch (error) {
      setRecipientError(error instanceof Error ? error.message : "Unable to create group.")
    } finally { recipientPendingRef.current = false; setRecipientBusy(false) }
  }

  async function joinGroupById(id: string) {
    if (recipientPendingRef.current) return
    recipientPendingRef.current = true
    setRecipientBusy(true)
    setRecipientError("")
    try {
      await api(`/api/groups/${id}/join`, { method: "POST" })
      await refreshGroups()
      switchToGroup(id)
      setDraftStatus("Joined group")
    } catch (error) {
      setRecipientError(error instanceof Error ? error.message : "Unable to join group.")
    } finally { recipientPendingRef.current = false; setRecipientBusy(false) }
  }

  function startDirectMessage(targetUserId: string) {
    setConversationOpen(true)
    switchConversation({ kind: "dm", targetUserId })
    setRecipientsOpen(false)
    setSearchOpen(false)
    setMessages([])
    setOpenChatMenu(null)
  }

  function switchToGroup(id: string) {
    setConversationOpen(true)
    switchConversation({ kind: "group", groupId: id })
    setRecipientsOpen(false)
    setSearchOpen(false)
    setMessages([])
    setOpenChatMenu(null)
  }

  const messageDestination = chatDestinationPayload(activeThreadId ? { kind: "thread", threadId: activeThreadId } : destination)

  // --- Message history for the active thread ---
  async function refreshMessages(threadId: string) {
    if (!threadId) {
      setMessages([])
      return
    }
    if (activeThreadIdRef.current !== threadId) return
    setMessagesError("")
    try {
      const response = await api<{ items: ChatMessageRecord[]; reactions?: Record<string, MessageReaction[]> }>(`/api/chat?threadId=${encodeURIComponent(threadId)}`)
      if (activeThreadIdRef.current === threadId) { setMessages(response.items); setMessageReactions(response.reactions || {}) }
    } catch (error) {
      if (activeThreadIdRef.current === threadId) setMessagesError(error instanceof Error ? error.message : "Couldn't load messages.")
    } finally {
      if (activeThreadIdRef.current === threadId) setMessagesLoading(false)
    }
  }

  useEffect(() => {
    setMessages([])
    setMessagesError("")
    setMessagesLoading(Boolean(activeThreadId))
    setReactionMessageId("")
    setAwayFromLatest(false)
    void refreshMessages(activeThreadId)
  }, [activeThreadId])

  useEffect(() => {
    const previous = messageScrollRef.current
    const switched = previous.threadId !== activeThreadId
    if (switched || (!awayFromLatest && messages.length !== previous.count)) scrollToLatest()
    messageScrollRef.current = { threadId: activeThreadId, count: messages.length }
  }, [activeThreadId, awayFromLatest, messages.length])

  function scrollToLatest() {
    const list = messageListRef.current
    if (list) list.scrollTop = list.scrollHeight
    setAwayFromLatest(false)
  }

  // --- Realtime: live messages + typing over the active group's or DM's channel ---
  const groupChannelId = groupId ? groupChatChannelId(groupId) : (dmTargetUserId && currentUserId ? dmChatChannelId(currentUserId, dmTargetUserId) : null)

  useEffect(() => {
    if (!groupChannelId || typeof window === "undefined") return
    const socket = new RealtimeSocket({
      kind: "chat", id: groupChannelId,
      onStatus: (status) => {
        setSocketStatus(status)
        if (status === "open") { void refresh().catch(() => undefined); void refreshMessages(activeThreadIdRef.current) }
      },
      onFrame: receiveFrame,
    }).start()
    socketRef.current = socket

    function receiveFrame(parsed: RealtimeFrame) {
      if (!parsed) return
      if (parsed.type === "chat-event") {
        const threadId = String(parsed.payload?.threadId || "")
        if (threadId === activeThreadIdRef.current) void refreshMessages(threadId)
        void refresh().catch(() => undefined)
        return
      }
      if (parsed.userId === currentUserId) return

      if (parsed.type === "chat-message") {
        const payload = parsed.payload || {}
        const threadId = String(payload.threadId || "")
        setMessages((current) => {
          if (threadId !== activeThreadIdRef.current) return current
          if (current.some((m) => m.id === payload.messageId)) return current
          const attachment = payload.attachment as { fileId?: string; filename?: string; contentType?: string } | undefined
          return [...current, {
            id: String(payload.messageId || `remote-${Date.now()}`),
            thread_id: threadId,
            user_id: String(parsed?.userId || ""),
            body: String(payload.body || ""),
            created_at: String(payload.createdAt || new Date().toISOString()),
            metadata: attachment?.fileId ? { attachment: { fileId: attachment.fileId, filename: attachment.filename || "file", contentType: attachment.contentType || "application/octet-stream" } } : undefined,
          }]
        })
        refresh().catch(() => undefined)
        setRemoteTyping(false)
        return
      }

      if (parsed.type === "typing") {
        const payload = parsed.payload || {}
        setRemoteTyping(payload.isTyping !== false)
        if (typingClearRef.current) clearTimeout(typingClearRef.current)
        typingClearRef.current = setTimeout(clearRemoteTyping, 4000)
        return
      }

      if (parsed.type === "call-signal") {
        void handleCallSignal(parsed.payload || {}, parsed.userId, parsed.fromDevice).catch(() => endCall(true, "Call negotiation failed. Please try again."))
      }
    }

    function clearRemoteTyping() {
      setRemoteTyping(false)
    }

    return () => {
      endCall(true, "")
      socket.close()
      if (socketRef.current === socket) socketRef.current = null
      setRemoteTyping(false)
      cleanupMedia()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupChannelId, currentUserId])

  function sendTypingSignal(isTyping: boolean) {
    const socket = socketRef.current
    if (!socket || socket.status !== "open" || !groupChannelId || !currentUserId) return
    socket.sendNow({ type: "typing", payload: { threadId: groupChannelId, isTyping } })
  }

  function stopTypingSignal() {
    sendTypingSignal(false)
  }

  function handleDraftActivity(value: string) {
    if (!groupChannelId) return
    if (!value.trim()) {
      sendTypingSignal(false)
      if (typingStopRef.current) clearTimeout(typingStopRef.current)
      return
    }
    const now = Date.now()
    if (now - lastTypingSentRef.current > 2000) {
      lastTypingSentRef.current = now
      sendTypingSignal(true)
    }
    if (typingStopRef.current) clearTimeout(typingStopRef.current)
    typingStopRef.current = setTimeout(stopTypingSignal, 3000)
  }

  // --- WebRTC calling: 1:1 within the active group's channel ---
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [callElapsed, setCallElapsed] = useState(0)
  const activeCallRef = useRef<ActiveCall | null>(null)
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const callRecoveryRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const callSetupPendingRef = useRef(false)
  const callSetupVersionRef = useRef(0)
  const [callConnectionStatus, setCallConnectionStatus] = useState("Connecting media…")
  const [relayAvailable, setRelayAvailable] = useState(false)
  const outgoingIceRef = useRef<string[]>([])
  const earlyPeerIceRef = useRef<Array<{ userId: string; device?: string; candidate: RTCIceCandidateInit }>>([])
  const localStreamRef = useRef<MediaStream | null>(null)
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([])
  const incomingOfferRef = useRef<{ callId: string; sdp: string; video: boolean; peerUserId: string } | null>(null)
  const callTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const localVideoRef = useRef<HTMLVideoElement | null>(null)
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null)
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null)
  const [isRecordingCall, setIsRecordingCall] = useState(false)
  const recordingCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])
  const recordingAudioContextRef = useRef<AudioContext | null>(null)
  const recordingAnimationFrameRef = useRef<number | null>(null)
  const iceServersRef = useRef<RTCIceServer[]>([{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }])

  async function loadCallConfiguration() {
    try {
      const config = await api<{ iceServers: RTCIceServer[]; relayAvailable: boolean }>("/api/calls/config")
      iceServersRef.current = config.iceServers
      setRelayAvailable(config.relayAvailable)
    } catch { setRelayAvailable(false) }
  }

  function updateActiveCall(call: ActiveCall | null) {
    activeCallRef.current = call
    setActiveCall(call)
  }

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStream
  }, [localStream, activeCall?.status])

  useEffect(() => {
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = remoteStream
  }, [remoteStream, activeCall?.status])

  useEffect(() => {
    if (activeCall?.status !== "connected") {
      setCallElapsed(0)
      return
    }
    const startedAt = Date.now()
    const interval = setInterval(() => setCallElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000)
    return () => clearInterval(interval)
  }, [activeCall?.status, activeCall?.callId])

  useEffect(() => {
    return () => {
      localStreamRef.current?.getTracks().forEach((track) => track.stop())
      peerConnectionRef.current?.close()
    }
  }, [])

  function sendCallSignal(payload: { callId: string; kind: string; video?: boolean; sdp?: string; candidate?: string }, recipient?: { userId: string; device?: string }) {
    const socket = socketRef.current
    if (!socket || socket.status !== "open" || !currentUserId) return false
    const peer = recipient || (activeCallRef.current?.peerUserId ? { userId: activeCallRef.current.peerUserId, device: activeCallRef.current.peerDevice } : null)
    socket.sendNow({ type: "call-signal", payload, ...(peer ? { to: peer.userId, toDevice: peer.device } : {}) })
    return true
  }

  function createPeerConnection(callId: string) {
    const pc = new RTCPeerConnection({ iceServers: iceServersRef.current })
    pc.onicecandidate = (event) => {
      if (!event.candidate) return
      const candidate = JSON.stringify(event.candidate.toJSON())
      if (!activeCallRef.current?.peerUserId) outgoingIceRef.current.push(candidate)
      else sendCallSignal({ callId, kind: "ice-candidate", candidate })
    }
    pc.ontrack = (event) => {
      setRemoteStream((current) => {
        const stream = current || new MediaStream()
        if (!stream.getTracks().some((track) => track.id === event.track.id)) stream.addTrack(event.track)
        return stream
      })
    }
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        if (callRecoveryRef.current) clearTimeout(callRecoveryRef.current)
        callRecoveryRef.current = null
        setCallConnectionStatus("Connected")
        return
      }
      if (pc.connectionState === "connecting" || pc.connectionState === "new") { setCallConnectionStatus("Connecting media…"); return }
      if ((pc.connectionState === "disconnected" || pc.connectionState === "failed") && !callRecoveryRef.current) {
        setCallConnectionStatus("Connection interrupted. Reconnecting…")
        callRecoveryRef.current = setTimeout(async () => {
          if (activeCallRef.current?.callId !== callId || pc.connectionState === "connected") return
          try {
            if (activeCallRef.current.initiator && activeCallRef.current.peerUserId && pc.signalingState === "stable") {
              const offer = await pc.createOffer({ iceRestart: true })
              await pc.setLocalDescription(offer)
              if (activeCallRef.current?.callId !== callId) return
              sendCallSignal({ callId, kind: "offer", sdp: offer.sdp, video: activeCallRef.current.video })
            }
          } catch { /* The timeout below closes an unrecoverable connection. */ }
          callRecoveryRef.current = setTimeout(() => {
            if (activeCallRef.current?.callId === callId && pc.connectionState !== "connected") endCall(true, "Could not reconnect the call. Try calling again.")
          }, 15000)
        }, pc.connectionState === "failed" ? 0 : 6000)
      }
    }
    peerConnectionRef.current = pc
    return pc
  }

  async function attachLocalMedia(video: boolean, setupVersion: number) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video })
    if (setupVersion !== callSetupVersionRef.current) { stream.getTracks().forEach((track) => track.stop()); throw new Error("Call cancelled.") }
    localStreamRef.current = stream
    setLocalStream(stream)
    return stream
  }

  async function startCall(video: boolean) {
    if (callSetupPendingRef.current) return
    if (activeCallRef.current || !groupChannelId || !currentUserId) {
      setDraftStatus("Open a conversation to start a call.")
      return
    }
    if (!socketRef.current || socketRef.current.status !== "open") {
      setDraftStatus("Connecting — try the call again in a moment.")
      return
    }
    const callId = crypto.randomUUID()
    const setupVersion = callSetupVersionRef.current
    callSetupPendingRef.current = true
    try {
      await loadCallConfiguration()
      if (setupVersion !== callSetupVersionRef.current) return
      setCallConnectionStatus("Connecting media…")
      const stream = await attachLocalMedia(video, setupVersion)
      const pc = createPeerConnection(callId)
      stream.getTracks().forEach((track) => pc.addTrack(track, stream))
      updateActiveCall({ callId, peerUserId: dmTargetUserId, initiator: true, video, status: "outgoing", muted: false, cameraOff: false })
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      if (setupVersion !== callSetupVersionRef.current) return
      sendCallSignal({ callId, kind: "offer", video, sdp: offer.sdp })
      if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current)
      callTimeoutRef.current = setTimeout(handleNoAnswerTimeout, 30000)
      setDraftStatus(dmTargetUserId ? (video ? "Calling with video…" : "Calling…") : "Inviting one group member to a call…")
    } catch {
      if (setupVersion === callSetupVersionRef.current) {
        setDraftStatus("Couldn't start the call — check camera/microphone permissions.")
        cleanupMedia()
        updateActiveCall(null)
      }
    } finally { callSetupPendingRef.current = false }

    function handleNoAnswerTimeout() {
      if (activeCallRef.current?.callId === callId && activeCallRef.current.status === "outgoing") {
        sendCallSignal({ callId, kind: "hangup" })
        endCall(false, "No answer.")
      }
    }
  }

  async function handleCallSignal(payload: Record<string, unknown>, fromUserId: string | undefined, fromDevice?: string) {
    const callId = String(payload.callId || "")
    const kind = String(payload.kind || "")
    if (!callId || !kind || !fromUserId) return

    if (kind === "offer") {
      const existingCall = activeCallRef.current
      const existingPeer = peerConnectionRef.current
      if (existingCall?.status === "connected" && existingPeer && acceptsCallSignal(existingCall, { callId, kind, userId: fromUserId, device: fromDevice })) {
        await existingPeer.setRemoteDescription({ type: "offer", sdp: String(payload.sdp || "") })
        await flushPendingIceCandidates()
        const answer = await existingPeer.createAnswer()
        await existingPeer.setLocalDescription(answer)
        if (activeCallRef.current?.callId !== callId) return
        sendCallSignal({ callId, kind: "answer", sdp: answer.sdp })
        return
      }
      if (activeCallRef.current) {
        sendCallSignal({ callId, kind: "busy" }, { userId: fromUserId, device: fromDevice })
        return
      }
      incomingOfferRef.current = { callId, sdp: String(payload.sdp || ""), video: Boolean(payload.video), peerUserId: fromUserId }
      updateActiveCall({ callId, peerUserId: fromUserId, peerDevice: fromDevice, video: Boolean(payload.video), status: "incoming", muted: false, cameraOff: false })
      setDraftStatus(`Incoming ${payload.video ? "video" : "voice"} call…`)
      return
    }

    if (kind === "ice-candidate" && activeCallRef.current?.callId === callId && !activeCallRef.current.peerUserId) {
      if (earlyPeerIceRef.current.length < 128) {
        try {
          const candidate: RTCIceCandidateInit = JSON.parse(String(payload.candidate || ""))
          if (candidate && typeof candidate === "object") earlyPeerIceRef.current.push({ userId: fromUserId, device: fromDevice, candidate })
        } catch { /* Ignore malformed candidates. */ }
      }
      return
    }
    const restarting = kind === "answer" && peerConnectionRef.current?.signalingState === "have-local-offer" && activeCallRef.current?.status === "connected"
    if (!acceptsCallSignal(activeCallRef.current, { callId, kind: restarting ? "ice-candidate" : kind, userId: fromUserId, device: fromDevice })) return

    if (kind === "answer") {
      const pc = peerConnectionRef.current
      if (!pc || pc.signalingState !== "have-local-offer") return
      const call = activeCallRef.current
      if (!call) return
      updateActiveCall({ ...call, peerUserId: fromUserId, peerDevice: fromDevice, status: "connected" })
      await pc.setRemoteDescription({ type: "answer", sdp: String(payload.sdp || "") })
      pendingIceCandidatesRef.current.push(...earlyPeerIceRef.current.filter((entry) => entry.userId === fromUserId && entry.device === fromDevice).map((entry) => entry.candidate))
      earlyPeerIceRef.current = []
      await flushPendingIceCandidates()
      if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current)
      for (const candidate of outgoingIceRef.current.splice(0)) sendCallSignal({ callId, kind: "ice-candidate", candidate })
      setDraftStatus("Call connected.")
      return
    }

    if (kind === "ice-candidate") {
      const raw = String(payload.candidate || "")
      if (!raw) return
      let candidate: RTCIceCandidateInit | null = null
      try {
        candidate = JSON.parse(raw)
      } catch {
        return
      }
      const pc = peerConnectionRef.current
      if (pc && pc.remoteDescription) {
        try {
          await pc.addIceCandidate(candidate || undefined)
        } catch {
          // Ignore late/duplicate candidates.
        }
      } else if (candidate) {
        pendingIceCandidatesRef.current.push(candidate)
      }
      return
    }

    if (kind === "hangup" || kind === "decline" || kind === "busy") {
      endCall(false, kind === "busy" ? "They're on another call." : kind === "decline" ? "Call declined." : "Call ended.")
    }
  }

  async function flushPendingIceCandidates() {
    const pc = peerConnectionRef.current
    if (!pc) return
    const queued = pendingIceCandidatesRef.current
    pendingIceCandidatesRef.current = []
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(candidate)
      } catch {
        // Ignore candidates that no longer apply.
      }
    }
  }

  async function acceptIncomingCall() {
    const offer = incomingOfferRef.current
    const call = activeCallRef.current
    if (!offer || !call || call.status !== "incoming" || callSetupPendingRef.current) return
    const setupVersion = callSetupVersionRef.current
    callSetupPendingRef.current = true
    try {
      await loadCallConfiguration()
      if (setupVersion !== callSetupVersionRef.current) return
      setCallConnectionStatus("Connecting media…")
      const stream = await attachLocalMedia(offer.video, setupVersion)
      const pc = createPeerConnection(offer.callId)
      stream.getTracks().forEach((track) => pc.addTrack(track, stream))
      await pc.setRemoteDescription({ type: "offer", sdp: offer.sdp })
      await flushPendingIceCandidates()
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      if (activeCallRef.current?.callId !== offer.callId) return
      sendCallSignal({ callId: offer.callId, kind: "answer", sdp: answer.sdp })
      updateActiveCall(activeCallRef.current ? { ...activeCallRef.current, status: "connected" } : null)
      setDraftStatus("Call connected.")
    } catch {
      if (setupVersion !== callSetupVersionRef.current) return
      sendCallSignal({ callId: offer.callId, kind: "hangup" })
      setDraftStatus("Couldn't access your camera/microphone — check permissions.")
      cleanupMedia()
      updateActiveCall(null)
      incomingOfferRef.current = null
    } finally { callSetupPendingRef.current = false }
  }

  function declineIncomingCall() {
    const call = activeCallRef.current
    if (!call || call.status !== "incoming") return
    sendCallSignal({ callId: call.callId, kind: "decline" })
    endCall(false, "Call declined.")
  }

  function cleanupMedia() {
    callSetupVersionRef.current += 1
    if (callRecoveryRef.current) clearTimeout(callRecoveryRef.current)
    callRecoveryRef.current = null
    localStreamRef.current?.getTracks().forEach((track) => track.stop())
    localStreamRef.current = null
    setLocalStream(null)
    setRemoteStream(null)
    peerConnectionRef.current?.close()
    peerConnectionRef.current = null
    pendingIceCandidatesRef.current = []
    outgoingIceRef.current = []
    earlyPeerIceRef.current = []
  }

  function endCall(notifyPeer: boolean, reason: string) {
    const call = activeCallRef.current
    if (!call) return
    if (notifyPeer) sendCallSignal({ callId: call.callId, kind: "hangup" })
    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current)
      callTimeoutRef.current = null
    }
    if (mediaRecorderRef.current) stopRecordingCall()
    incomingOfferRef.current = null
    activeCallRef.current = null
    cleanupMedia()
    updateActiveCall(null)
    setCallElapsed(0)
    if (reason) setDraftStatus(reason)
  }

  function startRecordingCall() {
    if (!localStreamRef.current || mediaRecorderRef.current) return
    try {
      const audioContext = new AudioContext()
      const destination = audioContext.createMediaStreamDestination()
      if (localStreamRef.current.getAudioTracks().length) {
        audioContext.createMediaStreamSource(new MediaStream(localStreamRef.current.getAudioTracks())).connect(destination)
      }
      if (remoteStream?.getAudioTracks().length) {
        audioContext.createMediaStreamSource(new MediaStream(remoteStream.getAudioTracks())).connect(destination)
      }
      recordingAudioContextRef.current = audioContext

      let recordingStream: MediaStream
      if (activeCall?.video) {
        const canvas = document.createElement("canvas")
        canvas.width = 960
        canvas.height = 540
        recordingCanvasRef.current = canvas
        const ctx = canvas.getContext("2d")
        const drawFrame = () => {
          if (!ctx) return
          ctx.fillStyle = "#000"
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          if (remoteVideoRef.current && remoteVideoRef.current.readyState >= 2) {
            ctx.drawImage(remoteVideoRef.current, 0, 0, canvas.width, canvas.height)
          }
          if (localVideoRef.current && localVideoRef.current.readyState >= 2) {
            ctx.drawImage(localVideoRef.current, canvas.width - 200, canvas.height - 130, 190, 120)
          }
          recordingAnimationFrameRef.current = requestAnimationFrame(drawFrame)
        }
        drawFrame()
        recordingStream = canvas.captureStream(30)
        destination.stream.getAudioTracks().forEach((track) => recordingStream.addTrack(track))
      } else {
        recordingStream = destination.stream
      }

      const mimeType = ["video/webm;codecs=vp8,opus", "video/webm", "audio/webm"].find((type) => MediaRecorder.isTypeSupported(type)) || ""
      const recorder = new MediaRecorder(recordingStream, mimeType ? { mimeType } : undefined)
      recordedChunksRef.current = []
      recorder.ondataavailable = (event) => {
        if (event.data.size) recordedChunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType || "video/webm" })
        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.href = url
        link.download = `call-recording-${Date.now()}.webm`
        link.click()
        URL.revokeObjectURL(url)
        recordedChunksRef.current = []
      }
      recorder.start(1000)
      mediaRecorderRef.current = recorder
      setIsRecordingCall(true)
      setDraftStatus("Recording started")
    } catch {
      setDraftStatus("Couldn't start recording on this device/browser.")
    }
  }

  function stopRecordingCall() {
    mediaRecorderRef.current?.stop()
    mediaRecorderRef.current = null
    if (recordingAnimationFrameRef.current) {
      cancelAnimationFrame(recordingAnimationFrameRef.current)
      recordingAnimationFrameRef.current = null
    }
    recordingCanvasRef.current = null
    recordingAudioContextRef.current?.close().catch(() => undefined)
    recordingAudioContextRef.current = null
    setIsRecordingCall(false)
    setDraftStatus("Recording saved")
  }

  function toggleCallRecording() {
    if (mediaRecorderRef.current) stopRecordingCall()
    else startRecordingCall()
  }

  function toggleCallMute() {
    const stream = localStreamRef.current
    if (!stream) return
    const nextMuted = !activeCallRef.current?.muted
    stream.getAudioTracks().forEach((track) => { track.enabled = !nextMuted })
    updateActiveCall(activeCallRef.current ? { ...activeCallRef.current, muted: nextMuted } : null)
  }

  function toggleCallCamera() {
    const stream = localStreamRef.current
    if (!stream || !activeCallRef.current?.video) return
    const nextOff = !activeCallRef.current?.cameraOff
    stream.getVideoTracks().forEach((track) => { track.enabled = !nextOff })
    updateActiveCall(activeCallRef.current ? { ...activeCallRef.current, cameraOff: nextOff } : null)
  }

  function formatCallDuration(totalSeconds: number) {
    const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0")
    const seconds = (totalSeconds % 60).toString().padStart(2, "0")
    return `${minutes}:${seconds}`
  }

  function applyQuickPrompt(prompt: ChatQuickPrompt) {
    setIntent(prompt.intent)
    setChannel(prompt.channel)
    setBody((current) => current.trim() ? current : prompt.prompt)
    setDraftStatus(`${prompt.label} draft ready`)
  }

  function applyDraft(draft: ChatDraft) {
    currentDraftRef.current = draft
    setBody(draft.body)
    setTitle(draft.title)
    setIntent(draft.intent)
    setChannel(draft.channel)
    setReplyThreadId(draft.replyThreadId)
  }

  function saveConversationDraft(target: ChatDestination, draft: ChatDraft) {
    conversationDraftsRef.current.set(chatDestinationKey(target), draft)
    writeConversationDraft(currentUserId, target, draft)
  }

  function switchConversation(requested: ChatDestination) {
    if (!mountedRef.current) return
    saveConversationDraft(destinationRef.current, currentDraftRef.current)
    const thread = selectConversationThread(threads, requested)
    const next: ChatDestination = thread ? { kind: "thread", threadId: chatThreadKey(thread) } : requested
    const parsed = parseThreadTitle(thread?.title || "Study room")
    const draft = conversationDraftsRef.current.get(chatDestinationKey(next)) || readConversationDraft(currentUserId, next) || {
      body: "", title: parsed.title, intent: "update" as const, channel: parsed.channel || "#general", replyThreadId: next.kind === "thread" ? next.threadId : undefined,
    }
    destinationRef.current = next
    setDestination(next)
    writeChatDestination(currentUserId, next)
    applyDraft(draft)
    setDraftStatus("")
    setMediaOpen(false)
    setLiveGameOpen(false)
  }

  function finishMessageSend(source: ChatDestination, sentDraft: ChatDraft | null, threadId: string) {
    if (!mountedRef.current) return false
    const sourceKey = chatDestinationKey(source)
    const stillActive = chatDestinationKey(destinationRef.current) === sourceKey
    const latest = stillActive ? currentDraftRef.current : conversationDraftsRef.current.get(sourceKey) || readConversationDraft(currentUserId, source)
    const next: ChatDestination = { kind: "thread", threadId }
    if (latest) {
      const unchanged = sentDraft && JSON.stringify(latest) === JSON.stringify(sentDraft)
      const preserved = unchanged ? { ...latest, body: "", replyThreadId: undefined } : latest
      saveConversationDraft(next, preserved)
      if (sourceKey !== chatDestinationKey(next)) {
        conversationDraftsRef.current.delete(sourceKey)
        removeConversationDraft(currentUserId, source)
      }
      if (stillActive) applyDraft(preserved)
    }
    if (stillActive) {
      destinationRef.current = next
      setDestination(next)
      writeChatDestination(currentUserId, next)
      setDraftStatus("Sent")
    }
    return stillActive
  }

  function clearCurrentDraft() {
    const empty = { ...currentDraftRef.current, body: "" }
    saveConversationDraft(destinationRef.current, empty)
    applyDraft(empty)
    setDraftStatus("Draft cleared")
  }

  function selectThread(thread: ChatThreadRecord) {
    setConversationOpen(true)
    setSearchOpen(false)
    setOpenChatMenu(null)
    switchConversation({ kind: "thread", threadId: chatThreadKey(thread) })
  }

  async function refresh() {
    try {
      const response = await api<{ items: ChatThreadRecord[] }>("/api/chat")
      setThreads(response.items)
      setInboxError("")
    } catch (error) {
      setInboxError(error instanceof Error ? error.message : "Couldn't load conversations.")
    } finally { setInboxLoading(false) }
  }

  useEffect(() => { void refresh() }, [])

  useEffect(() => {
    if (!currentUserId) return
    conversationDraftsRef.current.clear()
    const remembered = readChatDestination(currentUserId)
    const legacy = remembered ? null : readChatDraft()
    const next: ChatDestination = remembered || (legacy?.replyThreadId ? { kind: "thread", threadId: legacy.replyThreadId } : { kind: "personal" })
    const draft = readConversationDraft(currentUserId, next) || legacy
    destinationRef.current = next
    setDestination(next)
    if (draft) {
      applyDraft(draft)
      conversationDraftsRef.current.set(chatDestinationKey(next), draft)
    }
    draftsReadyRef.current = true
  }, [currentUserId])

  useEffect(() => {
    if (!currentUserId || !draftsReadyRef.current) return
    const draft = { body, title, intent, channel, replyThreadId }
    const timeout = window.setTimeout(() => {
      saveConversationDraft(destination, draft)
      writeChatDestination(currentUserId, destination)
      setDraftStatus((current) => !current || current === "Draft saved" ? (body.trim() ? "Draft saved" : "") : current)
    }, 500)
    return () => window.clearTimeout(timeout)
  }, [body, channel, currentUserId, destination, intent, replyThreadId, title])

  useEffect(() => {
    function persistCurrentDraft() {
      if (!draftsReadyRef.current) return
      writeConversationDraft(currentUserId, destinationRef.current, currentDraftRef.current)
      writeChatDestination(currentUserId, destinationRef.current)
    }
    window.addEventListener("pagehide", persistCurrentDraft)
    return () => {
      window.removeEventListener("pagehide", persistCurrentDraft)
      persistCurrentDraft()
    }
  }, [currentUserId])

  async function send() {
    if (chatActionById.get("send")?.disabled || sendPendingRef.current) return
    sendPendingRef.current = true
    const sendingDestination = destinationRef.current
    const sendingDraft = { ...currentDraftRef.current }
    setChatAction("send")
    try {
      const payload = { ...buildChatDraftPayload({ body, channel, title, intent }), ...messageDestination }
      const sent = await api<{ threadId: string }>("/api/chat", { method: "POST", body: JSON.stringify(payload) })
      if (!mountedRef.current) return
      finishMessageSend(sendingDestination, sendingDraft, sent.threadId)
      if (typingStopRef.current) clearTimeout(typingStopRef.current)
      sendTypingSignal(false)
      await refresh()
      await refreshMessages(sent.threadId)
    } catch (error) {
      if (mountedRef.current && chatDestinationKey(destinationRef.current) === chatDestinationKey(sendingDestination)) setDraftStatus(error instanceof Error ? error.message : "Unable to send this message.")
    } finally {
      sendPendingRef.current = false
      if (mountedRef.current) setChatAction(null)
    }
  }

  function exportConversation() {
    if (!messages.length) {
      setDraftStatus("Nothing to export yet — this conversation has no messages.")
      return
    }
    const label = activeDmTarget ? `DM with ${activeDmTarget.name}` : activeGroup ? activeGroup.name : "LEARN conversation"
    const lines = [
      `${label}`,
      `Exported ${new Date().toISOString()}`,
      "",
      ...messages.map((message) => {
        const who = message.user_id === currentUserId ? "You" : (activeDmTarget?.name || "Them")
        const attachmentNote = message.metadata?.attachment ? ` [attachment: ${message.metadata.attachment.filename}]` : ""
        return `[${formatDate(message.created_at)}] ${who}: ${message.body}${attachmentNote}`
      }),
    ]
    const blob = new Blob([lines.join("\n")], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.txt`
    link.click()
    URL.revokeObjectURL(url)
    setDraftStatus("Conversation downloaded")
  }

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [pendingAttachKind, setPendingAttachKind] = useState<"document" | "photo">("document")

  function openAttachPicker(kind: "document" | "photo") {
    setPendingAttachKind(kind)
    setOpenChatMenu(null)
    fileInputRef.current?.click()
  }

  async function sendAttachment(file: File): Promise<boolean> {
    if (sendPendingRef.current) return false
    sendPendingRef.current = true
    const sendingDestination = destinationRef.current
    setChatAction("send")
    setDraftStatus("Uploading…")
    try {
      const form = new FormData()
      form.append("file", file)
      form.append("source", "chat")
      const uploadResponse = await api<{ file: { id: string; filename: string; content_type: string } }>("/api/files", { method: "POST", body: form })
      const attachment = { fileId: uploadResponse.file.id, filename: uploadResponse.file.filename, contentType: uploadResponse.file.content_type }
      const payload = {
        body: attachment.contentType.startsWith("audio/") ? "Voice message" : attachment.contentType.startsWith("image/") ? "Shared a picture" : `Shared a file: ${attachment.filename}`,
        title,
        ...messageDestination,
        metadata: { attachment },
      }
      const sent = await api<{ threadId: string }>("/api/chat", { method: "POST", body: JSON.stringify(payload) })
      if (!mountedRef.current) return false
      finishMessageSend(sendingDestination, null, sent.threadId)
      await refresh().catch(() => setDraftStatus("Sent. Reopen the conversation if the history has not refreshed."))
      await refreshMessages(sent.threadId)
      return true
    } catch (error) {
      if (mountedRef.current && chatDestinationKey(destinationRef.current) === chatDestinationKey(sendingDestination)) setDraftStatus(error instanceof Error ? error.message : "Unable to send that attachment.")
      return false
    } finally {
      sendPendingRef.current = false
      if (mountedRef.current) setChatAction(null)
    }
  }

  async function reactToMessage(messageId: string, emoji: string, active: boolean) {
    if (reactionPending) return
    setReactionPending(true)
    try {
      await api("/api/chat/reactions", { method: "POST", body: JSON.stringify({ messageId, emoji, active }) })
      await refreshMessages(activeThreadId)
    } catch (error) { setDraftStatus(error instanceof Error ? error.message : "Could not save reaction.") }
    finally { setReactionPending(false) }
  }

  function replyToThread(thread: ChatThreadRecord) {
    selectThread(thread)
    const parsed = parseThreadTitle(thread.title)
    const targetId = chatThreadKey(thread)
    setChannel(parsed.channel || "#general")
    setTitle(`Re: ${parsed.title}`)
    setIntent("question")
    setReplyThreadId(targetId || undefined)
    setBody((current) => current.trim() ? current : `Replying to "${parsed.title}": `)
    setDraftStatus("Reply draft ready")
  }

  function chatThreadKey(thread: ChatThreadRecord) {
    return String(thread.id || thread.threadId || thread.thread_id || thread.title || "").trim()
  }

  async function runThreadAction(thread: ChatThreadRecord, action: ChatThreadActionId) {
    const targetId = chatThreadKey(thread)
    if (!targetId) {
      setDraftStatus("Thread action needs a saved thread.")
      return
    }
    if (threadAction) return
    if (action === "reply") {
      setThreadAction({ action, threadId: targetId })
      replyToThread(thread)
      setThreadAction(null)
      setOpenChatMenu(null)
      return
    }
    const parsed = parseThreadTitle(thread.title)
    setThreadAction({ action, threadId: targetId })
    try {
      await api("/api/social/actions", {
        method: "POST",
        body: JSON.stringify({
          targetType: "chat_message",
          targetId,
          actionType: action === "save" ? "bookmark" : "helpful",
          body: parsed.title,
          metadata: { channel: parsed.channel, threadTitle: parsed.title },
        }),
      })
      setThreads((currentThreads) => currentThreads.map((currentThread) => {
        if (chatThreadKey(currentThread) !== targetId) return currentThread
        return {
          ...currentThread,
          helpful: action === "helpful" || Boolean(currentThread.helpful),
          saved: action === "save" || Boolean(currentThread.saved),
        }
      }))
      setDraftStatus(action === "save" ? "Thread saved" : "Marked helpful")
    } catch (error) {
      setDraftStatus(error instanceof Error ? error.message : "Unable to save this thread action.")
    } finally {
      setThreadAction(null)
      setOpenChatMenu(null)
    }
  }

  function insertMention() {
    setBody((current) => current.endsWith(" ") || !current ? `${current}@` : `${current} @`)
    setOpenChatMenu(null)
    messageInputRef.current?.focus()
  }

  const conversationName = activeDmTarget?.name || activeThread?.dm_peer_name || activeGroup?.name || (activeThread ? activeThreadParsed.title : title)
  const hasConversation = destination.kind !== "personal" || conversationOpen
  const matchingMessages = messages.filter((message) => !messageQuery.trim() || message.body.toLocaleLowerCase().includes(messageQuery.trim().toLocaleLowerCase()) || message.metadata?.attachment?.filename.toLocaleLowerCase().includes(messageQuery.trim().toLocaleLowerCase()))
  const recipientNeedle = recipientQuery.trim().toLocaleLowerCase()
  const matchingConnections = connections.filter((connection) => `${connection.name} ${connection.username}`.toLocaleLowerCase().includes(recipientNeedle))
  const matchingGroups = groups.filter((group) => group.name.toLocaleLowerCase().includes(recipientNeedle))

  return (
    <section className={chatStyles.workspace} data-conversation-open={conversationOpen} aria-label="Messages workspace" data-presence={options.collaborationPresence}>
      <aside className={chatStyles.inbox} aria-label="Conversations">
        <header className={chatStyles.inboxHeading}>
          <h3>Messages</h3>
          <button type="button" className={chatStyles.newButton} onClick={openRecipients} aria-label="Start a new message" title="New message"><Plus size={19} /></button>
        </header>
        <div className={chatStyles.stories}><ChatStories currentUserId={currentUserId} groups={myGroups} /></div>
        <label className={chatStyles.search}><Search size={16} /><input aria-label="Search messages" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search conversations" />{query ? <button type="button" aria-label="Clear conversation search" onClick={() => setQuery("")}><X size={14} /></button> : null}</label>
        <div className={chatStyles.filters} role="group" aria-label="Inbox filters">
          {(["all", "people", "groups", "saved"] as const).map((kind) => <button type="button" key={kind} aria-pressed={inboxKind === kind} onClick={() => { setInboxKind(kind) }}>{kind === "all" ? "All" : kind === "people" ? "People" : kind === "groups" ? "Groups" : "Saved"}</button>)}
        </div>
        <div className={chatStyles.threadList}>
          {inboxLoading ? <div className={chatStyles.skeleton} role="status" aria-label="Loading conversations"><span /><span /><span /></div> : null}
          {inboxError ? <div className={chatStyles.error} role="alert"><p>{inboxError}</p><button type="button" onClick={() => { setInboxLoading(true); void refresh() }}><RotateCcw size={14} />Retry</button></div> : null}
          {visibleThreads.map((thread) => {
            const parsed = parseThreadTitle(thread.title)
            const threadId = chatThreadKey(thread)
            const name = thread.dm_peer_name || groups.find((group) => group.id === thread.group_id)?.name || parsed.title
            const selected = threadId === activeThreadId
            const actions = buildChatThreadActions({ busyAction: threadAction?.threadId === threadId ? threadAction.action : null, helpful: Boolean(thread.helpful), saved: Boolean(thread.saved), hasThread: Boolean(threadId) })
            return <div key={threadId} className={chatStyles.thread} data-selected={selected}>
              <button type="button" className={chatStyles.threadSelect} aria-pressed={selected} onClick={() => selectThread(thread)} aria-label={`Open conversation with ${name}`}>
                <ConversationAvatar name={name} group={Boolean(thread.group_id)} />
                <span className={chatStyles.threadCopy}><span className={chatStyles.threadTitle}><strong>{name}</strong>{thread.updated_at || thread.updatedAt ? <time dateTime={thread.updated_at || thread.updatedAt}>{chatRecency(thread.updated_at || thread.updatedAt || "")}</time> : null}</span><span className={chatStyles.threadPreview}>{String(thread.last_message || thread.lastMessage || "No messages yet").replace(/^\[[^\]]+\]\s*/, "")}</span></span>
                {thread.saved ? <Bookmark size={12} className={chatStyles.savedMark} aria-label="Saved" /> : null}
              </button>
              <div className={chatStyles.threadMenu}><ChatMenu compact align="right" icon={MoreHorizontal} label={`Actions for ${name}`} menuId={`threadActions:${threadId}`} openMenu={openChatMenu} setOpenMenu={setOpenChatMenu}><ChatMenuSection title="Conversation">{actions.map((action) => <ChatMenuAction key={action.id} label={action.busy ? action.busyLabel : action.label} active={action.active} disabled={action.disabled} onClick={() => void runThreadAction(thread, action.id)} />)}</ChatMenuSection></ChatMenu></div>
            </div>
          })}
          {!inboxLoading && !inboxError && !visibleThreads.length ? <div className={chatStyles.listEmpty}><MessageSquare size={28} /><strong>{query || inboxKind !== "all" ? "No matches" : "Your conversations live here"}</strong>{query || inboxKind !== "all" ? <button type="button" onClick={() => { setQuery(""); setInboxKind("all") }}>Clear filters</button> : <button type="button" onClick={openRecipients}>Start a conversation</button>}</div> : null}
        </div>
      </aside>
      <div className={chatStyles.conversation}>
        {!hasConversation ? <div className={chatStyles.welcome}><div className={chatStyles.welcomeArt} aria-hidden="true"><MessageSquare /><span>✦</span><Smile /></div><h3>A little conversation.<br />A new perspective.</h3><p>Pick a chat or say hello.</p><button type="button" onClick={openRecipients}>New message <Plus size={16} /></button></div> : <>
        <header className={chatStyles.conversationHeader}>
          <button type="button" className={`${chatStyles.iconButton} ${chatStyles.back}`} aria-label="Back to conversations" onClick={() => { setConversationOpen(false); setOpenChatMenu(null) }}><ArrowLeft size={18} /></button>
          <ConversationAvatar name={conversationName} group={Boolean(groupId)} />
          <div className={chatStyles.identity}><h3>{conversationName}</h3><span>{remoteTyping ? "Typing…" : activeDmTarget || dmTargetUserId ? "Direct message" : activeGroup ? (activeGroup.member_count === undefined ? "Group" : `${activeGroup.member_count} members`) : "Conversation"}{groupChannelId ? <i data-live={socketStatus === "open"} title={socketStatus === "open" ? "Connected" : "Connecting"} /> : null}</span></div>
          <div className={chatStyles.headerActions}>
            <button type="button" className={chatStyles.iconButton} aria-label="Search this conversation" aria-pressed={searchOpen} onClick={() => setSearchOpen(!searchOpen)}><Search size={17} /></button>
            <button type="button" className={chatStyles.iconButton} aria-label="Start voice call" disabled={!groupChannelId || Boolean(activeCall)} onClick={() => void startCall(false)}><Phone size={17} /></button>
            <ChatMenu compact align="right" icon={MoreHorizontal} label="Conversation options" menuId="chatMore" openMenu={openChatMenu} setOpenMenu={setOpenChatMenu}>
              <ChatMenuSection title="Conversation">
                <ChatMenuAction icon={Video} label="Video call" disabled={!groupChannelId || Boolean(activeCall)} onClick={() => { void startCall(true); setOpenChatMenu(null) }} />
                <ChatMenuAction icon={Download} label="Download conversation" disabled={!messages.length} onClick={() => { exportConversation(); setOpenChatMenu(null) }} />
                <ChatMenuAction icon={Gamepad2} label="Start a live game" onClick={() => { setLiveGameOpen(true); setOpenChatMenu(null) }} />
                <ChatMenuAction icon={Users} label="New conversation" onClick={() => { openRecipients(); setOpenChatMenu(null) }} />
              </ChatMenuSection>
            </ChatMenu>
          </div>
        </header>
        {searchOpen ? <div className={chatStyles.messageSearch}><label className={chatStyles.search}><Search size={16} /><input ref={messageSearchRef} aria-label="Find in conversation" placeholder="Find a message" value={messageQuery} onChange={(event) => setMessageQuery(event.target.value)} /></label><span role="status">{messageQuery ? `${matchingMessages.length} found` : ""}</span><button type="button" className={chatStyles.iconButton} aria-label="Close message search" onClick={() => setSearchOpen(false)}><X size={16} /></button></div> : null}
        <div className={chatStyles.messageStage}>
          <div ref={messageListRef} className={chatStyles.messages} role="log" aria-label="Conversation messages" aria-live="polite" onScroll={(event) => { const element = event.currentTarget; setAwayFromLatest(element.scrollHeight - element.clientHeight - element.scrollTop > 100) }}>
            {messagesLoading ? <div className={chatStyles.loading} role="status"><LoaderCircle size={20} className="animate-spin" /><span>Loading messages</span></div> : null}
            {messagesError ? <div className={chatStyles.error} role="alert"><p>{messagesError}</p><button type="button" onClick={() => { setMessagesLoading(true); void refreshMessages(activeThreadId) }}><RotateCcw size={14} />Retry</button></div> : null}
            {matchingMessages.map((message, index) => {
              const invite = parseLiveGameInvite(message.metadata)
              const result = parseLiveGameResult(message.metadata)
              const mine = message.user_id === currentUserId
              const attachment = message.metadata?.attachment
              const reactions = messageReactions[message.id] || []
              const previous = matchingMessages[index - 1]
              const date = new Date(message.created_at).toLocaleDateString([], { month: "short", day: "numeric" })
              const showDate = !previous || new Date(previous.created_at).toDateString() !== new Date(message.created_at).toDateString()
              return <div key={message.id} className={chatStyles.messageRow} data-mine={mine}>
                {showDate ? <div className={chatStyles.dateDivider}><span>{date}</span></div> : null}
                {invite ? <LiveGameCard invite={invite} createdAt={message.created_at} alignRight={mine} /> : result ? <LiveGameResultCard result={result} createdAt={message.created_at} threadId={activeThreadId} alignRight={mine} /> : <div className={chatStyles.bubble}>
                  {attachment ? attachment.contentType.startsWith("image/") ? <a href={`/api/files/${attachment.fileId}/download`} target="_blank" rel="noreferrer"><img src={`/api/files/${attachment.fileId}/download`} alt={attachment.filename} loading="lazy" decoding="async" /></a> : attachment.contentType.startsWith("audio/") ? <audio controls preload="metadata" src={`/api/files/${attachment.fileId}/download`} aria-label="Voice message" /> : attachment.contentType.startsWith("video/") ? <video controls preload="metadata" src={`/api/files/${attachment.fileId}/download`} aria-label="Shared video" /> : <a className={chatStyles.attachment} href={`/api/files/${attachment.fileId}/download`} target="_blank" rel="noreferrer"><Paperclip size={16} />{attachment.filename}<Download size={14} /></a> : null}
                  <p>{message.body.replace(/^\[[^\]]+\]\s*/, "")}</p>
                  <div className={chatStyles.bubbleMeta}><time dateTime={message.created_at}>{new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time><button type="button" aria-label={`React to message ${index + 1}`} aria-expanded={reactionMessageId === message.id} onClick={() => setReactionMessageId(reactionMessageId === message.id ? "" : message.id)}><Smile size={13} /></button></div>
                </div>}
                {reactions.length || reactionMessageId === message.id ? <div className={chatStyles.reactions} aria-label={`Reactions to message ${index + 1}`}>{(reactionMessageId === message.id ? CHAT_REACTION_EMOJI : reactions.map((entry) => entry.emoji)).map((emoji) => { const entry = reactions.find((item) => item.emoji === emoji); return <button type="button" key={emoji} disabled={reactionPending} aria-pressed={Boolean(entry?.mine)} aria-label={`${entry?.mine ? "Remove" : "Add"} ${emoji} reaction`} onClick={() => { void reactToMessage(message.id, emoji, !entry?.mine); setReactionMessageId("") }}>{emoji}{entry?.count ? ` ${entry.count}` : ""}</button> })}</div> : null}
              </div>
            })}
            {!messagesLoading && !messagesError && !matchingMessages.length ? <div className={chatStyles.conversationEmpty}><MessageSquare size={28} /><strong>{messageQuery ? "No matching messages" : `Say hello${activeDmTarget ? ` to ${activeDmTarget.name.split(" ")[0]}` : ""}.`}</strong><p>{messageQuery ? "Try another word." : "This is the start of your conversation."}</p></div> : null}
          </div>
          {awayFromLatest && !messageQuery ? <button type="button" className={chatStyles.latest} onClick={scrollToLatest} aria-label="Jump to latest message"><ArrowDown size={15} />Latest</button> : null}
        </div>
        {mediaOpen ? <div className={chatStyles.mediaDrawer}><header><strong>Make it yours</strong><button type="button" className={chatStyles.iconButton} aria-label="Close media tools" onClick={() => setMediaOpen(false)}><X size={16} /></button></header><div key={JSON.stringify(messageDestination)}><ChatVoiceMessage onSend={sendAttachment} disabled={Boolean(activeCall)} /><ChatMediaComposer onSend={sendAttachment} onEmoji={(emoji) => { setBody((current) => `${current}${emoji}`); messageInputRef.current?.focus() }} /></div></div> : null}
        {liveGameOpen ? <div className={chatStyles.mediaDrawer}><LiveGameLauncher threadId={messageDestination.threadId || ""} groupId={messageDestination.groupId} targetUserId={messageDestination.targetUserId} onClose={() => setLiveGameOpen(false)} onLaunched={async (code, threadId) => { if (!mountedRef.current) return; setLiveGameOpen(false); if (threadId) finishMessageSend(destination, null, threadId); setDraftStatus(`Live game ${code} posted`); await refresh(); await refreshMessages(threadId || activeThreadId) }} /></div> : null}
        <div className={chatStyles.composer}>
          <input ref={fileInputRef} type="file" aria-label="Attach a file" accept={pendingAttachKind === "photo" ? "image/*" : undefined} className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void sendAttachment(file); event.target.value = "" }} />
          <textarea ref={messageInputRef} aria-label="Message" rows={1} value={body} onChange={(event) => { setBody(event.target.value); setDraftStatus(""); handleDraftActivity(event.target.value); event.target.style.height = "auto"; event.target.style.height = `${Math.min(event.target.scrollHeight, 140)}px` }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && window.matchMedia("(pointer: fine)").matches) { event.preventDefault(); void send() } }} placeholder="Message…" />
          <div className={chatStyles.composerBar}><div className={chatStyles.composerActions}>
            <ChatMenu compact icon={Plus} label="Attach" menuId="attach" openMenu={openChatMenu} setOpenMenu={setOpenChatMenu}><ChatMenuSection title="Add to your message"><ChatMenuAction icon={Paperclip} label="File" onClick={() => openAttachPicker("document")} /><ChatMenuAction icon={ImageIcon} label="Photo" onClick={() => openAttachPicker("photo")} /><ChatMenuAction icon={Mic} label="Voice message" onClick={() => { setMediaOpen(true); setOpenChatMenu(null) }} /><ChatMenuAction icon={Gamepad2} label="Live game" onClick={() => { setLiveGameOpen(true); setOpenChatMenu(null) }} /></ChatMenuSection></ChatMenu>
            <button type="button" className={chatStyles.iconButton} aria-label="Emoji and media" aria-expanded={mediaOpen} onClick={() => setMediaOpen(!mediaOpen)}><Smile size={19} /></button>
            <ChatMenu compact icon={Sparkles} label="Writing tools" menuId="compose" openMenu={openChatMenu} setOpenMenu={setOpenChatMenu}><ChatMenuSection title="Start with">{quickPrompts.map((prompt) => <ChatMenuAction key={prompt.id} label={prompt.label} onClick={() => { applyQuickPrompt(prompt); setOpenChatMenu(null); messageInputRef.current?.focus() }} />)}</ChatMenuSection><ChatMenuSection title="Draft"><ChatMenuAction icon={AtSign} label="Mention" onClick={() => insertMention()} /><ChatMenuAction icon={RotateCcw} label="Clear draft" disabled={!body} onClick={() => { clearCurrentDraft(); setOpenChatMenu(null) }} /></ChatMenuSection></ChatMenu>
            <VoiceInput label="Dictate message" prompt={conversationName} onTranscript={(text) => { setBody((current) => current && !/\s$/.test(current) ? `${current} ${text}` : `${current}${text}`); handleDraftActivity(text) }} />
          </div><button type="button" className={chatStyles.sendButton} aria-label={chatAction === "send" ? "Sending message" : "Send message"} disabled={chatActionById.get("send")?.disabled} onClick={() => void send()}>{chatAction === "send" ? <LoaderCircle size={17} className="animate-spin" /> : <Send size={17} />}</button></div>
        </div>
        {draftStatus && draftStatus !== "Draft saved" ? <p className={chatStyles.draftStatus} role="status">{draftStatus}</p> : null}
        </>}
      </div>
      <dialog ref={recipientDialogRef} className={chatStyles.recipientDialog} aria-label="New conversation" onCancel={(event) => { if (recipientBusy) event.preventDefault(); else closeRecipients() }} onClose={() => setRecipientsOpen(false)}>
        <header><h3>New message</h3><button type="button" className={chatStyles.iconButton} aria-label="Close new conversation" disabled={recipientBusy} onClick={closeRecipients}><X size={18} /></button></header>
        <label className={chatStyles.search}><Search size={16} /><input ref={recipientSearchRef} aria-label="Find people or groups" placeholder="People, groups, or @username" value={recipientQuery} onChange={(event) => setRecipientQuery(event.target.value)} /></label>
        {recipientError ? <div role="alert" className={chatStyles.error}><p>{recipientError}</p><button type="button" onClick={() => { setRecipientError(""); void refreshConnections(); void refreshGroups() }}>Retry</button></div> : null}
        <div className={chatStyles.recipientList}>
          {matchingConnections.length ? <h4>People</h4> : null}
          {matchingConnections.map((connection) => <button type="button" className={chatStyles.recipient} key={connection.target_user_id} disabled={recipientBusy} onClick={() => startDirectMessage(connection.target_user_id)}><ConversationAvatar name={connection.name} /><span><strong>{connection.name}</strong><small>@{connection.username}</small></span><MessageSquare size={16} /></button>)}
          {!connections.length && !recipientError ? <p className={chatStyles.noResults}>Your connections appear here.</p> : null}
          {/^@[a-zA-Z0-9_-]+$/.test(recipientQuery.trim()) ? <a href={`/profile/${encodeURIComponent(recipientQuery.trim().slice(1))}`} className={chatStyles.findPeople}><UserRound size={18} />Open {recipientQuery.trim()} profile</a> : null}
          <div className={chatStyles.recipientGroupHeading}><h4>Groups</h4><button type="button" className={chatStyles.iconButton} aria-label="Create group" aria-expanded={newGroupOpen} onClick={() => setNewGroupOpen(!newGroupOpen)}><Plus size={16} /></button></div>
          {newGroupOpen ? <form className={chatStyles.groupForm} onSubmit={(event) => { event.preventDefault(); void createGroup(groupName) }}><input autoFocus aria-label="Group name" placeholder="Group name" maxLength={120} value={groupName} onChange={(event) => setGroupName(event.target.value)} /><button type="submit" disabled={!groupName.trim() || recipientBusy}>{recipientBusy ? "Creating…" : "Create"}</button></form> : null}
          {matchingGroups.map((group) => <button type="button" className={chatStyles.recipient} key={group.id} disabled={recipientBusy} onClick={() => group.is_member ? switchToGroup(group.id) : void joinGroupById(group.id)}><ConversationAvatar name={group.name} group /><span><strong>{group.name}</strong><small>{group.member_count === undefined ? "Group" : `${group.member_count} members`}</small></span>{!group.is_member ? <em>Join</em> : <MessageSquare size={16} />}</button>)}
          {recipientQuery && !matchingConnections.length && !matchingGroups.length ? <p className={chatStyles.noResults}>No matches</p> : null}
        </div>
      </dialog>
      {activeCall ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4">
          <div className="relative flex w-full max-w-lg flex-col items-center overflow-hidden rounded-2xl border border-border bg-popover p-6 text-center text-popover-foreground shadow-2xl">
            {activeCall.video && activeCall.status === "connected" ? (
              <div className="relative mb-4 aspect-video w-full overflow-hidden rounded-xl bg-black">
                <video ref={remoteVideoRef} autoPlay playsInline className="h-full w-full object-cover" />
                <video ref={localVideoRef} autoPlay playsInline muted className="absolute bottom-3 right-3 h-24 w-32 rounded-lg border border-white/30 object-cover" />
              </div>
            ) : (
              <div className="mb-2 grid h-20 w-20 place-items-center rounded-full bg-secondary text-2xl font-black text-muted-foreground ring-1 ring-border">
                {(activeDmTarget?.name || activeGroup?.name)?.slice(0, 2).toUpperCase() || "??"}
              </div>
            )}
            <audio ref={remoteAudioRef} autoPlay className="hidden" />

            <h3 className="mt-2 text-2xl font-semibold">{activeDmTarget?.name || activeGroup?.name || "Call"}</h3>
            <p className="mt-1 text-muted-foreground">
              {activeCall.status === "outgoing" && (activeCall.video ? "Calling with video…" : "Calling…")}
              {activeCall.status === "incoming" && (activeCall.video ? "Incoming video call…" : "Incoming voice call…")}
              {activeCall.status === "connected" && formatCallDuration(callElapsed)}
            </p>

            <p role="status" className="mt-2 text-xs text-muted-foreground">{activeCall.status === "connected" ? callConnectionStatus : "One-to-one call"}{activeCall.status === "connected" && !relayAvailable ? " · Direct connection" : ""}</p>
            {activeCall.status === "incoming" ? (
              <div className="mt-6 flex items-center gap-4">
                <button onClick={declineIncomingCall} className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-lg transition hover:opacity-90" type="button" aria-label="Decline call">
                  <PhoneOff className="h-6 w-6" />
                </button>
                <button onClick={acceptIncomingCall} className="flex h-14 w-14 items-center justify-center rounded-full bg-green-600 text-white shadow-lg transition hover:opacity-90" type="button" aria-label="Accept call">
                  {activeCall.video ? <Video className="h-6 w-6" /> : <Phone className="h-6 w-6" />}
                </button>
              </div>
            ) : (
              <div className="mt-6 flex items-center gap-3">
                <button onClick={toggleCallMute} className={`flex h-12 w-12 items-center justify-center rounded-full transition ${activeCall.muted ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground hover:bg-accent"}`} type="button" aria-label={activeCall.muted ? "Unmute microphone" : "Mute microphone"}>
                  {activeCall.muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </button>
                {activeCall.video ? (
                  <button onClick={toggleCallCamera} className={`flex h-12 w-12 items-center justify-center rounded-full transition ${activeCall.cameraOff ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground hover:bg-accent"}`} type="button" aria-label={activeCall.cameraOff ? "Turn camera on" : "Turn camera off"}>
                    {activeCall.cameraOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
                  </button>
                ) : null}
                {activeCall.status === "connected" ? (
                  <button onClick={toggleCallRecording} className={`flex h-12 w-12 items-center justify-center rounded-full transition ${isRecordingCall ? "bg-destructive text-destructive-foreground" : "bg-secondary text-foreground hover:bg-accent"}`} type="button" aria-label={isRecordingCall ? "Stop recording" : "Start recording"}>
                    <Circle className={`h-5 w-5 ${isRecordingCall ? "animate-pulse fill-current" : ""}`} />
                  </button>
                ) : null}
                <button onClick={() => endCall(true, "Call ended.")} className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-lg transition hover:opacity-90" type="button" aria-label="End call">
                  <PhoneOff className="h-6 w-6" />
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  )
}

function readChatDraft(): ChatDraft | null {
  if (typeof window === "undefined") return null
  try { return parseStoredChatDraft(window.localStorage.getItem(CHAT_DRAFT_KEY)) }
  catch { return null }
}

function chatDestinationKey(destination: ChatDestination) {
  if (destination.kind === "thread") return `thread:${destination.threadId}`
  if (destination.kind === "dm") return `dm:${destination.targetUserId}`
  if (destination.kind === "group") return `group:${destination.groupId}`
  return "personal"
}

function conversationDraftKey(userId: string, destination: ChatDestination) {
  return `${CHAT_DRAFT_KEY}:${encodeURIComponent(userId)}:${encodeURIComponent(chatDestinationKey(destination))}`
}

function readConversationDraft(userId: string, destination: ChatDestination) {
  try { return parseStoredChatDraft(window.localStorage.getItem(conversationDraftKey(userId, destination))) }
  catch { return null }
}

function writeConversationDraft(userId: string, destination: ChatDestination, draft: ChatDraft) {
  if (!userId) return
  try { window.localStorage.setItem(conversationDraftKey(userId, destination), serializeChatDraft(draft)) }
  catch { /* The in-memory draft stays available when local storage is full. */ }
}

function removeConversationDraft(userId: string, destination: ChatDestination) {
  try { window.localStorage.removeItem(conversationDraftKey(userId, destination)) }
  catch { /* Storage access can be disabled by browser privacy settings. */ }
}

function writeChatDestination(userId: string, destination: ChatDestination) {
  if (!userId) return
  try { window.localStorage.setItem(chatDestinationStorageKey(userId), JSON.stringify(destination)) }
  catch { /* Draft navigation remains available without browser storage. */ }
}

function readChatDestination(userId: string): ChatDestination | null {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(chatDestinationStorageKey(userId)) || "null")
    if (!value || typeof value !== "object" || !("kind" in value)) return null
    if (value.kind === "personal") return { kind: "personal" }
    if (value.kind === "thread" && "threadId" in value && typeof value.threadId === "string") return { kind: "thread", threadId: value.threadId }
    if (value.kind === "dm" && "targetUserId" in value && typeof value.targetUserId === "string") return { kind: "dm", targetUserId: value.targetUserId }
    if (value.kind === "group" && "groupId" in value && typeof value.groupId === "string") return { kind: "group", groupId: value.groupId }
    return null
  } catch { return null }
}

function chatRecency(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString([], { month: "short", day: "numeric" })
}

function ConversationAvatar({ name, group = false }: { name: string; group?: boolean }) {
  const tone = [...name].reduce((total, letter) => total + letter.charCodeAt(0), 0) % 4
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()
  return <span className={chatStyles.avatar} data-tone={tone} aria-hidden="true">{group ? <Users size={18} /> : initials || <UserRound size={18} />}</span>
}

function ChatMenu({
  align = "left",
  children,
  compact,
  icon: Icon,
  label,
  menuId,
  openMenu,
  setOpenMenu,
}: ViewMenuProps<ChatMenuId>) {
  const anchor = useRef<HTMLButtonElement>(null)
  const open = openMenu === menuId
  return (
    <div className="relative">
      <button
        ref={anchor}
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={() => setOpenMenu(open ? null : menuId)}
        className={`inline-flex h-9 items-center gap-2 rounded-md border border-border bg-secondary text-sm font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground ${compact ? "px-2" : "px-3"}`}
        type="button"
      >
        <Icon className="h-4 w-4" />
        <span className={compact ? "sr-only" : undefined}>{label}</span>
      </button>
      <Popover open={open} anchor={anchor} onClose={() => setOpenMenu(null)} label={label} placement={align === "right" ? "bottom-end" : "bottom-start"} width={288}>{children}</Popover>
    </div>
  )
}

function ChatMenuSection({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <div className="space-y-1 rounded-md p-1">
      <p className="px-2 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{title}</p>
      {children}
    </div>
  )
}

function ChatMenuAction({
  active,
  danger,
  disabled,
  icon: Icon,
  label,
  meta,
  onClick,
}: {
  active?: boolean
  danger?: boolean
  disabled?: boolean
  icon?: React.ComponentType<{ className?: string }>
  label: string
  meta?: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={meta}
      className={`flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50 ${active ? "bg-primary/10 text-primary" : danger ? "text-destructive" : "text-popover-foreground"}`}
      type="button"
    >
      {Icon ? <Icon className="mt-0.5 h-4 w-4 shrink-0" /> : <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-current opacity-50" />}
      <span className="min-w-0">
        <span className="block font-semibold">{label}</span>
        {meta ? <span className="sr-only">{meta}</span> : null}
      </span>
    </button>
  )
}
