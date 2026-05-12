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
        <h2 className="text-2xl font-semibold text-[#17202a]">AI tutor</h2>
        <p className="mt-2 text-sm text-[#5e6a78]">Summarize notes, generate quizzes, explain mistakes, and plan the week.</p>
        <textarea value={message} onChange={(event) => setMessage(event.target.value)} className="mt-5 min-h-40 w-full rounded-md border border-[#d8dce2] p-4 outline-none focus:border-[#2c7a64]" />
        <button onClick={ask} className="mt-3 flex h-10 items-center gap-2 rounded-md bg-[#17202a] px-4 text-sm font-semibold text-white">
          <Bot className="h-4 w-4" />
          {loading ? "Thinking" : "Ask tutor"}
        </button>
        {reply ? <div className="mt-5 whitespace-pre-wrap rounded-md bg-[#f2f5f8] p-4 leading-7 text-[#17202a]">{reply}</div> : null}
      </Panel>
      <Panel className="p-4">
        <p className="font-semibold text-[#17202a]">Cloudflare AI Gateway</p>
        <p className="mt-3 text-sm leading-6 text-[#5e6a78]">
          Runtime secrets stay outside git. If no token is configured, the tutor returns setup guidance instead of breaking the workspace.
        </p>
      </Panel>
    </div>
  )
}
