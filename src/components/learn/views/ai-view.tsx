"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Bot, Brain, CheckCircle2, CheckSquare, ChevronDown, Copy, FileText, Gauge, Info, Languages, ListFilter, MoreHorizontal, Plus, RotateCcw, Route, Save, Sparkles, UploadCloud, Wand2 } from "lucide-react"
import type { WorkspaceOptions } from "../preferences"
import type { Note, Quiz, StudioInsertTarget, View } from "../types"
import { api } from "../api"
import { useEditorExitGuard } from "../editor-navigation"
import { AiBlockRenderer } from "../ai-block-renderer"
import { Popover } from "../design/popover"
import { ControlButton, Panel, StatusPill } from "../ui"
import { VoiceInput } from "../voice-input"
import { controlButtonClasses, statusToneClasses, toneTextClasses, type UiTone } from "@/lib/design-system"
import { formatAiResponse } from "@/lib/ai/format-response"
import { buildAiGatewayReadiness, isProviderReady, type AiGatewayProviderCatalogItem, type AiGatewayProviderPresetItem, type AiGatewayProviderStatus } from "@/lib/ai/gateway-readiness"
import { buildGuidedPrompt, listInsertActions, normalizeStudioInsertTarget, promptContracts, studioInsertTargets, type GuidedPromptResult } from "@/lib/ai/prompt-builder"
import { buildInsertBackPayload } from "@/lib/ai/insert-back"
import { assessmentOutputInstruction } from "@/lib/ai/assessment-output"
import { workflowOutputInstruction } from "@/lib/ai/workflow-destinations"
import { AI_TUTOR_DRAFT_KEY, archiveAiTutorDraft, parseStoredAiTutorDraft, parseStoredAiTutorLaunchPreset, persistAiTutorDraft, readPreviousAiTutorDraft, type AiTutorDraft } from "@/lib/ai/tutor-drafts"
import {
  aiTutorDifficulties,
  aiTutorLanguages,
  aiTutorModeOptions,
  aiTutorOutputLengths,
  aiTutorSourceScopes,
  aiTutorTokenPresets,
  aiTutorTones,
  AI_TUTOR_LAUNCH_KEY,
  buildAiTutorPrimaryActionPlan,
  buildAiTutorSourceContext,
  getAiTutorModeGroupForTask,
  getAiTutorModeOption,
  getRecommendedAiTutorTokens,
  resolveAiTutorEffectiveTokens,
  resolveAiTutorSourceScopeAfterUpload,
  summarizeAiTutorUploadedSource,
  summarizeAiTutorWorkflow,
  type AiTutorLaunchPreset,
  type AiTutorModeGroupId,
  visibleAiTutorModeGroups,
} from "@/lib/ai/tutor-workflow"
import type { AiTaskKey } from "@/lib/ai/prompt-library"
import { buildImportFollowupAction, getImportDestinationView, importTargetOptions, labelImportTarget, normalizeImportTargetSelection, previewImportedLearningContent, type ImportFollowupKind, type ImportTarget, type ImportTargetSelection } from "@/lib/import-gateway"

const tutorModeIcons: Record<AiTaskKey, React.ComponentType<{ className?: string }>> = {
  source_explanation: Brain,
  answer_explanation: Sparkles,
  note_design: Wand2,
  quiz_generation: CheckSquare,
  flashcard_generation: Brain,
  study_plan: Route,
  document_formatter: FileText,
  document_editor: FileText,
  sheet_organizer: ListFilter,
  sheet_formula_builder: ListFilter,
  slide_builder: Sparkles,
  slide_design_director: Sparkles,
  practice_generator: Gauge,
  personalized_prompt: Bot,
  translation: Languages,
  question_import: UploadCloud,
  answer_normalization: CheckSquare,
  content_beautification: Wand2,
  provider_health_check: Gauge,
  provider_failover_review: Gauge,
  daily_spark: Sparkles,
  graph_edge_suggestion: Route,
}

const DEFAULT_AI_MESSAGE = "Create a study plan from my recent notes."
type TutorMenuId = "task" | "options" | "draft" | "result-insert" | "result-create"
type AiTutorProviderStatus = AiGatewayProviderStatus & { id?: string }
type AiTutorProviderCatalogItem = AiGatewayProviderCatalogItem & { id?: string }
type AiTutorProviderPresetItem = AiGatewayProviderPresetItem & { max_tokens?: number }
type AiTutorChatResponse = {
  chatId?: string
  model?: string | null
  provider?: string | null
  status: "ok" | "setup_required" | "error" | string
  text: string
}

export function AiTutorView({
  userId,
  notes,
  options,
  setNotes,
  setQuizzes,
  setOptions,
  setView,
}: {
  userId?: string
  notes: Note[]
  options: WorkspaceOptions
  setNotes?: (updater: (current: Note[]) => Note[]) => void
  setQuizzes?: (updater: (current: Quiz[]) => Quiz[]) => void
  setOptions: (options: Partial<WorkspaceOptions>) => void
  setView?: (view: View) => void
}) {
  const [message, setMessage] = useState(DEFAULT_AI_MESSAGE)
  const [reply, setReply] = useState("")
  const [draftStatus, setDraftStatus] = useState("")
  const [actionStatus, setActionStatus] = useState("")
  const [loading, setLoading] = useState(false)
  const [providers, setProviders] = useState<AiTutorProviderStatus[]>([])
  const [catalog, setCatalog] = useState<AiTutorProviderCatalogItem[]>([])
  const [presets, setPresets] = useState<AiTutorProviderPresetItem[]>([])
  const [importText, setImportText] = useState("")
  const [importTitle, setImportTitle] = useState("")
  const [importTarget, setImportTarget] = useState<ImportTargetSelection>("auto")
  const [importStatus, setImportStatus] = useState("")
  const [importLoading, setImportLoading] = useState(false)
  const [lastImport, setLastImport] = useState<{ target: ImportTarget; title: string } | null>(null)
  const [lastImportText, setLastImportText] = useState("")
  const [sourceScope, setSourceScope] = useState(aiTutorSourceScopes[0])
  const [sourceTitle, setSourceTitle] = useState("")
  const [sourceContent, setSourceContent] = useState("")
  const [difficulty, setDifficulty] = useState(aiTutorDifficulties[0])
  const [tone, setTone] = useState(aiTutorTones[0])
  const [outputLength, setOutputLength] = useState(aiTutorOutputLengths[1])
  const [language, setLanguage] = useState(aiTutorLanguages[0])
  const [providerFamily, setProviderFamily] = useState("auto")
  const [insertTarget, setInsertTarget] = useState<StudioInsertTarget>("ai-note")
  const [targetAudience, setTargetAudience] = useState("Self-directed learner")
  const [requiredOutput, setRequiredOutput] = useState("Clear sections, compact examples, and one next action.")
  const [activeTaskKey, setActiveTaskKey] = useState(aiTutorModeOptions[0].id)
  const [, setModeGroup] = useState<AiTutorModeGroupId>("tutor")
  const [openTutorMenu, setOpenTutorMenu] = useState<TutorMenuId | null>(null)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [sidePanel, setSidePanel] = useState<"gateway" | "import" | "presets">("gateway")
  const draftHydrated = useRef(false)
  const draftStatusTimer = useRef<number | null>(null)
  const latestDraft = useRef<AiTutorDraft | null>(null)
  const aiMounted = useRef(false)
  const insertPending = useRef(false)
  const generationPending = useRef(false)
  const importPending = useRef(false)
  const currentContext = useRef("")
  const currentReply = useRef(reply)
  const currentOwner = useRef(userId)
  currentOwner.current = userId
  currentReply.current = reply
  const [insertBusy, setInsertBusy] = useState(false)
  const [previousDraft, setPreviousDraft] = useState<AiTutorDraft | null>(null)
  if (draftHydrated.current) latestDraft.current = {
    message, reply, importText, importTitle, importTarget, lastImport, lastImportText,
    sourceScope, sourceTitle, sourceContent, difficulty, tone, outputLength, language,
    providerFamily, insertTarget, targetAudience, requiredOutput, activeTaskKey,
    updatedAt: new Date().toISOString(),
  }

  function flushDraft(announce = true) {
    if (!latestDraft.current) return true
    try {
      persistAiTutorDraft(window.localStorage, latestDraft.current)
      if (announce) setDraftStatus("Draft saved")
      return true
    } catch {
      if (announce) setDraftStatus("Browser storage is unavailable. Keep this page open to preserve your draft.")
      return false
    }
  }

  useEditorExitGuard(async () => flushDraft())

  useEffect(() => {
    aiMounted.current = true
    const flush = () => flushDraft()
    window.addEventListener("pagehide", flush)
    return () => { aiMounted.current = false; window.removeEventListener("pagehide", flush); flushDraft(false) }
  }, [])

  function applyDraft(draft: AiTutorDraft) {
    setMessage(draft.message)
    setReply(draft.reply || "")
    setSourceTitle(draft.sourceTitle || "")
    setSourceContent(draft.sourceContent || "")
    setImportText(draft.importText || "")
    setImportTitle(draft.importTitle || "")
    setImportTarget(normalizeImportTargetSelection(draft.importTarget))
    setLastImport(draft.lastImport || null)
    setLastImportText(draft.lastImportText || "")
    setSourceScope(normalizeChoice(draft.sourceScope, aiTutorSourceScopes, aiTutorSourceScopes[0]))
    setDifficulty(normalizeChoice(draft.difficulty, aiTutorDifficulties, aiTutorDifficulties[0]))
    setTone(normalizeChoice(draft.tone, aiTutorTones, aiTutorTones[0]))
    setOutputLength(normalizeChoice(draft.outputLength, aiTutorOutputLengths, aiTutorOutputLengths[1]))
    setLanguage(normalizeChoice(draft.language, aiTutorLanguages, aiTutorLanguages[0]))
    setProviderFamily(draft.providerFamily || "auto")
    setInsertTarget(normalizeStudioInsertTarget(draft.insertTarget))
    setTargetAudience(draft.targetAudience)
    setRequiredOutput(draft.requiredOutput)
    const task = getAiTutorModeOption(draft.activeTaskKey)
    setActiveTaskKey(task.id)
    setModeGroup(getAiTutorModeGroupForTask(task.id))
  }

  function transitionDraft(update: (current: AiTutorDraft) => AiTutorDraft, actionMessage?: string, savedMessage = "Draft saved") {
    const current = latestDraft.current
    if (generationPending.current || insertPending.current || importPending.current || !current) {
      setActionStatus("Wait for the current activity to finish.")
      return false
    }
    const outgoing = current
    const next = { ...update(current), updatedAt: new Date().toISOString() }
    try {
      archiveAiTutorDraft(window.localStorage, outgoing)
      persistAiTutorDraft(window.localStorage, next)
    } catch {
      setDraftStatus("Browser storage is unavailable.")
      setActionStatus("Your current prompt and result are still here.")
      return false
    }
    latestDraft.current = next
    setPreviousDraft(outgoing)
    applyDraft(next)
    setDraftStatus(savedMessage)
    if (actionMessage !== undefined) setActionStatus(actionMessage)
    return true
  }

  function restorePreviousDraft() {
    if (!previousDraft || insertPending.current || generationPending.current || importPending.current || !latestDraft.current) return false
    try {
      const outgoing = latestDraft.current
      archiveAiTutorDraft(window.localStorage, outgoing)
      persistAiTutorDraft(window.localStorage, previousDraft)
      latestDraft.current = previousDraft
      applyDraft(previousDraft)
      setPreviousDraft(outgoing)
      setDraftStatus("Draft saved")
      setActionStatus("Previous draft restored. Your outgoing draft is also preserved.")
      return true
    } catch {
      setDraftStatus("Browser storage is unavailable.")
      setActionStatus("Your current prompt and result are still here.")
      return false
    }
  }

  const activeMode = useMemo(() => getAiTutorModeOption(activeTaskKey), [activeTaskKey])
  const recentContext = useMemo(() => notes.slice(0, 5).map((note) => `${note.title}: ${note.content}`).join("\n\n"), [notes])
  const formattedReply = useMemo(() => (reply.trim() ? formatAiResponse({ reply }) : null), [reply])
  const uploadedContext = useMemo(() => (importText || lastImportText).trim(), [importText, lastImportText])
  const sourceContext = useMemo(() => buildAiTutorSourceContext({
    message,
    recentContext,
    sourceScope,
    includeRecentNotes: options.aiIncludeNotes,
    uploadedContext,
    activeSourceContext: sourceContent ? `Source: ${sourceTitle}\n${sourceContent}` : "",
  }), [message, options.aiIncludeNotes, recentContext, sourceScope, uploadedContext, sourceTitle, sourceContent])
  const activeContract = useMemo(() => promptContracts.find((contract) => contract.mode === activeMode.id), [activeMode.id])
  const availableInsertTargets = useMemo(() => activeContract?.insertTargets || studioInsertTargets, [activeContract?.insertTargets])
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
  const completePromptPreview = useMemo(() => buildCompletePromptPreview({
    activeTask: activeMode.label,
    audience: targetAudience,
    effectiveMaxTokens,
    gatewayChecks: gatewayReadiness.checks,
    input: message,
    insertTarget,
    prompt: promptBuild,
    providerFamily,
    requiredOutput,
    sourceContext,
    taskPrompt: activeMode.prompt,
  }), [activeMode.label, activeMode.prompt, effectiveMaxTokens, gatewayReadiness.checks, insertTarget, message, promptBuild, providerFamily, requiredOutput, sourceContext, targetAudience])
  const importPreview = useMemo(() => previewImportedLearningContent({ raw: importText, title: importTitle, target: importTarget }), [importTarget, importText, importTitle])
  const uploadedSourceSummary = useMemo(() => summarizeAiTutorUploadedSource({
    draftText: importText,
    savedText: lastImportText,
    savedTitle: lastImport?.title,
  }), [importText, lastImport?.title, lastImportText])
  const providerSummary = useMemo(() => {
    const readyCount = providers.filter(isProviderReady).length
    const configuredCount = providers.filter((provider) => provider.has_key).length
    return {
      readyCount,
      configuredCount,
      familyCount: catalog.length,
      presetCount: presets.length,
    }
  }, [catalog.length, presets.length, providers])
  const providerFamilyOptions = useMemo(
    () => ["auto", ...catalog.map(providerCatalogKey).filter((value): value is string => Boolean(value))],
    [catalog],
  )
  const providerFamilyLabels = useMemo(
    () => ({
      auto: "Auto failover",
      ...Object.fromEntries(catalog.map((item) => {
        const key = providerCatalogKey(item)
        return key ? [key, item.label || key] : []
      }).filter((entry): entry is [string, string] => entry.length === 2)),
    }),
    [catalog],
  )

  currentContext.current = JSON.stringify({
    task: activeMode.id, message, prompt: promptBuild.user, system: promptBuild.system,
    sourceContext, sourceScope, sourceTitle, sourceContent, importText, importTitle, importTarget, lastImportText,
    targetAudience, requiredOutput, difficulty, tone, outputLength, language, providerFamily, insertTarget,
    temperature: options.aiTemperature, maxTokens: effectiveMaxTokens, slidesAspect: options.slidesAspect,
  })

  useEffect(() => {
    if (!availableInsertTargets.includes(insertTarget)) setInsertTarget(availableInsertTargets[0] || "ai-note")
  }, [availableInsertTargets, insertTarget])

  useEffect(() => {
    void loadProviders()
  }, [])

  useEffect(() => {
    const clearDraftStatus = () => {
      if (draftStatusTimer.current !== null) window.clearTimeout(draftStatusTimer.current)
      draftStatusTimer.current = null
    }
    if (draftHydrated.current) return clearDraftStatus
    let launch: AiTutorLaunchPreset | null = null
    let draft: AiTutorDraft | null = null
    try {
      launch = readAiTutorLaunchPreset()
      draft = readAiTutorDraft()
      if (launch && draft) archiveAiTutorDraft(window.localStorage, draft)
      setPreviousDraft(launch ? draft || readPreviousAiTutorDraft(window.localStorage) : readPreviousAiTutorDraft(window.localStorage, draft))
    } catch {
      launch = null
      setDraftStatus("The new source could not replace your saved draft safely. Check browser storage and try again.")
    }
    if (draft && !launch) {
      applyDraft(draft)
    } else if (launch) {
      const restoredTask = getAiTutorModeOption(launch.activeTaskKey)
      setMessage(launch.message || DEFAULT_AI_MESSAGE)
      setSourceTitle(launch.sourceTitle || "")
      setSourceContent(launch.sourceContent || "")
      setReply("")
      setSourceScope(normalizeChoice(launch.sourceScope, aiTutorSourceScopes, aiTutorSourceScopes[0]))
      setOutputLength(normalizeChoice(launch.outputLength, aiTutorOutputLengths, aiTutorOutputLengths[1]))
      setInsertTarget(normalizeStudioInsertTarget(launch.insertTarget))
      setActiveTaskKey(restoredTask.id)
      setModeGroup(launch.modeGroup || getAiTutorModeGroupForTask(restoredTask.id))
      setOptions({ aiMode: restoredTask.mode as WorkspaceOptions["aiMode"], aiMaxTokens: getRecommendedAiTutorTokens(launch.outputLength) })
      setActionStatus(launch.status)
      try { clearAiTutorLaunchPreset() }
      catch { setDraftStatus("The source opened, but browser storage could not clear its handoff.") }
    }
    draftHydrated.current = true
    return clearDraftStatus
  }, [])

  useEffect(() => {
    if (!draftHydrated.current || !latestDraft.current) return
    const timeout = window.setTimeout(() => {
      flushDraft()
    }, 500)
    return () => window.clearTimeout(timeout)
  }, [activeTaskKey, difficulty, importTarget, importText, importTitle, insertTarget, language, lastImport, lastImportText, message, outputLength, providerFamily, reply, sourceScope, sourceTitle, sourceContent, targetAudience, requiredOutput, tone])

  useEffect(() => {
    if (loading || insertBusy || importLoading) setOpenTutorMenu(null)
  }, [loading, insertBusy, importLoading])

  function resetDraft() {
    return transitionDraft((current) => ({
      ...current,
      message: DEFAULT_AI_MESSAGE,
      reply: "",
      importText: "",
      importTitle: "",
      importTarget: "auto",
      lastImport: null,
      lastImportText: "",
      sourceScope: aiTutorSourceScopes[0],
      sourceTitle: "",
      sourceContent: "",
      difficulty: aiTutorDifficulties[0],
      tone: aiTutorTones[0],
      outputLength: aiTutorOutputLengths[1],
      language: aiTutorLanguages[0],
      providerFamily: "auto",
      insertTarget: "ai-note",
      targetAudience: "Self-directed learner",
      requiredOutput: "Clear sections, compact examples, and one next action.",
      activeTaskKey: aiTutorModeOptions[0].id,
    }), "", "Draft reset")
  }

  async function ask() {
    if (generationPending.current || insertPending.current || importPending.current) return
    if (sourceScope === "Active Studio item" && !sourceContent.trim()) {
      setActionStatus("Open Ask AI from a Studio item or Vault note first, or choose another source.")
      return
    }
    if (!promptBuild.ok) {
      setActionStatus(`Missing: ${promptBuild.missing.join(", ")}`)
      return
    }
    if (!draftHydrated.current || !latestDraft.current) {
      setActionStatus("Your draft is still loading. Try again in a moment.")
      return
    }
    if (!flushDraft(false)) {
      setDraftStatus("Browser storage is unavailable.")
      setActionStatus("Your current prompt and result are still here.")
      return
    }
    generationPending.current = true
    const owner = userId
    const context = currentContext.current
    setLoading(true)
    setActionStatus("")
    try {
      const contextParts = [
        assessmentOutputInstruction(insertTarget),
        workflowOutputInstruction(insertTarget),
        `Task mode: ${activeMode.label}`,
        `Source scope: ${sourceScope}`,
        `Difficulty: ${difficulty}`,
        `Tone: ${tone}`,
        `Output length: ${outputLength}`,
        `Language: ${language}`,
        `Max output tokens: ${effectiveMaxTokens}`,
      ].filter(Boolean)
      const response = await api<AiTutorChatResponse>("/api/ai/chat", {
        method: "POST",
        body: JSON.stringify({
          message: `${promptBuild.user}\n\nLearner's explicit request (takes precedence over default quantities):\n${message}`,
          context: [promptBuild.system, contextParts.join("\n\n")].join("\n\n"),
          mode: activeMode.mode,
          temperature: options.aiTemperature,
          maxTokens: effectiveMaxTokens,
          provider: providerFamily,
        }),
      })
      if (!aiMounted.current || currentOwner.current !== owner || currentContext.current !== context) return
      if (response.status !== "ok") {
        setActionStatus(response.text || "The tutor could not produce a result. Check the provider setup.")
        setSidePanel("gateway")
        setToolsOpen(true)
        return
      }
      if (typeof response.text !== "string" || !response.text.trim()) {
        setActionStatus("No usable result came back. Try again; your previous result is still here.")
        return
      }
      const outgoing = latestDraft.current
      if (!outgoing) return
      const next = { ...outgoing, reply: response.text, updatedAt: new Date().toISOString() }
      try {
        archiveAiTutorDraft(window.localStorage, outgoing)
        persistAiTutorDraft(window.localStorage, next)
      } catch {
        setDraftStatus("Browser storage is unavailable.")
        setActionStatus("The new result could not be saved. Your previous result is still here.")
        return
      }
      latestDraft.current = next
      setPreviousDraft(outgoing)
      setReply(response.text)
      setDraftStatus("Draft saved")
      setActionStatus(`Generated with ${response.provider || "configured provider"}${response.model ? ` · ${response.model}` : ""}.`)
    } catch (error) {
      if (aiMounted.current && currentOwner.current === owner && currentContext.current === context) setActionStatus(error instanceof Error ? error.message : "The tutor request failed. Try again.")
    } finally {
      generationPending.current = false
      if (aiMounted.current) setLoading(false)
    }
  }

  async function runPrimaryAction() {
    if (primaryActionPlan.action === "import") {
      setSidePanel("import")
      setToolsOpen(true)
      setImportStatus(primaryActionPlan.statusMessage)
      return
    }
    if (primaryActionPlan.action === "gateway") {
      setSidePanel("gateway")
      setToolsOpen(true)
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
    const response = await api<{ items: AiTutorProviderStatus[]; runtimeItems?: AiTutorProviderStatus[]; catalog?: AiTutorProviderCatalogItem[]; presets?: AiTutorProviderPresetItem[] }>("/api/ai/providers").catch(() => ({ items: [], runtimeItems: [], catalog: [], presets: [] }))
    setProviders([...response.items, ...(response.runtimeItems || [])])
    setCatalog(response.catalog || [])
    setPresets(response.presets || [])
  }

  async function saveReplyAsNote() {
    await insertReply("ai-note")
  }

  async function insertReply(target: StudioInsertTarget) {
    if (!reply.trim() || insertPending.current || generationPending.current || importPending.current) return
    const submittedReply = reply
    const owner = userId
    const context = currentContext.current
    insertPending.current = true
    setInsertBusy(true)
    try {
      const payload = buildInsertBackPayload(target, reply, `AI ${activeMode.label}`, { slidesAspect: options.slidesAspect })
      const response = await api<{ item?: Note | Quiz }>(payload.endpoint, {
        method: "POST",
        body: JSON.stringify(payload.body),
      })
      if (!aiMounted.current || currentOwner.current !== owner || currentReply.current !== submittedReply || currentContext.current !== context) return
      if (payload.endpoint === "/api/notes" && response.item) setNotes?.((current) => [response.item as Note, ...current])
      if (payload.endpoint === "/api/quizzes" && response.item) {
        const createdQuiz = { ...response.item as Quiz, question_count: Array.isArray(payload.body.questions) ? payload.body.questions.length : (response.item as Quiz).question_count }
        setQuizzes?.((current) => [createdQuiz, ...current.filter((quiz) => quiz.id !== createdQuiz.id)])
      }
      setActionStatus(`Created ${payload.view} item from AI result.`)
      setView?.(payload.view)
    } catch (error) {
      if (aiMounted.current && currentOwner.current === owner && currentReply.current === submittedReply && currentContext.current === context) setActionStatus(error instanceof Error ? error.message : "Unable to save the result. Your response is still here.")
    } finally { insertPending.current = false; if (aiMounted.current) setInsertBusy(false) }
  }

  async function organizeImport() {
    if (importPending.current || insertPending.current || generationPending.current) return
    const importedText = importText.trim()
    if (!importedText) {
      setImportStatus("Paste learning material first.")
      return
    }
    importPending.current = true
    const owner = userId
    const context = currentContext.current
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
      if (!aiMounted.current || currentOwner.current !== owner || currentContext.current !== context) return
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
    } catch (error) {
      if (aiMounted.current && currentOwner.current === owner && currentContext.current === context) setImportStatus(error instanceof Error ? error.message : "Import failed. Your source is still here.")
    } finally {
      importPending.current = false
      if (aiMounted.current) setImportLoading(false)
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
    clearSavedImportContext(nextText)
    if (uploadedContextLength) setImportStatus("")
  }

  function clearSavedImportContext(nextText = importText) {
    const uploadedContextLength = nextText.trim().length
    setLastImport(null)
    setLastImportText("")
    setSourceScope(resolveAiTutorSourceScopeAfterUpload({ currentScope: sourceScope, uploadedContextLength }))
    if (!uploadedContextLength) setImportStatus("")
  }

  async function copyReply() {
    if (!reply.trim()) return
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable")
      await navigator.clipboard.writeText(reply)
      setActionStatus("Copied result.")
    } catch {
      setActionStatus("Copy failed. Select the original text to copy it.")
    }
  }

  function prepareStudioBlockPrompt() {
    const instruction = "Return a Studio-ready block with title, summary, action steps, and review questions."
    const changed = transitionDraft((current) => ({
      ...current,
      activeTaskKey: "document_formatter",
      insertTarget: "doc-section",
      message: current.message.includes(instruction) ? current.message : `${current.message.trimEnd()}\n\n${instruction}`,
      reply: "",
    }), "Studio block output selected.")
    if (changed) setOptions({ aiMode: "cleanup" })
    return changed
  }

  function chooseOutputLength(value: string) {
    setOutputLength(value)
    setOptions({ aiMaxTokens: getRecommendedAiTutorTokens(value) })
  }

  function useReplyAsPrompt(taskKey: AiTaskKey, instruction: string, target: StudioInsertTarget) {
    const nextMode = getAiTutorModeOption(taskKey)
    const changed = transitionDraft((current) => ({
      ...current,
      activeTaskKey: taskKey,
      insertTarget: target,
      sourceScope: "Manual only",
      message: `${instruction}\n\n${reply}`,
      reply: "",
    }), `Loaded result into ${nextMode?.label || "AI"} with ${target} output.`)
    if (changed && nextMode) setOptions({ aiMode: nextMode.mode as WorkspaceOptions["aiMode"] })
    return changed
  }

  function loadImportFollowup(kind: ImportFollowupKind) {
    if (!lastImport) return
    const action = buildImportFollowupAction({ kind, title: lastImport.title, target: lastImport.target })
    const changed = transitionDraft((current) => ({
      ...current,
      activeTaskKey: action.taskKey,
      sourceScope: action.sourceScope,
      insertTarget: action.insertTarget,
      message: action.message,
      reply: "",
    }), action.status)
    if (!changed) return
    setOptions({ aiMode: action.aiMode as WorkspaceOptions["aiMode"] })
    setSidePanel("gateway")
  }

  return (
    <div className={`ai-workspace mx-auto grid max-w-6xl items-start gap-4 ${toolsOpen ? "xl:grid-cols-[minmax(0,1fr)_300px]" : ""}`}>
      <Panel className="p-4 sm:p-6">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div>
            <h2 className="sr-only">AI tutor</h2>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill label={workflowSummary.statusLabel} tone={readinessTone(workflowSummary.status)} />

              {draftStatus ? <StatusPill label={draftStatus} tone="steady" /> : null}
            </div>
          </div>
          <div className="relative z-30 grid min-w-0 grid-cols-2 items-center gap-2 self-start rounded-lg border border-border bg-background p-1.5 shadow-sm sm:flex sm:flex-wrap lg:justify-end">
            <TutorMenu label={`Task: ${activeMode.label}`} triggerText="Task" icon={CheckSquare} menuId="task" openMenu={openTutorMenu} setOpenMenu={setOpenTutorMenu} width={512} panelClassName="w-[min(32rem,calc(100vw-2rem))]" disabled={loading || insertBusy || importLoading}>
              {(close) => <TutorMenuSection title="Task">
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {aiTutorModeOptions.map((item) => {
                    const group = visibleAiTutorModeGroups.find((option) => option.modes.includes(item.id))
                    return (
                      <TutorMenuAction
                        key={item.id}
                        active={activeMode.id === item.id}
                        disabled={loading || insertBusy || importLoading}
                        icon={tutorModeIcons[item.id]}
                        label={item.label}
                        meta={group ? `${group.label} · ${item.prompt}` : item.prompt}
                        onClick={() => {
                          if (activeMode.id === item.id) {
                            close()
                            return
                          }
                          const changed = transitionDraft((current) => ({
                            ...current,
                            activeTaskKey: item.id,
                            message: item.prompt,
                            reply: "",
                          }), "")
                          if (!changed) return
                          setOptions({ aiMode: item.mode as WorkspaceOptions["aiMode"] })
                          close()
                        }}
                      />
                    )
                  })}
                </div>
              </TutorMenuSection>}
            </TutorMenu>
            <TutorMenu label="AI options" triggerText="Options" icon={ListFilter} menuId="options" openMenu={openTutorMenu} setOpenMenu={setOpenTutorMenu} width={384} panelClassName="w-[min(24rem,calc(100vw-2rem))]">
              {() => <div className="grid gap-3">
                <TutorMenuSection title="Context">
                  <div className="grid min-w-0 grid-cols-2 gap-2">
                    <TutorMenuSelect label="Source" value={sourceScope} values={aiTutorSourceScopes} onChange={setSourceScope} />
                    <TutorMenuSelect label="Difficulty" value={difficulty} values={aiTutorDifficulties} onChange={setDifficulty} />
                    <TutorMenuSelect label="Tone" value={tone} values={aiTutorTones} onChange={setTone} />
                    <TutorMenuSelect label="Length" value={outputLength} values={aiTutorOutputLengths} onChange={chooseOutputLength} />
                    <TutorMenuSelect label="Language" value={language} values={aiTutorLanguages} onChange={setLanguage} />
                    <TutorMenuSelect label="Insert" value={insertTarget} values={availableInsertTargets} onChange={(value) => setInsertTarget(value as StudioInsertTarget)} />
                  </div>
                  <TutorMenuToggle checked={options.aiIncludeNotes} label="Include recent notes" onChange={(checked) => setOptions({ aiIncludeNotes: checked })} />
                </TutorMenuSection>
                <TutorMenuSection title="Prompt">
                  <label className="grid gap-1 text-sm text-foreground">
                    <span className="font-semibold">Audience</span>
                    <input value={targetAudience} onChange={(event) => setTargetAudience(event.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-foreground outline-none focus:border-ring" />
                  </label>
                  <label className="grid gap-1 text-sm text-foreground">
                    <span className="font-semibold">Requirements</span>
                    <textarea value={requiredOutput} onChange={(event) => setRequiredOutput(event.target.value)} className="min-h-20 rounded-md border border-input bg-background px-2 py-2 text-foreground outline-none focus:border-ring" />
                  </label>
                </TutorMenuSection>
                <TutorMenuSection title="Provider">
                  <TutorMenuSelect label="Provider family" value={providerFamily} values={providerFamilyOptions} labels={providerFamilyLabels} onChange={setProviderFamily} />
                  <div className="grid gap-1">
                    <span className="text-xs font-semibold text-muted-foreground">Max tokens</span>
                    <div className="grid grid-cols-4 gap-1">
                      {aiTutorTokenPresets.map((tokens) => (
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
              </div>}
            </TutorMenu>
            <button type="button" className="editor-command" aria-expanded={toolsOpen} onClick={() => setToolsOpen(!toolsOpen)}>Tools</button>
            <TutorMenu label="Draft actions" triggerText="Draft" icon={MoreHorizontal} menuId="draft" openMenu={openTutorMenu} setOpenMenu={setOpenTutorMenu} width={240} panelClassName="w-60" disabled={loading || insertBusy || importLoading}>
              {(close) => <div className="grid gap-1">
                {previousDraft ? <TutorMenuAction disabled={loading || insertBusy || importLoading} icon={RotateCcw} label="Restore previous AI draft" onClick={() => { if (restorePreviousDraft()) close() }} /> : null}
                <TutorMenuAction disabled={loading || insertBusy || importLoading} icon={RotateCcw} label="Reset draft" onClick={() => { if (resetDraft()) close() }} />
              </div>}
            </TutorMenu>
          </div>
        </div>

        {sourceScope === "Active Studio item" ? <p className="mt-3 text-sm text-muted-foreground">{sourceContent ? `Source: ${sourceTitle}` : "No Studio source selected. Open Ask AI from the source item."}</p> : null}
        <label className="mt-4 grid gap-2 text-sm font-semibold text-foreground">
          <span className="sr-only">What would you like to work on?</span>
          <textarea aria-label="AI prompt" placeholder="Ask or create…" value={message} onChange={(event) => setMessage(event.target.value)} className="min-h-36 w-full rounded-md border border-input bg-background p-4 font-normal text-foreground outline-none focus:border-ring" />
        </label>
        <VoiceInput
          className="mt-2"
          label="Dictate prompt"
          prompt={workflowSummary.nextAction}
          onTranscript={(text) => setMessage((current) => (current.trim() ? `${current.trimEnd()}\n\n${text}` : text))}
        />

        <details className="mt-3 rounded-md border border-border bg-muted/40 p-3 text-sm">
          <summary className="-m-3 cursor-pointer p-3 font-semibold text-foreground">Prompt details {promptBuild.ok ? "" : `- ${promptBuild.missing.length} missing`}</summary>
        <div className="mt-4 grid gap-2 rounded-lg border border-border bg-muted/30 p-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {workflowSummary.overview.map((item) => (
            <AiSummaryChip key={item.id} detail={item.detail} label={item.label} tone={item.tone} value={item.value} />
          ))}
          <AiSummaryChip detail="Best next action from the current prompt, source, insert target, and gateway state." label="Next" value={workflowSummary.nextAction} />
        </div>

          <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-background p-3 text-xs leading-5 text-muted-foreground">{completePromptPreview}</pre>
          {promptBuild.warnings.length ? <p className="mt-2 rounded-md bg-destructive/10 px-2 py-1 text-xs font-semibold text-destructive">{promptBuild.warnings.join(" ")}</p> : null}
        </details>

        <div className="mt-3 flex flex-wrap gap-2">
          <button aria-label={primaryActionPlan.label} title={primaryActionPlan.label} disabled={primaryActionPlan.disabled || insertBusy || importLoading} onClick={runPrimaryAction} className="flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">
            <Bot className="h-4 w-4" aria-hidden="true" />{primaryActionPlan.label}
          </button>
          <button aria-label="Studio block" title="Studio block" disabled={loading || insertBusy || importLoading} onClick={prepareStudioBlockPrompt} className="flex h-10 items-center gap-2 rounded-md border border-border bg-secondary px-4 text-sm font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-60">
            <Plus className="h-4 w-4" aria-hidden="true" />Studio block
          </button>
        </div>
        {!reply && actionStatus ? <p role="status" className="mt-3 rounded-md border border-border p-3 text-sm">{actionStatus}</p> : null}
        {reply ? (
          <div className="mt-5 rounded-md border border-border bg-muted p-4">
            <SectionLabel icon={CheckCircle2} title="Result" body="Insert, save, copy, or turn this into practice." compact />
            <fieldset disabled={insertBusy || loading || importLoading} aria-busy={insertBusy || loading || importLoading} className="mb-3 flex flex-wrap items-center gap-2">
              <legend className="sr-only">AI result actions</legend>
              <ResultAction label="Save as note" icon={Save} onClick={saveReplyAsNote} />
              <ResultAction label="Copy result" icon={Copy} onClick={copyReply} />
              <ResultMenu label="Insert" menuId="result-insert" openMenu={openTutorMenu} setOpenMenu={setOpenTutorMenu} disabled={insertBusy || loading || importLoading}>
                {(close) => insertActions.map((action) => <ResultMenuAction key={action.target} disabled={insertBusy || loading || importLoading} label={action.label} onClick={() => { close(); void insertReply(action.target) }} />)}
              </ResultMenu>
              <ResultMenu label="Create" menuId="result-create" openMenu={openTutorMenu} setOpenMenu={setOpenTutorMenu} disabled={insertBusy || loading || importLoading}>
                {(close) => <>
                  <ResultMenuAction disabled={insertBusy || loading || importLoading} label="Quiz prompt" onClick={() => { if (useReplyAsPrompt("quiz_generation", "Turn this result into a mixed quiz with answers and explanations.", "quiz")) close() }} />
                  <ResultMenuAction disabled={insertBusy || loading || importLoading} label="Flashcards" onClick={() => { if (useReplyAsPrompt("flashcard_generation", "Turn this result into active-recall flashcards and matching pairs.", "flashcards")) close() }} />
                  <ResultMenuAction disabled={insertBusy || loading || importLoading} label="Practice" onClick={() => { if (useReplyAsPrompt("practice_generator", "Create targeted practice from this result with explanations and retry guidance.", "quiz")) close() }} />
                  <ResultMenuAction disabled={insertBusy || loading || importLoading} label="Review cards" onClick={() => { if (useReplyAsPrompt("flashcard_generation", "Create review cards from this result with active-recall prompts.", "review-cards")) close() }} />
                  <ResultMenuAction disabled={insertBusy || loading || importLoading} label="Studio format" onClick={() => { if (useReplyAsPrompt("document_formatter", "Format this result into clean Studio blocks with headings and next actions.", "doc-section")) close() }} />
                  <ResultMenuAction disabled={insertBusy || loading || importLoading} label="Schedule study activity" onClick={() => { if (useReplyAsPrompt("study_plan", "Create one study activity from this result. Ask me for its start, end and timezone before producing the calendar output.", "study-activity")) close() }} />
                  <ResultMenuAction disabled={insertBusy || loading || importLoading} label="Private discussion space" onClick={() => { if (useReplyAsPrompt("personalized_prompt", "Create a discussion protocol from this result for a private learning space.", "discussion-space")) close() }} />
                </>}
              </ResultMenu>
            </fieldset>
            {insertBusy ? <p role="status" className="mb-3 text-sm text-muted-foreground">Saving result…</p> : null}
            {actionStatus ? <p role="status" className="mb-3 rounded-md bg-background px-3 py-2 text-xs font-semibold text-muted-foreground">{actionStatus}</p> : null}
            {formattedReply && formattedReply.blocks.length ? (
              <>
                <AiBlockRenderer blocks={formattedReply.blocks} />
                {formattedReply.warnings.length ? (
                  <ul className="mt-3 grid gap-1 text-xs leading-5 text-muted-foreground">
                    {formattedReply.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                  </ul>
                ) : null}
                <details className="mt-3 border-t border-border pt-3">
                  <summary className="-my-2.5 cursor-pointer py-2.5 text-xs text-muted-foreground">Original text</summary>
                  <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs leading-5">{reply}</pre>
                </details>
              </>
            ) : <div className="whitespace-pre-wrap leading-7 text-foreground">{reply}</div>}
          </div>
        ) : null}
      </Panel>

      {toolsOpen ? <Panel className="p-4 xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 font-semibold text-foreground"><Brain className="h-4 w-4 text-[var(--decor-mint-ink)]" /> Tools</p>
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
              <summary className="-m-3 cursor-pointer p-3 text-sm font-semibold text-foreground">Provider details</summary>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">Keys stay masked. Auto mode follows priority; choosing a provider stays within that family. Local Ollama uses OLLAMA_BASE_URL and OLLAMA_MODEL on the LEARN server, without a key. A hosted deployment cannot reach Ollama on your browser's computer.</p>
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
                      <StatusPill label={providerStatusLabel(provider)} tone={isProviderReady(provider) ? "steady" : "watch"} />
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
                {uploadedSourceSummary.attached ? (
                  <button onClick={clearUploadedSource} className="rounded-md border border-border bg-secondary px-2 py-1 font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground" type="button">
                    Clear
                  </button>
                ) : null}
              </div>
            </div>
            <input
              aria-label="Import title"
              value={importTitle}
              onChange={(event) => {
                setImportTitle(event.target.value)
                clearSavedImportContext()
              }}
              placeholder="Optional title"
              className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus:border-ring"
            />
            <select value={importTarget} aria-label="Import destination" onChange={(event) => {
              setImportTarget(normalizeImportTargetSelection(event.target.value))
              clearSavedImportContext()
            }} className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground">
              {importTargetOptions.map((target) => <option key={target} value={target}>{labelImportTarget(target)}</option>)}
            </select>
            <textarea
              aria-label="Import content"
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
              <p className="mt-2" title={`${importPreview.title} · ${importPreview.destinationView}`}>{importPreview.itemLabel}</p>
              {importPreview.warnings.length ? <p className="mt-2 text-warning-foreground">{importPreview.warnings.join(" ")}</p> : null}
            </div>
            <button onClick={organizeImport} disabled={importLoading || loading || insertBusy || !importPreview.ok} className="h-9 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60">
              {importLoading ? "Organizing" : "Organize into Studio"}
            </button>
            {importStatus ? <p role="status" className="rounded-md bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground">{importStatus}</p> : null}
            {lastImport ? (
              <div className="grid gap-2 sm:grid-cols-4">
                <button onClick={() => setView?.(getImportDestinationView(lastImport.target))} className="rounded-md border border-border bg-secondary px-3 py-2 text-xs font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground">Open {getImportDestinationView(lastImport.target)}</button>
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
      </Panel> : null}
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
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={`flex min-w-0 items-center justify-center gap-1.5 rounded px-2 py-2 text-xs font-semibold transition ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"}`}
      type="button"
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="sr-only">{label}</span>
      <span className={active ? "text-primary-foreground/80" : "text-muted-foreground"}>{count}</span>
    </button>
  )
}

function AiSummaryChip({ detail, label, tone = "neutral", value }: { detail?: string; label: string; tone?: "good" | "watch" | "blocked" | "neutral"; value: string }) {
  const uiTone = workflowTone(tone)
  return (
    <div className={`group relative min-w-0 rounded-md border px-3 py-2 ${statusToneClasses(uiTone)}`} title={detail}>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold text-foreground">{value}</p>
      {detail ? <p className="pointer-events-none absolute left-2 right-2 top-[calc(100%+0.35rem)] z-[120] hidden rounded-md border border-border bg-popover p-2 text-xs leading-5 text-popover-foreground shadow-lg group-hover:block">{detail}</p> : null}
    </div>
  )
}

function TutorMenu({
  children,
  disabled = false,
  icon: Icon,
  label,
  menuId,
  openMenu,
  panelClassName = "",
  setOpenMenu,
  triggerText,
  width,
}: {
  children: (close: () => void) => React.ReactNode
  disabled?: boolean
  icon: React.ComponentType<{ className?: string }>
  label: string
  menuId: TutorMenuId
  openMenu: TutorMenuId | null
  panelClassName?: string
  setOpenMenu: (menuId: TutorMenuId | null) => void
  triggerText?: string
  width?: number
}) {
  const anchor = useRef<HTMLButtonElement>(null)
  const open = openMenu === menuId
  const close = () => setOpenMenu(null)
  return (
    <>
      <button
        ref={anchor}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpenMenu(open ? null : menuId)}
        className={controlButtonClasses({ active: open, size: "compact" })}
        title={label}
        type="button"
      >
        <Icon className="h-3.5 w-3.5" />
        {triggerText ? <span>{triggerText}</span> : <span className="sr-only">{label}</span>}
        <ChevronDown className="h-3.5 w-3.5 opacity-70" />
      </button>
      <Popover open={open} anchor={anchor} onClose={close} label={label} placement="bottom-end" width={width} className={panelClassName} focusOnOpen>
        {children(close)}
      </Popover>
    </>
  )
}

function TutorMenuSection({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <div className="grid gap-2">
      <p className="px-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{title}</p>
      {children}
    </div>
  )
}

function TutorMenuAction({
  active,
  disabled = false,
  icon: Icon,
  label,
  meta,
  onClick,
}: {
  active?: boolean
  disabled?: boolean
  icon: React.ComponentType<{ className?: string }>
  label: string
  meta?: string
  onClick: () => void
}) {
  return (
    <button
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm font-semibold disabled:pointer-events-none disabled:opacity-50 ${
        active ? "bg-primary text-primary-foreground" : "text-popover-foreground hover:bg-accent hover:text-accent-foreground"
      }`}
      type="button"
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="min-w-0">
        <span className="block truncate">{label}</span>
        {meta ? <span className="sr-only">{meta}</span> : null}
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
    <label className="grid min-w-0 gap-1 text-xs font-semibold text-muted-foreground">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-9 min-w-0 rounded-md border border-input bg-background px-2 text-sm text-foreground">
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
  return parseStoredAiTutorDraft(window.localStorage.getItem(AI_TUTOR_DRAFT_KEY))
}

function readAiTutorLaunchPreset(): AiTutorLaunchPreset | null {
  if (typeof window === "undefined") return null
  return parseStoredAiTutorLaunchPreset(window.localStorage.getItem(AI_TUTOR_LAUNCH_KEY))
}

function clearAiTutorLaunchPreset() {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(AI_TUTOR_LAUNCH_KEY)
}

function normalizeChoice(value: string, options: string[], fallback: string) {
  return options.includes(value) ? value : fallback
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

function buildCompletePromptPreview(input: {
  activeTask: string
  audience: string
  effectiveMaxTokens: number
  gatewayChecks: string[]
  input: string
  insertTarget: StudioInsertTarget
  prompt: GuidedPromptResult
  providerFamily: string
  requiredOutput: string
  sourceContext: string
  taskPrompt: string
}) {
  const sections = [
    ["Task", `${input.activeTask}\n${input.taskPrompt}`],
    ["Audience", input.audience],
    ["Requirements", input.requiredOutput],
    ["Input", input.input.trim() || "No prompt text yet."],
    ["Context", input.sourceContext.trim() || "No extra context selected."],
    ["Output contract", input.prompt.outputContract || "Structured learning response"],
    ["Insert target", input.insertTarget],
    ["Gateway", [
      input.providerFamily === "auto" ? "Provider: auto failover" : `Provider family: ${input.providerFamily}`,
      `Max tokens: ${input.effectiveMaxTokens}`,
      input.gatewayChecks.length ? input.gatewayChecks.join(" ") : "Provider route ready.",
    ].join("\n")],
  ]

  return sections.map(([title, body]) => `## ${title}\n${body}`).join("\n\n")
}

function ResultAction({ label, icon: Icon, onClick }: { label: string; icon: React.ComponentType<{ className?: string }>; onClick: () => void }) {
  return (
    <ControlButton aria-label={label} title={label} onClick={onClick} size="compact">
      <Icon className="h-4 w-4" />
    </ControlButton>
  )
}

function ResultMenu({ children, disabled = false, label, menuId, openMenu, setOpenMenu }: {
  children: (close: () => void) => React.ReactNode
  disabled?: boolean
  label: string
  menuId: TutorMenuId
  openMenu: TutorMenuId | null
  setOpenMenu: (menuId: TutorMenuId | null) => void
}) {
  const open = openMenu === menuId
  const anchor = useRef<HTMLButtonElement>(null)
  const dialogLabel = `${label} result`
  const close = () => setOpenMenu(null)
  return (
    <>
      <button
        ref={anchor}
        type="button"
        aria-label={dialogLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpenMenu(open ? null : menuId)}
        className={controlButtonClasses({ active: open, size: "compact" })}
        title={dialogLabel}
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
        {label}
        <ChevronDown className="h-3.5 w-3.5 opacity-70" />
      </button>
      <Popover open={open} anchor={anchor} onClose={close} label={dialogLabel} placement="bottom-start" width={224} className="w-[min(14rem,calc(100vw-2rem))]" focusOnOpen>
        <div className="grid gap-1">{children(close)}</div>
      </Popover>
    </>
  )
}

function ResultMenuAction({ disabled = false, label, onClick }: { disabled?: boolean; label: string; onClick: () => void }) {
  return (
    <button
      disabled={disabled}
      className="flex w-full rounded-md px-2 py-2 text-left text-sm font-semibold text-popover-foreground hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
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
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${toneTextClasses(uiTone)}`}>{value}</p>
    </div>
  )
}

function providerCatalogKey(provider: AiTutorProviderCatalogItem) {
  return provider.provider || provider.id || ""
}

function providerStatusLabel(provider: AiGatewayProviderStatus) {
  if (provider.requires_key === false) return "Local · not yet tested"
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

function SectionLabel({ body, compact, icon: Icon, title }: { body: string; compact?: boolean; icon: React.ComponentType<{ className?: string }>; title: string }) {
  return (
    <div className={`${compact ? "mb-3" : "mt-5"} flex items-center justify-between gap-3`}>
      <div className="flex min-w-0 items-center gap-2">
        <Icon className="h-4 w-4 text-[var(--decor-mint-ink)]" />
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
