"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ComponentType, type KeyboardEvent as ReactKeyboardEvent } from "react"
import { createPortal } from "react-dom"
import { ArrowLeft, ArrowRight, Check, Gamepad2, Layers, ListChecks, Loader2, Presentation, Send, Sparkles, Users, X } from "lucide-react"
import { chatDestinationStorageKey } from "@/lib/chat-destination"
import {
  aiReadyFrom,
  chatTargets,
  hostGame,
  makeCards,
  makeQuiz,
  makeSlides,
  planPassage,
  shareToChat,
  type ChatTarget,
  type ChatThreadSummary,
  type Passage,
  type ProviderList,
  type SavedQuiz,
} from "@/lib/select-actions"
import { cleanSelectionText, isActionableSelection, placeSelectionDock, type DockPlacement } from "@/lib/selection-dock"
import { api } from "./api"
import { Buddy } from "./buddy"

/**
 * The select-to-act pill. Pick a passage in a note or doc (anything inside
 * `[data-select-to-act]`) and a small bar with the buddy offers to turn it
 * into a quiz, review cards or slides, or to send it (or a game made from it)
 * to a chat. Only actions that can work right now are offered: Quiz and Cards
 * need "Term: meaning" lines or a ready AI provider, Share and Play need a
 * conversation with someone.
 */

type Action = "quiz" | "cards" | "slides" | "share" | "play"
type Tone = "violet" | "blue" | "mint" | "coral" | "pink"

type Stage =
  | { name: "ready" }
  | { name: "choose"; action: "share" | "play" }
  | { name: "working"; action: Action }
  | { name: "done"; text: string; next: { label: string; go: () => void } }
  | { name: "failed"; text: string }

interface Snapshot {
  passage: Passage
  range: Range
  root: HTMLElement
  quizLocally: boolean
  cardsLocally: boolean
}

interface DockAction {
  id: Action
  icon: ComponentType<{ className?: string }>
  label: string
  name: string
  tone: Tone
  ai: boolean
}

const WORKING: Record<Action, string> = {
  quiz: "Making a quiz",
  cards: "Making cards",
  slides: "Designing slides",
  share: "Sending",
  play: "Starting a game",
}
const AI_TTL_MS = 5 * 60_000
const CHAT_TTL_MS = 60_000
/** A tap on the pill can clear a phone's selection before the click lands. */
const TAP_GRACE_MS = 700
const PEOPLE_TONES = ["#7b6cf0", "#3b82c4", "#2f9e7a", "#e0694a", "#d99a1e", "#d0508f"]

// Shared by every pill in this page session: one providers read every few
// minutes and one chat list read a minute, however many passages are picked.
let aiCache: { at: number; ready: Promise<boolean> } | null = null
let chatCache: { at: number; chats: Promise<ChatTarget[]> } | null = null

function loadAiReady() {
  if (!aiCache || Date.now() - aiCache.at > AI_TTL_MS) {
    aiCache = { at: Date.now(), ready: api<ProviderList>("/api/ai/providers").then(aiReadyFrom, () => false) }
  }
  return aiCache.ready
}

function loadChats() {
  if (!chatCache || Date.now() - chatCache.at > CHAT_TTL_MS) {
    chatCache = {
      at: Date.now(),
      chats: Promise.all([
        api<{ items?: ChatThreadSummary[] }>("/api/chat"),
        api<{ items?: Array<{ id: string; name: string }> }>("/api/groups").catch(() => ({ items: [] })),
      ]).then(([threads, groups]) => chatTargets(threads.items || [], groups.items || []), () => []),
    }
  }
  return chatCache.chats
}

function readSnapshot(): Snapshot | null {
  const selection = document.getSelection()
  if (!selection || selection.isCollapsed || !selection.rangeCount) return null
  const range = selection.getRangeAt(0)
  const container = range.commonAncestorContainer
  const root = (container instanceof Element ? container : container.parentElement)?.closest<HTMLElement>("[data-select-to-act]")
  if (!root) return null
  const text = cleanSelectionText(selection.toString())
  if (!isActionableSelection(text)) return null
  const holder = document.createElement("div")
  holder.appendChild(range.cloneContents())
  const source = root.closest<HTMLElement>("[data-source-title]")
  const plan = planPassage(text)
  return {
    passage: { text, html: holder.innerHTML, title: source?.dataset.sourceTitle || "", kind: source?.dataset.sourceKind || "notes" },
    range: range.cloneRange(),
    root,
    quizLocally: plan.quizLocally,
    cardsLocally: plan.cardsLocally,
  }
}

function placeFor(snapshot: Snapshot, dock: HTMLElement): DockPlacement | null {
  if (!snapshot.root.isConnected) return null
  const rects = Array.from(snapshot.range.getClientRects()).filter((rect) => rect.width || rect.height)
  if (!rects.length) return null
  const first = rects[0]
  const last = rects[rects.length - 1]
  // Scrolled out of the editor, even if still on screen under its toolbar.
  const bounds = snapshot.root.getBoundingClientRect()
  if (last.bottom < bounds.top || first.top > bounds.bottom) return null
  const touch = window.matchMedia("(pointer: coarse)").matches
  return placeSelectionDock(
    first,
    last,
    { width: dock.offsetWidth, height: dock.offsetHeight },
    { width: document.documentElement.clientWidth, height: window.innerHeight },
    touch ? "below" : "above",
  )
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "?"
}

function personTone(name: string) {
  let hash = 0
  for (let index = 0; index < name.length; index += 1) hash = (hash * 31 + name.charCodeAt(index)) | 0
  return PEOPLE_TONES[Math.abs(hash) % PEOPLE_TONES.length]
}

function rememberThread(userId: string, threadId: string) {
  try { window.localStorage.setItem(chatDestinationStorageKey(userId), JSON.stringify({ kind: "thread", threadId })) }
  catch { /* Chat still opens; it starts at the inbox instead. */ }
}

export function SelectionDock({ userId, view, onOpen, onQuizCreated }: {
  userId?: string
  /** A new place closes the pill and drops any result still on its way. */
  view: string
  onOpen: (href: string) => void
  onQuizCreated?: (quiz: SavedQuiz) => void
}) {
  const [mounted, setMounted] = useState(false)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [stage, setStage] = useState<Stage>({ name: "ready" })
  const [placement, setPlacement] = useState<DockPlacement | null>(null)
  const [aiReady, setAiReady] = useState(false)
  const [chats, setChats] = useState<ChatTarget[]>([])
  const [announcement, setAnnouncement] = useState("")
  const dockRef = useRef<HTMLDivElement>(null)
  const snapshotRef = useRef<Snapshot | null>(null)
  const stageRef = useRef<Stage>(stage)
  const placementRef = useRef<DockPlacement | null>(null)
  const runRef = useRef(0)
  const tapRef = useRef(0)
  const dismissedRef = useRef("")
  const announcedRef = useRef(false)

  useLayoutEffect(() => {
    snapshotRef.current = snapshot
    stageRef.current = stage
    placementRef.current = placement
  })

  useEffect(() => { setMounted(true) }, [])

  const reset = useCallback(() => {
    runRef.current += 1
    setStage({ name: "ready" })
    setSnapshot(null)
    setPlacement(null)
  }, [])

  useEffect(() => { reset() }, [reset, view])

  const warm = useCallback(() => {
    if (!userId) return
    void loadAiReady().then(setAiReady)
    void loadChats().then(setChats)
  }, [userId])

  const dismiss = useCallback((returnFocus: boolean) => {
    const current = snapshotRef.current
    dismissedRef.current = current?.passage.text || ""
    reset()
    if (!returnFocus || !current) return
    current.root.querySelector<HTMLElement>("[contenteditable='true']")?.focus({ preventScroll: true })
    const selection = document.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(current.range)
  }, [reset])

  // Follow the selection: after a drag or tap ends, or a moment after keyboard
  // selection stops changing. A pill that is busy stays put.
  useEffect(() => {
    if (!userId) return
    let timer = 0
    let pointerDown = false
    const refresh = () => {
      if (Date.now() - tapRef.current < TAP_GRACE_MS || stageRef.current.name === "working") return
      const next = readSnapshot()
      if (!next) {
        dismissedRef.current = ""
        if (snapshotRef.current) reset()
        return
      }
      if (next.passage.text === dismissedRef.current) return
      const current = snapshotRef.current
      if (current && current.root === next.root && current.passage.text === next.passage.text) return
      runRef.current += 1
      setStage({ name: "ready" })
      setSnapshot(next)
    }
    const onSelectionChange = () => {
      window.clearTimeout(timer)
      if (!pointerDown) timer = window.setTimeout(refresh, 160)
    }
    const onPointerDown = (event: PointerEvent) => {
      if (dockRef.current?.contains(event.target as Node)) {
        tapRef.current = Date.now()
        return
      }
      // A new drag or tap may pick the same words on purpose: offer the pill again.
      dismissedRef.current = ""
      pointerDown = true
    }
    const onPointerUp = () => {
      if (!pointerDown) return
      pointerDown = false
      window.clearTimeout(timer)
      timer = window.setTimeout(refresh, 20)
    }
    const onFocusIn = (event: FocusEvent) => {
      if (event.target instanceof Element && event.target.closest("[data-select-to-act]")) warm()
    }
    document.addEventListener("selectionchange", onSelectionChange)
    document.addEventListener("pointerdown", onPointerDown, true)
    document.addEventListener("pointerup", onPointerUp, true)
    document.addEventListener("pointercancel", onPointerUp, true)
    document.addEventListener("focusin", onFocusIn)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener("selectionchange", onSelectionChange)
      document.removeEventListener("pointerdown", onPointerDown, true)
      document.removeEventListener("pointerup", onPointerUp, true)
      document.removeEventListener("pointercancel", onPointerUp, true)
      document.removeEventListener("focusin", onFocusIn)
    }
  }, [reset, userId, warm])

  useEffect(() => { if (snapshot) warm() }, [snapshot, warm])

  const measure = useCallback(() => {
    const current = snapshotRef.current
    const dock = dockRef.current
    if (current && dock) setPlacement(placeFor(current, dock))
  }, [])

  useLayoutEffect(() => { measure() }, [aiReady, chats, measure, snapshot, stage])

  useEffect(() => {
    if (!snapshot) return
    let frame = 0
    const onMove = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    window.addEventListener("scroll", onMove, true)
    window.addEventListener("resize", onMove)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("scroll", onMove, true)
      window.removeEventListener("resize", onMove)
    }
  }, [measure, snapshot])

  // Shift+F10, the keyboard's "menu for this", moves into the pill; Escape closes it.
  useEffect(() => {
    if (!snapshot) return
    const onKeyDown = (event: KeyboardEvent) => {
      const dock = dockRef.current
      if (!dock || !placementRef.current) return
      if (event.key === "F10" && event.shiftKey) {
        event.preventDefault()
        dock.querySelector<HTMLButtonElement>("button")?.focus()
      } else if (event.key === "Escape" && stageRef.current.name !== "working") {
        dismiss(dock.contains(document.activeElement))
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [dismiss, snapshot])

  useEffect(() => {
    if (!snapshot || !placement || announcedRef.current) return
    announcedRef.current = true
    setAnnouncement("Selection tools: Shift+F10")
  }, [placement, snapshot])

  const finish = useCallback((href: string) => {
    reset()
    onOpen(href)
  }, [onOpen, reset])

  async function run(action: Action, target?: ChatTarget) {
    const current = snapshotRef.current
    if (!current || !userId) return
    // A newer selection or a new place makes this run stale: it still saves,
    // but never shows a result or moves the learner.
    const runId = ++runRef.current
    const alive = () => runId === runRef.current
    setStage({ name: "working", action })
    try {
      if (action === "quiz") {
        const { quiz } = await makeQuiz(api, current.passage, { aiReady })
        onQuizCreated?.(quiz)
        if (alive()) finish(`/quiz/${encodeURIComponent(quiz.id)}`)
      } else if (action === "cards") {
        const { count } = await makeCards(api, current.passage, { aiReady })
        if (!alive()) return
        setStage({ name: "done", text: count === 1 ? "+1 card" : `+${count} cards`, next: { label: "Review", go: () => finish("/reviews") } })
      } else if (action === "slides") {
        const { id } = await makeSlides(api, current.passage)
        if (alive()) finish(`/slides?design=${encodeURIComponent(id)}`)
      } else if (action === "share" && target) {
        const { threadId } = await shareToChat(api, target, current.passage)
        chatCache = null
        if (!alive()) return
        setStage({ name: "done", text: `Sent to ${target.name}`, next: { label: "Open", go: () => { rememberThread(userId, threadId); finish("/chat") } } })
      } else if (action === "play" && target) {
        const { quiz } = await makeQuiz(api, current.passage, { aiReady })
        onQuizCreated?.(quiz)
        if (!alive()) return
        const { code } = await hostGame(api, target, quiz)
        if (alive()) finish(`/live?code=${encodeURIComponent(code)}`)
      }
    } catch (error) {
      if (alive()) setStage({ name: "failed", text: error instanceof Error ? error.message : "That didn't work." })
    }
  }

  function moveFocus(event: ReactKeyboardEvent<HTMLDivElement>) {
    const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"]
    if (!keys.includes(event.key)) return
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"))
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    if (index < 0 || !buttons.length) return
    event.preventDefault()
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + step + buttons.length) % buttons.length
    buttons[next].focus()
  }

  if (!mounted || !snapshot) return null

  const quizOk = snapshot.quizLocally || aiReady
  const offered: Array<DockAction | null> = [
    quizOk ? { id: "quiz", icon: ListChecks, label: "Quiz", name: "Quiz me", tone: "pink", ai: !snapshot.quizLocally } : null,
    snapshot.cardsLocally || aiReady ? { id: "cards", icon: Layers, label: "Cards", name: "Make review cards", tone: "blue", ai: !snapshot.cardsLocally } : null,
    { id: "slides", icon: Presentation, label: "Slides", name: "Make slides", tone: "coral", ai: false },
    chats.length ? { id: "share", icon: Send, label: "Share", name: "Share to a chat", tone: "mint", ai: false } : null,
    chats.length && quizOk ? { id: "play", icon: Gamepad2, label: "Play", name: "Play a live quiz with a chat", tone: "pink", ai: !snapshot.quizLocally } : null,
  ]
  const actions = offered.filter((action): action is DockAction => Boolean(action))

  const mood = stage.name === "done" ? "excited" : stage.name === "working" ? "happy" : "curious"

  return createPortal(
    <div
      ref={dockRef}
      role="toolbar"
      aria-label="Use selection"
      aria-keyshortcuts="Shift+F10"
      className="select-dock"
      data-stage={stage.name}
      data-side={placement?.side}
      data-keep-editing="true"
      style={placement ? { left: placement.left, top: placement.top } : { left: 0, top: 0, visibility: "hidden" }}
      onMouseDown={(event) => event.preventDefault()}
      onKeyDown={moveFocus}
    >
      {stage.name === "choose" ? (
        <div className="select-dock-panel">
          <div className="select-dock-head">
            <button type="button" className="select-dock-icon" aria-label="Back" onClick={() => setStage({ name: "ready" })}><ArrowLeft className="h-4 w-4" /></button>
            <span>{stage.action === "share" ? "Send to" : "Play with"}</span>
            <Buddy mood="curious" size={24} label="" />
          </div>
          <ul className="select-dock-chats" aria-label={stage.action === "share" ? "Send to" : "Play with"}>
            {chats.map((chat) => (
              <li key={chat.threadId}>
                <button type="button" onClick={() => void run(stage.action, chat)}>
                  <span className="select-dock-avatar" style={{ background: personTone(chat.name) }} aria-hidden="true">{chat.group ? <Users className="h-3.5 w-3.5" /> : initials(chat.name)}</span>
                  <span className="select-dock-chat-name">{chat.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <Buddy mood={mood} size={26} label="" className="select-dock-buddy" />
      )}

      {stage.name === "ready" ? actions.map(({ id, icon: Icon, label, name, tone, ai }) => (
        <button
          key={id}
          type="button"
          className="select-dock-action"
          data-tone={tone}
          aria-label={ai ? `${name} with AI` : name}
          title={ai ? `${name} with AI` : name}
          onClick={() => (id === "share" || id === "play" ? setStage({ name: "choose", action: id }) : void run(id))}
        >
          <Icon className="h-4 w-4" />
          <span className="select-dock-label" aria-hidden="true">{label}</span>
          {ai ? <Sparkles className="select-dock-ai" aria-hidden="true" /> : null}
        </button>
      )) : null}

      {stage.name === "working" ? (
        <span className="select-dock-note" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /><span className="select-dock-note-text">{WORKING[stage.action]}…</span></span>
      ) : null}

      {stage.name === "done" ? (
        <>
          <span className="select-dock-note" role="status"><Check className="h-4 w-4 text-[var(--decor-mint-ink)]" aria-hidden="true" /><span className="select-dock-note-text">{stage.text}</span></span>
          <button type="button" className="select-dock-action" data-tone="violet" onClick={stage.next.go}>
            <span className="select-dock-label select-dock-label-keep">{stage.next.label}</span>
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
          <button type="button" className="select-dock-icon" aria-label="Close" onClick={() => dismiss(false)}><X className="h-4 w-4" /></button>
        </>
      ) : null}

      {stage.name === "failed" ? (
        <>
          <button type="button" className="select-dock-icon" aria-label="Back" onClick={() => setStage({ name: "ready" })}><ArrowLeft className="h-4 w-4" /></button>
          <span className="select-dock-note" data-tone="error" role="alert">{stage.text}</span>
        </>
      ) : null}

      <span className="sr-only" aria-live="polite">{announcement}</span>
    </div>,
    document.body,
  )
}
