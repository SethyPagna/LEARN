import assert from "node:assert/strict"
import { DatabaseSync, type SQLInputValue } from "node:sqlite"
import test from "node:test"
import type { D1DatabaseLike, D1StatementLike } from "../../lib/cloudflare"
import { queryBatch, queryBatchWithBinding } from "../../lib/db"
import { installDatabaseStub } from "../api/harness"

class SQLiteStatement implements D1StatementLike {
  constructor(readonly database: DatabaseSync, readonly sql: string, readonly values: SQLInputValue[] = []) {}
  bind(...values: unknown[]) {
    return new SQLiteStatement(this.database, this.sql, values.map((value): SQLInputValue => {
      if (value === null || typeof value === "string" || typeof value === "number") return value
      throw new Error("Unexpected test binding value")
    }))
  }
  async all<T>() { return { results: this.database.prepare(this.sql).all(...this.values) as T[] } }
  async run() { return { meta: { changes: Number(this.database.prepare(this.sql).run(...this.values).changes) } } }
  async first<T>() { return this.database.prepare(this.sql).get(...this.values) as T | null }
}

function sqliteBinding(database: DatabaseSync): D1DatabaseLike {
  return {
    prepare(sql) { return new SQLiteStatement(database, sql) },
    async batch<T>(statements: D1StatementLike[]) {
      database.exec("BEGIN")
      try {
        const results = statements.map((statement) => {
          assert.ok(statement instanceof SQLiteStatement)
          if (/^SELECT\b/i.test(statement.sql)) {
            return { success: true, results: database.prepare(statement.sql).all(...statement.values).map((row) => ({ ...row })) as T[], meta: { changes: 0 } }
          }
          return { success: true, results: [] as T[], meta: { changes: Number(database.prepare(statement.sql).run(...statement.values).changes) } }
        })
        database.exec("COMMIT")
        return results
      } catch (error) {
        database.exec("ROLLBACK")
        throw error
      }
    },
    async exec(sql) { return database.exec(sql) },
  }
}

test("D1 binding batches normalize repeated placeholders and preserve zero-change results", async () => {
  const database = new DatabaseSync(":memory:")
  database.exec("CREATE TABLE value_store (id TEXT PRIMARY KEY, value INTEGER); INSERT INTO value_store VALUES ('item', 2)")
  try {
    const results = await queryBatchWithBinding(sqliteBinding(database), [
      { sql: "UPDATE value_store SET value = $2 WHERE id = $1 AND value = $2", params: ["item", 3] },
      { sql: "SELECT value FROM value_store WHERE id = $1", params: ["item"] },
    ])
    assert.deepEqual(results, [{ rows: [], rowCount: 0 }, { rows: [{ value: 2 }], rowCount: 1 }])
  } finally { database.close() }
})

test("a failed second D1 binding statement rolls back the first without HTTP fallback", async () => {
  const database = new DatabaseSync(":memory:")
  const stub = installDatabaseStub()
  database.exec("CREATE TABLE value_store (id TEXT PRIMARY KEY, value INTEGER); INSERT INTO value_store VALUES ('item', 2)")
  try {
    await assert.rejects(queryBatchWithBinding(sqliteBinding(database), [
      { sql: "UPDATE value_store SET value = $1", params: [3] },
      { sql: "INSERT INTO missing_table VALUES ($1)", params: [1] },
    ]), /missing_table/)
    assert.equal(database.prepare("SELECT value FROM value_store").get()?.value, 2)
    assert.equal(stub.statements.length, 0)
  } finally { stub.restore(); database.close() }
})

test("D1 REST batches send the documented batch envelope and return each statement's count", async () => {
  const stub = installDatabaseStub()
  let calls = 0
  try {
    globalThis.fetch = async (input, init) => {
      calls += 1
      assert.match(String(input), /\/d1\/database\/learn-test-db\/query$/)
      assert.deepEqual(JSON.parse(String(init?.body)), { batch: [
        { sql: "UPDATE value_store SET value = ? WHERE id = ? AND value = ?", params: [3, "item", 3] },
        { sql: "SELECT value FROM value_store WHERE id = ?", params: ["item"] },
      ] })
      return new Response(JSON.stringify({ success: true, result: [
        { success: true, results: [], meta: { changes: 0 } },
        { success: true, results: [{ value: 2 }], meta: { changes: 0 } },
      ] }), { status: 200 })
    }
    const results = await queryBatch([
      { sql: "UPDATE value_store SET value = $2 WHERE id = $1 AND value = $2", params: ["item", 3] },
      { sql: "SELECT value FROM value_store WHERE id = $1", params: ["item"] },
    ])
    assert.deepEqual(results, [{ rows: [], rowCount: 0 }, { rows: [{ value: 2 }], rowCount: 1 }])
    assert.equal(calls, 1)
  } finally { stub.restore() }
})

test("uncertain or malformed D1 REST batch responses propagate without replay", async (t) => {
  const cases = [
    { name: "lost network response", response() { throw new Error("Lost response") }, error: /Lost response/ },
    { name: "missing write count", response() { return new Response(JSON.stringify({ success: true, result: [{ success: true, results: [] }] })) }, error: /valid change count/ },
    { name: "incomplete results", response() { return new Response(JSON.stringify({ success: true, result: [] })) }, error: /incomplete batch/ },
    { name: "failed statement", response() { return new Response(JSON.stringify({ success: true, result: [{ success: false, error: "constraint failure" }] })) }, error: /constraint failure/ },
  ]
  for (const entry of cases) await t.test(entry.name, async () => {
    const stub = installDatabaseStub()
    let calls = 0
    try {
      globalThis.fetch = async () => { calls += 1; return entry.response() }
      await assert.rejects(queryBatch([{ sql: "UPDATE value_store SET value = 3" }]), entry.error)
      assert.equal(calls, 1)
    } finally { stub.restore() }
  })
})
