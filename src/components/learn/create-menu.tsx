"use client"

import { ChevronDown, Plus } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { menuSurfaceClasses } from "@/lib/design-system"
import { groupArtifactTypes, type ArtifactType } from "@/lib/ux/artifact-catalog"
import { useMenuKeyboard } from "./menu-keyboard"
import type { View } from "./types"

/**
 * The one obvious way to make something.
 *
 * Before this, "make a thing" was spread across Studio's own Create menu, the
 * dashboard's quick actions, and the launcher — and nothing told a first-time
 * user whether they wanted a Note or a Doc. This control lists every entry in
 * `ARTIFACT_TYPES`, grouped, each with the plain-language `oneLine` that says
 * what the thing is.
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
    button: "flex h-10 w-full items-center gap-2 rounded-md border border-primary bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring",
    panel: "left-0 right-0 top-12",
    wrapper: "relative mb-3",
  },
  rail: {
    button: "flex h-11 w-11 items-center justify-center rounded-xl border border-primary bg-primary text-primary-foreground shadow-sm transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring",
    panel: "left-full top-0 ml-3 w-80",
    wrapper: "relative mb-3 flex justify-center",
  },
  header: {
    button: "flex h-9 items-center gap-1.5 rounded-md border border-primary bg-primary px-2 text-xs font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring",
    panel: "right-0 top-11 w-72",
    wrapper: "relative",
  },
}

export function CreateMenuPanel({
  activeIndex = -1,
  italicHint = false,
  onChoose,
  onHover,
}: {
  activeIndex?: number
  italicHint?: boolean
  onChoose: (artifact: ArtifactType) => void
  onHover?: (index: number) => void
}) {
  const groups = useMemo(() => groupArtifactTypes(), [])
  const ordered = useMemo(() => groups.flatMap((group) => group.items), [groups])

  return (
    <div className="grid gap-2">
      {groups.map((group) => (
        <div key={group.groupLabel}>
          <p className="px-2 pb-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{group.groupLabel}</p>
          <div className="grid gap-1">
            {group.items.map((artifact) => {
              const index = ordered.indexOf(artifact)
              const active = index === activeIndex
              return (
                <button
                  key={artifact.id}
                  type="button"
                  data-artifact-id={artifact.id}
                  data-active={active ? "true" : undefined}
                  onClick={() => onChoose(artifact)}
                  onMouseEnter={() => onHover?.(index)}
                  title={`${artifact.whenToUse} (${artifact.route})`}
                  className={`rounded-md p-2 text-left transition ${active ? "bg-accent text-accent-foreground" : "hover:bg-accent hover:text-accent-foreground"}`}
                >
                  <span className="block text-sm font-semibold text-foreground">{artifact.label}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{artifact.oneLine}</span>
                  <span className={`mt-1 block text-[0.68rem] leading-4 text-muted-foreground/90 ${italicHint ? "italic" : ""}`}>{artifact.whenToUse}</span>
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
  setView,
  variant = "sidebar",
}: {
  setView: (view: View) => void
  /** Where the control is mounted. "rail" is the icon-only sidebar, "header" the mobile bar. */
  variant?: CreateMenuVariant
}) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const entries = useMemo(() => groupArtifactTypes().flatMap((group) => group.items), [])

  function choose(artifact: ArtifactType) {
    setView(artifact.view)
    setOpen(false)
  }

  useEffect(() => {
    function handleOpen() {
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
    rootRef.current?.querySelector<HTMLElement>("[data-artifact-id]")?.focus()
  }, [open])

  const handleKeyDown = useMenuKeyboard({
    activeIndex,
    containerRef: rootRef,
    entries,
    entrySelector: "[data-artifact-id]",
    onChoose: choose,
    open,
    setActiveIndex,
    setOpen,
  })

  return (
    <div
      ref={rootRef}
      className={createMenuLayout[variant].wrapper}
      onKeyDown={handleKeyDown}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false)
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => {
          setActiveIndex(0)
          setOpen(!open)
        }}
        title="Create something new"
        className={createMenuLayout[variant].button}
      >
        <Plus className="h-4 w-4" />
        {variant === "rail" ? <span className="sr-only">Create</span> : <span>Create</span>}
        {variant === "rail" ? null : <ChevronDown className={`ml-auto h-4 w-4 transition ${open ? "rotate-180" : ""}`} />}
      </button>
      {open ? (
        <div
          role="menu"
          aria-label="Create something new"
          className={`absolute z-[80] animate-in fade-in zoom-in-95 ${menuSurfaceClasses()} ${createMenuLayout[variant].panel}`}
        >
          <CreateMenuPanel activeIndex={activeIndex} italicHint onChoose={choose} onHover={setActiveIndex} />
          <p className="px-2 pt-2 text-[0.68rem] text-muted-foreground">Arrow keys to move, Enter to open, Escape to close.</p>
        </div>
      ) : null}
    </div>
  )
}
