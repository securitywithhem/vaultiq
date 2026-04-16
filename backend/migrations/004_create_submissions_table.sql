-- 004_create_submissions_table.sql
-- Student submissions for a collection

CREATE TABLE IF NOT EXISTS submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  student_name TEXT NOT NULL,
  student_id TEXT,
  student_notes TEXT,
  submitted_at TIMESTAMP DEFAULT NOW(),
  s3_folder_path TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_submissions_collection ON submissions(collection_id);
CREATE INDEX IF NOT EXISTS idx_submissions_submitted_at ON submissions(submitted_at);
