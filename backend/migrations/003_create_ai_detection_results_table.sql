-- backend/migrations/003_create_ai_detection_results_table.sql

CREATE TABLE ai_detection_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  s3_file_path TEXT NOT NULL,
  ai_score FLOAT CHECK (ai_score >= 0 AND ai_score <= 1),
  verdict TEXT CHECK (verdict IN ('human', 'mixed', 'ai')),
  confidence TEXT CHECK (confidence IN ('high', 'low')),
  chunk_scores JSONB,
  similarity_score FLOAT,
  detected_at TIMESTAMP,
  detection_status TEXT DEFAULT 'pending' CHECK (detection_status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_results_submission ON ai_detection_results(submission_id);
CREATE INDEX idx_results_status ON ai_detection_results(detection_status);
