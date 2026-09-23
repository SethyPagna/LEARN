"use client"

import { CornerDownLeft, ListChecks, Moon, PanelLeft, Search, StickyNote, Sun, type LucideIcon } from "lucide-react"
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react"
import type { baseVocabulary } from "@/lib/i18n/vocabulary"
import {
  adminOnlyViews,
  getNavigationItemDetail,
  launcherCommands,
  navigationItems,
  navigationSubViews,
  sectionTabForView,
  viewLabelKeys,
  type LauncherCommandAction,
  type SectionTab,
} from "@/lib/navigation"
import { rankNavigationMatches, type NavigationSearchCandidate } from "@/lib/navigation-features"
import { viewIcons } from "./nav-icons"
import type { Note, Quiz, User, View } from "./types"

/**
 * Ctrl/Cmd+K: one box that reaches every page, every quick action, and the
 * person's own notes and quizzes by title.
 *
 * Opened by the shortcut, by the search buttons in the sidebar and top bar, or
 * by `openCommandPalette()` from anywhere. An editor that uses Ctrl+K for
 * itself (a link dialog) calls `preventDefault()` first and keeps the key.
 */
export const COMMAND_PALETTE_EVENT = "learn:command-palette"

export function openCommandPalette() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new Event(COMMAND_PALETTE_EVENT))
}

type Text = typeof baseVocabulary
type PaletteGroup = "Pages" | "Actions" | "Notes" | "Quizzes"

interface PaletteItem {
  id: string
  group: PaletteGroup
  label: string
  detail: string
  icon: LucideIcon
  tab?: SectionTab
  keywords: readonly string[]
  run: () => void
}

const GROUP_ORDER: PaletteGroup[] = ["Pages", "Actions", "Notes", "Quizzes"]

export function CommandPalette({
  actions,
  notes,
  onCycleSidebar,
  onToggleTheme,
  openNote,
  openQuiz,
  quizzes,
  resolvedTheme,
  setView,
  text,
  user,
}: {
  actions: Record<LauncherCommandAction, () => void>
  notes: Note[]
  onCycleSidebar: () => void
  onToggleTheme: () => void
  openNote: (id: string) => void
  openQuiz: (id: string) => void
  quizzes: Quiz[]
  resolvedTheme?: string
  setView: (view: View) => void
  text: Text
  user: User | null
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const returnFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    function show() {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      setQuery("")
      setActiveIndex(0)
      setOpen(true)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault()
        if (open) setOpen(false)
        else show()
      }
    }
    window.addEventListener(COMMAND_PALETTE_EVENT, show)
    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener(COMMAND_PALETTE_EVENT, show)
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  useEffect(() => {
    if (open) {
      inputRef.current?.focus()
      return
    }
    returnFocus.current?.focus?.()
  }, [open])

  const items = useMemo<PaletteItem[]>(() => {
    const isAdmin = user?.role === "admin"
    const pages: PaletteItem[] = []
    const seen = new Set<View>()
    function addPage(view: View, detail: string) {
      if (seen.has(view) || (adminOnlyViews.includes(view) && !isAdmin)) return
      seen.add(view)
      const label = String(text[viewLabelKeys[view]] || view)
      pages.push({
        id: `page:${view}`,
        group: "Pages",
        label,
        detail,
        icon: viewIcons[view],
        tab: sectionTabForView(view),
        keywords: [view, label],
        run: () => setView(view),
      })
    }
    for (const item of navigationItems) {
      addPage(item.view, getNavigationItemDetail(item))
      for (const sub of navigationSubViews[item.view] ?? []) {
        addPage(sub, `In ${String(text[item.labelKey])}`)
      }
    }

    const commands: PaletteItem[] = launcherCommands
      .filter((command) => isAdmin || !adminOnlyViews.includes(command.view))
      .map((command) => ({
        id: `action:${command.label}`,
        group: "Actions" as const,
        label: command.label,
        detail: command.detail,
        icon: viewIcons[command.view],
        tab: sectionTabForView(command.view),
        keywords: command.keywords,
        run: () => (command.action ? actions[command.action]() : setView(command.view)),
      }))
    commands.push(
      {
        id: "action:theme",
        group: "Actions",
        label: resolvedTheme === "dark" ? "Switch to light (paper)" : "Switch to dark (ink)",
        detail: "Theme",
        icon: resolvedTheme === "dark" ? Sun : Moon,
        keywords: ["theme", "dark", "light", "mode", "paper", "ink"],
        run: onToggleTheme,
      },
      {
        id: "action:sidebar",
        group: "Actions",
        label: "Change sidebar size",
        detail: "Full, icons only, or hidden (Ctrl+\\)",
        icon: PanelLeft,
        keywords: ["sidebar", "collapse", "expand", "hide", "icons", "rail", "menu"],
        run: onCycleSidebar,
      },
    )

    const noteItems: PaletteItem[] = notes.slice(0, 200).map((note) => ({
      id: `note:${note.id}`,
      group: "Notes",
      label: note.title || "Untitled note",
      detail: note.tags?.length ? note.tags.map((tag) => `#${tag}`).join(" ") : "Note",
      icon: StickyNote,
      tab: "studio",
      keywords: [...(note.tags ?? []), "note"],
      run: () => openNote(note.id),
    }))

    const quizItems: PaletteItem[] = quizzes.slice(0, 200).map((quiz) => ({
      id: `quiz:${quiz.id}`,
      group: "Quizzes",
      label: quiz.title || "Untitled quiz",
      detail: quiz.topic || "Quiz",
      icon: ListChecks,
      tab: "practice",
      keywords: [quiz.topic, "quiz"].filter(Boolean),
      run: () => openQuiz(quiz.id),
    }))

    return [...pages, ...commands, ...noteItems, ...quizItems]
  }, [actions, notes, onCycleSidebar, onToggleTheme, openNote, openQuiz, quizzes, resolvedTheme, setView, text, user?.role])

  const grouped = useMemo(() => {
    const needle = query.trim()
    let chosen: PaletteItem[]
    if (!needle) {
      chosen = [
        ...items.filter((item) => item.group === "Pages").slice(0, 8),
        ...items.filter((item) => item.group === "Actions").slice(0, 4),
        ...items.filter((item) => item.group === "Notes").slice(0, 4),
      ]
    } else {
      const candidates: NavigationSearchCandidate<PaletteItem>[] = items.map((item) => ({
        value: item,
        label: item.label,
        detail: item.detail,
        keywords: item.keywords,
      }))
      chosen = rankNavigationMatches(needle, candidates, 24).map((candidate) => candidate.value)
    }
    return GROUP_ORDER.map((group) => ({ group, items: chosen.filter((item) => item.group === group) })).filter((entry) => entry.items.length)
  }, [items, query])

  const flat = useMemo(() => grouped.flatMap((entry) => entry.items), [grouped])
  const clampedIndex = Math.min(activeIndex, Math.max(0, flat.length - 1))

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-palette-index="${clampedIndex}"]`)?.scrollIntoView({ block: "nearest" })
  }, [clampedIndex])

  function run(item: PaletteItem | undefined) {
    if (!item) return
    setOpen(false)
    item.run()
  }

  function onInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setActiveIndex((index) => (flat.length ? (index + 1) % flat.length : 0))
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setActiveIndex((index) => (flat.length ? (index - 1 + flat.length) % flat.length : 0))
    } else if (event.key === "Enter") {
      event.preventDefault()
      run(flat[clampedIndex])
    } else if (event.key === "Escape") {
      event.preventDefault()
      setOpen(false)
    }
  }

  if (!open) return null

  let index = -1
  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-foreground/25 px-3 pt-[10vh] backdrop-blur-[2px]" onMouseDown={() => setOpen(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search and jump"
        className="learn-pop-in w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-lift"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActiveIndex(0)
            }}
            onKeyDown={onInputKeyDown}
            placeholder="Search pages, notes, quizzes, actions…"
            aria-label="Search pages, notes, quizzes and actions"
            aria-controls="learn-palette-results"
            aria-activedescendant={flat[clampedIndex] ? `palette-${clampedIndex}` : undefined}
            className="h-14 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
          />
          <kbd className="learn-kbd">Esc</kbd>
        </div>
        <div ref={listRef} id="learn-palette-results" role="listbox" aria-label="Results" className="max-h-[min(60vh,28rem)] overflow-y-auto p-2">
          {grouped.length ? (
            grouped.map((entry) => (
              <div key={entry.group} className="mb-1">
                <p className="px-2 pb-1 pt-2 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{entry.group}</p>
                {entry.items.map((item) => {
                  index += 1
                  const itemIndex = index
                  const active = itemIndex === clampedIndex
                  const Icon = item.icon
                  return (
                    <button
                      key={item.id}
                      id={`palette-${itemIndex}`}
                      type="button"
                      role="option"
                      aria-selected={active}
                      data-palette-index={itemIndex}
                      data-tab={item.tab}
                      onMouseMove={() => setActiveIndex(itemIndex)}
                      onClick={() => run(item)}
                      className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition ${active ? "bg-accent text-accent-foreground" : "hover:bg-accent/60"}`}
                    >
                      <span className="learn-tab-wash learn-tab-ink flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{item.label}</span>
                        <span className="block truncate text-xs text-muted-foreground">{item.detail}</span>
                      </span>
                      {active ? <CornerDownLeft className="h-4 w-4 shrink-0 text-muted-foreground" /> : null}
                    </button>
                  )
                })}
              </div>
            ))
          ) : (
            <div className="px-3 py-10 text-center">
              <p className="text-sm font-semibold">Nothing matches “{query.trim()}”</p>
              <p className="mt-1 text-xs text-muted-foreground">Try a page name like “quizzes”, a note title, or an action like “create”.</p>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/50 px-4 py-2 text-[0.7rem] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <kbd className="learn-kbd">↑</kbd>
            <kbd className="learn-kbd">↓</kbd>
            to move
            <kbd className="learn-kbd">↵</kbd>
            to open
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="learn-kbd">Ctrl</kbd>
            <kbd className="learn-kbd">K</kbd>
            anywhere
          </span>
        </div>
      </div>
    </div>
  )
}
