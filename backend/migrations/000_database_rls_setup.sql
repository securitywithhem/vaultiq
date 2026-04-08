-- VaultIQ Database RLS and Schema Setup
-- Run these SQL commands in Supabase SQL Editor

-- ========================================
-- 1. LOGIN ATTEMPTS TABLE
-- ========================================
CREATE TABLE IF NOT EXISTS login_attempts (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  attempts INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_user_id ON login_attempts(user_id);

-- ========================================
-- 2. EMAIL VERIFICATIONS TABLE
-- ========================================
CREATE TABLE IF NOT EXISTS email_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  token TEXT NOT NULL,
  verified BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_verifications_user_id ON email_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_email_verifications_token ON email_verifications(token);

-- ========================================
-- 3. ENABLE ROW LEVEL SECURITY (RLS)
-- ========================================

-- FILES TABLE RLS
ALTER TABLE files ENABLE ROW LEVEL SECURITY;

-- Users can only view their own files
CREATE POLICY "Users can view own files"
  ON files FOR SELECT
  USING (auth.uid() = user_id);

-- Users can only insert their own files
CREATE POLICY "Users can insert own files"
  ON files FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can only update their own files
CREATE POLICY "Users can update own files"
  ON files FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can only delete their own files
CREATE POLICY "Users can delete own files"
  ON files FOR DELETE
  USING (auth.uid() = user_id);

-- LOGIN ATTEMPTS TABLE RLS
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

-- Users can only view their own login attempts (optional - mostly for admin)
CREATE POLICY "Login attempts are system managed"
  ON login_attempts FOR ALL
  USING (FALSE);  -- Disable direct access, managed by backend

-- EMAIL VERIFICATIONS TABLE RLS
ALTER TABLE email_verifications ENABLE ROW LEVEL SECURITY;

-- Users can only view their own email verifications
CREATE POLICY "Users can view own email verifications"
  ON email_verifications FOR SELECT
  USING (auth.uid() = user_id);

-- System can insert verifications
CREATE POLICY "System can insert email verifications"
  ON email_verifications FOR INSERT
  WITH CHECK (TRUE);

-- System can update verifications
CREATE POLICY "System can update email verifications"
  ON email_verifications FOR UPDATE
  USING (TRUE);

-- ========================================
-- 4. AUDIT LOGS TABLE (Optional but recommended)
-- ========================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  resource_id UUID,
  changes JSONB,
  ip_address TEXT,
  user_agent TEXT,
  timestamp TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Users can only view their own audit logs
CREATE POLICY "Users can view own audit logs"
  ON audit_logs FOR SELECT
  USING (auth.uid() = user_id);

-- System can insert audit logs
CREATE POLICY "System can insert audit logs"
  ON audit_logs FOR INSERT
  WITH CHECK (TRUE);

-- ========================================
-- 5. ADD COLUMNS TO EXISTING TABLES
-- ========================================

-- Add email_verified status to auth.users (handled by Supabase auth)
-- Add original_filename to files table if not exists
ALTER TABLE files ADD COLUMN IF NOT EXISTS original_filename TEXT;
ALTER TABLE files ADD COLUMN IF NOT EXISTS iv_prepended BOOLEAN DEFAULT FALSE;

-- ========================================
-- 6. VERIFY RLS IS WORKING
-- ========================================
-- Run this query to verify RLS policies are active:
-- SELECT tablename, cmd FROM pg_policies WHERE tablename = 'files';

-- You should see multiple policies for 'files' table

-- ========================================
-- 7. TEST RLS (Run as different users to verify isolation)
-- ========================================
-- This will only return files owned by the authenticated user:
-- SELECT * FROM files;

-- Attempting to access other users' files via raw IDs should fail:
-- SELECT * FROM files WHERE id = 'some-other-user-file-id' AND user_id != auth.uid();
-- Should return 0 rows
