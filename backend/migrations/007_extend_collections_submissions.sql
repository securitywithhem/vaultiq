-- Migration: 007_extend_collections_submissions
-- Purpose: Add Microsoft Forms-style custom fields, file restrictions,
--          student email, and custom field answers to support public
--          assignment submission flow.

ALTER TABLE collections
  ADD COLUMN IF NOT EXISTS fields JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS max_file_size_mb INTEGER DEFAULT 25 CHECK (max_file_size_mb > 0 AND max_file_size_mb <= 100),
  ADD COLUMN IF NOT EXISTS allowed_types JSONB DEFAULT '["pdf","docx","txt"]'::jsonb;

ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS student_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_submissions_student_email ON submissions(student_email);
