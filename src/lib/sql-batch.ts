/**
 * Helpers for collapsing serial N+1 `INSERT` loops into multi-row statements.
 *
 * The data layer used to write related rows one statement at a time inside a
 * `for` loop (quiz questions, practice items, attempt answers, …). D1 processes
 * a database's queries strictly one at a time, so a 20-question quiz cost 20
 * sequential round trips. A multi-row `INSERT` collapses that into one.
 *
 * ## Why the chunking is not optional
 *
 * D1 documents a hard **maximum of 100 bound parameters per query**
 * (https://developers.cloudflare.com/d1/platform/limits/, verified 2026-04-21).
 * A statement with more placeholders than that is rejected outright, so every
 * generated statement must be split into chunks that fit. Note this is a
 * *separate* limit from SQLite's `SQLITE_MAX_VARIABLE_NUMBER`, and it is lower.
 */

/** D1's documented ceiling on bound parameters in a single query. */
export const MAX_BOUND_PARAMETERS = 100

/**
 * How many rows of a given width can share one `INSERT` statement.
 *
 * Always at least 1 so a pathologically wide row still produces a valid
 * (if non-batched) statement rather than an empty chunk list.
 */
export function rowsPerInsertStatement(columnsPerRow: number) {
  const width = Math.max(1, Math.floor(columnsPerRow))
  return Math.max(1, Math.floor(MAX_BOUND_PARAMETERS / width))
}

/** Split `rows` into groups that each fit within D1's bound-parameter limit. */
export function chunkRowsForInsert<T>(rows: readonly T[], columnsPerRow: number): T[][] {
  const size = rowsPerInsertStatement(columnsPerRow)
  const chunks: T[][] = []
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size))
  }
  return chunks
}

export interface MultiRowInsertInput {
  table: string
  columns: readonly string[]
  rows: readonly (readonly unknown[])[]
  /** Column names that hold JSON text and should carry a `::jsonb` cast. */
  jsonColumns?: readonly string[]
  /** Optional trailing clause, e.g. `ON CONFLICT (id) DO NOTHING`. */
  onConflict?: string
}

export interface BuiltStatement {
  sql: string
  values: unknown[]
}

/**
 * Build a single multi-row `INSERT` statement for `rows`.
 *
 * Placeholders use the project's `$n` convention; `normalizeD1Sql()` rewrites
 * them to `?` for D1 at execution time.
 *
 * Returns `null` for an empty row list — callers should treat that as a no-op
 * rather than issuing `INSERT … VALUES` with no tuples, which is a syntax error.
 */
export function buildMultiRowInsert(input: MultiRowInsertInput): BuiltStatement | null {
  const { table, columns, rows, jsonColumns = [], onConflict } = input
  if (!rows.length) return null
  if (!columns.length) throw new Error("buildMultiRowInsert requires at least one column.")

  const jsonSet = new Set(jsonColumns)
  const values: unknown[] = []
  const tuples: string[] = []

  rows.forEach((row, rowIndex) => {
    if (row.length !== columns.length) {
      throw new Error(
        `buildMultiRowInsert: row ${rowIndex} has ${row.length} value(s) but ${columns.length} column(s) were declared.`,
      )
    }

    const parts = columns.map((column, columnIndex) => {
      values.push(row[columnIndex])
      const parameter = rowIndex * columns.length + columnIndex + 1
      return jsonSet.has(column) ? `$${parameter}::jsonb` : `$${parameter}`
    })

    tuples.push(`(${parts.join(", ")})`)
  })

  const conflict = onConflict ? ` ${onConflict}` : ""
  return {
    sql: `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${tuples.join(", ")}${conflict}`,
    values,
  }
}
