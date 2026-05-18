PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS user_connections (
  requester_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_type text NOT NULL CHECK (connection_type IN ('follow', 'friend')),
  status text NOT NULL CHECK (status IN ('pending', 'accepted', 'blocked')),
  created_at text NOT NULL DEFAULT (datetime('now')),
  updated_at text NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (requester_user_id, target_user_id, connection_type)
);

CREATE INDEX IF NOT EXISTS idx_user_connections_requester
  ON user_connections(requester_user_id, connection_type, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_connections_target
  ON user_connections(target_user_id, connection_type, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_shared_access_grantee_active
  ON shared_access(grantee_type, grantee_id, expires_at);

CREATE INDEX IF NOT EXISTS idx_shared_access_created_by
  ON shared_access(created_by_user_id, created_at DESC);
