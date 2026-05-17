"use client"

import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Bot,
  Brain,
  CalendarDays,
  CheckCircle2,
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
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import type React from "react"
import { buildDashboardCommandPlan, buildDashboardSignals, type DashboardCommandTarget } from "@/lib/dashboard-features"
import { normalizeOnboardingPreferences, onboardingTargetView, shouldShowOnboarding, type OnboardingStudioKind, type OnboardingWorkflow } from "@/lib/onboarding-features"
import { api } from "../api"
import type { WorkspaceOptions } from "../preferences"
import type { Note, Quiz, User, View } from "../types"
import { Panel } from "../ui"

type DashboardAction = { label: string; body: string; view: View; icon: React.ComponentType<{ className?: string }> }

const dashboardCommandIcons: Record<DashboardCommandTarget, React.ComponentType<{ className?: string }>> = {
  ai: Sparkles,
  calendar: CalendarDays,
  files: Plus,
  practice: BookOpen,
  reviews: Repeat2,
  studio: FileText,
}

export function DashboardView({
  dashboard,
  forceOnboarding = false,
  notes,
  quizzes,
  options,
  setView,
  user,
}: {
  dashboard: any
  forceOnboarding?: boolean
  notes: Note[]
  quizzes: Quiz[]
  options: WorkspaceOptions
  setView: (view: View) => void
  user: User | null
}) {
  const [showOnboarding, setShowOnboarding] = useState(false)
  const focus = dashboard?.snapshot?.recommendedFocus?.[0] || "your next concept"
  const weakTopics = dashboard?.snapshot?.weakTopics || []
  const goalCompletion = dashboard?.snapshot?.goalCompletion ?? 0
  const recentNotes = notes.slice(0, 4)
  const reviewCount = Math.max(weakTopics.length, dashboard?.snapshot?.recommendedFocus?.length || 1)
  const commandPlan = useMemo(
    () => buildDashboardCommandPlan({ noteCount: notes.length, quizCount: quizzes.length, snapshot: dashboard?.snapshot }),
    [dashboard?.snapshot, notes.length, quizzes.length],
  )
  const dashboardSignals = useMemo(
    () => buildDashboardSignals({ noteCount: notes.length, quizCount: quizzes.length, snapshot: dashboard?.snapshot }),
    [dashboard?.snapshot, notes.length, quizzes.length],
  )
  const CommandIcon = dashboardCommandIcons[commandPlan.target]
  const actionGroups: { label: string; actions: DashboardAction[] }[] = [
    {
      label: "Create",
      actions: [
        { label: "Open Studio", body: "Notes, docs, sheets, and slides", view: "studio", icon: FileText },
        { label: "Upload media", body: "Images, video, and files", view: "files", icon: Plus },
      ],
    },
    {
      label: "Review",
      actions: [
        { label: "Learn route", body: "Route, graph, reviews, and calendar", view: "learn", icon: Brain },
        { label: "Review queue", body: "Due concepts and mistake cards", view: "reviews", icon: Repeat2 },
        { label: "Knowledge map", body: "Graph links and weak areas", view: "graph", icon: GitFork },
      ],
    },
    {
      label: "Practice",
      actions: [
        { label: "Practice hub", body: "Quizzes, games, exams, and retries", view: "practice", icon: BookOpen },
        { label: "Sprint mode", body: "Timed review and matching games", view: "practice", icon: Gamepad2 },
      ],
    },
    {
      label: "Share",
      actions: [
        { label: "Social hub", body: "Chat, spaces, rooms, and battles", view: "social", icon: MessageSquare },
        { label: "Focus room", body: "Pomodoro presence and study rooms", view: "rooms", icon: Compass },
      ],
    },
    {
      label: "Manage",
      actions: [
        { label: "Calendar", body: "Plan study blocks", view: "calendar", icon: CalendarDays },
        { label: "Settings", body: "Tune the workspace", view: "settings", icon: BarChart3 },
      ],
    },
  ]

  useEffect(() => {
    setShowOnboarding(shouldShowOnboarding({ force: forceOnboarding, preferences: user?.preferences }))
  }, [forceOnboarding, user?.preferences])

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      {showOnboarding ? <OnboardingCard setShowOnboarding={setShowOnboarding} setView={setView} /> : null}
      <section className="rounded-lg border border-border bg-card text-card-foreground shadow-sm xl:col-span-2">
        <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-center lg:p-5">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">Today</span>
              {dashboardSignals.map((signal) => <StatusChip key={signal.label} label={`${signal.label} ${signal.value}`} tone={signal.tone} />)}
            </div>
            <h2 className="max-w-4xl text-2xl font-semibold leading-tight text-foreground md:text-4xl">
              {commandPlan.headline}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{commandPlan.detail}</p>
          </div>
          <button onClick={() => setView(commandPlan.target)} className="rounded-md border border-border bg-secondary p-3 text-left transition hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <CommandIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-foreground">Start now</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">{commandPlan.targetTopic || commandPlan.target}</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {commandPlan.chips.map((chip) => <StatusChip key={chip} label={chip} />)}
            </div>
          </button>
        </div>
        <div className="grid border-t border-border bg-background/45 sm:grid-cols-2 xl:grid-cols-4">
          <BigMetric icon={CheckCircle2} label="Goal" value={`${goalCompletion}%`} body="Learning goals completed" />
          <BigMetric icon={FileText} label="Studio" value={String(notes.length)} body="Recent notes and workspace items" />
          <BigMetric icon={BookOpen} label="Quiz" value={String(quizzes.length)} body="Practice sets available" />
          <BigMetric icon={Repeat2} label="Review" value={String(reviewCount)} body="Concepts needing attention" />
        </div>
      </section>

      <Panel className="p-4">
        <SectionHeader icon={Sparkles} title="AI suggestion" body="Use the tutor as a quiet co-pilot, not a replacement for your work." />
        <div className="mt-4 rounded-lg border border-border bg-muted/35 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-foreground">Suggested prompt</p>
            <details className="relative">
              <summary className="flex h-8 w-8 list-none items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground" aria-label="Show suggested prompt">
                <Info className="h-4 w-4" />
              </summary>
              <p className="absolute right-0 top-10 z-20 w-72 rounded-md border border-border bg-popover p-3 text-sm leading-6 text-popover-foreground shadow-xl">
                {`Use my latest Studio notes to make a short review route for ${focus}, including one example and three recall questions.`}
              </p>
            </details>
          </div>
          <button onClick={() => setView("ai")} className="mt-4 rounded-md bg-success px-3 py-2 text-sm font-semibold text-success-foreground">Open AI tutor</button>
        </div>
      </Panel>

      <Panel className="p-4">
        <SectionHeader icon={Brain} title="Weak topics" body="Lower accuracy appears first so practice is easier to choose." />
        <div className="mt-4 space-y-3">
          {(weakTopics.length ? weakTopics : [{ topic: "No attempts yet", accuracy: 100 }]).slice(0, 5).map((topic: any) => (
            <div key={topic.topic} className="rounded-md border border-border bg-background p-3">
              <div className="flex justify-between gap-3 text-sm">
                <span className="font-medium text-foreground">{topic.topic}</span>
                <span className="text-muted-foreground">{topic.accuracy}%</span>
              </div>
              {options.showWeakTopicBars ? (
                <div className="mt-2 h-2 rounded-full bg-muted">
                  <div className="h-2 rounded-full bg-success" style={{ width: `${Math.max(8, topic.accuracy)}%` }} />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="p-4">
        <SectionHeader icon={FileText} title="Studio recents" body="Notes, docs, sheets, and slides live together in Studio." />
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {recentNotes.length ? recentNotes.map((note) => (
            <button key={note.id} onClick={() => setView("studio")} className="rounded-md border border-border bg-background p-3 text-left hover:bg-accent hover:text-accent-foreground">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{note.title}</p>
                  <p className="line-clamp-1 text-xs text-muted-foreground">{note.content || "Open in Studio to keep building."}</p>
                </div>
              </div>
            </button>
          )) : (
            <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground md:col-span-2">
              Create a Studio item to start building your learning workspace.
            </div>
          )}
        </div>
      </Panel>

      <Panel className="p-4">
        <SectionHeader icon={Clock3} title="Review queue" body="Turn recent work into active recall before it fades." />
        <div className="mt-4 space-y-2">
          {["Review weak topic", "Retry quiz mistakes", "Save an AI route"].map((item, index) => (
            <button key={item} onClick={() => setView(index === 1 ? "practice" : "reviews")} className="flex w-full items-center gap-3 rounded-md border border-border bg-background p-3 text-left text-sm hover:bg-accent hover:text-accent-foreground">
              <Repeat2 className="h-5 w-5 text-success" />
              <span className="font-medium">{item}</span>
            </button>
          ))}
        </div>
      </Panel>

      <Panel className="p-4">
        <SectionHeader icon={CalendarDays} title="Calendar agenda" body="Plan small blocks instead of waiting for a long study session." />
        <div className="mt-4 space-y-2">
          <AgendaItem label="Focus block" value={`${options.calendarDefaultMinutes} min`} />
          <AgendaItem label="Reminder lead" value={`${options.calendarLeadMinutes} min`} />
          <button onClick={() => setView("calendar")} className="mt-2 rounded-md border border-border bg-secondary px-3 py-2 text-sm font-medium text-secondary-foreground hover:bg-accent hover:text-accent-foreground">
            Plan time
          </button>
        </div>
      </Panel>

      <Panel className="p-4 xl:col-span-2">
        <SectionHeader icon={Table2} title="Quick actions" body="Grouped by purpose so the dashboard stays compact." />
        <div className="mt-4 grid gap-4 lg:grid-cols-5">
          {actionGroups.map((group) => (
            <div key={group.label}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{group.label}</p>
              <div className="grid gap-2">
                {group.actions.map((action) => {
                  const Icon = action.icon
                  return (
                    <button key={action.label} onClick={() => setView(action.view)} className="group relative rounded-md border border-border bg-background p-3 text-left transition hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground" title={action.body}>
                      <div className="flex items-center gap-2">
                        <Icon className="h-6 w-6 text-success" />
                        <p className="text-sm font-semibold">{action.label}</p>
                      </div>
                      <p className="pointer-events-none absolute left-2 right-2 top-[calc(100%+0.35rem)] z-20 hidden rounded-md border border-border bg-popover p-2 text-xs leading-5 text-popover-foreground shadow-lg group-hover:block group-focus-visible:block">{action.body}</p>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
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
            <StatusChip label="3 steps" tone="steady" />
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
          <select value={workflow} onChange={(event) => setWorkflow(event.target.value as OnboardingWorkflow)} className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/25">
            <option value="create">Create in Studio</option>
            <option value="review">Review existing material</option>
            <option value="practice">Practice questions</option>
            <option value="schedule">Plan calendar time</option>
            <option value="ai">Ask AI tutor</option>
          </select>
        </label>
        <label className="rounded-md border border-border bg-background p-3">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Studio type</span>
          <select value={studioKind} onChange={(event) => setStudioKind(event.target.value as OnboardingStudioKind)} className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/25">
            <option value="notes">Notes</option>
            <option value="docs">Docs</option>
            <option value="sheets">Sheets</option>
            <option value="slides">Slides</option>
          </select>
        </label>
      </div>
    </Panel>
  )
}

function BigMetric({ body, icon: Icon, label, value }: { body: string; icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="group relative border-b border-border p-4 sm:border-r xl:border-b-0">
      <div className="flex items-center gap-3">
        <Icon className="h-8 w-8 text-primary" />
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
          <p className="text-3xl font-semibold leading-none text-foreground">{value}</p>
        </div>
      </div>
      <p className="pointer-events-none absolute left-3 right-3 top-[calc(100%-0.2rem)] z-20 hidden rounded-md border border-border bg-popover p-2 text-xs leading-5 text-popover-foreground shadow-lg group-hover:block group-focus-visible:block">{body}</p>
    </div>
  )
}

function StatusChip({ label, tone = "watch" }: { label: string; tone?: "critical" | "steady" | "watch" }) {
  return <span className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${statusToneClass(tone)}`}>{label}</span>
}

function HeroAction({ icon: Icon, label, onClick, primary }: { icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`flex h-11 items-center gap-2 rounded-md border px-3 text-sm font-semibold transition hover:-translate-y-0.5 ${primary ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground"}`}
    >
      <Icon className="h-5 w-5" />
      {label}
    </button>
  )
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
      <details className="relative">
        <summary className="flex h-8 w-8 list-none items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground" aria-label={`About ${title}`}>
          <Info className="h-4 w-4" />
        </summary>
        <p className="absolute right-0 top-10 z-20 w-64 rounded-md border border-border bg-popover p-3 text-sm leading-6 text-popover-foreground shadow-xl">
          {body}
        </p>
      </details>
    </div>
  )
}

function AgendaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-background p-3 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      <span className="text-muted-foreground">{value}</span>
    </div>
  )
}

function statusToneClass(tone: "critical" | "steady" | "watch") {
  if (tone === "critical") return "border-destructive/40 bg-destructive/10 text-destructive"
  if (tone === "steady") return "border-success/40 bg-success/10 text-success"
  return "border-border bg-background text-muted-foreground"
}
