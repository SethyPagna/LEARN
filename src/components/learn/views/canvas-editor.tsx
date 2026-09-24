"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { designPreview, newDesignId, normalizeDesignDoc, type DesignDoc } from "@/lib/design/document"
import { clearDesignDraft, readDesignDraft, readDesignDrafts, shouldRestoreDesignDraft } from "@/lib/design/draft"
import { api } from "../api"
import type { Note } from "../types"
import { DesignEditor, type OpenDesign } from "../design/design-editor"
import { DesignsHome, type DesignSummary } from "../design/designs-home"
import { CANVAS_PRESET_CSS } from "../design/editor-styles"
import { useDesignMeasure } from "../design/text-measure"

interface DesignRecord { id: string; title?: string; content?: unknown; updated_at?: string | null; page_count?: number }

function summary(record: DesignRecord): DesignSummary {
  const { preview, pageCount } = designPreview(record.content)
  return { id: record.id, title: record.title || preview.name, updatedAt: record.updated_at ?? null, pageCount: record.page_count ?? pageCount, preview }
}

function withDrafts(items: DesignSummary[]): DesignSummary[] {
  const merged = new Map(items.map((item) => [item.id, item]))
  for (const draft of readDesignDrafts()) {
    const server = merged.get(draft.id)
    if (shouldRestoreDesignDraft(draft, server?.updatedAt)) merged.set(draft.id, { id: draft.id, title: draft.title, updatedAt: draft.updatedAt, pageCount: draft.design.pages.length, preview: designPreview(draft.design).preview })
  }
  return [...merged.values()].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
}

/** One route and one editor for both legacy canvases and multi-page designs. */
export function CanvasEditorView({ notes = [] }: { notes?: readonly Note[] }) {
  const measure = useDesignMeasure()
  const [items, setItems] = useState<DesignSummary[] | null>(null)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [opened, setOpened] = useState<OpenDesign | null>(null)
  const request = useRef(0)
  const serverIds = useRef(new Set<string>())
  const load = useCallback(async () => {
    setError("")
    try {
      const response = await api<{ items: DesignRecord[] }>("/api/canvas?view=summary")
      serverIds.current = new Set(response.items.map((item) => item.id))
      setItems(withDrafts(response.items.map(summary)))
    } catch (reason) {
      setItems((current) => withDrafts(current ?? []))
      setError(reason instanceof Error ? reason.message : "Designs could not be loaded. Local drafts are still available.")
    }
  }, [])
  useEffect(() => {
    void load()
    const id = new URL(window.location.href).searchParams.get("design")
    if (id) void open(id)
    return () => { request.current += 1 }
  }, [load])

  function setDesignUrl(id: string | null) {
    const url = new URL(window.location.href)
    if (id) url.searchParams.set("design", id)
    else url.searchParams.delete("design")
    // Let Next's history wrapper update its canonical URL. Reusing its internal
    // __NA state skips that update and the next render drops the design query.
    window.history.replaceState({ learnView: "canvas" }, "", url)
  }
  useEffect(() => { if (opened) setDesignUrl(opened.id) }, [opened?.id])

  async function open(id: string) {
    const sequence = ++request.current
    setOpeningId(id)
    setError("")
    const draft = readDesignDraft(id)
    try {
      const response = await api<{ item: DesignRecord }>(`/api/canvas?id=${encodeURIComponent(id)}`)
      if (sequence !== request.current) return
      const saved = normalizeDesignDoc(response.item.content)
      const recover = shouldRestoreDesignDraft(draft, response.item.updated_at)
      setOpened({ id, doc: recover && draft ? draft.design : saved, saved, exists: true })
      setDesignUrl(id)
      if (recover) setMessage("Recovered a newer local draft.")
    } catch (reason) {
      if (sequence !== request.current) return
      if (draft) { setOpened({ id, doc: draft.design, saved: null, exists: serverIds.current.has(id) }); setDesignUrl(id); setMessage("Opened your local draft. Changes will save when the server is available.") }
      else setError(reason instanceof Error ? reason.message : "This design could not be opened.")
    } finally { if (sequence === request.current) setOpeningId(null) }
  }

  function create(doc: DesignDoc, notice = "") {
    request.current += 1
    const id = newDesignId("design")
    setOpened({ id, doc: { ...doc, id }, saved: null, exists: false })
    setDesignUrl(id)
    setOpeningId(null)
    setMessage(notice)
  }

  async function archive(id: string) {
    if (!serverIds.current.has(id)) { setMessage("Open and save this local draft before archiving it."); return }
    try {
      const draft = readDesignDraft(id)
      if (draft) await api("/api/canvas", { method: "PUT", body: JSON.stringify({ id, title: draft.title, content: draft.design }) })
      await api(`/api/canvas?id=${encodeURIComponent(id)}`, { method: "DELETE" })
      clearDesignDraft(id)
      setItems((current) => current?.filter((item) => item.id !== id) ?? [])
      setMessage("Design archived.")
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The design could not be archived.") }
  }

  async function importFile(file: File | undefined) {
    if (!file) return
    try {
      if (file.size > 1_800_000) throw new Error("This design file is too large. Choose a file smaller than 1.8 MB.")
      const value: unknown = JSON.parse(await file.text())
      if (!value || typeof value !== "object" || !("pages" in value || "elements" in value)) throw new Error("Choose a LEARN design or canvas JSON file.")
      create(normalizeDesignDoc(value), "Imported as a new design. The original stays unchanged.")
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The design file could not be opened.") }
  }

  return <section className="learn-canvas-soft min-w-0">
    <style>{CANVAS_PRESET_CSS}</style>
    {message ? <p role="status" className="mb-2 flex justify-between rounded-lg bg-muted px-3 py-2 text-sm">{message}<button type="button" aria-label="Dismiss notice" onClick={() => setMessage("")}>×</button></p> : null}
    {opened ? <DesignEditor key={opened.id} opened={opened} notes={notes} measure={measure} onHome={() => { setOpened(null); setDesignUrl(null); void load() }} onCreate={create} /> : <>
      <label className="canvas-tool mb-3 inline-flex cursor-pointer">Import design<input type="file" className="hidden" accept="application/json,.json" aria-label="Import design JSON" onChange={(event) => { void importFile(event.target.files?.[0]); event.target.value = "" }} /></label>
      <DesignsHome items={items} error={error} notes={notes} measure={measure} openingId={openingId} onOpen={(id) => void open(id)} onCreate={create} onArchive={(id) => void archive(id)} onRetry={() => void load()} onNotify={setMessage} />
    </>}
  </section>
}
