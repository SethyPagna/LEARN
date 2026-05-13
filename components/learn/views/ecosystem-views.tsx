"use client"

import { useEffect, useMemo, useState, type ComponentType } from "react"
import {
  Brain,
  CheckCircle2,
  Compass,
  Eye,
  GitFork,
  Lock,
  MessageSquare,
  Network,
  Play,
  Radio,
  Repeat2,
  ShieldCheck,
  Sparkles,
  Swords,
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

export function GraphView() {
  const { data, status } = useResource<VaultGraphPayload>("/api/vault/graph")
  const nodes = data?.nodes ?? []
  const edges = data?.edges ?? []

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <Panel className="min-h-[520px] overflow-hidden p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-foreground">Living graph</h2>
          <span className="text-sm text-muted-foreground">{status}</span>
        </div>
        <div className="relative h-[440px] rounded-md border border-border bg-background">
          <svg className="absolute inset-0 h-full w-full" role="img" aria-label="Knowledge graph preview">
            {edges.map((edge) => {
              const source = nodes.find((node) => node.id === edge.sourceId)
              const target = nodes.find((node) => node.id === edge.targetId)
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
              <g key={node.id}>
                <circle
                  cx={`${50 + ((node.position?.x ?? index * 12) / 4)}%`}
                  cy={`${50 + ((node.position?.y ?? index * 8) / 4)}%`}
                  r={18 + node.mastery * 12}
                  fill="hsl(var(--card))"
                  stroke="hsl(var(--primary))"
                  strokeWidth="2"
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
        <h3 className="font-semibold text-foreground">Accessible graph table</h3>
        <div className="mt-3 max-h-[470px] space-y-2 overflow-auto">
          {nodes.map((node) => (
            <div key={node.id} className="rounded-md border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-foreground">{node.title}</p>
                {node.visibility === "private" ? <Lock className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-success" />}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{Math.round(node.mastery * 100)}% mastery</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}

export function ReviewsView() {
  const { data, status, refresh } = useResource<ReviewPayload>("/api/reviews")
  const [busyId, setBusyId] = useState("")

  async function record(item: ReviewItem, rating: string) {
    setBusyId(item.id)
    await api("/api/reviews", { method: "POST", body: JSON.stringify({ id: item.id, rating }) })
    setBusyId("")
    refresh()
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
      <Panel className="p-4">
        <h2 className="font-semibold text-foreground">Review ritual</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {data?.isRestDay ? "Today is protected as a rest day." : `${data?.items.length ?? 0} due now, ${data?.remainingDueCount ?? 0} left after the cap.`}
        </p>
        <div className="mt-4 grid gap-2">
          <Metric label="Status" value={status} />
          <Metric label="Dose" value="Minimum effective" />
        </div>
      </Panel>
      <div className="grid gap-3">
        {(data?.items ?? []).map((item) => (
          <Panel key={item.id} className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-foreground">{item.title}</p>
                <p className="text-sm text-muted-foreground">{item.sourceType} · retrievability {Math.round(item.retrievability * 100)}%</p>
              </div>
              <div className="flex gap-2">
                {["again", "hard", "good", "easy"].map((rating) => (
                  <button
                    key={rating}
                    disabled={busyId === item.id}
                    onClick={() => record(item, rating)}
                    className="h-9 rounded-md border border-border bg-secondary px-3 text-sm font-medium text-secondary-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-60"
                  >
                    {rating}
                  </button>
                ))}
              </div>
            </div>
          </Panel>
        ))}
        {data && data.items.length === 0 ? <EmptyState title="No reviews due" body="Rest or save a feed lesson into your Vault for the next session." /> : null}
      </div>
    </div>
  )
}

export function FeedView({ setView }: { setView: (view: View) => void }) {
  const { data, refresh } = useResource<{ items: MicroLesson[] }>("/api/feed?topic=study&topic=notes")
  const [answered, setAnswered] = useState<Record<string, string>>({})

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

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
      <div className="grid gap-4">
        {(data?.items ?? []).map((lesson) => (
          <Panel key={lesson.id} className="min-h-[420px] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="inline-flex h-8 items-center gap-2 rounded-md bg-secondary px-3 text-xs font-semibold text-secondary-foreground">
                {lesson.reason === "serendipity" ? <Sparkles className="h-4 w-4" /> : <Compass className="h-4 w-4" />}
                {lesson.reason || "preferred"}
              </span>
              <span className="text-sm text-muted-foreground">{lesson.duration_seconds || lesson.durationSeconds || 90}s</span>
            </div>
            <div className="mt-10 max-w-2xl">
              <h2 className="text-3xl font-semibold leading-tight text-foreground">{lesson.title}</h2>
              <p className="mt-3 text-lg leading-8 text-muted-foreground">{lesson.summary}</p>
            </div>
            <div className="mt-8 rounded-md border border-border bg-background p-4">
              <p className="font-medium text-foreground">{lesson.question}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {(lesson.choices ?? []).map((choice) => {
                  const selected = answered[lesson.id] === choice.id
                  const correct = choice.id === lesson.correct_choice_id
                  return (
                    <button
                      key={choice.id}
                      onClick={() => answer(lesson, choice.id)}
                      className={`rounded-md border p-3 text-left text-sm font-medium ${selected ? correct ? "border-success bg-success/15 text-foreground" : "border-destructive bg-destructive/10 text-foreground" : "border-border bg-secondary text-secondary-foreground"}`}
                    >
                      {choice.text}
                    </button>
                  )
                })}
              </div>
              {answered[lesson.id] ? <p className="mt-3 text-sm text-muted-foreground">{lesson.explanation}</p> : null}
            </div>
          </Panel>
        ))}
      </div>
      <Panel className="h-max p-4">
        <h3 className="font-semibold text-foreground">Feed controls</h3>
        <div className="mt-3 grid gap-2">
          <RitualButton icon={Brain} label="Save ideas to Vault" onClick={() => setView("vault")} />
          <RitualButton icon={Users} label="Open circles" onClick={() => setView("spaces")} />
          <RitualButton icon={ShieldCheck} label="15% serendipity stays on" onClick={() => refresh()} />
        </div>
      </Panel>
    </div>
  )
}

export function SocialLearningView({ kind }: { kind: "spaces" | "rooms" | "battles" }) {
  const endpoint = kind === "spaces" ? "/api/learning-spaces" : kind === "rooms" ? "/api/study-rooms" : "/api/study-battles"
  const { data, status, refresh } = useResource<{ items: Array<LearningSpace | StudyRoom | StudyBattle> }>(endpoint)

  async function createItem() {
    const body = kind === "spaces"
      ? { name: "Personal learning circle", description: "A focused group for shared study routes.", visibility: "private", topicTags: ["study"] }
      : kind === "rooms"
        ? { name: "Focus room", mode: "focus", pomodoroMinutes: 25 }
        : { title: "Quick study battle", topic: "Review", mode: "solo" }
    await api(endpoint, { method: "POST", body: JSON.stringify(body) })
    refresh()
  }

  const Icon = kind === "spaces" ? Users : kind === "rooms" ? Radio : Swords
  return (
    <div className="grid gap-4">
      <section className="rounded-lg border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">{kind === "spaces" ? "Learning Spaces" : kind === "rooms" ? "Study Rooms" : "Study Battles"}</h2>
            <p className="mt-2 text-sm text-muted-foreground">Opt-in social learning with roles, presence-ready rooms, and shared activity logs.</p>
          </div>
          <button onClick={createItem} className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground">
            <Icon className="h-4 w-4" />
            New {kind.slice(0, -1)}
          </button>
        </div>
      </section>
      <div className="grid gap-3 md:grid-cols-3">
        {(data?.items ?? []).map((item) => (
          <Panel key={item.id} className="p-4">
            <Icon className="h-5 w-5 text-success" />
            <h3 className="mt-3 font-semibold text-foreground">{"name" in item ? item.name : item.title}</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{"description" in item ? item.description : "status" in item ? item.status : "Ready"}</p>
          </Panel>
        ))}
      </div>
      {!data?.items.length ? <StatusMessage message={status} /> : null}
    </div>
  )
}

export function ProfileView({ user }: { user: User | null }) {
  const username = user?.username || "admin"
  const { data, status } = useResource<{ item: PublicProfile }>(`/api/profile/public?username=${encodeURIComponent(username)}&viewer=owner`)
  const profile = data?.item
  const achievements = useResource<{ items: Achievement[] }>("/api/achievements")

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <Panel className="p-5">
        <div className="flex h-16 w-16 items-center justify-center rounded-md bg-primary text-xl font-semibold text-primary-foreground">
          {(profile?.name || user?.name || "L").slice(0, 1)}
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
      </Panel>
      <div className="grid gap-4">
        <Panel className="p-4">
          <h3 className="font-semibold text-foreground">Public artifacts</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {(profile?.artifacts ?? []).map((node) => <NodeCard key={node.id} node={node} />)}
          </div>
          {profile && profile.artifacts.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No public artifacts yet. Sharing remains opt-in.</p> : null}
        </Panel>
        <Panel className="p-4">
          <h3 className="font-semibold text-foreground">Achievements</h3>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            {(achievements.data?.items ?? []).map((achievement) => (
              <div key={achievement.id} className="rounded-md border border-border p-3">
                <CheckCircle2 className={`h-4 w-4 ${achievement.unlocked ? "text-success" : "text-muted-foreground"}`} />
                <p className="mt-2 font-medium text-foreground">{achievement.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">{achievement.description}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{status}</p>
        </Panel>
      </div>
    </div>
  )
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
      <p className="mt-1 text-sm text-muted-foreground">{Math.round(node.mastery * 100)}% mastery · {node.visibility}</p>
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
