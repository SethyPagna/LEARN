"use client"

import {
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
  MessageSquare,
  Plus,
  Repeat2,
  Sparkles,
  Table2,
} from "lucide-react"
import type React from "react"
import type { WorkspaceOptions } from "../preferences"
import type { Note, Quiz, View } from "../types"
import { Panel } from "../ui"

type DashboardAction = { label: string; body: string; view: View; icon: React.ComponentType<{ className?: string }> }

export function DashboardView({
  dashboard,
  notes,
  quizzes,
  options,
  setView,
}: {
  dashboard: any
  notes: Note[]
  quizzes: Quiz[]
  options: WorkspaceOptions
  setView: (view: View) => void
}) {
  const focus = dashboard?.snapshot?.recommendedFocus?.[0] || "your next concept"
  const weakTopics = dashboard?.snapshot?.weakTopics || []
  const goalCompletion = dashboard?.snapshot?.goalCompletion ?? 0
  const recentNotes = notes.slice(0, 4)
  const reviewCount = Math.max(weakTopics.length, dashboard?.snapshot?.recommendedFocus?.length || 1)
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
        { label: "Learn", body: "Route, graph, review", view: "learn", icon: Brain },
        { label: "Reviews", body: "Practice due concepts", view: "reviews", icon: Repeat2 },
        { label: "Graph", body: "Find weak links", view: "graph", icon: GitFork },
      ],
    },
    {
      label: "Practice",
      actions: [
        { label: "Quizzes", body: "Answer and retry", view: "quizzes", icon: BookOpen },
        { label: "Games", body: "Sprint and matching", view: "games", icon: Gamepad2 },
      ],
    },
    {
      label: "Share",
      actions: [
        { label: "Chat", body: "Ask or discuss", view: "chat", icon: MessageSquare },
        { label: "Rooms", body: "Focus with others", view: "rooms", icon: Compass },
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

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section className="rounded-lg border border-border bg-card p-5 text-card-foreground shadow-sm xl:col-span-2">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">Today route</p>
            <h2 className="mt-2 text-3xl font-semibold leading-tight text-foreground md:text-4xl">
              Focus on {focus}, then turn the work into practice.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Start in Studio, review the weakest topic, then ask the tutor to convert your notes into a quiz or study route.
            </p>
          </div>
          <button onClick={() => setView("ai")} className="flex h-12 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">
            <Sparkles className="h-5 w-5" />
            Ask tutor
          </button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <BigMetric icon={CheckCircle2} label="Goal" value={`${goalCompletion}%`} body="Learning goals completed" />
          <BigMetric icon={FileText} label="Studio items" value={String(notes.length)} body="Recent notes and workspace items" />
          <BigMetric icon={BookOpen} label="Quiz banks" value={String(quizzes.length)} body="Practice sets available" />
          <BigMetric icon={Repeat2} label="Review queue" value={String(reviewCount)} body="Concepts needing attention" />
        </div>
      </section>

      <Panel className="p-4">
        <SectionHeader icon={Sparkles} title="AI suggestion" body="Use the tutor as a quiet co-pilot, not a replacement for your work." />
        <div className="mt-4 rounded-lg border border-border bg-muted/35 p-4">
          <p className="text-sm font-semibold text-foreground">Suggested prompt</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            “Use my latest Studio notes to make a short review route for {focus}, including one example and three recall questions.”
          </p>
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
            <button key={item} onClick={() => setView(index === 1 ? "quizzes" : "reviews")} className="flex w-full items-center gap-3 rounded-md border border-border bg-background p-3 text-left text-sm hover:bg-accent hover:text-accent-foreground">
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
                    <button key={action.label} onClick={() => setView(action.view)} className="rounded-md border border-border bg-background p-3 text-left hover:bg-accent hover:text-accent-foreground">
                      <Icon className="h-6 w-6 text-success" />
                      <p className="mt-2 text-sm font-semibold">{action.label}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{action.body}</p>
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

function BigMetric({ body, icon: Icon, label, value }: { body: string; icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold text-foreground">{value}</p>
        </div>
      </div>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">{body}</p>
    </div>
  )
}

function SectionHeader({ body, icon: Icon, title }: { body: string; icon: React.ComponentType<{ className?: string }>; title: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <h2 className="font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{body}</p>
      </div>
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
