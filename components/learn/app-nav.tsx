"use client"

import type React from "react"
import { useEffect, useMemo, useState } from "react"
import {
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  CheckCheck,
  Bot,
  ChevronDown,
  Compass,
  FileText,
  Gamepad2,
  Home,
  Languages,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  Sun,
  MessagesSquare,
  Trash2,
  X,
} from "lucide-react"
import { languageNames, supportedLocales, type baseVocabulary, type SupportedLocale } from "@/lib/i18n/vocabulary"
import {
  formatNavigationBadge,
  rankNavigationMatches,
  summarizeActiveNavigationGroup,
  viewBelongsToNavigationItem,
  type NavigationSearchCandidate,
} from "@/lib/navigation-features"
import {
  getNavigationItemDetail,
  launcherCommands,
  navigationGroups,
  navigationItems,
  practiceViews,
  studioViews,
  viewLabelKeys,
  type LauncherCommandConfig,
  type LearnNavigationItem,
  type NavigationIconKey,
} from "@/lib/navigation"
import type { PracticeDraftSummary } from "@/lib/practice-drafts"
import type { StudioDraftSummary } from "@/lib/studio-drafts"
import type { View, User } from "./types"

type Text = typeof baseVocabulary
type Density = "compact" | "comfortable"

const navIconMap: Record<NavigationIconKey, React.ComponentType<{ className?: string }>> = {
  ai: Bot,
  calendar: CalendarDays,
  dashboard: Home,
  practice: Gamepad2,
  settings: Settings,
  social: MessagesSquare,
  studio: FileText,
  workspaces: Compass,
}

function keywordsForNavItem(item: LearnNavigationItem, text: Text) {
  return [item.view, String(text[item.labelKey]), ...(item.aliases ?? []), getNavigationItemDetail(item)]
}

export function titleForView(view: View, text: Text) {
  return text[viewLabelKeys[view]] || text.dashboard
}

export function Sidebar({
  density,
  locale,
  query,
  resolvedTheme,
  setQuery,
  setDensity,
  setLocale,
  setTheme,
  setView,
  text,
  user,
  view,
  logout,
  studioDraftSummary,
  practiceDraftSummary,
}: {
  density: Density
  locale: SupportedLocale
  query: string
  resolvedTheme?: string
  setQuery: (query: string) => void
  setDensity: (density: Density) => void
  setLocale: (locale: SupportedLocale) => void
  setTheme: (theme: string) => void
  setView: (view: View) => void
  text: Text
  user: User | null
  view: View
  logout: () => void
  studioDraftSummary: StudioDraftSummary
  practiceDraftSummary: PracticeDraftSummary
}) {
  const compact = density === "compact"
  return (
    <aside className={`fixed inset-y-0 left-0 z-30 hidden border-r border-border bg-sidebar py-4 text-sidebar-foreground lg:flex lg:flex-col ${compact ? "w-[84px] px-2" : "w-[272px] px-3"}`}>
      <Brand compact={compact} text={text} />
      <LauncherSearch compact={compact} query={query} setQuery={setQuery} setView={setView} text={text} />
      <div className={`min-h-0 flex-1 overflow-y-auto ${compact ? "pr-0" : "pr-1"}`}>
        <Navigation density={density} text={text} view={view} setView={setView} studioDraftSummary={studioDraftSummary} practiceDraftSummary={practiceDraftSummary} />
      </div>
      <SidebarControls
        density={density}
        locale={locale}
        logout={logout}
        resolvedTheme={resolvedTheme}
        setDensity={setDensity}
        setLocale={setLocale}
        setTheme={setTheme}
        text={text}
        user={user}
      />
    </aside>
  )
}

function LauncherSearch({
  compact,
  query,
  setQuery,
  setView,
  text,
}: {
  compact?: boolean
  query: string
  setQuery: (query: string) => void
  setView: (view: View) => void
  text: Text
}) {
  const [focused, setFocused] = useState(false)
  const needle = query.trim().toLowerCase()
  const navCandidates = useMemo<NavigationSearchCandidate<LearnNavigationItem>[]>(() => navigationItems.map((item) => ({
    value: item,
    label: String(text[item.labelKey]),
    detail: getNavigationItemDetail(item),
    keywords: keywordsForNavItem(item, text),
  })), [text])
  const commandCandidates = useMemo<NavigationSearchCandidate<LauncherCommandConfig>[]>(() => launcherCommands.map((item) => ({
    value: item,
    label: item.label,
    detail: item.detail,
    keywords: item.keywords,
  })), [])
  const navResults = useMemo(() => {
    if (!needle) return []
    return rankNavigationMatches(needle, navCandidates, 5)
  }, [navCandidates, needle])
  const commandResults = useMemo(() => {
    if (!needle) return []
    return rankNavigationMatches(needle, commandCandidates, 4)
  }, [commandCandidates, needle])
  const visibleCommands = needle ? commandResults : commandCandidates.slice(0, 4)
  const hasResults = navResults.length > 0 || visibleCommands.length > 0
  const showPanel = focused && (needle.length > 0 || visibleCommands.length > 0)
  const firstView = visibleCommands[0]?.value.view ?? navResults[0]?.value.view

  function choose(nextView: View) {
    setView(nextView)
    setQuery("")
    setFocused(false)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setQuery("")
      setFocused(false)
      return
    }
    if (event.key === "Enter" && firstView) {
      event.preventDefault()
      choose(firstView)
    }
  }

  const resultsPanel = (
    <>
      {hasResults ? (
        <div className="grid gap-2">
          {navResults.length ? (
            <LauncherGroup label="Go to">
              {navResults.map((item) => {
                const Icon = navIconMap[item.value.iconKey]
                return (
                  <LauncherItem key={item.value.view} icon={Icon} label={item.label} detail={item.detail} onClick={() => choose(item.value.view)} />
                )
              })}
            </LauncherGroup>
          ) : null}
          {visibleCommands.length ? (
            <LauncherGroup label={needle ? "Actions" : "Quick actions"}>
              {visibleCommands.map((item) => (
                <LauncherItem key={item.label} icon={navIconMap[item.value.iconKey]} label={item.label} detail={item.detail} onClick={() => choose(item.value.view)} />
              ))}
            </LauncherGroup>
          ) : null}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
          No command found
        </div>
      )}
    </>
  )

  if (compact) {
    return (
      <div className="relative mb-3 flex justify-center" onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false)
      }}>
        <button
          onClick={() => setFocused(true)}
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-sidebar-border bg-background text-muted-foreground transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          aria-label="Search or jump"
          title="Search or jump"
        >
          <Search className="h-4 w-4" />
        </button>
        {showPanel ? (
          <div className="absolute left-full top-0 z-[80] ml-3 w-80 rounded-md border border-border bg-popover p-2 text-popover-foreground shadow-xl animate-in fade-in zoom-in-95">
            <div className="mb-2 flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 focus-within:ring-2 focus-within:ring-ring/30">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onFocus={() => setFocused(true)}
                onKeyDown={handleKeyDown}
                placeholder="Search or jump"
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            {resultsPanel}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="relative mb-3" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false)
    }}>
      <div className="flex h-9 items-center gap-2 rounded-md border border-sidebar-border bg-background px-3 focus-within:ring-2 focus-within:ring-sidebar-ring/30">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search or jump"
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      {showPanel ? (
        <div className="absolute left-0 right-0 top-11 z-[80] rounded-md border border-border bg-popover p-2 text-popover-foreground shadow-xl animate-in fade-in zoom-in-95">
          {resultsPanel}
        </div>
      ) : null}
    </div>
  )
}

function LauncherGroup({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div>
      <p className="px-2 pb-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <div className="grid gap-1">{children}</div>
    </div>
  )
}

function LauncherItem({
  detail,
  icon: Icon,
  label,
  onClick,
}: {
  detail: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
}) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-md p-2 text-left transition hover:bg-accent hover:text-accent-foreground">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{label}</span>
        <span className="block truncate text-xs text-muted-foreground">{detail}</span>
      </span>
    </button>
  )
}

export function Topbar({
  density,
  locale,
  menuOpen,
  resolvedTheme,
  setDensity,
  setLocale,
  setMenuOpen,
  setTheme,
  text,
  user,
  view,
  logout,
  studioDraftSummary,
  practiceDraftSummary,
}: {
  density: Density
  locale: SupportedLocale
  menuOpen: boolean
  resolvedTheme?: string
  setDensity: (density: Density) => void
  setLocale: (locale: SupportedLocale) => void
  setMenuOpen: (open: boolean) => void
  setTheme: (theme: string) => void
  text: Text
  user: User | null
  view: View
  logout: () => void
  studioDraftSummary: StudioDraftSummary
  practiceDraftSummary: PracticeDraftSummary
}) {
  const MenuIcon = menuOpen ? X : Menu
  const ThemeIcon = resolvedTheme === "dark" ? Moon : Sun
  const [openControl, setOpenControl] = useState<"language" | "notifications" | null>(null)
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border bg-background/95 px-4 py-2.5 text-foreground backdrop-blur lg:hidden">
      <div className="flex min-w-0 items-center gap-3">
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-secondary text-secondary-foreground lg:hidden"
          aria-label="Toggle menu"
        >
          <MenuIcon className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-muted-foreground">LEARN</p>
          <h1 className="truncate text-lg font-semibold">{titleForView(view, text)}</h1>
          {studioDraftSummary.count && studioViews.includes(view as (typeof studioViews)[number]) ? (
            <span className="mt-1 inline-flex rounded-md bg-warning px-2 py-0.5 text-[0.68rem] font-semibold text-warning-foreground">
              {studioDraftSummary.count} draft{studioDraftSummary.count === 1 ? "" : "s"}
            </span>
          ) : null}
          {practiceDraftSummary.count && practiceViews.includes(view as (typeof practiceViews)[number]) ? (
            <span className="mt-1 inline-flex rounded-md bg-warning px-2 py-0.5 text-[0.68rem] font-semibold text-warning-foreground">
              {practiceDraftSummary.count} saved attempt{practiceDraftSummary.count === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => setDensity(density === "compact" ? "comfortable" : "compact")}
          className="hidden h-9 w-9 items-center justify-center rounded-md border border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground sm:flex"
          aria-label="Toggle density"
          title={density === "compact" ? "Comfortable spacing" : "Compact spacing"}
        >
          {density === "compact" ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
        <button
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground"
          aria-label="Toggle theme"
          title={resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
        >
          <ThemeIcon className="h-4 w-4" />
        </button>
        <LanguageMenu compact locale={locale} open={openControl === "language"} setLocale={setLocale} setOpen={(open) => setOpenControl(open ? "language" : null)} />
        <NotificationsMenu compact open={openControl === "notifications"} setOpen={(open) => setOpenControl(open ? "notifications" : null)} />
        <div className="hidden text-right md:block">
          <p className="text-sm font-semibold">{user?.name || "Loading"}</p>
          <p className="text-xs capitalize text-muted-foreground">{user?.role || "learner"}</p>
        </div>
        <button
          onClick={logout}
          className="flex h-9 items-center gap-2 rounded-md border border-border bg-secondary px-2 text-sm font-medium text-secondary-foreground hover:bg-accent hover:text-accent-foreground sm:px-3"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">{text.signOut}</span>
        </button>
      </div>
    </header>
  )
}

function SidebarControls({
  density,
  locale,
  logout,
  resolvedTheme,
  setDensity,
  setLocale,
  setTheme,
  text,
  user,
}: {
  density: Density
  locale: SupportedLocale
  logout: () => void
  resolvedTheme?: string
  setDensity: (density: Density) => void
  setLocale: (locale: SupportedLocale) => void
  setTheme: (theme: string) => void
  text: Text
  user: User | null
}) {
  const ThemeIcon = resolvedTheme === "dark" ? Moon : Sun
  const [openControl, setOpenControl] = useState<"language" | "notifications" | null>(null)
  const compact = density === "compact"

  if (compact) {
    return (
      <div className="mt-auto pt-3">
        <div className="grid justify-center gap-2 rounded-xl border border-sidebar-border bg-background p-1.5">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-xs font-semibold text-primary-foreground" title={user?.name || "Learner"}>
            {(user?.name || "L").slice(0, 1)}
          </div>
          <button
            onClick={() => setDensity("comfortable")}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-secondary text-secondary-foreground transition hover:bg-accent hover:text-accent-foreground"
            aria-label="Comfortable spacing"
            title="Comfortable spacing"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
          <button
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-secondary text-secondary-foreground transition hover:bg-accent hover:text-accent-foreground"
            aria-label="Toggle theme"
            title={resolvedTheme === "dark" ? text.lightMode : text.darkMode}
          >
            <ThemeIcon className="h-4 w-4" />
          </button>
          <LanguageMenu compact rail locale={locale} open={openControl === "language"} setLocale={setLocale} setOpen={(open) => setOpenControl(open ? "language" : null)} />
          <NotificationsMenu compact rail open={openControl === "notifications"} setOpen={(open) => setOpenControl(open ? "notifications" : null)} />
          <button
            onClick={logout}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-secondary text-secondary-foreground transition hover:bg-accent hover:text-accent-foreground"
            aria-label={text.signOut}
            title={text.signOut}
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-auto pt-4">
      <div className="rounded-md border border-sidebar-border bg-background p-2">
        <div className="mb-2 flex items-center gap-2 px-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-foreground">
            {(user?.name || "L").slice(0, 1)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{user?.name || "Learner"}</p>
            <p className="truncate text-xs capitalize text-muted-foreground">{user?.role || "learner"}</p>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-1">
          <button
            onClick={() => setDensity("compact")}
            className="sidebar-icon-button"
            aria-label="Toggle density"
            title="Compact spacing"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
          <button
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            className="sidebar-icon-button"
            aria-label="Toggle theme"
            title={resolvedTheme === "dark" ? text.lightMode : text.darkMode}
          >
            <ThemeIcon className="h-4 w-4" />
          </button>
          <LanguageMenu locale={locale} open={openControl === "language"} setLocale={setLocale} setOpen={(open) => setOpenControl(open ? "language" : null)} />
          <NotificationsMenu open={openControl === "notifications"} setOpen={(open) => setOpenControl(open ? "notifications" : null)} />
        </div>
        <button
          onClick={logout}
          className="mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-md border border-border bg-secondary text-sm font-semibold text-secondary-foreground transition hover:bg-accent hover:text-accent-foreground"
        >
          <LogOut className="h-4 w-4" />
          {text.signOut}
        </button>
      </div>
    </div>
  )
}

function LanguageMenu({
  compact,
  locale,
  open,
  rail,
  setLocale,
  setOpen,
}: {
  compact?: boolean
  locale: SupportedLocale
  open: boolean
  rail?: boolean
  setLocale: (locale: SupportedLocale) => void
  setOpen: (open: boolean) => void
}) {
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className={`${rail ? "flex h-10 w-10 rounded-xl" : compact ? "flex h-9 w-9 rounded-md" : "sidebar-icon-button"} list-none items-center justify-center border border-border bg-secondary text-secondary-foreground transition hover:bg-accent hover:text-accent-foreground`} aria-label="Language" title={languageNames[locale]}>
        <Languages className="h-4 w-4" />
      </button>
      {open ? <div className={`absolute z-[80] w-64 rounded-md border border-border bg-popover p-2 text-popover-foreground shadow-xl animate-in fade-in zoom-in-95 ${rail ? "bottom-0 left-full ml-2" : compact ? "right-0 mt-2 origin-top-right" : "bottom-11 left-0 origin-bottom-left"}`}>
        <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Language</p>
        <div className="grid max-h-72 gap-1 overflow-auto">
          {supportedLocales.map((item) => (
            <button
              key={item}
              onClick={() => {
                setLocale(item)
                setOpen(false)
              }}
              className={`flex items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm transition hover:bg-accent hover:text-accent-foreground ${locale === item ? "bg-primary text-primary-foreground" : "text-popover-foreground"}`}
            >
              <span>{languageNames[item]}</span>
              {locale === item ? <Check className="h-4 w-4" /> : null}
            </button>
          ))}
        </div>
      </div> : null}
    </div>
  )
}

function NotificationsMenu({ compact, open, rail, setOpen }: { compact?: boolean; open: boolean; rail?: boolean; setOpen: (open: boolean) => void }) {
  const [filter, setFilter] = useState<"all" | "unread">("all")
  const [items, setItems] = useState([
    { id: "review", title: "Review ready", detail: "3 active recall items", unread: true },
    { id: "studio", title: "Studio saved", detail: "Latest workspace sync", unread: false },
    { id: "room", title: "Room status", detail: "Focus room is open", unread: true },
  ])
  const { unreadCount, visibleItems } = useMemo(() => {
    let nextUnreadCount = 0
    const nextVisibleItems = []
    for (const item of items) {
      if (item.unread) nextUnreadCount += 1
      if (filter === "all" || item.unread) nextVisibleItems.push(item)
    }
    return { unreadCount: nextUnreadCount, visibleItems: nextVisibleItems }
  }, [filter, items])

  function markAllRead() {
    setItems((current) => current.map((item) => ({ ...item, unread: false })))
  }

  function toggleRead(id: string) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, unread: !item.unread } : item))
  }

  function dismiss(id: string) {
    setItems((current) => current.filter((item) => item.id !== id))
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className={`${rail ? "flex h-10 w-10 rounded-xl" : compact ? "flex h-9 w-9 rounded-md" : "sidebar-icon-button"} relative list-none items-center justify-center border border-border bg-secondary text-secondary-foreground transition hover:bg-accent hover:text-accent-foreground`} aria-label="Notifications" title="Notifications">
        <Bell className="h-4 w-4" />
        {unreadCount ? <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-success px-1 text-[0.62rem] font-bold leading-none text-success-foreground">{unreadCount}</span> : null}
      </button>
      {open ? <div className={`absolute z-[80] w-72 rounded-md border border-border bg-popover p-2 text-popover-foreground shadow-xl animate-in fade-in zoom-in-95 ${rail ? "bottom-0 left-full ml-2" : compact ? "right-0 mt-2 origin-top-right" : "bottom-11 left-0 origin-bottom-left"}`}>
        <div className="flex items-center justify-between px-2 pb-2">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Notifications</p>
          <button onClick={markAllRead} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-accent-foreground" title="Mark all read">
            <CheckCheck className="h-3.5 w-3.5" />
            Read
          </button>
        </div>
        <div className="mb-2 grid grid-cols-2 gap-1 rounded-md border border-border bg-background p-1">
          {(["all", "unread"] as const).map((item) => (
            <button
              key={item}
              onClick={() => setFilter(item)}
              className={`rounded-sm px-2 py-1.5 text-xs font-semibold capitalize transition ${filter === item ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"}`}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="grid gap-1">
          {visibleItems.length ? visibleItems.map((item) => (
            <div key={item.id} className="group/notification grid grid-cols-[1fr_auto] gap-2 rounded-md p-3 transition hover:bg-accent hover:text-accent-foreground">
              <button onClick={() => toggleRead(item.id)} className="min-w-0 text-left">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  {item.unread ? <span className="h-2 w-2 rounded-full bg-success" /> : null}
                  <span className="truncate">{item.title}</span>
                </span>
                <span className="mt-1 block truncate text-xs text-muted-foreground">{item.detail}</span>
              </button>
              <button onClick={() => dismiss(item.id)} className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground opacity-80 transition hover:bg-background hover:text-destructive group-hover/notification:opacity-100" aria-label={`Dismiss ${item.title}`} title="Dismiss">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )) : (
            <div className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
              No notifications
            </div>
          )}
        </div>
      </div> : null}
    </div>
  )
}

export function MobileMenu({
  density,
  open,
  query,
  setQuery,
  setView,
  text,
  view,
  studioDraftSummary,
  practiceDraftSummary,
}: {
  density: Density
  open: boolean
  query: string
  setQuery: (query: string) => void
  setView: (view: View) => void
  text: Text
  view: View
  studioDraftSummary: StudioDraftSummary
  practiceDraftSummary: PracticeDraftSummary
}) {
  if (!open) return null
  return (
    <div className="border-b border-border bg-sidebar p-3 text-sidebar-foreground lg:hidden">
      <LauncherSearch query={query} setQuery={setQuery} setView={setView} text={text} />
      <Navigation mobile density={density} text={text} view={view} setView={setView} studioDraftSummary={studioDraftSummary} practiceDraftSummary={practiceDraftSummary} />
    </div>
  )
}

function Brand({ compact, text }: { compact?: boolean; text: Text }) {
  if (compact) {
    return (
      <div className="mb-5 flex justify-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm" title={`${text.appName} ${text.workspace}`}>
          <BookOpen className="h-4 w-4" />
        </div>
      </div>
    )
  }

  return (
    <div className="mb-5 flex items-center gap-3 px-1">
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <BookOpen className="h-4 w-4" />
      </div>
      <div>
        <p className="font-semibold">{text.appName}</p>
        <p className="text-xs text-muted-foreground">{text.workspace}</p>
      </div>
    </div>
  )
}

function Navigation({
  density,
  mobile,
  setView,
  text,
  view,
  studioDraftSummary,
  practiceDraftSummary,
}: {
  density: Density
  mobile?: boolean
  setView: (view: View) => void
  text: Text
  view: View
  studioDraftSummary: StudioDraftSummary
  practiceDraftSummary: PracticeDraftSummary
}) {
  const compact = density === "compact"
  const rowHeight = compact ? "h-11" : "h-11"
  const activeGroup = summarizeActiveNavigationGroup(view, navigationGroups)
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const defaults = new Set<string>()
    for (const group of navigationGroups) {
      if (!mobile || group.label === "Home" || activeGroup?.groupLabel === group.label) defaults.add(group.label)
    }
    return defaults
  })

  useEffect(() => {
    if (!activeGroup?.groupLabel) return
    setOpenGroups((current) => {
      if (current.has(activeGroup.groupLabel)) return current
      const next = new Set(current)
      next.add(activeGroup.groupLabel)
      return next
    })
  }, [activeGroup?.groupLabel])

  function toggleGroup(label: string) {
    setOpenGroups((current) => {
      const next = new Set(current)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  return (
    <nav className={compact ? "grid gap-2" : "grid gap-3"}>
      {navigationGroups.map((group) => (
        <details key={group.label} className="group/navigation" open={openGroups.has(group.label)}>
          <summary
            onClick={(event) => {
              event.preventDefault()
              toggleGroup(group.label)
            }}
            className={`${compact ? "mb-1 flex h-5 cursor-pointer list-none items-center justify-center text-[0.6rem]" : "mb-1 flex cursor-pointer list-none items-center justify-between px-2 text-[0.68rem]"} font-semibold uppercase tracking-[0.12em] text-muted-foreground`}
            title={group.caption}
          >
            <span className={`flex min-w-0 items-center ${compact ? "gap-1" : "gap-2"}`}>
              <span>{compact ? group.label.slice(0, 1) : group.label}</span>
              {activeGroup?.groupLabel === group.label ? <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" /> : null}
            </span>
            {compact ? null : <ChevronDown className="h-3.5 w-3.5 transition group-open/navigation:rotate-180" />}
          </summary>
          <div className={`grid gap-1 ${compact ? "justify-center" : ""}`}>
            {group.items.map((item) => {
              const active = viewBelongsToNavigationItem(view, item)
              const Icon = navIconMap[item.iconKey]
              const badge = item.view === "studio" ? studioDraftSummary.count : item.view === "practice" ? practiceDraftSummary.count : 0
              const badgeTitle = item.view === "practice"
                ? formatNavigationBadge(badge, "saved Practice attempt", "saved Practice attempts")
                : formatNavigationBadge(badge, "local Studio draft", "local Studio drafts")
              return (
                <button
                  key={item.view}
                  onClick={() => setView(item.view)}
                  title={`${text[item.labelKey]} - ${getNavigationItemDetail(item)}`}
                  className={`relative flex ${rowHeight} ${compact ? "w-11 justify-center rounded-xl px-0" : "w-full gap-3 rounded-md px-3"} items-center text-sm font-medium transition ${
                    active
                      ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm ring-1 ring-sidebar-ring/20"
                      : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  }`}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" />
                  {compact ? <span className="sr-only">{text[item.labelKey]}</span> : <span className="truncate">{text[item.labelKey]}</span>}
                  {badge ? (
                    <span className={`${compact ? "absolute -right-1 -top-1 h-4 min-w-4 px-1 text-[0.58rem]" : "ml-auto h-5 min-w-5 px-1.5 text-[0.68rem]"} flex items-center justify-center rounded-full font-bold ${active ? "bg-sidebar-primary-foreground text-sidebar-primary" : "bg-warning text-warning-foreground"}`} title={badgeTitle}>
                      {badge}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
        </details>
      ))}
    </nav>
  )
}
