"use client"

import { useEffect, useState } from "react"
import { Gamepad2, Loader2, Play, X } from "lucide-react"
import type { Quiz } from "../types"
import { api } from "../api"
import { ControlButton, StatusPill } from "../ui"
import { LIVE_QUIZ_MODES, LIVE_QUIZ_MODE_LABELS, type LiveQuizMode } from "@/lib/live/quiz-session"

/**
 * "Start a live game", from inside a conversation.
 *
 * Two choices and one button: which game, on which quiz. Everything after that
 * is the server's job — `POST /api/live-sessions` with the thread this composer
 * is pointed at creates the session, posts the invite card into the thread, and
 * remembers the thread on the session so the result can be posted back there
 * when the game ends.
 *
 * It lives in its own file rather than inline in the composer because the
 * composer is already the largest component in the app, and because this is the
 * kind of UI that grows (per-mode settings, a quiz preview) without ever
 * needing to touch the message box it was launched from.
 */

/** A sentence per mode, so the choice is a rule and not just a name. */
const MODE_DETAILS: Record<LiveQuizMode, string> = {
  race: "Everyone answers every question. Base points plus a bonus for speed.",
  survival: "A wrong answer eliminates you. The last player standing wins.",
  streak: "Build a multiplier with consecutive correct answers — up to x3.",
}

export function LiveGameLauncher({
  threadId,
  groupId,
  targetUserId,
  onLaunched,
  onClose,
}: {
  threadId: string
  groupId?: string
  targetUserId?: string
  onLaunched: (code: string, threadId: string) => void
  onClose: () => void
}) {
  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [quizId, setQuizId] = useState("")
  const [mode, setMode] = useState<LiveQuizMode>("race")
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState("")

  useEffect(() => {
    let cancelled = false
    api<{ items: Quiz[] }>("/api/quizzes")
      .then((response) => {
        if (cancelled) return
        setQuizzes(response.items || [])
        setQuizId((current) => current || response.items?.[0]?.id || "")
      })
      .catch(() => {
        if (!cancelled) setStatus("Could not load your quizzes.")
      })
    return () => {
      cancelled = true
    }
  }, [])

  const selected = quizzes.find((quiz) => quiz.id === quizId) || null

  async function start() {
    if (busy) return
    if (!selected) {
      setStatus("Add a quiz first — a live game needs questions to ask.")
      return
    }
    setBusy(true)
    setStatus("")
    try {
      const response = await api<{ item: { code: string }; threadId?: string }>("/api/live-sessions", {
        method: "POST",
        body: JSON.stringify({
          quizId: selected.id,
          title: selected.title,
          mode,
          ...(threadId ? { threadId } : {}),
          ...(groupId ? { groupId } : {}),
          ...(targetUserId ? { targetUserId } : {}),
        }),
      })
      onLaunched(response.item.code, response.threadId || threadId)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not start that game.")
      setBusy(false)
    }
  }

  return (
    <div data-live-game="launcher" className="mb-2 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Gamepad2 className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold text-foreground">Start a live game</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the live game launcher"
          className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        The game is posted into this conversation so everyone here can join with the code.
      </p>

      <fieldset className="mt-3 grid gap-2" disabled={busy}>
        <legend className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Game mode</legend>
        {LIVE_QUIZ_MODES.map((candidate) => (
          <button
            key={candidate}
            type="button"
            onClick={() => setMode(candidate)}
            aria-pressed={mode === candidate}
            className={`flex items-start gap-2 rounded-xl border p-2.5 text-left transition ${
              mode === candidate ? "border-primary/50 bg-primary/10" : "border-border bg-background hover:bg-accent"
            }`}
          >
            <span className="min-w-0">
              <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                {LIVE_QUIZ_MODE_LABELS[candidate]}
                {mode === candidate ? <StatusPill label="Selected" tone="primary" /> : null}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{MODE_DETAILS[candidate]}</span>
            </span>
          </button>
        ))}
      </fieldset>

      <label className="mt-3 grid gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Quiz
        <select
          value={quizId}
          onChange={(event) => setQuizId(event.target.value)}
          disabled={busy || !quizzes.length}
          className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm font-normal tracking-normal text-foreground"
        >
          {quizzes.length ? (
            quizzes.map((quiz) => (
              <option key={quiz.id} value={quiz.id}>
                {quiz.title}
                {quiz.question_count ? ` (${quiz.question_count} questions)` : ""}
              </option>
            ))
          ) : (
            <option value="">No quizzes yet</option>
          )}
        </select>
      </label>

      <div className="mt-3 flex items-center justify-between gap-2">
        <ControlButton onClick={start} disabled={busy || !quizzes.length} active>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Start game
        </ControlButton>
        <p className="text-right text-xs text-muted-foreground">{status || (selected ? `${LIVE_QUIZ_MODE_LABELS[mode]} on ${selected.title}` : "Pick a quiz")}</p>
      </div>
    </div>
  )
}
