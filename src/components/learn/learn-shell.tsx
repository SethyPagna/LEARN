"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { launcherActions, MobileTabBar, Sidebar, Topbar, titleForView } from "./app-nav"
import { api } from "./api"
import { CommandPalette } from "./command-palette"
import { PlaceGuide, openPlaceGuide } from "./place-guide"
import { RealtimeInboxProvider } from "./realtime-inbox"
import type { AdminData, AutomationData, DashboardData, Note, Quiz, User, View } from "./types"
import { StatusMessage } from "./ui"
import { AiTutorView } from "./views/ai-view"
import { CanvasEditorView } from "./views/canvas-editor"
import { StudioLobby } from "./studio-lobby"
import { AppInstallProvider } from "./app-install"
import { FilesView } from "./views/files-view"
import { AdminView, ProgressView, SettingsView } from "./views/secondary-views"
import { CalendarView } from "./views/calendar-view"
import { useWorkspacePreferences } from "./preferences"
import { FeedView, GraphView, ProfileView, ReviewsView, VaultView } from "./views/ecosystem-views"
import { LiveQuizView } from "./views/live-quiz-view"
import { StudioView } from "./views/studio-view"
import { PracticeWorkspaceView, SocialWorkspaceView } from "./views/workspaces/combined-workspace-views"
import { PRACTICE_DRAFT_EVENT, readPracticeDrafts, summarizePracticeDrafts, type PracticeDraftSummary } from "@/lib/practice-drafts"
import { readStudioDrafts, STUDIO_DRAFT_EVENT, summarizeStudioDrafts, type StudioDraftSummary } from "@/lib/studio-drafts"
import { getStudioKind, practiceViews, socialViews, studioViews, viewFromPath, viewRoutes } from "@/lib/navigation"
import { cycleSidebarMode, DEFAULT_SIDEBAR_MODE, sidebarModeCookie, type SidebarMode } from "@/lib/shell/sidebar-mode"

/** `/profile/<username>` names someone else's profile; `/profile` is your own. */
function profileUsernameFromPath(pathname: string) {
  const [first, second] = pathname.split("/").filter(Boolean)
  if (first !== "profile" || !second) return undefined
  try {
    return decodeURIComponent(second)
  } catch {
    return second
  }
}

export function LearnShell({
  initialView = "dashboard",
  initialNoteId,
  initialQuizId,
  initialSidebarMode = DEFAULT_SIDEBAR_MODE,
  profileUsername: initialProfileUsername,
}: {
  initialView?: View
  initialNoteId?: string
  initialQuizId?: string
  /** Read from the cookie on the server, so the first paint already has the right width. */
  initialSidebarMode?: SidebarMode
  profileUsername?: string
}) {
  const [view, setView] = useState<View>(initialView)
  const [locationSearch, setLocationSearch] = useState("")
  const [sidebarMode, setSidebarMode] = useState(initialSidebarMode)
  const [profileUsername, setProfileUsername] = useState(initialProfileUsername)
  const [user, setUser] = useState<User | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [selectedNoteId, setSelectedNoteId] = useState(initialNoteId || "")
  const [selectedQuizId, setSelectedQuizId] = useState(initialQuizId || "")
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [adminData, setAdminData] = useState<AdminData | null>(null)
  const [automationData, setAutomationData] = useState<AutomationData | null>(null)
  const [status, setStatus] = useState("")
  const [studioDraftSummary, setStudioDraftSummary] = useState<StudioDraftSummary>({ count: 0, labels: [] })
  const [practiceDraftSummary, setPracticeDraftSummary] = useState<PracticeDraftSummary>({ count: 0, quizIds: [] })
  const preferences = useWorkspacePreferences()
  const { resolvedTheme, setTheme } = preferences

  const selectedNote = useMemo(() => notes.find((note) => note.id === selectedNoteId) || notes[0], [notes, selectedNoteId])

  async function refresh() {
    try {
      const [session, dashboardData, notesData, quizzesData] = await Promise.all([
        api<{ user: User | null }>("/api/auth/session"),
        api<DashboardData>("/api/dashboard"),
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
      if (new URLSearchParams(window.location.search).get("onboarding") === "1") openPlaceGuide()
      setLocationSearch(window.location.search)
      setProfileUsername(profileUsernameFromPath(window.location.pathname))
      setView(nextView)
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
    api<AdminData>("/api/admin").then(setAdminData).catch((error) => setStatus(error.message))
  }, [view, adminData, user?.role])

  useEffect(() => {
    if (!["settings", "admin"].includes(view) || automationData) return
    api<AutomationData>("/api/automation").then(setAutomationData).catch((error) => setStatus(error.message))
  }, [view, automationData])

  const changeSidebarMode = useCallback((mode: SidebarMode) => {
    setSidebarMode(mode)
    // A cookie rather than localStorage: the server reads it, so a reload
    // paints the sidebar at its chosen width instead of flashing the default.
    document.cookie = sidebarModeCookie(mode)
  }, [])

  const cycleSidebar = useCallback(() => {
    setSidebarMode((current) => {
      const next = cycleSidebarMode(current)
      document.cookie = sidebarModeCookie(next)
      return next
    })
  }, [])

  // Ctrl/Cmd+\ cycles full → icons → hidden. An editor that binds the same
  // chord for itself calls preventDefault() first and keeps it.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || !(event.ctrlKey || event.metaKey) || event.altKey || event.key !== "\\") return
      event.preventDefault()
      cycleSidebar()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [cycleSidebar])

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" })
    window.location.href = "/login"
  }

  const chooseView = useCallback((nextView: View) => {
    setView(nextView)
    setProfileUsername(undefined)
    const nextPath = viewRoutes[nextView]
    if (typeof window !== "undefined" && nextPath && window.location.pathname !== nextPath) {
      window.history.pushState({ learnView: nextView }, "", nextPath)
      setLocationSearch("")
    }
  }, [])

  /** In-app links (a notification's target) keep their query, e.g. `/chat?thread=…`. */
  const openLink = useCallback((href: string) => {
    const url = new URL(href, window.location.origin)
    const nextView = url.origin === window.location.origin ? viewFromPath(url.pathname) : null
    if (!nextView) {
      window.location.assign(href)
      return
    }
    window.history.pushState({ learnView: nextView }, "", `${url.pathname}${url.search}${url.hash}`)
    setLocationSearch(url.search)
    setProfileUsername(profileUsernameFromPath(url.pathname))
    setView(nextView)
  }, [])

  const openNote = useCallback((id: string) => {
    setSelectedNoteId(id)
    chooseView("notes")
  }, [chooseView])

  const openQuiz = useCallback((id: string) => {
    setSelectedQuizId(id)
    chooseView("quizzes")
  }, [chooseView])

  const toggleTheme = useCallback(() => setTheme(resolvedTheme === "dark" ? "light" : "dark"), [resolvedTheme, setTheme])
  const isStudioLobby = view === "dashboard" || view === "studio" || (view === "canvas" && !new URLSearchParams(locationSearch).has("design"))

  return (
    <AppInstallProvider><RealtimeInboxProvider userId={user?.id}>
      <div className="learn-app min-h-screen overflow-x-hidden bg-background text-foreground" data-sidebar={sidebarMode} data-density={preferences.density} data-view={view}>
        {/* WCAG 2.4.1 (bypass blocks): the sidebar and topbar repeat on every view,
            so the first focusable element in the shell is a link that jumps past
            them. It sits just above the viewport until it is focused and only then
            slides into view, which keeps it invisible to sighted users without
            hiding it from the keyboard (no `sr-only`, so it is a real target the
            moment it receives focus). */}
        <a
          href="#learn-main-content"
          className="absolute left-4 top-4 z-[80] -translate-y-[200%] rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground focus:translate-y-0 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Skip to content
        </a>
        <Sidebar
          hideCreate
          mode={sidebarMode}
          onModeChange={changeSidebarMode}
          practiceDraftSummary={practiceDraftSummary}
          setView={chooseView}
          studioDraftSummary={studioDraftSummary}
          text={preferences.text}
          user={user}
          view={view}
        />
        <div className="learn-app-column">
          <Topbar
            hideCreate={isStudioLobby}
            density={preferences.density}
            locale={preferences.locale}
            logout={logout}
            onSidebarModeChange={changeSidebarMode}
            openLink={openLink}
            practiceDraftSummary={practiceDraftSummary}
            resolvedTheme={preferences.resolvedTheme}
            setDensity={preferences.setDensity}
            setLocale={preferences.setLocale}
            setTheme={preferences.setTheme}
            setView={chooseView}
            sidebarMode={sidebarMode}
            studioDraftSummary={studioDraftSummary}
            text={preferences.text}
            theme={preferences.theme}
            user={user}
            view={view}
          />
          <main
            id="learn-main-content"
            tabIndex={-1}
            className={`learn-paper min-h-[calc(100vh-var(--shell-topbar))] min-w-0 pb-28 focus:outline-none lg:pb-10 ${preferences.density === "compact" ? "px-3 pt-4 sm:px-5 lg:px-6" : "px-4 pt-5 sm:px-6 lg:px-8 lg:pt-7"}`}
          >
            {status ? <div className="mb-4"><StatusMessage message={status} /></div> : null}
            {isStudioLobby ? <StudioLobby key={view} notes={notes} options={preferences.options} onOpen={openLink} onNoteCreated={(note) => setNotes((current) => [note, ...current])} initialFilter={view === "canvas" ? "Canvas" : "All"} /> : null}
            {view === "vault" ? <VaultView setView={chooseView} notes={notes} /> : null}
            {/* `discover` is a documented alias of `feed`, not a second screen: both
                views render the same FeedView. `/discover` exists as a route (and
                `viewFromPath` resolves it to the `discover` view), but the catalog
                deliberately has no separate Discover place, so the shared render is
                intentional. See src/tests/ux/artifact-catalog.test.ts, which pins it. */}
            {view === "feed" || view === "discover" ? <FeedView setView={chooseView} /> : null}
            {view === "graph" ? <GraphView setView={chooseView} /> : null}
            {view === "progress" ? <ProgressView dashboard={dashboard} quizzes={quizzes} setView={chooseView} /> : null}
            {view === "calendar" ? <CalendarView options={preferences.options} /> : null}
            {view === "canvas" && new URLSearchParams(locationSearch).has("design") ? <CanvasEditorView key={locationSearch} notes={notes} onHome={() => chooseView("dashboard")} /> : null}
            {/* `live` is a Practice alias with a screen of its own; the Practice
                workspace below is for every other Practice view, so the two never
                stack on one page. */}
            {view === "live" ? <LiveQuizView quizzes={quizzes} user={user} /> : null}
            {view === "reviews" ? <ReviewsView setView={chooseView} /> : null}
            {view !== "studio" && studioViews.includes(view as (typeof studioViews)[number]) ? <StudioView key={`${view}:${locationSearch}`} setView={chooseView} initialKind={getStudioKind(view)} notes={notes} selectedNote={selectedNote} setSelectedNoteId={setSelectedNoteId} setNotes={setNotes} options={preferences.options} onDraftSummary={setStudioDraftSummary} /> : null}
            {view !== "live" && view !== "reviews" && practiceViews.includes(view as (typeof practiceViews)[number]) ? <PracticeWorkspaceView initialView={view} quizzes={quizzes} selectedQuizId={selectedQuizId} setSelectedQuizId={setSelectedQuizId} options={preferences.options} setView={chooseView} /> : null}
            {view === "ai" ? <AiTutorView notes={notes} options={preferences.options} setNotes={setNotes} setQuizzes={setQuizzes} setOptions={preferences.setOptions} setView={chooseView} /> : null}
            {view === "files" ? <FilesView options={preferences.options} setView={chooseView} /> : null}
            {socialViews.includes(view as (typeof socialViews)[number]) ? <SocialWorkspaceView initialView={view} options={preferences.options} setView={chooseView} user={user} /> : null}
            {view === "profile" ? <ProfileView key={profileUsername || "me"} user={user} username={profileUsername} setView={chooseView} /> : null}
            {view === "settings" ? <SettingsView user={user} automationData={automationData} locale={preferences.locale} options={preferences.options} setLocale={preferences.setLocale} setOptions={preferences.setOptions} /> : null}
            {view === "admin" ? <AdminView user={user} adminData={adminData} automationData={automationData} options={preferences.options} /> : null}
          </main>
        </div>
        <MobileTabBar logout={logout} setView={chooseView} text={preferences.text} user={user} view={view} />
        <CommandPalette
          actions={launcherActions}
          notes={notes}
          onCycleSidebar={cycleSidebar}
          onToggleTheme={toggleTheme}
          openNote={openNote}
          openQuiz={openQuiz}
          quizzes={quizzes}
          resolvedTheme={resolvedTheme}
          setView={chooseView}
          text={preferences.text}
          user={user}
        />
        <PlaceGuide setView={chooseView} />
      </div>
    </RealtimeInboxProvider></AppInstallProvider>
  )
}
