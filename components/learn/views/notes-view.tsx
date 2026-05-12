"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { Plus, Save, Star } from "lucide-react"
import type { Note } from "../types"
import { api, formatDate } from "../api"
import { EmptyState, Panel } from "../ui"

export function NotesView({
  notes,
  selectedNote,
  setSelectedNoteId,
  setNotes,
}: {
  notes: Note[]
  selectedNote?: Note
  setSelectedNoteId: (id: string) => void
  setNotes: React.Dispatch<React.SetStateAction<Note[]>>
}) {
  const [draft, setDraft] = useState<Note | null>(selectedNote || null)
  const [saving, setSaving] = useState(false)

  useEffect(() => setDraft(selectedNote || null), [selectedNote?.id])

  async function createNote() {
    const response = await api<{ item: Note }>("/api/notes", {
      method: "POST",
      body: JSON.stringify({ title: "Untitled learning page", content: "", template: "blank" }),
    })
    setNotes((items) => [response.item, ...items])
    setSelectedNoteId(response.item.id)
  }

  async function save() {
    if (!draft) return
    setSaving(true)
    try {
      const response = await api<{ item: Note }>(`/api/notes/${draft.id}`, {
        method: "PUT",
        body: JSON.stringify(draft),
      })
      setNotes((items) => items.map((note) => (note.id === response.item.id ? response.item : note)))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[300px_1fr]">
      <Panel className="p-3">
        <button onClick={createNote} className="mb-3 flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#17202a] text-sm font-semibold text-white">
          <Plus className="h-4 w-4" />
          New note
        </button>
        <div className="space-y-1">
          {notes.map((note) => (
            <button
              key={note.id}
              onClick={() => setSelectedNoteId(note.id)}
              className={`w-full rounded-md p-3 text-left transition ${selectedNote?.id === note.id ? "bg-[#e7f3ef]" : "hover:bg-[#f2f5f8]"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate font-medium text-[#17202a]">{note.title}</p>
                {note.favorite ? <Star className="h-4 w-4 fill-[#d39b24] text-[#d39b24]" /> : null}
              </div>
              <p className="mt-1 text-xs text-[#697586]">{formatDate(note.updated_at)}</p>
            </button>
          ))}
        </div>
      </Panel>

      <Panel className="p-4">
        {draft ? (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <input
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                className="min-w-0 flex-1 bg-transparent text-3xl font-semibold text-[#17202a] outline-none"
              />
              <button onClick={save} className="flex h-10 items-center gap-2 rounded-md bg-[#2c7a64] px-4 text-sm font-semibold text-white">
                <Save className="h-4 w-4" />
                {saving ? "Saving" : "Save"}
              </button>
            </div>
            <textarea
              value={draft.content}
              onChange={(event) => setDraft({ ...draft, content: event.target.value })}
              className="min-h-[520px] w-full resize-none rounded-md border border-[#d8dce2] bg-[#fbfcfd] p-4 text-base leading-8 text-[#17202a] outline-none focus:border-[#2c7a64]"
              placeholder="Write notes, formulas, reflections, and AI-generated drafts here..."
            />
          </>
        ) : (
          <EmptyState title="No note selected" body="Create a note or choose one from the list to start writing." />
        )}
      </Panel>
    </div>
  )
}
