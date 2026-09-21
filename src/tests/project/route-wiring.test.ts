import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
const API_ROOT = path.join(PROJECT_ROOT, "src", "app", "api")

/**
 * Routes that nothing outside `src/app/api` calls.
 *
 * Reaching this list is not an achievement — it is the backlog. Every entry
 * needs a reason that says who is supposed to consume it, and the list is
 * capped so it cannot quietly absorb new orphans. An unwired route is a feature
 * the product advertises but never runs.
 */
const UNWIRED_ROUTES = new Map<string, string>([
  [
    "/api/notes/[id]/versions",
    "No UI restores a note version yet — Studio's History inspector says saved versions stay behind the record APIs until a restore flow ships",
  ],
])

// Test files exercise routes but do not integrate them, so they are not
// consumers: a route only tests can reach still needs wiring or a reason above.
const NON_CONSUMER_PREFIX = path.join(PROJECT_ROOT, "src", "tests")

function listRouteFiles(dir: string): string[] {
  const found: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name)
    if (entry.isDirectory()) found.push(...listRouteFiles(entryPath))
    else if (entry.name === "route.ts") found.push(entryPath)
  }
  return found
}

function listSourceFiles(dir: string): string[] {
  const found: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name)
    if (entry.isDirectory()) found.push(...listSourceFiles(entryPath))
    else if (/\.tsx?$/.test(entry.name)) found.push(entryPath)
  }
  return found
}

function routePathOf(routeFile: string) {
  const segments = path.relative(API_ROOT, routeFile).split(path.sep).slice(0, -1)
  return `/api/${segments.join("/")}`
}

/**
 * `[id]` segments appear in callers as template literals (`/api/notes/${note.id}`),
 * so a dynamic segment matches any single path segment.
 */
function routeReferencePattern(routePath: string) {
  const escaped = routePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const withWildcards = escaped.replace(/\\\[[^\]]+\\\]/g, "[^\"'`\\s/]+")
  return new RegExp(`${withWildcards}(?![-_a-zA-Z0-9])`)
}

test("every API route is called from outside src/app/api or explicitly allowlisted", () => {
  const consumers = listSourceFiles(path.join(PROJECT_ROOT, "src"))
    .concat(listSourceFiles(path.join(PROJECT_ROOT, "ops", "scripts")))
    .filter((filePath) => !filePath.startsWith(API_ROOT) && !filePath.startsWith(NON_CONSUMER_PREFIX))
    .map((filePath) => fs.readFileSync(filePath, "utf8"))

  const unwired: string[] = []
  for (const routeFile of listRouteFiles(API_ROOT)) {
    const routePath = routePathOf(routeFile)
    if (UNWIRED_ROUTES.has(routePath)) continue
    const pattern = routeReferencePattern(routePath)
    if (consumers.some((source) => pattern.test(source))) continue
    unwired.push(routePath)
  }

  assert.deepEqual(
    unwired,
    [],
    "these routes are not called from any source file outside src/app/api: wire them into a view, delete them, or justify them in UNWIRED_ROUTES",
  )
})

test("the unwired-route allowlist stays small and every entry is justified", () => {
  // A guard against parking new routes here instead of integrating them.
  assert.ok(UNWIRED_ROUTES.size <= 4, "justify any new unwired route before adding it")

  for (const [route, reason] of UNWIRED_ROUTES) {
    assert.match(route, /^\/api\//, `${route} should be an /api path`)
    assert.ok(reason.trim().split(/\s+/).length >= 8, `${route} needs a real reason, not a placeholder`)
  }
})

test("the allowlist only names routes that exist", () => {
  const routePaths = new Set(listRouteFiles(API_ROOT).map(routePathOf))

  assert.deepEqual(
    [...UNWIRED_ROUTES.keys()].filter((route) => !routePaths.has(route)),
    [],
    "an allowlist entry for a deleted route is stale",
  )
})
