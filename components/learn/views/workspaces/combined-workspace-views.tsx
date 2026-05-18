"use client"

import { useEffect, useMemo, useState, type ComponentType } from "react"
import { BookOpen, CalendarDays, ChevronDown, Clock, Gamepad2, Info, MessageSquare, MoreHorizontal, Play, Radio, Repeat2, Sparkles, Swords, Target, Trash2, Users } from "lucide-react"
import type { Quiz, View } from "../../types"
import type { WorkspaceOptions } from "../../preferences"
import { Panel } from "../../ui"
import { ReviewsView, SocialLearningView } from "../ecosystem-views"
import { CalendarView } from "../secondary-views"
import { ChatView, GamesView } from "../productivity-views"
import { QuizView } from "../quiz-view"
import { buildLearnRoutePlan } from "@/lib/learn-route-features"
import { clearPracticeDraft, listPracticeDraftCards, PRACTICE_DRAFT_EVENT, readPracticeDrafts, type PracticeDraftCard } from "@/lib/practice-drafts"
import { buildPracticeWorkspacePlan, type PracticeWorkspaceAction, type PracticeWorkspacePlan, type PracticeWorkspaceTarget } from "@/lib/practice-features"

type LearnTab = "overview" | "reviews" | "calendar"
type PracticeTab = "quizzes" | "games"
type SocialTab = "chat" | "spaces" | "rooms" | "battles"

const learnTabs: Array<{ id: LearnTab; label: string; icon: ComponentType<{ className?: string }>; caption: string }> = [
  { id: "overview", label: "Today", icon: Target, caption: "One recommended next step" },
  { id: "reviews", label: "Reviews", icon: Repeat2, caption: "Active recall queue" },
  { id: "calendar", label: "Calendar", icon: CalendarDays, caption: "Study blocks and due dates" },
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
      title="Learn"
      body="A compact daily loop: choose today's next step, review due concepts, or schedule focused study time."
      tabs={learnTabs}
      activeTab={tab}
      setActiveTab={(value) => {
        const nextTab = value as LearnTab
        setTab(nextTab)
        setView(viewFromLearnTab(nextTab))
      }}
    >
      {tab === "overview" ? <LearnRoute dashboard={dashboard} quizzes={quizzes} setView={setView} /> : null}
      {tab === "reviews" ? <ReviewsView setView={setView} /> : null}
      {tab === "calendar" ? <CalendarView options={options} /> : null}
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
  const [draftCards, setDraftCards] = useState<PracticeDraftCard[]>([])
  const quizTitles = useMemo(() => Object.fromEntries(quizzes.map((quiz) => [quiz.id, quiz.title])), [quizzes])
  const practicePlan = useMemo(() => buildPracticeWorkspacePlan({
    activeTarget: tab,
    quizCount: quizzes.length,
    draftCount: draftCards.length,
    answeredDraftCount: draftCards.reduce((sum, draft) => sum + draft.answeredCount, 0),
    markedDraftCount: draftCards.reduce((sum, draft) => sum + draft.markedCount, 0),
    retryDraftCount: draftCards.reduce((sum, draft) => sum + draft.retryCount, 0),
  }), [draftCards, quizzes.length, tab])

  useEffect(() => {
    setTab(initialView === "games" ? "games" : "quizzes")
  }, [initialView])

  useEffect(() => {
    function syncDraftCards() {
      setDraftCards(listPracticeDraftCards(readPracticeDrafts(), quizTitles))
    }

    syncDraftCards()
    window.addEventListener(PRACTICE_DRAFT_EVENT, syncDraftCards)
    return () => window.removeEventListener(PRACTICE_DRAFT_EVENT, syncDraftCards)
  }, [quizTitles])

  function resumeDraft(quizId: string) {
    setSelectedQuizId(quizId)
    setTab("quizzes")
    setView("quizzes")
  }

  function discardDraft(quizId: string) {
    clearPracticeDraft(quizId)
    setDraftCards(listPracticeDraftCards(readPracticeDrafts(), quizTitles))
  }

  function openPracticeTarget(target: PracticeWorkspaceTarget) {
    setTab(target)
    setView(viewFromPracticeTab(target))
  }

  return (
    <WorkspaceFrame
      eyebrow="Practice workspace"
      title="Practice arena"
      body="Quizzes and games share one practice surface. Start simple, then use modes, timers, and retries when needed."
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
        <PracticeGuide draftCards={draftCards} onClearDraft={discardDraft} onCreatePractice={() => setView("ai")} onOpenTarget={openPracticeTarget} onResumeDraft={resumeDraft} plan={practicePlan} />
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
  const routePlan = useMemo(() => buildLearnRoutePlan({
    goalCompletion: dashboard?.snapshot?.goalCompletion ?? 0,
    quizCount: quizzes.length,
    recommendedFocus: focus,
    weakTopics,
  }), [dashboard?.snapshot?.goalCompletion, focus, quizzes.length, weakTopics])
  const actionIcons = useMemo(() => ({
    create: Sparkles,
    practice: BookOpen,
    review: Repeat2,
    schedule: CalendarDays,
  }), [])

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <Panel className="p-5">
        <div className="mb-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Recommended route</p>
            <h3 className="mt-1 text-2xl font-semibold text-foreground">{routePlan.headline}</h3>
          </div>
          <button onClick={() => setView(routePlan.primaryAction.view)} className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">
            Start: {routePlan.primaryAction.title}
          </button>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          {routePlan.actions.map((action) => {
            const Icon = actionIcons[action.id]
            return (
              <button key={action.title} onClick={() => setView(action.view)} className="group relative rounded-md border border-border bg-background p-4 text-left transition hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground">
                <div className="flex items-start justify-between gap-3">
                  <Icon className="h-6 w-6 text-success" />
                  <MoreHorizontal className="h-4 w-4 text-muted-foreground group-hover:text-accent-foreground" />
                </div>
                <h3 className="mt-4 font-semibold text-foreground group-hover:text-accent-foreground">{action.title}</h3>
                <span className="mt-2 inline-flex rounded-md bg-secondary px-2 py-0.5 text-[0.68rem] font-semibold uppercase text-secondary-foreground group-hover:bg-background/80">Open</span>
                <p className="pointer-events-none absolute left-3 right-3 top-[calc(100%+0.35rem)] z-20 hidden rounded-md border border-border bg-popover p-2 text-xs leading-5 text-popover-foreground shadow-lg group-hover:block group-focus-visible:block">{action.body}</p>
              </button>
            )
          })}
        </div>
      </Panel>
      <Panel className="p-4">
        <h3 className="font-semibold text-foreground">Today's learning signal</h3>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {routePlan.signals.map((signal) => <MiniMetric key={signal.label} label={signal.label} value={signal.value} />)}
        </div>
        <details className="group/why mt-3 rounded-md border border-border bg-background">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-foreground">
            <span>Why this route</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground transition group-open/why:rotate-180" />
          </summary>
          <div className="border-t border-border px-3 py-2 text-sm leading-6 text-muted-foreground">{routePlan.primaryAction.body}</div>
        </details>
      </Panel>
      <Panel className="p-4 xl:col-span-2">
        <details className="group/loop">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-foreground">
            <span>Learning loop</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground transition group-open/loop:rotate-180" />
          </summary>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <PatternCard icon={Sparkles} title="Capture" body="Studio keeps notes, docs, sheets, slides, and imports together." />
            <PatternCard icon={Repeat2} title="Practice" body="Review, quiz, retry misses, and save hard items as cards." />
            <PatternCard icon={MessageSquare} title="Reflect" body="Use Social only when you want collaboration or accountability." />
          </div>
        </details>
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

function PracticeGuide({
  draftCards,
  onClearDraft,
  onCreatePractice,
  onOpenTarget,
  onResumeDraft,
  plan,
}: {
  draftCards: PracticeDraftCard[]
  onClearDraft: (quizId: string) => void
  onCreatePractice: () => void
  onOpenTarget: (target: PracticeWorkspaceTarget) => void
  onResumeDraft: (quizId: string) => void
  plan: PracticeWorkspacePlan
}) {
  function runAction(action: PracticeWorkspaceAction) {
    if (action.id === "resume" && draftCards[0]) {
      onResumeDraft(draftCards[0].quizId)
      return
    }
    if (action.id === "create") {
      onCreatePractice()
      return
    }
    onOpenTarget(action.target)
  }

  return (
    <Panel className="h-max p-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold text-foreground">Practice next</h3>
        <InfoMenu title="Practice next" body="Choose the plain action first. The detailed quiz modes, timers, marks, drafts, and game runs stay inside each practice area." />
      </div>
      <div className="mt-3 rounded-md border border-primary/25 bg-primary/10 p-3">
        <p className="text-sm font-semibold text-foreground">{plan.headline}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {plan.signals.map((signal) => (
            <span key={signal.label} className="inline-flex items-center gap-1 rounded-md bg-background/80 px-2 py-1 text-[0.68rem] font-semibold uppercase text-muted-foreground">
              <strong className="text-sm text-foreground">{signal.value}</strong>
              {signal.label}
            </span>
          ))}
        </div>
        <button onClick={() => runAction(plan.primaryAction)} className="mt-3 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground">
          <Play className="h-3.5 w-3.5" />
          {plan.primaryAction.label}
        </button>
      </div>
      <details className="group/practice mt-3 rounded-md border border-border bg-background">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-foreground">
          <span>More practice paths</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition group-open/practice:rotate-180" />
        </summary>
        <div className="grid gap-2 border-t border-border p-2">
          {plan.actions.map((action) => (
            <PracticeActionButton key={action.id} action={action} onClick={() => runAction(action)} />
          ))}
        </div>
      </details>
      {draftCards.length ? (
        <details className="group/drafts mt-3 rounded-md border border-warning/50 bg-warning/10">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-foreground">
            <span>Saved drafts</span>
            <span className="ml-auto rounded-md bg-background px-2 py-0.5 text-[0.68rem] font-semibold text-foreground">{draftCards.length}</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground transition group-open/drafts:rotate-180" />
          </summary>
          <div className="grid gap-2 border-t border-warning/40 p-2">
            {draftCards.slice(0, 3).map((draft) => (
              <div key={draft.quizId} className="rounded-md border border-border bg-background p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{draft.title}</p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      {formatCompactDuration(draft.elapsedSeconds)} | {draft.answeredCount} answered | {draft.markedCount} marked
                    </p>
                  </div>
                  <span className="rounded-md bg-secondary px-2 py-1 text-[0.68rem] font-semibold text-secondary-foreground">{draft.practiceMode.replace(/-/g, " ")}</span>
                </div>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => onResumeDraft(draft.quizId)} className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-2 text-xs font-semibold text-primary-foreground">
                    <Play className="h-3.5 w-3.5" />
                    Resume
                  </button>
                  <button onClick={() => onClearDraft(draft.quizId)} className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-secondary px-2 text-xs font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground">
                    <Trash2 className="h-3.5 w-3.5" />
                    Clear
                  </button>
                </div>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </Panel>
  )
}

function PracticeActionButton({ action, onClick }: { action: PracticeWorkspaceAction; onClick: () => void }) {
  const Icon = action.id === "speed" ? Gamepad2 : action.id === "repair" ? Repeat2 : action.id === "create" ? Sparkles : BookOpen
  return (
    <button onClick={onClick} className="group relative rounded-md border border-border bg-background p-2.5 text-left transition hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-success" />
        <span className="min-w-0 truncate text-sm font-semibold text-foreground group-hover:text-accent-foreground">{action.label}</span>
      </div>
      <span className="mt-2 inline-flex rounded-md bg-secondary px-2 py-0.5 text-[0.68rem] font-semibold text-secondary-foreground">{action.badge}</span>
      <p className="pointer-events-none absolute right-0 top-[calc(100%+0.35rem)] z-20 hidden w-60 rounded-md border border-border bg-popover p-2 text-xs leading-5 text-popover-foreground shadow-lg group-hover:block group-focus-visible:block">{action.caption}</p>
    </button>
  )
}

function formatCompactDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, "0")}`
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
  if (view === "reviews") return "reviews"
  if (view === "calendar") return "calendar"
  return "overview"
}

function viewFromLearnTab(tab: LearnTab): View {
  if (tab === "overview") return "learn"
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

