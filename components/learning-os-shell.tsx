"use client"

import { useEffect, useMemo, useState } from "react"
import {
  BarChart3,
  BookOpen,
  Bot,
  CalendarDays,
  Check,
  ChevronRight,
  Database,
  FileText,
  Home,
  LayoutDashboard,
  Library,
  LogOut,
  Plus,
  Save,
  Search,
  Settings,
  Shield,
  Sparkles,
  Star,
  Target,
} from "lucide-react"

type View = "dashboard" | "notes" | "quizzes" | "ai" | "progress" | "calendar" | "settings" | "admin"

interface User {
  id: string
  name: string
  username: string
  email: string
  role: "admin" | "learner"
  preferences: Record<string, unknown>
}

interface Note {
  id: string
  title: string
  icon: string
  content: string
  favorite: boolean
  template: string
  updated_at: string
  tags?: string[]
}

interface Quiz {
  id: string
  title: string
  topic: string
  description: string
  question_count?: number
  questions?: {
    id: string
    question: string
    choices: { id: string; text: string }[]
    correct_answer_id: string
    topic: string
    explanation: string
  }[]
}

const navItems: { view: View; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { view: "dashboard", label: "Home", icon: Home },
  { view: "notes", label: "Notes", icon: FileText },
  { view: "notes", label: "Knowledge Base", icon: Library },
  { view: "quizzes", label: "Quizzes", icon: BookOpen },
  { view: "ai", label: "AI Tutor", icon: Bot },
  { view: "progress", label: "Progress", icon: BarChart3 },
  { view: "calendar", label: "Calendar", icon: CalendarDays },
  { view: "settings", label: "Settings", icon: Settings },
  { view: "admin", label: "Admin", icon: Shield },
]

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: { "content-type": "application/json", ...(options?.headers || {}) },
  })
  const json = await response.json().catch(() => ({}))
  if (response.status === 401) {
    window.location.href = "/login"
    throw new Error("Please sign in.")
  }
  if (!response.ok) throw new Error(json.error || "Request failed.")
  return json
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value))
}

export function LearningOsShell({
  initialView = "dashboard",
  initialNoteId,
  initialQuizId,
}: {
  initialView?: View
  initialNoteId?: string
  initialQuizId?: string
}) {
  const [view, setView] = useState<View>(initialView)
  const [user, setUser] = useState<User | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [selectedNoteId, setSelectedNoteId] = useState(initialNoteId || "")
  const [selectedQuizId, setSelectedQuizId] = useState(initialQuizId || "")
  const [dashboard, setDashboard] = useState<any>(null)
  const [adminData, setAdminData] = useState<any>(null)
  const [status, setStatus] = useState("Loading workspace...")
  const [query, setQuery] = useState("")

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

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" })
    window.location.href = "/login"
  }

  return (
    <main className="min-h-screen bg-[#f5f2ec] text-[#171717]">
      <div className="grid min-h-screen lg:grid-cols-[280px_1fr]">
        <aside className="border-r border-[#ded8ce] bg-[#faf8f4] px-4 py-5">
          <div className="mb-7 flex items-center gap-3 px-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#171717] text-white">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold">Learning OS</p>
              <p className="text-xs text-[#756d63]">Study workspace</p>
            </div>
          </div>

          <div className="mb-4 flex h-10 items-center gap-2 rounded-xl border border-[#ded8ce] bg-white px-3">
            <Search className="h-4 w-4 text-[#756d63]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search notes"
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const active = view === item.view && (item.label !== "Knowledge Base" || view === "notes")
              const Icon = item.icon
              return (
                <button
                  key={item.label}
                  onClick={() => setView(item.view)}
                  className={`flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium transition ${
                    active ? "bg-[#171717] text-white" : "text-[#595147] hover:bg-[#eee8de]"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              )
            })}
          </nav>

          <div className="mt-8 rounded-2xl border border-[#ded8ce] bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#847b70]">Today</p>
            <p className="mt-3 text-2xl font-semibold">{dashboard?.snapshot?.goalCompletion ?? 0}%</p>
            <p className="mt-1 text-sm text-[#756d63]">goal completion</p>
          </div>
        </aside>

        <section className="min-w-0">
          <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#ded8ce] bg-[#faf8f4]/80 px-5 py-4 backdrop-blur lg:px-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#847b70]">{view}</p>
              <h1 className="text-2xl font-semibold">{titleForView(view)}</h1>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <p className="text-sm font-semibold">{user?.name || "Loading"}</p>
                <p className="text-xs text-[#756d63]">{user?.role || "learner"}</p>
              </div>
              <button onClick={logout} className="flex h-10 items-center gap-2 rounded-xl border border-[#ded8ce] bg-white px-3 text-sm font-medium">
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </header>

          {status ? <div className="m-6 rounded-2xl bg-white p-5 text-sm text-[#756d63] shadow-sm">{status}</div> : null}

          <div className="p-5 lg:p-8">
            {view === "dashboard" ? <Dashboard dashboard={dashboard} notes={notes} quizzes={quizzes} setView={setView} /> : null}
            {view === "notes" ? (
              <NotesView
                notes={filteredNotes}
                selectedNote={selectedNote}
                setSelectedNoteId={setSelectedNoteId}
                setNotes={setNotes}
                user={user}
              />
            ) : null}
            {view === "quizzes" ? <QuizView quizzes={quizzes} selectedQuizId={selectedQuizId} setSelectedQuizId={setSelectedQuizId} /> : null}
            {view === "ai" ? <AiTutor notes={notes} /> : null}
            {view === "progress" ? <ProgressView dashboard={dashboard} quizzes={quizzes} /> : null}
            {view === "calendar" ? <CalendarView /> : null}
            {view === "settings" ? <SettingsView user={user} /> : null}
            {view === "admin" ? <AdminView user={user} adminData={adminData} /> : null}
          </div>
        </section>
      </div>
    </main>
  )
}

function titleForView(view: View) {
  return {
    dashboard: "Dashboard",
    notes: "Notes and Knowledge Base",
    quizzes: "Quiz Studio",
    ai: "AI Tutor",
    progress: "Progress",
    calendar: "Study Calendar",
    settings: "Settings",
    admin: "Admin",
  }[view]
}

function Dashboard({ dashboard, notes, quizzes, setView }: any) {
  const focus = dashboard?.snapshot?.recommendedFocus?.[0] || "React"
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <section className="rounded-3xl bg-[#171717] p-6 text-white shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-white/60">Personalized learning plan</p>
            <h2 className="mt-3 max-w-2xl text-4xl font-semibold leading-tight">Focus on {focus} today, then turn your notes into practice.</h2>
          </div>
          <button onClick={() => setView("ai")} className="flex h-11 items-center gap-2 rounded-xl bg-[#d7ff6f] px-4 text-sm font-semibold text-[#171717]">
            <Sparkles className="h-4 w-4" />
            Ask tutor
          </button>
        </div>
        <div className="mt-8 grid gap-3 md:grid-cols-3">
          {[
            ["Goal completion", `${dashboard?.snapshot?.goalCompletion ?? 0}%`],
            ["Recent notes", notes.length],
            ["Quiz banks", quizzes.length],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-2xl bg-white/8 p-4">
              <p className="text-sm text-white/55">{String(label)}</p>
              <p className="mt-2 text-3xl font-semibold">{String(value)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-[#ded8ce] bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold">Weak topics</p>
        <div className="mt-4 space-y-3">
          {(dashboard?.snapshot?.weakTopics || [{ topic: "No attempts yet", accuracy: 100, attempts: 0 }]).map((topic: any) => (
            <div key={topic.topic} className="rounded-2xl bg-[#f5f2ec] p-4">
              <div className="flex justify-between text-sm">
                <span className="font-medium">{topic.topic}</span>
                <span>{topic.accuracy}%</span>
              </div>
              <div className="mt-3 h-2 rounded-full bg-[#ded8ce]">
                <div className="h-2 rounded-full bg-[#276956]" style={{ width: `${Math.max(8, topic.accuracy)}%` }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-[#ded8ce] bg-white p-5 shadow-sm xl:col-span-2">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent workspace</h2>
          <button onClick={() => setView("notes")} className="text-sm font-medium text-[#276956]">Open notes</button>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {notes.slice(0, 6).map((note: Note) => (
            <article key={note.id} className="rounded-2xl border border-[#ede6dc] p-4">
              <FileText className="h-5 w-5 text-[#276956]" />
              <h3 className="mt-3 font-semibold">{note.title}</h3>
              <p className="mt-2 line-clamp-3 text-sm leading-6 text-[#756d63]">{note.content}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

function NotesView({ notes, selectedNote, setSelectedNoteId, setNotes }: any) {
  const [draft, setDraft] = useState<Note | null>(selectedNote || null)
  const [saving, setSaving] = useState(false)

  useEffect(() => setDraft(selectedNote || null), [selectedNote?.id])

  async function createNote() {
    const response = await api<{ item: Note }>("/api/notes", {
      method: "POST",
      body: JSON.stringify({ title: "Untitled learning page", content: "", template: "blank" }),
    })
    setNotes((items: Note[]) => [response.item, ...items])
    setSelectedNoteId(response.item.id)
  }

  async function save() {
    if (!draft) return
    setSaving(true)
    const response = await api<{ item: Note }>(`/api/notes/${draft.id}`, {
      method: "PUT",
      body: JSON.stringify(draft),
    })
    setNotes((items: Note[]) => items.map((note) => (note.id === response.item.id ? response.item : note)))
    setSaving(false)
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[320px_1fr]">
      <aside className="rounded-3xl border border-[#ded8ce] bg-white p-4 shadow-sm">
        <button onClick={createNote} className="mb-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#171717] text-sm font-semibold text-white">
          <Plus className="h-4 w-4" />
          New page
        </button>
        <div className="space-y-2">
          {notes.map((note: Note) => (
            <button
              key={note.id}
              onClick={() => setSelectedNoteId(note.id)}
              className={`w-full rounded-2xl p-3 text-left transition ${selectedNote?.id === note.id ? "bg-[#f1eadf]" : "hover:bg-[#f8f5ef]"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{note.title}</p>
                {note.favorite ? <Star className="h-4 w-4 fill-[#d8aa2c] text-[#d8aa2c]" /> : null}
              </div>
              <p className="mt-1 text-xs text-[#756d63]">{formatDate(note.updated_at)}</p>
            </button>
          ))}
        </div>
      </aside>

      <section className="rounded-3xl border border-[#ded8ce] bg-white p-5 shadow-sm">
        {draft ? (
          <>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <input
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                className="min-w-0 flex-1 bg-transparent text-4xl font-semibold outline-none"
              />
              <button onClick={save} className="flex h-10 items-center gap-2 rounded-xl bg-[#276956] px-4 text-sm font-semibold text-white">
                <Save className="h-4 w-4" />
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
            <div className="mb-4 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-[#f5f2ec] px-3 py-1">Template: {draft.template}</span>
              <span className="rounded-full bg-[#f5f2ec] px-3 py-1">Updated {formatDate(draft.updated_at)}</span>
            </div>
            <textarea
              value={draft.content}
              onChange={(event) => setDraft({ ...draft, content: event.target.value })}
              className="min-h-[520px] w-full resize-none rounded-2xl border border-[#ede6dc] bg-[#fffdf9] p-5 text-base leading-8 outline-none focus:border-[#276956]"
              placeholder="Write notes, plans, formulas, reflections, and AI-generated drafts here..."
            />
          </>
        ) : (
          <p className="text-[#756d63]">Create your first note.</p>
        )}
      </section>
    </div>
  )
}

function QuizView({ quizzes, selectedQuizId, setSelectedQuizId }: any) {
  const [quiz, setQuiz] = useState<Quiz | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [result, setResult] = useState<any>(null)
  const selected = selectedQuizId || quizzes[0]?.id

  useEffect(() => {
    if (!selected) return
    api<{ item: Quiz }>(`/api/quizzes/${selected}`).then((response) => {
      setQuiz(response.item)
      setAnswers({})
      setResult(null)
    })
  }, [selected])

  async function submit() {
    if (!quiz) return
    const response = await api<any>("/api/quizzes/attempts", {
      method: "POST",
      body: JSON.stringify({
        quizId: quiz.id,
        answers: Object.entries(answers).map(([questionId, selectedAnswerId]) => ({ questionId, selectedAnswerId })),
      }),
    })
    setResult(response)
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[320px_1fr]">
      <aside className="rounded-3xl border border-[#ded8ce] bg-white p-4 shadow-sm">
        {quizzes.map((item: Quiz) => (
          <button
            key={item.id}
            onClick={() => setSelectedQuizId(item.id)}
            className={`mb-2 w-full rounded-2xl p-4 text-left ${selected === item.id ? "bg-[#171717] text-white" : "bg-[#f8f5ef]"}`}
          >
            <p className="font-semibold">{item.title}</p>
            <p className="mt-1 text-sm opacity-70">{item.question_count || 0} questions</p>
          </button>
        ))}
      </aside>
      <section className="rounded-3xl border border-[#ded8ce] bg-white p-5 shadow-sm">
        <h2 className="text-3xl font-semibold">{quiz?.title || "Quiz Studio"}</h2>
        <p className="mt-2 text-[#756d63]">{quiz?.description}</p>
        <div className="mt-6 space-y-4">
          {quiz?.questions?.map((question, index) => (
            <article key={question.id} className="rounded-2xl border border-[#ede6dc] p-4">
              <p className="text-sm text-[#756d63]">Question {index + 1}</p>
              <h3 className="mt-1 font-semibold">{question.question}</h3>
              <div className="mt-4 grid gap-2 md:grid-cols-2">
                {question.choices.map((choice) => (
                  <button
                    key={choice.id}
                    onClick={() => setAnswers({ ...answers, [question.id]: choice.id })}
                    className={`rounded-xl border p-3 text-left text-sm ${
                      answers[question.id] === choice.id ? "border-[#276956] bg-[#e8f5ef]" : "border-[#ede6dc] hover:bg-[#f8f5ef]"
                    }`}
                  >
                    {choice.text}
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
        {result ? <p className="mt-5 rounded-2xl bg-[#e8f5ef] p-4 font-semibold">Score: {result.score} / {result.total}</p> : null}
        <button onClick={submit} className="mt-5 rounded-xl bg-[#276956] px-5 py-3 text-sm font-semibold text-white">Submit attempt</button>
      </section>
    </div>
  )
}

function AiTutor({ notes }: { notes: Note[] }) {
  const [message, setMessage] = useState("Create a study plan from my recent notes.")
  const [reply, setReply] = useState("")
  const [loading, setLoading] = useState(false)

  async function ask() {
    setLoading(true)
    const context = notes.slice(0, 5).map((note) => `${note.title}: ${note.content}`).join("\n\n")
    const response = await api<any>("/api/ai/chat", {
      method: "POST",
      body: JSON.stringify({ message, context }),
    })
    setReply(response.text)
    setLoading(false)
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <section className="rounded-3xl border border-[#ded8ce] bg-white p-5 shadow-sm">
        <h2 className="text-3xl font-semibold">AI tutor</h2>
        <p className="mt-2 text-[#756d63]">Summarize notes, generate quizzes, explain mistakes, and plan the week.</p>
        <textarea value={message} onChange={(event) => setMessage(event.target.value)} className="mt-6 min-h-40 w-full rounded-2xl border border-[#ded8ce] p-4 outline-none focus:border-[#276956]" />
        <button onClick={ask} className="mt-4 flex h-11 items-center gap-2 rounded-xl bg-[#171717] px-5 text-sm font-semibold text-white">
          <Bot className="h-4 w-4" />
          {loading ? "Thinking..." : "Ask tutor"}
        </button>
        {reply ? <div className="mt-6 whitespace-pre-wrap rounded-2xl bg-[#f5f2ec] p-5 leading-7">{reply}</div> : null}
      </section>
      <aside className="rounded-3xl border border-[#ded8ce] bg-white p-5 shadow-sm">
        <p className="font-semibold">Provider readiness</p>
        <p className="mt-3 text-sm leading-6 text-[#756d63]">
          The tutor uses runtime secrets only. If no AI key exists, it returns setup guidance instead of failing the workspace.
        </p>
      </aside>
    </div>
  )
}

function ProgressView({ dashboard, quizzes }: any) {
  return (
    <div className="grid gap-5 md:grid-cols-3">
      {[
        ["Goals", `${dashboard?.snapshot?.goalCompletion ?? 0}%`, Target],
        ["Quiz banks", quizzes.length, BookOpen],
        ["Focus topics", dashboard?.snapshot?.recommendedFocus?.length || 0, Check],
      ].map(([label, value, Icon]) => (
        <article key={String(label)} className="rounded-3xl border border-[#ded8ce] bg-white p-5 shadow-sm">
          <Icon className="h-5 w-5 text-[#276956]" />
          <p className="mt-5 text-4xl font-semibold">{String(value)}</p>
          <p className="mt-1 text-sm text-[#756d63]">{String(label)}</p>
        </article>
      ))}
    </div>
  )
}

function CalendarView() {
  return (
    <section className="rounded-3xl border border-[#ded8ce] bg-white p-5 shadow-sm">
      <h2 className="text-3xl font-semibold">Study calendar</h2>
      <div className="mt-6 grid gap-3 md:grid-cols-7">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, index) => (
          <div key={day} className="min-h-36 rounded-2xl bg-[#f8f5ef] p-3">
            <p className="text-sm font-semibold">{day}</p>
            {index < 4 ? <p className="mt-4 rounded-xl bg-white p-3 text-xs">45 min focus block</p> : null}
          </div>
        ))}
      </div>
    </section>
  )
}

function SettingsView({ user }: { user: User | null }) {
  return (
    <section className="rounded-3xl border border-[#ded8ce] bg-white p-5 shadow-sm">
      <h2 className="text-3xl font-semibold">Settings</h2>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Info label="Name" value={user?.name} />
        <Info label="Email" value={user?.email} />
        <Info label="Role" value={user?.role} />
        <Info label="Daily goal" value={`${user?.preferences?.dailyGoalMinutes || 45} minutes`} />
      </div>
    </section>
  )
}

function AdminView({ user, adminData }: { user: User | null; adminData: any }) {
  if (user?.role !== "admin") return <section className="rounded-3xl bg-white p-5">Admin access required.</section>
  return (
    <section className="rounded-3xl border border-[#ded8ce] bg-white p-5 shadow-sm">
      <h2 className="text-3xl font-semibold">Admin control center</h2>
      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <AdminList title="Users" items={adminData?.users || []} />
        <AdminList title="AI providers" items={adminData?.providers || []} />
        <AdminList title="Audit" items={adminData?.audit || []} />
      </div>
    </section>
  )
}

function Info({ label, value }: { label: string; value?: unknown }) {
  return (
    <div className="rounded-2xl bg-[#f8f5ef] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#847b70]">{label}</p>
      <p className="mt-2 font-medium">{String(value || "Not set")}</p>
    </div>
  )
}

function AdminList({ title, items }: { title: string; items: any[] }) {
  return (
    <div className="rounded-2xl bg-[#f8f5ef] p-4">
      <p className="font-semibold">{title}</p>
      <div className="mt-4 space-y-2">
        {items.slice(0, 8).map((item, index) => (
          <div key={item.id || index} className="flex items-center justify-between gap-2 rounded-xl bg-white p-3 text-sm">
            <span className="truncate">{item.name || item.username || item.action || item.provider || item.id}</span>
            <ChevronRight className="h-4 w-4 text-[#756d63]" />
          </div>
        ))}
      </div>
    </div>
  )
}
