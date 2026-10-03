import type { CanvasElement } from "@/lib/studio/canvas-engine"

/**
 * How elements enter a page when it is presented.
 *
 * An element can have one entrance (`style.animation`): Rise lifts it in,
 * Reveal wipes it in from the left, and Emphasis pops it in with a small
 * overshoot. When a page shows, its animated elements enter one after another
 * in layer order (bottom first), the members of a group together.
 *
 * The effects are Web Animations keyframes for the element's frame. They use
 * the `translate`, `scale` and `clip-path` properties, never `transform`, so
 * an element's own rotation is left alone. Pure: no DOM.
 */

export const ELEMENT_ANIMATIONS = ["rise", "reveal", "emphasis"] as const
export type ElementAnimation = (typeof ELEMENT_ANIMATIONS)[number]

export const ELEMENT_ANIMATION_LABELS: Record<ElementAnimation, string> = {
  rise: "Rise",
  reveal: "Reveal",
  emphasis: "Emphasis",
}

export interface EntranceEffect {
  keyframes: Array<Record<string, string | number>>
  /** Milliseconds. */
  duration: number
  easing: string
}

export const ELEMENT_ANIMATION_EFFECTS: Record<ElementAnimation, EntranceEffect> = {
  rise: {
    keyframes: [{ opacity: 0, translate: "0 48px" }, { opacity: 1, translate: "0 0" }],
    duration: 520,
    easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
  },
  // The wipe's other three edges sit far outside the frame, so a shadow or glow
  // is never cut off on those sides while it plays.
  reveal: {
    keyframes: [{ clipPath: "inset(-100vmax 100% -100vmax -100vmax)" }, { clipPath: "inset(-100vmax 0% -100vmax -100vmax)" }],
    duration: 600,
    easing: "cubic-bezier(0.65, 0, 0.35, 1)",
  },
  emphasis: {
    keyframes: [{ opacity: 0, scale: "0.8" }, { opacity: 1, scale: "1.06", offset: 0.6 }, { opacity: 1, scale: "1" }],
    duration: 480,
    easing: "ease-out",
  },
}

/** When the first entrance starts (the page's own transition is under way), and the gap between entrances. */
export const ENTRANCE_START_MS = 250
export const ENTRANCE_GAP_MS = 220

/**
 * An effect's keyframes for an element whose own opacity is `opacity`, so a
 * see-through element fades up to its own opacity rather than past it.
 */
export function entranceKeyframes(animation: ElementAnimation, opacity = 1): Array<Record<string, string | number>> {
  const own = Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : 1
  return ELEMENT_ANIMATION_EFFECTS[animation].keyframes.map((frame) =>
    typeof frame.opacity === "number" && own < 1 ? { ...frame, opacity: Math.round(frame.opacity * own * 1000) / 1000 } : frame,
  )
}

export function isElementAnimation(value: unknown): value is ElementAnimation {
  return typeof value === "string" && (ELEMENT_ANIMATIONS as readonly string[]).includes(value)
}

export function readElementAnimation(element: Pick<CanvasElement, "style">): ElementAnimation | null {
  const value = element.style?.animation
  return isElementAnimation(value) ? value : null
}

/** The element with this entrance, or with none; the same element when nothing changes. */
export function withElementAnimation(element: CanvasElement, animation: ElementAnimation | null): CanvasElement {
  if (readElementAnimation(element) === animation && (animation || element.style.animation === undefined)) return element
  const style = { ...element.style }
  if (animation) style.animation = animation
  else delete style.animation
  return { ...element, style }
}

export interface EntranceStep {
  id: string
  animation: ElementAnimation
  /** Milliseconds after the page shows. */
  delay: number
}

/** A page's entrances in the order they play: layer order, one turn per element or group. */
export function entrancePlan(elements: readonly CanvasElement[]): EntranceStep[] {
  const steps: EntranceStep[] = []
  const turns = new Map<string, number>()
  for (const element of [...elements].sort((a, b) => a.z - b.z)) {
    const animation = readElementAnimation(element)
    if (!animation || element.hidden) continue
    const key = element.groupId ? `group:${element.groupId}` : `element:${element.id}`
    let turn = turns.get(key)
    if (turn === undefined) {
      turn = turns.size
      turns.set(key, turn)
    }
    steps.push({ id: element.id, animation, delay: ENTRANCE_START_MS + turn * ENTRANCE_GAP_MS })
  }
  return steps
}
