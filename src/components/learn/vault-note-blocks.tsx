"use client"

import { useEffect, useState } from "react"
import { Sparkles, BookOpen, CalendarDays, MessageSquare } from "lucide-react"
import { launchAiTutorFromSource } from "@/lib/ai/source-launch"
import { api } from "./api"
import type { Note, View } from "./types"

interface VaultBlock {
  id: string
  blockType: string
  content: Record<string, unknown>
}

function blockText(block: VaultBlock): string {
  return typeof block.content.text === "string" ? block.content.text : JSON.stringify(block.content)
}

export function VaultNoteBlocks({ note, revision, setView }: { note?: Note; revision: number; setView: (view: View) => void }) {
  const [blocks, setBlocks] = useState<VaultBlock[]>([])
  const [status, setStatus] = useState("")
  const [loadedNoteId, setLoadedNoteId] = useState("")
  useEffect(() => {
    let current = true
    setBlocks([])
    setLoadedNoteId("")
    if (!note) return
    setStatus("Loading saved blocks…")
    void api<{ items: VaultBlock[] }>(`/api/vault/blocks?noteId=${encodeURIComponent(note.id)}`).then((response) => {
      if (!current) return
      setBlocks(response.items)
      setLoadedNoteId(note.id)
      setStatus(response.items.length ? "" : "No saved blocks yet.")
    }).catch((error: unknown) => {
      if (current) setStatus(error instanceof Error ? error.message : "Unable to load saved blocks.")
    })
    return () => { current = false }
  }, [note?.id, revision])

  function openTutor(task: "explain" | "quiz" | "activity" | "discussion", block?: VaultBlock) {
    if (!note || loadedNoteId !== note.id) return
    try {
      const content = block ? blockText(block) : [note.content, ...blocks.map(blockText)].filter(Boolean).join("\n\n")
      launchAiTutorFromSource({ title: block ? `${note.title} · ${block.blockType} block` : note.title, content, task })
      setView("ai")
    } catch {
      setStatus("The AI source could not be saved in this browser. Check local storage and try again.")
    }
  }

  return <section className="vault-blocks" aria-label="Saved Vault blocks">

    {status ? <p role="status" className="mt-2 text-sm text-muted-foreground">{status}</p> : null}
    <div className="my-3 flex flex-wrap gap-2">
      <button className="editor-command border border-border" disabled={!note || loadedNoteId !== note.id} onClick={() => openTutor("explain")} title="Ask AI about this note"><Sparkles className="h-4 w-4 text-primary" />Explain</button>
      <button className="editor-command border border-border" disabled={!note || loadedNoteId !== note.id} onClick={() => openTutor("quiz")} title="Create quiz from this note"><BookOpen className="h-4 w-4 text-primary" />Quiz</button>
      <button className="editor-command border border-border" disabled={!note || loadedNoteId !== note.id} onClick={() => openTutor("activity")} title="Plan a study activity"><CalendarDays className="h-4 w-4 text-primary" />Plan</button>
      <button className="editor-command border border-border" disabled={!note || loadedNoteId !== note.id} onClick={() => openTutor("discussion")} title="Draft a discussion space"><MessageSquare className="h-4 w-4 text-primary" />Discuss</button>
    </div>
    <ul className="grid gap-2">{blocks.map((block) => <li key={block.id} className="rounded-md bg-muted p-3">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{block.blockType}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm">{blockText(block)}</p>
      <button className="mt-2 text-sm font-semibold text-primary" onClick={() => openTutor("explain", block)}>Explain block</button>
    </li>)}</ul>
    {blocks.length === 200 ? <p className="mt-2 text-xs text-muted-foreground">Showing the first 200 blocks.</p> : null}
  </section>
}
