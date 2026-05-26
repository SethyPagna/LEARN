"use client"

import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Bot,
  Brain,
  CalendarDays,
  Clock3,
  Compass,
  FileText,
  Gamepad2,
  GitFork,
  Info,
  MessageSquare,
  Plus,
  Repeat2,
  Sparkles,
  Table2,
  Trophy,
  UploadCloud,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import type React from "react"
import { buildDashboardCommandPlan, buildDashboardEmptyStates, buildDashboardMetricTiles, buildDashboardQuickActionGroups, buildDashboardRecentWork, buildDashboardRouteActions, buildDashboardWeakTopicCards, type DashboardCommandTarget, type DashboardQuickActionIcon, type DashboardRecentWorkItem } from "@/lib/dashboard-features"
import { normalizeOnboardingPreferences, normalizeOnboardingStudioKind, normalizeOnboardingWorkflow, onboardingStudioKindOptions, onboardingTargetView, onboardingWorkflowOptions, shouldShowOnboarding, type OnboardingStudioKind, type OnboardingWorkflow } from "@/lib/onboarding-features"
import { api } from "../api"
import type { WorkspaceOptions } from "../preferences"
import type { Note, Quiz, User, View } from "../types"
import { Panel, StatusPill } from "../ui"
import type { PracticeDraftSummary } from "@/lib/practice-drafts"
import type { StudioDraftSummary } from "@/lib/studio-drafts"
import { toneSurfaceClasses } from "@/lib/design-system"

const dashboardCommandIcons: Record<DashboardCommandTarget, React.ComponentType<{ className?: string }>> = {
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
} satisfies Record<ReturnType<typeof buildDashboardMetricTiles>[number]["id"], React.ComponentType<{ className?: string }>>

const recentWorkIcons = {
  ai: Sparkles,
  file: UploadCloud,
  practice: Gamepad2,
  studio: FileText,
} satisfies Record<DashboardRecentWorkItem["kind"], React.ComponentType<{ className?: string }>>

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
} satisfies Record<DashboardQuickActionIcon, React.ComponentType<{ className?: string }>>

export function DashboardView({
  dashboard,
  forceOnboarding = false,
  notes,
  quizzes,
  options,
  practiceDraftSummary,
  setView,
  studioDraftSummary,
  user,
}: {
  dashboard: any
  forceOnboarding?: boolean
  notes: Note[]
  quizzes: Quiz[]
  options: WorkspaceOptions
  practiceDraftSummary: PracticeDraftSummary
  setView: (view: View) => void
  studioDraftSummary: StudioDraftSummary
  user: User | null
}) {
  const [showOnboarding, setShowOnboarding] = useState(false)
  const focus = dashboard?.snapshot?.recommendedFocus?.[0] || "your next concept"
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
  const CommandIcon = dashboardCommandIcons[commandPlan.target]
  const actionGroups = useMemo(() => buildDashboardQuickActionGroups(), [])

  useEffect(() => {
    setShowOnboarding(shouldShowOnboarding({ force: forceOnboarding, preferences: user?.preferences }))
  }, [forceOnboarding, user?.preferences])

  return (
    <div className="grid gap-3 2xl:grid-cols-2">
      {showOnboarding ? <OnboardingCard setShowOnboarding={setShowOnboarding} setView={setView} /> : null}
      <section className="rounded-lg border border-border bg-card text-card-foreground shadow-sm xl:col-span-2">
        <div className="flex flex-col gap-3 p-3 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-1 rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">Route</span>
            <div className="min-w-0">
              <div className="flex min-w-0 items-start gap-2">
                <h2 className="min-w-0 flex-1 break-words text-xl font-semibold leading-tight text-foreground md:max-w-4xl md:text-2xl">{commandPlan.headline}</h2>
                <InfoPopover label="About today's route" body={commandPlan.detail} />
              </div>
              <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{commandPlan.detail}</p>
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-2 overflow-x-auto rounded-lg border border-border bg-secondary/70 p-2 md:max-w-[520px]">
            {routeActions.slice(0, 1).map((action) => {
              const Icon = dashboardCommandIcons[action.target] || CommandIcon
              return (
                <button key={action.id} onClick={() => setView(action.target)} className="flex h-11 shrink-0 items-center gap-2 rounded-md bg-primary px-3 text-left text-sm font-semibold text-primary-foreground transition hover:opacity-90" title={action.detail}>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary-foreground/15">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span>{action.label}</span>
                  <ArrowRight className="h-4 w-4 opacity-80" />
                </button>
              )
            })}
            <details className="group relative shrink-0 rounded-md border border-border bg-background">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 text-sm font-semibold text-foreground hover:bg-accent hover:text-accent-foreground [&::-webkit-details-marker]:hidden">
                <span>More moves</span>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">{routeActions.length - 1}</span>
              </summary>
              <div className="grid w-60 gap-2 border-t border-border bg-popover p-2 text-popover-foreground">
                {routeActions.slice(1).map((action) => {
                  const Icon = dashboardCommandIcons[action.target]
                  return (
                    <button key={action.id} onClick={() => setView(action.target)} className="rounded-md border border-border bg-background p-2 text-left transition hover:bg-accent hover:text-accent-foreground" title={action.detail}>
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-success" />
                        <span className="truncate text-sm font-semibold">{action.label}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </details>
            <details className="relative shrink-0 rounded-md border border-border bg-background">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 text-sm font-semibold text-foreground hover:bg-accent hover:text-accent-foreground [&::-webkit-details-marker]:hidden">
                <span>Signals</span>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">{commandPlan.chips.length}</span>
              </summary>
              <div className="flex w-64 flex-wrap gap-2 border-t border-border bg-popover p-2 text-popover-foreground">
                {commandPlan.chips.map((chip) => <StatusPill key={chip} label={chip} />)}
              </div>
            </details>
          </div>
        </div>
        <div className="dashboard-rail flex gap-2 overflow-x-auto border-t border-border bg-background/45 p-2">
          {metricTiles.map((metric) => (
            <BigMetric key={metric.id} icon={dashboardMetricIcons[metric.id]} label={metric.label} value={metric.value} body={metric.detail} tone={metric.tone} />
          ))}
        </div>
      </section>

      {emptyStates.length ? (
        <Panel className="p-0 xl:col-span-2">
          <details>
            <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-4" title="Small setup cards appear only while the workspace needs source material, practice, or a route signal.">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                <Compass className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold text-foreground">Setup gaps</h2>
                <p className="text-xs text-muted-foreground">{emptyStates.length} hidden setup step{emptyStates.length === 1 ? "" : "s"}</p>
              </div>
            </summary>
            <div className="grid gap-2 border-t border-border p-4 md:grid-cols-3">
              {emptyStates.map((state) => {
                const Icon = dashboardCommandIcons[state.target]
                return (
                  <button
                    key={state.id}
                    type="button"
                    onClick={() => setView(state.target)}
                    className="rounded-md border border-border bg-background p-3 text-left transition hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground"
                    title={state.detail}
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-foreground">{state.title}</span>
                        <span className="mt-1 block text-xs text-muted-foreground">{state.actionLabel}</span>
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          </details>
        </Panel>
      ) : null}

      <Panel className="min-w-0 p-3 bg-[linear-gradient(135deg,hsl(var(--card)),hsl(var(--accent)/0.28))]">
        <SectionHeader icon={Sparkles} title="AI suggestion" body="Use the tutor as a quiet co-pilot, not a replacement for your work." />
        <div className="mt-3 rounded-lg border border-border bg-muted/35 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-sm font-semibold text-foreground">Review route for {focus}</p>
          </div>
          <button onClick={() => setView("ai")} className="mt-3 rounded-md bg-success px-3 py-2 text-sm font-semibold text-success-foreground">Open AI tutor</button>
        </div>
      </Panel>

      <Panel className="min-w-0 p-3 bg-[linear-gradient(135deg,hsl(var(--card)),hsl(var(--warning)/0.12))]">
        <SectionHeader icon={Brain} title="Weak topics" body="Lower accuracy appears first so practice is easier to choose." />
        <div className="dashboard-rail mt-3 flex snap-x gap-2 overflow-x-auto pb-1">
          {weakTopicCards.map((topic) => (
            <button key={topic.label} onClick={() => setView("practice")} className="min-w-[180px] snap-start rounded-md border border-border bg-background p-2.5 text-left transition hover:bg-accent hover:text-accent-foreground">
              <div className="flex justify-between gap-3 text-sm">
                <span className="font-medium text-foreground">{topic.label}</span>
                <StatusPill label={`${topic.accuracy}%`} tone={topic.tone} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{topic.attempts} attempt{topic.attempts === 1 ? "" : "s"}</p>
              {options.showWeakTopicBars ? (
                <div className="mt-2 h-2 rounded-full bg-muted">
                  <div className="h-2 rounded-full bg-success" style={{ width: `${Math.max(8, topic.accuracy)}%` }} />
                </div>
              ) : null}
            </button>
          ))}
          {!weakTopicCards.length ? (
            <button onClick={() => setView("practice")} className="min-w-[240px] rounded-md border border-dashed border-border bg-background p-4 text-left transition hover:bg-accent hover:text-accent-foreground">
              <span className="block text-sm font-semibold text-foreground">No weak topic yet</span>
              <span className="mt-1 block text-xs text-muted-foreground">Run a quiz or game to create real signals.</span>
            </button>
          ) : null}
        </div>
      </Panel>

      <Panel className="min-w-0 p-3 bg-[linear-gradient(135deg,hsl(var(--card)),hsl(var(--success)/0.10))]">
        <SectionHeader icon={FileText} title="Recent work" body="Recent Studio items, AI chats, practice attempts, and uploads appear together so resuming is simpler." />
        <div className="dashboard-rail mt-3 flex snap-x gap-2 overflow-x-auto pb-1">
          {recentWork.length ? recentWork.slice(0, 4).map((item) => {
            const Icon = recentWorkIcons[item.kind]
            return (
              <button key={item.id} onClick={() => setView(item.target)} className="min-w-[210px] snap-start rounded-md border border-border bg-background p-2.5 text-left hover:bg-accent hover:text-accent-foreground">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{item.title}</p>
                    <p className="line-clamp-1 text-xs text-muted-foreground">{item.detail}</p>
                  </div>
                </div>
              </button>
            )
          }) : (
            <div className="min-w-[260px] rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              Create a Studio item to start building your learning workspace.
            </div>
          )}
        </div>
      </Panel>

      <Panel className="min-w-0 p-3 bg-[linear-gradient(135deg,hsl(var(--card)),hsl(var(--primary)/0.10))]">
        <SectionHeader icon={Clock3} title="Review queue" body="Turn recent work into active recall before it fades." />
        <div className="dashboard-rail mt-3 flex snap-x gap-2 overflow-x-auto pb-1">
          {["Review weak topic", "Retry quiz mistakes", "Save an AI route"].map((item) => (
            <button key={item} onClick={() => setView("practice")} className="flex min-w-[190px] snap-start items-center gap-2 rounded-md border border-border bg-background p-2.5 text-left text-sm hover:bg-accent hover:text-accent-foreground">
              <Repeat2 className="h-5 w-5 text-success" />
              <span className="font-medium">{item}</span>
            </button>
          ))}
        </div>
      </Panel>

      <Panel className="min-w-0 p-3 bg-[linear-gradient(135deg,hsl(var(--card)),hsl(var(--accent)/0.22))]">
        <SectionHeader icon={Table2} title="Quick actions" body="Grouped by purpose so the dashboard stays compact." />
        <div className="dashboard-rail mt-3 flex snap-x gap-2 overflow-x-auto pb-1">
          {actionGroups.map((group) => (
            <details key={group.label} className="relative min-w-[170px] snap-start rounded-md border border-border bg-background">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 text-sm font-semibold text-foreground hover:bg-accent hover:text-accent-foreground [&::-webkit-details-marker]:hidden">
                <span>{group.label}</span>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">{group.actions.length}</span>
              </summary>
              <div className="grid w-64 gap-2 border-t border-border bg-popover p-2 text-popover-foreground">
                {group.actions.map((action) => {
                  const Icon = quickActionIcons[action.icon]
                  return (
                    <button key={action.id} onClick={() => setView(action.target as View)} className="group relative rounded-md border border-border bg-background p-3 text-left transition hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground" title={action.detail}>
                      <div className="flex items-center gap-2">
                        <Icon className="h-6 w-6 text-success" />
                        <p className="text-sm font-semibold">{action.label}</p>
                      </div>
                      <p className="pointer-events-none absolute left-2 right-2 top-[calc(100%+0.35rem)] z-[70] hidden rounded-md border border-border bg-popover p-2 text-xs leading-5 text-popover-foreground shadow-lg group-hover:block group-focus-visible:block">{action.detail}</p>
                    </button>
                  )
                })}
              </div>
            </details>
          ))}
        </div>
      </Panel>

      <Panel className="min-w-0 p-3 bg-[linear-gradient(135deg,hsl(var(--card)),hsl(var(--primary)/0.08))]">
        <SectionHeader icon={CalendarDays} title="Calendar agenda" body="Plan small blocks instead of waiting for a long study session." />
        <div className="dashboard-rail mt-3 flex snap-x gap-2 overflow-x-auto pb-1">
          <AgendaItem label="Focus block" value={`${options.calendarDefaultMinutes} min`} />
          <AgendaItem label="Lead" value={`${options.calendarLeadMinutes} min`} />
          <button onClick={() => setView("calendar")} className="min-w-[140px] rounded-md border border-border bg-secondary px-3 py-2 text-sm font-medium text-secondary-foreground hover:bg-accent hover:text-accent-foreground">
            Plan time
          </button>
        </div>
      </Panel>
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

  return (
    <Panel className="p-4 xl:col-span-2">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">First run</span>
            <StatusPill label="3 steps" tone="steady" />
          </div>
          <h2 className="text-2xl font-semibold text-foreground">Set up your learning loop.</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Pick a goal, your first useful move, and where Studio should start. You can change all of this later in Settings.</p>
          {status ? <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive">{status}</p> : null}
        </div>
        <button
          type="button"
          onClick={finishOnboarding}
          disabled={saving}
          className="flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save and start"}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <label className="rounded-md border border-border bg-background p-3">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Goal</span>
          <textarea value={goal} onChange={(event) => setGoal(event.target.value)} className="mt-2 min-h-24 w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/25" />
        </label>
        <label className="rounded-md border border-border bg-background p-3">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Start with</span>
          <select value={workflow} onChange={(event) => setWorkflow(normalizeOnboardingWorkflow(event.target.value))} className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/25">
            {onboardingWorkflowOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="rounded-md border border-border bg-background p-3">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Studio type</span>
          <select value={studioKind} onChange={(event) => setStudioKind(normalizeOnboardingStudioKind(event.target.value))} className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/25">
            {onboardingStudioKindOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </div>
    </Panel>
  )
}

function BigMetric({ body, icon: Icon, label, tone, value }: { body: string; icon: React.ComponentType<{ className?: string }>; label: string; tone: "critical" | "steady" | "watch"; value: string }) {
  return (
    <div className={`min-w-[150px] rounded-md border p-2.5 shadow-sm ${dashboardMetricToneClass(tone)}`} title={body} aria-label={`${label}: ${value}. ${body}`}>
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${toneSurfaceClasses(tone)}`}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold leading-none text-foreground">{value}</p>
        </div>
      </div>
    </div>
  )
}

function dashboardMetricToneClass(tone: "critical" | "steady" | "watch") {
  if (tone === "critical") return "border-destructive/25 bg-destructive/10"
  if (tone === "watch") return "border-warning/25 bg-warning/10"
  return "border-success/25 bg-success/10"
}

function SectionHeader({ body, icon: Icon, title }: { body: string; icon: React.ComponentType<{ className?: string }>; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="font-semibold text-foreground">{title}</h2>
      </div>
      <InfoPopover label={`About ${title}`} body={body} />
    </div>
  )
}

function InfoPopover({ body, label }: { body: string; label: string }) {
  return (
    <details className="relative shrink-0">
      <summary className="flex h-8 w-8 list-none items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground [&::-webkit-details-marker]:hidden" aria-label={label} title={label}>
        <Info className="h-4 w-4" />
      </summary>
      <p className="absolute right-0 top-10 z-[80] w-72 rounded-md border border-border bg-popover p-3 text-sm leading-6 text-popover-foreground shadow-xl">
        {body}
      </p>
    </details>
  )
}

function AgendaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-[150px] items-center justify-between rounded-md border border-border bg-background p-3 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      <span className="text-muted-foreground">{value}</span>
    </div>
  )
}
