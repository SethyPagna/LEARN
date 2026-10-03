PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS chat_message_reactions (
  message_id text NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at text NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (message_id, user_id, emoji)
);

CREATE TABLE IF NOT EXISTS social_stories (
  id text PRIMARY KEY,
  owner_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL DEFAULT '',
  file_id text REFERENCES media_assets(id) ON DELETE SET NULL,
  audience text NOT NULL CHECK (audience IN ('private', 'friends', 'group')),
  group_id text REFERENCES workspace_groups(id) ON DELETE CASCADE,
  created_at text NOT NULL,
  expires_at text NOT NULL,
  CHECK ((audience = 'group' AND group_id IS NOT NULL) OR (audience != 'group' AND group_id IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_social_stories_recent ON social_stories(expires_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_stories_owner ON social_stories(owner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_stories_file ON social_stories(file_id);
