import { hashSessionToken } from "./auth"

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
  const now = Date.now()
  const hashedKey = await hashSessionToken(input.key)
  const current = buckets.get(hashedKey)
  const bucket = !current || current.resetAt <= now
    ? { count: 0, resetAt: now + input.windowMs }
    : current

  bucket.count += 1
  buckets.set(hashedKey, bucket)

  for (const [key, value] of buckets) {
    if (value.resetAt <= now) buckets.delete(key)
  }

  const remaining = Math.max(0, input.limit - bucket.count)
  return {
    allowed: bucket.count <= input.limit,
    limit: input.limit,
    remaining,
    resetAt: bucket.resetAt,
  }
}
