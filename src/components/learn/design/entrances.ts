import { ELEMENT_ANIMATION_EFFECTS, entranceKeyframes, type EntranceStep } from "@/lib/design/animation"

/**
 * Plays entrances on rendered design elements (`[data-design-element]` inside
 * `root`). Each element holds its starting look until its turn, so nothing
 * flashes in before it enters. Returns the running animations, so the caller
 * can cancel them. Nothing plays when the viewer prefers reduced motion,
 * unless `always` is set (a preview someone asked for).
 */
export function playEntrances(root: ParentNode | null, steps: readonly EntranceStep[], { always = false }: { always?: boolean } = {}): Animation[] {
  if (!root || !steps.length || (!always && prefersReducedMotion())) return []
  const animations: Animation[] = []
  for (const step of steps) {
    const node = root.querySelector<HTMLElement>(`[data-design-element="${cssEscape(step.id)}"]`)
    if (!node || typeof node.animate !== "function") continue
    const effect = ELEMENT_ANIMATION_EFFECTS[step.animation]
    // The renderer sets an element's own transparency inline; the fade ends there.
    const own = node.style.opacity ? Number(node.style.opacity) : 1
    animations.push(node.animate(entranceKeyframes(step.animation, own), { duration: effect.duration, delay: step.delay, easing: effect.easing, fill: "backwards" }))
  }
  return animations
}

let preview: Animation[] = []

/** Plays entrances on the editor's page (`[data-design-stage]`), stopping any preview still running. */
export function previewEntrances(steps: readonly EntranceStep[], options: { always?: boolean } = {}): void {
  preview.forEach((animation) => animation.cancel())
  preview = playEntrances(typeof document === "undefined" ? null : document.querySelector("[data-design-stage]"), steps, options)
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

function cssEscape(value: string): string {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(value) : value.replace(/["\\]/g, "\\$&")
}
