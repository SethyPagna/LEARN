/**
 * The request scope Next.js puts around every route handler, for tests that
 * call a handler directly.
 *
 * `next/headers`' `cookies()` — which `getCurrentUser()` builds on — reads two
 * AsyncLocalStorage stores that Next's server establishes around each request.
 * A handler invoked straight from a test has neither, so the first such call
 * throws "`cookies` was called outside a request scope" and a route test could
 * only ever assert that failure.
 *
 * Getting this to work needs two things, and both live here so no test has to
 * repeat them:
 *
 *  1. **A real AsyncLocalStorage before Next loads.** Next constructs both
 *     stores the moment its own modules are evaluated, from
 *     `globalThis.AsyncLocalStorage` (see
 *     `next/dist/server/app-render/async-local-storage.js` in the installed
 *     next). A plain Node process has no such global, so Next falls back to a
 *     `FakeAsyncLocalStorage` whose `run()` throws — permanently, because the
 *     instances are cached at module load. That is why this file must be the
 *     *first* import of a test file (`import "./request-scope"` above
 *     everything else): it installs the `node:async_hooks` implementation
 *     before Next's modules are evaluated.
 *
 *  2. **Stores shaped the way Next shapes them.** The two objects below are
 *     the minimum a `request`-type work unit must contain for `cookies()` to
 *     run its read-only path: a named work store, and a store whose `phase`
 *     is not `action` (mutable-cookie phases read a different bag) and whose
 *     `cookies` bag answers `get(name)`. The real `cookies()` runs and returns
 *     the real value — nothing in `src/lib` or `src/app` is mocked or bypassed.
 *
 * The deep imports are the cost of driving the framework boundary from outside
 * it; they are what Next itself wires up in
 * `next/dist/server/lib/app-route-module` around every route invocation. If a
 * Next upgrade renames them, this file fails loudly — which is the right
 * failure for a helper the route tests depend on.
 */

import { AsyncLocalStorage } from "node:async_hooks"
import { createRequire } from "node:module"
import path from "node:path"

interface AsyncLocalStorageLike {
  run<T>(store: unknown, callback: () => Promise<T>): Promise<T>
}

// Happens before anything else in the process, deliberately: see the header.
;(globalThis as unknown as { AsyncLocalStorage?: unknown }).AsyncLocalStorage = AsyncLocalStorage

const nextRequire = createRequire(path.join(process.cwd(), "package.json"))
const { workAsyncStorage } = nextRequire("next/dist/server/app-render/work-async-storage.external.js") as {
  workAsyncStorage: AsyncLocalStorageLike
}
const { workUnitAsyncStorage } = nextRequire("next/dist/server/app-render/work-unit-async-storage.external.js") as {
  workUnitAsyncStorage: AsyncLocalStorageLike
}

/** The session cookie name, matching what `request()` in `./harness` sends. */
const SESSION_COOKIE = "learn_session"

interface CookieBag {
  get(name: string): { name: string; value: string } | undefined
  getAll(): { name: string; value: string }[]
  has(name: string): boolean
}

/**
 * Run `handler` the way Next would run it: inside a request scope whose
 * session cookie is `token`. Pass `null` for no session at all — the same
 * convention `request()` in `./harness` uses.
 */
export async function withRequestScope<T>(token: string | null, handler: () => Promise<T>): Promise<T> {
  const cookies: CookieBag = {
    get: (name) => (token && name === SESSION_COOKIE ? { name, value: token } : undefined),
    getAll: () => (token ? [{ name: SESSION_COOKIE, value: token }] : []),
    has: (name) => Boolean(token) && name === SESSION_COOKIE,
  }

  const workStore = {
    route: "/api/files/[id]/download",
    forceStatic: false,
    dynamicShouldError: false,
  }
  const workUnitStore = {
    // Not `action`: an action phase would make Next hand out a mutable cookie
    // bag, which this minimal store deliberately does not provide.
    type: "request",
    phase: "render",
    cookies,
  }

  return workAsyncStorage.run(workStore, () => workUnitAsyncStorage.run(workUnitStore, handler))
}
