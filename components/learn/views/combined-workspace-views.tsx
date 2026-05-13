"use client"

import { useEffect, useMemo, useState, type ComponentType } from "react"
import { BarChart3, BookOpen, CalendarDays, Compass, Gamepad2, GitFork, MessageSquare, Radio, Repeat2, Sparkles, Swords, Target, Users } from "lucide-react"
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
      title="One place for route, discovery, graph, review, calendar, and progress."
      body="This replaces the duplicate Vault-style dashboard with a learner workflow: choose what to study, capture the idea, review it later, and track what is improving."
      tabs={learnTabs}
      activeTab={tab}
      setActiveTab={(value) => setTab(value as LearnTab)}
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
}: {
  initialView: View
  options: WorkspaceOptions
  quizzes: Quiz[]
  selectedQuizId: string
  setSelectedQuizId: (id: string) => void
}) {
  const [tab, setTab] = useState<PracticeTab>(initialView === "games" ? "games" : "quizzes")

  useEffect(() => {
    setTab(initialView === "games" ? "games" : "quizzes")
  }, [initialView])

  return (
    <WorkspaceFrame
      eyebrow="Practice workspace"
      title="Quizzes and games now work as one active-recall area."
      body="A strong practice loop should move between deliberate quiz attempts and fast recall games without making you hunt through separate pages."
      tabs={practiceTabs}
      activeTab={tab}
      setActiveTab={(value) => setTab(value as PracticeTab)}
    >
      <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
        <div>{tab === "quizzes" ? <QuizView quizzes={quizzes} selectedQuizId={selectedQuizId} setSelectedQuizId={setSelectedQuizId} options={options} /> : <GamesView quizzes={quizzes} options={options} />}</div>
        <PracticeGuide />
      </div>
    </WorkspaceFrame>
  )
}

export function SocialWorkspaceView({ initialView, options }: { initialView: View; options: WorkspaceOptions }) {
  const [tab, setTab] = useState<SocialTab>(socialTabFromView(initialView))

  useEffect(() => {
    setTab(socialTabFromView(initialView))
  }, [initialView])

  return (
    <WorkspaceFrame
      eyebrow="Social workspace"
      title="Chat, spaces, rooms, and battles are grouped by collaboration mode."
      body="Social learning should be opt-in and purposeful: discuss asynchronously, organize circles, focus together, or run a challenge."
      tabs={socialTabs}
      activeTab={tab}
      setActiveTab={(value) => setTab(value as SocialTab)}
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
      <Panel className="p-4 lg:p-5">
        <div className="grid gap-4 xl:grid-cols-[1fr_auto] xl:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{eyebrow}</p>
            <h2 className="mt-2 max-w-4xl text-2xl font-semibold leading-tight text-foreground lg:text-3xl">{title}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{body}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:w-[560px]">
            {tabs.map((tab) => {
              const Icon = tab.icon
              const active = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded-md border p-3 text-left transition ${active ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground"}`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    <span className="font-semibold">{tab.label}</span>
                  </div>
                  <p className={`mt-1 text-xs leading-5 ${active ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{tab.caption}</p>
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
    { title: "Start with one recall task", body: "Open reviews before browsing. Active recall solves the common problem of notes becoming passive storage.", view: "reviews" as View, icon: Repeat2 },
    { title: "Turn notes into practice", body: "Use Studio, AI, then Practice so content creation and delivery are not separate chores.", view: "studio" as View, icon: Sparkles },
    { title: "Schedule the next block", body: "Give every important concept a time anchor, not only a page or card.", view: "calendar" as View, icon: CalendarDays },
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
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{action.body}</p>
              </button>
            )
          })}
        </div>
      </Panel>
      <Panel className="p-4">
        <h3 className="font-semibold text-foreground">Today’s learning signal</h3>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <MiniMetric label="Goal" value={`${dashboard?.snapshot?.goalCompletion ?? 0}%`} />
          <MiniMetric label="Quiz banks" value={String(quizzes.length)} />
          <MiniMetric label="Focus topics" value={String(focus.length)} />
          <MiniMetric label="Weak topics" value={String(weakTopics.length)} />
        </div>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">Use this page as the “what next?” surface. Dashboard stays a command center; Learn is the working route.</p>
      </Panel>
    </div>
  )
}

function PracticeGuide() {
  return (
    <Panel className="h-max p-4">
      <h3 className="font-semibold text-foreground">Practice guide</h3>
      <div className="mt-3 space-y-3 text-sm leading-6 text-muted-foreground">
        <p><strong className="text-foreground">Quiz:</strong> use when you need accuracy, explanations, and slower correction.</p>
        <p><strong className="text-foreground">Game:</strong> use when you need momentum, speed, and repeated retrieval.</p>
        <p><strong className="text-foreground">Best loop:</strong> quiz missed topics, then replay them as a short game.</p>
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

function learnTabFromView(view: View): LearnTab {
  if (view === "feed" || view === "discover") return "discover"
  if (view === "graph") return "graph"
  if (view === "reviews") return "reviews"
  if (view === "calendar") return "calendar"
  if (view === "progress") return "progress"
  return "overview"
}

function socialTabFromView(view: View): SocialTab {
  if (view === "spaces") return "spaces"
  if (view === "rooms") return "rooms"
  if (view === "battles") return "battles"
  return "chat"
}
