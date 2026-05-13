export type D1DatabaseLike = {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      all<T = Record<string, unknown>>(): Promise<{ results?: T[]; meta?: { changes?: number } }>
      run(): Promise<{ meta?: { changes?: number } }>
      first<T = Record<string, unknown>>(): Promise<T | null>
    }
    all<T = Record<string, unknown>>(): Promise<{ results?: T[]; meta?: { changes?: number } }>
    run(): Promise<{ meta?: { changes?: number } }>
    first<T = Record<string, unknown>>(): Promise<T | null>
  }
  exec(sql: string): Promise<unknown>
}

export type R2BucketLike = {
  put(
    key: string,
    value: ReadableStream | ArrayBuffer | ArrayBufferView | string | null,
    options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> },
  ): Promise<unknown>
  get(key: string): Promise<{
    body: ReadableStream | null
    httpMetadata?: { contentType?: string }
    size?: number
    writeHttpMetadata(headers: Headers): void
  } | null>
  delete(key: string): Promise<void>
  head(key: string): Promise<{ size?: number; httpMetadata?: { contentType?: string } } | null>
  list(options?: { prefix?: string; limit?: number }): Promise<{ objects: { key: string; size: number }[] }>
}

export type DurableObjectNamespaceLike = {
  idFromName(name: string): unknown
  get(id: unknown): { fetch(request: Request): Promise<Response> }
}

export type WorkerServiceBindingLike = {
  fetch(request: Request): Promise<Response>
}

export type CloudflareBindings = {
  DB?: D1DatabaseLike
  LEARN_DB?: D1DatabaseLike
  LEARN_FILES?: R2BucketLike
  NEXT_INC_CACHE_R2_BUCKET?: R2BucketLike
  LEARN_REALTIME?: WorkerServiceBindingLike
  STUDY_ROOM_DO?: DurableObjectNamespaceLike
  STUDY_BATTLE_DO?: DurableObjectNamespaceLike
  PRESENCE_DO?: DurableObjectNamespaceLike
  APP_ID?: string
  APP_BASE_URL?: string
  AI_PROVIDER_DEFAULT?: string
  CLOUDFLARE_AI_GATEWAY_TOKEN?: string
  CLOUDFLARE_ACCOUNT_ID?: string
  CLOUDFLARE_API_TOKEN?: string
  CLOUDFLARE_D1_DATABASE_ID?: string
  CLOUDFLARE_D1_DATABASE_NAME?: string
  CLOUDFLARE_R2_BUCKET?: string
  CLOUDFLARE_NEXT_CACHE_BUCKET?: string
  CLOUDFLARE_R2_ACCESS_KEY_ID?: string
  CLOUDFLARE_R2_SECRET_ACCESS_KEY?: string
  CLOUDFLARE_AI_GATEWAY_ID?: string
  [key: string]: unknown
}

let bindingCache: CloudflareBindings | null | undefined

export async function getCloudflareBindings() {
  if (bindingCache !== undefined) return bindingCache

  try {
    const cloudflare = await import("@opennextjs/cloudflare")
    const context = await cloudflare.getCloudflareContext({ async: true })
    bindingCache = context.env as CloudflareBindings
  } catch {
    bindingCache = null
  }

  return bindingCache
}

export async function getD1Database() {
  const env = await getCloudflareBindings()
  return env?.LEARN_DB || env?.DB || null
}

export async function getR2Bucket() {
  const env = await getCloudflareBindings()
  return env?.LEARN_FILES || null
}
