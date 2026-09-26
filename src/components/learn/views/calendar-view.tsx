"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Check, Copy, Link as LinkIcon, Plus, Sparkles, Trash2, X, SlidersHorizontal } from "lucide-react"
import { DEFAULT_ALARM_LEAD_MINUTES } from "@/lib/calendar/ics"
import { buildCalendarMonthGrid, buildCalendarPlanningSummary, calendarEventTypeOptions, calendarReminderOptions, filterCalendarAgenda, formatCalendarDuration, labelCalendarEventType, normalizeCalendarEventType, type CalendarAgendaFilter, type CalendarEventType } from "@/lib/calendar-features"
import type { WorkspaceOptions } from "../preferences"
import type { CalendarEvent } from "../types"
import { api } from "../api"
import { CalendarConnections, useConnectedCalendars } from "../calendar-connections"
export function CalendarView({ options }: { options: WorkspaceOptions }) {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [selectedId, setSelectedId] = useState("")
  const [calendarMounted, setCalendarMounted] = useState(false)
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(2000, 0, 1))
  const [selectedDayKey, setSelectedDayKey] = useState("2000-01-01")
  const [title, setTitle] = useState("")
  const [eventType, setEventType] = useState<CalendarEventType>("study")
  const [startsAt, setStartsAt] = useState("")
  const [durationMinutes, setDurationMinutes] = useState(options.calendarDefaultMinutes)
  const [notes, setNotes] = useState("")
  const [reminderMinutes, setReminderMinutes] = useState(DEFAULT_ALARM_LEAD_MINUTES)
  const [source, setSource] = useState("learn")
  const [selectedRemote, setSelectedRemote] = useState<CalendarEvent["remote"]>()
  const [allDay, setAllDay] = useState(false)
  const [hiddenTypes, setHiddenTypes] = useState<string[]>([])
  const [hiddenCalendars, setHiddenCalendars] = useState<string[]>([])
  const [filtersReady, setFiltersReady] = useState(false)
  const range = useMemo(() => ({ start: new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), -6).toISOString(), end: new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 2, 8).toISOString() }), [visibleMonth])
  const connected = useConnectedCalendars(range.start, range.end, calendarMounted)
  const allEvents = useMemo(() => [...events, ...connected.items.map(event => ({ ...event, event_type: "external", ...(event.allDay ? { starts_at: new Date(event.starts_at.slice(0, 10) + "T00:00:00").toISOString(), ends_at: new Date(event.ends_at.slice(0, 10) + "T00:00:00").toISOString() } : {}) }))], [events, connected.items])
  const visibleEvents = useMemo(() => allEvents.filter(event => !hiddenTypes.includes(event.event_type) && !hiddenCalendars.includes(event.remote ? calendarSource(event.remote.connectionId, event.remote.calendarId) : "learn")), [allEvents, hiddenTypes, hiddenCalendars])
  const [status, setStatus] = useState("")
  const [agendaFilter, setAgendaFilter] = useState<CalendarAgendaFilter>("upcoming")
  const [calendarActionBusy, setCalendarActionBusy] = useState<"save" | "complete" | "duplicate" | "delete" | null>(null)
  const calendarPlan = useMemo(
    () => buildCalendarPlanningSummary(allEvents, { defaultMinutes: options.calendarDefaultMinutes, leadMinutes: options.calendarLeadMinutes }),
    [allEvents, options.calendarDefaultMinutes, options.calendarLeadMinutes],
  )
  const filteredEvents = useMemo(() => filterCalendarAgenda(visibleEvents, agendaFilter), [agendaFilter, visibleEvents])
  const monthDays = useMemo(() => buildCalendarMonthGrid(visibleMonth, visibleEvents), [visibleEvents, visibleMonth])
  const selectedDayEvents = useMemo(
    () => visibleEvents.filter((event) => localDateKey(new Date(event.starts_at)) === selectedDayKey).sort(compareCalendarEvents),
    [visibleEvents, selectedDayKey],
  )
  const [mode, setMode] = useState<"month" | "week" | "agenda">("month")
  const [editorOpen, setEditorOpen] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [connectionsOpen, setConnectionsOpen] = useState(false)
  const weekDays = useMemo(() => {
    const start = dateFromLocalKey(selectedDayKey)
    start.setDate(start.getDate() - start.getDay())
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)
      const key = localDateKey(date)
      return { key, date, events: visibleEvents.filter((event) => localDateKey(new Date(event.starts_at)) === key).sort(compareCalendarEvents) }
    })
  }, [selectedDayKey, visibleEvents])
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("learn:calendar:filters") || "{}")
      if (Array.isArray(saved.types)) setHiddenTypes(saved.types.filter((value: unknown) => typeof value === "string"))
      if (Array.isArray(saved.calendars)) setHiddenCalendars(saved.calendars.filter((value: unknown) => typeof value === "string"))
    } catch { /* Preferences can be reset without affecting calendar data. */ }
    setFiltersReady(true)
    const outcome = new URLSearchParams(window.location.search).get("connection")
    if (outcome) { setConnectionsOpen(true); setStatus(outcome === "connected" ? "Calendar connected." : "Calendar authorization wasn't completed. Open Connections to try again.") }
  }, [])
  useEffect(() => { if (filtersReady) { try { localStorage.setItem("learn:calendar:filters", JSON.stringify({ types: hiddenTypes, calendars: hiddenCalendars })) } catch {} } }, [filtersReady, hiddenTypes, hiddenCalendars])
  useEffect(() => {
    if (editorOpen) dialogRef.current?.showModal()
    else dialogRef.current?.close()
  }, [editorOpen])

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const canSave = title.trim().length > 0 && Number.isFinite(Date.parse(startsAt)) && Number.isFinite(durationMinutes) && durationMinutes >= 5 && Number.isFinite(new Date(Date.parse(startsAt) + durationMinutes * 60000).getTime())
  const calendarBusy = calendarActionBusy !== null
  const readOnly = selectedRemote && !selectedRemote.writable

  async function refresh() {
    const response = await api<{ items: CalendarEvent[] }>("/api/calendar")
    setEvents(response.items)
  }

  useEffect(() => {
    refresh().catch((error) => setStatus(error.message))
  }, [])

  useEffect(() => {
    if (calendarMounted) return
    const now = new Date()
    setVisibleMonth(now)
    setSelectedDayKey(localDateKey(now))
    setStartsAt(toLocalInputValue(new Date(now.getTime() + options.calendarLeadMinutes * 60 * 1000)))
    setDurationMinutes(options.calendarDefaultMinutes)
    setCalendarMounted(true)
  }, [calendarMounted, options.calendarDefaultMinutes, options.calendarLeadMinutes])

  function openEvent(event: CalendarEvent) {
    setSelectedRemote(event.remote)
    setSource(event.remote ? calendarSource(event.remote.connectionId, event.remote.calendarId) : "learn")
    setAllDay(Boolean(event.allDay))
    setSelectedId(event.id)
    setTitle(event.title)
    setEventType(normalizeCalendarEventType(event.event_type))
    setStartsAt(toLocalInputValue(new Date(event.starts_at)))
    setDurationMinutes(Math.max(5, calendarEventDurationFromRecord(event)))
    setNotes(event.notes || "")
    setReminderMinutes(calendarReminderFromRecord(event))
    setStatus("")
    setEditorOpen(true)
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
    setSelectedRemote(undefined); setSource("learn"); setAllDay(false)
    setTitle("")
    setEventType(hour < 17 ? "study" : "review")
    setStartsAt(toLocalInputValue(start))
    setDurationMinutes(options.calendarDefaultMinutes)
    setNotes("")
    setReminderMinutes(DEFAULT_ALARM_LEAD_MINUTES)
    setEditorOpen(true)
    setStatus("")
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
      if (source !== "learn") {
        const [connectionId, calendarId] = JSON.parse(source) as [string, string]
        const remoteId = action === "duplicate" ? undefined : selectedRemote?.eventId
        await api("/api/calendar/connected-events", { method: remoteId ? "PUT" : "POST", body: JSON.stringify({ connectionId, calendarId, eventId: remoteId, etag: selectedRemote?.etag, recurrenceId: remoteId ? selectedRemote?.recurrenceId : undefined, title, notes, reminderMinutes, allDay, startsAt: allDay ? `${startsAt.slice(0, 10)}T00:00:00Z` : startDate.toISOString(), endsAt: allDay ? `${localDateKey(new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + Math.max(1, Math.round(durationMinutes / 1440))))}T00:00:00Z` : endDate.toISOString() }) })
        setEditorOpen(false); setStatus("Saved to your connected calendar.")
        await connected.refresh()
        return null
      }
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
          reminderMinutes,
        }),
      })
      setSelectedId(response.item.id)
      setStatus(action === "duplicate" ? `${response.item.title} duplicated.` : `${response.item.title} saved.`)
      setSelectedDayKey(localDateKey(startDate))
      setVisibleMonth(startDate)
      setEditorOpen(false)
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
    if (calendarBusy || !canSave) return
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
          reminderMinutes,
        }),
      })
      setEditorOpen(false)
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
      if (selectedRemote) {
        await api("/api/calendar/connected-events", { method: "DELETE", body: JSON.stringify(selectedRemote) })
        setEditorOpen(false); setStatus("Event deleted from its calendar."); await connected.refresh(); return
      }
      await api(`/api/calendar?id=${encodeURIComponent(id)}`, { method: "DELETE" })
      if (selectedId === id) {
        setSelectedId("")
        setTitle("45 min focus block")
        setEventType("study")
        setStartsAt(toLocalInputValue(new Date(Date.now() + options.calendarLeadMinutes * 60 * 1000)))
        setDurationMinutes(options.calendarDefaultMinutes)
        setNotes("")
        setReminderMinutes(DEFAULT_ALARM_LEAD_MINUTES)
      }
      setEditorOpen(false)
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
    setSelectedRemote(undefined); setSource("learn"); setAllDay(false)
    setTitle(suggestion.title)
    setEventType(normalizeCalendarEventType(suggestion.eventType))
    setStartsAt(toLocalInputValue(suggestion.startsAt))
    setDurationMinutes(suggestion.durationMinutes)
    setNotes(suggestion.reason)
    setReminderMinutes(DEFAULT_ALARM_LEAD_MINUTES)
    setEditorOpen(true)
    setStatus("")
  }

  function shiftVisibleMonth(delta: number) {
    const next = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + delta, 1)
    setVisibleMonth(next)
    setSelectedDayKey(localDateKey(next))
  }

  function movePeriod(direction: number) {
    if (mode === "week") {
      const next = dateFromLocalKey(selectedDayKey)
      next.setDate(next.getDate() + direction * 7)
      setSelectedDayKey(localDateKey(next))
      setVisibleMonth(next)
    } else shiftVisibleMonth(direction)
  }

  if (!calendarMounted) return <p role="status" className="p-4 text-sm text-muted-foreground">Loading calendar…</p>

  return <section className="calendar-workspace mx-auto max-w-[1600px]" aria-label="Calendar">
    <header className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-baseline gap-3"><h2 className="text-xl font-semibold tracking-tight">Calendar</h2><span title={`Times shown in ${timezone}`} className="hidden text-[11px] text-muted-foreground sm:inline">{timezone.split("/").at(-1)?.replaceAll("_", " ")}</span></div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setConnectionsOpen(true)} aria-label="Calendar connections" className="editor-command"><LinkIcon className="h-4 w-4" /><span className="sr-only">Connections</span></button>
        <button type="button" onClick={() => createEventForDay()} className="editor-primary" aria-label="Add" title="Add"><Plus className="h-4 w-4" /> </button>
      </div>
    </header>
    <CalendarConnections open={connectionsOpen} onClose={() => setConnectionsOpen(false)} onChange={() => void connected.refresh()} />
    {!editorOpen && status ? <p role="status" className="mb-3 text-sm text-muted-foreground">{status}</p> : null}
    {connected.errors.length ? <p role="status" className="text-xs text-warning">{connected.errors.join(" ")}</p> : null}
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-1">
        <button type="button" className="editor-command !px-1.5" aria-label="Previous year" onClick={() => shiftVisibleMonth(-12)}><ChevronsLeft className="h-4 w-4" /></button>
        <button type="button" className="editor-command !px-1.5" aria-label={mode === "week" ? "Previous week" : "Previous month"} onClick={() => movePeriod(-1)}><ChevronLeft className="h-4 w-4" /></button>
        <button type="button" className="editor-command !px-1.5" aria-label={mode === "week" ? "Next week" : "Next month"} onClick={() => movePeriod(1)}><ChevronRight className="h-4 w-4" /></button>
        <button type="button" className="editor-command !px-1.5" aria-label="Next year" onClick={() => shiftVisibleMonth(12)}><ChevronsRight className="h-4 w-4" /></button>
        <h3 className="ml-2 min-w-0 text-sm font-semibold sm:text-base">{mode === "agenda" ? "Agenda" : mode === "week" ? `${weekDays[0].date.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${weekDays[6].date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}` : visibleMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h3>
        <button type="button" className="editor-command ml-2" onClick={() => { const now = new Date(); setVisibleMonth(now); setSelectedDayKey(localDateKey(now)); if (mode === "agenda") setAgendaFilter("today") }}>Today</button>
      </div>
      <div className="flex rounded-lg bg-secondary p-1" aria-label="Calendar views">{(["month", "week", "agenda"] as const).map((value) => <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)} className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize ${mode === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>{value}</button>)}</div>
    </div>
    <details className="calendar-filters-panel"><summary className="editor-command"><SlidersHorizontal className="h-4 w-4" />Filters{hiddenTypes.length + hiddenCalendars.length ? <span className="text-xs text-primary">{hiddenTypes.length + hiddenCalendars.length} hidden</span> : null}</summary><div className="grid gap-2 py-2">
    <div className="flex flex-wrap gap-1.5" aria-label="Event category filters">{[...calendarEventTypeOptions, { value: "external", label: "Connected" }].map(option => <button key={option.value} type="button" className="calendar-filter" aria-pressed={!hiddenTypes.includes(option.value)} onClick={() => setHiddenTypes(current => toggleHidden(current, option.value))}><span className={`h-1.5 w-1.5 rounded-full ${calendarDotClass(option.value)}`} />{option.label}</button>)}</div>
    {connected.calendars.length ? <div className="flex flex-wrap gap-1.5" aria-label="Calendar filters"><button type="button" className="calendar-filter" aria-pressed={!hiddenCalendars.includes("learn")} onClick={() => setHiddenCalendars(current => toggleHidden(current, "learn"))}>LEARN</button>{connected.calendars.map(calendar => { const key = calendarSource(calendar.connectionId, calendar.id); return <button key={key} type="button" className="calendar-filter" aria-pressed={!hiddenCalendars.includes(key)} onClick={() => setHiddenCalendars(current => toggleHidden(current, key))}>{calendar.name}</button> })}</div> : null}
    </div></details>
    {mode === "agenda" ? <div className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap gap-1 border-b border-border p-3">{(["all", "today", "upcoming", "review", "completed"] as CalendarAgendaFilter[]).map((filter) => <button key={filter} type="button" aria-pressed={agendaFilter === filter} onClick={() => setAgendaFilter(filter)} className={`rounded-lg px-3 py-2 text-xs capitalize ${agendaFilter === filter ? "bg-secondary font-medium" : "text-muted-foreground"}`}>{filter}</button>)}</div>
      <ul className="divide-y divide-border" aria-label="Agenda">{filteredEvents.map((event) => <li key={event.id}><button type="button" onClick={() => openEvent(event)} className="flex w-full items-center gap-4 px-4 py-4 text-left hover:bg-secondary/50">
        <span className="w-12 shrink-0 text-center"><span className="block text-xs text-muted-foreground">{new Date(event.starts_at).toLocaleDateString(undefined, { month: "short" })}</span><span className="block text-xl font-medium">{new Date(event.starts_at).getDate()}</span></span>
        <span className={`h-8 w-0.5 shrink-0 rounded-full ${calendarDotClass(event.event_type)}`} />
        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{event.title}</span><span className="mt-1 block text-xs text-muted-foreground">{formatCalendarTimeRange(event)} · {event.remote ? "Connected" : labelCalendarEventType(event.event_type)}</span></span>
        <span className="hidden text-xs text-muted-foreground sm:block">{formatCalendarDuration(calendarEventDurationFromRecord(event))}</span>
      </button></li>)}</ul>
      {!filteredEvents.length ? <p className="p-10 text-center text-sm text-muted-foreground">No events</p> : null}
    </div> : <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_240px]">
      <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
        {mode === "month" ? <>
          <div className="grid grid-cols-7 border-b border-border text-center text-xs text-muted-foreground">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day} className="py-3">{day}</span>)}</div>
          <div className="grid grid-cols-7">{monthDays.map((day) => <div key={day.key} className={`calendar-day min-w-0 border-b border-r border-border/70 p-1.5 last:border-r-0 sm:p-2 ${day.inMonth ? "" : "bg-secondary/35 text-muted-foreground"} ${day.key === selectedDayKey ? "bg-primary/5" : ""}`}>
            <button type="button" aria-label={formatCalendarDayLabel(day.key)} aria-pressed={day.key === selectedDayKey} onClick={() => selectCalendarDay(day.key)} className={`mb-1 flex h-7 w-7 items-center justify-center rounded-full text-xs transition hover:bg-secondary ${day.isToday ? "bg-primary font-semibold text-primary-foreground" : day.key === selectedDayKey ? "bg-accent font-semibold" : ""}`}>{day.label}</button>
            <div className="hidden space-y-1 sm:block">{day.events.slice(0, 3).map((event) => <button key={event.id} type="button" onClick={() => openEvent(event)} className="flex w-full items-center gap-1.5 rounded-md bg-secondary/70 px-1.5 py-1 text-left text-[11px] hover:bg-accent"><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${calendarDotClass(event.event_type)}`} /><span className="truncate">{event.title}</span></button>)}</div>
            {day.events.length > 3 ? <button type="button" onClick={() => selectCalendarDay(day.key)} className="hidden px-1 text-[10px] text-muted-foreground sm:block">+{day.events.length - 3} more</button> : null}
            <div className="mt-2 flex flex-wrap gap-1 sm:hidden">{day.events.slice(0, 3).map((event) => <span key={event.id} className={`h-1.5 w-1.5 rounded-full ${calendarDotClass(event.event_type)}`} />)}</div>
          </div>)}</div>
        </> : <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-7 sm:divide-x sm:divide-y-0">{weekDays.map((day) => <div key={day.key} className="min-w-0 sm:min-h-[360px]">
          <button type="button" onClick={() => selectCalendarDay(day.key)} aria-pressed={selectedDayKey === day.key} className={`flex w-full items-center justify-between border-b border-border px-3 py-3 text-sm sm:flex-col sm:gap-2 ${selectedDayKey === day.key ? "bg-primary/5 text-primary" : ""}`}><span className="text-xs">{day.date.toLocaleDateString(undefined, { weekday: "short" })}</span><span className="text-lg font-medium">{day.date.getDate()}</span></button>
          <div className="space-y-2 p-2">{day.events.map((event) => <button key={event.id} type="button" onClick={() => openEvent(event)} className="block w-full rounded-lg border border-border bg-secondary/45 p-2 text-left hover:bg-accent"><span className={`mb-2 block h-0.5 w-5 ${calendarDotClass(event.event_type)}`} /><span className="block break-words text-xs font-medium">{event.title}</span><span className="mt-1 block text-[10px] text-muted-foreground">{formatCalendarTimeRange(event)}</span></button>)}{!day.events.length ? <p className="py-2 text-center text-[11px] text-muted-foreground">Free</p> : null}</div>
        </div>)}</div>}
      </div>
      <aside className="rounded-xl border border-border bg-card p-4">
        <div className="mb-4 flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">{formatCalendarDayLabel(selectedDayKey)}</h3><button type="button" aria-label="Add event on selected day" onClick={() => createEventForDay()} className="editor-command !px-2"><Plus className="h-4 w-4" /></button></div>
        <ul className="space-y-2" aria-label="Selected day events">{selectedDayEvents.map((event) => <li key={event.id}><button type="button" onClick={() => openEvent(event)} className="flex w-full gap-3 rounded-lg p-2 text-left hover:bg-secondary"><span className={`mt-1 h-8 w-0.5 shrink-0 rounded-full ${calendarDotClass(event.event_type)}`} /><span className="min-w-0"><span className="block truncate text-sm font-medium">{event.title}</span><span className="mt-1 block text-xs text-muted-foreground">{formatCalendarTimeRange(event)}</span></span></button></li>)}</ul>
        {!selectedDayEvents.length ? <p className="py-6 text-sm text-muted-foreground">No events</p> : null}
        <button type="button" onClick={applyPlanSuggestion} aria-label="Suggest a study block" title="Suggest a study block" className="editor-command mt-4"><Sparkles className="h-4 w-4" /></button>
      </aside>
    </div>}
    <dialog ref={dialogRef} aria-labelledby="calendar-event-title" onCancel={(event) => { if (calendarBusy) event.preventDefault(); else setEditorOpen(false) }} onClose={() => setEditorOpen(false)} className="calendar-event-dialog m-auto max-h-[90dvh] overflow-y-auto rounded-2xl border border-border bg-card p-0 text-foreground shadow-lift backdrop:bg-black/35">
      <form onSubmit={(event) => { event.preventDefault(); void saveEvent() }}>
        <header className="flex items-center justify-between border-b border-border px-4 py-2"><h3 id="calendar-event-title" className="text-sm font-semibold">{readOnly ? "Event" : selectedId ? "Edit event" : "New event"}</h3><button type="button" aria-label="Close event editor" disabled={calendarBusy} onClick={() => setEditorOpen(false)} className="editor-command !px-2"><X className="h-4 w-4" /></button></header>
        <fieldset disabled={calendarBusy || Boolean(readOnly)} className="grid min-w-0 gap-3 p-4">
          <input aria-label="Event title" autoFocus required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Add a title" className="editor-input !text-base !font-medium" />
          <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-2"><label className="editor-field">{allDay ? "Date" : "Starts"}<input type={allDay ? "date" : "datetime-local"} required value={allDay ? startsAt.slice(0, 10) : startsAt} onChange={(event) => setStartsAt(allDay ? `${event.target.value}T00:00` : event.target.value)} className="editor-input min-w-0" /></label><label className="editor-field">{allDay ? "Days" : "Minutes"}<input type="number" required min={allDay ? 1 : 5} step={allDay ? 1 : 5} value={allDay ? Math.max(1, Math.round(durationMinutes / 1440)) : durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value) * (allDay ? 1440 : 1))} className="editor-input" /></label></div>
          {source === "learn" ? <select aria-label="Event category" value={eventType} onChange={(event) => setEventType(normalizeCalendarEventType(event.target.value))} className="editor-input">{calendarEventTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={allDay} onChange={event => { setAllDay(event.target.checked); setDurationMinutes(event.target.checked ? 1440 : options.calendarDefaultMinutes) }} />All day</label>}
          {connected.calendars.length ? <label className="editor-field">Calendar<select value={source} disabled={Boolean(selectedId)} onChange={event => { setSource(event.target.value); setAllDay(false) }} className="editor-input"><option value="learn">LEARN</option>{connected.calendars.filter(calendar => calendar.writable || source === calendarSource(calendar.connectionId, calendar.id)).map(calendar => <option key={calendarSource(calendar.connectionId, calendar.id)} value={calendarSource(calendar.connectionId, calendar.id)}>{calendar.name} · {calendar.provider}</option>)}</select></label> : null}
          <details><summary className="cursor-pointer text-xs text-muted-foreground">More details</summary><div className="mt-3 grid gap-3"><label className="editor-field">Reminder<select value={reminderMinutes} onChange={(event) => setReminderMinutes(Number(event.target.value))} className="editor-input">{reminderOptionList(reminderMinutes).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label className="editor-field">Notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="editor-input min-h-20 resize-y" placeholder="Optional details" /></label></div></details>
        </fieldset>
        {readOnly ? <p className="px-4 pb-3 text-xs text-muted-foreground">{selectedRemote?.provider === "apple" && selectedRemote.recurring ? "Edit repeating Apple events in Apple Calendar." : "This calendar is read-only."}</p> : null}
        {status ? <p role="status" className="px-4 pb-3 text-xs text-muted-foreground">{status}</p> : null}
        <footer className="flex flex-wrap items-center gap-2 border-t border-border p-4">
          {selectedId && !readOnly ? <><button type="button" aria-label="Delete event" disabled={calendarBusy} onClick={() => void deleteEvent(selectedId)} className="editor-command text-destructive"><Trash2 className="h-4 w-4" /></button><button type="button" aria-label="Duplicate event" disabled={calendarBusy || !canSave} onClick={() => void duplicateEvent()} className="editor-command"><Copy className="h-4 w-4" /></button>{!selectedRemote ? <button type="button" onClick={() => void toggleComplete()} disabled={calendarBusy || !canSave} className="editor-command"><Check className="h-4 w-4" />{eventType === "completed" ? "Reopen" : "Complete"}</button> : null}</> : null}
          {!readOnly ? <button type="submit" disabled={calendarBusy || !canSave} className="editor-primary ml-auto">{calendarActionBusy === "save" ? "Saving…" : "Save"}</button> : null}
        </footer>
      </form>
    </dialog>
  </section>
}
function calendarSource(connectionId: string, calendarId: string) { return JSON.stringify([connectionId, calendarId]) }
function toggleHidden(current: string[], value: string) { return current.includes(value) ? current.filter(item => item !== value) : [...current, value] }
function compareCalendarEvents(first: CalendarEvent, second: CalendarEvent) {
  return Date.parse(first.starts_at) - Date.parse(second.starts_at)
}

/**
 * The saved reminder as a form value.
 *
 * `null` (a row saved before the reminder column existed, or written by the API
 * without one) shows the default lead rather than "None": the feed would give
 * such an event a default alarm anyway, so showing "None" would misreport what
 * the user's calendar is actually going to do.
 */
function calendarReminderFromRecord(event: CalendarEvent) {
  const value = event.reminder_minutes
  if (value === null || value === undefined) return DEFAULT_ALARM_LEAD_MINUTES
  const minutes = Number(value)
  return Number.isFinite(minutes) && minutes >= 0 ? Math.floor(minutes) : DEFAULT_ALARM_LEAD_MINUTES
}

/**
 * The option list plus the current value if it is not one of them.
 *
 * The select is the only place the saved lead is visible, and a `<select>` whose
 * `value` matches no `<option>` silently renders the first entry — so a value
 * written through the API (say 7) would display as "None" and be overwritten
 * with 0 on the next save. Carrying the odd value into the list keeps the
 * control honest.
 */
function reminderOptionList(current: number) {
  if (calendarReminderOptions.some((option) => option.value === current)) return calendarReminderOptions
  return [...calendarReminderOptions, { value: current, label: `${current} minutes before` }]
    .sort((first, second) => first.value - second.value)
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
  if (event.allDay) return "All day"
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
