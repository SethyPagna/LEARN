/**
 * Route-handler test harness.
 *
 * The 49 handlers under `src/app/api` had zero coverage because there was no
 * way to run one: every handler reaches `lib/data.ts`, which reaches
 * `lib/db.ts`, which needs a Cloudflare D1 binding or D1 API credentials.
 *
 * This harness supplies the credentials and then intercepts `globalThis.fetch`
 * at the D1 HTTP boundary. That boundary is the narrowest seam available and
 * it requires no production change at all — the real `query()`, the real
 * `normalizeD1Sql()`, the real statement routing and response parsing all run
 * unmodified. Only the network is fake.
 *
 * What the harness gives a test:
 *   - `statements`  every SQL statement the handler issued, with its params
 *   - `on(pattern)` a canned response for statements matching a regexp
 *   - `request()`   an authenticated `NextRequest` with a session cookie
 *
 * What it deliberately does NOT do: mock `lib/data.ts`. If a test needs a
 * module mocked, the seam is in the wrong place.
 */

import { NextRequest } from "next/server"

export interface RecordedStatement {
  sql: string
  params: unknown[]
}

export interface CannedResult {
  rows?: unknown[]
  rowCount?: number
}

interface Responder {
  pattern: RegExp
  respond: (sql: string, params: unknown[]) => CannedResult
}

export interface DatabaseStub {
  /** Every statement the D1 API was asked to run, in order. */
  readonly statements: RecordedStatement[]
  /** SQL text only, for readable assertions. */
  readonly sqlLog: string[]
  /** Every non-database outbound request (provider calls, uploads, …). */
  readonly httpRequests: { url: string; init?: RequestInit }[]
  /** Register a canned response for every statement whose SQL matches. */
  on(pattern: RegExp, respond: CannedResult | ((sql: string, params: unknown[]) => CannedResult)): void
  /** Register a canned response for a non-database outbound request. */
  onHttp(pattern: RegExp, handler: (url: string, init?: RequestInit) => Response | Promise<Response>): void
  /** Statements whose SQL matches the pattern. */
  matching(pattern: RegExp): RecordedStatement[]
  /** Statements whose SQL matches the pattern and that were not reads. */
  writesMatching(pattern: RegExp): RecordedStatement[]
  reset(): void
  restore(): void
}

const D1_ENV_KEYS = ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_D1_DATABASE_ID", "CLOUDFLARE_API_TOKEN"] as const

/**
 * Must match the D1 query endpoint *specifically*.
 *
 * An earlier version of this file keyed on `api.cloudflare.com` +
 * `/client/v4/accounts/`, which also matches Workers AI
 * (`/accounts/{id}/ai/run/{model}`) — so every provider call was silently
 * swallowed as a database query and came back as an empty row set. The path
 * below is the only thing that distinguishes them.
 */
const D1_URL_PATTERN = /\/d1\/database\/[^/]+\/query$/

function d1ApiResponse(result: CannedResult, isRead: boolean) {
  const rows = result.rows ?? []
  const changes = result.rowCount ?? (isRead ? rows.length : 0)
  return {
    success: true,
    errors: [],
    result: [{ success: true, results: rows, meta: { changes } }],
  }
}

function isReadStatement(sql: string) {
  const firstWord = sql.trim().split(/\s+/, 1)[0]?.toLowerCase()
  return firstWord === "select" || firstWord === "with" || firstWord === "pragma"
}

export function installDatabaseStub(): DatabaseStub {
  const statements: RecordedStatement[] = []
  const responders: Responder[] = []
  const httpStubs: { pattern: RegExp; handler: (url: string, init?: RequestInit) => Response | Promise<Response> }[] = []
  const httpRequests: { url: string; init?: RequestInit }[] = []
  const savedEnv = new Map<string, string | undefined>()
  const originalFetch = globalThis.fetch

  for (const key of D1_ENV_KEYS) {
    savedEnv.set(key, process.env[key])
    process.env[key] = key === "CLOUDFLARE_D1_DATABASE_ID" ? "learn-test-db" : `learn-test-${key.toLowerCase()}`
  }

  const stub: DatabaseStub = {
    statements,
    httpRequests,
    get sqlLog() {
      return statements.map((statement) => statement.sql)
    },
    on(pattern, respond) {
      responders.unshift({
        pattern,
        respond: typeof respond === "function" ? respond : () => respond,
      })
    },
    onHttp(pattern, handler) {
      httpStubs.unshift({ pattern, handler })
    },
    matching(pattern) {
      return statements.filter((statement) => pattern.test(statement.sql))
    },
    writesMatching(pattern) {
      return statements.filter(
        (statement) => pattern.test(statement.sql) && !isReadStatement(statement.sql),
      )
    },
    reset() {
      statements.length = 0
      responders.length = 0
      httpRequests.length = 0
    },
    restore() {
      globalThis.fetch = originalFetch
      for (const [key, value] of savedEnv) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    },
  }

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url

    if (D1_URL_PATTERN.test(url)) {
      const body = JSON.parse(String(init?.body ?? "{}")) as { sql?: string; params?: unknown[] }
      const sql = String(body.sql ?? "")
      const params = body.params ?? []
      statements.push({ sql, params })

      const isRead = isReadStatement(sql)
      let canned: CannedResult = { rows: [], rowCount: 0 }
      for (const responder of responders) {
        if (responder.pattern.test(sql)) {
          canned = responder.respond(sql, params)
          break
        }
      }

      return new Response(JSON.stringify(d1ApiResponse(canned, isRead)), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }

    httpRequests.push({ url, init })
    for (const httpStub of httpStubs) {
      if (httpStub.pattern.test(url)) return httpStub.handler(url, init)
    }

    throw new Error(
      `Route test made an unexpected network call to ${url}. ` +
        "Every outbound call in a handler test must be stubbed explicitly.",
    )
  }) as typeof fetch

  return stub
}

/**
 * The user row every stubbed session lookup returns. `session_last_seen_at` is
 * deliberately recent so `getCurrentUserFromToken` skips its throttled
 * `UPDATE` and the statement log stays about the handler, not about auth.
 */
export const TEST_USER_ROW = {
  id: "user_test",
  username: "test_learner",
  email: "test@learn.local",
  name: "Test Learner",
  avatar_url: "",
  bio: "",
  profile_visibility: "private",
  role: "learner",
  preferences: "{}",
  streak_current: 3,
  streak_longest: 9,
  streak_freezes_available: 1,
  xp_total: 420,
  session_last_seen_at: new Date().toISOString().replace("T", " ").slice(0, 19),
}

export const TEST_SESSION_TOKEN = "test-session-token"

/** Teach the stub to resolve the session cookie to `TEST_USER_ROW`. */
export function stubSessionLookup(stub: DatabaseStub) {
  stub.on(/FROM user_sessions/, { rows: [TEST_USER_ROW] })
}

/**
 * Run the one-time starter-data seed, then clear the statement log.
 *
 * `ensureDatabase()` seeds demo notes, quizzes and workspaces the first time it
 * is called in a process. Without this, whichever test happens to run first
 * sees the seed statements mixed in with the handler's own, and assertions on
 * statement counts become order-dependent. Priming first makes every test
 * measure exactly the handler under test.
 */
export async function primeDatabase(stub: DatabaseStub) {
  const { ensureDatabase } = await import("../../lib/schema")
  await ensureDatabase()
  stub.reset()
}

/**
 * A stateful fake of `rate_limit_buckets`.
 *
 * The durable rate limiter is a read-modify-write pair against the database:
 * it SELECTs the current count, then INSERTs count+1. A stateless fake always
 * answers "no row", so the counter is recomputed as 1 on every call and the
 * limiter never trips — the test would then assert that rate limiting works
 * while proving the opposite.
 *
 * Any test that expects a 429 needs this, or it is testing a fake that cannot
 * fail.
 */
export function installRateLimitStore(stub: DatabaseStub) {
  const buckets = new Map<string, { count: number; reset_at: string }>()

  stub.on(/INSERT INTO rate_limit_buckets/, (_sql, params) => {
    buckets.set(String(params[0]), { count: Number(params[1]), reset_at: String(params[2]) })
    return { rowCount: 1 }
  })

  stub.on(/FROM rate_limit_buckets/, (_sql, params) => {
    const row = buckets.get(String(params[0]))
    return { rows: row ? [row] : [] }
  })

  return buckets
}

export interface RequestOptions {
  method?: string
  body?: unknown
  /** Raw request body for non-JSON routes (audio uploads, file posts). */
  rawBody?: Uint8Array | string
  /** Content type for `rawBody`; defaults to `application/octet-stream`. */
  contentType?: string
  /**
   * Multipart body for upload routes. Passed through as-is so the runtime sets
   * its own `content-type` (with the boundary it generated); overriding it here
   * would produce a body the route cannot parse.
   */
  form?: FormData
  token?: string | null
  headers?: Record<string, string>
}

/**
 * An authenticated request aimed at a handler. Defaults to same-origin so the
 * CSRF check in `requireApiUser` passes; pass an `origin` header to test it
 * failing.
 */
export function request(path: string, options: RequestOptions = {}) {
  const method = options.method ?? "GET"
  const headers = new Headers(options.headers)
  headers.set("host", "learn.local")
  if (!headers.has("origin")) headers.set("origin", "https://learn.local")

  const token = options.token === undefined ? TEST_SESSION_TOKEN : options.token
  if (token) headers.set("cookie", `learn_session=${token}`)

  let body: BodyInit | undefined
  if (options.rawBody !== undefined) {
    headers.set("content-type", options.contentType ?? "application/octet-stream")
    body = options.rawBody as BodyInit
  } else if (options.form !== undefined) {
    body = options.form
  } else if (options.body !== undefined) {
    headers.set("content-type", "application/json")
    body = JSON.stringify(options.body)
  }

  return new NextRequest(`https://learn.local${path}`, { method, headers, body })
}

/** Read a JSON response body with a typed-ish shape. */
export async function readJson<T = Record<string, unknown>>(response: Response): Promise<T> {
  return (await response.json()) as T
}
