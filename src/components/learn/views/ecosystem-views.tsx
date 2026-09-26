"use client"

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react"
import { VaultNoteBlocks } from "../vault-note-blocks"
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Compass,
  Copy,
  Edit3,
  Eye,
  ExternalLink,
  FolderOpen,
  Lock,
  Mail,
  MessageSquare,
  Network,
  Play,
  Radio,
  Repeat2,
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
  Note,
  PublicProfile,
  ReviewItem,
  StudyBattle,
  StudyRoom,
  User,
  View,
} from "../types"
import { EmptyState, Panel, StatusMessage } from "../ui"
import { VoiceInput } from "../voice-input"
import { buildReviewActionPlan, buildReviewRatingActions, buildReviewSummaryChips, buildVaultBlockPalette, reviewAnswerText, reviewPromptText, reviewSourceLabel, summarizeReviewSession, type ReviewRating, type VaultBlockType } from "@/lib/learning-ecosystem"
import { buildProfileActionPlan, buildProfileSummaryChips, type ProfilePlanTarget, type ProfileSummaryChip } from "@/lib/profile-features"
import { createSocialDraft, parseStoredSocialDraftStore, socialDraftStorageKey, type SocialDraft, type SocialDraftStore, type SocialKind } from "@/lib/social-drafts"
import { buildSocialActionKit, buildSocialActionReadiness, buildSocialActionsPage, buildSocialActivityTimeline, buildSocialInviteReadiness, buildSocialRecordCard, buildSocialRecordsPage, buildSocialRecordSelectionMessage, buildSocialWorkspacePlan, buildWorkspaceMembersPage, findRecommendedSocialRecord, formatSocialAction, normalizeSocialInviteDraft, normalizeSocialInviteRole, socialInviteRoleOptions, summarizeSocialActions, summarizeSocialWorkspace, summarizeWorkspaceMembers, type SocialActionLike, type SocialActionTarget, type SocialInviteRole, type SocialRecordFilter, type WorkspaceMemberLike } from "@/lib/social-features"

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

export function VaultView({ notes = [], setView, onOpenNote }: { notes?: Note[]; setView: (view: View) => void; onOpenNote: (id: string) => void }) {
  const { data, status } = useResource<VaultGraphPayload>("/api/vault/graph")
  const [blockType, setBlockType] = useState<VaultBlockType>("text")
  const [blockNoteId, setBlockNoteId] = useState("")
  const [blockContent, setBlockContent] = useState("")
  const [blockStatus, setBlockStatus] = useState("")
  const [blocksRevision, setBlocksRevision] = useState(0)

  const topNodes = data?.nodes.slice(0, 5) ?? []
  const paletteGroups = useMemo(() => buildVaultBlockPalette(blockType), [blockType])
  const targetNoteId = blockNoteId || notes[0]?.id || ""
  const targetNoteTitle = notes.find((note) => note.id === targetNoteId)?.title || "No note selected"

  async function saveVaultBlock() {
    if (!targetNoteId) {
      setBlockStatus("Create a note first, then the palette can save blocks into it.")
      return
    }
    setBlockStatus("Saving block...")
    try {
      await api("/api/vault/blocks", {
        method: "POST",
        body: JSON.stringify({ noteId: targetNoteId, blockType, content: { text: blockContent } }),
      })
      setBlockContent("")
      setBlocksRevision((value) => value + 1)
      setBlockStatus(`Saved a ${blockType} block to "${targetNoteTitle}".`)
    } catch (error) {
      setBlockStatus(error instanceof Error ? error.message : "Unable to save the block.")
    }
  }

  return (
    <section className="learning-page grid gap-3">
      <header className="workspace-header"><h2 className="text-lg font-semibold">Vault</h2><button onClick={() => targetNoteId ? onOpenNote(targetNoteId) : setView("notes")} className="editor-primary" aria-label="Open notes" title="Open notes"><BookOpen className="h-4 w-4" /></button></header>
      <div className="vault-workbench">
        <aside className="compact-list"><label className="editor-field">Your notes<select aria-label="Vault note" className="editor-input" value={targetNoteId} onChange={event => setBlockNoteId(event.target.value)}>{notes.map(note => <option key={note.id} value={note.id}>{note.title}</option>)}</select></label>
          <div className="mt-3 hidden md:grid">{notes.slice(0, 12).map(note => <button key={note.id} className="compact-row" aria-pressed={targetNoteId === note.id} onClick={() => setBlockNoteId(note.id)}><BookOpen className="h-4 w-4 text-primary" /><span className="truncate">{note.title}</span></button>)}</div>
        </aside>
        <Panel className="min-w-0 p-4"><h3 className="mb-3 font-semibold">{targetNoteTitle}</h3><VaultNoteBlocks note={notes.find(note => note.id === targetNoteId)} revision={blocksRevision} setView={setView} />
          <details className="workspace-disclosure mt-3"><summary>Add a block</summary><div className="grid gap-3 pt-3">
            <select aria-label="Block type" className="editor-input" value={blockType} onChange={event => setBlockType(event.target.value as VaultBlockType)}>{paletteGroups.map(group => <optgroup key={group.id} label={group.label}>{group.blocks.map(block => <option key={block} value={block}>{block.replaceAll("-", " ")}</option>)}</optgroup>)}</select>
            <textarea aria-label="Block content" className="editor-input min-h-24 py-2" placeholder="Write something…" value={blockContent} onChange={event => setBlockContent(event.target.value)} />
            <div className="flex items-center gap-2"><VoiceInput label="Dictate block" prompt={`Vault ${blockType} block for ${targetNoteTitle}`} onTranscript={(text) => setBlockContent((current) => (current && !/\s$/.test(current) ? `${current} ${text}` : `${current}${text}`))} /><button className="editor-primary ml-auto" disabled={!targetNoteId || !blockContent.trim()} onClick={saveVaultBlock}>Add</button></div>
            {blockStatus ? <p role="status" className="text-xs text-muted-foreground">{blockStatus}</p> : null}
          </div></details>
        </Panel>
      </div>
      <details className="workspace-disclosure"><summary>Connected topics <span className="text-muted-foreground">{data?.nodes.length || 0}</span></summary><div className="grid gap-2 pt-3 sm:grid-cols-3">{topNodes.map(node => <NodeCard key={node.id} node={node} />)}</div><button className="editor-command mt-2" onClick={() => setView("graph")} aria-label="Explore graph" title="Explore graph"><Network className="h-4 w-4" /></button></details>
      {status && status !== "Ready" ? <p className="text-xs text-muted-foreground">{status}</p> : null}
    </section>
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
  const filteredNodes = useMemo(() => filterGraphNodes(nodes, orphanIds, graphFilter), [graphFilter, nodes, orphanIds])
  const selectedNode = filteredNodes.find(node => node.id === selectedId) ?? filteredNodes[0]

  const positions = new Map(nodes.map((node, index) => [node.id, { x: 300 + Math.cos(index * 2.399) * Math.min(205, 65 + index * 11), y: 205 + Math.sin(index * 2.399) * Math.min(155, 50 + index * 9) }]))
  const visibleIds = new Set(filteredNodes.map(node => node.id))
  const points = filteredNodes.map(node => positions.get(node.id)!)
  const left = Math.min(...points.map(point => point.x), 300) - 105
  const top = Math.min(...points.map(point => point.y), 205) - 60
  const width = Math.max(...points.map(point => point.x), 300) - left + 105
  const height = Math.max(...points.map(point => point.y), 205) - top + 80
  return <section className="learning-page grid gap-3">
    <header className="workspace-header"><h2 className="text-lg font-semibold">Graph <span className="text-xs font-normal text-muted-foreground">{nodes.length} topics</span></h2><button className="editor-command" onClick={() => setView("notes")} aria-label="Notes" title="Notes"><BookOpen className="h-4 w-4" /></button></header>
    <div className="flex flex-wrap gap-1">{(["all", "weak", "orphan", "public"] as GraphFilter[]).map(filter => <button className="calendar-filter" aria-pressed={graphFilter === filter} key={filter} onClick={() => setGraphFilter(filter)}>{graphFilterLabel(filter)}</button>)}</div>
    <div className="graph-workbench"><Panel className="relative overflow-hidden graph-stage">
      {filteredNodes.length ? <svg viewBox={`${left} ${top} ${width} ${height}`} className="w-full" aria-label="Knowledge graph">
        {edges.filter(edge => visibleIds.has(edge.sourceId) && visibleIds.has(edge.targetId)).map(edge => { const source = positions.get(edge.sourceId), target = positions.get(edge.targetId); return source && target ? <line key={edge.id} x1={source.x} y1={source.y} x2={target.x} y2={target.y} stroke="currentColor" className="text-primary/25" strokeWidth="2" /> : null })}
        {filteredNodes.map(node => { const point = positions.get(node.id)!; return <g key={node.id} role="button" tabIndex={0} aria-label={`Select ${node.title}`} aria-pressed={selectedNode?.id === node.id} onClick={() => setSelectedId(node.id)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedId(node.id) } }} className="graph-node cursor-pointer">
          <circle cx={point.x} cy={point.y} r={selectedNode?.id === node.id ? 27 : 21} className={orphanIds.has(node.id) ? "fill-card stroke-warning" : "fill-card stroke-primary"} strokeWidth={selectedNode?.id === node.id ? 4 : 2} />
          <text x={point.x} y={point.y + 4} textAnchor="middle" className="fill-primary text-[12px] font-semibold" aria-hidden="true">{node.title.slice(0, 1)}</text>
          <text x={point.x} y={point.y + 41} textAnchor="middle" className="fill-foreground text-[11px]">{node.title.length > 22 ? `${node.title.slice(0, 21)}…` : node.title}</text>
        </g> })}
      </svg> : <div className="grid min-h-72 place-content-center gap-3 text-center"><Network className="mx-auto h-10 w-10 text-primary/50" /><p className="text-sm text-muted-foreground">{nodes.length ? "No topics match this filter." : "No topics yet"}</p><button className="editor-primary" onClick={() => setView("notes")}>Open notes</button></div>}
    </Panel><aside className="compact-list"><h3 className="mb-2 text-xs text-muted-foreground">Topics</h3>{filteredNodes.map(node => <button key={node.id} onClick={() => setSelectedId(node.id)} className="compact-row" aria-pressed={selectedNode?.id === node.id}><span className="truncate flex-1">{node.title}</span><span className="text-xs text-muted-foreground">{Math.round(node.mastery * 100)}%</span></button>)}
      {selectedNode ? <div className="mt-4 border-t border-border pt-3"><p className="font-medium text-sm">{selectedNode.title}</p><p className="mt-1 text-xs text-muted-foreground">{selectedNode.visibility} · {Math.round(selectedNode.mastery * 100)}% learned</p><button className="editor-command mt-2" onClick={() => setView("reviews")} aria-label="Review" title="Review"><Repeat2 className="h-4 w-4" /></button></div> : null}
    </aside></div>
    {status && status !== "Ready" ? <p className="text-xs text-muted-foreground">{status}</p> : null}
  </section>
}

function filterGraphNodes(nodes: KnowledgeNode[], orphanIds: Set<string>, filter: GraphFilter) {
  if (filter === "weak") return nodes.filter((node) => node.mastery < 0.55)
  if (filter === "orphan") return nodes.filter((node) => orphanIds.has(node.id))
  if (filter === "public") return nodes.filter((node) => node.visibility !== "private")
  return nodes
}

function graphFilterLabel(filter: GraphFilter) {
  if (filter === "weak") return "Needs practice"
  if (filter === "orphan") return "Unlinked"
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
        <button onClick={applyReviewPlan} title={reviewPlan.headline} className="mt-3 w-full rounded-md border border-border bg-secondary p-3 text-left transition hover:bg-accent hover:text-accent-foreground">
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold text-foreground">Next</span>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </button>
        <details className="mt-3 rounded-md border border-border bg-background p-2">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-foreground">
            <span>Details</span>
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
            <span>Queue</span>
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
                  )) : null}
              </div>
            </div>
            <div className="mt-4 rounded-md border border-border bg-background p-3">
              <p className="text-sm font-semibold text-foreground">{reviewPromptText(item)}</p>
              {isRevealed ? <p className="mt-3 text-sm leading-6 text-muted-foreground">{reviewAnswerText(item)}</p> : null}
            </div>
            <details className="mt-3 rounded-md border border-border bg-background p-2">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                <span>Memory</span>
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
  const { data, status, refresh } = useResource<{ items: MicroLesson[] }>("/api/feed?topic=study&topic=notes")
  const [answered, setAnswered] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const [filter, setFilter] = useState("all")
  const lessons = data?.items || []
  const topics = Array.from(new Set(lessons.flatMap(lesson => lesson.topic_tags || lesson.topicTags || [])))
  const activeFilter = topics.includes(filter) ? filter : "all"
  async function answer(lesson: MicroLesson, choiceId: string) {
    if (busy || answered[lesson.id]) return
    setBusy(lesson.id); setMessage("")
    try {
      await api("/api/feed/interactions", { method: "POST", body: JSON.stringify({ lessonId: lesson.id, action: "answered", correct: choiceId === lesson.correct_choice_id }) })
      setAnswered(current => ({ ...current, [lesson.id]: choiceId }))
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save your answer. Try again.") }
    finally { setBusy(null) }
  }
  return <section className="learning-page mx-auto grid max-w-3xl gap-3">
    <header className="workspace-header"><h2 className="text-lg font-semibold">Feed</h2><button onClick={refresh} className="editor-command" aria-label="Refresh" title="Refresh"><Repeat2 className="h-4 w-4" /></button></header>
    <div className="flex flex-wrap gap-1">{["all", ...topics].map(topic => <button key={topic} aria-pressed={activeFilter === topic} onClick={() => setFilter(topic)} className="calendar-filter">{topic === "all" ? "For you" : topic}</button>)}</div>
    {message ? <p role="alert" className="text-sm text-destructive">{message}</p> : null}
    {lessons.filter(lesson => activeFilter === "all" || (lesson.topic_tags || lesson.topicTags || []).includes(activeFilter)).map((lesson, index) => <article key={lesson.id} className="discovery-card" data-tone={index % 3}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Compass className="h-4 w-4" /><span>{Math.ceil((lesson.duration_seconds || lesson.durationSeconds || 90) / 60)} min</span>{answered[lesson.id] ? <CheckCircle2 className="ml-auto h-4 w-4 text-success" /> : null}</div>
      <h3 className="mt-3 text-xl font-semibold">{lesson.title}</h3><details className="mt-3"><summary className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium"><BookOpen className="h-4 w-4" />Read</summary><p className="mt-2 text-sm leading-6 text-muted-foreground">{lesson.summary}</p></details>
      <details className="mt-4"><summary className="cursor-pointer text-sm font-medium">Quick question</summary><div className="grid gap-2 pt-3"><p className="text-sm">{lesson.question}</p><div className="grid gap-2 sm:grid-cols-2">{(lesson.choices || []).map(choice => <button key={choice.id} disabled={Boolean(busy || answered[lesson.id])} onClick={() => void answer(lesson, choice.id)} className={`rounded-lg border p-3 text-left text-sm disabled:cursor-default ${answered[lesson.id] === choice.id ? choice.id === lesson.correct_choice_id ? "border-success bg-success/10" : "border-destructive bg-destructive/10" : "border-border bg-card hover:bg-accent"}`}>{choice.text}</button>)}</div>{answered[lesson.id] ? <p role="status" className="text-sm text-muted-foreground">{answered[lesson.id] === lesson.correct_choice_id ? "Correct. " : "Not quite. "}{lesson.explanation}</p> : null}</div></details>
    </article>)}
    {!lessons.length ? <EmptyState title="Nothing to discover yet" body={status && status !== "Ready" ? status : "Try refreshing after your next study session."} /> : null}
    <button onClick={() => setView("notes")} className="editor-command justify-self-start" aria-label="Open notes" title="Open notes"><BookOpen className="h-4 w-4" /></button>
  </section>
}

export function SocialLearningView({ kind, setView }: { kind: "spaces" | "rooms" | "battles"; setView?: (view: View) => void }) {
  const endpoint = kind === "spaces" ? "/api/learning-spaces" : kind === "rooms" ? "/api/study-rooms" : "/api/study-battles"
  const { data, status, refresh } = useResource<{ items: Array<LearningSpace | StudyRoom | StudyBattle> }>(endpoint)
  const members = useResource<{ items: WorkspaceMemberLike[] }>("/api/workspace/members")
  const recentActions = useResource<{ items: SocialActionLike[] }>("/api/social/actions?limit=8")
  const [selectedId, setSelectedId] = useState("")
  const [draft, setDraft] = useState(() => createSocialDraft(kind))
  const [editing, setEditing] = useState(false)
  const [query, setQuery] = useState("")
  const [memberQuery, setMemberQuery] = useState("")
  const [recordFilter, setRecordFilter] = useState<SocialRecordFilter>("all")
  const [message, setMessage] = useState("")
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<SocialInviteRole>("learner")
  const [inviteLink, setInviteLink] = useState("")
  const [inviteLoading, setInviteLoading] = useState(false)
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
  const memberPage = useMemo(() => buildWorkspaceMembersPage(memberItems, memberQuery, memberLimit), [memberItems, memberLimit, memberQuery])
  const filteredMembers = memberPage.items
  const activityPage = useMemo(() => buildSocialActionsPage(recentActionItems, activityLimit), [activityLimit, recentActionItems])
  const filterOptions = useMemo(() => socialFilterOptions(kind), [kind])
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
    setEditing(true)
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
    setEditing(false)
    setSelectedId(item.id)
    setDraft(draftFromSocialItem(kind, item))
    setDeleteConfirmId(null)
    setDetailTab("actions")
    setMessage(buildSocialRecordSelectionMessage(kind, item))
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
      setEditing(false)
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
    const copied = await navigator.clipboard?.writeText(actionKit.inviteText).then(() => true, () => false)
    setMessage(copied ? "Invite text copied." : "Clipboard unavailable. Create an invite link to copy manually.")
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
      const copied = await navigator.clipboard?.writeText(link).then(() => true, () => false)
      setMessage(copied ? "Invite link created and copied." : "Invite link created. Copy the link below.")
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

  return <section className="social-hub grid gap-3">
    <header className="workspace-header"><h2 className="text-lg font-semibold">{title}</h2><button type="button" onClick={startNew} className="editor-primary" aria-label="Add" title="Add"><Icon className="h-4 w-4" /></button></header>
    <div className="social-browser"><aside className="compact-list">
      <input aria-label={`Search ${title}`} className="editor-input w-full" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search…" />
      <div className="my-2 flex flex-wrap gap-1">{filterOptions.map(option => <button key={option} className="calendar-filter" aria-pressed={recordFilter === option} onClick={() => setRecordFilter(option)}>{option === "all" ? "All" : socialFilterLabel(option)}</button>)}</div>
      {recordCards.map(({ card, item }, index) => <button key={item.id} onClick={() => selectSocialRecord(item)} className="social-record" aria-pressed={selectedId === item.id}><span className="social-avatar" data-tone={index % 3}><Icon className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="block truncate font-medium">{card.title}</span><span className="block text-xs text-muted-foreground">{card.status}</span></span></button>)}
      {!filteredItems.length ? <div className="py-6 text-center text-sm text-muted-foreground"><p>{status === "Loading" ? "Loading…" : items.length ? "No matches" : `No ${title.toLowerCase()} yet`}</p>{items.length ? <button className="editor-command mt-2" onClick={clearRecordFilters}>Clear filters</button> : null}</div> : null}
      {recordPage.hiddenCount ? <button className="editor-command mt-2" onClick={() => setRecordLimit(value => value + 12)}>Show more</button> : null}
    </aside><div className="min-w-0">
      <div className="social-cover"><Icon className="h-8 w-8" /><div className="min-w-0 flex-1"><h3 className="truncate text-xl font-semibold">{socialTitle(draft) || `New ${noun}`}</h3><p className="mt-1 text-xs opacity-75">{draft.id ? recordStatus : "Draft"}</p></div><button className="editor-command" aria-label={`Edit ${noun}`} onClick={() => setEditing(!editing)}><Edit3 className="h-4 w-4" /></button></div>
      {editing ? <Panel className="mt-3 p-4"><div className="grid gap-3">            {kind === "battles" ? (
              <>
                <SocialField label="Title" value={draft.title} onChange={(value) => setDraft({ ...draft, title: value })} />
                <SocialField label="Topic" value={draft.topic} onChange={(value) => setDraft({ ...draft, topic: value })} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <SocialSelect label="Mode" value={draft.mode} options={["solo", "team"]} onChange={(value) => setDraft({ ...draft, mode: value })} />
                  <SocialSelect label="Status" value={draft.status} options={["waiting", "active", "completed"]} onChange={(value) => setDraft({ ...draft, status: value })} />
                </div>
              </>
            ) : kind === "rooms" ? (
              <>
                <SocialField label="Room name" value={draft.name} onChange={(value) => setDraft({ ...draft, name: value })} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <SocialSelect label="Mode" value={draft.mode} options={["focus", "discussion", "stage"]} onChange={(value) => setDraft({ ...draft, mode: value })} />
                  <SocialSelect label="Status" value={draft.status} options={["open", "active", "closed"]} onChange={(value) => setDraft({ ...draft, status: value })} />
                  <SocialField label="Pomodoro minutes" value={String(draft.pomodoroMinutes)} onChange={(value) => setDraft({ ...draft, pomodoroMinutes: Number(value) || 25 })} />
                  <SocialField label="Break minutes" value={String(draft.breakMinutes)} onChange={(value) => setDraft({ ...draft, breakMinutes: Number(value) || 5 })} />
                </div>
              </>
            ) : (
              <>
                <SocialField label="Group name" value={draft.name} onChange={(value) => setDraft({ ...draft, name: value })} />
                <SocialField label="Description" value={draft.description} onChange={(value) => setDraft({ ...draft, description: value })} multiline />
                <div className="grid gap-3 sm:grid-cols-2">
                  <SocialField label="Topic tags" value={draft.topicTags} onChange={(value) => setDraft({ ...draft, topicTags: value })} />
                  <SocialSelect label="Visibility" value={draft.visibility} options={["private", "connections", "public"]} onChange={(value) => setDraft({ ...draft, visibility: value })} />
                </div>
              </>
            )}
        <div className="flex gap-2"><button className="editor-command" onClick={() => setEditing(false)}>Close</button><button className="editor-primary ml-auto" disabled={recordBusy} onClick={() => void saveDraft()}>{recordBusy ? "Saving…" : "Save"}</button></div>
      </div></Panel> : null}
      <nav className="page-sections mt-3" aria-label={`${title} details`}>{detailTabs.map(tab => <button key={tab.id} aria-current={detailTab === tab.id ? "page" : undefined} onClick={() => setDetailTab(tab.id)}><tab.icon className="h-4 w-4" />{tab.id === "actions" ? "Overview" : tab.id === "safety" ? "Manage" : tab.label}</button>)}</nav>
      {message ? <p role="status" className="mb-3 text-xs text-muted-foreground">{message}</p> : null}
      {detailTab === "actions" ? <Panel className="p-4"><p className="text-sm leading-6 text-muted-foreground">{kind === "spaces" ? draft.description || "A place to learn together." : kind === "rooms" ? `${draft.mode} · ${draft.pomodoroMinutes} min focus · ${draft.breakMinutes} min break` : draft.topic || "Ready for a friendly challenge?"}</p><div className="social-quick-actions mt-4">{(draft.id ? readyActions : []).map(action => { const ActionIcon = socialActionIcon(action.id); return <button key={action.id} disabled={!action.enabled} title={action.detail} onClick={() => action.id === "invite" ? setDetailTab("invite") : void runSocialAction(action.id)}><ActionIcon className="h-5 w-5" /><span>{actionKit.actions.find(item => item.id === action.id)?.label || action.label}</span></button> })}</div>{!draft.id ? <button className="editor-primary mt-4" onClick={() => setEditing(true)}>Set up {noun}</button> : null}</Panel> : null}
      {detailTab === "invite" ? <Panel className="grid gap-3 p-4"><h3 className="text-sm font-medium">Invite to LEARN</h3><div className="flex flex-wrap gap-2"><input type="email" aria-label="Invite email" className="editor-input min-w-0 flex-1" placeholder="Email address" value={inviteEmail} onChange={event => setInviteEmail(event.target.value)} /><select aria-label="Invite role" className="editor-input" value={inviteRole} onChange={event => setInviteRole(normalizeSocialInviteRole(event.target.value))}>{socialInviteRoleOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div><div className="flex flex-wrap gap-2"><button className="editor-command" onClick={copyInvite} aria-label="Copy invitation" title="Copy invitation"><Copy className="h-4 w-4" /></button><button className="editor-primary ml-auto" disabled={!inviteReadiness.enabled} title={inviteReadiness.message} onClick={createSecureInvite}>{inviteLoading ? "Creating…" : "Create link"}</button></div>{inviteLink ? <a href={inviteLink} className="break-all text-xs text-primary">{inviteLink}</a> : null}</Panel> : null}
      {detailTab === "people" ? <Panel className="p-4"><h3 className="mb-3 text-sm font-medium">Workspace people</h3><input className="editor-input w-full" aria-label="Search people" placeholder="Search people" value={memberQuery} onChange={event => setMemberQuery(event.target.value)} /><div className="mt-2 grid">{filteredMembers.map(member => <div key={member.id || member.email} className="compact-row"><span className="social-avatar">{(member.name || member.email || "?").slice(0, 1)}</span><span className="min-w-0 flex-1"><span className="block truncate">{member.name || member.email}</span><span className="text-xs text-muted-foreground">{member.role || "learner"}</span></span></div>)}</div>{memberPage.hiddenCount ? <button className="editor-command" onClick={() => setMemberLimit(value => value + 10)}>Show more</button> : null}</Panel> : null}
      {detailTab === "activity" ? <Panel className="p-4"><h3 className="mb-3 text-sm font-medium">Workspace activity</h3>{activityPage.items.map((action, index) => { const formatted = formatSocialAction(action); return <div key={action.id || index} className="compact-row"><span className="social-avatar"><MessageSquare className="h-4 w-4" /></span><span className="min-w-0"><span className="block text-sm font-medium">{formatted.label}</span><span className="block text-xs text-muted-foreground">{formatted.detail}</span></span></div> })}{!activityPage.items.length ? <p className="text-sm text-muted-foreground">No activity yet.</p> : null}{activityPage.hiddenCount ? <button className="editor-command" onClick={() => setActivityLimit(value => value + 4)}>Show more</button> : null}</Panel> : null}
      {detailTab === "safety" ? <Panel className="grid gap-3 p-4"><p className="text-xs text-muted-foreground">{socialPlan.safetyCue}</p><div className="flex flex-wrap gap-2"><button className="editor-command" disabled={recordBusy} onClick={() => void toggleDraft()}>{kind === "spaces" ? "Change visibility" : "Change status"}</button><button className="editor-command" onClick={() => { setDraft(selected ? draftFromSocialItem(kind, selected) : createSocialDraft(kind)); setMessage("Changes reset.") }}>Reset changes</button><button className="editor-command text-destructive" disabled={recordBusy} onClick={() => void deleteDraft()}><Trash2 className="h-4 w-4" />{deleteConfirmId === draft.id && draft.id ? "Confirm delete" : "Delete"}</button></div></Panel> : null}
    </div></div>
  </section>
}

type SocialDetailTab = "actions" | "invite" | "people" | "activity" | "safety"

function readSocialDraftStore(kind: SocialKind): SocialDraftStore | null {
  if (typeof window === "undefined") return null
  return parseStoredSocialDraftStore(kind, window.localStorage.getItem(socialDraftStorageKey(kind)))
}

function writeSocialDraftStore(kind: SocialKind, store: SocialDraftStore) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(socialDraftStorageKey(kind), JSON.stringify(store))
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

function socialActionIcon(target: SocialActionTarget) {
  if (target === "invite") return Users
  if (target === "chat") return MessageSquare
  if (target === "calendar") return CalendarDays
  if (target === "practice") return BookOpen
  return FolderOpen
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

/**
 * `/profile` is your own profile; `/profile/<username>` is someone else's, read
 * only and exactly as much of it as they share with you (the server decides).
 */
export function ProfileView({ setView, user, username }: { setView?: (view: View) => void; user: User | null; username?: string }) {
  if (!user) return <StatusMessage message="Loading profile…" />
  if (username && username !== user.username) return <PersonProfileView setView={setView} username={username} />
  return <OwnProfileView setView={setView} user={user} />
}

function PersonProfileView({ setView, username }: { setView?: (view: View) => void; username: string }) {
  const { data, status } = useResource<{ item: PublicProfile }>(`/api/profile/public?username=${encodeURIComponent(username)}`)
  const profile = data?.item
  if (!profile) return <StatusMessage message={status === "Loading" ? "Loading profile…" : status} />

  const initial = (profile.name || profile.username || "?").slice(0, 1).toUpperCase()
  const links = [
    { href: profile.social_links?.intro, label: "Intro" },
    { href: profile.social_links?.website, label: "Website" },
    { href: profile.social_links?.facebook, label: "Facebook" },
  ].filter((link): link is { href: string; label: string } => Boolean(link.href))
  const visibilityLabel = profile.profile_visibility === "public" ? "Public profile" : profile.profile_visibility === "connections" ? "Connections only" : "Private profile"

  return (
    <div className="mx-auto grid max-w-4xl gap-4">
      <section className="learn-surface overflow-hidden">
        <div className="h-28 bg-gradient-to-r from-tab-studio/45 via-tab-ai/35 to-tab-social/45" aria-hidden="true" />
        <div className="-mt-12 flex flex-wrap items-end justify-between gap-4 px-5">
          <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-primary text-3xl font-semibold text-primary-foreground ring-4 ring-card">
            {profile.avatar_url ? <img src={profile.avatar_url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" /> : initial}
          </div>
          <span className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
            {profile.restricted ? <Lock className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {visibilityLabel}
          </span>
        </div>
        <div className="px-5 pb-5 pt-3">
          <h2 className="font-display text-2xl font-semibold text-foreground">{profile.name || profile.username}</h2>
          <p className="text-sm text-muted-foreground">@{profile.username}{profile.viewer === "connections" ? " · Connected" : ""}</p>
          {profile.bio ? <p className="mt-3 max-w-2xl text-sm leading-6 text-foreground/85">{profile.bio}</p> : null}
          {links.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {links.map((link) => (
                <a key={link.label} href={link.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold text-foreground hover:bg-accent hover:text-accent-foreground">
                  {link.label}
                  <ExternalLink className="h-3 w-3" />
                </a>
              ))}
            </div>
          ) : null}
          {!profile.restricted ? (
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Metric label="Level" value={String(profile.metrics.level ?? 1)} />
              <Metric label="XP" value={String(profile.metrics.xp ?? 0)} />
              <Metric label="Streak" value={`${profile.metrics.streak ?? 0} days`} />
              <Metric label="Reputation" value={String(profile.metrics.reputation ?? 0)} />
            </div>
          ) : null}
        </div>
      </section>

      {profile.restricted ? (
        <section className="learn-surface flex items-start gap-3 p-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Lock className="h-5 w-5" />
          </span>
          <div>
            <h3 className="font-semibold text-foreground">{profile.profile_visibility === "connections" ? "Only their connections can see more" : "This profile is private"}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {profile.profile_visibility === "connections"
                ? `Once ${profile.name || profile.username} accepts you as a connection, their bio, stats and shared notes appear here.`
                : `${profile.name || profile.username} keeps their learning to themselves. Their name and picture are all that is shared.`}
            </p>
          </div>
        </section>
      ) : (
        <section className="learn-surface p-5">
          <h3 className="font-display text-lg font-semibold text-foreground">Shared with you</h3>
          {profile.artifacts.length ? (
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              {profile.artifacts.map((node) => <NodeCard key={node.id} node={node} />)}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">Nothing shared yet.</p>
          )}
        </section>
      )}

      {setView ? (
        <button type="button" onClick={() => setView("social")} className="justify-self-start rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground hover:bg-accent hover:text-accent-foreground">
          Back to Social
        </button>
      ) : null}
    </div>
  )
}

function OwnProfileView({ setView, user }: { setView?: (view: View) => void; user: User }) {
  const username = user.username
  const { data, status } = useResource<{ item: PublicProfile }>(`/api/profile/public?username=${encodeURIComponent(username)}`)
  const profile = data?.item
  const achievements = useResource<{ items: Achievement[] }>("/api/achievements")
  const achievementItems = achievements.data?.items ?? []
  const profilePlan = useMemo(() => buildProfileActionPlan({ profile, achievements: achievementItems }), [achievementItems, profile])
  const profileSummaryChips = useMemo(() => buildProfileSummaryChips(profilePlan), [profilePlan])
  const primaryProfileChips = profileSummaryChips.filter((chip) => chip.priority === "primary")
  const secondaryProfileChips = profileSummaryChips.filter((chip) => chip.priority === "secondary")
  const unlockedAchievements = achievementItems.filter((achievement) => achievement.unlocked)
  const lockedAchievements = achievementItems.filter((achievement) => !achievement.unlocked)
  const profileAvatarUrl = profile?.avatar_url || user?.avatarUrl || ""
  const profileLinks = [
    { href: profile?.social_links?.intro || preferenceString(user?.preferences?.introUrl), label: "Intro" },
    { href: profile?.social_links?.website || preferenceString(user?.preferences?.websiteUrl), label: "Website" },
    { href: profile?.social_links?.facebook || preferenceString(user?.preferences?.facebookUrl), label: "Facebook" },
  ].filter((link) => link.href)

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <Panel className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-md bg-primary text-xl font-semibold text-primary-foreground">
            {profileAvatarUrl ? <img src={profileAvatarUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" /> : (profile?.name || user?.name || "L").slice(0, 1)}
          </div>
          <span className="rounded-md bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">{profilePlan.privacyLabel}</span>
        </div>
        <h2 className="mt-4 text-2xl font-semibold text-foreground">{profile?.name || user?.name || "Learner"}</h2>
        <p className="text-sm text-muted-foreground">@{profile?.username || username}</p>
        {profile?.bio ? <p className="mt-4 text-sm leading-6 text-muted-foreground">{profile.bio}</p> : null}
        {profileLinks.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {profileLinks.map((link) => (
              <a key={link.label} href={link.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground">
                {link.label}
                <ExternalLink className="h-3 w-3" />
              </a>
            ))}
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          {primaryProfileChips.map((chip) => (
            <ProfileSummaryChipButton key={chip.id} chip={chip} onClick={() => setView?.(profileTargetView(chip.target))} />
          ))}
        </div>
        <details className="mt-4 rounded-md border border-border bg-background">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-foreground">
            <span>Profile stats</span>
            <span className="rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">{secondaryProfileChips.length} more</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </summary>
          <div className="grid grid-cols-2 gap-2 border-t border-border p-2">
            {secondaryProfileChips.map((chip) => (
              <ProfileSummaryChipButton key={chip.id} chip={chip} onClick={() => setView?.(profileTargetView(chip.target))} relaxed />
            ))}
            <Metric label="Level" value={String(profile?.metrics.level ?? 1)} />
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
          {profile && profile.artifacts.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Nothing shared</p> : null}
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
      <span className="sr-only">{achievement.description}</span>
      <span className="mt-2 inline-flex rounded-md bg-secondary px-2 py-1 text-xs font-semibold text-secondary-foreground">{achievement.xp_reward} XP</span>
    </div>
  )
}

function ProfileSummaryChipButton({ chip, onClick, relaxed = false }: { chip: ProfileSummaryChip; onClick: () => void; relaxed?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-3 py-2 text-left transition hover:-translate-y-0.5 ${profileSummaryChipClasses(chip.tone)} ${relaxed ? "min-h-16" : ""}`}
      title={`${chip.label}: ${chip.value}`}
    >
      <span className="block text-[0.65rem] font-semibold uppercase tracking-[0.12em] opacity-75">{chip.label}</span>
      <span className="mt-1 block text-sm font-semibold">{chip.value}</span>
    </button>
  )
}

function profileSummaryChipClasses(tone: ProfileSummaryChip["tone"]) {
  if (tone === "good") return "border-success/30 bg-success/10 text-success hover:bg-success/15"
  if (tone === "watch") return "border-warning/35 bg-warning/10 text-warning hover:bg-warning/15"
  return "border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground"
}

function profileTargetView(target: ProfilePlanTarget): View {
  if (target === "settings") return "settings"
  if (target === "studio") return "studio"
  if (target === "reviews") return "reviews"
  return "social"
}

function preferenceString(value: unknown) {
  return typeof value === "string" ? value : ""
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
