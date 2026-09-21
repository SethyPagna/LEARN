/**
 * The data layer's starter-data seeds used to write related rows one statement
 * per row (`for (… ) { await query(INSERT …) }`). D1 serves a database strictly
 * one query at a time, so a five-note knowledge graph cost nine sequential
 * round trips before the user saw anything.
 *
 * These tests drive the *real* seed paths — `getVaultGraph`, `listReviewSchedule`,
 * `listFeed`, `listAchievements` — through the real `query()` and the real SQL
 * normaliser, and assert on the statements that reached the D1 boundary. They
 * pin the two things that matter and would silently break a revert:
 *
 *   1. N rows cost `ceil(N / rowsPerInsertStatement(width))` statements, not N.
 *   2. The `ON CONFLICT` clause of the original per-row statement survives on
 *      every generated statement — `DO NOTHING` and `DO UPDATE` alike.
 *
 * The sqlb casts are asserted in `project/sql-batch.test.ts` instead: the D1
 * HTTP boundary strips `::jsonb` in `normalizeD1Sql`, so it is not observable
 * from here.
 */

import assert from "node:assert/strict"
import test from "node:test"

import { installDatabaseStub, primeDatabase } from "../api/harness"
import { MAX_BOUND_PARAMETERS, rowsPerInsertStatement } from "../../lib/sql-batch"
import type { DatabaseStub } from "../api/harness"
import type { User } from "../../lib/data"

const USER: User = {
  id: "user_test",
  username: "test_learner",
  email: "test@learn.local",
  name: "Test Learner",
  role: "learner",
  preferences: {},
}

/** A `notes` row as `listNotes()` returns it: tags arrive as JSON text. */
function noteRow(index: number) {
  return {
    id: `note_${index}`,
    title: `Note ${index}`,
    icon: "book",
    content: `Content for note ${index}`,
    favorite: index % 2 === 0 ? 1 : 0,
    template: "",
    archived_at: null,
    updated_at: "2026-09-21 06:00:00",
    tags: "[]",
  }
}

function noteRows(count: number) {
  return Array.from({ length: count }, (_, index) => noteRow(index + 1))
}

/** A published micro-lesson row as `listFeed()` reads it. */
function microLessonRow(index: number) {
  return {
    id: `lesson_${index}`,
    title: `Lesson ${index}`,
    summary: `Summary ${index}`,
    duration_seconds: 90,
    topic_tags: JSON.stringify(["memory", "study"]),
    question: "What makes a review useful?",
    choices: JSON.stringify([{ id: "a", text: "Recall first" }]),
    correct_choice_id: "a",
    explanation: "Retrieval practice.",
    status: "published",
    updated_at: "2026-09-21 06:00:00",
    interaction_count: 0,
  }
}

/** Every `?` the normaliser emitted for a statement — one per bound value. */
function placeholderCount(sql: string) {
  return (sql.match(/\?/g) || []).length
}

/**
 * A chunk guard that applies to every test here: no statement may exceed D1's
 * bound-parameter ceiling, or D1 rejects the whole write.
 */
function assertWithinParameterBudget(stub: DatabaseStub) {
  for (const statement of stub.statements) {
    assert.ok(
      statement.params.length <= MAX_BOUND_PARAMETERS,
      `statement bound ${statement.params.length} parameters, over D1's ${MAX_BOUND_PARAMETERS} ceiling:\n${statement.sql}`,
    )
  }
}

test("seeding the knowledge graph writes one batched statement per table", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stub.on(/INSERT INTO knowledge_nodes/, { rowCount: 1 })
    stub.on(/INSERT INTO knowledge_edges/, { rowCount: 1 })

    const { getVaultGraph } = await import("../../lib/data")

    // Five notes is the widest the seed ever gets (`listNotes().slice(0, 5)`).
    for (const count of [1, 2, 3, 4, 5]) {
      stub.reset()
      stub.on(/FROM notes n/, { rows: noteRows(count) })
      stub.on(/INSERT INTO knowledge_nodes/, { rowCount: 1 })
      stub.on(/INSERT INTO knowledge_edges/, { rowCount: 1 })

      await getVaultGraph(USER)

      const nodeInserts = stub.matching(/INSERT INTO knowledge_nodes/)
      const edgeInserts = stub.matching(/INSERT INTO knowledge_edges/)

      // 13 columns per node row, so 7 rows share a statement.
      assert.equal(nodeInserts.length, Math.ceil(count / rowsPerInsertStatement(13)), `${count} notes → node statements`)
      assert.equal(nodeInserts.length, 1, `${count} notes must not fan out into ${count} statements`)
      assert.equal(nodeInserts[0].params.length, count * 13)

      // N notes make N-1 consecutive edges, 8 columns each.
      const expectedEdges = count >= 2 ? 1 : 0
      assert.equal(edgeInserts.length, expectedEdges, `${count} notes → edge statements`)
      if (expectedEdges) assert.equal(edgeInserts[0].params.length, (count - 1) * 8)

      // One value tuple per row, not one statement per row.
      assert.equal(placeholderCount(nodeInserts[0].sql), count * 13)

      // The conflict clauses are the ones the per-row statements used.
      assert.match(nodeInserts[0].sql, /ON CONFLICT \(id\) DO NOTHING$/)
      if (expectedEdges) {
        assert.match(edgeInserts[0].sql, /ON CONFLICT \(source_node_id, target_node_id, edge_type\) DO NOTHING$/)
      }

      // Values stay parameterised, and the metadata column keeps its JSON text.
      assert.ok(nodeInserts[0].params.includes("note_1"))
      assert.ok(nodeInserts[0].params.includes(USER.id))
      assert.equal(nodeInserts[0].params[0], "node_note_1")
      assert.equal(nodeInserts[0].params[9], Math.cos(0) * 120)
      assert.equal(String(nodeInserts[0].params[12]), JSON.stringify({ icon: "book", tags: [] }))
      // Favourited notes are shared, the rest stay private — note 1 is not a
      // favourite in the fixture, note 2 is.
      assert.equal(nodeInserts[0].params[8], "private")
      if (count >= 2) assert.equal(nodeInserts[0].params[13 + 8], "connections")
    }

    assertWithinParameterBudget(stub)
  } finally {
    stub.restore()
  }
})

test("seeding review items writes one batched statement with the original conflict target", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stub.on(/FROM notes n/, { rows: noteRows(6) })
    stub.on(/INSERT INTO review_items/, { rowCount: 1 })

    const { listReviewSchedule } = await import("../../lib/data")
    await listReviewSchedule(USER)

    const inserts = stub.matching(/INSERT INTO review_items/)
    assert.equal(inserts.length, 1, "six notes must not cost six statements")
    assert.equal(inserts[0].params.length, 6 * 12)
    assert.equal(placeholderCount(inserts[0].sql), 6 * 12)
    assert.match(inserts[0].sql, /ON CONFLICT \(user_id, source_type, source_id\) DO NOTHING$/)

    // Row-major binding: every 12th value from index 11 is the metadata column.
    for (let index = 0; index < 6; index += 1) {
      assert.equal(inserts[0].params[index * 12 + 2], "note") // source_type
      assert.match(String(inserts[0].params[index * 12 + 11]), /^\{/)
    }

    assertWithinParameterBudget(stub)
  } finally {
    stub.restore()
  }
})

test("seeding micro-lessons batches, and the feed cache batches with DO UPDATE intact", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stub.on(/count\(\*\) AS count FROM micro_lessons/, { rows: [{ count: 0 }] })
    stub.on(/INSERT INTO micro_lessons/, { rowCount: 1 })
    stub.on(/FROM micro_lessons ml/, { rows: [microLessonRow(1), microLessonRow(2), microLessonRow(3)] })
    stub.on(/INSERT INTO feed_rank_cache/, { rowCount: 1 })

    const { listFeed } = await import("../../lib/data")
    await listFeed(USER)

    // Three seeded lessons, 10 columns each, in one statement.
    const lessonInserts = stub.matching(/INSERT INTO micro_lessons/)
    assert.equal(lessonInserts.length, 1)
    assert.equal(lessonInserts[0].params.length, 3 * 10)
    assert.match(lessonInserts[0].sql, /ON CONFLICT \(id\) DO NOTHING$/)

    // Row-major: duration_seconds is a literal 90 in the original statement and
    // must stay bound as a value rather than being dropped from the column list.
    for (let index = 0; index < 3; index += 1) {
      assert.equal(lessonInserts[0].params[index * 10 + 4], 90)
      assert.match(String(lessonInserts[0].params[index * 10 + 5]), /^\[/) // topic_tags
      assert.match(String(lessonInserts[0].params[index * 10 + 7]), /^\[/) // choices
      assert.equal(lessonInserts[0].params[index * 10 + 1], USER.id)
    }

    // The three selected lessons produce one cache statement, still an upsert.
    const cacheInserts = stub.matching(/INSERT INTO feed_rank_cache/)
    assert.equal(cacheInserts.length, 1, "one statement for the whole cache refresh")
    assert.equal(cacheInserts[0].params.length, 3 * 8)
    assert.match(cacheInserts[0].sql, /ON CONFLICT \(user_id, lesson_id, topic_key\) DO UPDATE/)
    assert.match(cacheInserts[0].sql, /rank_score = EXCLUDED\.rank_score/)
    assert.match(cacheInserts[0].sql, /topic_tags = EXCLUDED\.topic_tags/)
    assert.match(cacheInserts[0].sql, /created_at = datetime\('now'\)/)

    // The stale-cache delete still runs first, exactly once.
    assert.equal(stub.writesMatching(/DELETE FROM feed_rank_cache/).length, 1)

    assertWithinParameterBudget(stub)
  } finally {
    stub.restore()
  }
})

test("seeding achievements batches its three rows into one statement", async () => {
  const stub = installDatabaseStub()
  try {
    await primeDatabase(stub)
    stub.on(/INSERT INTO achievements/, { rowCount: 1 })

    // The seed runs when the read comes back empty, then re-reads. Answering the
    // second read keeps the recursion from seeding forever.
    let reads = 0
    stub.on(/FROM achievements a/, () => {
      reads += 1
      return reads === 1 ? { rows: [] } : { rows: [{ id: "ach_first_review", unlocked_at: null }] }
    })

    const { listAchievements } = await import("../../lib/data")
    await listAchievements(USER)

    const inserts = stub.matching(/INSERT INTO achievements/)
    assert.equal(inserts.length, 1, "three achievements must not cost three statements")
    assert.equal(inserts[0].params.length, 3 * 6)
    assert.equal(placeholderCount(inserts[0].sql), 3 * 6)
    assert.match(inserts[0].sql, /ON CONFLICT \(id\) DO NOTHING$/)
    assert.deepEqual(inserts[0].params.slice(0, 6), [
      "ach_first_review",
      "First Review",
      "Complete your first Vault review.",
      "repeat",
      20,
      JSON.stringify({ seeded: true }),
    ])

    assertWithinParameterBudget(stub)
  } finally {
    stub.restore()
  }
})
