"use client"

import { useCallback, useEffect, useMemo, useState, type ComponentType } from "react"
import { ArrowRight, CircleHelp, Dumbbell, Flame, Gamepad2, Layers, Plus, RotateCcw, Users } from "lucide-react"
import { readDesignDrafts } from "@/lib/design/draft"
import { formatRelativeTime } from "@/lib/format-time"
import { buddyLine, buddyMood, greetingFor, mergeRecent } from "@/lib/today"
import type { TodayData, TodayProject, TodayProjectKind } from "@/lib/today-data"
import { api } from "../api"
import { Buddy } from "../buddy"
import { openCreateMenu } from "../create-menu"
import { KindArt } from "../kind-art"
import { openPlaceGuide } from "../place-guide"
import { projectHref, projectKinds } from "../studio-projects"

/**
 * Today: the companion home. The buddy greets you and reacts to your streak,
 * three cards say what to do next (continue, review or practice, play), and
 * your latest projects sit underneath. Everything comes from `/api/today`,
 * which reads real activity only.
 */

type Tone = "violet" | "blue" | "mint" | "coral" | "amber" | "pink"
type Icon = ComponentType<{ className?: string }>

const RECENT_LIMIT = 5

function PlanCard({ icon: Icon, label, title, tone, kind, onClick }: {
  icon: Icon
  label: string
  title: string
  tone?: Tone
  kind?: TodayProjectKind
  onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} className="today-plan-card" data-tone={tone} data-project-kind={kind}>
      <span className="today-plan-icon" aria-hidden="true"><Icon className="h-5 w-5" /></span>
      <span className="min-w-0 flex-1">
        <span className="today-plan-label">{label}</span>
        <span className="today-plan-title">{title}</span>
      </span>
      <ArrowRight className="today-plan-go h-4 w-4 shrink-0" aria-hidden="true" />
    </button>
  )
}

function StreakRing({ streak, studiedToday }: { streak: number; studiedToday: boolean }) {
  const radius = 26
  const circumference = 2 * Math.PI * radius
  const filled = Math.min(streak, 7) / 7
  return (
    <div className="today-ring" data-lit={studiedToday || undefined} role="img" aria-label={`${streak}-day streak`}>
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle className="today-ring-track" cx="32" cy="32" r={radius} />
        {/* A zero-length dash with round caps would still draw a dot. */}
        {filled > 0 ? <circle className="today-ring-fill" cx="32" cy="32" r={radius} strokeDasharray={`${circumference * filled} ${circumference}`} /> : null}
      </svg>
      <span className="today-ring-count" aria-hidden="true"><Flame className="h-3.5 w-3.5" />{streak}</span>
    </div>
  )
}

function WeekStrip({ week, today }: { week: TodayData["streak"]["week"]; today: string }) {
  return (
    <ol className="today-week" aria-label="Last 7 days">
      {week.map(({ day, active }) => {
        const date = new Date(`${day}T00:00:00Z`)
        const initial = date.toLocaleDateString(undefined, { weekday: "narrow", timeZone: "UTC" })
        const name = date.toLocaleDateString(undefined, { weekday: "long", timeZone: "UTC" })
        return (
          <li key={day} data-active={active || undefined} data-today={day === today || undefined}>
            <span className="today-week-dot" aria-hidden="true" />
            <span className="today-week-day" aria-hidden="true">{initial}</span>
            <span className="sr-only">{name}: {active ? "studied" : "no study"}</span>
          </li>
        )
      })}
    </ol>
  )
}

function RecentCover({ project, onOpen }: { project: TodayProject; onOpen: (project: TodayProject) => void }) {
  const Icon = projectKinds[project.kind].icon
  const title = project.title || "Untitled"
  return (
    <li>
      <button type="button" className="today-cover" data-project-kind={project.kind} onClick={() => onOpen(project)} aria-label={`Open ${title}`}>
        <span className="today-cover-art"><KindArt kind={project.kind} /></span>
        <span className="today-cover-caption">
          <span className="studio-project-icon rounded-md p-1" aria-hidden="true"><Icon className="h-3.5 w-3.5" /></span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{title}</span>
            <span className="block text-xs text-muted-foreground">{formatRelativeTime(project.updatedAt) || projectKinds[project.kind].label}</span>
          </span>
        </span>
      </button>
    </li>
  )
}

function TodaySkeleton() {
  return (
    <div className="today" aria-busy="true">
      <p role="status" className="sr-only">Loading your day…</p>
      <div className="today-hero today-skeleton-block" style={{ minHeight: 140 }} />
      <div className="today-plan">{[0, 1, 2].map((index) => <div key={index} className="today-skeleton-block" style={{ minHeight: 76 }} />)}</div>
    </div>
  )
}

export function TodayView({ onOpen }: { onOpen: (href: string) => void }) {
  const [data, setData] = useState<TodayData | null>(null)
  const [error, setError] = useState("")
  const [hour, setHour] = useState(12)

  const load = useCallback(async () => {
    setError("")
    try {
      const next = await api<TodayData>(`/api/today?tz=${new Date().getTimezoneOffset()}`)
      setHour(new Date().getHours())
      setData(next)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Today couldn't load.")
    }
  }, [])

  useEffect(() => { void load() }, [load])

  // Canvas designs that are only saved in this browser still count as recent work.
  const projects = useMemo(() => {
    if (!data) return []
    const drafts = readDesignDrafts().map((draft): TodayProject => ({ kind: "canvas", id: draft.id, title: draft.title, updatedAt: draft.updatedAt }))
    return mergeRecent(data.projects, drafts, RECENT_LIMIT)
  }, [data])

  if (error && !data) {
    return (
      <div className="today">
        <p role="alert" className="flex items-center justify-between gap-3 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
          {error}
          <button type="button" onClick={() => void load()} className="flex min-h-9 items-center gap-1.5 rounded-lg px-3 font-medium hover:bg-destructive/10"><RotateCcw className="h-4 w-4" />Retry</button>
        </p>
      </div>
    )
  }
  if (!data) return <TodaySkeleton />

  const { streak, liveGame } = data
  const mood = buddyMood(streak, hour)
  const [latest, ...older] = projects
  const openProject = (project: TodayProject) => onOpen(projectHref({ id: project.id, kind: project.kind, title: project.title }))

  return (
    <div className="today">
      <section className="today-hero" aria-labelledby="today-greeting">
        <Buddy mood={mood} size={88} className="today-buddy" />
        <div className="today-hello min-w-0">
          <h2 id="today-greeting" className="today-greeting">{greetingFor(hour)}, {data.firstName}</h2>
          <p className="today-line">{buddyLine(streak, hour)}</p>
        </div>
        <WeekStrip week={streak.week} today={data.today} />
        <StreakRing streak={streak.streak} studiedToday={streak.studiedToday} />
      </section>

      <section className="today-plan" aria-label="Today's plan">
        {latest
          ? <PlanCard icon={projectKinds[latest.kind].icon} kind={latest.kind} label="Continue" title={latest.title || "Untitled"} onClick={() => openProject(latest)} />
          : <PlanCard icon={Plus} tone="violet" label="Create" title="Start something new" onClick={openCreateMenu} />}
        {data.reviewsDue > 0
          ? <PlanCard icon={Layers} tone="blue" label="Review" title={`${data.reviewsDue} ${data.reviewsDue === 1 ? "card" : "cards"} due`} onClick={() => onOpen("/reviews")} />
          : <PlanCard icon={Dumbbell} tone="mint" label="Practice" title="Quiz yourself" onClick={() => onOpen("/practice")} />}
        {liveGame
          ? <PlanCard icon={Users} tone="pink" label={`${liveGame.hostName || "A friend"} invited you`} title={liveGame.quizTitle || "Live quiz"} onClick={() => onOpen(`/live?code=${encodeURIComponent(liveGame.code)}`)} />
          : <PlanCard icon={Gamepad2} tone="coral" label="Play" title="Live quiz" onClick={() => onOpen("/live")} />}
      </section>

      {older.length ? (
        <section aria-labelledby="today-recent" className="today-recent">
          <h3 id="today-recent" className="text-xs font-medium text-muted-foreground">Recent</h3>
          <ul className="today-covers">{older.map((project) => <RecentCover key={`${project.kind}:${project.id}`} project={project} onOpen={openProject} />)}</ul>
        </section>
      ) : null}

      <button type="button" onClick={openPlaceGuide} aria-label="What can LEARN do?" title="Help" className="editor-command justify-self-start"><CircleHelp className="h-4 w-4" /></button>
    </div>
  )
}
