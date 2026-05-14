"use client"

import { useEffect, useMemo, useState } from "react"
import type React from "react"
import { AtSign, Bell, Download, Gamepad2, Hash, Languages, MessageSquare, Plus, Redo2, Reply, Save, Send, Smile, Undo2 } from "lucide-react"
import type { WorkspaceOptions } from "../preferences"
import type { Quiz, WorkspaceDeck, WorkspaceDocument, WorkspaceSheet } from "../types"
import { api } from "../api"
import { EmptyState, Panel } from "../ui"
import { createHistoryState, exportSheetToCsv, importCsvToSheet, pushHistory, redoHistory, undoHistory, type HistoryState } from "@/lib/workspace-features"

const emojiSet = ["⭐", "✅", "💡", "📌", "🎯", "🔥", "🧠", "📚"]
const starterCells = [
  ["Topic", "Status", "Score", "Next step"],
  ["React", "Review", "72", "Practice hooks"],
  ["Databases", "Weak", "48", "Index questions"],
  ["Operating systems", "Ready", "86", "Timed quiz"],
]
const starterSlides = [
  { title: "Study brief", body: "Summarize the goal, what changed, and the next practice step.", accent: "Focus" },
  { title: "Key idea", body: "Add a concise visual explanation, image note, or memory hook.", accent: "Explain" },
]
type SlideDraft = typeof starterSlides[number]

function textFromDocument(document?: WorkspaceDocument) {
  const content = document?.content || {}
  return String(content.text || "")
}

export function DocsView({ options }: { options: WorkspaceOptions }) {
  const [items, setItems] = useState<WorkspaceDocument[]>([])
  const [selectedId, setSelectedId] = useState("")
  const selected = items.find((item) => item.id === selectedId) || items[0]
  const [title, setTitle] = useState("Untitled document")
  const [history, setHistory] = useState<HistoryState<string>>(createHistoryState(""))
  const [status, setStatus] = useState("Loading docs...")

  useEffect(() => {
    api<{ items: WorkspaceDocument[] }>("/api/docs")
      .then((response) => {
        setItems(response.items)
        setSelectedId(response.items[0]?.id || "")
        setStatus("")
      })
      .catch((error) => setStatus(error.message))
  }, [])

  useEffect(() => {
    if (!selected) return
    setTitle(selected.title)
    setHistory(createHistoryState(textFromDocument(selected)))
  }, [selected?.id])

  async function save() {
    const response = await api<{ item: WorkspaceDocument }>("/api/docs", {
      method: selected?.id ? "PUT" : "POST",
      body: JSON.stringify({ id: selected?.id, title, content: { text: history.present }, tags: selected?.tags || [] }),
    })
    setItems((current) => [response.item, ...current.filter((item) => item.id !== response.item.id)])
    setSelectedId(response.item.id)
  }

  async function create() {
    const templates = {
      study: "# New learning doc\n\n## Summary\n\n## Key examples\n\n## Practice tasks\n",
      cornell: "# Cornell notes\n\n## Cues\n\n## Notes\n\n## Summary\n",
      project: "# Learning project\n\n## Goal\n\n## Steps\n\n## Evidence\n\n## Reflection\n",
    }
    setSelectedId("")
    setTitle("Untitled document")
    setHistory(createHistoryState(templates[options.docsTemplate]))
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[280px_1fr]">
      <Panel className="p-3">
        <button onClick={create} className="mb-3 flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-primary-foreground">
          <Plus className="h-4 w-4" /> New doc
        </button>
        <div className="space-y-1">
          {items.map((item) => (
            <button key={item.id} onClick={() => setSelectedId(item.id)} className={`w-full rounded-md p-3 text-left text-sm ${selected?.id === item.id ? "bg-accent text-accent-foreground" : "hover:bg-muted"}`}>
              <span className="line-clamp-2 font-medium">{item.title}</span>
            </button>
          ))}
        </div>
      </Panel>
      <Panel className="p-4">
        {status ? <p className="mb-3 rounded-md bg-muted p-3 text-sm text-muted-foreground">{status}</p> : null}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input value={title} onChange={(event) => setTitle(event.target.value)} className="min-w-48 flex-1 bg-transparent text-2xl font-semibold outline-none" />
          <ToolbarButton label="Undo" onClick={() => setHistory(undoHistory(history))} icon={Undo2} />
          <ToolbarButton label="Redo" onClick={() => setHistory(redoHistory(history))} icon={Redo2} />
          {emojiSet.map((emoji) => (
            <button key={emoji} onClick={() => setHistory(pushHistory(history, `${history.present}${emoji}`))} className="h-9 w-9 rounded-md border border-border bg-secondary text-sm">
              {emoji}
            </button>
          ))}
          <ToolbarButton label="Save" onClick={save} icon={Save} primary />
        </div>
        <textarea
          value={history.present}
          onChange={(event) => setHistory(pushHistory(history, event.target.value))}
          className="min-h-[58vh] w-full resize-none rounded-md border border-input bg-background p-4 text-sm leading-7 outline-none focus:border-ring"
          placeholder="Write with headings, checklists, emojis, media notes, quiz seeds, and AI-generated sections..."
        />
      </Panel>
    </div>
  )
}

export function SheetsView({ options }: { options: WorkspaceOptions }) {
  const [items, setItems] = useState<WorkspaceSheet[]>([])
  const [title, setTitle] = useState("Study tracker")
  const [selectedId, setSelectedId] = useState("")
  const selected = items.find((item) => item.id === selectedId)
  const [cells, setCells] = useState<string[][]>(starterCells)

  useEffect(() => {
    api<{ items: WorkspaceSheet[] }>("/api/sheets").then((response) => {
      setItems(response.items)
      if (response.items[0]) {
        setSelectedId(response.items[0].id)
        setTitle(response.items[0].title)
        setCells(response.items[0].cells?.length ? response.items[0].cells : starterCells)
      }
    }).catch(() => undefined)
  }, [])

  function updateCell(rowIndex: number, cellIndex: number, value: string) {
    setCells((current) => current.map((row, nextRow) => (
      nextRow === rowIndex ? row.map((cell, nextCell) => (nextCell === cellIndex ? value : cell)) : row
    )))
  }

  async function save() {
    const response = await api<{ item: WorkspaceSheet }>("/api/sheets", {
      method: selected?.id ? "PUT" : "POST",
      body: JSON.stringify({ id: selected?.id, title, cells, history: [] }),
    })
    setItems((current) => [response.item, ...current.filter((item) => item.id !== response.item.id)])
    setSelectedId(response.item.id)
  }

  function importCsv(value: string) {
    const sheet = importCsvToSheet(value)
    setCells(sheet.cells)
  }

  return (
    <Panel className="p-4">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input value={title} onChange={(event) => setTitle(event.target.value)} className="min-w-52 flex-1 bg-transparent text-2xl font-semibold outline-none" />
        <ToolbarButton label="Save" onClick={save} icon={Save} primary />
        <ToolbarButton label="Export CSV" onClick={() => navigator.clipboard?.writeText(exportSheetToCsv({ cells }))} icon={Download} />
      </div>
      <textarea onBlur={(event) => importCsv(event.target.value)} placeholder="Paste CSV, then leave the field to import" className="mb-3 h-20 w-full rounded-md border border-input bg-background p-3 text-sm outline-none" />
      <div className="overflow-auto rounded-md border border-border">
        <table className="min-w-full border-collapse text-sm">
          <tbody>
            {cells.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td key={`${rowIndex}-${cellIndex}`} className="border border-border p-0">
                    <input value={cell} onChange={(event) => updateCell(rowIndex, cellIndex, event.target.value)} className="h-10 min-w-36 bg-background px-2 outline-none focus:bg-accent focus:text-accent-foreground" />
                  </td>
                ))}
              </tr>
            ))}
            {Array.from({ length: Math.max(0, options.sheetRows - cells.length) }).map((_, offset) => (
              <tr key={`extra-${offset}`}>
                {starterCells[0].map((_, cellIndex) => (
                  <td key={cellIndex} className="border border-border p-0">
                    <input onFocus={() => setCells([...cells, Array.from({ length: starterCells[0].length }, () => "")])} className="h-10 min-w-36 bg-background px-2 outline-none focus:bg-accent focus:text-accent-foreground" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

export function SlidesView({ options }: { options: WorkspaceOptions }) {
  const [title, setTitle] = useState("Learning deck")
  const [items, setItems] = useState<WorkspaceDeck[]>([])
  const [selectedId, setSelectedId] = useState("")
  const [slides, setSlides] = useState<SlideDraft[]>(starterSlides)
  const selected = items.find((item) => item.id === selectedId)

  useEffect(() => {
    api<{ items: WorkspaceDeck[] }>("/api/slides").then((response) => {
      setItems(response.items)
      if (response.items[0]) {
        setSelectedId(response.items[0].id)
        setTitle(response.items[0].title)
        setSlides(response.items[0].slides?.length
          ? response.items[0].slides.map((slide) => ({ ...slide, accent: slide.accent || "Slide" }))
          : starterSlides)
      }
    }).catch(() => undefined)
  }, [])

  async function save() {
    const response = await api<{ item: WorkspaceDeck }>("/api/slides", {
      method: selected?.id ? "PUT" : "POST",
      body: JSON.stringify({ id: selected?.id, title, slides, speakerNotes: {} }),
    })
    setItems((current) => [response.item, ...current.filter((item) => item.id !== response.item.id)])
    setSelectedId(response.item.id)
  }

  return (
    <Panel className="p-4">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input value={title} onChange={(event) => setTitle(event.target.value)} className="min-w-52 flex-1 bg-transparent text-2xl font-semibold outline-none" />
        <ToolbarButton label="Add slide" onClick={() => setSlides([...slides, { title: "New slide", body: "Add the point, image cue, or quiz prompt.", accent: "New" }])} icon={Plus} />
        <ToolbarButton label="Save" onClick={save} icon={Save} primary />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {slides.map((slide, index) => (
          <article key={index} className={`${options.slidesAspect === "4:3" ? "aspect-[4/3]" : "aspect-video"} rounded-lg border border-border bg-card p-5 shadow-sm`}>
            <input value={slide.accent || ""} onChange={(event) => setSlides(slides.map((item, next) => next === index ? { ...item, accent: event.target.value } : item))} className="mb-2 w-full bg-transparent text-xs font-semibold uppercase text-muted-foreground outline-none" />
            <input value={slide.title} onChange={(event) => setSlides(slides.map((item, next) => next === index ? { ...item, title: event.target.value } : item))} className="w-full bg-transparent text-2xl font-semibold outline-none" />
            <textarea value={slide.body} onChange={(event) => setSlides(slides.map((item, next) => next === index ? { ...item, body: event.target.value } : item))} className="mt-4 h-24 w-full resize-none bg-transparent text-sm leading-6 outline-none" />
          </article>
        ))}
      </div>
    </Panel>
  )
}

export function GamesView({ quizzes, options }: { quizzes: Quiz[]; options: WorkspaceOptions }) {
  const questions = useMemo(() => quizzes.flatMap((quiz) => quiz.questions || []).slice(0, options.gameQuestionLimit), [quizzes, options.gameQuestionLimit])
  const [index, setIndex] = useState(0)
  const [score, setScore] = useState(0)
  const current = questions[index]

  async function choose(choiceId: string) {
    const nextScore = score + (choiceId === current?.correct_answer_id ? 1 : 0)
    setScore(nextScore)
    if (index + 1 >= questions.length) {
      await api("/api/games", { method: "POST", body: JSON.stringify({ gameKey: "flashcard-sprint", score: nextScore, total: questions.length }) }).catch(() => undefined)
      setIndex(0)
      setScore(0)
      return
    }
    setIndex(index + 1)
  }

  if (!current) return <Panel className="p-4"><EmptyState title="No game questions yet" body="Open quizzes once so question data can power flashcard sprint and matching games." /></Panel>

  return (
    <Panel className="p-5">
      <div className="mb-4 flex items-center gap-3">
        <Gamepad2 className="h-5 w-5 text-success" />
        <div>
          <h2 className="text-2xl font-semibold">Flashcard sprint</h2>
          <p className="text-sm text-muted-foreground">{options.gameMode} mode - Score {score} / {questions.length}</p>
        </div>
      </div>
      <div className="rounded-lg bg-primary p-5 text-primary-foreground">
        <p className="text-sm opacity-70">Prompt {index + 1}</p>
        <h3 className="mt-2 text-2xl font-semibold">{current.question}</h3>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {current.choices.map((choice) => (
          <button key={choice.id} onClick={() => choose(choice.id)} className="rounded-md border border-border bg-card p-4 text-left text-sm hover:bg-accent hover:text-accent-foreground">
            {choice.text}
          </button>
        ))}
      </div>
    </Panel>
  )
}

export function ChatView({ options }: { options: WorkspaceOptions }) {
  const [threads, setThreads] = useState<any[]>([])
  const [body, setBody] = useState("")
  const [title, setTitle] = useState("Study room")
  const [intent, setIntent] = useState<"update" | "question" | "win">("update")
  const [channel, setChannel] = useState("#general")
  const [reaction, setReaction] = useState("helpful")
  const quickIntents = [
    { id: "update" as const, label: "Update", body: "Share progress, a note, or what changed." },
    { id: "question" as const, label: "Question", body: "Ask for help and invite replies." },
    { id: "win" as const, label: "Win", body: "Celebrate a milestone or review streak." },
  ]

  async function refresh() {
    const response = await api<{ items: any[] }>("/api/chat")
    setThreads(response.items)
  }

  useEffect(() => {
    refresh().catch(() => undefined)
  }, [])

  async function send() {
    if (!body.trim()) return
    await api("/api/chat", { method: "POST", body: JSON.stringify({ title: `${channel} - ${title}`, body: `[${intent}] ${body}` }) })
    setBody("")
    await refresh()
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Panel className={options.chatCompact ? "p-3" : "p-4"}>
        <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex h-10 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm text-muted-foreground">
                <Hash className="h-4 w-4" />
                <select value={channel} onChange={(event) => setChannel(event.target.value)} className="bg-transparent text-foreground outline-none">
                  <option value="#general">general</option>
                  <option value="#study-help">study-help</option>
                  <option value="#resources">resources</option>
                  <option value="#wins">wins</option>
                </select>
              </label>
              <input value={title} onChange={(event) => setTitle(event.target.value)} className="min-w-52 flex-1 bg-transparent text-2xl font-semibold text-foreground outline-none" />
            </div>
            <p className="mt-2 text-sm text-muted-foreground">Use channels, mentions, and message intent so discussion stays searchable instead of becoming one long stream.</p>
          </div>
          <ToolbarButton label="Send" onClick={send} icon={Send} primary />
        </div>
        <div className="mb-3 grid gap-2 sm:grid-cols-3">
          {quickIntents.map((item) => (
            <button key={item.id} onClick={() => setIntent(item.id)} className={`rounded-md border p-3 text-left text-sm transition ${intent === item.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground"}`}>
              <span className="font-semibold">{item.label}</span>
              <span className={`mt-1 block text-xs leading-5 ${intent === item.id ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{item.body}</span>
            </button>
          ))}
        </div>
        <div className="rounded-md border border-input bg-background p-3">
          <textarea value={body} onChange={(event) => setBody(event.target.value)} className="min-h-32 w-full resize-none bg-transparent text-sm leading-6 text-foreground outline-none" placeholder="Share a study update, @mention a person, link a Studio item, or ask for a quick explanation..." />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            <div className="flex flex-wrap gap-2">
              <ComposerChip icon={AtSign} label="@mention" />
              <ComposerChip icon={Smile} label="reaction" />
              <ComposerChip icon={Languages} label="translate" />
              <ComposerChip icon={Bell} label="notify" />
            </div>
            <p className="text-xs text-muted-foreground">Private-first. Share only what belongs in the group.</p>
          </div>
        </div>
      </Panel>
      <Panel className={options.chatCompact ? "p-3" : "p-4"}>
        <h3 className="font-semibold text-foreground">Recent threads</h3>
        {options.collaborationPresence ? <p className="mt-1 text-xs text-muted-foreground">Presence hints are enabled for group workflows.</p> : null}
        <div className="mt-3 grid grid-cols-3 gap-1 rounded-md border border-border bg-background p-1">
          {["helpful", "save", "reply"].map((item) => (
            <button key={item} onClick={() => setReaction(item)} className={`rounded-md px-2 py-1.5 text-xs font-semibold ${reaction === item ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"}`}>
              {item}
            </button>
          ))}
        </div>
        <div className="mt-3 space-y-2">
          {threads.map((thread) => (
            <div key={thread.id} className="rounded-md border border-border bg-background p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium text-foreground">{thread.title}</p>
                <span className="rounded-md bg-secondary px-2 py-1 text-[11px] font-semibold text-secondary-foreground">read</span>
              </div>
              <p className="mt-1 line-clamp-2 text-muted-foreground">{thread.last_message || "No messages yet"}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="inline-flex h-8 items-center gap-1.5 rounded-md bg-secondary px-2 text-xs font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground">
                  <Smile className="h-3.5 w-3.5" />
                  {reaction}
                </button>
                <button className="inline-flex h-8 items-center gap-1.5 rounded-md bg-secondary px-2 text-xs font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground">
                  <Reply className="h-3.5 w-3.5" />
                  reply
                </button>
              </div>
            </div>
          ))}
          {!threads.length ? <EmptyState title="No threads yet" body="Send an update or question to create the first searchable study thread." /> : null}
        </div>
      </Panel>
    </div>
  )
}

function ComposerChip({ icon: Icon, label }: { icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <span className="inline-flex h-8 items-center gap-1.5 rounded-md bg-secondary px-2 text-xs font-semibold text-secondary-foreground">
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  )
}

function ToolbarButton({
  icon: Icon,
  label,
  onClick,
  primary,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
  primary?: boolean
}) {
  return (
    <button onClick={onClick} className={`flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium ${primary ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground"}`}>
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </button>
  )
}
