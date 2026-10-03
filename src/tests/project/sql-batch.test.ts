import assert from "node:assert/strict"
import test from "node:test"

import {
  MAX_BOUND_PARAMETERS,
  buildMultiRowInsert,
  chunkRowsForInsert,
  rowsPerInsertStatement,
} from "../../lib/sql-batch"
import { normalizeD1Sql } from "../../lib/db"

test("MAX_BOUND_PARAMETERS matches D1's documented ceiling", () => {
  assert.equal(MAX_BOUND_PARAMETERS, 100)
})

test("rowsPerInsertStatement divides the parameter budget by row width", () => {
  assert.equal(rowsPerInsertStatement(7), 14) // quiz_questions: 7 columns
  assert.equal(rowsPerInsertStatement(5), 20)
  assert.equal(rowsPerInsertStatement(100), 1)
  assert.equal(rowsPerInsertStatement(1), 100)
})

test("rowsPerInsertStatement never returns zero for an over-wide row", () => {
  // A row wider than the budget cannot be batched, but must still emit one
  // statement rather than producing an empty chunk list.
  assert.equal(rowsPerInsertStatement(250), 1)
  assert.equal(rowsPerInsertStatement(0), 100)
})

test("chunkRowsForInsert keeps every chunk inside the parameter budget", () => {
  const rows = Array.from({ length: 45 }, (_, index) => [index])
  const chunks = chunkRowsForInsert(rows, 7)

  assert.deepEqual(chunks.map((chunk) => chunk.length), [14, 14, 14, 3])
  assert.equal(chunks.flat().length, rows.length)
  for (const chunk of chunks) {
    assert.ok(chunk.length * 7 <= MAX_BOUND_PARAMETERS)
  }
})

test("chunkRowsForInsert returns nothing for an empty row list", () => {
  assert.deepEqual(chunkRowsForInsert([], 7), [])
})

test("buildMultiRowInsert numbers parameters in row-major order", () => {
  const built = buildMultiRowInsert({
    table: "quiz_questions",
    columns: ["id", "quiz_id", "question"],
    rows: [
      ["qq1", "quiz1", "First?"],
      ["qq2", "quiz1", "Second?"],
    ],
  })

  assert.ok(built)
  assert.equal(
    built.sql,
    "INSERT INTO quiz_questions (id, quiz_id, question) VALUES ($1, $2, $3), ($4, $5, $6)",
  )
  assert.deepEqual(built.values, ["qq1", "quiz1", "First?", "qq2", "quiz1", "Second?"])
})

test("buildMultiRowInsert applies jsonb casts without disturbing parameter order", () => {
  const built = buildMultiRowInsert({
    table: "quiz_questions",
    columns: ["id", "choices", "explanation"],
    rows: [["qq1", "[{\"id\":\"a\"}]", "because"]],
    jsonColumns: ["choices"],
  })

  assert.ok(built)
  assert.equal(
    built.sql,
    "INSERT INTO quiz_questions (id, choices, explanation) VALUES ($1, $2::jsonb, $3)",
  )
  assert.deepEqual(built.values, ["qq1", "[{\"id\":\"a\"}]", "because"])
})

test("buildMultiRowInsert round-trips through normalizeD1Sql with aligned values", () => {
  // The real risk this guards: `normalizeD1Sql` reorders values by the `$n`
  // index it rewrites, so any drift between placeholder numbering and the
  // values array would silently bind the wrong data to the wrong column.
  const built = buildMultiRowInsert({
    table: "quiz_questions",
    columns: ["id", "choices"],
    rows: [
      ["a", "[]"],
      ["b", "[]"],
      ["c", "[]"],
    ],
    jsonColumns: ["choices"],
  })

  assert.ok(built)
  const normalized = normalizeD1Sql(built.sql, built.values)

  assert.equal(normalized.sql, "INSERT INTO quiz_questions (id, choices) VALUES (?, ?), (?, ?), (?, ?)")
  assert.deepEqual(normalized.values, ["a", "[]", "b", "[]", "c", "[]"])
})

test("buildMultiRowInsert appends an optional conflict clause", () => {
  const built = buildMultiRowInsert({
    table: "tags",
    columns: ["id", "name"],
    rows: [["t1", "sql"]],
    onConflict: "ON CONFLICT (id) DO NOTHING",
  })

  assert.ok(built)
  assert.equal(built.sql, "INSERT INTO tags (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING")
})

test("buildMultiRowInsert keeps jsonb casts on a batched upsert", () => {
  // The exact shape `seedKnowledgeGraphForUser` emits: 13 columns, one JSON
  // column, and the conflict clause of the per-row statement it replaced. The
  // D1 HTTP boundary strips `::jsonb` in `normalizeD1Sql`, so this is the only
  // place the cast can be observed — losing it here would silently change how
  // the JSON column is stored on the binding path.
  const columns = [
    "id", "user_id", "workspace_id", "source_type", "source_id", "title", "summary", "mastery",
    "visibility", "position_x", "position_y", "position_z", "metadata",
  ]
  const built = buildMultiRowInsert({
    table: "knowledge_nodes",
    columns,
    rows: [
      ["node_a", "user_1", "workspace_demo", "note", "a", "A", "", 0.35, "private", 120, 0, 0, "{}"],
      ["node_b", "user_1", "workspace_demo", "note", "b", "B", "", 0.47, "connections", 64, 84, 0, "{}"],
    ],
    jsonColumns: ["metadata"],
    onConflict: "ON CONFLICT (id) DO NOTHING",
  })

  assert.ok(built)
  assert.equal(built.sql, `INSERT INTO knowledge_nodes (${columns.join(", ")}) VALUES (${[
    "$1", "$2", "$3", "$4", "$5", "$6", "$7", "$8", "$9", "$10", "$11", "$12", "$13::jsonb",
  ].join(", ")}), (${[
    "$14", "$15", "$16", "$17", "$18", "$19", "$20", "$21", "$22", "$23", "$24", "$25", "$26::jsonb",
  ].join(", ")}) ON CONFLICT (id) DO NOTHING`)
  assert.equal(built.values.length, 26)
  assert.equal(built.values[12], "{}")
  assert.equal(built.values[25], "{}")
})

test("buildMultiRowInsert keeps a DO UPDATE clause on a batched upsert", () => {
  const built = buildMultiRowInsert({
    table: "feed_rank_cache",
    columns: ["id", "user_id", "lesson_id", "topic_key", "reason", "rank_score", "topic_tags", "expires_at"],
    rows: [
      ["c1", "u1", "l1", "study", "preferred", 0.9, "[]", "2026-09-21T07:00:00.000Z"],
      ["c2", "u1", "l2", "study", "serendipity", 0.8, "[]", "2026-09-21T07:00:00.000Z"],
    ],
    jsonColumns: ["topic_tags"],
    onConflict: `ON CONFLICT (user_id, lesson_id, topic_key) DO UPDATE
     SET reason = EXCLUDED.reason,
         rank_score = EXCLUDED.rank_score`,
  })

  assert.ok(built)
  assert.match(built.sql, /VALUES \(\$1, \$2, \$3, \$4, \$5, \$6, \$7::jsonb, \$8\), \(\$9, \$10, \$11, \$12, \$13, \$14, \$15::jsonb, \$16\)/)
  assert.match(built.sql, /ON CONFLICT \(user_id, lesson_id, topic_key\) DO UPDATE/)
  assert.match(built.sql, /rank_score = EXCLUDED\.rank_score/)
})

test("buildMultiRowInsert returns null rather than emitting a tuple-less INSERT", () => {
  assert.equal(buildMultiRowInsert({ table: "quiz_questions", columns: ["id"], rows: [] }), null)
})

test("buildMultiRowInsert rejects rows that do not match the column count", () => {
  assert.throws(
    () => buildMultiRowInsert({ table: "tags", columns: ["id", "name"], rows: [["only-one"]] }),
    /row 0 has 1 value\(s\) but 2 column\(s\) were declared/,
  )
})

test("buildMultiRowInsert rejects a column-less statement", () => {
  assert.throws(
    () => buildMultiRowInsert({ table: "tags", columns: [], rows: [["x"]] }),
    /at least one column/,
  )
})
