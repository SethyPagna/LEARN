"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, ArrowRight, BookOpen, CalendarPlus, Check, ChevronRight, Clock, Copy, FileText, Filter, Gauge, Languages, Lock, Palette, Repeat2, Save, ShieldCheck, SlidersHorizontal, Sparkles, Target, Trash2, TrendingUp, UserRound } from "lucide-react"
import { languageNames, supportedLocales, type SupportedLocale } from "@/lib/i18n/vocabulary"
import { filterCalendarAgenda, formatCalendarDuration, summarizeCalendarAgenda, type CalendarAgendaFilter } from "@/lib/calendar-features"
import { summarizeLearningProgress, type ProgressActionTarget, type ProgressNextAction } from "@/lib/progress-features"
import { normalizeSettingsNumber, summarizeSettingsOptions } from "@/lib/settings-features"
import type { WorkspaceOptions } from "../preferences"
import type { CalendarEvent, Quiz, User, View } from "../types"
import { api, formatDate } from "../api"
import { Panel } from "../ui"
import { ProviderAdminPanel } from "./provider-admin-panel"

const progressActionIcons: Record<ProgressActionTarget, typeof Target> = {
  ai: Sparkles,
  calendar: CalendarPlus,
  quizzes: BookOpen,
  reviews: Repeat2,
  studio: FileText,
}

export function ProgressView({ dashboard, quizzes, setView }: { dashboard: any; quizzes: Quiz[]; setView?: (view: View) => void }) {
  const progress = useMemo(
    () => summarizeLearningProgress({ snapshot: dashboard?.snapshot, quizCount: quizzes.length }),
    [dashboard?.snapshot, quizzes.length],
  )

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Panel className="p-4 xl:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-2xl font-semibold text-foreground">Progress command center</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                <StatusPill label={progress.momentumLabel} />
                <StatusPill label={`${progress.focusTopics.length} focus`} />
                <StatusPill label={`${progress.reviewCount} review`} />
              </div>
            </div>
          </div>
          <div className="w-full max-w-sm">
            <div className="flex items-center justify-between text-xs font-semibold uppercase text-muted-foreground">
              <span>Goal route</span>
              <span>{progress.goalCompletion}%</span>
            </div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-success transition-all" style={{ width: `${Math.max(4, progress.goalCompletion)}%` }} />
            </div>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {progress.metrics.map((metric) => (
            <div key={metric.id} className="group relative rounded-md border border-border bg-background p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{metric.label}</p>
              <p className="mt-2 text-3xl font-semibold leading-none text-foreground">{metric.value}</p>
              <p className="pointer-events-none absolute left-2 right-2 top-[calc(100%+0.35rem)] z-20 hidden rounded-md border border-border bg-popover p-2 text-xs leading-5 text-popover-foreground shadow-lg group-hover:block">{metric.detail}</p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="p-4">
        <ProgressHeader icon={Target} title="Next actions" info="Ranked from the current goal, weak topics, and available quiz banks." />
        <div className="mt-4 grid gap-2">
          {progress.nextActions.map((action) => (
            <ProgressActionButton key={action.id} action={action} onClick={() => setView?.(action.target)} />
          ))}
        </div>
      </Panel>

      <Panel className="p-4">
        <ProgressHeader icon={AlertTriangle} title="Weak topics" info="Lower accuracy appears first. Use these cards to decide what should become review or practice next." />
        <div className="mt-4 grid gap-2">
          {progress.weakTopics.length ? progress.weakTopics.map((topic) => (
            <div key={topic.topic} className="rounded-md border border-border bg-background p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{topic.topic}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{topic.attempts || 0} attempts</p>
                </div>
                <span className={`rounded-md px-2 py-1 text-xs font-semibold ${severityClass(topic.severity)}`}>{topic.accuracy}%</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <div className={`h-full rounded-full ${topic.severity === "critical" ? "bg-destructive" : "bg-success"}`} style={{ width: `${Math.max(6, topic.accuracy)}%` }} />
              </div>
            </div>
          )) : (
            <div className="rounded-md border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">
              No weak topics yet. Run a quiz or game to create a smarter route.
            </div>
          )}
        </div>
      </Panel>

      <Panel className="p-4 xl:col-span-2">
        <ProgressHeader icon={Gauge} title="Learning loop" info="Capture, clean, practice, review, then schedule only what matters." />
        <div className="mt-4 grid gap-3 md:grid-cols-5">
          {[
            ["Studio", "Capture"],
            ["AI", "Clean"],
            ["Practice", "Attempt"],
            ["Reviews", "Recall"],
            ["Calendar", "Schedule"],
          ].map(([label, detail], index) => (
            <div key={label} className="rounded-md border border-border bg-background p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary text-sm font-semibold text-secondary-foreground">{index + 1}</span>
                {index < 4 ? <ArrowRight className="h-4 w-4 text-muted-foreground" /> : <Check className="h-4 w-4 text-success" />}
              </div>
              <p className="mt-3 font-semibold text-foreground">{label}</p>
              <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}

function ProgressActionButton({ action, onClick }: { action: ProgressNextAction; onClick: () => void }) {
  const Icon = progressActionIcons[action.target]
  return (
    <button onClick={onClick} className="group relative rounded-md border border-border bg-background p-3 text-left transition hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground">
      <div className="flex items-center gap-3">
        <Icon className="h-5 w-5 text-success" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{action.label}</p>
          <span className={`mt-1 inline-flex rounded-md px-2 py-0.5 text-[0.68rem] font-semibold ${urgencyClass(action.urgency)}`}>{action.urgency}</span>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="pointer-events-none absolute left-2 right-2 top-[calc(100%+0.35rem)] z-20 hidden rounded-md border border-border bg-popover p-2 text-xs leading-5 text-popover-foreground shadow-lg group-hover:block">{action.detail}</p>
    </button>
  )
}

function ProgressHeader({ icon: Icon, info, title }: { icon: typeof Target; info: string; title: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
          <Icon className="h-5 w-5" />
        </div>
        <h3 className="truncate font-semibold text-foreground">{title}</h3>
      </div>
      <details className="relative">
        <summary className="flex h-8 w-8 list-none items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground" aria-label={`About ${title}`}>
          <Filter className="h-4 w-4" />
        </summary>
        <p className="absolute right-0 top-10 z-20 w-64 rounded-md border border-border bg-popover p-3 text-sm leading-6 text-popover-foreground shadow-xl">{info}</p>
      </details>
    </div>
  )
}

function StatusPill({ label }: { label: string }) {
  return <span className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-semibold text-muted-foreground">{label}</span>
}

function severityClass(severity: "critical" | "watch" | "steady") {
  if (severity === "critical") return "bg-destructive text-destructive-foreground"
  if (severity === "watch") return "bg-warning/20 text-warning-foreground"
  return "bg-success/20 text-success"
}

function urgencyClass(urgency: ProgressNextAction["urgency"]) {
  if (urgency === "high") return "bg-destructive text-destructive-foreground"
  if (urgency === "medium") return "bg-warning/20 text-warning-foreground"
  return "bg-success/20 text-success"
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
  const [agendaFilter, setAgendaFilter] = useState<CalendarAgendaFilter>("upcoming")
  const selected = events.find((event) => event.id === selectedId)
  const agendaSummary = useMemo(() => summarizeCalendarAgenda(events), [events])
  const filteredEvents = useMemo(() => filterCalendarAgenda(events, agendaFilter), [agendaFilter, events])
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

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
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Defaults: {options.calendarDefaultMinutes} minutes, {options.calendarLeadMinutes} minutes from now. Timezone: {timezone}.</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Info label="Today" value={agendaSummary.today} />
          <Info label="Upcoming" value={agendaSummary.upcoming} />
          <Info label="Review" value={agendaSummary.review} />
          <Info label="Planned" value={formatCalendarDuration(agendaSummary.scheduledMinutes)} />
        </div>
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
          <span className="rounded-md bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">{filteredEvents.length}/{events.length} blocks</span>
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          {(["all", "today", "upcoming", "review", "completed"] as CalendarAgendaFilter[]).map((filter) => (
            <button
              key={filter}
              onClick={() => setAgendaFilter(filter)}
              className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold ${agendaFilter === filter ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground"}`}
            >
              <Filter className="h-3.5 w-3.5" />
              {filter[0].toUpperCase() + filter.slice(1)}
            </button>
          ))}
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredEvents.map((event) => {
            const duration = formatCalendarDuration(Math.max(0, Math.round((new Date(event.ends_at).getTime() - new Date(event.starts_at).getTime()) / 60000)))
            return (
            <article key={event.id} className={`rounded-lg border p-4 ${selectedId === event.id ? "border-primary bg-primary/10" : "border-border bg-card"}`}>
              <div className="flex items-start justify-between gap-3">
                <button onClick={() => setSelectedId(event.id)} className="min-w-0 flex-1 text-left">
                  <p className="truncate font-semibold text-foreground">{event.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatDate(event.starts_at)} · {event.event_type}</p>
                  <p className="mt-1 inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground"><Clock className="h-3.5 w-3.5" /> {duration}</p>
                  {event.notes ? <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{event.notes}</p> : null}
                </button>
                <button onClick={() => deleteEvent(event.id)} className="rounded-md p-2 text-muted-foreground hover:bg-destructive hover:text-destructive-foreground" aria-label="Delete event">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </article>
          )})}
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
  locale,
  options,
  setLocale,
  setOptions,
}: {
  user: User | null
  automationData: any
  locale: SupportedLocale
  options: WorkspaceOptions
  setLocale: (locale: SupportedLocale) => void
  setOptions: (options: Partial<WorkspaceOptions>) => void
}) {
  const [name, setName] = useState(user?.name || "")
  const [email, setEmail] = useState(user?.email || "")
  const [dailyGoalMinutes, setDailyGoalMinutes] = useState(Number(user?.preferences?.dailyGoalMinutes || 45))
  const [section, setSection] = useState<"profile" | "experience" | "learning" | "privacy">("profile")
  const [status, setStatus] = useState("")
  const settingsSummary = useMemo(() => summarizeSettingsOptions(options), [options])
  const profileDirty = name !== (user?.name || "") || email !== (user?.email || "") || dailyGoalMinutes !== Number(user?.preferences?.dailyGoalMinutes || 45)

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
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Panel className="p-4 xl:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <SlidersHorizontal className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-2xl font-semibold text-foreground">Settings control center</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                <StatusPill label={settingsSummary.privacyLabel} />
                <StatusPill label={settingsSummary.dailyReviewLabel} />
                {profileDirty ? <StatusPill label="profile draft" /> : <StatusPill label="profile saved" />}
              </div>
            </div>
          </div>
          <button onClick={saveProfile} className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">
            <Save className="h-4 w-4" />
            Save profile
          </button>
        </div>
        {status ? <p className="mt-3 rounded-md bg-muted p-3 text-sm text-muted-foreground">{status}</p> : null}
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {([
            ["profile", "Profile", UserRound],
            ["experience", "Experience", Palette],
            ["learning", "Learning", Target],
            ["privacy", "Privacy", Lock],
          ] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setSection(id)}
              className={`flex items-center gap-3 rounded-md border p-3 text-left transition hover:-translate-y-0.5 ${section === id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground"}`}
            >
              <Icon className="h-5 w-5" />
              <span className="font-semibold">{label}</span>
            </button>
          ))}
        </div>
      </Panel>

      <Panel className="p-4">
        <SettingsSectionHeader icon={Gauge} title="Workspace signals" body="Quick checks for privacy, review load, feed variety, focus length, and AI budget." />
        <div className="mt-4 grid gap-2">
          {settingsSummary.statuses.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 rounded-md border border-border bg-background p-3 text-sm">
              <span className="font-medium text-foreground">{item.label}</span>
              <span className={`rounded-md px-2 py-1 text-xs font-semibold ${settingsToneClass(item.tone)}`}>{item.value}</span>
            </div>
          ))}
        </div>
      </Panel>

      {section === "profile" ? (
        <Panel className="p-4">
          <SettingsSectionHeader icon={UserRound} title="Profile" body="Keep identity details simple. Learning artifacts remain private unless sharing settings say otherwise." />
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Field label="Name" value={name} onChange={setName} />
            <Field label="Email" value={email} onChange={setEmail} />
            <Field label="Daily goal minutes" value={String(dailyGoalMinutes)} onChange={(value) => setDailyGoalMinutes(normalizeSettingsNumber({ value, fallback: 45, min: 5, max: 240 }))} />
            <Info label="Role" value={user?.role} />
          </div>
        </Panel>
      ) : null}

      {section === "experience" ? (
        <Panel className="p-4">
          <SettingsSectionHeader icon={Palette} title="Experience" body="Tune density, language, contrast, motion, and reading comfort without hiding controls in long text." />
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <SelectField label="Dashboard" value={options.dashboardDetail} options={["focused", "detailed"]} onChange={(value) => setOptions({ dashboardDetail: value as WorkspaceOptions["dashboardDetail"] })} />
            <SelectField label="Files layout" value={options.fileLayout} options={["list", "grid"]} onChange={(value) => setOptions({ fileLayout: value as WorkspaceOptions["fileLayout"] })} />
            <SelectField label="Docs template" value={options.docsTemplate} options={["study", "cornell", "project"]} onChange={(value) => setOptions({ docsTemplate: value as WorkspaceOptions["docsTemplate"] })} />
            <SelectField label="Slides aspect" value={options.slidesAspect} options={["16:9", "4:3"]} onChange={(value) => setOptions({ slidesAspect: value as WorkspaceOptions["slidesAspect"] })} />
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            <Toggle label="High contrast" checked={options.highContrast} onChange={(checked) => setOptions({ highContrast: checked })} />
            <Toggle label="Reduced motion" checked={options.reducedMotion} onChange={(checked) => setOptions({ reducedMotion: checked })} />
            <Toggle label="Dyslexia-friendly font" checked={options.dyslexiaFriendly} onChange={(checked) => setOptions({ dyslexiaFriendly: checked })} />
            <Toggle label="Weak-topic bars" checked={options.showWeakTopicBars} onChange={(checked) => setOptions({ showWeakTopicBars: checked })} />
            <Toggle label="File previews" checked={options.filePreview} onChange={(checked) => setOptions({ filePreview: checked })} />
          </div>
          <LanguagePicker locale={locale} setLocale={setLocale} />
        </Panel>
      ) : null}

      {section === "learning" ? (
        <Panel className="p-4">
          <SettingsSectionHeader icon={Target} title="Learning workflow" body="Caps and defaults keep practice focused while preserving user freedom." />
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <SelectField label="Quiz mode" value={options.quizMode} options={["practice", "exam", "review"]} onChange={(value) => setOptions({ quizMode: value as WorkspaceOptions["quizMode"] })} />
            <SelectField label="Game mode" value={options.gameMode} options={["sprint", "matching", "memory"]} onChange={(value) => setOptions({ gameMode: value as WorkspaceOptions["gameMode"] })} />
            <SelectField label="Rest day" value={options.restDay} options={["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]} onChange={(value) => setOptions({ restDay: value as WorkspaceOptions["restDay"] })} />
            <Field label="Calendar lead minutes" value={String(options.calendarLeadMinutes)} onChange={(value) => setOptions({ calendarLeadMinutes: normalizeSettingsNumber({ value, fallback: 15, min: 0, max: 240 }) })} />
            <Field label="Calendar block minutes" value={String(options.calendarDefaultMinutes)} onChange={(value) => setOptions({ calendarDefaultMinutes: normalizeSettingsNumber({ value, fallback: 45, min: 5, max: 240 }) })} />
            <Field label="Game question limit" value={String(options.gameQuestionLimit)} onChange={(value) => setOptions({ gameQuestionLimit: normalizeSettingsNumber({ value, fallback: 12, min: 3, max: 80 }) })} />
            <Field label="Daily review cap" value={String(options.dailyReviewCap)} onChange={(value) => setOptions({ dailyReviewCap: normalizeSettingsNumber({ value, fallback: 30, min: 1, max: 120 }) })} />
            <Field label="Feed serendipity %" value={String(options.feedSerendipity)} onChange={(value) => setOptions({ feedSerendipity: normalizeSettingsNumber({ value, fallback: 15, min: 15, max: 50 }) })} />
            <Field label="AI max tokens" value={String(options.aiMaxTokens)} onChange={(value) => setOptions({ aiMaxTokens: normalizeSettingsNumber({ value, fallback: 1200, min: 256, max: 8000 }) })} />
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            <Toggle label="Notes autosave" checked={options.notesAutosave} onChange={(checked) => setOptions({ notesAutosave: checked })} />
            <Toggle label="Reveal quiz answers" checked={options.revealAnswers} onChange={(checked) => setOptions({ revealAnswers: checked })} />
            <Toggle label="AI includes notes" checked={options.aiIncludeNotes} onChange={(checked) => setOptions({ aiIncludeNotes: checked })} />
          </div>
        </Panel>
      ) : null}

      {section === "privacy" ? (
        <Panel className="p-4">
          <SettingsSectionHeader icon={Lock} title="Privacy and notifications" body="Sharing stays opt-in. Notifications can be quieted without disabling core safety reminders." />
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <SelectField label="Privacy default" value={options.privacyDefault} options={["private", "connections", "public"]} onChange={(value) => setOptions({ privacyDefault: value as WorkspaceOptions["privacyDefault"] })} />
            <Toggle label="Presence hints" checked={options.collaborationPresence} onChange={(checked) => setOptions({ collaborationPresence: checked })} />
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            <Toggle label="Review reminders" checked={options.notificationReviewReminders} onChange={(checked) => setOptions({ notificationReviewReminders: checked })} />
            <Toggle label="Draft warnings" checked={options.notificationDraftWarnings} onChange={(checked) => setOptions({ notificationDraftWarnings: checked })} />
            <Toggle label="Social updates" checked={options.notificationSocialUpdates} onChange={(checked) => setOptions({ notificationSocialUpdates: checked })} />
            <Toggle label="System health" checked={options.notificationSystemHealth} onChange={(checked) => setOptions({ notificationSystemHealth: checked })} />
            <Toggle label="Verbose admin" checked={options.adminVerbose} onChange={(checked) => setOptions({ adminVerbose: checked })} />
          </div>
          <div className="mt-5 grid gap-2 md:grid-cols-2">
            {(automationData?.jobs || []).slice(0, 4).map((job: any) => (
              <div key={job.key} className="rounded-md border border-border bg-background p-3">
                <p className="text-sm font-semibold text-foreground">{job.label}</p>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{job.description}</p>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}
    </div>
  )
}

function SettingsSectionHeader({ body, icon: Icon, title }: { body: string; icon: typeof Target; title: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
          <Icon className="h-5 w-5" />
        </div>
        <h3 className="truncate text-lg font-semibold text-foreground">{title}</h3>
      </div>
      <details className="relative">
        <summary className="flex h-8 w-8 list-none items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground" aria-label={`About ${title}`}>
          <Filter className="h-4 w-4" />
        </summary>
        <p className="absolute right-0 top-10 z-20 w-64 rounded-md border border-border bg-popover p-3 text-sm leading-6 text-popover-foreground shadow-xl">{body}</p>
      </details>
    </div>
  )
}

function LanguagePicker({ locale, setLocale }: { locale: SupportedLocale; setLocale: (locale: SupportedLocale) => void }) {
  return (
    <div className="mt-4 rounded-lg border border-border bg-background p-3">
      <div className="mb-3 flex items-center gap-2">
        <Languages className="h-4 w-4 text-success" />
        <p className="text-sm font-semibold text-foreground">Language</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {supportedLocales.map((item) => (
          <button
            key={item}
            onClick={() => setLocale(item)}
            className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm font-semibold transition hover:-translate-y-0.5 ${locale === item ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground"}`}
          >
            <span>{languageNames[item]}</span>
            {locale === item ? <Check className="h-4 w-4" /> : null}
          </button>
        ))}
      </div>
    </div>
  )
}

function settingsToneClass(tone: "good" | "watch" | "neutral") {
  if (tone === "good") return "bg-success text-success-foreground"
  if (tone === "watch") return "bg-warning text-warning-foreground"
  return "bg-secondary text-secondary-foreground"
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
