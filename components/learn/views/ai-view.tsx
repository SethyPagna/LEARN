"use client"

import { useMemo, useState } from "react"
import { Bot, Brain, CheckSquare, FileText, Gauge, Languages, ListFilter, Plus, Route, Settings2, Sparkles, Wand2 } from "lucide-react"
import type { WorkspaceOptions } from "../preferences"
import type { Note } from "../types"
import { api } from "../api"
import { Panel } from "../ui"

const tutorModes = [
  { id: "coach", label: "Tutor", icon: Bot, prompt: "Explain this like a patient tutor and ask one check-for-understanding question." },
  { id: "rewrite", label: "Rewrite", icon: Wand2, prompt: "Rewrite this into a clean study page with headings, callouts, examples, and review prompts." },
  { id: "quiz", label: "Quiz", icon: CheckSquare, prompt: "Generate a mixed quiz with MCQ, true/false, fill-in-the-blank, and explanations." },
  { id: "flashcards", label: "Flashcards", icon: Brain, prompt: "Create active-recall flashcards and a tiny memory game from this context." },
  { id: "translate", label: "Translate", icon: Languages, prompt: "Translate and simplify this learning material while preserving key terms." },
  { id: "route", label: "Study Plan", icon: Route, prompt: "Create a targeted 7-day study route with daily focus, review, and practice." },
  { id: "cleanup", label: "Import Cleanup", icon: FileText, prompt: "Clean imported notes into structured sections, tables, and action items." },
  { id: "mistake", label: "Explain Mistake", icon: Sparkles, prompt: "Explain the mistake, why it happened, and how to remember the correct idea." },
]

const sourceScopes = ["Recent notes", "Active Studio item", "Weak topics", "Uploaded files", "Manual only"]
const difficulties = ["Adaptive", "Beginner", "Intermediate", "Advanced", "Exam prep"]
const tones = ["Kind", "Direct", "Socratic", "Concise", "Detailed"]
const outputLengths = ["Short", "Balanced", "Deep"]
const languages = ["English", "Khmer", "French", "Spanish", "Korean", "Japanese", "Chinese"]

export function AiTutorView({
  notes,
  options,
  setOptions,
}: {
  notes: Note[]
  options: WorkspaceOptions
  setOptions: (options: Partial<WorkspaceOptions>) => void
}) {
  const [message, setMessage] = useState("Create a study plan from my recent notes.")
  const [reply, setReply] = useState("")
  const [loading, setLoading] = useState(false)
  const [providers, setProviders] = useState<any[]>([])
  const [catalog, setCatalog] = useState<any[]>([])
  const [presets, setPresets] = useState<any[]>([])
  const [sourceScope, setSourceScope] = useState(sourceScopes[0])
  const [difficulty, setDifficulty] = useState(difficulties[0])
  const [tone, setTone] = useState(tones[0])
  const [outputLength, setOutputLength] = useState(outputLengths[1])
  const [language, setLanguage] = useState(languages[0])
  const [providerFamily, setProviderFamily] = useState("auto")

  const activeMode = tutorModes.find((mode) => mode.id === options.aiMode) || tutorModes[0]
  const recentContext = useMemo(() => notes.slice(0, 5).map((note) => `${note.title}: ${note.content}`).join("\n\n"), [notes])
  const promptActions = tutorModes.map((mode) => ({
    ...mode,
    body: `${mode.label} - ${mode.prompt}`,
  }))

  async function ask() {
    setLoading(true)
    try {
      const contextParts = [
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
          message: `${activeMode.prompt}\n\n${message}`,
          context: contextParts.join("\n\n"),
          mode: options.aiMode,
          temperature: options.aiTemperature,
          maxTokens: options.aiMaxTokens,
        }),
      })
      setReply(response.text)
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

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <Panel className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">AI tutor</h2>
            <p className="mt-2 text-sm text-muted-foreground">Choose a task, filter the context, then insert the result back into your learning loop.</p>
          </div>
          <div className="flex flex-wrap rounded-md border border-border bg-secondary p-1">
            {tutorModes.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setOptions({ aiMode: item.id as WorkspaceOptions["aiMode"] })
                    setMessage(item.prompt)
                  }}
                  className={`flex h-8 items-center gap-1.5 rounded px-2 text-xs font-medium ${options.aiMode === item.id ? "bg-primary text-primary-foreground" : "text-secondary-foreground hover:bg-accent hover:text-accent-foreground"}`}
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
              <button key={prompt.id} onClick={() => { setOptions({ aiMode: prompt.id as WorkspaceOptions["aiMode"] }); setMessage(prompt.prompt) }} className="rounded-md border border-border bg-secondary p-3 text-left text-sm text-secondary-foreground hover:bg-accent hover:text-accent-foreground">
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
          <button onClick={ask} className="flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">
            <Bot className="h-4 w-4" />
            {loading ? "Thinking" : "Run tutor"}
          </button>
          <button onClick={() => setMessage(`${message}\n\nReturn a Studio-ready block with title, summary, action steps, and review questions.`)} className="flex h-10 items-center gap-2 rounded-md border border-border bg-secondary px-4 text-sm font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground">
            <Plus className="h-4 w-4" />
            Studio block
          </button>
        </div>
        {reply ? (
          <div className="mt-5 rounded-md border border-border bg-muted p-4">
            <div className="mb-3 flex flex-wrap gap-2">
              {["Insert as note", "Append to doc", "Make sheet rows", "Make slide outline", "Create review cards"].map((action) => (
                <button key={action} className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent hover:text-accent-foreground">
                  {action}
                </button>
              ))}
            </div>
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
                <span className="rounded bg-background px-2 py-0.5 text-xs text-muted-foreground">{provider.priority}</span>
              </div>
              <p className="text-xs text-muted-foreground">{provider.provider} - {provider.default_model} - {provider.last_status}</p>
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
      </Panel>
    </div>
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
