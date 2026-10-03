"use client"

import { useEffect, useState } from "react"
import { Check, Flame, Gamepad2, Loader2, Play, Shield, X, Zap } from "lucide-react"
import type { Quiz } from "../types"
import { api } from "../api"
import { ControlButton } from "../ui"
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

const MODE_DESIGNS = {
  race: { icon: Zap, tone: "text-[var(--decor-blue-ink)] bg-[var(--decor-blue-soft)]", rule: "Faster correct answers earn more points." },
  survival: { icon: Shield, tone: "text-[var(--decor-amber-ink)] bg-[var(--decor-amber-soft)]", rule: "One wrong answer and you're out." },
  streak: { icon: Flame, tone: "text-[var(--decor-violet-ink)] bg-[var(--decor-violet-soft)]", rule: "Correct answers build a multiplier up to ×3." },
}

export function LiveModePicker({ value, onChange, disabled }: { value: LiveQuizMode; onChange: (mode: LiveQuizMode) => void; disabled?: boolean }) {
  return <fieldset disabled={disabled} className="min-w-0">
    <legend className="sr-only">Game mode</legend>
    <div className="grid grid-cols-3 gap-2">
      {LIVE_QUIZ_MODES.map(mode => {
        const design = MODE_DESIGNS[mode]
        const Icon = design.icon
        return <button key={mode} type="button" aria-pressed={value === mode} title={design.rule} onClick={() => onChange(mode)} className={`relative flex min-w-0 flex-col items-center gap-2 rounded-xl border px-2 py-3 text-xs font-medium transition disabled:opacity-50 ${value === mode ? "border-primary bg-primary/5" : "border-border hover:bg-secondary"}`}>
          <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${design.tone}`}><Icon aria-hidden="true" className="h-5 w-5" /></span>
          <span>{LIVE_QUIZ_MODE_LABELS[mode]}</span>
          {value === mode ? <Check aria-hidden="true" className="absolute right-1.5 top-1.5 h-3 w-3 text-primary" /> : null}
        </button>
      })}
    </div>
    <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">{MODE_DESIGNS[value].rule}</p>
  </fieldset>
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
          <p className="text-sm font-semibold text-foreground">Live game</p>
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
      <div className="mt-3"><LiveModePicker value={mode} onChange={setMode} disabled={busy} /></div>

      <label className="mt-3 grid gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
        {status ? <p role="status" className="text-right text-xs text-muted-foreground">{status}</p> : null}
      </div>
    </div>
  )
}
