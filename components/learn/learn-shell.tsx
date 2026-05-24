"use client"

import { useEffect, useMemo, useState } from "react"
import { Sidebar, MobileMenu, Topbar, titleForView } from "./app-nav"
import { api } from "./api"
import type { Note, Quiz, User, View } from "./types"
import { StatusMessage } from "./ui"
import { AiTutorView } from "./views/ai-view"
import { DashboardView } from "./views/dashboard-view"
import { FilesView } from "./views/files-view"
import { AdminView, CalendarView, ProgressView, SettingsView } from "./views/secondary-views"
import { useWorkspacePreferences } from "./preferences"
import { FeedView, GraphView, ProfileView, VaultView } from "./views/ecosystem-views"
import { StudioView } from "./views/studio-view"
import { LearnWorkspaceView, PracticeWorkspaceView, SocialWorkspaceView } from "./views/workspaces/combined-workspace-views"
import { PRACTICE_DRAFT_EVENT, readPracticeDrafts, summarizePracticeDrafts, type PracticeDraftSummary } from "@/lib/practice-drafts"
import { readStudioDrafts, STUDIO_DRAFT_EVENT, summarizeStudioDrafts, type StudioDraftSummary } from "@/lib/studio-drafts"
import { getStudioKind, learnWorkspaceViews, practiceViews, socialViews, studioViews, viewFromPath, viewRoutes } from "@/lib/navigation"

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
  const [studioDraftSummary, setStudioDraftSummary] = useState<StudioDraftSummary>({ count: 0, labels: [] })
  const [practiceDraftSummary, setPracticeDraftSummary] = useState<PracticeDraftSummary>({ count: 0, quizIds: [] })
  const [forceOnboarding, setForceOnboarding] = useState(false)
  const preferences = useWorkspacePreferences()

  const selectedNote = useMemo(() => notes.find((note) => note.id === selectedNoteId) || notes[0], [notes, selectedNoteId])
  const filteredNotes = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return notes
    const results: Note[] = []
    for (const note of notes) {
      if (`${note.title} ${note.content} ${note.tags?.join(" ")}`.toLowerCase().includes(needle)) {
        results.push(note)
      }
    }
    return results
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
      const message = error instanceof Error ? error.message : "Unable to load workspace."
      if (/sign in/i.test(message) && typeof window !== "undefined") {
        const redirect = encodeURIComponent(`${window.location.pathname}${window.location.search}`)
        window.location.href = `/login?redirect=${redirect}`
        return
      }
      setStatus(message)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  useEffect(() => {
    setStudioDraftSummary(summarizeStudioDrafts(readStudioDrafts()))
    function updateDraftSummary(event: Event) {
      setStudioDraftSummary((event as CustomEvent<StudioDraftSummary>).detail || summarizeStudioDrafts(readStudioDrafts()))
    }
    window.addEventListener(STUDIO_DRAFT_EVENT, updateDraftSummary)
    return () => window.removeEventListener(STUDIO_DRAFT_EVENT, updateDraftSummary)
  }, [])

  useEffect(() => {
    setPracticeDraftSummary(summarizePracticeDrafts(readPracticeDrafts()))
    function updatePracticeDraftSummary(event: Event) {
      setPracticeDraftSummary((event as CustomEvent<PracticeDraftSummary>).detail || summarizePracticeDrafts(readPracticeDrafts()))
    }

    window.addEventListener(PRACTICE_DRAFT_EVENT, updatePracticeDraftSummary)
    return () => window.removeEventListener(PRACTICE_DRAFT_EVENT, updatePracticeDraftSummary)
  }, [])

  useEffect(() => {
    function syncViewFromLocation() {
      const nextView = viewFromPath(window.location.pathname)
      if (!nextView) return
      setForceOnboarding(new URLSearchParams(window.location.search).get("onboarding") === "1")
      setView(nextView)
      setMenuOpen(false)
      setQuery("")
    }

    syncViewFromLocation()
    window.addEventListener("popstate", syncViewFromLocation)
    return () => window.removeEventListener("popstate", syncViewFromLocation)
  }, [])

  useEffect(() => {
    document.title = `${titleForView(view, preferences.text)} - LEARN`
  }, [preferences.text, view])

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
    setQuery("")
    const nextPath = viewRoutes[nextView]
    if (typeof window !== "undefined" && nextPath && window.location.pathname !== nextPath) {
      window.history.pushState({ learnView: nextView }, "", nextPath)
    }
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <div className="min-h-screen lg:block">
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
          studioDraftSummary={studioDraftSummary}
          practiceDraftSummary={practiceDraftSummary}
        />
        <section className={`min-w-0 overflow-x-hidden ${preferences.density === "compact" ? "lg:ml-[84px]" : "lg:ml-[272px]"}`}>
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
            studioDraftSummary={studioDraftSummary}
            practiceDraftSummary={practiceDraftSummary}
          />
          <MobileMenu
            density={preferences.density}
            open={menuOpen}
            query={query}
            setQuery={setQuery}
            view={view}
            text={preferences.text}
            setView={chooseView}
            studioDraftSummary={studioDraftSummary}
            practiceDraftSummary={practiceDraftSummary}
          />
          <div className={preferences.density === "compact" ? "p-3 lg:p-4" : "p-4 lg:p-6"}>
            {status ? <div className="mb-4"><StatusMessage message={status} /></div> : null}
            {view === "dashboard" ? <DashboardView dashboard={dashboard} forceOnboarding={forceOnboarding} notes={notes} quizzes={quizzes} options={preferences.options} practiceDraftSummary={practiceDraftSummary} setView={chooseView} studioDraftSummary={studioDraftSummary} user={user} /> : null}
            {learnWorkspaceViews.includes(view as (typeof learnWorkspaceViews)[number]) ? <LearnWorkspaceView dashboard={dashboard} quizzes={quizzes} setView={chooseView} /> : null}
            {view === "vault" ? <VaultView setView={chooseView} /> : null}
            {view === "feed" || view === "discover" ? <FeedView setView={chooseView} /> : null}
            {view === "graph" ? <GraphView setView={chooseView} /> : null}
            {view === "progress" ? <ProgressView dashboard={dashboard} quizzes={quizzes} setView={chooseView} /> : null}
            {view === "calendar" ? <CalendarView options={preferences.options} /> : null}
            {studioViews.includes(view as (typeof studioViews)[number]) ? <StudioView initialKind={getStudioKind(view)} notes={filteredNotes} selectedNote={selectedNote} setSelectedNoteId={setSelectedNoteId} setNotes={setNotes} options={preferences.options} onDraftSummary={setStudioDraftSummary} /> : null}
            {practiceViews.includes(view as (typeof practiceViews)[number]) ? <PracticeWorkspaceView initialView={view} quizzes={quizzes} selectedQuizId={selectedQuizId} setSelectedQuizId={setSelectedQuizId} options={preferences.options} setView={chooseView} /> : null}
            {view === "ai" ? <AiTutorView notes={notes} options={preferences.options} setNotes={setNotes} setOptions={preferences.setOptions} setView={chooseView} /> : null}
            {view === "files" ? <FilesView options={preferences.options} setView={chooseView} /> : null}
            {socialViews.includes(view as (typeof socialViews)[number]) ? <SocialWorkspaceView initialView={view} options={preferences.options} setView={chooseView} user={user} /> : null}
            {view === "profile" ? <ProfileView user={user} setView={chooseView} /> : null}
            {view === "settings" ? <SettingsView user={user} automationData={automationData} locale={preferences.locale} options={preferences.options} setLocale={preferences.setLocale} setOptions={preferences.setOptions} /> : null}
            {view === "admin" ? <AdminView user={user} adminData={adminData} automationData={automationData} options={preferences.options} /> : null}
          </div>
        </section>
      </div>
    </main>
  )
}
