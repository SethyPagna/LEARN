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
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bold,
  BookOpen,
  Bot,
  Braces,
  CheckSquare,
  CheckCircle2,
  ChevronDown,
  Clipboard,
  Clock,
  Columns3,
  Copy,
  Download,
  FilePlus2,
  FileText,
  Grid2X2,
  GripVertical,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Eye,
  EyeOff,
  ImageIcon,
  Italic,
  LayoutPanelLeft,
  List,
  ListOrdered,
  Lock,
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
  Share2,
  SlidersHorizontal,
  Sparkles,
  SplitSquareHorizontal,
  SplitSquareVertical,
  Strikethrough,
  Table2,
  Trash2,
  Type,
  Underline as UnderlineIcon,
  Undo2,
  UploadCloud,
  Video,
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
  buildStudioDownloadOptions,
  buildStudioRecordActionGroups,
  buildStudioShareOptions,
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
  recommendedStudioDownloadOption,
  sortSheetByColumn,
  splitStudioPane,
  type StudioRecordActionId,
} from "@/lib/studio-features"
import { createHistoryState, exportSheetToCsv, importCsvToSheet, pushHistory, redoHistory, replaceTextInHtml, summarizeDocumentHtml, undoHistory, type HistoryState } from "@/lib/workspace-features"
import { clearStudioDraft, readStudioDrafts, shouldAnnounceStudioDraftSave, STUDIO_DRAFT_EVENT, summarizeStudioDrafts, writeStudioDraft, type StudioDraftRecord, type StudioDraftSummary } from "@/lib/studio-drafts"
import { studioFontOptions, studioFontSizeOptions, studioHighlightColorOptions, studioTextColorOptions } from "@/lib/studio-formatting"
import { getStudioKindOption, getStudioViewModeOption, studioEmptyTabLabels, studioInspectorTabs, studioKindOptions, studioSectionFilters, studioViewModeOptions, type StudioViewMode } from "@/lib/studio-navigation"
import { blankDeckFingerprint, blankDeckSlides, blankDeckTitle, blankDocTitle, blankNoteTitle, blankRichText, blankSheetCells, blankSheetFingerprint, blankSheetTitle, ensureSheetCells, parseDeckSlides, parseSheetCells, studioCreateLabels, studioDraftSummary, studioFallbackTitle, studioNoItemSummary } from "@/lib/studio-defaults"
import { getImportDestinationView, importTargetOptions, labelImportTarget, normalizeImportTargetSelection, type ImportTarget, type ImportTargetSelection } from "@/lib/import-gateway"
import { alignSlideDesignObject, applySlideDesignPreset, applySlideDesignPresetToDeck, buildDesignedRichTemplate, buildDesignedSheetTemplateCsv, buildDesignedSlideTemplateDeck, buildSlideExportPayload, buildSlidePresenterOutline, createSlideDesignObject, documentInsertGroups, duplicateSlideDesignObject, getDocumentInsertBlock, nudgeSlideDesignObject, removeSlideDesignObject, reorderSlideDesignObject, resizeSlideDesignObject, richTemplateDesignFor, sheetTemplateDesignFor, slideAnimationPresets, slideDesignPresets, slideTransitionPresets, summarizeSlideShow, updateSlideDesignObject, type DocumentInsertKind } from "@/lib/studio-design"
import { canvasAspectRatio, canvasPreviewWidth, getStudioCanvasFormat, listStudioCanvasFormatGroups, listStudioCanvasFormats, type StudioCanvasFormat } from "@/lib/studio-canvas"
import { buildStudioProjectBrowserHeader, buildStudioProjectBrowserState, buildStudioProjectBrowserSummary, buildStudioProjectSubtitle, buildStudioTemplateSubtitle, filterStudioProjectsByDraftStatus, getStudioProjectDisplayMeta, getStudioProjectFilterOption, listStudioProjectFilterOptions, selectStudioBrowserTemplate, selectStudioProjectShelf, selectStudioTemplateShelf, sortStudioProjectsByModified, type StudioProjectKindFilter, type StudioProjectStatusFilter } from "@/lib/studio-project-browser"
import { getStudioToolActions, getStudioToolPanel, studioToolPanels, type StudioToolAction, type StudioToolPanelId } from "@/lib/studio-tool-library"
import { appendRichDocumentPage, countRichDocumentPages, duplicateRichDocumentLastPage } from "@/lib/studio-pages"

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

type StudioTemplateChoice = StudioTemplate & {
  kind: StudioKind
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
  if (!trimmedTitle || (!tab.itemId && (DRAFT_TAB_TITLE_PATTERN.test(trimmedTitle) || NUMBERED_EMPTY_TAB_PATTERN.test(trimmedTitle) || trimmedTitle === studioFallbackTitle))) {
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
  const [studioMode, setStudioMode] = useState<"projects" | "editor">("projects")
  const [canvasFormatId, setCanvasFormatId] = useState("")
  const [activeToolPanel, setActiveToolPanel] = useState<StudioToolPanelId>("templates")
  const [toolRailCollapsed, setToolRailCollapsed] = useState(false)
  const [toolDrawerOpen, setToolDrawerOpen] = useState(true)
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

  useEffect(() => {
    if (selectedSlideIndex >= slides.length) setSelectedSlideIndex(Math.max(0, slides.length - 1))
  }, [selectedSlideIndex, slides.length])

  const activeTab = getStudioKindOption(kind)
  const canvasFormat = getStudioCanvasFormat(canvasFormatId, kind)
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

  useEffect(() => {
    const nextFormat = getStudioCanvasFormat(canvasFormatId, kind)
    if (nextFormat.id !== canvasFormatId) setCanvasFormatId(nextFormat.id)
  }, [canvasFormatId, kind])

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

  function applyTemplateForKind(templateKind: StudioKind, template: StudioTemplate) {
    const applied = buildAppliedTemplate(templateKind, template)
    selectKind(templateKind)
    setCanvasFormatId((current) => getStudioCanvasFormat(current, templateKind).id)
    setStudioMode("editor")
    if (templateKind === "notes") {
      setNoteDraft((current) => current ? { ...current, title: applied.title } : current)
      setNoteHistory(pushHistory(noteHistory, applied.body))
      return
    }
    if (templateKind === "docs") {
      setDocTitle(applied.title)
      setDocHistory(pushHistory(docHistory, applied.body))
      return
    }
    if (templateKind === "sheets") {
      setSheetTitle(applied.title)
      setCells(importCsvToSheet(applied.body).cells)
      return
    }
    setDeckTitle(applied.title)
    setSlides(buildDesignedSlideTemplateDeck(applied.body, template.label))
    setSelectedSlideIndex(0)
  }

  function appendRichToolContentForKind(targetKind: StudioKind, html: string) {
    if (targetKind === "notes") setNoteHistory((current) => pushHistory(current, `${current.present}${html}`))
    if (targetKind === "docs") setDocHistory((current) => pushHistory(current, `${current.present}${html}`))
  }

  function runStudioToolAction(action: StudioToolAction) {
    runStudioToolActionForKind(kind, action)
  }

  function runStudioToolActionForKind(targetKind: StudioKind, action: StudioToolAction) {
    if (targetKind !== kind) selectKind(targetKind)
    setStudioMode("editor")
    if (action.canvasAction) {
      if (targetKind === "notes") {
        setNoteHistory((current) => pushHistory(current, action.canvasAction === "new-page" ? appendRichDocumentPage(current.present) : duplicateRichDocumentLastPage(current.present)))
        setStatus(`${action.label} added.`)
        return
      }
      if (targetKind === "docs") {
        setDocHistory((current) => pushHistory(current, action.canvasAction === "new-page" ? appendRichDocumentPage(current.present) : duplicateRichDocumentLastPage(current.present)))
        setStatus(`${action.label} added.`)
        return
      }
      if (targetKind === "slides") {
        if (action.canvasAction === "duplicate-page") {
          setSlides((current) => duplicateSlide(current, selectedSlideIndex))
          setSelectedSlideIndex(selectedSlideIndex + 1)
        } else {
          setSlides((current) => [...current, createBlankStudioSlide(current.length + 1)])
          setSelectedSlideIndex(slides.length)
        }
        setStatus(`${action.label} added.`)
        return
      }
    }
    if (targetKind === "slides" && (action.slideAnimation || action.slideLayout || action.slideTheme || action.slideTransition)) {
      const themeKey = action.slideTheme as keyof typeof slideDesignPresets | undefined
      const palette = themeKey ? slideDesignPresets[themeKey] : undefined
      setSlides((current) => current.map((slide, index) => (
        index === selectedSlideIndex
          ? {
              ...slide,
              animation: action.slideAnimation || slide.animation,
              background: palette?.background || slide.background,
              layout: action.slideLayout || slide.layout,
              theme: action.slideTheme || slide.theme,
              transition: action.slideTransition || slide.transition,
            }
          : slide
      )))
      setStatus(`${action.label} applied.`)
      return
    }
    if ((targetKind === "notes" || targetKind === "docs") && action.richHtml) {
      appendRichToolContentForKind(targetKind, action.richHtml)
      setStatus(`${action.label} added.`)
      return
    }
    if (targetKind === "sheets") {
      if (action.sheetAction === "add-row") setCells((current) => addRow(ensureSheetCells(current), selectedCell.row))
      if (action.sheetAction === "add-column") setCells((current) => addColumn(ensureSheetCells(current), selectedCell.column))
      if (action.sheetAction === "table") setCells((current) => ensureSheetCells(current).map((row, rowIndex) => row.map((cell, columnIndex) => cell || (rowIndex === 0 ? ["Item", "Detail", "Status"][columnIndex] || "" : ""))))
      setStatus(`${action.label} added.`)
      return
    }
    if (targetKind === "slides" && action.slideObjectType) {
      setSlides((current) => current.map((slide, index) => (
        index === selectedSlideIndex
          ? { ...slide, objects: [...(slide.objects || []), createSlideDesignObject(action.slideObjectType || "text")] }
          : slide
      )))
      setStatus(`${action.label} added.`)
    }
  }

  async function createActive() {
    setStudioMode("editor")
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
    setStudioMode("editor")
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
    if (!tab) return { kind: "notes", title: studioFallbackTitle, summary: studioNoItemSummary }
    const source = tab.itemId ? findStudioItem({ id: tab.itemId, kind: tab.kind }) : undefined
    if (!source) return { kind: tab.kind, title: tab.title || studioCreateLabels[tab.kind], summary: studioDraftSummary }
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

  if (studioMode === "projects") {
    return (
      <StudioProjectBrowser
        activeKind={kind}
        canvasFormat={canvasFormat}
        dirtyBadges={dirtyBadges}
        items={allItems}
        onApplyTemplate={applyTemplateForKind}
        onCanvasFormat={setCanvasFormatId}
        onCreate={createActive}
        onOpen={selectItem}
        onQuery={setQuery}
        onSelectKind={selectKind}
        query={query}
      />
    )
  }

  return (
    <div className="grid gap-3">
      <Panel className="p-2">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setStudioMode("projects")} className="flex h-9 items-center gap-2 rounded-md border border-border bg-secondary px-3 text-sm font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground" type="button">
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <ActionMenu label="Project" icon={ActiveStudioIcon} primary>
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
            <MenuAction icon={Plus} label="Blank design" onClick={createActive} meta={`${studioCreateLabels[kind]} format`} />
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
            <MenuSelect label="Canvas" onChange={setCanvasFormatId} options={listStudioCanvasFormats(kind).map((format) => ({ label: format.label, value: format.id }))} />
            <MenuAction icon={SplitSquareHorizontal} label="Split right" onClick={() => setLayout((current) => splitStudioPane(current, current.activePaneId, "horizontal"))} />
            <MenuAction icon={SplitSquareVertical} label="Split down" onClick={() => setLayout((current) => splitStudioPane(current, current.activePaneId, "vertical"))} />
            <MenuAction icon={Settings2} label="Reset layout" onClick={() => setLayout(createDefaultStudioLayout(kind, activeTitle() || "Studio"))} />
          </ActionMenu>
          <button onClick={() => {
            setToolRailCollapsed((collapsed) => !collapsed)
            setToolDrawerOpen(true)
          }} className="flex h-9 items-center gap-2 rounded-md border border-border bg-secondary px-3 text-sm font-medium text-secondary-foreground hover:bg-accent hover:text-accent-foreground" type="button">
            <LayoutPanelLeft className="h-4 w-4" />
            <span className="hidden sm:inline">{toolRailCollapsed ? "Tools" : "Hide tools"}</span>
          </button>
          <button onClick={() => setLayout((current) => ({ ...current, inspectorOpen: !current.inspectorOpen }))} className="ml-auto flex h-9 items-center gap-2 rounded-md border border-border bg-secondary px-3 text-sm font-medium text-secondary-foreground hover:bg-accent hover:text-accent-foreground" type="button">
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
            <button onClick={organizeImport} disabled={importing} className="h-9 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60" type="button">
              {importing ? "Importing" : "Organize"}
            </button>
            <button onClick={() => setImportOpen(false)} className="h-9 rounded-md border border-border bg-secondary px-3 text-sm font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground" type="button">
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

      <div className={`grid gap-3 ${toolRailCollapsed ? "xl:grid-cols-[1fr]" : toolDrawerOpen ? "xl:grid-cols-[72px_280px_1fr]" : "xl:grid-cols-[72px_1fr]"}`}>
        {!toolRailCollapsed ? <StudioToolRail activeKind={kind} activeToolPanel={activeToolPanel} onSelectKind={selectKind} onSelectToolPanel={(panel) => {
          setActiveToolPanel(panel)
          setToolDrawerOpen(true)
        }} showKindRail={false} /> : null}
        {!toolRailCollapsed && toolDrawerOpen ? (
          <Panel className="min-h-[74vh] p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="rounded-md bg-secondary px-2.5 py-1.5 text-xs font-bold text-secondary-foreground">{getStudioToolPanel(activeToolPanel).label}</span>
              <button onClick={() => setToolDrawerOpen(false)} className="icon-button" title="Close library drawer" type="button">
                <ArrowLeft className="h-4 w-4" />
              </button>
            </div>
            <StudioLibrary
              activeToolPanel={activeToolPanel}
              items={allItems}
              query={query}
              section={section}
              viewMode={viewMode}
              onApplyTemplate={(template) => applyTemplateForKind(kind, template)}
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
              onToolAction={runStudioToolAction}
              onViewMode={setViewMode}
              activeKind={kind}
            />
          </Panel>
        ) : null}

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
                    canvasFormat={canvasFormat}
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
  activeToolPanel,
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
  onToolAction,
  onViewMode,
  query,
  section,
  viewMode,
}: {
  activeKind: StudioKind
  activeToolPanel: StudioToolPanelId
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
  onToolAction: (action: StudioToolAction) => void
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
  const activeTool = getStudioToolPanel(activeToolPanel)
  const toolActions = getStudioToolActions(activeToolPanel, activeKind)

  if (activeToolPanel === "templates") {
    return (
      <div className="grid gap-3">
        <StudioToolPanelHeader panel={activeTool} />
        <div className="grid gap-2">
          {studioTemplates[activeKind].map((template) => {
            const meta = getStudioTemplateMeta(activeKind, template)
            return (
              <button key={template.label} onClick={() => onApplyTemplate(template)} className="group/template overflow-hidden rounded-md border border-border bg-card text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/50 hover:bg-accent hover:text-accent-foreground" title={`${meta.description} Sections: ${meta.sections.join(", ")}`} type="button">
                <span className="grid gap-2 p-2.5">
                  <span className="truncate text-xs font-bold text-foreground">{template.label}</span>
                  <span className="relative block h-16 overflow-hidden rounded-md border border-border bg-background" aria-hidden="true">
                    <span className="absolute inset-0 opacity-95" style={{ background: meta.background }} />
                    <span className="absolute left-2 top-2 h-2 w-12 rounded-full" style={{ background: meta.accent }} />
                    <span className="absolute left-2 top-6 h-1.5 w-20 rounded-full bg-white/55 dark:bg-white/30" />
                    <span className="absolute left-2 top-9 h-1.5 w-14 rounded-full bg-white/35 dark:bg-white/20" />
                    <span className="absolute bottom-2 right-2 h-8 w-12 rounded-md border border-white/30 bg-white/15" />
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  if (activeToolPanel !== "projects") {
    return (
      <div className="grid gap-3">
        <StudioToolPanelHeader panel={activeTool} />
        <div className="grid grid-cols-2 gap-2">
          {toolActions.map((action) => {
            const ActionIcon = studioToolActionIcon(action)
            return (
            <button key={action.id} onClick={() => onToolAction(action)} className="min-h-20 rounded-md border border-border bg-card p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/50 hover:bg-accent hover:text-accent-foreground" title={action.description} type="button">
              <span className="flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
                  <ActionIcon className="h-4 w-4" />
                </span>
                <span className="min-w-0 truncate text-sm font-bold text-foreground">{action.label}</span>
              </span>
              <span className="mt-2 inline-flex rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-secondary-foreground">
                {action.canvasAction ? "Page" : action.sheetAction ? "Data" : action.slideObjectType ? "Canvas" : "Insert"}
              </span>
            </button>
          )})}
          {!toolActions.length ? <EmptyState title="No tools here" body="This panel is not available for the current Studio type yet." /> : null}
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-3">
      <StudioToolPanelHeader panel={activeTool} />
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
    </div>
  )
}

function createBlankStudioSlide(index: number): WorkspaceDeck["slides"][number] {
  return {
    accent: "New",
    animation: "rise",
    background: "#111827",
    body: "Add the point, image cue, or quiz prompt.",
    layout: "title",
    speakerNotes: "",
    theme: "midnight",
    title: `Page ${index}`,
    transition: "fade",
  }
}

function StudioToolPanelHeader({ panel }: { panel: ReturnType<typeof getStudioToolPanel> }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-background p-3">
      <p className="text-sm font-bold text-foreground">{panel.label}</p>
      <details className="relative">
        <summary className="flex h-7 w-7 cursor-pointer list-none items-center justify-center rounded-md border border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground" aria-label={`About ${panel.label}`}>
          <BookOpen className="h-3.5 w-3.5" />
        </summary>
        <p className="absolute right-0 top-8 z-40 w-56 rounded-md border border-border bg-popover p-2 text-xs leading-5 text-popover-foreground shadow-xl">{panel.description}</p>
      </details>
    </div>
  )
}

function studioToolActionIcon(action: StudioToolAction) {
  if (action.id.startsWith("ai-")) return Bot
  if (action.slideTransition || action.slideAnimation) return RotateCcw
  if (action.slideLayout || action.id.startsWith("position-")) return LayoutPanelLeft
  if (action.slideTheme || action.id.startsWith("brand-") || action.id.startsWith("effect-")) return Paintbrush
  if (action.slideObjectType === "image" || action.id.startsWith("media-")) return ImageIcon
  if (action.slideObjectType === "shape" || action.id.includes("shape") || action.id.includes("frame")) return Grid2X2
  if (action.sheetAction || action.id.includes("table") || action.id.includes("chart")) return Table2
  if (action.canvasAction) return FilePlus2
  if (action.id.startsWith("text-")) return Type
  if (action.id.startsWith("app-")) return Sparkles
  return Plus
}

function StudioProjectBrowser({
  activeKind,
  canvasFormat,
  dirtyBadges,
  items,
  onApplyTemplate,
  onCanvasFormat,
  onCreate,
  onOpen,
  onQuery,
  onSelectKind,
  query,
}: {
  activeKind: StudioKind
  canvasFormat: StudioCanvasFormat
  dirtyBadges: StudioDirtyBadge[]
  items: StudioListItem[]
  onApplyTemplate: (kind: StudioKind, template: StudioTemplate) => void
  onCanvasFormat: (id: string) => void
  onCreate: () => void
  onOpen: (item: StudioRecordItem) => void
  onQuery: (value: string) => void
  onSelectKind: (kind: StudioKind) => void
  query: string
}) {
  const [projectKindFilter, setProjectKindFilter] = useState<StudioProjectKindFilter>("all")
  const [projectSort, setProjectSort] = useState<"newest" | "oldest">("newest")
  const [projectStatusFilter, setProjectStatusFilter] = useState<StudioProjectStatusFilter>("all")
  const [selectedTemplateKey, setSelectedTemplateKey] = useState("")
  const formatKind = projectKindFilter === "all" ? activeKind : projectKindFilter
  const compatibleCanvasFormat = getStudioCanvasFormat(canvasFormat.id, formatKind)
  const formatGroups = listStudioCanvasFormatGroups(formatKind)
  const templateLibrary = useMemo<StudioTemplateChoice[]>(() => (
    studioKindOptions.flatMap((option) => studioTemplates[option.kind].map((template) => ({ ...template, kind: option.kind })))
  ), [])
  const browserState = useMemo(() => buildStudioProjectBrowserState({
    formatGroup: compatibleCanvasFormat.group,
    kindFilter: projectKindFilter,
    items,
    query,
    templates: templateLibrary,
  }), [compatibleCanvasFormat.group, items, projectKindFilter, query, templateLibrary])
  const dirtyKindSet = useMemo(() => new Set(dirtyBadges.map((badge) => badge.kind)), [dirtyBadges])
  const filteredProjects = useMemo(() => filterStudioProjectsByDraftStatus(browserState.projects, dirtyKindSet, projectStatusFilter), [browserState.projects, dirtyKindSet, projectStatusFilter])
  const draftProjectCount = useMemo(() => filterStudioProjectsByDraftStatus(browserState.projects, dirtyKindSet, "drafts").length, [browserState.projects, dirtyKindSet])
  const savedProjectCount = useMemo(() => filterStudioProjectsByDraftStatus(browserState.projects, dirtyKindSet, "saved").length, [browserState.projects, dirtyKindSet])
  const recentItems = selectStudioProjectShelf(sortStudioProjectsByModified(filteredProjects, projectSort))
  const templateChoices = browserState.templates
  const templateShelf = selectStudioTemplateShelf(templateChoices)
  const selectedTemplate = templateChoices.find((template) => `${template.kind}:${template.label}` === selectedTemplateKey) || selectStudioBrowserTemplate(templateChoices, "")
  const projectFilterOptions = listStudioProjectFilterOptions()
  const activeProjectFilter = getStudioProjectFilterOption(projectKindFilter)
  const browserSummary = buildStudioProjectBrowserSummary({
    draftCount: draftProjectCount,
    filterLabel: activeProjectFilter.label,
    formatLabel: compatibleCanvasFormat.label,
    projectCount: filteredProjects.length,
    query,
    templateCount: templateChoices.length,
  })
  return (
    <div className="grid gap-4">
      <Panel className="overflow-hidden p-0">
        <div className="min-h-[76vh]">
          <main className="min-w-0 bg-gradient-to-b from-primary/10 via-muted/35 to-muted/35 p-4 lg:p-6">
            <div className="mx-auto max-w-4xl text-center">
              <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">{browserSummary.title}</h2>
              <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground" title={buildStudioProjectBrowserHeader(browserSummary)}>{browserSummary.caption}</p>
              <label className="mx-auto mt-5 flex h-14 max-w-3xl items-center gap-3 rounded-2xl border border-primary/20 bg-background px-5 shadow-xl shadow-primary/10">
                <Search className="h-5 w-5 text-foreground" />
                <input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search across all content" className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
              </label>
              <div className="mx-auto mt-3 grid max-w-3xl grid-cols-2 gap-2 md:grid-cols-4">
                {browserSummary.chips.map((chip) => (
                  <div key={chip.label} className="rounded-xl border border-border bg-background/80 px-3 py-2 text-left shadow-sm">
                    <p className="truncate text-[0.65rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">{chip.label}</p>
                    <p className="mt-1 truncate text-sm font-black text-foreground" title={chip.value}>{chip.value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <ActionMenu compact label={activeProjectFilter.label} icon={SlidersHorizontal}>
                  {projectFilterOptions.map((option) => {
                    const Icon = option.value === "all" ? LayoutPanelLeft : studioKindIcons[option.value]
                    const count = option.value === "all" ? items.length : browserState.counts[option.value]
                    return <MenuAction key={option.value} active={projectKindFilter === option.value} icon={Icon} label={option.label} meta={`${count} project${count === 1 ? "" : "s"}`} onClick={() => { setProjectKindFilter(option.value); if (option.value !== "all") onSelectKind(option.value) }} />
                  })}
                </ActionMenu>
                <ActionMenu compact label="Category" icon={Grid2X2}>
                  {formatGroups.map((group) => (
                    <MenuAction key={group.id} active={group.id === compatibleCanvasFormat.group} icon={LayoutPanelLeft} label={group.label} meta={group.description} onClick={() => onCanvasFormat(group.formats[0]?.id || compatibleCanvasFormat.id)} />
                  ))}
                </ActionMenu>
                <ActionMenu compact label={projectStatusFilter === "all" ? "Status" : projectStatusFilter === "drafts" ? "Drafts" : "Saved"} icon={BookOpen}>
                  <MenuAction active={projectStatusFilter === "all"} icon={BookOpen} label="All projects" meta={`${browserState.projects.length} visible`} onClick={() => setProjectStatusFilter("all")} />
                  <MenuAction active={projectStatusFilter === "drafts"} icon={Clock} label="Drafts" meta={`${draftProjectCount} with local changes`} onClick={() => setProjectStatusFilter("drafts")} />
                  <MenuAction active={projectStatusFilter === "saved"} icon={CheckCircle2} label="Saved" meta={`${savedProjectCount} without local drafts`} onClick={() => setProjectStatusFilter("saved")} />
                </ActionMenu>
                <ActionMenu compact label="Date modified" icon={ArrowDown}>
                  <MenuAction active={projectSort === "newest"} icon={ArrowDown} label="Newest first" onClick={() => setProjectSort("newest")} />
                  <MenuAction active={projectSort === "oldest"} icon={ArrowUp} label="Oldest first" onClick={() => setProjectSort("oldest")} />
                </ActionMenu>
              </div>
            </div>
            <div className="mt-14 grid gap-5">
              <section className="min-w-0">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-xl font-bold text-foreground">Recent projects</h3>
                  <div className="flex items-center gap-2">
                    <span className="rounded-lg bg-background px-2.5 py-1.5 text-xs font-semibold text-muted-foreground">{recentItems.length} shown</span>
                    {dirtyBadges.length ? <span className="rounded-lg bg-warning/15 px-2.5 py-1.5 text-xs font-semibold text-warning-foreground">{dirtyBadges.reduce((total, badge) => total + badge.count, 0)} drafts</span> : null}
                    <button onClick={onCreate} className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground" type="button"><Plus className="h-4 w-4" /> Create</button>
                  </div>
                </div>
                <div className="mt-4 flex gap-4 overflow-x-auto pb-4">
                  <button onClick={onCreate} className="group flex h-[10.5rem] w-48 shrink-0 flex-col items-center justify-center rounded-xl border border-dashed border-primary/50 bg-background/75 text-center shadow-sm transition hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground" type="button">
                    <span className="grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm">
                      <Plus className="h-6 w-6" />
                    </span>
                    <span className="mt-3 text-sm font-black text-foreground group-hover:text-accent-foreground">New project</span>
                    <span className="mt-1 text-xs text-muted-foreground">Choose format after opening</span>
                  </button>
                  {recentItems.map((item) => {
                    const Icon = studioKindIcons[item.kind]
                    const meta = getStudioProjectDisplayMeta(item.kind)
                    return (
                      <button key={`${item.kind}_${item.id}`} onClick={() => onOpen(item)} className="group w-48 shrink-0 text-left" type="button">
                        <span className={`relative block h-32 overflow-hidden rounded-xl border border-border ${studioKindStyles[item.kind].icon} p-4 shadow-sm transition group-hover:-translate-y-0.5 group-hover:border-primary group-hover:shadow-lg`}>
                          <Icon className="h-6 w-6" />
                          <span className="absolute bottom-4 left-4 right-4 space-y-2">
                            <span className="block h-2 w-20 rounded-full bg-background/80" />
                            <span className="block h-2 w-28 rounded-full bg-background/60" />
                            <span className="block h-2 w-16 rounded-full bg-background/50" />
                          </span>
                          <span className="absolute right-3 top-3 rounded-full bg-background/85 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-foreground">{meta.badge}</span>
                        </span>
                        <span className="mt-3 block">
                          <span className="block truncate text-sm font-bold text-foreground" title={item.title}>{item.title}</span>
                          <span className="mt-1 flex items-center gap-1 truncate text-xs text-muted-foreground">
                            <span className={`h-2 w-2 rounded-full ${studioKindStyles[item.kind].accent}`} />
                            {item.updated_at ? `Edited ${formatDate(item.updated_at)}` : buildStudioProjectSubtitle(item)}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
                {!recentItems.length ? <EmptyState title="No projects here" body="Create a design, pick a template, or clear the search." /> : null}
                <div className="mt-8 flex items-center justify-between gap-3">
                  <h3 className="text-xl font-bold text-foreground">Start with a design</h3>
                  <span className="rounded-lg bg-background px-2.5 py-1.5 text-xs font-semibold text-muted-foreground">{templateShelf.length} templates</span>
                </div>
                <div className="mt-4 flex gap-4 overflow-x-auto pb-4">
                  {templateShelf.map((template) => {
                    const meta = getStudioTemplateMeta(template.kind, template)
                    const TemplateIcon = studioKindIcons[template.kind]
                    const templateKey = `${template.kind}:${template.label}`
                    const selected = selectedTemplate ? `${selectedTemplate.kind}:${selectedTemplate.label}` === templateKey : false
                    return (
                      <button key={templateKey} onClick={() => {
                        setSelectedTemplateKey(templateKey)
                        onSelectKind(template.kind)
                        onApplyTemplate(template.kind, template)
                      }} className="group w-44 shrink-0 text-left" title={meta.description} type="button">
                        <span className={`relative block h-32 overflow-hidden rounded-xl border p-4 shadow-sm transition group-hover:-translate-y-0.5 group-hover:border-primary group-hover:shadow-lg ${selected ? "border-primary bg-primary/10" : "border-border bg-card"}`} style={{ background: meta.background }}>
                          <span className="absolute left-4 top-4 h-2 w-16 rounded-full" style={{ background: meta.accent }} />
                          <span className="absolute left-4 top-10 h-2 w-24 rounded-full bg-white/55 dark:bg-white/20" />
                          <span className="absolute bottom-4 left-4 right-4 grid grid-cols-3 gap-1">
                            {meta.sections.slice(0, 3).map((section) => (
                              <span key={section} className="h-7 rounded-md bg-background/65" />
                            ))}
                          </span>
                          <span className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-lg bg-background/85 text-foreground">
                            <TemplateIcon className="h-4 w-4" />
                          </span>
                        </span>
                        <span className="mt-3 block truncate text-sm font-bold text-foreground">{template.label}</span>
                        <span className="mt-1 block truncate text-xs text-muted-foreground">{buildStudioTemplateSubtitle(template, meta.style)}</span>
                      </button>
                    )
                  })}
                </div>
                {!templateShelf.length ? <EmptyState title="No matching designs" body="Clear search or switch the format filter." /> : null}
              </section>
            </div>
          </main>
        </div>
      </Panel>
    </div>
  )
}

function StudioToolRail({
  activeKind,
  activeToolPanel = "templates",
  onSelectKind,
  onSelectToolPanel = () => undefined,
  showKindRail = true,
  showToolPanels = true,
}: {
  activeKind: StudioKind
  activeToolPanel?: StudioToolPanelId
  onSelectKind: (kind: StudioKind) => void
  onSelectToolPanel?: (panel: StudioToolPanelId) => void
  showKindRail?: boolean
  showToolPanels?: boolean
}) {
  const toolIcons: Record<StudioToolPanelId, React.ComponentType<{ className?: string }>> = {
    ai: Bot,
    animate: RotateCcw,
    apps: Grid2X2,
    brand: Paintbrush,
    elements: Grid2X2,
    effects: Highlighter,
    media: ImageIcon,
    position: Maximize2,
    projects: LayoutPanelLeft,
    templates: FilePlus2,
    text: Type,
  }
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-border bg-background p-2 lg:flex-col lg:border-b-0 lg:border-r" aria-label="Studio tools">
      {showToolPanels ? studioToolPanels.map((panel) => {
        const Icon = toolIcons[panel.id]
        return (
          <button key={panel.id} onClick={() => onSelectToolPanel(panel.id)} className={`flex min-w-14 flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 text-[11px] font-semibold ${activeToolPanel === panel.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"}`} title={panel.description} type="button">
            <Icon className="h-5 w-5" />
            <span>{panel.label}</span>
          </button>
        )
      }) : null}
      {showToolPanels && showKindRail ? <span className="hidden h-px bg-border lg:block" /> : null}
      {showKindRail ? studioKindOptions.map((option) => {
        const Icon = studioKindIcons[option.kind]
        return (
          <button key={option.kind} onClick={() => onSelectKind(option.kind)} className={`flex min-w-14 flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 text-[11px] font-semibold ${activeKind === option.kind ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"}`} type="button">
            <Icon className="h-5 w-5" />
            <span>{studioKindStyles[option.kind].label}</span>
          </button>
        )
      }) : null}
    </nav>
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
  const slideTheme = kind === "slides" ? slideTemplateTheme(template.label) : undefined
  const slidePalette = slideTheme ? slideDesignPresets[slideTheme] : undefined
  const richPalette = kind === "notes" || kind === "docs" ? richTemplateDesignFor(template.label) : undefined
  const sheetPalette = kind === "sheets" ? sheetTemplateDesignFor(template.label) : undefined
  return {
    accent: template.accent || slidePalette?.accent || richPalette?.accent || palette[kind],
    background: slidePalette?.background || richPalette?.background || "hsl(var(--background))",
    description: template.description || describeTemplate(kind, template.label),
    sections,
    style: template.style || sheetPalette?.name || richPalette?.name || styleForTemplate(kind, template.label),
  }
}

function buildAppliedTemplate(kind: StudioKind, template: StudioTemplate) {
  if (kind === "sheets") return { ...template, body: enrichSheetTemplate(template.body, template.label) }
  if (kind === "slides") return { ...template, body: enrichSlideTemplate(template.body) }
  return { ...template, body: enrichRichTemplate(kind, template) }
}

function enrichRichTemplate(kind: StudioKind, template: StudioTemplate) {
  const meta = getStudioTemplateMeta(kind, template)
  return buildDesignedRichTemplate({
    body: template.body,
    description: meta.description,
    kind: kind === "docs" ? "docs" : "notes",
    label: template.label,
    sections: meta.sections,
  })
}

function enrichSheetTemplate(body: string, label: string) {
  return buildDesignedSheetTemplateCsv(body, label)
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
  if (kind === "slides") return slideTemplateTheme(label)
  if (label.toLowerCase().includes("cornell")) return "Cornell"
  if (label.toLowerCase().includes("brief")) return "Brief"
  return kind === "docs" ? "Doc" : "Note"
}

function stripTags(value: string) {
  return value.replace(/<[^>]*>/g, "")
}

function slideTemplateTheme(label: string): keyof typeof slideDesignPresets {
  const themes = Object.keys(slideDesignPresets) as Array<keyof typeof slideDesignPresets>
  const checksum = label.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0)
  return themes[checksum % themes.length] || "midnight"
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
  canvasFormat,
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
  canvasFormat: StudioCanvasFormat
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
              <ActionMenu align="right" compact label="Layout" icon={SplitSquareHorizontal}>
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
                      <BookOpen className="h-3.5 w-3.5" />
                    </summary>
                    <p className="absolute left-0 top-7 z-30 w-64 rounded-md border border-border bg-popover p-2 text-xs leading-5 text-popover-foreground shadow-xl">{activeTab.description}</p>
                  </details>
                </div>
              </div>
              {active ? (
                <div className="flex items-center gap-1">
                  <MiniAction icon={Save} label="Save" onClick={onSave} />
                  <ActionMenu align="right" compact label="File" icon={Settings2}>
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
                canvasFormat={canvasFormat}
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
                onCopyLink={() => navigator.clipboard?.writeText(window.location.href)}
                onDownload={onDownload}
                onExport={onExport}
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
  canvasFormat,
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
  canvasFormat: StudioCanvasFormat
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
  const [selectedObjectId, setSelectedObjectId] = useState("")
  const [slideZoom, setSlideZoom] = useState(86)
  const activeSlide = activeKind === "slides" ? slides[selectedSlideIndex] || slides[0] : undefined
  useEffect(() => {
    if (activeKind !== "slides") {
      if (selectedObjectId) setSelectedObjectId("")
      return
    }
    const objects = activeSlide?.objects || []
    if (!objects.length && selectedObjectId) {
      setSelectedObjectId("")
      return
    }
    if (objects.length && !objects.some((object) => object.id === selectedObjectId)) {
      setSelectedObjectId(objects[0]?.id || "")
    }
  }, [activeKind, activeSlide?.objects, selectedObjectId])

  if (activeKind === "notes") {
    if (!noteDraft) return <EmptyState title="No note selected" body="Create or choose a note to begin capturing your learning." />
    return <RichTextEditor canvasFormat={canvasFormat} value={noteHistory.present} onChange={(value) => onSetNoteHistory(pushHistory(noteHistory, value))} large={options.noteEditorSize === "large"} placeholder="Write notes, formulas, reflections, links, media cues, and AI-generated drafts..." />
  }

  if (activeKind === "docs") {
    return <RichTextEditor canvasFormat={canvasFormat} value={docHistory.present} onChange={(value) => onSetDocHistory(pushHistory(docHistory, value))} large placeholder="Draft headings, checklists, explanations, citations, tables, and practice tasks..." />
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

  const selectedSlide = activeSlide
  const selectedObject = selectedSlide?.objects?.find((object) => object.id === selectedObjectId) || null
  const slideShowSummary = summarizeSlideShow(slides)
  const selectedTransition = slideTransitionPresets[selectedSlide?.transition || "none"]
  const selectedAnimation = slideAnimationPresets[selectedSlide?.animation || "none"]
  const selectedPalette = slideDesignPresets[(selectedSlide?.theme || "midnight") as keyof typeof slideDesignPresets] || slideDesignPresets.midnight
  const updateSelectedSlide = (updater: (slide: WorkspaceDeck["slides"][number]) => WorkspaceDeck["slides"][number]) => {
    onSetSlides((current) => current.map((item, next) => next === selectedSlideIndex ? updater(item) : item))
  }
  const addSlideObject = (type: SlideObject["type"]) => {
    const object = createSlideDesignObject(type)
    updateSelectedSlide((slide) => ({ ...slide, objects: [...(slide.objects || []), object] }))
    setSelectedObjectId(object.id)
  }
  const updateSelectedObject = (object: SlideObject, patch: Partial<SlideObject>) => {
    updateSelectedSlide((slide) => updateSlideDesignObject(slide, object.id, patch))
  }
  const updateSelectedObjectStyle = (object: SlideObject, patch: Record<string, unknown>) => {
    updateSelectedObject(object, { style: { ...(object.style || {}), ...patch } })
  }
  const duplicateSelectedObject = (object: SlideObject) => {
    updateSelectedSlide((slide) => duplicateSlideDesignObject(slide, object.id))
  }
  const nudgeSelectedObject = (object: SlideObject, direction: "up" | "down" | "left" | "right") => {
    updateSelectedSlide((slide) => nudgeSlideDesignObject(slide, object.id, direction))
  }
  const reorderSelectedObject = (object: SlideObject, direction: "front" | "back" | "forward" | "backward") => {
    updateSelectedSlide((slide) => reorderSlideDesignObject(slide, object.id, direction))
  }
  const resizeSelectedObject = (object: SlideObject, preset: "wide" | "tall" | "compact" | "hero") => {
    updateSelectedSlide((slide) => resizeSlideDesignObject(slide, object.id, preset))
  }
  const alignSelectedObject = (object: SlideObject, alignment: "left" | "center" | "right" | "top" | "middle" | "bottom") => {
    updateSelectedSlide((slide) => alignSlideDesignObject(slide, object.id, alignment))
  }
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
  const goToSlide = (direction: -1 | 1) => {
    onSetSelectedSlideIndex(Math.min(Math.max(selectedSlideIndex + direction, 0), Math.max(0, slides.length - 1)))
  }
  const toggleSelectedSlideHidden = () => updateSelectedSlide((slide) => ({ ...slide, hidden: !slide.hidden }))
  const toggleSelectedSlideLocked = () => updateSelectedSlide((slide) => ({ ...slide, locked: !slide.locked }))
  const applyQuickSlideColor = (color: string) => {
    if (selectedObject) {
      updateSelectedObjectStyle(selectedObject, { background: color })
      return
    }
    updateSelectedSlide((slide) => ({ ...slide, background: color }))
  }
  return (
    <div className="grid min-h-[58vh] gap-3 lg:grid-cols-[150px_1fr_230px]">
      <div className="space-y-2 overflow-auto">
        <button onClick={() => { onSetSlides([...slides, createBlankStudioSlide(slides.length + 1)]); onSetSelectedSlideIndex(slides.length) }} className="flex h-9 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-primary-foreground">
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
                onArchive={() => {
                  onSetSlides((current) => current.length > 1 ? current.filter((_, next) => next !== index) : current)
                  onSetSelectedSlideIndex(Math.max(0, Math.min(selectedSlideIndex, slides.length - 2)))
                }}
                onCopy={() => navigator.clipboard?.writeText(`${slide.title}\n${slide.body}`)}
                onDuplicate={() => {
                  onSetSlides((current) => duplicateSlide(current, index))
                  onSetSelectedSlideIndex(index + 1)
                }}
                onSelect={() => onSetSelectedSlideIndex(index)}
                slide={slide}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>
      <div className="min-w-0">
        <div className="mb-3 flex justify-center">
          <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-border bg-card/95 px-2 py-1.5 text-sm shadow-lg backdrop-blur">
            <ActionMenu compact label="Edit" icon={Settings2}>
              <MenuAction icon={Type} label="Text box" onClick={() => addSlideObject("text")} />
              <MenuAction icon={ImageIcon} label="Image frame" onClick={() => addSlideObject("image")} />
              <MenuAction icon={Grid2X2} label="Shape" onClick={() => addSlideObject("shape")} />
              <MenuAction icon={Table2} label="Table" onClick={() => addSlideObject("table")} />
            </ActionMenu>
            <button onClick={() => selectedObject ? updateSelectedObjectStyle(selectedObject, { background: "transparent" }) : updateSelectedSlide((slide) => ({ ...slide, background: "#ffffff" }))} className="h-8 rounded-md px-2 text-sm font-semibold text-foreground hover:bg-accent hover:text-accent-foreground" title="Remove image background or reset page background" type="button">BG remover</button>
            <ToolbarIcon icon={Scissors} label="Erase selected object" onClick={() => selectedObject ? updateSelectedSlide((slide) => removeSlideDesignObject(slide, selectedObject.id)) : updateSelectedSlide((slide) => ({ ...slide, body: "" }))} />
            <span className="mx-1 h-6 w-px bg-border" />
            {["#24305e", "#64748b", "#a7794f", "#b7e4dc"].map((color) => (
              <button key={color} onClick={() => applyQuickSlideColor(color)} className="h-6 w-6 rounded-full border border-border shadow-sm transition hover:scale-105" style={{ background: color }} title={`Apply ${color}`} type="button" />
            ))}
            <ActionMenu compact label="Flip" icon={RotateCcw}>
              <MenuAction disabled={!selectedObject} icon={ArrowLeft} label="Nudge left" onClick={() => selectedObject ? nudgeSelectedObject(selectedObject, "left") : undefined} />
              <MenuAction disabled={!selectedObject} icon={ArrowRight} label="Nudge right" onClick={() => selectedObject ? nudgeSelectedObject(selectedObject, "right") : undefined} />
              <MenuAction disabled={!selectedObject} icon={Rows3} label="Tall crop" onClick={() => selectedObject ? resizeSelectedObject(selectedObject, "tall") : undefined} />
              <MenuAction disabled={!selectedObject} icon={Columns3} label="Wide crop" onClick={() => selectedObject ? resizeSelectedObject(selectedObject, "wide") : undefined} />
            </ActionMenu>
            <ActionMenu compact label="Effects" icon={Highlighter}>
              <MenuAction disabled={!selectedObject} icon={Paintbrush} label="Soft card" onClick={() => selectedObject ? updateSelectedObjectStyle(selectedObject, { background: "rgba(255,255,255,0.18)", boxShadow: "0 20px 50px rgba(15,23,42,0.22)" }) : undefined} />
              <MenuAction disabled={!selectedObject} icon={Highlighter} label="Transparent" onClick={() => selectedObject ? updateSelectedObjectStyle(selectedObject, { opacity: 0.72 }) : undefined} />
              <MenuAction icon={Paintbrush} label="Apply theme to all" onClick={() => onSetSlides((current) => applySlideDesignPresetToDeck(current, (selectedSlide?.theme || "midnight") as keyof typeof slideDesignPresets))} />
            </ActionMenu>
            <ActionMenu compact label="Animate" icon={RotateCcw}>
              <MenuSelect label="Transition" onChange={(value) => onSetSlides(slides.map((item, next) => next === selectedSlideIndex ? { ...item, transition: value as WorkspaceDeck["slides"][number]["transition"] } : item))} options={Object.keys(slideTransitionPresets).map((value) => ({ label: value, value }))} />
              <MenuSelect label="Element" onChange={(value) => onSetSlides(slides.map((item, next) => next === selectedSlideIndex ? { ...item, animation: value as WorkspaceDeck["slides"][number]["animation"] } : item))} options={Object.keys(slideAnimationPresets).map((value) => ({ label: value, value }))} />
            </ActionMenu>
            <ActionMenu compact label="Position" icon={Maximize2}>
              <MenuAction disabled={!selectedObject} icon={AlignLeft} label="Align left" onClick={() => selectedObject ? alignSelectedObject(selectedObject, "left") : undefined} />
              <MenuAction disabled={!selectedObject} icon={AlignCenter} label="Align center" onClick={() => selectedObject ? alignSelectedObject(selectedObject, "center") : undefined} />
              <MenuAction disabled={!selectedObject} icon={AlignRight} label="Align right" onClick={() => selectedObject ? alignSelectedObject(selectedObject, "right") : undefined} />
              <MenuAction disabled={!selectedObject} icon={Maximize2} label="Bring to front" onClick={() => selectedObject ? reorderSelectedObject(selectedObject, "front") : undefined} />
            </ActionMenu>
            <ToolbarIcon
              icon={Paintbrush}
              label="Apply style"
              onClick={() => selectedObject
                ? updateSelectedObjectStyle(selectedObject, { borderRadius: 18, boxShadow: "0 18px 45px rgba(15,23,42,0.20)" })
                : updateSelectedSlide((slide) => ({ ...slide, background: "#f8fafc" }))}
            />
          </div>
        </div>
        <div className="mb-2 flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm">
          <span className="font-bold text-foreground">Page {selectedSlideIndex + 1}</span>
          <input value={selectedSlide?.title || ""} onChange={(event) => onSetSlides(slides.map((item, next) => next === selectedSlideIndex ? { ...item, title: event.target.value } : item))} disabled={selectedSlide?.locked} className="min-w-0 flex-1 bg-transparent text-muted-foreground outline-none disabled:opacity-60" placeholder="Add page title" />
          <button onClick={() => goToSlide(-1)} disabled={selectedSlideIndex <= 0} className="icon-button disabled:opacity-40" title="Previous page" type="button"><ArrowUp className="h-4 w-4" /></button>
          <button onClick={() => goToSlide(1)} disabled={selectedSlideIndex >= slides.length - 1} className="icon-button disabled:opacity-40" title="Next page" type="button"><ArrowDown className="h-4 w-4" /></button>
          <button onClick={toggleSelectedSlideHidden} className={`icon-button ${selectedSlide?.hidden ? "bg-primary text-primary-foreground" : ""}`} title={selectedSlide?.hidden ? "Show page" : "Hide page"} type="button">{selectedSlide?.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
          <button onClick={toggleSelectedSlideLocked} className={`icon-button ${selectedSlide?.locked ? "bg-primary text-primary-foreground" : ""}`} title={selectedSlide?.locked ? "Unlock page" : "Lock page"} type="button"><Lock className="h-4 w-4" /></button>
          <button onClick={() => { onSetSlides((current) => duplicateSlide(current, selectedSlideIndex)); onSetSelectedSlideIndex(selectedSlideIndex + 1) }} className="icon-button" title="Duplicate page" type="button"><Copy className="h-4 w-4" /></button>
          <button onClick={() => { onSetSlides((current) => current.length > 1 ? current.filter((_, index) => index !== selectedSlideIndex) : current); onSetSelectedSlideIndex(Math.max(0, Math.min(selectedSlideIndex, slides.length - 2))) }} className="icon-button text-destructive" title="Delete page" type="button"><Trash2 className="h-4 w-4" /></button>
          <button onClick={() => { onSetSlides([...slides, createBlankStudioSlide(slides.length + 1)]); onSetSelectedSlideIndex(slides.length) }} className="icon-button" title="Add page" type="button"><Plus className="h-4 w-4" /></button>
        </div>
        <div
          className={`relative mx-auto w-full overflow-hidden rounded-lg border border-border p-8 text-white shadow-sm transition-all ${selectedSlide?.transition === "fade" ? "hover:opacity-90" : selectedSlide?.transition === "zoom" ? "hover:shadow-lg" : ""} ${selectedSlide?.animation === "rise" ? "hover:-translate-y-1" : selectedSlide?.animation === "emphasis" ? "hover:scale-[1.01]" : ""}`}
          style={{ aspectRatio: canvasAspectRatio(canvasFormat), background: selectedSlide?.background || slideDesignPresets[(selectedSlide?.theme || "midnight") as keyof typeof slideDesignPresets]?.background || "#111827", maxWidth: Math.round(canvasPreviewWidth(canvasFormat) * (slideZoom / 100)), opacity: selectedSlide?.hidden ? 0.35 : 1 }}
        >
          <div className="absolute right-3 top-3 z-30 flex items-center gap-1 rounded-md border border-white/15 bg-black/20 p-1 backdrop-blur">
            <button onClick={() => goToSlide(-1)} disabled={selectedSlideIndex <= 0} className="h-8 rounded-md px-2 text-xs font-semibold text-white hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40" type="button">Prev</button>
            <span className="rounded bg-white/15 px-2 py-1 text-xs font-semibold text-white">{selectedSlideIndex + 1}/{slides.length}</span>
            <button onClick={() => goToSlide(1)} disabled={selectedSlideIndex >= slides.length - 1} className="h-8 rounded-md px-2 text-xs font-semibold text-white hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40" type="button">Next</button>
          </div>
        {selectedSlide ? (
          <div className="relative z-10 flex h-full flex-col">
            <input value={selectedSlide.accent || ""} onChange={(event) => onSetSlides(slides.map((item, next) => next === selectedSlideIndex ? { ...item, accent: event.target.value } : item))} readOnly={selectedSlide.locked} className="mb-3 w-full bg-transparent text-xs font-semibold uppercase tracking-[0.16em] outline-none read-only:opacity-60" style={{ color: selectedPalette.accent }} />
            <input value={selectedSlide.title} onChange={(event) => onSetSlides(slides.map((item, next) => next === selectedSlideIndex ? { ...item, title: event.target.value } : item))} readOnly={selectedSlide.locked} className="w-full bg-transparent text-4xl font-semibold leading-tight outline-none read-only:opacity-60" style={{ color: selectedPalette.foreground }} />
            <textarea value={selectedSlide.body} onChange={(event) => onSetSlides(slides.map((item, next) => next === selectedSlideIndex ? { ...item, body: event.target.value } : item))} readOnly={selectedSlide.locked} className="mt-5 min-h-32 flex-1 resize-none bg-transparent text-lg leading-8 outline-none read-only:opacity-60" style={{ color: selectedPalette.foreground }} />
          </div>
        ) : null}
        {selectedSlide?.objects?.map((object) => (
          <SlideCanvasObject
            key={object.id}
            active={object.id === selectedObjectId}
            object={object}
            onAlign={(alignment) => alignSelectedObject(object, alignment)}
            onDelete={() => {
              updateSelectedSlide((slide) => removeSlideDesignObject(slide, object.id))
              if (selectedObjectId === object.id) setSelectedObjectId("")
            }}
            onDuplicate={() => duplicateSelectedObject(object)}
            onNudge={(direction) => nudgeSelectedObject(object, direction)}
            onReorder={(direction) => reorderSelectedObject(object, direction)}
            onResize={(preset) => resizeSelectedObject(object, preset)}
            onSelect={() => setSelectedObjectId(object.id)}
          />
        ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-end gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
          <details className="mr-auto">
            <summary className="inline-flex h-8 cursor-pointer list-none items-center gap-1 rounded-md border border-border bg-secondary px-2 font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground">
              <FileText className="h-3.5 w-3.5" /> Notes
            </summary>
            <textarea value={selectedSlide?.speakerNotes || ""} onChange={(event) => onSetSlides(slides.map((item, next) => next === selectedSlideIndex ? { ...item, speakerNotes: event.target.value } : item))} className="absolute z-40 mt-2 h-32 w-72 rounded-lg border border-border bg-popover p-3 text-sm text-popover-foreground shadow-xl" placeholder="Speaker notes" />
          </details>
          <button onClick={() => updateSelectedSlide((slide) => ({ ...slide, speakerNotes: slide.speakerNotes || "Timer: 5 min explain, 2 min question, 1 min recap." }))} className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-secondary px-2 font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground" title="Add a timing note" type="button">
            <Clock className="h-3.5 w-3.5" /> Timer
          </button>
          <input value={slideZoom} onChange={(event) => setSlideZoom(Number(event.target.value))} min={50} max={140} type="range" className="w-28 accent-primary" aria-label="Slide zoom" />
          <span className="w-10 text-right font-semibold text-foreground">{slideZoom}%</span>
          <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 font-semibold text-secondary-foreground"><LayoutPanelLeft className="h-3.5 w-3.5" /> Pages</span>
          <span className="font-semibold text-foreground">{selectedSlideIndex + 1} / {slides.length}</span>
          <Grid2X2 className="h-4 w-4" />
          <Maximize2 className="h-4 w-4" />
        </div>
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
          <MenuAction icon={Paintbrush} label="Apply theme to all" onClick={() => onSetSlides((current) => applySlideDesignPresetToDeck(current, (selectedSlide?.theme || "midnight") as keyof typeof slideDesignPresets))} />
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
          <MenuAction icon={Type} label="Text box" onClick={() => addSlideObject("text")} />
          <MenuAction icon={LayoutPanelLeft} label="Shape" onClick={() => addSlideObject("shape")} />
          <MenuAction icon={ImageIcon} label="Image" onClick={() => addSlideObject("image")} />
          <MenuAction icon={Table2} label="Table" onClick={() => addSlideObject("table")} />
        </ActionMenu>
        <ActionMenu label="Arrange" icon={Scissors}>
          <MenuAction icon={ChevronDown} label="Move up" onClick={() => { onSetSlides((current) => moveSlide(current, selectedSlideIndex, -1)); goToSlide(-1) }} />
          <MenuAction icon={ChevronDown} label="Move down" onClick={() => { onSetSlides((current) => moveSlide(current, selectedSlideIndex, 1)); goToSlide(1) }} />
          <MenuAction icon={Copy} label="Duplicate slide" onClick={() => { onSetSlides((current) => duplicateSlide(current, selectedSlideIndex)); onSetSelectedSlideIndex(selectedSlideIndex + 1) }} />
          <MenuAction danger icon={Trash2} label="Delete slide" onClick={() => { onSetSlides((current) => current.length > 1 ? current.filter((_, index) => index !== selectedSlideIndex) : current); onSetSelectedSlideIndex(Math.max(0, Math.min(selectedSlideIndex, slides.length - 2))) }} />
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
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Objects</p>
              <span className="rounded-md bg-secondary px-2 py-1 text-xs font-semibold text-secondary-foreground">{selectedSlide.objects.length}</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {selectedSlide.objects.map((object, index) => (
                <button
                  key={object.id}
                  onClick={() => setSelectedObjectId(object.id)}
                  className={`rounded-md border px-2 py-1 text-xs font-semibold ${object.id === selectedObjectId ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground"}`}
                  type="button"
                >
                  {index + 1}. {object.type}
                </button>
              ))}
            </div>
            {selectedObject ? (
              <div className="grid gap-2 rounded-md border border-border bg-card p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-md bg-secondary px-2 py-1 text-xs font-semibold text-secondary-foreground">{selectedObject.type}</span>
                  <ActionMenu align="right" compact label="Object" icon={Settings2}>
                    <MenuAction icon={Copy} label="Duplicate" onClick={() => duplicateSelectedObject(selectedObject)} />
                    <MenuAction icon={ArrowUp} label="Nudge up" onClick={() => nudgeSelectedObject(selectedObject, "up")} />
                    <MenuAction icon={ArrowDown} label="Nudge down" onClick={() => nudgeSelectedObject(selectedObject, "down")} />
                    <MenuAction icon={ArrowLeft} label="Nudge left" onClick={() => nudgeSelectedObject(selectedObject, "left")} />
                    <MenuAction icon={ArrowRight} label="Nudge right" onClick={() => nudgeSelectedObject(selectedObject, "right")} />
                    <MenuAction icon={AlignLeft} label="Align left" onClick={() => alignSelectedObject(selectedObject, "left")} />
                    <MenuAction icon={AlignCenter} label="Align center" onClick={() => alignSelectedObject(selectedObject, "center")} />
                    <MenuAction icon={AlignRight} label="Align right" onClick={() => alignSelectedObject(selectedObject, "right")} />
                    <MenuAction icon={ArrowUp} label="Align top" onClick={() => alignSelectedObject(selectedObject, "top")} />
                    <MenuAction icon={ArrowDown} label="Align bottom" onClick={() => alignSelectedObject(selectedObject, "bottom")} />
                    <MenuAction icon={Maximize2} label="Bring to front" onClick={() => reorderSelectedObject(selectedObject, "front")} />
                    <MenuAction icon={Minus} label="Send to back" onClick={() => reorderSelectedObject(selectedObject, "back")} />
                    <MenuAction icon={Columns3} label="Wide size" onClick={() => resizeSelectedObject(selectedObject, "wide")} />
                    <MenuAction icon={Rows3} label="Tall size" onClick={() => resizeSelectedObject(selectedObject, "tall")} />
                    <MenuAction danger icon={Trash2} label="Delete" onClick={() => {
                      updateSelectedSlide((slide) => removeSlideDesignObject(slide, selectedObject.id))
                      setSelectedObjectId("")
                    }} />
                  </ActionMenu>
                </div>
                <input
                  value={selectedObject.text || ""}
                  onChange={(event) => updateSelectedObject(selectedObject, { text: event.target.value })}
                  placeholder="Label or text"
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus:border-ring"
                />
                {selectedObject.type === "image" ? (
                  <input
                    value={selectedObject.src || ""}
                    onChange={(event) => updateSelectedObject(selectedObject, { src: event.target.value })}
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
                        value={selectedObject[field]}
                        onChange={(event) => updateSelectedObject(selectedObject, { [field]: Number(event.target.value) })}
                        className="h-8 rounded-md border border-input bg-background px-1 text-xs text-foreground outline-none focus:border-ring"
                      />
                    </label>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <SlideStyleInput label="Text" value={styleValue(selectedObject, "color", "#ffffff")} onChange={(value) => updateSelectedObjectStyle(selectedObject, { color: value })} />
                  <SlideStyleInput label="Fill" value={styleValue(selectedObject, "background", "rgba(255,255,255,0.14)")} onChange={(value) => updateSelectedObjectStyle(selectedObject, { background: value })} />
                  <SlideStyleInput label="Size" value={styleValue(selectedObject, "fontSize", "14")} onChange={(value) => updateSelectedObjectStyle(selectedObject, { fontSize: Number(value) || 14 })} />
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

type SlideObjectAlignment = "left" | "center" | "right" | "top" | "middle" | "bottom"
type SlideObjectNudgeDirection = "up" | "down" | "left" | "right"
type SlideObjectOrderDirection = "front" | "back" | "forward" | "backward"
type SlideObjectSizePreset = "wide" | "tall" | "compact" | "hero"

type SlideObjectActionProps = {
  onAlign: (alignment: SlideObjectAlignment) => void
  onDelete: () => void
  onDuplicate: () => void
  onNudge: (direction: SlideObjectNudgeDirection) => void
  onReorder: (direction: SlideObjectOrderDirection) => void
  onResize: (preset: SlideObjectSizePreset) => void
  onSelect: () => void
}

function SlideCanvasObject({
  active,
  object,
  onAlign,
  onDelete,
  onDuplicate,
  onNudge,
  onReorder,
  onResize,
  onSelect,
}: {
  active: boolean
  object: SlideObject
} & SlideObjectActionProps) {
  const style = object.style || {}
  const canvasStyle: React.CSSProperties = {
    left: `${object.x}%`,
    top: `${object.y}%`,
    width: `${object.w}%`,
    height: `${object.h}%`,
    color: readStyleValue(style, "color", "#ffffff"),
    background: readStyleValue(style, "background", object.type === "text" ? "transparent" : "rgba(255,255,255,0.14)"),
    borderRadius: Number(readStyleValue(style, "borderRadius", "8")),
    boxShadow: readStyleValue(style, "boxShadow", "none"),
    fontSize: Number(readStyleValue(style, "fontSize", "14")),
    opacity: Number(readStyleValue(style, "opacity", "1")),
  }
  const sharedProps = {
    className: `absolute z-20 overflow-hidden border ${active ? "border-white shadow-[0_0_0_2px_rgba(255,255,255,0.45)]" : "border-white/20"}`,
    onClick: onSelect,
    onContextMenu: onSelect,
    style: canvasStyle,
    type: "button" as const,
  }
  if (object.type === "image") {
    return (
      <SlideObjectContextMenu onAlign={onAlign} onDelete={onDelete} onDuplicate={onDuplicate} onNudge={onNudge} onReorder={onReorder} onResize={onResize}>
        <button {...sharedProps} className={`${sharedProps.className} text-xs`}>
          {object.src ? <img src={object.src} alt={object.text || "Slide image"} className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center p-2 text-center">{object.text || "Image"}</span>}
        </button>
      </SlideObjectContextMenu>
    )
  }
  if (object.type === "table") {
    const columns = (object.text || "Concept | Evidence | Action").split("|").map((item) => item.trim())
    return (
      <SlideObjectContextMenu onAlign={onAlign} onDelete={onDelete} onDuplicate={onDuplicate} onNudge={onNudge} onReorder={onReorder} onResize={onResize}>
        <button {...sharedProps} className={`${sharedProps.className} grid text-xs font-semibold`} style={{ ...canvasStyle, gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
          {columns.map((column, index) => <span key={`${column}-${index}`} className="border-r border-white/20 p-2 last:border-r-0">{column}</span>)}
        </button>
      </SlideObjectContextMenu>
    )
  }
  return (
    <SlideObjectContextMenu onAlign={onAlign} onDelete={onDelete} onDuplicate={onDuplicate} onNudge={onNudge} onReorder={onReorder} onResize={onResize}>
      <button {...sharedProps} className={`${sharedProps.className} p-2 text-left ${object.type === "shape" ? "flex items-center justify-center text-center font-semibold" : ""}`}>
        {object.text || object.type}
      </button>
    </SlideObjectContextMenu>
  )
}

function SlideObjectContextMenu({ children, onAlign, onDelete, onDuplicate, onNudge, onReorder, onResize }: { children: React.ReactNode } & Omit<SlideObjectActionProps, "onSelect">) {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="z-50 min-w-52 rounded-md border border-border bg-popover p-1 text-sm text-popover-foreground shadow-xl">
          <ContextMenu.Item onClick={onDuplicate} className="context-item"><Copy className="h-4 w-4" /> Duplicate</ContextMenu.Item>
          <ContextMenu.Separator className="my-1 h-px bg-border" />
          <ContextMenu.Item onClick={() => onNudge("up")} className="context-item"><ArrowUp className="h-4 w-4" /> Nudge up</ContextMenu.Item>
          <ContextMenu.Item onClick={() => onNudge("down")} className="context-item"><ArrowDown className="h-4 w-4" /> Nudge down</ContextMenu.Item>
          <ContextMenu.Item onClick={() => onNudge("left")} className="context-item"><ArrowLeft className="h-4 w-4" /> Nudge left</ContextMenu.Item>
          <ContextMenu.Item onClick={() => onNudge("right")} className="context-item"><ArrowRight className="h-4 w-4" /> Nudge right</ContextMenu.Item>
          <ContextMenu.Separator className="my-1 h-px bg-border" />
          <ContextMenu.Item onClick={() => onAlign("left")} className="context-item"><AlignLeft className="h-4 w-4" /> Align left</ContextMenu.Item>
          <ContextMenu.Item onClick={() => onAlign("center")} className="context-item"><AlignCenter className="h-4 w-4" /> Align center</ContextMenu.Item>
          <ContextMenu.Item onClick={() => onAlign("right")} className="context-item"><AlignRight className="h-4 w-4" /> Align right</ContextMenu.Item>
          <ContextMenu.Item onClick={() => onAlign("top")} className="context-item"><ArrowUp className="h-4 w-4" /> Align top</ContextMenu.Item>
          <ContextMenu.Item onClick={() => onAlign("middle")} className="context-item"><Minus className="h-4 w-4" /> Align middle</ContextMenu.Item>
          <ContextMenu.Item onClick={() => onAlign("bottom")} className="context-item"><ArrowDown className="h-4 w-4" /> Align bottom</ContextMenu.Item>
          <ContextMenu.Separator className="my-1 h-px bg-border" />
          <ContextMenu.Item onClick={() => onReorder("forward")} className="context-item"><ArrowUp className="h-4 w-4" /> Bring forward</ContextMenu.Item>
          <ContextMenu.Item onClick={() => onReorder("backward")} className="context-item"><ArrowDown className="h-4 w-4" /> Send backward</ContextMenu.Item>
          <ContextMenu.Item onClick={() => onReorder("front")} className="context-item"><Maximize2 className="h-4 w-4" /> Bring to front</ContextMenu.Item>
          <ContextMenu.Item onClick={() => onReorder("back")} className="context-item"><Minus className="h-4 w-4" /> Send to back</ContextMenu.Item>
          <ContextMenu.Item onClick={() => onResize("compact")} className="context-item"><Minus className="h-4 w-4" /> Make compact</ContextMenu.Item>
          <ContextMenu.Item onClick={() => onResize("wide")} className="context-item"><Columns3 className="h-4 w-4" /> Make wide</ContextMenu.Item>
          <ContextMenu.Item onClick={() => onResize("tall")} className="context-item"><Rows3 className="h-4 w-4" /> Make tall</ContextMenu.Item>
          <ContextMenu.Item onClick={() => onResize("hero")} className="context-item"><Rows3 className="h-4 w-4" /> Make hero</ContextMenu.Item>
          <ContextMenu.Separator className="my-1 h-px bg-border" />
          <ContextMenu.Item onClick={onDelete} className="context-item text-destructive"><Trash2 className="h-4 w-4" /> Delete object</ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
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
          className={`mb-2 grid w-full grid-cols-[auto_1fr] gap-2 rounded-md border p-2 text-left ${active ? "border-primary bg-primary/10" : "border-border bg-background hover:bg-accent"}`}
          type="button"
          {...attributes}
        >
          <span
            className="flex h-8 w-6 cursor-grab items-center justify-center rounded-md bg-secondary text-secondary-foreground active:cursor-grabbing"
            onClick={(event) => event.stopPropagation()}
            title="Drag to reorder"
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-semibold text-muted-foreground">Slide {index + 1}</span>
            <span className="line-clamp-2 text-sm font-medium text-foreground">{slide.title || "Untitled slide"}</span>
          </span>
        </button>
      </ContextMenu.Trigger>
      <StudioContextContent onCopy={onCopy} onDuplicate={onDuplicate} onArchive={onArchive} onAskAi={() => undefined} />
    </ContextMenu.Root>
  )
}

function RichTextEditor({ canvasFormat, large, onChange, placeholder, value }: { canvasFormat: StudioCanvasFormat; large?: boolean; onChange: (value: string) => void; placeholder: string; value: string }) {
  const documentSummary = useMemo(() => summarizeDocumentHtml(value), [value])
  const pageCount = countRichDocumentPages(value)
  const [pageHidden, setPageHidden] = useState(false)
  const [pageLocked, setPageLocked] = useState(false)
  const [zoom, setZoom] = useState(86)
  const editor = useEditor({
    immediatelyRender: false,
    editable: !pageLocked,
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

  useEffect(() => {
    editor?.setEditable(!pageLocked)
  }, [editor, pageLocked])

  return (
    <div className="rounded-md border border-border bg-muted/40">
      <RichTextToolbar editor={editor} />
      <div className="overflow-auto bg-muted/35 p-3 sm:p-5">
        <div
          className="mx-auto w-full rounded-lg border border-border bg-background shadow-xl"
          style={{ aspectRatio: canvasAspectRatio(canvasFormat), maxWidth: Math.round(canvasPreviewWidth(canvasFormat) * (zoom / 100)), opacity: pageHidden ? 0.3 : 1 }}
        >
          <EditorContent
            editor={editor}
            className={`${large ? "min-h-[62vh]" : "min-h-[52vh]"} px-6 py-6 text-foreground sm:px-10 sm:py-8 [&_.ProseMirror]:min-h-[48vh] [&_.ProseMirror]:outline-none [&_blockquote]:border-l-4 [&_blockquote]:border-primary [&_blockquote]:pl-3 [&_h1]:text-3xl [&_h1]:font-semibold [&_h2]:text-2xl [&_h2]:font-semibold [&_p]:leading-8 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:p-2 [&_th]:border [&_th]:border-border [&_th]:bg-secondary [&_th]:p-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6`}
          />
        </div>
      </div>
      <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 border-t border-border bg-card/95 px-3 py-2 text-xs text-muted-foreground backdrop-blur">
        <button onClick={() => onChange(appendRichDocumentPage(value))} className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-secondary px-2 font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground" title="Add page" type="button">
          <Plus className="h-3.5 w-3.5" />
          Page
        </button>
        <button onClick={() => onChange(duplicateRichDocumentLastPage(value))} className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-secondary px-2 font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground" title="Duplicate page" type="button">
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => setPageHidden((hidden) => !hidden)} className={`inline-flex h-8 items-center gap-1 rounded-md border px-2 font-semibold ${pageHidden ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground"}`} title={pageHidden ? "Show page" : "Hide page preview"} type="button">
          {pageHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
        <button onClick={() => setPageLocked((locked) => !locked)} className={`inline-flex h-8 items-center gap-1 rounded-md border px-2 font-semibold ${pageLocked ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground"}`} title={pageLocked ? "Unlock editing" : "Lock editing"} type="button">
          <Lock className="h-3.5 w-3.5" />
        </button>
        <span>{canvasFormat.label}</span>
        <span>{documentSummary.words} words</span>
        <span>{documentSummary.characters} chars</span>
        <span>{documentSummary.readingMinutes} min read</span>
        <div className="ml-auto flex items-center gap-2">
          <input value={zoom} onChange={(event) => setZoom(Number(event.target.value))} min={50} max={140} type="range" className="w-28 accent-primary" aria-label="Zoom" />
          <span className="w-10 text-right font-semibold text-foreground">{zoom}%</span>
          <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 font-semibold text-secondary-foreground"><LayoutPanelLeft className="h-3.5 w-3.5" /> Pages</span>
          <span className="font-semibold text-foreground">1 / {pageCount}</span>
        </div>
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
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-1.5 border-b border-border bg-card/95 px-3 py-2 backdrop-blur">
      <ToolbarIcon icon={List} label="Toolbar menu" onClick={() => editor?.commands.focus()} />
      <ActionMenu label="Style" icon={Type} compact>
        <MenuAction icon={Type} label="Paragraph" onClick={() => run((item) => item.chain().focus().setParagraph().run())} />
        <MenuAction icon={Heading1} label="Apply Heading 1" onClick={() => run((item) => applyHeadingStyle(item, 1, headingStyles[1]))} />
        <MenuAction icon={Heading2} label="Apply Heading 2" onClick={() => run((item) => applyHeadingStyle(item, 2, headingStyles[2]))} />
        <MenuAction icon={Heading3} label="Apply Heading 3" onClick={() => run((item) => applyHeadingStyle(item, 3, headingStyles[3]))} />
        <MenuAction icon={Paintbrush} label="Update H1 from selection" onClick={() => saveHeadingStyle(1)} />
        <MenuAction icon={Paintbrush} label="Update H2 from selection" onClick={() => saveHeadingStyle(2)} />
        <MenuAction icon={Paintbrush} label="Update H3 from selection" onClick={() => saveHeadingStyle(3)} />
        <MenuAction icon={RotateCcw} label="Reset saved headings" onClick={resetHeadingStyles} />
      </ActionMenu>
      <select defaultValue="" onChange={(event) => event.target.value ? run((item) => item.chain().focus().setFontFamily(event.target.value).run()) : undefined} className="h-9 min-w-28 rounded-md border border-input bg-background px-2 text-sm font-semibold text-foreground">
        <option value="" disabled>Font</option>
        {studioFontOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <div className="flex h-9 items-center rounded-md border border-input bg-background">
        <button onClick={() => run((item) => item.chain().focus().setMark("textStyle", { fontSize: "10pt" }).run())} className="grid h-8 w-8 place-items-center text-foreground hover:bg-accent hover:text-accent-foreground" type="button" title="Smaller text"><Minus className="h-4 w-4" /></button>
        <select defaultValue="" onChange={(event) => event.target.value ? run((item) => item.chain().focus().setMark("textStyle", { fontSize: event.target.value }).run()) : undefined} className="h-8 w-16 border-x border-border bg-transparent px-1 text-center text-sm font-semibold text-foreground">
          <option value="" disabled>Size</option>
          {studioFontSizeOptions.map((option) => <option key={option.value} value={option.value}>{option.label.replace("pt", "")}</option>)}
        </select>
        <button onClick={() => run((item) => item.chain().focus().setMark("textStyle", { fontSize: "24pt" }).run())} className="grid h-8 w-8 place-items-center text-foreground hover:bg-accent hover:text-accent-foreground" type="button" title="Larger text"><Plus className="h-4 w-4" /></button>
      </div>
      <ActionMenu label="Color" icon={Highlighter} compact>
        <MenuSelect label="Text color" onChange={(value) => run((item) => value === "inherit" ? item.chain().focus().unsetColor().run() : item.chain().focus().setColor(value).run())} options={studioTextColorOptions} />
        <MenuSelect label="Highlight" onChange={(value) => run((item) => item.chain().focus().toggleHighlight({ color: value }).run())} options={studioHighlightColorOptions} />
      </ActionMenu>
      <ToolbarIcon icon={Bold} label="Bold" onClick={() => run((item) => item.chain().focus().toggleBold().run())} />
      <ToolbarIcon icon={Italic} label="Italic" onClick={() => run((item) => item.chain().focus().toggleItalic().run())} />
      <ToolbarIcon icon={UnderlineIcon} label="Underline" onClick={() => run((item) => item.chain().focus().toggleUnderline().run())} />
      <ToolbarIcon icon={Strikethrough} label="Strike" onClick={() => run((item) => item.chain().focus().toggleStrike().run())} />
      <ActionMenu label="Text settings" icon={Type} compact>
        <MenuAction icon={Type} label="Uppercase style" onClick={() => run((item) => item.chain().focus().setMark("textStyle", { textTransform: "uppercase" }).run())} />
        <MenuAction icon={Braces} label="Inline code" onClick={() => run((item) => item.chain().focus().toggleCode().run())} />
        <MenuAction icon={Quote} label="Quote" onClick={() => run((item) => item.chain().focus().toggleBlockquote().run())} />
      </ActionMenu>
      <ToolbarIcon icon={AlignLeft} label="Align left" onClick={() => run((item) => item.chain().focus().setTextAlign("left").run())} />
      <ToolbarIcon icon={AlignCenter} label="Align center" onClick={() => run((item) => item.chain().focus().setTextAlign("center").run())} />
      <ToolbarIcon icon={List} label="Bullets" onClick={() => run((item) => item.chain().focus().toggleBulletList().run())} />
      <ToolbarIcon icon={ListOrdered} label="Numbers" onClick={() => run((item) => item.chain().focus().toggleOrderedList().run())} />
      <ToolbarIcon icon={CheckSquare} label="Tasks" onClick={() => run((item) => item.chain().focus().toggleTaskList().run())} />
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
      <ActionMenu label="Effects" icon={Highlighter}>
        <MenuAction icon={Highlighter} label="Soft highlight" onClick={() => run((item) => item.chain().focus().toggleHighlight({ color: "#fef3c7" }).run())} />
        <MenuAction icon={Paintbrush} label="Accent text" onClick={() => run((item) => item.chain().focus().setColor("#7c3aed").run())} />
        <MenuAction icon={Quote} label="Callout quote" onClick={() => run((item) => item.chain().focus().toggleBlockquote().run())} />
      </ActionMenu>
      <ActionMenu label="Animate" icon={RotateCcw}>
        <MenuAction icon={RotateCcw} label="Reading reveal marker" onClick={() => run((item) => item.chain().focus().insertContent("<p><strong>Reveal:</strong> </p>").run())} />
        <MenuAction icon={Clock} label="Timed practice cue" onClick={() => run((item) => item.chain().focus().insertContent("<p><strong>Timer:</strong> 5 min focus block</p>").run())} />
      </ActionMenu>
      <ActionMenu label="Position" icon={Maximize2}>
        <MenuAction icon={AlignLeft} label="Align left" onClick={() => run((item) => item.chain().focus().setTextAlign("left").run())} />
        <MenuAction icon={AlignCenter} label="Align center" onClick={() => run((item) => item.chain().focus().setTextAlign("center").run())} />
        <MenuAction icon={AlignRight} label="Align right" onClick={() => run((item) => item.chain().focus().setTextAlign("right").run())} />
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
  onCopyLink,
  onDownload,
  onExport,
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
  onCopyLink: () => void
  onDownload: () => void
  onExport: () => void
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
        {inspectorTab === "Export" ? <StudioExportInspector activeKind={activeKind} onCopyLink={onCopyLink} onDownload={onDownload} onExport={onExport} /> : null}
      </div>
    </aside>
  )
}

function StudioExportInspector({
  activeKind,
  onCopyLink,
  onDownload,
  onExport,
}: {
  activeKind: StudioKind
  onCopyLink: () => void
  onDownload: () => void
  onExport: () => void
}) {
  const shareOptions = buildStudioShareOptions(activeKind)
  const downloadOptions = buildStudioDownloadOptions(activeKind)
  const recommendedDownload = recommendedStudioDownloadOption(activeKind)
  const shareIconById = {
    "copy-link": Copy,
    "private-access": Lock,
    "public-preview": Share2,
    "template-link": Clipboard,
    present: Presentation,
    record: Video,
  } satisfies Record<(typeof shareOptions)[number]["id"], React.ComponentType<{ className?: string }>>
  const downloadIconById = {
    html: FileText,
    text: FileText,
    markdown: Braces,
    csv: Table2,
    pptx: Presentation,
    outline: List,
    json: Braces,
  } satisfies Record<(typeof downloadOptions)[number]["id"], React.ComponentType<{ className?: string }>>
  return (
    <div className="space-y-3">
      <section className="rounded-lg border border-border bg-card p-3 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Share design</p>
            <p className="mt-1 text-sm font-semibold text-foreground">Private by default</p>
          </div>
          <span className="rounded-md bg-secondary px-2 py-1 text-[0.68rem] font-bold text-secondary-foreground">0 visitors</span>
        </div>
        <div className="mt-3 rounded-md border border-border bg-background p-2">
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.1em] text-muted-foreground">Access level</p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="inline-flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
              <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate">Only you can access</span>
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
        <button onClick={onCopyLink} className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-primary/90" type="button">
          <Copy className="h-4 w-4" />
          Copy link
        </button>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {shareOptions.map((option) => (
            <div key={option.id} className={`group rounded-md border p-2 text-center transition hover:-translate-y-0.5 ${option.primary ? "border-primary bg-primary/10" : "border-border bg-background"}`} title={option.detail}>
              <span className={`mx-auto flex h-10 w-10 items-center justify-center rounded-full ${
                option.tone === "primary" ? "bg-primary text-primary-foreground" :
                option.tone === "present" ? "bg-violet-500/15 text-violet-700 dark:text-violet-200" :
                option.tone === "social" ? "bg-success/15 text-success" :
                "bg-secondary text-secondary-foreground"
              }`}>
                {(() => {
                  const Icon = shareIconById[option.id]
                  return <Icon className="h-4 w-4" />
                })()}
              </span>
              <p className="mt-2 truncate text-xs font-bold text-foreground">{option.label}</p>
              <p className="mt-0.5 text-[0.66rem] font-semibold text-muted-foreground">{option.badge}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-lg border border-border bg-card p-3 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Download</p>
            <p className="mt-1 text-sm font-semibold text-foreground">{recommendedDownload?.label || "Best format"} ready</p>
          </div>
          <span className="rounded-md bg-primary/15 px-2 py-1 text-[0.68rem] font-bold text-primary">Suggested</span>
        </div>
        <div className="mt-3 rounded-md border border-primary/40 bg-primary/10 p-2">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
              <Download className="h-4 w-4 shrink-0 text-primary" />
              <span className="truncate">{recommendedDownload?.label || "Download"}</span>
            </span>
            <span className="rounded-md bg-background px-2 py-0.5 text-[0.66rem] font-semibold text-muted-foreground">{recommendedDownload?.sizeHint || "Ready"}</span>
          </div>
          <p className="mt-1 text-[0.7rem] leading-4 text-muted-foreground">{recommendedDownload?.bestFor || "Recommended for this project type."}</p>
        </div>
        <div className="mt-3 grid gap-2">
          {downloadOptions.map((option) => (
            <button key={option.id} onClick={option.action === "download" ? onDownload : onExport} className="rounded-md border border-border bg-background p-2 text-left transition hover:border-primary hover:bg-accent" type="button">
              <span className="flex items-center justify-between gap-2">
                <span className="inline-flex min-w-0 items-center gap-2 text-xs font-bold text-foreground">
                  {(() => {
                    const Icon = downloadIconById[option.id]
                    return <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  })()}
                  <span className="truncate">{option.label}</span>
                </span>
                {option.suggested ? <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary">Suggested</span> : null}
              </span>
              <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">{option.detail}</span>
              <span className="mt-2 flex items-center justify-between gap-2 text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                <span>{option.bestFor}</span>
                <span>{option.sizeHint}</span>
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
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
  const closeMenuOnEscape = (event: React.KeyboardEvent<HTMLDetailsElement>) => {
    if (event.key !== "Escape") return
    event.currentTarget.removeAttribute("open")
    const summary = event.currentTarget.querySelector("summary")
    if (summary instanceof HTMLElement) summary.focus()
  }
  const closeMenuOnFocusLeave = (event: React.FocusEvent<HTMLDetailsElement>) => {
    const nextFocusedElement = event.relatedTarget
    if (nextFocusedElement instanceof Node && event.currentTarget.contains(nextFocusedElement)) return
    event.currentTarget.removeAttribute("open")
  }

  return (
    <details className="group relative inline-block" onBlur={closeMenuOnFocusLeave} onKeyDown={closeMenuOnEscape}>
      <summary
        aria-label={label}
        aria-haspopup="menu"
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
      <div aria-label={label} className={`absolute top-10 z-50 w-64 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-xl ${align === "right" ? "right-0" : "left-0"}`} role="menu">
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
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    onClick()
    event.currentTarget.closest("details")?.removeAttribute("open")
  }

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      role="menuitem"
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
  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    if (!event.target.value) return
    onChange(event.target.value)
    event.currentTarget.value = ""
    event.currentTarget.closest("details")?.removeAttribute("open")
  }

  return (
    <label className="grid gap-1 px-2 py-1 text-xs font-semibold text-muted-foreground">
      {label}
      <select defaultValue="" onChange={handleChange} className="h-8 rounded-md border border-input bg-background px-2 text-sm font-medium text-foreground">
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
    <button onClick={onClick} className={`flex h-8 items-center justify-center gap-1.5 rounded-md text-xs font-semibold ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"}`} type="button">
      <Icon className="h-3.5 w-3.5" />
      <span className={compact ? "sr-only" : ""}>{label}</span>
    </button>
  )
}

function StudioButton({ disabled, icon: Icon, label, onClick, primary }: { disabled?: boolean; icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void; primary?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className={`flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-45 ${primary ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground"}`} type="button">
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </button>
  )
}

function MiniAction({ icon: Icon, label, onClick }: { icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void }) {
  return <button onClick={onClick} className="icon-button" title={label} type="button"><Icon className="h-4 w-4" /></button>
}

function ToolbarIcon({ icon: Icon, label, onClick }: { icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void }) {
  return <button onClick={onClick} className="icon-button" title={label} type="button"><Icon className="h-4 w-4" /></button>
}

function SheetButton({ icon: Icon, label, onClick }: { icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex h-9 items-center gap-2 rounded-md border border-border bg-secondary px-3 text-sm font-medium text-secondary-foreground hover:bg-accent hover:text-accent-foreground" type="button">
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
