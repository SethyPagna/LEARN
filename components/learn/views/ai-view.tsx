"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Bot, Brain, CheckSquare, FileText, Gauge, Languages, ListFilter, Plus, Route, Settings2, Sparkles, UploadCloud, Wand2 } from "lucide-react"
import type { WorkspaceOptions } from "../preferences"
import type { Note, StudioInsertTarget, View } from "../types"
import { api } from "../api"
import { Panel } from "../ui"
import { buildAiGatewayReadiness } from "@/lib/ai/gateway-readiness"
import { buildGuidedPrompt, listInsertActions, promptContracts } from "@/lib/ai/prompt-builder"
import { buildInsertBackPayload } from "@/lib/ai/insert-back"
import type { AiTaskKey } from "@/lib/ai/prompt-library"
import type { ImportTarget } from "@/lib/import-gateway"

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
const outputLengths = ["Short", "Balanced", "Deep"]
const languages = ["English", "Khmer", "French", "Spanish", "Korean", "Japanese", "Chinese"]
const insertTargets: StudioInsertTarget[] = ["note-block", "doc-section", "sheet-rows", "slide-outline", "quiz", "flashcards", "review-cards", "ai-note"]
const importTargets: Array<ImportTarget | "auto"> = ["auto", "note", "doc", "sheet", "slides"]
const AI_TUTOR_DRAFT_KEY = "learn_ai_tutor_draft_v1"
const DEFAULT_AI_MESSAGE = "Create a study plan from my recent notes."

type AiTutorDraft = {
  message: string
  reply: string
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
  const draftHydrated = useRef(false)
  const draftStatusTimer = useRef<number | null>(null)

  const activeMode = useMemo(() => tutorModes.find((mode) => mode.id === activeTaskKey) || tutorModes[0], [activeTaskKey])
  const recentContext = useMemo(() => notes.slice(0, 5).map((note) => `${note.title}: ${note.content}`).join("\n\n"), [notes])
  const promptActions = useMemo(() => tutorModes.map((mode) => ({
    ...mode,
    body: `${mode.label} - ${mode.prompt}`,
  })), [])
  const activeContract = useMemo(() => promptContracts.find((contract) => contract.mode === activeMode.id), [activeMode.id])
  const availableInsertTargets = useMemo(() => activeContract?.insertTargets || insertTargets, [activeContract?.insertTargets])
  const insertActions = useMemo(() => listInsertActions(availableInsertTargets), [availableInsertTargets])
  const promptBuild = useMemo(() => buildGuidedPrompt({
    taskKey: activeMode.id as AiTaskKey,
    fields: buildPromptFields(message, recentContext, targetAudience, requiredOutput, difficulty, tone, outputLength, language),
    filters: { sourceScope, difficulty, tone, language, outputLength, providerFamily, insertTarget },
  }), [activeMode.id, difficulty, insertTarget, language, message, outputLength, providerFamily, recentContext, requiredOutput, sourceScope, targetAudience, tone])
  const gatewayReadiness = useMemo(() => buildAiGatewayReadiness({
    prompt: promptBuild,
    providers,
    providerFamily,
  }), [promptBuild, providerFamily, providers])

  useEffect(() => {
    if (!availableInsertTargets.includes(insertTarget)) setInsertTarget(availableInsertTargets[0] || "ai-note")
  }, [availableInsertTargets, insertTarget])

  useEffect(() => {
    const draft = readAiTutorDraft()
    if (draft) {
      setMessage(draft.message || DEFAULT_AI_MESSAGE)
      setReply(draft.reply || "")
      setSourceScope(normalizeChoice(draft.sourceScope, sourceScopes, sourceScopes[0]))
      setDifficulty(normalizeChoice(draft.difficulty, difficulties, difficulties[0]))
      setTone(normalizeChoice(draft.tone, tones, tones[0]))
      setOutputLength(normalizeChoice(draft.outputLength, outputLengths, outputLengths[1]))
      setLanguage(normalizeChoice(draft.language, languages, languages[0]))
      setProviderFamily(draft.providerFamily || "auto")
      setInsertTarget(insertTargets.includes(draft.insertTarget) ? draft.insertTarget : "ai-note")
      setTargetAudience(draft.targetAudience || "Self-directed learner")
      setRequiredOutput(draft.requiredOutput || "Clear sections, compact examples, and one next action.")
      if (tutorModes.some((mode) => mode.id === draft.activeTaskKey)) setActiveTaskKey(draft.activeTaskKey)
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
  }, [activeTaskKey, difficulty, insertTarget, language, message, outputLength, providerFamily, reply, sourceScope, targetAudience, requiredOutput, tone])

  function resetDraft() {
    setMessage(DEFAULT_AI_MESSAGE)
    setReply("")
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
        providerFamily !== "auto" ? `Preferred provider family: ${providerFamily}` : "",
        options.aiIncludeNotes && sourceScope !== "Manual only" ? recentContext : "",
      ].filter(Boolean)
      const response = await api<any>("/api/ai/chat", {
        method: "POST",
        body: JSON.stringify({
          message: promptBuild.user,
          context: [promptBuild.system, contextParts.join("\n\n")].join("\n\n"),
          mode: activeMode.mode,
          temperature: options.aiTemperature,
          maxTokens: options.aiMaxTokens,
        }),
      })
      setReply(response.text)
      setActionStatus("")
    } finally {
      setLoading(false)
    }
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
    if (!importText.trim()) {
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
      setImportText("")
      setImportTitle("")
      setImportStatus(`Created ${labelImportTarget(response.target)} in Studio.`)
      setView?.(viewForImportTarget(response.target))
    } finally {
      setImportLoading(false)
    }
  }

  async function copyReply() {
    if (!reply.trim()) return
    await navigator.clipboard?.writeText(reply)
    setActionStatus("Copied result.")
  }

  function useReplyAsPrompt(mode: WorkspaceOptions["aiMode"], instruction: string) {
    setOptions({ aiMode: mode })
    setMessage(`${instruction}\n\n${reply}`)
    setActionStatus("Loaded result into the prompt.")
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <Panel className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">AI tutor</h2>
            <p className="mt-2 text-sm text-muted-foreground">{draftStatus || "Choose a task, filter the context, then insert the result back into your learning loop."}</p>
          </div>
          <div className="flex flex-wrap rounded-md border border-border bg-secondary p-1">
            {tutorModes.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTaskKey(item.id)
                    setOptions({ aiMode: item.mode as WorkspaceOptions["aiMode"] })
                    setMessage(item.prompt)
                  }}
                  className={`flex h-8 items-center gap-1.5 rounded px-2 text-xs font-medium ${activeMode.id === item.id ? "bg-primary text-primary-foreground" : "text-secondary-foreground hover:bg-accent hover:text-accent-foreground"}`}
                  title={item.prompt}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {promptActions.slice(0, 6).map((prompt) => {
            const Icon = prompt.icon
            return (
              <button key={prompt.id} onClick={() => { setActiveTaskKey(prompt.id); setOptions({ aiMode: prompt.mode as WorkspaceOptions["aiMode"] }); setMessage(prompt.prompt) }} className="rounded-md border border-border bg-secondary p-3 text-left text-sm text-secondary-foreground hover:bg-accent hover:text-accent-foreground">
                <Icon className="mb-2 h-4 w-4 text-success" />
                {prompt.body}
              </button>
            )
          })}
        </div>

        <div className="mt-4 grid gap-3 rounded-md border border-border bg-muted/40 p-3 md:grid-cols-3">
          <SelectControl label="Source" value={sourceScope} values={sourceScopes} onChange={setSourceScope} icon={ListFilter} />
          <SelectControl label="Difficulty" value={difficulty} values={difficulties} onChange={setDifficulty} icon={Gauge} />
          <SelectControl label="Tone" value={tone} values={tones} onChange={setTone} icon={Settings2} />
          <SelectControl label="Length" value={outputLength} values={outputLengths} onChange={setOutputLength} icon={FileText} />
          <SelectControl label="Language" value={language} values={languages} onChange={setLanguage} icon={Languages} />
          <SelectControl label="Insert" value={insertTarget} values={availableInsertTargets} onChange={(value) => setInsertTarget(value as StudioInsertTarget)} icon={Plus} />
          <label className="grid gap-1 text-sm text-foreground">
            <span className="flex items-center gap-2 font-semibold"><Brain className="h-4 w-4" /> Provider</span>
            <select value={providerFamily} onChange={(event) => setProviderFamily(event.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-foreground">
              <option value="auto">Auto failover</option>
              {catalog.map((item) => <option key={item.id || item.provider} value={item.provider || item.id}>{item.label || item.provider}</option>)}
            </select>
          </label>
          <label className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground md:col-span-3">
            <span className="flex items-center gap-2"><Settings2 className="h-4 w-4" /> Include recent notes</span>
            <input type="checkbox" checked={options.aiIncludeNotes} onChange={(event) => setOptions({ aiIncludeNotes: event.target.checked })} />
          </label>
        </div>

        <div className="mt-4 grid gap-3 rounded-md border border-border bg-background p-3 md:grid-cols-2">
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
            <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{promptBuild.preview}</pre>
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

        <div className="mt-4 grid gap-3 rounded-md border border-border bg-background p-3 md:grid-cols-[1fr_180px]">
          <label className="text-sm text-foreground">
            Creativity
            <input className="mt-2 w-full accent-primary" type="range" min="0" max="1.2" step="0.05" value={options.aiTemperature} onChange={(event) => setOptions({ aiTemperature: Number(event.target.value) })} />
            <span className="text-xs text-muted-foreground">{options.aiTemperature.toFixed(2)}</span>
          </label>
          <label className="text-sm text-foreground">
            Max tokens
            <input className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-foreground" type="number" min="128" max="8192" step="128" value={options.aiMaxTokens} onChange={(event) => setOptions({ aiMaxTokens: Number(event.target.value) })} />
          </label>
        </div>

        <textarea value={message} onChange={(event) => setMessage(event.target.value)} className="mt-5 min-h-40 w-full rounded-md border border-input bg-background p-4 text-foreground outline-none focus:border-ring" />
        <div className="mt-3 flex flex-wrap gap-2">
          <button disabled={gatewayReadiness.status === "blocked" || loading} onClick={ask} className="flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">
            <Bot className="h-4 w-4" />
            {loading ? "Thinking" : "Run tutor"}
          </button>
          <button onClick={() => setMessage(`${message}\n\nReturn a Studio-ready block with title, summary, action steps, and review questions.`)} className="flex h-10 items-center gap-2 rounded-md border border-border bg-secondary px-4 text-sm font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground">
            <Plus className="h-4 w-4" />
            Studio block
          </button>
          <button onClick={resetDraft} className="flex h-10 items-center gap-2 rounded-md border border-border bg-secondary px-4 text-sm font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground">
            Reset draft
          </button>
        </div>
        {reply ? (
          <div className="mt-5 rounded-md border border-border bg-muted p-4">
            <div className="mb-3 flex flex-wrap gap-2">
              <ResultAction label="Save as note" onClick={saveReplyAsNote} />
              <ResultAction label="Copy result" onClick={copyReply} />
              <ResultAction label="Quiz prompt" onClick={() => useReplyAsPrompt("quiz", "Turn this result into a mixed quiz with answers and explanations.")} />
              <ResultAction label="Flashcards" onClick={() => useReplyAsPrompt("flashcards", "Turn this result into active-recall flashcards and matching pairs.")} />
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
              {insertActions.map((action) => <ResultAction key={action.target} label={action.label} onClick={() => insertReply(action.target)} />)}
            </div>
            {actionStatus ? <p className="mb-3 rounded-md bg-background px-3 py-2 text-xs font-semibold text-muted-foreground">{actionStatus}</p> : null}
            <div className="whitespace-pre-wrap leading-7 text-foreground">{reply}</div>
          </div>
        ) : null}
      </Panel>

      <Panel className="p-4">
        <p className="font-semibold text-foreground">AI provider routing</p>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Enabled encrypted D1 provider configs are tried first by priority. Runtime secrets remain masked and outside git.
        </p>
        <button onClick={loadProviders} className="mt-4 h-9 rounded-md border border-border bg-secondary px-3 text-sm font-medium text-secondary-foreground hover:bg-accent hover:text-accent-foreground">
          Load providers
        </button>
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
                <span className={`rounded px-2 py-0.5 font-semibold ${provider.enabled && provider.has_key && provider.last_status !== "error" ? "bg-success text-success-foreground" : "bg-warning text-warning-foreground"}`}>
                  {provider.enabled && provider.has_key && provider.last_status !== "error" ? "Ready" : provider.has_key ? provider.last_status || "Untested" : "Missing key"}
                </span>
              </div>
            </div>
          ))}
          {!providers.length ? <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">Admin providers appear here after loading.</p> : null}
        </div>
        <div className="mt-4 border-t border-border pt-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground"><Gauge className="h-4 w-4" /> Presets</p>
          <div className="mt-2 space-y-2">
            {presets.slice(0, 6).map((preset) => (
              <div key={preset.id} className="rounded-md border border-border p-2 text-xs">
                <p className="font-medium text-foreground">{preset.label}</p>
                <p className="text-muted-foreground">{preset.model}</p>
              </div>
            ))}
          </div>
          {catalog.length ? <p className="mt-3 text-xs text-muted-foreground">{catalog.length} provider families available.</p> : null}
        </div>
        <div className="mt-4 border-t border-border pt-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground"><UploadCloud className="h-4 w-4" /> Import gateway</p>
          <div className="mt-3 grid gap-2">
            <input
              value={importTitle}
              onChange={(event) => setImportTitle(event.target.value)}
              placeholder="Optional title"
              className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus:border-ring"
            />
            <select value={importTarget} onChange={(event) => setImportTarget(event.target.value as ImportTarget | "auto")} className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground">
              {importTargets.map((target) => <option key={target} value={target}>{labelImportTarget(target)}</option>)}
            </select>
            <textarea
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              placeholder="Paste text, CSV, or slide outline"
              className="min-h-28 rounded-md border border-input bg-background p-3 text-sm text-foreground outline-none focus:border-ring"
            />
            <button onClick={organizeImport} disabled={importLoading} className="h-9 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60">
              {importLoading ? "Organizing" : "Organize into Studio"}
            </button>
            {importStatus ? <p className="rounded-md bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground">{importStatus}</p> : null}
          </div>
        </div>
      </Panel>
    </div>
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
    <button onClick={onClick} className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent hover:text-accent-foreground">
      {label}
    </button>
  )
}

function SelectControl({ icon: Icon, label, onChange, value, values }: { icon: React.ComponentType<{ className?: string }>; label: string; onChange: (value: string) => void; value: string; values: string[] }) {
  return (
    <label className="grid gap-1 text-sm text-foreground">
      <span className="flex items-center gap-2 font-semibold"><Icon className="h-4 w-4" /> {label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-foreground">
        {values.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
    </label>
  )
}
