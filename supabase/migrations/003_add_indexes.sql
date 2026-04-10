-- Migration: 003_add_indexes
-- Performance indexes for common query patterns

CREATE INDEX IF NOT EXISTS idx_analyses_user_id
  ON analyses(user_id);

CREATE INDEX IF NOT EXISTS idx_analyses_status
  ON analyses(status);

CREATE INDEX IF NOT EXISTS idx_uploads_analysis_id
  ON uploads(analysis_id);
