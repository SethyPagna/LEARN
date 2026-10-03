import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ACCOUNT_ID = "d105a82bc26b6913575355352c2d1bb1"
const DATABASE_ID = "3eeb04af-c283-48c0-9469-82b64392fa79"
const WORKER_NAME = "learn"
const DATABASE_NAME = "learn-db"
const PRESENCE_TAG = "v6_add_presence_durable_object"
const CHAT_TAG = "v7_add_chat_durable_object"
const QUIZ_OWNERSHIP_MIGRATION = "0013_quiz_ownership.sql"
const CALENDAR_MIGRATION = "0014_calendar_feed_and_reminders.sql"
const MINIMUM_APPLIED_MIGRATIONS = 12
const REQUEST_TIMEOUT_MS = 20_000
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")

interface WorkerBinding {
  name: string
  type: string
  id?: string
  bucket_name?: string
  class_name?: string
  script_name?: string
}

export interface CloudflareReleasePreflightSnapshot {
  accountId: string
  apiTokenPresent: boolean
  workers: { id: string; migrationTag?: string }[]
  bindings: WorkerBinding[]
  database: { id: string; name: string }
  availableMigrations: string[]
  appliedMigrations: string[]
  columns: { quizzes: string[]; users: string[]; calendar_events: string[] }
  timeTravelBookmark: string
}

interface CloudflareReleaseReceipt {
  checkedAt: string
  githubSha: string | null
  accountId: string
  worker: { name: string; migrationTag: string }
  database: CloudflareReleasePreflightSnapshot["database"]
  appliedMigrations: string[]
  pendingMigrations: string[]
  columns: CloudflareReleasePreflightSnapshot["columns"]
  timeTravelBookmark: string
}

/** Explicit allowlist keeps recovery bookmarks out of hosted artifacts. */
export function createCloudflareReleaseSummary(receipt: CloudflareReleaseReceipt): Omit<CloudflareReleaseReceipt, "timeTravelBookmark"> {
  return {
    checkedAt: receipt.checkedAt, githubSha: receipt.githubSha, accountId: receipt.accountId,
    worker: receipt.worker, database: receipt.database,
    appliedMigrations: receipt.appliedMigrations, pendingMigrations: receipt.pendingMigrations, columns: receipt.columns,
  }
}

function requireCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function validateCredentials(accountId: string, apiTokenPresent: boolean) {
  requireCondition(accountId === ACCOUNT_ID, "Cloudflare preflight requires the configured LEARN account.")
  requireCondition(apiTokenPresent, "Cloudflare preflight requires CLOUDFLARE_API_TOKEN.")
}

function existingWorker(workers: CloudflareReleasePreflightSnapshot["workers"]) {
  const targets = workers.filter((worker) => worker.id === WORKER_NAME)
  requireCondition(targets.length === 1, "Cloudflare preflight requires exactly one existing learn Worker.")
  const worker = targets[0]
  requireCondition(
    worker.migrationTag === PRESENCE_TAG || worker.migrationTag === CHAT_TAG,
    "Unexpected live LEARN Worker migration tag; reconcile applied history before release.",
  )
  return { id: worker.id, migrationTag: worker.migrationTag }
}

/** Checks selected metadata only; credentials and application rows never enter the receipt. */
export function validateCloudflareReleasePreflight(snapshot: CloudflareReleasePreflightSnapshot) {
  validateCredentials(snapshot.accountId, snapshot.apiTokenPresent)
  const worker = existingWorker(snapshot.workers)
  requireCondition(
    snapshot.database.id === DATABASE_ID && snapshot.database.name === DATABASE_NAME,
    "Cloudflare preflight requires the existing learn-db database.",
  )

  const requiredBindings: WorkerBinding[] = [
    { name: "LEARN_DB", type: "d1", id: DATABASE_ID },
    { name: "LEARN_FILES", type: "r2_bucket", bucket_name: "learn-files" },
    { name: "NEXT_INC_CACHE_R2_BUCKET", type: "r2_bucket", bucket_name: "learn-next-cache" },
    { name: "STUDY_ROOM_DO", type: "durable_object_namespace", class_name: "StudyRoomDurableObject" },
    { name: "STUDY_BATTLE_DO", type: "durable_object_namespace", class_name: "StudyBattleDurableObject" },
    { name: "PRESENCE_DO", type: "durable_object_namespace", class_name: "PresenceDurableObject" },
  ]
  if (worker.migrationTag === CHAT_TAG) {
    requiredBindings.push({ name: "CHAT_DO", type: "durable_object_namespace", class_name: "ChatDurableObject" })
  } else {
    requireCondition(!snapshot.bindings.some((binding) => binding.name === "CHAT_DO"), "Chat is already bound before its expected migration.")
  }

  for (const expected of requiredBindings) {
    const matches = snapshot.bindings.filter((binding) => binding.name === expected.name)
    requireCondition(matches.length === 1, `Missing or duplicate required binding: ${expected.name}.`)
    const actual = matches[0]
    for (const [key, value] of Object.entries(expected)) {
      requireCondition(actual[key as keyof WorkerBinding] === value, `Unexpected target for required binding: ${expected.name}.`)
    }
    if (actual.type === "durable_object_namespace") {
      requireCondition(!actual.script_name || actual.script_name === WORKER_NAME, `Required binding ${expected.name} points to another Worker.`)
    }
  }

  const localNames = snapshot.availableMigrations
  requireCondition(localNames.length >= MINIMUM_APPLIED_MIGRATIONS, "Local migration history is incomplete.")
  localNames.forEach((name, index) => {
    requireCondition(
      /^\d{4}_[A-Za-z0-9_]+\.sql$/.test(name) && Number(name.slice(0, 4)) === index + 1,
      "Local migration filenames must form an ordered contiguous history.",
    )
  })
  requireCondition(
    snapshot.appliedMigrations.length >= MINIMUM_APPLIED_MIGRATIONS &&
      snapshot.appliedMigrations.length <= localNames.length &&
      snapshot.appliedMigrations.every((name, index) => name === localNames[index]),
    "Remote D1 migration ledger must match the known ordered local prefix.",
  )

  for (const [table, columns] of Object.entries(snapshot.columns)) {
    requireCondition(columns.includes("id"), `Required D1 table is missing or unreadable: ${table}.`)
  }
  const columnMigrations = [
    { migration: QUIZ_OWNERSHIP_MIGRATION, columns: snapshot.columns.quizzes, column: "created_by_user_id" },
    { migration: CALENDAR_MIGRATION, columns: snapshot.columns.users, column: "calendar_feed_token" },
    { migration: CALENDAR_MIGRATION, columns: snapshot.columns.calendar_events, column: "reminder_minutes" },
  ]
  for (const check of columnMigrations) {
    requireCondition(localNames.includes(check.migration), "Local additive-column migration history is incomplete.")
    requireCondition(
      check.columns.includes(check.column) === snapshot.appliedMigrations.includes(check.migration),
      `D1 schema and migration ledger disagree for ${check.column}; reconcile before applying migrations.`,
    )
  }
  requireCondition(snapshot.timeTravelBookmark.trim(), "A current D1 Time Travel bookmark is required before release.")

  return { workerMigrationTag: worker.migrationTag, pendingMigrations: localNames.slice(snapshot.appliedMigrations.length) }
}

function object(value: unknown): Record<string, unknown> {
  requireCondition(value !== null && typeof value === "object" && !Array.isArray(value), "Unexpected Cloudflare API response shape.")
  return value as Record<string, unknown>
}

function array(value: unknown): unknown[] {
  requireCondition(Array.isArray(value), "Unexpected Cloudflare API response shape.")
  return value
}

function string(value: unknown): string {
  requireCondition(typeof value === "string" && value.trim(), "Missing expected Cloudflare metadata.")
  return value
}

function optionalString(value: unknown) {
  return typeof value === "string" ? value : undefined
}

async function cloudflareRequest(token: string, endpoint: string, sql?: string): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/${endpoint}`, {
      method: sql ? "POST" : "GET",
      headers: { Authorization: `Bearer ${token}`, ...(sql ? { "Content-Type": "application/json" } : {}) },
      ...(sql ? { body: JSON.stringify({ sql }) } : {}),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: "error",
    })
  } catch {
    throw new Error("Cloudflare API request failed or timed out.")
  }
  // Never surface API response bodies: a provider error can echo request data.
  requireCondition(response.ok, `Cloudflare API request failed (HTTP ${response.status}).`)
  const payload: unknown = await response.json().catch(() => null)
  requireCondition(payload !== null && typeof payload === "object" && !Array.isArray(payload), `Cloudflare API returned invalid JSON (HTTP ${response.status}).`)
  const envelope = payload as Record<string, unknown>
  requireCondition(envelope.success === true, `Cloudflare API request rejected (HTTP ${response.status}).`)
  return envelope.result
}

function queryNames(result: unknown) {
  const query = object(result)
  requireCondition(query.success === true, "Cloudflare D1 metadata query failed (HTTP 200).")
  return array(query.results).map((row) => string(object(row).name))
}

async function runPreflight() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || ""
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim() || ""
  const githubSha = process.env.GITHUB_SHA?.trim() || null
  validateCredentials(accountId, Boolean(token))
  requireCondition(githubSha === null || /^[0-9a-f]{40}$/i.test(githubSha), "GITHUB_SHA must be a full source commit identifier.")
  const workers = array(await cloudflareRequest(token, "workers/scripts")).map((value) => {
    const worker = object(value)
    return { id: string(worker.id), migrationTag: optionalString(worker.migration_tag) }
  })
  existingWorker(workers)

  const settings = object(await cloudflareRequest(token, `workers/scripts/${WORKER_NAME}/settings`))
  const bindings = array(settings.bindings).map((value): WorkerBinding => {
    const binding = object(value)
    return {
      name: string(binding.name), type: string(binding.type), id: optionalString(binding.id),
      bucket_name: optionalString(binding.bucket_name), class_name: optionalString(binding.class_name),
      script_name: optionalString(binding.script_name),
    }
  })
  const database = object(await cloudflareRequest(token, `d1/database/${DATABASE_ID}`))
  const availableMigrations = fs.readdirSync(path.join(PROJECT_ROOT, "ops", "migrations")).filter((name) => name.endsWith(".sql")).sort()
  const queries = array(await cloudflareRequest(token, `d1/database/${DATABASE_ID}/query`, [
    "SELECT name FROM d1_migrations ORDER BY id",
    "PRAGMA table_info(quizzes)", "PRAGMA table_info(users)", "PRAGMA table_info(calendar_events)",
  ].join("; ")))
  requireCondition(queries.length === 4, "Cloudflare D1 preflight returned an incomplete metadata query batch.")
  const bookmark = object(await cloudflareRequest(token, `d1/database/${DATABASE_ID}/time_travel/bookmark`))
  const snapshot: CloudflareReleasePreflightSnapshot = {
    accountId, apiTokenPresent: true, workers, bindings,
    database: { id: string(database.uuid), name: string(database.name) },
    availableMigrations, appliedMigrations: queryNames(queries[0]),
    columns: { quizzes: queryNames(queries[1]), users: queryNames(queries[2]), calendar_events: queryNames(queries[3]) },
    timeTravelBookmark: string(bookmark.bookmark),
  }
  const plan = validateCloudflareReleasePreflight(snapshot)
  const receiptPath = path.join(PROJECT_ROOT, ".cache", "release", "cloudflare-preflight.json")
  const receipt: CloudflareReleaseReceipt = {
    checkedAt: new Date().toISOString(), githubSha, accountId,
    worker: { name: WORKER_NAME, migrationTag: plan.workerMigrationTag }, database: snapshot.database,
    appliedMigrations: snapshot.appliedMigrations, pendingMigrations: plan.pendingMigrations,
    columns: snapshot.columns, timeTravelBookmark: snapshot.timeTravelBookmark,
  }
  fs.mkdirSync(path.dirname(receiptPath), { recursive: true, mode: 0o700 })
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 })
  const summaryPath = path.join(path.dirname(receiptPath), "cloudflare-release-summary.json")
  fs.writeFileSync(summaryPath, `${JSON.stringify(createCloudflareReleaseSummary(receipt), null, 2)}\n`, { mode: 0o600 })
  console.log(`Cloudflare preflight passed: existing LEARN target, ${plan.pendingMigrations.length} pending migrations. Recovery receipt and sanitized summary saved.`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runPreflight().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Cloudflare preflight failed.")
    process.exitCode = 1
  })
}
