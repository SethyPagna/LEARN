"use client"

import { useEffect, useState } from "react"
import { BookOpen, CalendarPlus, Check, ChevronRight, Copy, Save, ShieldCheck, Target, Trash2, UserRound } from "lucide-react"
import { languageNames, supportedLocales } from "@/lib/i18n/vocabulary"
import type { WorkspaceOptions } from "../preferences"
import type { CalendarEvent, Quiz, User } from "../types"
import { api, formatDate } from "../api"
import { Panel } from "../ui"
import { ProviderAdminPanel } from "./provider-admin-panel"

export function ProgressView({ dashboard, quizzes }: { dashboard: any; quizzes: Quiz[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {[
        ["Goals", `${dashboard?.snapshot?.goalCompletion ?? 0}%`, Target],
        ["Quiz banks", quizzes.length, BookOpen],
        ["Focus topics", dashboard?.snapshot?.recommendedFocus?.length || 0, Check],
      ].map(([label, value, Icon]) => (
        <Panel key={String(label)} className="p-4">
          <Icon className="h-5 w-5 text-success" />
          <p className="mt-4 text-3xl font-semibold text-foreground">{String(value)}</p>
          <p className="mt-1 text-sm text-muted-foreground">{String(label)}</p>
        </Panel>
      ))}
    </div>
  )
}

export function CalendarView({ options }: { options: WorkspaceOptions }) {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [selectedId, setSelectedId] = useState("")
  const [title, setTitle] = useState("45 min focus block")
  const [eventType, setEventType] = useState("study")
  const [startsAt, setStartsAt] = useState(toLocalInputValue(new Date(Date.now() + options.calendarLeadMinutes * 60 * 1000)))
  const [durationMinutes, setDurationMinutes] = useState(options.calendarDefaultMinutes)
  const [notes, setNotes] = useState("")
  const [status, setStatus] = useState("")
  const selected = events.find((event) => event.id === selectedId)

  async function refresh() {
    const response = await api<{ items: CalendarEvent[] }>("/api/calendar")
    setEvents(response.items)
  }

  useEffect(() => {
    refresh().catch((error) => setStatus(error.message))
  }, [])

  useEffect(() => {
    if (!selected) return
    const start = new Date(selected.starts_at)
    const end = new Date(selected.ends_at)
    setTitle(selected.title)
    setEventType(selected.event_type)
    setStartsAt(toLocalInputValue(start))
    setDurationMinutes(Math.max(5, Math.round((end.getTime() - start.getTime()) / 60000)))
    setNotes(selected.notes || "")
  }, [selected?.id])

  async function createEvent() {
    setSelectedId("")
    setTitle("45 min focus block")
    setEventType("study")
    setStartsAt(toLocalInputValue(new Date(Date.now() + options.calendarLeadMinutes * 60 * 1000)))
    setDurationMinutes(options.calendarDefaultMinutes)
    setNotes("")
    setStatus("Drafting a new time block.")
  }

  async function saveEvent(id = selectedId) {
    const startDate = new Date(startsAt)
    const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000)
    const response = await api<{ item: CalendarEvent }>("/api/calendar", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify({
        id: id || undefined,
        title,
        eventType,
        startsAt: startDate.toISOString(),
        endsAt: endDate.toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        notes,
      }),
    })
    setSelectedId(response.item.id)
    setStatus(`${response.item.title} saved.`)
    await refresh()
  }

  async function duplicateEvent() {
    await saveEvent("")
    setStatus(`${title} duplicated.`)
  }

  async function toggleComplete() {
    const nextType = eventType === "completed" ? "study" : "completed"
    setEventType(nextType)
    const startDate = new Date(startsAt)
    await api("/api/calendar", {
      method: selectedId ? "PUT" : "POST",
      body: JSON.stringify({
        id: selectedId || undefined,
        title,
        eventType: nextType,
        startsAt: startDate.toISOString(),
        endsAt: new Date(startDate.getTime() + durationMinutes * 60 * 1000).toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        notes,
      }),
    })
    setStatus(nextType === "completed" ? "Marked complete." : "Moved back to study.")
    await refresh()
  }

  async function deleteEvent(id: string) {
    await api(`/api/calendar?id=${encodeURIComponent(id)}`, { method: "DELETE" })
    if (selectedId === id) {
      setSelectedId("")
      createEvent()
    }
    setStatus("Time block deleted.")
    await refresh()
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <Panel className="p-4">
        <h2 className="text-2xl font-semibold text-foreground">Study calendar</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Create, edit, complete, duplicate, and delete focus blocks. Defaults: {options.calendarDefaultMinutes} minutes, {options.calendarLeadMinutes} minutes from now.</p>
        <div className="mt-4 grid gap-3">
          <Field label="Title" value={title} onChange={setTitle} />
          <label className="block rounded-lg bg-muted p-4">
            <span className="text-xs font-semibold uppercase text-muted-foreground">Type</span>
            <select value={eventType} onChange={(event) => setEventType(event.target.value)} className="mt-2 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none">
              {["study", "review", "deadline", "focus", "completed"].map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
          <Field label="Starts at" value={startsAt} onChange={setStartsAt} />
          <Field label="Duration minutes" value={String(durationMinutes)} onChange={(value) => setDurationMinutes(Number(value) || options.calendarDefaultMinutes)} />
          <label className="block rounded-lg bg-muted p-4">
            <span className="text-xs font-semibold uppercase text-muted-foreground">Notes</span>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="mt-2 min-h-24 w-full resize-none rounded-md border border-input bg-background p-3 text-sm text-foreground outline-none" />
          </label>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <CalendarAction label="New" icon={CalendarPlus} onClick={createEvent} />
          <CalendarAction label="Save" icon={Save} onClick={() => saveEvent()} primary />
          <CalendarAction label={eventType === "completed" ? "Reopen" : "Complete"} icon={Check} onClick={toggleComplete} />
          <CalendarAction label="Duplicate" icon={Copy} onClick={duplicateEvent} />
        </div>
        {status ? <p className="mt-3 rounded-md bg-muted p-3 text-sm text-muted-foreground">{status}</p> : null}
      </Panel>
      <Panel className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold text-foreground">Agenda records</h3>
            <p className="text-sm text-muted-foreground">Select a block to edit it in the left panel.</p>
          </div>
          <span className="rounded-md bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">{events.length} blocks</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {events.map((event) => (
            <article key={event.id} className={`rounded-lg border p-4 ${selectedId === event.id ? "border-primary bg-primary/10" : "border-border bg-card"}`}>
              <div className="flex items-start justify-between gap-3">
                <button onClick={() => setSelectedId(event.id)} className="min-w-0 flex-1 text-left">
                  <p className="truncate font-semibold text-foreground">{event.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatDate(event.starts_at)} · {event.event_type}</p>
                  {event.notes ? <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{event.notes}</p> : null}
                </button>
                <button onClick={() => deleteEvent(event.id)} className="rounded-md p-2 text-muted-foreground hover:bg-destructive hover:text-destructive-foreground" aria-label="Delete event">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </article>
          ))}
        </div>
      </Panel>
    </div>
  )
}

function toLocalInputValue(date: Date) {
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16)
}

function CalendarAction({ icon: Icon, label, onClick, primary }: { icon: typeof Save; label: string; onClick: () => void; primary?: boolean }) {
  return (
    <button onClick={onClick} className={`inline-flex h-10 items-center justify-center gap-2 rounded-md border px-3 text-sm font-semibold ${primary ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground"}`}>
      <Icon className="h-4 w-4" />
      {label}
    </button>
  )
}

export function SettingsView({
  user,
  automationData,
  options,
  setOptions,
}: {
  user: User | null
  automationData: any
  options: WorkspaceOptions
  setOptions: (options: Partial<WorkspaceOptions>) => void
}) {
  const [name, setName] = useState(user?.name || "")
  const [email, setEmail] = useState(user?.email || "")
  const [dailyGoalMinutes, setDailyGoalMinutes] = useState(Number(user?.preferences?.dailyGoalMinutes || 45))
  const [status, setStatus] = useState("")

  useEffect(() => {
    setName(user?.name || "")
    setEmail(user?.email || "")
    setDailyGoalMinutes(Number(user?.preferences?.dailyGoalMinutes || 45))
  }, [user?.id])

  async function saveProfile() {
    await api("/api/profile", {
      method: "PUT",
      body: JSON.stringify({ name, email, preferences: { dailyGoalMinutes } }),
    })
    await api("/api/preferences", {
      method: "PUT",
      body: JSON.stringify({ dailyGoalMinutes, localeReady: supportedLocales.length, workspaceOptions: options }),
    })
    setStatus("Saved profile and preferences.")
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
      <Panel className="p-4">
        <div className="mb-4 flex items-center gap-3">
          <UserRound className="h-5 w-5 text-success" />
          <h2 className="text-2xl font-semibold text-foreground">Profile and settings</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Name" value={name} onChange={setName} />
          <Field label="Email" value={email} onChange={setEmail} />
          <Field label="Daily goal minutes" value={String(dailyGoalMinutes)} onChange={(value) => setDailyGoalMinutes(Number(value) || 45)} />
          <Info label="Role" value={user?.role} />
        </div>
        <button onClick={saveProfile} className="mt-4 flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">
          <Save className="h-4 w-4" /> Save settings
        </button>
        {status ? <p className="mt-3 rounded-md bg-muted p-3 text-sm text-muted-foreground">{status}</p> : null}
      </Panel>
      <Panel className="p-4">
        <h3 className="text-lg font-semibold text-foreground">Workspace freedom</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <SelectField label="Dashboard" value={options.dashboardDetail} options={["focused", "detailed"]} onChange={(value) => setOptions({ dashboardDetail: value as WorkspaceOptions["dashboardDetail"] })} />
          <SelectField label="Files layout" value={options.fileLayout} options={["list", "grid"]} onChange={(value) => setOptions({ fileLayout: value as WorkspaceOptions["fileLayout"] })} />
          <SelectField label="Quiz mode" value={options.quizMode} options={["practice", "exam", "review"]} onChange={(value) => setOptions({ quizMode: value as WorkspaceOptions["quizMode"] })} />
          <SelectField label="Game mode" value={options.gameMode} options={["sprint", "matching", "memory"]} onChange={(value) => setOptions({ gameMode: value as WorkspaceOptions["gameMode"] })} />
          <SelectField label="Docs template" value={options.docsTemplate} options={["study", "cornell", "project"]} onChange={(value) => setOptions({ docsTemplate: value as WorkspaceOptions["docsTemplate"] })} />
          <SelectField label="Slides aspect" value={options.slidesAspect} options={["16:9", "4:3"]} onChange={(value) => setOptions({ slidesAspect: value as WorkspaceOptions["slidesAspect"] })} />
          <Field label="Calendar lead minutes" value={String(options.calendarLeadMinutes)} onChange={(value) => setOptions({ calendarLeadMinutes: Number(value) || 15 })} />
          <Field label="Calendar block minutes" value={String(options.calendarDefaultMinutes)} onChange={(value) => setOptions({ calendarDefaultMinutes: Number(value) || 45 })} />
          <Field label="Game question limit" value={String(options.gameQuestionLimit)} onChange={(value) => setOptions({ gameQuestionLimit: Number(value) || 12 })} />
          <Field label="AI max tokens" value={String(options.aiMaxTokens)} onChange={(value) => setOptions({ aiMaxTokens: Number(value) || 1200 })} />
          <Field label="Daily review cap" value={String(options.dailyReviewCap)} onChange={(value) => setOptions({ dailyReviewCap: Number(value) || 30 })} />
          <Field label="Feed serendipity %" value={String(options.feedSerendipity)} onChange={(value) => setOptions({ feedSerendipity: Math.min(50, Math.max(15, Number(value) || 15)) })} />
          <SelectField label="Privacy default" value={options.privacyDefault} options={["private", "connections", "public"]} onChange={(value) => setOptions({ privacyDefault: value as WorkspaceOptions["privacyDefault"] })} />
          <SelectField label="Rest day" value={options.restDay} options={["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]} onChange={(value) => setOptions({ restDay: value as WorkspaceOptions["restDay"] })} />
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          <Toggle label="Weak-topic bars" checked={options.showWeakTopicBars} onChange={(checked) => setOptions({ showWeakTopicBars: checked })} />
          <Toggle label="Notes autosave" checked={options.notesAutosave} onChange={(checked) => setOptions({ notesAutosave: checked })} />
          <Toggle label="File previews" checked={options.filePreview} onChange={(checked) => setOptions({ filePreview: checked })} />
          <Toggle label="Reveal quiz answers" checked={options.revealAnswers} onChange={(checked) => setOptions({ revealAnswers: checked })} />
          <Toggle label="Presence hints" checked={options.collaborationPresence} onChange={(checked) => setOptions({ collaborationPresence: checked })} />
          <Toggle label="Verbose admin" checked={options.adminVerbose} onChange={(checked) => setOptions({ adminVerbose: checked })} />
          <Toggle label="High contrast" checked={options.highContrast} onChange={(checked) => setOptions({ highContrast: checked })} />
          <Toggle label="Reduced motion" checked={options.reducedMotion} onChange={(checked) => setOptions({ reducedMotion: checked })} />
          <Toggle label="Dyslexia-friendly font" checked={options.dyslexiaFriendly} onChange={(checked) => setOptions({ dyslexiaFriendly: checked })} />
        </div>
      </Panel>
      <Panel className="p-4">
        <h3 className="text-lg font-semibold text-foreground">Languages and automation</h3>
        <div className="mt-4 flex flex-wrap gap-2">
          {supportedLocales.map((locale) => (
            <span key={locale} className="rounded-md bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">{languageNames[locale]}</span>
          ))}
        </div>
        <div className="mt-5 space-y-2">
          {(automationData?.jobs || []).slice(0, 4).map((job: any) => (
            <div key={job.key} className="rounded-md bg-muted p-3">
              <p className="text-sm font-semibold text-foreground">{job.label}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{job.description}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}

export function AdminView({ user, adminData, automationData, options }: { user: User | null; adminData: any; automationData: any; options: WorkspaceOptions }) {
  if (user?.role !== "admin") return <Panel className="p-4">Admin access required.</Panel>
  return (
    <div className="grid gap-4">
      <Panel className="p-4">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-success" />
          <h2 className="text-2xl font-semibold text-foreground">Admin control center</h2>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <Info label="Users" value={adminData?.users?.length || 0} />
          <Info label="Providers" value={adminData?.providers?.length || 0} />
          <Info label="Events" value={adminData?.counters?.events || 0} />
          <Info label="Games" value={adminData?.counters?.games || 0} />
        </div>
      </Panel>
      <div className="grid gap-4 xl:grid-cols-3">
        <AdminList title="Users" items={adminData?.users || []} />
        <AdminList title="AI providers" items={adminData?.providers || []} />
        <AdminList title="Audit" items={adminData?.audit || []} />
      </div>
      <ProviderAdminPanel />
      <div className="grid gap-4 xl:grid-cols-2">
        <AdminList title="Automation jobs" items={automationData?.jobs || []} />
        <AdminList title="AI prompt contracts" items={automationData?.prompts || []} />
      </div>
      {options.adminVerbose ? (
        <Panel className="p-4">
          <p className="font-semibold text-foreground">Current option policy</p>
          <pre className="mt-3 overflow-auto rounded-md bg-muted p-3 text-xs text-muted-foreground">{JSON.stringify(options, null, 2)}</pre>
        </Panel>
      ) : null}
    </div>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block rounded-lg bg-muted p-4">
      <span className="text-xs font-semibold uppercase text-muted-foreground">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none" />
    </label>
  )
}

function Info({ label, value }: { label: string; value?: unknown }) {
  return (
    <div className="rounded-lg bg-muted p-4">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="mt-2 font-medium text-foreground">{String(value || "Not set")}</p>
    </div>
  )
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="block rounded-lg bg-muted p-4">
      <span className="text-xs font-semibold uppercase text-muted-foreground">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none">
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg bg-muted p-3 text-sm text-foreground">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  )
}

function AdminList({ title, items }: { title: string; items: any[] }) {
  return (
    <Panel className="p-4">
      <p className="font-semibold text-foreground">{title}</p>
      <div className="mt-3 space-y-2">
        {items.slice(0, 8).map((item, index) => (
          <div key={item.id || item.key || index} className="flex items-center justify-between gap-2 rounded-md bg-muted p-3 text-sm">
            <span className="truncate text-foreground">{item.name || item.username || item.action || item.provider || item.label || item.id}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        ))}
      </div>
    </Panel>
  )
}
