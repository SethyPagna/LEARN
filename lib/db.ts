import { Pool, type PoolClient, type QueryResultRow } from "pg"

let pool: Pool | null = null

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL?.trim())
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

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
) {
  return getPool().query<T>(text, values)
}

export async function withClient<T>(callback: (client: PoolClient) => Promise<T>) {
  const client = await getPool().connect()
  try {
    return await callback(client)
  } finally {
    client.release()
  }
}
