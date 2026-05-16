import crypto from "node:crypto"
import { getProviderMetadata, type AiProviderKey, type AiProviderPreset } from "./providers"

const IV_BYTES = 12
const KEY_BYTES = 32

export interface ProviderConfigInput {
  name?: string
  provider?: string
  providerType?: string
  accountEmail?: string
  projectName?: string
  apiKey?: string
  defaultModel?: string
  supportedModels?: string[] | string
  endpointOverride?: string
  notes?: string
  enabled?: boolean
  priority?: number
  requestsPerMinute?: number
  maxInputChars?: number
  maxCompletionTokens?: number
  timeoutMs?: number
  cooldownSeconds?: number
}

export interface NormalizedProviderConfigInput {
  name: string
  provider: AiProviderKey
  providerType: "chat" | "embed" | "gateway"
  accountEmail: string
  projectName: string
  apiKey: string
  defaultModel: string
  supportedModels: string[]
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

export interface SerializedProviderConfig {
  id: string
  name: string
  provider: string
  provider_type: string
  enabled: boolean
  priority: number
  has_key: boolean
  key_masked: string
  last_status: string
  last_error: string
}

export interface ProviderAdminSummary {
  totalCount: number
  enabledCount: number
  readyCount: number
  hasDegradedProviders: boolean
  routingOrder: Array<{
    id: string
    name: string
    provider: string
    providerType: string
    priority: number
    status: string
    secretLabel: "Stored" | "Missing"
  }>
}

const safeProviderDefaults: Record<AiProviderKey, Pick<NormalizedProviderConfigInput,
  "priority" | "requestsPerMinute" | "maxInputChars" | "maxCompletionTokens" | "timeoutMs" | "cooldownSeconds"
>> = {
  groq: fromMetadata("groq", 16_000, 8192),
  google: fromMetadata("google", 16_000, 8192),
  mistral: fromMetadata("mistral", 16_000, 8192),
  cerebras: fromMetadata("cerebras", 16_000, 8192),
  cloudflare: fromMetadata("cloudflare", 16_000, 8192),
  vercel: fromMetadata("vercel", 16_000, 8192),
  cohere: fromMetadata("cohere", 1000, 128),
}

function fromMetadata(provider: AiProviderKey, maxInputChars: number, maxCompletionTokens: number) {
  const metadata = getProviderMetadata(provider)
  return {
    priority: metadata?.defaultPriority || 50,
    requestsPerMinute: metadata?.safeRequestsPerMinute || 10,
    maxInputChars,
    maxCompletionTokens,
    timeoutMs: metadata?.safeTimeoutMs || 18_000,
    cooldownSeconds: metadata?.safeCooldownSeconds || 20,
  }
}

function clamp(value: number | undefined, fallback: number, min: number, max: number) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(max, Math.max(min, numeric))
}

function trim(value: unknown) {
  return String(value || "").trim()
}

function normalizeSupportedModels(value: ProviderConfigInput["supportedModels"]) {
  if (Array.isArray(value)) return value.map(trim).filter(Boolean)
  return trim(value).split(/\r?\n|,/).map(trim).filter(Boolean)
}

function deriveEncryptionKey(masterKey: string) {
  return crypto.createHash("sha256").update(masterKey || "learn-local-development-key").digest().subarray(0, KEY_BYTES)
}

export function maskProviderSecret(value: string) {
  const key = trim(value)
  if (!key) return ""
  if (key.length <= 8) return `${key.slice(0, 2)}***${key.slice(-1)}`
  return `${key.slice(0, 4)}...${key.slice(-4)}`
}

export async function encryptProviderSecret(value: string, masterKey = process.env.LEARN_SECRET_KEY || process.env.AUTH_SECRET || "") {
  const iv = crypto.randomBytes(IV_BYTES)
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveEncryptionKey(masterKey), iv)
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`
}

export async function decryptProviderSecret(value: string, masterKey = process.env.LEARN_SECRET_KEY || process.env.AUTH_SECRET || "") {
  const [version, ivText, tagText, encryptedText] = value.split(".")
  if (version !== "v1" || !ivText || !tagText || !encryptedText) return ""
  const decipher = crypto.createDecipheriv("aes-256-gcm", deriveEncryptionKey(masterKey), Buffer.from(ivText, "base64url"))
  decipher.setAuthTag(Buffer.from(tagText, "base64url"))
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, "base64url")),
    decipher.final(),
  ]).toString("utf8")
}

export function normalizeProviderConfigInput(input: ProviderConfigInput): NormalizedProviderConfigInput {
  const metadata = getProviderMetadata(trim(input.provider)) || getProviderMetadata("cloudflare")
  if (!metadata) throw new Error("Choose a supported AI provider.")
  const defaults = safeProviderDefaults[metadata.provider]
  const requestedType = trim(input.providerType) as NormalizedProviderConfigInput["providerType"]
  const providerType = metadata.supportedTypes.includes(requestedType) ? requestedType : metadata.type

  return {
    name: trim(input.name) || metadata.label,
    provider: metadata.provider,
    providerType,
    accountEmail: trim(input.accountEmail),
    projectName: trim(input.projectName),
    apiKey: trim(input.apiKey),
    defaultModel: trim(input.defaultModel) || metadata.defaultModel,
    supportedModels: normalizeSupportedModels(input.supportedModels),
    endpointOverride: trim(input.endpointOverride) || metadata.endpoint,
    notes: trim(input.notes) || metadata.notes,
    enabled: input.enabled ?? true,
    priority: clamp(input.priority, defaults.priority, 1, 999),
    requestsPerMinute: clamp(input.requestsPerMinute, defaults.requestsPerMinute, 1, 120),
    maxInputChars: clamp(input.maxInputChars, defaults.maxInputChars, 200, 16_000),
    maxCompletionTokens: clamp(input.maxCompletionTokens, defaults.maxCompletionTokens, 128, 8192),
    timeoutMs: clamp(input.timeoutMs, defaults.timeoutMs, 3000, 60_000),
    cooldownSeconds: clamp(input.cooldownSeconds, defaults.cooldownSeconds, 5, 300),
  }
}

export function createProviderConfigDraftFromPreset(
  preset: AiProviderPreset,
  apiKey = "",
): ProviderConfigInput {
  return {
    name: preset.label,
    provider: preset.provider,
    providerType: preset.type,
    apiKey,
    defaultModel: preset.model,
    supportedModels: [preset.model],
    endpointOverride: preset.endpoint,
    notes: preset.notes,
    enabled: true,
    priority: preset.priority,
    requestsPerMinute: preset.requestsPerMinute,
    timeoutMs: preset.timeoutMs,
    cooldownSeconds: preset.cooldownSeconds,
  }
}

export function buildProviderAdminSummary(providers: SerializedProviderConfig[]): ProviderAdminSummary {
  let enabledCount = 0
  let readyCount = 0
  let hasDegradedProviders = false
  const enabledProviders: SerializedProviderConfig[] = []

  for (const provider of providers) {
    if (!provider.enabled) continue
    enabledCount += 1
    enabledProviders.push(provider)
    const ready = provider.has_key && provider.last_status !== "error"
    if (ready) readyCount += 1
    else hasDegradedProviders = true
  }

  const routingOrder = enabledProviders
    .sort((left, right) => left.priority - right.priority || left.name.localeCompare(right.name))
    .map((provider) => ({
      id: provider.id,
      name: provider.name,
      provider: provider.provider,
      providerType: provider.provider_type,
      priority: provider.priority,
      status: provider.last_status || "untested",
      secretLabel: provider.has_key ? "Stored" as const : "Missing" as const,
    }))

  return {
    totalCount: providers.length,
    enabledCount,
    readyCount,
    hasDegradedProviders,
    routingOrder,
  }
}
