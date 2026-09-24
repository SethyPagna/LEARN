"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { canvasDeepEqual } from "@/lib/studio/canvas-engine"
import { serializeDesign, type DesignDoc } from "@/lib/design/document"
import { clearDesignDraft, writeDesignDraft, type DesignDraftReason } from "@/lib/design/draft"
import { createLatestSaveQueue } from "@/lib/design/save-queue"

import { api } from "../api"

/**
 * Keeping a design safe while it is edited.
 *
 * Every change is written to a local draft within a moment (and again when the
 * tab is hidden or closed), and saved to the server a little after typing
 * stops. Saves are queued, never overlapped: a change made while a save is in
 * flight is sent right after it, so the server always ends on the newest
 * version. The draft is dropped only once the server has the exact version it
 * holds, so a failed save, a closed laptop or a lost connection never loses
 * work: the next visit offers the draft back.
 *
 * Nothing is sent while the design still equals what the server (or a new,
 * blank design) started with.
 */

export type SaveStatus = "clean" | "dirty" | "saving" | "saved" | "error"

/** The server's copy after a save: what the designs list shows. */
export interface SavedDesignRecord {
  id: string
  title: string
  updatedAt: string | null
}

/** Request bodies above this are refused before sending (the server's limit is a little higher). */
export const MAX_DESIGN_SAVE_BYTES = 1_800_000
const AUTOSAVE_DELAY = 1100
const DRAFT_DELAY = 300

interface ServerRecord {
  id?: string
  title?: string
  updated_at?: string | null
}

/**
 * The PUT body with the design spliced in as raw JSON: the design is already
 * serialized with a stable key order, so it is not parsed and stringified a
 * second time.
 */
export function designSaveBody(recordId: string, design: DesignDoc): string {
  const head = JSON.stringify({ id: recordId, title: design.name.trim() || "Untitled design" })
  return `${head.slice(0, -1)},"content":${serializeDesign(design)}}`
}

function byteLength(text: string): number {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(text).length
  return text.length
}

function megabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

interface UseDesignSaveOptions {
  recordId: string
  design: DesignDoc
  /** What the server already holds (or a blank design's starting point); null saves right away. */
  initialSaved: DesignDoc | null
  /** Whether the server already has a record with this id. */
  exists: boolean
  onSaved?: (record: SavedDesignRecord, design: DesignDoc) => void
}

export interface DesignSaveState {
  status: SaveStatus
  error: string
  /** Whether the server has this design (a share link needs a stored record). */
  exists: boolean
  /** Save now (the Retry button, leaving the editor). Resolves once the server has the newest version or the save failed. */
  saveNow: () => Promise<boolean>
  /** Whether the current design differs from the server's copy. */
  isDirty: () => boolean
}

export function useDesignSave({ recordId, design, initialSaved, exists: initiallyExists, onSaved }: UseDesignSaveOptions): DesignSaveState {
  const savedRef = useRef<DesignDoc | null>(initialSaved)
  const designRef = useRef(design)
  const existsRef = useRef(initiallyExists)
  const onSavedRef = useRef(onSaved)
  const saveTimerRef = useRef<number | undefined>(undefined)
  const draftTimerRef = useRef<number | undefined>(undefined)
  const [status, setStatus] = useState<SaveStatus>(() => (initialSaved && (initialSaved === design || canvasDeepEqual(initialSaved, design)) ? (initiallyExists ? "saved" : "clean") : "dirty"))
  const [error, setError] = useState("")
  const [exists, setExists] = useState(initiallyExists)

  useEffect(() => {
    onSavedRef.current = onSaved
  })

  const dirty = useCallback((doc: DesignDoc) => {
    const saved = savedRef.current
    return !saved || (saved !== doc && !canvasDeepEqual(saved, doc))
  }, [])

  const writeDraft = useCallback(
    (reason: DesignDraftReason) => {
      const doc = designRef.current
      if (!dirty(doc)) return
      writeDesignDraft({ id: recordId, title: doc.name, design: doc, updatedAt: new Date().toISOString(), reason })
    },
    [dirty, recordId],
  )

  const saveOnce = useCallback(async (): Promise<boolean> => {
    const doc = designRef.current
    if (!dirty(doc)) {
      setStatus(existsRef.current ? "saved" : "clean")
      return true
    }
    const body = designSaveBody(recordId, doc)
    const bytes = byteLength(body)
    if (bytes > MAX_DESIGN_SAVE_BYTES) {
      writeDraft("save-failed")
      setStatus("error")
      setError(`This design is too large to save (${megabytes(bytes)}; the limit is ${megabytes(MAX_DESIGN_SAVE_BYTES)}). Pictures pasted in as data take the most room: upload them instead, or split the design.`)
      return false
    }
    setStatus("saving")
    try {
        const { item } = await api<{ item: ServerRecord }>("/api/canvas", { method: "PUT", body })
        savedRef.current = doc
        existsRef.current = true
        setExists(true)
        setError("")
        // Only drop the draft if nothing changed while the request was out.
        if (designRef.current === doc) clearDesignDraft(recordId)
        onSavedRef.current?.({ id: item?.id ?? recordId, title: item?.title ?? doc.name, updatedAt: item?.updated_at ?? null }, doc)
        return true
    } catch (reason) {
        writeDraft("save-failed")
        setStatus("error")
        setError(reason instanceof Error && reason.message ? reason.message : "The design could not be saved.")
        return false
    }
  }, [dirty, recordId, writeDraft])

  const queue = useMemo(() => createLatestSaveQueue({ isDirty: () => dirty(designRef.current), saveOnce }), [dirty, saveOnce])
  const runSave = useCallback(async () => {
    const ok = await queue.flush()
    if (ok) setStatus(existsRef.current ? "saved" : "clean")
    return ok
  }, [queue])

  useEffect(() => {
    designRef.current = design
    window.clearTimeout(draftTimerRef.current)
    window.clearTimeout(saveTimerRef.current)
    if (!dirty(design)) {
      setStatus((current) => (current === "saving" ? current : existsRef.current ? "saved" : "clean"))
      return
    }
    setStatus((current) => (current === "saving" ? current : "dirty"))
    draftTimerRef.current = window.setTimeout(() => writeDraft("unsaved"), DRAFT_DELAY)
    saveTimerRef.current = window.setTimeout(() => void runSave(), AUTOSAVE_DELAY)
  }, [design, dirty, runSave, writeDraft])

  // A hidden or closing tab writes its draft at once. Use the same queue as
  // autosave: a separate keepalive request could finish after a newer edit.
  useEffect(() => {
    const flush = () => {
      const doc = designRef.current
      if (!dirty(doc)) return
      writeDraft("unsaved")
      void runSave()
    }
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush()
    }
    window.addEventListener("pagehide", flush)
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      window.removeEventListener("pagehide", flush)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [dirty, runSave, writeDraft])

  // Leaving the editor (Home, another view) keeps the draft and sends the save.
  useEffect(
    () => () => {
      window.clearTimeout(draftTimerRef.current)
      window.clearTimeout(saveTimerRef.current)
      if (dirty(designRef.current)) {
        writeDraft("unsaved")
        void runSave()
      }
    },
    [dirty, runSave, writeDraft],
  )

  const saveNow = useCallback(() => {
    window.clearTimeout(saveTimerRef.current)
    return runSave()
  }, [runSave])

  const isDirty = useCallback(() => dirty(designRef.current), [dirty])

  return { status, error, exists, saveNow, isDirty }
}
