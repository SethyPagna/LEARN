"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  CheckCircle2,
  Copy,
  Flag,
  Hourglass,
  Loader2,
  Play,
  Radio,
  RotateCcw,
  SkipForward,
  Trophy,
  Users,
  XCircle,
} from "lucide-react"
import type { Quiz, User } from "../types"
import { api } from "../api"
import { PracticeDesign } from "../practice-design"
import { ControlButton, EmptyState, Panel, StatusPill } from "../ui"
import {
  JOIN_CODE_LENGTH,
  LIVE_QUIZ_MODES,
  LIVE_QUIZ_MODE_LABELS,
  answerWindowOpen,
  currentQuestion,
  findParticipant,
  leaderboard,
  normalizeJoinCode,
  remainingMs,
  streakMultiplier,
  type LiveQuizMode,
  type LiveQuizParticipant,
  type LiveQuizSession,
  type LiveResultsSummary,
} from "@/lib/live/quiz-session"

/**
 * The live quiz screen: a host view and a player view in one component.
 *
 * Synchronisation is polling of the state endpoint — see the comment on
 * `/api/live-sessions/[code]/route.ts` for why. `POLL_OPEN_MS` is short enough
 * that a question change feels immediate (the state is a single small row plus
 * a roster) and long enough that a 30-player game is not a request storm;
 * `POLL_HIDDEN_MS` keeps a pocketed phone from spending the whole lesson
 * polling a screen nobody is looking at.
 */
const POLL_OPEN_MS = 800
const POLL_HIDDEN_MS = 4000
const TIMER_TICK_MS = 200

/**
 * Answer-button colours, in the order a question's choices are shown.
 *
 * Four fixed hues mean a returning player learns "top-left is red" without
 * reading, which is the whole point of the format. They are decorative, never
 * the only signal: every button carries its text, and correctness is stated in
 * words on the reveal.
 */
const CHOICE_STYLES = [
  { surface: "border-rose-500/45 bg-rose-500/12", active: "border-rose-500 bg-rose-500 text-white", dot: "bg-rose-500" },
  { surface: "border-sky-500/45 bg-sky-500/12", active: "border-sky-500 bg-sky-500 text-white", dot: "bg-sky-500" },
  { surface: "border-amber-500/45 bg-amber-500/12", active: "border-amber-500 bg-amber-500 text-white", dot: "bg-amber-500" },
  { surface: "border-emerald-500/45 bg-emerald-500/12", active: "border-emerald-500 bg-emerald-500 text-white", dot: "bg-emerald-500" },
] as const

const LIVE_PRESET_CSS = `
.learn-live-soft {
  --live-radius: 18px;
  --live-radius-sm: 12px;
  --live-shadow: 0 1px 2px rgba(15, 23, 42, 0.04), 0 20px 44px -30px rgba(15, 23, 42, 0.38);
  --live-shadow-soft: 0 12px 26px -20px rgba(15, 23, 42, 0.42);
}
.learn-live-soft .live-panel {
  border: 0;
  border-radius: var(--live-radius);
  box-shadow: var(--live-shadow);
}
.learn-live-soft .live-soft {
  border-radius: var(--live-radius-sm);
  background: var(--muted);
}
.learn-live-soft .live-code {
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.34em;
  text-indent: 0.34em;
  word-break: break-word;
}
.learn-live-soft .live-choice {
  transition: transform 160ms ease, background 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
}
.learn-live-soft .live-choice:not(:disabled):hover {
  transform: translateY(-1px);
  box-shadow: var(--live-shadow-soft);
}
.learn-live-soft .live-bar {
  transition: width 220ms linear;
}
.learn-live-soft .live-meter {
  transition: width 320ms ease;
}
`

interface LiveItem {
  id: string
  code: string
  serverNow: number
  session: LiveQuizSession
  summary?: LiveResultsSummary
  viewer: { isHost: boolean; isParticipant: boolean; participantId: string }
}

interface AnswerFeedback {
  questionId: string
  choiceId: string
  correct: boolean
  points: number
}

function choiceColumns(count: number) {
  return count <= 4 ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3"
}

/**
 * The join code in `?code=`, if the player arrived from a game card in a chat
 * thread.
 *
 * Read from the URL rather than passed as a prop: a card links to the existing
 * `/live` route (`/live?code=ABC234`), and this view is mounted by the shell
 * without knowing why it was opened. Guarded for the server render, where there
 * is no `window` and therefore no query to honour.
 */
function joinCodeFromUrl(): string {
  if (typeof window === "undefined") return ""
  return normalizeJoinCode(new URLSearchParams(window.location.search).get("code")) || ""
}

function phaseLabel(session: LiveQuizSession, viewer: LiveItem["viewer"]) {
  if (session.phase === "lobby") return "Lobby"
  if (session.phase === "finished") return "Finished"
  if (session.phase === "reveal") return "Answer revealed"
  return viewer.isHost ? "Question live" : "Answer now"
}

export function LiveQuizView({ quizzes, user }: { quizzes: Quiz[]; user: User | null }) {
  const [mode, setMode] = useState<"choose" | "host" | "play">("choose")
  const [selectedQuizId, setSelectedQuizId] = useState("")
  const [selectedGameMode, setSelectedGameMode] = useState<LiveQuizMode>("race")
  // Pre-filled from `?code=`, so a card in a thread drops the player into the
  // lobby without a retype.
  const [joinInput, setJoinInput] = useState(() => joinCodeFromUrl())
  const [item, setItem] = useState<LiveItem | null>(null)
  const [status, setStatus] = useState("")
  const [busy, setBusy] = useState("")
  const [feedback, setFeedback] = useState<AnswerFeedback | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [clockOffsetMs, setClockOffsetMs] = useState(0)
  const [copyLabel, setCopyLabel] = useState("Copy code")

  // The clock offset is measured once per payload; keeping it in a ref avoids
  // re-running the polling effect every time a poll lands.
  const offsetRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const liveCode = item?.code || ""

  const selectedQuiz = useMemo(
    () => quizzes.find((quiz) => quiz.id === selectedQuizId) || quizzes[0],
    [quizzes, selectedQuizId],
  )

  // ---------------------------------------------------------------------------
  // Transport: poll the state endpoint while a session is attached.
  // ---------------------------------------------------------------------------

  const applyItem = useCallback((next: LiveItem) => {
    if (typeof next.serverNow === "number" && next.serverNow > 0) {
      offsetRef.current = next.serverNow - Date.now()
      setClockOffsetMs(offsetRef.current)
    }
    setItem(next)
  }, [])

  useEffect(() => {
    if (!liveCode) return
    let cancelled = false

    async function poll() {
      try {
        const response = await api<{ item: LiveItem }>(`/api/live-sessions/${liveCode}`)
        if (cancelled) return
        applyItem(response.item)
        setStatus("")
      } catch (error) {
        if (cancelled) return
        setStatus(error instanceof Error ? error.message : "Lost contact with the live quiz.")
      }
      if (cancelled) return
      const hidden = typeof document !== "undefined" && document.hidden
      timerRef.current = setTimeout(poll, hidden ? POLL_HIDDEN_MS : POLL_OPEN_MS)
    }

    void poll()
    function onVisibilityChange() {
      // Re-poll immediately when the tab comes back, so a returning player sees
      // the current question rather than the one they left.
      if (!document.hidden) {
        if (timerRef.current) clearTimeout(timerRef.current)
        void poll()
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange)

    return () => {
      cancelled = true
      if (timerRef.current) clearTimeout(timerRef.current)
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [applyItem, liveCode])

  // Drives the countdown bar. Only runs while a question is on screen.
  useEffect(() => {
    if (item?.session.phase !== "question") return
    const handle = setInterval(() => setNow(Date.now()), TIMER_TICK_MS)
    setNow(Date.now())
    return () => clearInterval(handle)
  }, [item?.session.phase, item?.session.questionIndex, item?.session.questionStartedAt])

  const serverNowMs = () => Date.now() + offsetRef.current

  async function send(action: string, body: Record<string, unknown> = {}) {
    if (!liveCode) return null
    setBusy(action)
    try {
      const response = await api<{ item: LiveItem; correct?: boolean; points?: number }>(`/api/live-sessions/${liveCode}`, {
        method: "POST",
        body: JSON.stringify({ action, ...body }),
      })
      applyItem(response.item)
      setStatus("")
      return response
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "That did not work. Please try again.")
      return null
    } finally {
      setBusy("")
    }
  }

  async function createSession() {
    if (!selectedQuiz) {
      setStatus("Add a quiz first — a live session needs questions to ask.")
      return
    }
    setBusy("create")
    try {
      const response = await api<{ item: { id: string; code: string; session: LiveQuizSession } }>("/api/live-sessions", {
        method: "POST",
        body: JSON.stringify({ quizId: selectedQuiz.id, title: selectedQuiz.title, mode: selectedGameMode }),
      })
      setItem({
        id: response.item.id,
        code: response.item.code,
        serverNow: Date.now(),
        session: response.item.session,
        viewer: { isHost: true, isParticipant: false, participantId: "" },
      })
      setFeedback(null)
      setStatus("")
      setMode("host")
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to create a live session.")
    } finally {
      setBusy("")
    }
  }

  async function joinSession(codeOverride?: string) {
    const code = normalizeJoinCode(codeOverride ?? joinInput)
    if (!code) {
      setStatus(`Enter the ${JOIN_CODE_LENGTH}-character code shown on the host screen.`)
      return
    }
    setBusy("join")
    try {
      const response = await api<{ item: LiveItem }>(`/api/live-sessions/${code}`, {
        method: "POST",
        body: JSON.stringify({ action: "join" }),
      })
      applyItem(response.item)
      setFeedback(null)
      setStatus("")
      setMode("play")
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "That code did not work.")
    } finally {
      setBusy("")
    }
  }

  async function answer(questionId: string, choiceId: string) {
    const response = await send("answer", { questionId, choiceId })
    if (!response) return
    // The prompt says "one answer per question", so the buttons lock as soon as
    // the server accepts; a rejected late answer shows the message instead.
    setFeedback({ questionId, choiceId, correct: Boolean(response.correct), points: response.points || 0 })
  }

  function detach() {
    setItem(null)
    setFeedback(null)
    setStatus("")
    setMode("choose")
    setJoinInput("")
  }

  /**
   * Arriving from a game card: `/live?code=ABC234` joins straight away instead
   * of asking the player to retype a code they already have.
   *
   * One attempt only. A failed join — a stale code, a finished game — leaves
   * the form usable and the message on screen rather than retrying in a loop,
   * and the ref keeps it from firing again when `item` changes for other
   * reasons.
   */
  const autoJoinAttemptedRef = useRef(false)
  useEffect(() => {
    if (autoJoinAttemptedRef.current || item) return
    const code = joinCodeFromUrl()
    if (!code) return
    autoJoinAttemptedRef.current = true
    if (user) void joinSession(code)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, user])

  const session = item?.session ?? null
  const question = session ? currentQuestion(session) : null
  const viewer = item?.viewer ?? { isHost: false, isParticipant: false, participantId: "" }
  const remaining = session ? remainingMs(session, now + clockOffsetMs) : 0
  const windowOpen = session ? answerWindowOpen(session, now + clockOffsetMs) : false
  const me = session ? findParticipant(session, viewer.participantId) : null
  const answered = Boolean(me && question && me.answers.some((entry) => entry.questionId === question.id))
  // `survival`: out is out. The reducer refuses their answer anyway, so this is
  // the screen agreeing with the rule rather than a second enforcement of it.
  const eliminated = Boolean(me?.eliminated)
  const ranked = session ? leaderboard(session) : []

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <PracticeDesign allowFocus={false}><section className="learn-live-soft grid gap-3 sm:gap-4">
      <style>{LIVE_PRESET_CSS}</style>

      {status ? (
        <div className="live-soft px-4 py-3 text-sm text-muted-foreground" role="status">
          {status}
        </div>
      ) : null}

      {!session ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel className="live-panel p-4 sm:p-5">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Radio className="h-7 w-7 text-primary" />
            </div>
            <h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">Host</h2>

            {quizzes.length ? (
              <div className="mt-4 grid gap-3">
                <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Quiz
                  <select
                    value={selectedQuiz?.id || ""}
                    onChange={(event) => setSelectedQuizId(event.target.value)}
                    className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-normal tracking-normal text-foreground"
                  >
                    {quizzes.map((quiz) => (
                      <option key={quiz.id} value={quiz.id}>
                        {quiz.title}
                        {quiz.question_count ? ` (${quiz.question_count} questions)` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Game mode
                  <select
                    value={selectedGameMode}
                    onChange={(event) => setSelectedGameMode(event.target.value as LiveQuizMode)}
                    className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-normal tracking-normal text-foreground"
                  >
                    {LIVE_QUIZ_MODES.map((candidate) => (
                      <option key={candidate} value={candidate}>
                        {LIVE_QUIZ_MODE_LABELS[candidate]}
                      </option>
                    ))}
                  </select>
                </label>
                <ControlButton onClick={createSession} disabled={busy === "create"} className="h-11 w-full">
                  {busy === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  Create session
                </ControlButton>
              </div>
            ) : (
              <div className="mt-4">
                <EmptyState title="No quizzes yet" body="Create a quiz in Practice, then come back to run it live." />
              </div>
            )}
          </Panel>

          <Panel className="live-panel p-4 sm:p-5">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Users className="h-7 w-7 text-primary" />
            </div>
            <h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">Join</h2>

            <div className="mt-4 grid gap-3">
              <input
                value={joinInput}
                onChange={(event) => setJoinInput(event.target.value.toUpperCase())}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void joinSession()
                }}
                placeholder="ABC234"
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                aria-label="Join code"
                className="live-code h-14 w-full rounded-xl border border-border bg-background px-4 text-center text-2xl font-semibold uppercase text-foreground"
              />
              <ControlButton onClick={() => void joinSession()} disabled={busy === "join"} className="h-11 w-full">
                {busy === "join" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radio className="h-4 w-4" />}
                {user ? "Join game" : "Sign in to join"}
              </ControlButton>
            </div>
          </Panel>
        </div>
      ) : null}

      {/* ---------------------------------------------------------------- host */}
      {session && viewer.isHost ? (
        <div className="grid gap-3 sm:gap-4">
          <Panel className="live-panel p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{session.quizTitle}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {phaseLabel(session, viewer)} · {session.participants.length} joined
                  {session.questions.length ? ` · question ${Math.min(session.questionIndex + 1, session.questions.length)} of ${session.questions.length}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill label={LIVE_QUIZ_MODE_LABELS[session.mode]} tone="steady" />
                <StatusPill label={session.code} tone="primary" />
                <ControlButton size="compact" onClick={() => void navigator.clipboard?.writeText(session.code).then(() => setCopyLabel("Copied"), () => setCopyLabel("Copy failed"))}>
                  <Copy className="h-3.5 w-3.5" /> {copyLabel}
                </ControlButton>
                <ControlButton size="compact" destructive onClick={() => void send("close")} disabled={busy === "close"}>
                  <Flag className="h-3.5 w-3.5" /> End
                </ControlButton>
                <ControlButton size="compact" onClick={detach}>
                  Leave screen
                </ControlButton>
              </div>
            </div>

            <div className="live-soft mt-4 p-4 sm:p-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Join at this code</p>
              <p className="live-code mt-2 text-4xl font-bold text-foreground sm:text-6xl" data-testid="live-join-code">
                {session.code}
              </p>
              {session.phase === "lobby" ? (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <ControlButton onClick={() => void send("start")} disabled={busy === "start" || !session.participants.length} active>
                    <Play className="h-4 w-4" /> Start quiz
                  </ControlButton>
                  {!session.participants.length ? (
                    <span className="text-xs text-muted-foreground">Waiting for the first player to join…</span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </Panel>

          {session.phase === "lobby" ? (
            <Panel className="live-panel p-4 sm:p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">In the lobby</p>
              <RosterList participants={session.participants} emptyLabel="Nobody has joined yet. Read the code out loud." />
            </Panel>
          ) : null}

          {question && session.phase !== "lobby" ? (
            <Panel className="live-panel p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Question {session.questionIndex + 1} of {session.questions.length}
                </p>
                <StatusPill
                  label={session.phase === "question" ? `${Math.ceil(remaining / 1000)}s left` : "Locked"}
                  tone={remaining <= 5000 && session.phase === "question" ? "watch" : "neutral"}
                />
              </div>
              <h3 className="mt-2 text-lg font-semibold leading-6 tracking-tight sm:text-2xl">{question.prompt}</h3>
              <TimerBar remainingMs={remaining} limitMs={question.timeLimitSeconds * 1000} />
              <ChoiceGrid
                choices={question.choices}
                answers={session.participants.flatMap((participant) => participant.answers)}
                questionId={question.id}
                totalParticipants={session.participants.length}
                revealed={session.phase === "reveal"}
                correctChoiceId={question.correctChoiceId}
              />
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {session.phase === "question" ? (
                  <ControlButton onClick={() => void send("reveal")} disabled={busy === "reveal"}>
                    <CheckCircle2 className="h-4 w-4" /> Reveal answer
                  </ControlButton>
                ) : (
                  <ControlButton onClick={() => void send("next")} disabled={busy === "next"} active>
                    <SkipForward className="h-4 w-4" />
                    {session.questionIndex + 1 >= session.questions.length ? "Finish and save results" : "Next question"}
                  </ControlButton>
                )}
                <span className="text-xs text-muted-foreground">
                  {session.participants.reduce((total, participant) => total + participant.answers.filter((entry) => entry.questionId === question.id).length, 0)} of{" "}
                  {session.participants.length} answered
                </span>
              </div>
            </Panel>
          ) : null}

          {session.phase === "finished" ? (
            <Panel className="live-panel p-4 sm:p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Saved results</p>
              <h3 className="mt-1 flex items-center gap-2 text-lg font-semibold tracking-tight">
                <Trophy className="h-4 w-4" /> Final standings
              </h3>
              <LeaderboardTable participants={ranked} summary={item?.summary} meId={viewer.participantId} />
              <div className="mt-4 flex flex-wrap gap-2">
                <ControlButton onClick={detach}>
                  <RotateCcw className="h-4 w-4" /> Host another
                </ControlButton>
              </div>
            </Panel>
          ) : null}
        </div>
      ) : null}

      {/* -------------------------------------------------------------- player */}
      {session && !viewer.isHost ? (
        <div className="grid gap-3 sm:gap-4">
          <Panel className="live-panel p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{session.quizTitle}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {phaseLabel(session, viewer)}
                  {me ? ` · you are ${me.name}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {me ? <StatusPill label={`${me.score} pts`} tone="steady" /> : null}
                {me && session.mode === "streak" ? <StatusPill label={`${streakMultiplier(me)}x streak`} tone="primary" /> : null}
                {eliminated ? <StatusPill label="Out" tone="watch" /> : null}
                <StatusPill label={LIVE_QUIZ_MODE_LABELS[session.mode]} />
                <StatusPill label={session.code} />
              </div>
            </div>
          </Panel>

          {!viewer.isParticipant ? (
            <Panel className="live-panel p-4 sm:p-5">
              <EmptyState title="You are watching only" body="Join with the code on the host screen to answer questions." />
              <ControlButton className="mt-3" onClick={() => void joinSession()} disabled={busy === "join"}>
                <Radio className="h-4 w-4" /> Join this game
              </ControlButton>
            </Panel>
          ) : null}

          {session.phase === "lobby" ? (
            <Panel className="live-panel p-4 sm:p-5">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Hourglass className="h-4 w-4" /> You are in. Waiting for the host to start…
              </p>
              <RosterList participants={session.participants} emptyLabel="Waiting for players." meId={viewer.participantId} />
            </Panel>
          ) : null}

          {question && session.phase !== "lobby" && session.phase !== "finished" ? (
            <Panel className="live-panel p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Question {session.questionIndex + 1} of {session.questions.length}
                </p>
                {session.phase === "question" ? (
                  <StatusPill label={`${Math.ceil(remaining / 1000)}s`} tone={remaining <= 5000 ? "watch" : "neutral"} />
                ) : (
                  <StatusPill label={feedback?.correct ? "Correct" : "Answer shown"} tone={feedback?.correct ? "steady" : "neutral"} />
                )}
              </div>
              <h3 className="mt-2 text-lg font-semibold leading-6 tracking-tight sm:text-2xl">{question.prompt}</h3>
              <TimerBar remainingMs={remaining} limitMs={question.timeLimitSeconds * 1000} />

              {session.phase === "question" ? (
                <div className={`grid gap-2.5 ${choiceColumns(question.choices.length)}`}>
                  {question.choices.map((choice, index) => {
                    const style = CHOICE_STYLES[index % CHOICE_STYLES.length]
                        const picked = feedback?.questionId === question.id && feedback.choiceId === choice.id
                        const locked = answered || !windowOpen || eliminated
                    return (
                      <button
                        key={choice.id}
                        type="button"
                        onClick={() => void answer(question.id, choice.id)}
                        disabled={locked || Boolean(busy)}
                        data-picked={picked}
                        className={`live-choice flex min-h-[68px] items-center gap-2 rounded-2xl border p-3 text-left text-sm font-semibold text-foreground disabled:opacity-60 ${picked ? style.active : style.surface}`}
                      >
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${style.dot}`} aria-hidden />
                        <span className="min-w-0">{choice.text}</span>
                      </button>
                    )
                  })}
                </div>
              ) : null}

              {session.phase === "reveal" ? (
                <>
                  <ChoiceGrid
                    choices={question.choices}
                    answers={[]}
                    questionId={question.id}
                    totalParticipants={0}
                    revealed
                    correctChoiceId={question.correctChoiceId}
                    myChoiceId={feedback?.questionId === question.id ? feedback.choiceId : me?.answers.find((entry) => entry.questionId === question.id)?.choiceId}
                  />
                  <p className={`mt-3 flex items-center gap-2 text-sm font-semibold ${feedback?.correct ? "text-success" : "text-muted-foreground"}`}>
                    {feedback?.correct ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    {feedback?.correct
                      ? `Correct — ${feedback.points} points this round.`
                      : me?.answers.some((entry) => entry.questionId === question.id)
                        ? "Not this time. No points for this question."
                        : "No answer recorded for this question."}
                  </p>
                </>
              ) : null}

              {eliminated ? (
                <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                  <XCircle className="h-4 w-4" /> You are out — one wrong answer ends your game in Survival. Watch the rest
                  play out.
                </p>
              ) : null}

              {session.phase === "question" && !eliminated && (answered || !windowOpen) ? (
                <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                  {answered ? <CheckCircle2 className="h-4 w-4" /> : <Hourglass className="h-4 w-4" />}
                  {answered ? "Answer locked in. Waiting for the host." : "Time is up for this question."}
                </p>
              ) : null}
            </Panel>
          ) : null}

          {session.phase === "finished" ? (
            <Panel className="live-panel p-4 sm:p-5">
              <h3 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
                <Trophy className="h-4 w-4" /> Final standings
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {(() => {
                  const placement = ranked.findIndex((participant) => participant.id === viewer.participantId)
                  if (placement < 0) return "Thanks for playing."
                  return `You placed ${placement + 1} of ${ranked.length} with ${ranked[placement].score} points.`
                })()}
              </p>
              <LeaderboardTable participants={ranked} summary={item?.summary} meId={viewer.participantId} />
              <div className="mt-4">
                <ControlButton onClick={detach}>
                  <RotateCcw className="h-4 w-4" /> Leave
                </ControlButton>
              </div>
            </Panel>
          ) : null}
        </div>
      ) : null}
    </section></PracticeDesign>
  )
}

function TimerBar({ remainingMs: remaining, limitMs }: { remainingMs: number; limitMs: number }) {
  const ratio = limitMs > 0 ? Math.max(0, Math.min(1, remaining / limitMs)) : 0
  const tone = ratio <= 0.25 ? "bg-rose-500" : ratio <= 0.5 ? "bg-amber-500" : "bg-emerald-500"
  return (
    <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Time remaining" aria-valuemin={0} aria-valuemax={Math.round(limitMs / 1000)} aria-valuenow={Math.round(remaining / 1000)}>
      <div className={`live-bar h-full rounded-full ${tone}`} style={{ width: `${ratio * 100}%` }} />
    </div>
  )
}

function ChoiceGrid({
  choices,
  answers,
  questionId,
  totalParticipants,
  revealed,
  correctChoiceId,
  myChoiceId,
}: {
  choices: { id: string; text: string }[]
  answers: { questionId: string; choiceId: string }[]
  questionId: string
  totalParticipants: number
  revealed: boolean
  correctChoiceId: string
  myChoiceId?: string
}) {
  const counts = new Map<string, number>()
  for (const answer of answers) {
    if (answer.questionId !== questionId) continue
    counts.set(answer.choiceId, (counts.get(answer.choiceId) ?? 0) + 1)
  }
  const highest = Math.max(1, ...counts.values())

  return (
    <div className={`mt-4 grid gap-2.5 ${choiceColumns(choices.length)}`}>
      {choices.map((choice, index) => {
        const style = CHOICE_STYLES[index % CHOICE_STYLES.length]
        const count = counts.get(choice.id) ?? 0
        const isCorrect = revealed && choice.id === correctChoiceId
        const isMine = myChoiceId === choice.id
        return (
          <div
            key={choice.id}
            data-correct={isCorrect}
            className={`rounded-2xl border p-3 text-sm font-semibold ${isCorrect ? "border-success bg-success/12 text-foreground" : style.surface}`}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="flex min-w-0 items-start gap-2">
                <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${style.dot}`} aria-hidden />
                <span className="min-w-0">{choice.text}</span>
              </span>
              <span className="shrink-0 text-xs font-semibold text-muted-foreground">
                {isCorrect ? "Correct" : ""}
                {isCorrect && isMine ? " · your answer" : isMine ? " · your answer" : ""}
              </span>
            </div>
            {totalParticipants > 0 ? (
              <div className="mt-2 flex items-center gap-2">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-background/70">
                  <div className={`live-meter h-full rounded-full ${style.dot}`} style={{ width: `${(count / highest) * 100}%` }} />
                </div>
                <span className="w-12 shrink-0 text-right text-xs text-muted-foreground">
                  {count} / {totalParticipants}
                </span>
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function RosterList({
  participants,
  emptyLabel,
  meId = "",
}: {
  participants: LiveQuizParticipant[]
  emptyLabel: string
  meId?: string
}) {
  if (!participants.length) return <p className="mt-2 text-sm text-muted-foreground">{emptyLabel}</p>
  return (
    <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {participants.map((participant) => (
        <li
          key={participant.id}
          className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm ${participant.id === meId ? "border-primary/45 bg-primary/10" : "border-border bg-background"}`}
        >
          <span className="truncate font-semibold text-foreground">{participant.name}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{participant.score} pts</span>
        </li>
      ))}
    </ul>
  )
}

function LeaderboardTable({
  participants,
  summary,
  meId,
}: {
  participants: LiveQuizParticipant[]
  summary?: LiveResultsSummary
  meId: string
}) {
  if (!participants.length) return <p className="mt-2 text-sm text-muted-foreground">Nobody played this session.</p>
  return (
    <div className="mt-3 grid gap-3">
      <ol className="grid gap-2">
        {participants.map((participant, index) => {
          const result = summary?.participants.find((entry) => entry.participantId === participant.id)
          return (
            <li
              key={participant.id}
              className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 ${participant.id === meId ? "border-primary/45 bg-primary/10" : "border-border bg-background"}`}
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="w-7 shrink-0 text-sm font-bold tabular-nums text-muted-foreground">{index + 1}</span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-foreground">{participant.name}</span>
                  {result ? (
                    <span className="block text-xs text-muted-foreground">
                      {result.correctCount} correct · {Math.round(result.totalAnswerTimeMs / 100) / 10}s total
                    </span>
                  ) : null}
                </span>
              </span>
              <span className="shrink-0 text-sm font-bold tabular-nums text-foreground">{participant.score}</span>
            </li>
          )
        })}
      </ol>

      {summary?.questions.length ? (
        <div className="live-soft p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Per-question accuracy</p>
          <ul className="mt-2 grid gap-1.5">
            {summary.questions.map((question, index) => (
              <li key={question.questionId} className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span className="min-w-0 truncate">
                  Q{index + 1}. {question.prompt}
                </span>
                <span className="shrink-0 font-semibold text-foreground">
                  {question.correctCount}/{question.answeredCount} · {Math.round(question.accuracy * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">Ties are broken by total answer time, then by who joined first.</p>
    </div>
  )
}
