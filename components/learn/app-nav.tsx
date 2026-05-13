"use client"

import type React from "react"
import {
  BookOpen,
  Bot,
  ChevronDown,
  Compass,
  Files,
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
  Shield,
  Sun,
  MessagesSquare,
  X,
} from "lucide-react"
import { supportedLocales, type baseVocabulary, type SupportedLocale } from "@/lib/i18n/vocabulary"
import type { View, User } from "./types"

type Text = typeof baseVocabulary
type Density = "compact" | "comfortable"
type NavItem = { view: View; labelKey: keyof Text; icon: React.ComponentType<{ className?: string }>; aliases?: View[] }
type NavGroup = { label: string; items: NavItem[] }

const studioViews: View[] = ["studio", "notes", "docs", "sheets", "slides"]
const learnViews: View[] = ["learn", "vault", "feed", "discover", "graph", "reviews", "calendar", "progress"]
const practiceViews: View[] = ["practice", "quizzes", "games"]
const socialViews: View[] = ["social", "chat", "spaces", "rooms", "battles"]

const navGroups: NavGroup[] = [
  {
    label: "Home",
    items: [{ view: "dashboard", labelKey: "dashboard", icon: Home }],
  },
  {
    label: "Workspaces",
    items: [{ view: "learn", labelKey: "learn", icon: Compass, aliases: ["vault", "feed", "discover", "graph", "reviews", "calendar", "progress"] }],
  },
  {
    label: "Studio",
    items: [
      { view: "studio", labelKey: "studio", icon: FileText, aliases: ["notes", "docs", "sheets", "slides"] },
      { view: "files", labelKey: "files", icon: Files },
      { view: "ai", labelKey: "aiTutor", icon: Bot },
    ],
  },
  {
    label: "Practice",
    items: [{ view: "practice", labelKey: "practice", icon: Gamepad2, aliases: ["quizzes", "games"] }],
  },
  {
    label: "Social",
    items: [{ view: "social", labelKey: "social", icon: MessagesSquare, aliases: ["chat", "spaces", "rooms", "battles"] }],
  },
  {
    label: "Manage",
    items: [
      { view: "profile", labelKey: "profile", icon: BookOpen },
      { view: "settings", labelKey: "settings", icon: Settings },
      { view: "admin", labelKey: "admin", icon: Shield },
    ],
  },
]
const navItems = navGroups.flatMap((group) => group.items)

export function titleForView(view: View, text: Text) {
  if (studioViews.includes(view)) return text.studio
  if (learnViews.includes(view)) return text.learn
  if (practiceViews.includes(view)) return text.practice
  if (socialViews.includes(view)) return text.social
  const item = navItems.find((entry) => entry.view === view)
  return item ? text[item.labelKey] : text.dashboard
}

export function Sidebar({
  density,
  query,
  setQuery,
  setView,
  text,
  view,
}: {
  density: Density
  query: string
  setQuery: (query: string) => void
  setView: (view: View) => void
  text: Text
  view: View
}) {
  return (
    <aside className="sticky top-0 hidden h-screen overflow-y-auto border-r border-border bg-sidebar px-3 py-4 text-sidebar-foreground lg:block">
      <Brand text={text} />
      <div className="mb-3 flex h-9 items-center gap-2 rounded-md border border-sidebar-border bg-background px-3">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search Studio"
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      <Navigation density={density} text={text} view={view} setView={setView} />
    </aside>
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
}) {
  const MenuIcon = menuOpen ? X : Menu
  const ThemeIcon = resolvedTheme === "dark" ? Moon : Sun
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border bg-background/95 px-4 py-2.5 text-foreground backdrop-blur lg:px-6">
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
        <label className="flex h-9 items-center gap-2 rounded-md border border-border bg-secondary px-2 text-secondary-foreground">
          <Languages className="h-4 w-4 text-muted-foreground" />
          <select
            value={locale}
            onChange={(event) => setLocale(event.target.value as SupportedLocale)}
            className="max-w-20 bg-secondary text-xs font-medium text-secondary-foreground outline-none sm:max-w-28"
            aria-label="Language"
          >
            {supportedLocales.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>
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

export function MobileMenu({
  density,
  open,
  setView,
  text,
  view,
}: {
  density: Density
  open: boolean
  setView: (view: View) => void
  text: Text
  view: View
}) {
  if (!open) return null
  return (
    <div className="border-b border-border bg-sidebar p-3 text-sidebar-foreground lg:hidden">
      <Navigation density={density} text={text} view={view} setView={setView} />
    </div>
  )
}

function Brand({ text }: { text: Text }) {
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
  setView,
  text,
  view,
}: {
  density: Density
  setView: (view: View) => void
  text: Text
  view: View
}) {
  const rowHeight = density === "compact" ? "h-9" : "h-11"
  return (
    <nav className="grid gap-3">
      {navGroups.map((group) => (
        <details key={group.label} className="group/navigation" open>
          <summary className="mb-1 flex cursor-pointer list-none items-center justify-between px-2 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            <span>{group.label}</span>
            <ChevronDown className="h-3.5 w-3.5 transition group-open/navigation:rotate-180 lg:hidden" />
          </summary>
          <div className="grid gap-1">
            {group.items.map((item) => {
              const active = view === item.view || item.aliases?.includes(view)
              const Icon = item.icon
              return (
                <button
                  key={item.view}
                  onClick={() => setView(item.view)}
                  className={`flex ${rowHeight} w-full items-center gap-3 rounded-md px-3 text-sm font-medium transition ${
                    active
                      ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm ring-1 ring-sidebar-ring/20"
                      : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  }`}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" />
                  <span className="truncate">{text[item.labelKey]}</span>
                </button>
              )
            })}
          </div>
        </details>
      ))}
    </nav>
  )
}
