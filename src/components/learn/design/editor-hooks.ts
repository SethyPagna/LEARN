"use client"

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react"

/**
 * Small hooks the design editor is built from.
 */

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect

/**
 * A ref that always holds the latest value. For window listeners and timers
 * that are attached once but must act on the current state.
 */
export function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef(value)
  useIsomorphicLayoutEffect(() => {
    ref.current = value
  })
  return ref
}

/**
 * Whether an element has come near the viewport (or near `root`). Once true it
 * stays true, so a thumbnail is drawn once and then kept.
 */
export function useNearViewport<T extends Element>(options: { root?: Element | null; rootMargin?: string } = {}): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null)
  const [near, setNear] = useState(false)
  const { root = null, rootMargin = "240px" } = options
  useEffect(() => {
    const node = ref.current
    if (!node || near) return
    if (typeof IntersectionObserver === "undefined") {
      setNear(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true)
          observer.disconnect()
        }
      },
      { root, rootMargin },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [near, root, rootMargin])
  return [ref, near]
}

/**
 * A value outside React state. The stage writes the hovered element here on
 * every pointer move; only the selection chrome subscribes, so hovering never
 * re-renders the editor or the page.
 */
export interface ValueStore<T> {
  get: () => T
  set: (value: T) => void
  subscribe: (listener: () => void) => () => void
}

export function createValueStore<T>(initial: T): ValueStore<T> {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set: (next) => {
      if (Object.is(next, value)) return
      value = next
      for (const listener of listeners) listener()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export function useValueStore<T>(store: ValueStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get)
}

/** Whether the main pointer is coarse (a finger): handles grow for it. */
export function useCoarsePointer(): boolean {
  return useSyncExternalStore(subscribeCoarse, readCoarse, () => false)
}

function readCoarse() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches
}

function subscribeCoarse(listener: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {}
  const query = window.matchMedia("(pointer: coarse)")
  query.addEventListener("change", listener)
  return () => query.removeEventListener("change", listener)
}

/** Whether the viewport is phone-sized: panels become a bottom sheet. */
export function useCompactLayout(): boolean {
  return useSyncExternalStore(subscribeCompact, readCompact, () => false)
}

function readCompact() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(max-width: 767px)").matches
}

function subscribeCompact(listener: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {}
  const query = window.matchMedia("(max-width: 767px)")
  query.addEventListener("change", listener)
  return () => query.removeEventListener("change", listener)
}

/** Focus targets where typing belongs to the field, not to the editor's shortcuts. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  if (tag === "TEXTAREA" || tag === "SELECT") return true
  if (tag === "INPUT") {
    const type = (target as HTMLInputElement).type
    return !["button", "checkbox", "radio", "range", "color", "submit", "reset", "file"].includes(type)
  }
  return false
}
