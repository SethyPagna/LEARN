"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { AlertTriangle, Bot, Brain, CheckCircle2, CheckSquare, ChevronDown, FileText, Gauge, Info, Languages, ListFilter, MoreHorizontal, Plus, Route, SlidersHorizontal, Sparkles, UploadCloud, Wand2 } from "lucide-react"
import type { WorkspaceOptions } from "../preferences"
import type { Note, StudioInsertTarget, View } from "../types"
import { api } from "../api"
import { ControlButton, Panel, StatusPill } from "../ui"
import { menuSurfaceClasses, statusToneClasses, toneTextClasses, type UiTone } from "@/lib/design-system"
import { buildAiGatewayReadiness } from "@/lib/ai/gateway-readiness"
import { buildGuidedPrompt, listInsertActions, promptContracts } from "@/lib/ai/prompt-builder"
import { buildInsertBackPayload } from "@/lib/ai/insert-back"
import { buildAiTutorPrimaryActionPlan, buildAiTutorSourceContext, getRecommendedAiTutorTokens, resolveAiTutorEffectiveTokens, resolveAiTutorSourceScopeAfterUpload, splitPromptPreview, summarizeAiTutorUploadedSource, summarizeAiTutorWorkflow } from "@/lib/ai/tutor-workflow"
import type { AiTaskKey } from "@/lib/ai/prompt-library"
import { buildImportFollowupAction, previewImportedLearningContent, type ImportFollowupKind, type ImportTarget } from "@/lib/import-gateway"

const tutorModes = [
  { id: "answer_explanation", mode: "mistake", label: "Mistake", icon: Sparkles, prompt: "Explain the mistake, repair the misconception, and create a short retry drill." },
  { id: "note_design", mode: "rewrite", label: "Rewrite", icon: Wand2, prompt: "Rewrite this into a clean study page with headings, callouts, examples, and review prompts." },
  { id: "quiz_generation", mode: "quiz", label: "Quiz", icon: CheckSquare, prompt: "Generate a mixed quiz with MCQ, true/false, fill-in-the-blank, and explanations." },
  { id: "flashcard_generation", mode: "flashcards", label: "Flashcards", icon: Brain, prompt: "Create active-recall flashcards and a tiny memory game from this context." },
  { id: "study_plan", mode: "route", label: "Study Plan", icon: Route, prompt: "Create a targeted 7-day study route with daily focus, review, and practice." },
  { id: "document_formatter", mode: "cleanup", label: "Docs", icon: FileText, prompt: "Format raw material into a Studio document with blocks, callouts, and review questions." },
  { id: "document_editor", mode: "cleanup", label: "Doc Edit", icon: FileText, prompt: "Edit this document for hierarchy, flow, references, and study usefulness." },
  { id: "sheet_organizer", mode: "cleanup", label: "Sheets", icon: ListFilter, prompt: "Organize messy data into spreadsheet columns, rows, filters, and validation notes." },
  { id: "sheet_formula_builder", mode: "cleanup", label: "Formulas", icon: ListFilter, prompt: "Design useful formulas, validation rules, filters, and chart suggestions for this sheet." },
  { id: "slide_builder", mode: "cleanup", label: "Slides", icon: Sparkles, prompt: "Build a concise lesson deck with layouts, objects, and speaker notes." },
  { id: "slide_design_director", mode: "cleanup", label: "Deck Design", icon: Sparkles, prompt: "Design a teaching deck with visual hierarchy, transitions, animations, timing, and presenter notes." },
  { id: "practice_generator", mode: "quiz", label: "Practice", icon: Gauge, prompt: "Create targeted practice with timing, explanations, retry set, and review cards." },
  { id: "personalized_prompt", mode: "coach", label: "Prompt", icon: Bot, prompt: "Compose a precise personalized prompt with requirements and output format." },
  { id: "translation", mode: "translate", label: "Translate", icon: Languages, prompt: "Translate and simplify this learning material while preserving key terms." },
] 

const sourceScopes = ["Recent notes", "Active Studio item", "Weak topics", "Uploaded files", "Manual only"]
const difficulties = ["Adaptive", "Beginner", "Intermediate", "Advanced", "Exam prep"]
const tones = ["Kind", "Direct", "Socratic", "Concise", "Detailed"]
const outputLengths = ["Short", "Balanced", "Deep", "Max"]
const languages = ["English", "Khmer", "French", "Spanish", "Korean", "Japanese", "Chinese"]
const insertTargets: StudioInsertTarget[] = ["note-block", "doc-section", "sheet-rows", "slide-outline", "quiz", "flashcards", "review-cards", "ai-note"]
const importTargets: Array<ImportTarget | "auto"> = ["auto", "note", "doc", "sheet", "slides"]
const tokenPresets = [2048, 4096, 8192, 16384]
const AI_TUTOR_DRAFT_KEY = "learn_ai_tutor_draft_v1"
const DEFAULT_AI_MESSAGE = "Create a study plan from my recent notes."
const tutorModeGroups = [
  { id: "all", label: "All", modes: tutorModes.map((mode) => mode.id) },
  { id: "tutor", label: "Tutor", modes: ["answer_explanation", "study_plan", "personalized_prompt", "translation"] },
  { id: "studio", label: "Studio", modes: ["note_design", "document_formatter", "document_editor", "sheet_organizer", "sheet_formula_builder", "slide_builder", "slide_design_director"] },
  { id: "practice", label: "Practice", modes: ["quiz_generation", "flashcard_generation", "practice_generator"] },
] as const
type TutorModeGroupId = (typeof tutorModeGroups)[number]["id"]
type TutorMenuId = "task" | "filters" | "gateway"

type AiTutorDraft = {
  message: string
  reply: string
  importText?: string
  importTitle?: string
  importTarget?: ImportTarget | "auto"
  lastImport?: { target: ImportTarget; title: string } | null
  lastImportText?: string
  sourceScope: string
  difficulty: string
  tone: string
  outputLength: string
  language: string
  providerFamily: string
  insertTarget: StudioInsertTarget
  targetAudience: string
  requiredOutput: string
  activeTaskKey: string
  updatedAt: string
}

export function AiTutorView({
  notes,
  options,
  setNotes,
  setOptions,
  setView,
}: {
  notes: Note[]
  options: WorkspaceOptions
  setNotes?: (updater: (current: Note[]) => Note[]) => void
  setOptions: (options: Partial<WorkspaceOptions>) => void
  setView?: (view: View) => void
}) {
  const [message, setMessage] = useState(DEFAULT_AI_MESSAGE)
  const [reply, setReply] = useState("")
  const [draftStatus, setDraftStatus] = useState("")
  const [actionStatus, setActionStatus] = useState("")
  const [loading, setLoading] = useState(false)
  const [providers, setProviders] = useState<any[]>([])
  const [catalog, setCatalog] = useState<any[]>([])
  const [presets, setPresets] = useState<any[]>([])
  const [importText, setImportText] = useState("")
  const [importTitle, setImportTitle] = useState("")
  const [importTarget, setImportTarget] = useState<ImportTarget | "auto">("auto")
  const [importStatus, setImportStatus] = useState("")
  const [importLoading, setImportLoading] = useState(false)
  const [lastImport, setLastImport] = useState<{ target: ImportTarget; title: string } | null>(null)
  const [lastImportText, setLastImportText] = useState("")
  const [sourceScope, setSourceScope] = useState(sourceScopes[0])
  const [difficulty, setDifficulty] = useState(difficulties[0])
  const [tone, setTone] = useState(tones[0])
  const [outputLength, setOutputLength] = useState(outputLengths[1])
  const [language, setLanguage] = useState(languages[0])
  const [providerFamily, setProviderFamily] = useState("auto")
  const [insertTarget, setInsertTarget] = useState<StudioInsertTarget>("ai-note")
  const [targetAudience, setTargetAudience] = useState("Self-directed learner")
  const [requiredOutput, setRequiredOutput] = useState("Clear sections, compact examples, and one next action.")
  const [activeTaskKey, setActiveTaskKey] = useState(tutorModes[0].id)
  const [modeGroup, setModeGroup] = useState<TutorModeGroupId>("tutor")
  const [openTutorMenu, setOpenTutorMenu] = useState<TutorMenuId | null>(null)
  const [sidePanel, setSidePanel] = useState<"gateway" | "import" | "presets">("gateway")
  const draftHydrated = useRef(false)
  const draftStatusTimer = useRef<number | null>(null)

  const activeMode = useMemo(() => tutorModes.find((mode) => mode.id === activeTaskKey) || tutorModes[0], [activeTaskKey])
  const recentContext = useMemo(() => notes.slice(0, 5).map((note) => `${note.title}: ${note.content}`).join("\n\n"), [notes])
  const uploadedContext = useMemo(() => (importText || lastImportText).trim(), [importText, lastImportText])
  const sourceContext = useMemo(() => buildAiTutorSourceContext({
    message,
    recentContext,
    sourceScope,
    includeRecentNotes: options.aiIncludeNotes,
    uploadedContext,
  }), [message, options.aiIncludeNotes, recentContext, sourceScope, uploadedContext])
  const activeContract = useMemo(() => promptContracts.find((contract) => contract.mode === activeMode.id), [activeMode.id])
  const availableInsertTargets = useMemo(() => activeContract?.insertTargets || insertTargets, [activeContract?.insertTargets])
  const insertActions = useMemo(() => listInsertActions(availableInsertTargets), [availableInsertTargets])
  const promptBuild = useMemo(() => buildGuidedPrompt({
    taskKey: activeMode.id as AiTaskKey,
    fields: buildPromptFields(message, sourceContext, targetAudience, requiredOutput, difficulty, tone, outputLength, language),
    filters: { sourceScope, difficulty, tone, language, outputLength, providerFamily, insertTarget },
  }), [activeMode.id, difficulty, insertTarget, language, message, outputLength, providerFamily, requiredOutput, sourceContext, sourceScope, targetAudience, tone])
  const gatewayReadiness = useMemo(() => buildAiGatewayReadiness({
    prompt: promptBuild,
    providers,
    providerFamily,
  }), [promptBuild, providerFamily, providers])
  const effectiveMaxTokens = useMemo(() => resolveAiTutorEffectiveTokens({
    outputLength,
    tokenBudget: options.aiMaxTokens,
  }), [options.aiMaxTokens, outputLength])
  const workflowSummary = useMemo(() => summarizeAiTutorWorkflow({
    taskLabel: activeMode.label,
    sourceScope,
    insertTarget,
    prompt: promptBuild,
    gateway: gatewayReadiness,
    recentNoteCount: notes.length,
    draftSaved: draftStatus === "Draft saved",
    difficulty,
    language,
    outputLength,
    providerFamily,
    tokenBudget: options.aiMaxTokens,
    effectiveTokenBudget: effectiveMaxTokens,
    uploadedContextLength: uploadedContext.length,
  }), [activeMode.label, difficulty, draftStatus, effectiveMaxTokens, gatewayReadiness, insertTarget, language, notes.length, options.aiMaxTokens, outputLength, promptBuild, providerFamily, sourceScope, uploadedContext.length])
  const primaryActionPlan = useMemo(() => buildAiTutorPrimaryActionPlan({
    prompt: promptBuild,
    gateway: gatewayReadiness,
    loading,
    sourceScope,
    uploadedContextLength: uploadedContext.length,
  }), [gatewayReadiness, loading, promptBuild, sourceScope, uploadedContext.length])
  const previewParts = useMemo(() => splitPromptPreview(promptBuild.preview), [promptBuild.preview])
  const importPreview = useMemo(() => previewImportedLearningContent({ raw: importText, title: importTitle, target: importTarget }), [importTarget, importText, importTitle])
  const uploadedSourceSummary = useMemo(() => summarizeAiTutorUploadedSource({
    draftText: importText,
    savedText: lastImportText,
    savedTitle: lastImport?.title,
  }), [importText, lastImport?.title, lastImportText])
  const providerSummary = useMemo(() => {
    const readyCount = providers.filter(providerIsReady).length
    const configuredCount = providers.filter((provider) => provider.has_key).length
    return {
      readyCount,
      configuredCount,
      familyCount: catalog.length,
      presetCount: presets.length,
    }
  }, [catalog.length, presets.length, providers])

  useEffect(() => {
    if (!availableInsertTargets.includes(insertTarget)) setInsertTarget(availableInsertTargets[0] || "ai-note")
  }, [availableInsertTargets, insertTarget])

  useEffect(() => {
    void loadProviders()
  }, [])

  useEffect(() => {
    const draft = readAiTutorDraft()
    if (draft) {
      setMessage(draft.message || DEFAULT_AI_MESSAGE)
      setReply(draft.reply || "")
      setImportText(draft.importText || "")
      setImportTitle(draft.importTitle || "")
      setImportTarget(importTargets.includes(draft.importTarget as ImportTarget | "auto") ? draft.importTarget as ImportTarget | "auto" : "auto")
      setLastImport(draft.lastImport || null)
      setLastImportText(draft.lastImportText || "")
      setSourceScope(normalizeChoice(draft.sourceScope, sourceScopes, sourceScopes[0]))
      setDifficulty(normalizeChoice(draft.difficulty, difficulties, difficulties[0]))
      setTone(normalizeChoice(draft.tone, tones, tones[0]))
      setOutputLength(normalizeChoice(draft.outputLength, outputLengths, outputLengths[1]))
      setLanguage(normalizeChoice(draft.language, languages, languages[0]))
      setProviderFamily(draft.providerFamily || "auto")
      setInsertTarget(insertTargets.includes(draft.insertTarget) ? draft.insertTarget : "ai-note")
      setTargetAudience(draft.targetAudience || "Self-directed learner")
      setRequiredOutput(draft.requiredOutput || "Clear sections, compact examples, and one next action.")
      if (tutorModes.some((mode) => mode.id === draft.activeTaskKey)) {
        setActiveTaskKey(draft.activeTaskKey)
        setModeGroup(modeGroupForTask(draft.activeTaskKey))
      }
    }
    draftHydrated.current = true
    return () => {
      if (draftStatusTimer.current) window.clearTimeout(draftStatusTimer.current)
    }
  }, [])

  useEffect(() => {
    if (!draftHydrated.current) return
    const timeout = window.setTimeout(() => {
      writeAiTutorDraft({
        message,
        reply,
        importText,
        importTitle,
        importTarget,
        lastImport,
        lastImportText,
        sourceScope,
        difficulty,
        tone,
        outputLength,
        language,
        providerFamily,
        insertTarget,
        targetAudience,
        requiredOutput,
        activeTaskKey,
        updatedAt: new Date().toISOString(),
      })
      setDraftStatus("Draft saved")
      if (draftStatusTimer.current) window.clearTimeout(draftStatusTimer.current)
      draftStatusTimer.current = window.setTimeout(() => setDraftStatus(""), 1400)
    }, 500)
    return () => window.clearTimeout(timeout)
  }, [activeTaskKey, difficulty, importTarget, importText, importTitle, insertTarget, language, lastImport, lastImportText, message, outputLength, providerFamily, reply, sourceScope, targetAudience, requiredOutput, tone])

  function resetDraft() {
    setMessage(DEFAULT_AI_MESSAGE)
    setReply("")
    setImportText("")
    setImportTitle("")
    setImportTarget("auto")
    setLastImport(null)
    setLastImportText("")
    setSourceScope(sourceScopes[0])
    setDifficulty(difficulties[0])
    setTone(tones[0])
    setOutputLength(outputLengths[1])
    setLanguage(languages[0])
    setProviderFamily("auto")
    setInsertTarget("ai-note")
    setTargetAudience("Self-directed learner")
    setRequiredOutput("Clear sections, compact examples, and one next action.")
    setActiveTaskKey(tutorModes[0].id)
    setModeGroup("tutor")
    clearAiTutorDraft()
    setDraftStatus("Draft reset")
  }

  async function ask() {
    if (!promptBuild.ok) {
      setActionStatus(`Missing: ${promptBuild.missing.join(", ")}`)
      return
    }
    setLoading(true)
    try {
      const contextParts = [
        promptBuild.preview,
        `Task mode: ${activeMode.label}`,
        `Source scope: ${sourceScope}`,
        `Difficulty: ${difficulty}`,
        `Tone: ${tone}`,
        `Output length: ${outputLength}`,
        `Language: ${language}`,
        `Max output tokens: ${effectiveMaxTokens}`,
        providerFamily !== "auto" ? `Preferred provider family: ${providerFamily}` : "",
      ].filter(Boolean)
      const response = await api<any>("/api/ai/chat", {
        method: "POST",
        body: JSON.stringify({
          message: promptBuild.user,
          context: [promptBuild.system, contextParts.join("\n\n")].join("\n\n"),
          mode: activeMode.mode,
          temperature: options.aiTemperature,
          maxTokens: effectiveMaxTokens,
        }),
      })
      setReply(response.text)
      setActionStatus("")
    } finally {
      setLoading(false)
    }
  }

  async function runPrimaryAction() {
    if (primaryActionPlan.action === "import") {
      setSidePanel("import")
      setImportStatus(primaryActionPlan.statusMessage)
      return
    }
    if (primaryActionPlan.action === "gateway") {
      setSidePanel("gateway")
      setActionStatus(primaryActionPlan.statusMessage)
      return
    }
    if (primaryActionPlan.action === "prompt") {
      setActionStatus(primaryActionPlan.statusMessage)
      return
    }
    await ask()
  }

  async function loadProviders() {
    const response = await api<{ items: any[]; catalog?: any[]; presets?: any[] }>("/api/ai/providers").catch(() => ({ items: [], catalog: [], presets: [] }))
    setProviders(response.items)
    setCatalog(response.catalog || [])
    setPresets(response.presets || [])
  }

  async function saveReplyAsNote() {
    if (!reply.trim()) return
    const response = await api<{ item: Note }>("/api/notes", {
      method: "POST",
      body: JSON.stringify({
        title: `AI ${activeMode.label} - ${new Date().toLocaleDateString()}`,
        content: `<h2>${escapeHtml(activeMode.label)}</h2><pre>${escapeHtml(reply)}</pre>`,
        template: "ai-result",
      }),
    })
    setNotes?.((current) => [response.item, ...current])
    setActionStatus("Saved as a Studio note.")
    setView?.("notes")
  }

  async function insertReply(target: StudioInsertTarget) {
    if (!reply.trim()) return
    const payload = buildInsertBackPayload(target, reply, `AI ${activeMode.label}`)
    const response = await api<{ item?: Note }>(payload.endpoint, {
      method: "POST",
      body: JSON.stringify(payload.body),
    })
    if (payload.endpoint === "/api/notes" && response.item) setNotes?.((current) => [response.item as Note, ...current])
    setActionStatus(`Created ${payload.view} item from AI result.`)
    setView?.(payload.view)
  }

  async function organizeImport() {
    const importedText = importText.trim()
    if (!importedText) {
      setImportStatus("Paste learning material first.")
      return
    }
    setImportLoading(true)
    try {
      const response = await api<{ target: ImportTarget; item?: Note; note?: Note }>("/api/import", {
        method: "POST",
        body: JSON.stringify({
          text: importText,
          title: importTitle || undefined,
          target: importTarget,
        }),
      })
      if (response.target === "note" && (response.item || response.note)) {
        const note = (response.item || response.note) as Note
        setNotes?.((current) => [note, ...current])
      }
      setLastImport({ target: response.target, title: importPreview.title })
      setLastImportText(importedText)
      setSourceScope(resolveAiTutorSourceScopeAfterUpload({ currentScope: sourceScope, uploadedContextLength: importedText.length }))
      setImportText("")
      setImportTitle("")
      setImportStatus(`Created ${labelImportTarget(response.target)} in Studio. Uploaded files selected for AI.`)
    } finally {
      setImportLoading(false)
    }
  }

  function clearUploadedSource() {
    setImportText("")
    setImportTitle("")
    setLastImport(null)
    setLastImportText("")
    setSourceScope(resolveAiTutorSourceScopeAfterUpload({ currentScope: sourceScope, uploadedContextLength: 0 }))
    setImportStatus("Source cleared.")
  }

  function replaceImportText(nextText: string) {
    const uploadedContextLength = nextText.trim().length
    setImportText(nextText)
    setLastImport(null)
    setLastImportText("")
    setSourceScope(resolveAiTutorSourceScopeAfterUpload({ currentScope: sourceScope, uploadedContextLength }))
    if (uploadedContextLength) setImportStatus("")
  }

  async function copyReply() {
    if (!reply.trim()) return
    await navigator.clipboard?.writeText(reply)
    setActionStatus("Copied result.")
  }

  function prepareStudioBlockPrompt() {
    const instruction = "Return a Studio-ready block with title, summary, action steps, and review questions."
    setActiveTaskKey("document_formatter")
    setModeGroup("studio")
    setInsertTarget("doc-section")
    setOptions({ aiMode: "cleanup" })
    setMessage((current) => current.includes(instruction) ? current : `${current.trimEnd()}\n\n${instruction}`)
    setActionStatus("Studio block output selected.")
  }

  function chooseOutputLength(value: string) {
    setOutputLength(value)
    setOptions({ aiMaxTokens: getRecommendedAiTutorTokens(value) })
  }

  function useReplyAsPrompt(taskKey: AiTaskKey, instruction: string, target: StudioInsertTarget) {
    const nextMode = tutorModes.find((mode) => mode.id === taskKey)
    setActiveTaskKey(taskKey)
    setModeGroup(modeGroupForTask(taskKey))
    setInsertTarget(target)
    setSourceScope("Manual only")
    if (nextMode) setOptions({ aiMode: nextMode.mode as WorkspaceOptions["aiMode"] })
    setMessage(`${instruction}\n\n${reply}`)
    setActionStatus(`Loaded result into ${nextMode?.label || "AI"} with ${target} output.`)
  }

  function loadImportFollowup(kind: ImportFollowupKind) {
    if (!lastImport) return
    const action = buildImportFollowupAction({ kind, title: lastImport.title, target: lastImport.target })
    setActiveTaskKey(action.taskKey)
    setModeGroup(modeGroupForTask(action.taskKey))
    setOptions({ aiMode: action.legacyMode as WorkspaceOptions["aiMode"] })
    setSourceScope(action.sourceScope)
    setInsertTarget(action.insertTarget)
    setMessage(action.message)
    setSidePanel("gateway")
    setActionStatus(action.status)
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <Panel className="p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">AI tutor</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <StatusPill label={workflowSummary.statusLabel} tone={readinessTone(workflowSummary.status)} />
              <StatusPill label={workflowSummary.nextAction} />
              {draftStatus ? <StatusPill label={draftStatus} tone="steady" /> : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 self-start rounded-lg border border-border bg-background p-2 shadow-sm lg:justify-end">
            <TutorMenu label={`Task: ${activeMode.label}`} icon={activeMode.icon} menuId="task" openMenu={openTutorMenu} setOpenMenu={setOpenTutorMenu}>
              {tutorModeGroups.map((group) => (
                <div key={group.id} className="grid gap-1">
                  <ControlButton
                    onClick={() => setModeGroup(group.id)}
                    active={modeGroup === group.id}
                    className="mb-1 flex w-full justify-between"
                    size="compact"
                    type="button"
                  >
                    {group.label}
                    <span className="text-[0.66rem] opacity-70">{group.modes.length}</span>
                  </ControlButton>
                  {tutorModes
                    .filter((mode) => (group.modes as readonly string[]).includes(mode.id))
                    .map((item) => (
                      <TutorMenuAction
                        key={`${group.id}-${item.id}`}
                        active={activeMode.id === item.id}
                        icon={item.icon}
                        label={item.label}
                        meta={item.prompt}
                        onClick={() => {
                          setActiveTaskKey(item.id)
                          setModeGroup(modeGroupForTask(item.id))
                          setOptions({ aiMode: item.mode as WorkspaceOptions["aiMode"] })
                          setMessage(item.prompt)
                          setOpenTutorMenu(null)
                        }}
                      />
                    ))}
                </div>
              ))}
            </TutorMenu>
            <TutorMenu label="Filters" icon={SlidersHorizontal} menuId="filters" openMenu={openTutorMenu} setOpenMenu={setOpenTutorMenu}>
              <TutorMenuSection title="Context">
                <TutorMenuSelect label="Source" value={sourceScope} values={sourceScopes} onChange={setSourceScope} />
                <TutorMenuSelect label="Difficulty" value={difficulty} values={difficulties} onChange={setDifficulty} />
                <TutorMenuSelect label="Tone" value={tone} values={tones} onChange={setTone} />
                <TutorMenuSelect label="Length" value={outputLength} values={outputLengths} onChange={chooseOutputLength} />
                <TutorMenuSelect label="Language" value={language} values={languages} onChange={setLanguage} />
                <TutorMenuSelect label="Insert" value={insertTarget} values={availableInsertTargets} onChange={(value) => setInsertTarget(value as StudioInsertTarget)} />
                <TutorMenuToggle checked={options.aiIncludeNotes} label="Include recent notes" onChange={(checked) => setOptions({ aiIncludeNotes: checked })} />
              </TutorMenuSection>
            </TutorMenu>
            <TutorMenu label="Gateway" icon={Brain} align="right" menuId="gateway" openMenu={openTutorMenu} setOpenMenu={setOpenTutorMenu}>
              <TutorMenuSection title="Provider">
                <TutorMenuSelect
                  label="Family"
                  value={providerFamily}
                  values={["auto", ...catalog.map((item) => item.provider || item.id).filter(Boolean)]}
                  labels={{ auto: "Auto failover", ...Object.fromEntries(catalog.map((item) => [item.provider || item.id, item.label || item.provider || item.id])) }}
                  onChange={setProviderFamily}
                />
                <div className="grid gap-1">
                  <span className="text-xs font-semibold text-muted-foreground">Max tokens</span>
                  <div className="grid grid-cols-4 gap-1">
                    {tokenPresets.map((tokens) => (
                      <button key={tokens} onClick={() => setOptions({ aiMaxTokens: tokens })} className={`h-8 rounded-md border px-2 text-xs font-semibold ${options.aiMaxTokens === tokens ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground"}`} type="button">
                        {tokens}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
                  Creativity <span className="text-foreground">{options.aiTemperature.toFixed(2)}</span>
                  <input className="w-full accent-primary" type="range" min="0" max="1.2" step="0.05" value={options.aiTemperature} onChange={(event) => setOptions({ aiTemperature: Number(event.target.value) })} />
                </label>
              </TutorMenuSection>
            </TutorMenu>
          </div>
        </div>

        <div className="mt-3 h-px bg-border" />

        <div className="mt-4 grid gap-2 rounded-md border border-border bg-muted/40 p-2 text-xs font-semibold text-muted-foreground sm:grid-cols-2 xl:grid-cols-4">
          {workflowSummary.overview.map((item) => (
            <CompactState key={item.id} detail={item.detail} label={item.label} tone={item.tone} value={item.value} />
          ))}
        </div>

        <details className="mt-3 rounded-md border border-border bg-background text-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 font-semibold text-foreground [&::-webkit-details-marker]:hidden">
            <span>Review setup</span>
            <span className="flex flex-wrap items-center justify-end gap-1.5">
              <span className="rounded-md bg-secondary px-2 py-1 text-xs text-secondary-foreground">{gatewayReadiness.readyProviderCount} ready</span>
              <span className="rounded-md bg-secondary px-2 py-1 text-xs text-secondary-foreground">{promptBuild.ok ? "prompt ready" : `${promptBuild.missing.length} missing`}</span>
            </span>
          </summary>
          <div className="grid gap-3 border-t border-border p-3">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              {workflowSummary.cards.map((card) => (
                <WorkflowCard key={card.id} label={card.label} value={card.value} detail={card.detail} tone={card.tone} />
              ))}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm text-foreground">
                <span className="font-semibold">Audience</span>
                <input value={targetAudience} onChange={(event) => setTargetAudience(event.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-foreground outline-none focus:border-ring" />
              </label>
              <label className="grid gap-1 text-sm text-foreground">
                <span className="font-semibold">Requirements</span>
                <input value={requiredOutput} onChange={(event) => setRequiredOutput(event.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-foreground outline-none focus:border-ring" />
              </label>
              <details className="rounded-md border border-border bg-muted/40 p-3 text-sm md:col-span-2">
                <summary className="cursor-pointer font-semibold text-foreground">Prompt preview {promptBuild.ok ? "" : `- missing ${promptBuild.missing.length}`}</summary>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  <PreviewBlock title="Task" body={previewParts.task || activeMode.label} />
                  <PreviewBlock title="Output" body={previewParts.output || promptBuild.outputContract || "Structured learning response"} />
                  <PreviewBlock title="Requirements" body={previewParts.requirements.join("\n")} />
                  <PreviewBlock title="Warnings" body={previewParts.warnings.length ? previewParts.warnings.join("\n") : "None"} />
                </div>
                {promptBuild.warnings.length ? <p className="mt-2 rounded-md bg-destructive/10 px-2 py-1 text-xs font-semibold text-destructive">{promptBuild.warnings.join(" ")}</p> : null}
              </details>
              <div className={`rounded-md border p-3 md:col-span-2 ${gatewayReadiness.status === "ready" ? "border-success/50 bg-success/10" : gatewayReadiness.status === "warning" ? "border-warning/50 bg-warning/10" : "border-destructive/50 bg-destructive/10"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">{gatewayReadiness.label}</p>
                  <div className="flex flex-wrap gap-2 text-xs font-semibold">
                    <span className="rounded-md bg-background px-2 py-1 text-foreground">{gatewayReadiness.readyProviderCount} ready</span>
                    <span className="rounded-md bg-background px-2 py-1 text-foreground">{gatewayReadiness.selectedProviderCount} selected</span>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {gatewayReadiness.checks.map((check) => (
                    <span key={check} className="rounded-md bg-background px-2 py-1 text-xs font-medium text-muted-foreground">{check}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </details>

        <textarea value={message} onChange={(event) => setMessage(event.target.value)} className="mt-5 min-h-40 w-full rounded-md border border-input bg-background p-4 text-foreground outline-none focus:border-ring" />
        <div className="mt-3 flex flex-wrap gap-2">
          <button disabled={primaryActionPlan.disabled} onClick={runPrimaryAction} className="flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">
            <Bot className="h-4 w-4" />
            {primaryActionPlan.label}
          </button>
          <button onClick={prepareStudioBlockPrompt} className="flex h-10 items-center gap-2 rounded-md border border-border bg-secondary px-4 text-sm font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground">
            <Plus className="h-4 w-4" />
            Studio block
          </button>
          <button onClick={resetDraft} className="flex h-10 items-center gap-2 rounded-md border border-border bg-secondary px-4 text-sm font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground">
            Reset draft
          </button>
        </div>
        {reply ? (
          <div className="mt-5 rounded-md border border-border bg-muted p-4">
            <SectionLabel icon={CheckCircle2} title="Result" body="Send the output back into Studio, Practice, or Reviews without copying between pages." compact />
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <ResultAction label="Save as note" onClick={saveReplyAsNote} />
              <ResultAction label="Copy result" onClick={copyReply} />
              <ResultMenu label="Insert">
                {insertActions.map((action) => <ResultMenuAction key={action.target} label={action.label} onClick={() => insertReply(action.target)} />)}
              </ResultMenu>
              <ResultMenu label="Create">
                <ResultMenuAction label="Quiz prompt" onClick={() => useReplyAsPrompt("quiz_generation", "Turn this result into a mixed quiz with answers and explanations.", "quiz")} />
                <ResultMenuAction label="Flashcards" onClick={() => useReplyAsPrompt("flashcard_generation", "Turn this result into active-recall flashcards and matching pairs.", "flashcards")} />
                <ResultMenuAction label="Practice" onClick={() => useReplyAsPrompt("practice_generator", "Create targeted practice from this result with explanations and retry guidance.", "quiz")} />
                <ResultMenuAction label="Review cards" onClick={() => useReplyAsPrompt("flashcard_generation", "Create review cards from this result with active-recall prompts.", "review-cards")} />
                <ResultMenuAction label="Studio format" onClick={() => useReplyAsPrompt("document_formatter", "Format this result into clean Studio blocks with headings and next actions.", "doc-section")} />
              </ResultMenu>
            </div>
            {actionStatus ? <p className="mb-3 rounded-md bg-background px-3 py-2 text-xs font-semibold text-muted-foreground">{actionStatus}</p> : null}
            <div className="whitespace-pre-wrap leading-7 text-foreground">{reply}</div>
          </div>
        ) : null}
      </Panel>

      <Panel className="p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 font-semibold text-foreground"><Brain className="h-4 w-4 text-success" /> AI center</p>
          <button onClick={loadProviders} className="h-8 rounded-md border border-border bg-secondary px-3 text-xs font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground">
            Refresh
          </button>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1 rounded-md border border-border bg-background p-1">
          <SidePanelButton active={sidePanel === "gateway"} count={providerSummary.readyCount} icon={Brain} label="Gateway" onClick={() => setSidePanel("gateway")} />
          <SidePanelButton active={sidePanel === "import"} count={uploadedSourceSummary.badgeCount} icon={UploadCloud} label="Import" onClick={() => setSidePanel("import")} />
          <SidePanelButton active={sidePanel === "presets"} count={providerSummary.presetCount} icon={Gauge} label="Presets" onClick={() => setSidePanel("presets")} />
        </div>

        {sidePanel === "gateway" ? (
          <div className="mt-3">
            <div className="grid grid-cols-2 gap-2">
              <GatewayMetric label="Ready" value={String(providerSummary.readyCount)} tone={providerSummary.readyCount ? "ready" : "warning"} />
              <GatewayMetric label="Keys" value={String(providerSummary.configuredCount)} tone={providerSummary.configuredCount ? "ready" : "warning"} />
              <GatewayMetric label="Families" value={String(providerSummary.familyCount)} tone="neutral" />
              <GatewayMetric label="Presets" value={String(providerSummary.presetCount)} tone="neutral" />
            </div>
            <details className="mt-3 rounded-md border border-border bg-background p-3">
              <summary className="cursor-pointer text-sm font-semibold text-foreground">Provider details</summary>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">Keys stay masked. LEARN tries enabled providers by priority with failover.</p>
              <div className="mt-3 space-y-2">
                {providers.map((provider) => (
                  <div key={provider.id} className="rounded-md bg-muted p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-foreground">{provider.name}</p>
                      <span className="rounded bg-background px-2 py-0.5 text-xs text-muted-foreground">P{provider.priority}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <span className="rounded bg-background px-2 py-0.5 text-muted-foreground">{provider.provider}</span>
                      <span className="rounded bg-background px-2 py-0.5 text-muted-foreground">{provider.default_model}</span>
                      <StatusPill label={providerStatusLabel(provider)} tone={providerIsReady(provider) ? "steady" : "watch"} />
                    </div>
                  </div>
                ))}
                {!providers.length ? <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">Refresh to load admin provider status.</p> : null}
              </div>
            </details>
          </div>
        ) : null}

        {sidePanel === "import" ? (
          <div className="mt-3 grid gap-2">
            <div className={`rounded-md border p-3 text-xs ${uploadedSourceSummary.attached ? "border-success/40 bg-success/10 text-foreground" : "border-border bg-background text-muted-foreground"}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-foreground">{uploadedSourceSummary.label}</span>
                <span className="rounded-md bg-background px-2 py-1 font-semibold text-muted-foreground">{uploadedSourceSummary.detail}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span>{uploadedSourceSummary.attached ? "AI will include this when Uploaded files is selected." : "Use this for cleanup, practice, flashcards, and summaries."}</span>
                {uploadedSourceSummary.attached ? (
                  <button onClick={clearUploadedSource} className="rounded-md border border-border bg-secondary px-2 py-1 font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground" type="button">
                    Clear
                  </button>
                ) : null}
              </div>
            </div>
            <input
              value={importTitle}
              onChange={(event) => {
                setImportTitle(event.target.value)
                setLastImport(null)
              }}
              placeholder="Optional title"
              className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus:border-ring"
            />
            <select value={importTarget} onChange={(event) => {
              setImportTarget(event.target.value as ImportTarget | "auto")
              setLastImport(null)
            }} className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground">
              {importTargets.map((target) => <option key={target} value={target}>{labelImportTarget(target)}</option>)}
            </select>
            <textarea
              value={importText}
              onChange={(event) => replaceImportText(event.target.value)}
              placeholder="Paste text, CSV, or slide outline"
              className="min-h-36 rounded-md border border-input bg-background p-3 text-sm text-foreground outline-none focus:border-ring"
            />
            <div className={`rounded-md border p-3 text-xs ${importPreview.ok ? "border-border bg-background text-muted-foreground" : "border-warning/50 bg-warning/10 text-foreground"}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-foreground">{labelImportTarget(importPreview.target)} preview</span>
                <span className="rounded-md bg-secondary px-2 py-1 font-semibold text-secondary-foreground">{importPreview.confidence}</span>
              </div>
              <p className="mt-2">{importPreview.title} - {importPreview.itemLabel} - opens {importPreview.destinationView}</p>
              {importPreview.warnings.length ? <p className="mt-2 text-warning-foreground">{importPreview.warnings.join(" ")}</p> : null}
            </div>
            <button onClick={organizeImport} disabled={importLoading || !importPreview.ok} className="h-9 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60">
              {importLoading ? "Organizing" : "Organize into Studio"}
            </button>
            {importStatus ? <p className="rounded-md bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground">{importStatus}</p> : null}
            {lastImport ? (
              <div className="grid gap-2 sm:grid-cols-4">
                <button onClick={() => setView?.(viewForImportTarget(lastImport.target))} className="rounded-md border border-border bg-secondary px-3 py-2 text-xs font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground">Open {viewForImportTarget(lastImport.target)}</button>
                <button onClick={() => loadImportFollowup("cleanup")} className="rounded-md border border-border bg-secondary px-3 py-2 text-xs font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground">Clean up</button>
                <button onClick={() => loadImportFollowup("practice")} className="rounded-md border border-border bg-secondary px-3 py-2 text-xs font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground">Practice</button>
                <button onClick={() => loadImportFollowup("flashcards")} className="rounded-md border border-border bg-secondary px-3 py-2 text-xs font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground">Flashcards</button>
              </div>
            ) : null}
          </div>
        ) : null}

        {sidePanel === "presets" ? (
          <div className="mt-3">
            <div className="grid gap-2">
              {presets.slice(0, 8).map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => {
                    setProviderFamily(preset.provider || "auto")
                    if (preset.max_tokens) setOptions({ aiMaxTokens: preset.max_tokens })
                  }}
                  className="rounded-md border border-border bg-background p-3 text-left text-xs hover:bg-accent hover:text-accent-foreground"
                  type="button"
                >
                  <p className="font-semibold text-foreground">{preset.label}</p>
                  <p className="mt-1 truncate text-muted-foreground">{preset.model}</p>
                </button>
              ))}
              {!presets.length ? <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">Refresh to load provider presets.</p> : null}
            </div>
            {catalog.length ? <p className="mt-3 text-xs text-muted-foreground">{catalog.length} provider families available.</p> : null}
          </div>
        ) : null}
      </Panel>
    </div>
  )
}

function SidePanelButton({
  active,
  count,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean
  count: number
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex min-w-0 items-center justify-center gap-1.5 rounded px-2 py-2 text-xs font-semibold transition ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"}`}
      type="button"
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{label}</span>
      <span className={active ? "text-primary-foreground/80" : "text-muted-foreground"}>{count}</span>
    </button>
  )
}

function CompactState({
  detail,
  label,
  tone,
  value,
}: {
  detail: string
  label: string
  tone: "good" | "watch" | "blocked" | "neutral"
  value: string
}) {
  const uiTone = workflowTone(tone)
  return (
    <div className={`group relative min-w-0 rounded-md border px-3 py-2 ${statusToneClasses(uiTone)}`}>
      <p className="text-[0.66rem] uppercase tracking-[0.12em]">{label}</p>
      <p className="mt-0.5 truncate text-sm text-foreground">{value}</p>
      <p className="pointer-events-none absolute left-2 right-2 top-[calc(100%+0.35rem)] z-30 hidden rounded-md border border-border bg-popover p-2 text-xs leading-5 text-popover-foreground shadow-lg group-hover:block">{detail}</p>
    </div>
  )
}

function TutorMenu({
  align = "left",
  children,
  icon: Icon,
  label,
  menuId,
  openMenu,
  setOpenMenu,
}: {
  align?: "left" | "right"
  children: React.ReactNode
  icon: React.ComponentType<{ className?: string }>
  label: string
  menuId: TutorMenuId
  openMenu: TutorMenuId | null
  setOpenMenu: (menuId: TutorMenuId | null) => void
}) {
  const open = openMenu === menuId
  return (
    <div className="relative inline-block">
      <ControlButton
        aria-expanded={open}
        onClick={() => setOpenMenu(open ? null : menuId)}
        size="compact"
        title={label}
        type="button"
      >
        <Icon className="h-3.5 w-3.5" />
        <span className="max-w-40 truncate">{label}</span>
        <ChevronDown className="h-3.5 w-3.5 opacity-70" />
      </ControlButton>
      {open ? (
        <div className={`absolute top-10 z-40 max-h-[min(34rem,calc(100vh-8rem))] w-80 overflow-y-auto ${menuSurfaceClasses()} ${align === "right" ? "right-0" : "left-0"}`}>
          {children}
        </div>
      ) : null}
    </div>
  )
}

function TutorMenuSection({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <div className="grid gap-2">
      <p className="px-1 text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{title}</p>
      {children}
    </div>
  )
}

function TutorMenuAction({
  active,
  icon: Icon,
  label,
  meta,
  onClick,
}: {
  active?: boolean
  icon: React.ComponentType<{ className?: string }>
  label: string
  meta?: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm font-semibold ${
        active ? "bg-primary text-primary-foreground" : "text-popover-foreground hover:bg-accent hover:text-accent-foreground"
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

function TutorMenuSelect({
  label,
  labels,
  onChange,
  value,
  values,
}: {
  label: string
  labels?: Record<string, string>
  onChange: (value: string) => void
  value: string
  values: string[]
}) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground">
        {values.map((item) => <option key={item} value={item}>{labels?.[item] || item}</option>)}
      </select>
    </label>
  )
}

function TutorMenuToggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground">
      {label}
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  )
}

function readAiTutorDraft(): AiTutorDraft | null {
  if (typeof window === "undefined") return null
  try {
    const stored = window.localStorage.getItem(AI_TUTOR_DRAFT_KEY)
    return stored ? JSON.parse(stored) as AiTutorDraft : null
  } catch {
    return null
  }
}

function writeAiTutorDraft(draft: AiTutorDraft) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(AI_TUTOR_DRAFT_KEY, JSON.stringify(draft))
}

function clearAiTutorDraft() {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(AI_TUTOR_DRAFT_KEY)
}

function normalizeChoice(value: string, options: string[], fallback: string) {
  return options.includes(value) ? value : fallback
}

function modeGroupForTask(taskId: string): TutorModeGroupId {
  return tutorModeGroups.find((group) => group.id !== "all" && (group.modes as readonly string[]).includes(taskId))?.id ?? "all"
}

function labelImportTarget(target: ImportTarget | "auto") {
  if (target === "auto") return "Auto detect"
  if (target === "doc") return "Document"
  if (target === "sheet") return "Sheet"
  if (target === "slides") return "Slides"
  return "Note"
}

function viewForImportTarget(target: ImportTarget): View {
  if (target === "doc") return "docs"
  if (target === "sheet") return "sheets"
  if (target === "slides") return "slides"
  return "notes"
}

function buildPromptFields(message: string, recentContext: string, targetAudience: string, requiredOutput: string, difficulty: string, tone: string, outputLength: string, language: string) {
  const source = [message, recentContext].filter(Boolean).join("\n\n")
  return {
    input: source,
    context: source,
    blocks: source,
    page: source,
    node: message,
    graph: recentContext,
    answers: message,
    question: message,
    selectedAnswer: message,
    correctAnswer: "Use source material to identify the correct answer.",
    goals: message,
    goal: requiredOutput,
    purpose: requiredOutput,
    task: message,
    source,
    profile: targetAudience,
    preferences: targetAudience,
    audience: targetAudience,
    columns: "Topic, Status, Evidence, Next step",
    sections: "Summary, Key ideas, Examples, Practice",
    editGoal: requiredOutput,
    style: `${tone}, ${outputLength}, ${language}`,
    metricFocus: "Accuracy, progress, weak topics, review urgency",
    requiredOutput,
    count: 8,
    slideCount: 6,
    mode: "mixed",
    weakTopics: "Use recent notes and missed practice when available.",
    availableTime: "25 minutes per day",
    difficulty,
    constraints: requiredOutput,
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function ResultAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <ControlButton onClick={onClick} size="compact">
      {label}
    </ControlButton>
  )
}

function ResultMenu({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <details className="group relative inline-block">
      <summary className="flex h-9 cursor-pointer list-none items-center gap-2 rounded-md border border-border bg-secondary px-3 text-xs font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground [&::-webkit-details-marker]:hidden">
        <MoreHorizontal className="h-3.5 w-3.5" />
        {label}
      </summary>
      <div className={`absolute left-0 top-10 z-40 w-56 ${menuSurfaceClasses()}`}>
        {children}
      </div>
    </details>
  )
}

function ResultMenuAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      className="flex w-full rounded-md px-2 py-2 text-left text-sm font-semibold text-popover-foreground hover:bg-accent hover:text-accent-foreground"
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  )
}

function GatewayMetric({ label, tone, value }: { label: string; tone: "ready" | "warning" | "neutral"; value: string }) {
  const uiTone = readinessTone(tone)
  return (
    <div className={`rounded-md border p-3 ${statusToneClasses(uiTone)}`}>
      <p className="text-[0.66rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${toneTextClasses(uiTone)}`}>{value}</p>
    </div>
  )
}

function providerIsReady(provider: { enabled?: boolean; has_key?: boolean; last_status?: string }) {
  return Boolean(provider.enabled && provider.has_key && provider.last_status !== "error")
}

function providerStatusLabel(provider: { has_key?: boolean; last_status?: string }) {
  if (!provider.has_key) return "Missing key"
  return provider.last_status === "error" ? "Error" : provider.last_status || "Untested"
}

function readinessTone(tone: "ready" | "warning" | "blocked" | "neutral"): UiTone {
  if (tone === "ready") return "steady"
  if (tone === "blocked") return "critical"
  if (tone === "warning") return "watch"
  return "neutral"
}

function workflowTone(tone: "good" | "watch" | "blocked" | "neutral"): UiTone {
  if (tone === "good") return "steady"
  if (tone === "blocked") return "critical"
  if (tone === "watch") return "watch"
  return "neutral"
}

function WorkflowCard({ detail, label, tone, value }: { detail: string; label: string; tone: "good" | "watch" | "blocked" | "neutral"; value: string }) {
  const Icon = tone === "blocked" ? AlertTriangle : tone === "good" ? CheckCircle2 : Info
  const uiTone = workflowTone(tone)
  return (
    <div className={`group relative rounded-md border p-3 ${statusToneClasses(uiTone)}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="mt-2 truncate text-sm font-semibold text-foreground">{value}</p>
      <p className="pointer-events-none absolute left-2 right-2 top-[calc(100%+0.35rem)] z-30 hidden rounded-md border border-border bg-popover p-2 text-xs leading-5 text-popover-foreground shadow-lg group-hover:block">{detail}</p>
    </div>
  )
}

function SectionLabel({ body, compact, icon: Icon, title }: { body: string; compact?: boolean; icon: React.ComponentType<{ className?: string }>; title: string }) {
  return (
    <div className={`${compact ? "mb-3" : "mt-5"} flex items-center justify-between gap-3`}>
      <div className="flex min-w-0 items-center gap-2">
        <Icon className="h-4 w-4 text-success" />
        <p className="font-semibold text-foreground">{title}</p>
      </div>
      <details className="relative">
        <summary className="flex h-7 w-7 list-none items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground" aria-label={`About ${title}`}>
          <Info className="h-3.5 w-3.5" />
        </summary>
        <p className="absolute right-0 top-9 z-30 w-64 rounded-md border border-border bg-popover p-3 text-xs leading-5 text-popover-foreground shadow-xl">{body}</p>
      </details>
    </div>
  )
}

function PreviewBlock({ body, title }: { body: string; title: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{title}</p>
      <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{body || "None"}</pre>
    </div>
  )
}
