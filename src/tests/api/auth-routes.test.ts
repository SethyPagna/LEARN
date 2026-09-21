/**
 * The auth routes.
 *
 * `auth/login` is the highest blast radius handler in the app: it is the only
 * unauthenticated route that mints a session, and it is one of four routes
 * deliberately exempt from the CSRF guard. Before this file it had never been
 * executed by a test.
 *
 * These tests are written as security assertions rather than happy-path
 * descriptions. The questions they answer:
 *   - can an attacker distinguish "no such user" from "wrong password"?
 *   - is the raw session token ever persisted, or only its hash?
 *   - does the rate limiter actually stop a password-spraying loop?
 *   - is the session cookie set with the attributes that make XSS theft hard?
 */

import assert from "node:assert/strict"
import test from "node:test"

import { installDatabaseStub, installRateLimitStore, primeDatabase, readJson, request, type DatabaseStub } from "./harness"
import { hashPassword } from "../../lib/auth"

const PASSWORD = "Correct-Horse-Battery-9"
const USER_ROW = {
  id: "user_alice",
  username: "alice",
  email: "alice@learn.local",
  name: "Alice",
  avatar_url: "",
  bio: "",
  profile_visibility: "private",
  role: "learner",
  preferences: "{}",
  streak_current: 4,
  streak_longest: 12,
  streak_freezes_available: 1,
  xp_total: 900,
}

// 100k PBKDF2 iterations is too slow to redo per test, and the value is
// deterministic, so it is computed once and shared.
let passwordHash: Promise<string> | null = null
function storedPasswordHash() {
  passwordHash ??= hashPassword(PASSWORD)
  return passwordHash
}

function withEnv<T>(overrides: Record<string, string | undefined>, run: () => Promise<T>): Promise<T> {
  const keys = Object.keys(overrides)
  const saved = new Map(keys.map((key) => [key, process.env[key]]))
  for (const key of keys) {
    const next = overrides[key]
    if (next === undefined) delete process.env[key]
    else process.env[key] = next
  }
  return run().finally(() => {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
}

/** Serve the credential lookup that `authenticateUser` performs. */
function stubCredentialLookup(stub: DatabaseStub, row: Record<string, unknown> | null) {
  stub.on(/FROM users\s+WHERE lower\(username\)/, { rows: row ? [row] : [] })
}

async function knownUserRow() {
  return { ...USER_ROW, password_hash: await storedPasswordHash() }
}

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------

test("login returns 503 when the database is not configured", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    await withEnv(
      { CLOUDFLARE_ACCOUNT_ID: undefined, CLOUDFLARE_API_TOKEN: undefined, CLOUDFLARE_D1_DATABASE_ID: undefined },
      async () => {
        const { POST } = await import("../../app/api/auth/login/route")
        const response = await POST(
          request("/api/auth/login", {
            method: "POST",
            body: { identifier: "alice", password: PASSWORD },
            token: null,
          }),
        )
        assert.equal(response.status, 503)
      },
    )
  } finally {
    stub.restore()
  }
})

test("login rejects a missing identifier or password with 400", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    const { POST } = await import("../../app/api/auth/login/route")

    for (const body of [{}, { identifier: "alice" }, { password: PASSWORD }, { identifier: "  ", password: "  " }]) {
      const response = await POST(request("/api/auth/login", { method: "POST", body, token: null }))
      assert.equal(response.status, 400, `expected 400 for ${JSON.stringify(body)}`)
    }
    assert.equal(stub.matching(/INSERT INTO user_sessions/).length, 0)
  } finally {
    stub.restore()
  }
})

test("an unknown user and a wrong password are indistinguishable", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)

    // Unknown user: the credential lookup returns nothing.
    stubCredentialLookup(stub, null)
    const { POST } = await import("../../app/api/auth/login/route")
    const unknown = await POST(
      request("/api/auth/login", { method: "POST", body: { identifier: "nobody", password: PASSWORD }, token: null }),
    )

    // Known user, wrong password.
    stub.reset()
    stubCredentialLookup(stub, await knownUserRow())
    const wrong = await POST(
      request("/api/auth/login", { method: "POST", body: { identifier: "alice", password: "wrong-password" }, token: null }),
    )

    assert.equal(unknown.status, 401)
    assert.equal(wrong.status, 401)
    const unknownBody = await readJson<{ error: string }>(unknown)
    const wrongBody = await readJson<{ error: string }>(wrong)

    // Byte-identical responses. Anything else leaks whether an account exists.
    assert.equal(unknownBody.error, wrongBody.error)
    assert.match(unknownBody.error, /invalid username or password/i)
    assert.equal(stub.matching(/INSERT INTO user_sessions/).length, 0)
  } finally {
    stub.restore()
  }
})

test("an over-long password is rejected without touching the credential lookup", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    const { POST } = await import("../../app/api/auth/login/route")

    const response = await POST(
      request("/api/auth/login", {
        method: "POST",
        body: { identifier: "alice", password: "x".repeat(2000) },
        token: null,
      }),
    )

    assert.equal(response.status, 401)
    assert.equal(stub.matching(/FROM users/).length, 0, "no hashing work should be done for an impossible password")
  } finally {
    stub.restore()
  }
})

test("a valid login sets a hardened cookie and stores only a hash of the token", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubCredentialLookup(stub, await knownUserRow())

    const { POST } = await import("../../app/api/auth/login/route")
    const response = await POST(
      request("/api/auth/login", {
        method: "POST",
        body: { identifier: "alice@learn.local", password: PASSWORD },
        token: null,
      }),
    )

    assert.equal(response.status, 200)
    const body = await readJson<{ user: { id: string; username: string } }>(response)
    assert.equal(body.user.id, USER_ROW.id)
    assert.equal(body.user.username, "alice")

    const cookie = response.headers.get("set-cookie") || ""
    assert.match(cookie, /learn_session=/)
    assert.match(cookie, /HttpOnly/i, "the session cookie must not be readable by JavaScript")
    assert.match(cookie, /SameSite=lax/i)
    assert.match(cookie, /Path=\//i)

    const issuedToken = cookie.match(/learn_session=([^;]+)/)?.[1] || ""
    assert.ok(issuedToken.length > 20)

    const sessionInsert = stub.matching(/INSERT INTO user_sessions/)
    assert.equal(sessionInsert.length, 1)
    const storedHash = String(sessionInsert[0].params[2])

    assert.notEqual(storedHash, issuedToken, "the raw token must never be persisted")
    assert.match(storedHash, /^[0-9a-f]{64}$/, "the stored value must be a SHA-256 hex digest")

    // 14-day session, not a long-lived one.
    const expiresAt = new Date(String(sessionInsert[0].params[3])).getTime()
    const daysOut = (expiresAt - Date.now()) / (1000 * 60 * 60 * 24)
    assert.ok(daysOut > 13.9 && daysOut < 14.1, `expected a ~14 day session, got ${daysOut}`)

    const audit = stub.matching(/INSERT INTO audit_logs/)
    assert.equal(audit.length, 1)
    assert.equal(audit[0].params[2], "login")
    assert.equal(audit[0].params[1], USER_ROW.id)
  } finally {
    stub.restore()
  }
})

test("the login rate limiter stops a spraying loop", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubCredentialLookup(stub, null)
    // Without a stateful bucket store the limiter's read-modify-write never
    // increments and this test would pass vacuously.
    const buckets = installRateLimitStore(stub)
    const { POST } = await import("../../app/api/auth/login/route")

    // Keyed on ip + identifier, so a fresh identifier gets a fresh budget.
    const attempt = () =>
      POST(
        request("/api/auth/login", {
          method: "POST",
          body: { identifier: "spray-target@learn.local", password: "guess" },
          token: null,
        }),
      )

    const statuses: number[] = []
    for (let index = 0; index < 9; index += 1) statuses.push((await attempt()).status)

    assert.deepEqual(statuses.slice(0, 8), Array(8).fill(401), "the first 8 attempts are ordinary failures")
    assert.equal(statuses[8], 429, "the 9th must be refused by the limiter")
    assert.equal(buckets.size, 1, "one bucket, keyed on the hashed ip+identifier")

    const limited = await attempt()
    assert.equal(limited.status, 429)
    assert.ok(Number(limited.headers.get("retry-after")) > 0, "a 429 must tell the client when to retry")

    // The bucket key is a digest, so raw identifiers never land in the table.
    const [keyHash] = [...buckets.keys()]
    assert.match(keyHash, /^[0-9a-f]{64}$/)
    assert.ok(!keyHash.includes("spray-target"), "the identifier must not be recoverable from the bucket key")

    // Once the count reaches the limit the bucket is pinned rather than
    // incremented: the answer cannot change until the window resets, so an
    // abusive client must not be able to force a database write per request.
    const countAfterTripping = buckets.get(keyHash)?.count
    assert.equal(countAfterTripping, 8, "the bucket stops at the limit")
    for (let index = 0; index < 4; index += 1) await attempt()
    assert.equal(buckets.get(keyHash)?.count, 8, "blocked requests must not keep writing")
    assert.equal(stub.matching(/INSERT INTO rate_limit_buckets/).length, 8, "exactly one write per admitted attempt")
  } finally {
    stub.restore()
  }
})

test("the durable rate limiter costs two D1 round trips on every request it guards", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stubCredentialLookup(stub, null)
    installRateLimitStore(stub)
    const { POST } = await import("../../app/api/auth/login/route")

    await POST(
      request("/api/auth/login", {
        method: "POST",
        body: { identifier: "cost-probe@learn.local", password: "guess" },
        token: null,
      }),
    )

    // `checkDurableRateLimit` is a read-modify-write: one SELECT, one INSERT.
    // D1 serialises a database's queries, so this is on the request's critical
    // path, and it is paid by every rate-limited route (login, signup, ai/chat,
    // ai/transcribe). Pinned here so the cost is visible rather than implicit —
    // if it is ever reduced, this test should be updated deliberately.
    const bucketReads = stub.matching(/FROM rate_limit_buckets/)
    const bucketWrites = stub.matching(/INSERT INTO rate_limit_buckets/)
    assert.equal(bucketReads.length, 1)
    assert.equal(bucketWrites.length, 1)

    const total = stub.statements.length
    const limiterCost = bucketReads.length + bucketWrites.length
    assert.equal(limiterCost, 2)

    // A failed login issues exactly three statements: two of them are the rate
    // limiter, one is the credential lookup. Two thirds of the database work on
    // an unauthenticated request goes to the limiter, and D1 runs a database's
    // queries strictly one at a time — so this is serialised latency on the
    // path an attacker can hit hardest. Recorded rather than silently accepted.
    assert.equal(total, 3)
    assert.ok(limiterCost / total > 0.6, "the limiter is the dominant cost of a rejected login")
  } finally {
    stub.restore()
  }
})

// ---------------------------------------------------------------------------
// POST /api/auth/logout
// ---------------------------------------------------------------------------
test("logout revokes the session by token hash and clears the cookie", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)

    const { POST } = await import("../../app/api/auth/logout/route")
    const response = await POST(request("/api/auth/logout", { method: "POST", body: {} }))

    assert.equal(response.status, 200)

    const deletion = stub.matching(/DELETE FROM user_sessions/)
    assert.equal(deletion.length, 1)
    assert.equal(deletion[0].params.length, 1)
    // Revocation looks the session up by hash — the raw cookie never reaches SQL.
    assert.match(String(deletion[0].params[0]), /^[0-9a-f]{64}$/)

    const cookie = response.headers.get("set-cookie") || ""
    assert.match(cookie, /learn_session=/)
    assert.match(cookie, /Max-Age=0|Expires=Thu, 01 Jan 1970/i, "the cookie must be cleared")
  } finally {
    stub.restore()
  }
})

test("logout without a session is a harmless no-op", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    const { POST } = await import("../../app/api/auth/logout/route")
    const response = await POST(request("/api/auth/logout", { method: "POST", body: {}, token: null }))

    assert.equal(response.status, 200)
    assert.equal(stub.matching(/DELETE FROM user_sessions/).length, 0)
  } finally {
    stub.restore()
  }
})

// ---------------------------------------------------------------------------
// POST /api/auth/signup-request
// ---------------------------------------------------------------------------

test("an access request is validated before it is written", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    const { POST } = await import("../../app/api/auth/signup-request/route")

    const cases: [Record<string, unknown>, RegExp][] = [
      [{ email: "a@b.com", goal: "I want to learn calculus properly" }, /name/i],
      [{ name: "Alice", goal: "I want to learn calculus properly" }, /valid email/i],
      [{ name: "Alice", email: "not-an-email", goal: "I want to learn calculus properly" }, /valid email/i],
      [{ name: "Alice", email: "a@b.com", goal: "too short" }, /what you want to learn/i],
    ]

    for (const [body, expected] of cases) {
      const response = await POST(request("/api/auth/signup-request", { method: "POST", body, token: null }))
      assert.equal(response.status, 400, `expected 400 for ${JSON.stringify(body)}`)
      const payload = await readJson<{ error: string }>(response)
      assert.match(payload.error, expected)
    }

    assert.equal(stub.matching(/INSERT INTO audit_logs/).length, 0)
  } finally {
    stub.restore()
  }
})

test("a valid access request is recorded as an anonymous audit entry", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    const { POST } = await import("../../app/api/auth/signup-request/route")

    const response = await POST(
      request("/api/auth/signup-request", {
        method: "POST",
        body: {
          name: "  Alice   Wong ",
          email: "Alice.Wong@Learn.Local",
          goal: "I want to learn calculus properly before my exams.",
          role: "teacher",
        },
        token: null,
      }),
    )

    assert.equal(response.status, 200)
    const payload = await readJson<{ id: string; message: string }>(response)
    assert.match(payload.id, /^access/)
    assert.match(payload.message, /access request saved/i)

    const audit = stub.matching(/INSERT INTO audit_logs/)
    assert.equal(audit.length, 1)
    assert.equal(audit[0].params[1], null, "an access request has no user id yet")
    assert.equal(audit[0].params[2], "request_access")
    assert.equal(audit[0].params[3], "auth")

    // The email is normalised, and the name has its whitespace collapsed —
    // otherwise the audit trail accumulates duplicate-looking requests.
    const details = String(audit[0].params[5])
    assert.ok(details.includes("alice.wong@learn.local"), `email should be lowercased, got ${details}`)
    assert.ok(details.includes("Alice Wong"), `name should be collapsed, got ${details}`)
    assert.ok(!details.includes("Alice   Wong"))
  } finally {
    stub.restore()
  }
})
