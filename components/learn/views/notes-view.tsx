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
        <button onClick={createNote} className="mb-3 flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-primary-foreground">
          <Plus className="h-4 w-4" />
          New note
        </button>
        <div className="space-y-1">
          {notes.map((note) => (
            <button
              key={note.id}
              onClick={() => setSelectedNoteId(note.id)}
              className={`w-full rounded-md p-3 text-left transition ${selectedNote?.id === note.id ? "bg-accent text-accent-foreground" : "hover:bg-muted"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate font-medium">{note.title}</p>
                {note.favorite ? <Star className="h-4 w-4 fill-chart-5 text-chart-5" /> : null}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{formatDate(note.updated_at)}</p>
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
                className="min-w-0 flex-1 bg-transparent text-2xl font-semibold text-foreground outline-none sm:text-3xl"
              />
              <button onClick={save} className="flex h-10 items-center gap-2 rounded-md bg-success px-4 text-sm font-semibold text-success-foreground">
                <Save className="h-4 w-4" />
                {saving ? "Saving" : "Save"}
              </button>
            </div>
            <textarea
              value={draft.content}
              onChange={(event) => setDraft({ ...draft, content: event.target.value })}
              className="min-h-[60vh] w-full resize-none rounded-md border border-input bg-background p-4 text-base leading-8 text-foreground outline-none focus:border-ring"
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
