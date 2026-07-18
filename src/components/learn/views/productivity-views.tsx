"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type React from "react"
import { AtSign, Bell, CheckCircle2, Clock, Gamepad2, Languages, MessageSquare, Mic, MicOff, MoreHorizontal, Paperclip, Phone, PhoneOff, Plus, Reply, RotateCcw, Search, Send, SlidersHorizontal, Smile, Sparkles, Trophy, Users, Video, VideoOff, XCircle } from "lucide-react"
import type { WorkspaceOptions } from "../preferences"
import type { Quiz } from "../types"
import { api, formatDate } from "../api"
import { EmptyState, Panel } from "../ui"
import { buildGameRunActions, evaluateGameChoice, summarizeGameRun, type GameRunActionId } from "@/lib/practice-features"
import { CHAT_DRAFT_KEY, parseStoredChatDraft, serializeChatDraft, type ChatDraft } from "@/lib/chat-drafts"
import { dmChatChannelId, groupChatChannelId } from "@/lib/chat-channel"
import { buildChatComposerActions, buildChatComposerPlan, buildChatDraftPayload, buildChatInboxShortcuts, buildChatQuickPrompts, buildChatThreadActions, buildChatThreadStatus, filterChatThreads, parseThreadTitle, summarizeChatWorkspace, type ChatComposerActionId, type ChatInboxShortcut, type ChatIntent, type ChatQuickPrompt, type ChatThreadActionId, type ChatThreadFilter, type ChatThreadLike } from "@/lib/social-features"

const quizDetailCache = new Map<string, Quiz>()
type ChatMenuId = "attach" | "compose" | "chatMore" | "tools" | "filters" | `threadActions:${string}`
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
    setGameStatus(result.correct ? "Correct. Keep the pace." : "Missed. Review the fix, then continue.")
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
        <GameTimerControls disabled={Boolean(gameAction)} elapsedSeconds={elapsedSeconds} resetRun={resetRun} setTargetSeconds={setTargetSeconds} targetSeconds={targetSeconds} />
        <EmptyState title="No game questions yet" body="Add or open quizzes so question data can power flashcard sprint and matching games." />
      </Panel>
    )
  }

  return (
    <Panel className="p-4">
      <div className="mb-3 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-success/15 text-success">
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
          <GameStatusChip label="Time" value={formatDuration(elapsedSeconds)} />
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
      <div className="rounded-lg border border-primary/30 bg-primary p-5 text-primary-foreground">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] opacity-75">Prompt {index + 1}</p>
        <h3 className="mt-2 text-2xl font-semibold leading-tight">{current.question}</h3>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2">
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
      <span className="inline-flex h-8 items-center gap-1.5 rounded-md bg-muted px-2 text-xs font-semibold text-muted-foreground">
        <Clock className="h-3.5 w-3.5" />
        {formatDuration(elapsedSeconds)}
      </span>
      <span className={`inline-flex h-8 items-center rounded-md px-2 text-xs font-semibold ${elapsedSeconds > targetSeconds ? "bg-destructive text-destructive-foreground" : "bg-muted text-muted-foreground"}`}>
        target {formatDuration(targetSeconds)}
      </span>
      <details className="group relative">
        <summary className="inline-flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-md border border-border bg-secondary px-2.5 text-xs font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground [&::-webkit-details-marker]:hidden" title="Round setup">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Setup
        </summary>
        <div className="absolute left-0 top-9 z-40 grid w-48 gap-1 rounded-md border border-border bg-popover p-2 text-popover-foreground shadow-lg">
          <p className="px-1 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">Target time</p>
          {[60, 90, 180].map((seconds) => (
            <button
              key={seconds}
              onClick={() => setTargetSeconds(seconds)}
              disabled={disabled}
              className={`h-8 rounded-md px-2.5 text-left text-xs font-semibold ${targetSeconds === seconds ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground"}`}
              type="button"
            >
              {Math.round(seconds / 60)} min round
            </button>
          ))}
        </div>
      </details>
      <button onClick={resetRun} disabled={disabled} className="ml-auto flex h-8 items-center gap-1.5 rounded-md border border-border bg-secondary px-3 text-xs font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-60">
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
  const [reaction, setReaction] = useState("helpful")
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<ChatThreadFilter>("all")
  const [draftStatus, setDraftStatus] = useState("")
  const [replyThreadId, setReplyThreadId] = useState<string | undefined>(undefined)
  const [chatAction, setChatAction] = useState<ChatComposerActionId | null>(null)
  const [threadAction, setThreadAction] = useState<{ action: ChatThreadActionId; threadId: string } | null>(null)
  const [openChatMenu, setOpenChatMenu] = useState<ChatMenuId | null>(null)
  const [activeThreadKey, setActiveThreadKey] = useState("")
  const quickIntents = [
    { id: "update" as const, label: "Update", body: "Share progress, a note, or what changed." },
    { id: "question" as const, label: "Question", body: "Ask for help and invite replies." },
    { id: "win" as const, label: "Win", body: "Celebrate a milestone or review streak." },
  ]
  const threadFilters: Array<{ id: ChatThreadFilter; label: string }> = [
    { id: "all", label: "All" },
    { id: "questions", label: "Questions" },
    { id: "wins", label: "Wins" },
    { id: "saved", label: "Saved" },
  ]
  const activeIntent = quickIntents.find((item) => item.id === intent) || quickIntents[0]
  const chatSummary = useMemo(() => summarizeChatWorkspace(threads), [threads])
  const composerPlan = useMemo(() => buildChatComposerPlan(chatSummary, body), [body, chatSummary])
  const quickPrompts = useMemo(() => buildChatQuickPrompts({
    hasDraft: Boolean(body.trim()),
    questionCount: chatSummary.questions,
    savedCount: chatSummary.saved,
    threadCount: chatSummary.total,
    winCount: chatSummary.wins,
  }), [body, chatSummary.questions, chatSummary.saved, chatSummary.total, chatSummary.wins])
  const inboxShortcuts = useMemo(() => buildChatInboxShortcuts(chatSummary), [chatSummary])
  const chatActions = useMemo(() => buildChatComposerActions({
    busyAction: chatAction,
    hasDraft: Boolean(body.trim()),
    hasSuggestion: Boolean(composerPlan.nextAction),
  }), [body, chatAction, composerPlan.nextAction])
  const chatActionById = useMemo(() => new Map(chatActions.map((action) => [action.id, action])), [chatActions])
  const visibleThreads = useMemo(() => filterChatThreads(threads, { query, filter }), [filter, query, threads])
  const activeThread = useMemo(() => {
    if (!threads.length) return null
    return visibleThreads.find((thread) => chatThreadKey(thread) === activeThreadKey)
      || visibleThreads[0]
      || threads[0]
  }, [activeThreadKey, threads, visibleThreads])
  const activeThreadParsed = parseThreadTitle(activeThread?.title || `${channel} - ${title}`)
  const activeThreadBody = String(activeThread?.last_message || activeThread?.lastMessage || "No messages yet. Start with one clear question, resource, or win.")
  const activeThreadId = activeThread ? chatThreadKey(activeThread) : ""

  // --- Groups: which group this conversation posts into, and live/message state ---
  const [groups, setGroups] = useState<GroupRecord[]>([])
  const [groupId, setGroupId] = useState<string>("")
  const [messages, setMessages] = useState<ChatMessageRecord[]>([])
  const [remoteTyping, setRemoteTyping] = useState(false)
  const [currentUserId, setCurrentUserId] = useState("")
  const socketRef = useRef<WebSocket | null>(null)
  const typingClearRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const typingStopRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTypingSentRef = useRef(0)
  const myGroups = useMemo(() => groups.filter((group) => group.is_member), [groups])
  const activeGroup = useMemo(() => myGroups.find((group) => group.id === groupId) || myGroups[0] || null, [groupId, myGroups])

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
      // Groups are optional context for the composer; a failed fetch just means no group picker yet.
    }
  }

  // --- Direct messages: 1:1 with a connection, mutually exclusive with the group selection above ---
  const [connections, setConnections] = useState<ConnectionRecord[]>([])
  const [dmTargetUserId, setDmTargetUserId] = useState("")
  const activeDmTarget = useMemo(() => connections.find((c) => c.target_user_id === dmTargetUserId) || null, [connections, dmTargetUserId])

  useEffect(() => {
    api<{ items: ConnectionRecord[] }>("/api/connections").then((response) => setConnections(response.items)).catch(() => undefined)
  }, [])

  useEffect(() => {
    refreshGroups().catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!activeGroup && !dmTargetUserId && myGroups.length) setGroupId(myGroups[0].id)
  }, [activeGroup, myGroups, dmTargetUserId])

  async function createGroup(name: string) {
    if (!name.trim()) return
    try {
      const response = await api<{ item: GroupRecord }>("/api/groups", { method: "POST", body: JSON.stringify({ name: name.trim() }) })
      await refreshGroups()
      setGroupId(response.item.id)
      setDraftStatus(`Created "${name.trim()}"`)
    } catch (error) {
      setDraftStatus(error instanceof Error ? error.message : "Unable to create group.")
    }
  }

  async function joinGroupById(id: string) {
    try {
      await api(`/api/groups/${id}/join`, { method: "POST" })
      await refreshGroups()
      setGroupId(id)
      setDraftStatus("Joined group")
    } catch (error) {
      setDraftStatus(error instanceof Error ? error.message : "Unable to join group.")
    }
  }

  function startDirectMessage(targetUserId: string) {
    setDmTargetUserId(targetUserId)
    setGroupId("")
    setOpenChatMenu(null)
  }

  function switchToGroup(id: string) {
    setGroupId(id)
    setDmTargetUserId("")
    setOpenChatMenu(null)
  }

  useEffect(() => {
    if (dmTargetUserId) {
      const match = threads.find((thread) => thread.dm_peer_id === dmTargetUserId)
      setActiveThreadKey(match ? chatThreadKey(match) : "")
    } else if (groupId) {
      const match = threads.find((thread) => thread.group_id === groupId)
      setActiveThreadKey(match ? chatThreadKey(match) : "")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dmTargetUserId, groupId, threads])

  // --- Message history for the active thread ---
  async function refreshMessages(threadId: string) {
    if (!threadId) {
      setMessages([])
      return
    }
    try {
      const response = await api<{ items: ChatMessageRecord[] }>(`/api/chat?threadId=${encodeURIComponent(threadId)}`)
      setMessages(response.items)
    } catch {
      setMessages([])
    }
  }

  useEffect(() => {
    refreshMessages(activeThreadId).catch(() => undefined)
  }, [activeThreadId])

  // --- Realtime: live messages + typing over the active group's or DM's channel ---
  const groupChannelId = activeGroup ? groupChatChannelId(activeGroup.id) : (activeDmTarget && currentUserId ? dmChatChannelId(currentUserId, activeDmTarget.target_user_id) : null)

  useEffect(() => {
    if (!groupChannelId || typeof window === "undefined") return
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
    const socket = new WebSocket(`${protocol}//${window.location.host}/api/realtime/chat/${encodeURIComponent(groupChannelId)}`)
    socketRef.current = socket

    socket.onmessage = (event) => {
      let parsed: { type?: string; userId?: string; payload?: Record<string, unknown> } | null = null
      try {
        parsed = JSON.parse(event.data)
      } catch {
        return
      }
      if (!parsed || parsed.userId === currentUserId) return

      if (parsed.type === "chat-message") {
        const payload = parsed.payload || {}
        const threadId = String(payload.threadId || "")
        setMessages((current) => {
          if (threadId !== activeThreadId) return current
          if (current.some((m) => m.id === payload.messageId)) return current
          return [...current, {
            id: String(payload.messageId || `remote-${Date.now()}`),
            thread_id: threadId,
            user_id: String(parsed?.userId || ""),
            body: String(payload.body || ""),
            created_at: String(payload.createdAt || new Date().toISOString()),
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
        handleCallSignal(parsed.payload || {}, parsed.userId)
      }
    }

    function clearRemoteTyping() {
      setRemoteTyping(false)
    }

    return () => {
      socket.close()
      if (socketRef.current === socket) socketRef.current = null
      setRemoteTyping(false)
      endCall(false, "")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupChannelId, currentUserId, activeThreadId])

  function sendTypingSignal(isTyping: boolean) {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN || !groupChannelId || !currentUserId) return
    socket.send(JSON.stringify({ type: "typing", userId: currentUserId, payload: { threadId: groupChannelId, isTyping } }))
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
  const localStreamRef = useRef<MediaStream | null>(null)
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([])
  const incomingOfferRef = useRef<{ callId: string; sdp: string; video: boolean; peerUserId: string } | null>(null)
  const callTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const localVideoRef = useRef<HTMLVideoElement | null>(null)
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null)
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null)
  const iceServers = useMemo<RTCIceServer[]>(() => [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ], [])

  useEffect(() => {
    activeCallRef.current = activeCall
  }, [activeCall])

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStream
  }, [localStream])

  useEffect(() => {
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = remoteStream
  }, [remoteStream])

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

  function sendCallSignal(payload: { callId: string; kind: string; video?: boolean; sdp?: string; candidate?: string }) {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN || !currentUserId) return false
    socket.send(JSON.stringify({ type: "call-signal", userId: currentUserId, payload }))
    return true
  }

  function createPeerConnection(callId: string) {
    const pc = new RTCPeerConnection({ iceServers })
    pc.onicecandidate = (event) => {
      if (event.candidate) sendCallSignal({ callId, kind: "ice-candidate", candidate: JSON.stringify(event.candidate.toJSON()) })
    }
    pc.ontrack = (event) => {
      setRemoteStream((current) => {
        const stream = current || new MediaStream()
        if (!stream.getTracks().some((track) => track.id === event.track.id)) stream.addTrack(event.track)
        return stream
      })
    }
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected" || pc.connectionState === "closed") {
        if (activeCallRef.current?.callId === callId) endCall(pc.connectionState !== "closed", "Call disconnected.")
      }
    }
    peerConnectionRef.current = pc
    return pc
  }

  async function attachLocalMedia(video: boolean) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video })
    localStreamRef.current = stream
    setLocalStream(stream)
    return stream
  }

  async function startCall(video: boolean) {
    if (activeCallRef.current || !groupChannelId || !currentUserId) {
      setDraftStatus("Open a group chat to start a call.")
      return
    }
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      setDraftStatus("Connecting — try the call again in a moment.")
      return
    }
    const callId = crypto.randomUUID()
    try {
      const stream = await attachLocalMedia(video)
      const pc = createPeerConnection(callId)
      stream.getTracks().forEach((track) => pc.addTrack(track, stream))
      setActiveCall({ callId, peerUserId: "", video, status: "outgoing", muted: false, cameraOff: false })
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      sendCallSignal({ callId, kind: "offer", video, sdp: offer.sdp })
      if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current)
      callTimeoutRef.current = setTimeout(handleNoAnswerTimeout, 30000)
      setDraftStatus(video ? "Calling the group with video…" : "Calling the group…")
    } catch {
      setDraftStatus("Couldn't access your camera/microphone — check permissions.")
      cleanupMedia()
      setActiveCall(null)
    }

    function handleNoAnswerTimeout() {
      if (activeCallRef.current?.callId === callId && activeCallRef.current.status === "outgoing") {
        sendCallSignal({ callId, kind: "hangup" })
        endCall(false, "No answer.")
      }
    }
  }

  async function handleCallSignal(payload: Record<string, unknown>, fromUserId: string | undefined) {
    const callId = String(payload.callId || "")
    const kind = String(payload.kind || "")
    if (!callId || !kind || !fromUserId) return

    if (kind === "offer") {
      if (activeCallRef.current) {
        sendCallSignal({ callId, kind: "busy" })
        return
      }
      incomingOfferRef.current = { callId, sdp: String(payload.sdp || ""), video: Boolean(payload.video), peerUserId: fromUserId }
      setActiveCall({ callId, peerUserId: fromUserId, video: Boolean(payload.video), status: "incoming", muted: false, cameraOff: false })
      setDraftStatus(`Incoming ${payload.video ? "video" : "voice"} call…`)
      return
    }

    if (activeCallRef.current?.callId !== callId) return

    if (kind === "answer") {
      const pc = peerConnectionRef.current
      if (!pc) return
      await pc.setRemoteDescription({ type: "answer", sdp: String(payload.sdp || "") })
      await flushPendingIceCandidates()
      if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current)
      setActiveCall((current) => (current ? { ...current, peerUserId: fromUserId, status: "connected" } : current))
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
    if (!offer || !call || call.status !== "incoming") return
    try {
      const stream = await attachLocalMedia(offer.video)
      const pc = createPeerConnection(offer.callId)
      stream.getTracks().forEach((track) => pc.addTrack(track, stream))
      await pc.setRemoteDescription({ type: "offer", sdp: offer.sdp })
      await flushPendingIceCandidates()
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      sendCallSignal({ callId: offer.callId, kind: "answer", sdp: answer.sdp })
      setActiveCall((current) => (current ? { ...current, status: "connected" } : current))
      setDraftStatus("Call connected.")
    } catch {
      sendCallSignal({ callId: offer.callId, kind: "hangup" })
      setDraftStatus("Couldn't access your camera/microphone — check permissions.")
      cleanupMedia()
      setActiveCall(null)
      incomingOfferRef.current = null
    }
  }

  function declineIncomingCall() {
    const call = activeCallRef.current
    if (!call || call.status !== "incoming") return
    sendCallSignal({ callId: call.callId, kind: "decline" })
    incomingOfferRef.current = null
    setActiveCall(null)
    setDraftStatus("Call declined.")
  }

  function cleanupMedia() {
    localStreamRef.current?.getTracks().forEach((track) => track.stop())
    localStreamRef.current = null
    setLocalStream(null)
    setRemoteStream(null)
    peerConnectionRef.current?.close()
    peerConnectionRef.current = null
    pendingIceCandidatesRef.current = []
  }

  function endCall(notifyPeer: boolean, reason: string) {
    const call = activeCallRef.current
    if (!call) return
    if (notifyPeer) sendCallSignal({ callId: call.callId, kind: "hangup" })
    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current)
      callTimeoutRef.current = null
    }
    incomingOfferRef.current = null
    cleanupMedia()
    setActiveCall(null)
    setCallElapsed(0)
    if (reason) setDraftStatus(reason)
  }

  function toggleCallMute() {
    const stream = localStreamRef.current
    if (!stream) return
    const nextMuted = !activeCallRef.current?.muted
    stream.getAudioTracks().forEach((track) => { track.enabled = !nextMuted })
    setActiveCall((current) => (current ? { ...current, muted: nextMuted } : current))
  }

  function toggleCallCamera() {
    const stream = localStreamRef.current
    if (!stream || !activeCallRef.current?.video) return
    const nextOff = !activeCallRef.current?.cameraOff
    stream.getVideoTracks().forEach((track) => { track.enabled = !nextOff })
    setActiveCall((current) => (current ? { ...current, cameraOff: nextOff } : current))
  }

  function formatCallDuration(totalSeconds: number) {
    const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0")
    const seconds = (totalSeconds % 60).toString().padStart(2, "0")
    return `${minutes}:${seconds}`
  }

  function applyComposerPlan() {
    if (chatActionById.get("use-suggestion")?.disabled) return
    setChatAction("use-suggestion")
    setIntent(composerPlan.recommendedIntent)
    if (composerPlan.recommendedIntent === "question") setFilter("questions")
    if (composerPlan.recommendedIntent === "win") {
      setFilter("wins")
      setChannel("#wins")
    }
    if (!body.trim()) setDraftStatus(composerPlan.nextAction)
    setChatAction(null)
  }

  function applyQuickPrompt(prompt: ChatQuickPrompt) {
    setIntent(prompt.intent)
    setChannel(prompt.channel)
    setFilter(prompt.id === "question" ? "questions" : prompt.id === "win" ? "wins" : prompt.id === "resource" ? "saved" : "all")
    setBody((current) => current.trim() ? current : prompt.prompt)
    setDraftStatus(`${prompt.label} draft ready`)
  }

  function applyInboxShortcut(shortcut: ChatInboxShortcut) {
    setFilter(shortcut.filter)
    setQuery(shortcut.query)
  }

  function selectThread(thread: ChatThreadRecord) {
    const parsed = parseThreadTitle(thread.title)
    const targetId = chatThreadKey(thread)
    setActiveThreadKey(targetId)
    setChannel(parsed.channel || "#general")
    setTitle(parsed.title)
    setReplyThreadId(targetId || undefined)
  }

  async function refresh() {
    const response = await api<{ items: ChatThreadRecord[] }>("/api/chat")
    setThreads(response.items)
  }

  useEffect(() => {
    refresh().catch(() => undefined)
  }, [])

  useEffect(() => {
    const draft = readChatDraft()
    if (!draft) return
    setBody(draft.body || "")
    setTitle(draft.title || "Study room")
    setIntent(draft.intent || "update")
    setChannel(draft.channel || "#general")
    setReplyThreadId(draft.replyThreadId)
  }, [])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      writeChatDraft({ body, title, intent, channel, replyThreadId })
      setDraftStatus(body.trim() ? "Draft saved" : "")
    }, 500)
    return () => window.clearTimeout(timeout)
  }, [body, channel, intent, replyThreadId, title])

  async function send() {
    if (chatActionById.get("send")?.disabled) return
    setChatAction("send")
    try {
      const payload = { ...buildChatDraftPayload({ body, channel, title, intent, threadId: replyThreadId }), groupId: activeGroup?.id, targetUserId: activeDmTarget?.target_user_id }
      await api("/api/chat", { method: "POST", body: JSON.stringify(payload) })
      setBody("")
      setReplyThreadId(undefined)
      clearChatDraft()
      setDraftStatus("Sent")
      if (typingStopRef.current) clearTimeout(typingStopRef.current)
      sendTypingSignal(false)
      await refresh()
      await refreshMessages(activeThreadId)
    } catch (error) {
      setDraftStatus(error instanceof Error ? error.message : "Unable to send this message.")
    } finally {
      setChatAction(null)
    }
  }

  function replyToThread(thread: ChatThreadRecord) {
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
      setReaction(action)
      setDraftStatus(action === "save" ? "Thread saved" : "Marked helpful")
    } catch (error) {
      setDraftStatus(error instanceof Error ? error.message : "Unable to save this thread action.")
    } finally {
      setThreadAction(null)
      setOpenChatMenu(null)
    }
  }

  function useComposerTool(tool: "mention" | "reaction" | "translate" | "notify") {
    const additions = {
      mention: { text: "@", status: "Mention ready" },
      reaction: { text: `\n\nReaction: ${reaction}`, status: "Reaction added" },
      translate: { text: "\n\nTranslate this for my study group.", status: "Translation intent added" },
      notify: { text: "\n\nNotify the group when this is posted.", status: "Notification intent added" },
    }
    const addition = additions[tool]
    setBody((current) => {
      if (tool === "mention") return current.endsWith(" ") || !current ? `${current}@` : `${current} @`
      return current.includes(addition.text.trim()) ? current : `${current.trimEnd()}${addition.text}`
    })
    setDraftStatus(addition.status)
    setOpenChatMenu(null)
  }

  return (
    <div className="grid min-h-[72vh] overflow-hidden rounded-xl border border-border bg-background lg:grid-cols-[minmax(20rem,26rem)_minmax(0,1fr)]" title={options.collaborationPresence ? "Live-ready chats" : "Async chats"}>
      <Panel className="order-2 flex min-h-[72vh] flex-col rounded-none border-0 p-0 lg:order-2 lg:border-l lg:border-border">
        <div className="mb-3 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-start">
          <div className="flex min-w-0 items-center gap-3 border-b border-border px-4 py-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground">
              <MessageSquare className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <input value={title} onChange={(event) => setTitle(event.target.value)} className="w-full bg-transparent text-lg font-semibold text-foreground outline-none" />
              <p className="truncate text-xs font-semibold text-muted-foreground">
                {activeDmTarget ? `Direct message with ${activeDmTarget.name}` : `${activeThreadParsed.channel} - ${activeIntent.label}`}
                {remoteTyping ? <span className="ml-2 text-primary">typing…</span> : null}
              </p>
            </div>
          </div>
          <div className="flex gap-2 border-b border-border px-4 py-3 lg:justify-end">
            <ChatMenu icon={Users} label={activeDmTarget ? activeDmTarget.name : activeGroup ? activeGroup.name : "Group"} menuId="tools" openMenu={openChatMenu} setOpenMenu={setOpenChatMenu}>
              <ChatMenuSection title="Chat as this group">
                {myGroups.length ? myGroups.map((group) => (
                  <ChatMenuAction
                    active={!activeDmTarget && groupId === group.id}
                    key={group.id}
                    label={group.name}
                    meta={`${group.member_count ?? 1} member${group.member_count === 1 ? "" : "s"} - live chat + calls`}
                    onClick={() => switchToGroup(group.id)}
                  />
                )) : (
                  <p className="px-2 py-2 text-xs text-muted-foreground">Not in any group yet — join one below or create one.</p>
                )}
              </ChatMenuSection>
              <ChatMenuSection title="Other groups">
                {groups.filter((group) => !group.is_member).map((group) => (
                  <ChatMenuAction key={group.id} label={group.name} meta="Join to chat live with this group" onClick={() => joinGroupById(group.id)} />
                ))}
                <ChatMenuAction icon={Plus} label="New group" meta="Create a study group you can invite others to." onClick={() => {
                  const name = window.prompt("Group name")
                  if (name) createGroup(name)
                  setOpenChatMenu(null)
                }} />
              </ChatMenuSection>
              <ChatMenuSection title="Direct messages">
                {connections.length ? connections.map((connection) => (
                  <ChatMenuAction
                    active={dmTargetUserId === connection.target_user_id}
                    key={connection.target_user_id}
                    label={connection.name}
                    meta={`@${connection.username} - live chat + calls`}
                    onClick={() => startDirectMessage(connection.target_user_id)}
                  />
                )) : (
                  <p className="px-2 py-2 text-xs text-muted-foreground">No connections yet — connect with someone from their profile to message them directly.</p>
                )}
              </ChatMenuSection>
            </ChatMenu>
            <ToolbarButton label="Video" onClick={() => startCall(true)} icon={Video} />
            <ToolbarButton label="Call" onClick={() => startCall(false)} icon={Phone} />
            <ChatMenu icon={Sparkles} label="Compose" menuId="compose" openMenu={openChatMenu} setOpenMenu={setOpenChatMenu}>
              <ChatMenuSection title="Draft intent">
                {quickIntents.map((item) => (
                  <ChatMenuAction
                    active={intent === item.id}
                    key={item.id}
                    label={item.label}
                    meta={item.body}
                    onClick={() => {
                      setIntent(item.id)
                      setOpenChatMenu(null)
                    }}
                  />
                ))}
              </ChatMenuSection>
              <ChatMenuSection title="Smart helper">
                <ChatMenuAction
                  disabled={chatActionById.get("use-suggestion")?.disabled}
                  icon={Sparkles}
                  label={chatActionById.get("use-suggestion")?.busy ? "Applying" : "Use suggestion"}
                  meta={composerPlan.nextAction}
                  onClick={() => {
                    applyComposerPlan()
                    setOpenChatMenu(null)
                  }}
                />
              </ChatMenuSection>
            </ChatMenu>
            <ChatMenu align="right" compact icon={MoreHorizontal} label="More" menuId="chatMore" openMenu={openChatMenu} setOpenMenu={setOpenChatMenu}>
              <ChatMenuSection title="Conversation">
                <ChatMenuAction icon={Search} label="Search chat" meta="Filter the inbox by this conversation title." onClick={() => setQuery(activeThreadParsed.title)} />
                <ChatMenuAction icon={Bell} label="Mute notifications" meta="Prepared for notification settings." onClick={() => setDraftStatus("Notifications muted for this chat")} />
                <ChatMenuAction icon={Gamepad2} label="Start quiz battle" meta="Jump to Practice for a live challenge." onClick={() => setDraftStatus("Battle prompt ready")} />
              </ChatMenuSection>
            </ChatMenu>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.08),transparent_34%),linear-gradient(135deg,hsl(var(--muted)/0.6),hsl(var(--background)))] px-4 py-5">
          <div className="mx-auto flex max-w-3xl flex-col gap-3">
            {messages.length ? messages.map((message) => (
              <div
                key={message.id}
                className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${
                  message.user_id === currentUserId
                    ? "ml-auto rounded-tr-sm bg-primary text-primary-foreground"
                    : "rounded-tl-sm bg-secondary text-secondary-foreground"
                }`}
              >
                <p>{message.body.replace(/^\[[^\]]+\]\s*/, "")}</p>
                <p className="mt-1 text-right text-[11px] opacity-70">{formatDate(message.created_at)}</p>
              </div>
            )) : (
              <div className="max-w-[78%] rounded-2xl rounded-tl-sm bg-secondary px-4 py-3 text-sm leading-6 text-secondary-foreground shadow-sm">
                <p>{activeThreadBody.replace(/^\[[^\]]+\]\s*/, "")}</p>
                <p className="mt-1 text-right text-[11px] opacity-70">{activeThread?.updated_at ? formatDate(activeThread.updated_at) : "recent"}</p>
              </div>
            )}
            {body.trim() ? (
              <div className="ml-auto max-w-[78%] rounded-2xl rounded-tr-sm bg-primary px-4 py-3 text-sm leading-6 text-primary-foreground shadow-sm">
                <p>{body}</p>
                <p className="mt-1 text-right text-[11px] opacity-75">draft</p>
              </div>
            ) : !messages.length ? (
              <div className="mx-auto mt-12 grid grid-cols-2 gap-3 text-center text-sm text-muted-foreground">
                <button onClick={() => setDraftStatus("Document picker ready")} className="grid h-28 w-32 place-items-center rounded-2xl bg-card shadow-sm hover:bg-accent hover:text-accent-foreground" type="button">
                  <Paperclip className="h-6 w-6" />
                  <span>Send document</span>
                </button>
                <button onClick={() => setDraftStatus("Contact invite ready")} className="grid h-28 w-32 place-items-center rounded-2xl bg-card shadow-sm hover:bg-accent hover:text-accent-foreground" type="button">
                  <Plus className="h-6 w-6" />
                  <span>Add contact</span>
                </button>
              </div>
            ) : null}
          </div>
        </div>
        <details className="mx-4 mt-3 rounded-md border border-border bg-background">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-foreground">
            <span>Starter prompts</span>
            <span className="rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">{quickPrompts.length}</span>
          </summary>
          <div className="flex gap-2 overflow-x-auto border-t border-border p-2">
          {quickPrompts.map((prompt) => (
            <button
              key={prompt.id}
              onClick={() => applyQuickPrompt(prompt)}
              title={prompt.detail}
              className={`group inline-flex h-10 min-w-[9rem] shrink-0 items-center justify-between gap-2 rounded-md border px-3 text-left transition hover:border-primary/40 hover:bg-accent hover:text-accent-foreground ${
                prompt.recommended ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-background text-foreground"
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{prompt.label}</span>
              </span>
              <span className="rounded-md bg-secondary px-2 py-1 text-[11px] font-semibold text-secondary-foreground">{prompt.badge}</span>
            </button>
          ))}
          </div>
        </details>
        <div className="m-4 mt-3 rounded-full border border-input bg-background px-3 py-2 shadow-sm">
          <textarea value={body} onChange={(event) => { setBody(event.target.value); handleDraftActivity(event.target.value) }} className="min-h-28 w-full resize-none bg-transparent text-sm leading-6 text-foreground outline-none" placeholder="Message your study group, mention someone, link Studio, or ask a question..." />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            <div className="flex items-center gap-2">
            <ChatMenu compact icon={Plus} label="Attach" menuId="attach" openMenu={openChatMenu} setOpenMenu={setOpenChatMenu}>
              <ChatMenuSection title="Attach">
                <ChatMenuAction icon={Paperclip} label="Document" meta="Attach a Studio item or file." onClick={() => setDraftStatus("Document attachment ready")} />
                <ChatMenuAction icon={Gamepad2} label="Quiz battle" meta="Attach a practice challenge." onClick={() => setDraftStatus("Practice attachment ready")} />
                <ChatMenuAction icon={Clock} label="Event" meta="Attach a study calendar block." onClick={() => setDraftStatus("Event attachment ready")} />
              </ChatMenuSection>
            </ChatMenu>
            <ChatMenu compact icon={Smile} label="Tools" menuId="tools" openMenu={openChatMenu} setOpenMenu={setOpenChatMenu}>
              <ChatMenuSection title="Composer tools">
                <ChatMenuAction icon={AtSign} label="@mention" meta="Mention a teammate in the draft." onClick={() => useComposerTool("mention")} />
                <ChatMenuAction icon={Smile} label="Reaction" meta={`Default thread reaction: ${reaction}.`} onClick={() => useComposerTool("reaction")} />
                <ChatMenuAction icon={Languages} label="Translate" meta="Mark this message for translation after sending." onClick={() => useComposerTool("translate")} />
                <ChatMenuAction icon={Bell} label="Notify" meta="Prepare this draft as a notification-worthy update." onClick={() => useComposerTool("notify")} />
              </ChatMenuSection>
              <ChatMenuSection title="Draft">
                <ChatMenuAction
                  disabled={chatActionById.get("clear-draft")?.disabled}
                  icon={RotateCcw}
                  label={chatActionById.get("clear-draft")?.busy ? "Clearing" : "Clear draft"}
                  meta={chatActionById.get("clear-draft")?.helper || "Remove only the local unsent draft."}
                  onClick={() => {
                    if (chatActionById.get("clear-draft")?.disabled) return
                    setChatAction("clear-draft")
                    setBody("")
                    setReplyThreadId(undefined)
                    clearChatDraft()
                    setDraftStatus("Draft cleared")
                    setChatAction(null)
                    setOpenChatMenu(null)
                  }}
                />
              </ChatMenuSection>
            </ChatMenu>
            <button onClick={() => setDraftStatus("Voice note ready")} className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-secondary px-2 text-sm font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground" type="button">
              <Mic className="h-4 w-4" />
            </button>
            </div>
            <p className={`rounded-md px-2 py-1 text-xs font-semibold ${draftStatus ? "bg-success/15 text-success" : "text-muted-foreground"}`}>
              {replyThreadId ? "Reply target saved" : draftStatus || "Private-first sharing"}
            </p>
            <ToolbarButton
              disabled={chatActionById.get("send")?.disabled}
              label={chatActionById.get("send")?.busy ? chatActionById.get("send")?.busyLabel || "Sending" : "Send"}
              onClick={send}
              icon={Send}
              primary
            />
          </div>
        </div>
      </Panel>
      <Panel className="order-1 min-h-[72vh] rounded-none border-0 p-3 lg:order-1 lg:max-h-[72vh] lg:overflow-y-auto">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-2xl font-semibold text-foreground">Chats</h3>
          <div className="flex items-center gap-2">
            <button onClick={() => setBody((current) => current || "Can someone help me with ")} className="grid h-9 w-9 place-items-center rounded-md border border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground" type="button">
              <Plus className="h-4 w-4" />
            </button>
            <ChatMenu align="right" compact icon={MoreHorizontal} label="Menu" menuId="filters" openMenu={openChatMenu} setOpenMenu={setOpenChatMenu}>
              <ChatMenuSection title="Inbox">
                {threadFilters.map((item) => (
                  <ChatMenuAction
                    active={filter === item.id}
                    key={item.id}
                    label={item.label}
                    meta={item.id === "all" ? "Show every recent thread." : `Show only ${item.id}.`}
                    onClick={() => {
                      setFilter(item.id)
                      setOpenChatMenu(null)
                    }}
                  />
                ))}
              </ChatMenuSection>
            </ChatMenu>
          </div>
        </div>
        <div className="mt-4 flex h-11 items-center gap-2 rounded-full bg-muted px-4">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search or start a new chat" className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground" />
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {inboxShortcuts.map((shortcut) => (
            <button
              key={shortcut.id}
              onClick={() => applyInboxShortcut(shortcut)}
              className={`inline-flex h-9 min-w-[5.6rem] shrink-0 items-center justify-between gap-2 rounded-md border px-2 text-xs font-semibold transition hover:border-primary/40 hover:bg-accent hover:text-accent-foreground ${
                shortcut.recommended ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-secondary text-secondary-foreground"
              }`}
            >
              <span className="truncate">{shortcut.label}</span>
              <span className="rounded bg-background px-1.5 py-0.5 text-[11px] text-foreground">{shortcut.count}</span>
            </button>
          ))}
        </div>
        {chatSummary.channels.length ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {chatSummary.channels.slice(0, 3).map((channelSummary) => (
              <button key={channelSummary.label} onClick={() => setQuery(channelSummary.label)} className="rounded-md bg-muted px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:bg-accent hover:text-accent-foreground">
                {channelSummary.label}
              </button>
            ))}
          </div>
        ) : null}
        <div className="mt-3 space-y-1.5">
          {visibleThreads.map((thread) => {
            const parsed = parseThreadTitle(thread.title)
            const targetId = chatThreadKey(thread)
            const helpful = Boolean(thread.helpful)
            const saved = Boolean(thread.saved)
            const selected = Boolean(targetId) && targetId === activeThreadId
            const status = buildChatThreadStatus(thread)
            const threadActions = buildChatThreadActions({
              busyAction: threadAction?.threadId === targetId ? threadAction.action : null,
              helpful,
              hasThread: Boolean(targetId),
              saved,
            })
            const menuLabel = saved ? "saved" : helpful ? "helpful" : "react"
            return (
            <div
              key={targetId || parsed.title}
              onClick={() => selectThread(thread)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault()
                  selectThread(thread)
                }
              }}
              className={`cursor-pointer rounded-xl border p-3 text-sm transition hover:border-primary/40 hover:bg-accent hover:text-accent-foreground ${
                selected ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-background"
              }`}
              role="button"
              tabIndex={0}
            >
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground">
                  <MessageSquare className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate font-semibold text-foreground">{parsed.title}</p>
                    <span className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold ${chatStatusClasses(status.tone)}`}>{status.label}</span>
                  </div>
                  <p className="text-xs font-semibold text-muted-foreground">{parsed.channel}</p>
                  <p className="mt-1 line-clamp-2 text-muted-foreground">{thread.last_message || "No messages yet"}</p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-2 pl-[3.25rem]" onClick={(event) => event.stopPropagation()}>
                <ChatMenu compact icon={Smile} label={menuLabel} menuId={`threadActions:${targetId || parsed.title}`} openMenu={openChatMenu} setOpenMenu={setOpenChatMenu}>
                  <ChatMenuSection title="Thread actions">
                    {threadActions.map((item) => (
                      <ChatMenuAction
                        active={item.active}
                        disabled={item.disabled}
                        key={item.id}
                        label={item.busy ? item.busyLabel : item.label}
                        meta={item.helper}
                        onClick={() => runThreadAction(thread, item.id)}
                      />
                    ))}
                  </ChatMenuSection>
                </ChatMenu>
                <button onClick={() => runThreadAction(thread, "reply")} disabled={Boolean(threadAction)} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-secondary px-2 text-xs font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-60">
                  <Reply className="h-3.5 w-3.5" />
                  reply
                </button>
              </div>
            </div>
          )})}
          {!visibleThreads.length ? <EmptyState title="No matching threads" body="Send a message or change the search/filter to see more collaboration history." /> : null}
        </div>
      </Panel>
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
                <button onClick={() => endCall(true, "Call ended.")} className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-lg transition hover:opacity-90" type="button" aria-label="End call">
                  <PhoneOff className="h-6 w-6" />
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function readChatDraft(): ChatDraft | null {
  if (typeof window === "undefined") return null
  return parseStoredChatDraft(window.localStorage.getItem(CHAT_DRAFT_KEY))
}

function writeChatDraft(draft: ChatDraft) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(CHAT_DRAFT_KEY, serializeChatDraft(draft))
}

function clearChatDraft() {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(CHAT_DRAFT_KEY)
}

function chatStatusClasses(tone: "accent" | "muted" | "success" | "warning") {
  if (tone === "success") return "bg-success/15 text-success"
  if (tone === "warning") return "bg-warning/15 text-warning"
  if (tone === "accent") return "bg-primary/10 text-primary"
  return "bg-secondary text-secondary-foreground"
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
}: {
  align?: "left" | "right"
  children: React.ReactNode
  compact?: boolean
  icon: React.ComponentType<{ className?: string }>
  label: string
  menuId: ChatMenuId
  openMenu: ChatMenuId | null
  setOpenMenu: (menuId: ChatMenuId | null) => void
}) {
  const open = openMenu === menuId
  return (
    <div className="relative">
      <button
        aria-expanded={open}
        onClick={() => setOpenMenu(open ? null : menuId)}
        className={`inline-flex h-9 items-center gap-2 rounded-md border border-border bg-secondary text-sm font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground ${compact ? "px-2" : "px-3"}`}
        type="button"
      >
        <Icon className="h-4 w-4" />
        <span>{label}</span>
      </button>
      {open ? (
        <div className={`absolute top-[calc(100%+0.4rem)] z-[120] w-72 rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-xl ${align === "right" ? "right-0" : "left-0"}`}>
          {children}
        </div>
      ) : null}
    </div>
  )
}

function ChatMenuSection({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <div className="space-y-1 rounded-md p-1">
      <p className="px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{title}</p>
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
      className={`flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50 ${active ? "bg-primary/10 text-primary" : danger ? "text-destructive" : "text-popover-foreground"}`}
      type="button"
    >
      {Icon ? <Icon className="mt-0.5 h-4 w-4 shrink-0" /> : <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-current opacity-50" />}
      <span className="min-w-0">
        <span className="block font-semibold">{label}</span>
        {meta ? <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{meta}</span> : null}
      </span>
    </button>
  )
}

function ToolbarButton({
  disabled,
  icon: Icon,
  label,
  onClick,
  primary,
}: {
  disabled?: boolean
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
  primary?: boolean
}) {
  return (
    <button disabled={disabled} onClick={onClick} className={`flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60 ${primary ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground"}`}>
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </button>
  )
}
