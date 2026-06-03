PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS content_search (
  content_item_id text PRIMARY KEY REFERENCES content_items(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_type text NOT NULL,
  title text NOT NULL DEFAULT '',
  summary text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  tags text NOT NULL DEFAULT '[]',
  visibility text NOT NULL DEFAULT 'private',
  updated_at text NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS feed_rank_cache (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id text NOT NULL REFERENCES micro_lessons(id) ON DELETE CASCADE,
  topic_key text NOT NULL DEFAULT '',
  reason text NOT NULL CHECK (reason IN ('preferred', 'serendipity')),
  rank_score real NOT NULL DEFAULT 0,
  topic_tags text NOT NULL DEFAULT '[]',
  expires_at text NOT NULL,
  created_at text NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, lesson_id, topic_key)
);

CREATE INDEX IF NOT EXISTS idx_content_search_workspace_recent
  ON content_search(workspace_id, visibility, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_content_search_owner_type
  ON content_search(owner_user_id, item_type, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_content_search_visibility
  ON content_search(visibility, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_content_search_title
  ON content_search(title);

CREATE INDEX IF NOT EXISTS idx_feed_rank_cache_user_expiry
  ON feed_rank_cache(user_id, topic_key, expires_at, rank_score DESC);

CREATE INDEX IF NOT EXISTS idx_feed_rank_cache_lesson
  ON feed_rank_cache(lesson_id, created_at DESC);
