import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { DatabaseSync, type SQLInputValue } from "node:sqlite"
import { fileURLToPath } from "node:url"
import { installDatabaseStub, primeDatabase, type DatabaseStub, type RecordedStatement } from "./harness"

export async function createSqliteFixture() {
  const database = new DatabaseSync(":memory:")
  const migrations = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../ops/migrations")
  for (const file of readdirSync(migrations).filter((name) => name.endsWith(".sql")).sort()) {
    database.exec(readFileSync(path.join(migrations, file), "utf8"))
  }
  const stub = installDatabaseStub()
  await primeDatabase(stub)
  installSqliteStore(stub, database)
  return {
    database,
    stub,
    close() { stub.restore(); database.close() },
  }
}

/** A test transport only: production D1 supplies the transaction, not this hook. */
export function installSqliteStore(stub: DatabaseStub, database: DatabaseSync, input: {
  pattern?: RegExp
  beforeBatch?: (statements: RecordedStatement[]) => Promise<void> | void
} = {}) {
  stub.on(input.pattern ?? /[\s\S]*/, (sql, params) => {
    const statement = database.prepare(sql)
    const values = params.map((value): SQLInputValue => {
      if (value === null || typeof value === "string" || typeof value === "number") return value
      throw new Error("Unexpected SQLite test parameter")
    })
    if (/^\s*(SELECT|WITH|PRAGMA)\b/i.test(sql)) return { rows: statement.all(...values) }
    return { rowCount: Number(statement.run(...values).changes) }
  })
  stub.onBatch(async (statements, execute) => {
    await input.beforeBatch?.(statements)
    database.exec("BEGIN")
    try {
      const results = execute()
      database.exec("COMMIT")
      return results
    } catch (error) {
      database.exec("ROLLBACK")
      throw error
    }
  })
}

/** Makes both requests finish their stale reads before either transaction runs. */
export function simultaneousBatchBarrier() {
  let arrivals = 0
  let release = () => {}
  let refuse: (error: Error) => void = () => {}
  let timeout: ReturnType<typeof setTimeout> | undefined
  const ready = new Promise<void>((resolve, reject) => { release = resolve; refuse = reject })
  return async () => {
    arrivals += 1
    if (arrivals === 1) timeout = setTimeout(() => refuse(new Error("Both concurrent requests must reach the batch barrier")), 5000)
    if (arrivals === 2) { clearTimeout(timeout); release() }
    await ready
  }
}
