import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"

import {
  decryptProviderSecret,
  encryptProviderSecret,
  isProviderSecretKeyConfigured,
} from "../../lib/ai/provider-admin"

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")

function withEnv<T>(overrides: Record<string, string | undefined>, run: () => T): T {
  const keys = ["NODE_ENV", "LEARN_SECRET_KEY", "AUTH_SECRET"]
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
  try {
    for (const key of keys) {
      const next = overrides[key]
      if (next === undefined) delete process.env[key]
      else process.env[key] = next
    }
    return run()
  } finally {
    for (const key of keys) {
      const previous = saved[key]
      if (previous === undefined) delete process.env[key]
      else process.env[key] = previous
    }
  }
}

// ---------------------------------------------------------------------------
// Item 5 — provider secrets must fail closed in production
// ---------------------------------------------------------------------------

test("provider secret round-trips under an explicit master key", async () => {
  const encrypted = await encryptProviderSecret("sk-live-abc123", "a-real-master-key")
  assert.match(encrypted, /^v1\./)
  assert.notEqual(encrypted, "sk-live-abc123")
  assert.equal(await decryptProviderSecret(encrypted, "a-real-master-key"), "sk-live-abc123")
})

test("a different master key cannot decrypt the ciphertext", async () => {
  const encrypted = await encryptProviderSecret("sk-live-abc123", "a-real-master-key")
  await assert.rejects(() => decryptProviderSecret(encrypted, "the-wrong-master-key"))
})

test("encryption throws in production when no master key is configured", async () => {
  await withEnv({ NODE_ENV: "production", LEARN_SECRET_KEY: undefined, AUTH_SECRET: undefined }, async () => {
    await assert.rejects(
      () => encryptProviderSecret("sk-live-abc123"),
      /Provider-secret encryption is not configured/,
    )
  })
})

test("decryption throws in production when no master key is configured", async () => {
  // The dangerous case: secrets were stored under the built-in fallback, then
  // the key was never configured. Returning "" here would look like "no key
  // stored" instead of "this deployment is misconfigured".
  const underFallback = await withEnv(
    { NODE_ENV: "development", LEARN_SECRET_KEY: undefined, AUTH_SECRET: undefined },
    () => encryptProviderSecret("sk-live-abc123"),
  )

  await withEnv({ NODE_ENV: "production", LEARN_SECRET_KEY: undefined, AUTH_SECRET: undefined }, async () => {
    await assert.rejects(
      () => decryptProviderSecret(underFallback),
      /Provider-secret encryption is not configured/,
    )
  })
})

test("the development fallback still works outside production", async () => {
  await withEnv({ NODE_ENV: "development", LEARN_SECRET_KEY: undefined, AUTH_SECRET: undefined }, async () => {
    const encrypted = await encryptProviderSecret("sk-local-only")
    assert.equal(await decryptProviderSecret(encrypted), "sk-local-only")
  })
})

test("isProviderSecretKeyConfigured reflects the environment", () => {
  withEnv({ LEARN_SECRET_KEY: undefined, AUTH_SECRET: undefined }, () => {
    assert.equal(isProviderSecretKeyConfigured(), false)
  })
  withEnv({ LEARN_SECRET_KEY: "set", AUTH_SECRET: undefined }, () => {
    assert.equal(isProviderSecretKeyConfigured(), true)
  })
  withEnv({ LEARN_SECRET_KEY: undefined, AUTH_SECRET: "set" }, () => {
    assert.equal(isProviderSecretKeyConfigured(), true)
  })
})

// ---------------------------------------------------------------------------
// Item 18.3 / 19 — security headers must match what the product actually does
// ---------------------------------------------------------------------------

async function loadSecurityHeaders() {
  // VERCEL short-circuits next.config.mjs's initOpenNextCloudflareForDev(),
  // which would otherwise try to boot a local Cloudflare proxy during tests.
  process.env.VERCEL = "1"
  const config = (await import(pathToFileURL(path.join(PROJECT_ROOT, "next.config.mjs")).href)) as {
    default: { headers: () => Promise<{ source: string; headers: { key: string; value: string }[] }[]> }
  }
  const rules = await config.default.headers()
  const asMap = (source: string) =>
    new Map((rules.find((rule) => rule.source === source)?.headers || []).map((h) => [h.key, h.value]))
  return { rules, global: asMap("/:path*"), api: asMap("/api/:path*") }
}

test("Permissions-Policy allows the camera and microphone the app actually uses", async () => {
  const { global } = await loadSecurityHeaders()
  const policy = global.get("Permissions-Policy") || ""

  // views/productivity-views.tsx calls
  // getUserMedia({ audio: true, video }) for group calls and call recording.
  // An empty allowlist makes the browser reject that before any prompt.
  assert.match(policy, /camera=\(self\)/)
  assert.match(policy, /microphone=\(self\)/)
  assert.equal(policy.includes("camera=()"), false)
  assert.equal(policy.includes("microphone=()"), false)

  // Still denied: nothing in the app uses these.
  assert.match(policy, /geolocation=\(\)/)
  assert.match(policy, /payment=\(\)/)
  assert.match(policy, /usb=\(\)/)
})

test("Strict-Transport-Security is set without committing to subdomains or preload", async () => {
  const { global } = await loadSecurityHeaders()
  const hsts = global.get("Strict-Transport-Security")

  assert.ok(hsts, "HSTS header should be present")
  const maxAge = Number(/max-age=(\d+)/.exec(hsts)?.[1])
  assert.ok(maxAge >= 31536000, `max-age should be at least one year, got ${maxAge}`)

  // includeSubDomains would apply to sibling subdomains of whatever host this
  // is deployed on; preload is a hard-to-reverse commitment. Neither should be
  // added without an explicit decision.
  assert.equal(hsts.includes("includeSubDomains"), false)
  assert.equal(hsts.includes("preload"), false)
})

test("the API rule inherits the security headers and adds no-store", async () => {
  const { global, api } = await loadSecurityHeaders()

  for (const key of [
    "Content-Security-Policy",
    "Permissions-Policy",
    "Strict-Transport-Security",
    "X-Content-Type-Options",
    "X-Frame-Options",
    "Referrer-Policy",
  ]) {
    assert.equal(api.get(key), global.get(key), `${key} should match between /:path* and /api/:path*`)
  }

  assert.match(api.get("Cache-Control") || "", /no-store/)
})

test("CSP keeps its structural lockdowns", async () => {
  const { global } = await loadSecurityHeaders()
  const csp = global.get("Content-Security-Policy") || ""

  assert.match(csp, /default-src 'self'/)
  assert.match(csp, /frame-ancestors 'none'/)
  assert.match(csp, /object-src 'none'/)
  assert.match(csp, /base-uri 'self'/)
  assert.match(csp, /form-action 'self'/)
  assert.match(csp, /upgrade-insecure-requests/)
})

// ---------------------------------------------------------------------------
// Item 6 — every mutation route must carry the CSRF origin check
// ---------------------------------------------------------------------------

/**
 * Mutations that are intentionally reachable without a session, so they cannot
 * use requireApiUser(). Keep this list short and justified — adding an entry
 * removes the cross-origin (CSRF) check from a state-changing endpoint.
 */
const PUBLIC_MUTATION_ROUTES = new Set([
  "/auth/login", // you cannot be authenticated before logging in
  "/auth/logout", // worst case is a forced logout, which needs no session
  "/auth/signup-request", // registration happens before a session exists
  "/invites/accept", // invitees have no account yet
])

function listApiRouteFiles(dir: string): string[] {
  const found: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name)
    if (entry.isDirectory()) found.push(...listApiRouteFiles(entryPath))
    else if (entry.name === "route.ts") found.push(entryPath)
  }
  return found
}

/**
 * The shared factory that `docs`, `sheets` and `slides` build their handlers
 * from. `requireApiUser` now lives in there rather than in those three files,
 * so a route is only guarded if this module is guarded — see the assertion at
 * the bottom of this section.
 */
const RESOURCE_ROUTE_FACTORY = path.join(PROJECT_ROOT, "src", "lib", "api", "resource-route.ts")

/** A route file whose handlers are built by the shared factory. */
function usesResourceRouteFactory(source: string) {
  return /from\s+["']@\/lib\/api\/resource-route["']/.test(source)
}

/**
 * Does this route file export a state-changing handler?
 *
 * The destructured form matters: the factory routes are written as
 * `export const { GET, POST, PUT, DELETE, PATCH } = createResourceRoute(...)`,
 * which the plain `export const POST` pattern does not match. Without this
 * branch those three files would be skipped as "not a mutation route" and the
 * check below would pass vacuously for exactly the files it exists to cover.
 */
function exportsMutation(source: string) {
  if (/\bexport const (POST|PUT|PATCH|DELETE)\b/.test(source)) return true
  const destructured = /export const \{([^}]*)\}/.exec(source)
  return Boolean(destructured && /\b(POST|PUT|PATCH|DELETE)\b/.test(destructured[1]))
}

/**
 * A route is guarded if it authenticates itself, or if it delegates its
 * handlers to the factory. The second arm is not a loophole: the test after
 * this one asserts the factory still carries the guard.
 */
function isGuarded(source: string) {
  return source.includes("requireApiUser") || usesResourceRouteFactory(source)
}

test("every mutation route uses requireApiUser or is a documented public exception", () => {
  const apiRoot = path.join(PROJECT_ROOT, "src", "app", "api")
  const offenders: string[] = []

  for (const filePath of listApiRouteFiles(apiRoot)) {
    const source = fs.readFileSync(filePath, "utf8")
    if (!exportsMutation(source)) continue

    const route = `/${path.relative(apiRoot, filePath).split(path.sep).slice(0, -1).join("/")}`
    if (PUBLIC_MUTATION_ROUTES.has(route)) continue
    if (isGuarded(source)) continue

    offenders.push(route)
  }

  assert.deepEqual(
    offenders,
    [],
    "these mutation routes authenticate without requireApiUser(), so they skip the hasTrustedOrigin() CSRF check",
  )
})

test("the routes that delegate to the factory are still inspected, and stay guarded there", () => {
  const apiRoot = path.join(PROJECT_ROOT, "src", "app", "api")

  for (const relative of ["docs", "sheets", "slides"]) {
    const source = fs.readFileSync(path.join(apiRoot, relative, "route.ts"), "utf8")

    // If either of these regresses the route drops out of the loop above and
    // the invariant silently stops covering it.
    assert.equal(exportsMutation(source), true, `${relative} must still be detected as a mutation route`)
    assert.equal(usesResourceRouteFactory(source), true, `${relative} must use the shared factory`)
    assert.equal(isGuarded(source), true, `${relative} must count as guarded`)

    // The literal really is gone, so it is the factory arm — not a leftover
    // local guard — that keeps this route covered. If a future edit puts the
    // literal back, this tells you the OR is no longer being exercised.
    assert.equal(
      source.includes("requireApiUser"),
      false,
      `${relative}'s auth guard now lives in the factory; this assertion keeps that visible`,
    )
  }
})

test("the shared factory enforces the guard its routes delegate to", () => {
  const source = fs.readFileSync(RESOURCE_ROUTE_FACTORY, "utf8")

  assert.match(source, /requireApiUser\(/, "the factory must authenticate the caller")
  assert.match(source, /isApiResponse\(/, "the factory must return the auth failure response as-is")
  assert.match(source, /withApiErrorBoundary\(/, "the factory must wrap its handlers")

  // Counting, not just matching: one wrapper on one handler would satisfy
  // `assert.match` while leaving the other four handlers unprotected.
  assert.equal(
    (source.match(/withApiErrorBoundary\(/g) || []).length,
    5,
    "all five handlers must be wrapped in the error boundary",
  )
  assert.equal(
    (source.match(/requireApiUser\(/g) || []).length,
    5,
    "all five handlers must authenticate before doing anything else",
  )
})


test("the previously unguarded mutation routes now use requireApiUser", () => {
  const apiRoot = path.join(PROJECT_ROOT, "src", "app", "api")

  // `automation/run` was in this list until it was deleted for being a
  // non-functional stub with no caller; the remaining routes still carry the fix.
  for (const relative of ["import", "files"]) {
    const source = fs.readFileSync(path.join(apiRoot, relative, "route.ts"), "utf8")
    assert.match(source, /requireApiUser/, `${relative} should use requireApiUser`)

    // Match the import, not any mention: these files legitimately reference
    // getCurrentUser in a comment explaining why it was replaced.
    const importsBareLookup = /import\s*\{[^}]*\bgetCurrentUser\b[^}]*\}\s*from/.test(source)
    assert.equal(importsBareLookup, false, `${relative} should no longer import getCurrentUser`)
  }
})

test("the public mutation allowlist stays small", () => {
  // A guard against quietly widening the exception list instead of fixing a route.
  assert.ok(PUBLIC_MUTATION_ROUTES.size <= 4, "justify any new public mutation route before adding it")
})
