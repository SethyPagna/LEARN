"use client"

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react"
import {
  ArrowRight,
  Brain,
  CheckCircle2,
  Compass,
  Edit3,
  Eye,
  GitFork,
  Lock,
  MessageSquare,
  Network,
  Play,
  Radio,
  Repeat2,
  Save,
  ShieldCheck,
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
import { buildFeedActionPlan, buildKnowledgeGraphActionPlan, buildReviewActionPlan, reviewAnswerText, reviewPromptText, reviewSourceLabel, summarizeFeedWorkspace, summarizeKnowledgeGraph, summarizeReviewSession } from "@/lib/learning-ecosystem"
import { buildProfileActionPlan, type ProfilePlanTarget } from "@/lib/profile-features"
import { buildSocialWorkspacePlan, filterSocialRecords, socialRecordTitle, summarizeSocialWorkspace, type SocialRecordFilter } from "@/lib/social-features"

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
  const [revealedIds, setRevealedIds] = useState<string[]>([])
  const revealed = useMemo(() => new Set(revealedIds), [revealedIds])
  const reviewSummary = useMemo(
    () => summarizeReviewSession({ items: data?.items ?? [], remainingDueCount: data?.remainingDueCount ?? 0 }, revealedIds),
    [data?.items, data?.remainingDueCount, revealedIds],
  )
  const reviewPlan = useMemo(
    () => buildReviewActionPlan({ items: data?.items ?? [], isRestDay: Boolean(data?.isRestDay), remainingDueCount: data?.remainingDueCount ?? 0 }, reviewSummary, revealedIds),
    [data?.isRestDay, data?.items, data?.remainingDueCount, revealedIds, reviewSummary],
  )

  async function record(item: ReviewItem, rating: string) {
    setBusyId(item.id)
    try {
      await api("/api/reviews", { method: "POST", body: JSON.stringify({ id: item.id, rating }) })
      setRevealedIds((current) => current.filter((id) => id !== item.id))
      refresh()
    } finally {
      setBusyId("")
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
        <h2 className="font-semibold text-foreground">Review ritual</h2>
        <button onClick={applyReviewPlan} className="mt-3 w-full rounded-md border border-border bg-secondary p-3 text-left transition hover:bg-accent hover:text-accent-foreground">
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold text-foreground">{reviewPlan.headline}</span>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{reviewPlan.detail}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {reviewPlan.chips.map((chip) => (
              <span key={chip} className="rounded-md bg-background px-2 py-1 text-xs font-semibold text-muted-foreground">
                {chip}
              </span>
            ))}
          </div>
        </button>
        <div className="mt-4 grid gap-2">
          <Metric label="Status" value={status} />
          <Metric label="Due" value={String(reviewSummary.totalDue)} />
          <Metric label="Revealed" value={String(reviewSummary.revealedCount)} />
          <Metric label="Practice misses" value={String(reviewSummary.practiceMissCount)} />
          <Metric label="Recall" value={`${Math.round(reviewSummary.averageRetrievability * 100)}%`} />
          <Metric label="Later" value={String(reviewSummary.remainingAfterCap)} />
        </div>
        {reviewSummary.topTopics.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {reviewSummary.topTopics.map((topic) => (
              <span key={topic.topic} className="rounded-md bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">
                {topic.topic} {topic.count}
              </span>
            ))}
          </div>
        ) : null}
      </Panel>
      <div className="grid gap-3">
        {(data?.items ?? []).map((item) => {
          const isRevealed = revealed.has(item.id)
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
                <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-muted-foreground">
                  <span className="rounded-md bg-muted px-2 py-1">Retrievability {Math.round(item.retrievability * 100)}%</span>
                  <span className="rounded-md bg-muted px-2 py-1">Difficulty {Math.round(item.difficulty * 100)}%</span>
                  <span className="rounded-md bg-muted px-2 py-1">Stability {Math.round(item.stability * 10) / 10}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => toggleReveal(item.id)}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-semibold text-foreground hover:bg-accent hover:text-accent-foreground"
                >
                  <Eye className="h-4 w-4" />
                  {isRevealed ? "Hide answer" : "Reveal"}
                </button>
                {(["again", "hard", "good", "easy"] as const).map((rating) => (
                  <button
                    key={rating}
                    disabled={busyId === item.id}
                    onClick={() => record(item, rating)}
                    className={`h-9 rounded-md border px-3 text-sm font-medium disabled:opacity-60 ${reviewRatingClassName(rating)}`}
                  >
                    {rating[0].toUpperCase() + rating.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-4 rounded-md border border-border bg-background p-3">
              <p className="text-sm font-semibold text-foreground">{reviewPromptText(item)}</p>
              {isRevealed ? <p className="mt-3 text-sm leading-6 text-muted-foreground">{reviewAnswerText(item)}</p> : null}
            </div>
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
          <RitualButton icon={Users} label="Open circles" onClick={() => setView("spaces")} />
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

export function SocialLearningView({ kind }: { kind: "spaces" | "rooms" | "battles" }) {
  const endpoint = kind === "spaces" ? "/api/learning-spaces" : kind === "rooms" ? "/api/study-rooms" : "/api/study-battles"
  const { data, status, refresh } = useResource<{ items: Array<LearningSpace | StudyRoom | StudyBattle> }>(endpoint)
  const [selectedId, setSelectedId] = useState("")
  const [draft, setDraft] = useState(() => createSocialDraft(kind))
  const [query, setQuery] = useState("")
  const [recordFilter, setRecordFilter] = useState<SocialRecordFilter>("all")
  const [message, setMessage] = useState("")
  const draftHydrated = useRef(false)
  const restoredDraftId = useRef<string | null>(null)
  const items = useMemo(() => data?.items ?? [], [data?.items])
  const selected = useMemo(() => items.find((item) => item.id === selectedId), [items, selectedId])
  const Icon = kind === "spaces" ? Users : kind === "rooms" ? Radio : Swords
  const title = kind === "spaces" ? "Learning Spaces" : kind === "rooms" ? "Study Rooms" : "Study Battles"
  const noun = kind === "spaces" ? "space" : kind === "rooms" ? "room" : "battle"
  const socialSummary = useMemo(() => summarizeSocialWorkspace(kind, items), [items, kind])
  const socialPlan = useMemo(() => buildSocialWorkspacePlan(kind, socialSummary), [kind, socialSummary])
  const filteredItems = useMemo(() => filterSocialRecords(items, { query, filter: recordFilter }) as Array<LearningSpace | StudyRoom | StudyBattle>, [items, query, recordFilter])
  const filterOptions = useMemo(() => socialFilterOptions(kind), [kind])

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
    if (!draftHydrated.current || !data) return
    if (!items.length) {
      if (!hasMeaningfulSocialDraft(kind, draft)) {
        setSelectedId("")
        setDraft(createSocialDraft(kind))
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
    setMessage(`Drafting a new ${noun}.`)
  }

  async function saveDraft() {
    const body = payloadFromSocialDraft(kind, draft)
    const response = await api<{ item: LearningSpace | StudyRoom | StudyBattle }>(endpoint, {
      method: draft.id ? "PUT" : "POST",
      body: JSON.stringify(body),
    })
    setSelectedId(response.item.id)
    setMessage(`${socialTitle(response.item)} saved.`)
    await refresh()
  }

  async function toggleDraft() {
    const nextDraft = nextSocialToggle(kind, draft)
    setDraft(nextDraft)
    if (!nextDraft.id) return
    await api(endpoint, { method: "PUT", body: JSON.stringify(payloadFromSocialDraft(kind, nextDraft)) })
    setMessage(`${socialTitle(nextDraft)} toggled.`)
    await refresh()
  }

  async function deleteDraft() {
    if (!draft.id) {
      startNew()
      return
    }
    await api(`${endpoint}?id=${encodeURIComponent(draft.id)}`, { method: "DELETE" })
    setMessage(`${socialTitle(draft)} deleted.`)
    setSelectedId("")
    setDraft(createSocialDraft(kind))
    await refresh()
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_1fr_320px]">
      <section className="rounded-lg border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{socialPlan.headline}</p>
          </div>
          <button onClick={startNew} className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground">
            <Icon className="h-4 w-4" />
            {socialPlan.primaryAction}
          </button>
        </div>
        <label className="mt-4 flex h-10 items-center rounded-md border border-input bg-background px-3">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${title.toLowerCase()}`} className="w-full bg-transparent text-sm outline-none" />
        </label>
        <div className="mt-3 grid grid-cols-3 gap-1 rounded-md border border-border bg-background p-1">
          {filterOptions.map((option) => (
            <button
              key={option}
              onClick={() => setRecordFilter(option)}
              className={`rounded-md px-2 py-1.5 text-xs font-semibold capitalize ${recordFilter === option ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"}`}
            >
              {option}
            </button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Metric label="Total" value={String(socialSummary.total)} />
          <Metric label={socialSummary.primaryLabel} value={String(socialSummary.primaryCount)} />
          <Metric label={socialSummary.secondaryLabel} value={String(socialSummary.secondaryCount)} />
        </div>
        <div className="mt-4 grid gap-2">
          {filteredItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setSelectedId(item.id)
                setDraft(draftFromSocialItem(kind, item))
              }}
              className={`rounded-md border p-3 text-left ${selectedId === item.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground"}`}
            >
              <span className="block truncate text-sm font-semibold">{socialRecordTitle(item)}</span>
              <span className="mt-1 block truncate text-xs opacity-80">{socialMeta(kind, item)}</span>
            </button>
          ))}
          {!filteredItems.length ? <EmptyState title={`No ${title.toLowerCase()} yet`} body={socialPlan.emptyHint} /> : null}
        </div>
        {message ? <p className="mt-3 rounded-md bg-muted p-3 text-sm text-muted-foreground">{message}</p> : null}
      </section>

      <Panel className="p-4">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">{draft.id ? "Editing" : "New draft"}</p>
            <h3 className="mt-1 text-xl font-semibold text-foreground">{draft.name || draft.title || `Untitled ${noun}`}</h3>
          </div>
          <span className="rounded-md bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">{socialDraftStatus(kind, draft)}</span>
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
              <SocialField label="Space name" value={draft.name} onChange={(value) => setDraft({ ...draft, name: value })} />
              <SocialField label="Description" value={draft.description} onChange={(value) => setDraft({ ...draft, description: value })} multiline />
              <SocialField label="Topic tags" value={draft.topicTags} onChange={(value) => setDraft({ ...draft, topicTags: value })} />
              <SocialSelect label="Visibility" value={draft.visibility} options={["private", "connections", "public"]} onChange={(value) => setDraft({ ...draft, visibility: value })} />
            </>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <SocialActionButton label="Save" icon={Save} onClick={saveDraft} primary />
          <SocialActionButton label="Toggle" icon={Play} onClick={toggleDraft} />
          <SocialActionButton label="Reset" icon={Edit3} onClick={() => setDraft(selected ? draftFromSocialItem(kind, selected) : createSocialDraft(kind))} />
          <SocialActionButton label="Delete" icon={Trash2} onClick={deleteDraft} danger />
        </div>
      </Panel>

      <Panel className="p-4">
        <h3 className="font-semibold text-foreground">Controls</h3>
        <p className="mt-2 rounded-md border border-border bg-background p-3 text-sm text-muted-foreground">{socialSummary.suggestedAction}</p>
        <p className="mt-2 rounded-md border border-border bg-success/10 p-3 text-sm font-medium text-foreground">{socialPlan.safetyCue}</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <SocialGuideTile icon={Save} label="Save" detail={`Create or update the selected ${noun}.`} />
          <SocialGuideTile icon={Edit3} label="Edit" detail="Select a record, change fields, then save." />
          <SocialGuideTile icon={Play} label="Toggle" detail="Cycle visibility or status quickly." />
          <SocialGuideTile icon={Trash2} label="Delete" detail="Remove stale or test records." />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Metric label="Records" value={String(items.length)} />
          <Metric label="State" value={status} />
        </div>
        <div className="mt-4 grid gap-2">
          {socialSummary.modeCounts.map((mode) => (
            <div key={mode.label} className="flex items-center justify-between rounded-md border border-border bg-background p-2 text-sm">
              <span className="font-medium text-foreground capitalize">{mode.label}</span>
              <span className="rounded-md bg-secondary px-2 py-1 text-xs font-semibold text-secondary-foreground">{mode.count}</span>
            </div>
          ))}
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

function socialDraftStatus(kind: SocialKind, draft: SocialDraft) {
  if (kind === "spaces") return draft.visibility
  return draft.status
}

function socialTitle(item: LearningSpace | StudyRoom | StudyBattle | SocialDraft) {
  if ("title" in item && item.title) return item.title
  if ("name" in item && item.name) return item.name
  return "Untitled"
}

function socialMeta(kind: "spaces" | "rooms" | "battles", item: LearningSpace | StudyRoom | StudyBattle) {
  if (kind === "spaces" && "visibility" in item) return `${item.visibility} - ${item.member_count ?? 1} members`
  if (kind === "rooms" && "pomodoro_minutes" in item) return `${item.status} - ${item.mode} - ${item.pomodoro_minutes} min`
  if ("topic" in item) return `${item.status} - ${item.mode} - ${item.topic}`
  return "Ready"
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

function SocialActionButton({ icon: Icon, label, onClick, primary, danger }: { icon: ComponentType<{ className?: string }>; label: string; onClick: () => void; primary?: boolean; danger?: boolean }) {
  return (
    <button onClick={onClick} className={`inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-semibold ${primary ? "border-primary bg-primary text-primary-foreground" : danger ? "border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground" : "border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground"}`}>
      <Icon className="h-4 w-4" />
      {label}
    </button>
  )
}

function SocialGuideTile({ detail, icon: Icon, label }: { detail: string; icon: ComponentType<{ className?: string }>; label: string }) {
  return (
    <div className="group relative flex min-h-20 flex-col justify-between rounded-md border border-border bg-background p-3">
      <Icon className="h-5 w-5 text-success" />
      <p className="text-sm font-semibold text-foreground">{label}</p>
      <p className="pointer-events-none absolute right-2 top-[calc(100%+0.35rem)] z-20 hidden w-56 rounded-md border border-border bg-popover p-2 text-xs leading-5 text-popover-foreground shadow-lg group-hover:block">{detail}</p>
    </div>
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
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Metric label="Level" value={String(profile?.metrics.level ?? 1)} />
          <Metric label="Streak" value={String(profile?.metrics.streak ?? 0)} />
          <Metric label="XP" value={String(profile?.metrics.xp ?? 0)} />
          <Metric label="Reputation" value={String(profile?.metrics.reputation ?? 0)} />
        </div>
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
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {profilePlan.stats.map((stat) => (
              <div key={stat.id} className="rounded-md border border-border bg-background p-3">
                <p className="text-xs font-semibold uppercase text-muted-foreground">{stat.label}</p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-lg font-semibold text-foreground">{stat.value}</p>
                  <span className={`h-2 w-2 rounded-full ${profileToneDotClass(stat.tone)}`} />
                </div>
              </div>
            ))}
          </div>
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
