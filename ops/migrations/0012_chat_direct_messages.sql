PRAGMA foreign_keys = ON;

-- Enables direct (1:1) chat threads alongside the existing group threads.
-- A thread is a DM when target_user_id is set and group_id is null; it's a
-- group thread when group_id is set. Both null means a private, personal
-- thread visible only to its creator (the pre-existing behavior).
ALTER TABLE chat_threads ADD COLUMN target_user_id text REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_chat_threads_target_user ON chat_threads(target_user_id, updated_at DESC);
