import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"

interface AiProviderSeed {
  accountEmail?: string
  apiKey?: string
  cooldownSeconds?: number
  defaultModel?: string
  endpoint?: string
  id?: string
  maxCompletionTokens?: number
  maxInputChars?: number
  name?: string
  notes?: string
  priority?: number
  projectName?: string
  provider?: string
  providerType?: string
  requestsPerMinute?: number
  supportedModels?: string[]
  timeoutMs?: number
}

interface D1QueryResponse {
  errors?: Array<{ message?: string }>
  success?: boolean
}

const root = process.cwd()
const localEnv = readEnvFile(path.join(root, ".env.local"))
const env = { ...localEnv, ...process.env }

const accountId = env.CLOUDFLARE_ACCOUNT_ID
const apiToken = env.CLOUDFLARE_API_TOKEN
const databaseId = env.CLOUDFLARE_D1_DATABASE_ID || "3eeb04af-c283-48c0-9469-82b64392fa79"
const masterKey = env.LEARN_SECRET_KEY || env.AUTH_SECRET
const seeds = JSON.parse(env.AI_PROVIDER_SEED_JSON || "[]") as AiProviderSeed[]

if (!accountId || !apiToken || !databaseId || !masterKey) {
  throw new Error("Missing CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, CLOUDFLARE_D1_DATABASE_ID, or LEARN_SECRET_KEY/AUTH_SECRET.")
}
const requiredMasterKey = masterKey

if (!Array.isArray(seeds) || !seeds.length) {
  throw new Error("AI_PROVIDER_SEED_JSON must be a non-empty array.")
}

const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`

void main()

async function main() {
  let seeded = 0

  for (const seed of seeds) {
    if (!seed.id || !seed.name || !seed.provider || !seed.apiKey) continue
    await d1Query(
      `INSERT INTO ai_provider_configs (
         id, name, provider, env_key, default_model, enabled, provider_type, account_email, project_name,
         api_key_encrypted, supported_models_json, endpoint_override, notes, priority, requests_per_minute,
         max_input_chars, max_completion_tokens, timeout_ms, cooldown_seconds, last_status, last_error, updated_at
       )
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'seeded', '', datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         provider = excluded.provider,
         env_key = excluded.env_key,
         default_model = excluded.default_model,
         enabled = 1,
         provider_type = excluded.provider_type,
         account_email = excluded.account_email,
         project_name = excluded.project_name,
         api_key_encrypted = excluded.api_key_encrypted,
         supported_models_json = excluded.supported_models_json,
         endpoint_override = excluded.endpoint_override,
         notes = excluded.notes,
         priority = excluded.priority,
         requests_per_minute = excluded.requests_per_minute,
         max_input_chars = excluded.max_input_chars,
         max_completion_tokens = excluded.max_completion_tokens,
         timeout_ms = excluded.timeout_ms,
         cooldown_seconds = excluded.cooldown_seconds,
         last_status = 'seeded',
         last_error = '',
         updated_at = datetime('now')`,
      [
        seed.id,
        seed.name,
        seed.provider,
        `${String(seed.provider).toUpperCase()}_API_KEY`,
        seed.defaultModel,
        seed.providerType || "chat",
        seed.accountEmail || "",
        seed.projectName || "",
        encrypt(String(seed.apiKey), requiredMasterKey),
        JSON.stringify(seed.supportedModels || [seed.defaultModel].filter(Boolean)),
        seed.endpoint,
        seed.notes || "",
        seed.priority || 50,
        seed.requestsPerMinute || 10,
        seed.maxInputChars || 1200,
        seed.maxCompletionTokens || 1800,
        seed.timeoutMs || 18_000,
        seed.cooldownSeconds || 20,
      ],
    )
    seeded += 1
  }

  console.log(JSON.stringify({ seeded }))
}

function readEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {}
  return Object.fromEntries(
    fs.readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=")
        return [line.slice(0, index), line.slice(index + 1)]
      }),
  )
}

function encrypt(value: string, key: string) {
  const iv = crypto.randomBytes(12)
  const derived = crypto.createHash("sha256").update(key || "learn-local-development-key").digest().subarray(0, 32)
  const cipher = crypto.createCipheriv("aes-256-gcm", derived, iv)
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`
}

async function d1Query(sql: string, params: unknown[]) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ sql, params }),
  })
  const json = await response.json().catch(() => ({})) as D1QueryResponse
  if (!response.ok || !json.success) {
    throw new Error(json.errors?.[0]?.message || "D1 query failed.")
  }
  return json
}
