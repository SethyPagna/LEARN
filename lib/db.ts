import { getD1Database } from "./cloudflare"

export type QueryResultRow = Record<string, unknown>
export type CloudflareRuntimeMode = "cloudflare-binding" | "cloudflare-api" | "vercel" | "docker" | "local"

export interface DatabaseClient {
  query<T = QueryResultRow>(text: string, values?: unknown[]): Promise<{
    rows: T[]
    rowCount: number
  }>
}

interface RuntimeEnv {
  [key: string]: string | undefined
}

interface D1ApiConfig {
  accountId: string
  apiToken?: string
  apiEmail?: string
  globalApiKey?: string
  databaseId: string
}

type D1ApiResponse<T> = {
  success?: boolean
  errors?: { message?: string }[]
  result?: Array<{
    success?: boolean
    results?: T[]
    meta?: { changes?: number }
    error?: string
  }>
}

function getProcessEnv(): RuntimeEnv {
  return typeof process === "undefined" ? {} : process.env
}

async function getMergedEnv(): Promise<RuntimeEnv> {
  const bindings = await import("./cloudflare").then((module) => module.getCloudflareBindings())
  const bindingEnv = bindings ? Object.fromEntries(
    Object.entries(bindings).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  ) : {}
  return { ...getProcessEnv(), ...bindingEnv }
}

export function normalizeD1Sql(text: string, values: unknown[] = []) {
  const orderedValues: unknown[] = []
  const sql = text
    .replace(/\$(\d+)/g, (_match, index: string) => {
      orderedValues.push(values[Number(index) - 1])
      return "?"
    })
    .replace(/::jsonb/g, "")
    .replace(/::int/g, "")
    .replace(/::timestamptz/g, "")
    .replace(/::date/g, "")
    .replace(/now\(\)/gi, "datetime('now')")
  return { sql, values: orderedValues.length ? orderedValues : values }
}

export function getD1ApiConfig(env: RuntimeEnv = getProcessEnv()): D1ApiConfig | null {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim()
  const apiToken = env.CLOUDFLARE_API_TOKEN?.trim()
  const apiEmail = env.CLOUDFLARE_EMAIL?.trim()
  const globalApiKey = (env.CLOUDFLARE_GLOBAL_API_KEY || env.CLOUDFLARE_API_KEY)?.trim()
  const databaseId = env.CLOUDFLARE_D1_DATABASE_ID?.trim()
  if (!accountId || !databaseId || (!apiToken && (!apiEmail || !globalApiKey))) return null
  return apiToken
    ? { accountId, apiToken, databaseId }
    : { accountId, apiEmail, globalApiKey, databaseId }
}

export function getCloudflareRuntimeMode(input: {
  env?: RuntimeEnv
  hasD1Binding?: boolean
} = {}): CloudflareRuntimeMode {
  if (input.hasD1Binding) return "cloudflare-binding"
  if (getD1ApiConfig(input.env || getProcessEnv())) {
    if ((input.env || getProcessEnv()).VERCEL) return "vercel"
    if ((input.env || getProcessEnv()).DOCKER_ENV === "true") return "docker"
    return "cloudflare-api"
  }
  return "local"
}

export function isD1ReadStatement(sql: string) {
  const firstWord = sql.trim().split(/\s+/, 1)[0]?.toLowerCase()
  return firstWord === "select" || firstWord === "with" || firstWord === "pragma"
}

export async function getDatabaseRuntimeMode(): Promise<CloudflareRuntimeMode> {
  return getCloudflareRuntimeMode({
    env: await getMergedEnv(),
    hasD1Binding: Boolean(await getD1Database()),
  })
}

export async function getDatabaseDialect() {
  return "d1" as const
}

export async function isDatabaseConfigured() {
  return Boolean((await getD1Database()) || getD1ApiConfig(await getMergedEnv()))
}

async function queryD1Binding<T>(text: string, values: unknown[]) {
  const d1 = await getD1Database()
  if (!d1) return null

  const normalized = normalizeD1Sql(text, values)
  const statement = d1.prepare(normalized.sql)
  const bound = normalized.values.length ? statement.bind(...normalized.values) : statement
  if (!isD1ReadStatement(normalized.sql)) {
    const result = await bound.run()
    return {
      rows: [] as T[],
      rowCount: result.meta?.changes ?? 0,
    }
  }

  const result = await bound.all<T>()
  const rows = (result.results || []) as T[]
  return {
    rows,
    rowCount: result.meta?.changes ?? rows.length,
  }
}

function d1ApiUrl(config: D1ApiConfig) {
  return `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/d1/database/${config.databaseId}/query`
}

async function queryD1Api<T>(text: string, values: unknown[]) {
  const config = getD1ApiConfig(await getMergedEnv())
  if (!config) {
    throw new Error("Cloudflare D1 is not configured. Set LEARN_DB binding or Cloudflare D1 API credentials.")
  }

  const normalized = normalizeD1Sql(text, values)
  const response = await fetch(d1ApiUrl(config), {
    method: "POST",
    headers: {
      ...(config.apiToken
        ? { authorization: `Bearer ${config.apiToken}` }
        : { "x-auth-email": String(config.apiEmail), "x-auth-key": String(config.globalApiKey) }),
      "content-type": "application/json",
    },
    body: JSON.stringify({ sql: normalized.sql, params: normalized.values }),
  })
  const json = await response.json().catch(() => ({})) as D1ApiResponse<T>
  if (!response.ok || json.success === false) {
    const message = json.errors?.map((error) => error.message).filter(Boolean).join("; ") || "Cloudflare D1 API query failed."
    throw new Error(message)
  }

  const result = Array.isArray(json.result) ? json.result[0] : null
  if (result?.success === false) throw new Error(result.error || "Cloudflare D1 API statement failed.")
  const rows = (result?.results || []) as T[]
  return {
    rows,
    rowCount: result?.meta?.changes ?? rows.length,
  }
}

export async function query<T = QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<{ rows: T[]; rowCount: number }> {
  return (await queryD1Binding<T>(text, values)) || queryD1Api<T>(text, values)
}

function splitSqlStatements(sql: string) {
  return sql
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean)
}

export async function exec(sql: string) {
  for (const statement of splitSqlStatements(sql)) {
    await query(statement)
  }
}
