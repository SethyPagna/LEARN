"use client"

import { useEffect, useMemo, useState } from "react"
import type React from "react"
import { AtSign, Bell, CheckCircle2, Clock, Gamepad2, Hash, Languages, MessageSquare, MoreHorizontal, Reply, RotateCcw, Send, SlidersHorizontal, Smile, Sparkles, Trophy, XCircle } from "lucide-react"
import type { WorkspaceOptions } from "../preferences"
import type { Quiz } from "../types"
import { api } from "../api"
import { EmptyState, Panel } from "../ui"
import { buildGameRunActions, evaluateGameChoice, summarizeGameRun, type GameRunActionId } from "@/lib/practice-features"
import { buildChatComposerActions, buildChatComposerPlan, buildChatDraftPayload, buildChatThreadActions, filterChatThreads, parseThreadTitle, summarizeChatWorkspace, type ChatComposerActionId, type ChatIntent, type ChatThreadActionId, type ChatThreadFilter } from "@/lib/social-features"

const quizDetailCache = new Map<string, Quiz>()
const CHAT_DRAFT_KEY = "learn_chat_draft_v1"
type ChatMenuId = "compose" | "tools" | "signals" | "filters" | `threadActions:${string}`
type ChatDraft = { body: string; title: string; intent: ChatIntent; channel: string; replyThreadId?: string }

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
      {[60, 90, 180].map((seconds) => (
        <button
          key={seconds}
          onClick={() => setTargetSeconds(seconds)}
          disabled={disabled}
          className={`h-8 rounded-md px-2.5 text-xs font-semibold ${targetSeconds === seconds ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground"}`}
        >
          {Math.round(seconds / 60)}m
        </button>
      ))}
      <span className={`inline-flex h-8 items-center rounded-md px-2 text-xs font-semibold ${elapsedSeconds > targetSeconds ? "bg-destructive text-destructive-foreground" : "bg-muted text-muted-foreground"}`}>
        target {formatDuration(targetSeconds)}
      </span>
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
  const [threads, setThreads] = useState<any[]>([])
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
  const quickIntents = [
    { id: "update" as const, label: "Update", body: "Share progress, a note, or what changed." },
    { id: "question" as const, label: "Question", body: "Ask for help and invite replies." },
    { id: "win" as const, label: "Win", body: "Celebrate a milestone or review streak." },
  ]
  const threadFilters: Array<{ id: ChatThreadFilter; label: string }> = [
    { id: "all", label: "All threads" },
    { id: "questions", label: "Questions" },
    { id: "wins", label: "Wins" },
    { id: "saved", label: "Saved" },
  ]
  const activeIntent = quickIntents.find((item) => item.id === intent) || quickIntents[0]
  const activeFilter = threadFilters.find((item) => item.id === filter) || threadFilters[0]
  const chatSummary = useMemo(() => summarizeChatWorkspace(threads), [threads])
  const composerPlan = useMemo(() => buildChatComposerPlan(chatSummary, body), [body, chatSummary])
  const chatActions = useMemo(() => buildChatComposerActions({
    busyAction: chatAction,
    hasDraft: Boolean(body.trim()),
    hasSuggestion: Boolean(composerPlan.nextAction),
  }), [body, chatAction, composerPlan.nextAction])
  const chatActionById = useMemo(() => new Map(chatActions.map((action) => [action.id, action])), [chatActions])
  const visibleThreads = useMemo(() => filterChatThreads(threads, { query, filter }), [filter, query, threads])

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

  async function refresh() {
    const response = await api<{ items: any[] }>("/api/chat")
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
      await api("/api/chat", { method: "POST", body: JSON.stringify(buildChatDraftPayload({ body, channel, title, intent, threadId: replyThreadId })) })
      setBody("")
      setReplyThreadId(undefined)
      clearChatDraft()
      setDraftStatus("Sent")
      await refresh()
    } catch (error) {
      setDraftStatus(error instanceof Error ? error.message : "Unable to send this message.")
    } finally {
      setChatAction(null)
    }
  }

  function replyToThread(thread: any) {
    const parsed = parseThreadTitle(thread.title)
    const targetId = chatThreadKey(thread)
    setChannel(parsed.channel || "#general")
    setTitle(`Re: ${parsed.title}`)
    setIntent("question")
    setReplyThreadId(targetId || undefined)
    setBody((current) => current.trim() ? current : `Replying to "${parsed.title}": `)
    setDraftStatus("Reply draft ready")
  }

  function chatThreadKey(thread: any) {
    return String(thread.id || thread.threadId || thread.thread_id || thread.title || "").trim()
  }

  async function runThreadAction(thread: any, action: ChatThreadActionId) {
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
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Panel className={options.chatCompact ? "p-3" : "p-4"}>
        <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex h-10 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm text-muted-foreground">
                <Hash className="h-4 w-4" />
                <select value={channel} onChange={(event) => setChannel(event.target.value)} className="bg-transparent text-foreground outline-none">
                  <option value="#general">general</option>
                  <option value="#study-help">study-help</option>
                  <option value="#resources">resources</option>
                  <option value="#wins">wins</option>
                </select>
              </label>
              <input value={title} onChange={(event) => setTitle(event.target.value)} className="min-w-52 flex-1 bg-transparent text-2xl font-semibold text-foreground outline-none" />
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <ChatChip label={activeIntent.label} tone="strong" />
              <ChatChip label={composerPlan.headline} />
              {composerPlan.chips.slice(0, 2).map((chip) => <ChatChip key={chip} label={chip} />)}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
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
            <ChatMenu icon={SlidersHorizontal} label="Signals" menuId="signals" openMenu={openChatMenu} setOpenMenu={setOpenChatMenu}>
              <ChatMenuSection title="Channel signals">
                <div className="grid grid-cols-2 gap-2">
                  <ChatSignal label="Threads" value={String(chatSummary.total)} />
                  <ChatSignal label="Questions" value={String(chatSummary.questions)} />
                  <ChatSignal label="Wins" value={String(chatSummary.wins)} />
                  <ChatSignal label="Saved" value={String(chatSummary.saved)} />
                  <ChatSignal label="Mentions" value={String(chatSummary.mentions)} />
                  <ChatSignal label="Studio links" value={String(chatSummary.studioLinks)} />
                </div>
              </ChatMenuSection>
            </ChatMenu>
            <ToolbarButton
              disabled={chatActionById.get("send")?.disabled}
              label={chatActionById.get("send")?.busy ? chatActionById.get("send")?.busyLabel || "Sending" : "Send"}
              onClick={send}
              icon={Send}
              primary
            />
          </div>
        </div>
        <div className="rounded-md border border-input bg-background p-3">
          <textarea value={body} onChange={(event) => setBody(event.target.value)} className="min-h-32 w-full resize-none bg-transparent text-sm leading-6 text-foreground outline-none" placeholder="Share a study update, @mention a person, link a Studio item, or ask for a quick explanation..." />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            <ChatMenu compact icon={MoreHorizontal} label="Tools" menuId="tools" openMenu={openChatMenu} setOpenMenu={setOpenChatMenu}>
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
            <p className={`rounded-md px-2 py-1 text-xs font-semibold ${draftStatus ? "bg-success/15 text-success" : "text-muted-foreground"}`}>
              {replyThreadId ? "Reply target saved" : draftStatus || "Private-first sharing"}
            </p>
          </div>
        </div>
      </Panel>
      <Panel className={options.chatCompact ? "p-3" : "p-4"}>
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold text-foreground">Recent threads</h3>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-secondary px-2 py-1 text-xs font-semibold text-secondary-foreground">{activeFilter.label}</span>
            <span className="rounded-md bg-secondary px-2 py-1 text-xs font-semibold text-secondary-foreground">{visibleThreads.length}/{threads.length}</span>
          </div>
        </div>
        {options.collaborationPresence ? <p className="mt-1 text-xs text-muted-foreground">Presence hints are enabled for group workflows.</p> : null}
        <div className="mt-3 flex gap-2">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search threads" className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-ring" />
          <ChatMenu align="right" compact icon={SlidersHorizontal} label="Filters" menuId="filters" openMenu={openChatMenu} setOpenMenu={setOpenChatMenu}>
            <ChatMenuSection title="Thread filters">
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
        {chatSummary.channels.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {chatSummary.channels.slice(0, 4).map((channelSummary) => (
              <button key={channelSummary.label} onClick={() => setQuery(channelSummary.label)} className="rounded-md bg-secondary px-2 py-1 text-xs font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground">
                {channelSummary.label} {channelSummary.count}
              </button>
            ))}
          </div>
        ) : null}
        <div className="mt-3 space-y-2">
          {visibleThreads.map((thread) => {
            const parsed = parseThreadTitle(thread.title)
            const targetId = chatThreadKey(thread)
            const helpful = Boolean(thread.helpful)
            const saved = Boolean(thread.saved)
            const threadActions = buildChatThreadActions({
              busyAction: threadAction?.threadId === targetId ? threadAction.action : null,
              helpful,
              hasThread: Boolean(targetId),
              saved,
            })
            const menuLabel = saved ? "saved" : helpful ? "helpful" : "react"
            return (
            <div key={targetId || parsed.title} className="rounded-md border border-border bg-background p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-foreground">{parsed.title}</p>
                  <p className="text-xs font-semibold text-muted-foreground">{parsed.channel}</p>
                </div>
                <span className="rounded-md bg-secondary px-2 py-1 text-[11px] font-semibold text-secondary-foreground">read</span>
              </div>
              <p className="mt-1 line-clamp-2 text-muted-foreground">{thread.last_message || "No messages yet"}</p>
              <div className="mt-3 flex flex-wrap gap-2">
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
    </div>
  )
}

function readChatDraft(): ChatDraft | null {
  if (typeof window === "undefined") return null
  try {
    const stored = window.localStorage.getItem(CHAT_DRAFT_KEY)
    return stored ? JSON.parse(stored) : null
  } catch {
    return null
  }
}

function writeChatDraft(draft: ChatDraft) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(CHAT_DRAFT_KEY, JSON.stringify(draft))
}

function clearChatDraft() {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(CHAT_DRAFT_KEY)
}

function ChatChip({ label, tone }: { label: string; tone?: "muted" | "strong" }) {
  return <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${tone === "strong" ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground"}`}>{label}</span>
}

function ChatSignal({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-2">
      <p className="text-[0.65rem] font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold leading-none text-foreground">{value}</p>
    </div>
  )
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
        <div className={`absolute top-[calc(100%+0.4rem)] z-30 w-72 rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-xl ${align === "right" ? "right-0" : "left-0"}`}>
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
