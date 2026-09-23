"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { ChevronLeft, ChevronRight, Expand, NotebookPen, Shrink, Timer, X } from "lucide-react"

import type { DesignDoc, PageTransition } from "@/lib/design/document"
import type { MeasureText } from "@/lib/design/text"

import { DesignPageView } from "./design-renderer"

/**
 * Full-screen presenting. Hidden pages are skipped, each page enters with its
 * own transition, and the controls fade away while the mouse rests.
 *
 * Keys: → ↓ Space PageDown next; ← ↑ PageUp Backspace back; Home / End; S
 * speaker notes; B black screen; F full screen; Esc leaves. Click the right
 * two thirds of the page to go on and the left third to go back; swipe on
 * touch screens.
 */

export interface PresentModeProps {
  design: DesignDoc
  startIndex: number
  measure: MeasureText
  /** Called with the page (design index) that was showing. */
  onClose: (pageIndex: number) => void
}

const PRESENT_CSS = `
@keyframes design-present-fade { from { opacity: 0 } }
@keyframes design-present-slide-next { from { opacity: 0; transform: translateX(7%) } }
@keyframes design-present-slide-back { from { opacity: 0; transform: translateX(-7%) } }
@keyframes design-present-zoom { from { opacity: 0; transform: scale(0.9) } }
.design-present-fade { animation: design-present-fade 380ms ease-out both }
.design-present-slide-next { animation: design-present-slide-next 420ms cubic-bezier(0.2, 0.8, 0.2, 1) both }
.design-present-slide-back { animation: design-present-slide-back 420ms cubic-bezier(0.2, 0.8, 0.2, 1) both }
.design-present-zoom { animation: design-present-zoom 420ms cubic-bezier(0.2, 0.8, 0.2, 1) both }
@media (prefers-reduced-motion: reduce) {
  .design-present-fade, .design-present-slide-next, .design-present-slide-back, .design-present-zoom { animation: none }
}
`

function transitionClass(transition: PageTransition, direction: 1 | -1): string {
  if (transition === "fade") return "design-present-fade"
  if (transition === "slide") return direction > 0 ? "design-present-slide-next" : "design-present-slide-back"
  if (transition === "zoom") return "design-present-zoom"
  return ""
}

function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const pad = (value: number) => String(value).padStart(2, "0")
  return hours ? `${hours}:${pad(minutes % 60)}:${pad(seconds % 60)}` : `${pad(minutes)}:${pad(seconds % 60)}`
}

/** The design indices that are presented: every visible page, or every page when all are hidden. */
export function presentOrder(pages: readonly { hidden: boolean }[]): number[] {
  const visible = pages.map((page, index) => (page.hidden ? -1 : index)).filter((index) => index >= 0)
  return visible.length ? visible : pages.map((_, index) => index)
}

export function PresentMode({ design, startIndex, measure, onClose }: PresentModeProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const order = useMemo(() => presentOrder(design.pages), [design.pages])
  const [view, setView] = useState<{ position: number; direction: 1 | -1 }>(() => {
    const exact = order.indexOf(startIndex)
    const after = order.findIndex((index) => index > startIndex)
    return { position: exact >= 0 ? exact : after >= 0 ? after : Math.max(0, order.length - 1), direction: 1 }
  })
  const [showNotes, setShowNotes] = useState(false)
  const [blackout, setBlackout] = useState(false)
  const [controls, setControls] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [startedAt] = useState(() => Date.now())
  const [now, setNow] = useState(() => Date.now())
  const hideTimer = useRef<number | null>(null)
  const enteredFullscreen = useRef(false)
  const swipe = useRef<{ x: number; y: number; id: number } | null>(null)
  const swiped = useRef(false)

  const position = Math.min(view.position, order.length - 1)
  const pageIndex = order[position] ?? 0
  const page = design.pages[pageIndex]

  const close = useCallback(() => onClose(pageIndex), [onClose, pageIndex])
  const closeRef = useRef(close)
  useEffect(() => {
    closeRef.current = close
  })

  const goTo = useCallback(
    (target: number) => {
      setBlackout(false)
      setView((current) => {
        const next = Math.max(0, Math.min(order.length - 1, target))
        return next === current.position ? current : { position: next, direction: next > current.position ? 1 : -1 }
      })
    },
    [order.length],
  )
  const go = useCallback(
    (step: number) => {
      setBlackout(false)
      setView((current) => {
        const next = Math.max(0, Math.min(order.length - 1, current.position + step))
        return next === current.position ? current : { position: next, direction: step > 0 ? 1 : -1 }
      })
    },
    [order.length],
  )

  const pokeControls = useCallback(() => {
    setControls(true)
    if (hideTimer.current) window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => setControls(false), 2600)
  }, [])

  const toggleFullscreen = useCallback(() => {
    const root = rootRef.current
    if (!root) return
    if (document.fullscreenElement) {
      enteredFullscreen.current = false
      void document.exitFullscreen().catch(() => undefined)
    } else if (typeof root.requestFullscreen === "function") {
      void root.requestFullscreen({ navigationUI: "hide" }).catch(() => undefined)
    }
  }, [])

  // Enter full screen (the Present press is still a fresh user gesture), and
  // stop presenting when the browser leaves full screen by its own Esc.
  useEffect(() => {
    const root = rootRef.current
    root?.focus()
    const onChange = () => {
      const active = Boolean(document.fullscreenElement)
      setFullscreen(active)
      if (active) enteredFullscreen.current = true
      else if (enteredFullscreen.current) {
        enteredFullscreen.current = false
        closeRef.current()
      }
    }
    document.addEventListener("fullscreenchange", onChange)
    if (root && typeof root.requestFullscreen === "function" && !document.fullscreenElement) {
      root.requestFullscreen({ navigationUI: "hide" }).catch(() => undefined)
    }
    return () => {
      document.removeEventListener("fullscreenchange", onChange)
      if (document.fullscreenElement && document.fullscreenElement === root) {
        enteredFullscreen.current = false
        void document.exitFullscreen().catch(() => undefined)
      }
    }
  }, [])

  // Fit the page into the stage.
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const measureStage = () => setSize({ width: stage.clientWidth, height: stage.clientHeight })
    measureStage()
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measureStage)
    observer?.observe(stage)
    window.addEventListener("resize", measureStage)
    return () => {
      observer?.disconnect()
      window.removeEventListener("resize", measureStage)
    }
  }, [])

  useEffect(() => {
    pokeControls()
    const clock = window.setInterval(() => setNow(Date.now()), 1000)
    return () => {
      window.clearInterval(clock)
      if (hideTimer.current) window.clearTimeout(hideTimer.current)
    }
  }, [pokeControls])

  // Captured on the window, so the editor's own shortcuts never see these keys.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      const key = event.key
      const onButton = event.target instanceof HTMLButtonElement
      let handled = true
      if (key === "ArrowRight" || key === "ArrowDown" || key === "PageDown" || ((key === " " || key === "Enter") && !onButton)) go(1)
      else if (key === "ArrowLeft" || key === "ArrowUp" || key === "PageUp" || key === "Backspace") go(-1)
      else if (key === "Home") goTo(0)
      else if (key === "End") goTo(order.length - 1)
      else if (key === "Escape") closeRef.current()
      else if (key === "s" || key === "S") setShowNotes((current) => !current)
      else if (key === "b" || key === "B" || key === ".") setBlackout((current) => !current)
      else if (key === "f" || key === "F") toggleFullscreen()
      else if (key === "Tab") {
        pokeControls()
        handled = false
      } else handled = false
      if (handled) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [go, goTo, order.length, pokeControls, toggleFullscreen])

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    swiped.current = false
    if (event.pointerType !== "mouse") swipe.current = { x: event.clientX, y: event.clientY, id: event.pointerId }
  }
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = swipe.current
    swipe.current = null
    if (!start || start.id !== event.pointerId) return
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      swiped.current = true
      go(dx < 0 ? 1 : -1)
    }
  }
  const onStageClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (swiped.current) {
      swiped.current = false
      return
    }
    if ((event.target as HTMLElement).closest("[data-present-control]")) return
    const rect = event.currentTarget.getBoundingClientRect()
    go(event.clientX - rect.left < rect.width / 3 ? -1 : 1)
  }

  if (!page || typeof document === "undefined") return null

  const scale = size.width && size.height ? Math.min(size.width / design.width, size.height / design.height) : 0
  const neighbours = [order[position - 1], order[position + 1]].filter((index): index is number => typeof index === "number")
  const notes = page.notes.trim()

  return createPortal(
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Presenting ${design.name}`}
      tabIndex={-1}
      className={`fixed inset-0 z-[200] flex flex-col bg-black text-white outline-none [touch-action:none] ${controls ? "" : "cursor-none"}`}
      onPointerMove={pokeControls}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
    >
      <style>{PRESENT_CSS}</style>
      <div ref={stageRef} className="relative min-h-0 flex-1 select-none overflow-hidden" onClick={onStageClick}>
        {scale > 0 ? (
          <div className="absolute left-1/2 top-1/2" style={{ width: design.width * scale, height: design.height * scale, transform: "translate(-50%, -50%)" }}>
            <div key={page.id} className={transitionClass(page.transition, view.direction)} style={{ width: design.width * scale, height: design.height * scale }}>
              <div style={{ width: design.width, height: design.height, transform: `scale(${scale})`, transformOrigin: "0 0" }}>
                <DesignPageView width={design.width} height={design.height} theme={design.theme} page={page} measure={measure} />
              </div>
            </div>
          </div>
        ) : null}
        {/* The pages either side are laid out off-screen, so their pictures are loaded before they are needed. */}
        <div aria-hidden="true" className="pointer-events-none absolute left-0 top-0 h-px w-px overflow-hidden opacity-0">
          {neighbours.map((index) => (
            <DesignPageView key={design.pages[index].id} width={design.width} height={design.height} theme={design.theme} page={design.pages[index]} measure={measure} />
          ))}
        </div>
        {blackout ? <div className="absolute inset-0 bg-black" role="status" aria-label="Screen blanked; press B to show the page" /> : null}

        <div data-present-control className={`absolute inset-x-0 bottom-0 flex items-center justify-center p-4 transition-opacity duration-300 ${controls ? "opacity-100" : "pointer-events-none opacity-0"}`}>
          <div className="flex items-center gap-1 rounded-2xl bg-neutral-900/85 p-1.5 shadow-2xl ring-1 ring-white/10 backdrop-blur">
            <PresentButton label="Previous page (←)" onClick={() => go(-1)} disabled={position === 0}>
              <ChevronLeft className="h-5 w-5" />
            </PresentButton>
            <span className="min-w-[4.5rem] px-2 text-center text-sm font-semibold tabular-nums" aria-live="polite">
              {position + 1} / {order.length}
            </span>
            <PresentButton label="Next page (→)" onClick={() => go(1)} disabled={position >= order.length - 1}>
              <ChevronRight className="h-5 w-5" />
            </PresentButton>
            <span className="mx-1 h-6 w-px bg-white/15" aria-hidden="true" />
            <span className="hidden items-center gap-1.5 px-2 text-xs tabular-nums text-white/70 sm:inline-flex" title="Time presenting">
              <Timer className="h-3.5 w-3.5" aria-hidden="true" />
              {formatElapsed(now - startedAt)}
            </span>
            <PresentButton label={showNotes ? "Hide speaker notes (S)" : "Show speaker notes (S)"} onClick={() => setShowNotes((current) => !current)} active={showNotes}>
              <NotebookPen className="h-4 w-4" />
            </PresentButton>
            <PresentButton label={fullscreen ? "Leave full screen (F)" : "Full screen (F)"} onClick={toggleFullscreen}>
              {fullscreen ? <Shrink className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
            </PresentButton>
            <PresentButton label="Stop presenting (Esc)" onClick={close}>
              <X className="h-4 w-4" />
            </PresentButton>
          </div>
        </div>
      </div>
      {showNotes ? (
        <div data-present-control className="max-h-[32vh] shrink-0 overflow-y-auto border-t border-white/10 bg-neutral-950 px-6 py-4 [touch-action:pan-y]">
          <p className="mb-1 text-[0.65rem] font-bold uppercase tracking-[0.16em] text-white/50">Notes · page {pageIndex + 1}</p>
          <p className="whitespace-pre-wrap text-base leading-7 text-white/90">{notes || "No notes on this page. Add them under the page in the editor."}</p>
        </div>
      ) : null}
    </div>,
    document.body,
  )
}

function PresentButton({ label, onClick, disabled, active, children }: { label: string; onClick: () => void; disabled?: boolean; active?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-xl transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-30 ${active ? "bg-white/20" : ""}`}
    >
      {children}
    </button>
  )
}
