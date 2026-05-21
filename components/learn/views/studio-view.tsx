"use client"

import { Fragment, useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import type React from "react"
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core"
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import * as ContextMenu from "@radix-ui/react-context-menu"
import { useVirtualizer } from "@tanstack/react-virtual"
import { Extension } from "@tiptap/core"
import { Panel as ResizePanel, PanelGroup, PanelResizeHandle } from "react-resizable-panels"
import { EditorContent, useEditor, type Editor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Underline from "@tiptap/extension-underline"
import TextAlign from "@tiptap/extension-text-align"
import { TextStyle } from "@tiptap/extension-text-style"
import FontFamily from "@tiptap/extension-font-family"
import Typography from "@tiptap/extension-typography"
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
  Heading3,
  Highlighter,
  ImageIcon,
  Italic,
  LayoutPanelLeft,
  List,
  ListOrdered,
  Maximize2,
  Minus,
  MoreHorizontal,
  PanelRight,
  Paintbrush,
  Plus,
  Presentation,
  Quote,
  Redo2,
  RotateCcw,
  Rows3,
  Save,
  Scissors,
  Search,
  Settings2,
  SplitSquareHorizontal,
  SplitSquareVertical,
  Strikethrough,
  Table2,
  Trash2,
  Type,
  Underline as UnderlineIcon,
  Undo2,
  UploadCloud,
  X,
} from "lucide-react"
import { api, formatDate } from "../api"
import type { Note, SlideObject, StudioDirtyBadge, StudioKind, StudioLayoutState, StudioPane, StudioTab, WorkspaceDeck, WorkspaceDocument, WorkspaceSheet } from "../types"
import type { WorkspaceOptions } from "../preferences"
import { EmptyState, Panel } from "../ui"
import {
  addColumn,
  addRow,
  buildSheetFormula,
  buildStudioRecordActionGroups,
  closeOtherStudioPanes,
  closeStudioPane,
  computeStudioDirtyBadges,
  createDefaultStudioLayout,
  createStudioTab,
  deleteColumn,
  deleteRow,
  duplicateSlide,
  evaluateSheetFormula,
  fillSheetRange,
  moveColumn,
  moveRow,
  moveSlide,
  normalizeStudioLayout,
  pinStudioPane,
  sortSheetByColumn,
  splitStudioPane,
  type StudioRecordActionId,
} from "@/lib/studio-features"
import { createHistoryState, exportSheetToCsv, importCsvToSheet, pushHistory, redoHistory, replaceTextInHtml, summarizeDocumentHtml, undoHistory, type HistoryState } from "@/lib/workspace-features"
import { clearStudioDraft, readStudioDrafts, shouldAnnounceStudioDraftSave, STUDIO_DRAFT_EVENT, summarizeStudioDrafts, writeStudioDraft, type StudioDraftRecord, type StudioDraftSummary } from "@/lib/studio-drafts"
import { studioFontOptions, studioFontSizeOptions, studioHighlightColorOptions, studioTextColorOptions } from "@/lib/studio-formatting"
import { getStudioKindOption, getStudioViewModeOption, studioEmptyTabLabels, studioInspectorTabs, studioKindOptions, studioSectionFilters, studioViewModeOptions, type StudioViewMode } from "@/lib/studio-navigation"
import { blankDeckFingerprint, blankDeckSlides, blankDeckTitle, blankDocTitle, blankNoteTitle, blankRichText, blankSheetCells, blankSheetFingerprint, blankSheetTitle, ensureSheetCells, parseDeckSlides, parseSheetCells } from "@/lib/studio-defaults"
import { getImportDestinationView, importTargetOptions, labelImportTarget, normalizeImportTargetSelection, type ImportTarget, type ImportTargetSelection } from "@/lib/import-gateway"
import { applySlideDesignPreset, buildSlideExportPayload, buildSlidePresenterOutline, createSlideDesignObject, documentInsertGroups, getDocumentInsertBlock, removeSlideDesignObject, slideAnimationPresets, slideDesignPresets, slideTransitionPresets, summarizeSlideShow, updateSlideDesignObject, type DocumentInsertKind } from "@/lib/studio-design"

const LAYOUT_KEY = "learn_studio_layout_v2"
const HEADING_STYLE_KEY = "learn_heading_styles_v1"
const DRAFT_TAB_TITLE_PATTERN = /^New (Note|Doc|Sheet|Deck)$/i
const NUMBERED_EMPTY_TAB_PATTERN = /^\d+\s+(Notes|Docs|Sheets|Slides)$/i

const studioKindIcons: Record<StudioKind, React.ComponentType<{ className?: string }>> = {
  notes: FileText,
  docs: BookOpen,
  sheets: Table2,
  slides: Presentation,
}

const studioViewModeIcons: Record<StudioViewMode, React.ComponentType<{ className?: string }>> = {
  list: FileText,
  board: Columns3,
  gallery: LayoutPanelLeft,
}

type StudioListItem = {
  id: string
  kind: StudioKind
  title: string
  updated_at?: string
  summary?: string
  favorite?: boolean
  archived_at?: string | null
}

type StudioRecordItem = Pick<StudioListItem, "id" | "kind" | "title">
type StudioPanePreview = {
  kind: StudioKind
  summary: string
  title: string
  updatedAt?: string
}

const studioCreateLabels: Record<StudioKind, string> = {
  notes: "New Note",
  docs: "New Doc",
  sheets: "New Sheet",
  slides: "New Deck",
}

type HeadingStyleLevel = 1 | 2 | 3
type HeadingStylePreset = {
  color?: string
  fontFamily?: string
  fontSize?: string
}

const FontSize = Extension.create({
  name: "fontSize",
  addGlobalAttributes() {
    return [
      {
        types: ["textStyle"],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element: HTMLElement) => element.style.fontSize || null,
            renderHTML: (attributes: { fontSize?: string | null }) => attributes.fontSize ? { style: `font-size: ${attributes.fontSize}` } : {},
          },
        },
      },
    ]
  },
})

const studioKindStyles: Record<StudioKind, { accent: string; card: string; chip: string; icon: string; label: string }> = {
  notes: {
    accent: "bg-amber-400",
    card: "hover:border-amber-400/70 hover:bg-amber-50/70 dark:hover:bg-amber-950/20",
    chip: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
    icon: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-200",
    label: "Note",
  },
  docs: {
    accent: "bg-sky-500",
    card: "hover:border-sky-500/70 hover:bg-sky-50/70 dark:hover:bg-sky-950/20",
    chip: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
    icon: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-200",
    label: "Doc",
  },
  sheets: {
    accent: "bg-emerald-500",
    card: "hover:border-emerald-500/70 hover:bg-emerald-50/70 dark:hover:bg-emerald-950/20",
    chip: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
    icon: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200",
    label: "Sheet",
  },
  slides: {
    accent: "bg-orange-500",
    card: "hover:border-orange-500/70 hover:bg-orange-50/70 dark:hover:bg-orange-950/20",
    chip: "bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200",
    icon: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-200",
    label: "Slide",
  },
}

const docTemplates = {
  study: "<h1>New learning doc</h1><h2>Summary</h2><p></p><h2>Key examples</h2><p></p><h2>Practice tasks</h2><p></p>",
  cornell: "<h1>Cornell notes</h1><h2>Cues</h2><p></p><h2>Notes</h2><p></p><h2>Summary</h2><p></p>",
  project: "<h1>Learning project</h1><h2>Goal</h2><p></p><h2>Steps</h2><p></p><h2>Evidence</h2><p></p><h2>Reflection</h2><p></p>",
  brief: "<h1>One-page brief</h1><h2>Decision</h2><p></p><h2>Evidence</h2><p></p><h2>Tradeoffs</h2><p></p><h2>Next action</h2><p></p>",
  reading: "<h1>Reading notes</h1><h2>Thesis</h2><p></p><h2>Important passages</h2><p></p><h2>Questions</h2><p></p><h2>Review prompts</h2><p></p>",
  lab: "<h1>Lab report</h1><h2>Question</h2><p></p><h2>Method</h2><p></p><h2>Results</h2><p></p><h2>Interpretation</h2><p></p>",
  essay: "<h1>Essay outline</h1><h2>Claim</h2><p></p><h2>Argument map</h2><ol><li></li><li></li><li></li></ol><h2>Counterpoint</h2><p></p>",
  meeting: "<h1>Study meeting</h1><h2>Agenda</h2><ul><li></li></ul><h2>Notes</h2><p></p><h2>Decisions</h2><p></p><h2>Follow-up</h2><p></p>",
  flashcards: "<h1>Flashcard draft</h1><h2>Atomic facts</h2><table><tbody><tr><th>Prompt</th><th>Answer</th><th>Topic</th></tr><tr><td></td><td></td><td></td></tr></tbody></table>",
  presentation: "<h1>Presentation script</h1><h2>Opening</h2><p></p><h2>Three points</h2><ol><li></li><li></li><li></li></ol><h2>Close</h2><p></p>",
}

type StudioTemplate = {
  label: string
  title: string
  body: string
  accent?: string
  description?: string
  sections?: string[]
  style?: string
}

const studioTemplates: Record<StudioKind, StudioTemplate[]> = {
  notes: [
    { label: "Daily note", title: "Daily learning note", body: "<h2>What I learned today</h2><p></p><h2>Questions</h2><p></p><h2>Review later</h2><p></p>" },
    { label: "Concept card", title: "Concept note", body: "<h2>Concept</h2><p></p><h2>Plain-English explanation</h2><p></p><h2>Example</h2><p></p><h2>Recall prompt</h2><p></p>" },
    { label: "Book note", title: "Book note", body: "<h2>Core idea</h2><p></p><h2>Quotes</h2><p></p><h2>My response</h2><p></p>" },
    { label: "Lecture", title: "Lecture note", body: "<h2>Big picture</h2><p></p><h2>Details</h2><p></p><h2>Questions to ask</h2><p></p>" },
    { label: "Mistake log", title: "Mistake log", body: "<h2>What I missed</h2><p></p><h2>Why</h2><p></p><h2>Fix next time</h2><p></p>" },
    { label: "Vocabulary", title: "Vocabulary list", body: "<table><tbody><tr><th>Term</th><th>Meaning</th><th>Example</th></tr><tr><td></td><td></td><td></td></tr></tbody></table>" },
    { label: "Code notes", title: "Code study note", body: "<h2>Pattern</h2><pre><code></code></pre><h2>When to use</h2><p></p><h2>Gotchas</h2><p></p>" },
    { label: "Question bank", title: "Question bank", body: "<h2>Questions</h2><ol><li></li><li></li><li></li></ol><h2>Answers</h2><p></p>" },
    { label: "Reflection", title: "Learning reflection", body: "<h2>What changed</h2><p></p><h2>What still feels unclear</h2><p></p><h2>Tomorrow</h2><p></p>" },
    { label: "Research", title: "Research note", body: "<h2>Source</h2><p></p><h2>Claim</h2><p></p><h2>Evidence</h2><p></p><h2>Use later</h2><p></p>" },
  ],
  docs: [
    { label: "Study guide", title: "Study guide", body: docTemplates.study },
    { label: "Cornell", title: "Cornell notes", body: docTemplates.cornell },
    { label: "Project", title: "Learning project", body: docTemplates.project },
    { label: "Brief", title: "One-page brief", body: docTemplates.brief },
    { label: "Reading", title: "Reading notes", body: docTemplates.reading },
    { label: "Lab", title: "Lab report", body: docTemplates.lab },
    { label: "Essay", title: "Essay outline", body: docTemplates.essay },
    { label: "Meeting", title: "Study meeting", body: docTemplates.meeting },
    { label: "Cards", title: "Flashcard draft", body: docTemplates.flashcards },
    { label: "Script", title: "Presentation script", body: docTemplates.presentation },
  ],
  sheets: [
    { label: "Tracker", title: "Study tracker", body: "Topic,Status,Score,Next step\nReact,Review,72,Practice hooks\nDatabases,Weak,48,Index questions" },
    { label: "Resources", title: "Resource tracker", body: "Resource,Type,Status,Owner\nLecture 1,Video,To watch,Me\nChapter 2,Reading,Review,Me" },
    { label: "Gradebook", title: "Gradebook", body: "Assignment,Weight,Score,Weighted score\nQuiz 1,10,88,8.8\nProject,30,92,27.6" },
    { label: "Habit", title: "Habit tracker", body: "Date,Focus minutes,Reviews,Notes,Energy\nToday,45,12,2,High" },
    { label: "Schedule", title: "Study schedule", body: "Day,Time,Topic,Mode,Done\nMonday,19:00,Operating systems,Review,No" },
    { label: "Vocabulary", title: "Vocabulary sheet", body: "Term,Definition,Example,Review date\nRetrieval,Recall from memory,,Tomorrow" },
    { label: "Budget", title: "Course budget", body: "Item,Category,Cost,Status\nBook,Reading,0,Owned\nExam fee,Assessment,0,Planned" },
    { label: "Rubric", title: "Rubric tracker", body: "Criterion,Level,Evidence,Improve next\nClarity,3,,Add examples" },
    { label: "Experiment", title: "Experiment log", body: "Run,Variable,Result,Observation\n1,Prompt style,Good,Shorter examples worked" },
    { label: "Planner", title: "Weekly planner", body: "Week,Goal,Output,Risk,Next step\n1,Map basics,Notes,Time,Create cards" },
  ],
  slides: [
    { label: "Lesson", title: "Lesson deck", body: "Hook|Why this matters|Open\nKey idea|One visual explanation|Explain\nPractice|One recall question|Try" },
    { label: "Review", title: "Review deck", body: "Warmup|Quick recap|Start\nMistake|Common trap|Fix\nNext|What to practice|Plan" },
    { label: "Pitch", title: "Idea pitch", body: "Problem|What hurts today|Frame\nSolution|What changes|Show\nProof|Why it works|Evidence\nAsk|What happens next|Close" },
    { label: "Workshop", title: "Workshop deck", body: "Goal|What learners can do after|Start\nDemo|Walk through the pattern|Show\nExercise|Try it in pairs|Practice\nDebrief|What changed|Reflect" },
    { label: "Report", title: "Progress report", body: "Status|Where we are|Update\nSignal|Metric or evidence|Show\nRisk|What needs attention|Discuss\nPlan|Next week|Close" },
    { label: "Flash talk", title: "Flash talk", body: "Hook|One sharp question|Open\nIdea|One memorable answer|Explain\nExample|Make it concrete|Show\nRecall|Ask the audience|Practice" },
    { label: "Case study", title: "Case study", body: "Context|Who and what|Set up\nDecision|What happened|Analyze\nOutcome|What changed|Review\nLesson|What to reuse|Close" },
    { label: "Story", title: "Learning story", body: "Before|What was confusing|Start\nBridge|The insight|Reveal\nAfter|What is possible now|Close" },
    { label: "Tutorial", title: "Tutorial deck", body: "Setup|What you need|Prepare\nStep 1|First action|Do\nStep 2|Second action|Do\nCheck|Confirm result|Verify" },
    { label: "Debate", title: "Debate deck", body: "Claim|Position A|Frame\nCounter|Position B|Challenge\nEvidence|Compare support|Weigh\nDecision|What I believe now|Close" },
  ],
}

function textFromDocument(document?: WorkspaceDocument) {
  const content = document?.content || {}
  return String(content.text || content.markdown || content.plainText || "")
}

function cellsFromSheet(sheet?: WorkspaceSheet) {
  return parseSheetCells(sheet)
}

function slidesFromDeck(deck?: WorkspaceDeck) {
  return parseDeckSlides(deck).map((slide) => ({
    ...slide,
    accent: slide.accent || "Slide",
    layout: slide.layout || "title",
    theme: slide.theme || "midnight",
    background: slide.background || slideDesignPresets[(slide.theme || "midnight") as keyof typeof slideDesignPresets]?.background || "#111827",
    transition: slide.transition || "none",
    animation: slide.animation || "none",
    speakerNotes: slide.speakerNotes || "",
  }))
}

function fileTitle(title: string, fallback: string) {
  return (title.trim() || fallback).replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase()
}

function importTargetToKind(target: ImportTarget): StudioKind {
  return getImportDestinationView(target)
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
  if (!value.trim()) return blankRichText
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

function formatStudioTabLabel(tab: StudioTab) {
  const trimmedTitle = tab.title?.trim()
  if (!trimmedTitle || (!tab.itemId && (DRAFT_TAB_TITLE_PATTERN.test(trimmedTitle) || NUMBERED_EMPTY_TAB_PATTERN.test(trimmedTitle) || trimmedTitle === "Studio item"))) {
    return studioEmptyTabLabels[tab.kind]
  }
  return trimmedTitle
}

function readHeadingStyles(): Record<HeadingStyleLevel, HeadingStylePreset> {
  const fallback: Record<HeadingStyleLevel, HeadingStylePreset> = {
    1: { color: "inherit", fontFamily: "Aptos, Inter, sans-serif", fontSize: "32px" },
    2: { color: "inherit", fontFamily: "Aptos, Inter, sans-serif", fontSize: "24px" },
    3: { color: "inherit", fontFamily: "Aptos, Inter, sans-serif", fontSize: "20px" },
  }
  if (typeof window === "undefined") return fallback
  try {
    return { ...fallback, ...JSON.parse(window.localStorage.getItem(HEADING_STYLE_KEY) || "{}") }
  } catch {
    return fallback
  }
}

function writeHeadingStyles(styles: Record<HeadingStyleLevel, HeadingStylePreset>) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(HEADING_STYLE_KEY, JSON.stringify(styles))
}

function selectedHeadingStyle(editor: Editor): HeadingStylePreset {
  const textStyle = editor.getAttributes("textStyle") as HeadingStylePreset
  return {
    color: typeof textStyle.color === "string" ? textStyle.color : undefined,
    fontFamily: typeof textStyle.fontFamily === "string" ? textStyle.fontFamily : undefined,
    fontSize: typeof textStyle.fontSize === "string" ? textStyle.fontSize : undefined,
  }
}

function applyHeadingStyle(editor: Editor, level: HeadingStyleLevel, style: HeadingStylePreset) {
  editor.chain().focus().setHeading({ level }).setMark("textStyle", style).run()
}

function plainTextFromHtml(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

type PptxGenConstructor = typeof import("pptxgenjs").default

declare global {
  interface Window {
    PptxGenJS?: PptxGenConstructor
  }
}

async function loadPptxGen() {
  if (window.PptxGenJS) return window.PptxGenJS
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-learn-pptxgen="true"]')
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true })
      existing.addEventListener("error", () => reject(new Error("Unable to load the PPTX exporter.")), { once: true })
      return
    }

    const script = document.createElement("script")
    script.src = "/vendor/pptxgen.min.js"
    script.async = true
    script.dataset.learnPptxgen = "true"
    script.onload = () => resolve()
    script.onerror = () => reject(new Error("Unable to load the PPTX exporter."))
    document.head.appendChild(script)
  })

  if (!window.PptxGenJS) throw new Error("PPTX exporter did not initialize.")
  return window.PptxGenJS
}

export function StudioView({
  initialKind,
  notes,
  options,
  selectedNote,
  setNotes,
  setSelectedNoteId,
  onDraftSummary,
}: {
  initialKind: StudioKind
  notes: Note[]
  options: WorkspaceOptions
  selectedNote?: Note
  setNotes: React.Dispatch<React.SetStateAction<Note[]>>
  setSelectedNoteId: (id: string) => void
  onDraftSummary?: (summary: StudioDraftSummary) => void
}) {
  const [kind, setKind] = useState<StudioKind>(initialKind)
  const [query, setQuery] = useState("")
  const [section, setSection] = useState("All")
  const [viewMode, setViewMode] = useState<StudioViewMode>("list")
  const [status, setStatus] = useState("Loading Studio...")
  const [draftNotice, setDraftNotice] = useState("")
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState("")
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState("")
  const [importTitle, setImportTitle] = useState("")
  const [importTarget, setImportTarget] = useState<ImportTargetSelection>("auto")
  const [importing, setImporting] = useState(false)
  const [dirtyBadges, setDirtyBadges] = useState<StudioDirtyBadge[]>([])
  const [inspectorTab, setInspectorTab] = useState("Info")
  const [selectedCell, setSelectedCell] = useState({ row: 0, column: 0 })
  const [selectedSlideIndex, setSelectedSlideIndex] = useState(0)
  const [archivedNotes, setArchivedNotes] = useState<Note[]>([])
  const [archivedDocs, setArchivedDocs] = useState<WorkspaceDocument[]>([])
  const [archivedSheets, setArchivedSheets] = useState<WorkspaceSheet[]>([])
  const [archivedDecks, setArchivedDecks] = useState<WorkspaceDeck[]>([])
  const [archivedLoaded, setArchivedLoaded] = useState(false)

  const [layout, setLayout] = useState<StudioLayoutState>(() => createDefaultStudioLayout(initialKind, "Studio"))

  const [noteDraft, setNoteDraft] = useState<Note | null>(selectedNote || null)
  const [noteHistory, setNoteHistory] = useState<HistoryState<string>>(createHistoryState(selectedNote?.content || ""))

  const [docs, setDocs] = useState<WorkspaceDocument[]>([])
  const [docId, setDocId] = useState("")
  const selectedDoc = docId ? docs.find((item) => item.id === docId) : undefined
  const [docTitle, setDocTitle] = useState(blankDocTitle)
  const [docHistory, setDocHistory] = useState<HistoryState<string>>(createHistoryState(""))

  const [sheets, setSheets] = useState<WorkspaceSheet[]>([])
  const [sheetId, setSheetId] = useState("")
  const selectedSheet = sheetId ? sheets.find((item) => item.id === sheetId) : undefined
  const [sheetTitle, setSheetTitle] = useState(blankSheetTitle)
  const [cells, setCells] = useState<string[][]>(blankSheetCells)

  const [decks, setDecks] = useState<WorkspaceDeck[]>([])
  const [deckId, setDeckId] = useState("")
  const selectedDeck = deckId ? decks.find((item) => item.id === deckId) : undefined
  const [deckTitle, setDeckTitle] = useState(blankDeckTitle)
  const [slides, setSlides] = useState<WorkspaceDeck["slides"]>(blankDeckSlides)
  const deferredQuery = useDeferredValue(query)
  const hydratedDraftKinds = useRef<Set<StudioKind>>(new Set())
  const draftReady = useRef(false)
  const lastDraftFingerprint = useRef<Partial<Record<StudioKind, string>>>({})
  const pendingDrafts = useRef<Partial<Record<StudioKind, { draft: StudioDraftRecord; fingerprint: string }>>>({})
  const draftSaveTimeouts = useRef<Partial<Record<StudioKind, number>>>({})
  const draftStatusTimeout = useRef<number | null>(null)
  const lastDraftNoticeAt = useRef(0)
  const lastDraftNoticeKind = useRef<StudioKind | undefined>(undefined)
  const layoutSaveTimeout = useRef<number | null>(null)
  const pendingLayoutSnapshot = useRef("")

  function notifyDraftSummary() {
    onDraftSummary?.(summarizeStudioDrafts(readStudioDrafts()))
  }

  function markDraftSaved(kind: StudioKind, summary: StudioDraftSummary) {
    onDraftSummary?.(summary)
    const now = Date.now()
    if (!shouldAnnounceStudioDraftSave({ kind, lastKind: lastDraftNoticeKind.current, lastShownAt: lastDraftNoticeAt.current, now })) return
    lastDraftNoticeAt.current = now
    lastDraftNoticeKind.current = kind
    if (draftStatusTimeout.current) window.clearTimeout(draftStatusTimeout.current)
    setDraftNotice("Local draft saved")
    draftStatusTimeout.current = window.setTimeout(() => {
      setDraftNotice("")
    }, 1200)
  }

  function flushStudioDraft(kind: StudioKind) {
    const pending = pendingDrafts.current[kind]
    if (!pending || lastDraftFingerprint.current[kind] === pending.fingerprint) return
    lastDraftFingerprint.current[kind] = pending.fingerprint
    delete pendingDrafts.current[kind]
    markDraftSaved(kind, writeStudioDraft(kind, pending.draft))
  }

  function flushPendingStudioDrafts() {
    ;(["notes", "docs", "sheets", "slides"] as StudioKind[]).forEach((item) => {
      if (draftSaveTimeouts.current[item]) {
        window.clearTimeout(draftSaveTimeouts.current[item])
        delete draftSaveTimeouts.current[item]
      }
      flushStudioDraft(item)
    })
  }

  function scheduleStudioDraft(kind: StudioKind, fingerprint: string, buildDraft: () => StudioDraftRecord) {
    if (lastDraftFingerprint.current[kind] === fingerprint) return undefined
    pendingDrafts.current[kind] = { fingerprint, draft: buildDraft() }
    if (draftSaveTimeouts.current[kind]) window.clearTimeout(draftSaveTimeouts.current[kind])
    draftSaveTimeouts.current[kind] = window.setTimeout(() => {
      delete draftSaveTimeouts.current[kind]
      flushStudioDraft(kind)
    }, 650)
    return undefined
  }

  useEffect(() => {
    const flushOnPageExit = () => flushPendingStudioDrafts()
    const flushOnVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushPendingStudioDrafts()
    }
    const syncDirtyBadges = () => setDirtyBadges(computeStudioDirtyBadges(readStudioDrafts()))
    syncDirtyBadges()
    window.addEventListener("pagehide", flushOnPageExit)
    window.addEventListener(STUDIO_DRAFT_EVENT, syncDirtyBadges)
    document.addEventListener("visibilitychange", flushOnVisibilityChange)
    return () => {
      window.removeEventListener("pagehide", flushOnPageExit)
      window.removeEventListener(STUDIO_DRAFT_EVENT, syncDirtyBadges)
      document.removeEventListener("visibilitychange", flushOnVisibilityChange)
      flushPendingStudioDrafts()
      if (draftStatusTimeout.current) window.clearTimeout(draftStatusTimeout.current)
      if (layoutSaveTimeout.current) {
        window.clearTimeout(layoutSaveTimeout.current)
        if (pendingLayoutSnapshot.current) window.localStorage.setItem(LAYOUT_KEY, pendingLayoutSnapshot.current)
      }
    }
  }, [])

  useEffect(() => {
    setKind(initialKind)
    updateActivePaneKind(initialKind)
  }, [initialKind])

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LAYOUT_KEY)
      if (saved) setLayout(normalizeStudioLayout(JSON.parse(saved)))
    } catch {
      setLayout(createDefaultStudioLayout(initialKind, "Studio"))
    }
  }, [])

  useEffect(() => {
    pendingLayoutSnapshot.current = JSON.stringify(layout)
    if (layoutSaveTimeout.current) window.clearTimeout(layoutSaveTimeout.current)
    layoutSaveTimeout.current = window.setTimeout(() => {
      window.localStorage.setItem(LAYOUT_KEY, pendingLayoutSnapshot.current)
      layoutSaveTimeout.current = null
    }, 250)
  }, [layout])

  useEffect(() => {
    const stored = readStudioDrafts().notes
    if (!hydratedDraftKinds.current.has("notes") && stored?.kind === "notes") {
      hydratedDraftKinds.current.add("notes")
      setSelectedNoteId(stored.id || "")
      setNoteDraft({
        ...(selectedNote || { icon: "FileText", favorite: false, template: "draft", updated_at: stored.updatedAt, tags: [] }),
        id: stored.id || "",
        title: stored.title,
        content: stored.content,
      })
      setNoteHistory(createHistoryState(stored.content))
      return
    }
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
        draftReady.current = true
        notifyDraftSummary()
        setStatus("")
      })
      .catch((error) => setStatus(error.message))
  }, [])

  useEffect(() => {
    if (section !== "Archived" || archivedLoaded) return
    refreshArchivedItems()
  }, [archivedLoaded, section])

  useEffect(() => {
    const stored = readStudioDrafts().docs
    if (!hydratedDraftKinds.current.has("docs") && stored?.kind === "docs") {
      hydratedDraftKinds.current.add("docs")
      setDocId(stored.id || "")
      setDocTitle(stored.title)
      setDocHistory(createHistoryState(stored.content))
      return
    }
    if (!selectedDoc) return
    setDocTitle(selectedDoc.title)
    setDocHistory(createHistoryState(textFromDocument(selectedDoc)))
  }, [selectedDoc?.id])

  useEffect(() => {
    const stored = readStudioDrafts().sheets
    if (!hydratedDraftKinds.current.has("sheets") && stored?.kind === "sheets") {
      hydratedDraftKinds.current.add("sheets")
      setSheetId(stored.id || "")
      setSheetTitle(stored.title)
      setCells(stored.cells)
      return
    }
    if (!selectedSheet) return
    setSheetTitle(selectedSheet.title)
    setCells(cellsFromSheet(selectedSheet))
  }, [selectedSheet?.id])

  useEffect(() => {
    const stored = readStudioDrafts().slides
    if (!hydratedDraftKinds.current.has("slides") && stored?.kind === "slides") {
      hydratedDraftKinds.current.add("slides")
      setDeckId(stored.id || "")
      setDeckTitle(stored.title)
      setSlides(stored.slides)
      setSelectedSlideIndex(0)
      return
    }
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

  useEffect(() => {
    if (!draftReady.current || !noteDraft) return
    const title = noteDraft.title || blankNoteTitle
    const changed = title !== (selectedNote?.title || "") || noteHistory.present !== (selectedNote?.content || "")
    if (!changed) return
    const fingerprint = ["notes", noteDraft.id || "", title, noteHistory.present].join("\u001f")
    return scheduleStudioDraft("notes", fingerprint, () => ({
      kind: "notes",
      id: noteDraft.id,
      title,
      content: noteHistory.present,
      updatedAt: new Date().toISOString(),
    }))
  }, [noteDraft?.id, noteDraft?.title, noteHistory.present, selectedNote?.content, selectedNote?.title])

  useEffect(() => {
    if (!draftReady.current) return
    const selectedContent = textFromDocument(selectedDoc)
    const title = docTitle || blankDocTitle
    const changed = selectedDoc
      ? title !== selectedDoc.title || docHistory.present !== selectedContent
      : title !== blankDocTitle || plainTextFromHtml(docHistory.present).length > 0
    if (!changed) return
    const fingerprint = ["docs", selectedDoc?.id || "", title, docHistory.present].join("\u001f")
    return scheduleStudioDraft("docs", fingerprint, () => ({
      kind: "docs",
      id: selectedDoc?.id,
      title,
      content: docHistory.present,
      updatedAt: new Date().toISOString(),
    }))
  }, [docHistory.present, docTitle, selectedDoc?.id, selectedDoc?.title])

  const cellsFingerprint = useMemo(() => JSON.stringify(cells), [cells])
  const selectedSheetFingerprint = useMemo(() => selectedSheet ? JSON.stringify(cellsFromSheet(selectedSheet)) : blankSheetFingerprint, [selectedSheet?.cells, selectedSheet?.id])
  const slidesFingerprint = useMemo(() => JSON.stringify(slides), [slides])
  const selectedDeckFingerprint = useMemo(() => selectedDeck ? JSON.stringify(slidesFromDeck(selectedDeck)) : blankDeckFingerprint, [selectedDeck?.id, selectedDeck?.slides])

  useEffect(() => {
    if (!draftReady.current) return
    const title = sheetTitle || blankSheetTitle
    const changed = selectedSheet
      ? title !== selectedSheet.title || cellsFingerprint !== selectedSheetFingerprint
      : title !== blankSheetTitle || cellsFingerprint !== blankSheetFingerprint
    if (!changed) return
    const fingerprint = ["sheets", selectedSheet?.id || "", title, cellsFingerprint].join("\u001f")
    return scheduleStudioDraft("sheets", fingerprint, () => ({
      kind: "sheets",
      id: selectedSheet?.id,
      title,
      cells,
      updatedAt: new Date().toISOString(),
    }))
  }, [cells, cellsFingerprint, selectedSheet?.id, selectedSheet?.title, selectedSheetFingerprint, sheetTitle])

  useEffect(() => {
    if (!draftReady.current) return
    const title = deckTitle || blankDeckTitle
    const changed = selectedDeck
      ? title !== selectedDeck.title || slidesFingerprint !== selectedDeckFingerprint
      : title !== blankDeckTitle || slidesFingerprint !== blankDeckFingerprint
    if (!changed) return
    const fingerprint = ["slides", selectedDeck?.id || "", title, slidesFingerprint].join("\u001f")
    return scheduleStudioDraft("slides", fingerprint, () => ({
      kind: "slides",
      id: selectedDeck?.id,
      title,
      slides,
      updatedAt: new Date().toISOString(),
    }))
  }, [deckTitle, selectedDeck?.id, selectedDeck?.title, selectedDeckFingerprint, slides, slidesFingerprint])

  const activeTab = getStudioKindOption(kind)
  const dirtyBadgeMap = useMemo(() => new Map(dirtyBadges.map((badge) => [badge.kind, badge])), [dirtyBadges])
  const allItems = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase()
    const mapped: StudioListItem[] = []
    const notesSource = section === "Archived" ? archivedNotes : notes
    const docsSource = section === "Archived" ? archivedDocs : docs
    const sheetsSource = section === "Archived" ? archivedSheets : sheets
    const decksSource = section === "Archived" ? archivedDecks : decks
    const acceptsSection = (itemKind: StudioKind, favorite?: boolean) => (
      section === "Archived" || section === "All" || section === "Recent" || (section === "Favorites" ? favorite : itemKind === section.toLowerCase())
    )
    const append = (item: StudioListItem) => {
      if (!acceptsSection(item.kind, item.favorite)) return
      if (needle && !`${item.title} ${item.summary || ""}`.toLowerCase().includes(needle)) return
      mapped.push(item)
    }

    for (const item of notesSource) append({ id: item.id, kind: "notes", title: item.title, updated_at: item.updated_at, archived_at: item.archived_at, summary: item.content, favorite: item.favorite })
    for (const item of docsSource) append({ id: item.id, kind: "docs", title: item.title, updated_at: item.updated_at, archived_at: item.archived_at, summary: textFromDocument(item) })
    for (const item of sheetsSource) append({ id: item.id, kind: "sheets", title: item.title, updated_at: item.updated_at, archived_at: item.archived_at, summary: `${cellsFromSheet(item).length} rows` })
    for (const item of decksSource) append({ id: item.id, kind: "slides", title: item.title, updated_at: item.updated_at, archived_at: item.archived_at, summary: `${slidesFromDeck(item).length} slides` })

    return mapped.sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")))
  }, [archivedDecks, archivedDocs, archivedNotes, archivedSheets, decks, deferredQuery, docs, notes, section, sheets])

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

  function syncActivePaneTab(nextKind: StudioKind, itemId: string, title: string) {
    setLayout((current) => {
      const group = current.groups[0]
      const panes = group.panes.map((pane) => {
        if (pane.id !== current.activePaneId) return pane
        const tabs = pane.tabs.map((tab) => (
          tab.id === pane.activeTabId ? { ...tab, kind: nextKind, itemId, title } : tab
        ))
        return { ...pane, tabs }
      })
      return normalizeStudioLayout({ ...current, groups: [{ ...group, panes }] })
    })
  }

  function activeTitle() {
    if (kind === "notes") return noteDraft?.title || blankNoteTitle
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
    if (kind === "sheets") return exportSheetToCsv({ cells: ensureSheetCells(cells) })
    return format === "export"
      ? JSON.stringify(buildSlideExportPayload(deckTitle || "Slides", slides), null, 2)
      : buildSlidePresenterOutline(slides)
  }

  const activeSummaryText = useMemo(() => {
    if (kind === "notes") return `${plainTextFromHtml(noteHistory.present).length} chars`
    if (kind === "docs") return `${plainTextFromHtml(docHistory.present).split(/\s+/).filter(Boolean).length} words`
    if (kind === "sheets") {
      const safeCells = ensureSheetCells(cells)
      return `${safeCells.length} rows x ${safeCells[0]?.length || 0} columns`
    }
    return `${slides.length} slides`
  }, [cells, docHistory.present, kind, noteHistory.present, slides.length])

  function selectKind(nextKind: StudioKind) {
    setKind(nextKind)
    updateActivePaneKind(nextKind)
  }

  function applyTemplate(template: StudioTemplate) {
    const applied = buildAppliedTemplate(kind, template)
    if (kind === "notes") {
      setNoteDraft((current) => current ? { ...current, title: applied.title } : current)
      setNoteHistory(pushHistory(noteHistory, applied.body))
      return
    }
    if (kind === "docs") {
      setDocTitle(applied.title)
      setDocHistory(pushHistory(docHistory, applied.body))
      return
    }
    if (kind === "sheets") {
      setSheetTitle(applied.title)
      setCells(importCsvToSheet(applied.body).cells)
      return
    }
    setDeckTitle(applied.title)
    const meta = getStudioTemplateMeta("slides", template)
    setSlides(applied.body.split("\n").map((line, index) => {
      const [title, body, accent] = line.split("|")
      return {
        title: title || "Slide",
        body: body || "Add the point.",
        accent: accent || "Slide",
        layout: index === 0 ? "title" : index % 2 ? "two-column" : "image",
        theme: template.style?.toLowerCase().includes("brief") ? "paper" : "midnight",
        transition: index === 0 ? "fade" : "push",
        animation: index % 2 ? "reveal" : "rise",
        speakerNotes: `${meta.style} template: ${meta.sections[index] || "Explain the idea"} in one clear learner-centered step.`,
      }
    }))
  }

  async function createActive() {
    if (kind === "notes") {
      const response = await api<{ item: Note }>("/api/notes", {
        method: "POST",
        body: JSON.stringify({ title: blankNoteTitle, content: blankRichText, template: "blank" }),
      })
      setNotes((current) => [response.item, ...current])
      setSelectedNoteId(response.item.id)
      updateActivePaneKind("notes", response.item.id, response.item.title)
      return
    }
    if (kind === "docs") {
      setDocId("")
      setDocTitle(blankDocTitle)
      setDocHistory(createHistoryState(docTemplates[options.docsTemplate]))
      return
    }
    if (kind === "sheets") {
      setSheetId("")
      setSheetTitle(blankSheetTitle)
      setCells(blankSheetCells)
      return
    }
    setDeckId("")
    setDeckTitle(blankDeckTitle)
    setSlides(blankDeckSlides)
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
        syncActivePaneTab("notes", response.item.id, response.item.title)
        onDraftSummary?.(clearStudioDraft("notes"))
      }

      if (kind === "docs") {
        const plainText = plainTextFromHtml(docHistory.present)
        const response = await api<{ item: WorkspaceDocument }>("/api/docs", {
          method: selectedDoc?.id ? "PUT" : "POST",
          body: JSON.stringify({
            id: selectedDoc?.id,
            title: docTitle,
            content: { text: docHistory.present, markdown: plainText, plainText },
            tags: selectedDoc?.tags || [],
          }),
        })
        setDocs((current) => [response.item, ...current.filter((item) => item.id !== response.item.id)])
        setDocId(response.item.id)
        syncActivePaneTab("docs", response.item.id, response.item.title)
        onDraftSummary?.(clearStudioDraft("docs"))
      }

      if (kind === "sheets") {
        const response = await api<{ item: WorkspaceSheet }>("/api/sheets", {
          method: selectedSheet?.id ? "PUT" : "POST",
          body: JSON.stringify({ id: selectedSheet?.id, title: sheetTitle, cells, history: [], frozenRows: 1 }),
        })
        setSheets((current) => [response.item, ...current.filter((item) => item.id !== response.item.id)])
        setSheetId(response.item.id)
        syncActivePaneTab("sheets", response.item.id, response.item.title)
        onDraftSummary?.(clearStudioDraft("sheets"))
      }

      if (kind === "slides") {
        const response = await api<{ item: WorkspaceDeck }>("/api/slides", {
          method: selectedDeck?.id ? "PUT" : "POST",
          body: JSON.stringify({ id: selectedDeck?.id, title: deckTitle, slides, speakerNotes: Object.fromEntries(slides.map((slide, index) => [index, slide.speakerNotes || ""])) }),
        })
        setDecks((current) => [response.item, ...current.filter((item) => item.id !== response.item.id)])
        setDeckId(response.item.id)
        syncActivePaneTab("slides", response.item.id, response.item.title)
        onDraftSummary?.(clearStudioDraft("slides"))
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
      syncActivePaneTab("notes", response.item.id, response.item.title)
    }
    if (kind === "docs") {
      const plainText = plainTextFromHtml(docHistory.present)
      const response = await api<{ item: WorkspaceDocument }>("/api/docs", { method: "POST", body: JSON.stringify({ title, content: { text: docHistory.present, plainText }, tags: [] }) })
      setDocs((current) => [response.item, ...current])
      setDocId(response.item.id)
      syncActivePaneTab("docs", response.item.id, response.item.title)
    }
    if (kind === "sheets") {
      const response = await api<{ item: WorkspaceSheet }>("/api/sheets", { method: "POST", body: JSON.stringify({ title, cells, history: [] }) })
      setSheets((current) => [response.item, ...current])
      setSheetId(response.item.id)
      syncActivePaneTab("sheets", response.item.id, response.item.title)
    }
    if (kind === "slides") {
      const response = await api<{ item: WorkspaceDeck }>("/api/slides", { method: "POST", body: JSON.stringify({ title, slides, speakerNotes: {} }) })
      setDecks((current) => [response.item, ...current])
      setDeckId(response.item.id)
      syncActivePaneTab("slides", response.item.id, response.item.title)
    }
  }

  async function organizeImport() {
    if (!importText.trim()) {
      setStatus("Paste text, CSV, or an outline to import.")
      return
    }
    setImporting(true)
    try {
      const response = await api<{
        target: ImportTarget
        item?: Note | WorkspaceDocument | WorkspaceSheet | WorkspaceDeck
        note?: Note
      }>("/api/import", {
        method: "POST",
        body: JSON.stringify({
          text: importText,
          title: importTitle || undefined,
          target: importTarget,
        }),
      })
      const imported = response.item || response.note
      if (!imported) {
        setStatus("Import finished, but no Studio item was returned.")
        return
      }
      applyImportedItem(response.target, imported)
      setImportText("")
      setImportTitle("")
      setImportOpen(false)
      setStatus(`Imported ${labelImportTarget(response.target)}.`)
    } finally {
      setImporting(false)
    }
  }

  function applyImportedItem(target: ImportTarget, item: Note | WorkspaceDocument | WorkspaceSheet | WorkspaceDeck) {
    const nextKind = importTargetToKind(target)
    setKind(nextKind)
    updateActivePaneKind(nextKind, item.id, item.title)
    if (target === "note") {
      const note = item as Note
      setNotes((current) => [note, ...current.filter((entry) => entry.id !== note.id)])
      setSelectedNoteId(note.id)
      setNoteDraft(note)
      setNoteHistory(createHistoryState(note.content || ""))
      return
    }
    if (target === "doc") {
      const doc = item as WorkspaceDocument
      setDocs((current) => [doc, ...current.filter((entry) => entry.id !== doc.id)])
      setDocId(doc.id)
      setDocTitle(doc.title)
      setDocHistory(createHistoryState(textFromDocument(doc)))
      return
    }
    if (target === "sheet") {
      const sheet = item as WorkspaceSheet
      setSheets((current) => [sheet, ...current.filter((entry) => entry.id !== sheet.id)])
      setSheetId(sheet.id)
      setSheetTitle(sheet.title)
      setCells(cellsFromSheet(sheet))
      return
    }
    const deck = item as WorkspaceDeck
    setDecks((current) => [deck, ...current.filter((entry) => entry.id !== deck.id)])
    setDeckId(deck.id)
    setDeckTitle(deck.title)
    setSlides(slidesFromDeck(deck))
  }

  async function refreshArchivedItems() {
    setStatus("Loading archived Studio items...")
    try {
      const [notesResponse, docsResponse, sheetsResponse, decksResponse] = await Promise.all([
        api<{ items: Note[] }>("/api/notes?status=archived"),
        api<{ items: WorkspaceDocument[] }>("/api/docs?status=archived"),
        api<{ items: WorkspaceSheet[] }>("/api/sheets?status=archived"),
        api<{ items: WorkspaceDeck[] }>("/api/slides?status=archived"),
      ])
      setArchivedNotes(notesResponse.items)
      setArchivedDocs(docsResponse.items)
      setArchivedSheets(sheetsResponse.items)
      setArchivedDecks(decksResponse.items)
      setArchivedLoaded(true)
      setStatus("")
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to load archived Studio items.")
    }
  }

  function findStudioItem(item: Pick<StudioRecordItem, "id" | "kind">) {
    if (item.kind === "notes") return notes.find((entry) => entry.id === item.id) || archivedNotes.find((entry) => entry.id === item.id)
    if (item.kind === "docs") return docs.find((entry) => entry.id === item.id) || archivedDocs.find((entry) => entry.id === item.id)
    if (item.kind === "sheets") return sheets.find((entry) => entry.id === item.id) || archivedSheets.find((entry) => entry.id === item.id)
    return decks.find((entry) => entry.id === item.id) || archivedDecks.find((entry) => entry.id === item.id)
  }

  function payloadForStudioItem(item: Pick<StudioRecordItem, "id" | "kind">) {
    const source = findStudioItem(item)
    if (!source) return ""
    if (item.kind === "notes") return (source as Note).content || ""
    if (item.kind === "docs") return textFromDocument(source as WorkspaceDocument)
    if (item.kind === "sheets") return exportSheetToCsv({ cells: cellsFromSheet(source as WorkspaceSheet) })
    return buildSlidePresenterOutline(slidesFromDeck(source as WorkspaceDeck))
  }

  function downloadStudioItem(item: StudioRecordItem, exportMode = false) {
    const source = findStudioItem(item)
    if (!source) {
      setStatus("Open the item first, then try exporting again.")
      return
    }

    const base = fileTitle(item.title, item.kind)
    if (item.kind === "sheets") {
      downloadText(`${base}.csv`, exportSheetToCsv({ cells: cellsFromSheet(source as WorkspaceSheet) }), "text/csv")
      setStatus(`Exported ${item.title} as CSV.`)
      return
    }

    if (item.kind === "slides") {
      const deckSlides = slidesFromDeck(source as WorkspaceDeck)
      if (exportMode) {
        downloadText(`${base}.slides.json`, JSON.stringify(buildSlideExportPayload(item.title, deckSlides), null, 2), "application/json")
        setStatus(`Exported ${item.title} as slide JSON.`)
        return
      }
      downloadText(`${base}.outline.txt`, buildSlidePresenterOutline(deckSlides), "text/plain")
      setStatus(`Downloaded ${item.title} outline.`)
      return
    }

    const content = item.kind === "docs" ? textFromDocument(source as WorkspaceDocument) : (source as Note).content || ""
    const body = exportMode ? plainTextFromHtml(content) : richTextContent(content)
    downloadText(`${base}.${exportMode ? "txt" : "html"}`, body, exportMode ? "text/plain" : "text/html")
    setStatus(`${exportMode ? "Exported" : "Downloaded"} ${item.title}.`)
  }

  async function copyStudioItem(item: StudioRecordItem) {
    await navigator.clipboard?.writeText(payloadForStudioItem(item) || item.title)
    setStatus(`Copied ${item.title}.`)
  }

  async function duplicateStudioItem(item: StudioRecordItem) {
    const title = `${item.title || studioCreateLabels[item.kind]} copy`
    const source = findStudioItem(item)
    if (!source) {
      setStatus("Open the item first, then try duplicating again.")
      return
    }
    if (item.kind === "notes") {
      const note = source as Note
      const response = await api<{ item: Note }>("/api/notes", { method: "POST", body: JSON.stringify({ title, content: note.content || "", icon: note.icon || "FileText", favorite: false, template: note.template || "blank" }) })
      setNotes((current) => [response.item, ...current])
      selectItem({ id: response.item.id, kind: "notes", title: response.item.title })
      setStatus("Duplicated note.")
      return
    }
    if (item.kind === "docs") {
      const doc = source as WorkspaceDocument
      const plainText = textFromDocument(doc)
      const response = await api<{ item: WorkspaceDocument }>("/api/docs", { method: "POST", body: JSON.stringify({ title, content: { ...(doc.content || {}), text: plainText, plainText }, tags: doc.tags || [] }) })
      setDocs((current) => [response.item, ...current])
      selectItem({ id: response.item.id, kind: "docs", title: response.item.title })
      setStatus("Duplicated document.")
      return
    }
    if (item.kind === "sheets") {
      const sheet = source as WorkspaceSheet
      const response = await api<{ item: WorkspaceSheet }>("/api/sheets", { method: "POST", body: JSON.stringify({ title, cells: cellsFromSheet(sheet), history: [], frozenRows: sheet.frozenRows || 1, filters: sheet.filters || {}, formatting: sheet.formatting || {} }) })
      setSheets((current) => [response.item, ...current])
      selectItem({ id: response.item.id, kind: "sheets", title: response.item.title })
      setStatus("Duplicated sheet.")
      return
    }
    const deck = source as WorkspaceDeck
    const response = await api<{ item: WorkspaceDeck }>("/api/slides", { method: "POST", body: JSON.stringify({ title, slides: slidesFromDeck(deck), speakerNotes: {} }) })
    setDecks((current) => [response.item, ...current])
    selectItem({ id: response.item.id, kind: "slides", title: response.item.title })
    setStatus("Duplicated deck.")
  }

  function closeArchivedStudioTabs(item: Pick<StudioRecordItem, "id" | "kind">) {
    setLayout((current) => {
      const group = current.groups[0] || createDefaultStudioLayout().groups[0]
      const panes = group.panes.map((pane) => {
        const tabs = pane.tabs.filter((tab) => tab.kind !== item.kind || tab.itemId !== item.id)
        if (tabs.length) {
          return {
            ...pane,
            activeTabId: tabs.some((tab) => tab.id === pane.activeTabId) ? pane.activeTabId : tabs[0].id,
            tabs,
          }
        }
        const fallbackTab = createStudioTab(item.kind, studioEmptyTabLabels[item.kind])
        return { ...pane, activeTabId: fallbackTab.id, tabs: [fallbackTab] }
      })
      return normalizeStudioLayout({ ...current, groups: [{ ...group, panes }] })
    })
  }

  function keepArchivedItem(item: StudioRecordItem, source = findStudioItem(item)) {
    const archivedAt = new Date().toISOString()
    if (!source) return
    if (item.kind === "notes") setArchivedNotes((current) => [{ ...(source as Note), archived_at: archivedAt }, ...current.filter((entry) => entry.id !== item.id)])
    if (item.kind === "docs") setArchivedDocs((current) => [{ ...(source as WorkspaceDocument), archived_at: archivedAt }, ...current.filter((entry) => entry.id !== item.id)])
    if (item.kind === "sheets") setArchivedSheets((current) => [{ ...(source as WorkspaceSheet), archived_at: archivedAt }, ...current.filter((entry) => entry.id !== item.id)])
    if (item.kind === "slides") setArchivedDecks((current) => [{ ...(source as WorkspaceDeck), archived_at: archivedAt }, ...current.filter((entry) => entry.id !== item.id)])
  }

  function removeArchivedItem(item: Pick<StudioRecordItem, "id" | "kind">) {
    if (item.kind === "notes") setArchivedNotes((current) => current.filter((entry) => entry.id !== item.id))
    if (item.kind === "docs") setArchivedDocs((current) => current.filter((entry) => entry.id !== item.id))
    if (item.kind === "sheets") setArchivedSheets((current) => current.filter((entry) => entry.id !== item.id))
    if (item.kind === "slides") setArchivedDecks((current) => current.filter((entry) => entry.id !== item.id))
  }

  async function archiveStudioItem(item: StudioRecordItem) {
    const source = findStudioItem(item)
    if (item.kind === "notes") {
      await api(`/api/notes/${item.id}`, { method: "DELETE" })
      setNotes((current) => current.filter((entry) => entry.id !== item.id))
      if (noteDraft?.id === item.id) {
        setSelectedNoteId("")
        setNoteDraft(null)
        setNoteHistory(createHistoryState(""))
      }
    }
    if (item.kind === "docs") {
      await api(`/api/docs?id=${item.id}`, { method: "DELETE" })
      setDocs((current) => current.filter((entry) => entry.id !== item.id))
      if (docId === item.id) {
        setDocId("")
        setDocTitle(blankDocTitle)
        setDocHistory(createHistoryState(docTemplates[options.docsTemplate]))
      }
    }
    if (item.kind === "sheets") {
      await api(`/api/sheets?id=${item.id}`, { method: "DELETE" })
      setSheets((current) => current.filter((entry) => entry.id !== item.id))
      if (sheetId === item.id) {
        setSheetId("")
        setSheetTitle(blankSheetTitle)
        setCells(blankSheetCells)
      }
    }
    if (item.kind === "slides") {
      await api(`/api/slides?id=${item.id}`, { method: "DELETE" })
      setDecks((current) => current.filter((entry) => entry.id !== item.id))
      if (deckId === item.id) {
        setDeckId("")
        setDeckTitle(blankDeckTitle)
        setSlides(blankDeckSlides)
      }
    }
    keepArchivedItem(item, source)
    closeArchivedStudioTabs(item)
    setStatus(`Archived ${item.title}.`)
  }

  async function restoreStudioItem(item: StudioRecordItem) {
    if (item.kind === "notes") {
      const response = await api<{ item: Note }>(`/api/notes/${item.id}`, { method: "PATCH", body: JSON.stringify({ action: "restore" }) })
      if (response.item) setNotes((current) => [response.item, ...current.filter((entry) => entry.id !== response.item.id)])
    }
    if (item.kind === "docs") {
      const response = await api<{ item: WorkspaceDocument }>("/api/docs", { method: "PATCH", body: JSON.stringify({ action: "restore", id: item.id }) })
      if (response.item) setDocs((current) => [response.item, ...current.filter((entry) => entry.id !== response.item.id)])
    }
    if (item.kind === "sheets") {
      const response = await api<{ item: WorkspaceSheet }>("/api/sheets", { method: "PATCH", body: JSON.stringify({ action: "restore", id: item.id }) })
      if (response.item) setSheets((current) => [response.item, ...current.filter((entry) => entry.id !== response.item.id)])
    }
    if (item.kind === "slides") {
      const response = await api<{ item: WorkspaceDeck }>("/api/slides", { method: "PATCH", body: JSON.stringify({ action: "restore", id: item.id }) })
      if (response.item) setDecks((current) => [response.item, ...current.filter((entry) => entry.id !== response.item.id)])
    }
    removeArchivedItem(item)
    selectItem(item)
    setStatus(`Restored ${item.title}.`)
  }

  function activeStudioItem(): StudioRecordItem | null {
    if (kind === "notes" && noteDraft?.id) return { id: noteDraft.id, kind, title: noteDraft.title }
    if (kind === "docs" && selectedDoc?.id) return { id: selectedDoc.id, kind, title: docTitle || selectedDoc.title }
    if (kind === "sheets" && selectedSheet?.id) return { id: selectedSheet.id, kind, title: sheetTitle || selectedSheet.title }
    if (kind === "slides" && selectedDeck?.id) return { id: selectedDeck.id, kind, title: deckTitle || selectedDeck.title }
    return null
  }

  async function archiveActive() {
    const item = activeStudioItem()
    if (!item) {
      setStatus("Save this Studio item before archiving it.")
      return
    }
    await archiveStudioItem(item)
  }

  async function copyActive() {
    await navigator.clipboard?.writeText(currentPayload("export"))
    setStatus("Copied to clipboard.")
  }

  async function downloadActive(exportMode = false) {
    const base = fileTitle(activeTitle(), kind)
    if (kind === "sheets") return downloadText(`${base}.csv`, currentPayload("download"), "text/csv")
    if (kind === "slides" && exportMode) return exportPptx(base)
    if (kind === "slides") return downloadText(`${base}.outline.txt`, currentPayload("download"), "text/plain")
    downloadText(`${base}.${exportMode ? "txt" : "html"}`, currentPayload(exportMode ? "export" : "download"), exportMode ? "text/plain" : "text/html")
  }

  async function exportPptx(base: string) {
    const pptxgen = await loadPptxGen()
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

  function loadStudioItem(item: { id: string; kind: StudioKind }) {
    setKind(item.kind)
    if (item.kind === "notes") setSelectedNoteId(item.id)
    if (item.kind === "docs") setDocId(item.id)
    if (item.kind === "sheets") setSheetId(item.id)
    if (item.kind === "slides") setDeckId(item.id)
  }

  function selectItem(item: { id: string; kind: StudioKind; title: string }) {
    loadStudioItem(item)
    updateActivePaneKind(item.kind, item.id, item.title)
  }

  function paneActiveTab(pane: StudioPane) {
    return pane.tabs.find((tab) => tab.id === pane.activeTabId) || pane.tabs[0]
  }

  function previewForPane(pane: StudioPane): StudioPanePreview {
    const tab = paneActiveTab(pane)
    if (!tab) return { kind: "notes", title: "Studio item", summary: "No item open" }
    const source = tab.itemId ? findStudioItem({ id: tab.itemId, kind: tab.kind }) : undefined
    if (!source) return { kind: tab.kind, title: tab.title || studioCreateLabels[tab.kind], summary: "Draft pane" }
    if (tab.kind === "notes") return { kind: tab.kind, title: (source as Note).title, summary: plainTextFromHtml((source as Note).content || "").slice(0, 180) || "Empty note", updatedAt: (source as Note).updated_at }
    if (tab.kind === "docs") return { kind: tab.kind, title: (source as WorkspaceDocument).title, summary: textFromDocument(source as WorkspaceDocument).slice(0, 180) || "Empty doc", updatedAt: (source as WorkspaceDocument).updated_at }
    if (tab.kind === "sheets") return { kind: tab.kind, title: (source as WorkspaceSheet).title, summary: `${cellsFromSheet(source as WorkspaceSheet).length} rows`, updatedAt: (source as WorkspaceSheet).updated_at }
    return { kind: tab.kind, title: (source as WorkspaceDeck).title, summary: `${slidesFromDeck(source as WorkspaceDeck).length} slides`, updatedAt: (source as WorkspaceDeck).updated_at }
  }

  function activatePane(pane: StudioPane) {
    const tab = paneActiveTab(pane)
    if (tab?.itemId) loadStudioItem({ id: tab.itemId, kind: tab.kind })
    else if (tab) setKind(tab.kind)
    setLayout((current) => ({ ...current, activePaneId: pane.id }))
  }

  function openItemInSplit(item: StudioListItem) {
    if (item.archived_at) {
      setStatus("Restore this item before opening it in a split pane.")
      return
    }
    loadStudioItem(item)
    setLayout((current) => {
      const group = current.groups[0]
      const split = splitStudioPane(current, current.activePaneId, group.direction || "horizontal")
      const splitGroup = split.groups[0]
      const tab = createStudioTab(item.kind, item.title, item.id)
      const panes = splitGroup.panes.map((pane) => (
        pane.id === split.activePaneId ? { ...pane, activeTabId: tab.id, tabs: [tab] } : pane
      ))
      return normalizeStudioLayout({ ...split, groups: [{ ...splitGroup, panes }] })
    })
    setStatus(`Opened ${item.title} in a split pane.`)
  }

  function updateCell(rowIndex: number, cellIndex: number, value: string) {
    setCells((current) => current.map((row, nextRow) => (
      nextRow === rowIndex ? row.map((cell, nextCell) => (nextCell === cellIndex ? value : cell)) : row
    )))
  }

  const activePanes = layout.groups[0]?.panes || []
  const canUndoRedo = kind === "notes" || kind === "docs"
  const hasActiveItem = kind === "notes" ? Boolean(noteDraft) : true
  const activeStudioTab = getStudioKindOption(kind)
  const ActiveStudioIcon = studioKindIcons[activeStudioTab.kind]

  return (
    <div className="grid gap-3">
      <Panel className="p-2">
        <div className="flex flex-wrap items-center gap-2">
          <ActionMenu label={activeStudioTab.label} icon={ActiveStudioIcon} primary>
            <div className="grid gap-1">
              {studioKindOptions.map((tab) => {
                const Icon = studioKindIcons[tab.kind]
                const active = kind === tab.kind
                const badge = dirtyBadgeMap.get(tab.kind)
                return (
                  <MenuAction key={tab.kind} active={active} icon={Icon} label={tab.label} onClick={() => selectKind(tab.kind)} meta={badge ? `${badge.count} draft${badge.count === 1 ? "" : "s"}` : tab.description} />
                )
              })}
            </div>
          </ActionMenu>
          <ActionMenu label="Create" icon={Plus} primary>
            <MenuAction icon={Plus} label={studioCreateLabels[kind]} onClick={createActive} meta={`Create in ${activeStudioTab.label}`} />
            <MenuAction icon={UploadCloud} label="Import content" onClick={() => setImportOpen((open) => !open)} meta="Paste raw notes, CSV, or slide outlines" />
          </ActionMenu>
          <StudioButton label="Save" icon={Save} onClick={() => saveActive()} disabled={!hasActiveItem} />
          <ActionMenu label="Edit" icon={Undo2}>
            <MenuAction disabled={!canUndoRedo} icon={Undo2} label="Undo" onClick={() => kind === "notes" ? setNoteHistory(undoHistory(noteHistory)) : setDocHistory(undoHistory(docHistory))} />
            <MenuAction disabled={!canUndoRedo} icon={Redo2} label="Redo" onClick={() => kind === "notes" ? setNoteHistory(redoHistory(noteHistory)) : setDocHistory(redoHistory(docHistory))} />
            <MenuAction icon={Clipboard} label="Copy" onClick={copyActive} />
            <MenuAction icon={Copy} label="Duplicate" onClick={duplicateActive} />
            <MenuAction danger icon={Archive} label="Archive/Delete" onClick={archiveActive} />
          </ActionMenu>
          <ActionMenu label="Export" icon={Download}>
            <MenuAction icon={Download} label="Download" onClick={() => downloadActive(false)} />
            <MenuAction icon={PanelRight} label="Export" onClick={() => downloadActive(true)} meta={kind === "slides" ? "PPTX when available" : "Portable text format"} />
          </ActionMenu>
          <ActionMenu label="Layout" icon={SplitSquareHorizontal}>
            <MenuAction icon={SplitSquareHorizontal} label="Split right" onClick={() => setLayout((current) => splitStudioPane(current, current.activePaneId, "horizontal"))} />
            <MenuAction icon={SplitSquareVertical} label="Split down" onClick={() => setLayout((current) => splitStudioPane(current, current.activePaneId, "vertical"))} />
            <MenuAction icon={Settings2} label="Reset layout" onClick={() => setLayout(createDefaultStudioLayout(kind, activeTitle() || "Studio"))} />
          </ActionMenu>
          <button onClick={() => setLayout((current) => ({ ...current, inspectorOpen: !current.inspectorOpen }))} className="ml-auto flex h-9 items-center gap-2 rounded-md border border-border bg-secondary px-3 text-sm font-medium text-secondary-foreground hover:bg-accent hover:text-accent-foreground">
            <PanelRight className="h-4 w-4" />
            <span className="hidden sm:inline">Inspector</span>
          </button>
        </div>
        {importOpen ? (
          <div className="mt-3 grid gap-2 rounded-md border border-border bg-background p-3 md:grid-cols-[1fr_160px_160px_auto]">
            <input
              value={importTitle}
              onChange={(event) => setImportTitle(event.target.value)}
              placeholder="Optional title"
              className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus:border-ring"
            />
            <select value={importTarget} onChange={(event) => setImportTarget(normalizeImportTargetSelection(event.target.value))} className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground">
              {importTargetOptions.map((target) => <option key={target} value={target}>{labelImportTarget(target)}</option>)}
            </select>
            <button onClick={organizeImport} disabled={importing} className="h-9 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60">
              {importing ? "Importing" : "Organize"}
            </button>
            <button onClick={() => setImportOpen(false)} className="h-9 rounded-md border border-border bg-secondary px-3 text-sm font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground">
              Close
            </button>
            <textarea
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              placeholder="Paste raw notes, CSV, lesson outline, or copied material. Auto-detect routes it to the best Studio type."
              className="min-h-24 rounded-md border border-input bg-background p-3 text-sm text-foreground outline-none focus:border-ring md:col-span-4"
            />
          </div>
        ) : null}
      </Panel>

      <div className="grid gap-3 xl:grid-cols-[280px_1fr]">
        <Panel className="min-h-[74vh] p-3">
          <StudioLibrary
            items={allItems}
            query={query}
            section={section}
            viewMode={viewMode}
            onApplyTemplate={applyTemplate}
            onArchive={archiveStudioItem}
            onAskAi={(item) => {
              selectItem(item)
              setInspectorTab("AI")
            }}
            onCopy={copyStudioItem}
            onDownload={(item) => downloadStudioItem(item)}
            onDuplicate={duplicateStudioItem}
            onExport={(item) => downloadStudioItem(item, true)}
            onOpenInSplit={openItemInSplit}
            onQuery={setQuery}
            onRestore={restoreStudioItem}
            onSection={setSection}
            onSelect={selectItem}
            onViewMode={setViewMode}
            activeKind={kind}
          />
        </Panel>

        <Panel className="min-w-0 p-0">
          <PanelGroup id="learn-studio-primary" direction={layout.groups[0]?.direction || "horizontal"} className="min-h-[74vh]">
            {activePanes.map((pane, index) => (
              <Fragment key={pane.id}>
                <ResizePanel id={pane.id} order={index} minSize={28} defaultSize={100 / activePanes.length}>
                  <StudioPaneSurface
                    active={layout.activePaneId === pane.id}
                    activeKind={kind}
                    activeSummary={activeSummaryText}
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
                    onCloseOthers={() => setLayout((current) => closeOtherStudioPanes(current, pane.id))}
                    onCopy={copyActive}
                    onDownload={() => downloadActive(false)}
                    onDuplicate={duplicateActive}
                    onExport={() => downloadActive(true)}
                    onPinPane={() => setLayout((current) => pinStudioPane(current, pane.id))}
                    onRenamePane={(label) => setLayout((current) => normalizeStudioLayout({ ...current, groups: [{ ...current.groups[0], panes: current.groups[0].panes.map((item) => item.id === pane.id ? { ...item, label } : item) }] }))}
                    onSave={() => saveActive()}
                    onSelectPane={() => activatePane(pane)}
                    onSelectTab={(tab) => {
                      if (tab.itemId) loadStudioItem({ id: tab.itemId, kind: tab.kind })
                      else setKind(tab.kind)
                      setLayout((current) => {
                        const group = current.groups[0]
                        const panes = group.panes.map((item) => item.id === pane.id ? { ...item, activeTabId: tab.id } : item)
                        return normalizeStudioLayout({ ...current, activePaneId: pane.id, groups: [{ ...group, panes }] })
                      })
                    }}
                    onSetActiveTitle={setActiveTitle}
                    onSetCells={setCells}
                    onSetDocHistory={setDocHistory}
                    onSetInspectorTab={setInspectorTab}
                    onSetNoteHistory={setNoteHistory}
                    onSetSelectedCell={setSelectedCell}
                    onSetSelectedSlideIndex={setSelectedSlideIndex}
                    onSetSlides={setSlides}
                    onSplitDown={() => setLayout((current) => splitStudioPane(current, pane.id, "vertical"))}
                    onSplitRight={() => setLayout((current) => splitStudioPane(current, pane.id, "horizontal"))}
                    options={options}
                    pane={pane}
                    panePreview={previewForPane(pane)}
                    saving={saving}
                    selectedCell={selectedCell}
                    selectedSlideIndex={selectedSlideIndex}
                    slides={slides}
                    status={status}
                    updateCell={updateCell}
                  />
                </ResizePanel>
                {index < activePanes.length - 1 && (
                  <PanelResizeHandle
                    id={`${pane.id}_handle`}
                    className={layout.groups[0]?.direction === "vertical" ? "h-1 bg-border hover:bg-primary data-[resize-handle-active]:bg-primary" : "w-1 bg-border hover:bg-primary data-[resize-handle-active]:bg-primary"}
                  />
                )}
              </Fragment>
            ))}
          </PanelGroup>
        </Panel>
      </div>
      {draftNotice ? <StudioDraftNotice message={draftNotice} /> : null}
    </div>
  )
}

function StudioLibrary({
  activeKind,
  items,
  onApplyTemplate,
  onArchive,
  onAskAi,
  onCopy,
  onDownload,
  onDuplicate,
  onExport,
  onOpenInSplit,
  onQuery,
  onRestore,
  onSection,
  onSelect,
  onViewMode,
  query,
  section,
  viewMode,
}: {
  activeKind: StudioKind
  items: StudioListItem[]
  onApplyTemplate: (template: StudioTemplate) => void
  onArchive: (item: StudioRecordItem) => void
  onAskAi: (item: StudioRecordItem) => void
  onCopy: (item: StudioRecordItem) => void
  onDownload: (item: StudioRecordItem) => void
  onDuplicate: (item: StudioRecordItem) => void
  onExport: (item: StudioRecordItem) => void
  onOpenInSplit: (item: StudioListItem) => void
  onQuery: (value: string) => void
  onRestore: (item: StudioRecordItem) => void
  onSection: (value: string) => void
  onSelect: (item: StudioRecordItem) => void
  onViewMode: (value: StudioViewMode) => void
  query: string
  section: string
  viewMode: StudioViewMode
}) {
  const listRef = useRef<HTMLDivElement | null>(null)
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => viewMode === "board" ? 88 : 72,
    overscan: 8,
  })
  const virtualItems = virtualizer.getVirtualItems()
  const useVirtualList = viewMode !== "gallery" && items.length > 12
  const activeViewMode = getStudioViewModeOption(viewMode)
  const ActiveViewIcon = studioViewModeIcons[activeViewMode.id]

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <ActionMenu label={section} icon={List} compact>
          {studioSectionFilters.map((item) => (
            <MenuAction key={item} active={section === item} icon={List} label={item} onClick={() => onSection(item)} />
          ))}
        </ActionMenu>
        <ActionMenu label={activeViewMode.label} icon={ActiveViewIcon} compact>
          {studioViewModeOptions.map((item) => (
            <MenuAction key={item.id} active={viewMode === item.id} icon={studioViewModeIcons[item.id]} label={item.label} onClick={() => onViewMode(item.id)} />
          ))}
        </ActionMenu>
        <span className="rounded-md border border-border bg-background px-2.5 py-2 text-xs font-semibold text-muted-foreground">
          {items.length} item{items.length === 1 ? "" : "s"}
        </span>
      </div>
      <label className="flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search Studio" className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
      </label>
      <div ref={listRef} className="max-h-[44vh] overflow-auto pr-1">
        {useVirtualList ? (
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualItems.map((virtualRow) => {
              const item = items[virtualRow.index]
              return item ? (
                <div key={`${item.kind}_${item.id}`} style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${virtualRow.start}px)` }}>
                  <StudioItemButton item={item} onArchive={onArchive} onAskAi={onAskAi} onCopy={onCopy} onDownload={onDownload} onDuplicate={onDuplicate} onExport={onExport} onOpenInSplit={onOpenInSplit} onRestore={onRestore} onSelect={onSelect} />
                </div>
              ) : null
            })}
          </div>
        ) : (
          <div className={`grid gap-2 ${viewMode === "gallery" ? "grid-cols-2" : ""}`}>
            {items.map((item) => <StudioItemButton key={`${item.kind}_${item.id}`} item={item} onArchive={onArchive} onAskAi={onAskAi} onCopy={onCopy} onDownload={onDownload} onDuplicate={onDuplicate} onExport={onExport} onOpenInSplit={onOpenInSplit} onRestore={onRestore} onSelect={onSelect} />)}
          </div>
        )}
        {!items.length ? <EmptyState title="No Studio items" body="Create a note, doc, sheet, or deck, then open it in a split pane." /> : null}
      </div>
      <details className="rounded-md border border-border bg-background p-2">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          <span className="flex items-center gap-2"><FilePlus2 className="h-3.5 w-3.5" /> Templates</span>
          <ChevronDown className="h-3.5 w-3.5" />
        </summary>
        <div className="mt-2 grid gap-2">
          {studioTemplates[activeKind].map((template) => {
            const meta = getStudioTemplateMeta(activeKind, template)
            return (
            <button key={template.label} onClick={() => onApplyTemplate(template)} className="group/template overflow-hidden rounded-md border border-border bg-card text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/50 hover:bg-accent hover:text-accent-foreground">
              <span className="block h-1" style={{ background: meta.accent }} />
              <span className="grid gap-2 p-2.5">
                <span className="flex items-start justify-between gap-2">
                  <span>
                    <span className="block text-xs font-bold text-foreground">{template.label}</span>
                    <span className="mt-0.5 block text-[0.68rem] font-medium leading-4 text-muted-foreground">{meta.description}</span>
                  </span>
                  <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[0.62rem] font-bold uppercase tracking-[0.08em] text-secondary-foreground">{meta.style}</span>
                </span>
                <span className="grid grid-cols-3 gap-1" aria-hidden="true">
                  {meta.sections.slice(0, 3).map((section, index) => (
                    <span key={`${template.label}_${section}`} className="rounded bg-background p-1">
                      <span className="block h-1.5 rounded-full" style={{ background: index === 0 ? meta.accent : "hsl(var(--muted-foreground) / 0.28)" }} />
                      <span className="mt-1 block h-1 rounded-full bg-muted" />
                    </span>
                  ))}
                </span>
                <span className="flex flex-wrap gap-1">
                  {meta.sections.slice(0, 4).map((section) => (
                    <span key={`${template.label}_${section}_chip`} className="rounded-md bg-secondary px-1.5 py-0.5 text-[0.62rem] font-semibold text-secondary-foreground">{section}</span>
                  ))}
                </span>
              </span>
            </button>
          )})}
        </div>
      </details>
    </div>
  )
}

function getStudioTemplateMeta(kind: StudioKind, template: StudioTemplate) {
  const palette: Record<StudioKind, string> = {
    notes: "hsl(42 92% 55%)",
    docs: "hsl(204 78% 58%)",
    sheets: "hsl(151 58% 46%)",
    slides: "hsl(18 88% 58%)",
  }
  const sections = template.sections || extractTemplateSections(kind, template.body)
  return {
    accent: template.accent || palette[kind],
    description: template.description || describeTemplate(kind, template.label),
    sections,
    style: template.style || styleForTemplate(kind, template.label),
  }
}

function buildAppliedTemplate(kind: StudioKind, template: StudioTemplate) {
  if (kind === "sheets") return { ...template, body: enrichSheetTemplate(template.body) }
  if (kind === "slides") return { ...template, body: enrichSlideTemplate(template.body) }
  return { ...template, body: enrichRichTemplate(kind, template) }
}

function enrichRichTemplate(kind: StudioKind, template: StudioTemplate) {
  const meta = getStudioTemplateMeta(kind, template)
  const sections = meta.sections.slice(0, 4)
  return [
    template.body,
    `<blockquote><strong>Template intent:</strong> ${escapeHtml(meta.description)}</blockquote>`,
    "<h2>Workflow</h2>",
    "<ol>",
    `<li>Capture the raw idea in the ${escapeHtml(sections[0] || "first section")} area.</li>`,
    `<li>Add evidence, examples, or media under ${escapeHtml(sections[1] || "supporting notes")}.</li>`,
    "<li>Mark one weak point and one next action before saving.</li>",
    "</ol>",
    "<h2>Review checklist</h2>",
    "<ul><li>Turn one idea into a quiz question.</li><li>Create one active-recall card.</li><li>Link this item to a topic, file, or calendar block.</li></ul>",
    "<h2>Export notes</h2>",
    "<p>Keep headings short, add source links, and use the Studio export menu when this is ready to share.</p>",
  ].join("")
}

function enrichSheetTemplate(body: string) {
  const rows = body.split("\n").map((row) => row.split(","))
  const header = rows[0] || []
  const extras = ["Priority", "Owner", "Due", "Notes"].filter((column) => !header.includes(column))
  if (!extras.length) return body
  return rows.map((row, index) => {
    if (index === 0) return [...row, ...extras].join(",")
    const defaults = extras.map((column) => column === "Priority" ? "Medium" : column === "Owner" ? "Me" : "")
    return [...row, ...defaults].join(",")
  }).join("\n")
}

function enrichSlideTemplate(body: string) {
  const lines = body.split("\n").filter(Boolean)
  const hasClose = lines.some((line) => line.toLowerCase().startsWith("close|") || line.toLowerCase().startsWith("next|"))
  const enriched = hasClose ? lines : [...lines, "Next step|What the learner should do after this deck|Close"]
  return enriched.join("\n")
}

function extractTemplateSections(kind: StudioKind, body: string) {
  if (kind === "sheets") return body.split("\n")[0]?.split(",").slice(0, 4).filter(Boolean) || ["Rows", "Status", "Next"]
  if (kind === "slides") return body.split("\n").slice(0, 4).map((line) => line.split("|")[0]).filter(Boolean)
  const headings = Array.from(body.matchAll(/<h[12][^>]*>(.*?)<\/h[12]>/g)).map((match) => stripTags(match[1]).trim()).filter(Boolean)
  return headings.length ? headings.slice(0, 4) : ["Capture", "Organize", "Review"]
}

function describeTemplate(kind: StudioKind, label: string) {
  if (kind === "sheets") return "Structured rows with sortable fields, tracking columns, and export-ready CSV."
  if (kind === "slides") return "A designed deck skeleton with slide roles, accent labels, and speaker-ready flow."
  if (kind === "docs") return "A polished long-form document with hierarchy, evidence blocks, and review prompts."
  if (label.toLowerCase().includes("mistake")) return "A compact repair loop for error, cause, fix, and next review."
  return "A focused learning canvas with prompts, recall hooks, and clean organization."
}

function styleForTemplate(kind: StudioKind, label: string) {
  if (kind === "sheets") return "Grid"
  if (kind === "slides") return "Deck"
  if (label.toLowerCase().includes("cornell")) return "Cornell"
  if (label.toLowerCase().includes("brief")) return "Brief"
  return kind === "docs" ? "Doc" : "Note"
}

function stripTags(value: string) {
  return value.replace(/<[^>]*>/g, "")
}

function StudioItemButton({
  item,
  onArchive,
  onAskAi,
  onCopy,
  onDownload,
  onDuplicate,
  onExport,
  onOpenInSplit,
  onRestore,
  onSelect,
}: {
  item: StudioListItem
  onArchive: (item: StudioRecordItem) => void
  onAskAi: (item: StudioRecordItem) => void
  onCopy: (item: StudioRecordItem) => void
  onDownload: (item: StudioRecordItem) => void
  onDuplicate: (item: StudioRecordItem) => void
  onExport: (item: StudioRecordItem) => void
  onOpenInSplit: (item: StudioListItem) => void
  onRestore: (item: StudioRecordItem) => void
  onSelect: (item: StudioRecordItem) => void
}) {
  const Icon = item.kind === "sheets" ? Table2 : item.kind === "slides" ? Presentation : item.kind === "docs" ? BookOpen : FileText
  const archived = Boolean(item.archived_at)
  const [actionError, setActionError] = useState("")
  const [pendingAction, setPendingAction] = useState("")
  const styles = studioKindStyles[item.kind]
  const actionGroups = buildStudioRecordActionGroups({ archived })

  async function runRecordAction(label: string, action: () => void | Promise<void>, confirmMessage?: string) {
    if (pendingAction) return
    if (confirmMessage && !window.confirm(confirmMessage)) return
    setActionError("")
    setPendingAction(label)
    try {
      await action()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : `${label} failed.`)
    } finally {
      setPendingAction("")
    }
  }

  const actionCatalog: Record<StudioRecordActionId, {
    danger?: boolean
    icon: React.ComponentType<{ className?: string }>
    label: string
    pendingLabel: string
    meta?: string
    onClick: () => void | Promise<void>
    confirmMessage?: string
  }> = {
    open: { icon: FileText, label: "Open", pendingLabel: "Opening", meta: "Edit in this pane", onClick: () => onSelect(item) },
    split: { icon: SplitSquareHorizontal, label: "Open in split", pendingLabel: "Opening split", meta: "Work side by side", onClick: () => onOpenInSplit(item) },
    copy: { icon: Clipboard, label: "Copy", pendingLabel: "Copying", meta: "Copy content", onClick: () => onCopy(item) },
    duplicate: { icon: Copy, label: "Duplicate", pendingLabel: "Duplicating", meta: "Create a second item", onClick: () => onDuplicate(item) },
    download: { icon: Download, label: "Download", pendingLabel: "Downloading", meta: "Native file format", onClick: () => onDownload(item) },
    export: { icon: PanelRight, label: "Export", pendingLabel: "Exporting", meta: "Portable format", onClick: () => onExport(item) },
    ai: { icon: Bot, label: "Ask AI", pendingLabel: "Opening AI", meta: "Use as context", onClick: () => onAskAi(item) },
    archive: {
      danger: true,
      icon: Archive,
      label: "Archive",
      pendingLabel: "Archiving",
      meta: "Move out of the main list",
      onClick: () => onArchive(item),
      confirmMessage: `Archive "${item.title}"? You can restore it from the Archived section.`,
    },
    restore: { icon: Undo2, label: "Restore", pendingLabel: "Restoring", meta: "Return to Studio", onClick: () => onRestore(item) },
  }

  function runCatalogAction(actionId: StudioRecordActionId) {
    const action = actionCatalog[actionId]
    return runRecordAction(action.pendingLabel, action.onClick, action.confirmMessage)
  }

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <article className={`relative mb-2 overflow-hidden rounded-md border border-border bg-background p-3 text-sm transition hover:-translate-y-0.5 hover:shadow-sm ${styles.card}`}>
          <span className={`absolute inset-y-0 left-0 w-1 ${styles.accent}`} />
          <button onClick={() => onSelect(item)} className="w-full text-left">
            <span className="flex items-center gap-2 font-medium text-foreground">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${styles.icon}`}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-1">{item.title}</span>
                <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <span className={`rounded px-1.5 py-0.5 font-semibold ${styles.chip}`}>{archived ? "Archived" : styles.label}</span>
                  <span>{item.updated_at ? formatDate(item.updated_at) : item.summary || "Draft"}</span>
                </span>
              </span>
            </span>
          </button>
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-[0.68rem] font-semibold text-muted-foreground">
              {pendingAction ? `${pendingAction}...` : archived ? "Archived item" : "Click card to open"}
            </span>
            <ActionMenu align="right" compact label={pendingAction || "More"} icon={MoreHorizontal}>
              {actionGroups.map((group) => (
                <div key={group.id} className="border-t border-border/70 p-1 first:border-t-0">
                  <div className="mb-1 flex items-center justify-between gap-2 px-2 pt-1">
                    <span className="text-[0.65rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">{group.label}</span>
                    <span className="truncate text-[0.65rem] font-medium text-muted-foreground">{group.summary}</span>
                  </div>
                  {group.actions.map((actionId) => {
                    const action = actionCatalog[actionId]
                    return (
                      <MenuAction
                        key={actionId}
                        danger={action.danger}
                        disabled={Boolean(pendingAction)}
                        icon={action.icon}
                        label={pendingAction === action.pendingLabel ? `${action.pendingLabel}...` : action.label}
                        meta={action.meta}
                        onClick={() => runCatalogAction(actionId)}
                      />
                    )
                  })}
                </div>
              ))}
            </ActionMenu>
          </div>
          {actionError ? <p className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive">{actionError}</p> : null}
        </article>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="z-50 min-w-64 rounded-md border border-border bg-popover p-1 text-sm text-popover-foreground shadow-xl">
          {actionGroups.map((group, groupIndex) => (
            <Fragment key={group.id}>
              {groupIndex > 0 ? <ContextMenu.Separator className="my-1 h-px bg-border" /> : null}
              <ContextMenu.Label className="flex items-center justify-between gap-3 px-2 py-1 text-[0.65rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                <span>{group.label}</span>
                <span className="max-w-36 truncate font-medium normal-case tracking-normal">{group.summary}</span>
              </ContextMenu.Label>
              {group.actions.map((actionId) => {
                const action = actionCatalog[actionId]
                const ActionIcon = action.icon
                return (
                  <ContextMenu.Item
                    key={actionId}
                    disabled={Boolean(pendingAction)}
                    onClick={() => runCatalogAction(actionId)}
                    className={`context-item ${action.danger ? "text-destructive focus:text-destructive" : ""}`}
                  >
                    <ActionIcon className="h-4 w-4" />
                    <span>{pendingAction === action.pendingLabel ? `${action.pendingLabel}...` : action.label}</span>
                  </ContextMenu.Item>
                )
              })}
            </Fragment>
          ))}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
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
  onCloseOthers,
  onCopy,
  onDownload,
  onDuplicate,
  onExport,
  onPinPane,
  onRenamePane,
  onSave,
  onSelectPane,
  onSelectTab,
  onSetActiveTitle,
  onSetCells,
  onSetDocHistory,
  onSetInspectorTab,
  onSetNoteHistory,
  onSetSelectedCell,
  onSetSelectedSlideIndex,
  onSetSlides,
  onSplitDown,
  onSplitRight,
  options,
  pane,
  panePreview,
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
  onCloseOthers: () => void
  onCopy: () => void
  onDownload: () => void
  onDuplicate: () => void
  onExport: () => void
  onPinPane: () => void
  onRenamePane: (value: string) => void
  onSave: () => void
  onSelectPane: () => void
  onSelectTab: (tab: StudioTab) => void
  onSetActiveTitle: (value: string) => void
  onSetCells: React.Dispatch<React.SetStateAction<string[][]>>
  onSetDocHistory: React.Dispatch<React.SetStateAction<HistoryState<string>>>
  onSetInspectorTab: (value: string) => void
  onSetNoteHistory: React.Dispatch<React.SetStateAction<HistoryState<string>>>
  onSetSelectedCell: (value: { row: number; column: number }) => void
  onSetSelectedSlideIndex: (value: number) => void
  onSetSlides: React.Dispatch<React.SetStateAction<WorkspaceDeck["slides"]>>
  onSplitDown: () => void
  onSplitRight: () => void
  options: WorkspaceOptions
  pane: StudioPane
  panePreview: StudioPanePreview
  saving: boolean
  selectedCell: { row: number; column: number }
  selectedSlideIndex: number
  slides: WorkspaceDeck["slides"]
  status: string
  updateCell: (rowIndex: number, cellIndex: number, value: string) => void
}) {
  const viewKind = active ? activeKind : panePreview.kind
  const viewSummary = active ? activeSummary : panePreview.summary
  const viewTitle = active ? activeTitle : panePreview.title
  const activeTab = getStudioKindOption(viewKind)
  const Icon = studioKindIcons[activeTab.kind]
  const activePaneTab = pane.tabs.find((tab) => tab.id === pane.activeTabId) || pane.tabs[0]
  const itemTabs = pane.tabs.filter((tab) => tab.itemId)
  const visiblePaneTabs = itemTabs.length > 0
    ? activePaneTab?.itemId ? itemTabs : [activePaneTab, ...itemTabs].filter(Boolean)
    : activePaneTab ? [activePaneTab] : []
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <section onFocus={onSelectPane} onClick={onSelectPane} className={`relative flex h-full min-w-0 flex-col border-border ${active ? "bg-card" : "bg-background/70"}`}>
          <div className={`border-b border-border p-3 ${active ? "ring-1 ring-inset ring-primary/40" : ""}`}>
            <div className="flex items-center gap-2">
              <input value={pane.label} onChange={(event) => onRenamePane(event.target.value)} className="h-8 w-24 rounded-md border border-border bg-secondary px-2 text-xs font-semibold text-secondary-foreground outline-none focus:border-ring" title="Rename order group" />
              {pane.pinned ? <span className="inline-flex h-8 items-center rounded-md border border-primary/40 bg-primary/10 px-2 text-xs font-semibold text-primary">Pinned</span> : null}
              <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
                {visiblePaneTabs.map((tab: StudioTab) => {
                  const tabActive = tab.id === pane.activeTabId
                  const tabLabel = formatStudioTabLabel(tab)
                  return (
                    <button key={tab.id} onClick={() => onSelectTab(tab)} className={`flex h-8 max-w-40 items-center gap-1.5 rounded-md border px-2 text-xs font-semibold ${tabActive ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground"}`} title={tabLabel}>
                      <span className="rounded bg-background/20 px-1">{pane.order}</span>
                      <span className="truncate">{tabLabel}</span>
                      {tab.pinned ? <Maximize2 className="h-3 w-3" /> : null}
                    </button>
                  )
                })}
              </div>
              <ActionMenu align="right" compact label="Pane" icon={MoreHorizontal}>
                <MenuAction icon={SplitSquareHorizontal} label="Split right" onClick={onSplitRight} />
                <MenuAction icon={SplitSquareVertical} label="Split down" onClick={onSplitDown} />
                <MenuAction icon={Maximize2} label={pane.pinned ? "Unpin pane" : "Pin pane"} onClick={onPinPane} />
                <MenuAction icon={Scissors} label="Close other panes" onClick={onCloseOthers} />
                <MenuAction danger icon={X} label="Close pane" onClick={onClosePane} />
              </ActionMenu>
            </div>
            <div className="mt-3 flex flex-wrap items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{activeTab.label} Studio</p>
                <input value={viewTitle} onChange={(event) => onSetActiveTitle(event.target.value)} readOnly={!active} className="mt-1 w-full bg-transparent text-2xl font-semibold text-foreground outline-none" />
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="inline-flex h-6 items-center rounded-md border border-border bg-background px-2 font-medium text-foreground">
                    {active && saving ? "Saving..." : active && lastSaved ? `Saved ${lastSaved}` : "Draft"}
                  </span>
                  <span>{viewSummary}</span>
                  <details className="relative">
                    <summary className="inline-flex h-6 w-6 list-none items-center justify-center rounded-md border border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground" aria-label={`About ${activeTab.label}`}>
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </summary>
                    <p className="absolute left-0 top-7 z-30 w-64 rounded-md border border-border bg-popover p-2 text-xs leading-5 text-popover-foreground shadow-xl">{activeTab.description}</p>
                  </details>
                </div>
              </div>
              {active ? (
                <div className="flex items-center gap-1">
                  <MiniAction icon={Save} label="Save" onClick={onSave} />
                  <ActionMenu align="right" compact label="Actions" icon={MoreHorizontal}>
                    <MenuAction icon={Clipboard} label="Copy" onClick={onCopy} />
                    <MenuAction icon={Copy} label="Duplicate" onClick={onDuplicate} />
                    <MenuAction icon={Download} label="Download" onClick={onDownload} />
                    <MenuAction icon={PanelRight} label="Export" onClick={onExport} />
                    <MenuAction danger icon={Archive} label="Archive/Delete" onClick={onArchive} />
                  </ActionMenu>
                </div>
              ) : null}
            </div>
          </div>
          {active && status ? <StudioStatusToast message={status} /> : null}
          {!active ? (
            <StudioPanePreviewCard preview={panePreview} onOpen={onSelectPane} />
          ) : (
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
          )}
        </section>
      </ContextMenu.Trigger>
      <StudioContextContent onCopy={onCopy} onDuplicate={onDuplicate} onArchive={onArchive} onAskAi={() => onSetInspectorTab("AI")} />
    </ContextMenu.Root>
  )
}

function StudioPanePreviewCard({ onOpen, preview }: { onOpen: () => void; preview: StudioPanePreview }) {
  const tab = getStudioKindOption(preview.kind)
  const Icon = studioKindIcons[tab.kind]
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-4">
      <button onClick={onOpen} className="w-full max-w-md rounded-md border border-border bg-background p-4 text-left shadow-sm transition hover:border-primary/60 hover:bg-accent/40">
        <span className="mb-3 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
            <Icon className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{tab.label}</span>
            <span className="line-clamp-1 text-base font-semibold text-foreground">{preview.title}</span>
          </span>
        </span>
        <span className="line-clamp-3 text-sm leading-6 text-muted-foreground">{preview.summary}</span>
        <span className="mt-4 inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground">
          Edit this pane
        </span>
      </button>
    </div>
  )
}

function StudioStatusToast({ message }: { message: string }) {
  return (
    <div aria-live="polite" className="pointer-events-none absolute bottom-3 right-3 z-30 max-w-[min(24rem,calc(100%-1.5rem))] rounded-md border border-border bg-popover/95 px-3 py-2 text-xs font-semibold text-popover-foreground shadow-xl backdrop-blur">
      {message}
    </div>
  )
}

function StudioDraftNotice({ message }: { message: string }) {
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-50 rounded-full border border-border bg-popover/95 px-3 py-1.5 text-xs font-semibold text-popover-foreground shadow-xl backdrop-blur">
      {message}
    </div>
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
    const visibleCells = ensureSheetCells(cells)
    const selectedCellValue = visibleCells[selectedCell.row]?.[selectedCell.column] || ""
    const formulaPreview = selectedCellValue.trim().startsWith("=") ? evaluateSheetFormula(visibleCells, selectedCellValue) : null
    const applyFormula = (functionName: "SUM" | "AVERAGE" | "MIN" | "MAX" | "COUNT") => {
      updateCell(selectedCell.row, selectedCell.column, buildSheetFormula(functionName, selectedCell.column, visibleCells.length))
    }
    return (
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card p-2">
          <ActionMenu label="Rows" icon={Rows3}>
            <MenuAction icon={Rows3} label="Insert row" onClick={() => onSetCells((current) => addRow(ensureSheetCells(current), selectedCell.row))} />
            <MenuAction icon={Scissors} label="Move row up" onClick={() => onSetCells((current) => moveRow(ensureSheetCells(current), selectedCell.row, -1))} />
            <MenuAction danger icon={Trash2} label="Delete row" onClick={() => onSetCells((current) => deleteRow(ensureSheetCells(current), selectedCell.row))} />
          </ActionMenu>
          <ActionMenu label="Columns" icon={Columns3}>
            <MenuAction icon={Columns3} label="Insert column" onClick={() => onSetCells((current) => addColumn(ensureSheetCells(current), selectedCell.column))} />
            <MenuAction icon={Scissors} label="Move column right" onClick={() => onSetCells((current) => moveColumn(ensureSheetCells(current), selectedCell.column, 1))} />
            <MenuAction danger icon={Trash2} label="Delete column" onClick={() => onSetCells((current) => deleteColumn(ensureSheetCells(current), selectedCell.column))} />
          </ActionMenu>
          <ActionMenu label="Fill" icon={Grid2X2}>
            <MenuAction icon={Rows3} label="Fill down" onClick={() => onSetCells((current) => fillSheetRange(ensureSheetCells(current), { selectedRange: { startRow: selectedCell.row, startColumn: selectedCell.column, endRow: ensureSheetCells(current).length - 1, endColumn: selectedCell.column } }, "down"))} />
            <MenuAction icon={Columns3} label="Fill right" onClick={() => onSetCells((current) => fillSheetRange(ensureSheetCells(current), { selectedRange: { startRow: selectedCell.row, startColumn: selectedCell.column, endRow: selectedCell.row, endColumn: (ensureSheetCells(current)[0]?.length || 1) - 1 } }, "right"))} />
            <MenuAction icon={ListOrdered} label="Sort A-Z" onClick={() => onSetCells((current) => sortSheetByColumn(ensureSheetCells(current), selectedCell.column, "asc"))} />
          </ActionMenu>
          <span className="ml-auto rounded-md bg-secondary px-2 py-1 text-xs font-semibold text-secondary-foreground">
            R{selectedCell.row + 1} C{selectedCell.column + 1}
          </span>
        </div>
        <div className="grid gap-2 rounded-md border border-border bg-card p-2 md:grid-cols-[1fr_auto]">
          <label className="flex min-h-9 items-center gap-2 rounded-md border border-input bg-background px-2 text-sm text-foreground">
            <Braces className="h-4 w-4 text-muted-foreground" />
            <input
              value={selectedCellValue}
              onChange={(event) => updateCell(selectedCell.row, selectedCell.column, event.target.value)}
              placeholder="Formula or cell value"
              className="w-full bg-transparent outline-none"
            />
          </label>
          <ActionMenu align="right" label="Formula" icon={Braces}>
            {(["SUM", "AVERAGE", "MIN", "MAX", "COUNT"] as const).map((formula) => (
              <MenuAction key={formula} icon={Braces} label={formula} onClick={() => applyFormula(formula)} />
            ))}
          </ActionMenu>
          {formulaPreview ? (
            <p className={`text-xs font-semibold md:col-span-2 ${formulaPreview.ok ? "text-success" : "text-destructive"}`}>
              {formulaPreview.ok ? `Result ${formulaPreview.value} - ${formulaPreview.reason}` : formulaPreview.reason}
            </p>
          ) : null}
        </div>
        <details className="rounded-md border border-border bg-background p-2">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            <span className="flex items-center gap-2"><UploadCloud className="h-3.5 w-3.5" /> CSV import</span>
            <ChevronDown className="h-3.5 w-3.5" />
          </summary>
          <textarea
            onBlur={(event) => {
              if (!event.target.value.trim()) return
              onSetCells(importCsvToSheet(event.target.value).cells)
              event.target.value = ""
            }}
            placeholder="Paste CSV here, then leave the field to import rows into the grid."
            className="mt-2 h-16 w-full rounded-md border border-input bg-background p-3 text-sm outline-none focus:border-ring"
          />
        </details>
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
                        onDuplicate={() => onSetCells((current) => addColumn(ensureSheetCells(current), cellIndex))}
                        onArchive={() => onSetCells((current) => deleteColumn(ensureSheetCells(current), cellIndex))}
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
  const slideShowSummary = useMemo(() => summarizeSlideShow(slides), [slides])
  const selectedTransition = slideTransitionPresets[selectedSlide?.transition || "none"]
  const selectedAnimation = slideAnimationPresets[selectedSlide?.animation || "none"]
  const slideIds = slides.map((_, index) => `slide-${index}`)
  const handleSlideDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const from = slideIds.indexOf(String(active.id))
    const to = slideIds.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    onSetSlides((current) => arrayMove(current, from, to))
    onSetSelectedSlideIndex(to)
  }
  return (
    <div className="grid min-h-[58vh] gap-3 lg:grid-cols-[150px_1fr_230px]">
      <div className="space-y-2 overflow-auto">
        <button onClick={() => onSetSlides([...slides, { title: "New slide", body: "Add the point, image cue, or quiz prompt.", accent: "New", layout: "title", theme: "midnight", background: "#111827", transition: "fade", animation: "rise", speakerNotes: "" }])} className="flex h-9 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-primary-foreground">
          <Plus className="h-4 w-4" /> Slide
        </button>
        <DndContext collisionDetection={closestCenter} onDragEnd={handleSlideDragEnd}>
          <SortableContext items={slideIds} strategy={verticalListSortingStrategy}>
            {slides.map((slide, index) => (
              <SortableSlideThumb
                key={`slide-${index}`}
                id={`slide-${index}`}
                active={selectedSlideIndex === index}
                index={index}
                onArchive={() => onSetSlides((current) => current.length > 1 ? current.filter((_, next) => next !== index) : current)}
                onCopy={() => navigator.clipboard?.writeText(`${slide.title}\n${slide.body}`)}
                onDuplicate={() => onSetSlides((current) => duplicateSlide(current, index))}
                onSelect={() => onSetSelectedSlideIndex(index)}
                slide={slide}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>
      <div
        className={`${options.slidesAspect === "4:3" ? "aspect-[4/3]" : "aspect-video"} relative overflow-hidden rounded-lg border border-border p-8 text-white shadow-sm transition-all ${selectedSlide?.transition === "fade" ? "hover:opacity-90" : selectedSlide?.transition === "zoom" ? "hover:shadow-lg" : ""} ${selectedSlide?.animation === "rise" ? "hover:-translate-y-1" : selectedSlide?.animation === "emphasis" ? "hover:scale-[1.01]" : ""}`}
        style={{ background: selectedSlide?.background || slideDesignPresets[(selectedSlide?.theme || "midnight") as keyof typeof slideDesignPresets]?.background || "#111827" }}
      >
        {selectedSlide ? (
          <div className="relative z-10 flex h-full flex-col">
            <input value={selectedSlide.accent || ""} onChange={(event) => onSetSlides(slides.map((item, next) => next === selectedSlideIndex ? { ...item, accent: event.target.value } : item))} className="mb-3 w-full bg-transparent text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200 outline-none" />
            <input value={selectedSlide.title} onChange={(event) => onSetSlides(slides.map((item, next) => next === selectedSlideIndex ? { ...item, title: event.target.value } : item))} className="w-full bg-transparent text-4xl font-semibold leading-tight outline-none" />
            <textarea value={selectedSlide.body} onChange={(event) => onSetSlides(slides.map((item, next) => next === selectedSlideIndex ? { ...item, body: event.target.value } : item))} className="mt-5 min-h-32 flex-1 resize-none bg-transparent text-lg leading-8 text-slate-200 outline-none" />
          </div>
        ) : null}
        {selectedSlide?.objects?.map((object) => <SlideCanvasObject key={object.id} object={object} />)}
      </div>
      <div className="grid gap-3">
        <div className="grid grid-cols-3 gap-2 rounded-md border border-border bg-card p-2 text-center text-xs">
          <span className="rounded-md bg-secondary px-2 py-1 text-secondary-foreground">{slideShowSummary.slideCount} slides</span>
          <span className="rounded-md bg-secondary px-2 py-1 text-secondary-foreground">{slideShowSummary.totalMinutes} min</span>
          <span className="rounded-md bg-secondary px-2 py-1 text-secondary-foreground">{Math.ceil((slideShowSummary.slideTimings[selectedSlideIndex]?.durationMs || 0) / 1000)}s here</span>
        </div>
        <ActionMenu label="Design" icon={LayoutPanelLeft}>
          <MenuSelect label="Layout" onChange={(value) => onSetSlides(slides.map((item, next) => next === selectedSlideIndex ? { ...item, layout: value as WorkspaceDeck["slides"][number]["layout"] } : item))} options={["title", "two-column", "image", "quote"].map((value) => ({ label: value, value }))} />
          <MenuSelect label="Theme" onChange={(value) => onSetSlides(slides.map((item, next) => next === selectedSlideIndex ? applySlideDesignPreset(item, value as keyof typeof slideDesignPresets) : item))} options={Object.keys(slideDesignPresets).map((value) => ({ label: value, value }))} />
          <label className="grid gap-1 px-2 py-1 text-xs font-semibold text-muted-foreground">
            Background
            <input value={selectedSlide?.background || "#111827"} onChange={(event) => onSetSlides(slides.map((item, next) => next === selectedSlideIndex ? { ...item, background: event.target.value } : item))} className="h-8 rounded-md border border-input bg-background px-2 text-foreground outline-none focus:border-ring" />
          </label>
        </ActionMenu>
        <ActionMenu label="Motion" icon={Maximize2}>
          <MenuSelect label="Transition" onChange={(value) => onSetSlides(slides.map((item, next) => next === selectedSlideIndex ? { ...item, transition: value as WorkspaceDeck["slides"][number]["transition"] } : item))} options={Object.keys(slideTransitionPresets).map((value) => ({ label: value, value }))} />
          <p className="mx-2 rounded-md bg-secondary px-2 py-1 text-xs text-secondary-foreground">{selectedTransition.description}</p>
          <MenuSelect label="Animation" onChange={(value) => onSetSlides(slides.map((item, next) => next === selectedSlideIndex ? { ...item, animation: value as WorkspaceDeck["slides"][number]["animation"] } : item))} options={Object.keys(slideAnimationPresets).map((value) => ({ label: value, value }))} />
          <p className="mx-2 rounded-md bg-secondary px-2 py-1 text-xs text-secondary-foreground">{selectedAnimation.description}</p>
        </ActionMenu>
        <ActionMenu label="Insert" icon={Plus}>
          <MenuAction icon={Type} label="Text box" onClick={() => onSetSlides((current) => current.map((item, next) => next === selectedSlideIndex ? { ...item, objects: [...(item.objects || []), createSlideDesignObject("text")] } : item))} />
          <MenuAction icon={LayoutPanelLeft} label="Shape" onClick={() => onSetSlides((current) => current.map((item, next) => next === selectedSlideIndex ? { ...item, objects: [...(item.objects || []), createSlideDesignObject("shape")] } : item))} />
          <MenuAction icon={ImageIcon} label="Image" onClick={() => onSetSlides((current) => current.map((item, next) => next === selectedSlideIndex ? { ...item, objects: [...(item.objects || []), createSlideDesignObject("image")] } : item))} />
          <MenuAction icon={Table2} label="Table" onClick={() => onSetSlides((current) => current.map((item, next) => next === selectedSlideIndex ? { ...item, objects: [...(item.objects || []), createSlideDesignObject("table")] } : item))} />
        </ActionMenu>
        <ActionMenu label="Arrange" icon={Scissors}>
          <MenuAction icon={ChevronDown} label="Move up" onClick={() => onSetSlides((current) => moveSlide(current, selectedSlideIndex, -1))} />
          <MenuAction icon={ChevronDown} label="Move down" onClick={() => onSetSlides((current) => moveSlide(current, selectedSlideIndex, 1))} />
          <MenuAction icon={Copy} label="Duplicate slide" onClick={() => onSetSlides((current) => duplicateSlide(current, selectedSlideIndex))} />
          <MenuAction danger icon={Trash2} label="Delete slide" onClick={() => onSetSlides((current) => current.length > 1 ? current.filter((_, index) => index !== selectedSlideIndex) : current)} />
        </ActionMenu>
        <details className="rounded-md border border-border bg-background p-2">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Speaker notes
            <ChevronDown className="h-3.5 w-3.5" />
          </summary>
          <textarea value={selectedSlide?.speakerNotes || ""} onChange={(event) => onSetSlides(slides.map((item, next) => next === selectedSlideIndex ? { ...item, speakerNotes: event.target.value } : item))} placeholder="Speaker notes" className="mt-2 min-h-32 w-full rounded-md border border-input bg-background p-3 text-sm text-foreground outline-none focus:border-ring" />
        </details>
        {selectedSlide?.objects?.length ? (
          <div className="grid gap-2 rounded-md border border-border bg-background p-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Objects</p>
            {selectedSlide.objects.map((object) => (
              <div key={object.id} className="grid gap-2 rounded-md border border-border bg-card p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-md bg-secondary px-2 py-1 text-xs font-semibold text-secondary-foreground">{object.type}</span>
                  <button
                    onClick={() => onSetSlides((current) => current.map((item, next) => next === selectedSlideIndex ? removeSlideDesignObject(item, object.id) : item))}
                    className="rounded-md bg-secondary px-2 py-1 text-xs font-semibold text-secondary-foreground hover:bg-destructive hover:text-destructive-foreground"
                  >
                    Delete
                  </button>
                </div>
                <input
                  value={object.text || ""}
                  onChange={(event) => onSetSlides((current) => current.map((item, next) => next === selectedSlideIndex ? updateSlideDesignObject(item, object.id, { text: event.target.value }) : item))}
                  placeholder="Label or text"
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus:border-ring"
                />
                {object.type === "image" ? (
                  <input
                    value={object.src || ""}
                    onChange={(event) => onSetSlides((current) => current.map((item, next) => next === selectedSlideIndex ? updateSlideDesignObject(item, object.id, { src: event.target.value }) : item))}
                    placeholder="Image URL"
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus:border-ring"
                  />
                ) : null}
                <div className="grid grid-cols-4 gap-1">
                  {(["x", "y", "w", "h"] as const).map((field) => (
                    <label key={field} className="grid gap-1 text-[10px] font-semibold uppercase text-muted-foreground">
                      {field}
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={object[field]}
                        onChange={(event) => onSetSlides((current) => current.map((item, next) => next === selectedSlideIndex ? updateSlideDesignObject(item, object.id, { [field]: Number(event.target.value) }) : item))}
                        className="h-8 rounded-md border border-input bg-background px-1 text-xs text-foreground outline-none focus:border-ring"
                      />
                    </label>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <SlideStyleInput label="Text" value={styleValue(object, "color", "#ffffff")} onChange={(value) => onSetSlides((current) => current.map((item, next) => next === selectedSlideIndex ? updateSlideDesignObject(item, object.id, { style: { ...(object.style || {}), color: value } }) : item))} />
                  <SlideStyleInput label="Fill" value={styleValue(object, "background", "rgba(255,255,255,0.14)")} onChange={(value) => onSetSlides((current) => current.map((item, next) => next === selectedSlideIndex ? updateSlideDesignObject(item, object.id, { style: { ...(object.style || {}), background: value } }) : item))} />
                  <SlideStyleInput label="Size" value={styleValue(object, "fontSize", "14")} onChange={(value) => onSetSlides((current) => current.map((item, next) => next === selectedSlideIndex ? updateSlideDesignObject(item, object.id, { style: { ...(object.style || {}), fontSize: Number(value) || 14 } }) : item))} />
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function SlideCanvasObject({ object }: { object: SlideObject }) {
  const style = object.style || {}
  const canvasStyle: React.CSSProperties = {
    left: `${object.x}%`,
    top: `${object.y}%`,
    width: `${object.w}%`,
    height: `${object.h}%`,
    color: readStyleValue(style, "color", "#ffffff"),
    background: readStyleValue(style, "background", object.type === "text" ? "transparent" : "rgba(255,255,255,0.14)"),
    borderRadius: Number(readStyleValue(style, "borderRadius", "8")),
    fontSize: Number(readStyleValue(style, "fontSize", "14")),
  }
  if (object.type === "image") {
    return (
      <div className="absolute z-20 overflow-hidden border border-white/20 text-xs" style={canvasStyle}>
        {object.src ? <img src={object.src} alt={object.text || "Slide image"} className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center p-2 text-center">{object.text || "Image"}</span>}
      </div>
    )
  }
  if (object.type === "table") {
    const columns = (object.text || "Concept | Evidence | Action").split("|").map((item) => item.trim())
    return (
      <div className="absolute z-20 grid overflow-hidden border border-white/20 text-xs font-semibold" style={{ ...canvasStyle, gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
        {columns.map((column, index) => <span key={`${column}-${index}`} className="border-r border-white/20 p-2 last:border-r-0">{column}</span>)}
      </div>
    )
  }
  return (
    <div className={`absolute z-20 overflow-hidden border border-white/20 p-2 ${object.type === "shape" ? "flex items-center justify-center text-center font-semibold" : ""}`} style={canvasStyle}>
      {object.text || object.type}
    </div>
  )
}

function SlideStyleInput({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  return (
    <label className="grid gap-1 text-[10px] font-semibold uppercase text-muted-foreground">
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} className="h-8 rounded-md border border-input bg-background px-1 text-xs text-foreground outline-none focus:border-ring" />
    </label>
  )
}

function styleValue(object: SlideObject, key: string, fallback: string) {
  return readStyleValue(object.style || {}, key, fallback)
}

function readStyleValue(style: Record<string, unknown>, key: string, fallback: string) {
  const value = style[key]
  return value === undefined || value === null ? fallback : String(value)
}

function SortableSlideThumb({
  active,
  id,
  index,
  onArchive,
  onCopy,
  onDuplicate,
  onSelect,
  slide,
}: {
  active: boolean
  id: string
  index: number
  onArchive: () => void
  onCopy: () => void
  onDuplicate: () => void
  onSelect: () => void
  slide: WorkspaceDeck["slides"][number]
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id })
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <button
          ref={setNodeRef}
          style={{ transform: CSS.Transform.toString(transform), transition }}
          onClick={onSelect}
          className={`mb-2 w-full rounded-md border p-2 text-left ${active ? "border-primary bg-primary/10" : "border-border bg-background hover:bg-accent"}`}
          {...attributes}
          {...listeners}
        >
          <span className="block text-xs font-semibold text-muted-foreground">Slide {index + 1}</span>
          <span className="line-clamp-2 text-sm font-medium text-foreground">{slide.title}</span>
        </button>
      </ContextMenu.Trigger>
      <StudioContextContent onCopy={onCopy} onDuplicate={onDuplicate} onArchive={onArchive} onAskAi={() => undefined} />
    </ContextMenu.Root>
  )
}

function RichTextEditor({ large, onChange, placeholder, value }: { large?: boolean; onChange: (value: string) => void; placeholder: string; value: string }) {
  const documentSummary = useMemo(() => summarizeDocumentHtml(value), [value])
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ link: false, underline: false }),
      Underline,
      TextStyle,
      FontFamily,
      FontSize,
      Typography,
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
      <div className="flex flex-wrap items-center gap-2 border-t border-border bg-card px-3 py-2 text-xs text-muted-foreground">
        <span>{documentSummary.words} words</span>
        <span>{documentSummary.characters} chars</span>
        <span>{documentSummary.readingMinutes} min read</span>
        {documentSummary.headings.slice(0, 4).map((heading) => (
          <span key={`${heading.level}-${heading.title}`} className="rounded-md bg-secondary px-2 py-1 text-secondary-foreground">
            H{heading.level} {heading.title}
          </span>
        ))}
      </div>
    </div>
  )
}

function RichTextToolbar({ editor }: { editor: Editor | null }) {
  const [findText, setFindText] = useState("")
  const [headingStyles, setHeadingStyles] = useState<Record<HeadingStyleLevel, HeadingStylePreset>>(() => readHeadingStyles())
  const [headingStatus, setHeadingStatus] = useState("")
  const [replaceText, setReplaceText] = useState("")
  const [replaceStatus, setReplaceStatus] = useState("")
  const run = (fn: (editor: Editor) => void) => {
    if (!editor) return
    fn(editor)
    editor.commands.focus()
  }
  function replaceAll() {
    if (!editor || !findText) return
    const result = replaceTextInHtml(editor.getHTML(), findText, replaceText)
    editor.commands.setContent(result.html)
    setReplaceStatus(`${result.count} replaced`)
  }
  function saveHeadingStyle(level: HeadingStyleLevel) {
    if (!editor) return
    const next = { ...headingStyles, [level]: selectedHeadingStyle(editor) }
    setHeadingStyles(next)
    writeHeadingStyles(next)
    setHeadingStatus(`H${level} updated`)
  }
  function resetHeadingStyles() {
    if (typeof window !== "undefined") window.localStorage.removeItem(HEADING_STYLE_KEY)
    const next = readHeadingStyles()
    setHeadingStyles(next)
    setHeadingStatus("Styles reset")
  }
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-border bg-card/95 p-2 backdrop-blur">
      <ActionMenu label="Style" icon={Type}>
        <MenuAction icon={Type} label="Paragraph" onClick={() => run((item) => item.chain().focus().setParagraph().run())} />
        <MenuAction icon={Heading1} label="Apply Heading 1" onClick={() => run((item) => applyHeadingStyle(item, 1, headingStyles[1]))} />
        <MenuAction icon={Heading2} label="Apply Heading 2" onClick={() => run((item) => applyHeadingStyle(item, 2, headingStyles[2]))} />
        <MenuAction icon={Heading3} label="Apply Heading 3" onClick={() => run((item) => applyHeadingStyle(item, 3, headingStyles[3]))} />
        <MenuAction icon={Paintbrush} label="Update H1 from selection" onClick={() => saveHeadingStyle(1)} />
        <MenuAction icon={Paintbrush} label="Update H2 from selection" onClick={() => saveHeadingStyle(2)} />
        <MenuAction icon={Paintbrush} label="Update H3 from selection" onClick={() => saveHeadingStyle(3)} />
        <MenuAction icon={RotateCcw} label="Reset saved headings" onClick={resetHeadingStyles} />
        <MenuSelect label="Font" onChange={(value) => run((item) => item.chain().focus().setFontFamily(value).run())} options={studioFontOptions} />
        <MenuSelect label="Size" onChange={(value) => run((item) => item.chain().focus().setMark("textStyle", { fontSize: value }).run())} options={studioFontSizeOptions} />
      </ActionMenu>
      <ActionMenu label="Text" icon={Bold}>
        <MenuAction icon={Bold} label="Bold" onClick={() => run((item) => item.chain().focus().toggleBold().run())} />
        <MenuAction icon={Italic} label="Italic" onClick={() => run((item) => item.chain().focus().toggleItalic().run())} />
        <MenuAction icon={UnderlineIcon} label="Underline" onClick={() => run((item) => item.chain().focus().toggleUnderline().run())} />
        <MenuAction icon={Strikethrough} label="Strike" onClick={() => run((item) => item.chain().focus().toggleStrike().run())} />
        <MenuAction icon={Braces} label="Inline code" onClick={() => run((item) => item.chain().focus().toggleCode().run())} />
        <MenuSelect label="Text color" onChange={(value) => run((item) => value === "inherit" ? item.chain().focus().unsetColor().run() : item.chain().focus().setColor(value).run())} options={studioTextColorOptions} />
        <MenuSelect label="Highlight" onChange={(value) => run((item) => item.chain().focus().toggleHighlight({ color: value }).run())} options={studioHighlightColorOptions} />
      </ActionMenu>
      <ActionMenu label="Paragraph" icon={AlignLeft}>
        <MenuAction icon={AlignLeft} label="Align left" onClick={() => run((item) => item.chain().focus().setTextAlign("left").run())} />
        <MenuAction icon={AlignCenter} label="Align center" onClick={() => run((item) => item.chain().focus().setTextAlign("center").run())} />
        <MenuAction icon={AlignRight} label="Align right" onClick={() => run((item) => item.chain().focus().setTextAlign("right").run())} />
        <MenuAction icon={Quote} label="Quote" onClick={() => run((item) => item.chain().focus().toggleBlockquote().run())} />
        <MenuAction icon={List} label="Bullets" onClick={() => run((item) => item.chain().focus().toggleBulletList().run())} />
        <MenuAction icon={ListOrdered} label="Numbers" onClick={() => run((item) => item.chain().focus().toggleOrderedList().run())} />
        <MenuAction icon={CheckSquare} label="Tasks" onClick={() => run((item) => item.chain().focus().toggleTaskList().run())} />
      </ActionMenu>
      <ActionMenu label="Insert" icon={Plus}>
        {documentInsertGroups.map((group) => (
          <div key={group.label} className="grid gap-1">
            <p className="px-2 pt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground first:pt-0">{group.label}</p>
            {group.items.map((insertKind) => (
              <MenuAction key={insertKind} icon={FilePlus2} label={insertLabel(insertKind)} onClick={() => run((item) => item.chain().focus().insertContent(getDocumentInsertBlock(insertKind)).run())} />
            ))}
          </div>
        ))}
        <MenuAction icon={Grid2X2} label="Table" onClick={() => run((item) => item.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())} />
        <MenuAction icon={Rows3} label="Table row" onClick={() => run((item) => item.chain().focus().addRowAfter().run())} />
        <MenuAction icon={Columns3} label="Table column" onClick={() => run((item) => item.chain().focus().addColumnAfter().run())} />
        <MenuAction danger icon={Trash2} label="Delete table column" onClick={() => run((item) => item.chain().focus().deleteColumn().run())} />
        <MenuAction danger icon={Trash2} label="Delete table row" onClick={() => run((item) => item.chain().focus().deleteRow().run())} />
        <MenuAction icon={Minus} label="Divider" onClick={() => run((item) => item.chain().focus().setHorizontalRule().run())} />
        <MenuAction icon={Braces} label="Code block" onClick={() => run((item) => item.chain().focus().toggleCodeBlock().run())} />
        <MenuAction icon={ImageIcon} label="Image URL" onClick={() => {
          const src = window.prompt("Image URL")
          if (src) run((item) => item.chain().focus().setImage({ src }).run())
        }} />
      </ActionMenu>
      <ActionMenu label="Find" icon={Search} align="right">
        <label className="grid gap-1 px-2 py-1 text-xs font-semibold text-muted-foreground">
          Find
          <input value={findText} onChange={(event) => setFindText(event.target.value)} placeholder="Find" className="h-8 rounded-md border border-input bg-background px-2 text-foreground outline-none" />
        </label>
        <label className="grid gap-1 px-2 py-1 text-xs font-semibold text-muted-foreground">
          Replace
          <input value={replaceText} onChange={(event) => setReplaceText(event.target.value)} placeholder="Replace" className="h-8 rounded-md border border-input bg-background px-2 text-foreground outline-none" />
        </label>
        <button onClick={replaceAll} className="mx-2 mt-1 h-8 rounded-md border border-border bg-secondary px-2 text-xs font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground">
          Replace all
        </button>
      </ActionMenu>
      {replaceStatus ? <span className="text-xs font-semibold text-success">{replaceStatus}</span> : null}
      {headingStatus ? <span className="text-xs font-semibold text-success">{headingStatus}</span> : null}
    </div>
  )
}

function insertLabel(kind: DocumentInsertKind) {
  return kind
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
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
      <label className="mb-3 grid gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        Inspector
        <select value={inspectorTab} onChange={(event) => onSetInspectorTab(event.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm font-semibold normal-case tracking-normal text-foreground">
          {studioInspectorTabs.map((tab) => <option key={tab} value={tab}>{tab}</option>)}
        </select>
      </label>
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

function ActionMenu({
  align = "left",
  children,
  compact,
  icon: Icon,
  label,
  primary,
}: {
  align?: "left" | "right"
  children: React.ReactNode
  compact?: boolean
  icon: React.ComponentType<{ className?: string }>
  label: string
  primary?: boolean
}) {
  return (
    <details className="group relative inline-block">
      <summary
        className={`flex h-9 cursor-pointer list-none items-center gap-2 rounded-md border px-3 text-sm font-medium [&::-webkit-details-marker]:hidden ${
          compact ? "px-2" : ""
        } ${
          primary
            ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
            : "border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground"
        }`}
        title={label}
      >
        <Icon className="h-4 w-4" />
        <span className={compact ? "sr-only" : ""}>{label}</span>
        {!compact ? <ChevronDown className="h-3.5 w-3.5 opacity-70" /> : null}
      </summary>
      <div className={`absolute top-10 z-50 w-64 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-xl ${align === "right" ? "right-0" : "left-0"}`}>
        {children}
      </div>
    </details>
  )
}

function MenuAction({
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
  icon: React.ComponentType<{ className?: string }>
  label: string
  meta?: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
        danger
          ? "text-destructive hover:bg-destructive/10"
          : active
            ? "bg-primary text-primary-foreground"
            : "text-popover-foreground hover:bg-accent hover:text-accent-foreground"
      }`}
      type="button"
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="min-w-0">
        <span className="block truncate">{label}</span>
        {meta ? <span className={`mt-0.5 block line-clamp-2 text-xs font-medium ${active ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{meta}</span> : null}
      </span>
    </button>
  )
}

function MenuSelect({ label, onChange, options }: { label: string; onChange: (value: string) => void; options: Array<{ label: string; value: string }> }) {
  return (
    <label className="grid gap-1 px-2 py-1 text-xs font-semibold text-muted-foreground">
      {label}
      <select defaultValue="" onChange={(event) => event.target.value ? onChange(event.target.value) : undefined} className="h-8 rounded-md border border-input bg-background px-2 text-sm font-medium text-foreground">
        <option value="" disabled>Choose {label.toLowerCase()}</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  )
}

function StudioContextContent({ children, onArchive, onAskAi, onCopy, onDuplicate, showArchive = true }: { children?: React.ReactNode; onArchive: () => void; onAskAi: () => void; onCopy: () => void; onDuplicate: () => void; showArchive?: boolean }) {
  return (
    <ContextMenu.Portal>
      <ContextMenu.Content className="z-50 min-w-48 rounded-md border border-border bg-popover p-1 text-sm text-popover-foreground shadow-xl">
        <ContextMenu.Item onClick={onCopy} className="context-item"><Clipboard className="h-4 w-4" /> Copy</ContextMenu.Item>
        <ContextMenu.Item onClick={onDuplicate} className="context-item"><Copy className="h-4 w-4" /> Duplicate</ContextMenu.Item>
        <ContextMenu.Item onClick={onAskAi} className="context-item"><Bot className="h-4 w-4" /> Ask AI</ContextMenu.Item>
        {children}
        {showArchive ? (
          <>
            <ContextMenu.Separator className="my-1 h-px bg-border" />
            <ContextMenu.Item onClick={onArchive} className="context-item text-destructive"><Archive className="h-4 w-4" /> Archive/Delete</ContextMenu.Item>
          </>
        ) : null}
      </ContextMenu.Content>
    </ContextMenu.Portal>
  )
}

function ViewModeButton({ active, compact, icon: Icon, label, onClick }: { active: boolean; compact?: boolean; icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex h-8 items-center justify-center gap-1.5 rounded-md text-xs font-semibold ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"}`}>
      <Icon className="h-3.5 w-3.5" />
      <span className={compact ? "sr-only" : ""}>{label}</span>
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
