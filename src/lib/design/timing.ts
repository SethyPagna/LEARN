import type { CanvasElement } from "@/lib/studio/canvas-engine"

import { ELEMENT_ANIMATION_EFFECTS, entrancePlan } from "./animation"
import type { DesignDoc, DesignPage } from "./document"
import { exportPageIndices } from "./export-plan"
import { tablePlainText } from "./table"

/**
 * How long a design takes to present, estimated as the old slides did: the
 * words on a page and in its notes at a steady speaking pace (2.4 words a
 * second, about 145 a minute), at least a few seconds a page, plus the time
 * its entrances take. Also the clock behind present mode's rehearsal timer.
 * Pure: no DOM.
 */

export const WORDS_PER_SECOND = 2.4
export const MIN_PAGE_SECONDS = 4

/** The words an element shows (hidden elements and pictures show none). */
export function elementText(element: CanvasElement): string {
  if (element.hidden) return ""
  if (element.type === "text" || element.type === "shape") return element.content.trim()
  if (element.type === "table") return tablePlainText(element.content)
  return ""
}

let segmenter: Intl.Segmenter | null | undefined

/** Words in any script: Khmer, Thai and Chinese have no spaces between words, so a word breaker counts them. */
export function countWords(text: string): number {
  if (!text.trim()) return 0
  if (segmenter === undefined) segmenter = typeof Intl !== "undefined" && typeof Intl.Segmenter === "function" ? new Intl.Segmenter(undefined, { granularity: "word" }) : null
  if (!segmenter) return text.trim().split(/\s+/).length
  let count = 0
  for (const part of segmenter.segment(text)) if (part.isWordLike) count += 1
  return count
}

export function pageWords(page: Pick<DesignPage, "elements" | "notes">): number {
  return countWords([...page.elements.map(elementText), page.notes].join("\n"))
}

/** Milliseconds from a page showing until its last entrance has finished. */
export function entrancesMs(elements: readonly CanvasElement[]): number {
  let end = 0
  for (const step of entrancePlan(elements)) end = Math.max(end, step.delay + ELEMENT_ANIMATION_EFFECTS[step.animation].duration)
  return end
}

export function estimatePageSeconds(page: Pick<DesignPage, "elements" | "notes">): number {
  return Math.max(MIN_PAGE_SECONDS, Math.ceil(pageWords(page) / WORDS_PER_SECOND)) + Math.ceil(entrancesMs(page.elements) / 1000)
}

/** The pages that are presented (every visible page, or all when all are hidden), or the ones given. */
export function estimateDesignSeconds(doc: Pick<DesignDoc, "pages">, indices: readonly number[] = exportPageIndices(doc)): number {
  return indices.reduce((total, index) => total + (doc.pages[index] ? estimatePageSeconds(doc.pages[index]) : 0), 0)
}

/** "40 s", "3 min", "1 h 5 min": a rough length, for estimates. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  if (total < 60) return `${total} s`
  const minutes = Math.round(total / 60)
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ""}`
}

/** "01:23", or "1:02:03" past an hour: a running clock. */
export function formatClock(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const pad = (value: number) => String(value).padStart(2, "0")
  return hours ? `${hours}:${pad(minutes % 60)}:${pad(seconds % 60)}` : `${pad(minutes)}:${pad(seconds % 60)}`
}

// ---------------------------------------------------------------------------
// The rehearsal clock
// ---------------------------------------------------------------------------

/**
 * Time presenting, which can be paused. `banked` is the time counted before
 * the clock last started (`since`, or null while paused); `pageMark` is the
 * time on the clock when the current page showed.
 */
export interface RehearsalClock {
  banked: number
  since: number | null
  pageMark: number
}

export function startClock(at: number): RehearsalClock {
  return { banked: 0, since: at, pageMark: 0 }
}

export function clockElapsed(clock: RehearsalClock, at: number): number {
  return clock.banked + (clock.since === null ? 0 : Math.max(0, at - clock.since))
}

/** Time on the current page. */
export function clockPageElapsed(clock: RehearsalClock, at: number): number {
  return Math.max(0, clockElapsed(clock, at) - clock.pageMark)
}

export function toggleClock(clock: RehearsalClock, at: number): RehearsalClock {
  return clock.since === null ? { ...clock, since: at } : { ...clock, banked: clockElapsed(clock, at), since: null }
}

/** A new page showed: its own time starts from here. */
export function markClockPage(clock: RehearsalClock, at: number): RehearsalClock {
  return { ...clock, pageMark: clockElapsed(clock, at) }
}
