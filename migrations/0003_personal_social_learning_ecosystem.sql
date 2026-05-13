PRAGMA foreign_keys = ON;

ALTER TABLE users ADD COLUMN bio text DEFAULT '';
ALTER TABLE users ADD COLUMN avatar_url text DEFAULT '';
ALTER TABLE users ADD COLUMN streak_current integer DEFAULT 0;
ALTER TABLE users ADD COLUMN streak_longest integer DEFAULT 0;
ALTER TABLE users ADD COLUMN streak_freezes_available integer DEFAULT 0;
ALTER TABLE users ADD COLUMN xp_total integer DEFAULT 0;
ALTER TABLE users ADD COLUMN reputation integer DEFAULT 0;
ALTER TABLE users ADD COLUMN profile_visibility text DEFAULT 'private';
ALTER TABLE users ADD COLUMN last_learning_activity_at text;

CREATE TABLE IF NOT EXISTS knowledge_nodes (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_type text NOT NULL DEFAULT 'note',
  source_id text,
  title text NOT NULL,
  summary text NOT NULL DEFAULT '',
  mastery real NOT NULL DEFAULT 0,
  visibility text NOT NULL DEFAULT 'private',
  position_x real NOT NULL DEFAULT 0,
  position_y real NOT NULL DEFAULT 0,
  position_z real NOT NULL DEFAULT 0,
  metadata text NOT NULL DEFAULT '{}',
  created_at text NOT NULL DEFAULT (datetime('now')),
  updated_at text NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS knowledge_edges (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_node_id text NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  target_node_id text NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  edge_type text NOT NULL DEFAULT 'related',
  strength real NOT NULL DEFAULT 0.5,
  created_by text NOT NULL DEFAULT 'user',
  metadata text NOT NULL DEFAULT '{}',
  created_at text NOT NULL DEFAULT (datetime('now')),
  UNIQUE (source_node_id, target_node_id, edge_type)
);

CREATE TABLE IF NOT EXISTS review_items (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  source_id text NOT NULL,
  title text NOT NULL,
  prompt text NOT NULL DEFAULT '',
  answer text NOT NULL DEFAULT '',
  difficulty real NOT NULL DEFAULT 0.5,
  stability real NOT NULL DEFAULT 2,
  retrievability real NOT NULL DEFAULT 0.9,
  due_at text NOT NULL,
  last_reviewed_at text,
  review_count integer NOT NULL DEFAULT 0,
  lapse_count integer NOT NULL DEFAULT 0,
  metadata text NOT NULL DEFAULT '{}',
  created_at text NOT NULL DEFAULT (datetime('now')),
  updated_at text NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, source_type, source_id)
);

CREATE TABLE IF NOT EXISTS review_logs (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  review_item_id text NOT NULL REFERENCES review_items(id) ON DELETE CASCADE,
  rating text NOT NULL,
  elapsed_ms integer NOT NULL DEFAULT 0,
  next_due_at text NOT NULL,
  created_at text NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS achievements (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL,
  icon text NOT NULL DEFAULT 'sparkles',
  criteria text NOT NULL DEFAULT '{}',
  xp_reward integer NOT NULL DEFAULT 0,
  created_at text NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_achievements (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id text NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  unlocked_at text NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, achievement_id)
);

CREATE TABLE IF NOT EXISTS micro_lessons (
  id text PRIMARY KEY,
  creator_user_id text REFERENCES users(id) ON DELETE SET NULL,
  title text NOT NULL,
  summary text NOT NULL DEFAULT '',
  media_asset_id text REFERENCES media_assets(id) ON DELETE SET NULL,
  duration_seconds integer NOT NULL DEFAULT 90,
  topic_tags text NOT NULL DEFAULT '[]',
  difficulty text NOT NULL DEFAULT 'beginner',
  question text NOT NULL DEFAULT '',
  choices text NOT NULL DEFAULT '[]',
  correct_choice_id text NOT NULL DEFAULT '',
  explanation text NOT NULL DEFAULT '',
  visibility text NOT NULL DEFAULT 'public',
  status text NOT NULL DEFAULT 'published',
  created_at text NOT NULL DEFAULT (datetime('now')),
  updated_at text NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS feed_interactions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id text NOT NULL REFERENCES micro_lessons(id) ON DELETE CASCADE,
  action text NOT NULL,
  correct integer NOT NULL DEFAULT 0,
  saved_to_vault integer NOT NULL DEFAULT 0,
  metadata text NOT NULL DEFAULT '{}',
  created_at text NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS learning_spaces (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  visibility text NOT NULL DEFAULT 'private',
  topic_tags text NOT NULL DEFAULT '[]',
  settings text NOT NULL DEFAULT '{}',
  created_at text NOT NULL DEFAULT (datetime('now')),
  updated_at text NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS learning_space_members (
  space_id text NOT NULL REFERENCES learning_spaces(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  reputation integer NOT NULL DEFAULT 0,
  joined_at text NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (space_id, user_id)
);

CREATE TABLE IF NOT EXISTS study_rooms (
  id text PRIMARY KEY,
  space_id text REFERENCES learning_spaces(id) ON DELETE SET NULL,
  owner_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  mode text NOT NULL DEFAULT 'focus',
  pomodoro_minutes integer NOT NULL DEFAULT 25,
  break_minutes integer NOT NULL DEFAULT 5,
  status text NOT NULL DEFAULT 'open',
  presence text NOT NULL DEFAULT '[]',
  created_at text NOT NULL DEFAULT (datetime('now')),
  updated_at text NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS study_battles (
  id text PRIMARY KEY,
  room_id text REFERENCES study_rooms(id) ON DELETE SET NULL,
  owner_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  topic text NOT NULL DEFAULT 'General',
  mode text NOT NULL DEFAULT 'solo',
  status text NOT NULL DEFAULT 'waiting',
  question_set text NOT NULL DEFAULT '[]',
  leaderboard text NOT NULL DEFAULT '[]',
  started_at text,
  ended_at text,
  created_at text NOT NULL DEFAULT (datetime('now')),
  updated_at text NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS social_actions (
  id text PRIMARY KEY,
  actor_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type text NOT NULL,
  target_id text NOT NULL,
  action_type text NOT NULL,
  body text NOT NULL DEFAULT '',
  metadata text NOT NULL DEFAULT '{}',
  created_at text NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS moderation_items (
  id text PRIMARY KEY,
  reporter_user_id text REFERENCES users(id) ON DELETE SET NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  notes text NOT NULL DEFAULT '',
  created_at text NOT NULL DEFAULT (datetime('now')),
  updated_at text NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_user ON knowledge_nodes(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_edges_user ON knowledge_edges(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_review_items_due ON review_items(user_id, due_at);
CREATE INDEX IF NOT EXISTS idx_micro_lessons_status ON micro_lessons(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_feed_interactions_user ON feed_interactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_learning_spaces_updated ON learning_spaces(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_study_rooms_status ON study_rooms(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_study_battles_status ON study_battles(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_actions_target ON social_actions(target_type, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moderation_items_status ON moderation_items(status, created_at DESC);
