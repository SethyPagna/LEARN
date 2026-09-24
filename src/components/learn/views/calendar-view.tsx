"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft, ArrowRight, Check, Copy, Download, Link as LinkIcon, Plus, Sparkles, Trash2, X } from "lucide-react"
import { DEFAULT_ALARM_LEAD_MINUTES } from "@/lib/calendar/ics"
import { buildCalendarMonthGrid, buildCalendarPlanningSummary, calendarEventTypeOptions, calendarReminderOptions, filterCalendarAgenda, formatCalendarDuration, labelCalendarEventType, normalizeCalendarEventType, type CalendarAgendaFilter, type CalendarEventType } from "@/lib/calendar-features"
import type { WorkspaceOptions } from "../preferences"
import type { CalendarEvent } from "../types"
import { api } from "../api"
import { ControlButton } from "../ui"
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
  const [feedUrl, setFeedUrl] = useState("")
  const [status, setStatus] = useState("")
  const [agendaFilter, setAgendaFilter] = useState<CalendarAgendaFilter>("upcoming")
  const [calendarActionBusy, setCalendarActionBusy] = useState<"save" | "complete" | "duplicate" | "delete" | "feed" | null>(null)
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
  const [mode, setMode] = useState<"month" | "week" | "agenda">("month")
  const [editorOpen, setEditorOpen] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [syncOpen, setSyncOpen] = useState(false)
  const weekDays = useMemo(() => {
    const start = dateFromLocalKey(selectedDayKey)
    start.setDate(start.getDate() - start.getDay())
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)
      const key = localDateKey(date)
      return { key, date, events: events.filter((event) => localDateKey(new Date(event.starts_at)) === key).sort(compareCalendarEvents) }
    })
  }, [selectedDayKey, events])
  useEffect(() => {
    if (editorOpen) dialogRef.current?.showModal()
    else dialogRef.current?.close()
  }, [editorOpen])

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const canSave = title.trim().length > 0 && Number.isFinite(Date.parse(startsAt)) && Number.isFinite(durationMinutes) && durationMinutes >= 5 && Number.isFinite(new Date(Date.parse(startsAt) + durationMinutes * 60000).getTime())
  const calendarBusy = calendarActionBusy !== null

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
    setTitle("")
    setEventType(hour < 17 ? "study" : "review")
    setStartsAt(toLocalInputValue(start))
    setDurationMinutes(options.calendarDefaultMinutes)
    setNotes("")
    setReminderMinutes(DEFAULT_ALARM_LEAD_MINUTES)
    setEditorOpen(true)
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
    setTitle(suggestion.title)
    setEventType(normalizeCalendarEventType(suggestion.eventType))
    setStartsAt(toLocalInputValue(suggestion.startsAt))
    setDurationMinutes(suggestion.durationMinutes)
    setNotes(suggestion.reason)
    setReminderMinutes(DEFAULT_ALARM_LEAD_MINUTES)
    setEditorOpen(true)
    setStatus("")
  }

  /**
   * Ask the server for the caller's subscription URL, minting the token on the
   * first call. The URL is shown rather than opened: the point is to paste it
   * into a calendar app, so it has to be visible and copyable.
   */
  async function loadFeedUrl() {
    if (calendarBusy) return
    setCalendarActionBusy("feed")
    try {
      const response = await api<{ url: string }>("/api/calendar/feed", { method: "POST" })
      setFeedUrl(response.url)
      await navigator.clipboard?.writeText(response.url).catch(() => undefined)
      setStatus("Subscription link ready and copied. Add it to your calendar app's 'From URL' option.")
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to create a calendar subscription link.")
    } finally {
      setCalendarActionBusy(null)
    }
  }

  async function copyFeedUrl() {
    await navigator.clipboard?.writeText(feedUrl).catch(() => undefined)
    setStatus("Subscription link copied.")
  }

  function shiftVisibleMonth(delta: number) {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1))
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
    <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-xl font-semibold tracking-tight">Calendar</h2><p className="mt-1 text-xs text-muted-foreground">{timezone}</p></div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setSyncOpen(!syncOpen)} aria-label="Sync & export" aria-expanded={syncOpen} className="editor-command"><LinkIcon className="h-4 w-4" /><span className="hidden sm:inline">Sync & export</span></button>
        <button type="button" onClick={() => createEventForDay()} className="editor-primary"><Plus className="h-4 w-4" /> Add event</button>
      </div>
    </header>
    {syncOpen ? <div className="mb-4 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <ControlButton onClick={loadFeedUrl} disabled={calendarBusy} size="compact"><LinkIcon className="h-4 w-4" />{calendarActionBusy === "feed" ? "Preparing…" : "Get subscription link"}</ControlButton>
        <ControlButton onClick={() => window.location.assign("/api/calendar/ics")} size="compact"><Download className="h-4 w-4" /> Download .ics</ControlButton>
      </div>
      {feedUrl ? <div className="mt-3 flex gap-2"><input readOnly value={feedUrl} aria-label="Calendar subscription URL" onFocus={(event) => event.target.select()} className="editor-input min-w-0 flex-1" /><button type="button" aria-label="Copy subscription URL" className="editor-command" onClick={copyFeedUrl}><Copy className="h-4 w-4" /></button></div> : null}
      <p className="mt-3 text-xs text-muted-foreground">Use the subscription link in your calendar app to keep events and reminders in sync.</p>
    </div> : null}
    {!editorOpen && status ? <p role="status" className="mb-3 text-sm text-muted-foreground">{status}</p> : null}
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-1">
        {mode !== "agenda" ? <><button type="button" className="editor-command !px-2" aria-label="Previous period" onClick={() => movePeriod(-1)}><ArrowLeft className="h-4 w-4" /></button>
        <button type="button" className="editor-command !px-2" aria-label="Next period" onClick={() => movePeriod(1)}><ArrowRight className="h-4 w-4" /></button></> : null}
        <h3 className="ml-2 min-w-0 text-sm font-semibold sm:text-base">{mode === "agenda" ? "Agenda" : mode === "week" ? `${weekDays[0].date.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${weekDays[6].date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}` : visibleMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h3>
        <button type="button" className="editor-command ml-2" onClick={() => { const now = new Date(); setVisibleMonth(now); setSelectedDayKey(localDateKey(now)); if (mode === "agenda") setAgendaFilter("today") }}>Today</button>
      </div>
      <div className="flex rounded-lg bg-secondary p-1" aria-label="Calendar views">{(["month", "week", "agenda"] as const).map((value) => <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)} className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize ${mode === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>{value}</button>)}</div>
    </div>
    {mode === "agenda" ? <div className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap gap-1 border-b border-border p-3">{(["all", "today", "upcoming", "review", "completed"] as CalendarAgendaFilter[]).map((filter) => <button key={filter} type="button" aria-pressed={agendaFilter === filter} onClick={() => setAgendaFilter(filter)} className={`rounded-lg px-3 py-2 text-xs capitalize ${agendaFilter === filter ? "bg-secondary font-medium" : "text-muted-foreground"}`}>{filter}</button>)}</div>
      <ul className="divide-y divide-border" aria-label="Agenda">{filteredEvents.map((event) => <li key={event.id}><button type="button" onClick={() => openEvent(event)} className="flex w-full items-center gap-4 px-4 py-4 text-left hover:bg-secondary/50">
        <span className="w-12 shrink-0 text-center"><span className="block text-xs text-muted-foreground">{new Date(event.starts_at).toLocaleDateString(undefined, { month: "short" })}</span><span className="block text-xl font-medium">{new Date(event.starts_at).getDate()}</span></span>
        <span className={`h-8 w-0.5 shrink-0 rounded-full ${calendarDotClass(event.event_type)}`} />
        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{event.title}</span><span className="mt-1 block text-xs text-muted-foreground">{formatCalendarTimeRange(event)} · {labelCalendarEventType(event.event_type)}</span></span>
        <span className="hidden text-xs text-muted-foreground sm:block">{formatCalendarDuration(calendarEventDurationFromRecord(event))}</span>
      </button></li>)}</ul>
      {!filteredEvents.length ? <p className="p-10 text-center text-sm text-muted-foreground">No events in this view.</p> : null}
    </div> : <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
        {mode === "month" ? <>
          <div className="grid grid-cols-7 border-b border-border text-center text-xs text-muted-foreground">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day} className="py-3">{day}</span>)}</div>
          <div className="grid grid-cols-7">{monthDays.map((day) => <div key={day.key} className={`calendar-day min-w-0 border-b border-r border-border/70 p-1.5 last:border-r-0 sm:p-2 ${day.inMonth ? "" : "bg-secondary/35 text-muted-foreground"} ${day.key === selectedDayKey ? "bg-primary/5" : ""}`}>
            <button type="button" aria-label={formatCalendarDayLabel(day.key)} aria-pressed={day.key === selectedDayKey} onClick={() => selectCalendarDay(day.key)} className={`mb-1 flex h-7 w-7 items-center justify-center rounded-full text-xs transition hover:bg-secondary ${day.isToday ? "bg-primary font-semibold text-primary-foreground" : day.key === selectedDayKey ? "bg-accent font-semibold" : ""}`}>{day.label}</button>
            <div className="hidden space-y-1 sm:block">{day.events.slice(0, 3).map((event) => <button key={event.id} type="button" onClick={() => openEvent(event)} className="flex w-full items-center gap-1.5 rounded-md bg-secondary/70 px-1.5 py-1 text-left text-[11px] hover:bg-accent"><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${calendarDotClass(event.event_type)}`} /><span className="truncate">{event.title}</span></button>)}</div>
            {day.events.length > 3 ? <button type="button" onClick={() => selectCalendarDay(day.key)} className="hidden px-1 text-[10px] text-muted-foreground sm:block">+{day.events.length - 3} more</button> : null}
            <div className="mt-2 flex flex-wrap gap-1 sm:hidden">{day.events.slice(0, 3).map((event) => <span key={event.id} className={`h-1.5 w-1.5 rounded-full ${calendarDotClass(event.event_type)}`} />)}</div>
          </div>)}</div>
        </> : <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-7 sm:divide-x sm:divide-y-0">{weekDays.map((day) => <div key={day.key} className="min-w-0 sm:min-h-[540px]">
          <button type="button" onClick={() => selectCalendarDay(day.key)} aria-pressed={selectedDayKey === day.key} className={`flex w-full items-center justify-between border-b border-border px-3 py-3 text-sm sm:flex-col sm:gap-2 ${selectedDayKey === day.key ? "bg-primary/5 text-primary" : ""}`}><span className="text-xs">{day.date.toLocaleDateString(undefined, { weekday: "short" })}</span><span className="text-lg font-medium">{day.date.getDate()}</span></button>
          <div className="space-y-2 p-2">{day.events.map((event) => <button key={event.id} type="button" onClick={() => openEvent(event)} className="block w-full rounded-lg border border-border bg-secondary/45 p-2 text-left hover:bg-accent"><span className={`mb-2 block h-0.5 w-5 ${calendarDotClass(event.event_type)}`} /><span className="block break-words text-xs font-medium">{event.title}</span><span className="mt-1 block text-[10px] text-muted-foreground">{formatCalendarTimeRange(event)}</span></button>)}{!day.events.length ? <p className="py-2 text-center text-[11px] text-muted-foreground">Free</p> : null}</div>
        </div>)}</div>}
      </div>
      <aside className="rounded-xl border border-border bg-card p-4">
        <div className="mb-4 flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">{formatCalendarDayLabel(selectedDayKey)}</h3><button type="button" aria-label="Add event on selected day" onClick={() => createEventForDay()} className="editor-command !px-2"><Plus className="h-4 w-4" /></button></div>
        <ul className="space-y-2" aria-label="Selected day events">{selectedDayEvents.map((event) => <li key={event.id}><button type="button" onClick={() => openEvent(event)} className="flex w-full gap-3 rounded-lg p-2 text-left hover:bg-secondary"><span className={`mt-1 h-8 w-0.5 shrink-0 rounded-full ${calendarDotClass(event.event_type)}`} /><span className="min-w-0"><span className="block truncate text-sm font-medium">{event.title}</span><span className="mt-1 block text-xs text-muted-foreground">{formatCalendarTimeRange(event)}</span></span></button></li>)}</ul>
        {!selectedDayEvents.length ? <p className="py-6 text-sm text-muted-foreground">Nothing scheduled. Leave room for an idea.</p> : null}
        <button type="button" onClick={applyPlanSuggestion} className="mt-4 flex w-full items-center gap-2 border-t border-border pt-4 text-left text-xs text-muted-foreground hover:text-foreground"><Sparkles className="h-3.5 w-3.5" /> Suggest a study block</button>
      </aside>
    </div>}
    <dialog ref={dialogRef} aria-labelledby="calendar-event-title" onCancel={(event) => { if (calendarBusy) event.preventDefault(); else setEditorOpen(false) }} onClose={() => setEditorOpen(false)} className="calendar-event-dialog m-auto max-h-[90dvh] overflow-y-auto rounded-2xl border border-border bg-card p-0 text-foreground shadow-lift backdrop:bg-black/35">
      <form onSubmit={(event) => { event.preventDefault(); void saveEvent() }}>
        <header className="flex items-center justify-between border-b border-border px-5 py-4"><h3 id="calendar-event-title" className="font-semibold">{selectedId ? "Edit event" : "New event"}</h3><button type="button" aria-label="Close event editor" disabled={calendarBusy} onClick={() => setEditorOpen(false)} className="editor-command !px-2"><X className="h-4 w-4" /></button></header>
        <div className="grid gap-4 p-5">
          <label className="editor-field">Title<input autoFocus required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What are you planning?" className="editor-input" /></label>
          <div className="grid grid-cols-2 gap-3"><label className="editor-field">Type<select value={eventType} onChange={(event) => setEventType(normalizeCalendarEventType(event.target.value))} className="editor-input">{calendarEventTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label className="editor-field">Duration (minutes)<input type="number" required min={5} step={5} value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))} className="editor-input" /></label></div>
          <label className="editor-field">Starts at<input type="datetime-local" required value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className="editor-input min-w-0" /></label>
          <label className="editor-field">Reminder<select value={reminderMinutes} onChange={(event) => setReminderMinutes(Number(event.target.value))} className="editor-input">{reminderOptionList(reminderMinutes).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label className="editor-field">Notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="editor-input min-h-24 resize-y" placeholder="Optional details" /></label>
          {status ? <p role="status" className="text-sm text-muted-foreground">{status}</p> : null}
        </div>
        <footer className="flex flex-wrap items-center gap-2 border-t border-border p-4">
          {selectedId ? <><button type="button" aria-label="Delete event" disabled={calendarBusy} onClick={() => void deleteEvent(selectedId)} className="editor-command text-destructive"><Trash2 className="h-4 w-4" /></button><button type="button" aria-label="Duplicate event" disabled={calendarBusy || !canSave} onClick={() => void duplicateEvent()} className="editor-command"><Copy className="h-4 w-4" /></button><button type="button" onClick={() => void toggleComplete()} disabled={calendarBusy || !canSave} className="editor-command"><Check className="h-4 w-4" />{eventType === "completed" ? "Reopen" : "Complete"}</button></> : null}
          <button type="submit" disabled={calendarBusy || !canSave} className="editor-primary ml-auto">{calendarActionBusy === "save" ? "Saving…" : "Save event"}</button>
        </footer>
      </form>
    </dialog>
  </section>
}
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

