"use client"

import { useEffect, useMemo, useState } from "react"
import type React from "react"
import { AtSign, Bell, CheckCircle2, Clock, Gamepad2, Hash, Languages, MessageSquare, Reply, RotateCcw, Send, Smile, Sparkles, Trophy, XCircle } from "lucide-react"
import type { WorkspaceOptions } from "../preferences"
import type { Quiz } from "../types"
import { api } from "../api"
import { EmptyState, Panel } from "../ui"
import { evaluateGameChoice, summarizeGameRun } from "@/lib/practice-features"
import { buildChatComposerPlan, buildChatDraftPayload, filterChatThreads, parseThreadTitle, summarizeChatWorkspace, type ChatIntent, type ChatThreadFilter } from "@/lib/social-features"

const quizDetailCache = new Map<string, Quiz>()
const CHAT_DRAFT_KEY = "learn_chat_draft_v1"

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
  const current = questions[index]

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
    setIndex(0)
    setScore(0)
    setFeedback(null)
    setCompletedRun(null)
    setStartedAt(Date.now())
    setElapsedSeconds(0)
  }

  function choose(choiceId: string) {
    if (!current || feedback || completedRun) return
    const result = evaluateGameChoice(current, choiceId)
    setFeedback(result)
    if (result.correct) setScore((value) => value + 1)
  }

  async function nextPrompt() {
    if (!current) return
    const durationSeconds = currentElapsedSeconds(startedAt)
    if (index + 1 >= questions.length) {
      setElapsedSeconds(durationSeconds)
      setCompletedRun(summarizeGameRun({ score, total: questions.length, durationSeconds, targetSeconds }))
      await api("/api/games", { method: "POST", body: JSON.stringify({ gameKey: "flashcard-sprint", score, total: questions.length, durationSeconds }) }).catch(() => undefined)
      return
    }
    setFeedback(null)
    setIndex((value) => value + 1)
  }

  if (!current) {
    return (
      <Panel className="p-4">
        <GameTimerControls elapsedSeconds={elapsedSeconds} resetRun={resetRun} setTargetSeconds={setTargetSeconds} targetSeconds={targetSeconds} />
        <EmptyState title="No game questions yet" body="Add or open quizzes so question data can power flashcard sprint and matching games." />
      </Panel>
    )
  }

  return (
    <Panel className="p-5">
      <div className="mb-4 flex items-center gap-3">
        <Gamepad2 className="h-5 w-5 text-success" />
        <div>
          <h2 className="text-2xl font-semibold">Flashcard sprint</h2>
          <p className="text-sm text-muted-foreground">{options.gameMode} mode - Score {score} / {questions.length} - {formatDuration(elapsedSeconds)}</p>
        </div>
      </div>
      <GameTimerControls elapsedSeconds={elapsedSeconds} resetRun={resetRun} setTargetSeconds={setTargetSeconds} targetSeconds={targetSeconds} />
      {completedRun ? (
        <div className="mb-4 rounded-lg border border-border bg-accent p-4 text-accent-foreground">
          <div className="flex flex-wrap items-center gap-3">
            <Trophy className="h-5 w-5" />
            <p className="font-semibold">Run complete: {completedRun.score}/{completedRun.total} - {completedRun.accuracy}%</p>
            <span className="rounded-md bg-background px-2 py-1 text-xs font-semibold text-foreground">{completedRun.nextAction.replace(/-/g, " ")}</span>
          </div>
          <p className="mt-2 text-sm opacity-80">Duration {formatDuration(completedRun.durationSeconds)} / target {formatDuration(completedRun.targetSeconds)}.</p>
          <button onClick={resetRun} className="mt-3 rounded-md bg-background px-3 py-1.5 text-xs font-semibold text-foreground">Start another run</button>
        </div>
      ) : null}
      <div className="rounded-lg bg-primary p-5 text-primary-foreground">
        <p className="text-sm opacity-70">Prompt {index + 1}</p>
        <h3 className="mt-2 text-2xl font-semibold">{current.question}</h3>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {current.choices.map((choice) => (
          <button
            key={choice.id}
            onClick={() => choose(choice.id)}
            disabled={Boolean(feedback || completedRun)}
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
          <button onClick={nextPrompt} className="mt-3 rounded-md bg-background px-3 py-1.5 text-xs font-semibold text-foreground">
            {index + 1 >= questions.length ? "Finish run" : "Next prompt"}
          </button>
        </div>
      ) : null}
    </Panel>
  )
}

function GameTimerControls({
  elapsedSeconds,
  resetRun,
  setTargetSeconds,
  targetSeconds,
}: {
  elapsedSeconds: number
  resetRun: () => void
  setTargetSeconds: (seconds: number) => void
  targetSeconds: number
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-border bg-card p-2">
      <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">
        <Clock className="h-3.5 w-3.5" />
        {formatDuration(elapsedSeconds)} elapsed
      </span>
      {[60, 90, 180].map((seconds) => (
        <button
          key={seconds}
          onClick={() => setTargetSeconds(seconds)}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold ${targetSeconds === seconds ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground"}`}
        >
          {Math.round(seconds / 60)}m
        </button>
      ))}
      <span className={`rounded-md px-2 py-1 text-xs font-semibold ${elapsedSeconds > targetSeconds ? "bg-destructive text-destructive-foreground" : "bg-muted text-muted-foreground"}`}>
        target {formatDuration(targetSeconds)}
      </span>
      <button onClick={resetRun} className="ml-auto flex h-8 items-center gap-1.5 rounded-md border border-border bg-secondary px-3 text-xs font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground">
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
  const quickIntents = [
    { id: "update" as const, label: "Update", body: "Share progress, a note, or what changed." },
    { id: "question" as const, label: "Question", body: "Ask for help and invite replies." },
    { id: "win" as const, label: "Win", body: "Celebrate a milestone or review streak." },
  ]
  const chatSummary = useMemo(() => summarizeChatWorkspace(threads), [threads])
  const composerPlan = useMemo(() => buildChatComposerPlan(chatSummary, body), [body, chatSummary])
  const visibleThreads = useMemo(() => filterChatThreads(threads, { query, filter }), [filter, query, threads])

  function applyComposerPlan() {
    setIntent(composerPlan.recommendedIntent)
    if (composerPlan.recommendedIntent === "question") setFilter("questions")
    if (composerPlan.recommendedIntent === "win") {
      setFilter("wins")
      setChannel("#wins")
    }
    if (!body.trim()) setDraftStatus(composerPlan.nextAction)
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
  }, [])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      writeChatDraft({ body, title, intent, channel })
      setDraftStatus(body.trim() ? "Draft saved" : "")
    }, 500)
    return () => window.clearTimeout(timeout)
  }, [body, channel, intent, title])

  async function send() {
    if (!body.trim()) return
    await api("/api/chat", { method: "POST", body: JSON.stringify(buildChatDraftPayload({ body, channel, title, intent })) })
    setBody("")
    clearChatDraft()
    setDraftStatus("Sent")
    await refresh()
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
              <ChatChip label={composerPlan.headline} />
              {composerPlan.chips.map((chip) => <ChatChip key={chip} label={chip} />)}
            </div>
            {draftStatus ? <p className="mt-2 text-xs font-semibold text-success">{draftStatus}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <ToolbarButton label="Use suggestion" onClick={applyComposerPlan} icon={Sparkles} />
            <ToolbarButton label="Send" onClick={send} icon={Send} primary />
          </div>
        </div>
        <details className="mb-3 rounded-md border border-border bg-background p-3">
          <summary className="cursor-pointer text-sm font-semibold text-foreground">Channel signals</summary>
          <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <ChatSignal label="Threads" value={String(chatSummary.total)} />
            <ChatSignal label="Questions" value={String(chatSummary.questions)} />
            <ChatSignal label="Wins" value={String(chatSummary.wins)} />
            <ChatSignal label="Saved" value={String(chatSummary.saved)} />
            <ChatSignal label="Mentions" value={String(chatSummary.mentions)} />
            <ChatSignal label="Studio links" value={String(chatSummary.studioLinks)} />
          </div>
        </details>
        <div className="mb-3 flex flex-wrap gap-1 rounded-md border border-border bg-secondary p-1">
          {quickIntents.map((item) => (
            <ChatIntentButton key={item.id} active={intent === item.id} body={item.body} label={item.label} onClick={() => setIntent(item.id)} />
          ))}
        </div>
        <div className="rounded-md border border-input bg-background p-3">
          <textarea value={body} onChange={(event) => setBody(event.target.value)} className="min-h-32 w-full resize-none bg-transparent text-sm leading-6 text-foreground outline-none" placeholder="Share a study update, @mention a person, link a Studio item, or ask for a quick explanation..." />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            <div className="flex flex-wrap gap-2">
              <ComposerChip icon={AtSign} label="@mention" />
              <ComposerChip icon={Smile} label="reaction" />
              <ComposerChip icon={Languages} label="translate" />
              <ComposerChip icon={Bell} label="notify" />
            </div>
            <button onClick={() => { setBody(""); clearChatDraft(); setDraftStatus("Draft cleared") }} className="rounded-md bg-secondary px-2 py-1.5 text-xs font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground">Clear draft</button>
            <p className="text-xs text-muted-foreground">Private-first. Share only what belongs in the group.</p>
          </div>
        </div>
      </Panel>
      <Panel className={options.chatCompact ? "p-3" : "p-4"}>
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold text-foreground">Recent threads</h3>
          <span className="rounded-md bg-secondary px-2 py-1 text-xs font-semibold text-secondary-foreground">{visibleThreads.length}/{threads.length}</span>
        </div>
        {options.collaborationPresence ? <p className="mt-1 text-xs text-muted-foreground">Presence hints are enabled for group workflows.</p> : null}
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search threads" className="mt-3 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-ring" />
        <div className="mt-3 grid grid-cols-4 gap-1 rounded-md border border-border bg-background p-1">
          {(["all", "questions", "wins", "saved"] as ChatThreadFilter[]).map((item) => (
            <button key={item} onClick={() => setFilter(item)} className={`rounded-md px-2 py-1.5 text-xs font-semibold ${filter === item ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"}`}>
              {item}
            </button>
          ))}
        </div>
        <details className="mt-3 rounded-md border border-border bg-background p-2">
          <summary className="cursor-pointer text-xs font-semibold text-foreground">Thread actions</summary>
          <div className="mt-2 grid grid-cols-3 gap-1 rounded-md bg-secondary p-1">
            {["helpful", "save", "reply"].map((item) => (
              <button key={item} onClick={() => setReaction(item)} className={`rounded-md px-2 py-1.5 text-xs font-semibold ${reaction === item ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"}`}>
                {item}
              </button>
            ))}
          </div>
        </details>
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
            return (
            <div key={thread.id} className="rounded-md border border-border bg-background p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-foreground">{parsed.title}</p>
                  <p className="text-xs font-semibold text-muted-foreground">{parsed.channel}</p>
                </div>
                <span className="rounded-md bg-secondary px-2 py-1 text-[11px] font-semibold text-secondary-foreground">read</span>
              </div>
              <p className="mt-1 line-clamp-2 text-muted-foreground">{thread.last_message || "No messages yet"}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="inline-flex h-8 items-center gap-1.5 rounded-md bg-secondary px-2 text-xs font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground">
                  <Smile className="h-3.5 w-3.5" />
                  {reaction}
                </button>
                <button className="inline-flex h-8 items-center gap-1.5 rounded-md bg-secondary px-2 text-xs font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground">
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

function readChatDraft(): { body: string; title: string; intent: "update" | "question" | "win"; channel: string } | null {
  if (typeof window === "undefined") return null
  try {
    const stored = window.localStorage.getItem(CHAT_DRAFT_KEY)
    return stored ? JSON.parse(stored) : null
  } catch {
    return null
  }
}

function writeChatDraft(draft: { body: string; title: string; intent: "update" | "question" | "win"; channel: string }) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(CHAT_DRAFT_KEY, JSON.stringify(draft))
}

function clearChatDraft() {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(CHAT_DRAFT_KEY)
}

function ChatChip({ label }: { label: string }) {
  return <span className="rounded-md border border-border bg-background px-2 py-1 text-xs font-semibold text-muted-foreground">{label}</span>
}

function ChatSignal({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-2">
      <p className="text-[0.65rem] font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold leading-none text-foreground">{value}</p>
    </div>
  )
}

function ChatIntentButton({ active, body, label, onClick }: { active: boolean; body: string; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`group relative h-8 rounded px-3 text-xs font-semibold ${active ? "bg-primary text-primary-foreground" : "text-secondary-foreground hover:bg-accent hover:text-accent-foreground"}`}
      title={body}
    >
      {label}
      <span className="pointer-events-none absolute left-0 top-[calc(100%+0.35rem)] z-20 hidden w-52 rounded-md border border-border bg-popover p-2 text-left text-xs font-medium leading-5 text-popover-foreground shadow-lg group-hover:block group-focus-visible:block">
        {body}
      </span>
    </button>
  )
}

function ComposerChip({ icon: Icon, label }: { icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <span className="inline-flex h-8 items-center gap-1.5 rounded-md bg-secondary px-2 text-xs font-semibold text-secondary-foreground">
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  )
}

function ToolbarButton({
  icon: Icon,
  label,
  onClick,
  primary,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
  primary?: boolean
}) {
  return (
    <button onClick={onClick} className={`flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium ${primary ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground"}`}>
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </button>
  )
}
