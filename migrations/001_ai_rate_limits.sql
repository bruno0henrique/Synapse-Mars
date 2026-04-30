CREATE TABLE IF NOT EXISTS ai_rate_limits (
  user_key TEXT PRIMARY KEY,
  request_count INTEGER NOT NULL DEFAULT 0,
  reset_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS ai_rate_limits_reset_at_idx
  ON ai_rate_limits (reset_at);
