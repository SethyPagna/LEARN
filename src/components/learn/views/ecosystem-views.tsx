"use client"

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react"
import { VaultNoteBlocks } from "../vault-note-blocks"
import {
  ArrowRight,
  ArrowLeft,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
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
  Plus,
  Radio,
  Search,
  Repeat2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Swords,
  Trash2,
  Users,
  X,
} from "lucide-react"
import communityStyles from "./social-community.module.css"
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
import { Buddy } from "../buddy"
import { viewIcons } from "../nav-icons"
import { EmptyState, Panel, StatusMessage } from "../ui"
import { VoiceInput } from "../voice-input"
import { buildReviewRatingActions, buildReviewSummaryChips, buildVaultBlockPalette, reviewAnswerText, reviewPromptText, reviewSourceLabel, summarizeReviewSession, type ReviewRating, type VaultBlockType } from "@/lib/learning-ecosystem"
import { buildProfileActionPlan, buildProfileSummaryChips, type ProfilePlanTarget, type ProfileSummaryChip } from "@/lib/profile-features"
import { createSocialDraft, parseStoredSocialDraftStore, socialDraftStorageKey, type SocialDraft, type SocialDraftStore, type SocialKind } from "@/lib/social-drafts"
import { buildSocialActionKit, buildSocialActionReadiness, buildSocialActionsPage, buildSocialInviteReadiness, buildSocialRecordCard, buildSocialRecordsPage, buildWorkspaceMembersPage, formatSocialAction, normalizeSocialInviteDraft, normalizeSocialInviteRole, socialInviteRoleOptions, type SocialActionLike, type SocialActionTarget, type SocialInviteRole, type SocialRecordFilter, type WorkspaceMemberLike } from "@/lib/social-features"

const NoteIcon = viewIcons.notes

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
  const [savingBlock, setSavingBlock] = useState(false)
  const [noteQuery, setNoteQuery] = useState("")
  const [blocksRevision, setBlocksRevision] = useState(0)

  const topNodes = data?.nodes.slice(0, 5) ?? []
  const paletteGroups = useMemo(() => buildVaultBlockPalette(blockType), [blockType])
  const targetNoteId = blockNoteId || notes[0]?.id || ""
  const targetNoteTitle = notes.find((note) => note.id === targetNoteId)?.title || "No note selected"

  async function saveVaultBlock() {
    if (savingBlock || !blockContent.trim()) return
    if (!targetNoteId) {
      setBlockStatus("Create a note first, then the palette can save blocks into it.")
      return
    }
    setBlockStatus("Saving block...")
    setSavingBlock(true)
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
    } finally { setSavingBlock(false) }
  }

  return (
    <section className="learning-page grid gap-3">
      <header className="workspace-header"><h2 className="text-lg font-semibold">Vault</h2><button onClick={() => targetNoteId ? onOpenNote(targetNoteId) : setView("notes")} className="editor-primary" aria-label="Open notes" title="Open notes"><BookOpen className="h-4 w-4" /></button></header>
      <div className="vault-workbench">
        <aside className="compact-list"><select aria-label="Vault note" className="editor-input md:hidden" disabled={savingBlock} value={targetNoteId} onChange={event => setBlockNoteId(event.target.value)}>{notes.map(note => <option key={note.id} value={note.id}>{note.title}</option>)}</select>
          <div className="hidden md:grid"><input aria-label="Find a Vault note" className="editor-input mb-2" placeholder="Find a note" value={noteQuery} onChange={event => setNoteQuery(event.target.value)} /><div className="max-h-[60dvh] overflow-y-auto">{notes.filter(note => note.title.toLowerCase().includes(noteQuery.trim().toLowerCase())).map(note => <button key={note.id} disabled={savingBlock} className="compact-row" aria-pressed={targetNoteId === note.id} onClick={() => setBlockNoteId(note.id)}><span data-project-kind="notes" className="studio-project-icon shrink-0 rounded-md p-1"><NoteIcon className="h-3.5 w-3.5" /></span><span className="truncate">{note.title}</span></button>)}</div></div>
        </aside>
        <Panel className="min-w-0 p-4"><h3 className="mb-3 font-semibold">{targetNoteTitle}</h3><VaultNoteBlocks note={notes.find(note => note.id === targetNoteId)} revision={blocksRevision} setView={setView} />
          <details className="workspace-disclosure mt-3"><summary>Add a block</summary><div className="grid gap-3 pt-3">
            <select aria-label="Block type" className="editor-input" disabled={savingBlock} value={blockType} onChange={event => setBlockType(event.target.value as VaultBlockType)}>{paletteGroups.map(group => <optgroup key={group.id} label={group.label}>{group.blocks.map(block => <option key={block} value={block}>{block.replaceAll("-", " ")}</option>)}</optgroup>)}</select>
            <textarea aria-label="Block content" className="editor-input min-h-24 py-2" disabled={savingBlock} placeholder="Write something…" value={blockContent} onChange={event => setBlockContent(event.target.value)} />
            <div className="flex items-center gap-2">{!savingBlock ? <VoiceInput label="Dictate block" prompt={`Vault ${blockType} block for ${targetNoteTitle}`} onTranscript={(text) => setBlockContent((current) => (current && !/\s$/.test(current) ? `${current} ${text}` : `${current}${text}`))} /> : null}<button className="editor-primary ml-auto" disabled={savingBlock || !targetNoteId || !blockContent.trim()} onClick={saveVaultBlock}>{savingBlock ? "Saving…" : "Add"}</button></div>
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
          <text x={point.x} y={point.y + 41} textAnchor="middle" className="fill-foreground text-xs">{node.title.length > 22 ? `${node.title.slice(0, 21)}…` : node.title}</text>
        </g> })}
      </svg> : <div className="grid min-h-72 place-content-center"><EmptyState bare title={nodes.length ? "No topics match this filter." : "No topics yet"} action={<button className="editor-primary" onClick={() => setView("notes")}>Open notes</button>} /></div>}
    </Panel><aside className="compact-list">
      {selectedNode ? <div className="grid gap-3"><div className="flex items-center gap-3"><p className="min-w-0 flex-1 text-sm font-medium">{selectedNode.title}</p><button className="editor-command" onClick={() => setView("reviews")} aria-label="Review" title="Review"><Repeat2 className="h-4 w-4 text-primary" /></button></div><div className="flex items-center gap-3"><meter className="h-2 w-full accent-primary" min={0} max={1} value={selectedNode.mastery} aria-label="Topic mastery" /><span className="text-xs tabular-nums text-muted-foreground">{Math.round(selectedNode.mastery * 100)}%</span></div><span className="text-xs capitalize text-muted-foreground">{selectedNode.visibility}</span></div> : null}
      <details className="mt-3 border-t border-border pt-3"><summary className="cursor-pointer text-xs text-muted-foreground">Topics · {filteredNodes.length}</summary><div className="mt-2 max-h-64 overflow-auto">{filteredNodes.map(node => <button key={node.id} onClick={() => setSelectedId(node.id)} className="compact-row" aria-pressed={selectedNode?.id === node.id}><span className="truncate flex-1">{node.title}</span><span className="text-xs text-muted-foreground">{Math.round(node.mastery * 100)}%</span></button>)}</div></details>
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
  const [selectedId, setSelectedId] = useState("")
  const [busyRating, setBusyRating] = useState<ReviewRating | null>(null)
  const [reviewMessage, setReviewMessage] = useState("")
  const [revealedIds, setRevealedIds] = useState<string[]>([])
  const [gradedIds, setGradedIds] = useState<string[]>([])
  const items = useMemo(() => (data?.items ?? []).filter(item => !gradedIds.includes(item.id)), [data?.items, gradedIds])
  const selectedIndex = Math.max(0, items.findIndex(item => item.id === selectedId))
  const selected = items[selectedIndex]
  const isRevealed = Boolean(selected && revealedIds.includes(selected.id))
  const summary = useMemo(() => summarizeReviewSession({ items, remainingDueCount: data?.remainingDueCount ?? 0 }, revealedIds), [items, data?.remainingDueCount, revealedIds])

  async function record(rating: ReviewRating) {
    if (!selected || !isRevealed || busyRating) return
    setBusyRating(rating)
    setReviewMessage("")
    try {
      await api("/api/reviews", { method: "POST", body: JSON.stringify({ id: selected.id, rating }) })
      setGradedIds(current => [...current, selected.id])
      setRevealedIds(current => current.filter(id => id !== selected.id))
      const refreshed = await refresh()
      if (refreshed) setGradedIds([])
      setReviewMessage(refreshed ? "Saved" : "")
    } catch (error) {
      setReviewMessage(error instanceof Error ? error.message : "Unable to record this review.")
    } finally { setBusyRating(null) }
  }

  return <section className="learning-page review-workspace mx-auto grid w-full max-w-3xl gap-4">
    <header className="workspace-header">
      <h2 className="text-lg font-semibold">Reviews</h2>
      <div className="flex items-center gap-1">
        <button className="editor-command" aria-label="Previous review" title="Previous review" disabled={Boolean(busyRating) || selectedIndex === 0} onClick={() => setSelectedId(items[selectedIndex - 1].id)}><ChevronLeft className="h-4 w-4" /></button>
        <span className="min-w-12 text-center text-xs tabular-nums text-muted-foreground" aria-live="polite">{selected ? selectedIndex + 1 : 0} / {items.length}</span>
        <button className="editor-command" aria-label="Next review" title="Next review" disabled={Boolean(busyRating) || selectedIndex >= items.length - 1} onClick={() => setSelectedId(items[selectedIndex + 1].id)}><ChevronRight className="h-4 w-4" /></button>
      </div>
    </header>
    {selected ? <article className="review-focus-card" aria-label="Current review">
      <header className="flex items-center justify-between gap-3 text-xs text-muted-foreground"><span className="flex min-w-0 items-center gap-2"><BookOpen className="h-4 w-4 shrink-0 text-primary" /><span className="truncate">{selected.title}</span></span><span className="shrink-0">{reviewSourceLabel(selected)}</span></header>
      <div className="review-question"><Repeat2 aria-hidden="true" className="mb-5 h-7 w-7 text-primary/60" /><h3 className="text-xl font-medium leading-relaxed sm:text-2xl">{reviewPromptText(selected)}</h3></div>
      {isRevealed ? <div className="review-answer" aria-label="Answer"><p className="whitespace-pre-wrap text-sm leading-7">{reviewAnswerText(selected)}</p></div> : null}
      <footer className="mt-5 flex flex-wrap items-center justify-center gap-2">
        {isRevealed ? buildReviewRatingActions({ busyRating, isBusy: Boolean(busyRating), isRevealed }).map(action => <button key={action.rating} disabled={action.disabled} onClick={() => void record(action.rating)} title={action.helper} className={`review-rating ${reviewRatingClassName(action.rating)}`}>{action.busy ? "Saving…" : action.label}</button>) : <button className="editor-primary" onClick={() => { setRevealedIds(current => [...current, selected.id]); setReviewMessage("") }}><Eye className="h-4 w-4" />Reveal answer</button>}
      </footer>
    </article> : data ? <div className="grid justify-items-center gap-4 py-10"><Buddy mood={data.isRestDay ? "sleepy" : "excited"} size={72} label="" /><p className="font-medium">{data.isRestDay ? "Rest day" : "All caught up"}</p><button className="editor-command" onClick={() => setView("studio")}><BookOpen className="h-4 w-4" />Studio</button></div> : null}
    {reviewMessage || (status && status !== "Ready") ? <p role="status" className="text-center text-xs text-muted-foreground">{reviewMessage || status}</p> : null}
    {gradedIds.length && status !== "Loading" ? <button className="editor-command justify-self-center" disabled={Boolean(busyRating)} onClick={async () => { if (await refresh()) setGradedIds([]) }}><Repeat2 className="h-4 w-4" />Retry refresh</button> : null}
    {items.length ? <details className="workspace-disclosure"><summary>Queue <span className="text-muted-foreground">{summary.totalDue}</span></summary>
      <div className="mt-3 grid grid-cols-3 gap-2 border-b border-border pb-3">{buildReviewSummaryChips(summary).filter(chip => chip.priority === "primary").map(chip => <CompactMetric key={chip.id} label={chip.label} value={chip.value} />)}</div>
      <div className="mt-2 max-h-64 overflow-auto">{items.map((item, index) => <button key={item.id} className="compact-row" aria-pressed={selected?.id === item.id} disabled={Boolean(busyRating)} onClick={() => setSelectedId(item.id)}><span className="w-5 text-xs tabular-nums text-muted-foreground">{index + 1}</span><span className="min-w-0 flex-1 truncate">{item.title}</span>{revealedIds.includes(item.id) ? <Eye className="h-4 w-4 text-primary" /> : null}</button>)}</div>
      {selected ? <dl className="mt-3 grid grid-cols-3 gap-3 border-t border-border pt-3 text-xs text-muted-foreground"><div><dt>Recall</dt><dd className="mt-1 text-base text-foreground">{Math.round(selected.retrievability * 100)}%</dd></div><div><dt>Difficulty</dt><dd className="mt-1 text-base text-foreground">{Math.round(selected.difficulty * 100)}%</dd></div><div><dt>Stability</dt><dd className="mt-1 text-base text-foreground">{Math.round(selected.stability * 10) / 10}</dd></div></dl> : null}
    </details> : null}
  </section>
}

function reviewRatingClassName(rating: ReviewRating) {
  if (rating === "again") return "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20"
  if (rating === "hard") return "border-warning/30 bg-warning/10 text-foreground hover:bg-warning/20"
  if (rating === "easy") return "border-success/30 bg-success/10 text-success hover:bg-success/20"
  return "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20"
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
    <div className="flex gap-1 overflow-x-auto pb-1">{["all", ...topics].map(topic => <button key={topic} aria-pressed={activeFilter === topic} onClick={() => setFilter(topic)} className="calendar-filter shrink-0">{topic === "all" ? "For you" : topic}</button>)}</div>
    {message ? <p role="alert" className="text-sm text-destructive">{message}</p> : null}
    {status && status !== "Ready" && status !== "Loading" ? <p role="alert" className="text-sm text-destructive">{status}</p> : null}
    {lessons.filter(lesson => activeFilter === "all" || (lesson.topic_tags || lesson.topicTags || []).includes(activeFilter)).map((lesson, index) => <details key={lesson.id} className="discovery-card discovery-lesson" data-tone={index % 3}>
      <summary><span className="discovery-symbol"><BookOpen aria-hidden="true" className="h-6 w-6" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold sm:text-base">{lesson.title}</span><span className="mt-1 block text-xs text-muted-foreground">{Math.ceil((lesson.duration_seconds || lesson.durationSeconds || 90) / 60)} min</span></span>{answered[lesson.id] ? <CheckCircle2 aria-label="Answered" className="h-4 w-4 text-success" /> : null}<ChevronDown aria-hidden="true" className="discovery-chevron h-4 w-4 shrink-0 text-muted-foreground" /></summary>
      <p className="mt-5 text-sm leading-7 text-muted-foreground">{lesson.summary}</p>
      <details className="mt-4"><summary className="cursor-pointer text-sm font-medium">Quick question</summary><div className="grid gap-2 pt-3"><p className="text-sm">{lesson.question}</p><div className="grid gap-2 sm:grid-cols-2">{(lesson.choices || []).map(choice => <button key={choice.id} disabled={Boolean(busy || answered[lesson.id])} onClick={() => void answer(lesson, choice.id)} className={`rounded-lg border p-3 text-left text-sm disabled:cursor-default ${answered[lesson.id] === choice.id ? choice.id === lesson.correct_choice_id ? "border-success bg-success/10" : "border-destructive bg-destructive/10" : "border-border bg-card hover:bg-accent"}`}>{choice.text}</button>)}</div>{answered[lesson.id] ? <p role="status" className="text-sm text-muted-foreground">{answered[lesson.id] === lesson.correct_choice_id ? "Correct. " : "Not quite. "}{lesson.explanation}</p> : null}</div></details>
    </details>)}
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
  const [detailOpen, setDetailOpen] = useState(false)
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
  const recordPending = useRef(false)
  const invitePending = useRef(false)
  const detailHeading = useRef<HTMLHeadingElement>(null)
  const browseHeading = useRef<HTMLHeadingElement>(null)
  const items = useMemo(() => data?.items ?? [], [data?.items])
  const memberItems = useMemo(() => members.data?.items ?? [], [members.data?.items])
  const recentActionItems = useMemo(() => recentActions.data?.items ?? [], [recentActions.data?.items])
  const selected = useMemo(() => items.find((item) => item.id === selectedId), [items, selectedId])
  const Icon = kind === "spaces" ? Users : kind === "rooms" ? Radio : Swords
  const title = kind === "spaces" ? "Groups" : kind === "rooms" ? "Rooms" : "Battles"
  const noun = kind === "spaces" ? "group" : kind === "rooms" ? "room" : "battle"
  const recordPage = useMemo(() => buildSocialRecordsPage(items, { query, filter: recordFilter, limit: recordLimit }), [items, query, recordFilter, recordLimit])
  const filteredItems = recordPage.items as Array<LearningSpace | StudyRoom | StudyBattle>
  const recordCards = useMemo(() => filteredItems.map((item) => ({
    card: buildSocialRecordCard(kind, item),
    item,
  })), [filteredItems, kind])
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
  const inviteReadiness = useMemo(() => buildSocialInviteReadiness({
    email: inviteEmail,
    kind,
    linkReady: Boolean(inviteLink),
    loading: inviteLoading,
    saved: Boolean(draft.id),
  }), [draft.id, inviteEmail, inviteLink, inviteLoading, kind])
  const detailTabs: Array<{ id: SocialDetailTab; label: string; icon: ComponentType<{ className?: string }> }> = [
    { id: "actions", label: "Overview", icon: Play },
    { id: "invite", label: "Invite", icon: Mail },
    { id: "people", label: "People", icon: Users },
    { id: "activity", label: "Activity", icon: Repeat2 },
    { id: "safety", label: "Manage", icon: ShieldCheck },
  ]
  const recordStatus = recordAction === "save"
    ? "Saving"
    : recordAction === "toggle"
      ? "Updating"
      : recordAction === "delete"
        ? "Deleting"
        : socialDraftStatus(kind, draft)
  const recordBusy = recordAction !== null
  const draftIsValid = Boolean((kind === "battles" ? draft.title : draft.name).trim()) && (kind !== "rooms" || [draft.pomodoroMinutes, draft.breakMinutes].every(minutes => Number.isInteger(minutes) && minutes >= 1 && minutes <= 180))
  const loadFailed = status !== "Loading" && status !== "Ready"
  const hasUnsavedDraft = draft.id
    ? Boolean(selected && socialDraftFingerprint(draft) !== socialDraftFingerprint(draftFromSocialItem(kind, selected)))
    : hasMeaningfulSocialDraft(kind, draft)

  useEffect(() => {
    if (detailOpen) detailHeading.current?.focus()
  }, [detailOpen])

  useEffect(() => {
    const stored = readSocialDraftStore(kind)
    if (stored) {
      restoredDraftId.current = stored.selectedId || "new"
      setSelectedId(stored.selectedId)
      setDraft(stored.draft)
      setQuery(stored.query)
      setMessage("")
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
    if (!draftHydrated.current || !data || editing || recordBusy) return
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
  }, [data, draft, editing, items, kind, recordBusy, selectedId])

  useEffect(() => {
    if (!selected) return
    if (restoredDraftId.current === selected.id) {
      restoredDraftId.current = null
      return
    }
    setDraft(draftFromSocialItem(kind, selected))
  }, [kind, selected?.id])

  function startNew() {
    if (recordPending.current) return
    setDetailOpen(true)
    setDetailTab("actions")
    setEditing(true)
    setSelectedId("")
    setDraft(createSocialDraft(kind))
    setDeleteConfirmId(null)
    setMessage("")
  }

  function clearRecordFilters() {
    setQuery("")
    setRecordFilter("all")
    setMessage("")
  }

  function selectSocialRecord(item: LearningSpace | StudyRoom | StudyBattle) {
    if (recordPending.current) return
    setDetailOpen(true)
    setEditing(false)
    setSelectedId(item.id)
    setDraft(draftFromSocialItem(kind, item))
    setDeleteConfirmId(null)
    setDetailTab("actions")
    setInviteLink("")
    setMessage("")
  }

  function closeDetail() {
    if (recordPending.current || invitePending.current) return
    setEditing(false)
    setDetailOpen(false)
    setMessage("")
    requestAnimationFrame(() => browseHeading.current?.focus())
  }

  function cancelEditing() {
    if (recordPending.current) return
    setEditing(false)
    if (selected) setDraft(draftFromSocialItem(kind, selected))
    else closeDetail()
    setMessage("")
  }

  async function saveDraft() {
    if (recordPending.current || !draftIsValid) return
    recordPending.current = true
    setRecordAction("save")
    setMessage(draft.id ? "Saving changes..." : `Creating ${noun}...`)
    try {
      const body = payloadFromSocialDraft(kind, draft)
      const response = await api<{ item: LearningSpace | StudyRoom | StudyBattle }>(endpoint, {
        method: draft.id ? "PUT" : "POST",
        body: JSON.stringify(body),
      })
      setSelectedId(response.item.id)
      setDraft(draftFromSocialItem(kind, response.item))
      setDeleteConfirmId(null)
      setMessage(`${socialTitle(response.item)} saved.`)
      setEditing(false)
      await refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `Unable to save this ${noun}.`)
    } finally {
      recordPending.current = false
      setRecordAction(null)
    }
  }

  async function updateRecordStatus(value: string) {
    if (recordPending.current) return
    const nextDraft = kind === "spaces" ? { ...draft, visibility: value } : { ...draft, status: value }
    setDraft(nextDraft)
    setDeleteConfirmId(null)
    if (!nextDraft.id) {
      setMessage("Draft state updated. Save when ready.")
      return
    }
    recordPending.current = true
    setRecordAction("toggle")
    setMessage("Updating state...")
    try {
      await api(endpoint, { method: "PUT", body: JSON.stringify(payloadFromSocialDraft(kind, nextDraft)) })
      setMessage("Updated.")
      await refresh()
    } catch (error) {
      setDraft(draft)
      setMessage(error instanceof Error ? error.message : `Unable to update this ${noun}.`)
    } finally {
      recordPending.current = false
      setRecordAction(null)
    }
  }

  async function deleteDraft() {
    if (recordPending.current) return
    if (!draft.id) {
      startNew()
      return
    }
    if (deleteConfirmId !== draft.id) {
      setDeleteConfirmId(draft.id)
      setMessage(`Select Delete again to remove ${socialTitle(draft)}.`)
      return
    }
    recordPending.current = true
    setRecordAction("delete")
    setMessage(`Deleting ${socialTitle(draft)}...`)
    try {
      await api(`${endpoint}?id=${encodeURIComponent(draft.id)}`, { method: "DELETE" })
      setMessage(`${socialTitle(draft)} deleted.`)
      setDeleteConfirmId(null)
      setSelectedId("")
      setDraft(createSocialDraft(kind))
      setDetailOpen(false)
      await refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `Unable to delete this ${noun}.`)
    } finally {
      recordPending.current = false
      setRecordAction(null)
    }
  }

  async function copyInvite() {
    const copied = await navigator.clipboard?.writeText(actionKit.inviteText).then(() => true, () => false)
    setMessage(copied ? "Invite text copied." : "Clipboard unavailable. Create an invite link to copy manually.")
  }

  async function createSecureInvite() {
    if (invitePending.current) return
    if (!inviteReadiness.enabled) {
      setMessage(inviteReadiness.message)
      return
    }
    const validation = normalizeSocialInviteDraft({ email: inviteEmail, role: inviteRole })
    if (!validation.ok) {
      setMessage(validation.error)
      return
    }
    invitePending.current = true
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
      invitePending.current = false
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

  return <section className={communityStyles.community} data-kind={kind} aria-label={title}>
    {!detailOpen ? <>
      <header className={communityStyles.toolbar}>
        <h2 ref={browseHeading} tabIndex={-1}>{title}<span>{items.length}</span></h2>
        <label className={communityStyles.search}><Search aria-hidden="true" /><input aria-label={`Search ${title}`} value={query} onChange={event => setQuery(event.target.value)} placeholder={`Find a ${noun}`} />{query ? <button type="button" aria-label="Clear search" onClick={() => setQuery("")}><X /></button> : null}</label>
        <button type="button" onClick={startNew} className="editor-primary" aria-label={`Add ${noun}`}>New</button>
      </header>
      <div className={communityStyles.filters} role="group" aria-label={`${title} filters`}>{filterOptions.map(option => <button key={option} aria-pressed={recordFilter === option} onClick={() => setRecordFilter(option)}>{option === "all" ? "All" : socialFilterLabel(option)}</button>)}</div>
      {hasUnsavedDraft ? <button className={`editor-command ${communityStyles.resume}`} onClick={() => { setEditing(true); setDetailOpen(true) }}><Edit3 className="h-4 w-4" />Resume draft</button> : null}
      {loadFailed ? <div className={communityStyles.error} role="status"><p>{status}</p><button className="editor-command" onClick={() => void refresh()}><Repeat2 className="h-4 w-4" />Retry</button></div> : null}
      <div className={communityStyles.cards}>
        {recordCards.map(({ card, item }, index) => <button key={item.id} onClick={() => selectSocialRecord(item)} className={communityStyles.card} data-tone={index % 4} aria-label={`Open ${card.title}`}>
          <div className={communityStyles.cardArt} aria-hidden="true"><span className={communityStyles.orbit} /><span className={communityStyles.symbol}><Icon /></span>{"pomodoro_minutes" in item ? <span className={communityStyles.duration}>{item.pomodoro_minutes}<small>min</small></span> : <span className={communityStyles.artLines}><i /><i /><i /></span>}</div>
          <div className={communityStyles.cardBody}><span className={communityStyles.cardStatus} data-active={card.status === "active" || card.status === "open"}>{card.status}</span><h3>{card.title}</h3><p>{kind === "spaces" && "description" in item ? item.description : kind === "battles" && "topic" in item ? item.topic : "mode" in item ? item.mode : ""}</p><div className={communityStyles.cardFooter}><span>{card.meta.filter(meta => meta.toLowerCase() !== card.status.toLowerCase()).slice(0, 2).join(" · ")}</span><ArrowRight aria-hidden="true" /></div></div>
        </button>)}
      </div>
      {!filteredItems.length && !loadFailed ? <div className={communityStyles.empty}><span className={communityStyles.emptyIcon}><Icon /></span><h3>{status === "Loading" ? "Loading…" : items.length ? "No matches" : `Your first ${noun}`}</h3>{status !== "Loading" ? <button className="editor-command" onClick={items.length ? clearRecordFilters : startNew}>{items.length ? "Clear filters" : `Create ${noun}`}</button> : null}</div> : null}
      {recordPage.hiddenCount ? <button className={`editor-command ${communityStyles.more}`} onClick={() => setRecordLimit(value => value + 12)}>Show more <ChevronDown className="h-4 w-4" /></button> : null}
    </> : <>
      <div className={communityStyles.detailToolbar}><button className="editor-command" disabled={recordBusy || inviteLoading} onClick={closeDetail} aria-label={`Back to ${title.toLowerCase()}`}><ArrowLeft className="h-4 w-4" />{title}</button>{!editing ? <button className="editor-command" disabled={recordBusy || inviteLoading} aria-label={`Edit ${noun}`} title={`Edit ${noun}`} onClick={() => setEditing(true)}><Edit3 className="h-4 w-4" /></button> : null}</div>
      <div className={communityStyles.detailCover}><span className={communityStyles.coverIcon}><Icon aria-hidden="true" /></span><div><span className={communityStyles.eyebrow}>{draft.id ? recordStatus : `New ${noun}`}</span><h3 ref={detailHeading} tabIndex={-1}>{socialTitle(draft)}</h3></div></div>
      {message ? <p role="status" className={communityStyles.message}>{message}</p> : null}
      {editing ? <form className={communityStyles.form} onSubmit={event => { event.preventDefault(); void saveDraft() }}>
        <fieldset disabled={recordBusy} className={communityStyles.fields}>
          {kind === "battles" ? <>
            <SocialField label="Title" value={draft.title} required onChange={value => setDraft({ ...draft, title: value })} />
            <SocialField label="Topic" value={draft.topic} onChange={value => setDraft({ ...draft, topic: value })} />
            <div className={communityStyles.fieldPair}><SocialSelect label="Mode" value={draft.mode} options={["solo", "team"]} onChange={value => setDraft({ ...draft, mode: value })} /><SocialSelect label="Status" value={draft.status} options={["waiting", "active", "completed"]} onChange={value => setDraft({ ...draft, status: value })} /></div>
          </> : kind === "rooms" ? <>
            <SocialField label="Room name" value={draft.name} required onChange={value => setDraft({ ...draft, name: value })} />
            <div className={communityStyles.fieldPair}><SocialSelect label="Mode" value={draft.mode} options={["focus", "discussion", "stage"]} onChange={value => setDraft({ ...draft, mode: value })} /><SocialSelect label="Status" value={draft.status} options={["open", "active", "closed"]} onChange={value => setDraft({ ...draft, status: value })} /></div>
            <div className={communityStyles.fieldPair}><SocialField label="Focus minutes" value={String(draft.pomodoroMinutes)} numeric onChange={value => setDraft({ ...draft, pomodoroMinutes: Number(value) })} /><SocialField label="Break minutes" value={String(draft.breakMinutes)} numeric onChange={value => setDraft({ ...draft, breakMinutes: Number(value) })} /></div>
          </> : <>
            <SocialField label="Group name" value={draft.name} required onChange={value => setDraft({ ...draft, name: value })} />
            <SocialField label="Description" value={draft.description} onChange={value => setDraft({ ...draft, description: value })} multiline />
            <div className={communityStyles.fieldPair}><SocialField label="Topics" value={draft.topicTags} onChange={value => setDraft({ ...draft, topicTags: value })} /><SocialSelect label="Visibility" value={draft.visibility} options={["private", "connections", "public"]} onChange={value => setDraft({ ...draft, visibility: value })} /></div>
          </>}
          <footer className={communityStyles.formFooter}><button type="button" className="editor-command" onClick={cancelEditing}>Cancel</button><button type="submit" className="editor-primary" disabled={!draftIsValid}>{recordBusy ? "Saving…" : draft.id ? "Save" : "Create"}</button></footer>
        </fieldset>
      </form> : <>
        <nav className={communityStyles.detailTabs} aria-label={`${title} details`}>{detailTabs.map(tab => <button key={tab.id} aria-current={detailTab === tab.id ? "page" : undefined} onClick={() => setDetailTab(tab.id)}><tab.icon aria-hidden="true" /><span>{tab.label}</span></button>)}</nav>
        {detailTab === "actions" ? <div className={communityStyles.overview}>
          <div className={communityStyles.about}>
            {kind === "rooms" ? <div className={communityStyles.sessionRhythm} aria-label={`${draft.pomodoroMinutes} minutes focus and ${draft.breakMinutes} minutes break`}><div><strong>{draft.pomodoroMinutes}<small>min</small></strong><span>Focus</span></div><span className={communityStyles.rhythmDivider}><Repeat2 aria-hidden="true" /></span><div><strong>{draft.breakMinutes}<small>min</small></strong><span>Break</span></div></div> : <><h4>{kind === "spaces" ? "About" : "Topic"}</h4><p>{kind === "spaces" ? draft.description || "No description yet." : draft.topic || "Open topic"}</p></>}
            <div className={communityStyles.tags}>{(kind === "spaces" ? draft.topicTags.split(",").map(tag => tag.trim()).filter(Boolean) : [draft.mode]).map((tag, index) => <span key={`${tag}-${index}`}>{tag}</span>)}{kind === "spaces" && selected && "member_count" in selected && selected.member_count !== undefined ? <span><Users aria-hidden="true" />{selected.member_count}</span> : null}</div>
          </div>
          <div className={communityStyles.actions}>{(draft.id ? readyActions : []).map(action => { const ActionIcon = socialActionIcon(action.id); const label = action.id === "invite" ? "Invite" : action.id === "chat" ? "Chat" : action.id === "calendar" ? "Schedule" : action.id === "practice" ? "Practice" : "Files"; return <button key={action.id} disabled={!action.enabled || !setView && action.id !== "invite"} title={action.detail} onClick={() => action.id === "invite" ? setDetailTab("invite") : void runSocialAction(action.id)}><span><ActionIcon aria-hidden="true" /></span>{label}<ArrowRight aria-hidden="true" /></button> })}{!draft.id ? <button className="editor-primary" onClick={() => setEditing(true)}>Set up {noun}</button> : null}</div>
        </div> : null}
        {detailTab === "invite" ? <div className={communityStyles.subpanel}><div className={communityStyles.panelHeading}><Mail aria-hidden="true" /><h4>Invite to LEARN</h4></div><p className={communityStyles.hint}>Invite someone to your workspace.</p><form onSubmit={event => { event.preventDefault(); void createSecureInvite() }}><fieldset disabled={inviteLoading} className={communityStyles.fields}><label className={communityStyles.field}><span>Email</span><input type="email" required aria-label="Invite email" placeholder="name@example.com" value={inviteEmail} onChange={event => setInviteEmail(event.target.value)} /></label><SocialSelect label="Role" value={inviteRole} options={socialInviteRoleOptions.map(option => option.value)} onChange={value => setInviteRole(normalizeSocialInviteRole(value))} /><div className={communityStyles.formFooter}><button type="button" className="editor-command" onClick={copyInvite} aria-label="Copy invitation" title="Copy invitation"><Copy className="h-4 w-4" /></button><button type="submit" className="editor-primary" disabled={!inviteReadiness.enabled} title={inviteReadiness.message}>{inviteLoading ? "Creating…" : "Create link"}</button></div></fieldset></form>{inviteLink ? <a href={inviteLink} className={communityStyles.inviteLink}>{inviteLink}</a> : null}</div> : null}
        {detailTab === "people" ? <div className={communityStyles.subpanel}><div className={communityStyles.panelHeading}><Users aria-hidden="true" /><h4>Workspace people</h4><span>{memberItems.length}</span></div><label className={communityStyles.search}><Search aria-hidden="true" /><input aria-label="Search people" placeholder="Find a person" value={memberQuery} onChange={event => setMemberQuery(event.target.value)} /></label><div className={communityStyles.people}>{filteredMembers.map(member => <div key={member.id || member.email} className={communityStyles.person}><span>{(member.name || member.email || "?").slice(0, 1)}</span><div><strong>{member.name || member.email}</strong><small>{member.role || "learner"}</small></div></div>)}</div>{!filteredMembers.length ? <p className={communityStyles.hint}>{members.status === "Loading" ? "Loading…" : "No people found."}</p> : null}{members.status !== "Ready" && members.status !== "Loading" ? <button className="editor-command" onClick={() => void members.refresh()}>Retry people</button> : null}{memberPage.hiddenCount ? <button className="editor-command" onClick={() => setMemberLimit(value => value + 10)}>Show more</button> : null}</div> : null}
        {detailTab === "activity" ? <div className={communityStyles.subpanel}><div className={communityStyles.panelHeading}><Repeat2 aria-hidden="true" /><h4>Workspace activity</h4></div>{activityPage.items.map((action, index) => { const formatted = formatSocialAction(action); return <div key={action.id || index} className={communityStyles.activity}><span><MessageSquare aria-hidden="true" /></span><div><strong>{formatted.label}</strong><p>{formatted.detail}</p></div></div> })}{!activityPage.items.length ? <p className={communityStyles.hint}>{recentActions.status === "Loading" ? "Loading…" : "No activity yet."}</p> : null}{recentActions.status !== "Ready" && recentActions.status !== "Loading" ? <button className="editor-command" onClick={() => void recentActions.refresh()}>Retry activity</button> : null}{activityPage.hiddenCount ? <button className="editor-command" onClick={() => setActivityLimit(value => value + 4)}>Show more</button> : null}</div> : null}
        {detailTab === "safety" ? <div className={communityStyles.subpanel}><div className={communityStyles.panelHeading}><ShieldCheck aria-hidden="true" /><h4>Manage {noun}</h4></div><div className={communityStyles.manageRow}><div><strong>{kind === "spaces" ? "Visibility" : "Status"}</strong><span>{socialDraftStatus(kind, draft)}</span></div><select className={communityStyles.statusSelect} aria-label={kind === "spaces" ? "Group visibility" : "Record status"} disabled={recordBusy} value={socialDraftStatus(kind, draft)} onChange={event => void updateRecordStatus(event.target.value)}>{(kind === "spaces" ? ["private", "connections", "public"] : kind === "rooms" ? ["open", "active", "closed"] : ["waiting", "active", "completed"]).map(value => <option key={value} value={value}>{value}</option>)}</select></div><div className={communityStyles.manageRow}><div><strong>Details</strong><span>Name, {kind === "spaces" ? "topics and description" : "mode and settings"}</span></div><button className="editor-command" disabled={recordBusy} onClick={() => setEditing(true)}>Edit</button></div><div className={communityStyles.manageRow}><div><strong>Delete {noun}</strong><span>This cannot be undone.</span></div><button className="editor-command text-destructive" disabled={recordBusy} onClick={() => void deleteDraft()} aria-label={deleteConfirmId === draft.id && draft.id ? `Confirm delete ${noun}` : `Delete ${noun}`}><Trash2 className="h-4 w-4" />{deleteConfirmId === draft.id && draft.id ? "Confirm" : null}</button></div></div> : null}
      </>}
    </>}
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

function SocialField({ label, value, onChange, multiline, numeric, required }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean; numeric?: boolean; required?: boolean }) {
  return (
    <label className={communityStyles.field}>
      <span>{label}</span>
      {multiline ? (
        <textarea rows={3} value={value} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input value={value} type={numeric ? "number" : "text"} min={numeric ? 1 : undefined} max={numeric ? 180 : undefined} step={numeric ? 1 : undefined} required={required || numeric} onChange={(event) => onChange(event.target.value)} />
      )}
    </label>
  )
}

function SocialSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className={communityStyles.field}>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
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
  const [section, setSection] = useState<"shared" | "achievements">("shared")
  const username = user.username
  const { data, status } = useResource<{ item: PublicProfile }>(`/api/profile/public?username=${encodeURIComponent(username)}`)
  const profile = data?.item
  const achievements = useResource<{ items: Achievement[] }>("/api/achievements")
  const achievementItems = achievements.data?.items ?? []
  const profilePlan = useMemo(() => buildProfileActionPlan({ profile, achievements: achievementItems }), [achievementItems, profile])
  const profileSummaryChips = useMemo(() => buildProfileSummaryChips(profilePlan), [profilePlan])
  const unlockedAchievements = achievementItems.filter((achievement) => achievement.unlocked)
  const lockedAchievements = achievementItems.filter((achievement) => !achievement.unlocked)
  const sharedArtifacts = (profile?.artifacts ?? []).filter(artifact => artifact.visibility !== "private")
  const profileAvatarUrl = profile?.avatar_url || user?.avatarUrl || ""
  const profileLinks = [
    { href: profile?.social_links?.intro || preferenceString(user?.preferences?.introUrl), label: "Intro" },
    { href: profile?.social_links?.website || preferenceString(user?.preferences?.websiteUrl), label: "Website" },
    { href: profile?.social_links?.facebook || preferenceString(user?.preferences?.facebookUrl), label: "Facebook" },
  ].filter((link) => link.href)

  return (
    <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-[280px_1fr]">
      <Panel className="self-start p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-md bg-primary text-xl font-semibold text-primary-foreground">
            {profileAvatarUrl ? <img src={profileAvatarUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" /> : (profile?.name || user?.name || "L").slice(0, 1)}
          </div>
          <button className="editor-command" aria-label="Edit profile" title="Edit profile" onClick={() => setView?.("settings")}><Edit3 className="h-4 w-4" /></button>
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
        <div className="mt-4 grid grid-cols-3 gap-2 border-y border-border py-3">
          <CompactMetric label="Level" value={String(profile?.metrics.level ?? 1)} />
          <CompactMetric label="XP" value={String(profile?.metrics.xp ?? 0)} />
          <CompactMetric label="Streak" value={String(profile?.metrics.streak ?? 0)} />
        </div>
        <details className="mt-4 rounded-md border border-border bg-background">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-foreground">
            <span>More stats</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </summary>
          <div className="grid grid-cols-2 gap-2 border-t border-border p-2">
            {profileSummaryChips.map((chip) => (
              <ProfileSummaryChipButton key={chip.id} chip={chip} onClick={() => setView?.(profileTargetView(chip.target))} relaxed />
            ))}
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
      <div className="grid content-start gap-3">
        <nav className="page-sections" aria-label="Profile sections">
          <button aria-current={section === "shared" ? "page" : undefined} onClick={() => setSection("shared")}><FolderOpen className="h-4 w-4" />Shared</button>
          <button aria-current={section === "achievements" ? "page" : undefined} onClick={() => setSection("achievements")}><CheckCircle2 className="h-4 w-4" />Achievements<span className="text-xs text-muted-foreground">{unlockedAchievements.length}</span></button>
        </nav>
        {status !== "Ready" ? <p role="status" className="text-xs text-muted-foreground">{status}</p> : null}
        {section === "shared" ? <Panel className="p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-foreground">{profilePlan.privacyLabel}</h3>
            <button onClick={() => setView?.("settings")} className="editor-command" aria-label="Manage sharing" title="Manage sharing">
              <ShieldCheck className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {sharedArtifacts.map((node) => <NodeCard key={node.id} node={node} />)}
          </div>
          {profile && sharedArtifacts.length === 0 ? <div className="grid justify-items-center gap-3 py-8"><FolderOpen className="h-8 w-8 text-primary/50" /><button className="editor-command" onClick={() => setView?.("studio")}><Plus className="h-4 w-4" />Create</button></div> : null}
        </Panel> : null}
        {section === "achievements" ? <Panel className="p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold text-foreground">Achievements</h3>
            <span className="rounded-md bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">{unlockedAchievements.length}/{achievementItems.length}</span>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            {unlockedAchievements.map((achievement) => <AchievementTile key={achievement.id} achievement={achievement} />)}
          </div>
          {!unlockedAchievements.length ? <p className="py-4 text-sm text-muted-foreground">No badges yet</p> : null}
          {lockedAchievements.length ? <details className="workspace-disclosure mt-3"><summary>To unlock <span className="text-muted-foreground">{lockedAchievements.length}</span></summary><div className="mt-3 grid gap-2 sm:grid-cols-2">{lockedAchievements.map(achievement => <AchievementTile key={achievement.id} achievement={achievement} />)}</div></details> : null}
          {achievements.status !== "Ready" ? <p role="status" className="mt-3 text-xs text-muted-foreground">{achievements.status}</p> : null}
        </Panel> : null}
      </div>
    </div>
  )
}

function AchievementTile({ achievement }: { achievement: Achievement }) {
  return (
    <details className={`rounded-lg border p-3 ${achievement.unlocked ? "border-success/40 bg-success/10" : "border-border bg-background"}`}>
      <summary className="flex cursor-pointer list-none items-center gap-2"><CheckCircle2 className={`h-5 w-5 shrink-0 ${achievement.unlocked ? "text-success" : "text-muted-foreground"}`} /><span className="flex-1 text-sm font-medium">{achievement.name}</span><span className="text-xs text-muted-foreground">{achievement.xp_reward} XP</span></summary>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">{achievement.description}</p>
    </details>
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
      <span className="block text-xs font-semibold uppercase tracking-[0.12em] opacity-75">{chip.label}</span>
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

function useResource<T>(path: string) {
  const [data, setData] = useState<T | null>(null)
  const [status, setStatus] = useState("Loading")
  const refresh = useMemo(() => async () => {
    try {
      setStatus("Loading")
      setData(await api<T>(path))
      setStatus("Ready")
      return true
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to load")
      return false
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
      <Network className="h-4 w-4 text-[var(--decor-mint-ink)]" />
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
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="text-base font-semibold text-foreground">{value}</p>
    </div>
  )
}
