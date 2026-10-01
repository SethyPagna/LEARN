"use client"

import { useEffect, useRef, useState } from "react"
import { Sparkles, BookOpen, CalendarDays, MessageSquare, Plus } from "lucide-react"
import type { TutorSource } from "@/lib/ai/source-launch"
import { api } from "./api"
import type { Note } from "./types"
import { VaultBlockContent } from "./vault-block-content"
import { AiBlockStyles } from "./ai-block-renderer"
import { Popover } from "./design/popover"

interface VaultBlock {
  id: string
  blockType: string
  content: Record<string, unknown>
}

function blockText(block: VaultBlock): string {
  return typeof block.content.text === "string" ? block.content.text : JSON.stringify(block.content)
}

export function VaultNoteBlocks({ note, revision, onOpenAiSource }: { note?: Note; revision: number; onOpenAiSource: (source: TutorSource) => void }) {
  const [blocks, setBlocks] = useState<VaultBlock[]>([])
  const [status, setStatus] = useState("")
  const [loadedNoteId, setLoadedNoteId] = useState("")
  const [aiMenuOpen, setAiMenuOpen] = useState(false)
  const aiMenuTrigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    let current = true
    setBlocks([])
    setLoadedNoteId("")
    setAiMenuOpen(false)
    if (!note) return
    setStatus("Loading saved blocks…")
    void api<{ items: VaultBlock[] }>(`/api/vault/blocks?noteId=${encodeURIComponent(note.id)}`).then((response) => {
      if (!current) return
      setBlocks(response.items)
      setLoadedNoteId(note.id)
      setStatus("")
    }).catch((error: unknown) => {
      if (current) setStatus(error instanceof Error ? error.message : "Unable to load saved blocks.")
    })
    return () => { current = false }
  }, [note?.id, revision])

  function openTutor(task: "explain" | "quiz" | "activity" | "discussion", block?: VaultBlock) {
    if (!note || loadedNoteId !== note.id) return
    try {
      const content = block ? blockText(block) : [note.content, ...blocks.map(blockText)].filter(Boolean).join("\n\n")
      onOpenAiSource({ title: block ? `${note.title} · ${block.blockType} block` : note.title, content, task })
    } catch {
      setStatus("The AI source could not be saved in this browser. Check local storage and try again.")
    }
  }

  const visibleBlocks = loadedNoteId === note?.id ? blocks : []

  return <section className="vault-blocks" aria-label="Saved Vault blocks">
    <AiBlockStyles />
    {note?.content.trim() ? <div aria-label="Note content" tabIndex={-1} data-select-to-act data-source-title={note.title} data-source-kind="notes" data-source-id={note.id}><VaultBlockContent text={note.content} includeStyles={false} /></div> : null}
    {status ? <p role="status" className="mt-2 text-sm text-muted-foreground">{status}</p> : null}
    <div className="my-3">
      <button ref={aiMenuTrigger} type="button" className="editor-command border border-border" aria-label="Ask AI about this note" aria-haspopup="dialog" aria-expanded={aiMenuOpen} disabled={!note || loadedNoteId !== note.id} onClick={() => setAiMenuOpen(open => !open)}><Sparkles className="h-4 w-4 text-primary" />Ask AI</button>
      <Popover open={aiMenuOpen} anchor={aiMenuTrigger} onClose={() => setAiMenuOpen(false)} label="Ask AI about this note" width={200} focusOnOpen>
        <div className="grid gap-1 p-2">{([
          ["explain", "Explain", Sparkles], ["quiz", "Quiz", BookOpen],
          ["activity", "Study activity", CalendarDays], ["discussion", "Discussion", MessageSquare],
        ] as const).map(([task, label, Icon]) => <button key={task} type="button" className="editor-command w-full justify-start" onClick={() => { setAiMenuOpen(false); openTutor(task) }}><Icon className="h-4 w-4" />{label}</button>)}</div>
      </Popover>
    </div>
    {!blocks.length && loadedNoteId === note?.id ? <div className="grid justify-items-center gap-2 rounded-lg border border-dashed border-border py-8 text-muted-foreground"><Plus aria-hidden="true" className="h-6 w-6 text-primary/50" /><span className="text-xs">No blocks yet</span></div> : null}
    <ul className="grid gap-2">{visibleBlocks.map((block) => <li key={block.id} className="rounded-md bg-muted p-3">
      <div className="flex items-center justify-between gap-2"><p className="text-xs font-medium text-muted-foreground">{block.blockType.replaceAll("-", " ")}</p><button className="editor-command" aria-label={`Explain ${block.blockType} block`} title="Explain block" onClick={() => openTutor("explain", block)}><Sparkles className="h-4 w-4 text-primary" /></button></div>
      <div tabIndex={-1} data-select-to-act data-source-title={`${note?.title || "Note"} · ${block.blockType} block`} data-source-kind="notes" data-source-id={`${note?.id}:${block.id}`}><VaultBlockContent text={blockText(block)} blockType={block.blockType} includeStyles={false} /></div>
    </li>)}</ul>
    {visibleBlocks.length === 200 ? <p className="mt-2 text-xs text-muted-foreground">Showing the first 200 blocks.</p> : null}
  </section>
}
