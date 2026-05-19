"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, ArrowLeft, ArrowRight, BookOpen, Bot, CalendarDays, CalendarPlus, Check, ChevronRight, Clock, Copy, FileText, Filter, Gauge, Languages, Link as LinkIcon, Lock, Palette, Repeat2, Save, Search, ShieldCheck, SlidersHorizontal, Sparkles, Target, Trash2, TrendingUp, UserPlus, UserRound, Users } from "lucide-react"
import { languageNames, supportedLocales, type SupportedLocale } from "@/lib/i18n/vocabulary"
import { buildCalendarDaySegments, buildCalendarMonthGrid, buildCalendarPlanningSummary, buildCalendarSummaryChips, filterCalendarAgenda, formatCalendarDuration, summarizeCalendarAgenda, type CalendarAgendaFilter } from "@/lib/calendar-features"
import { buildProgressCommandPlan, summarizeLearningProgress, type ProgressActionTarget, type ProgressNextAction } from "@/lib/progress-features"
import { buildSettingsControlPlan, normalizeSettingsNumber, summarizeSettingsOptions, type SettingsSectionGuide, type SettingsSectionId } from "@/lib/settings-features"
import { buildAdminOperationalPlan, filterAdminList, summarizeAdminOperations, type AdminAccessRequest, type AdminPanelTab } from "@/lib/admin-features"
import type { WorkspaceOptions } from "../preferences"
import type { CalendarEvent, Quiz, User, View } from "../types"
import { api, formatDate } from "../api"
import { ControlButton, Panel, StatusPill as SharedStatusPill } from "../ui"
import { ProviderAdminPanel } from "./provider-admin-panel"
import { toneSurfaceClasses } from "@/lib/design-system"

const progressActionIcons: Record<ProgressActionTarget, typeof Target> = {
  ai: Sparkles,
  calendar: CalendarPlus,
  quizzes: BookOpen,
  reviews: Repeat2,
  studio: FileText,
}

const calendarEventTypes = [
  ["study", "Study"],
  ["review", "Review"],
  ["deadline", "Deadline"],
  ["focus", "Focus"],
  ["completed", "Completed"],
] as const

const calendarDurationPresets = [15, 30, 45, 60, 90]

export function ProgressView({ dashboard, quizzes, setView }: { dashboard: any; quizzes: Quiz[]; setView?: (view: View) => void }) {
  const progress = useMemo(
    () => summarizeLearningProgress({ snapshot: dashboard?.snapshot, quizCount: quizzes.length }),
    [dashboard?.snapshot, quizzes.length],
  )
  const progressPlan = useMemo(() => buildProgressCommandPlan(progress), [progress])
  const ProgressPlanIcon = progressActionIcons[progressPlan.target]
  const topicSeverityCounts = useMemo(() => summarizeProgressTopicSeverity(progress.weakTopics), [progress.weakTopics])

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Panel className="p-4 xl:col-span-2">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-2xl font-semibold text-foreground">Progress command center</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                <SharedStatusPill label={progress.momentumLabel} />
                <SharedStatusPill label={`${progress.focusTopics.length} focus`} />
                <SharedStatusPill label={`${progress.reviewCount} review`} />
                <SharedStatusPill label={`${topicSeverityCounts.critical} critical`} tone={topicSeverityCounts.critical ? "watch" : "neutral"} />
              </div>
            </div>
          </div>
          <button onClick={() => setView?.(progressPlan.target)} className="rounded-md border border-border bg-secondary p-3 text-left transition hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground">
            <div className="flex items-center gap-3">
              <ProgressPlanIcon className="h-5 w-5 text-success" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-foreground">{progressPlan.headline}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{progressPlan.chips.slice(0, 2).join(" · ")}</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </button>
          <div className="xl:col-span-2">
            <div className="flex items-center justify-between text-xs font-semibold uppercase text-muted-foreground">
              <span>Goal route</span>
              <span>{progress.goalCompletion}%</span>
            </div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-success transition-all" style={{ width: `${Math.max(4, progress.goalCompletion)}%` }} />
            </div>
            <details className="mt-3 rounded-md border border-border bg-background">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-foreground">
                <span>Route details</span>
                <span className="rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">{progress.focusTopics.length || 0} focus</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </summary>
              <div className="grid gap-3 border-t border-border p-3 md:grid-cols-[1fr_auto]">
                <p className="text-sm leading-6 text-muted-foreground">{progressPlan.detail}</p>
                <div className="flex flex-wrap gap-2 md:justify-end">
                  {progressPlan.chips.map((chip) => <SharedStatusPill key={chip} label={chip} />)}
                  {progress.focusTopics.length ? progress.focusTopics.map((topic) => <SharedStatusPill key={topic} label={topic} />) : <SharedStatusPill label="No focus set" />}
                </div>
              </div>
            </details>
          </div>
        </div>
        <details className="mt-4 rounded-md border border-border bg-background">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-foreground">
            <span>Metrics</span>
            <span className="rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">{progress.metrics.length}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </summary>
          <div className="grid gap-3 border-t border-border p-3 sm:grid-cols-2 xl:grid-cols-4">
            {progress.metrics.map((metric) => (
              <div key={metric.id} className="group relative rounded-md border border-border bg-card p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{metric.label}</p>
                <p className="mt-2 text-3xl font-semibold leading-none text-foreground">{metric.value}</p>
                <p className="pointer-events-none absolute left-2 right-2 top-[calc(100%+0.35rem)] z-20 hidden rounded-md border border-border bg-popover p-2 text-xs leading-5 text-popover-foreground shadow-lg group-hover:block">{metric.detail}</p>
              </div>
            ))}
          </div>
        </details>
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
        <div className="mt-3 grid grid-cols-3 gap-2">
          <MiniProgressStat label="Critical" value={String(topicSeverityCounts.critical)} tone="critical" />
          <MiniProgressStat label="Watch" value={String(topicSeverityCounts.watch)} tone="watch" />
          <MiniProgressStat label="Steady" value={String(topicSeverityCounts.steady)} tone="steady" />
        </div>
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
        <details>
          <summary className="flex cursor-pointer items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                <Gauge className="h-5 w-5" />
              </div>
              <h3 className="truncate font-semibold text-foreground">Learning loop</h3>
            </div>
            <span className="rounded-md bg-secondary px-2 py-1 text-xs font-semibold text-secondary-foreground">Guide</span>
          </summary>
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
        </details>
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
          <SharedStatusPill label={action.urgency} tone={urgencyTone(action.urgency)} />
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

function MiniProgressStat({ label, tone, value }: { label: string; tone: "critical" | "watch" | "steady"; value: string }) {
  return (
    <div className={`rounded-md border p-2 ${severityClass(tone)}`}>
      <p className="text-[0.65rem] font-semibold uppercase opacity-80">{label}</p>
      <p className="mt-1 text-lg font-semibold leading-none">{value}</p>
    </div>
  )
}

function summarizeProgressTopicSeverity(topics: Array<{ severity: "critical" | "watch" | "steady" }>) {
  const counts = { critical: 0, steady: 0, watch: 0 }
  for (const topic of topics) counts[topic.severity] += 1
  return counts
}

function severityClass(severity: "critical" | "watch" | "steady") {
  if (severity === "critical") return "bg-destructive text-destructive-foreground"
  if (severity === "watch") return "bg-warning/20 text-warning-foreground"
  return "bg-success/20 text-success"
}

function urgencyTone(urgency: ProgressNextAction["urgency"]) {
  if (urgency === "high") return "critical"
  if (urgency === "medium") return "watch"
  return "steady"
}

export function CalendarView({ options }: { options: WorkspaceOptions }) {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [selectedId, setSelectedId] = useState("")
  const [visibleMonth, setVisibleMonth] = useState(() => new Date())
  const [selectedDayKey, setSelectedDayKey] = useState(() => localDateKey(new Date()))
  const [title, setTitle] = useState("45 min focus block")
  const [eventType, setEventType] = useState("study")
  const [startsAt, setStartsAt] = useState(toLocalInputValue(new Date(Date.now() + options.calendarLeadMinutes * 60 * 1000)))
  const [durationMinutes, setDurationMinutes] = useState(options.calendarDefaultMinutes)
  const [notes, setNotes] = useState("")
  const [status, setStatus] = useState("")
  const [agendaFilter, setAgendaFilter] = useState<CalendarAgendaFilter>("upcoming")
  const [calendarActionBusy, setCalendarActionBusy] = useState<"save" | "complete" | "duplicate" | "delete" | null>(null)
  const selected = events.find((event) => event.id === selectedId)
  const agendaSummary = useMemo(() => summarizeCalendarAgenda(events), [events])
  const calendarSummaryChips = useMemo(() => buildCalendarSummaryChips(agendaSummary), [agendaSummary])
  const primaryCalendarChips = calendarSummaryChips.filter((chip) => chip.priority === "primary")
  const secondaryCalendarChips = calendarSummaryChips.filter((chip) => chip.priority === "secondary")
  const calendarPlan = useMemo(
    () => buildCalendarPlanningSummary(events, { defaultMinutes: options.calendarDefaultMinutes, leadMinutes: options.calendarLeadMinutes }),
    [events, options.calendarDefaultMinutes, options.calendarLeadMinutes],
  )
  const filteredEvents = useMemo(() => filterCalendarAgenda(events, agendaFilter), [agendaFilter, events])
  const monthDays = useMemo(() => buildCalendarMonthGrid(visibleMonth, events), [events, visibleMonth])
  const selectedDayEvents = useMemo(
    () => events.filter((event) => localDateKey(new Date(event.starts_at)) === selectedDayKey).sort(compareCalendarEvents),
    [events, selectedDayKey],
  )
  const selectedDaySegments = useMemo(() => buildCalendarDaySegments(selectedDayEvents), [selectedDayEvents])
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const canSave = title.trim().length > 0 && Number.isFinite(Date.parse(startsAt)) && durationMinutes >= 5
  const calendarBusy = calendarActionBusy !== null

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
    if (calendarBusy) return
    setSelectedId("")
    setTitle("45 min focus block")
    setEventType("study")
    setStartsAt(toLocalInputValue(new Date(Date.now() + options.calendarLeadMinutes * 60 * 1000)))
    setDurationMinutes(options.calendarDefaultMinutes)
    setNotes("")
    setStatus("Drafting a new time block.")
  }

  function createEventForDay(hour = 9) {
    if (calendarBusy) return
    const selectedDate = dateFromLocalKey(selectedDayKey)
    const now = new Date()
    const isToday = localDateKey(now) === selectedDayKey
    const start = isToday
      ? new Date(now.getTime() + options.calendarLeadMinutes * 60 * 1000)
      : new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), hour, 0)
    setSelectedId("")
    setTitle(hour < 12 ? "Morning focus block" : hour < 17 ? "Afternoon review block" : "Evening learning block")
    setEventType(hour < 17 ? "study" : "review")
    setStartsAt(toLocalInputValue(start))
    setDurationMinutes(options.calendarDefaultMinutes)
    setNotes("")
    setStatus(`Drafting ${formatCalendarDayLabel(selectedDayKey)} at ${start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}.`)
  }

  function selectCalendarDay(key: string) {
    setSelectedDayKey(key)
    if (!selectedId) setStartsAt(moveLocalInputDate(startsAt, key))
  }

  async function saveEvent(id = selectedId, action: "save" | "duplicate" = "save") {
    if (calendarBusy) return null
    if (!canSave) {
      setStatus("Add a title, valid start time, and duration of at least 5 minutes.")
      return null
    }
    const startDate = new Date(startsAt)
    const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000)
    setCalendarActionBusy(action)
    try {
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
      setStatus(action === "duplicate" ? `${response.item.title} duplicated.` : `${response.item.title} saved.`)
      await refresh()
      return response.item
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to save this time block.")
      return null
    } finally {
      setCalendarActionBusy(null)
    }
  }

  async function duplicateEvent() {
    await saveEvent("", "duplicate")
  }

  async function toggleComplete() {
    if (calendarBusy) return
    const nextType = eventType === "completed" ? "study" : "completed"
    const startDate = new Date(startsAt)
    setCalendarActionBusy("complete")
    try {
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
      setEventType(nextType)
      setStatus(nextType === "completed" ? "Marked complete." : "Moved back to study.")
      await refresh()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to update this time block.")
    } finally {
      setCalendarActionBusy(null)
    }
  }

  async function deleteEvent(id: string) {
    if (calendarBusy) return
    setCalendarActionBusy("delete")
    try {
      await api(`/api/calendar?id=${encodeURIComponent(id)}`, { method: "DELETE" })
      if (selectedId === id) {
        setSelectedId("")
        setTitle("45 min focus block")
        setEventType("study")
        setStartsAt(toLocalInputValue(new Date(Date.now() + options.calendarLeadMinutes * 60 * 1000)))
        setDurationMinutes(options.calendarDefaultMinutes)
        setNotes("")
      }
      setStatus("Time block deleted.")
      await refresh()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to delete this time block.")
    } finally {
      setCalendarActionBusy(null)
    }
  }

  function applyPlanSuggestion() {
    const suggestion = calendarPlan.suggestion
    setSelectedId("")
    setTitle(suggestion.title)
    setEventType(suggestion.eventType)
    setStartsAt(toLocalInputValue(suggestion.startsAt))
    setDurationMinutes(suggestion.durationMinutes)
    setNotes(suggestion.reason)
    setStatus("Suggestion loaded as a draft.")
  }

  function shiftVisibleMonth(delta: number) {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1))
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <Panel className="p-4">
        <h2 className="text-2xl font-semibold text-foreground">Study calendar</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          <SharedStatusPill label={`${options.calendarDefaultMinutes}m default`} />
          <SharedStatusPill label={`${options.calendarLeadMinutes}m lead`} />
          <SharedStatusPill label={timezone} />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {primaryCalendarChips.map((chip) => (
            <CompactInfo key={chip.id} label={chip.label} value={chip.value} />
          ))}
        </div>
        <button onClick={applyPlanSuggestion} className="mt-4 w-full rounded-md border border-border bg-secondary p-3 text-left transition hover:bg-accent hover:text-accent-foreground">
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold text-foreground">{calendarPlan.headline}</span>
            <SharedStatusPill label={calendarPlan.suggestion.eventType} tone={settingsTone(calendarPlan.tone)} />
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {calendarPlan.chips.map((chip) => <SharedStatusPill key={chip} label={chip} />)}
          </div>
        </button>
        <details className="mt-3 rounded-md border border-border bg-background p-2">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-foreground">
            <span>Planning details</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </summary>
          <div className="mt-2 grid grid-cols-2 gap-2 border-t border-border pt-2">
            {secondaryCalendarChips.map((chip) => (
              <Info key={chip.id} label={chip.label} value={chip.value} />
            ))}
          </div>
          <p className="mt-2 rounded-md bg-muted p-2 text-xs leading-5 text-muted-foreground">{calendarPlan.suggestion.reason}</p>
        </details>
        <div className="mt-4 grid gap-3">
          <Field label="Title" value={title} onChange={setTitle} />
          <label className="block rounded-lg bg-muted p-4">
            <span className="text-xs font-semibold uppercase text-muted-foreground">Type</span>
            <select value={eventType} onChange={(event) => setEventType(event.target.value)} className="mt-2 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none">
              {calendarEventTypes.map(([type, label]) => <option key={type} value={type}>{label}</option>)}
            </select>
          </label>
          <DateTimeField label="Starts at" value={startsAt} onChange={setStartsAt} />
          <NumberField label="Duration minutes" value={durationMinutes} min={5} step={5} onChange={(value) => setDurationMinutes(value || options.calendarDefaultMinutes)} />
          <div className="flex flex-wrap gap-2">
            {calendarDurationPresets.map((minutes) => (
              <ControlButton key={minutes} onClick={() => setDurationMinutes(minutes)} active={durationMinutes === minutes} size="compact">
                {formatCalendarDuration(minutes)}
              </ControlButton>
            ))}
          </div>
          <label className="block rounded-lg bg-muted p-4">
            <span className="text-xs font-semibold uppercase text-muted-foreground">Notes</span>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="mt-2 min-h-24 w-full resize-none rounded-md border border-input bg-background p-3 text-sm text-foreground outline-none" />
          </label>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <CalendarAction label="New" icon={CalendarPlus} onClick={createEvent} disabled={calendarBusy} />
          <CalendarAction label={calendarActionBusy === "save" ? "Saving" : "Save"} icon={Save} onClick={() => saveEvent()} primary disabled={calendarBusy} />
          <CalendarAction label={calendarActionBusy === "complete" ? "Updating" : eventType === "completed" ? "Reopen" : "Complete"} icon={Check} onClick={toggleComplete} disabled={calendarBusy} />
          <CalendarAction label={calendarActionBusy === "duplicate" ? "Duplicating" : "Duplicate"} icon={Copy} onClick={duplicateEvent} disabled={calendarBusy} />
        </div>
        {status ? <p className="mt-3 rounded-md bg-muted p-3 text-sm text-muted-foreground">{status}</p> : null}
      </Panel>
      <Panel className="p-4">
        <div className="mb-4 grid gap-4 2xl:grid-cols-[minmax(0,1.1fr)_minmax(300px,0.9fr)]">
          <section className="rounded-lg border border-border bg-background p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-primary" />
                <div>
                  <h3 className="font-semibold text-foreground">{visibleMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h3>
                  <p className="text-xs text-muted-foreground">Month view</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <ControlButton onClick={() => shiftVisibleMonth(-1)} className="h-8 w-8 px-0" size="compact" aria-label="Previous month">
                  <ArrowLeft className="h-4 w-4" />
                </ControlButton>
                <ControlButton onClick={() => { setVisibleMonth(new Date()); setSelectedDayKey(localDateKey(new Date())) }} size="compact">
                  Today
                </ControlButton>
                <ControlButton onClick={() => shiftVisibleMonth(1)} className="h-8 w-8 px-0" size="compact" aria-label="Next month">
                  <ArrowRight className="h-4 w-4" />
                </ControlButton>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day} className="py-1">{day}</span>)}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {monthDays.map((day) => (
                <button
                  key={day.key}
                  onClick={() => selectCalendarDay(day.key)}
                  className={`min-h-24 rounded-md border p-2 text-left transition hover:border-primary/60 hover:bg-accent hover:text-accent-foreground ${day.key === selectedDayKey ? "border-primary bg-primary/10 text-primary" : day.inMonth ? "border-border bg-card text-foreground" : "border-border/60 bg-muted/40 text-muted-foreground"} ${day.isToday ? "ring-1 ring-success/70" : ""}`}
                >
                  <span className="flex items-center justify-between gap-1 text-xs font-semibold">
                    <span>{day.label}</span>
                    {day.totalEvents ? <span className="rounded bg-secondary px-1.5 py-0.5 text-[0.62rem] text-secondary-foreground">{day.totalEvents}</span> : null}
                  </span>
                  {day.totalEvents ? (
                    <span className="mt-1 block space-y-1">
                      <span className="block truncate text-[0.68rem] font-semibold text-foreground">{day.firstEventTime}</span>
                      <span className="block truncate text-[0.65rem] text-muted-foreground">{formatCalendarDuration(day.totalMinutes)}</span>
                    </span>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-1">
                    {day.events.slice(0, 3).map((event) => <span key={event.id} className={`h-1.5 w-1.5 rounded-full ${calendarDotClass(event.event_type)}`} title={event.title} />)}
                    {day.events.length > 3 ? <span className="text-[0.65rem] font-semibold text-muted-foreground">+{day.events.length - 3}</span> : null}
                  </div>
                </button>
              ))}
            </div>
          </section>
          <section className="rounded-lg border border-border bg-background p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-foreground">{formatCalendarDayLabel(selectedDayKey)}</h3>
                <p className="text-xs text-muted-foreground">{selectedDayEvents.length} scheduled blocks</p>
              </div>
              <SharedStatusPill label={timezone} />
            </div>
            <div className="mb-3 grid grid-cols-3 gap-2">
              {([
                [9, "Morning"],
                [13, "Afternoon"],
                [19, "Evening"],
              ] as const).map(([hour, label]) => (
                <ControlButton key={hour} onClick={() => createEventForDay(hour)} size="compact" className="justify-center">
                  <CalendarPlus className="h-3.5 w-3.5" />
                  {label}
                </ControlButton>
              ))}
            </div>
            <div className="mb-3 grid gap-2">
              {selectedDaySegments.map((segment) => (
                <details key={segment.id} className="rounded-md border border-border bg-card" open={segment.events.length > 0}>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-foreground">
                    <span>{segment.label}</span>
                    <span className="rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                      {segment.events.length ? `${segment.events.length} | ${formatCalendarDuration(segment.totalMinutes)}` : "open"}
                    </span>
                  </summary>
                  <div className="grid gap-1 border-t border-border p-2">
                    {segment.events.map((event) => (
                      <button key={event.id} onClick={() => setSelectedId(event.id)} className="flex items-center justify-between gap-2 rounded-md bg-background px-2 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground" type="button">
                        <span className="min-w-0 truncate font-semibold text-foreground">{event.title}</span>
                        <span className="shrink-0 text-muted-foreground">{formatCalendarTimeRange(event)}</span>
                      </button>
                    ))}
                    {!segment.events.length ? <span className="rounded-md bg-background px-2 py-1.5 text-xs text-muted-foreground">No block yet</span> : null}
                  </div>
                </details>
              ))}
            </div>
            <div className="space-y-2">
              {selectedDayEvents.map((event) => (
                <button key={event.id} onClick={() => setSelectedId(event.id)} className={`flex w-full items-start gap-3 rounded-md border p-3 text-left ${selectedId === event.id ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-accent hover:text-accent-foreground"}`}>
                  <span className={`mt-1 h-2.5 w-2.5 rounded-full ${calendarDotClass(event.event_type)}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-muted-foreground">{formatCalendarTimeRange(event)}</span>
                    <span className="mt-1 block truncate font-semibold text-foreground">{event.title}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{labelCalendarEventType(event.event_type)} | {formatCalendarDuration(calendarEventDurationFromRecord(event))}</span>
                  </span>
                </button>
              ))}
              {!selectedDayEvents.length ? (
                <div className="rounded-md border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                  No blocks on this date. Pick a time on the left and save a focus, review, or deadline block.
                </div>
              ) : null}
            </div>
          </section>
        </div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold text-foreground">Agenda records</h3>
            <p className="text-sm text-muted-foreground">Select a block to edit it in the left panel.</p>
          </div>
          <SharedStatusPill label={`${filteredEvents.length}/${events.length} blocks`} />
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          {(["all", "today", "upcoming", "review", "completed"] as CalendarAgendaFilter[]).map((filter) => (
            <ControlButton
              key={filter}
              onClick={() => setAgendaFilter(filter)}
              active={agendaFilter === filter}
              size="compact"
            >
              <Filter className="h-3.5 w-3.5" />
              {filter[0].toUpperCase() + filter.slice(1)}
            </ControlButton>
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
                  <p className="mt-1 text-xs text-muted-foreground">{formatDate(event.starts_at)} | {labelCalendarEventType(event.event_type)}</p>
                  <p className="mt-1 inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground"><Clock className="h-3.5 w-3.5" /> {duration}</p>
                  {event.notes ? <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{event.notes}</p> : null}
                </button>
                <button
                  onClick={() => deleteEvent(event.id)}
                  className="rounded-md p-2 text-muted-foreground hover:bg-destructive hover:text-destructive-foreground disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                  aria-label="Delete event"
                  disabled={calendarBusy}
                  title={calendarActionBusy === "delete" ? "Deleting" : "Delete event"}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </article>
          )})}
          {!filteredEvents.length ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground md:col-span-2 xl:col-span-3">
              No blocks match this filter. Use the selected-day quick slots or save a new block from the editor.
            </div>
          ) : null}
        </div>
      </Panel>
    </div>
  )
}

function compareCalendarEvents(first: CalendarEvent, second: CalendarEvent) {
  return Date.parse(first.starts_at) - Date.parse(second.starts_at)
}

function calendarEventDurationFromRecord(event: CalendarEvent) {
  const start = Date.parse(event.starts_at)
  const end = Date.parse(event.ends_at)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0
  return Math.round((end - start) / 60000)
}

function calendarDotClass(type: string) {
  if (type === "review") return "bg-warning"
  if (type === "deadline") return "bg-destructive"
  if (type === "completed") return "bg-success"
  if (type === "focus") return "bg-primary"
  return "bg-sky-500"
}

function formatCalendarDayLabel(key: string) {
  const date = dateFromLocalKey(key)
  return date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })
}

function formatCalendarTimeRange(event: CalendarEvent) {
  const format = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" })
  return `${format.format(new Date(event.starts_at))} - ${format.format(new Date(event.ends_at))}`
}

function dateFromLocalKey(key: string) {
  const [year, month, day] = key.split("-").map(Number)
  return new Date(year, (month || 1) - 1, day || 1)
}

function localDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function toLocalInputValue(date: Date) {
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16)
}

function moveLocalInputDate(value: string, dayKey: string) {
  const parsed = new Date(value)
  const nextDate = dateFromLocalKey(dayKey)
  if (!Number.isFinite(parsed.getTime())) return toLocalInputValue(new Date(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate(), 9, 0))
  return toLocalInputValue(new Date(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate(), parsed.getHours(), parsed.getMinutes()))
}

function labelCalendarEventType(type: string) {
  return calendarEventTypes.find(([value]) => value === type)?.[1] ?? type
}

function CalendarAction({
  disabled,
  icon: Icon,
  label,
  onClick,
  primary,
}: {
  disabled?: boolean
  icon: typeof Save
  label: string
  onClick: () => void
  primary?: boolean
}) {
  return (
    <ControlButton onClick={onClick} active={primary} disabled={disabled}>
      <Icon className="h-4 w-4" />
      {label}
    </ControlButton>
  )
}

const settingsSectionIcons: Record<SettingsSectionId, typeof Target> = {
  experience: Palette,
  learning: Target,
  privacy: Lock,
  profile: UserRound,
}

function SettingsSectionButton({
  active,
  guide,
  onClick,
  suggested,
}: {
  active: boolean
  guide: SettingsSectionGuide
  onClick: () => void
  suggested: boolean
}) {
  const Icon = settingsSectionIcons[guide.id]
  return (
    <button
      onClick={onClick}
      className={`group relative inline-flex h-10 min-w-[9.5rem] items-center gap-2 rounded-md border px-3 text-left text-sm transition hover:-translate-y-0.5 ${active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground"}`}
      title={guide.detail}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate font-semibold">{guide.label}</span>
      {active ? (
        <span className="rounded-md bg-primary-foreground/15 px-2 py-0.5 text-[0.65rem] font-semibold text-primary-foreground">{suggested ? "next" : guide.badge}</span>
      ) : (
        <span className="rounded-md bg-background/80 px-2 py-0.5 text-[0.65rem] font-semibold text-muted-foreground">{suggested ? "next" : guide.badge}</span>
      )}
      <p className="pointer-events-none absolute left-2 right-2 top-[calc(100%+0.35rem)] z-[70] hidden rounded-md border border-border bg-popover p-2 text-xs leading-5 text-popover-foreground shadow-lg group-hover:block">{guide.detail}</p>
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
  const [section, setSection] = useState<SettingsSectionId>("profile")
  const [status, setStatus] = useState("")
  const settingsSummary = useMemo(() => summarizeSettingsOptions(options), [options])
  const settingsPlan = useMemo(() => buildSettingsControlPlan(settingsSummary), [settingsSummary])
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
              <h2 className="text-2xl font-semibold text-foreground">Settings</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                <SharedStatusPill label={settingsSummary.privacyLabel} />
                <SharedStatusPill label={settingsSummary.dailyReviewLabel} />
                {profileDirty ? <SharedStatusPill label="profile draft" tone="watch" /> : <SharedStatusPill label="profile saved" tone="steady" />}
              </div>
            </div>
          </div>
          <ControlButton onClick={saveProfile} active>
            <Save className="h-4 w-4" />
            Save
          </ControlButton>
        </div>
        {status ? <p className="mt-3 rounded-md bg-muted p-3 text-sm text-muted-foreground">{status}</p> : null}
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {settingsPlan.guides.map((guide) => (
            <SettingsSectionButton key={guide.id} guide={guide} active={section === guide.id} suggested={settingsPlan.suggestedSection === guide.id} onClick={() => setSection(guide.id)} />
          ))}
        </div>
        <details className="mt-3 rounded-md border border-border bg-background p-2">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-foreground">
            <span>Signals</span>
            <span className="flex items-center gap-2">
              <span className="rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">{settingsSummary.statuses.length}</span>
              <span className="rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">{settingsPlan.nextAction}</span>
            </span>
          </summary>
          <div className="mt-3 grid gap-2 md:grid-cols-5">
            {settingsSummary.statuses.map((item) => (
              <div key={item.id} className="rounded-md border border-border bg-card p-2 text-sm">
                <span className="block truncate font-medium text-foreground">{item.label}</span>
                <span className="mt-2 inline-flex"><SharedStatusPill label={item.value} tone={settingsTone(item.tone)} /></span>
              </div>
            ))}
          </div>
          <ControlButton
            onClick={() => setSection(settingsPlan.suggestedSection)}
            className="mt-3 w-full justify-between"
          >
            <span className="min-w-0 truncate">{settingsPlan.nextAction}</span>
            <ArrowRight className="h-4 w-4 shrink-0" />
          </ControlButton>
        </details>
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
            <Field label="AI max tokens" value={String(options.aiMaxTokens)} onChange={(value) => setOptions({ aiMaxTokens: normalizeSettingsNumber({ value, fallback: 8192, min: 256, max: 16384 }) })} />
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
        <p className="absolute right-0 top-10 z-[80] w-64 rounded-md border border-border bg-popover p-3 text-sm leading-6 text-popover-foreground shadow-xl">{body}</p>
      </details>
    </div>
  )
}

function LanguagePicker({ locale, setLocale }: { locale: SupportedLocale; setLocale: (locale: SupportedLocale) => void }) {
  return (
    <details className="mt-4 rounded-lg border border-border bg-background p-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-foreground">
        <span className="flex min-w-0 items-center gap-2">
          <Languages className="h-4 w-4 shrink-0 text-success" />
          <span className="truncate">Language</span>
        </span>
        <span className="rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">{languageNames[locale]}</span>
      </summary>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {supportedLocales.map((item) => (
          <ControlButton
            key={item}
            onClick={() => setLocale(item)}
            active={locale === item}
            className="w-full justify-between"
          >
            <span>{languageNames[item]}</span>
            {locale === item ? <Check className="h-4 w-4" /> : null}
          </ControlButton>
        ))}
      </div>
    </details>
  )
}

function settingsTone(tone: "good" | "watch" | "neutral") {
  if (tone === "good") return "steady"
  if (tone === "watch") return "watch"
  return "neutral"
}

export function AdminView({ user, adminData, automationData, options }: { user: User | null; adminData: any; automationData: any; options: WorkspaceOptions }) {
  const [tab, setTab] = useState<AdminPanelTab>("overview")
  const [query, setQuery] = useState("")
  const [inviteLinks, setInviteLinks] = useState<Record<string, string>>({})
  const [inviteStatus, setInviteStatus] = useState<Record<string, string>>({})
  const adminSummary = useMemo(() => summarizeAdminOperations({ adminData, automationData }), [adminData, automationData])
  const adminPlan = useMemo(() => buildAdminOperationalPlan(adminSummary), [adminSummary])
  const accessRequests = useMemo(() => filterAdminList(adminSummary.accessRequests, query, ["name", "email", "goal", "role"]), [adminSummary.accessRequests, query])
  const users = useMemo(() => filterAdminList(adminData?.users || [], query, ["name", "username", "email", "role"]), [adminData?.users, query])
  const providers = useMemo(() => filterAdminList(adminData?.providers || [], query, ["name", "provider", "last_status", "last_error"]), [adminData?.providers, query])
  const audit = useMemo(() => filterAdminList(adminData?.audit || [], query, ["action", "entity", "details", "user_id"]), [adminData?.audit, query])
  const jobs = useMemo(() => filterAdminList(automationData?.jobs || [], query, ["label", "description", "key"]), [automationData?.jobs, query])
  const prompts = useMemo(() => filterAdminList(automationData?.prompts || [], query, ["label", "description", "key", "mode"]), [automationData?.prompts, query])

  if (user?.role !== "admin") return <Panel className="p-4">Admin access required.</Panel>

  async function issueInvite(request: AdminAccessRequest) {
    setInviteStatus((current) => ({ ...current, [request.id]: "Creating invite..." }))
    try {
      const response = await api<{ item: { token: string } }>("/api/invites", {
        method: "POST",
        body: JSON.stringify({ email: request.email, role: request.roleKey }),
      })
      const link = `${window.location.origin}/invite/${response.item.token}`
      setInviteLinks((current) => ({ ...current, [request.id]: link }))
      setInviteStatus((current) => ({ ...current, [request.id]: "Invite ready" }))
      await navigator.clipboard?.writeText(link).catch(() => undefined)
    } catch (error) {
      setInviteStatus((current) => ({ ...current, [request.id]: error instanceof Error ? error.message : "Unable to create invite." }))
    }
  }

  return (
    <div className="grid gap-4">
      <Panel className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-md ${toneSurfaceClasses(adminSummary.systemTone === "watch" ? "watch" : "primary")}`}>
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-2xl font-semibold text-foreground">Admin control center</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                <SharedStatusPill label={adminSummary.systemTone === "watch" ? "review needed" : "healthy"} tone={adminSummary.systemTone === "watch" ? "watch" : "steady"} />
                <SharedStatusPill label={`${adminSummary.providerIssues.length} provider issue${adminSummary.providerIssues.length === 1 ? "" : "s"}`} tone={adminSummary.providerIssues.length ? "watch" : "neutral"} />
                <SharedStatusPill label={`${adminSummary.recentAudit.length} audit rows`} />
              </div>
            </div>
          </div>
          <label className="flex h-10 w-full max-w-sm items-center gap-2 rounded-md border border-border bg-background px-3 focus-within:ring-2 focus-within:ring-primary/25">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search admin data" className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground" />
          </label>
        </div>
        <details className="mt-5 rounded-md border border-border bg-background">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-foreground">
            <span>Admin signals</span>
            <span className="rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">{adminSummary.cards.length}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </summary>
          <div className="grid gap-3 border-t border-border p-3 md:grid-cols-4">
            {adminSummary.cards.map((card) => (
              <button key={card.id} onClick={() => setTab(tabFromCard(card.id))} className="group relative rounded-md border border-border bg-card p-4 text-left transition hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{card.label}</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{card.value}</p>
                <span className="mt-3 inline-flex"><SharedStatusPill label={card.tone} tone={settingsTone(card.tone)} /></span>
                <p className="pointer-events-none absolute left-2 right-2 top-[calc(100%+0.35rem)] z-20 hidden rounded-md border border-border bg-popover p-2 text-xs leading-5 text-popover-foreground shadow-lg group-hover:block">{card.detail}</p>
              </button>
            ))}
          </div>
        </details>
        <button onClick={() => setTab(adminPlan.targetTab)} className="mt-4 flex w-full items-center justify-between gap-3 rounded-md border border-border bg-secondary p-3 text-left transition hover:bg-accent hover:text-accent-foreground">
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-foreground">{adminPlan.headline}</span>
            <span className="mt-1 flex flex-wrap gap-2">
              {adminPlan.chips.map((chip) => <SharedStatusPill key={chip} label={chip} />)}
            </span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">
            {adminPlan.nextAction}
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </button>
        <div className="mt-4 flex flex-wrap gap-2">
          {([
            ["overview", "Overview", Gauge],
            ["access", "Access", UserPlus],
            ["users", "Users", Users],
            ["providers", "Providers", Bot],
            ["audit", "Audit", ShieldCheck],
            ["automation", "Automation", Sparkles],
          ] as const).map(([id, label, Icon]) => (
            <ControlButton
              key={id}
              onClick={() => setTab(id)}
              active={tab === id}
              size="compact"
            >
              <Icon className="h-4 w-4" />
              {label}
            </ControlButton>
          ))}
        </div>
      </Panel>

      {tab === "overview" ? (
        <div className="grid gap-4 xl:grid-cols-3">
          <AdminList title="Provider attention" items={adminSummary.providerIssues} emptyLabel="No provider issues." accent={adminSummary.providerIssues.length ? "watch" : "good"} />
          <AdminList title="Recent audit" items={adminSummary.recentAudit} emptyLabel="No audit rows yet." accent={adminSummary.recentAudit.length ? "neutral" : "watch"} />
          <AdminList title="Automation jobs" items={adminSummary.visibleAutomation} emptyLabel="No automation jobs loaded." accent={adminSummary.visibleAutomation.length ? "good" : "neutral"} />
        </div>
      ) : null}
      {tab === "access" ? (
        <AdminAccessRequests
          inviteLinks={inviteLinks}
          inviteStatus={inviteStatus}
          items={accessRequests}
          onIssueInvite={issueInvite}
          query={query}
        />
      ) : null}
      {tab === "users" ? <AdminList title="Users" items={users} emptyLabel="No users match this search." query={query} /> : null}
      {tab === "providers" ? (
        <div className="grid gap-4">
          <AdminList title="Provider records" items={providers} emptyLabel="No provider records match this search." query={query} accent={adminPlan.riskCount ? "watch" : "good"} />
          <ProviderAdminPanel />
        </div>
      ) : null}
      {tab === "audit" ? <AdminList title="Audit" items={audit} emptyLabel="No audit rows match this search." query={query} /> : null}
      {tab === "automation" ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <AdminList title="Automation jobs" items={jobs} emptyLabel="No automation jobs match this search." query={query} accent={jobs.length ? "good" : "neutral"} />
          <AdminList title="AI prompt contracts" items={prompts} emptyLabel="No prompt contracts match this search." query={query} accent={prompts.length ? "good" : "neutral"} />
        </div>
      ) : null}

      {options.adminVerbose ? (
        <Panel className="p-4">
          <p className="font-semibold text-foreground">Current option policy</p>
          <pre className="mt-3 overflow-auto rounded-md bg-muted p-3 text-xs text-muted-foreground">{JSON.stringify(options, null, 2)}</pre>
        </Panel>
      ) : null}
    </div>
  )
}

function tabFromCard(cardId: string): AdminPanelTab {
  if (cardId === "users") return "users"
  if (cardId === "providers") return "providers"
  if (cardId === "audit") return "audit"
  if (cardId === "automation") return "automation"
  return "overview"
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block rounded-lg bg-muted p-4">
      <span className="text-xs font-semibold uppercase text-muted-foreground">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none" />
    </label>
  )
}

function DateTimeField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block rounded-lg bg-muted p-4">
      <span className="text-xs font-semibold uppercase text-muted-foreground">{label}</span>
      <input type="datetime-local" value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none" />
    </label>
  )
}

function NumberField({ label, min, onChange, step, value }: { label: string; min: number; onChange: (value: number) => void; step: number; value: number }) {
  return (
    <label className="block rounded-lg bg-muted p-4">
      <span className="text-xs font-semibold uppercase text-muted-foreground">{label}</span>
      <input type="number" min={min} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-2 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none" />
    </label>
  )
}

function Info({ label, value }: { label: string; value?: unknown }) {
  return (
    <div className="rounded-lg bg-muted p-4">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="mt-2 font-medium text-foreground">{String(value ?? "Not set")}</p>
    </div>
  )
}

function CompactInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <p className="text-[0.65rem] font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="text-base font-semibold text-foreground">{value}</p>
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

function AdminList({
  accent = "neutral",
  emptyLabel = "No records yet.",
  items,
  query = "",
  title,
}: {
  accent?: "good" | "watch" | "neutral"
  emptyLabel?: string
  items: any[]
  query?: string
  title: string
}) {
  return (
    <Panel className="p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-foreground">{title}</p>
          {query ? <p className="mt-1 text-xs text-muted-foreground">Filtered by "{query}"</p> : null}
        </div>
        <SharedStatusPill label={String(items.length)} tone={settingsTone(accent)} />
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {items.slice(0, 12).map((item, index) => (
          <div key={item.id || item.key || index} className="rounded-md border border-border bg-background p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-semibold text-foreground">{item.name || item.username || item.action || item.provider || item.label || item.id || item.key || "Record"}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground">{item.email || item.role || item.entity || item.description || item.default_model || item.details || item.provider_type || item.key || "No detail"}</p>
            {item.last_status || item.enabled !== undefined || item.has_key !== undefined ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {item.last_status ? <SharedStatusPill label={item.last_status} /> : null}
                {item.enabled !== undefined ? <SharedStatusPill label={item.enabled ? "enabled" : "off"} tone={item.enabled ? "steady" : "neutral"} /> : null}
                {item.has_key !== undefined ? <SharedStatusPill label={item.has_key ? "key stored" : "key missing"} tone={item.has_key ? "steady" : "watch"} /> : null}
              </div>
            ) : null}
          </div>
        ))}
        {!items.length ? <p className="rounded-md border border-dashed border-border bg-background p-4 text-sm text-muted-foreground md:col-span-2 xl:col-span-4">{emptyLabel}</p> : null}
      </div>
    </Panel>
  )
}

function AdminAccessRequests({
  inviteLinks,
  inviteStatus,
  items,
  onIssueInvite,
  query,
}: {
  inviteLinks: Record<string, string>
  inviteStatus: Record<string, string>
  items: AdminAccessRequest[]
  onIssueInvite: (request: AdminAccessRequest) => void
  query: string
}) {
  return (
    <Panel className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-foreground">Access requests</p>
          <p className="mt-1 text-sm text-muted-foreground">Review request-access audit rows and issue invite links without digging through raw logs.</p>
          {query ? <p className="mt-1 text-xs text-muted-foreground">Filtered by "{query}"</p> : null}
        </div>
        <SharedStatusPill label={String(items.length)} tone={items.length ? "watch" : "steady"} />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {items.map((item) => (
          <article key={item.id} className="rounded-md border border-border bg-background p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{item.name}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">{item.email}</p>
              </div>
              <SharedStatusPill label={item.role} />
            </div>
            <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">{item.goal || "No learning goal included."}</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <ControlButton
                type="button"
                onClick={() => onIssueInvite(item)}
                active
                size="compact"
              >
                <UserPlus className="h-4 w-4" />
                Issue invite
              </ControlButton>
              {inviteLinks[item.id] ? (
                <ControlButton
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(inviteLinks[item.id]).catch(() => undefined)}
                  size="compact"
                  className="min-w-0 max-w-full"
                  title={inviteLinks[item.id]}
                >
                  <LinkIcon className="h-4 w-4 shrink-0" />
                  <span className="truncate">Copy invite link</span>
                </ControlButton>
              ) : null}
              {inviteStatus[item.id] ? <SharedStatusPill label={inviteStatus[item.id]} tone={inviteStatus[item.id].toLowerCase().includes("ready") ? "steady" : "neutral"} /> : null}
            </div>
          </article>
        ))}
        {!items.length ? (
          <p className="rounded-md border border-dashed border-border bg-background p-4 text-sm text-muted-foreground lg:col-span-2">
            No pending access requests match this search. New request-access submissions appear here after learners submit the login form.
          </p>
        ) : null}
      </div>
    </Panel>
  )
}
