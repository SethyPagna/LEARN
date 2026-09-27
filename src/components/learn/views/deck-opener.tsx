"use client"

import { useEffect, useRef, useState } from "react"
import { deckDesignId, deckToDesign } from "@/lib/design/from-deck"
import { parseDeckSlides } from "@/lib/studio-defaults"
import { api } from "../api"
import { designSaveBody } from "../design/use-design-save"
import type { WorkspaceDeck } from "../types"

type SavedDeck = WorkspaceDeck & { speaker_notes?: Record<string, unknown> }

/**
 * Decks from the retired slides editor open here. The first open turns the deck
 * into a presentation design with a fixed id, archives the deck (it can be
 * restored) and moves on to the design; later opens go straight to that copy.
 */
export function DeckOpener({ deckId, aspect, onReady, onHome }: { deckId: string; aspect: "16:9" | "4:3"; onReady: (href: string) => void; onHome: () => void }) {
  const [error, setError] = useState("")
  const [attempt, setAttempt] = useState(0)
  const ready = useRef(onReady)
  ready.current = onReady
  useEffect(() => {
    let active = true
    setError("")
    openDeck(deckId, aspect).then(
      (href) => { if (active) ready.current(href) },
      (reason) => { if (active) setError(reason instanceof Error ? reason.message : "This deck could not be opened.") },
    )
    return () => { active = false }
  }, [deckId, aspect, attempt])

  return <section className="studio-editor-workspace flex min-w-0 items-center justify-center p-6">
    <div className="grid max-w-md gap-3 text-center">
      <p role="status" className="text-sm text-muted-foreground">{error || "Moving this deck to the slides editor…"}</p>
      {error ? <div className="flex flex-wrap justify-center gap-2">
        <button type="button" className="editor-command" onClick={() => setAttempt((value) => value + 1)}>Try again</button>
        <button type="button" className="editor-command" onClick={onHome}>Back to Studio</button>
      </div> : null}
    </div>
  </section>
}

const opening = new Map<string, Promise<string>>()

/**
 * Where the deck's design lives, converting the deck first if this is its first
 * open. A second call while one is running (a remount, a double click) shares it.
 */
export function openDeck(deckId: string, aspect: "16:9" | "4:3"): Promise<string> {
  const running = opening.get(deckId)
  if (running) return running
  const next = convertDeck(deckId, aspect).finally(() => opening.delete(deckId))
  opening.set(deckId, next)
  return next
}

async function convertDeck(deckId: string, aspect: "16:9" | "4:3"): Promise<string> {
  const id = deckDesignId(deckId)
  if (await designExists(id)) {
    // A deck restored after its move leads to the same copy, so it leaves the list again.
    await archiveDeck(deckId)
    return `/slides?design=${encodeURIComponent(id)}`
  }
  const { items } = await api<{ items: SavedDeck[] }>("/api/slides")
  const deck = items.find((item) => item.id === deckId)
  if (!deck) throw new Error("This deck isn't in your Studio any more. It may have been archived.")
  const slides = parseDeckSlides(deck).map((slide, index) => ({ ...slide, speakerNotes: slide.speakerNotes || noteText(deck.speaker_notes?.[String(index)]) }))
  const design = deckToDesign({ id, title: deck.title || "Untitled slides", slides, aspect })
  await api("/api/canvas", { method: "PUT", body: designSaveBody(id, design) })
  await archiveDeck(deckId)
  return `/slides?design=${encodeURIComponent(id)}&from=deck`
}

async function designExists(id: string) {
  const url = `/api/canvas?id=${encodeURIComponent(id)}`
  const response = await fetch(url)
  if (response.ok) return true
  if (response.status === 404) return false
  // Anything else: `api` repeats the request to show the server's reason
  // (and sends someone who is signed out to sign in).
  await api(url)
  return true
}

async function archiveDeck(deckId: string) {
  // The copy is safe either way; a deck left unarchived is archived on its next open.
  await api(`/api/slides?id=${encodeURIComponent(deckId)}`, { method: "DELETE" }).catch(() => undefined)
}

function noteText(value: unknown) {
  return typeof value === "string" ? value : ""
}
