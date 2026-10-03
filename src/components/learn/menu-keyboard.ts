"use client"

import type React from "react"
import { resolveMenuKey } from "@/lib/ux/menu-navigation"

/**
 * The keyboard behaviour shared by the Create menu and the "What's where" guide:
 * arrow keys move the highlight, Enter opens it, Escape closes, and a focused
 * text field keeps every key it is typed.
 *
 * Both menus render a flat, ordered list of entries with a data attribute on
 * each row, so the binding lives here once instead of being copied into each
 * component and drifting.
 */
export interface MenuKeyboardOptions<Entry> {
  /** Highlighted entry, or `-1` when nothing is highlighted yet. */
  activeIndex: number
  /** Attribute selector for the focusable row of an entry. */
  entrySelector: string
  /** The entries in render order — the same order the panel renders. */
  entries: readonly Entry[]
  onChoose: (entry: Entry) => void
  open: boolean
  setActiveIndex: (index: number) => void
  setOpen: (open: boolean) => void
  containerRef: React.RefObject<HTMLElement | null>
}

export function useMenuKeyboard<Entry>({
  activeIndex,
  containerRef,
  entries,
  entrySelector,
  onChoose,
  open,
  setActiveIndex,
  setOpen,
}: MenuKeyboardOptions<Entry>) {
  return function handleKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    const target = event.target as HTMLElement | null
    const editable = Boolean(target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable))
    const intent = resolveMenuKey({ activeIndex, count: entries.length, key: event.key, open, targetIsEditable: editable })

    if (intent.type === "close") {
      setOpen(false)
      return
    }
    if (intent.type === "ignore") return
    event.preventDefault()

    if (intent.type === "focus") {
      setActiveIndex(intent.index)
      containerRef.current?.querySelectorAll<HTMLElement>(entrySelector)[intent.index]?.focus()
      return
    }

    const entry = entries[intent.index]
    if (entry) onChoose(entry)
  }
}
