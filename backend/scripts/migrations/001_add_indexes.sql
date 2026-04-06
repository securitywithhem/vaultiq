-- VaultIQ Database Indexes Migration
-- Run this in your Supabase SQL editor
-- These indexes optimize the most frequent queries

-- 1. Files table: user_id lookups (every file list, every download auth check)
CREATE INDEX IF NOT EXISTS idx_files_user_id ON files(user_id);

-- 2. Files table: compound index for file lookups by user
CREATE INDEX IF NOT EXISTS idx_files_user_uploaded ON files(user_id, uploaded_at DESC);

-- 3. Login attempts: lockout checks are by user_id
CREATE INDEX IF NOT EXISTS idx_login_attempts_user_id ON login_attempts(user_id);

-- 4. System logs: query by user and event type
CREATE INDEX IF NOT EXISTS idx_system_logs_user_event ON system_logs(user_id, event_type);

-- 5. System logs: time-based queries for analytics
CREATE INDEX IF NOT EXISTS idx_system_logs_created ON system_logs(created_at DESC);

-- 6. Files: SHA-256 hash for deduplication queries (future feature)
CREATE INDEX IF NOT EXISTS idx_files_sha256 ON files(sha256_hash);
