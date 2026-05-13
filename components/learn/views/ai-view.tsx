"use client"

import { useState } from "react"
import { Bot, Gauge, Settings2, Sparkles } from "lucide-react"
import type { Note } from "../types"
import { api } from "../api"
import { Panel } from "../ui"

const tutorModes = ["coach", "route", "rewrite", "quiz", "flashcards", "translate"]

export function AiTutorView({ notes }: { notes: Note[] }) {
  const [message, setMessage] = useState("Create a study plan from my recent notes.")
  const [reply, setReply] = useState("")
  const [loading, setLoading] = useState(false)
  const [providers, setProviders] = useState<any[]>([])
  const [catalog, setCatalog] = useState<any[]>([])
  const [presets, setPresets] = useState<any[]>([])
  const [mode, setMode] = useState("route")
  const [includeNotes, setIncludeNotes] = useState(true)
  const [temperature, setTemperature] = useState(0.45)
  const [maxTokens, setMaxTokens] = useState(1200)

  const promptActions = [
    "Turn my weakest topics into a 7-day learning route.",
    "Rewrite my latest note as a clean study page with callouts.",
    "Generate a mixed quiz with MCQ, true/false, and fill-in-the-blank questions.",
    "Create flashcards and a memory game from my recent notes.",
  ]

  async function ask() {
    setLoading(true)
    try {
      const context = includeNotes ? notes.slice(0, 5).map((note) => `${note.title}: ${note.content}`).join("\n\n") : ""
      const response = await api<any>("/api/ai/chat", {
        method: "POST",
        body: JSON.stringify({ message, context, mode, temperature, maxTokens }),
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
    <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
      <Panel className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">AI tutor</h2>
            <p className="mt-2 text-sm text-muted-foreground">Summarize notes, generate quizzes, explain mistakes, translate, and plan the week.</p>
          </div>
          <div className="flex max-w-full flex-wrap rounded-md border border-border bg-secondary p-1">
            {tutorModes.map((item) => (
              <button
                key={item}
                onClick={() => setMode(item)}
                className={`h-8 rounded px-2 text-xs font-medium capitalize ${mode === item ? "bg-primary text-primary-foreground" : "text-secondary-foreground hover:bg-accent hover:text-accent-foreground"}`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {promptActions.map((prompt) => (
            <button key={prompt} onClick={() => setMessage(prompt)} className="rounded-md border border-border bg-secondary p-3 text-left text-sm text-secondary-foreground hover:bg-accent hover:text-accent-foreground">
              <Sparkles className="mb-2 h-4 w-4 text-success" />
              {prompt}
            </button>
          ))}
        </div>
        <div className="mt-4 grid gap-3 rounded-md border border-border bg-muted/40 p-3 md:grid-cols-3">
          <label className="flex items-center justify-between gap-3 text-sm text-foreground">
            <span className="flex items-center gap-2"><Settings2 className="h-4 w-4" /> Use recent notes</span>
            <input type="checkbox" checked={includeNotes} onChange={(event) => setIncludeNotes(event.target.checked)} />
          </label>
          <label className="text-sm text-foreground">
            Creativity
            <input className="mt-2 w-full accent-primary" type="range" min="0" max="1.2" step="0.05" value={temperature} onChange={(event) => setTemperature(Number(event.target.value))} />
            <span className="text-xs text-muted-foreground">{temperature.toFixed(2)}</span>
          </label>
          <label className="text-sm text-foreground">
            Max tokens
            <input className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-foreground" type="number" min="128" max="8192" step="128" value={maxTokens} onChange={(event) => setMaxTokens(Number(event.target.value))} />
          </label>
        </div>
        <textarea value={message} onChange={(event) => setMessage(event.target.value)} className="mt-5 min-h-40 w-full rounded-md border border-input bg-background p-4 text-foreground outline-none focus:border-ring" />
        <button onClick={ask} className="mt-3 flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">
          <Bot className="h-4 w-4" />
          {loading ? "Thinking" : "Ask tutor"}
        </button>
        {reply ? <div className="mt-5 whitespace-pre-wrap rounded-md bg-muted p-4 leading-7 text-foreground">{reply}</div> : null}
      </Panel>
      <Panel className="p-4">
        <p className="font-semibold text-foreground">AI provider routing</p>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Runtime secrets stay outside git. Enabled D1 provider configs are tried first by priority, then runtime secrets are used as fallback.
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
            {presets.slice(0, 5).map((preset) => (
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
