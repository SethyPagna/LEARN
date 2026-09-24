import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import vm from "node:vm"
import { fileURLToPath } from "node:url"

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
const APP_ROOT = path.join(PROJECT_ROOT, "src", "app")
const PUBLIC_ROOT = path.join(PROJECT_ROOT, "public")
const ORIGIN = "https://learn.test"

const SW_PATH = path.join(PUBLIC_ROOT, "sw.js")
const SW_SOURCE = fs.readFileSync(SW_PATH, "utf8")

function readApp(name: string) {
  return fs.readFileSync(path.join(APP_ROOT, name), "utf8")
}

function readPublic(name: string) {
  return fs.readFileSync(path.join(PUBLIC_ROOT, name), "utf8")
}

// ---------------------------------------------------------------------------
// Service worker harness.
//
// `public/sw.js` is plain JavaScript served verbatim, so it can be evaluated in
// a sandbox with stubbed `caches`/`fetch`. That lets these tests assert what the
// worker actually does with an /api/ request — not just what its comments say.
// ---------------------------------------------------------------------------

type SwRequest = { url: string; method: string; mode: string }

type SwEvent = {
  request: SwRequest
  respondWith: (response: Promise<Response>) => void
  waitUntil: (work: Promise<unknown>) => void
}

type SwListener = (event: SwEvent) => void

type SwResult = {
  handled: boolean
  response: Response | undefined
  body: string
}

function keyOf(input: SwRequest | string) {
  return typeof input === "string" ? input : input.url
}

function createWorker() {
  const listeners = new Map<string, SwListener[]>()
  const cacheStores = new Map<string, Map<string, Response>>()
  const cacheWrites: Array<{ cache: string; key: string }> = []
  const networkCalls: string[] = []
  const precacheBodies = new Map<string, string>()
  let offline = false
  let networkCount = 0

  const storeFor = (name: string) => {
    const existing = cacheStores.get(name)
    if (existing) return existing
    const created = new Map<string, Response>()
    cacheStores.set(name, created)
    return created
  }

  const sandbox: Record<string, unknown> = {
    URL,
    Response,
    console,
    location: { origin: ORIGIN },
    skipWaiting: async () => undefined,
    clients: { claim: async () => undefined },
    addEventListener: (type: string, listener: SwListener) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener])
    },
    caches: {
      open: async (name: string) => {
        const store = storeFor(name)
        return {
          match: async (request: SwRequest | string) => store.get(keyOf(request)),
          put: async (request: SwRequest | string, response: Response) => {
            cacheWrites.push({ cache: name, key: keyOf(request) })
            store.set(keyOf(request), response.clone())
          },
          addAll: async (urls: string[]) => {
            for (const url of urls) {
              cacheWrites.push({ cache: name, key: url })
              store.set(url, new Response(precacheBodies.get(url) ?? `precached ${url}`))
            }
          },
        }
      },
      match: async (request: SwRequest | string) => {
        for (const store of cacheStores.values()) {
          const hit = store.get(keyOf(request))
          if (hit) return hit
        }
        return undefined
      },
      keys: async () => [...cacheStores.keys()],
      delete: async (name: string) => cacheStores.delete(name),
    },
    fetch: async (input: SwRequest | string) => {
      networkCalls.push(keyOf(input))
      if (offline) throw new TypeError("Failed to fetch")
      networkCount += 1
      return new Response(`network response ${networkCount}`)
    },
  }

  sandbox.self = sandbox
  vm.runInNewContext(SW_SOURCE, vm.createContext(sandbox), { filename: SW_PATH })

  const listener = (type: string) => {
    const registered = listeners.get(type)
    assert.equal(registered?.length, 1, `sw.js must register exactly one ${type} listener`)
    return registered[0]
  }

  const runLifecycle = async (type: string) => {
    const work: Promise<unknown>[] = []
    listener(type)({ request: { url: "", method: "GET", mode: "no-cors" }, respondWith: () => undefined, waitUntil: (item) => work.push(item) })
    await Promise.all(work)
  }

  const dispatch = async (request: Partial<SwRequest> & { url: string }): Promise<SwResult> => {
    const full: SwRequest = { method: "GET", mode: "cors", ...request }
    const pending: Promise<Response>[] = []
    listener("fetch")({ request: full, respondWith: (response) => pending.push(response), waitUntil: () => undefined })
    const settled = await Promise.allSettled(pending)
    const first = settled[0]
    const response = first !== undefined && first.status === "fulfilled" ? first.value : undefined
    return {
      handled: pending.length > 0,
      response,
      body: response ? await response.text() : "",
    }
  }

  return {
    dispatch,
    runInstall: () => runLifecycle("install"),
    runActivate: () => runLifecycle("activate"),
    cacheWrites,
    networkCalls,
    cacheNames: () => [...cacheStores.keys()],
    precache: (url: string, body: string) => precacheBodies.set(url, body),
    setOffline: (value: boolean) => {
      offline = value
    },
    seedCache: (name: string, url: string, body: string) => storeFor(name).set(url, new Response(body)),
  }
}

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

test("manifest module declares the app as installable", () => {
  const source = readApp("manifest.ts")

  assert.match(source, /MetadataRoute\.Manifest/)
  assert.match(source, /name:\s*"LEARN"/)
  assert.match(source, /short_name:\s*"LEARN"/)
  assert.match(source, /description:/)
  assert.match(source, /start_url:\s*"\/dashboard"/)
  assert.match(source, /display:\s*"standalone"/)
  assert.match(source, /background_color:\s*"#[0-9a-fA-F]{3,8}"/)
  assert.match(source, /theme_color:\s*"#[0-9a-fA-F]{3,8}"/)
  assert.match(source, /icons:\s*\[/)
})

test("manifest icons reference existing public assets only", () => {
  const source = readApp("manifest.ts")
  const iconSources = [...source.matchAll(/src:\s*"([^"]+)"/g)].map((match) => match[1])

  assert.deepEqual(iconSources, ["/icon.svg", "/icon-light-32x32.png", "/icon-dark-32x32.png"])

  for (const iconSource of iconSources) {
    const onDisk = path.join(PUBLIC_ROOT, iconSource.replace(/^\//, ""))
    assert.equal(fs.existsSync(onDisk), true, `${iconSource} must exist in public/`)
  }

  // The SVG is the maskable/any-size icon; the two PNGs cover 32x32.
  assert.match(source, /sizes:\s*"any"/)
  assert.match(source, /type:\s*"image\/svg\+xml"/)
  assert.match(source, /purpose:\s*"any maskable"/)
  assert.match(source, /sizes:\s*"32x32"[\s\S]*sizes:\s*"32x32"/)
})

// ---------------------------------------------------------------------------
// Service worker: the /api/ exclusion
// ---------------------------------------------------------------------------

test("service worker excludes /api/ before it reaches any respondWith call", () => {
  const exclusion = SW_SOURCE.indexOf('url.pathname.startsWith("/api/")')
  const firstRespondWith = SW_SOURCE.indexOf("respondWith(")

  assert.notEqual(exclusion, -1, "sw.js must exclude /api/ in code, not just in a comment")
  assert.match(SW_SOURCE, /url\.pathname === "\/api"/)
  assert.notEqual(firstRespondWith, -1)
  assert.equal(exclusion < firstRespondWith, true, "the /api/ exclusion must precede every cache-backed response")
})

test("service worker never touches an /api/ request or response", async () => {
  const worker = createWorker()

  for (const request of [
    { url: `${ORIGIN}/api/notes` },
    { url: `${ORIGIN}/api` },
    { url: `${ORIGIN}/api/chat/stream?room=1` },
    { url: `${ORIGIN}/api/notes`, method: "POST" },
    { url: `https://other.test/api/notes` },
    { url: `https://cdn.test/asset.js` },
    { url: `${ORIGIN}/notes`, method: "POST" },
  ]) {
    const result = await worker.dispatch(request)

    assert.equal(result.handled, false, `${request.url} (${request.method ?? "GET"}) must be left to the browser`)
  }

  assert.deepEqual(worker.cacheWrites, [])
  assert.deepEqual(worker.networkCalls, [])
  assert.deepEqual(worker.cacheNames(), [])
})

test("service worker stores nothing while serving API traffic", async () => {
  const worker = createWorker()

  // Same origin, GET, network online: everything about this request looks
  // cacheable except the path, which is the whole point.
  const api = await worker.dispatch({ url: `${ORIGIN}/api/calendar` })
  assert.equal(api.handled, false)
  assert.deepEqual(worker.cacheWrites, [])
  assert.deepEqual(worker.cacheNames(), [])

  // A plain asset request in the same worker does populate a cache, so the
  // empty result above is the exclusion working rather than a dead harness.
  await worker.dispatch({ url: `${ORIGIN}/icon.svg` })
  assert.equal(worker.cacheWrites.length > 0, true)
})

test("service worker keeps navigations network-first and unstored", async () => {
  const worker = createWorker()

  const online = await worker.dispatch({ url: `${ORIGIN}/dashboard`, mode: "navigate" })

  assert.equal(online.handled, true)
  assert.match(online.body, /network response/)
  assert.deepEqual(worker.cacheWrites, [], "rendered pages are per-user and must not be cached")
})

test("service worker falls back to the precached offline page", async () => {
  const worker = createWorker()
  worker.precache("/offline.html", readPublic("offline.html"))
  await worker.runInstall()

  worker.setOffline(true)
  const result = await worker.dispatch({ url: `${ORIGIN}/notes`, mode: "navigate" })

  assert.equal(result.handled, true)
  assert.match(result.body, /You're offline/)

  const installWrites = worker.cacheWrites.map((write) => write.key)
  assert.deepEqual(installWrites, ["/offline.html", "/icon.svg", "/manifest.webmanifest"])
  assert.equal(installWrites.some((url) => url.startsWith("/api")), false)
})

test("service worker serves hashed static assets cache-first", async () => {
  const worker = createWorker()
  const asset = { url: `${ORIGIN}/_next/static/chunks/app.js` }

  const first = await worker.dispatch(asset)
  const second = await worker.dispatch(asset)

  assert.match(first.body, /network response/)
  assert.equal(second.body, first.body)
  assert.deepEqual(worker.networkCalls, [asset.url], "the second hit must come from cache")
  assert.deepEqual(worker.cacheWrites, [{ cache: "learn-pwa-v1-runtime", key: asset.url }])
})

test("service worker drops stale caches on activate", async () => {
  const worker = createWorker()
  worker.seedCache("learn-pwa-v0-shell", "/offline.html", "old shell")

  await worker.runInstall()
  await worker.runActivate()

  assert.deepEqual(worker.cacheNames(), ["learn-pwa-v1-shell"])
})

// ---------------------------------------------------------------------------
// Offline page
// ---------------------------------------------------------------------------

test("offline page is self-contained with no remote assets", () => {
  const offlineHtml = readPublic("offline.html")

  assert.match(offlineHtml, /<!doctype html>/i)
  assert.match(offlineHtml, /offline/i)
  assert.equal(/https?:\/\//i.test(offlineHtml), false, "offline.html must not reference remote URLs")
  assert.equal(/<(?:script|link|img|iframe|source)\b/i.test(offlineHtml), false)
  // Honest copy: it must not claim to show cached account data.
  assert.match(offlineHtml, /never caches your data/i)
})

// ---------------------------------------------------------------------------
// Route surfaces and registration
// ---------------------------------------------------------------------------

test("error boundaries and route surfaces exist with the required markers", () => {
  const errorSource = readApp("error.tsx")
  const globalErrorSource = readApp("global-error.tsx")
  const notFoundSource = readApp("not-found.tsx")

  assert.match(errorSource, /^"use client"/)
  assert.match(errorSource, /reset/)
  assert.match(errorSource, /error:/)

  assert.match(globalErrorSource, /^"use client"/)
  assert.match(globalErrorSource, /<html/)
  assert.match(globalErrorSource, /<body/)
  assert.match(globalErrorSource, /reset/)
  assert.equal(/@\/components/.test(globalErrorSource), false, "global-error must not pull in the app shell")

  assert.match(notFoundSource, /href="\/"/)
})

// ---------------------------------------------------------------------------
// No loading boundary above a notFound()
//
// `loading.tsx` is not just a skeleton: it wraps everything below it in a
// Suspense boundary. Next.js flushes that boundary's fallback shell as soon as
// the route starts streaming, which commits the status line before the page
// body resolves — so a `notFound()` thrown later by the page can only swap the
// body, never the status code. A `loading.tsx` at the app root therefore puts
// the whole tree in that state: an invalid token answers `200 OK` with the 404
// page as its body, which tells crawlers and clients the link is fine.
//
// This was not theoretical. The root `src/app/loading.tsx` added with the PWA
// work did exactly that, and it was bisected directly: with the file present
// `GET /share/<invalid-token>` returned 200, with it removed the same request
// returned 404.
//
// The affordance was not worth the cost. Every top-level page is already a
// client shell (`<LearnShell … />`) that renders immediately, so a global
// skeleton bought almost nothing. Correct status codes win: do not re-add a
// root `src/app/loading.tsx`, and only add one inside a leaf segment that
// renders async content, never calls `notFound()`, and has no such page
// beneath it — the invariant the tests below enforce.
// ---------------------------------------------------------------------------

function walkApp(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name)
    if (entry.isDirectory()) return walkApp(entryPath)
    return entry.isFile() ? [entryPath] : []
  })
}

/** Every `page.tsx` under `src/app` that rejects a request with `notFound()`. */
function pagesCallingNotFound(): string[] {
  return walkApp(APP_ROOT).filter(
    (file) => path.basename(file) === "page.tsx" && /notFound\(\)/.test(fs.readFileSync(file, "utf8")),
  )
}

/**
 * Every `loading.tsx` in a route segment at or above `pagePath`, up to and
 * including the app root — the boundaries that can swallow its 404 status.
 */
function loadingBoundariesAbove(pagePath: string): string[] {
  const found: string[] = []
  let dir = path.dirname(pagePath)

  for (;;) {
    const candidate = path.join(dir, "loading.tsx")
    if (fs.existsSync(candidate)) found.push(path.relative(APP_ROOT, candidate).split(path.sep).join("/"))
    if (dir === APP_ROOT) break
    dir = path.dirname(dir)
  }

  return found
}

test("no root loading boundary exists", () => {
  assert.equal(
    fs.existsSync(path.join(APP_ROOT, "loading.tsx")),
    false,
    "src/app/loading.tsx must not exist: a root loading boundary makes notFound() unable to set the HTTP status",
  )
})

test("every notFound() page has no loading boundary above it", () => {
  const pages = pagesCallingNotFound().map((file) => path.relative(APP_ROOT, file).split(path.sep).join("/"))

  // The guard is only meaningful while something still relies on notFound()
  // setting the status; this keeps it from passing vacuously if that changes.
  assert.equal(pages.includes("share/[token]/page.tsx"), true, "share/[token]/page.tsx must keep rejecting with notFound()")

  const offenders = pages.flatMap((page) => loadingBoundariesAbove(path.join(APP_ROOT, page)).map((boundary) => `${boundary} -> ${page}`))

  assert.deepEqual(
    offenders,
    [],
    "a loading boundary above a notFound() page returns 200 for what should be a 404",
  )
})

test("root layout registers the service worker and PWA metadata", () => {
  const layoutSource = readApp("layout.tsx")

  assert.match(layoutSource, /from ['"]@\/components\/pwa-register['"]/)
  assert.match(layoutSource, /<PwaRegister\s*\/>/)
  assert.match(layoutSource, /appleWebApp/)
  assert.match(layoutSource, /export const viewport: Viewport/)
  assert.match(layoutSource, /themeColor/)
})

test("service worker registration is production-only and secure-origin-only", () => {
  const source = fs.readFileSync(path.join(PROJECT_ROOT, "src", "components", "pwa-register.tsx"), "utf8")

  assert.match(source, /^"use client"/)
  assert.match(source, /process\.env\.NODE_ENV !== "production"/)
  assert.match(source, /"serviceWorker" in navigator/)
  assert.match(source, /"https:"/)
  assert.match(source, /"localhost"/)
  assert.match(source, /navigator\.serviceWorker\.register\("\/sw\.js"\)/)
})
