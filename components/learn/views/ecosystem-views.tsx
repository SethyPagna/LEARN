"use client"

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react"
import {
  ArrowRight,
  Brain,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Compass,
  Copy,
  Edit3,
  Eye,
  FolderOpen,
  GitFork,
  Lock,
  Mail,
  MessageSquare,
  MoreHorizontal,
  Network,
  Play,
  Radio,
  Repeat2,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Swords,
  Trash2,
  Users,
} from "lucide-react"
import { api } from "../api"
import type {
  Achievement,
  KnowledgeEdge,
  KnowledgeNode,
  LearningSpace,
  MicroLesson,
  PublicProfile,
  ReviewItem,
  StudyBattle,
  StudyRoom,
  User,
  View,
} from "../types"
import { EmptyState, Panel, StatusMessage } from "../ui"
import { buildFeedActionPlan, buildKnowledgeGraphActionPlan, buildReviewActionPlan, buildReviewRatingActions, buildReviewSummaryChips, reviewAnswerText, reviewPromptText, reviewSourceLabel, summarizeFeedWorkspace, summarizeKnowledgeGraph, summarizeReviewSession, type ReviewRating } from "@/lib/learning-ecosystem"
import { buildProfileActionPlan, type ProfilePlanTarget } from "@/lib/profile-features"
import { buildSocialActionKit, buildSocialActionReadiness, buildSocialActionsPage, buildSocialActivityTimeline, buildSocialInviteReadiness, buildSocialRecordCard, buildSocialRecordEmptyState, buildSocialRecordFilterSummary, buildSocialRecordsPage, buildSocialRecordSelectionMessage, buildSocialWorkspacePlan, buildWorkspaceMembersPage, filterSocialRecords, findRecommendedSocialRecord, formatSocialAction, normalizeSocialInviteDraft, summarizeSocialActions, summarizeSocialWorkspace, summarizeWorkspaceMembers, type SocialActionLike, type SocialActionTarget, type SocialRecordFilter, type WorkspaceMemberLike } from "@/lib/social-features"

type VaultGraphPayload = {
  nodes: KnowledgeNode[]
  edges: KnowledgeEdge[]
  orphanNodes: KnowledgeNode[]
}

type ReviewPayload = {
  items: ReviewItem[]
  isRestDay: boolean
  remainingDueCount: number
}

const SOCIAL_DRAFT_KEY_PREFIX = "learn_social_draft_v1"

export function VaultView({ setView }: { setView: (view: View) => void }) {
  const { data, status } = useResource<VaultGraphPayload>("/api/vault/graph")
  const [blockType, setBlockType] = useState("text")

  const topNodes = data?.nodes.slice(0, 5) ?? []
  return (
    <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
      <section className="rounded-lg border border-border bg-[radial-gradient(circle_at_20%_20%,hsl(var(--primary)/0.18),transparent_34%),hsl(var(--card))] p-5 text-card-foreground">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Private by default</p>
            <h2 className="mt-2 max-w-2xl text-3xl font-semibold leading-tight">Your Vault is the living map of what you know.</h2>
          </div>
          <button onClick={() => setView("notes")} className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground">
            <Brain className="h-4 w-4" />
            New note
          </button>
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-4">
          <Metric label="Nodes" value={String(data?.nodes.length ?? 0)} />
          <Metric label="Edges" value={String(data?.edges.length ?? 0)} />
          <Metric label="Orphans" value={String(data?.orphanNodes.length ?? 0)} />
          <Metric label="Mode" value="Solo" />
        </div>
      </section>

      <Panel className="p-4">
        <h3 className="font-semibold text-foreground">Daily ritual</h3>
        <div className="mt-3 grid gap-2">
          <RitualButton icon={Repeat2} label="Review queue" onClick={() => setView("reviews")} />
          <RitualButton icon={GitFork} label="Open graph" onClick={() => setView("graph")} />
          <RitualButton icon={Compass} label="Discover spark" onClick={() => setView("feed")} />
          <RitualButton icon={Sparkles} label="Ask AI co-pilot" onClick={() => setView("ai")} />
        </div>
      </Panel>

      <Panel className="p-4 xl:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-foreground">Block palette</h3>
            <p className="text-sm text-muted-foreground">Choose how the next idea should enter the Vault.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {["text", "heading", "toggle", "image", "code", "equation", "quiz", "flashcard", "diagram"].map((type) => (
              <button
                key={type}
                onClick={() => setBlockType(type)}
                className={`h-9 rounded-md border px-3 text-sm font-medium ${blockType === type ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary text-secondary-foreground"}`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>
      </Panel>

      <Panel className="p-4 xl:col-span-2">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-foreground">Active knowledge</h3>
          <span className="text-sm text-muted-foreground">{status}</span>
        </div>
        <div className="grid gap-3 md:grid-cols-5">
          {topNodes.length ? topNodes.map((node) => <NodeCard key={node.id} node={node} />) : <EmptyState title="No graph nodes yet" body="Create notes and reviews to grow your Vault graph." />}
        </div>
      </Panel>
    </div>
  )
}

type GraphFilter = "all" | "weak" | "orphan" | "public"

export function GraphView({ setView }: { setView: (view: View) => void }) {
  const { data, status } = useResource<VaultGraphPayload>("/api/vault/graph")
  const [selectedId, setSelectedId] = useState("")
  const [graphFilter, setGraphFilter] = useState<GraphFilter>("all")
  const nodes = data?.nodes ?? []
  const edges = data?.edges ?? []
  const orphanIds = useMemo(() => new Set((data?.orphanNodes ?? []).map((node) => node.id)), [data?.orphanNodes])
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes])
  const graphSummary = useMemo(() => summarizeKnowledgeGraph(nodes, edges), [edges, nodes])
  const graphPlan = useMemo(() => buildKnowledgeGraphActionPlan(nodes, edges, graphSummary), [edges, graphSummary, nodes])
  const selectedNode = useMemo(() => nodes.find((node) => node.id === selectedId) ?? nodes[0], [nodes, selectedId])
  const filteredNodes = useMemo(() => filterGraphNodes(nodes, orphanIds, graphFilter), [graphFilter, nodes, orphanIds])

  function applyGraphPlan() {
    if (graphPlan.nextAction === "add-node") {
      setView("studio")
      return
    }
    if (graphPlan.nextAction === "review-weak") {
      setView("reviews")
      return
    }
    if (graphPlan.nextAction === "open-ai") {
      setView("ai")
      return
    }
    if (graphPlan.targetNodeId) {
      setSelectedId(graphPlan.targetNodeId)
      setGraphFilter("all")
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <Panel className="min-h-[520px] overflow-hidden p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-foreground">Living graph</h2>
            <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-muted-foreground">
              <span className="rounded-md bg-muted px-2 py-1">{graphSummary.seedCount} seeds</span>
              <span className="rounded-md bg-muted px-2 py-1">{graphSummary.developingCount} developing</span>
              <span className="rounded-md bg-muted px-2 py-1">{graphSummary.masteredCount} mastered</span>
            </div>
          </div>
          <span className="text-sm text-muted-foreground">{status}</span>
        </div>
        <div className="relative h-[440px] rounded-md border border-border bg-background">
          <svg className="absolute inset-0 h-full w-full" role="img" aria-label="Knowledge graph preview">
            {edges.map((edge) => {
              const source = nodeById.get(edge.sourceId)
              const target = nodeById.get(edge.targetId)
              if (!source || !target) return null
              return (
                <line
                  key={edge.id}
                  x1={`${50 + ((source.position?.x ?? 0) / 4)}%`}
                  y1={`${50 + ((source.position?.y ?? 0) / 4)}%`}
                  x2={`${50 + ((target.position?.x ?? 0) / 4)}%`}
                  y2={`${50 + ((target.position?.y ?? 0) / 4)}%`}
                  stroke="hsl(var(--primary))"
                  strokeOpacity={Math.max(0.18, edge.strength)}
                  strokeWidth={2}
                />
              )
            })}
            {nodes.map((node, index) => (
              <g key={node.id} className="cursor-pointer" onClick={() => setSelectedId(node.id)}>
                <circle
                  cx={`${50 + ((node.position?.x ?? index * 12) / 4)}%`}
                  cy={`${50 + ((node.position?.y ?? index * 8) / 4)}%`}
                  r={18 + node.mastery * 12}
                  fill={selectedNode?.id === node.id ? "hsl(var(--primary) / 0.18)" : "hsl(var(--card))"}
                  stroke={orphanIds.has(node.id) ? "hsl(var(--warning))" : "hsl(var(--primary))"}
                  strokeWidth={selectedNode?.id === node.id ? "4" : "2"}
                />
                <text
                  x={`${50 + ((node.position?.x ?? index * 12) / 4)}%`}
                  y={`${50 + ((node.position?.y ?? index * 8) / 4)}%`}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="fill-foreground text-[10px] font-semibold"
                >
                  {node.title.slice(0, 12)}
                </text>
              </g>
            ))}
          </svg>
        </div>
      </Panel>

      <Panel className="p-4">
        <h3 className="font-semibold text-foreground">Graph command</h3>
        <button onClick={applyGraphPlan} className="mt-3 w-full rounded-md border border-border bg-secondary p-3 text-left transition hover:bg-accent hover:text-accent-foreground">
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold text-foreground">{graphPlan.headline}</span>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{graphPlan.detail}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {graphPlan.chips.map((chip) => (
              <span key={chip} className="rounded-md bg-background px-2 py-1 text-xs font-semibold text-muted-foreground">
                {chip}
              </span>
            ))}
          </div>
        </button>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Metric label="Nodes" value={String(graphSummary.totalNodes)} />
          <Metric label="Edges" value={String(graphSummary.totalEdges)} />
          <Metric label="Avg" value={`${Math.round(graphSummary.averageMastery * 100)}%`} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {(["all", "weak", "orphan", "public"] as GraphFilter[]).map((filter) => (
            <button
              key={filter}
              onClick={() => setGraphFilter(filter)}
              className={`h-8 rounded-md px-3 text-xs font-semibold ${graphFilter === filter ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground"}`}
            >
              {graphFilterLabel(filter)}
            </button>
          ))}
        </div>
        {selectedNode ? (
          <div className="mt-3 rounded-md border border-border bg-background p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-foreground">{selectedNode.title}</p>
                <p className="mt-1 text-xs font-semibold text-muted-foreground">{selectedNode.type} | {selectedNode.visibility}</p>
              </div>
              {selectedNode.visibility === "private" ? <Lock className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-success" />}
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(Math.max(0, Math.min(1, selectedNode.mastery)) * 100)}%` }} />
            </div>
          </div>
        ) : null}
        <h3 className="mt-4 font-semibold text-foreground">Accessible graph table</h3>
        <div className="mt-3 max-h-[470px] space-y-2 overflow-auto">
          {filteredNodes.map((node) => (
            <button key={node.id} onClick={() => setSelectedId(node.id)} className={`w-full rounded-md border p-3 text-left ${selectedNode?.id === node.id ? "border-primary bg-primary/10" : "border-border hover:bg-muted"}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-foreground">{node.title}</p>
                {node.visibility === "private" ? <Lock className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-success" />}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{Math.round(node.mastery * 100)}% mastery</p>
            </button>
          ))}
          {!filteredNodes.length ? <EmptyState title="No nodes match" body="Change the graph filter or add a new Studio item." /> : null}
        </div>
      </Panel>
    </div>
  )
}

function filterGraphNodes(nodes: KnowledgeNode[], orphanIds: Set<string>, filter: GraphFilter) {
  if (filter === "weak") return nodes.filter((node) => node.mastery < 0.55)
  if (filter === "orphan") return nodes.filter((node) => orphanIds.has(node.id))
  if (filter === "public") return nodes.filter((node) => node.visibility !== "private")
  return nodes
}

function graphFilterLabel(filter: GraphFilter) {
  if (filter === "weak") return "Weak"
  if (filter === "orphan") return "Orphan"
  if (filter === "public") return "Shared"
  return "All"
}

export function ReviewsView({ setView }: { setView: (view: View) => void }) {
  const { data, status, refresh } = useResource<ReviewPayload>("/api/reviews")
  const [busyId, setBusyId] = useState("")
  const [busyRating, setBusyRating] = useState<ReviewRating | null>(null)
  const [reviewMessage, setReviewMessage] = useState("")
  const [revealedIds, setRevealedIds] = useState<string[]>([])
  const revealed = useMemo(() => new Set(revealedIds), [revealedIds])
  const reviewSummary = useMemo(
    () => summarizeReviewSession({ items: data?.items ?? [], remainingDueCount: data?.remainingDueCount ?? 0 }, revealedIds),
    [data?.items, data?.remainingDueCount, revealedIds],
  )
  const reviewSummaryChips = useMemo(() => buildReviewSummaryChips(reviewSummary), [reviewSummary])
  const primaryReviewChips = reviewSummaryChips.filter((chip) => chip.priority === "primary")
  const secondaryReviewChips = reviewSummaryChips.filter((chip) => chip.priority === "secondary")
  const reviewPlan = useMemo(
    () => buildReviewActionPlan({ items: data?.items ?? [], isRestDay: Boolean(data?.isRestDay), remainingDueCount: data?.remainingDueCount ?? 0 }, reviewSummary, revealedIds),
    [data?.isRestDay, data?.items, data?.remainingDueCount, revealedIds, reviewSummary],
  )

  async function record(item: ReviewItem, rating: ReviewRating) {
    if (!revealed.has(item.id)) {
      setReviewMessage("Reveal the answer before grading.")
      return
    }
    setBusyId(item.id)
    setBusyRating(rating)
    try {
      await api("/api/reviews", { method: "POST", body: JSON.stringify({ id: item.id, rating }) })
      setRevealedIds((current) => current.filter((id) => id !== item.id))
      setReviewMessage(`${item.title} graded ${rating}.`)
      await refresh()
    } catch (error) {
      setReviewMessage(error instanceof Error ? error.message : "Unable to record this review.")
    } finally {
      setBusyId("")
      setBusyRating(null)
    }
  }

  function toggleReveal(id: string) {
    setRevealedIds((current) => current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id])
  }

  function applyReviewPlan() {
    if (reviewPlan.nextAction === "studio" || reviewPlan.nextAction === "rest") {
      setView("studio")
      return
    }
    if (reviewPlan.nextAction === "practice") {
      setView("practice")
      return
    }
    if (reviewPlan.targetItemId) {
      if (reviewPlan.nextAction === "reveal") {
        setRevealedIds((current) => current.includes(reviewPlan.targetItemId!) ? current : [...current, reviewPlan.targetItemId!])
      }
      document.getElementById(`review-${reviewPlan.targetItemId}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
      <Panel className="p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-foreground">Reviews</h2>
          <details className="relative">
            <summary className="flex h-8 w-8 list-none items-center justify-center rounded-md border border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground" aria-label="About reviews">
              <SlidersHorizontal className="h-4 w-4" />
            </summary>
            <p className="absolute right-0 top-10 z-[80] w-72 rounded-md border border-border bg-popover p-3 text-sm leading-6 text-popover-foreground shadow-xl">
              Reveal only when ready, grade honestly, and let LEARN schedule the next review from your answer.
            </p>
          </details>
        </div>
        <button onClick={applyReviewPlan} className="mt-3 w-full rounded-md border border-border bg-secondary p-3 text-left transition hover:bg-accent hover:text-accent-foreground">
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold text-foreground">{reviewPlan.headline}</span>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {reviewPlan.chips.map((chip) => (
              <span key={chip} className="rounded-md bg-background px-2 py-1 text-xs font-semibold text-muted-foreground">
                {chip}
              </span>
            ))}
          </div>
        </button>
        <details className="mt-3 rounded-md border border-border bg-background p-2">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-foreground">
            <span>Why this move</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </summary>
          <p className="mt-2 border-t border-border pt-2 text-xs leading-5 text-muted-foreground">{reviewPlan.detail}</p>
        </details>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {primaryReviewChips.map((chip) => (
            <CompactMetric key={chip.id} label={chip.label} value={chip.value} />
          ))}
        </div>
        <details className="mt-3 rounded-md border border-border bg-background p-2">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-foreground">
            <span>Queue details</span>
            <span className="rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">{status}</span>
          </summary>
          <div className="mt-2 grid grid-cols-2 gap-2 border-t border-border pt-2">
            {secondaryReviewChips.map((chip) => (
              <Metric key={chip.id} label={chip.label} value={chip.value} />
            ))}
            <Metric label="Notes" value={String(reviewSummary.sourceCounts.note)} />
            <Metric label="Blocks" value={String(reviewSummary.sourceCounts.block)} />
            <Metric label="Cards" value={String(reviewSummary.sourceCounts.flashcard)} />
            <Metric label="Lessons" value={String(reviewSummary.sourceCounts.lesson)} />
          </div>
        </details>
        {reviewMessage ? <p className="mt-3 rounded-md bg-muted p-3 text-sm text-muted-foreground">{reviewMessage}</p> : null}
        {reviewSummary.topTopics.length ? (
          <details className="mt-3 rounded-md border border-border bg-background p-2">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-foreground">
              <span>Topics</span>
              <span className="rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">{reviewSummary.topTopics.length}</span>
            </summary>
          <div className="mt-2 flex flex-wrap gap-2">
            {reviewSummary.topTopics.map((topic) => (
              <span key={topic.topic} className="rounded-md bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">
                {topic.topic} {topic.count}
              </span>
            ))}
          </div>
          </details>
        ) : null}
      </Panel>
      <div className="grid gap-3">
        {(data?.items ?? []).map((item) => {
          const isRevealed = revealed.has(item.id)
          const ratingActions = buildReviewRatingActions({ busyRating, isBusy: busyId === item.id, isRevealed })
          return (
          <div key={item.id} id={`review-${item.id}`}>
          <Panel className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-foreground">{item.title}</p>
                  <span className="rounded-md border border-border bg-secondary px-2 py-1 text-xs font-semibold text-secondary-foreground">
                    {reviewSourceLabel(item)}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => { toggleReveal(item.id); setReviewMessage(isRevealed ? "Answer hidden." : "Answer revealed. Grade when ready.") }}
                  disabled={Boolean(busyId)}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-semibold text-foreground hover:bg-accent hover:text-accent-foreground"
                >
                  <Eye className="h-4 w-4" />
                  {isRevealed ? "Hide answer" : "Reveal"}
                </button>
                {isRevealed ? ratingActions.map((action) => (
                    <button
                      key={action.rating}
                      disabled={action.disabled}
                      onClick={() => record(item, action.rating)}
                      title={action.helper}
                      className={`h-9 rounded-md border px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60 ${reviewRatingClassName(action.rating)}`}
                    >
                      {action.busy ? "Saving" : action.label}
                    </button>
                  )) : (
                    <span className="inline-flex h-9 items-center rounded-md border border-border bg-muted px-3 text-sm font-semibold text-muted-foreground">
                      Reveal first
                    </span>
                  )}
              </div>
            </div>
            <div className="mt-4 rounded-md border border-border bg-background p-3">
              <p className="text-sm font-semibold text-foreground">{reviewPromptText(item)}</p>
              {isRevealed ? <p className="mt-3 text-sm leading-6 text-muted-foreground">{reviewAnswerText(item)}</p> : null}
            </div>
            <details className="mt-3 rounded-md border border-border bg-background p-2">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                <span>Memory signal</span>
                <span>{Math.round(item.retrievability * 100)}%</span>
              </summary>
              <div className="mt-2 flex flex-wrap gap-2 border-t border-border pt-2 text-xs font-semibold text-muted-foreground">
                <span className="rounded-md bg-muted px-2 py-1">Retrievability {Math.round(item.retrievability * 100)}%</span>
                <span className="rounded-md bg-muted px-2 py-1">Difficulty {Math.round(item.difficulty * 100)}%</span>
                <span className="rounded-md bg-muted px-2 py-1">Stability {Math.round(item.stability * 10) / 10}</span>
              </div>
            </details>
          </Panel>
          </div>
          )
        })}
        {data && data.items.length === 0 ? <EmptyState title="No reviews due" body="Rest or save a feed lesson into Studio for the next session." /> : null}
      </div>
    </div>
  )
}

function reviewRatingClassName(rating: "again" | "hard" | "good" | "easy") {
  if (rating === "again") return "border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
  if (rating === "hard") return "border-warning text-warning hover:bg-warning hover:text-warning-foreground"
  if (rating === "easy") return "border-success text-success hover:bg-success hover:text-success-foreground"
  return "border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground"
}

export function FeedView({ setView }: { setView: (view: View) => void }) {
  const { data, refresh } = useResource<{ items: MicroLesson[] }>("/api/feed?topic=study&topic=notes")
  const [answered, setAnswered] = useState<Record<string, string>>({})
  const lessons = useMemo(() => data?.items ?? [], [data?.items])
  const feedLessonsForSummary = useMemo(() => lessons.map(toFeedLessonForSummary), [lessons])
  const feedSummary = useMemo(() => summarizeFeedWorkspace(feedLessonsForSummary, answered), [answered, feedLessonsForSummary])
  const feedPlan = useMemo(() => buildFeedActionPlan(feedLessonsForSummary, feedSummary, answered), [answered, feedLessonsForSummary, feedSummary])

  async function answer(lesson: MicroLesson, choiceId: string) {
    setAnswered((current) => ({ ...current, [lesson.id]: choiceId }))
    await api("/api/feed/interactions", {
      method: "POST",
      body: JSON.stringify({
        lessonId: lesson.id,
        action: "answered",
        correct: choiceId === lesson.correct_choice_id,
      }),
    })
    refresh()
  }

  function applyFeedPlan() {
    if (feedPlan.nextAction === "refresh") {
      refresh()
      return
    }
    if (feedPlan.nextAction === "save") {
      setView("studio")
      return
    }
    const target = feedPlan.targetLessonId ? document.getElementById(`lesson-${feedPlan.targetLessonId}`) : null
    target?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
      <div className="grid gap-4">
        {lessons.map((lesson) => {
          const isAnswered = Boolean(answered[lesson.id])
          return (
            <div key={lesson.id} id={`lesson-${lesson.id}`}>
              <Panel className="min-h-[420px] p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="inline-flex h-8 items-center gap-2 rounded-md bg-secondary px-3 text-xs font-semibold text-secondary-foreground">
                    {lesson.reason === "serendipity" ? <Sparkles className="h-4 w-4" /> : <Compass className="h-4 w-4" />}
                    {lesson.reason || "preferred"}
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-md px-2 py-1 text-xs font-semibold ${isAnswered ? "bg-success text-success-foreground" : "bg-secondary text-secondary-foreground"}`}>{isAnswered ? "answered" : "open"}</span>
                    <span className="text-sm text-muted-foreground">{lesson.duration_seconds || lesson.durationSeconds || 90}s</span>
                  </div>
                </div>
                <div className="mt-10 max-w-2xl">
                  <h2 className="text-3xl font-semibold leading-tight text-foreground">{lesson.title}</h2>
                  <p className="mt-3 text-lg text-muted-foreground">{lesson.summary}</p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {(lesson.topic_tags || lesson.topicTags || []).map((topic) => (
                      <span key={topic} className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="mt-10 grid gap-3">
                  <p className="text-sm font-semibold text-foreground">{lesson.question}</p>
                  {(lesson.choices ?? []).map((choice) => {
                    const selected = answered[lesson.id] === choice.id
                    const correct = choice.id === lesson.correct_choice_id
                    return (
                      <button
                        key={choice.id}
                        onClick={() => answer(lesson, choice.id)}
                        className={`rounded-md border p-3 text-left text-sm transition ${
                          selected
                            ? correct
                              ? "border-success bg-success/15 text-foreground"
                              : "border-destructive bg-destructive/10 text-foreground"
                            : "border-border bg-background text-foreground hover:bg-accent"
                        }`}
                      >
                        {choice.text}
                      </button>
                    )
                  })}
                  {answered[lesson.id] ? <p className="mt-3 text-sm text-muted-foreground">{lesson.explanation}</p> : null}
                </div>
              </Panel>
            </div>
          )
        })}
      </div>
      <Panel className="h-max p-4">
        <h3 className="font-semibold text-foreground">Discovery controls</h3>
        <button onClick={applyFeedPlan} className="mt-3 w-full rounded-md border border-border bg-secondary p-3 text-left transition hover:bg-accent hover:text-accent-foreground">
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold text-foreground">{feedPlan.headline}</span>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {feedPlan.chips.map((chip) => (
              <span key={chip} className="rounded-md bg-background px-2 py-1 text-xs font-semibold text-muted-foreground">
                {chip}
              </span>
            ))}
          </div>
        </button>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Metric label="Lessons" value={String(feedSummary.total)} />
          <Metric label="Open" value={String(feedSummary.unanswered)} />
          <Metric label="Outside" value={String(feedSummary.serendipity)} />
          <Metric label="Answered" value={String(feedSummary.answered)} />
        </div>
        {feedSummary.topTopics.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {feedSummary.topTopics.map((topic) => (
              <span key={topic.topic} className="rounded-md bg-secondary px-2 py-1 text-xs font-semibold text-secondary-foreground">
                {topic.topic} {topic.count}
              </span>
            ))}
          </div>
        ) : null}
        <div className="mt-3 grid gap-2">
          <RitualButton icon={Brain} label="Save ideas to Studio" onClick={() => setView("studio")} />
          <RitualButton icon={Users} label="Open groups" onClick={() => setView("spaces")} />
          <RitualButton icon={ShieldCheck} label="Refresh lesson mix" onClick={refresh} />
        </div>
      </Panel>
    </div>
  )
}

function toFeedLessonForSummary(lesson: MicroLesson) {
  return {
    id: lesson.id,
    title: lesson.title,
    topicTags: lesson.topic_tags ?? lesson.topicTags ?? [],
    readinessScore: 1,
    durationSeconds: lesson.duration_seconds ?? lesson.durationSeconds ?? 90,
    reason: lesson.reason ?? ("preferred" as const),
  }
}

export function SocialLearningView({ kind, setView }: { kind: "spaces" | "rooms" | "battles"; setView?: (view: View) => void }) {
  const endpoint = kind === "spaces" ? "/api/learning-spaces" : kind === "rooms" ? "/api/study-rooms" : "/api/study-battles"
  const { data, status, refresh } = useResource<{ items: Array<LearningSpace | StudyRoom | StudyBattle> }>(endpoint)
  const members = useResource<{ items: WorkspaceMemberLike[] }>("/api/workspace/members")
  const recentActions = useResource<{ items: SocialActionLike[] }>("/api/social/actions?limit=8")
  const [selectedId, setSelectedId] = useState("")
  const [draft, setDraft] = useState(() => createSocialDraft(kind))
  const [query, setQuery] = useState("")
  const [memberQuery, setMemberQuery] = useState("")
  const [recordFilter, setRecordFilter] = useState<SocialRecordFilter>("all")
  const [message, setMessage] = useState("")
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<"learner" | "admin">("learner")
  const [inviteLink, setInviteLink] = useState("")
  const [inviteLoading, setInviteLoading] = useState(false)
  const [openSocialMenu, setOpenSocialMenu] = useState<"filters" | "actions" | null>(null)
  const [detailTab, setDetailTab] = useState<SocialDetailTab>("actions")
  const [memberLimit, setMemberLimit] = useState(10)
  const [recordLimit, setRecordLimit] = useState(12)
  const [activityLimit, setActivityLimit] = useState(4)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [recordAction, setRecordAction] = useState<"save" | "toggle" | "delete" | null>(null)
  const draftHydrated = useRef(false)
  const restoredDraftId = useRef<string | null>(null)
  const items = useMemo(() => data?.items ?? [], [data?.items])
  const memberItems = useMemo(() => members.data?.items ?? [], [members.data?.items])
  const recentActionItems = useMemo(() => recentActions.data?.items ?? [], [recentActions.data?.items])
  const selected = useMemo(() => items.find((item) => item.id === selectedId), [items, selectedId])
  const Icon = kind === "spaces" ? Users : kind === "rooms" ? Radio : Swords
  const title = kind === "spaces" ? "Groups" : kind === "rooms" ? "Study Rooms" : "Study Battles"
  const noun = kind === "spaces" ? "group" : kind === "rooms" ? "room" : "battle"
  const socialSummary = useMemo(() => summarizeSocialWorkspace(kind, items), [items, kind])
  const memberSummary = useMemo(() => summarizeWorkspaceMembers(memberItems), [memberItems])
  const actionSummary = useMemo(() => summarizeSocialActions(recentActionItems), [recentActionItems])
  const socialPlan = useMemo(() => buildSocialWorkspacePlan(kind, socialSummary), [kind, socialSummary])
  const recommendedRecord = useMemo(() => findRecommendedSocialRecord(kind, items), [items, kind])
  const recordPage = useMemo(() => buildSocialRecordsPage(items, { query, filter: recordFilter, limit: recordLimit }), [items, query, recordFilter, recordLimit])
  const filteredItems = recordPage.items as Array<LearningSpace | StudyRoom | StudyBattle>
  const recordCards = useMemo(() => filteredItems.map((item) => ({
    card: buildSocialRecordCard(kind, item, recommendedRecord?.id),
    item,
  })), [filteredItems, kind, recommendedRecord?.id])
  const recordEmptyState = useMemo(() => buildSocialRecordEmptyState({
    emptyHint: socialPlan.emptyHint,
    filter: recordFilter,
    query,
    title,
    total: items.length,
    visible: recordPage.total,
  }), [items.length, query, recordFilter, recordPage.total, socialPlan.emptyHint, title])
  const recordFilterSummary = useMemo(() => buildSocialRecordFilterSummary({
    filter: recordFilter,
    query,
    total: items.length,
    visible: recordPage.total,
  }), [items.length, query, recordFilter, recordPage.total])
  const memberPage = useMemo(() => buildWorkspaceMembersPage(memberItems, memberQuery, memberLimit), [memberItems, memberLimit, memberQuery])
  const filteredMembers = memberPage.items
  const activityPage = useMemo(() => buildSocialActionsPage(recentActionItems, activityLimit), [activityLimit, recentActionItems])
  const filterOptions = useMemo(() => socialFilterOptions(kind), [kind])
  const workflowSteps = useMemo(() => socialWorkflowSteps(kind, Boolean(draft.id)), [draft.id, kind])
  const actionKit = useMemo(() => buildSocialActionKit(kind, {
    title: socialTitle(draft),
    saved: Boolean(draft.id),
    status: socialDraftStatus(kind, draft),
    visibility: draft.visibility,
    mode: draft.mode,
    topic: kind === "spaces" ? draft.topicTags.split(",")[0]?.trim() : draft.topic,
  }), [draft, kind])
  const readyActions = useMemo(
    () => actionKit.actions.map((action) => buildSocialActionReadiness(kind, action, Boolean(draft.id))),
    [actionKit.actions, draft.id, kind],
  )
  const activityTimeline = useMemo(() => buildSocialActivityTimeline({
    kind,
    title: socialTitle(draft),
    saved: Boolean(draft.id),
    inviteLinkReady: Boolean(inviteLink),
    memberSummary,
    suggestedAction: socialSummary.suggestedAction,
  }), [draft, inviteLink, kind, memberSummary, socialSummary.suggestedAction])
  const inviteReadiness = useMemo(() => buildSocialInviteReadiness({
    email: inviteEmail,
    kind,
    linkReady: Boolean(inviteLink),
    loading: inviteLoading,
    saved: Boolean(draft.id),
  }), [draft.id, inviteEmail, inviteLink, inviteLoading, kind])
  const detailTabs = useMemo<Array<{ id: SocialDetailTab; label: string; icon: ComponentType<{ className?: string }>; count: string }>>(() => [
    { id: "actions", label: "Actions", icon: Play, count: String(actionKit.actions.length) },
    { id: "invite", label: "Invite", icon: Mail, count: inviteLink ? "1" : "0" },
    { id: "people", label: "People", icon: Users, count: String(memberSummary.total) },
    { id: "activity", label: "Activity", icon: Repeat2, count: String(actionSummary.total || activityTimeline.length) },
    { id: "safety", label: "Safety", icon: ShieldCheck, count: status },
  ], [actionKit.actions.length, actionSummary.total, activityTimeline.length, inviteLink, memberSummary.total, status])
  const recordStatus = recordAction === "save"
    ? "Saving"
    : recordAction === "toggle"
      ? "Updating"
      : recordAction === "delete"
        ? "Deleting"
        : socialDraftStatus(kind, draft)
  const recordBusy = recordAction !== null

  useEffect(() => {
    const stored = readSocialDraftStore(kind)
    if (stored) {
      restoredDraftId.current = stored.selectedId || "new"
      setSelectedId(stored.selectedId)
      setDraft(stored.draft)
      setQuery(stored.query)
      setMessage("Local draft restored.")
    } else {
      restoredDraftId.current = null
      setSelectedId("")
      setDraft(createSocialDraft(kind))
      setQuery("")
    }
    draftHydrated.current = true
  }, [kind])

  useEffect(() => {
    if (!draftHydrated.current) return
    const timeout = window.setTimeout(() => {
      writeSocialDraftStore(kind, {
        selectedId,
        query,
        draft,
        updatedAt: new Date().toISOString(),
      })
    }, 500)
    return () => window.clearTimeout(timeout)
  }, [draft, kind, query, selectedId])

  useEffect(() => {
    setMemberLimit(10)
  }, [memberQuery])

  useEffect(() => {
    setRecordLimit(12)
  }, [kind, query, recordFilter])

  useEffect(() => {
    setDeleteConfirmId(null)
  }, [draft.id, kind])

  useEffect(() => {
    if (!draftHydrated.current || !data) return
    if (!items.length) {
      if (!hasMeaningfulSocialDraft(kind, draft)) {
        if (selectedId) setSelectedId("")
      }
      return
    }
    if (selectedId && items.some((item) => item.id === selectedId)) return
    if (hasMeaningfulSocialDraft(kind, draft)) return
    const first = items[0]
    setSelectedId(first.id)
    setDraft(draftFromSocialItem(kind, first))
  }, [data, draft, items, kind, selectedId])

  useEffect(() => {
    if (!selected) return
    if (restoredDraftId.current === selected.id) {
      restoredDraftId.current = null
      return
    }
    setDraft(draftFromSocialItem(kind, selected))
  }, [kind, selected?.id])

  function startNew() {
    setSelectedId("")
    setDraft(createSocialDraft(kind))
    setDeleteConfirmId(null)
    setMessage(`Drafting a new ${noun}.`)
  }

  function clearRecordFilters() {
    setQuery("")
    setRecordFilter("all")
    setMessage("Search and filters cleared.")
  }

  function selectSocialRecord(item: LearningSpace | StudyRoom | StudyBattle) {
    setSelectedId(item.id)
    setDraft(draftFromSocialItem(kind, item))
    setDeleteConfirmId(null)
    setDetailTab("actions")
    setMessage(buildSocialRecordSelectionMessage(kind, item))
  }

  function runPrimarySocialAction() {
    const shouldOpenRecommended = kind === "battles" ? socialSummary.secondaryCount > 0 : socialSummary.primaryCount > 0
    if (shouldOpenRecommended && recommendedRecord?.id) {
      selectSocialRecord(recommendedRecord as LearningSpace | StudyRoom | StudyBattle)
      return
    }
    startNew()
  }

  async function saveDraft() {
    if (recordBusy) return
    setRecordAction("save")
    setMessage(draft.id ? "Saving changes..." : `Creating ${noun}...`)
    try {
      const body = payloadFromSocialDraft(kind, draft)
      const response = await api<{ item: LearningSpace | StudyRoom | StudyBattle }>(endpoint, {
        method: draft.id ? "PUT" : "POST",
        body: JSON.stringify(body),
      })
      setSelectedId(response.item.id)
      setDeleteConfirmId(null)
      setMessage(`${socialTitle(response.item)} saved.`)
      await refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `Unable to save this ${noun}.`)
    } finally {
      setRecordAction(null)
    }
  }

  async function toggleDraft() {
    if (recordBusy) return
    const nextDraft = nextSocialToggle(kind, draft)
    setDraft(nextDraft)
    setDeleteConfirmId(null)
    if (!nextDraft.id) {
      setMessage("Draft state updated. Save when ready.")
      return
    }
    setRecordAction("toggle")
    setMessage("Updating state...")
    try {
      await api(endpoint, { method: "PUT", body: JSON.stringify(payloadFromSocialDraft(kind, nextDraft)) })
      setMessage(`${socialTitle(nextDraft)} toggled.`)
      await refresh()
    } catch (error) {
      setDraft(draft)
      setMessage(error instanceof Error ? error.message : `Unable to update this ${noun}.`)
    } finally {
      setRecordAction(null)
    }
  }

  async function deleteDraft() {
    if (recordBusy) return
    if (!draft.id) {
      startNew()
      return
    }
    if (deleteConfirmId !== draft.id) {
      setDeleteConfirmId(draft.id)
      setMessage(`Select Delete again to remove ${socialTitle(draft)}.`)
      return
    }
    setRecordAction("delete")
    setMessage(`Deleting ${socialTitle(draft)}...`)
    try {
      await api(`${endpoint}?id=${encodeURIComponent(draft.id)}`, { method: "DELETE" })
      setMessage(`${socialTitle(draft)} deleted.`)
      setDeleteConfirmId(null)
      setSelectedId("")
      setDraft(createSocialDraft(kind))
      await refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `Unable to delete this ${noun}.`)
    } finally {
      setRecordAction(null)
    }
  }

  async function copyInvite() {
    await navigator.clipboard?.writeText(actionKit.inviteText).catch(() => undefined)
    setMessage(draft.id ? "Invite text copied." : `Save this ${noun} first, then share the copied invite text.`)
  }

  async function createSecureInvite() {
    if (!inviteReadiness.enabled) {
      setMessage(inviteReadiness.message)
      return
    }
    const validation = normalizeSocialInviteDraft({ email: inviteEmail, role: inviteRole })
    if (!validation.ok) {
      setMessage(validation.error)
      return
    }
    setInviteLoading(true)
    try {
      const response = await api<{ item: { token: string } }>("/api/invites", {
        method: "POST",
        body: JSON.stringify(validation.value),
      })
      const link = `${window.location.origin}/invite/${response.item.token}`
      setInviteLink(link)
      await navigator.clipboard?.writeText(link).catch(() => undefined)
      setMessage("Secure invite link created and copied.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create secure invite.")
    } finally {
      setInviteLoading(false)
    }
  }

  function openSocialChat() {
    setView?.("chat")
    setMessage("Open Chat to coordinate invites, questions, and updates.")
  }

  async function runSocialAction(target: SocialActionTarget) {
    if (!draft.id) {
      setDetailTab("actions")
      setMessage(`Save this ${noun} before using record actions.`)
      return
    }
    if (target === "invite") {
      await copyInvite()
      return
    }
    if (target === "chat") {
      openSocialChat()
      return
    }
    if (target === "calendar") {
      setView?.("calendar")
      setMessage("Calendar opened for the next shared session.")
      return
    }
    if (target === "practice") {
      setView?.("practice")
      setMessage("Practice opened for drills, retries, and review cards.")
      return
    }
    setView?.("files")
    setMessage("Files opened for shared resources.")
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">{title}</h2>
            <span className="mt-2 inline-flex rounded-md bg-secondary px-2 py-1 text-xs font-semibold text-secondary-foreground">{socialPlan.headline}</span>
          </div>
          <button onClick={startNew} className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground">
            <Icon className="h-4 w-4" />
            New
          </button>
        </div>
        <label className="mt-4 flex h-10 items-center rounded-md border border-input bg-background px-3">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${title.toLowerCase()}`} className="w-full bg-transparent text-sm outline-none" />
        </label>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background p-2">
          <div className="flex min-w-0 flex-wrap gap-1">
            <SocialSummaryChip label="Showing" value={recordFilter} />
            <SocialSummaryChip label="Visible" value={`${filteredItems.length}/${recordPage.total}`} />
            {recordFilterSummary.active ? <span className="rounded-md bg-warning/15 px-2 py-1 text-xs font-semibold text-warning">{recordFilterSummary.label}</span> : null}
          </div>
          <div className="flex items-center gap-2">
            {recordFilterSummary.active ? (
              <button onClick={clearRecordFilters} className="h-9 rounded-md border border-border bg-secondary px-2 text-xs font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground" type="button">
                Clear
              </button>
            ) : null}
            <SocialMenu icon={SlidersHorizontal} label="Filters" menuId="filters" openMenu={openSocialMenu} setOpenMenu={setOpenSocialMenu}>
              <SocialMenuSection title="Show records">
                {filterOptions.map((option) => {
                  const count = filterSocialRecords(items, { query, filter: option }).length
                  return (
                    <SocialMenuAction
                      key={option}
                      active={recordFilter === option}
                      icon={SlidersHorizontal}
                      label={socialFilterLabel(option)}
                      meta={`${count} ${noun}${count === 1 ? "" : "s"}`}
                      onClick={() => {
                        setRecordFilter(option)
                        setOpenSocialMenu(null)
                      }}
                    />
                  )
                })}
              </SocialMenuSection>
            </SocialMenu>
          </div>
        </div>
        <details className="mt-3 rounded-md border border-border bg-background">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-foreground">
            <span>Signals</span>
            <span className="rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">{socialSummary.total} total</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </summary>
          <div className="grid gap-2 border-t border-border p-2 sm:grid-cols-3">
            <Metric label="Total" value={String(socialSummary.total)} />
            <Metric label={socialSummary.primaryLabel} value={String(socialSummary.primaryCount)} />
            <Metric label={socialSummary.secondaryLabel} value={String(socialSummary.secondaryCount)} />
          </div>
        </details>
        <div className="mt-4 grid gap-2">
          {recordCards.map(({ card, item }) => (
            <button
              key={item.id}
              onClick={() => selectSocialRecord(item)}
              className={`rounded-md border p-3 text-left ${selectedId === item.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground"}`}
            >
              <span className="flex min-w-0 items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold">{card.title}</span>
                <span className={`rounded px-1.5 py-0.5 text-[0.65rem] font-semibold ${selectedId === item.id ? "bg-primary-foreground/20 text-primary-foreground" : "bg-primary/15 text-primary"}`}>{card.action}</span>
              </span>
              <span className="mt-2 flex flex-wrap gap-1">
                <span className={`rounded px-1.5 py-0.5 text-[0.65rem] font-semibold ${selectedId === item.id ? "bg-primary-foreground/15 text-primary-foreground/85" : "bg-background text-foreground"}`}>{card.status}</span>
                {card.recommended ? <span className={`rounded px-1.5 py-0.5 text-[0.65rem] font-semibold ${selectedId === item.id ? "bg-primary-foreground/20 text-primary-foreground" : "bg-primary/15 text-primary"}`}>Recommended</span> : null}
                {card.meta.map((meta) => (
                  <span key={meta} className={`rounded px-1.5 py-0.5 text-[0.65rem] font-semibold ${selectedId === item.id ? "bg-primary-foreground/15 text-primary-foreground/85" : "bg-muted text-muted-foreground"}`}>{meta}</span>
                ))}
              </span>
            </button>
          ))}
          {!filteredItems.length ? (
            <div className="grid gap-2 rounded-md border border-dashed border-border bg-background p-3">
              <EmptyState title={recordEmptyState.title} body={recordEmptyState.body} />
              <button
                onClick={recordEmptyState.action === "clear" ? clearRecordFilters : startNew}
                className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-secondary px-3 text-sm font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground"
                type="button"
              >
                {recordEmptyState.action === "clear" ? "Clear filters" : `New ${noun}`}
              </button>
            </div>
          ) : null}
          {recordPage.hiddenCount ? (
            <button onClick={() => setRecordLimit((limit) => limit + 12)} className="rounded-md border border-border bg-secondary px-3 py-2 text-sm font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground" type="button">
              Show {Math.min(12, recordPage.hiddenCount)} more
            </button>
          ) : null}
        </div>
        {message ? <p className="mt-3 rounded-md bg-muted p-3 text-sm text-muted-foreground">{message}</p> : null}
      </section>

      <Panel className="p-4">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">{draft.id ? "Editing" : "New draft"}</p>
            <h3 className="mt-1 text-xl font-semibold text-foreground">{draft.name || draft.title || `Untitled ${noun}`}</h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">{recordStatus}</span>
            <SocialActionButton label={recordAction === "save" ? "Saving" : "Save"} icon={Save} onClick={saveDraft} primary disabled={recordBusy} />
            <SocialMenu align="right" compact icon={MoreHorizontal} label="More actions" menuId="actions" openMenu={openSocialMenu} setOpenMenu={setOpenSocialMenu}>
              <SocialMenuSection title="Record actions">
                <SocialMenuAction disabled={recordBusy} icon={Play} label={recordAction === "toggle" ? "Updating" : "Toggle state"} meta="Cycle visibility or activity status." onClick={() => { setOpenSocialMenu(null); void toggleDraft() }} />
                <SocialMenuAction disabled={recordBusy} icon={Edit3} label="Reset draft" meta="Restore selected record values or clear the new draft." onClick={() => { setOpenSocialMenu(null); setDeleteConfirmId(null); setDraft(selected ? draftFromSocialItem(kind, selected) : createSocialDraft(kind)); setMessage("Draft reset.") }} />
                <SocialMenuAction disabled={recordBusy} danger icon={Trash2} label={recordAction === "delete" ? "Deleting" : draft.id && deleteConfirmId === draft.id ? "Confirm delete" : "Delete"} meta={draft.id && deleteConfirmId === draft.id ? `Delete ${socialTitle(draft)} now.` : `Ask before removing the selected ${noun}.`} onClick={() => { setOpenSocialMenu(null); void deleteDraft() }} />
              </SocialMenuSection>
            </SocialMenu>
          </div>
        </div>
        <div className="grid gap-3">
          {kind === "battles" ? (
            <>
              <SocialField label="Title" value={draft.title} onChange={(value) => setDraft({ ...draft, title: value })} />
              <SocialField label="Topic" value={draft.topic} onChange={(value) => setDraft({ ...draft, topic: value })} />
              <SocialSelect label="Mode" value={draft.mode} options={["solo", "team"]} onChange={(value) => setDraft({ ...draft, mode: value })} />
              <SocialSelect label="Status" value={draft.status} options={["waiting", "active", "completed"]} onChange={(value) => setDraft({ ...draft, status: value })} />
            </>
          ) : kind === "rooms" ? (
            <>
              <SocialField label="Room name" value={draft.name} onChange={(value) => setDraft({ ...draft, name: value })} />
              <SocialSelect label="Mode" value={draft.mode} options={["focus", "discussion", "stage"]} onChange={(value) => setDraft({ ...draft, mode: value })} />
              <div className="grid gap-3 sm:grid-cols-2">
                <SocialField label="Pomodoro minutes" value={String(draft.pomodoroMinutes)} onChange={(value) => setDraft({ ...draft, pomodoroMinutes: Number(value) || 25 })} />
                <SocialField label="Break minutes" value={String(draft.breakMinutes)} onChange={(value) => setDraft({ ...draft, breakMinutes: Number(value) || 5 })} />
              </div>
              <SocialSelect label="Status" value={draft.status} options={["open", "active", "closed"]} onChange={(value) => setDraft({ ...draft, status: value })} />
            </>
          ) : (
            <>
              <SocialField label="Group name" value={draft.name} onChange={(value) => setDraft({ ...draft, name: value })} />
              <SocialField label="Description" value={draft.description} onChange={(value) => setDraft({ ...draft, description: value })} multiline />
              <SocialField label="Topic tags" value={draft.topicTags} onChange={(value) => setDraft({ ...draft, topicTags: value })} />
              <SocialSelect label="Visibility" value={draft.visibility} options={["private", "connections", "public"]} onChange={(value) => setDraft({ ...draft, visibility: value })} />
            </>
          )}
        </div>
        <div className="mt-4 grid gap-3">
          <div className="flex gap-1 overflow-x-auto rounded-md border border-border bg-background p-1">
            {detailTabs.map((tab) => {
              const TabIcon = tab.icon
              const active = detailTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setDetailTab(tab.id)}
                  className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-md px-3 text-xs font-semibold transition ${active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"}`}
                  type="button"
                >
                  <TabIcon className="h-4 w-4" />
                  <span>{tab.label}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[0.65rem] ${active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>{tab.count}</span>
                </button>
              )
            })}
          </div>

          <div className="rounded-md border border-border bg-background p-3">
            {detailTab === "actions" ? (
              <div className="grid gap-3">
                <button onClick={runPrimarySocialAction} className="flex w-full items-center justify-between rounded-md border border-primary/30 bg-primary/10 p-3 text-left text-sm font-semibold text-foreground hover:bg-accent hover:text-accent-foreground" type="button">
                  <span>{socialPlan.primaryAction}</span>
                  <Icon className="h-4 w-4" />
                </button>
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{actionKit.headline}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {actionKit.chips.map((chip) => (
                        <span key={chip} className="rounded-md bg-secondary px-2 py-0.5 text-[0.68rem] font-semibold text-secondary-foreground">{chip}</span>
                      ))}
                    </div>
                  </div>
                  <button onClick={() => void runSocialAction("invite")} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-secondary px-2 text-xs font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground" type="button">
                    <Copy className="h-3.5 w-3.5" />
                    Invite
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-4">
                  {readyActions.map((action) => {
                    const ActionIcon = socialActionIcon(action.id)
                    return (
                      <button
                        key={action.id}
                        disabled={!action.enabled}
                        onClick={() => void runSocialAction(action.id)}
                        className="group min-h-14 rounded-md border border-border bg-card p-2 text-left transition hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:bg-card disabled:hover:text-foreground"
                        title={action.detail}
                        type="button"
                      >
                        <ActionIcon className="h-4 w-4 text-primary group-hover:text-accent-foreground group-disabled:group-hover:text-primary" />
                        <span className="mt-1 block truncate text-xs font-semibold text-foreground group-hover:text-accent-foreground group-disabled:group-hover:text-foreground">{action.label}</span>
                      </button>
                    )
                  })}
                </div>
                <div className="grid gap-1.5 sm:grid-cols-4">
                  {workflowSteps.map((step, index) => (
                    <div key={step} className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-2 text-xs">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/15 text-[0.65rem] font-bold text-primary">{index + 1}</span>
                      <span className="truncate font-semibold text-foreground">{step}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {detailTab === "invite" ? (
              <div className="grid gap-3">
                <div className="grid gap-2 lg:grid-cols-[1fr_1.2fr]">
                  <p className="rounded-md border border-border bg-card p-3 text-sm leading-6 text-muted-foreground">{actionKit.brief}</p>
                  <div className="rounded-md border border-border bg-card p-3 text-sm text-foreground">{actionKit.inviteText}</div>
                </div>
                <div className="grid gap-2 rounded-md border border-border bg-card p-2">
                  <div className="grid gap-2 sm:grid-cols-[1fr_120px]">
                    <label className="flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <input value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="email@example.com" className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none" />
                    </label>
                    <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as "learner" | "admin")} className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none">
                      <option value="learner">Learner</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={copyInvite} className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-secondary px-3 text-sm font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground" type="button">
                      <Copy className="h-4 w-4" />
                      Copy text
                    </button>
                    <button disabled={!inviteReadiness.enabled} onClick={createSecureInvite} className="inline-flex h-9 items-center gap-2 rounded-md border border-primary bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60" title={inviteReadiness.message} type="button">
                      <Mail className="h-4 w-4" />
                      {inviteReadiness.label}
                    </button>
                    <span className="inline-flex h-9 items-center rounded-md bg-muted px-2 text-xs font-semibold text-muted-foreground">{inviteReadiness.message}</span>
                  </div>
                  {inviteLink ? <p className="truncate rounded-md bg-muted px-2 py-1.5 text-xs font-medium text-muted-foreground">{inviteLink}</p> : null}
                </div>
              </div>
            ) : null}

            {detailTab === "people" ? (
              <div className="grid gap-3">
                <div className="grid gap-2 sm:grid-cols-4">
                  <Metric label="Admins" value={String(memberSummary.admins)} />
                  <Metric label="Learners" value={String(memberSummary.learners)} />
                  <Metric label="Pending" value={String(memberSummary.pending)} />
                  <Metric label="Status" value={members.status} />
                </div>
                <label className="flex h-9 items-center rounded-md border border-input bg-card px-3">
                  <input value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} placeholder="Search people" className="w-full bg-transparent text-sm text-foreground outline-none" />
                </label>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="rounded-md bg-secondary px-2 py-1 text-xs font-semibold text-secondary-foreground">{memberPage.total} visible</span>
                  {memberPage.hiddenCount ? (
                    <button onClick={() => setMemberLimit((limit) => limit + 10)} className="rounded-md border border-border bg-secondary px-2.5 py-1.5 text-xs font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground" type="button">
                      Show {Math.min(10, memberPage.hiddenCount)} more
                    </button>
                  ) : null}
                </div>
                <div className="grid max-h-64 gap-1.5 overflow-auto pr-1">
                  {filteredMembers.map((member) => (
                    <div key={member.id || member.email || member.name} className="flex items-center justify-between gap-3 rounded-md border border-border bg-card p-2 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-foreground">{member.name || member.email || "Learner"}</p>
                        <p className="truncate text-xs text-muted-foreground">{member.email || "No email"}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <span className="rounded-md bg-secondary px-2 py-1 text-[0.68rem] font-semibold capitalize text-secondary-foreground">{member.role || "learner"}</span>
                        <span className="rounded-md bg-muted px-2 py-1 text-[0.68rem] font-semibold capitalize text-muted-foreground">{member.status || "active"}</span>
                      </div>
                    </div>
                  ))}
                  {!filteredMembers.length ? (
                    <p className="rounded-md border border-dashed border-border bg-card p-3 text-sm text-muted-foreground">
                      {memberPage.emptyAction === "clear-search" ? "No matching people. Clear search or invite someone new." : "No people yet. Create an invite to start."}
                    </p>
                  ) : null}
                </div>
                {memberSummary.newest ? <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">Newest: {memberSummary.newest.name || memberSummary.newest.email || "Learner"}</p> : null}
              </div>
            ) : null}

            {detailTab === "activity" ? (
              <div className="grid gap-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded-md bg-secondary px-2 py-1 text-[0.68rem] font-semibold text-secondary-foreground">{activityPage.items.length}/{activityPage.total} shown</span>
                  <span className="rounded-md bg-secondary px-2 py-1 text-[0.68rem] font-semibold text-secondary-foreground">{actionSummary.comments} comments</span>
                  <span className="rounded-md bg-secondary px-2 py-1 text-[0.68rem] font-semibold text-secondary-foreground">{actionSummary.saves} saved</span>
                  <span className="rounded-md bg-muted px-2 py-1 text-[0.68rem] font-semibold text-muted-foreground">{recentActions.status}</span>
                </div>
                {activityPage.items.length ? (
                  <div className="grid gap-1.5 md:grid-cols-2">
                    {activityPage.items.map((action) => {
                      const formatted = formatSocialAction(action)
                      return (
                        <div key={action.id || `${formatted.label}-${formatted.detail}`} className="rounded-md border border-border bg-card px-3 py-2 text-sm">
                          <p className="font-semibold text-foreground">{formatted.label}</p>
                          <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted-foreground">{formatted.detail}</p>
                        </div>
                      )
                    })}
                  </div>
                ) : null}
                {activityPage.hiddenCount ? (
                  <button onClick={() => setActivityLimit((limit) => limit + 4)} className="rounded-md border border-border bg-secondary px-3 py-2 text-sm font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground" type="button">
                    Show {Math.min(4, activityPage.hiddenCount)} more
                  </button>
                ) : null}
                <div className="grid gap-1.5">
                  {activityTimeline.map((item, index) => (
                    <div key={item.id} className="grid grid-cols-[auto_1fr] gap-3 rounded-md border border-border bg-card p-3 text-sm">
                      <span className={`flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold ${socialActivityToneClass(item.tone)}`}>{index + 1}</span>
                      <span className="min-w-0">
                        <span className="block font-semibold text-foreground">{item.label}</span>
                        <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{item.detail}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {detailTab === "safety" ? (
              <div className="grid gap-3">
                <div className="flex items-start gap-2 rounded-md border border-border bg-card p-3 text-sm text-muted-foreground">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>{socialPlan.safetyCue}</span>
                </div>
                <div className="rounded-md border border-border bg-card p-3 text-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Next</p>
                  <p className="mt-1 font-medium text-foreground">{socialSummary.suggestedAction}</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {socialSummary.modeCounts.slice(0, 3).map((mode) => (
                    <div key={mode.label} className="flex items-center justify-between rounded-md border border-border bg-card p-2 text-sm">
                      <span className="min-w-0 truncate font-medium text-foreground capitalize">{mode.label}</span>
                      <span className="rounded-md bg-secondary px-2 py-1 text-xs font-semibold text-secondary-foreground">{mode.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </Panel>
    </div>
  )
}

type SocialDraft = {
  id: string
  name: string
  title: string
  description: string
  visibility: string
  topicTags: string
  mode: string
  status: string
  topic: string
  pomodoroMinutes: number
  breakMinutes: number
}

type SocialDraftStore = {
  selectedId: string
  query: string
  draft: SocialDraft
  updatedAt: string
}

type SocialKind = "spaces" | "rooms" | "battles"
type SocialDetailTab = "actions" | "invite" | "people" | "activity" | "safety"

function createSocialDraft(kind: "spaces" | "rooms" | "battles"): SocialDraft {
  if (kind === "battles") {
    return { id: "", name: "", title: "Quick study battle", description: "", visibility: "private", topicTags: "review", mode: "solo", status: "waiting", topic: "Review", pomodoroMinutes: 25, breakMinutes: 5 }
  }
  if (kind === "rooms") {
    return { id: "", name: "Focus room", title: "", description: "", visibility: "private", topicTags: "study", mode: "focus", status: "open", topic: "Review", pomodoroMinutes: 25, breakMinutes: 5 }
  }
  return { id: "", name: "Personal learning circle", title: "", description: "A focused group for shared study routes.", visibility: "private", topicTags: "study", mode: "focus", status: "open", topic: "Review", pomodoroMinutes: 25, breakMinutes: 5 }
}

function readSocialDraftStore(kind: SocialKind): SocialDraftStore | null {
  if (typeof window === "undefined") return null
  try {
    const stored = window.localStorage.getItem(socialDraftStorageKey(kind))
    return stored ? JSON.parse(stored) as SocialDraftStore : null
  } catch {
    return null
  }
}

function writeSocialDraftStore(kind: SocialKind, store: SocialDraftStore) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(socialDraftStorageKey(kind), JSON.stringify(store))
}

function socialDraftStorageKey(kind: SocialKind) {
  return `${SOCIAL_DRAFT_KEY_PREFIX}_${kind}`
}

function hasMeaningfulSocialDraft(kind: SocialKind, draft: SocialDraft) {
  return socialDraftFingerprint(draft) !== socialDraftFingerprint(createSocialDraft(kind))
}

function socialDraftFingerprint(draft: SocialDraft) {
  const { id: _id, ...rest } = draft
  return JSON.stringify(rest)
}

function draftFromSocialItem(kind: "spaces" | "rooms" | "battles", item: LearningSpace | StudyRoom | StudyBattle): SocialDraft {
  const base = createSocialDraft(kind)
  if ("title" in item) {
    return { ...base, id: item.id, title: item.title, topic: item.topic, mode: item.mode, status: item.status }
  }
  if ("pomodoro_minutes" in item) {
    return { ...base, id: item.id, name: item.name, mode: item.mode, status: item.status, pomodoroMinutes: item.pomodoro_minutes, breakMinutes: item.break_minutes }
  }
  return { ...base, id: item.id, name: item.name, description: item.description, visibility: item.visibility, topicTags: (item.topic_tags ?? []).join(", ") }
}

function payloadFromSocialDraft(kind: "spaces" | "rooms" | "battles", draft: SocialDraft) {
  if (kind === "battles") {
    return { id: draft.id || undefined, title: draft.title, topic: draft.topic, mode: draft.mode, status: draft.status }
  }
  if (kind === "rooms") {
    return { id: draft.id || undefined, name: draft.name, mode: draft.mode, status: draft.status, pomodoroMinutes: draft.pomodoroMinutes, breakMinutes: draft.breakMinutes }
  }
  return { id: draft.id || undefined, name: draft.name, description: draft.description, visibility: draft.visibility, topicTags: draft.topicTags.split(",").map((tag) => tag.trim()).filter(Boolean) }
}

function nextSocialToggle(kind: "spaces" | "rooms" | "battles", draft: SocialDraft) {
  if (kind === "spaces") {
    const order = ["private", "connections", "public"]
    return { ...draft, visibility: order[(order.indexOf(draft.visibility) + 1) % order.length] }
  }
  if (kind === "rooms") {
    const order = ["open", "active", "closed"]
    return { ...draft, status: order[(order.indexOf(draft.status) + 1) % order.length] }
  }
  const order = ["waiting", "active", "completed"]
  return { ...draft, status: order[(order.indexOf(draft.status) + 1) % order.length] }
}

function socialFilterOptions(kind: SocialKind): SocialRecordFilter[] {
  if (kind === "spaces") return ["all", "private", "public"]
  if (kind === "rooms") return ["all", "active", "focus"]
  return ["all", "active", "team"]
}

function socialFilterLabel(filter: SocialRecordFilter) {
  if (filter === "all") return "All records"
  if (filter === "active") return "Active now"
  if (filter === "private") return "Private"
  if (filter === "public") return "Public"
  if (filter === "team") return "Team mode"
  return "Focus mode"
}

function socialDraftStatus(kind: SocialKind, draft: SocialDraft) {
  if (kind === "spaces") return draft.visibility
  return draft.status
}

function socialTitle(item: LearningSpace | StudyRoom | StudyBattle | SocialDraft) {
  if ("title" in item && item.title) return item.title
  if ("name" in item && item.name) return item.name
  return "Untitled"
}

function socialWorkflowSteps(kind: SocialKind, saved: boolean) {
  if (kind === "rooms") return [saved ? "Open room" : "Save room", "Invite", "Focus timer", "Recap"]
  if (kind === "battles") return [saved ? "Queue battle" : "Save battle", "Invite", "Play", "Review misses"]
  return [saved ? "Open group" : "Save group", "Invite", "Chat", "Share resources"]
}

function socialActionIcon(target: SocialActionTarget) {
  if (target === "invite") return Users
  if (target === "chat") return MessageSquare
  if (target === "calendar") return CalendarDays
  if (target === "practice") return BookOpen
  return FolderOpen
}

function socialActivityToneClass(tone: "ready" | "draft" | "next") {
  if (tone === "ready") return "bg-success/15 text-success"
  if (tone === "draft") return "bg-warning/15 text-warning"
  return "bg-primary/15 text-primary"
}

function SocialField({ label, value, onChange, multiline }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean }) {
  return (
    <label className="block rounded-md bg-muted p-3">
      <span className="text-xs font-semibold uppercase text-muted-foreground">{label}</span>
      {multiline ? (
        <textarea value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 min-h-24 w-full resize-none rounded-md border border-input bg-background p-3 text-sm text-foreground outline-none" />
      ) : (
        <input value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none" />
      )}
    </label>
  )
}

function SocialSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="block rounded-md bg-muted p-3">
      <span className="text-xs font-semibold uppercase text-muted-foreground">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none">
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  )
}

function SocialActionButton({
  danger,
  disabled,
  icon: Icon,
  label,
  onClick,
  primary,
}: {
  danger?: boolean
  disabled?: boolean
  icon: ComponentType<{ className?: string }>
  label: string
  onClick: () => void
  primary?: boolean
}) {
  return (
    <button disabled={disabled} onClick={onClick} className={`inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${primary ? "border-primary bg-primary text-primary-foreground" : danger ? "border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground" : "border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground"}`} type="button">
      <Icon className="h-4 w-4" />
      {label}
    </button>
  )
}

function SocialSummaryChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">
      <span>{label}</span>
      <span className="capitalize text-foreground">{value}</span>
    </span>
  )
}

function SocialMenu({
  align = "left",
  children,
  compact,
  icon: Icon,
  label,
  menuId,
  openMenu,
  setOpenMenu,
}: {
  align?: "left" | "right"
  children: React.ReactNode
  compact?: boolean
  icon: ComponentType<{ className?: string }>
  label: string
  menuId: "filters" | "actions"
  openMenu: "filters" | "actions" | null
  setOpenMenu: (menuId: "filters" | "actions" | null) => void
}) {
  const open = openMenu === menuId
  return (
    <div className="relative inline-block">
      <button
        aria-expanded={open}
        className={`flex h-9 items-center gap-2 rounded-md border border-border bg-secondary px-3 text-xs font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground ${compact ? "px-2" : ""}`}
        onClick={() => setOpenMenu(open ? null : menuId)}
        title={label}
        type="button"
      >
        <Icon className="h-3.5 w-3.5" />
        <span className={compact ? "sr-only" : ""}>{label}</span>
        {!compact ? <ChevronDown className="h-3.5 w-3.5 opacity-70" /> : null}
      </button>
      {open ? (
        <div className={`absolute top-10 z-40 w-72 rounded-md border border-border bg-popover p-2 text-popover-foreground shadow-xl ${align === "right" ? "right-0" : "left-0"}`}>
          {children}
        </div>
      ) : null}
    </div>
  )
}

function SocialMenuSection({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <div className="grid gap-1">
      <p className="px-1 text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{title}</p>
      {children}
    </div>
  )
}

function SocialMenuAction({
  active,
  danger,
  disabled,
  icon: Icon,
  label,
  meta,
  onClick,
}: {
  active?: boolean
  danger?: boolean
  disabled?: boolean
  icon: ComponentType<{ className?: string }>
  label: string
  meta?: string
  onClick: () => void
}) {
  const tone = danger
    ? "text-destructive hover:bg-destructive hover:text-destructive-foreground"
    : active
      ? "bg-primary text-primary-foreground"
      : "text-popover-foreground hover:bg-accent hover:text-accent-foreground"
  return (
    <button disabled={disabled} onClick={onClick} className={`flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${tone}`} type="button">
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="min-w-0">
        <span className="block truncate">{label}</span>
        {meta ? <span className={`mt-0.5 block line-clamp-2 text-xs font-medium ${active ? "text-primary-foreground/80" : danger ? "text-current/80" : "text-muted-foreground"}`}>{meta}</span> : null}
      </span>
    </button>
  )
}

export function ProfileView({ setView, user }: { setView?: (view: View) => void; user: User | null }) {
  const username = user?.username || "admin"
  const { data, status } = useResource<{ item: PublicProfile }>(`/api/profile/public?username=${encodeURIComponent(username)}&viewer=owner`)
  const profile = data?.item
  const achievements = useResource<{ items: Achievement[] }>("/api/achievements")
  const achievementItems = achievements.data?.items ?? []
  const profilePlan = useMemo(() => buildProfileActionPlan({ profile, achievements: achievementItems }), [achievementItems, profile])
  const unlockedAchievements = achievementItems.filter((achievement) => achievement.unlocked)
  const lockedAchievements = achievementItems.filter((achievement) => !achievement.unlocked)

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <Panel className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-md bg-primary text-xl font-semibold text-primary-foreground">
            {(profile?.name || user?.name || "L").slice(0, 1)}
          </div>
          <span className="rounded-md bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">{profilePlan.privacyLabel}</span>
        </div>
        <h2 className="mt-4 text-2xl font-semibold text-foreground">{profile?.name || user?.name || "Learner"}</h2>
        <p className="text-sm text-muted-foreground">@{profile?.username || username}</p>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">{profile?.bio || "A private learning portrait that grows from Vault activity."}</p>
        <details className="mt-4 rounded-md border border-border bg-background">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-foreground">
            <span>Profile stats</span>
            <span className="rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">Level {profile?.metrics.level ?? 1}</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </summary>
          <div className="grid grid-cols-2 gap-2 border-t border-border p-2">
            <Metric label="Level" value={String(profile?.metrics.level ?? 1)} />
            <Metric label="Streak" value={String(profile?.metrics.streak ?? 0)} />
            <Metric label="XP" value={String(profile?.metrics.xp ?? 0)} />
            <Metric label="Reputation" value={String(profile?.metrics.reputation ?? 0)} />
          </div>
        </details>
        <button
          onClick={() => setView?.(profileTargetView(profilePlan.target))}
          className="mt-4 flex w-full items-center justify-between gap-3 rounded-md border border-border bg-secondary p-3 text-left text-sm font-semibold text-secondary-foreground transition hover:bg-accent hover:text-accent-foreground"
        >
          <span>{profilePlan.nextAction}</span>
          <Sparkles className="h-4 w-4" />
        </button>
      </Panel>
      <div className="grid gap-4">
        <Panel className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-foreground">{profilePlan.headline}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{profilePlan.masteryLabel}</p>
            </div>
            <span className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">{status}</span>
          </div>
          <details className="mt-4 rounded-md border border-border bg-background">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-foreground">
              <span>Portrait signals</span>
              <span className="rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">{profilePlan.stats.length}</span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </summary>
            <div className="grid gap-2 border-t border-border p-2 sm:grid-cols-2 xl:grid-cols-4">
              {profilePlan.stats.map((stat) => (
                <div key={stat.id} className="rounded-md border border-border bg-card p-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">{stat.label}</p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="text-lg font-semibold text-foreground">{stat.value}</p>
                    <span className={`h-2 w-2 rounded-full ${profileToneDotClass(stat.tone)}`} />
                  </div>
                </div>
              ))}
            </div>
          </details>
        </Panel>
        <Panel className="p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold text-foreground">Public artifacts</h3>
            <button onClick={() => setView?.("settings")} className="rounded-md bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground">
              Manage sharing
            </button>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {(profile?.artifacts ?? []).map((node) => <NodeCard key={node.id} node={node} />)}
          </div>
          {profile && profile.artifacts.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No public artifacts yet. Sharing remains opt-in.</p> : null}
        </Panel>
        <Panel className="p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold text-foreground">Achievements</h3>
            <span className="rounded-md bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">{unlockedAchievements.length}/{achievementItems.length}</span>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            {[...unlockedAchievements, ...lockedAchievements].map((achievement) => <AchievementTile key={achievement.id} achievement={achievement} />)}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{achievements.status}</p>
        </Panel>
      </div>
    </div>
  )
}

function AchievementTile({ achievement }: { achievement: Achievement }) {
  return (
    <div className={`rounded-md border p-3 ${achievement.unlocked ? "border-success/40 bg-success/10" : "border-border bg-background"}`}>
      <CheckCircle2 className={`h-4 w-4 ${achievement.unlocked ? "text-success" : "text-muted-foreground"}`} />
      <p className="mt-2 font-medium text-foreground">{achievement.name}</p>
      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{achievement.description}</p>
      <span className="mt-2 inline-flex rounded-md bg-secondary px-2 py-1 text-xs font-semibold text-secondary-foreground">{achievement.xp_reward} XP</span>
    </div>
  )
}

function profileTargetView(target: ProfilePlanTarget): View {
  if (target === "settings") return "settings"
  if (target === "studio") return "studio"
  if (target === "reviews") return "reviews"
  return "social"
}

function profileToneDotClass(tone: "good" | "watch" | "neutral") {
  if (tone === "good") return "bg-success"
  if (tone === "watch") return "bg-warning"
  return "bg-muted-foreground"
}

function useResource<T>(path: string) {
  const [data, setData] = useState<T | null>(null)
  const [status, setStatus] = useState("Loading")
  const refresh = useMemo(() => async () => {
    try {
      setStatus("Loading")
      setData(await api<T>(path))
      setStatus("Ready")
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to load")
    }
  }, [path])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { data, status, refresh }
}

function NodeCard({ node }: { node: KnowledgeNode }) {
  return (
    <article className="rounded-md border border-border bg-background p-3">
      <Network className="h-4 w-4 text-success" />
      <h4 className="mt-2 font-medium text-foreground">{node.title}</h4>
      <p className="mt-1 text-sm text-muted-foreground">{Math.round(node.mastery * 100)}% mastery | {node.visibility}</p>
    </article>
  )
}

function RitualButton({ icon: Icon, label, onClick }: { icon: ComponentType<{ className?: string }>; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex h-11 items-center gap-3 rounded-md border border-border bg-secondary px-3 text-left text-sm font-medium text-secondary-foreground hover:bg-accent hover:text-accent-foreground">
      <Icon className="h-4 w-4 text-success" />
      <span>{label}</span>
    </button>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold text-foreground">{value}</p>
    </div>
  )
}

function CompactMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <p className="text-[0.65rem] font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="text-base font-semibold text-foreground">{value}</p>
    </div>
  )
}
