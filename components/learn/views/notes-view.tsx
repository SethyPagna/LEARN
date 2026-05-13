"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { Clock3, Plus, Redo2, Save, Star, Trash2, Undo2 } from "lucide-react"
import type { WorkspaceOptions } from "../preferences"
import type { Note } from "../types"
import { api, formatDate } from "../api"
import { EmptyState, Panel } from "../ui"
import { createHistoryState, pushHistory, redoHistory, undoHistory, type HistoryState } from "@/lib/workspace-features"

const emojis = ["⭐", "✅", "💡", "📌", "🎯", "🔥", "🧠", "📚"]

export function NotesView({
  notes,
  selectedNote,
  setSelectedNoteId,
  setNotes,
  options,
}: {
  notes: Note[]
  selectedNote?: Note
  setSelectedNoteId: (id: string) => void
  setNotes: React.Dispatch<React.SetStateAction<Note[]>>
  options: WorkspaceOptions
}) {
  const [draft, setDraft] = useState<Note | null>(selectedNote || null)
  const [contentHistory, setContentHistory] = useState<HistoryState<string>>(createHistoryState(selectedNote?.content || ""))
  const [versions, setVersions] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [lastAutosaved, setLastAutosaved] = useState("")

  useEffect(() => {
    setDraft(selectedNote || null)
    setContentHistory(createHistoryState(selectedNote?.content || ""))
    setVersions([])
    if (selectedNote?.id) {
      api<{ items: any[] }>(`/api/notes/${selectedNote.id}/versions`).then((response) => setVersions(response.items)).catch(() => undefined)
    }
  }, [selectedNote?.id])

  async function createNote() {
    const response = await api<{ item: Note }>("/api/notes", {
      method: "POST",
      body: JSON.stringify({ title: "Untitled learning page", content: "", template: "blank" }),
    })
    setNotes((items) => [response.item, ...items])
    setSelectedNoteId(response.item.id)
  }

  async function save(silent = false) {
    if (!draft) return
    setSaving(true)
    try {
      const response = await api<{ item: Note }>(`/api/notes/${draft.id}`, {
        method: "PUT",
        body: JSON.stringify({ ...draft, content: contentHistory.present }),
      })
      setNotes((items) => items.map((note) => (note.id === response.item.id ? response.item : note)))
      setDraft(response.item)
      if (silent) setLastAutosaved(new Date().toLocaleTimeString())
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (!options.notesAutosave || !draft?.id) return
    const timeout = window.setTimeout(() => {
      save(true).catch(() => undefined)
    }, 1800)
    return () => window.clearTimeout(timeout)
  }, [options.notesAutosave, draft?.id, draft?.title, contentHistory.present])

  async function remove() {
    if (!draft) return
    await api(`/api/notes/${draft.id}`, { method: "DELETE" })
    setNotes((items) => items.filter((note) => note.id !== draft.id))
    setSelectedNoteId("")
  }

  function toggleFavorite() {
    if (!draft) return
    const next = { ...draft, favorite: !draft.favorite }
    setDraft(next)
    setNotes((items) => items.map((note) => (note.id === next.id ? next : note)))
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
              <button onClick={() => save()} className="flex h-10 items-center gap-2 rounded-md bg-success px-4 text-sm font-semibold text-success-foreground">
                <Save className="h-4 w-4" />
                {saving ? "Saving" : "Save"}
              </button>
            </div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <button onClick={() => setContentHistory(undoHistory(contentHistory))} className="flex h-9 items-center gap-2 rounded-md border border-border bg-secondary px-3 text-sm text-secondary-foreground hover:bg-accent hover:text-accent-foreground">
                <Undo2 className="h-4 w-4" /> Undo
              </button>
              <button onClick={() => setContentHistory(redoHistory(contentHistory))} className="flex h-9 items-center gap-2 rounded-md border border-border bg-secondary px-3 text-sm text-secondary-foreground hover:bg-accent hover:text-accent-foreground">
                <Redo2 className="h-4 w-4" /> Redo
              </button>
              <button onClick={toggleFavorite} className="flex h-9 items-center gap-2 rounded-md border border-border bg-secondary px-3 text-sm text-secondary-foreground hover:bg-accent hover:text-accent-foreground">
                <Star className={`h-4 w-4 ${draft.favorite ? "fill-chart-5 text-chart-5" : ""}`} /> Favorite
              </button>
              {emojis.map((emoji) => (
                <button key={emoji} onClick={() => setContentHistory(pushHistory(contentHistory, `${contentHistory.present}${emoji}`))} className="h-9 w-9 rounded-md border border-border bg-secondary text-sm">
                  {emoji}
                </button>
              ))}
              <button onClick={remove} className="ml-auto flex h-9 items-center gap-2 rounded-md border border-destructive bg-background px-3 text-sm text-destructive hover:bg-destructive hover:text-destructive-foreground">
                <Trash2 className="h-4 w-4" /> Delete
              </button>
            </div>
            <textarea
              value={contentHistory.present}
              onChange={(event) => setContentHistory(pushHistory(contentHistory, event.target.value))}
              className={`${options.noteEditorSize === "large" ? "min-h-[72vh] text-lg" : "min-h-[60vh] text-base"} w-full resize-none rounded-md border border-input bg-background p-4 leading-8 text-foreground outline-none focus:border-ring`}
              placeholder="Write notes, formulas, reflections, and AI-generated drafts here..."
            />
            {options.notesAutosave ? <p className="mt-2 text-xs text-muted-foreground">Autosave is on{lastAutosaved ? ` - last saved ${lastAutosaved}` : ""}.</p> : null}
            <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                <Clock3 className="h-4 w-4" /> History
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {versions.slice(0, 6).map((version) => (
                  <button key={version.id} onClick={() => setContentHistory(pushHistory(contentHistory, String(version.content || "")))} className="rounded-md bg-card p-3 text-left text-sm text-card-foreground">
                    <span className="line-clamp-1 font-medium">{version.title}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{formatDate(version.created_at)}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <EmptyState title="No note selected" body="Create a note or choose one from the list to start writing." />
        )}
      </Panel>
    </div>
  )
}
