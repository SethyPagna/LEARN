"use client"

import { useEffect, useMemo, useState } from "react"
import type React from "react"
import * as ContextMenu from "@radix-ui/react-context-menu"
import { Panel as ResizePanel, PanelGroup, PanelResizeHandle } from "react-resizable-panels"
import { EditorContent, useEditor, type Editor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Underline from "@tiptap/extension-underline"
import TextAlign from "@tiptap/extension-text-align"
import { TextStyle } from "@tiptap/extension-text-style"
import Color from "@tiptap/extension-color"
import Highlight from "@tiptap/extension-highlight"
import Link from "@tiptap/extension-link"
import Image from "@tiptap/extension-image"
import { Table } from "@tiptap/extension-table"
import TableRow from "@tiptap/extension-table-row"
import TableHeader from "@tiptap/extension-table-header"
import TableCell from "@tiptap/extension-table-cell"
import TaskList from "@tiptap/extension-task-list"
import TaskItem from "@tiptap/extension-task-item"
import CharacterCount from "@tiptap/extension-character-count"
import Placeholder from "@tiptap/extension-placeholder"
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Archive,
  Bold,
  BookOpen,
  Bot,
  Braces,
  CheckSquare,
  ChevronDown,
  Clipboard,
  Columns3,
  Copy,
  Download,
  FilePlus2,
  FileText,
  Grid2X2,
  Heading1,
  Heading2,
  Highlighter,
  ImageIcon,
  Italic,
  LayoutPanelLeft,
  List,
  ListOrdered,
  Maximize2,
  MoreHorizontal,
  PanelRight,
  Plus,
  Presentation,
  Redo2,
  Rows3,
  Save,
  Scissors,
  Search,
  Settings2,
  SplitSquareHorizontal,
  SplitSquareVertical,
  Table2,
  Trash2,
  Type,
  Underline as UnderlineIcon,
  Undo2,
  X,
} from "lucide-react"
import { api, formatDate } from "../api"
import type { Note, StudioKind, StudioLayoutState, StudioPane, StudioTab, WorkspaceDeck, WorkspaceDocument, WorkspaceSheet } from "../types"
import type { WorkspaceOptions } from "../preferences"
import { EmptyState, Panel } from "../ui"
import {
  addColumn,
  addRow,
  closeStudioPane,
  createDefaultStudioLayout,
  createStudioTab,
  deleteColumn,
  deleteRow,
  duplicateSlide,
  moveColumn,
  moveRow,
  moveSlide,
  normalizeStudioLayout,
  splitStudioPane,
} from "@/lib/studio-features"
import { createHistoryState, exportSheetToCsv, importCsvToSheet, pushHistory, redoHistory, undoHistory, type HistoryState } from "@/lib/workspace-features"

const LAYOUT_KEY = "learn_studio_layout_v2"

const studioTabs: { kind: StudioKind; label: string; description: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { kind: "notes", label: "Notes", description: "Fast capture, review seeds, and daily learning reflections.", icon: FileText },
  { kind: "docs", label: "Docs", description: "Rich study guides with headings, lists, tables, images, and AI cleanup.", icon: BookOpen },
  { kind: "sheets", label: "Sheets", description: "Track topics, scores, resources, schedules, and lightweight formulas.", icon: Table2 },
  { kind: "slides", label: "Slides", description: "Build lesson decks with thumbnails, canvas editing, notes, and PPTX export.", icon: Presentation },
]

const sections = ["All", "Notes", "Docs", "Sheets", "Slides", "Recent", "Favorites", "Archived"]
const inspectorTabs = ["Info", "Outline", "Comments", "History", "AI", "Export"]

const studioCreateLabels: Record<StudioKind, string> = {
  notes: "New Note",
  docs: "New Doc",
  sheets: "New Sheet",
  slides: "New Deck",
}

const docTemplates = {
  study: "<h1>New learning doc</h1><h2>Summary</h2><p></p><h2>Key examples</h2><p></p><h2>Practice tasks</h2><p></p>",
  cornell: "<h1>Cornell notes</h1><h2>Cues</h2><p></p><h2>Notes</h2><p></p><h2>Summary</h2><p></p>",
  project: "<h1>Learning project</h1><h2>Goal</h2><p></p><h2>Steps</h2><p></p><h2>Evidence</h2><p></p><h2>Reflection</h2><p></p>",
}

const studioTemplates: Record<StudioKind, Array<{ label: string; title: string; body: string }>> = {
  notes: [
    { label: "Daily note", title: "Daily learning note", body: "<h2>What I learned today</h2><p></p><h2>Questions</h2><p></p><h2>Review later</h2><p></p>" },
    { label: "Concept card", title: "Concept note", body: "<h2>Concept</h2><p></p><h2>Plain-English explanation</h2><p></p><h2>Example</h2><p></p><h2>Recall prompt</h2><p></p>" },
  ],
  docs: [
    { label: "Study guide", title: "Study guide", body: docTemplates.study },
    { label: "Cornell", title: "Cornell notes", body: docTemplates.cornell },
  ],
  sheets: [
    { label: "Tracker", title: "Study tracker", body: "Topic,Status,Score,Next step\nReact,Review,72,Practice hooks\nDatabases,Weak,48,Index questions" },
    { label: "Resources", title: "Resource tracker", body: "Resource,Type,Status,Owner\nLecture 1,Video,To watch,Me\nChapter 2,Reading,Review,Me" },
  ],
  slides: [
    { label: "Lesson", title: "Lesson deck", body: "Hook|Why this matters|Open\nKey idea|One visual explanation|Explain\nPractice|One recall question|Try" },
    { label: "Review", title: "Review deck", body: "Warmup|Quick recap|Start\nMistake|Common trap|Fix\nNext|What to practice|Plan" },
  ],
}

type StudioViewMode = "list" | "board" | "gallery"

const starterCells = [
  ["Topic", "Status", "Score", "Next step"],
  ["React", "Review", "72", "Practice hooks"],
  ["Databases", "Weak", "48", "Index questions"],
  ["Operating systems", "Ready", "86", "Timed quiz"],
]

const starterSlides: WorkspaceDeck["slides"] = [
  { title: "Study brief", body: "Summarize the goal, what changed, and the next practice step.", accent: "Focus", layout: "title", theme: "midnight", speakerNotes: "Open with why this matters." },
  { title: "Key idea", body: "Add a concise visual explanation, image note, or memory hook.", accent: "Explain", layout: "two-column", theme: "midnight", speakerNotes: "Keep this slide visual and short." },
]

function textFromDocument(document?: WorkspaceDocument) {
  const content = document?.content || {}
  return String(content.text || content.markdown || content.plainText || "")
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

function ensureCells(value: unknown) {
  return Array.isArray(value) && value.every((row) => Array.isArray(row)) ? value as string[][] : starterCells
}

function cellsFromSheet(sheet?: WorkspaceSheet) {
  return ensureCells(parseJsonArray<unknown>(sheet?.cells, starterCells))
}

function slidesFromDeck(deck?: WorkspaceDeck) {
  return parseJsonArray<WorkspaceDeck["slides"]>(deck?.slides, starterSlides).map((slide) => ({
    ...slide,
    accent: slide.accent || "Slide",
    layout: slide.layout || "title",
    theme: slide.theme || "midnight",
    speakerNotes: slide.speakerNotes || "",
  }))
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

function isHtml(value: string) {
  return /<\/?[a-z][\s\S]*>/i.test(value)
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function richTextContent(value: string) {
  if (!value.trim()) return "<p></p>"
  if (isHtml(value)) return value
  return value
    .split(/\n{2,}/)
    .map((block) => {
      if (block.startsWith("## ")) return `<h2>${escapeHtml(block.slice(3))}</h2>`
      if (block.startsWith("# ")) return `<h1>${escapeHtml(block.slice(2))}</h1>`
      return `<p>${escapeHtml(block).replace(/\n/g, "<br />")}</p>`
    })
    .join("")
}

function plainTextFromHtml(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
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
  const [section, setSection] = useState("All")
  const [viewMode, setViewMode] = useState<StudioViewMode>("list")
  const [status, setStatus] = useState("Loading Studio...")
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState("")
  const [inspectorTab, setInspectorTab] = useState("Info")
  const [selectedCell, setSelectedCell] = useState({ row: 0, column: 0 })
  const [selectedSlideIndex, setSelectedSlideIndex] = useState(0)

  const [layout, setLayout] = useState<StudioLayoutState>(() => createDefaultStudioLayout(initialKind, studioCreateLabels[initialKind]))

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
  const [slides, setSlides] = useState<WorkspaceDeck["slides"]>(starterSlides)

  useEffect(() => {
    setKind(initialKind)
    updateActivePaneKind(initialKind)
  }, [initialKind])

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LAYOUT_KEY)
      if (saved) setLayout(normalizeStudioLayout(JSON.parse(saved)))
    } catch {
      setLayout(createDefaultStudioLayout(initialKind, studioCreateLabels[initialKind]))
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout))
  }, [layout])

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
    setSelectedSlideIndex(0)
  }, [selectedDeck?.id])

  useEffect(() => {
    if (!options.notesAutosave || kind !== "notes" || !noteDraft?.id) return
    const timeout = window.setTimeout(() => {
      saveActive(true).catch(() => undefined)
    }, 1800)
    return () => window.clearTimeout(timeout)
  }, [options.notesAutosave, kind, noteDraft?.id, noteDraft?.title, noteHistory.present])

  const activeTab = studioTabs.find((tab) => tab.kind === kind) || studioTabs[0]
  const allItems = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const mapped: Array<{ id: string; kind: StudioKind; title: string; updated_at?: string; summary?: string; favorite?: boolean }> = [
      ...notes.map((item) => ({ id: item.id, kind: "notes" as StudioKind, title: item.title, updated_at: item.updated_at, summary: item.content, favorite: item.favorite })),
      ...docs.map((item) => ({ id: item.id, kind: "docs" as StudioKind, title: item.title, updated_at: item.updated_at, summary: textFromDocument(item) })),
      ...sheets.map((item) => ({ id: item.id, kind: "sheets" as StudioKind, title: item.title, updated_at: item.updated_at, summary: `${cellsFromSheet(item).length} rows` })),
      ...decks.map((item) => ({ id: item.id, kind: "slides" as StudioKind, title: item.title, updated_at: item.updated_at, summary: `${slidesFromDeck(item).length} slides` })),
    ]
    return mapped
      .filter((item) => section === "All" || section === "Recent" || (section === "Favorites" ? item.favorite : item.kind === section.toLowerCase()))
      .filter((item) => !needle || `${item.title} ${item.summary || ""}`.toLowerCase().includes(needle))
      .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")))
  }, [decks, docs, notes, query, section, sheets])

  function updateActivePaneKind(nextKind: StudioKind, itemId?: string, title?: string) {
    setLayout((current) => {
      const group = current.groups[0]
      const panes = group.panes.map((pane) => {
        if (pane.id !== current.activePaneId) return pane
        const tab = createStudioTab(nextKind, title || studioCreateLabels[nextKind], itemId)
        return { ...pane, activeTabId: tab.id, tabs: [...pane.tabs, tab].slice(-6) }
      })
      return normalizeStudioLayout({ ...current, groups: [{ ...group, panes }] })
    })
  }

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
    if (kind === "docs") return format === "export" ? plainTextFromHtml(docHistory.present) : docHistory.present
    if (kind === "sheets") return exportSheetToCsv({ cells: ensureCells(cells) })
    return format === "export"
      ? JSON.stringify({ title: deckTitle, slides }, null, 2)
      : slides.map((slide, index) => `Slide ${index + 1}: ${slide.title}\n${slide.body}\nNotes: ${slide.speakerNotes || ""}`).join("\n\n")
  }

  function activeSummary() {
    if (kind === "notes") return `${plainTextFromHtml(noteHistory.present).length} chars`
    if (kind === "docs") return `${plainTextFromHtml(docHistory.present).split(/\s+/).filter(Boolean).length} words`
    if (kind === "sheets") return `${ensureCells(cells).length} rows x ${ensureCells(cells)[0]?.length || 0} columns`
    return `${slides.length} slides`
  }

  function selectKind(nextKind: StudioKind) {
    setKind(nextKind)
    updateActivePaneKind(nextKind)
  }

  function applyTemplate(template: { title: string; body: string }) {
    if (kind === "notes") {
      setNoteDraft((current) => current ? { ...current, title: template.title } : current)
      setNoteHistory(pushHistory(noteHistory, template.body))
      return
    }
    if (kind === "docs") {
      setDocTitle(template.title)
      setDocHistory(pushHistory(docHistory, template.body))
      return
    }
    if (kind === "sheets") {
      setSheetTitle(template.title)
      setCells(importCsvToSheet(template.body).cells)
      return
    }
    setDeckTitle(template.title)
    setSlides(template.body.split("\n").map((line) => {
      const [title, body, accent] = line.split("|")
      return { title: title || "Slide", body: body || "Add the point.", accent: accent || "Slide", layout: "title", theme: "midnight", speakerNotes: "" }
    }))
  }

  async function createActive() {
    if (kind === "notes") {
      const response = await api<{ item: Note }>("/api/notes", {
        method: "POST",
        body: JSON.stringify({ title: "Untitled learning page", content: "<p></p>", template: "blank" }),
      })
      setNotes((current) => [response.item, ...current])
      setSelectedNoteId(response.item.id)
      updateActivePaneKind("notes", response.item.id, response.item.title)
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
          body: JSON.stringify({
            id: selectedDoc?.id,
            title: docTitle,
            content: { text: docHistory.present, markdown: plainTextFromHtml(docHistory.present), plainText: plainTextFromHtml(docHistory.present) },
            tags: selectedDoc?.tags || [],
          }),
        })
        setDocs((current) => [response.item, ...current.filter((item) => item.id !== response.item.id)])
        setDocId(response.item.id)
      }

      if (kind === "sheets") {
        const response = await api<{ item: WorkspaceSheet }>("/api/sheets", {
          method: selectedSheet?.id ? "PUT" : "POST",
          body: JSON.stringify({ id: selectedSheet?.id, title: sheetTitle, cells, history: [], frozenRows: 1 }),
        })
        setSheets((current) => [response.item, ...current.filter((item) => item.id !== response.item.id)])
        setSheetId(response.item.id)
      }

      if (kind === "slides") {
        const response = await api<{ item: WorkspaceDeck }>("/api/slides", {
          method: selectedDeck?.id ? "PUT" : "POST",
          body: JSON.stringify({ id: selectedDeck?.id, title: deckTitle, slides, speakerNotes: Object.fromEntries(slides.map((slide, index) => [index, slide.speakerNotes || ""])) }),
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
      const response = await api<{ item: WorkspaceDocument }>("/api/docs", { method: "POST", body: JSON.stringify({ title, content: { text: docHistory.present, plainText: plainTextFromHtml(docHistory.present) }, tags: [] }) })
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

  async function downloadActive(exportMode = false) {
    const base = fileTitle(activeTitle(), kind)
    if (kind === "sheets") return downloadText(`${base}.csv`, currentPayload("download"), "text/csv")
    if (kind === "slides" && exportMode) return exportPptx(base)
    if (kind === "slides") return downloadText(`${base}.json`, currentPayload("export"), "application/json")
    downloadText(`${base}.${exportMode ? "txt" : "html"}`, currentPayload(exportMode ? "export" : "download"), exportMode ? "text/plain" : "text/html")
  }

  async function exportPptx(base: string) {
    const pptxgen = (await import("pptxgenjs")).default
    const pptx = new pptxgen()
    pptx.layout = options.slidesAspect === "4:3" ? "LAYOUT_4X3" : "LAYOUT_WIDE"
    pptx.author = "LEARN"
    slides.forEach((draft) => {
      const slide = pptx.addSlide()
      slide.background = { color: draft.theme === "sunrise" ? "FFF3D6" : "111827" }
      slide.addText(draft.accent || "LEARN", { x: 0.5, y: 0.35, w: 2.2, h: 0.28, fontSize: 10, bold: true, color: draft.theme === "sunrise" ? "92400E" : "A7F3D0" })
      slide.addText(draft.title || "Slide", { x: 0.5, y: 0.8, w: 8.8, h: 0.7, fontSize: 28, bold: true, color: draft.theme === "sunrise" ? "111827" : "FFFFFF" })
      slide.addText(draft.body || "", { x: 0.55, y: 1.65, w: 8.4, h: 3.6, fontSize: 15, breakLine: false, color: draft.theme === "sunrise" ? "374151" : "D1D5DB", fit: "shrink" })
      if (draft.speakerNotes) slide.addNotes(draft.speakerNotes)
    })
    await pptx.writeFile({ fileName: `${base}.pptx` })
  }

  function selectItem(item: { id: string; kind: StudioKind; title: string }) {
    setKind(item.kind)
    if (item.kind === "notes") setSelectedNoteId(item.id)
    if (item.kind === "docs") setDocId(item.id)
    if (item.kind === "sheets") setSheetId(item.id)
    if (item.kind === "slides") setDeckId(item.id)
    updateActivePaneKind(item.kind, item.id, item.title)
  }

  function updateCell(rowIndex: number, cellIndex: number, value: string) {
    setCells((current) => current.map((row, nextRow) => (
      nextRow === rowIndex ? row.map((cell, nextCell) => (nextCell === cellIndex ? value : cell)) : row
    )))
  }

  const activePanes = layout.groups[0]?.panes || []
  const canUndoRedo = kind === "notes" || kind === "docs"
  const hasActiveItem = kind === "notes" ? Boolean(noteDraft) : true

  return (
    <div className="grid gap-3">
      <Panel className="p-2">
        <div className="flex flex-wrap items-center gap-2">
          {studioTabs.map((tab) => {
            const Icon = tab.icon
            const active = kind === tab.kind
            return (
              <button
                key={tab.kind}
                onClick={() => selectKind(tab.kind)}
                className={`flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-semibold ${active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground"}`}
                title={tab.description}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            )
          })}
          <span className="mx-1 hidden h-6 w-px bg-border md:block" />
          <StudioButton label="New" icon={Plus} onClick={createActive} primary />
          <StudioButton label="Save" icon={Save} onClick={() => saveActive()} disabled={!hasActiveItem} />
          <StudioButton label="Undo" icon={Undo2} onClick={() => kind === "notes" ? setNoteHistory(undoHistory(noteHistory)) : setDocHistory(undoHistory(docHistory))} disabled={!canUndoRedo} />
          <StudioButton label="Redo" icon={Redo2} onClick={() => kind === "notes" ? setNoteHistory(redoHistory(noteHistory)) : setDocHistory(redoHistory(docHistory))} disabled={!canUndoRedo} />
          <StudioMenu
            onCopy={copyActive}
            onDuplicate={duplicateActive}
            onArchive={archiveActive}
            onDownload={() => downloadActive(false)}
            onExport={() => downloadActive(true)}
            onSplitRight={() => setLayout((current) => splitStudioPane(current, current.activePaneId, "horizontal"))}
            onSplitDown={() => setLayout((current) => splitStudioPane(current, current.activePaneId, "vertical"))}
            onReset={() => setLayout(createDefaultStudioLayout(kind, activeTitle()))}
          />
          <button onClick={() => setLayout((current) => ({ ...current, inspectorOpen: !current.inspectorOpen }))} className="ml-auto flex h-9 items-center gap-2 rounded-md border border-border bg-secondary px-3 text-sm font-medium text-secondary-foreground hover:bg-accent hover:text-accent-foreground">
            <PanelRight className="h-4 w-4" />
            Inspector
          </button>
        </div>
      </Panel>

      <div className="grid gap-3 xl:grid-cols-[280px_1fr]">
        <Panel className="min-h-[74vh] p-3">
          <StudioLibrary
            items={allItems}
            query={query}
            section={section}
            viewMode={viewMode}
            onApplyTemplate={applyTemplate}
            onQuery={setQuery}
            onSection={setSection}
            onSelect={selectItem}
            onViewMode={setViewMode}
            activeKind={kind}
          />
        </Panel>

        <Panel className="min-w-0 p-0">
          <PanelGroup direction={layout.groups[0]?.direction || "horizontal"} className="min-h-[74vh]">
            {activePanes.map((pane, index) => (
              <ResizePanel key={pane.id} minSize={28} defaultSize={100 / activePanes.length}>
                <StudioPaneSurface
                  active={layout.activePaneId === pane.id}
                  activeKind={kind}
                  activeSummary={activeSummary()}
                  activeTitle={activeTitle()}
                  cells={cells}
                  docHistory={docHistory}
                  inspectorOpen={layout.inspectorOpen}
                  inspectorTab={inspectorTab}
                  lastSaved={lastSaved}
                  noteDraft={noteDraft}
                  noteHistory={noteHistory}
                  onArchive={archiveActive}
                  onClosePane={() => setLayout((current) => closeStudioPane(current, pane.id))}
                  onCopy={copyActive}
                  onDownload={() => downloadActive(false)}
                  onDuplicate={duplicateActive}
                  onExport={() => downloadActive(true)}
                  onRenamePane={(label) => setLayout((current) => normalizeStudioLayout({ ...current, groups: [{ ...current.groups[0], panes: current.groups[0].panes.map((item) => item.id === pane.id ? { ...item, label } : item) }] }))}
                  onSave={() => saveActive()}
                  onSelectPane={() => setLayout((current) => ({ ...current, activePaneId: pane.id }))}
                  onSetActiveTitle={setActiveTitle}
                  onSetCells={setCells}
                  onSetDocHistory={setDocHistory}
                  onSetInspectorTab={setInspectorTab}
                  onSetKind={(nextKind) => {
                    setKind(nextKind)
                    setLayout((current) => ({ ...current, activePaneId: pane.id }))
                  }}
                  onSetNoteHistory={setNoteHistory}
                  onSetSelectedCell={setSelectedCell}
                  onSetSelectedSlideIndex={setSelectedSlideIndex}
                  onSetSlides={setSlides}
                  onSplitDown={() => setLayout((current) => splitStudioPane(current, pane.id, "vertical"))}
                  onSplitRight={() => setLayout((current) => splitStudioPane(current, pane.id, "horizontal"))}
                  options={options}
                  pane={pane}
                  saving={saving}
                  selectedCell={selectedCell}
                  selectedSlideIndex={selectedSlideIndex}
                  slides={slides}
                  status={status}
                  updateCell={updateCell}
                />
              </ResizePanel>
            ))}
            {activePanes.length > 1 && activePanes.map((pane, index) => index < activePanes.length - 1 ? <PanelResizeHandle key={`${pane.id}_handle`} className="w-1 bg-border hover:bg-primary data-[resize-handle-active]:bg-primary" /> : null)}
          </PanelGroup>
        </Panel>
      </div>
    </div>
  )
}

function StudioLibrary({
  activeKind,
  items,
  onApplyTemplate,
  onQuery,
  onSection,
  onSelect,
  onViewMode,
  query,
  section,
  viewMode,
}: {
  activeKind: StudioKind
  items: Array<{ id: string; kind: StudioKind; title: string; updated_at?: string; summary?: string }>
  onApplyTemplate: (template: { title: string; body: string }) => void
  onQuery: (value: string) => void
  onSection: (value: string) => void
  onSelect: (item: { id: string; kind: StudioKind; title: string }) => void
  onViewMode: (value: StudioViewMode) => void
  query: string
  section: string
  viewMode: StudioViewMode
}) {
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-1">
        {sections.map((item) => (
          <button key={item} onClick={() => onSection(item)} className={`h-8 rounded-md px-2 text-xs font-semibold ${section === item ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground"}`}>
            {item}
          </button>
        ))}
      </div>
      <label className="flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search Studio" className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
      </label>
      <div className="grid grid-cols-3 gap-1 rounded-md border border-border bg-background p-1">
        <ViewModeButton active={viewMode === "list"} icon={FileText} label="List" onClick={() => onViewMode("list")} />
        <ViewModeButton active={viewMode === "board"} icon={Columns3} label="Board" onClick={() => onViewMode("board")} />
        <ViewModeButton active={viewMode === "gallery"} icon={LayoutPanelLeft} label="Gallery" onClick={() => onViewMode("gallery")} />
      </div>
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>
          <div className={`grid gap-2 ${viewMode === "gallery" ? "grid-cols-2" : ""}`}>
            {items.map((item) => (
              <button key={`${item.kind}_${item.id}`} onClick={() => onSelect(item)} className="rounded-md border border-border bg-background p-3 text-left text-sm hover:bg-accent hover:text-accent-foreground">
                <span className="flex items-center gap-2 font-medium text-foreground">
                  {item.kind === "sheets" ? <Table2 className="h-4 w-4" /> : item.kind === "slides" ? <Presentation className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                  <span className="line-clamp-1">{item.title}</span>
                </span>
                <span className="mt-1 block text-xs capitalize text-muted-foreground">{item.kind} - {item.updated_at ? formatDate(item.updated_at) : item.summary || "Draft"}</span>
              </button>
            ))}
            {!items.length ? <EmptyState title="No Studio items" body="Create a note, doc, sheet, or deck, then open it in a split pane." /> : null}
          </div>
        </ContextMenu.Trigger>
        <StudioContextContent onCopy={() => undefined} onDuplicate={() => undefined} onArchive={() => undefined} onAskAi={() => undefined} />
      </ContextMenu.Root>
      <div className="rounded-md border border-border bg-background p-2">
        <p className="mb-2 flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          <FilePlus2 className="h-3.5 w-3.5" />
          Templates
        </p>
        <div className="grid grid-cols-2 gap-1">
          {studioTemplates[activeKind].map((template) => (
            <button key={template.label} onClick={() => onApplyTemplate(template)} className="rounded-md bg-secondary px-2 py-2 text-left text-xs font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground">
              {template.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function StudioPaneSurface({
  active,
  activeKind,
  activeSummary,
  activeTitle,
  cells,
  docHistory,
  inspectorOpen,
  inspectorTab,
  lastSaved,
  noteDraft,
  noteHistory,
  onArchive,
  onClosePane,
  onCopy,
  onDownload,
  onDuplicate,
  onExport,
  onRenamePane,
  onSave,
  onSelectPane,
  onSetActiveTitle,
  onSetCells,
  onSetDocHistory,
  onSetInspectorTab,
  onSetKind,
  onSetNoteHistory,
  onSetSelectedCell,
  onSetSelectedSlideIndex,
  onSetSlides,
  onSplitDown,
  onSplitRight,
  options,
  pane,
  saving,
  selectedCell,
  selectedSlideIndex,
  slides,
  status,
  updateCell,
}: {
  active: boolean
  activeKind: StudioKind
  activeSummary: string
  activeTitle: string
  cells: string[][]
  docHistory: HistoryState<string>
  inspectorOpen: boolean
  inspectorTab: string
  lastSaved: string
  noteDraft: Note | null
  noteHistory: HistoryState<string>
  onArchive: () => void
  onClosePane: () => void
  onCopy: () => void
  onDownload: () => void
  onDuplicate: () => void
  onExport: () => void
  onRenamePane: (value: string) => void
  onSave: () => void
  onSelectPane: () => void
  onSetActiveTitle: (value: string) => void
  onSetCells: React.Dispatch<React.SetStateAction<string[][]>>
  onSetDocHistory: React.Dispatch<React.SetStateAction<HistoryState<string>>>
  onSetInspectorTab: (value: string) => void
  onSetKind: (kind: StudioKind) => void
  onSetNoteHistory: React.Dispatch<React.SetStateAction<HistoryState<string>>>
  onSetSelectedCell: (value: { row: number; column: number }) => void
  onSetSelectedSlideIndex: (value: number) => void
  onSetSlides: React.Dispatch<React.SetStateAction<WorkspaceDeck["slides"]>>
  onSplitDown: () => void
  onSplitRight: () => void
  options: WorkspaceOptions
  pane: StudioPane
  saving: boolean
  selectedCell: { row: number; column: number }
  selectedSlideIndex: number
  slides: WorkspaceDeck["slides"]
  status: string
  updateCell: (rowIndex: number, cellIndex: number, value: string) => void
}) {
  const activeTab = studioTabs.find((tab) => tab.kind === activeKind) || studioTabs[0]
  const Icon = activeTab.icon
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <section onFocus={onSelectPane} onClick={onSelectPane} className={`flex h-full min-w-0 flex-col border-border ${active ? "bg-card" : "bg-background/70"}`}>
          <div className={`border-b border-border p-3 ${active ? "ring-1 ring-inset ring-primary/40" : ""}`}>
            <div className="flex flex-wrap items-center gap-2">
              <input value={pane.label} onChange={(event) => onRenamePane(event.target.value)} className="h-8 w-24 rounded-md border border-border bg-secondary px-2 text-xs font-semibold text-secondary-foreground outline-none focus:border-ring" title="Rename order group" />
              <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
                {pane.tabs.map((tab: StudioTab) => {
                  const tabActive = tab.kind === activeKind
                  return (
                    <button key={tab.id} onClick={() => onSetKind(tab.kind)} className={`flex h-8 items-center gap-1.5 rounded-md border px-2 text-xs font-semibold ${tabActive ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground"}`}>
                      {tab.kind}
                      {tab.pinned ? <Maximize2 className="h-3 w-3" /> : null}
                    </button>
                  )
                })}
              </div>
              <button onClick={onSplitRight} className="icon-button" title="Split right"><SplitSquareHorizontal className="h-4 w-4" /></button>
              <button onClick={onSplitDown} className="icon-button" title="Split down"><SplitSquareVertical className="h-4 w-4" /></button>
              <button onClick={onClosePane} className="icon-button" title="Close pane"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-3 flex flex-wrap items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{activeTab.label} Studio</p>
                <input value={activeTitle} onChange={(event) => onSetActiveTitle(event.target.value)} className="mt-1 w-full bg-transparent text-2xl font-semibold text-foreground outline-none" />
                <p className="mt-1 text-xs text-muted-foreground">{saving ? "Saving..." : lastSaved ? `Saved ${lastSaved}` : `${activeSummary} - ${activeTab.description}`}</p>
              </div>
              <div className="flex flex-wrap gap-1">
                <MiniAction icon={Save} label="Save" onClick={onSave} />
                <MiniAction icon={Clipboard} label="Copy" onClick={onCopy} />
                <MiniAction icon={Download} label="Download" onClick={onDownload} />
                <MiniAction icon={PanelRight} label="Export" onClick={onExport} />
              </div>
            </div>
          </div>
          {status ? <p className="mx-3 mt-3 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">{status}</p> : null}
          <div className={`grid min-h-0 flex-1 ${inspectorOpen ? "xl:grid-cols-[1fr_260px]" : ""}`}>
            <div className="min-h-0 overflow-auto p-3">
              <StudioCanvas
                activeKind={activeKind}
                cells={cells}
                docHistory={docHistory}
                noteDraft={noteDraft}
                noteHistory={noteHistory}
                onArchive={onArchive}
                onDuplicate={onDuplicate}
                onSetCells={onSetCells}
                onSetDocHistory={onSetDocHistory}
                onSetNoteHistory={onSetNoteHistory}
                onSetSelectedCell={onSetSelectedCell}
                onSetSelectedSlideIndex={onSetSelectedSlideIndex}
                onSetSlides={onSetSlides}
                options={options}
                selectedCell={selectedCell}
                selectedSlideIndex={selectedSlideIndex}
                slides={slides}
                updateCell={updateCell}
              />
            </div>
            {inspectorOpen ? (
              <StudioInspector
                activeKind={activeKind}
                activeSummary={activeSummary}
                cells={cells}
                currentTitle={activeTitle}
                inspectorTab={inspectorTab}
                onSetInspectorTab={onSetInspectorTab}
                selectedCell={selectedCell}
                selectedSlideIndex={selectedSlideIndex}
                slides={slides}
              />
            ) : null}
          </div>
        </section>
      </ContextMenu.Trigger>
      <StudioContextContent onCopy={onCopy} onDuplicate={onDuplicate} onArchive={onArchive} onAskAi={() => onSetInspectorTab("AI")} />
    </ContextMenu.Root>
  )
}

function StudioCanvas({
  activeKind,
  cells,
  docHistory,
  noteDraft,
  noteHistory,
  onArchive,
  onDuplicate,
  onSetCells,
  onSetDocHistory,
  onSetNoteHistory,
  onSetSelectedCell,
  onSetSelectedSlideIndex,
  onSetSlides,
  options,
  selectedCell,
  selectedSlideIndex,
  slides,
  updateCell,
}: {
  activeKind: StudioKind
  cells: string[][]
  docHistory: HistoryState<string>
  noteDraft: Note | null
  noteHistory: HistoryState<string>
  onArchive: () => void
  onDuplicate: () => void
  onSetCells: React.Dispatch<React.SetStateAction<string[][]>>
  onSetDocHistory: React.Dispatch<React.SetStateAction<HistoryState<string>>>
  onSetNoteHistory: React.Dispatch<React.SetStateAction<HistoryState<string>>>
  onSetSelectedCell: (value: { row: number; column: number }) => void
  onSetSelectedSlideIndex: (value: number) => void
  onSetSlides: React.Dispatch<React.SetStateAction<WorkspaceDeck["slides"]>>
  options: WorkspaceOptions
  selectedCell: { row: number; column: number }
  selectedSlideIndex: number
  slides: WorkspaceDeck["slides"]
  updateCell: (rowIndex: number, cellIndex: number, value: string) => void
}) {
  if (activeKind === "notes") {
    if (!noteDraft) return <EmptyState title="No note selected" body="Create or choose a note to begin capturing your learning." />
    return <RichTextEditor value={noteHistory.present} onChange={(value) => onSetNoteHistory(pushHistory(noteHistory, value))} large={options.noteEditorSize === "large"} placeholder="Write notes, formulas, reflections, links, media cues, and AI-generated drafts..." />
  }

  if (activeKind === "docs") {
    return <RichTextEditor value={docHistory.present} onChange={(value) => onSetDocHistory(pushHistory(docHistory, value))} large placeholder="Draft headings, checklists, explanations, citations, tables, and practice tasks..." />
  }

  if (activeKind === "sheets") {
    const visibleCells = ensureCells(cells)
    return (
      <div className="grid gap-3">
        <div className="flex flex-wrap gap-2">
          <SheetButton label="Row +" onClick={() => onSetCells((current) => addRow(ensureCells(current), selectedCell.row))} icon={Rows3} />
          <SheetButton label="Row -" onClick={() => onSetCells((current) => deleteRow(ensureCells(current), selectedCell.row))} icon={Trash2} />
          <SheetButton label="Col +" onClick={() => onSetCells((current) => addColumn(ensureCells(current), selectedCell.column))} icon={Columns3} />
          <SheetButton label="Col -" onClick={() => onSetCells((current) => deleteColumn(ensureCells(current), selectedCell.column))} icon={Trash2} />
          <SheetButton label="Move row" onClick={() => onSetCells((current) => moveRow(ensureCells(current), selectedCell.row, -1))} icon={Scissors} />
          <SheetButton label="Move col" onClick={() => onSetCells((current) => moveColumn(ensureCells(current), selectedCell.column, 1))} icon={Scissors} />
        </div>
        <textarea
          onBlur={(event) => {
            if (!event.target.value.trim()) return
            onSetCells(importCsvToSheet(event.target.value).cells)
            event.target.value = ""
          }}
          placeholder="Paste CSV here, then leave the field to import rows into the grid."
          className="h-16 w-full rounded-md border border-input bg-background p-3 text-sm outline-none focus:border-ring"
        />
        <div className="overflow-auto rounded-md border border-border">
          <table className="min-w-full border-collapse text-sm">
            <tbody>
              {visibleCells.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <ContextMenu.Root key={`${rowIndex}-${cellIndex}`}>
                      <ContextMenu.Trigger asChild>
                        <td className={`border border-border p-0 ${rowIndex === 0 ? "bg-secondary" : "bg-background"}`}>
                          <input
                            value={cell}
                            onFocus={() => onSetSelectedCell({ row: rowIndex, column: cellIndex })}
                            onChange={(event) => updateCell(rowIndex, cellIndex, event.target.value)}
                            className={`h-10 min-w-36 bg-transparent px-2 outline-none focus:bg-accent focus:text-accent-foreground ${selectedCell.row === rowIndex && selectedCell.column === cellIndex ? "ring-2 ring-inset ring-primary" : ""}`}
                          />
                        </td>
                      </ContextMenu.Trigger>
                      <StudioContextContent
                        onCopy={() => navigator.clipboard?.writeText(cell)}
                        onDuplicate={() => onSetCells((current) => addColumn(ensureCells(current), cellIndex))}
                        onArchive={() => onSetCells((current) => deleteColumn(ensureCells(current), cellIndex))}
                        onAskAi={() => undefined}
                      />
                    </ContextMenu.Root>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  const selectedSlide = slides[selectedSlideIndex] || slides[0]
  return (
    <div className="grid min-h-[58vh] gap-3 lg:grid-cols-[150px_1fr_230px]">
      <div className="space-y-2 overflow-auto">
        <button onClick={() => onSetSlides([...slides, { title: "New slide", body: "Add the point, image cue, or quiz prompt.", accent: "New", layout: "title", theme: "midnight", speakerNotes: "" }])} className="flex h-9 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-primary-foreground">
          <Plus className="h-4 w-4" /> Slide
        </button>
        {slides.map((slide, index) => (
          <ContextMenu.Root key={index}>
            <ContextMenu.Trigger asChild>
              <button onClick={() => onSetSelectedSlideIndex(index)} className={`w-full rounded-md border p-2 text-left ${selectedSlideIndex === index ? "border-primary bg-primary/10" : "border-border bg-background hover:bg-accent"}`}>
                <span className="block text-xs font-semibold text-muted-foreground">Slide {index + 1}</span>
                <span className="line-clamp-2 text-sm font-medium text-foreground">{slide.title}</span>
              </button>
            </ContextMenu.Trigger>
            <StudioContextContent
              onCopy={() => navigator.clipboard?.writeText(`${slide.title}\n${slide.body}`)}
              onDuplicate={() => onSetSlides((current) => duplicateSlide(current, index))}
              onArchive={() => onSetSlides((current) => current.length > 1 ? current.filter((_, next) => next !== index) : current)}
              onAskAi={() => undefined}
            />
          </ContextMenu.Root>
        ))}
      </div>
      <div className={`${options.slidesAspect === "4:3" ? "aspect-[4/3]" : "aspect-video"} rounded-lg border border-border bg-[#111827] p-8 text-white shadow-sm`}>
        {selectedSlide ? (
          <div className="flex h-full flex-col">
            <input value={selectedSlide.accent || ""} onChange={(event) => onSetSlides(slides.map((item, next) => next === selectedSlideIndex ? { ...item, accent: event.target.value } : item))} className="mb-3 w-full bg-transparent text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200 outline-none" />
            <input value={selectedSlide.title} onChange={(event) => onSetSlides(slides.map((item, next) => next === selectedSlideIndex ? { ...item, title: event.target.value } : item))} className="w-full bg-transparent text-4xl font-semibold leading-tight outline-none" />
            <textarea value={selectedSlide.body} onChange={(event) => onSetSlides(slides.map((item, next) => next === selectedSlideIndex ? { ...item, body: event.target.value } : item))} className="mt-5 min-h-32 flex-1 resize-none bg-transparent text-lg leading-8 text-slate-200 outline-none" />
          </div>
        ) : null}
      </div>
      <div className="grid gap-3">
        <SelectLike label="Layout" value={selectedSlide?.layout || "title"} options={["title", "two-column", "image", "quote"]} onChange={(value) => onSetSlides(slides.map((item, next) => next === selectedSlideIndex ? { ...item, layout: value as WorkspaceDeck["slides"][number]["layout"] } : item))} />
        <SelectLike label="Theme" value={selectedSlide?.theme || "midnight"} options={["midnight", "sunrise", "plain"]} onChange={(value) => onSetSlides(slides.map((item, next) => next === selectedSlideIndex ? { ...item, theme: value } : item))} />
        <textarea value={selectedSlide?.speakerNotes || ""} onChange={(event) => onSetSlides(slides.map((item, next) => next === selectedSlideIndex ? { ...item, speakerNotes: event.target.value } : item))} placeholder="Speaker notes" className="min-h-32 rounded-md border border-input bg-background p-3 text-sm text-foreground outline-none focus:border-ring" />
        <div className="grid grid-cols-2 gap-2">
          <SheetButton label="Up" onClick={() => onSetSlides((current) => moveSlide(current, selectedSlideIndex, -1))} icon={ChevronDown} />
          <SheetButton label="Down" onClick={() => onSetSlides((current) => moveSlide(current, selectedSlideIndex, 1))} icon={ChevronDown} />
          <SheetButton label="Copy" onClick={() => onSetSlides((current) => duplicateSlide(current, selectedSlideIndex))} icon={Copy} />
          <SheetButton label="Delete" onClick={() => onSetSlides((current) => current.length > 1 ? current.filter((_, index) => index !== selectedSlideIndex) : current)} icon={Trash2} />
        </div>
      </div>
    </div>
  )
}

function RichTextEditor({ large, onChange, placeholder, value }: { large?: boolean; onChange: (value: string) => void; placeholder: string; value: string }) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ underline: false }),
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Link.configure({ openOnClick: false }),
      Image,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
      CharacterCount,
      Placeholder.configure({ placeholder }),
    ],
    content: richTextContent(value),
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  })

  useEffect(() => {
    if (!editor) return
    const next = richTextContent(value)
    if (editor.getHTML() !== next) editor.commands.setContent(next, { emitUpdate: false })
  }, [editor, value])

  return (
    <div className="rounded-md border border-border bg-background">
      <RichTextToolbar editor={editor} />
      <EditorContent
        editor={editor}
        className={`${large ? "min-h-[62vh]" : "min-h-[52vh]"} px-5 py-4 text-foreground [&_.ProseMirror]:min-h-[48vh] [&_.ProseMirror]:outline-none [&_blockquote]:border-l-4 [&_blockquote]:border-primary [&_blockquote]:pl-3 [&_h1]:text-3xl [&_h1]:font-semibold [&_h2]:text-2xl [&_h2]:font-semibold [&_p]:leading-8 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:p-2 [&_th]:border [&_th]:border-border [&_th]:bg-secondary [&_th]:p-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6`}
      />
    </div>
  )
}

function RichTextToolbar({ editor }: { editor: Editor | null }) {
  const run = (fn: (editor: Editor) => void) => {
    if (!editor) return
    fn(editor)
    editor.commands.focus()
  }
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-1 border-b border-border bg-card/95 p-2 backdrop-blur">
      <ToolbarIcon label="Paragraph" icon={Type} onClick={() => run((item) => item.chain().focus().setParagraph().run())} />
      <ToolbarIcon label="H1" icon={Heading1} onClick={() => run((item) => item.chain().focus().toggleHeading({ level: 1 }).run())} />
      <ToolbarIcon label="H2" icon={Heading2} onClick={() => run((item) => item.chain().focus().toggleHeading({ level: 2 }).run())} />
      <span className="mx-1 h-5 w-px bg-border" />
      <ToolbarIcon label="Bold" icon={Bold} onClick={() => run((item) => item.chain().focus().toggleBold().run())} />
      <ToolbarIcon label="Italic" icon={Italic} onClick={() => run((item) => item.chain().focus().toggleItalic().run())} />
      <ToolbarIcon label="Underline" icon={UnderlineIcon} onClick={() => run((item) => item.chain().focus().toggleUnderline().run())} />
      <ToolbarIcon label="Highlight" icon={Highlighter} onClick={() => run((item) => item.chain().focus().toggleHighlight({ color: "#fef08a" }).run())} />
      <span className="mx-1 h-5 w-px bg-border" />
      <ToolbarIcon label="Left" icon={AlignLeft} onClick={() => run((item) => item.chain().focus().setTextAlign("left").run())} />
      <ToolbarIcon label="Center" icon={AlignCenter} onClick={() => run((item) => item.chain().focus().setTextAlign("center").run())} />
      <ToolbarIcon label="Right" icon={AlignRight} onClick={() => run((item) => item.chain().focus().setTextAlign("right").run())} />
      <ToolbarIcon label="Bullets" icon={List} onClick={() => run((item) => item.chain().focus().toggleBulletList().run())} />
      <ToolbarIcon label="Numbers" icon={ListOrdered} onClick={() => run((item) => item.chain().focus().toggleOrderedList().run())} />
      <ToolbarIcon label="Tasks" icon={CheckSquare} onClick={() => run((item) => item.chain().focus().toggleTaskList().run())} />
      <ToolbarIcon label="Table" icon={Grid2X2} onClick={() => run((item) => item.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())} />
      <ToolbarIcon label="Code" icon={Braces} onClick={() => run((item) => item.chain().focus().toggleCodeBlock().run())} />
      <ToolbarIcon label="Image cue" icon={ImageIcon} onClick={() => {
        const src = window.prompt("Image URL")
        if (src) run((item) => item.chain().focus().setImage({ src }).run())
      }} />
    </div>
  )
}

function StudioInspector({
  activeKind,
  activeSummary,
  cells,
  currentTitle,
  inspectorTab,
  onSetInspectorTab,
  selectedCell,
  selectedSlideIndex,
  slides,
}: {
  activeKind: StudioKind
  activeSummary: string
  cells: string[][]
  currentTitle: string
  inspectorTab: string
  onSetInspectorTab: (value: string) => void
  selectedCell: { row: number; column: number }
  selectedSlideIndex: number
  slides: WorkspaceDeck["slides"]
}) {
  return (
    <aside className="hidden border-l border-border bg-background p-3 xl:block">
      <div className="mb-3 flex flex-wrap gap-1">
        {inspectorTabs.map((tab) => (
          <button key={tab} onClick={() => onSetInspectorTab(tab)} className={`rounded-md px-2 py-1 text-xs font-semibold ${inspectorTab === tab ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground"}`}>
            {tab}
          </button>
        ))}
      </div>
      <div className="space-y-3 text-sm">
        <InspectorCard title="Item" body={currentTitle} />
        <InspectorCard title="Type" body={activeKind} />
        <InspectorCard title="State" body={activeSummary} />
        {activeKind === "sheets" ? <InspectorCard title="Cell" body={`R${selectedCell.row + 1} C${selectedCell.column + 1}: ${cells[selectedCell.row]?.[selectedCell.column] || "blank"}`} /> : null}
        {activeKind === "slides" ? <InspectorCard title="Slide" body={`${selectedSlideIndex + 1} / ${slides.length}: ${slides[selectedSlideIndex]?.layout || "title"}`} /> : null}
        {inspectorTab === "AI" ? <InspectorCard title="AI actions" body="Summarize, rewrite, translate, generate quiz, flashcards, or a study route from this active Studio item." /> : null}
        {inspectorTab === "History" ? <InspectorCard title="History" body="Undo/redo is local; saved versions and audit entries stay tied to the record APIs." /> : null}
        {inspectorTab === "Export" ? <InspectorCard title="Export" body="Docs export HTML/text, sheets export CSV, slides export JSON or PPTX." /> : null}
      </div>
    </aside>
  )
}

function StudioMenu({
  onArchive,
  onCopy,
  onDownload,
  onDuplicate,
  onExport,
  onReset,
  onSplitDown,
  onSplitRight,
}: {
  onArchive: () => void
  onCopy: () => void
  onDownload: () => void
  onDuplicate: () => void
  onExport: () => void
  onReset: () => void
  onSplitDown: () => void
  onSplitRight: () => void
}) {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <button className="flex h-9 items-center gap-2 rounded-md border border-border bg-secondary px-3 text-sm font-medium text-secondary-foreground hover:bg-accent hover:text-accent-foreground">
          <MoreHorizontal className="h-4 w-4" />
          More
        </button>
      </ContextMenu.Trigger>
      <StudioContextContent onCopy={onCopy} onDuplicate={onDuplicate} onArchive={onArchive} onAskAi={() => undefined}>
        <ContextMenu.Item onClick={onDownload} className="context-item"><Download className="h-4 w-4" /> Download</ContextMenu.Item>
        <ContextMenu.Item onClick={onExport} className="context-item"><PanelRight className="h-4 w-4" /> Export</ContextMenu.Item>
        <ContextMenu.Item onClick={onSplitRight} className="context-item"><SplitSquareHorizontal className="h-4 w-4" /> Split right</ContextMenu.Item>
        <ContextMenu.Item onClick={onSplitDown} className="context-item"><SplitSquareVertical className="h-4 w-4" /> Split down</ContextMenu.Item>
        <ContextMenu.Item onClick={onReset} className="context-item"><Settings2 className="h-4 w-4" /> Reset layout</ContextMenu.Item>
      </StudioContextContent>
    </ContextMenu.Root>
  )
}

function StudioContextContent({ children, onArchive, onAskAi, onCopy, onDuplicate }: { children?: React.ReactNode; onArchive: () => void; onAskAi: () => void; onCopy: () => void; onDuplicate: () => void }) {
  return (
    <ContextMenu.Portal>
      <ContextMenu.Content className="z-50 min-w-48 rounded-md border border-border bg-popover p-1 text-sm text-popover-foreground shadow-xl">
        <ContextMenu.Item onClick={onCopy} className="context-item"><Clipboard className="h-4 w-4" /> Copy</ContextMenu.Item>
        <ContextMenu.Item onClick={onDuplicate} className="context-item"><Copy className="h-4 w-4" /> Duplicate</ContextMenu.Item>
        <ContextMenu.Item onClick={onAskAi} className="context-item"><Bot className="h-4 w-4" /> Ask AI</ContextMenu.Item>
        {children}
        <ContextMenu.Separator className="my-1 h-px bg-border" />
        <ContextMenu.Item onClick={onArchive} className="context-item text-destructive"><Archive className="h-4 w-4" /> Archive/Delete</ContextMenu.Item>
      </ContextMenu.Content>
    </ContextMenu.Portal>
  )
}

function ViewModeButton({ active, icon: Icon, label, onClick }: { active: boolean; icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex h-8 items-center justify-center gap-1.5 rounded-md text-xs font-semibold ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"}`}>
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  )
}

function StudioButton({ disabled, icon: Icon, label, onClick, primary }: { disabled?: boolean; icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void; primary?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className={`flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-45 ${primary ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground"}`}>
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </button>
  )
}

function MiniAction({ icon: Icon, label, onClick }: { icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void }) {
  return <button onClick={onClick} className="icon-button" title={label}><Icon className="h-4 w-4" /></button>
}

function ToolbarIcon({ icon: Icon, label, onClick }: { icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void }) {
  return <button onClick={onClick} className="icon-button" title={label} type="button"><Icon className="h-4 w-4" /></button>
}

function SheetButton({ icon: Icon, label, onClick }: { icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex h-9 items-center gap-2 rounded-md border border-border bg-secondary px-3 text-sm font-medium text-secondary-foreground hover:bg-accent hover:text-accent-foreground">
      <Icon className="h-4 w-4" />
      {label}
    </button>
  )
}

function SelectLike({ label, onChange, options, value }: { label: string; onChange: (value: string) => void; options: string[]; value: string }) {
  return (
    <label className="grid gap-1 text-sm text-foreground">
      <span className="font-semibold">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-foreground">
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  )
}

function InspectorCard({ body, title }: { body: string; title: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{title}</p>
      <p className="mt-2 break-words text-foreground">{body}</p>
    </div>
  )
}
