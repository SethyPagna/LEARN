"use client"

import { useEffect, useMemo, useState } from "react"
import { Sidebar, MobileMenu, Topbar } from "./app-nav"
import { api } from "./api"
import type { Note, Quiz, StudioKind, User, View } from "./types"
import { StatusMessage } from "./ui"
import { AiTutorView } from "./views/ai-view"
import { DashboardView } from "./views/dashboard-view"
import { FilesView } from "./views/files-view"
import { AdminView, SettingsView } from "./views/secondary-views"
import { useWorkspacePreferences } from "./preferences"
import { ProfileView } from "./views/ecosystem-views"
import { StudioView } from "./views/studio-view"
import { LearnWorkspaceView, PracticeWorkspaceView, SocialWorkspaceView } from "./views/combined-workspace-views"

const studioViews = ["studio", "notes", "docs", "sheets", "slides"] as const
const learnViews = ["learn", "vault", "feed", "discover", "graph", "reviews", "calendar", "progress"] as const
const practiceViews = ["practice", "quizzes", "games"] as const
const socialViews = ["social", "chat", "spaces", "rooms", "battles"] as const

function getStudioKind(view: View): StudioKind {
  return view === "docs" || view === "sheets" || view === "slides" ? view : "notes"
}

export function LearnShell({
  initialView = "dashboard",
  initialNoteId,
  initialQuizId,
}: {
  initialView?: View
  initialNoteId?: string
  initialQuizId?: string
}) {
  const [view, setView] = useState<View>(initialView)
  const [menuOpen, setMenuOpen] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [selectedNoteId, setSelectedNoteId] = useState(initialNoteId || "")
  const [selectedQuizId, setSelectedQuizId] = useState(initialQuizId || "")
  const [dashboard, setDashboard] = useState<any>(null)
  const [adminData, setAdminData] = useState<any>(null)
  const [automationData, setAutomationData] = useState<any>(null)
  const [status, setStatus] = useState("Loading workspace...")
  const [query, setQuery] = useState("")
  const preferences = useWorkspacePreferences()

  const selectedNote = notes.find((note) => note.id === selectedNoteId) || notes[0]
  const filteredNotes = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return notes
    return notes.filter((note) => `${note.title} ${note.content} ${note.tags?.join(" ")}`.toLowerCase().includes(needle))
  }, [notes, query])

  async function refresh() {
    try {
      const [session, dashboardData, notesData, quizzesData] = await Promise.all([
        api<{ user: User | null }>("/api/auth/session"),
        api<any>("/api/dashboard"),
        api<{ items: Note[] }>("/api/notes"),
        api<{ items: Quiz[] }>("/api/quizzes"),
      ])
      setUser(session.user)
      setDashboard(dashboardData)
      setNotes(notesData.items)
      setQuizzes(quizzesData.items)
      setSelectedNoteId((current) => current || initialNoteId || notesData.items[0]?.id || "")
      setSelectedQuizId((current) => current || initialQuizId || quizzesData.items[0]?.id || "")
      setStatus("")
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to load workspace.")
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  useEffect(() => {
    if (view !== "admin" || adminData || user?.role !== "admin") return
    api<any>("/api/admin").then(setAdminData).catch((error) => setStatus(error.message))
  }, [view, adminData, user?.role])

  useEffect(() => {
    if (!["settings", "admin"].includes(view) || automationData) return
    api<any>("/api/automation").then(setAutomationData).catch((error) => setStatus(error.message))
  }, [view, automationData])

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" })
    window.location.href = "/login"
  }

  function chooseView(nextView: View) {
    setView(nextView)
    setMenuOpen(false)
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className={`grid min-h-screen ${preferences.density === "compact" ? "lg:grid-cols-[232px_1fr]" : "lg:grid-cols-[272px_1fr]"}`}>
        <Sidebar
          density={preferences.density}
          locale={preferences.locale}
          logout={logout}
          view={view}
          query={query}
          resolvedTheme={preferences.resolvedTheme}
          setQuery={setQuery}
          setDensity={preferences.setDensity}
          setLocale={preferences.setLocale}
          setTheme={preferences.setTheme}
          setView={chooseView}
          text={preferences.text}
          user={user}
        />
        <section className="min-w-0">
          <Topbar
            density={preferences.density}
            locale={preferences.locale}
            resolvedTheme={preferences.resolvedTheme}
            setDensity={preferences.setDensity}
            setLocale={preferences.setLocale}
            setTheme={preferences.setTheme}
            text={preferences.text}
            view={view}
            user={user}
            menuOpen={menuOpen}
            setMenuOpen={setMenuOpen}
            logout={logout}
          />
          <MobileMenu density={preferences.density} open={menuOpen} view={view} text={preferences.text} setView={chooseView} />
          <div className={preferences.density === "compact" ? "p-3 lg:p-4" : "p-4 lg:p-6"}>
            {status ? <div className="mb-4"><StatusMessage message={status} /></div> : null}
            {view === "dashboard" ? <DashboardView dashboard={dashboard} notes={notes} quizzes={quizzes} options={preferences.options} setView={chooseView} /> : null}
            {learnViews.includes(view as (typeof learnViews)[number]) ? <LearnWorkspaceView dashboard={dashboard} initialView={view} options={preferences.options} quizzes={quizzes} setView={chooseView} /> : null}
            {studioViews.includes(view as (typeof studioViews)[number]) ? <StudioView initialKind={getStudioKind(view)} notes={filteredNotes} selectedNote={selectedNote} setSelectedNoteId={setSelectedNoteId} setNotes={setNotes} options={preferences.options} /> : null}
            {practiceViews.includes(view as (typeof practiceViews)[number]) ? <PracticeWorkspaceView initialView={view} quizzes={quizzes} selectedQuizId={selectedQuizId} setSelectedQuizId={setSelectedQuizId} options={preferences.options} /> : null}
            {view === "ai" ? <AiTutorView notes={notes} options={preferences.options} setOptions={preferences.setOptions} /> : null}
            {view === "files" ? <FilesView options={preferences.options} /> : null}
            {socialViews.includes(view as (typeof socialViews)[number]) ? <SocialWorkspaceView initialView={view} options={preferences.options} /> : null}
            {view === "profile" ? <ProfileView user={user} /> : null}
            {view === "settings" ? <SettingsView user={user} automationData={automationData} options={preferences.options} setOptions={preferences.setOptions} /> : null}
            {view === "admin" ? <AdminView user={user} adminData={adminData} automationData={automationData} options={preferences.options} /> : null}
          </div>
        </section>
      </div>
    </main>
  )
}
