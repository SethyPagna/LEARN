"use client"

import { useState } from "react"
import { Bot } from "lucide-react"
import type { Note } from "../types"
import { api } from "../api"
import { Panel } from "../ui"

export function AiTutorView({ notes }: { notes: Note[] }) {
  const [message, setMessage] = useState("Create a study plan from my recent notes.")
  const [reply, setReply] = useState("")
  const [loading, setLoading] = useState(false)

  async function ask() {
    setLoading(true)
    try {
      const context = notes.slice(0, 5).map((note) => `${note.title}: ${note.content}`).join("\n\n")
      const response = await api<any>("/api/ai/chat", {
        method: "POST",
        body: JSON.stringify({ message, context }),
      })
      setReply(response.text)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
      <Panel className="p-4">
        <h2 className="text-2xl font-semibold text-foreground">AI tutor</h2>
        <p className="mt-2 text-sm text-muted-foreground">Summarize notes, generate quizzes, explain mistakes, and plan the week.</p>
        <textarea value={message} onChange={(event) => setMessage(event.target.value)} className="mt-5 min-h-40 w-full rounded-md border border-input bg-background p-4 text-foreground outline-none focus:border-ring" />
        <button onClick={ask} className="mt-3 flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">
          <Bot className="h-4 w-4" />
          {loading ? "Thinking" : "Ask tutor"}
        </button>
        {reply ? <div className="mt-5 whitespace-pre-wrap rounded-md bg-muted p-4 leading-7 text-foreground">{reply}</div> : null}
      </Panel>
      <Panel className="p-4">
        <p className="font-semibold text-foreground">Cloudflare AI Gateway</p>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Runtime secrets stay outside git. If no token is configured, the tutor returns setup guidance instead of breaking the workspace.
        </p>
      </Panel>
    </div>
  )
}
