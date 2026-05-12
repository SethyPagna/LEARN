import { Pool, type PoolClient, type QueryResultRow } from "pg"
import { getD1Database } from "./cloudflare"

let pool: Pool | null = null

export type DatabaseDialect = "d1" | "postgres"

export interface DatabaseClient {
  query<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<{
    rows: T[]
    rowCount: number
  }>
}

async function getD1Binding() {
  return getD1Database()
}

export async function getDatabaseDialect(): Promise<DatabaseDialect> {
  return (await getD1Binding()) ? "d1" : "postgres"
}

export async function isDatabaseConfigured() {
  return Boolean((await getD1Binding()) || process.env.DATABASE_URL?.trim())
}

export function getPool() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured")
  }

  if (!pool) {
    pool = new Pool({
      connectionString,
      max: Number(process.env.DATABASE_POOL_SIZE || 8),
      ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
    })
  }

  return pool
}

function normalizeD1Sql(text: string, values: unknown[]) {
  const orderedValues: unknown[] = []
  const sql = text
    .replace(/\$(\d+)/g, (_match, index: string) => {
      orderedValues.push(values[Number(index) - 1])
      return "?"
    })
    .replace(/::jsonb/g, "")
    .replace(/::int/g, "")
    .replace(/now\(\)/gi, "datetime('now')")
  return { sql, values: orderedValues }
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<{ rows: T[]; rowCount: number }> {
  const d1 = await getD1Binding()
  if (d1) {
    const normalized = normalizeD1Sql(text, values)
    const statement = d1.prepare(normalized.sql)
    const bound = normalized.values.length ? statement.bind(...normalized.values) : statement
    const result = await bound.all<T>()
    const rows = (result.results || []) as T[]
    return {
      rows,
      rowCount: result.meta?.changes ?? rows.length,
    }
  }

  const result = await getPool().query<T>(text, values)
  return {
    rows: result.rows,
    rowCount: result.rowCount ?? result.rows.length,
  }
}

export async function withClient<T>(callback: (client: PoolClient) => Promise<T>) {
  if (await getD1Binding()) {
    throw new Error("withClient is only available for the legacy Postgres fallback")
  }

  const client = await getPool().connect()
  try {
    return await callback(client)
  } finally {
    client.release()
  }
}

export async function exec(sql: string) {
  const d1 = await getD1Binding()
  if (d1) {
    await d1.exec(sql)
    return
  }

  await query(sql)
}
