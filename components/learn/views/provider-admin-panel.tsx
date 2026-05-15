"use client"

import { useEffect, useMemo, useState } from "react"
import { CheckCircle2, FlaskConical, KeyRound, Plus, Save, Trash2, Wand2 } from "lucide-react"
import { api } from "../api"
import { Panel } from "../ui"

type ProviderType = "chat" | "embed" | "gateway"

interface ProviderPreset {
  id: string
  provider: string
  label: string
  model: string
  type: ProviderType
  priority: number
  requestsPerMinute: number
  timeoutMs: number
  cooldownSeconds: number
  endpoint: string
  notes: string
}

interface ProviderConfig {
  id: string
  name: string
  provider: string
  provider_type: ProviderType
  default_model: string
  endpoint_override: string
  notes: string
  enabled: boolean
  priority: number
  requests_per_minute: number
  max_input_chars: number
  max_completion_tokens: number
  timeout_ms: number
  cooldown_seconds: number
  last_status: string
  last_error: string
  has_key: boolean
}

interface ProviderSummary {
  totalCount: number
  enabledCount: number
  readyCount: number
  hasDegradedProviders: boolean
  routingOrder: Array<{
    id: string
    name: string
    provider: string
    providerType: ProviderType
    priority: number
    status: string
    secretLabel: "Stored" | "Missing"
  }>
}

interface ProviderForm {
  id: string
  name: string
  provider: string
  providerType: ProviderType
  apiKey: string
  defaultModel: string
  endpointOverride: string
  notes: string
  enabled: boolean
  priority: number
  requestsPerMinute: number
  maxInputChars: number
  maxCompletionTokens: number
  timeoutMs: number
  cooldownSeconds: number
}

const blankForm: ProviderForm = {
  id: "",
  name: "",
  provider: "cloudflare",
  providerType: "gateway",
  apiKey: "",
  defaultModel: "@cf/meta/llama-3.1-8b-instruct",
  endpointOverride: "https://gateway.ai.cloudflare.com/v1",
  notes: "",
  enabled: true,
  priority: 50,
  requestsPerMinute: 18,
  maxInputChars: 1400,
  maxCompletionTokens: 1800,
  timeoutMs: 18_000,
  cooldownSeconds: 20,
}

export function ProviderAdminPanel() {
  const [providers, setProviders] = useState<ProviderConfig[]>([])
  const [presets, setPresets] = useState<ProviderPreset[]>([])
  const [summary, setSummary] = useState<ProviderSummary | null>(null)
  const [form, setForm] = useState<ProviderForm>(blankForm)
  const [status, setStatus] = useState("Loading provider console...")

  async function refresh() {
    const response = await api<{ items: ProviderConfig[]; presets: ProviderPreset[]; summary: ProviderSummary }>("/api/ai/providers")
    setProviders(response.items)
    setPresets(response.presets)
    setSummary(response.summary)
    setStatus("Provider console ready.")
  }

  useEffect(() => {
    refresh().catch((error) => setStatus(error instanceof Error ? error.message : "Unable to load providers."))
  }, [])

  const selectedPreset = useMemo(() => presets.find((preset) => preset.provider === form.provider), [form.provider, presets])
  const providerOptions = useMemo(() => {
    const options = new Set(["cloudflare", "vercel"])
    for (const preset of presets) options.add(preset.provider)
    return Array.from(options)
  }, [presets])

  function applyPreset(preset: ProviderPreset) {
    setForm({
      ...blankForm,
      name: preset.label,
      provider: preset.provider,
      providerType: preset.type,
      defaultModel: preset.model,
      endpointOverride: preset.endpoint,
      notes: preset.notes,
      priority: preset.priority,
      requestsPerMinute: preset.requestsPerMinute,
      timeoutMs: preset.timeoutMs,
      cooldownSeconds: preset.cooldownSeconds,
    })
  }

  function editProvider(provider: ProviderConfig) {
    setForm({
      id: provider.id,
      name: provider.name,
      provider: provider.provider,
      providerType: provider.provider_type,
      apiKey: "",
      defaultModel: provider.default_model,
      endpointOverride: provider.endpoint_override,
      notes: provider.notes,
      enabled: provider.enabled,
      priority: provider.priority,
      requestsPerMinute: provider.requests_per_minute,
      maxInputChars: provider.max_input_chars,
      maxCompletionTokens: provider.max_completion_tokens,
      timeoutMs: provider.timeout_ms,
      cooldownSeconds: provider.cooldown_seconds,
    })
  }

  async function saveProvider() {
    setStatus("Saving encrypted provider config...")
    const method = form.id ? "PUT" : "POST"
    await api("/api/ai/providers", { method, body: JSON.stringify(form) })
    setForm(blankForm)
    await refresh()
  }

  async function testProvider(id: string) {
    setStatus("Testing stored provider key...")
    const response = await api<{ success: boolean; message: string }>("/api/ai/providers", {
      method: "POST",
      body: JSON.stringify({ action: "test", id }),
    })
    setStatus(response.message)
    await refresh()
  }

  async function deleteProvider(id: string) {
    setStatus("Deleting provider config...")
    await api(`/api/ai/providers?id=${encodeURIComponent(id)}`, { method: "DELETE" })
    await refresh()
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
      <Panel className="p-4 xl:col-span-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-foreground">AI provider control center</h3>
            <p className="mt-1 text-sm text-muted-foreground">Admin-only encrypted routing, failover, limits, testing, and automation prompts.</p>
          </div>
          <button onClick={() => setForm(blankForm)} className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground">
            <Plus className="h-4 w-4" />
            New provider
          </button>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-4">
          <Metric label="Total" value={summary?.totalCount ?? 0} />
          <Metric label="Enabled" value={summary?.enabledCount ?? 0} />
          <Metric label="Ready" value={summary?.readyCount ?? 0} />
          <Metric label="Routing" value={summary?.hasDegradedProviders ? "Needs review" : "Healthy"} />
        </div>
      </Panel>

      <Panel className="p-4">
        <h4 className="font-semibold text-foreground">Stored providers</h4>
        <div className="mt-3 space-y-2">
          {providers.map((provider) => (
            <article key={provider.id} className="rounded-md border border-border bg-background p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-foreground">{provider.name}</p>
                  <p className="text-xs text-muted-foreground">{provider.provider} · {provider.default_model} · priority {provider.priority}</p>
                </div>
                <span className={`rounded px-2 py-1 text-xs font-medium ${provider.last_status === "ok" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                  {provider.last_status || "untested"}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => editProvider(provider)} className="h-8 rounded-md border border-border bg-secondary px-3 text-xs font-medium text-secondary-foreground">Edit</button>
                <button onClick={() => testProvider(provider.id)} className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-secondary px-3 text-xs font-medium text-secondary-foreground">
                  <FlaskConical className="h-3.5 w-3.5" />
                  Test
                </button>
                <button onClick={() => deleteProvider(provider.id)} className="inline-flex h-8 items-center gap-1 rounded-md border border-destructive/40 bg-destructive/10 px-3 text-xs font-medium text-foreground">
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
                <span className="inline-flex h-8 items-center gap-1 rounded-md bg-muted px-3 text-xs text-muted-foreground">
                  <KeyRound className="h-3.5 w-3.5" />
                  {provider.has_key ? "Key stored" : "Key missing"}
                </span>
              </div>
              {provider.last_error ? <p className="mt-2 text-xs text-destructive">{provider.last_error}</p> : null}
            </article>
          ))}
          {!providers.length ? <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">No provider configs stored yet. Use a preset or add one manually.</p> : null}
        </div>
      </Panel>

      <Panel className="p-4">
        <h4 className="font-semibold text-foreground">Edit encrypted provider</h4>
        <div className="mt-3 grid gap-3">
          <Field label="Name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
          <SelectField label="Provider" value={form.provider} options={providerOptions} onChange={(value) => setForm({ ...form, provider: value })} />
          <SelectField label="Type" value={form.providerType} options={["chat", "embed", "gateway"]} onChange={(value) => setForm({ ...form, providerType: value as ProviderType })} />
          <Field label="API key" value={form.apiKey} type="password" placeholder={form.id ? "Leave blank to keep encrypted key" : "Paste key to encrypt"} onChange={(value) => setForm({ ...form, apiKey: value })} />
          <Field label="Model" value={form.defaultModel} onChange={(value) => setForm({ ...form, defaultModel: value })} />
          <Field label="Endpoint" value={form.endpointOverride} onChange={(value) => setForm({ ...form, endpointOverride: value })} />
          <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className="min-h-20 rounded-md border border-input bg-background p-3 text-sm text-foreground outline-none" placeholder="Routing notes, use cases, cooldown notes" />
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Priority" value={form.priority} onChange={(value) => setForm({ ...form, priority: value })} />
            <NumberField label="RPM" value={form.requestsPerMinute} onChange={(value) => setForm({ ...form, requestsPerMinute: value })} />
            <NumberField label="Input chars" value={form.maxInputChars} onChange={(value) => setForm({ ...form, maxInputChars: value })} />
            <NumberField label="Max tokens" value={form.maxCompletionTokens} onChange={(value) => setForm({ ...form, maxCompletionTokens: value })} />
            <NumberField label="Timeout ms" value={form.timeoutMs} onChange={(value) => setForm({ ...form, timeoutMs: value })} />
            <NumberField label="Cooldown sec" value={form.cooldownSeconds} onChange={(value) => setForm({ ...form, cooldownSeconds: value })} />
          </div>
          <label className="flex items-center justify-between gap-3 rounded-md bg-muted p-3 text-sm text-foreground">
            Enabled for failover
            <input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} />
          </label>
          <button onClick={saveProvider} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">
            <Save className="h-4 w-4" />
            Save encrypted config
          </button>
          {selectedPreset ? (
            <button onClick={() => applyPreset(selectedPreset)} className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-secondary px-3 text-sm font-medium text-secondary-foreground">
              <Wand2 className="h-4 w-4" />
              Apply {selectedPreset.label}
            </button>
          ) : null}
        </div>
      </Panel>

      <Panel className="p-4 xl:col-span-2">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-success" />
          <p className="font-semibold text-foreground">Routing order</p>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          {(summary?.routingOrder ?? []).map((item) => (
            <div key={item.id} className="rounded-md border border-border p-3">
              <p className="font-medium text-foreground">{item.priority}. {item.name}</p>
              <p className="text-xs text-muted-foreground">{item.provider} · {item.providerType} · {item.status} · {item.secretLabel}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm text-muted-foreground">{status}</p>
      </Panel>
    </div>
  )
}

function Field({ label, value, onChange, type = "text", placeholder = "" }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase text-muted-foreground">{label}</span>
      <input value={value} type={type} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none" />
    </label>
  )
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase text-muted-foreground">{label}</span>
      <input value={value} type="number" onChange={(event) => onChange(Number(event.target.value) || 0)} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none" />
    </label>
  )
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase text-muted-foreground">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none">
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  )
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold text-foreground">{value}</p>
    </div>
  )
}
