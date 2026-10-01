"use client"

import { Plus } from "lucide-react"
import { viewIcons } from "./nav-icons"
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { createPortal } from "react-dom"
import { menuSurfaceClasses } from "@/lib/design-system"
import { groupArtifactTypes, type ArtifactType } from "@/lib/ux/artifact-catalog"
import { useMenuKeyboard } from "./menu-keyboard"
import type { View } from "./types"

/**
 * The one obvious way to make something.
 *
 * Lists the artifact catalog as compact, grouped names and colored icons.
 * Descriptions remain available in each entry's tooltip.
 *
 * Reachable two ways: the button itself, and `CREATE_MENU_EVENT`, which the
 * launcher dispatches. A window event (the same idiom as `STUDIO_DRAFT_EVENT`)
 * is used because the control is mounted in two places — the sidebar and the
 * mobile header — and the launcher must open whichever one is on screen.
 */
export const CREATE_MENU_EVENT = "learn:create-menu"

export function openCreateMenu() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new Event(CREATE_MENU_EVENT))
}

export type CreateMenuVariant = "sidebar" | "rail" | "header"

const createMenuLayout: Record<CreateMenuVariant, { button: string; panel: string; wrapper: string }> = {
  sidebar: {
    button: "flex h-10 w-full items-center justify-center rounded-md border border-primary bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring",
    panel: "left-0 right-0 top-12",
    wrapper: "relative mb-3",
  },
  rail: {
    button: "flex h-11 w-11 items-center justify-center rounded-xl border border-primary bg-primary text-primary-foreground shadow-sm transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring",
    panel: "left-full top-0 ml-3 w-80",
    wrapper: "relative mb-3 flex justify-center",
  },
  header: {
    button: "flex h-9 min-w-14 items-center justify-center rounded-md border border-primary bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring",
    panel: "right-0 top-11 w-72",
    wrapper: "relative",
  },
}

export function CreateMenuPanel({
  activeIndex = -1,
  onChoose,
  onHover,
}: {
  activeIndex?: number
  onChoose: (artifact: ArtifactType) => void
  onHover?: (index: number) => void
}) {
  const groups = useMemo(() => groupArtifactTypes(), [])
  const ordered = useMemo(() => groups.flatMap((group) => group.items), [groups])

  return (
    <div className="grid gap-2">
      {groups.map((group) => (
        <div key={group.groupLabel}>
          <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{group.groupLabel}</p>
          <div className="grid gap-1">
            {group.items.map((artifact) => {
              const index = ordered.indexOf(artifact)
              const active = index === activeIndex
              const Icon = viewIcons[artifact.view]
              return (
                <button
                  key={artifact.id}
                  type="button"
                  role="menuitem"
                  data-artifact-id={artifact.id}
                  data-active={active ? "true" : undefined}
                  onClick={() => onChoose(artifact)}
                  onMouseEnter={() => onHover?.(index)}
                  onFocus={() => onHover?.(index)}
                  title={artifact.oneLine}
                  className={`flex items-center gap-2 rounded-md p-2 text-left transition ${active ? "bg-accent text-accent-foreground" : "hover:bg-accent hover:text-accent-foreground"}`}
                >
                  <span data-project-kind={artifact.kind} className="studio-project-icon rounded-md p-1.5"><Icon className="h-4 w-4" /></span>
                  <span className="text-sm text-foreground">{artifact.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

export function CreateMenu({
  onCreate,
  setView,
  variant = "sidebar",
}: {
  onCreate?: (artifact: ArtifactType) => void
  setView: (view: View) => void
  /** Where the control is mounted. "rail" is the icon-only sidebar, "header" the mobile bar. */
  variant?: CreateMenuVariant
}) {
  const [open, setOpen] = useState(false)
  // The launcher and the Today card can ask for this menu while CSS hides the
  // control (the desktop top bar, or a phone header with no room for it). Then
  // the menu floats at the top of the screen instead of opening out of sight.
  const [floating, setFloating] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const entries = useMemo(() => groupArtifactTypes().flatMap((group) => group.items), [])

  function choose(artifact: ArtifactType) {
    if (onCreate) onCreate(artifact)
    else setView(artifact.view)
    setOpen(false)
  }

  /** Escape closes and hands focus back to whatever opened the menu. */
  function closeAndReturnFocus() {
    setOpen(false)
    const back = floating ? returnFocusRef.current : triggerRef.current
    if (back?.isConnected) back.focus()
  }

  useEffect(() => {
    function handleOpen() {
      const triggers = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-create-menu-trigger]"))
      const owner = triggers.find(trigger => trigger.getClientRects().length > 0) || triggers[0]
      if (owner !== triggerRef.current) return
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      setFloating(!rootRef.current?.getClientRects().length)
      setActiveIndex(0)
      setOpen(true)
    }
    window.addEventListener(CREATE_MENU_EVENT, handleOpen)
    return () => window.removeEventListener(CREATE_MENU_EVENT, handleOpen)
  }, [])

  useEffect(() => {
    if (!open) return
    // Pulling focus into the menu is what makes the arrow keys work when the
    // menu was opened from the launcher, where focus started in the search box.
    // It waits a frame: the launcher hands focus back to its own button as it
    // closes, and taking focus first would lose it and close this menu.
    const frame = requestAnimationFrame(() => {
      const active = document.activeElement
      if (active instanceof HTMLElement && active !== document.body && !panelRef.current?.contains(active)) returnFocusRef.current = active
      panelRef.current?.querySelector<HTMLElement>("[data-artifact-id]")?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [open])

  const handleKeyDown = useMenuKeyboard({
    activeIndex,
    containerRef: panelRef,
    entries,
    entrySelector: "[data-artifact-id]",
    onChoose: choose,
    open,
    setActiveIndex,
    setOpen: (next) => (next ? setOpen(true) : closeAndReturnFocus()),
  })

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.defaultPrevented) return
    if (event.key === "Enter") {
      const target = event.target as HTMLElement
      const row = target.closest<HTMLElement>("[data-artifact-id]")
      const focused = row && panelRef.current?.contains(row) ? entries.find(entry => entry.id === row.dataset.artifactId) : undefined
      if (focused) { event.preventDefault(); choose(focused); return }
    }
    handleKeyDown(event)
  }

  const menu = open ? (
    <div
      ref={panelRef}
      role="menu"
      aria-label="Create something new"
      tabIndex={-1}
      className={`z-[80] outline-none animate-in fade-in zoom-in-95 ${menuSurfaceClasses()} ${floating ? "fixed inset-x-4 top-20 mx-auto max-h-[calc(100dvh-6rem)] max-w-xs overflow-y-auto" : `absolute ${createMenuLayout[variant].panel}`}`}
    >
      <CreateMenuPanel activeIndex={activeIndex} onChoose={choose} onHover={setActiveIndex} />
    </div>
  ) : null

  return (
    <div
      ref={rootRef}
      className={createMenuLayout[variant].wrapper}
      onKeyDown={handleMenuKeyDown}
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null
        if (!event.currentTarget.contains(next) && !panelRef.current?.contains(next)) setOpen(false)
      }}
    >
      <button
        ref={triggerRef}
        data-create-menu-trigger
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => {
          setFloating(false)
          setActiveIndex(0)
          setOpen(!open)
        }}
        title="Create something new"
        className={createMenuLayout[variant].button}
      >
        {variant === "rail" ? <><Plus className="h-4 w-4" /><span className="sr-only">Add</span></> : <span>Add</span>}
      </button>
      {menu && floating ? createPortal(menu, document.body) : menu}
    </div>
  )
}
