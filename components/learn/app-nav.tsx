"use client"

import type React from "react"
import {
  BarChart3,
  BookOpen,
  Bot,
  CalendarDays,
  Files,
  FileText,
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
  X,
} from "lucide-react"
import { supportedLocales, type baseVocabulary, type SupportedLocale } from "@/lib/i18n/vocabulary"
import type { View, User } from "./types"

type Text = typeof baseVocabulary
type Density = "compact" | "comfortable"

const navItems: { view: View; labelKey: keyof Text; icon: React.ComponentType<{ className?: string }> }[] = [
  { view: "dashboard", labelKey: "dashboard", icon: Home },
  { view: "notes", labelKey: "notes", icon: FileText },
  { view: "quizzes", labelKey: "quizzes", icon: BookOpen },
  { view: "ai", labelKey: "aiTutor", icon: Bot },
  { view: "files", labelKey: "files", icon: Files },
  { view: "progress", labelKey: "progress", icon: BarChart3 },
  { view: "calendar", labelKey: "calendar", icon: CalendarDays },
  { view: "settings", labelKey: "settings", icon: Settings },
  { view: "admin", labelKey: "admin", icon: Shield },
]

export function titleForView(view: View, text: Text) {
  return navItems.find((item) => item.view === view)?.labelKey
    ? text[navItems.find((item) => item.view === view)!.labelKey]
    : text.dashboard
}

export function Sidebar({
  density,
  goalCompletion,
  query,
  setQuery,
  setView,
  text,
  view,
}: {
  density: Density
  goalCompletion: number
  query: string
  setQuery: (query: string) => void
  setView: (view: View) => void
  text: Text
  view: View
}) {
  return (
    <aside className="hidden border-r border-border bg-sidebar px-3 py-4 text-sidebar-foreground lg:block">
      <Brand text={text} />
      <div className="mb-3 flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search notes"
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      <Navigation density={density} text={text} view={view} setView={setView} />
      <div className="mt-5 rounded-lg border border-border bg-card p-3 text-card-foreground">
        <p className="text-xs font-semibold uppercase text-muted-foreground">Today</p>
        <p className="mt-2 text-2xl font-semibold">{goalCompletion}%</p>
        <p className="text-xs text-muted-foreground">{text.goalCompletion}</p>
      </div>
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
          className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-card-foreground lg:hidden"
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
          className="hidden h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-card-foreground sm:flex"
          aria-label="Toggle density"
          title={density === "compact" ? "Comfortable spacing" : "Compact spacing"}
        >
          {density === "compact" ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
        <button
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-card-foreground"
          aria-label="Toggle theme"
          title={resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
        >
          <ThemeIcon className="h-4 w-4" />
        </button>
        <label className="flex h-9 items-center gap-2 rounded-md border border-border bg-card px-2 text-card-foreground">
          <Languages className="h-4 w-4 text-muted-foreground" />
          <select
            value={locale}
            onChange={(event) => setLocale(event.target.value as SupportedLocale)}
            className="max-w-20 bg-transparent text-xs font-medium outline-none sm:max-w-28"
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
          className="flex h-9 items-center gap-2 rounded-md border border-border bg-card px-2 text-sm font-medium text-card-foreground sm:px-3"
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
        <p className="text-xs text-muted-foreground">Study workspace</p>
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
    <nav className="grid gap-1">
      {navItems.map((item) => {
        const active = view === item.view
        const Icon = item.icon
        return (
          <button
            key={item.view}
            onClick={() => setView(item.view)}
            className={`flex ${rowHeight} w-full items-center gap-3 rounded-md px-3 text-sm font-medium transition ${
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{text[item.labelKey]}</span>
          </button>
        )
      })}
    </nav>
  )
}
