import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

const migrationsDir = join(process.cwd(), "ops", "migrations")

function readMigrationSql() {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join(migrationsDir, name), "utf8"))
    .join("\n")
}

function createdTables(sql: string) {
  return new Set(
    Array.from(sql.matchAll(/CREATE\s+(?:VIRTUAL\s+)?TABLE\s+IF\s+NOT\s+EXISTS\s+([a-zA-Z0-9_]+)/gi))
      .map((match) => match[1]),
  )
}

function createdIndexes(sql: string) {
  return new Map(
    Array.from(sql.matchAll(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+([a-zA-Z0-9_]+)\s+ON\s+([a-zA-Z0-9_]+)\s*\(([^)]+)\)/gi))
      .map((match) => [
        match[1],
        {
          columns: match[3].replace(/\s+/g, " ").trim(),
          table: match[2],
        },
      ]),
  )
}

test("D1 migrations include the current LEARN product tables", () => {
  const tables = createdTables(readMigrationSql())
  const requiredTables = [
    "users",
    "user_sessions",
    "workspaces",
    "notes",
    "note_blocks",
    "note_versions",
    "editor_documents",
    "sheet_documents",
    "slide_decks",
    "media_assets",
    "quizzes",
    "quiz_questions",
    "quiz_attempts",
    "quiz_attempt_answers",
    "game_attempts",
    "review_items",
    "review_logs",
    "knowledge_nodes",
    "knowledge_edges",
    "micro_lessons",
    "feed_interactions",
    "learning_spaces",
    "learning_space_members",
    "workspace_groups",
    "group_members",
    "chat_threads",
    "chat_messages",
    "study_rooms",
    "study_battles",
    "social_actions",
    "moderation_items",
    "ai_provider_configs",
    "ai_chats",
    "ai_messages",
    "ai_response_logs",
    "rate_limit_buckets",
    "audit_logs",
    "content_items",
    "shared_access",
    "content_versions",
    "content_attachments",
    "user_connections",
    "practice_sessions",
    "practice_session_items",
    "collaboration_sessions",
    "collaboration_events",
    "client_mutations",
    "content_search",
    "feed_rank_cache",
  ]

  assert.deepEqual(
    requiredTables.filter((table) => !tables.has(table)),
    [],
  )
})

test("D1 migrations keep indexes for the current hot product queries", () => {
  const indexes = createdIndexes(readMigrationSql())
  const requiredIndexes = {
    idx_notes_updated_at: { table: "notes", includes: ["updated_at"] },
    idx_editor_documents_workspace: { table: "editor_documents", includes: ["workspace_id", "updated_at DESC"] },
    idx_sheet_documents_workspace: { table: "sheet_documents", includes: ["workspace_id", "updated_at DESC"] },
    idx_slide_decks_workspace: { table: "slide_decks", includes: ["workspace_id", "updated_at DESC"] },
    idx_media_assets_workspace_id: { table: "media_assets", includes: ["workspace_id"] },
    idx_review_items_due: { table: "review_items", includes: ["user_id", "due_at"] },
    idx_feed_interactions_user: { table: "feed_interactions", includes: ["user_id", "created_at DESC"] },
    idx_social_actions_target: { table: "social_actions", includes: ["target_type", "target_id", "created_at DESC"] },
    idx_chat_messages_thread: { table: "chat_messages", includes: ["thread_id", "created_at"] },
    idx_ai_provider_configs_priority: { table: "ai_provider_configs", includes: ["enabled", "priority", "provider"] },
    idx_content_items_workspace_recent: { table: "content_items", includes: ["workspace_id", "archived_at", "updated_at DESC"] },
    idx_content_items_owner_type_recent: { table: "content_items", includes: ["owner_user_id", "item_type", "archived_at", "updated_at DESC"] },
    idx_content_items_visibility_recent: { table: "content_items", includes: ["visibility", "updated_at DESC"] },
    idx_shared_access_grantee: { table: "shared_access", includes: ["grantee_type", "grantee_id", "role"] },
    idx_shared_access_content: { table: "shared_access", includes: ["content_item_id", "role"] },
    idx_content_versions_item: { table: "content_versions", includes: ["content_item_id", "version_number DESC"] },
    idx_content_attachments_media: { table: "content_attachments", includes: ["media_asset_id", "created_at DESC"] },
    idx_user_connections_requester: { table: "user_connections", includes: ["requester_user_id", "connection_type", "status", "updated_at DESC"] },
    idx_user_connections_target: { table: "user_connections", includes: ["target_user_id", "connection_type", "status", "updated_at DESC"] },
    idx_shared_access_grantee_active: { table: "shared_access", includes: ["grantee_type", "grantee_id", "expires_at"] },
    idx_shared_access_created_by: { table: "shared_access", includes: ["created_by_user_id", "created_at DESC"] },
    idx_practice_sessions_user_recent: { table: "practice_sessions", includes: ["user_id", "started_at DESC"] },
    idx_practice_sessions_type_recent: { table: "practice_sessions", includes: ["session_type", "started_at DESC"] },
    idx_practice_sessions_source: { table: "practice_sessions", includes: ["source_content_item_id", "started_at DESC"] },
    idx_practice_session_items_session: { table: "practice_session_items", includes: ["session_id", "created_at"] },
    idx_practice_session_items_review: { table: "practice_session_items", includes: ["review_item_id", "created_at DESC"] },
    idx_practice_session_items_content: { table: "practice_session_items", includes: ["content_item_id", "created_at DESC"] },
    idx_collaboration_sessions_type_status: { table: "collaboration_sessions", includes: ["session_type", "status", "started_at DESC"] },
    idx_collaboration_sessions_content: { table: "collaboration_sessions", includes: ["content_item_id", "started_at DESC"] },
    idx_collaboration_events_session: { table: "collaboration_events", includes: ["session_id", "created_at DESC"] },
    idx_collaboration_events_type: { table: "collaboration_events", includes: ["event_type", "created_at DESC"] },
    idx_client_mutations_user_status: { table: "client_mutations", includes: ["user_id", "status", "server_received_at DESC"] },
    idx_client_mutations_content: { table: "client_mutations", includes: ["content_item_id", "server_received_at DESC"] },
    idx_content_search_workspace_recent: { table: "content_search", includes: ["workspace_id", "visibility", "updated_at DESC"] },
    idx_content_search_owner_type: { table: "content_search", includes: ["owner_user_id", "item_type", "updated_at DESC"] },
    idx_content_search_visibility: { table: "content_search", includes: ["visibility", "updated_at DESC"] },
    idx_content_search_title: { table: "content_search", includes: ["title"] },
    idx_feed_rank_cache_user_expiry: { table: "feed_rank_cache", includes: ["user_id", "topic_key", "expires_at", "rank_score DESC"] },
    idx_feed_rank_cache_lesson: { table: "feed_rank_cache", includes: ["lesson_id", "created_at DESC"] },
  }

  for (const [name, expected] of Object.entries(requiredIndexes)) {
    const actual = indexes.get(name)
    assert.ok(actual, `${name} should exist`)
    assert.equal(actual.table, expected.table)
    for (const column of expected.includes) {
      assert.ok(actual.columns.includes(column), `${name} should include ${column}`)
    }
  }
})
