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
  LogOut,
  Menu,
  Search,
  Settings,
  Shield,
  X,
} from "lucide-react"
import type { View, User } from "./types"

const navItems: { view: View; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { view: "dashboard", label: "Dashboard", icon: Home },
  { view: "notes", label: "Notes", icon: FileText },
  { view: "quizzes", label: "Quizzes", icon: BookOpen },
  { view: "ai", label: "AI Tutor", icon: Bot },
  { view: "files", label: "Files", icon: Files },
  { view: "progress", label: "Progress", icon: BarChart3 },
  { view: "calendar", label: "Calendar", icon: CalendarDays },
  { view: "settings", label: "Settings", icon: Settings },
  { view: "admin", label: "Admin", icon: Shield },
]

export function titleForView(view: View) {
  return {
    dashboard: "Dashboard",
    notes: "Notes",
    quizzes: "Quiz Studio",
    ai: "AI Tutor",
    files: "Files",
    progress: "Progress",
    calendar: "Study Calendar",
    settings: "Settings",
    admin: "Admin",
  }[view]
}

export function Sidebar({
  view,
  query,
  setQuery,
  setView,
  goalCompletion,
}: {
  view: View
  query: string
  setQuery: (query: string) => void
  setView: (view: View) => void
  goalCompletion: number
}) {
  return (
    <aside className="hidden border-r border-[#d8dce2] bg-[#f7f9fb] px-3 py-4 lg:block">
      <Brand />
      <div className="mb-3 flex h-9 items-center gap-2 rounded-md border border-[#d8dce2] bg-white px-3">
        <Search className="h-4 w-4 text-[#697586]" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search notes"
          className="w-full bg-transparent text-sm outline-none"
        />
      </div>
      <Navigation view={view} setView={setView} />
      <div className="mt-5 rounded-lg border border-[#d8dce2] bg-white p-3">
        <p className="text-xs font-semibold uppercase text-[#697586]">Today</p>
        <p className="mt-2 text-2xl font-semibold text-[#17202a]">{goalCompletion}%</p>
        <p className="text-xs text-[#697586]">goal completion</p>
      </div>
    </aside>
  )
}

export function Topbar({
  view,
  user,
  menuOpen,
  setMenuOpen,
  logout,
}: {
  view: View
  user: User | null
  menuOpen: boolean
  setMenuOpen: (open: boolean) => void
  logout: () => void
}) {
  const MenuIcon = menuOpen ? X : Menu
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-[#d8dce2] bg-white/95 px-4 py-3 backdrop-blur lg:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="flex h-9 w-9 items-center justify-center rounded-md border border-[#d8dce2] text-[#17202a] lg:hidden"
          aria-label="Toggle menu"
        >
          <MenuIcon className="h-4 w-4" />
        </button>
        <div>
          <p className="text-xs font-semibold uppercase text-[#697586]">LEARN</p>
          <h1 className="text-xl font-semibold text-[#17202a]">{titleForView(view)}</h1>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="hidden text-right sm:block">
          <p className="text-sm font-semibold text-[#17202a]">{user?.name || "Loading"}</p>
          <p className="text-xs capitalize text-[#697586]">{user?.role || "learner"}</p>
        </div>
        <button onClick={logout} className="flex h-9 items-center gap-2 rounded-md border border-[#d8dce2] bg-white px-3 text-sm font-medium text-[#17202a]">
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </header>
  )
}

export function MobileMenu({
  open,
  view,
  setView,
}: {
  open: boolean
  view: View
  setView: (view: View) => void
}) {
  if (!open) return null
  return (
    <div className="border-b border-[#d8dce2] bg-[#f7f9fb] p-3 lg:hidden">
      <Navigation view={view} setView={setView} />
    </div>
  )
}

function Brand() {
  return (
    <div className="mb-5 flex items-center gap-3 px-1">
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[#17202a] text-white">
        <BookOpen className="h-4 w-4" />
      </div>
      <div>
        <p className="font-semibold text-[#17202a]">LEARN</p>
        <p className="text-xs text-[#697586]">Study workspace</p>
      </div>
    </div>
  )
}

function Navigation({ view, setView }: { view: View; setView: (view: View) => void }) {
  return (
    <nav className="grid gap-1">
      {navItems.map((item) => {
        const active = view === item.view
        const Icon = item.icon
        return (
          <button
            key={item.view}
            onClick={() => setView(item.view)}
            className={`flex h-9 w-full items-center gap-3 rounded-md px-3 text-sm font-medium transition ${
              active ? "bg-[#17202a] text-white" : "text-[#4d5a68] hover:bg-[#e9edf2]"
            }`}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </button>
        )
      })}
    </nav>
  )
}
