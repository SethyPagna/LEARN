import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import test from "node:test"

// ---------------------------------------------------------------------------
// The local D1 invariant: dev and migrations must share one store.
//
// The documented local flow is `pnpm db:migrate:local` (writes the schema)
// followed by `next dev` (reads it through the OpenNext Cloudflare proxy).
// Those two run as separate processes with separate path resolution, and they
// disagree by default:
//
//   * `next.config.mjs` calls initOpenNextCloudflareForDev(). With no
//     `configPath` the proxy looks for wrangler.jsonc at the repo root, finds
//     nothing (this repo's config lives under ops/cloudflare/), and hands the
//     app no D1 binding — every DB route then answers 503
//     "Cloudflare D1 is not configured".
//   * `wrangler d1 migrations apply --local` resolves its persist root
//     relative to the config file's directory, so it writes
//     ops/cloudflare/.wrangler/state/v3/d1/... while the proxy reads
//     <repo>/.wrangler/state/v3/d1/... . Two different SQLite files, so the
//     app reports "no such table: users" against an empty database.
//
// These assertions are what keep the flow working: if either side's path
// drifts, the documented commands stop agreeing and the tests say so instead
// of the runtime failing with a schema error.
// ---------------------------------------------------------------------------

const nextConfigPath = "next.config.mjs"
const wranglerConfigPath = "ops/cloudflare/wrangler.jsonc"
const migrateScriptName = "db:migrate:local"

/**
 * Returns the text inside the parentheses of `callee(...)`, matched by
 * balancing brackets so nested object literals (`persist: { path: ... }`) do
 * not truncate the match.
 */
function readCallArguments(source: string, callee: string): string {
  const open = source.indexOf(`${callee}(`)
  assert.notEqual(open, -1, `${nextConfigPath} must call ${callee}()`)

  const start = open + callee.length
  let depth = 0
  for (let index = start; index < source.length; index += 1) {
    const character = source[index]
    if (character === "(" || character === "{" || character === "[") depth += 1
    else if (character === ")" || character === "}" || character === "]") {
      depth -= 1
      if (depth === 0) return source.slice(start + 1, index)
    }
  }

  assert.fail(`${callee}(...) is never closed in ${nextConfigPath}`)
}

function readStringArgument(callArguments: string, field: RegExp, label: string): string {
  const match = field.exec(callArguments)
  assert.ok(match, `initOpenNextCloudflareForDev must pass ${label}`)
  return match[1]
}

const callArguments = readCallArguments(
  fs.readFileSync(nextConfigPath, "utf8"),
  "initOpenNextCloudflareForDev",
)

const devConfigPath = readStringArgument(callArguments, /configPath:\s*["']([^"']+)["']/, "configPath")
const devPersistPath = readStringArgument(
  callArguments,
  /persist:\s*\{\s*path:\s*["']([^"']+)["']\s*\}/,
  "persist.path",
)

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
  scripts?: Record<string, string>
}
const migrateScript = packageJson.scripts?.[migrateScriptName] ?? ""

test("the dev proxy points at the repo's actual wrangler config", () => {
  // Without this, the proxy looks for ./wrangler.jsonc, finds nothing, and the
  // app runs with no D1 binding at all.
  assert.equal(devConfigPath, wranglerConfigPath)
  assert.equal(
    fs.existsSync(wranglerConfigPath),
    true,
    `${wranglerConfigPath} is where this repo keeps its wrangler config`,
  )
})

test("the local migration script writes to an explicit persist store", () => {
  // The default root is relative to the config file's directory
  // (ops/cloudflare/), which is a different file from the one dev reads.
  const persistTo = /--persist-to\s+(\S+)/.exec(migrateScript)
  assert.ok(persistTo, `${migrateScriptName} must pass --persist-to <root>`)
  assert.equal(
    /--persist-to\s+\.wrangler\/state\b/.test(migrateScript),
    true,
    `${migrateScriptName} should target the repo-root .wrangler/state store`,
  )
})

test("dev and migrations agree on the same D1 store", () => {
  const migratePersistRoot = /--persist-to\s+(\S+)/.exec(migrateScript)?.[1] ?? ""
  const migrateDatabaseDir = `${migratePersistRoot.replace(/\/+$/, "")}/v3`

  // `--persist-to` takes the persist *root*; wrangler appends `v3` itself, and
  // the dev `persist.path` is the fully-qualified store. The equality below is
  // the whole invariant — it fails the moment the two paths drift apart.
  assert.equal(
    devPersistPath,
    migrateDatabaseDir,
    "next.config.mjs persist.path must equal the migration script's persist root plus /v3",
  )
})

test("the local D1 store can never be committed", () => {
  // A stray local database in git would both leak data and resurrect the
  // "wrong store" confusion on another machine.
  const ignored = execFileSync("git", ["check-ignore", ".wrangler"], { encoding: "utf8" })
  assert.match(ignored, /\.wrangler/)
})
