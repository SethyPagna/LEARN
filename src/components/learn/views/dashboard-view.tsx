"use client"

import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Brain,
  CalendarClock,
  CalendarDays,
  Clock3,
  Compass,
  FileText,
  Flame,
  Gamepad2,
  GitFork,
  ListChecks,
  MessageSquare,
  Plus,
  Repeat2,
  Rocket,
  Sparkles,
  Star,
  Target,
  Trophy,
  UploadCloud,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import type React from "react"
import { buildDashboardCommandPlan, buildDashboardEmptyStates, buildDashboardMetricTiles, buildDashboardQuickActionGroups, buildDashboardRecentWork, buildDashboardRouteActions, buildDashboardWeakTopicCards, type DashboardCommandTarget, type DashboardQuickActionIcon, type DashboardRecentWorkItem } from "@/lib/dashboard-features"
import { normalizeOnboardingPreferences, normalizeOnboardingStudioKind, normalizeOnboardingWorkflow, onboardingStudioKindOptions, onboardingTargetView, onboardingWorkflowOptions, shouldShowOnboarding, type OnboardingStudioKind, type OnboardingWorkflow } from "@/lib/onboarding-features"
import { formatRelativeTime } from "@/lib/format-time"
import { sectionTabForView, type SectionTab } from "@/lib/navigation"
import { api } from "../api"
import { openPlaceGuide } from "../place-guide"
import type { WorkspaceOptions } from "../preferences"
import type { DashboardData, Note, Quiz, User, View } from "../types"
import { StatusPill } from "../ui"
import type { PracticeDraftSummary } from "@/lib/practice-drafts"
import type { StudioDraftSummary } from "@/lib/studio-drafts"
import { toneSurfaceClasses } from "@/lib/design-system"

type IconComponent = React.ComponentType<{ className?: string }>
type MetricTone = "critical" | "steady" | "watch"

const dashboardCommandIcons: Record<DashboardCommandTarget, IconComponent> = {
  ai: Sparkles,
  calendar: CalendarDays,
  files: Plus,
  practice: BookOpen,
  studio: FileText,
}

const dashboardMetricIcons = {
  drafts: FileText,
  hours: Clock3,
  progress: BarChart3,
  reviews: Repeat2,
  streak: Trophy,
} satisfies Record<ReturnType<typeof buildDashboardMetricTiles>[number]["id"], IconComponent>

const recentWorkIcons = {
  ai: Sparkles,
  file: UploadCloud,
  practice: Gamepad2,
  studio: FileText,
} satisfies Record<DashboardRecentWorkItem["kind"], IconComponent>

/** Each kind of recent work wears the colour of the section it opens. */
const recentWorkTabs = {
  ai: "ai",
  file: "files",
  practice: "practice",
  studio: "studio",
} satisfies Record<DashboardRecentWorkItem["kind"], SectionTab>

const quickActionIcons = {
  brain: Brain,
  calendar: CalendarDays,
  compass: Compass,
  file: FileText,
  game: Gamepad2,
  graph: GitFork,
  message: MessageSquare,
  plus: Plus,
  repeat: Repeat2,
  stats: BarChart3,
} satisfies Record<DashboardQuickActionIcon, IconComponent>

const reviewMoves: ReadonlyArray<{ detail: string; icon: IconComponent; label: string; view: View }> = [
  { view: "quizzes", icon: ListChecks, label: "Take a quiz", detail: "Answer, check, and retry what you missed." },
  { view: "games", icon: Gamepad2, label: "Play a recall game", detail: "Timed matching and sprint rounds." },
  { view: "ai", icon: Sparkles, label: "Generate practice", detail: "Turn your notes into a quiz or flashcards." },
]

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"

export function DashboardView({
  dashboard,
  forceOnboarding = false,
  notes,
  openNote,
  quizzes,
  options,
  practiceDraftSummary,
  setView,
  studioDraftSummary,
  user,
}: {
  dashboard: DashboardData | null
  forceOnboarding?: boolean
  notes: Note[]
  openNote?: (id: string) => void
  quizzes: Quiz[]
  options: WorkspaceOptions
  practiceDraftSummary: PracticeDraftSummary
  setView: (view: View) => void
  studioDraftSummary: StudioDraftSummary
  user: User | null
}) {
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [now, setNow] = useState<Date | null>(null)
  const focusTopic = dashboard?.snapshot?.recommendedFocus?.find((topic) => topic.trim())
  const weakTopics = dashboard?.snapshot?.weakTopics || []
  const commandPlan = useMemo(
    () => buildDashboardCommandPlan({ noteCount: notes.length, quizCount: quizzes.length, snapshot: dashboard?.snapshot }),
    [dashboard?.snapshot, notes.length, quizzes.length],
  )
  const emptyStates = useMemo(
    () => buildDashboardEmptyStates({ noteCount: notes.length, quizCount: quizzes.length, snapshot: dashboard?.snapshot }),
    [dashboard?.snapshot, notes.length, quizzes.length],
  )
  const metricTiles = useMemo(
    () => buildDashboardMetricTiles({
      calendarDefaultMinutes: options.calendarDefaultMinutes,
      dailyGoalMinutes: Number(user?.preferences?.dailyGoalMinutes || 45),
      noteCount: notes.length,
      practiceDraftCount: practiceDraftSummary.count,
      quizCount: quizzes.length,
      snapshot: dashboard?.snapshot,
      studioDraftCount: studioDraftSummary.count,
      userMetrics: user?.metrics,
    }),
    [dashboard?.snapshot, notes.length, options.calendarDefaultMinutes, practiceDraftSummary.count, quizzes.length, studioDraftSummary.count, user?.metrics, user?.preferences],
  )
  const routeActions = useMemo(
    () => buildDashboardRouteActions({ noteCount: notes.length, quizCount: quizzes.length, snapshot: dashboard?.snapshot }),
    [dashboard?.snapshot, notes.length, quizzes.length],
  )
  const recentWork = useMemo(
    () => buildDashboardRecentWork({
      aiChats: dashboard?.chats ?? [],
      files: dashboard?.files ?? [],
      notes,
      quizAttempts: dashboard?.attempts ?? [],
    }),
    [dashboard?.attempts, dashboard?.chats, dashboard?.files, notes],
  )
  const weakTopicCards = useMemo(() => buildDashboardWeakTopicCards(weakTopics), [weakTopics])
  const actionGroups = useMemo(() => buildDashboardQuickActionGroups(), [])

  // Until the first load lands, every number on this page is a placeholder.
  const loading = dashboard === null
  const firstName = (user?.name || user?.username || "").trim().split(/\s+/)[0] || ""
  const todayMinutes = Math.max(0, Math.floor(Number(dashboard?.snapshot?.todayStudyMinutes ?? 0)))
  const goalMinutes = Math.max(5, Math.floor(Number(user?.preferences?.dailyGoalMinutes || 45)))
  const streak = Math.max(0, Math.floor(user?.metrics?.streakCurrent ?? 0))
  const xp = Math.max(0, Math.floor(user?.metrics?.xpTotal ?? 0))
  const [primaryAction, ...moreActions] = routeActions
  const PrimaryIcon = dashboardCommandIcons[primaryAction?.target ?? commandPlan.target]

  useEffect(() => {
    setShowOnboarding(shouldShowOnboarding({ force: forceOnboarding, preferences: user?.preferences }))
  }, [forceOnboarding, user?.preferences])

  // The greeting, the date and "3h ago" stamps read the viewer's own clock, so
  // they appear after mount; the server render says "Welcome back" instead of
  // guessing a time zone and mismatching on hydration.
  useEffect(() => {
    setNow(new Date())
  }, [])

  function openRecent(item: DashboardRecentWorkItem) {
    if (item.kind === "studio" && openNote && item.id.startsWith("studio:")) {
      openNote(item.id.slice("studio:".length))
      return
    }
    setView(item.target)
  }

  return (
    <div className="mx-auto grid w-full min-w-0 max-w-[1440px] gap-4 lg:gap-5">
      {showOnboarding ? <OnboardingCard setShowOnboarding={setShowOnboarding} setView={setView} /> : null}

      <section data-tab="home" aria-label="Today" className="learn-surface relative min-w-0 overflow-hidden">
        <span aria-hidden="true" className="learn-tab-dot absolute inset-y-0 left-0 w-1.5" />
        <span aria-hidden="true" className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-tab-home/25 blur-3xl" />
        <span aria-hidden="true" className="pointer-events-none absolute -bottom-36 right-1/3 h-64 w-64 rounded-full bg-tab-studio/15 blur-3xl" />
        <div className="relative grid gap-6 p-5 pl-6 sm:p-7 sm:pl-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">
              {now ? now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }) : "Today"}
            </p>
            <p className="mt-1 font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {greetingFor(now)}
              {firstName ? `, ${firstName}` : ""}
            </p>

            <p className="mt-6 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              <Target className="learn-tab-ink h-4 w-4" />
              Today&apos;s route
            </p>
            {loading ? (
              <div className="mt-2 grid gap-2.5" aria-hidden="true">
                <span className="h-7 w-2/3 max-w-md animate-pulse rounded-md bg-muted" />
                <span className="h-4 w-1/2 max-w-sm animate-pulse rounded-md bg-muted" />
                <span className="mt-3 flex gap-2">
                  <span className="h-11 w-44 animate-pulse rounded-xl bg-muted" />
                  <span className="h-11 w-28 animate-pulse rounded-xl bg-muted" />
                </span>
              </div>
            ) : (
              <>
                <h2 className="mt-1.5 break-words text-xl font-semibold leading-tight text-foreground md:text-2xl">{commandPlan.headline}</h2>
                <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">{commandPlan.detail}</p>
                <div className="mt-5 flex flex-wrap items-center gap-2">
                  {primaryAction ? (
                    <button
                      type="button"
                      onClick={() => setView(primaryAction.target)}
                      title={primaryAction.detail}
                      className={`inline-flex h-11 items-center gap-2 rounded-xl bg-primary pl-1.5 pr-4 text-sm font-semibold text-primary-foreground shadow-paper transition hover:-translate-y-0.5 hover:shadow-lift ${focusRing}`}
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-foreground/15">
                        <PrimaryIcon className="h-4 w-4" />
                      </span>
                      {primaryAction.label}
                      <ArrowRight className="h-4 w-4 opacity-80" />
                    </button>
                  ) : null}
                  {moreActions.map((action) => {
                    const Icon = dashboardCommandIcons[action.target]
                    return (
                      <button
                        key={action.id}
                        type="button"
                        data-tab={sectionTabForView(action.target)}
                        onClick={() => setView(action.target)}
                        title={action.detail}
                        className={`inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-background/70 px-3.5 text-sm font-medium text-foreground transition hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground ${focusRing}`}
                      >
                        <Icon className="learn-tab-ink h-4 w-4" />
                        {action.label}
                      </button>
                    )
                  })}
                </div>
                {commandPlan.chips.length ? (
                  <ul aria-label="Why this route" className="mt-4 flex flex-wrap gap-1.5">
                    {commandPlan.chips.map((chip) => (
                      <li key={chip} className="rounded-full border border-border bg-background/60 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                        {chip}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}
          </div>

          <div className="flex items-center gap-5 sm:gap-6 lg:flex-col lg:gap-4 lg:pr-1">
            <GoalRing goal={goalMinutes} loading={loading} minutes={todayMinutes} />
            <dl className="grid min-w-0 flex-1 grid-cols-2 gap-2 lg:w-full lg:flex-none">
              <HeroStat icon={Flame} label="Streak" tab="practice" value={`${streak} day${streak === 1 ? "" : "s"}`} />
              <HeroStat icon={Star} label="XP" tab="home" value={xp.toLocaleString()} />
            </dl>
          </div>
        </div>
      </section>

      {!loading && emptyStates.length ? (
        <section data-tab="home" aria-labelledby="dashboard-setup-heading" className="learn-surface relative min-w-0 p-4 sm:p-5">
          <span aria-hidden="true" className="learn-tab-dot absolute left-5 top-0 h-1 w-10 rounded-b-full" />
          <header className="flex items-center gap-3">
            <span className="learn-tab-wash learn-tab-ink flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
              <Rocket className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="dashboard-setup-heading" className="text-base font-semibold leading-tight text-foreground">Finish setting up</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {emptyStates.length} quick step{emptyStates.length === 1 ? "" : "s"} so LEARN can plan your day.
              </p>
            </div>
          </header>
          <ol className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {emptyStates.map((state, index) => {
              const Icon = dashboardCommandIcons[state.target]
              return (
                <li key={state.id} className="min-w-0">
                  <button
                    type="button"
                    data-tab={sectionTabForView(state.target)}
                    onClick={() => setView(state.target)}
                    className={`flex h-full w-full min-w-0 items-start gap-3 rounded-xl border border-border bg-background/60 p-3 text-left transition hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground ${focusRing}`}
                  >
                    <span className="learn-tab-wash learn-tab-ink flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-foreground">
                        {index + 1}. {state.title}
                      </span>
                      <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{state.detail}</span>
                      <span className="learn-tab-ink mt-1.5 inline-flex items-center gap-1 text-xs font-semibold">
                        {state.actionLabel}
                        <ArrowRight className="h-3 w-3" />
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
            <li className="min-w-0">
              <button
                type="button"
                onClick={openPlaceGuide}
                title="A one-sentence guide to every place in LEARN"
                className={`flex h-full w-full min-w-0 items-start gap-3 rounded-xl border border-dashed border-border p-3 text-left transition hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground ${focusRing}`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                  <Compass className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-foreground">New here? What&apos;s where</span>
                  <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">Every place in LEARN in one sentence.</span>
                </span>
              </button>
            </li>
          </ol>
        </section>
      ) : null}

      <ul aria-label="Today at a glance" className="dashboard-rail grid min-w-0 auto-cols-[minmax(160px,1fr)] grid-flow-col gap-3 overflow-x-auto pb-1 sm:grid-flow-row sm:grid-cols-3 sm:overflow-visible sm:pb-0 xl:grid-cols-5">
        {metricTiles.map((metric) => (
          <MetricTile key={metric.id} body={metric.detail} icon={dashboardMetricIcons[metric.id]} label={metric.label} loading={loading} tone={metric.tone} value={metric.value} />
        ))}
      </ul>

      <div className="grid min-w-0 gap-4 lg:gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 content-start gap-4 lg:gap-5">
          <DashboardCard
            action={<CardLink label="Open Studio" onClick={() => setView("studio")} />}
            icon={FileText}
            subtitle="Your latest pages, files, tutor chats and practice runs."
            tab="studio"
            title="Pick up where you left off"
          >
            {loading ? (
              <SkeletonTiles count={4} />
            ) : recentWork.length ? (
              <ul className="grid gap-2 sm:grid-cols-2">
                {recentWork.map((item) => {
                  const Icon = recentWorkIcons[item.kind]
                  const when = now && Date.parse(item.timestamp) > 0 ? formatRelativeTime(item.timestamp, now) : ""
                  return (
                    <li key={item.id} className="min-w-0">
                      <button
                        type="button"
                        data-tab={recentWorkTabs[item.kind]}
                        onClick={() => openRecent(item)}
                        className={`group flex w-full min-w-0 items-center gap-3 rounded-xl border border-border bg-background/60 p-2.5 text-left transition hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground ${focusRing}`}
                      >
                        <span className="learn-tab-wash learn-tab-ink flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
                          <Icon className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-foreground">{item.title}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {item.detail}
                            {when ? ` · ${when}` : ""}
                          </span>
                        </span>
                        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <EmptyAction
                action="Create something"
                body="Write a note, start a doc, or upload a file and it shows up here."
                icon={Plus}
                onClick={() => setView("studio")}
                title="Nothing here yet"
              />
            )}
          </DashboardCard>

          <DashboardCard
            action={<CardLink label="Practice" onClick={() => setView("practice")} />}
            icon={Brain}
            subtitle="Lowest accuracy first. Pick one to practise it."
            tab="practice"
            title="Weak topics"
          >
            {loading ? (
              <SkeletonTiles count={2} />
            ) : weakTopicCards.length ? (
              <ul className="grid gap-2 sm:grid-cols-2">
                {weakTopicCards.map((topic) => (
                  <li key={topic.label} className="min-w-0">
                    <button
                      type="button"
                      onClick={() => setView("practice")}
                      className={`grid w-full min-w-0 gap-2 rounded-xl border border-border bg-background/60 p-3 text-left transition hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground ${focusRing}`}
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate text-sm font-semibold text-foreground">{topic.label}</span>
                        <StatusPill label={`${topic.accuracy}%`} tone={topic.tone} />
                      </span>
                      {options.showWeakTopicBars ? (
                        <span aria-hidden="true" className="block h-2 overflow-hidden rounded-full bg-muted">
                          <span className={`block h-full rounded-full ${toneFillClass(topic.tone)}`} style={{ width: `${Math.max(6, topic.accuracy)}%` }} />
                        </span>
                      ) : null}
                      <span className="text-xs text-muted-foreground">
                        {topic.attempts} attempt{topic.attempts === 1 ? "" : "s"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyAction
                action="Start practising"
                body="Run a quiz or a game and LEARN will spot what needs more work."
                icon={Gamepad2}
                onClick={() => setView("practice")}
                title="No weak topics yet"
              />
            )}
          </DashboardCard>
        </div>

        <div className="grid min-w-0 content-start gap-4 lg:gap-5">
          <DashboardCard icon={Sparkles} subtitle="Opens with today's route, your drafts and weak topics as context." tab="ai" title="AI tutor">
            <div className="learn-tab-wash rounded-xl p-3">
              <p className="learn-tab-ink text-xs font-semibold uppercase tracking-[0.12em]">{focusTopic ? "Today's focus" : "Try asking"}</p>
              <p className="mt-1 text-sm font-medium text-foreground">
                {focusTopic ? `Review route for ${focusTopic}` : "Explain a topic from your notes, then quiz me on it."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setView("ai")}
              className={`mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 sm:w-auto ${focusRing}`}
            >
              <Sparkles className="h-4 w-4" />
              Open the tutor
            </button>
          </DashboardCard>

          <DashboardCard icon={Repeat2} subtitle="Turn recent work into recall." tab="practice" title="Review queue">
            <ul className="-mx-1 grid gap-0.5">
              {reviewMoves.map((move) => {
                const Icon = move.icon
                return (
                  <li key={move.view}>
                    <button
                      type="button"
                      onClick={() => setView(move.view)}
                      className={`group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-accent hover:text-accent-foreground ${focusRing}`}
                    >
                      <span className="learn-tab-wash learn-tab-ink flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-foreground">{move.label}</span>
                        <span className="block truncate text-xs text-muted-foreground">{move.detail}</span>
                      </span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100" />
                    </button>
                  </li>
                )
              })}
            </ul>
          </DashboardCard>

          <DashboardCard icon={CalendarClock} subtitle="Protect a study block before the day fills up." tab="calendar" title="Plan your time">
            <dl className="grid grid-cols-2 gap-2">
              <AgendaItem label="Focus block" value={`${options.calendarDefaultMinutes} min`} />
              <AgendaItem label="Starts in" value={`${options.calendarLeadMinutes} min`} />
            </dl>
            <button
              type="button"
              onClick={() => setView("calendar")}
              className={`mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground transition hover:bg-accent hover:text-accent-foreground sm:w-auto ${focusRing}`}
            >
              <CalendarDays className="learn-tab-ink h-4 w-4" />
              Plan a study block
            </button>
          </DashboardCard>
        </div>
      </div>

      <DashboardCard icon={Compass} subtitle="Every part of LEARN, grouped the way you work." tab="home" title="Jump to">
        <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
          {actionGroups.map((group) => (
            <div key={group.id} className="min-w-0">
              <h3 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{group.label}</h3>
              <ul className="grid gap-0.5">
                {group.actions.map((action) => {
                  const Icon = quickActionIcons[action.icon]
                  const target = action.target as View
                  return (
                    <li key={action.id} className="min-w-0">
                      <button
                        type="button"
                        data-tab={sectionTabForView(target)}
                        onClick={() => setView(target)}
                        className={`flex w-full min-w-0 items-center gap-2.5 rounded-lg p-1.5 text-left transition hover:bg-accent hover:text-accent-foreground ${focusRing}`}
                      >
                        <span className="learn-tab-wash learn-tab-ink flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-foreground">{action.label}</span>
                          <span className="block truncate text-xs text-muted-foreground">{action.detail}</span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      </DashboardCard>
    </div>
  )
}

function OnboardingCard({
  setShowOnboarding,
  setView,
}: {
  setShowOnboarding: (show: boolean) => void
  setView: (view: View) => void
}) {
  const [goal, setGoal] = useState("Build a reusable learning vault.")
  const [workflow, setWorkflow] = useState<OnboardingWorkflow>("create")
  const [studioKind, setStudioKind] = useState<OnboardingStudioKind>("notes")
  const [status, setStatus] = useState("")
  const [saving, setSaving] = useState(false)

  async function finishOnboarding() {
    setSaving(true)
    setStatus("")
    const preferences = normalizeOnboardingPreferences({
      firstStudioKind: studioKind,
      learningGoal: goal,
      preferredWorkflow: workflow,
    })
    try {
      await api("/api/preferences", {
        method: "PUT",
        body: JSON.stringify(preferences),
      })
      setShowOnboarding(false)
      setView(onboardingTargetView(preferences))
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to save onboarding.")
    } finally {
      setSaving(false)
    }
  }

  const fieldClass = "mt-2 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30"

  return (
    <section data-tab="ai" aria-labelledby="onboarding-heading" className="learn-surface relative min-w-0 overflow-hidden p-5 sm:p-6">
      <span aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-tab-ai/20 blur-3xl" />
      <span aria-hidden="true" className="learn-tab-dot absolute left-6 top-0 h-1 w-12 rounded-b-full" />
      <div className="relative grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px] lg:items-start">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">First run</span>
            <StatusPill label="3 steps" tone="steady" />
          </div>
          <h2 id="onboarding-heading" className="text-2xl font-semibold tracking-tight text-foreground">Set up your learning loop.</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Pick a goal, your first useful move, and where Studio should start. You can change all of this later in Settings.</p>
          <button
            type="button"
            onClick={openPlaceGuide}
            data-testid="first-run-place-guide"
            title="A one-sentence guide to every place in LEARN"
            className="-ml-1.5 mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-lg px-1.5 py-1 text-sm text-muted-foreground transition hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Compass className="h-3.5 w-3.5 shrink-0" />
            <span>Not sure where things are? <span className="font-semibold text-foreground">What can LEARN do?</span></span>
          </button>
          {status ? <p role="alert" className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive">{status}</p> : null}
        </div>
        <button
          type="button"
          onClick={finishOnboarding}
          disabled={saving}
          className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-paper transition hover:-translate-y-0.5 hover:shadow-lift disabled:translate-y-0 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
        >
          {saving ? "Saving..." : "Save and start"}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      <div className="relative mt-5 grid gap-3 lg:grid-cols-3">
        <label className="rounded-xl border border-border bg-background/70 p-3">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">1 · Goal</span>
          <textarea value={goal} onChange={(event) => setGoal(event.target.value)} className={`${fieldClass} min-h-24 resize-none py-2`} />
        </label>
        <label className="rounded-xl border border-border bg-background/70 p-3">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">2 · Start with</span>
          <select value={workflow} onChange={(event) => setWorkflow(normalizeOnboardingWorkflow(event.target.value))} className={`${fieldClass} h-10`}>
            {onboardingWorkflowOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="rounded-xl border border-border bg-background/70 p-3">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">3 · Studio type</span>
          <select value={studioKind} onChange={(event) => setStudioKind(normalizeOnboardingStudioKind(event.target.value))} className={`${fieldClass} h-10`}>
            {onboardingStudioKindOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </div>
    </section>
  )
}

function greetingFor(now: Date | null) {
  if (!now) return "Welcome back"
  const hour = now.getHours()
  if (hour < 12) return "Good morning"
  if (hour < 18) return "Good afternoon"
  return "Good evening"
}

/** Today's study minutes against the daily goal, as a ring on the cover card. */
function GoalRing({ goal, loading, minutes }: { goal: number; loading: boolean; minutes: number }) {
  const percent = Math.min(100, Math.round((minutes / goal) * 100))
  const radius = 42
  const circumference = 2 * Math.PI * radius
  return (
    <div
      role="img"
      aria-label={loading ? "Loading today's study time" : `${minutes} of ${goal} study minutes today, ${percent}% of your daily goal`}
      className="relative h-28 w-28 shrink-0 sm:h-32 sm:w-32"
    >
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="50" cy="50" r={radius} fill="none" strokeWidth="10" className="stroke-muted" />
        {!loading && percent > 0 ? (
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - percent / 100)}
            className="stroke-tab-home transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none"
          />
        ) : null}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {loading ? (
          <span className="h-6 w-12 animate-pulse rounded-md bg-muted" />
        ) : (
          <span className="font-display text-2xl font-semibold leading-none text-foreground">
            {minutes}
            <span className="text-sm font-medium text-muted-foreground">/{goal}</span>
          </span>
        )}
        <span className="mt-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">min today</span>
      </div>
    </div>
  )
}

function HeroStat({ icon: Icon, label, tab, value }: { icon: IconComponent; label: string; tab: SectionTab; value: string }) {
  return (
    <div data-tab={tab} className="min-w-0 rounded-xl border border-border bg-background/70 px-3 py-2">
      <dt className="flex items-center gap-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        <Icon className="learn-tab-ink h-3.5 w-3.5" />
        {label}
      </dt>
      <dd className="mt-0.5 truncate font-display text-lg font-semibold text-foreground">{value}</dd>
    </div>
  )
}

function MetricTile({ body, icon: Icon, label, loading, tone, value }: { body: string; icon: IconComponent; label: string; loading: boolean; tone: MetricTone; value: string }) {
  return (
    <li className="relative min-w-0 overflow-hidden rounded-xl border border-border bg-card p-3.5 text-card-foreground shadow-paper">
      <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-1 ${loading ? "bg-muted" : toneFillClass(tone)}`} />
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${toneSurfaceClasses(tone)}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      {loading ? (
        <span aria-hidden="true" className="mt-2 block h-7 w-16 animate-pulse rounded-md bg-muted" />
      ) : (
        <p className="mt-2 font-display text-2xl font-semibold leading-none text-foreground">{value}</p>
      )}
      <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-muted-foreground">{body}</p>
    </li>
  )
}

function toneFillClass(tone: MetricTone) {
  if (tone === "critical") return "bg-destructive"
  if (tone === "watch") return "bg-warning"
  return "bg-success"
}

/**
 * One card on the dashboard. The section colour comes from `tab` (the same
 * divider-tab colours the sidebar uses), so a card about practice looks like
 * it belongs to Practice.
 */
function DashboardCard({
  action,
  children,
  icon: Icon,
  subtitle,
  tab,
  title,
}: {
  action?: React.ReactNode
  children: React.ReactNode
  icon: IconComponent
  subtitle: string
  tab: SectionTab
  title: string
}) {
  return (
    <section data-tab={tab} className="learn-surface relative min-w-0 p-4 sm:p-5">
      <span aria-hidden="true" className="learn-tab-dot absolute left-5 top-0 h-1 w-10 rounded-b-full" />
      <header className="flex items-start gap-3">
        <span className="learn-tab-wash learn-tab-ink flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold leading-tight text-foreground">{title}</h2>
          <p className="mt-0.5 text-sm leading-5 text-muted-foreground">{subtitle}</p>
        </div>
        {action}
      </header>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function CardLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-muted-foreground transition hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {label}
      <ArrowRight className="h-3.5 w-3.5" />
    </button>
  )
}

function EmptyAction({ action, body, icon: Icon, onClick, title }: { action: string; body: string; icon: IconComponent; onClick: () => void; title: string }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-border bg-muted/30 p-4 sm:flex-row sm:items-center">
      <span className="learn-tab-wash learn-tab-ink flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-0.5 text-sm leading-5 text-muted-foreground">{body}</p>
      </div>
      <button
        type="button"
        onClick={onClick}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm font-semibold text-foreground transition hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {action}
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function SkeletonTiles({ count }: { count: number }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <span key={index} className="h-[62px] animate-pulse rounded-xl bg-muted/70" />
      ))}
    </div>
  )
}

function AgendaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-background/70 px-3 py-2">
      <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-display text-lg font-semibold text-foreground">{value}</dd>
    </div>
  )
}
