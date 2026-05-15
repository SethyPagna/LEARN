"use client"

import { useEffect, useMemo, useState, type ComponentType } from "react"
import { BarChart3, BookOpen, CalendarDays, Compass, Gamepad2, GitFork, Info, MessageSquare, MoreHorizontal, Radio, Repeat2, Sparkles, Swords, Target, Users } from "lucide-react"
import type { Quiz, View } from "../types"
import type { WorkspaceOptions } from "../preferences"
import { Panel } from "../ui"
import { FeedView, GraphView, ReviewsView, SocialLearningView } from "./ecosystem-views"
import { CalendarView, ProgressView } from "./secondary-views"
import { ChatView, GamesView } from "./productivity-views"
import { QuizView } from "./quiz-view"

type LearnTab = "overview" | "discover" | "graph" | "reviews" | "calendar" | "progress"
type PracticeTab = "quizzes" | "games"
type SocialTab = "chat" | "spaces" | "rooms" | "battles"

const learnTabs: Array<{ id: LearnTab; label: string; icon: ComponentType<{ className?: string }>; caption: string }> = [
  { id: "overview", label: "Route", icon: Target, caption: "Daily path and next moves" },
  { id: "discover", label: "Discover", icon: Compass, caption: "Micro-lessons and sparks" },
  { id: "graph", label: "Graph", icon: GitFork, caption: "Concept map and links" },
  { id: "reviews", label: "Reviews", icon: Repeat2, caption: "Active recall queue" },
  { id: "calendar", label: "Calendar", icon: CalendarDays, caption: "Time blocks and due dates" },
  { id: "progress", label: "Progress", icon: BarChart3, caption: "Goals and weak topics" },
]

const practiceTabs: Array<{ id: PracticeTab; label: string; icon: ComponentType<{ className?: string }>; caption: string }> = [
  { id: "quizzes", label: "Quizzes", icon: BookOpen, caption: "Question banks and attempts" },
  { id: "games", label: "Games", icon: Gamepad2, caption: "Fast recall and playful drills" },
]

const socialTabs: Array<{ id: SocialTab; label: string; icon: ComponentType<{ className?: string }>; caption: string }> = [
  { id: "chat", label: "Chat", icon: MessageSquare, caption: "Async group discussion" },
  { id: "spaces", label: "Spaces", icon: Users, caption: "Learning circles and permissions" },
  { id: "rooms", label: "Rooms", icon: Radio, caption: "Focus rooms and presence" },
  { id: "battles", label: "Battles", icon: Swords, caption: "Live quiz challenges" },
]

export function LearnWorkspaceView({
  dashboard,
  initialView,
  options,
  quizzes,
  setView,
}: {
  dashboard: any
  initialView: View
  options: WorkspaceOptions
  quizzes: Quiz[]
  setView: (view: View) => void
}) {
  const [tab, setTab] = useState<LearnTab>(learnTabFromView(initialView))

  useEffect(() => {
    setTab(learnTabFromView(initialView))
  }, [initialView])

  return (
    <WorkspaceFrame
      eyebrow="Learn workspace"
      title="Learn loop"
      body="One route with discovery, graph, reviews, time, and progress grouped together."
      tabs={learnTabs}
      activeTab={tab}
      setActiveTab={(value) => {
        const nextTab = value as LearnTab
        setTab(nextTab)
        setView(viewFromLearnTab(nextTab))
      }}
    >
      {tab === "overview" ? <LearnRoute dashboard={dashboard} quizzes={quizzes} setView={setView} /> : null}
      {tab === "discover" ? <FeedView setView={setView} /> : null}
      {tab === "graph" ? <GraphView /> : null}
      {tab === "reviews" ? <ReviewsView /> : null}
      {tab === "calendar" ? <CalendarView options={options} /> : null}
      {tab === "progress" ? <ProgressView dashboard={dashboard} quizzes={quizzes} /> : null}
    </WorkspaceFrame>
  )
}

export function PracticeWorkspaceView({
  initialView,
  options,
  quizzes,
  selectedQuizId,
  setSelectedQuizId,
  setView,
}: {
  initialView: View
  options: WorkspaceOptions
  quizzes: Quiz[]
  selectedQuizId: string
  setSelectedQuizId: (id: string) => void
  setView: (view: View) => void
}) {
  const [tab, setTab] = useState<PracticeTab>(initialView === "games" ? "games" : "quizzes")

  useEffect(() => {
    setTab(initialView === "games" ? "games" : "quizzes")
  }, [initialView])

  return (
    <WorkspaceFrame
      eyebrow="Practice workspace"
      title="Practice arena"
      body="Quizzes and games share one practice surface, so missed topics can move straight into fast recall."
      tabs={practiceTabs}
      activeTab={tab}
      setActiveTab={(value) => {
        const nextTab = value as PracticeTab
        setTab(nextTab)
        setView(viewFromPracticeTab(nextTab))
      }}
    >
      <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
        <div>{tab === "quizzes" ? <QuizView quizzes={quizzes} selectedQuizId={selectedQuizId} setSelectedQuizId={setSelectedQuizId} options={options} /> : <GamesView quizzes={quizzes} options={options} />}</div>
        <PracticeGuide />
      </div>
    </WorkspaceFrame>
  )
}

export function SocialWorkspaceView({ initialView, options, setView }: { initialView: View; options: WorkspaceOptions; setView: (view: View) => void }) {
  const [tab, setTab] = useState<SocialTab>(socialTabFromView(initialView))

  useEffect(() => {
    setTab(socialTabFromView(initialView))
  }, [initialView])

  return (
    <WorkspaceFrame
      eyebrow="Social workspace"
      title="Social hub"
      body="Chat, spaces, rooms, and battles stay grouped around opt-in collaboration."
      tabs={socialTabs}
      activeTab={tab}
      setActiveTab={(value) => {
        const nextTab = value as SocialTab
        setTab(nextTab)
        setView(viewFromSocialTab(nextTab))
      }}
    >
      {tab === "chat" ? <ChatView options={options} /> : null}
      {tab === "spaces" ? <SocialLearningView kind="spaces" /> : null}
      {tab === "rooms" ? <SocialLearningView kind="rooms" /> : null}
      {tab === "battles" ? <SocialLearningView kind="battles" /> : null}
    </WorkspaceFrame>
  )
}

function WorkspaceFrame<T extends string>({
  activeTab,
  body,
  children,
  eyebrow,
  setActiveTab,
  tabs,
  title,
}: {
  activeTab: T
  body: string
  children: React.ReactNode
  eyebrow: string
  setActiveTab: (tab: T) => void
  tabs: Array<{ id: T; label: string; icon: ComponentType<{ className?: string }>; caption: string }>
  title: string
}) {
  return (
    <div className="grid gap-4">
      <Panel className="p-3 lg:p-4">
        <div className="grid gap-3 xl:grid-cols-[1fr_auto] xl:items-center">
          <div className="flex min-w-0 items-start gap-3">
            <InfoMenu title={eyebrow} body={body} />
            <div className="min-w-0">
              <h2 className="max-w-4xl text-2xl font-semibold leading-tight text-foreground lg:text-3xl">{title}</h2>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-3 xl:w-[560px]">
            {tabs.map((tab) => {
              const Icon = tab.icon
              const active = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`group relative rounded-md border p-2.5 text-left transition hover:-translate-y-0.5 ${active ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground"}`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5" />
                    <span className="font-semibold">{tab.label}</span>
                    <MoreHorizontal className="ml-auto h-4 w-4 opacity-60" />
                  </div>
                  <p className="pointer-events-none absolute left-2 right-2 top-[calc(100%+0.35rem)] z-20 hidden rounded-md border border-border bg-popover p-2 text-xs leading-5 text-popover-foreground shadow-lg group-hover:block group-focus-visible:block">{tab.caption}</p>
                </button>
              )
            })}
          </div>
        </div>
      </Panel>
      {children}
    </div>
  )
}

function LearnRoute({ dashboard, quizzes, setView }: { dashboard: any; quizzes: Quiz[]; setView: (view: View) => void }) {
  const focus = dashboard?.snapshot?.recommendedFocus ?? []
  const weakTopics = dashboard?.snapshot?.weakTopics ?? []
  const actions = useMemo(() => [
    { title: "Review", body: "Open recall before browsing.", view: "reviews" as View, icon: Repeat2 },
    { title: "Create", body: "Turn notes into practice.", view: "studio" as View, icon: Sparkles },
    { title: "Schedule", body: "Give concepts a time block.", view: "calendar" as View, icon: CalendarDays },
  ], [])

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <Panel className="p-5">
        <div className="grid gap-3 md:grid-cols-3">
          {actions.map((action) => {
            const Icon = action.icon
            return (
              <button key={action.title} onClick={() => setView(action.view)} className="rounded-md border border-border bg-background p-4 text-left hover:bg-accent hover:text-accent-foreground">
                <Icon className="h-6 w-6 text-success" />
                <h3 className="mt-4 font-semibold text-foreground">{action.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{action.body}</p>
              </button>
            )
          })}
        </div>
      </Panel>
      <Panel className="p-4">
        <h3 className="font-semibold text-foreground">Today's learning signal</h3>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <MiniMetric label="Goal" value={`${dashboard?.snapshot?.goalCompletion ?? 0}%`} />
          <MiniMetric label="Quiz banks" value={String(quizzes.length)} />
          <MiniMetric label="Focus topics" value={String(focus.length)} />
          <MiniMetric label="Weak topics" value={String(weakTopics.length)} />
        </div>
        <InfoStrip body="Dashboard commands. Learn routes." />
      </Panel>
      <Panel className="p-4 xl:col-span-2">
        <h3 className="font-semibold text-foreground">Shortcuts</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <PatternCard icon={Sparkles} title="Studio" body="Create, save, export." />
          <PatternCard icon={MessageSquare} title="Social" body="Thread, mention, react." />
          <PatternCard icon={Repeat2} title="Loop" body="Discover, review, retry." />
        </div>
      </Panel>
    </div>
  )
}

function InfoMenu({ body, title }: { body: string; title: string }) {
  return (
    <details className="group/info relative">
      <summary className="flex h-9 w-9 list-none items-center justify-center rounded-md border border-border bg-secondary text-secondary-foreground transition hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground" aria-label={`About ${title}`}>
        <Info className="h-4 w-4" />
      </summary>
      <div className="absolute left-0 top-11 z-30 w-72 rounded-md border border-border bg-popover p-3 text-sm leading-6 text-popover-foreground shadow-xl">
        {body}
      </div>
    </details>
  )
}

function InfoStrip({ body }: { body: string }) {
  return (
    <div className="mt-3 flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
      <Info className="h-4 w-4 text-success" />
      {body}
    </div>
  )
}

function PracticeGuide() {
  const items = [
    { icon: BookOpen, title: "Quiz", body: "Use for accuracy, explanations, and slower correction." },
    { icon: Gamepad2, title: "Game", body: "Use for momentum, speed, and repeated retrieval." },
    { icon: Repeat2, title: "Loop", body: "Quiz missed topics, then replay them as a short game." },
  ]
  return (
    <Panel className="h-max p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold text-foreground">Practice guide</h3>
        <InfoMenu title="Practice guide" body="Pick quiz mode for careful correction, game mode for fast repetition." />
      </div>
      <div className="mt-3 grid gap-2">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <div key={item.title} className="group relative flex items-center gap-3 rounded-md border border-border bg-background p-3">
              <Icon className="h-6 w-6 text-success" />
              <p className="font-semibold text-foreground">{item.title}</p>
              <p className="pointer-events-none absolute right-2 top-[calc(100%+0.35rem)] z-20 hidden w-56 rounded-md border border-border bg-popover p-2 text-xs leading-5 text-popover-foreground shadow-lg group-hover:block">{item.body}</p>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold text-foreground">{value}</p>
    </div>
  )
}

function PatternCard({ body, icon: Icon, title }: { body: string; icon: ComponentType<{ className?: string }>; title: string }) {
  return (
    <div className="group relative flex items-center gap-3 rounded-md border border-border bg-background p-4">
      <Icon className="h-6 w-6 text-success" />
      <p className="font-semibold text-foreground">{title}</p>
      <p className="pointer-events-none absolute left-3 right-3 top-[calc(100%+0.35rem)] z-20 hidden rounded-md border border-border bg-popover p-2 text-xs leading-5 text-popover-foreground shadow-lg group-hover:block">{body}</p>
    </div>
  )
}

function learnTabFromView(view: View): LearnTab {
  if (view === "feed" || view === "discover") return "discover"
  if (view === "graph") return "graph"
  if (view === "reviews") return "reviews"
  if (view === "calendar") return "calendar"
  if (view === "progress") return "progress"
  return "overview"
}

function viewFromLearnTab(tab: LearnTab): View {
  if (tab === "overview") return "learn"
  if (tab === "discover") return "discover"
  return tab
}

function viewFromPracticeTab(tab: PracticeTab): View {
  return tab
}

function socialTabFromView(view: View): SocialTab {
  if (view === "spaces") return "spaces"
  if (view === "rooms") return "rooms"
  if (view === "battles") return "battles"
  return "chat"
}

function viewFromSocialTab(tab: SocialTab): View {
  return tab
}

