"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Link2, X, Unplug, Check } from "lucide-react"
import type { CalendarProvider, ConnectedCalendar, RemoteEvent } from "@/lib/calendar/connections-types"
import { api } from "./api"

type ConnectionSummary = { id: string; provider: CalendarProvider; label: string }
type ConnectionResult = { connectionId: string; label: string; calendars: ConnectedCalendar[]; items: RemoteEvent[]; error: string }
const providerNames = { google: "Google Calendar", outlook: "Outlook", apple: "Apple Calendar" }

export function useConnectedCalendars(start: string, end: string, enabled: boolean) {
  const [results, setResults] = useState<ConnectionResult[]>([])
  const [error, setError] = useState("")
  const sequence = useRef(0)
  const refresh = useCallback(async () => {
    if (!enabled) return
    const revision = ++sequence.current
    try {
      const response = await api<{ results: ConnectionResult[]; checkedAt: string }>(`/api/calendar/connected-events?${new URLSearchParams({ start, end })}`)
      if (revision !== sequence.current) return
      setResults(current => response.results.map(result => result.error ? { ...result, calendars: current.find(item => item.connectionId === result.connectionId)?.calendars || [], items: current.find(item => item.connectionId === result.connectionId)?.items || [] } : result))
      setError("")
    } catch (reason) { if (revision === sequence.current) setError(reason instanceof Error ? reason.message : "Connected calendars are unavailable.") }
  }, [start, end, enabled])
  useEffect(() => {
    void refresh()
    const update = () => { if (document.visibilityState === "visible") void refresh() }
    const timer = window.setInterval(update, 120_000)
    window.addEventListener("focus", update)
    return () => { sequence.current++; window.clearInterval(timer); window.removeEventListener("focus", update) }
  }, [refresh])
  return { items: results.flatMap(result => result.items), calendars: results.flatMap(result => result.calendars), errors: [error, ...results.filter(result => result.error).map(result => `${result.label}: ${result.error}`)].filter(Boolean), refresh }
}

export function CalendarConnections({ open, onClose, onChange }: { open: boolean; onClose: () => void; onChange: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [connections, setConnections] = useState<ConnectionSummary[]>([])
  const [available, setAvailable] = useState<Record<CalendarProvider, boolean>>({ google: false, outlook: false, apple: false })
  const [busy, setBusy] = useState(false), [status, setStatus] = useState("")
  const [appleOpen, setAppleOpen] = useState(false), [username, setUsername] = useState(""), [password, setPassword] = useState("")
  async function load() {
    try { const response = await api<{ providers: typeof available; connections: ConnectionSummary[] }>("/api/calendar/connections"); setAvailable(response.providers); setConnections(response.connections) }
    catch (reason) { setStatus(reason instanceof Error ? reason.message : "Unable to load connections.") }
  }
  useEffect(() => { if (open) { dialog.current?.showModal(); void load() } else { dialog.current?.close(); setPassword("") } }, [open])
  async function connect(provider: CalendarProvider) {
    if (busy) return
    setBusy(true); setStatus("")
    try {
      const response = await api<{ url?: string }>("/api/calendar/connections", { method: "POST", body: JSON.stringify({ provider, ...(provider === "apple" ? { username, password } : {}) }) })
      setPassword("")
      if (response.url) window.location.assign(response.url)
      else { setAppleOpen(false); await load(); onChange(); setStatus("Connected. Events update automatically.") }
    } catch (reason) { setStatus(reason instanceof Error ? reason.message : "Connection failed.") }
    finally { setBusy(false) }
  }
  async function disconnect(id: string) {
    setBusy(true)
    try { await api(`/api/calendar/connections?id=${encodeURIComponent(id)}`, { method: "DELETE" }); await load(); onChange(); setStatus("Disconnected. Your calendar events stay with their provider.") }
    catch (reason) { setStatus(reason instanceof Error ? reason.message : "Unable to disconnect.") }
    finally { setBusy(false) }
  }
  async function subscriptionLink() {
    try {
      const response = await api<{ url: string }>("/api/calendar/feed", { method: "POST" })
      await navigator.clipboard.writeText(response.url)
      setStatus("Subscription link copied. It keeps LEARN events visible in another calendar app.")
    } catch { setStatus("The subscription link could not be copied.") }
  }
  return <dialog ref={dialog} aria-labelledby="calendar-connections-title" onCancel={onClose} onClose={onClose} className="m-auto w-[min(440px,calc(100vw-24px))] max-h-[85dvh] overflow-auto rounded-xl border border-border bg-card p-4 text-foreground shadow-lift backdrop:bg-black/35">
    <header className="mb-4 flex items-center justify-between"><h3 id="calendar-connections-title" className="font-semibold">Calendar accounts</h3><button type="button" aria-label="Close calendar connections" className="editor-command !px-2" onClick={onClose}><X className="h-4 w-4" /></button></header>
    <p className="mb-4 text-xs text-muted-foreground">See and edit your calendars here. Changes save directly to the selected calendar; updates arrive automatically while LEARN is open.</p>
    <div className="grid gap-2">{connections.map(connection => <div key={connection.id} className="flex items-center gap-2 rounded-lg border border-border p-3"><Check className="h-4 w-4 shrink-0 text-success" /><span className="min-w-0 flex-1"><span className="block truncate text-sm">{connection.label}</span><span className="text-xs text-muted-foreground">{providerNames[connection.provider]}</span></span><button type="button" disabled={busy} aria-label={`Disconnect ${connection.label}`} onClick={() => void disconnect(connection.id)} className="editor-command !px-2"><Unplug className="h-4 w-4" /></button></div>)}</div>
    <div className="mt-4 grid gap-2">{(["google", "outlook", "apple"] as const).map(provider => <button key={provider} type="button" disabled={busy || !available[provider]} onClick={() => provider === "apple" ? setAppleOpen(!appleOpen) : void connect(provider)} className="flex items-center gap-3 rounded-lg border border-border px-3 py-3 text-left hover:bg-secondary disabled:opacity-50"><Link2 className="h-4 w-4 text-primary" /><span className="flex-1 text-sm">{providerNames[provider]}</span><span className="text-xs text-muted-foreground">{available[provider] ? "Connect" : "Setup needed"}</span></button>)}</div>
    {appleOpen ? <form className="mt-4 grid gap-3" onSubmit={event => { event.preventDefault(); void connect("apple") }}><label className="editor-field">Apple Account<input type="email" required value={username} onChange={event => setUsername(event.target.value)} className="editor-input" autoComplete="username" /></label><label className="editor-field">App-specific password<input type="password" required value={password} onChange={event => setPassword(event.target.value)} className="editor-input" autoComplete="off" /></label><a href="https://support.apple.com/102654" target="_blank" rel="noreferrer" className="text-xs text-primary underline">Create an app-specific password</a><button type="submit" disabled={busy} className="editor-primary">{busy ? "Connecting…" : "Connect Apple Calendar"}</button></form> : null}
    {Object.values(available).some(value => !value) ? <p className="mt-4 text-xs text-muted-foreground">Accounts marked “Setup needed” require your LEARN administrator to enable that provider.</p> : null}
    <details className="mt-4 text-xs text-muted-foreground"><summary className="cursor-pointer">More options</summary><div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => void subscriptionLink()} className="editor-command">Copy subscription link</button><a href="/api/calendar/ics" className="editor-command">Download calendar</a></div></details>
    {status ? <p role="status" className="mt-3 text-sm text-muted-foreground">{status}</p> : null}
  </dialog>
}
