"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  AtSign,
  Bell,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Compass,
  Ellipsis,
  Gamepad2,
  Info,
  Languages,
  LogOut,
  Mail,
  MailOpen,
  MessageCircle,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftDashed,
  PanelLeftOpen,
  PhoneMissed,
  Reply,
  Search,
  Settings,
  Share2,
  Sun,
  Trash2,
  UserCheck,
  UserPlus,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from "lucide-react"
import { formatRelativeTime } from "@/lib/format-time"
import { languageNames, supportedLocales, type baseVocabulary, type SupportedLocale } from "@/lib/i18n/vocabulary"
import { formatNavigationBadge } from "@/lib/navigation-features"
import {
  adminOnlyViews,
  getNavigationItemDetail,
  navigationGroups,
  navigationItems,
  navigationSubViews,
  practiceViews,
  resolveNavigationTarget,
  sectionTabForView,
  studioViews,
  viewLabelKeys,
  type LauncherCommandAction,
  type LearnNavigationItem,
  type SectionTab,
} from "@/lib/navigation"
import type { NotificationItem, NotificationKind } from "@/lib/notifications"
import type { PracticeDraftSummary } from "@/lib/practice-drafts"
import type { SidebarMode } from "@/lib/shell/sidebar-mode"
import type { StudioDraftSummary } from "@/lib/studio-drafts"
import type { RealtimeStatus } from "@/lib/realtime/client"
import { api } from "./api"
import { InstallAppButton } from "./app-install"
import { openCommandPalette } from "./command-palette"
import { CreateMenu, openCreateMenu } from "./create-menu"
import { viewIcons } from "./nav-icons"
import { openPlaceGuide } from "./place-guide"
import { useInboxEvent, useInboxStatus } from "./realtime-inbox"
import type { User, View } from "./types"

type Text = typeof baseVocabulary
type Density = "compact" | "comfortable"
type ThemeChoice = "light" | "dark" | "system"

/**
 * Commands that open a surface rather than navigate. The command palette only
 * knows views, so these two entries name an action and are handed to the
 * components that own the Create menu and the guide.
 */
export const launcherActions: Record<LauncherCommandAction, () => void> = {
  "create-menu": openCreateMenu,
  "place-guide": openPlaceGuide,
}

export function titleForView(view: View, text: Text) {
  if (view === "dashboard" || view === "studio") return "Studio"
  return text[viewLabelKeys[view]] || text.dashboard
}

const ghostIconButton =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

/** "Ctrl" everywhere, "⌘" on Apple devices; settled after mount so SSR and the first paint agree. */
function useModKeyLabel() {
  const [label, setLabel] = useState("Ctrl")
  useEffect(() => {
    if (/Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent)) setLabel("⌘")
  }, [])
  return label
}

/** Open state for a click-to-open panel that closes on an outside press or Escape. */
function usePopover() {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return
      setOpen(false)
      rootRef.current?.querySelector<HTMLElement>("[data-popover-trigger]")?.focus()
    }
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  return { open, rootRef, setOpen }
}

function subViewsFor(view: View, user: User | null) {
  const isAdmin = user?.role === "admin"
  return (navigationSubViews[view] ?? []).filter((sub) => isAdmin || !adminOnlyViews.includes(sub))
}

function draftBadgeFor(item: LearnNavigationItem, studioDraftSummary: StudioDraftSummary, practiceDraftSummary: PracticeDraftSummary) {
  const count = item.view === "dashboard" ? studioDraftSummary.count : item.view === "practice" ? practiceDraftSummary.count : 0
  const title = item.view === "practice"
    ? formatNavigationBadge(count, "saved Practice attempt", "saved Practice attempts")
    : formatNavigationBadge(count, "local Studio draft", "local Studio drafts")
  return { count, title }
}

/* ------------------------------------------------------------------------ */
/* Brand                                                                     */
/* ------------------------------------------------------------------------ */

/** A simple folded L, shared with the installed-app icon. */
function BrandMark({ size = "md" }: { size?: "sm" | "md" }) {
  return <svg viewBox="0 0 48 48" className={size === "sm" ? "h-8 w-8 shrink-0" : "h-10 w-10 shrink-0"} fill="none" aria-hidden="true">
    <rect width="48" height="48" rx="13" fill="currentColor" className="text-foreground" />
    <path d="M14 12h7v23h-7zM21 28h14v7H21z" className="fill-background" />
    <path d="M26 13h9v9h-9z" className="fill-primary" />
  </svg>
}

/* ------------------------------------------------------------------------ */
/* Sidebar                                                                   */
/* ------------------------------------------------------------------------ */

export function Sidebar({
  hideCreate = false,
  mode,
  onModeChange,
  practiceDraftSummary,
  setView,
  studioDraftSummary,
  text,
  user,
  view,
}: {
  hideCreate?: boolean
  mode: SidebarMode
  onModeChange: (mode: SidebarMode) => void
  practiceDraftSummary: PracticeDraftSummary
  setView: (view: View) => void
  studioDraftSummary: StudioDraftSummary
  text: Text
  user: User | null
  view: View
}) {
  const modKey = useModKeyLabel()
  if (mode === "hidden") return null
  const compact = mode === "rail"

  return (
    <aside
      aria-label="Main navigation"
      className="learn-sidebar fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex"
    >
      {compact ? (
        <div className="flex flex-col items-center gap-2 px-2 pb-2 pt-4">
          <button type="button" onClick={() => setView("dashboard")} className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`${text.appName} home`} title={`${text.appName} home`}>
            <BrandMark />
          </button>
          <button type="button" onClick={() => onModeChange("expanded")} className={ghostIconButton} aria-label="Expand sidebar" title={`Expand sidebar (${modKey}+\\)`}>
            <PanelLeftOpen className="h-[18px] w-[18px]" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3 px-4 pb-3 pt-4">
          <button type="button" onClick={() => setView("dashboard")} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <BrandMark size="sm" />
            <span className="min-w-0">
              <span className="block font-display text-lg font-bold leading-tight tracking-tight">{text.appName}</span>

            </span>
          </button>
          <button type="button" onClick={() => onModeChange("rail")} className={ghostIconButton} aria-label="Collapse sidebar to icons" title={`Collapse to icons (${modKey}+\\)`}>
            <PanelLeftClose className="h-[18px] w-[18px]" />
          </button>
        </div>
      )}

      <div className={compact ? "px-2" : "px-3"}>
        {hideCreate ? null : <CreateMenu variant={compact ? "rail" : "sidebar"} setView={setView} />}
        {compact ? (
          <div className="mb-3 flex justify-center">
            <button type="button" onClick={openCommandPalette} className={`${ghostIconButton} h-11 w-11 rounded-xl border border-sidebar-border bg-background/60`} aria-label="Search or jump" title={`Search or jump (${modKey}+K)`}>
              <Search className="h-[18px] w-[18px]" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={openCommandPalette}
            className="mb-3 flex h-9 w-full items-center gap-2 rounded-lg border border-sidebar-border bg-background/70 px-3 text-sm text-muted-foreground transition hover:border-ring/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Search className="h-4 w-4" />
            <span className="whitespace-nowrap text-xs">Search or jump</span>
            <span className="ml-auto flex items-center gap-0.5">
              <kbd className="learn-kbd">{modKey}</kbd>
              <kbd className="learn-kbd">K</kbd>
            </span>
          </button>
        )}
      </div>

      <div className={`min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-3 ${compact ? "px-2" : "px-3"}`}>
        <Navigation compact={compact} practiceDraftSummary={practiceDraftSummary} setView={setView} studioDraftSummary={studioDraftSummary} text={text} user={user} view={view} />
      </div>

      <SidebarFooter compact={compact} modKey={modKey} onModeChange={onModeChange} />
    </aside>
  )
}

function Navigation({
  compact,
  practiceDraftSummary,
  setView,
  studioDraftSummary,
  text,
  user,
  view,
}: {
  compact: boolean
  practiceDraftSummary: PracticeDraftSummary
  setView: (view: View) => void
  studioDraftSummary: StudioDraftSummary
  text: Text
  user: User | null
  view: View
}) {
  const activePrimary = resolveNavigationTarget(view).primaryView

  if (compact) {
    return (
      <nav aria-label="Sections">
        <ul className="grid justify-items-center gap-1.5">
          {navigationItems.map((item) => {
            const active = item.view === activePrimary
            const Icon = viewIcons[item.view]
            const label = String(text[item.labelKey])
            const badge = draftBadgeFor(item, studioDraftSummary, practiceDraftSummary)
            return (
              <li key={item.view}>
                <button
                  type="button"
                  data-tab={sectionTabForView(item.view)}
                  onClick={() => setView(item.view)}
                  aria-current={active ? "page" : undefined}
                  aria-label={label}
                  title={`${label}: ${getNavigationItemDetail(item)}`}
                  className={`relative flex h-11 w-11 items-center justify-center rounded-xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    active ? "learn-tab-dot learn-tab-on shadow-paper" : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {badge.count ? (
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-warning px-1 text-[0.58rem] font-bold text-warning-foreground ring-2 ring-sidebar" title={badge.title}>
                      {badge.count}
                    </span>
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>
    )
  }

  return (
    <nav aria-label="Sections" className="grid gap-3">
      {navigationGroups.map((group) => (
        <div key={group.label}>
          <p className="sr-only" title={group.caption}>
            {group.label}
          </p>
          <ul className="grid gap-0.5">
            {group.items.map((item) => {
              const active = item.view === activePrimary
              const Icon = viewIcons[item.view]
              const tab = sectionTabForView(item.view)
              const badge = draftBadgeFor(item, studioDraftSummary, practiceDraftSummary)
              const subViews = active && item.view !== "dashboard" ? subViewsFor(item.view, user) : []
              return (
                <li key={item.view} data-tab={tab}>
                  <button
                    type="button"
                    onClick={() => setView(item.view)}
                    aria-current={view === item.view ? "page" : undefined}
                    title={getNavigationItemDetail(item)}
                    className={`relative flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      active
                        ? "learn-tab-marker learn-tab-wash-strong font-semibold text-foreground"
                        : "font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    }`}
                  >
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center ${active ? "text-foreground" : "text-muted-foreground"}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="truncate">{text[item.labelKey]}</span>
                    {badge.count ? (
                      <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-warning px-1.5 text-[0.68rem] font-bold text-warning-foreground" title={badge.title}>
                        {badge.count}
                      </span>
                    ) : null}
                  </button>
                  {subViews.length ? (
                    <ul className="learn-pop-in ml-[1.4rem] mt-0.5 grid gap-0.5 border-l-2 learn-tab-border pl-2.5">
                      {subViews.map((sub) => {
                        const SubIcon = viewIcons[sub]
                        const subActive = view === sub
                        return (
                          <li key={sub}>
                            <button
                              type="button"
                              onClick={() => setView(sub)}
                              aria-current={subActive ? "page" : undefined}
                              className={`flex h-8 w-full items-center gap-2 rounded-md px-2 text-[0.82rem] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                                subActive ? "learn-tab-wash font-semibold text-foreground" : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                              }`}
                            >
                              <SubIcon className={`h-3.5 w-3.5 shrink-0 ${subActive ? "learn-tab-ink" : ""}`} />
                              <span className="truncate">{text[viewLabelKeys[sub]]}</span>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}

function ConnectionStatus({ compact, status }: { compact?: boolean; status: RealtimeStatus }) {
  const label = status === "open" ? "Live" : status === "closed" ? "Offline" : "Reconnecting…"
  const detail = status === "open"
    ? "Connected: messages, calls and notifications arrive instantly"
    : status === "closed"
      ? "Not connected to live updates"
      : "Reconnecting to live updates"
  const tone = status === "open" ? "bg-success" : status === "closed" ? "bg-muted-foreground/50" : "animate-pulse bg-warning"
  return (
    <span className="inline-flex items-center gap-1.5 text-[0.72rem] font-medium text-muted-foreground" title={detail}>
      <span className={`h-2 w-2 rounded-full ${tone}`} aria-hidden="true" />
      {compact ? <span className="sr-only">{label}</span> : label}
    </span>
  )
}

function SidebarFooter({ compact, modKey, onModeChange }: { compact: boolean; modKey: string; onModeChange: (mode: SidebarMode) => void }) {
  const status = useInboxStatus()

  if (compact) {
    return (
      <div className="grid justify-items-center gap-2 border-t border-sidebar-border px-2 py-3">
        <button type="button" onClick={openPlaceGuide} className={ghostIconButton} aria-label="What's where?" title="What's where?">
          <Compass className="h-[18px] w-[18px]" />
        </button>
        <ConnectionStatus compact status={status} />
      </div>
    )
  }

  return (
    <div className="border-t border-sidebar-border px-3 py-3">
      <button
        type="button"
        onClick={openPlaceGuide}
        className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-sidebar-foreground/80 transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Compass className="h-4 w-4" />
        What&apos;s where?
      </button>
      <div className="mt-1.5 flex items-center justify-between gap-2 pl-2.5">
        <ConnectionStatus status={status} />
        <button type="button" onClick={() => onModeChange("hidden")} className={`${ghostIconButton} h-8 w-8`} aria-label="Hide sidebar" title={`Hide sidebar (${modKey}+\\)`}>
          <PanelLeftDashed className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------------ */
/* Top bar                                                                   */
/* ------------------------------------------------------------------------ */

export function Topbar({
  hideCreate = false,
  density,
  locale,
  logout,
  onSidebarModeChange,
  openLink,
  practiceDraftSummary,
  resolvedTheme,
  setDensity,
  setLocale,
  setTheme,
  setView,
  sidebarMode,
  studioDraftSummary,
  text,
  theme,
  user,
  view,
}: {
  hideCreate?: boolean
  density: Density
  locale: SupportedLocale
  logout: () => void
  onSidebarModeChange: (mode: SidebarMode) => void
  openLink: (href: string) => void
  practiceDraftSummary: PracticeDraftSummary
  resolvedTheme?: string
  setDensity: (density: Density) => void
  setLocale: (locale: SupportedLocale) => void
  setTheme: (theme: string) => void
  setView: (view: View) => void
  sidebarMode: SidebarMode
  studioDraftSummary: StudioDraftSummary
  text: Text
  theme?: string
  user: User | null
  view: View
}) {
  const modKey = useModKeyLabel()
  const target = resolveNavigationTarget(view)
  const primary = navigationItems.find((item) => item.view === target.primaryView)
  const sectionLabel = primary ? String(text[primary.labelKey]) : ""
  const title = String(titleForView(view, text))
  const showSection = target.isAlias && Boolean(sectionLabel) && sectionLabel !== title
  const ThemeIcon = resolvedTheme === "dark" ? Sun : Moon

  return (
    <header className="learn-topbar sticky top-0 z-30 border-b border-border bg-card">
      <div className="flex h-14 items-center gap-2 px-3 sm:px-4 lg:px-6">
        {sidebarMode === "hidden" ? (
          <button type="button" onClick={() => onSidebarModeChange("expanded")} className={`${ghostIconButton} hidden lg:inline-flex`} aria-label="Show sidebar" title={`Show sidebar (${modKey}+\\)`}>
            <PanelLeftOpen className="h-[18px] w-[18px]" />
          </button>
        ) : null}
        <button type="button" onClick={() => setView("dashboard")} className={`shrink-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${sidebarMode === "hidden" ? "" : "lg:hidden"}`} aria-label={`${text.appName} home`} title={`${text.appName} home`}>
          <BrandMark size="sm" />
        </button>

        <div data-tab={sectionTabForView(view)} className="flex min-w-0 flex-1 items-center gap-1.5 pl-1">
          {showSection ? (
            <>
              <button
                type="button"
                onClick={() => setView(target.primaryView)}
                className="hidden shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-sm font-medium text-muted-foreground transition hover:bg-accent hover:text-accent-foreground sm:inline-flex"
              >
                <span className="learn-tab-dot h-2 w-2 rounded-full" aria-hidden="true" />
                {sectionLabel}
              </button>
              <ChevronRight className="hidden h-4 w-4 shrink-0 text-muted-foreground/60 sm:block" aria-hidden="true" />
            </>
          ) : (
            null
          )}
          <h1 className="truncate text-sm font-semibold tracking-tight">{title}</h1>
          {studioDraftSummary.count && studioViews.includes(view as (typeof studioViews)[number]) ? (
            <span className="hidden shrink-0 rounded-md bg-secondary px-2 py-0.5 text-[0.68rem] text-muted-foreground sm:inline-flex">
              {studioDraftSummary.count} draft{studioDraftSummary.count === 1 ? "" : "s"}
            </span>
          ) : null}
          {practiceDraftSummary.count && practiceViews.includes(view as (typeof practiceViews)[number]) ? (
            <span className="hidden shrink-0 rounded-full bg-warning px-2 py-0.5 text-[0.68rem] font-semibold text-warning-foreground sm:inline-flex">
              {practiceDraftSummary.count} saved attempt{practiceDraftSummary.count === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
          <button
            type="button"
            onClick={openCommandPalette}
            className={`h-8 w-52 items-center gap-2 rounded-md border border-border bg-background px-3 text-xs text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring ${sidebarMode === "expanded" ? "hidden" : "hidden md:flex"}`}
          >
            <Search className="h-4 w-4" />
            <span className="truncate">Search or jump…</span>
            <span className="ml-auto flex items-center gap-0.5">
              <kbd className="learn-kbd">{modKey}</kbd>
              <kbd className="learn-kbd">K</kbd>
            </span>
          </button>
          <button type="button" onClick={openCommandPalette} className={`${ghostIconButton} md:hidden`} aria-label="Search or jump" title="Search or jump">
            <Search className="h-[18px] w-[18px]" />
          </button>
          <div className="hidden sm:block">
            {hideCreate ? null : <CreateMenu variant="header" setView={setView} />}
          </div>
          <NotificationsMenu openLink={openLink} user={user} />
          <div className="hidden xl:block"><InstallAppButton /></div>
          <button
            type="button"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            className={`${ghostIconButton} hidden sm:inline-flex`}
            aria-label={resolvedTheme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            title={resolvedTheme === "dark" ? text.lightMode : text.darkMode}
          >
            <ThemeIcon className="h-[18px] w-[18px]" />
          </button>
          <AccountMenu
            density={density}
            locale={locale}
            logout={logout}
            modKey={modKey}
            onSidebarModeChange={onSidebarModeChange}
            setDensity={setDensity}
            setLocale={setLocale}
            setTheme={setTheme}
            setView={setView}
            sidebarMode={sidebarMode}
            text={text}
            theme={theme}
            user={user}
          />
        </div>
      </div>
    </header>
  )
}

/* ------------------------------------------------------------------------ */
/* Account                                                                   */
/* ------------------------------------------------------------------------ */

function Avatar({ className = "h-8 w-8 text-xs", user }: { className?: string; user: User | null }) {
  const initial = (user?.name || user?.username || "L").trim().slice(0, 1).toUpperCase()
  return (
    <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary font-semibold text-primary-foreground ${className}`}>
      {user?.avatarUrl ? <img src={user.avatarUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" /> : initial}
    </span>
  )
}

function Segmented<T extends string>({
  label,
  onChange,
  options,
  value,
}: {
  label: string
  onChange: (value: T) => void
  options: ReadonlyArray<{ value: T; label: string; icon?: LucideIcon }>
  value: T | undefined
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-lg bg-muted p-1">
      {options.map((option) => {
        const Icon = option.icon
        const checked = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(option.value)}
            className={`flex h-8 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              checked ? "bg-card text-foreground shadow-paper" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

const themeOptions: ReadonlyArray<{ value: ThemeChoice; label: string; icon: LucideIcon }> = [
  { value: "light", label: "Paper", icon: Sun },
  { value: "dark", label: "Ink", icon: Moon },
  { value: "system", label: "Auto", icon: Monitor },
]

const sidebarOptions: ReadonlyArray<{ value: SidebarMode; label: string }> = [
  { value: "expanded", label: "Full" },
  { value: "rail", label: "Icons" },
  { value: "hidden", label: "Hidden" },
]

function AccountMenu({
  density,
  locale,
  logout,
  modKey,
  onSidebarModeChange,
  setDensity,
  setLocale,
  setTheme,
  setView,
  sidebarMode,
  text,
  theme,
  user,
}: {
  density: Density
  locale: SupportedLocale
  logout: () => void
  modKey: string
  onSidebarModeChange: (mode: SidebarMode) => void
  setDensity: (density: Density) => void
  setLocale: (locale: SupportedLocale) => void
  setTheme: (theme: string) => void
  setView: (view: View) => void
  sidebarMode: SidebarMode
  text: Text
  theme?: string
  user: User | null
}) {
  const { open, rootRef, setOpen } = usePopover()
  const [languagesOpen, setLanguagesOpen] = useState(false)
  const status = useInboxStatus()

  function go(next: View) {
    setOpen(false)
    setView(next)
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        data-popover-trigger
        onClick={() => {
          setLanguagesOpen(false)
          setOpen(!open)
        }}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Account: ${user?.name || "you"}`}
        title={user?.name || "Account"}
        className="relative ml-0.5 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <Avatar user={user} />
        <span
          className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-background ${status === "open" ? "bg-success" : status === "closed" ? "bg-muted-foreground/50" : "bg-warning"}`}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Account and preferences"
          className="learn-pop-in fixed inset-x-3 top-[3.75rem] z-[80] max-h-[calc(100vh-5rem)] overflow-y-auto rounded-2xl border border-border bg-popover p-2 text-popover-foreground shadow-lift sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-80"
        >
          <div className="flex items-center gap-3 rounded-xl p-2">
            <Avatar user={user} className="h-11 w-11 text-base" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-display font-semibold">{user?.name || "Learner"}</p>
              <p className="truncate text-xs text-muted-foreground">@{user?.username || "you"} · <span className="capitalize">{user?.role || "learner"}</span></p>
            </div>
            <ConnectionStatus status={status} />
          </div>

          <div className="my-1 grid gap-0.5">
            <MenuRow icon={UserRound} label="Your profile" onClick={() => go("profile")} />
            <MenuRow icon={Settings} label={String(text.settings)} onClick={() => go("settings")} />
          </div>

          <div className="grid gap-3 border-t border-border px-2 pb-2 pt-3">
            <div className="grid gap-1.5">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Theme</p>
              <Segmented label="Theme" options={themeOptions} value={(theme as ThemeChoice | undefined) ?? "system"} onChange={(next) => setTheme(next)} />
            </div>
            <div className="hidden gap-1.5 lg:grid">
              <p className="flex items-center justify-between text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Sidebar
                <span className="normal-case tracking-normal">
                  <kbd className="learn-kbd">{modKey}</kbd> <kbd className="learn-kbd">\</kbd>
                </span>
              </p>
              <Segmented label="Sidebar size" options={sidebarOptions} value={sidebarMode} onChange={onSidebarModeChange} />
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={density === "compact"}
              onClick={() => setDensity(density === "compact" ? "comfortable" : "compact")}
              className="flex items-center justify-between gap-3 rounded-lg py-1 text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Compact spacing
              <span className={`relative h-5 w-9 shrink-0 rounded-full transition ${density === "compact" ? "bg-primary" : "bg-muted-foreground/35"}`}>
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-background shadow transition-all ${density === "compact" ? "left-[1.1rem]" : "left-0.5"}`} />
              </span>
            </button>
            <div>
              <button
                type="button"
                onClick={() => setLanguagesOpen(!languagesOpen)}
                aria-expanded={languagesOpen}
                className="flex w-full items-center justify-between gap-3 rounded-lg py-1 text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex items-center gap-2">
                  <Languages className="h-4 w-4 text-muted-foreground" />
                  Language
                </span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  {languageNames[locale]}
                  <ChevronDown className={`h-3.5 w-3.5 transition ${languagesOpen ? "rotate-180" : ""}`} />
                </span>
              </button>
              {languagesOpen ? (
                <div className="mt-1 grid max-h-48 gap-0.5 overflow-y-auto rounded-lg border border-border p-1">
                  {supportedLocales.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => {
                        setLocale(item)
                        setLanguagesOpen(false)
                      }}
                      className={`flex items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left text-sm transition ${locale === item ? "bg-accent font-semibold text-accent-foreground" : "hover:bg-accent/60"}`}
                    >
                      <span>{languageNames[item]}</span>
                      {locale === item ? <Check className="h-4 w-4" /> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="border-t border-border pt-1">
            <MenuRow icon={LogOut} label={String(text.signOut)} onClick={logout} tone="destructive" />
          </div>
        </div>
      ) : null}
    </div>
  )
}

function MenuRow({ icon: Icon, label, onClick, tone }: { icon: LucideIcon; label: string; onClick: () => void; tone?: "destructive" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-10 w-full items-center gap-3 rounded-lg px-2.5 text-left text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        tone === "destructive" ? "text-destructive hover:bg-destructive/10" : "hover:bg-accent hover:text-accent-foreground"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  )
}

/* ------------------------------------------------------------------------ */
/* Notifications                                                             */
/* ------------------------------------------------------------------------ */

const notificationIcons: Record<NotificationKind, LucideIcon> = {
  "connection-request": UserPlus,
  "connection-accepted": UserCheck,
  "group-added": Users,
  mention: AtSign,
  message: MessageCircle,
  "missed-call": PhoneMissed,
  share: Share2,
  "game-invite": Gamepad2,
  "story-reply": Reply,
  system: Info,
}

const notificationTabs: Record<NotificationKind, SectionTab> = {
  "connection-request": "social",
  "connection-accepted": "social",
  "group-added": "social",
  mention: "social",
  message: "social",
  "missed-call": "social",
  share: "studio",
  "game-invite": "practice",
  "story-reply": "social",
  system: "settings",
}

interface NotificationList {
  items: NotificationItem[]
  unreadCount: number
}

function NotificationsMenu({ openLink, user }: { openLink: (href: string) => void; user: User | null }) {
  const { open, rootRef, setOpen } = usePopover()
  const [items, setItems] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [filter, setFilter] = useState<"all" | "unread">("all")
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState("")
  const [toasts, setToasts] = useState<NotificationItem[]>([])
  const itemsRef = useRef(items)
  const status = useInboxStatus()
  const previousStatus = useRef(status)
  const userId = user?.id

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  const apply = useCallback((data: NotificationList) => {
    setItems(data.items)
    setUnreadCount(data.unreadCount)
    setError("")
  }, [])

  const load = useCallback(async () => {
    try {
      apply(await api<NotificationList>("/api/notifications?limit=40"))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Notifications could not load.")
    } finally {
      setLoaded(true)
    }
  }, [apply])

  useEffect(() => {
    if (userId) void load()
  }, [load, userId])

  // Anything pushed while the socket was down is only in the database.
  useEffect(() => {
    const previous = previousStatus.current
    previousStatus.current = status
    if (userId && status === "open" && previous === "reconnecting") void load()
  }, [load, status, userId])

  useEffect(() => {
    if (open && userId) void load()
  }, [load, open, userId])

  useInboxEvent("notification", (frame) => {
    const item = (frame.payload as { item?: NotificationItem } | undefined)?.item
    if (!item?.id) return
    const known = itemsRef.current.find((entry) => entry.id === item.id)
    if (!known || known.readAt) setUnreadCount((count) => count + 1)
    setItems((current) => [item, ...current.filter((entry) => entry.id !== item.id)].slice(0, 60))
    if (!open) {
      setToasts((current) => [item, ...current.filter((entry) => entry.id !== item.id)].slice(0, 3))
      window.setTimeout(() => setToasts((current) => current.filter((entry) => entry.id !== item.id)), 6500)
    }
  })

  async function send(request: Promise<NotificationList>) {
    try {
      apply(await request)
    } catch {
      void load()
    }
  }

  function markAllRead() {
    const now = new Date().toISOString()
    setItems((current) => current.map((item) => (item.readAt ? item : { ...item, readAt: now })))
    setUnreadCount(0)
    void send(api<NotificationList>("/api/notifications", { method: "PATCH", body: JSON.stringify({ all: true }) }))
  }

  function setRead(item: NotificationItem, read: boolean) {
    if (Boolean(item.readAt) === read) return
    setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, readAt: read ? new Date().toISOString() : null } : entry)))
    setUnreadCount((count) => Math.max(0, count + (read ? -1 : 1)))
    void send(api<NotificationList>("/api/notifications", { method: "PATCH", body: JSON.stringify({ ids: [item.id], read }) }))
  }

  async function dismiss(item: NotificationItem) {
    setItems((current) => current.filter((entry) => entry.id !== item.id))
    if (!item.readAt) setUnreadCount((count) => Math.max(0, count - 1))
    try {
      await api(`/api/notifications?id=${encodeURIComponent(item.id)}`, { method: "DELETE" })
    } catch {
      void load()
    }
  }

  function activate(item: NotificationItem) {
    setRead(item, true)
    setOpen(false)
    setToasts((current) => current.filter((entry) => entry.id !== item.id))
    if (item.link) openLink(item.link)
  }

  const visible = filter === "unread" ? items.filter((item) => !item.readAt) : items

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        data-popover-trigger
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"}
        title="Notifications"
        className={`${ghostIconButton} relative`}
      >
        <Bell className="h-[18px] w-[18px]" />
        {unreadCount ? (
          <span className="absolute right-0.5 top-0.5 flex h-[1.05rem] min-w-[1.05rem] items-center justify-center rounded-full bg-destructive px-1 text-[0.6rem] font-bold leading-none text-destructive-foreground ring-2 ring-background">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Notifications"
          className="learn-pop-in fixed inset-x-3 top-[3.75rem] z-[80] flex max-h-[calc(100vh-5rem)] flex-col overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-lift sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:max-h-[32rem] sm:w-[23rem]"
        >
          <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-3">
            <p className="font-display text-base font-semibold">Notifications</p>
            <button
              type="button"
              onClick={markAllRead}
              disabled={!unreadCount}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-muted-foreground transition hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </button>
          </div>
          <div className="px-3 pb-2">
            <Segmented
              label="Show"
              options={[
                { value: "all", label: "All" },
                { value: "unread", label: unreadCount ? `Unread (${unreadCount})` : "Unread" },
              ]}
              value={filter}
              onChange={setFilter}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {error && !items.length ? (
              <p className="m-2 rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">{error}</p>
            ) : !loaded ? (
              <div className="grid gap-2 p-2" aria-hidden="true">
                {[0, 1, 2].map((index) => (
                  <div key={index} className="h-14 animate-pulse rounded-xl bg-muted" />
                ))}
              </div>
            ) : visible.length ? (
              <ul className="grid gap-0.5">
                {visible.map((item) => (
                  <NotificationRow key={item.id} item={item} onActivate={activate} onDismiss={dismiss} onToggleRead={(entry) => setRead(entry, !entry.readAt)} />
                ))}
              </ul>
            ) : (
              <div className="grid justify-items-center gap-2 px-6 py-10 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Bell className="h-5 w-5" />
                </span>
                <p className="text-sm font-semibold">{filter === "unread" ? "You're all caught up" : "Nothing yet"}</p>
                <p className="text-xs text-muted-foreground">Connection requests, mentions, missed calls and shares show up here the moment they happen.</p>
              </div>
            )}
          </div>
        </div>
      ) : null}

      <NotificationToasts items={toasts} onActivate={activate} onDismiss={(item) => setToasts((current) => current.filter((entry) => entry.id !== item.id))} />
    </div>
  )
}

function NotificationBadgeIcon({ item }: { item: NotificationItem }) {
  const Icon = notificationIcons[item.kind] ?? Info
  const actorInitial = (item.actorName || "").trim().slice(0, 1).toUpperCase()
  return (
    <span data-tab={notificationTabs[item.kind] ?? "settings"} className="relative mt-0.5 shrink-0">
      {item.actorAvatarUrl ? (
        <img src={item.actorAvatarUrl} alt="" loading="lazy" decoding="async" className="h-10 w-10 rounded-full object-cover" />
      ) : actorInitial ? (
        <span className="learn-tab-wash-strong flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-foreground">{actorInitial}</span>
      ) : (
        <span className="learn-tab-wash learn-tab-ink flex h-10 w-10 items-center justify-center rounded-full">
          <Icon className="h-[18px] w-[18px]" />
        </span>
      )}
      {item.actorAvatarUrl || actorInitial ? (
        <span className="learn-tab-dot learn-tab-on absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-popover">
          <Icon className="h-3 w-3" />
        </span>
      ) : null}
    </span>
  )
}

function NotificationRow({
  item,
  onActivate,
  onDismiss,
  onToggleRead,
}: {
  item: NotificationItem
  onActivate: (item: NotificationItem) => void
  onDismiss: (item: NotificationItem) => void
  onToggleRead: (item: NotificationItem) => void
}) {
  const unread = !item.readAt
  return (
    <li className={`group/notification relative flex gap-3 rounded-xl p-2.5 transition hover:bg-accent/60 ${unread ? "bg-primary/[0.06]" : ""}`}>
      <button type="button" onClick={() => onActivate(item)} className="flex min-w-0 flex-1 gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <NotificationBadgeIcon item={item} />
        <span className="min-w-0 flex-1">
          <span className={`block text-sm leading-snug ${unread ? "font-semibold text-foreground" : "text-foreground/85"}`}>{item.title}</span>
          {item.body ? <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{item.body}</span> : null}
          <span className="mt-1 block text-[0.7rem] font-medium text-muted-foreground">{formatRelativeTime(item.createdAt)}</span>
        </span>
      </button>
      <span className="flex shrink-0 flex-col items-center gap-1">
        <span className={`relative mt-1.5 h-2 w-2 rounded-full ${unread ? "bg-primary" : ""}`}>{unread ? <span className="sr-only">Unread</span> : null}</span>
        <span className="flex flex-col opacity-100 transition sm:opacity-0 sm:group-hover/notification:opacity-100 sm:group-focus-within/notification:opacity-100">
          <button type="button" onClick={() => onToggleRead(item)} className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground" aria-label={unread ? "Mark as read" : "Mark as unread"} title={unread ? "Mark as read" : "Mark as unread"}>
            {unread ? <MailOpen className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}
          </button>
          <button type="button" onClick={() => onDismiss(item)} className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-destructive" aria-label={`Remove: ${item.title}`} title="Remove">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </span>
      </span>
    </li>
  )
}

/** A live notification that arrives while the panel is closed pops up briefly. */
function NotificationToasts({
  items,
  onActivate,
  onDismiss,
}: {
  items: NotificationItem[]
  onActivate: (item: NotificationItem) => void
  onDismiss: (item: NotificationItem) => void
}) {
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-24 right-3 z-[85] grid w-[min(22rem,calc(100vw-1.5rem))] gap-2 lg:bottom-5 lg:right-5">
      {items.map((item) => (
        <div key={item.id} className="learn-pop-in pointer-events-auto flex items-start gap-3 rounded-2xl border border-border bg-popover p-3 text-popover-foreground shadow-lift">
          <button type="button" onClick={() => onActivate(item)} className="flex min-w-0 flex-1 gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <NotificationBadgeIcon item={item} />
            <span className="min-w-0">
              <span className="block text-sm font-semibold leading-snug">{item.title}</span>
              {item.body ? <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{item.body}</span> : null}
            </span>
          </button>
          <button type="button" onClick={() => onDismiss(item)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground" aria-label="Close" title="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------------ */
/* Phone: bottom tabs and the "More" sheet                                   */
/* ------------------------------------------------------------------------ */

const mobileTabViews: readonly View[] = ["dashboard", "ai", "practice", "social"]

export function MobileTabBar({
  logout,
  setView,
  text,
  user,
  view,
}: {
  logout: () => void
  setView: (view: View) => void
  text: Text
  user: User | null
  view: View
}) {
  const [moreOpen, setMoreOpen] = useState(false)
  const activePrimary = resolveNavigationTarget(view).primaryView
  const moreActive = !mobileTabViews.includes(activePrimary)

  useEffect(() => {
    if (!moreOpen) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMoreOpen(false)
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [moreOpen])

  function go(next: View) {
    setMoreOpen(false)
    setView(next)
  }

  return (
    <>
      <nav aria-label="Main" className="learn-bottom-safe fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-md lg:hidden">
        <ul className="mx-auto grid max-w-lg grid-cols-5 px-1 pt-1.5">
          {mobileTabViews.map((tabView) => {
            const item = navigationItems.find((entry) => entry.view === tabView)
            const Icon = viewIcons[tabView]
            const active = activePrimary === tabView
            return (
              <li key={tabView} data-tab={sectionTabForView(tabView)}>
                <button
                  type="button"
                  onClick={() => go(tabView)}
                  aria-current={active ? "page" : undefined}
                  className="flex w-full flex-col items-center gap-0.5 rounded-xl py-0.5 text-[0.68rem] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className={`flex h-8 w-14 items-center justify-center rounded-full transition ${active ? "learn-tab-wash-strong learn-tab-ink" : "text-muted-foreground"}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className={active ? "text-foreground" : "text-muted-foreground"}>{item ? text[item.labelKey] : tabView}</span>
                </button>
              </li>
            )
          })}
          <li>
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-expanded={moreOpen}
              aria-haspopup="dialog"
              className="flex w-full flex-col items-center gap-0.5 rounded-xl py-0.5 text-[0.68rem] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className={`flex h-8 w-14 items-center justify-center rounded-full transition ${moreActive ? "bg-accent text-accent-foreground" : "text-muted-foreground"}`}>
                <Ellipsis className="h-5 w-5" />
              </span>
              <span className={moreActive ? "text-foreground" : "text-muted-foreground"}>More</span>
            </button>
          </li>
        </ul>
      </nav>

      {moreOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Everything in LEARN">
          <div className="absolute inset-0 bg-foreground/30 backdrop-blur-[2px]" onClick={() => setMoreOpen(false)} aria-hidden="true" />
          <div className="learn-pop-in learn-bottom-safe absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto overscroll-contain rounded-t-3xl border-t border-border bg-popover px-4 pt-2 text-popover-foreground shadow-lift">
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted-foreground/30" aria-hidden="true" />
            <div className="mb-4 flex items-center gap-3">
              <Avatar user={user} className="h-11 w-11 text-base" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-display font-semibold">{user?.name || "Learner"}</p>
                <p className="truncate text-xs text-muted-foreground">@{user?.username || "you"}</p>
              </div>
              <button type="button" onClick={() => setMoreOpen(false)} className={ghostIconButton} aria-label="Close" title="Close">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-2 pb-4">
              {navigationItems.map((item) => {
                const Icon = viewIcons[item.view]
                const subViews = subViewsFor(item.view, user)
                const active = activePrimary === item.view
                return (
                  <div key={item.view} data-tab={sectionTabForView(item.view)} className={`rounded-2xl border p-2 ${active ? "learn-tab-border learn-tab-wash" : "border-border bg-card"}`}>
                    <button type="button" onClick={() => go(item.view)} aria-current={view === item.view ? "page" : undefined} className="flex w-full items-center gap-3 rounded-xl p-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <span className="learn-tab-dot learn-tab-on flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
                        <Icon className="h-[18px] w-[18px]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">{text[item.labelKey]}</span>
                        <span className="block truncate text-xs text-muted-foreground">{getNavigationItemDetail(item)}</span>
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                    {subViews.length ? (
                      <div className="mt-1 flex flex-wrap gap-1.5 px-1.5 pb-1">
                        {subViews.map((sub) => {
                          const SubIcon = viewIcons[sub]
                          return (
                            <button
                              key={sub}
                              type="button"
                              onClick={() => go(sub)}
                              aria-current={view === sub ? "page" : undefined}
                              className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition ${
                                view === sub ? "learn-tab-border learn-tab-wash-strong text-foreground" : "border-border bg-background text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              <SubIcon className="h-3.5 w-3.5" />
                              {text[viewLabelKeys[sub]]}
                            </button>
                          )
                        })}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>

            <div className="grid grid-cols-2 gap-2 border-t border-border py-4">
              <button type="button" onClick={() => { setMoreOpen(false); openPlaceGuide() }} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-semibold">
                <Compass className="h-4 w-4" />
                What&apos;s where?
              </button>
              <button type="button" onClick={logout} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-semibold text-destructive">
                <LogOut className="h-4 w-4" />
                {text.signOut}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
