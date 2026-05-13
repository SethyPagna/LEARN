import assert from "node:assert/strict"
import test from "node:test"
import {
  getCloudflareRuntimeMode,
  getD1ApiConfig,
  isD1ReadStatement,
  normalizeD1Sql,
} from "../lib/db"
import {
  buildR2ObjectKey,
  getR2ApiConfig,
} from "../lib/storage"

test("normalizeD1Sql converts numbered placeholders and casts for D1", () => {
  const normalized = normalizeD1Sql(
    "SELECT count(*)::int AS count FROM notes WHERE id = $1 AND updated_at > now() AND data = $2::jsonb",
    ["note_1", JSON.stringify({ ok: true })],
  )

  assert.equal(
    normalized.sql,
    "SELECT count(*) AS count FROM notes WHERE id = ? AND updated_at > datetime('now') AND data = ?",
  )
  assert.deepEqual(normalized.values, ["note_1", JSON.stringify({ ok: true })])
})

test("getD1ApiConfig requires Cloudflare account, token, and database id for API mode", () => {
  const config = getD1ApiConfig({
    CLOUDFLARE_ACCOUNT_ID: "account_123",
    CLOUDFLARE_API_TOKEN: "token_123",
    CLOUDFLARE_D1_DATABASE_ID: "db_123",
  })

  assert.deepEqual(config, {
    accountId: "account_123",
    apiToken: "token_123",
    databaseId: "db_123",
  })
})

test("isD1ReadStatement only sends row-returning statements through all", () => {
  assert.equal(isD1ReadStatement("SELECT * FROM users"), true)
  assert.equal(isD1ReadStatement("WITH recent AS (SELECT * FROM notes) SELECT * FROM recent"), true)
  assert.equal(isD1ReadStatement("PRAGMA foreign_keys = ON"), true)
  assert.equal(isD1ReadStatement("INSERT INTO users (id) VALUES ($1)"), false)
  assert.equal(isD1ReadStatement("UPDATE notes SET title = $1"), false)
  assert.equal(isD1ReadStatement("DELETE FROM notes WHERE id = $1"), false)
})

test("getCloudflareRuntimeMode distinguishes binding, api, and unconfigured runtimes", () => {
  assert.equal(getCloudflareRuntimeMode({ hasD1Binding: true }), "cloudflare-binding")
  assert.equal(getCloudflareRuntimeMode({
    env: {
      CLOUDFLARE_ACCOUNT_ID: "account_123",
      CLOUDFLARE_API_TOKEN: "token_123",
      CLOUDFLARE_D1_DATABASE_ID: "db_123",
    },
  }), "cloudflare-api")
  assert.equal(getCloudflareRuntimeMode({ env: {} }), "local")
})

test("getR2ApiConfig builds the Cloudflare R2 S3 endpoint", () => {
  const config = getR2ApiConfig({
    CLOUDFLARE_ACCOUNT_ID: "account_123",
    CLOUDFLARE_R2_ACCESS_KEY_ID: "access_123",
    CLOUDFLARE_R2_SECRET_ACCESS_KEY: "secret_123",
    CLOUDFLARE_R2_BUCKET: "learn-files",
  })

  assert.equal(config?.bucket, "learn-files")
  assert.equal(config?.endpoint, "https://account_123.r2.cloudflarestorage.com")
})

test("buildR2ObjectKey isolates LEARN files under an app namespace", () => {
  const key = buildR2ObjectKey({
    userId: "user_admin",
    assetId: "asset_123",
    filename: "Unit 1 Notes.pdf",
  })

  assert.equal(key, "apps/learn/workspaces/workspace_demo/users/user_admin/asset_123-Unit-1-Notes.pdf")
})
