import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { launcherCommands, viewRoutes } from "../../lib/navigation"

/**
 * The live quiz is a feature whose correctness lives in a pure reducer and
 * whose delivery lives in a handful of files that must stay connected: a view
 * mounted in the shell, a route reachable from that view, a migration that
 * creates the tables the route writes to, and a launcher entry that makes it
 * findable. Every one of those can silently come loose, and each has happened
 * elsewhere in this codebase (an unmounted view, an orphaned route, a
 * migration that was never written). This file is the tripwire.
 */

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
const LIVE_ENGINE = path.join(PROJECT_ROOT, "src", "lib", "live", "quiz-session.ts")
const LIVE_VIEW = path.join(PROJECT_ROOT, "src", "components", "learn", "views", "live-quiz-view.tsx")
const LIVE_SHELL = path.join(PROJECT_ROOT, "src", "components", "learn", "learn-shell.tsx")
const LIVE_PAGE = path.join(PROJECT_ROOT, "src", "app", "live", "page.tsx")
const LIVE_VIEW_TYPES = path.join(PROJECT_ROOT, "src", "components", "learn", "types.ts")
const LIVE_COLLECTION_ROUTE = path.join(PROJECT_ROOT, "src", "app", "api", "live-sessions", "route.ts")
const LIVE_SESSION_ROUTE = path.join(PROJECT_ROOT, "src", "app", "api", "live-sessions", "[code]", "route.ts")
const LIVE_MIGRATION = path.join(PROJECT_ROOT, "ops", "migrations", "0015_live_quiz_sessions.sql")
const LIVE_DATA = path.join(PROJECT_ROOT, "src", "lib", "data.ts")
const WRANGLER_CONFIG = path.join(PROJECT_ROOT, "ops", "cloudflare", "wrangler.jsonc")

function read(filePath: string) {
  return fs.readFileSync(filePath, "utf8")
}

/** Code with comments removed, so assertions about code cannot match prose. */
function stripComments(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
}

test("the live quiz view is mounted in the shell, the route table, and its own page", () => {
  assert.ok(fs.existsSync(LIVE_VIEW), "the view file must exist")
  assert.match(read(LIVE_VIEW_TYPES), /\|\s*"live"/, `View should include "live"`)
  assert.match(read(LIVE_SHELL), /from "\.\/views\/live-quiz-view"/, "the shell must import the view")
  assert.match(
    read(LIVE_SHELL),
    /view === "live"\s*\?\s*<LiveQuizView/,
    "the shell must render LiveQuizView for the live view",
  )
  assert.equal(viewRoutes.live, "/live")
  assert.match(read(LIVE_PAGE), /initialView="live"/, "/live must open the live view")
})

test("the live quiz is reachable from the launcher without adding a ninth sidebar item", () => {
  // Guards the deliberate design decision: the sidebar is capped at eight
  // primary destinations, so `live` must be an alias reached from Practice.
  const command = launcherCommands.find((entry) => entry.view === "live")
  assert.ok(command, "the launcher must offer a live quiz entry")
  assert.ok(command.keywords.length >= 4, "a launcher entry needs enough keywords to be searchable")
  assert.match(command.label.toLowerCase(), /live/)
})

test("both live session routes authenticate every mutation with requireApiUser", () => {
  const collection = read(LIVE_COLLECTION_ROUTE)
  const session = read(LIVE_SESSION_ROUTE)

  for (const [name, source] of [["live-sessions", collection], ["live-sessions/[code]", session]] as const) {
    assert.match(source, /export const POST\b/, `${name} should accept a POST`)
    assert.match(source, /requireApiUser\(/, `${name} must authenticate with requireApiUser`)
    assert.match(source, /isApiResponse\(user\)/, `${name} must bail out on the auth failure response`)
  }

  // The player's request body must not be able to name the participant it
  // answers as: the id is derived from the session user, not from the client.
  assert.match(session, /submitLiveAnswer\(user, code, \{ questionId, choiceId \}\)/, "the answer route must not forward a client-supplied participant id")
  assert.match(session, /correctChoiceId: ""/, "the live question must not leak the answer to non-hosts")
})

test("the live quiz state is never public: reading it requires being the host or a player", () => {
  const session = read(LIVE_SESSION_ROUTE)

  assert.match(session, /Join this live quiz before watching it/, "a non-participant must be refused")
  // Host-only actions are refused in the data layer, where the session is
  // loaded and the host id is known — not in the route, which cannot see it.
  assert.match(read(LIVE_DATA), /Only the host can control this live quiz/, "host-only actions must be enforced in the data layer")
})

test("the migration creates the live quiz tables and indexes the lookups the feature uses", () => {
  const sql = read(LIVE_MIGRATION)

  assert.match(sql, /^PRAGMA foreign_keys = ON;/m, "migrations in this repo enable foreign keys first")
  for (const table of ["live_quiz_sessions", "live_quiz_participants", "live_quiz_answers"]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`), `${table} must be created`)
  }

  // The join code is the lookup a player performs on every screen open, and
  // UNIQUE is what makes minting a code safe against two hosts racing.
  assert.match(sql, /code text NOT NULL UNIQUE/, "the join code must be unique")
  assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_live_quiz_sessions_code ON live_quiz_sessions\(code\)/)
  assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_live_quiz_participants_session ON live_quiz_participants\(session_id\)/)
  assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_live_quiz_answers_session ON live_quiz_answers\(session_id\)/)
})

test("no new Durable Object was introduced for the live quiz", () => {
  // The transport is polling of the durable REST state (see the route's
  // comment). If a future change adds a binding here, that decision should be
  // made deliberately rather than arriving as a side effect.
  const config = read(WRANGLER_CONFIG)
  const classes = [...config.matchAll(/"class_name":\s*"([^"]+)"/g)].map((match) => match[1])

  assert.deepEqual(classes.sort(), ["ChatDurableObject", "PresenceDurableObject", "StudyBattleDurableObject", "StudyRoomDurableObject"])
})

test("the reducer stays pure: no imports, no clock, no random source of its own", () => {
  const engine = stripComments(read(LIVE_ENGINE))

  // Zero imports is the property that makes the whole feature unit-testable.
  assert.equal(/^\s*import\s/m.test(engine), false, "the engine must not import anything")
  assert.equal(/\bDate\.now\(/.test(engine), false, "the engine must take the clock as an argument")
  assert.equal(/\bnew Date\(/.test(engine), false, "the engine must not read a clock at all")
  assert.equal(/Math\.random\(\)/.test(engine), false, "randomness must be injected, never ambient")
})
