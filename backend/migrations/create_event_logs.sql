CREATE TABLE IF NOT EXISTS event_logs (
  id              BIGSERIAL PRIMARY KEY,
  event_type      TEXT NOT NULL,
  user_id         TEXT,
  file_name       TEXT,
  file_size_bytes BIGINT,
  file_type       TEXT,
  ai_verdict      TEXT,
  ai_score        FLOAT,
  ip_address      TEXT,
  duration_ms     INTEGER,
  timestamp       TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata        JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_event_logs_timestamp
  ON event_logs (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_event_logs_event_type
  ON event_logs (event_type);
CREATE INDEX IF NOT EXISTS idx_event_logs_user_id
  ON event_logs (user_id);
