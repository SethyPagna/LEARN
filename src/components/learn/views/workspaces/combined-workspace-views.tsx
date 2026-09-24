"use client"

import { useEffect, useMemo, useState, type ComponentType } from "react"
import { BookOpen, ChevronDown, Clock, Gamepad2, Info, MessageSquare, Play, Radio, Repeat2, Send, Sparkles, Swords, Target, Trash2, Users, UsersRound } from "lucide-react"
import type { Quiz, User, View } from "../../types"
import type { WorkspaceOptions } from "../../preferences"
import { Panel } from "../../ui"
import { SocialLearningView } from "../ecosystem-views"
import { ChatView, GamesView } from "../productivity-views"
import { QuizView } from "../quiz-view"
import { AI_TUTOR_LAUNCH_KEY, buildPracticeAiTutorLaunch } from "@/lib/ai/tutor-workflow"
import {
  practiceWorkspaceTabs,
  socialWorkspaceTabFromView,
  socialWorkspaceTabs,
  viewFromPracticeWorkspaceTab,
  viewFromSocialWorkspaceTab,
  type PracticeWorkspaceTab,
  type SocialWorkspaceTab,
} from "@/lib/learn-workspace-navigation"
import { clearPracticeDraft, listPracticeDraftCards, PRACTICE_DRAFT_EVENT, readPracticeDrafts, type PracticeDraftCard } from "@/lib/practice-drafts"
import { buildPracticeArenaPresets, buildPracticeGameModes, buildPracticeLiveJoinCard, buildPracticePlayStyles, buildPracticeReadyLoops, buildPracticeWorkspacePlan, type PracticeArenaPreset, type PracticeGameMode, type PracticeLiveJoinCard, type PracticePlayStyle, type PracticeReadyLoop, type PracticeWorkspaceAction, type PracticeWorkspaceActionId, type PracticeWorkspacePlan, type PracticeWorkspaceTarget } from "@/lib/practice-features"

const practiceTabIcons: Record<PracticeWorkspaceTab, ComponentType<{ className?: string }>> = {
  quizzes: BookOpen,
  games: Gamepad2,
}

const socialTabIcons: Record<SocialWorkspaceTab, ComponentType<{ className?: string }>> = {
  chat: MessageSquare,
  spaces: Users,
  rooms: Radio,
  battles: Swords,
}

const practicePlayStyleIcons: Record<PracticePlayStyle["id"], ComponentType<{ className?: string }>> = {
  live: Target,
  study: BookOpen,
  assessment: Clock,
  arcade: Gamepad2,
  strategy: Swords,
}

const practiceGameModeIcons: Record<PracticeGameMode["id"], ComponentType<{ className?: string }>> = {
  classic: Target,
  "team-race": Users,
  match: Repeat2,
  redemption: Clock,
  "arcade-quest": Gamepad2,
  economy: Swords,
}

const practiceArenaPresetIcons: Record<PracticeArenaPreset["id"], ComponentType<{ className?: string }>> = {
  classic: Swords,
  accuracy: Target,
  team: UsersRound,
  flashcards: BookOpen,
  redemption: Repeat2,
  "ai-generated": Sparkles,
}

const practiceReadyLoopIcons: Record<PracticeReadyLoop["id"], ComponentType<{ className?: string }>> = {
  generate: Sparkles,
  play: Play,
  battle: Swords,
  share: Send,
}

type PracticeGuideStep = "start" | "live" | "setup" | "drafts"
type PracticeSetupStep = "arena" | "styles" | "modes" | "actions"

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
  const [tab, setTab] = useState<PracticeWorkspaceTab>(initialView === "games" ? "games" : "quizzes")
  const [draftCards, setDraftCards] = useState<PracticeDraftCard[]>([])
  const quizTitles = useMemo(() => Object.fromEntries(quizzes.map((quiz) => [quiz.id, quiz.title])), [quizzes])
  const draftCounts = useMemo(() => draftCards.reduce((counts, draft) => ({
    answered: counts.answered + draft.answeredCount,
    marked: counts.marked + draft.markedCount,
    retry: counts.retry + draft.retryCount,
  }), { answered: 0, marked: 0, retry: 0 }), [draftCards])
  const practicePlan = useMemo(() => buildPracticeWorkspacePlan({
    activeTarget: tab,
    quizCount: quizzes.length,
    draftCount: draftCards.length,
    answeredDraftCount: draftCounts.answered,
    markedDraftCount: draftCounts.marked,
    retryDraftCount: draftCounts.retry,
  }), [draftCards.length, draftCounts, quizzes.length, tab])
  const liveJoinCard = useMemo(() => buildPracticeLiveJoinCard({
    quizCount: quizzes.length,
    draftCount: draftCards.length,
    answeredDraftCount: draftCounts.answered,
    markedDraftCount: draftCounts.marked,
    retryDraftCount: draftCounts.retry,
    seed: selectedQuizId || "practice",
  }), [draftCards.length, draftCounts, quizzes.length, selectedQuizId])
  const arenaPresets = useMemo(() => buildPracticeArenaPresets({
    quizCount: quizzes.length,
    draftCount: draftCards.length,
    markedDraftCount: draftCounts.marked,
    retryDraftCount: draftCounts.retry,
  }), [draftCards.length, draftCounts, quizzes.length])
  const playStyles = useMemo(() => buildPracticePlayStyles({
    draftCount: draftCards.length,
    hasQuizBanks: quizzes.length > 0,
    markedCount: draftCounts.marked,
    retryCount: draftCounts.retry,
  }), [draftCards.length, draftCounts, quizzes.length])
  const gameModes = useMemo(() => buildPracticeGameModes({
    draftCount: draftCards.length,
    hasQuizBanks: quizzes.length > 0,
    markedCount: draftCounts.marked,
    retryCount: draftCounts.retry,
  }), [draftCards.length, draftCounts, quizzes.length])
  const readyLoops = useMemo(() => buildPracticeReadyLoops({
    quizCount: quizzes.length,
    draftCount: draftCards.length,
  }), [draftCards.length, quizzes.length])
  const practiceTabs = useMemo(() => practiceWorkspaceTabs.map((item) => ({
    ...item,
    caption: item.caption || "",
    icon: practiceTabIcons[item.id],
  })), [])

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
    setView(viewFromPracticeWorkspaceTab(target))
  }

  function openAiPracticeGenerator() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(AI_TUTOR_LAUNCH_KEY, JSON.stringify(buildPracticeAiTutorLaunch({
        draftCount: draftCards.length,
        quizCount: quizzes.length,
        selectedQuizTitle: quizTitles[selectedQuizId],
      })))
    }
    setView("ai")
  }

  return (
    <WorkspaceFrame
      title="Practice"
      tabs={practiceTabs}
      activeTab={tab}
      setActiveTab={(value) => {
        const nextTab = value as PracticeWorkspaceTab
        setTab(nextTab)
        setView(viewFromPracticeWorkspaceTab(nextTab))
      }}
    >
      <div className="grid min-w-0 gap-3">
        <div>{tab === "quizzes" ? <QuizView quizzes={quizzes} selectedQuizId={selectedQuizId} setSelectedQuizId={setSelectedQuizId} options={options} /> : <GamesView quizzes={quizzes} options={options} />}</div>
        <details className="workspace-disclosure"><summary>Study tools and saved attempts</summary><div className="pt-3"><PracticeGuide arenaPresets={arenaPresets} draftCards={draftCards} gameModes={gameModes} liveJoinCard={liveJoinCard} onClearDraft={discardDraft} onCreatePractice={openAiPracticeGenerator} onOpenTarget={openPracticeTarget} onOpenView={setView} onResumeDraft={resumeDraft} plan={practicePlan} playStyles={playStyles} readyLoops={readyLoops} /></div></details>
      </div>
    </WorkspaceFrame>
  )
}

export function SocialWorkspaceView({ initialView, options, setView }: { initialView: View; options: WorkspaceOptions; setView: (view: View) => void; user: User | null }) {
  const [tab, setTab] = useState<SocialWorkspaceTab>(socialWorkspaceTabFromView(initialView))
  const socialTabs = useMemo(() => socialWorkspaceTabs.map((item) => ({
    ...item,
    caption: item.caption || "",
    icon: socialTabIcons[item.id],
  })), [])

  useEffect(() => {
    setTab(socialWorkspaceTabFromView(initialView))
  }, [initialView])

  return (
    <div className="social-workspace grid min-w-0 gap-3">
      <SocialSectionNav
        activeTab={tab}
        tabs={socialTabs}
        setActiveTab={(value) => {
          const nextTab = value as SocialWorkspaceTab
          setTab(nextTab)
          setView(viewFromSocialWorkspaceTab(nextTab))
        }}
      />
      <div className="min-w-0">
        {tab === "chat" ? <ChatView options={options} /> : null}
        {tab === "spaces" ? <SocialLearningView kind="spaces" setView={setView} /> : null}
        {tab === "rooms" ? <SocialLearningView kind="rooms" setView={setView} /> : null}
        {tab === "battles" ? <SocialLearningView kind="battles" setView={setView} /> : null}
      </div>
    </div>
  )
}

function SocialSectionNav({
  activeTab,
  setActiveTab,
  tabs,
}: {
  activeTab: SocialWorkspaceTab
  setActiveTab: (tab: SocialWorkspaceTab) => void
  tabs: Array<{ id: SocialWorkspaceTab; label: string; icon: ComponentType<{ className?: string }>; caption: string }>
}) {
  return (
    <Panel className="!border-0 !rounded-none !bg-transparent">
      <nav aria-label="Social sections" className="workspace-tabs">
        {tabs.map((item) => {
          const Icon = item.icon
          const active = activeTab === item.id
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              aria-current={active ? "page" : undefined}
              className={`workspace-tab ${active ? "is-active" : ""}`}
              title={item.caption}
              type="button"
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          )
        })}
      </nav>
    </Panel>
  )
}

function WorkspaceFrame<T extends string>({
  activeTab,
  children,
  setActiveTab,
  tabs,
  title,
}: {
  activeTab?: T
  children: React.ReactNode
  setActiveTab?: (tab: T) => void
  tabs?: Array<{ id: T; label: string; icon: ComponentType<{ className?: string }>; caption: string }>
  title: string
}) {
  const visibleTabs = tabs ?? []
  return (
    <div className="grid gap-4">
      <nav aria-label={title} className="workspace-tabs">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon
          return <button key={tab.id} type="button" aria-current={activeTab === tab.id ? "page" : undefined} onClick={() => setActiveTab?.(tab.id)} className={`workspace-tab ${activeTab === tab.id ? "is-active" : ""}`} title={tab.caption}><Icon className="h-4 w-4" />{tab.label}</button>
        })}
      </nav>
      {children}
    </div>
  )
}

function InfoMenu({ body, title }: { body: string; title: string }) {
  return (
    <details className="group/info relative">
      <summary className="flex h-9 w-9 list-none items-center justify-center rounded-md border border-border bg-secondary text-secondary-foreground transition hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground" aria-label={`About ${title}`}>
        <Info className="h-4 w-4" />
      </summary>
      <div className="absolute left-0 top-11 z-50 w-72 rounded-md border border-border bg-popover p-3 text-sm leading-6 text-popover-foreground shadow-xl">
        {body}
      </div>
    </details>
  )
}

function PracticeGuide({
  arenaPresets,
  draftCards,
  gameModes,
  liveJoinCard,
  onClearDraft,
  onCreatePractice,
  onOpenTarget,
  onOpenView,
  onResumeDraft,
  plan,
  playStyles,
  readyLoops,
}: {
  arenaPresets: PracticeArenaPreset[]
  draftCards: PracticeDraftCard[]
  gameModes: PracticeGameMode[]
  liveJoinCard: PracticeLiveJoinCard
  onClearDraft: (quizId: string) => void
  onCreatePractice: () => void
  onOpenTarget: (target: PracticeWorkspaceTarget) => void
  onOpenView: (view: View) => void
  onResumeDraft: (quizId: string) => void
  plan: PracticeWorkspacePlan
  playStyles: PracticePlayStyle[]
  readyLoops: PracticeReadyLoop[]
}) {
  const [activeStep, setActiveStep] = useState<PracticeGuideStep>("start")
  const [activeSetupStep, setActiveSetupStep] = useState<PracticeSetupStep>("arena")
  const guideSteps: Array<{ id: PracticeGuideStep; label: string; count?: number }> = [
    { id: "start", label: "Start", count: plan.signals.length },
    { id: "live", label: "Live", count: liveJoinCard.ready ? 1 : 0 },
    { id: "setup", label: "Setup", count: arenaPresets.length + gameModes.length },
    { id: "drafts", label: "Drafts", count: draftCards.length },
  ]
  const setupSteps: Array<{ id: PracticeSetupStep; label: string; count?: number }> = [
    { id: "arena", label: "Arena", count: arenaPresets.length },
    { id: "styles", label: "Styles", count: playStyles.length },
    { id: "modes", label: "Modes", count: gameModes.length },
    { id: "actions", label: "Actions", count: plan.actions.length },
  ]

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

  function runActionId(actionId: PracticeWorkspaceActionId, target: PracticeWorkspaceTarget) {
    const action = plan.actions.find((item) => item.id === actionId)
    if (action) {
      runAction(action)
      return
    }
    if (actionId === "create") {
      onCreatePractice()
      return
    }
    onOpenTarget(target)
  }

  function runLiveAction() {
    const action = plan.actions.find((item) => item.id === liveJoinCard.primaryAction) || plan.primaryAction
    runAction(action)
  }

  function runReadyLoop(loop: PracticeReadyLoop) {
    if (!loop.enabled) return
    if (loop.target === "ai") {
      onCreatePractice()
      return
    }
    if (loop.target === "battles" || loop.target === "social") {
      onOpenView(loop.target)
      return
    }
    onOpenTarget(loop.target)
  }

  return (
    <Panel className="h-max p-3 xl:sticky xl:top-3 xl:max-h-[calc(100vh-6rem)] xl:overflow-auto">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold text-foreground">Next</h3>
        <InfoMenu title="Practice" body="Pick one loop. Live, setup, and drafts stay grouped here." />
      </div>
      <div className="mt-3 grid grid-cols-4 gap-1 rounded-lg border border-border bg-background p-1">
        {guideSteps.map((step) => (
          <button
            key={step.id}
            onClick={() => setActiveStep(step.id)}
            className={`inline-flex h-9 min-w-0 items-center justify-center gap-1 rounded-md px-2 text-xs font-semibold transition ${
              activeStep === step.id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            }`}
            type="button"
          >
            <span className="truncate">{step.label}</span>
            {typeof step.count === "number" ? <span className={`rounded px-1 text-[0.62rem] ${activeStep === step.id ? "bg-primary-foreground/20" : "bg-secondary text-secondary-foreground"}`}>{step.count}</span> : null}
          </button>
        ))}
      </div>
      {activeStep === "start" ? (
      <div className="mt-3 rounded-md border border-primary/25 bg-primary/10 p-3">
        <p className="text-sm font-semibold text-foreground">{plan.headline}</p>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {plan.signals.slice(0, 3).map((signal) => (
            <span key={signal.label} className="rounded-md bg-background/80 px-2 py-1 text-center text-[0.65rem] font-semibold uppercase text-muted-foreground" title={`${signal.label}: ${signal.value}`}>
              <strong className="block text-sm text-foreground">{signal.value}</strong>
              {signal.label}
            </span>
          ))}
        </div>
        <button onClick={() => runAction(plan.primaryAction)} className="mt-3 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground">
          <Play className="h-3.5 w-3.5" />
          {plan.primaryAction.label}
        </button>
      </div>
      ) : null}
      {activeStep === "start" ? (
      <div className="mt-3 grid grid-cols-2 gap-2">
        {readyLoops.map((loop) => (
          <PracticeReadyLoopButton key={loop.id} loop={loop} onClick={() => runReadyLoop(loop)} />
        ))}
      </div>
      ) : null}
      {activeStep === "live" ? (
      <div className="mt-3 overflow-hidden rounded-lg border border-violet-500/30 bg-[radial-gradient(circle_at_top_right,rgba(168,85,247,0.32),transparent_38%),linear-gradient(135deg,#1f1147,#5b21b6_52%,#111827)] p-3 text-white shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-white/70">Live</p>
            <p className="mt-1 truncate text-base font-bold">{liveJoinCard.headline}</p>
          </div>
          <span className={`rounded-full px-2 py-1 text-[0.68rem] font-bold ${liveJoinCard.ready ? "bg-emerald-400 text-emerald-950" : "bg-white/15 text-white"}`}>
            {liveJoinCard.ready ? "Ready" : "Needs bank"}
          </span>
        </div>
        <div className="mt-3 rounded-md bg-white p-2 text-center shadow-inner">
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.12em] text-slate-500">Game PIN</p>
          <p className="font-mono text-3xl font-black tracking-[0.18em] text-slate-950">{liveJoinCard.pin}</p>
        </div>
        <button onClick={runLiveAction} className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-white px-3 text-sm font-black text-violet-950 shadow-sm transition hover:-translate-y-0.5" type="button">
          <Swords className="h-4 w-4" />
          {liveJoinCard.primaryLabel}
        </button>
        <details className="group/live-rules mt-2 rounded-md bg-white/10">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2 py-1.5 text-xs font-bold text-white/80">
            Rules
            <ChevronDown className="h-3.5 w-3.5 transition group-open/live-rules:rotate-180" />
          </summary>
          <div className="grid gap-1 border-t border-white/10 p-2">
            {liveJoinCard.scoringRules.map((rule) => (
              <div key={rule.label} className="flex items-center justify-between gap-2 text-xs" title={rule.detail}>
                <span className="text-white/65">{rule.label}</span>
                <strong>{rule.value}</strong>
              </div>
            ))}
          </div>
        </details>
      </div>
      ) : null}
      {activeStep === "setup" ? (
        <div className="mt-3 grid gap-2 rounded-md border border-border bg-background p-2">
          <div className="grid grid-cols-4 gap-1">
            {setupSteps.map((step) => (
              <button
                key={step.id}
                onClick={() => setActiveSetupStep(step.id)}
                className={`inline-flex h-8 min-w-0 items-center justify-center gap-1 rounded-md px-2 text-[0.68rem] font-semibold transition ${
                  activeSetupStep === step.id ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground"
                }`}
                type="button"
              >
                <span className="truncate">{step.label}</span>
                <span className={`rounded px-1 text-[0.58rem] ${activeSetupStep === step.id ? "bg-primary-foreground/20" : "bg-background text-foreground"}`}>{step.count}</span>
              </button>
            ))}
          </div>
          <div className="grid gap-2 border-t border-border pt-2">
            {activeSetupStep === "arena" ? arenaPresets.map((preset) => (
              <PracticeArenaPresetButton key={preset.id} onClick={() => runActionId(preset.action, preset.target)} preset={preset} />
            )) : null}
            {activeSetupStep === "styles" ? playStyles.map((style) => (
              <PracticePlayStyleButton key={style.id} onClick={() => onOpenTarget(style.target)} style={style} />
            )) : null}
            {activeSetupStep === "modes" ? gameModes.map((mode) => (
              <PracticeGameModeButton key={mode.id} mode={mode} onClick={() => onOpenTarget(mode.target)} />
            )) : null}
            {activeSetupStep === "actions" ? plan.actions.map((action) => (
              <PracticeActionButton key={action.id} action={action} onClick={() => runAction(action)} />
            )) : null}
          </div>
        </div>
      ) : null}
      {activeStep === "drafts" && draftCards.length ? (
        <details className="group/drafts mt-3 rounded-md border border-warning/50 bg-warning/10">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-foreground">
            <span>Drafts</span>
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
      {activeStep === "drafts" && !draftCards.length ? (
        <div className="mt-3 rounded-md border border-dashed border-border bg-background p-3 text-sm text-muted-foreground">
          No drafts yet. Unfinished practice reappears here.
        </div>
      ) : null}
    </Panel>
  )
}

function PracticeReadyLoopButton({ loop, onClick }: { loop: PracticeReadyLoop; onClick: () => void }) {
  const Icon = practiceReadyLoopIcons[loop.id]
  return (
    <button
      aria-disabled={!loop.enabled}
      className={`group relative min-w-0 rounded-md border p-2 text-left transition ${
        !loop.enabled
          ? "cursor-not-allowed border-border bg-muted/45 opacity-70"
          : loop.recommended
            ? "border-primary/45 bg-primary/10 hover:-translate-y-0.5 hover:bg-primary hover:text-primary-foreground"
            : "border-border bg-background hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground"
      }`}
      onClick={onClick}
      title={loop.reason}
      type="button"
    >
      <div className="flex items-center gap-2">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${loop.recommended && loop.enabled ? "bg-primary text-primary-foreground group-hover:bg-primary-foreground group-hover:text-primary" : "bg-secondary text-secondary-foreground"}`}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-foreground group-hover:text-inherit">{loop.label}</span>
          <span className="block truncate text-[0.65rem] font-bold uppercase text-muted-foreground group-hover:text-inherit">{loop.badge}</span>
        </span>
      </div>
    </button>
  )
}

function PracticeArenaPresetButton({ onClick, preset }: { onClick: () => void; preset: PracticeArenaPreset }) {
  const Icon = practiceArenaPresetIcons[preset.id]
  return (
    <button
      aria-disabled={Boolean(preset.disabledReason)}
      className={`group rounded-md border p-2.5 text-left transition ${
        preset.disabledReason
          ? "cursor-not-allowed border-border bg-muted/45 opacity-70"
          : preset.recommended
            ? "border-violet-400/60 bg-violet-500/10 hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground"
            : "border-border bg-background hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground"
      }`}
      onClick={() => {
        if (!preset.disabledReason) onClick()
      }}
      title={preset.disabledReason || preset.caption}
      type="button"
    >
      <div className="flex items-center gap-2">
        <span className={`flex h-9 w-9 items-center justify-center rounded-md ${preset.recommended ? "bg-violet-600 text-white" : "bg-secondary text-secondary-foreground"}`}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-foreground group-hover:text-accent-foreground">{preset.label}</span>
            {preset.recommended ? <span className="rounded-full bg-success px-1.5 py-0.5 text-[0.6rem] font-black uppercase text-success-foreground">Best</span> : null}
          </span>
          <span className="block truncate text-[0.68rem] font-semibold text-muted-foreground">{preset.model}</span>
        </span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1">
        {preset.scoring.map((score) => (
          <span key={score.label} className="rounded-md bg-secondary px-1.5 py-1 text-center text-[0.62rem] font-semibold text-secondary-foreground" title={`${score.label}: ${score.value}`}>
            {score.value}
          </span>
        ))}
      </div>
    </button>
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

function PracticeGameModeButton({ mode, onClick }: { mode: PracticeGameMode; onClick: () => void }) {
  const Icon = practiceGameModeIcons[mode.id]
  return (
    <button
      onClick={onClick}
      className={`group rounded-md border p-2.5 text-left transition hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground ${
        mode.recommended ? "border-primary/40 bg-primary/10" : "border-border bg-background"
      }`}
      title={mode.detail}
      type="button"
    >
      <div className="flex items-center gap-2">
        <span className={`flex h-8 w-8 items-center justify-center rounded-md ${mode.recommended ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground group-hover:text-accent-foreground">{mode.label}</span>
          <span className="block truncate text-[0.68rem] font-semibold text-muted-foreground">{mode.source} / {mode.practiceMode.replace(/-/g, " ")}</span>
        </span>
        <span className={`rounded-md px-2 py-0.5 text-[0.65rem] font-semibold ${mode.recommended ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>{mode.badge}</span>
      </div>
    </button>
  )
}

function PracticePlayStyleButton({ onClick, style }: { onClick: () => void; style: PracticePlayStyle }) {
  const Icon = practicePlayStyleIcons[style.id]
  return (
    <button
      onClick={onClick}
      className={`group rounded-md border p-2.5 text-left transition hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground ${
        style.recommended ? "border-primary/40 bg-primary/10" : "border-border bg-background"
      }`}
      title={style.detail}
      type="button"
    >
      <div className="flex items-center gap-2">
        <span className={`flex h-8 w-8 items-center justify-center rounded-md ${style.recommended ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground group-hover:text-accent-foreground">{style.label}</span>
          <span className="block truncate text-[0.68rem] font-semibold text-muted-foreground">{style.model}</span>
        </span>
        <span className={`rounded-md px-2 py-0.5 text-[0.65rem] font-semibold ${style.recommended ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>{style.badge}</span>
      </div>
    </button>
  )
}

function formatCompactDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

