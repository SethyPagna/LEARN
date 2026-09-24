"use client"

import { useEffect, useState } from "react"
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

  return <section className="mt-4 rounded-md border border-border p-3" aria-label="Saved Vault blocks">
    <h4 className="font-semibold">Saved blocks for {note?.title || "your note"}</h4>
    {status ? <p role="status" className="mt-2 text-sm text-muted-foreground">{status}</p> : null}
    <div className="my-3 flex flex-wrap gap-2">
      <button className="rounded-md border px-3 py-2 text-sm" disabled={!note || loadedNoteId !== note.id} onClick={() => openTutor("explain")}>Ask AI about this note</button>
      <button className="rounded-md border px-3 py-2 text-sm" disabled={!note || loadedNoteId !== note.id} onClick={() => openTutor("quiz")}>Create quiz from this note</button>
      <button className="rounded-md border px-3 py-2 text-sm" disabled={!note || loadedNoteId !== note.id} onClick={() => openTutor("activity")}>Plan a study activity</button>
      <button className="rounded-md border px-3 py-2 text-sm" disabled={!note || loadedNoteId !== note.id} onClick={() => openTutor("discussion")}>Draft a discussion space</button>
    </div>
    <ul className="grid gap-2">{blocks.map((block) => <li key={block.id} className="rounded-md bg-muted p-3">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{block.blockType}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm">{blockText(block)}</p>
      <button className="mt-2 text-sm font-semibold text-primary" onClick={() => openTutor("explain", block)}>Ask AI about this block</button>
    </li>)}</ul>
    {blocks.length === 200 ? <p className="mt-2 text-xs text-muted-foreground">Showing the first 200 blocks.</p> : null}
  </section>
}
