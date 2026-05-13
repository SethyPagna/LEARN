import { hashSessionToken } from "./auth"
import { isDatabaseConfigured, query } from "./db"

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

export interface RateLimitResult {
  allowed: boolean
  limit: number
  remaining: number
  resetAt: number
}

export function getClientIp(headers: Headers) {
  return (
    headers.get("cf-connecting-ip")
    || headers.get("x-real-ip")
    || headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown"
  )
}

export async function checkRateLimit(input: {
  key: string
  limit: number
  windowMs: number
}): Promise<RateLimitResult> {
  const hashedKey = await hashSessionToken(input.key)
  const durable = await checkDurableRateLimit(hashedKey, input.limit, input.windowMs)
  if (durable) return durable

  return checkMemoryRateLimit(hashedKey, input.limit, input.windowMs)
}

async function checkDurableRateLimit(keyHash: string, limit: number, windowMs: number): Promise<RateLimitResult | null> {
  if (!(await isDatabaseConfigured())) return null
  const now = Date.now()
  const fallbackResetAt = new Date(now + windowMs).toISOString()

  try {
    const existing = await query<{ count: number; reset_at: string }>(
      "SELECT count, reset_at FROM rate_limit_buckets WHERE key_hash = $1 LIMIT 1",
      [keyHash],
    )
    const row = existing.rows[0]
    const resetAtMs = row ? new Date(row.reset_at).getTime() : 0
    const resetAt = Number.isFinite(resetAtMs) && resetAtMs > now ? row.reset_at : fallbackResetAt
    const nextCount = row && new Date(resetAt).getTime() > now ? Number(row.count || 0) + 1 : 1

    await query(
      `INSERT INTO rate_limit_buckets (key_hash, count, reset_at, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (key_hash) DO UPDATE
       SET count = EXCLUDED.count,
           reset_at = EXCLUDED.reset_at,
           updated_at = now()`,
      [keyHash, nextCount, resetAt],
    )

    const resetTime = new Date(resetAt).getTime()
    return {
      allowed: nextCount <= limit,
      limit,
      remaining: Math.max(0, limit - nextCount),
      resetAt: Number.isFinite(resetTime) ? resetTime : now + windowMs,
    }
  } catch {
    return null
  }
}

function checkMemoryRateLimit(keyHash: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  const current = buckets.get(keyHash)
  const bucket = !current || current.resetAt <= now
    ? { count: 0, resetAt: now + windowMs }
    : current

  bucket.count += 1
  buckets.set(keyHash, bucket)

  for (const [key, value] of buckets) {
    if (value.resetAt <= now) buckets.delete(key)
  }

  const remaining = Math.max(0, limit - bucket.count)
  return {
    allowed: bucket.count <= limit,
    limit,
    remaining,
    resetAt: bucket.resetAt,
  }
}
