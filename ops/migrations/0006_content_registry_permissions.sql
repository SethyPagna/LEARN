PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS content_items (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN (
    'note',
    'doc',
    'sheet',
    'slide_deck',
    'media',
    'micro_lesson',
    'quiz',
    'review_item',
    'knowledge_node'
  )),
  source_table text NOT NULL,
  source_id text NOT NULL,
  title text NOT NULL,
  summary text NOT NULL DEFAULT '',
  visibility text NOT NULL DEFAULT 'private',
  archived_at text,
  created_at text NOT NULL DEFAULT (datetime('now')),
  updated_at text NOT NULL DEFAULT (datetime('now')),
  UNIQUE (source_table, source_id)
);

CREATE TABLE IF NOT EXISTS shared_access (
  id text PRIMARY KEY,
  content_item_id text NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  grantee_type text NOT NULL CHECK (grantee_type IN ('user', 'group', 'space', 'public_link')),
  grantee_id text,
  role text NOT NULL CHECK (role IN ('viewer', 'commenter', 'editor', 'owner')),
  created_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  expires_at text,
  created_at text NOT NULL DEFAULT (datetime('now')),
  UNIQUE (content_item_id, grantee_type, grantee_id, role)
);

CREATE TABLE IF NOT EXISTS content_versions (
  id text PRIMARY KEY,
  content_item_id text NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  source_table text NOT NULL,
  source_id text NOT NULL,
  user_id text REFERENCES users(id) ON DELETE SET NULL,
  version_number integer NOT NULL,
  title text NOT NULL,
  payload text NOT NULL DEFAULT '{}',
  plain_text text NOT NULL DEFAULT '',
  change_summary text NOT NULL DEFAULT '',
  created_at text NOT NULL DEFAULT (datetime('now')),
  UNIQUE (content_item_id, version_number)
);

CREATE TABLE IF NOT EXISTS content_attachments (
  content_item_id text NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  media_asset_id text NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  attachment_role text NOT NULL DEFAULT 'source',
  sort_order integer NOT NULL DEFAULT 0,
  created_at text NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (content_item_id, media_asset_id, attachment_role)
);

CREATE INDEX IF NOT EXISTS idx_content_items_workspace_recent
  ON content_items(workspace_id, archived_at, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_content_items_owner_type_recent
  ON content_items(owner_user_id, item_type, archived_at, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_content_items_visibility_recent
  ON content_items(visibility, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_shared_access_grantee
  ON shared_access(grantee_type, grantee_id, role);

CREATE INDEX IF NOT EXISTS idx_shared_access_content
  ON shared_access(content_item_id, role);

CREATE INDEX IF NOT EXISTS idx_content_versions_item
  ON content_versions(content_item_id, version_number DESC);

CREATE INDEX IF NOT EXISTS idx_content_attachments_media
  ON content_attachments(media_asset_id, created_at DESC);
