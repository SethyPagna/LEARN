PRAGMA foreign_keys = ON;

ALTER TABLE ai_provider_configs ADD COLUMN created_by_id text;
ALTER TABLE ai_provider_configs ADD COLUMN created_by_name text;
ALTER TABLE ai_response_logs ADD COLUMN surface text DEFAULT 'learn';
ALTER TABLE ai_response_logs ADD COLUMN provider_config_id text;
ALTER TABLE ai_response_logs ADD COLUMN provider_name text;

CREATE INDEX IF NOT EXISTS idx_ai_provider_configs_priority ON ai_provider_configs(enabled, priority, provider);
CREATE INDEX IF NOT EXISTS idx_ai_response_logs_provider ON ai_response_logs(provider_config_id, created_at DESC);
