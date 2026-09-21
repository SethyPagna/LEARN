"use client"

import { useCallback, useEffect, useState } from "react"
import { Gamepad2, Loader2, Play, RefreshCw, Trophy, Users } from "lucide-react"
import { api, formatDate } from "../api"
import { ControlButton, StatusPill } from "../ui"
import {
  LIVE_QUIZ_MODE_LABELS,
  leaderboard,
  type LiveQuizMode,
  type LiveQuizSession,
} from "@/lib/live/quiz-session"
import type { LiveGameInvite, LiveGameResult } from "@/lib/live/game-invite"

/**
 * The two chat message types a live game adds — a launch card and a result
 * card.
 *
 * Both are rendered from `metadata` on an ordinary chat message; neither owns
 * any game state. The launch card reads the *current* session when it is
 * allowed to (host or player) so the thread shows "3 joined" without the thread
 * having to be told; a viewer who has not joined yet sees the code and the Join
 * button and nothing else, because the state endpoint refuses them — which is
 * the correct behaviour, not an error to surface.
 */

/** A mode's badge colour. Decorative only: every badge also carries the word. */
const MODE_TONES: Record<LiveQuizMode, "primary" | "watch" | "steady" | "neutral"> = {
  race: "primary",
  survival: "watch",
  streak: "steady",
}

const MODE_BLURBS: Record<LiveQuizMode, string> = {
  race: "Fastest correct answers score highest.",
  survival: "One wrong answer and you are out. Last one standing wins.",
  streak: "Consecutive correct answers multiply your score, up to x3.",
}

interface LiveSnapshot {
  phase: string
  participantCount: number
  top: { name: string; score: number } | null
}

/**
 * One best-effort read of a session, for a card that wants to say "3 joined".
 *
 * Deliberately not a poll: a thread can hold many cards, and a card is a
 * preview, not a scoreboard. It refreshes on mount and whenever the tab comes
 * back, which is when a reader is actually looking at it.
 */
function useLiveSnapshot(code: string) {
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null)

  const load = useCallback(async () => {
    try {
      const response = await api<{ item: { session: LiveQuizSession } }>(`/api/live-sessions/${code}`)
      const session = response.item.session
      const leader = leaderboard(session)[0] ?? null
      setSnapshot({
        phase: session.phase,
        participantCount: session.participants.length,
        top: leader ? { name: leader.name, score: leader.score } : null,
      })
    } catch {
      // Not the host, not a player, or offline: the card stays minimal.
    }
  }, [code])

  useEffect(() => {
    void load()
    function onVisibility() {
      if (!document.hidden) void load()
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => document.removeEventListener("visibilitychange", onVisibility)
  }, [load])

  return snapshot
}

function phaseLabel(phase: string): string {
  if (phase === "lobby") return "Waiting for players"
  if (phase === "finished") return "Finished"
  return "Playing now"
}

/** The URL the Join button goes to: the player screen, already pointed at a code. */
export function liveGameJoinHref(code: string): string {
  return `/live?code=${encodeURIComponent(code)}`
}

export function LiveGameCard({
  invite,
  createdAt,
  alignRight,
}: {
  invite: LiveGameInvite
  createdAt: string
  alignRight: boolean
}) {
  const snapshot = useLiveSnapshot(invite.code)

  return (
    <div
      data-live-game="invite"
      className={`w-full max-w-sm rounded-2xl border border-border bg-card p-4 shadow-sm ${alignRight ? "ml-auto" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Gamepad2 className="h-4 w-4 shrink-0 text-primary" />
          <p className="min-w-0 truncate text-sm font-semibold text-foreground">{invite.quizTitle}</p>
        </div>
        <StatusPill label={LIVE_QUIZ_MODE_LABELS[invite.mode]} tone={MODE_TONES[invite.mode]} />
      </div>

      <p className="mt-1 text-xs text-muted-foreground">{MODE_BLURBS[invite.mode]}</p>

      <div className="mt-3 rounded-xl bg-muted px-3 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Join with code</p>
        <p className="live-code text-2xl font-bold text-foreground" data-testid="live-game-card-code">
          {invite.code}
        </p>
      </div>

      <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        <Users className="h-3.5 w-3.5 shrink-0" />
        {snapshot
          ? `${snapshot.participantCount} in the lobby · ${phaseLabel(snapshot.phase)}${snapshot.top ? ` · ${snapshot.top.name} leads on ${snapshot.top.score}` : ""}`
          : "Starting up — join to see who is in."}
      </p>

      <div className="mt-3 flex items-center justify-between gap-2">
        <a
          href={liveGameJoinHref(invite.code)}
          className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          <Play className="h-4 w-4" /> Join game
        </a>
        <span className="text-[11px] text-muted-foreground">{formatDate(createdAt)}</span>
      </div>
    </div>
  )
}

export function LiveGameResultCard({
  result,
  createdAt,
  threadId,
  alignRight,
}: {
  result: LiveGameResult
  createdAt: string
  /** Where "Play again" posts its invite. Without one, it still starts a game. */
  threadId: string
  alignRight: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState("")

  async function playAgain() {
    if (busy) return
    setBusy(true)
    setStatus("")
    try {
      const response = await api<{ item: { code: string } }>("/api/live-sessions", {
        method: "POST",
        body: JSON.stringify({
          quizId: result.quizId,
          title: result.quizTitle,
          mode: result.mode,
          ...(threadId ? { threadId } : {}),
        }),
      })
      window.location.href = liveGameJoinHref(response.item.code)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not start another game.")
      setBusy(false)
    }
  }

  return (
    <div
      data-live-game="result"
      className={`w-full max-w-sm rounded-2xl border border-border bg-card p-4 shadow-sm ${alignRight ? "ml-auto" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Trophy className="h-4 w-4 shrink-0 text-primary" />
          <p className="min-w-0 truncate text-sm font-semibold text-foreground">{result.quizTitle}</p>
        </div>
        <StatusPill label={LIVE_QUIZ_MODE_LABELS[result.mode]} tone={MODE_TONES[result.mode]} />
      </div>

      <p className="mt-1 text-xs text-muted-foreground">
        Final standings · code {result.code}
      </p>

      {result.participants.length ? (
        <ol className="mt-3 grid gap-1.5">
          {result.participants.map((entry) => (
            <li key={`${entry.rank}-${entry.participantId}`} className="flex items-center justify-between gap-3 rounded-xl bg-muted px-3 py-2">
              <span className="flex min-w-0 items-center gap-2">
                <span className="w-5 shrink-0 text-xs font-bold tabular-nums text-muted-foreground">{entry.rank}</span>
                <span className="min-w-0 truncate text-sm font-semibold text-foreground">{entry.name}</span>
              </span>
              <span className="shrink-0 text-sm font-bold tabular-nums text-foreground">{entry.score}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">Nobody joined this game.</p>
      )}

      <div className="mt-3 flex items-center justify-between gap-2">
        <ControlButton size="compact" onClick={playAgain} disabled={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Play again
        </ControlButton>
        <span className="text-[11px] text-muted-foreground">{status || formatDate(createdAt)}</span>
      </div>
    </div>
  )
}
