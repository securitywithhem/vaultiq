-- VaultIQ Analytics Indexes and Tables (Option A)
-- Run this migration to optimize event_logs queries and add analytics_results table

-- ─── Indexes on event_logs for fast analytics queries ──────────────────────

-- Index for timestamp-based queries (most common)
CREATE INDEX IF NOT EXISTS idx_event_logs_timestamp
  ON event_logs(timestamp DESC);

-- Index for event type filtering
CREATE INDEX IF NOT EXISTS idx_event_logs_event_type
  ON event_logs(event_type);

-- Index for user-based queries
CREATE INDEX IF NOT EXISTS idx_event_logs_user_id
  ON event_logs(user_id);

-- Compound index for daily analytics (date + event_type)
CREATE INDEX IF NOT EXISTS idx_event_logs_date_type
  ON event_logs(DATE(timestamp), event_type);

-- Index for anomaly detection (file_delete events)
CREATE INDEX IF NOT EXISTS idx_event_logs_delete_events
  ON event_logs(timestamp)
  WHERE event_type = 'file_delete';

-- Index for AI detection queries
CREATE INDEX IF NOT EXISTS idx_event_logs_ai_verdicts
  ON event_logs(ai_verdict)
  WHERE event_type = 'ai_detection';

-- ─── Analytics Results Table ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS analytics_results (
  id INTEGER PRIMARY KEY DEFAULT 1,
  data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add trigger to update updated_at automatically
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS analytics_results_update_trigger ON analytics_results;
CREATE TRIGGER analytics_results_update_trigger
BEFORE UPDATE ON analytics_results
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- Insert initial empty record
INSERT INTO analytics_results (id, data)
VALUES (1, '{"generated_at": null, "data_points": 0}')
ON CONFLICT (id) DO NOTHING;

-- ─── Optional: Partitioning for very large tables ────────────────────────

-- Uncomment if event_logs table grows beyond 100M rows
-- CREATE TABLE IF NOT EXISTS event_logs_2026_q1 PARTITION OF event_logs
--   FOR VALUES FROM ('2026-01-01') TO ('2026-04-01');
--
-- CREATE TABLE IF NOT EXISTS event_logs_2026_q2 PARTITION OF event_logs
--   FOR VALUES FROM ('2026-04-01') TO ('2026-07-01');

-- ─── Vacuum and Analyze ────────────────────────────────────────────────────

-- Analyze table for query optimizer
ANALYZE event_logs;
ANALYZE analytics_results;
