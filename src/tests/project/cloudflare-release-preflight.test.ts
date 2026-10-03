import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { createCloudflareReleaseSummary, validateCloudflareReleasePreflight, type CloudflareReleasePreflightSnapshot } from "../../../ops/scripts/deploy/cloudflare-preflight"

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
const AVAILABLE_MIGRATIONS = fs.readdirSync(path.join(PROJECT_ROOT, "ops", "migrations")).filter((name) => name.endsWith(".sql")).sort()

function snapshot(): CloudflareReleasePreflightSnapshot {
  return {
    accountId: "d105a82bc26b6913575355352c2d1bb1", apiTokenPresent: true,
    workers: [{ id: "unrelated-worker" }, { id: "learn", migrationTag: "v6_add_presence_durable_object" }],
    bindings: [
      { name: "LEARN_DB", type: "d1", id: "3eeb04af-c283-48c0-9469-82b64392fa79" },
      { name: "LEARN_FILES", type: "r2_bucket", bucket_name: "learn-files" },
      { name: "NEXT_INC_CACHE_R2_BUCKET", type: "r2_bucket", bucket_name: "learn-next-cache" },
      { name: "STUDY_ROOM_DO", type: "durable_object_namespace", class_name: "StudyRoomDurableObject" },
      { name: "STUDY_BATTLE_DO", type: "durable_object_namespace", class_name: "StudyBattleDurableObject" },
      { name: "PRESENCE_DO", type: "durable_object_namespace", class_name: "PresenceDurableObject" },
    ],
    database: { id: "3eeb04af-c283-48c0-9469-82b64392fa79", name: "learn-db" },
    availableMigrations: [...AVAILABLE_MIGRATIONS], appliedMigrations: AVAILABLE_MIGRATIONS.slice(0, 12),
    columns: { quizzes: ["id"], users: ["id"], calendar_events: ["id"] },
    timeTravelBookmark: "synthetic-private-bookmark",
  }
}

test("existing target accepts only the unapplied local migration suffix", () => {
  assert.deepEqual(validateCloudflareReleasePreflight(snapshot()), {
    workerMigrationTag: "v6_add_presence_durable_object", pendingMigrations: AVAILABLE_MIGRATIONS.slice(12),
  })
})

test("already deployed Chat and completed schema permit a repeated release", () => {
  const state = snapshot()
  state.workers[1].migrationTag = "v7_add_chat_durable_object"
  state.bindings.push({ name: "CHAT_DO", type: "durable_object_namespace", class_name: "ChatDurableObject" })
  state.appliedMigrations = [...AVAILABLE_MIGRATIONS]
  state.columns.quizzes.push("created_by_user_id")
  state.columns.users.push("calendar_feed_token")
  state.columns.calendar_events.push("reminder_minutes")
  assert.deepEqual(validateCloudflareReleasePreflight(state).pendingMigrations, [])
})

test("valid partially applied ownership and calendar prefixes can continue", () => {
  for (const appliedCount of [13, 14]) {
    const state = snapshot()
    state.appliedMigrations = AVAILABLE_MIGRATIONS.slice(0, appliedCount)
    state.columns.quizzes.push("created_by_user_id")
    if (appliedCount === 14) {
      state.columns.users.push("calendar_feed_token")
      state.columns.calendar_events.push("reminder_minutes")
    }
    assert.deepEqual(validateCloudflareReleasePreflight(state).pendingMigrations, AVAILABLE_MIGRATIONS.slice(appliedCount))
  }
})

test("hosted summary retains target and source evidence without the private bookmark", () => {
  const state = snapshot()
  const plan = validateCloudflareReleasePreflight(state)
  const receipt = {
    checkedAt: "2026-10-03T00:00:00.000Z", githubSha: "a".repeat(40), accountId: state.accountId,
    worker: { name: "learn", migrationTag: plan.workerMigrationTag }, database: state.database,
    appliedMigrations: state.appliedMigrations, pendingMigrations: plan.pendingMigrations,
    columns: state.columns, timeTravelBookmark: state.timeTravelBookmark,
  }
  const summary = createCloudflareReleaseSummary(receipt)
  assert.equal(summary.githubSha, receipt.githubSha)
  assert.deepEqual(summary.pendingMigrations, AVAILABLE_MIGRATIONS.slice(12))
  assert.ok(!("timeTravelBookmark" in summary))
  assert.ok(!JSON.stringify(summary).includes(state.timeTravelBookmark))
})

test("wrong account or missing token cannot pass release preflight", () => {
  const wrongAccount = snapshot()
  wrongAccount.accountId = "another-account"
  assert.throws(() => validateCloudflareReleasePreflight(wrongAccount), /configured LEARN account/)
  const missingToken = snapshot()
  missingToken.apiTokenPresent = false
  assert.throws(() => validateCloudflareReleasePreflight(missingToken), /CLOUDFLARE_API_TOKEN/)
})

test("unknown live history or absent/duplicate learn target fails closed", () => {
  const unknownTag = snapshot()
  unknownTag.workers[1].migrationTag = "unreconciled-tag"
  assert.throws(() => validateCloudflareReleasePreflight(unknownTag), /migration tag/)
  const absent = snapshot()
  absent.workers = []
  assert.throws(() => validateCloudflareReleasePreflight(absent), /exactly one existing learn Worker/)
  const duplicate = snapshot()
  duplicate.workers.push({ ...duplicate.workers[1] })
  assert.throws(() => validateCloudflareReleasePreflight(duplicate), /exactly one existing learn Worker/)
})

test("missing, redirected, or changed legacy bindings block release", () => {
  for (const name of ["STUDY_ROOM_DO", "STUDY_BATTLE_DO", "PRESENCE_DO"]) {
    const missing = snapshot()
    missing.bindings = missing.bindings.filter((binding) => binding.name !== name)
    assert.throws(() => validateCloudflareReleasePreflight(missing), /required binding/)
  }
  const changed = snapshot()
  changed.bindings[3].class_name = "ReplacementStudyRoom"
  assert.throws(() => validateCloudflareReleasePreflight(changed), /Unexpected target/)
  const redirected = snapshot()
  redirected.bindings[3].script_name = "another-worker"
  assert.throws(() => validateCloudflareReleasePreflight(redirected), /another Worker/)
})

test("database or bucket changes cannot silently retarget the release", () => {
  const database = snapshot()
  database.database.name = "another-database"
  assert.throws(() => validateCloudflareReleasePreflight(database), /existing learn-db/)
  const binding = snapshot()
  binding.bindings[0].id = "another-database-id"
  assert.throws(() => validateCloudflareReleasePreflight(binding), /Unexpected target/)
  const bucket = snapshot()
  bucket.bindings[1].bucket_name = "another-bucket"
  assert.throws(() => validateCloudflareReleasePreflight(bucket), /Unexpected target/)
})

test("unknown, skipped, repeated, or truncated ledger entries are rejected", () => {
  for (const change of ["unknown", "gap", "duplicate", "truncated"]) {
    const state = snapshot()
    if (change === "unknown") state.appliedMigrations[5] = "0006_unrecognized.sql"
    if (change === "gap") state.appliedMigrations.splice(5, 1)
    if (change === "duplicate") state.appliedMigrations.splice(5, 0, state.appliedMigrations[5])
    if (change === "truncated") state.appliedMigrations = []
    assert.throws(() => validateCloudflareReleasePreflight(state), /known ordered local prefix/)
  }
})

test("local migration files must remain an ordered contiguous history", () => {
  const state = snapshot()
  state.availableMigrations.splice(5, 1)
  assert.throws(() => validateCloudflareReleasePreflight(state), /ordered contiguous history/)
})

test("pending additive-column migrations reject an already changed schema", () => {
  for (const [table, column] of [
    ["quizzes", "created_by_user_id"], ["users", "calendar_feed_token"], ["calendar_events", "reminder_minutes"],
  ] as const) {
    const state = snapshot()
    state.columns[table].push(column)
    assert.throws(() => validateCloudflareReleasePreflight(state), /schema and migration ledger disagree/)
  }
})

test("applied column migrations require their columns to exist", () => {
  const state = snapshot()
  state.appliedMigrations = AVAILABLE_MIGRATIONS.slice(0, 14)
  assert.throws(() => validateCloudflareReleasePreflight(state), /schema and migration ledger disagree/)
})

test("partially applied calendar schema cannot pass with a completed ledger", () => {
  const state = snapshot()
  state.appliedMigrations = AVAILABLE_MIGRATIONS.slice(0, 14)
  state.columns.quizzes.push("created_by_user_id")
  state.columns.users.push("calendar_feed_token")
  assert.throws(() => validateCloudflareReleasePreflight(state), /reminder_minutes/)
})

test("missing recovery bookmark, base table, or Chat binding blocks release", () => {
  const bookmark = snapshot()
  bookmark.timeTravelBookmark = ""
  assert.throws(() => validateCloudflareReleasePreflight(bookmark), /Time Travel bookmark/)
  const table = snapshot()
  table.columns.users = []
  assert.throws(() => validateCloudflareReleasePreflight(table), /Required D1 table/)
  const chat = snapshot()
  chat.workers[1].migrationTag = "v7_add_chat_durable_object"
  assert.throws(() => validateCloudflareReleasePreflight(chat), /required binding: CHAT_DO/)
})
