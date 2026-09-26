import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

/**
 * Two wrangler configs describe the same Worker to two commands: `wrangler dev`
 * (ops/cloudflare/wrangler.jsonc) and `wrangler deploy`
 * (ops/cloudflare/wrangler.app-deploy.jsonc, the file
 * ops/scripts/deploy/cloudflare.ts hands to `wrangler deploy`). Nothing links
 * them. A Durable Object binding or a migration added to one and forgotten in
 * the other still compiles, still type-checks, and passes every other test —
 * while the deployed Worker quietly lacks an object the runtime reads.
 *
 * That is exactly how `CHAT_DO` shipped: realtime chat live delivery, typing and
 * read state, and WebRTC voice/video signalling all ride the `chat` socket
 * (`src/workers/realtime.ts` CHANNELS, `src/app/api/realtime/[kind]/[id]/route.ts`
 * namespaceFor), and the deployed Worker answered 503 for them while the dev
 * config was right all along. The old wiring guard only ever read the dev config.
 *
 * This file is the tripwire. It reads files; it runs nothing.
 */

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
const DEV_CONFIG = path.join(PROJECT_ROOT, "ops", "cloudflare", "wrangler.jsonc")
const DEPLOY_CONFIG = path.join(PROJECT_ROOT, "ops", "cloudflare", "wrangler.app-deploy.jsonc")
const REALTIME_WORKER = path.join(PROJECT_ROOT, "src", "workers", "realtime.ts")
const REALTIME_KINDS = path.join(PROJECT_ROOT, "src", "lib", "collaboration-events.ts")
const REALTIME_ROUTE = path.join(PROJECT_ROOT, "src", "app", "api", "realtime", "[kind]", "[id]", "route.ts")
const WORKER_ENTRY = path.join(PROJECT_ROOT, "src", "workers", "app.ts")

/**
 * Bindings allowed to exist in the dev config only. Each one needs a reason that
 * says why production does not have it: an unexplained entry is how a dev-only
 * binding reaches production missing. Empty on purpose — nothing is dev-only
 * today, and this file exists to keep it that way.
 */
const DEV_ONLY_BINDINGS = new Map<string, string>()

/**
 * Durable Object classes a binding names that no migration in these configs
 * creates, because the migration that created them is older than the migration
 * list the configs carry. Each entry needs a reason, and the list is capped so
 * it cannot quietly absorb the next omission — which is the bug this file is
 * about. An entry must also still be referenced by a binding, so the exemption
 * cannot outlive the class it excuses.
 */
const CLASSES_OLDER_THAN_CONFIGURED_MIGRATIONS = new Map<string, string>([
  [
    "PresenceDurableObject",
    "Created by the pre-v4 migration history. v5_restore_learn_realtime_classes named it until c2b9e2a narrowed that tag's class list, and an already-applied tag's classes are not something a later deploy can rewrite, so it stays bound with its creating tag historical.",
  ],
])

const CONFIGS = [
  ["dev", DEV_CONFIG],
  ["deploy", DEPLOY_CONFIG],
] as const

interface WranglerConfig {
  durable_objects?: { bindings?: { name?: string; class_name?: string }[] }
  migrations?: { tag?: string; new_sqlite_classes?: string[] }[]
}

function read(filePath: string) {
  return fs.readFileSync(filePath, "utf8")
}

/**
 * JSONC to JSON: drops comments and trailing commas while respecting string
 * literals, so the `https://…` in a var value is not read as a line comment.
 * Parsing here also makes this file the check that the configs still parse — a
 * broken deploy config would be worse than the bug it guards.
 */
function parseJsonc(source: string) {
  let out = ""
  let inString = false
  let inLineComment = false
  let inBlockComment = false
  let lastSignificant = ""
  let lastSignificantAt = -1

  // String literals are significant too: a comma followed by another element is
  // not a trailing comma, even though the element's own characters are skipped.
  const emit = (char: string, significant = !inString && !/\s/.test(char)) => {
    // A comma whose next significant character closes a list or object is a
    // trailing comma: wrangler accepts it, JSON.parse does not.
    if (significant && (char === "}" || char === "]") && lastSignificant === ",") {
      out = out.slice(0, lastSignificantAt) + out.slice(lastSignificantAt + 1)
      lastSignificantAt -= 1
    }
    out += char
    if (significant) {
      lastSignificant = char
      lastSignificantAt = out.length - 1
    }
  }

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    const next = source[index + 1]

    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false
        emit(char)
      }
      continue
    }

    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false
        index += 1
      }
      continue
    }

    if (inString) {
      if (char === "\\") {
        emit(char)
        emit(next ?? "")
        index += 1
        continue
      }
      if (char === '"') {
        inString = false
        emit(char, true)
        continue
      }
      emit(char)
      continue
    }

    if (char === '"') {
      inString = true
      emit(char, true)
      continue
    }

    if (char === "/" && next === "/") {
      inLineComment = true
      index += 1
      continue
    }

    if (char === "/" && next === "*") {
      inBlockComment = true
      index += 1
      continue
    }

    emit(char)
  }

  return JSON.parse(out)
}

function readConfig(filePath: string) {
  return parseJsonc(read(filePath)) as WranglerConfig
}

/** Binding name to Durable Object class, the pair that has to match on both sides. */
function bindingsOf(config: WranglerConfig) {
  const bindings = new Map<string, string>()

  for (const binding of config.durable_objects?.bindings ?? []) {
    assert.ok(
      binding.name && binding.class_name,
      `every Durable Object binding needs a name and a class_name, got ${JSON.stringify(binding)}`,
    )
    bindings.set(binding.name, binding.class_name)
  }

  return bindings
}

function migrationsOf(config: WranglerConfig) {
  return (config.migrations ?? []).map((migration) => {
    assert.ok(migration.tag, "every migration needs a tag")
    return { tag: migration.tag, classes: migration.new_sqlite_classes ?? [] }
  })
}

function driftMessage(left: string, right: string, differences: string[]) {
  return `${left} and ${right} disagree:\n${differences.map((line) => `  ${line}`).join("\n")}`
}

/**
 * The binding names the runtime reads, derived from the two places that read
 * them rather than from a list kept here by hand:
 *  - the `CHANNELS` table in src/workers/realtime.ts, which maps a realtime
 *    channel kind to the env binding the Worker entry forwards the socket to;
 *  - the `env?.NAME_DO` reads in `namespaceFor` in the realtime API route.
 * A new channel that reaches either place arrives here by itself, and then has
 * to exist in both configs.
 */
function runtimeBindingNames() {
  const worker = read(REALTIME_WORKER)
  const route = read(REALTIME_ROUTE)

  const channels = worker.match(/const CHANNELS = \{([\s\S]*?)\}\s*as const/)
  assert.ok(channels, "src/workers/realtime.ts must keep its CHANNELS routing table")

  const fromChannels = [...channels[1].matchAll(/"([A-Z][A-Z0-9_]*_DO)"/g)].map((match) => match[1])
  const fromRoute = [...route.matchAll(/env\?\.([A-Z][A-Z0-9_]*_DO)\b/g)].map((match) => match[1])

  return [...new Set([...fromChannels, ...fromRoute])].sort()
}

/** The channel kinds the runtime recognises, both the vocabulary and the table. */
function realtimeChannelKinds() {
  const kinds = read(REALTIME_KINDS).match(/export const realtimeKinds = \[([^\]]*)\]/)
  assert.ok(kinds, "src/lib/collaboration-events.ts must keep its realtimeKinds vocabulary")

  const worker = read(REALTIME_WORKER).match(/const CHANNELS = \{([\s\S]*?)\}\s*as const/)
  assert.ok(worker, "src/workers/realtime.ts must keep its CHANNELS routing table")

  const vocabulary = [...kinds[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]).sort()
  const table = [...worker[1].matchAll(/^\s*([A-Za-z]+):/gm)].map((match) => match[1]).sort()

  return { vocabulary, table }
}

/** The Durable Object classes the Worker entry re-exports, which is what wrangler binds. */
function exportedWorkerClasses() {
  const entry = read(WORKER_ENTRY)
  const exportBlock = entry.match(/\nexport \{([\s\S]*?)\}/)
  assert.ok(exportBlock, "src/workers/app.ts must keep its `export { … }` block of Durable Object classes")

  return new Set(
    exportBlock[1]
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean),
  )
}

test("both wrangler configs declare the same Durable Object bindings", () => {
  const dev = bindingsOf(readConfig(DEV_CONFIG))
  const deploy = bindingsOf(readConfig(DEPLOY_CONFIG))

  for (const name of DEV_ONLY_BINDINGS.keys()) dev.delete(name)

  // Report every disagreement at once: a binding missing on one side and a
  // binding pointing at a different class are different bugs, and the message
  // has to name the binding or the next person re-derives this by hand.
  const names = [...new Set([...dev.keys(), ...deploy.keys()])].sort()
  const differences = names
    .filter((name) => dev.get(name) !== deploy.get(name))
    .map((name) => `${name}: dev=${dev.get(name) ?? "(absent)"} deploy=${deploy.get(name) ?? "(absent)"}`)

  assert.deepEqual(differences, [], driftMessage("wrangler.jsonc", "wrangler.app-deploy.jsonc", differences))
})

test("both wrangler configs apply the same Durable Object migrations", () => {
  const dev = migrationsOf(readConfig(DEV_CONFIG))
  const deploy = migrationsOf(readConfig(DEPLOY_CONFIG))

  // Migrations are shared deploy state: a tag that exists on one side only means
  // dev and production run different Durable Object schemas, which is how a
  // binding came to reference a class the deploy never created.
  const describe = (migrations: { tag: string; classes: string[] }[]) =>
    migrations.map((migration) => `${migration.tag} [${migration.classes.join(", ")}]`).sort()

  const devTags = describe(dev)
  const deployTags = describe(deploy)
  const differences = [...new Set([...devTags, ...deployTags])]
    .sort()
    .filter((tag) => !(devTags.includes(tag) && deployTags.includes(tag)))

  assert.deepEqual(differences, [], driftMessage("wrangler.jsonc", "wrangler.app-deploy.jsonc", differences))
})

test("every Durable Object binding the runtime reads is declared in both configs", () => {
  const required = runtimeBindingNames()

  // Pinned so the derivation itself is reviewed, not just trusted: these are the
  // four channel kinds in `realtimeKinds`, each mapped to the binding above.
  assert.deepEqual(required, ["CHAT_DO", "PRESENCE_DO", "STUDY_BATTLE_DO", "STUDY_ROOM_DO"])

  for (const [label, configPath] of CONFIGS) {
    const bindings = bindingsOf(readConfig(configPath))
    for (const name of required) {
      assert.ok(bindings.has(name), `the ${label} config (${path.basename(configPath)}) is missing the ${name} binding the runtime reads`)
    }
  }
})

test("every realtime channel kind maps to a binding, and that binding is deployed", () => {
  const { vocabulary, table } = realtimeChannelKinds()

  // A kind the CHANNELS table does not know is a channel the route can name but
  // the Worker cannot route, so the two lists have to be the same list.
  assert.deepEqual(table, vocabulary, "src/workers/realtime.ts CHANNELS must cover every kind in realtimeKinds")
})

test("every Durable Object class a binding names is exported from the worker entry", () => {
  const exported = exportedWorkerClasses()

  for (const [label, configPath] of CONFIGS) {
    const bindings = bindingsOf(readConfig(configPath))
    for (const [name, className] of bindings) {
      assert.ok(
        exported.has(className),
        `the ${label} config binds ${name} to ${className}, which src/workers/app.ts does not export`,
      )
    }
  }
})

test("every Durable Object class a binding names is created by a migration in the same config", () => {
  // The one exception is a class whose creating migration is older than the
  // migration list these configs carry; those are named and justified above.
  for (const [label, configPath] of CONFIGS) {
    const config = readConfig(configPath)
    const bindings = bindingsOf(config)
    const created = new Set(migrationsOf(config).flatMap((migration) => migration.classes))

    for (const [name, className] of bindings) {
      if (created.has(className)) continue
      assert.ok(
        CLASSES_OLDER_THAN_CONFIGURED_MIGRATIONS.has(className),
        `the ${label} config binds ${name} to ${className}, but no new_sqlite_classes migration in ${path.basename(configPath)} creates it`,
      )
    }
  }
})

test("the exemptions stay narrow, justified, and referenced", () => {
  assert.ok(
    CLASSES_OLDER_THAN_CONFIGURED_MIGRATIONS.size <= 2,
    "a class that no migration in these configs creates needs a reason, not an exemption",
  )

  const boundClasses = new Set(
    CONFIGS.flatMap(([, configPath]) => [...bindingsOf(readConfig(configPath)).values()]),
  )

  for (const [className, reason] of CLASSES_OLDER_THAN_CONFIGURED_MIGRATIONS) {
    assert.match(className, /DurableObject$/, `${className} should be a Durable Object class`)
    assert.ok(reason.trim().split(/\s+/).length >= 8, `${className} needs a real reason, not a placeholder`)
    assert.ok(boundClasses.has(className), `${className} is no longer bound by any config, so its exemption is stale`)
  }
})

test("the dev-only binding allowlist stays empty and every entry is justified", () => {
  // A guard against parking the next binding here instead of deploying it.
  assert.ok(DEV_ONLY_BINDINGS.size <= 2, "justify any new dev-only Durable Object binding before adding it")

  for (const [name, reason] of DEV_ONLY_BINDINGS) {
    assert.match(name, /_DO$/, `${name} should be a Durable Object binding name`)
    assert.ok(reason.trim().split(/\s+/).length >= 8, `${name} needs a real reason, not a placeholder`)
  }
})
