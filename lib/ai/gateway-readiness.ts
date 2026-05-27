import type { GuidedPromptResult } from "./prompt-builder"

export interface AiGatewayProviderStatus {
  provider?: string
  enabled?: boolean
  has_key?: boolean
  last_status?: string
  name?: string
  default_model?: string
  priority?: number
}

export interface AiGatewayProviderCatalogItem {
  provider: string
  label: string
  defaultModel: string
  endpoint: string
  type?: string
  supportedTypes: string[]
  defaultPriority: number
  safeRequestsPerMinute: number
  safeTimeoutMs: number
  safeCooldownSeconds: number
}

export interface AiGatewayProviderPresetItem {
  id: string
  provider: string
  label: string
  model: string
  type?: string
  priority: number
  requestsPerMinute: number
  timeoutMs: number
  cooldownSeconds: number
  endpoint: string
}

export interface AiGatewayReadiness {
  status: "ready" | "warning" | "blocked"
  label: string
  checks: string[]
  readyProviderCount: number
  selectedProviderCount: number
}

export function sanitizeAiGatewayProviderStatuses(providers: Array<Record<string, unknown>>): AiGatewayProviderStatus[] {
  return providers.map((provider) => ({
    name: typeof provider.name === "string" ? provider.name : undefined,
    provider: typeof provider.provider === "string" ? provider.provider : undefined,
    enabled: provider.enabled === true || provider.enabled === 1 || provider.enabled === "1",
    has_key: Boolean(provider.has_key),
    last_status: typeof provider.last_status === "string" ? provider.last_status : "untested",
    default_model: typeof provider.default_model === "string" ? provider.default_model : undefined,
    priority: Number(provider.priority || 50),
  }))
}

export function sanitizeAiGatewayProviderCatalog(providers: Array<Record<string, unknown>>): AiGatewayProviderCatalogItem[] {
  return providers.map((provider) => ({
    provider: readString(provider.provider),
    label: readString(provider.label),
    defaultModel: readString(provider.defaultModel),
    endpoint: readString(provider.endpoint),
    type: typeof provider.type === "string" ? provider.type : undefined,
    supportedTypes: readStringArray(provider.supportedTypes),
    defaultPriority: readNumber(provider.defaultPriority, 50),
    safeRequestsPerMinute: readNumber(provider.safeRequestsPerMinute, 10),
    safeTimeoutMs: readNumber(provider.safeTimeoutMs, 18000),
    safeCooldownSeconds: readNumber(provider.safeCooldownSeconds, 20),
  }))
}

export function sanitizeAiGatewayProviderPresets(presets: Array<Record<string, unknown>>): AiGatewayProviderPresetItem[] {
  return presets.map((preset) => ({
    id: readString(preset.id),
    provider: readString(preset.provider),
    label: readString(preset.label),
    model: readString(preset.model),
    type: typeof preset.type === "string" ? preset.type : undefined,
    priority: readNumber(preset.priority, 50),
    requestsPerMinute: readNumber(preset.requestsPerMinute, 10),
    timeoutMs: readNumber(preset.timeoutMs, 18000),
    cooldownSeconds: readNumber(preset.cooldownSeconds, 20),
    endpoint: readString(preset.endpoint),
  }))
}

export function buildAiGatewayReadiness(input: {
  prompt: GuidedPromptResult
  providers: AiGatewayProviderStatus[]
  providerFamily: string
}) {
  const readyProviders = input.providers.filter(isProviderReady)
  const selectedProviders = input.providerFamily === "auto"
    ? readyProviders
    : readyProviders.filter((provider) => provider.provider === input.providerFamily)
  const checks: string[] = []

  if (!input.prompt.ok) {
    checks.push(`Missing required fields: ${input.prompt.missing.join(", ")}`)
  }
  if (input.prompt.warnings.length) {
    checks.push(...input.prompt.warnings)
  }
  if (!input.providers.length) {
    checks.push("Provider status has not been loaded yet.")
  } else if (!readyProviders.length) {
    checks.push("No enabled provider currently has a stored key and healthy status.")
  } else if (input.providerFamily !== "auto" && !selectedProviders.length) {
    checks.push(`Preferred provider family "${input.providerFamily}" is not ready; auto failover is safer.`)
  }

  const blocked = !input.prompt.ok || (input.providers.length > 0 && readyProviders.length === 0)
  const status: AiGatewayReadiness["status"] = blocked ? "blocked" : checks.length ? "warning" : "ready"
  return {
    status,
    label: status === "ready" ? "Ready to run" : status === "warning" ? "Review before run" : "Blocked",
    checks: checks.length ? checks : ["Prompt, output target, and provider route look ready."],
    readyProviderCount: readyProviders.length,
    selectedProviderCount: selectedProviders.length,
  }
}

function isProviderReady(provider: AiGatewayProviderStatus) {
  return Boolean(provider.enabled && provider.has_key && provider.last_status !== "error")
}

function readString(value: unknown) {
  return typeof value === "string" ? value : ""
}

function readNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}
