-- Migration: 006_create_ai_detection_results_table
-- Created: 2026-04-16
-- Purpose: Store AI detection results for submitted files

-- AI detection results table
CREATE TABLE IF NOT EXISTS ai_detection_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  filename VARCHAR(255) NOT NULL,
  s3_file_path VARCHAR(500) NOT NULL,
  ai_score FLOAT CHECK (ai_score >= 0 AND ai_score <= 1),
  verdict VARCHAR(20) CHECK (verdict IN ('human', 'mixed', 'ai')),
  confidence VARCHAR(20) CHECK (confidence IN ('high', 'medium', 'low')),
  chunk_scores JSONB,
  similarity_score FLOAT CHECK (similarity_score >= 0 AND similarity_score <= 1),
  detected_at TIMESTAMP WITH TIME ZONE,
  detection_status VARCHAR(20) DEFAULT 'pending' CHECK (detection_status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_results_submission_id ON ai_detection_results(submission_id);
CREATE INDEX IF NOT EXISTS idx_results_detection_status ON ai_detection_results(detection_status);
CREATE INDEX IF NOT EXISTS idx_results_verdict ON ai_detection_results(verdict);
