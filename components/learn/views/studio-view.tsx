"use client"

import { useEffect, useMemo, useState } from "react"
import type React from "react"
import {
  Archive,
  Clipboard,
  Copy,
  Download,
  FileText,
  HelpCircle,
  PanelRight,
  Plus,
  Presentation,
  Redo2,
  Save,
  Search,
  Table2,
  Undo2,
} from "lucide-react"
import { api, formatDate } from "../api"
import type { Note, StudioKind, WorkspaceDeck, WorkspaceDocument, WorkspaceSheet } from "../types"
import type { WorkspaceOptions } from "../preferences"
import { EmptyState, Panel } from "../ui"
import { createHistoryState, exportSheetToCsv, importCsvToSheet, pushHistory, redoHistory, undoHistory, type HistoryState } from "@/lib/workspace-features"

const studioTabs: { kind: StudioKind; label: string; description: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { kind: "notes", label: "Notes", description: "Capture quick thoughts, study reflections, and review seeds.", icon: FileText },
  { kind: "docs", label: "Docs", description: "Write longer study guides, reports, and structured explanations.", icon: FileText },
  { kind: "sheets", label: "Sheets", description: "Track topics, scores, deadlines, resources, and review lists.", icon: Table2 },
  { kind: "slides", label: "Slides", description: "Draft decks, lesson outlines, speaker notes, and quiz prompts.", icon: Presentation },
]

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

const docTemplates = {
  study: "# New learning doc\n\n## Summary\n\n## Key examples\n\n## Practice tasks\n",
  cornell: "# Cornell notes\n\n## Cues\n\n## Notes\n\n## Summary\n",
  project: "# Learning project\n\n## Goal\n\n## Steps\n\n## Evidence\n\n## Reflection\n",
}

function textFromDocument(document?: WorkspaceDocument) {
  const content = document?.content || {}
  return String(content.text || "")
}

function parseJsonArray<T>(value: unknown, fallback: T): T {
  if (Array.isArray(value)) return value as T
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed as T : fallback
    } catch {
      return fallback
    }
  }
  return fallback
}

function cellsFromSheet(sheet?: WorkspaceSheet) {
  return parseJsonArray<string[][]>(sheet?.cells, starterCells)
}

function slidesFromDeck(deck?: WorkspaceDeck) {
  return parseJsonArray<SlideDraft[]>(deck?.slides, starterSlides).map((slide) => ({ ...slide, accent: slide.accent || "Slide" }))
}

function fileTitle(title: string, fallback: string) {
  return (title.trim() || fallback).replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase()
}

function downloadText(filename: string, body: string, type = "text/plain") {
  const blob = new Blob([body], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function StudioView({
  initialKind,
  notes,
  options,
  selectedNote,
  setNotes,
  setSelectedNoteId,
}: {
  initialKind: StudioKind
  notes: Note[]
  options: WorkspaceOptions
  selectedNote?: Note
  setNotes: React.Dispatch<React.SetStateAction<Note[]>>
  setSelectedNoteId: (id: string) => void
}) {
  const [kind, setKind] = useState<StudioKind>(initialKind)
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState("Loading Studio...")
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState("")

  const [noteDraft, setNoteDraft] = useState<Note | null>(selectedNote || null)
  const [noteHistory, setNoteHistory] = useState<HistoryState<string>>(createHistoryState(selectedNote?.content || ""))

  const [docs, setDocs] = useState<WorkspaceDocument[]>([])
  const [docId, setDocId] = useState("")
  const selectedDoc = docId ? docs.find((item) => item.id === docId) : undefined
  const [docTitle, setDocTitle] = useState("Untitled document")
  const [docHistory, setDocHistory] = useState<HistoryState<string>>(createHistoryState(""))

  const [sheets, setSheets] = useState<WorkspaceSheet[]>([])
  const [sheetId, setSheetId] = useState("")
  const selectedSheet = sheetId ? sheets.find((item) => item.id === sheetId) : undefined
  const [sheetTitle, setSheetTitle] = useState("Study tracker")
  const [cells, setCells] = useState<string[][]>(starterCells)

  const [decks, setDecks] = useState<WorkspaceDeck[]>([])
  const [deckId, setDeckId] = useState("")
  const selectedDeck = deckId ? decks.find((item) => item.id === deckId) : undefined
  const [deckTitle, setDeckTitle] = useState("Learning deck")
  const [slides, setSlides] = useState(starterSlides)

  useEffect(() => {
    setKind(initialKind)
  }, [initialKind])

  useEffect(() => {
    setNoteDraft(selectedNote || null)
    setNoteHistory(createHistoryState(selectedNote?.content || ""))
  }, [selectedNote?.id])

  useEffect(() => {
    Promise.all([
      api<{ items: WorkspaceDocument[] }>("/api/docs"),
      api<{ items: WorkspaceSheet[] }>("/api/sheets"),
      api<{ items: WorkspaceDeck[] }>("/api/slides"),
    ])
      .then(([docsResponse, sheetsResponse, decksResponse]) => {
        setDocs(docsResponse.items)
        setDocId(docsResponse.items[0]?.id || "")
        setSheets(sheetsResponse.items)
        setSheetId(sheetsResponse.items[0]?.id || "")
        setDecks(decksResponse.items)
        setDeckId(decksResponse.items[0]?.id || "")
        setStatus("")
      })
      .catch((error) => setStatus(error.message))
  }, [])

  useEffect(() => {
    if (!selectedDoc) return
    setDocTitle(selectedDoc.title)
    setDocHistory(createHistoryState(textFromDocument(selectedDoc)))
  }, [selectedDoc?.id])

  useEffect(() => {
    if (!selectedSheet) return
    setSheetTitle(selectedSheet.title)
    setCells(cellsFromSheet(selectedSheet))
  }, [selectedSheet?.id])

  useEffect(() => {
    if (!selectedDeck) return
    setDeckTitle(selectedDeck.title)
    setSlides(slidesFromDeck(selectedDeck))
  }, [selectedDeck?.id])

  useEffect(() => {
    if (!options.notesAutosave || kind !== "notes" || !noteDraft?.id) return
    const timeout = window.setTimeout(() => {
      saveActive(true).catch(() => undefined)
    }, 1800)
    return () => window.clearTimeout(timeout)
  }, [options.notesAutosave, kind, noteDraft?.id, noteDraft?.title, noteHistory.present])

  const activeTab = studioTabs.find((tab) => tab.kind === kind) || studioTabs[0]
  const items = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const mapped = kind === "notes"
      ? notes.map((item) => ({ id: item.id, title: item.title, updated_at: item.updated_at, summary: item.content }))
      : kind === "docs"
        ? docs.map((item) => ({ id: item.id, title: item.title, updated_at: item.updated_at, summary: textFromDocument(item) }))
        : kind === "sheets"
          ? sheets.map((item) => ({ id: item.id, title: item.title, updated_at: item.updated_at, summary: `${cellsFromSheet(item).length} rows` }))
          : decks.map((item) => ({ id: item.id, title: item.title, updated_at: item.updated_at, summary: `${slidesFromDeck(item).length} slides` }))
    if (!needle) return mapped
    return mapped.filter((item) => `${item.title} ${item.summary || ""}`.toLowerCase().includes(needle))
  }, [decks, docs, kind, notes, query, sheets])

  function activeTitle() {
    if (kind === "notes") return noteDraft?.title || "Untitled learning page"
    if (kind === "docs") return docTitle
    if (kind === "sheets") return sheetTitle
    return deckTitle
  }

  function setActiveTitle(value: string) {
    if (kind === "notes" && noteDraft) setNoteDraft({ ...noteDraft, title: value })
    if (kind === "docs") setDocTitle(value)
    if (kind === "sheets") setSheetTitle(value)
    if (kind === "slides") setDeckTitle(value)
  }

  function currentPayload(format: "download" | "export" = "download") {
    if (kind === "notes") return noteHistory.present
    if (kind === "docs") return format === "export" ? docHistory.present.replace(/^# /gm, "") : docHistory.present
    if (kind === "sheets") return exportSheetToCsv({ cells })
    return format === "export"
      ? JSON.stringify({ title: deckTitle, slides }, null, 2)
      : slides.map((slide, index) => `Slide ${index + 1}: ${slide.title}\n${slide.body}`).join("\n\n")
  }

  async function createActive() {
    if (kind === "notes") {
      const response = await api<{ item: Note }>("/api/notes", {
        method: "POST",
        body: JSON.stringify({ title: "Untitled learning page", content: "", template: "blank" }),
      })
      setNotes((current) => [response.item, ...current])
      setSelectedNoteId(response.item.id)
      return
    }

    if (kind === "docs") {
      setDocId("")
      setDocTitle("Untitled document")
      setDocHistory(createHistoryState(docTemplates[options.docsTemplate]))
      return
    }

    if (kind === "sheets") {
      setSheetId("")
      setSheetTitle("Study tracker")
      setCells(starterCells)
      return
    }

    setDeckId("")
    setDeckTitle("Learning deck")
    setSlides(starterSlides)
  }

  async function saveActive(silent = false) {
    setSaving(true)
    try {
      if (kind === "notes" && noteDraft) {
        const response = await api<{ item: Note }>(`/api/notes/${noteDraft.id}`, {
          method: "PUT",
          body: JSON.stringify({ ...noteDraft, content: noteHistory.present }),
        })
        setNotes((current) => current.map((item) => (item.id === response.item.id ? response.item : item)))
        setNoteDraft(response.item)
      }

      if (kind === "docs") {
        const response = await api<{ item: WorkspaceDocument }>("/api/docs", {
          method: selectedDoc?.id ? "PUT" : "POST",
          body: JSON.stringify({ id: selectedDoc?.id, title: docTitle, content: { text: docHistory.present }, tags: selectedDoc?.tags || [] }),
        })
        setDocs((current) => [response.item, ...current.filter((item) => item.id !== response.item.id)])
        setDocId(response.item.id)
      }

      if (kind === "sheets") {
        const response = await api<{ item: WorkspaceSheet }>("/api/sheets", {
          method: selectedSheet?.id ? "PUT" : "POST",
          body: JSON.stringify({ id: selectedSheet?.id, title: sheetTitle, cells, history: [] }),
        })
        setSheets((current) => [response.item, ...current.filter((item) => item.id !== response.item.id)])
        setSheetId(response.item.id)
      }

      if (kind === "slides") {
        const response = await api<{ item: WorkspaceDeck }>("/api/slides", {
          method: selectedDeck?.id ? "PUT" : "POST",
          body: JSON.stringify({ id: selectedDeck?.id, title: deckTitle, slides, speakerNotes: {} }),
        })
        setDecks((current) => [response.item, ...current.filter((item) => item.id !== response.item.id)])
        setDeckId(response.item.id)
      }

      setLastSaved(new Date().toLocaleTimeString())
      if (!silent) setStatus("Saved.")
    } finally {
      setSaving(false)
    }
  }

  async function duplicateActive() {
    const title = `${activeTitle()} copy`
    if (kind === "notes") {
      const response = await api<{ item: Note }>("/api/notes", { method: "POST", body: JSON.stringify({ title, content: noteHistory.present, template: "blank" }) })
      setNotes((current) => [response.item, ...current])
      setSelectedNoteId(response.item.id)
    }
    if (kind === "docs") {
      const response = await api<{ item: WorkspaceDocument }>("/api/docs", { method: "POST", body: JSON.stringify({ title, content: { text: docHistory.present }, tags: [] }) })
      setDocs((current) => [response.item, ...current])
      setDocId(response.item.id)
    }
    if (kind === "sheets") {
      const response = await api<{ item: WorkspaceSheet }>("/api/sheets", { method: "POST", body: JSON.stringify({ title, cells, history: [] }) })
      setSheets((current) => [response.item, ...current])
      setSheetId(response.item.id)
    }
    if (kind === "slides") {
      const response = await api<{ item: WorkspaceDeck }>("/api/slides", { method: "POST", body: JSON.stringify({ title, slides, speakerNotes: {} }) })
      setDecks((current) => [response.item, ...current])
      setDeckId(response.item.id)
    }
  }

  async function archiveActive() {
    if (kind === "notes" && noteDraft) {
      await api(`/api/notes/${noteDraft.id}`, { method: "DELETE" })
      setNotes((current) => current.filter((item) => item.id !== noteDraft.id))
      setSelectedNoteId("")
      setNoteDraft(null)
    }
    if (kind === "docs" && selectedDoc?.id) {
      await api(`/api/docs?id=${selectedDoc.id}`, { method: "DELETE" })
      setDocs((current) => current.filter((item) => item.id !== selectedDoc.id))
      setDocId("")
    }
    if (kind === "sheets" && selectedSheet?.id) {
      await api(`/api/sheets?id=${selectedSheet.id}`, { method: "DELETE" })
      setSheets((current) => current.filter((item) => item.id !== selectedSheet.id))
      setSheetId("")
    }
    if (kind === "slides" && selectedDeck?.id) {
      await api(`/api/slides?id=${selectedDeck.id}`, { method: "DELETE" })
      setDecks((current) => current.filter((item) => item.id !== selectedDeck.id))
      setDeckId("")
    }
    setStatus("Archived.")
  }

  async function copyActive() {
    await navigator.clipboard?.writeText(currentPayload("export"))
    setStatus("Copied to clipboard.")
  }

  function downloadActive(exportMode = false) {
    const base = fileTitle(activeTitle(), kind)
    if (kind === "sheets") return downloadText(`${base}.csv`, currentPayload("download"), "text/csv")
    if (kind === "slides") return downloadText(`${base}.${exportMode ? "json" : "txt"}`, currentPayload(exportMode ? "export" : "download"), "application/json")
    downloadText(`${base}.${exportMode ? "txt" : "md"}`, currentPayload(exportMode ? "export" : "download"), "text/markdown")
  }

  function selectItem(id: string) {
    if (kind === "notes") setSelectedNoteId(id)
    if (kind === "docs") setDocId(id)
    if (kind === "sheets") setSheetId(id)
    if (kind === "slides") setDeckId(id)
  }

  function updateCell(rowIndex: number, cellIndex: number, value: string) {
    setCells((current) => current.map((row, nextRow) => (
      nextRow === rowIndex ? row.map((cell, nextCell) => (nextCell === cellIndex ? value : cell)) : row
    )))
  }

  const canUndoRedo = kind === "notes" || kind === "docs"
  const hasActiveItem = kind === "notes" ? Boolean(noteDraft) : true

  return (
    <div className="grid gap-4 xl:grid-cols-[300px_1fr_280px]">
      <Panel className="min-h-[72vh] p-3">
        <div className="mb-3 grid grid-cols-2 gap-2">
          {studioTabs.map((tab) => {
            const Icon = tab.icon
            const active = kind === tab.kind
            return (
              <button
                key={tab.kind}
                onClick={() => setKind(tab.kind)}
                className={`flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-semibold ${active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground"}`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            )
          })}
        </div>
        <button onClick={createActive} className="mb-3 flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-primary-foreground">
          <Plus className="h-4 w-4" /> New {activeTab.label.slice(0, -1) || "item"}
        </button>
        <label className="mb-3 flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${activeTab.label.toLowerCase()}`} className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
        </label>
        <div className="space-y-1">
          {items.map((item) => (
            <button key={item.id} onClick={() => selectItem(item.id)} className="w-full rounded-md p-3 text-left text-sm hover:bg-muted focus:bg-accent focus:text-accent-foreground">
              <span className="line-clamp-1 font-medium text-foreground">{item.title}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{item.updated_at ? formatDate(item.updated_at) : item.summary || "Draft"}</span>
            </button>
          ))}
          {!items.length ? <EmptyState title={`No ${activeTab.label.toLowerCase()} yet`} body="Create one from the button above, then save it into your Studio." /> : null}
        </div>
      </Panel>

      <Panel className="min-w-0 p-4">
        <div className="mb-4 border-b border-border pb-3">
          <div className="flex flex-wrap items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <activeTab.icon className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{activeTab.label} Studio</p>
              <input value={activeTitle()} onChange={(event) => setActiveTitle(event.target.value)} className="mt-1 w-full bg-transparent text-2xl font-semibold text-foreground outline-none sm:text-3xl" />
              <p className="mt-1 text-sm text-muted-foreground">{saving ? "Saving..." : lastSaved ? `Saved ${lastSaved}` : activeTab.description}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <StudioButton label="Save" icon={Save} onClick={() => saveActive()} primary disabled={!hasActiveItem} />
            <StudioButton label="Undo" icon={Undo2} onClick={() => kind === "notes" ? setNoteHistory(undoHistory(noteHistory)) : setDocHistory(undoHistory(docHistory))} disabled={!canUndoRedo} />
            <StudioButton label="Redo" icon={Redo2} onClick={() => kind === "notes" ? setNoteHistory(redoHistory(noteHistory)) : setDocHistory(redoHistory(docHistory))} disabled={!canUndoRedo} />
            <StudioButton label="Copy" icon={Clipboard} onClick={copyActive} />
            <StudioButton label="Duplicate" icon={Copy} onClick={duplicateActive} />
            <StudioButton label="Download" icon={Download} onClick={() => downloadActive(false)} />
            <StudioButton label="Export" icon={PanelRight} onClick={() => downloadActive(true)} />
            <StudioButton label="Archive" icon={Archive} onClick={archiveActive} danger />
          </div>
        </div>
        {status ? <p className="mb-3 rounded-md bg-muted p-3 text-sm text-muted-foreground">{status}</p> : null}
        <StudioCanvas
          cells={cells}
          docHistory={docHistory}
          kind={kind}
          noteDraft={noteDraft}
          noteHistory={noteHistory}
          options={options}
          setCells={setCells}
          setDocHistory={setDocHistory}
          setNoteHistory={setNoteHistory}
          setSlides={setSlides}
          slides={slides}
          updateCell={updateCell}
        />
      </Panel>

      <Panel className="hidden p-4 xl:block">
        <div className="mb-3 flex items-center gap-2">
          <HelpCircle className="h-5 w-5 text-success" />
          <h2 className="font-semibold text-foreground">Studio guide</h2>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">{activeTab.description}</p>
        <div className="mt-4 space-y-3 text-sm">
          <GuideItem title="Create" body="Start a new item without leaving the current workspace." />
          <GuideItem title="Save and duplicate" body="Save updates, then duplicate useful templates for later lessons." />
          <GuideItem title="Download and export" body="Use Markdown/text, CSV, outline, or JSON-style exports depending on the item type." />
          <GuideItem title="Archive" body="Archive removes the item from this list while keeping the safer soft-delete behavior." />
        </div>
      </Panel>
    </div>
  )
}

function StudioCanvas({
  cells,
  docHistory,
  kind,
  noteDraft,
  noteHistory,
  options,
  setCells,
  setDocHistory,
  setNoteHistory,
  setSlides,
  slides,
  updateCell,
}: {
  cells: string[][]
  docHistory: HistoryState<string>
  kind: StudioKind
  noteDraft: Note | null
  noteHistory: HistoryState<string>
  options: WorkspaceOptions
  setCells: React.Dispatch<React.SetStateAction<string[][]>>
  setDocHistory: React.Dispatch<React.SetStateAction<HistoryState<string>>>
  setNoteHistory: React.Dispatch<React.SetStateAction<HistoryState<string>>>
  setSlides: React.Dispatch<React.SetStateAction<typeof starterSlides>>
  slides: typeof starterSlides
  updateCell: (rowIndex: number, cellIndex: number, value: string) => void
}) {
  if (kind === "notes") {
    if (!noteDraft) return <EmptyState title="No note selected" body="Create or choose a note to begin capturing your learning." />
    return (
      <textarea
        value={noteHistory.present}
        onChange={(event) => setNoteHistory(pushHistory(noteHistory, event.target.value))}
        className={`${options.noteEditorSize === "large" ? "min-h-[68vh] text-lg" : "min-h-[56vh] text-base"} w-full resize-none rounded-md border border-input bg-background p-4 leading-8 text-foreground outline-none focus:border-ring`}
        placeholder="Write notes, formulas, reflections, links, media cues, and AI-generated drafts here..."
      />
    )
  }

  if (kind === "docs") {
    return (
      <textarea
        value={docHistory.present}
        onChange={(event) => setDocHistory(pushHistory(docHistory, event.target.value))}
        className="min-h-[60vh] w-full resize-none rounded-md border border-input bg-background p-5 text-base leading-8 text-foreground outline-none focus:border-ring"
        placeholder="Draft headings, checklists, explanations, citations, and practice tasks..."
      />
    )
  }

  if (kind === "sheets") {
    return (
      <div>
        <textarea
          onBlur={(event) => {
            if (!event.target.value.trim()) return
            setCells(importCsvToSheet(event.target.value).cells)
            event.target.value = ""
          }}
          placeholder="Paste CSV here, then leave the field to import rows into the grid."
          className="mb-3 h-20 w-full rounded-md border border-input bg-background p-3 text-sm outline-none focus:border-ring"
        />
        <div className="mb-3 flex flex-wrap gap-2">
          <button onClick={() => setCells([...cells, Array.from({ length: cells[0]?.length || 4 }, () => "")])} className="rounded-md border border-border bg-secondary px-3 py-2 text-sm font-medium text-secondary-foreground">Add row</button>
          <button onClick={() => setCells(cells.map((row) => [...row, ""]))} className="rounded-md border border-border bg-secondary px-3 py-2 text-sm font-medium text-secondary-foreground">Add column</button>
        </div>
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
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div>
      <button onClick={() => setSlides([...slides, { title: "New slide", body: "Add the point, image cue, or quiz prompt.", accent: "New" }])} className="mb-3 rounded-md border border-border bg-secondary px-3 py-2 text-sm font-medium text-secondary-foreground">Add slide</button>
      <div className="grid gap-4 lg:grid-cols-2">
        {slides.map((slide, index) => (
          <article key={index} className={`${options.slidesAspect === "4:3" ? "aspect-[4/3]" : "aspect-video"} rounded-lg border border-border bg-card p-5 shadow-sm`}>
            <input value={slide.accent || ""} onChange={(event) => setSlides(slides.map((item, next) => next === index ? { ...item, accent: event.target.value } : item))} className="mb-2 w-full bg-transparent text-xs font-semibold uppercase text-muted-foreground outline-none" />
            <input value={slide.title} onChange={(event) => setSlides(slides.map((item, next) => next === index ? { ...item, title: event.target.value } : item))} className="w-full bg-transparent text-2xl font-semibold outline-none" />
            <textarea value={slide.body} onChange={(event) => setSlides(slides.map((item, next) => next === index ? { ...item, body: event.target.value } : item))} className="mt-4 h-24 w-full resize-none bg-transparent text-sm leading-6 outline-none" />
          </article>
        ))}
      </div>
    </div>
  )
}

function StudioButton({
  danger,
  disabled,
  icon: Icon,
  label,
  onClick,
  primary,
}: {
  danger?: boolean
  disabled?: boolean
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
  primary?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-45 ${
        primary
          ? "border-primary bg-primary text-primary-foreground"
          : danger
            ? "border-destructive bg-background text-destructive hover:bg-destructive hover:text-destructive-foreground"
            : "border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground"
      }`}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </button>
  )
}

function GuideItem({ body, title }: { body: string; title: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/35 p-3">
      <p className="font-semibold text-foreground">{title}</p>
      <p className="mt-1 leading-6 text-muted-foreground">{body}</p>
    </div>
  )
}
