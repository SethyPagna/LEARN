"use client"

import { FileText, Sparkles } from "lucide-react"
import type { Note, Quiz, View } from "../types"
import { Panel } from "../ui"

export function DashboardView({
  dashboard,
  notes,
  quizzes,
  setView,
}: {
  dashboard: any
  notes: Note[]
  quizzes: Quiz[]
  setView: (view: View) => void
}) {
  const focus = dashboard?.snapshot?.recommendedFocus?.[0] || "React"
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
      <section className="rounded-lg bg-[#17202a] p-5 text-white">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-white/65">Today’s learning route</p>
            <h2 className="mt-2 max-w-2xl text-3xl font-semibold leading-tight">Focus on {focus}, then convert notes into practice.</h2>
          </div>
          <button onClick={() => setView("ai")} className="flex h-10 items-center gap-2 rounded-md bg-[#8fd8bd] px-3 text-sm font-semibold text-[#17202a]">
            <Sparkles className="h-4 w-4" />
            Ask tutor
          </button>
        </div>
        <div className="mt-6 grid gap-2 md:grid-cols-3">
          <Metric label="Goal" value={`${dashboard?.snapshot?.goalCompletion ?? 0}%`} />
          <Metric label="Notes" value={String(notes.length)} />
          <Metric label="Quiz banks" value={String(quizzes.length)} />
        </div>
      </section>

      <Panel className="p-4">
        <p className="text-sm font-semibold text-[#17202a]">Weak topics</p>
        <div className="mt-4 space-y-3">
          {(dashboard?.snapshot?.weakTopics || [{ topic: "No attempts yet", accuracy: 100 }]).map((topic: any) => (
            <div key={topic.topic}>
              <div className="flex justify-between text-sm">
                <span className="font-medium text-[#17202a]">{topic.topic}</span>
                <span className="text-[#697586]">{topic.accuracy}%</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-[#e9edf2]">
                <div className="h-2 rounded-full bg-[#2c7a64]" style={{ width: `${Math.max(8, topic.accuracy)}%` }} />
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="p-4 xl:col-span-2">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-[#17202a]">Recent workspace</h2>
          <button onClick={() => setView("notes")} className="text-sm font-medium text-[#2c7a64]">Open notes</button>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {notes.slice(0, 6).map((note) => (
            <article key={note.id} className="rounded-lg border border-[#e4e8ee] p-4">
              <FileText className="h-5 w-5 text-[#2c7a64]" />
              <h3 className="mt-3 font-semibold text-[#17202a]">{note.title}</h3>
              <p className="mt-2 line-clamp-3 text-sm leading-6 text-[#5e6a78]">{note.content}</p>
            </article>
          ))}
        </div>
      </Panel>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/8 p-3">
      <p className="text-sm text-white/58">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  )
}
