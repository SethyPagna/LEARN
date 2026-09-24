// LEARN service worker.
//
// Ground rule: this worker accelerates the shell, it never stores data. Every
// screen in LEARN renders authenticated, per-user data, so the fetch handler
// hands /api/ requests straight back to the browser before any cache logic can
// run. On a shared or lost device a cached API response would show one
// account's private data to the next person who opens the app, offline, with
// nothing in the server logs. That path must not exist.

const CACHE_VERSION = "learn-pwa-v1"
const SHELL_CACHE = `${CACHE_VERSION}-shell`
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`

// Verbatim public files only. The app itself is authenticated and per-user, so
// it is deliberately not precached.
const SHELL_ASSETS = ["/offline.html", "/icon.svg", "/manifest.webmanifest"]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== RUNTIME_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener("fetch", (event) => {
  const { request } = event

  // Bail out before any storage logic runs: non-GET methods, cross-origin
  // URLs, and above all anything under /api/. API responses are private,
  // per-user data, so the worker neither observes nor replays them — the
  // request continues to the network exactly as if no service worker existed.
  if (request.method !== "GET") return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return

  // A production preview can install this worker before switching back to dev.
  // Local Next assets reuse URLs across edits, so they must never hit this cache.
  if (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && url.pathname.startsWith("/_next/")) return

  if (request.mode === "navigate") {
    event.respondWith(networkFirstDocument(request))
    return
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirstAsset(request))
    return
  }

  event.respondWith(networkFirstAsset(request))
})

// A navigation returns live HTML for an authenticated page, so it is fetched
// fresh and never stored. Only the offline notice is a valid fallback.
async function networkFirstDocument(request) {
  try {
    return await fetch(request)
  } catch {
    return (await offlineNotice()) ?? textResponse("Offline", 503)
  }
}

// Hashed, immutable build output: serving a cached copy first is safe.
async function cacheFirstAsset(request) {
  const cache = await caches.open(RUNTIME_CACHE)
  const cached = await cache.match(request)
  if (cached) return cached

  const response = await fetch(request)
  if (response.ok) await cache.put(request, response.clone())
  return response
}

// Other same-origin, non-API GETs: prefer the network, keep a copy for later,
// fall back to that copy when the device is offline.
async function networkFirstAsset(request) {
  const cache = await caches.open(RUNTIME_CACHE)
  try {
    const response = await fetch(request)
    if (response.ok) await cache.put(request, response.clone())
    return response
  } catch {
    const cached = await cache.match(request)
    return cached ?? textResponse("Offline", 503)
  }
}

async function offlineNotice() {
  const cache = await caches.open(SHELL_CACHE)
  return (await cache.match("/offline.html")) ?? null
}

function textResponse(body, status) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  })
}
