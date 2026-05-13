import crypto from "node:crypto"
import { getProviderMetadata, type AiProviderKey } from "./providers"

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

const safeProviderDefaults: Record<AiProviderKey, Pick<NormalizedProviderConfigInput,
  "priority" | "requestsPerMinute" | "maxInputChars" | "maxCompletionTokens" | "timeoutMs" | "cooldownSeconds"
>> = {
  groq: { priority: 10, requestsPerMinute: 18, maxInputChars: 1200, maxCompletionTokens: 1800, timeoutMs: 18_000, cooldownSeconds: 20 },
  google: { priority: 20, requestsPerMinute: 14, maxInputChars: 1200, maxCompletionTokens: 1600, timeoutMs: 17_000, cooldownSeconds: 20 },
  mistral: { priority: 30, requestsPerMinute: 10, maxInputChars: 1100, maxCompletionTokens: 1400, timeoutMs: 18_000, cooldownSeconds: 25 },
  cerebras: { priority: 40, requestsPerMinute: 12, maxInputChars: 900, maxCompletionTokens: 1200, timeoutMs: 14_000, cooldownSeconds: 25 },
  cloudflare: { priority: 50, requestsPerMinute: 18, maxInputChars: 1400, maxCompletionTokens: 1800, timeoutMs: 18_000, cooldownSeconds: 20 },
  vercel: { priority: 60, requestsPerMinute: 12, maxInputChars: 1400, maxCompletionTokens: 1800, timeoutMs: 20_000, cooldownSeconds: 20 },
  cohere: { priority: 90, requestsPerMinute: 20, maxInputChars: 1000, maxCompletionTokens: 128, timeoutMs: 12_000, cooldownSeconds: 20 },
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
  const providerType = (trim(input.providerType) || metadata.type) as NormalizedProviderConfigInput["providerType"]

  return {
    name: trim(input.name) || metadata.label,
    provider: metadata.provider,
    providerType,
    accountEmail: trim(input.accountEmail),
    projectName: trim(input.projectName),
    apiKey: trim(input.apiKey),
    defaultModel: trim(input.defaultModel) || metadata.defaultModel,
    supportedModels: normalizeSupportedModels(input.supportedModels),
    endpointOverride: trim(input.endpointOverride),
    notes: trim(input.notes),
    enabled: input.enabled ?? true,
    priority: clamp(input.priority, defaults.priority, 1, 999),
    requestsPerMinute: clamp(input.requestsPerMinute, defaults.requestsPerMinute, 1, 120),
    maxInputChars: clamp(input.maxInputChars, defaults.maxInputChars, 200, 16_000),
    maxCompletionTokens: clamp(input.maxCompletionTokens, defaults.maxCompletionTokens, 128, 8192),
    timeoutMs: clamp(input.timeoutMs, defaults.timeoutMs, 3000, 60_000),
    cooldownSeconds: clamp(input.cooldownSeconds, defaults.cooldownSeconds, 5, 300),
  }
}
