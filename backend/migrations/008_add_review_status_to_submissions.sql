-- Migration: 008_add_review_status_to_submissions
-- Purpose: Add review_status column to submissions table for tracking
--          instructor review workflow (unreviewed, reviewed, flagged, approved)

ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS review_status VARCHAR(20) DEFAULT 'unreviewed'
    CHECK (review_status IN ('unreviewed','reviewed','flagged','approved'));

CREATE INDEX IF NOT EXISTS idx_submissions_review_status ON submissions(review_status);
