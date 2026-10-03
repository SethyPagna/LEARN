"use client"

import { useMemo, useSyncExternalStore } from "react"
import { designFont, type DesignFontId } from "@/lib/design/fonts"
import { canvasFont } from "@/lib/design/raster"
import { estimateMeasure, type FontSpec, type MeasureText } from "@/lib/design/text"

/**
 * Real glyph measurement for design text in the browser.
 *
 * Lines are broken by `layoutText` (lib/design/text.ts) with whatever measurer
 * it is handed. On screen that is this one: a canvas `measureText` with the
 * exact font string and letter-spacing rule the PNG/PDF export draws with
 * (`canvasFont`, `contextMeasure` in raster.ts), so a line that breaks after
 * "membrane" in the editor breaks there in the export too.
 *
 * Fonts arrive late (next/font, `display: swap`, `preload: false`), and until a
 * face has loaded the canvas measures its fallback. Every time the document's
 * fonts finish loading the width cache is dropped and an epoch counter moves
 * on; `useDesignMeasure` hands out a new measurer per epoch, so memoised
 * layouts recompute exactly once per font arrival.
 */

let epoch = 0
let watching = false
let pending = 0
const listeners = new Set<() => void>()
const widths = new Map<string, number>()
const families = new Map<DesignFontId, string>()
let context: CanvasRenderingContext2D | null = null

function bumpEpoch() {
  if (pending || typeof window === "undefined") return
  pending = window.requestAnimationFrame(() => {
    pending = 0
    widths.clear()
    epoch += 1
    for (const listener of listeners) listener()
  })
}

function watchFonts() {
  if (watching || typeof document === "undefined" || !document.fonts) return
  watching = true
  document.fonts.addEventListener("loadingdone", bumpEpoch)
  void document.fonts.ready.then(bumpEpoch)
}

function subscribe(listener: () => void) {
  watchFonts()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const readEpoch = () => epoch
/** The server (and the hydrating first render) has no fonts to measure. */
const readServerEpoch = () => -1

/**
 * The font-family list for a font id, as loaded on this page: the family names
 * next/font generated (read off the CSS variable) and then the stack's fallback.
 */
export function resolvedFontFamily(id: DesignFontId): string {
  const cached = families.get(id)
  if (cached) return cached
  const font = designFont(id)
  const loaded = typeof document === "undefined" ? "" : getComputedStyle(document.documentElement).getPropertyValue(font.cssVar).trim()
  // An empty variable (stylesheet not applied yet) is retried next time.
  if (!loaded) return font.fallback
  let family = `${loaded}, ${font.fallback}`
  const ctx = measuringContext()
  if (ctx) {
    // A font string the canvas cannot parse is silently ignored, which would
    // measure in whatever face was set before; keep to the plain stack then.
    ctx.font = "10px sans-serif"
    ctx.font = canvasFont(family, 10, 400, false)
    if (ctx.font === "10px sans-serif") family = font.fallback
  }
  families.set(id, family)
  return family
}

function measuringContext(): CanvasRenderingContext2D | null {
  if (context || typeof document === "undefined") return context
  context = document.createElement("canvas").getContext("2d")
  return context
}

function browserMeasure(): MeasureText {
  return (text, font) => {
    const ctx = measuringContext()
    if (!ctx) return estimateMeasure(text, font)
    const key = `${font.font}|${font.size}|${font.weight}|${font.italic ? 1 : 0}|${font.letterSpacing}|${text}`
    const cached = widths.get(key)
    if (cached !== undefined) return cached
    ctx.font = canvasFont(resolvedFontFamily(font.font), font.size, font.weight, font.italic)
    // Same rule as `contextMeasure`: spacing between letters, none after the last.
    const width = ctx.measureText(text).width + Math.max(0, [...text].length - 1) * font.letterSpacing * font.size
    if (widths.size > 20000) widths.clear()
    widths.set(key, width)
    return width
  }
}

/**
 * The measurer to lay design text out with. It is the deterministic estimate
 * on the server and during hydration (so server and client markup agree), and
 * real glyph widths from then on, renewed whenever fonts finish loading.
 */
export function useDesignMeasure(): MeasureText {
  const current = useSyncExternalStore(subscribe, readEpoch, readServerEpoch)
  return useMemo(() => (current < 0 ? estimateMeasure : browserMeasure()), [current])
}

/**
 * Load the faces a set of text runs needs (canvas drawing never triggers a
 * font download by itself). Resolves once they are ready or have failed;
 * a failed face just draws in its fallback.
 */
export async function loadDesignFonts(specs: Array<Pick<FontSpec, "font" | "weight" | "italic">>): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return
  const wanted = new Set(specs.map((spec) => canvasFont(resolvedFontFamily(spec.font), 32, spec.weight, spec.italic)))
  await Promise.all([...wanted].map((font) => document.fonts.load(font).catch(() => [])))
}
