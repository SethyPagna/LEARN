"use client"

import { ArrowUpRight, Compass, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { menuSurfaceClasses } from "@/lib/design-system"
import { groupPlaces, type PlaceEntry } from "@/lib/ux/artifact-catalog"
import { useMenuKeyboard } from "./menu-keyboard"
import type { View } from "./types"

/**
 * "What's where" — one sentence for every place in the app.
 *
 * The app's nouns (Vault, Studio, Practice, Live, Social, Chat…) were previously
 * explained nowhere, so a first-time user had to guess. This is the reference
 * that answers "where am I, and what is this for?" in one screen.
 *
 * Reachable two ways: the launcher command ("What can LEARN do?") and the
 * dashboard's empty setup-gaps card. Both dispatch `PLACE_GUIDE_EVENT`; a window
 * event (the same idiom as `STUDIO_DRAFT_EVENT`) keeps this reachable from any
 * tree without threading an open/close callback through the shell.
 */
export const PLACE_GUIDE_EVENT = "learn:place-guide"

export function openPlaceGuide() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new Event(PLACE_GUIDE_EVENT))
}

export function PlaceGuidePanel({
  activeIndex = -1,
  onChoose,
  onHover,
}: {
  activeIndex?: number
  onChoose: (place: PlaceEntry) => void
  onHover?: (index: number) => void
}) {
  const groups = useMemo(() => groupPlaces(), [])
  const ordered = useMemo(() => groups.flatMap((group) => group.items), [groups])

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {groups.map((group) => (
        <section key={group.groupLabel}>
          <h3 className="px-2 pb-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{group.groupLabel}</h3>
          <ul className="grid gap-1">
            {group.items.map((place) => {
              const index = ordered.indexOf(place)
              const active = index === activeIndex
              return (
                <li key={place.id}>
                  <a
                    href={place.route}
                    data-place-id={place.id}
                    data-active={active ? "true" : undefined}
                    title={place.keywords.join(", ")}
                    onClick={(event) => {
                      event.preventDefault()
                      onChoose(place)
                    }}
                    onMouseEnter={() => onHover?.(index)}
                    className={`flex items-start gap-2 rounded-md p-2 transition ${active ? "bg-accent text-accent-foreground" : "hover:bg-accent hover:text-accent-foreground"}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                        {place.label}
                        <span className="font-mono text-[0.68rem] font-normal text-muted-foreground">{place.route}</span>
                      </span>
                      <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{place.oneLine}</span>
                    </span>
                    <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </a>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}

export function PlaceGuide({ setView }: { setView: (view: View) => void }) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const dialogRef = useRef<HTMLElement | null>(null)
  const entries = useMemo(() => groupPlaces().flatMap((group) => group.items), [])

  useEffect(() => {
    function openGuide() {
      setActiveIndex(0)
      setOpen(true)
    }
    window.addEventListener(PLACE_GUIDE_EVENT, openGuide)
    return () => window.removeEventListener(PLACE_GUIDE_EVENT, openGuide)
  }, [])

  useEffect(() => {
    if (!open) return
    dialogRef.current?.querySelector<HTMLElement>("[data-place-id]")?.focus()
  }, [open])

  function choose(place: PlaceEntry) {
    setView(place.view)
    setOpen(false)
  }

  const handleKeyDown = useMenuKeyboard({
    activeIndex,
    containerRef: dialogRef,
    entries,
    entrySelector: "[data-place-id]",
    onChoose: choose,
    open,
    setActiveIndex,
    setOpen,
  })

  if (!open) return null

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-background/70 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) setOpen(false)
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="What's where"
        onKeyDown={handleKeyDown}
        className={`mt-8 w-full max-w-3xl ${menuSurfaceClasses()} animate-in fade-in zoom-in-95`}
      >
        <header className="flex items-start gap-3 px-2 pb-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Compass className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-popover-foreground">What&apos;s where</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Every place in LEARN in one sentence, grouped the same way as the sidebar. Pick one to go straight there.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-secondary text-secondary-foreground transition hover:bg-accent hover:text-accent-foreground"
            aria-label="Close the guide"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <PlaceGuidePanel activeIndex={activeIndex} onChoose={choose} onHover={setActiveIndex} />
        <p className="px-2 pt-3 text-[0.68rem] text-muted-foreground">Arrow keys to move, Enter to open, Escape to close.</p>
      </section>
    </div>
  )
}
