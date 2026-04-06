-- Migration: 006_add_analysis_cache
-- Add cache table for PSM analysis results

CREATE TABLE analysis_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  result JSONB NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  user_id TEXT NOT NULL,
  config_hash TEXT NOT NULL,
  data_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE analysis_cache ENABLE ROW LEVEL SECURITY;

-- Users can only access their own cache entries
CREATE POLICY "users_own_cache_entries" ON analysis_cache
  FOR ALL USING (user_id = auth.uid()::text);

-- System can manage all cache entries
CREATE POLICY "system_can_manage_cache" ON analysis_cache
  FOR ALL USING (
    auth.uid() IS NULL OR 
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.user_id = auth.uid() 
      AND profiles.plan IN ('pro', 'admin')
    )
  );

-- Indexes for performance
CREATE INDEX idx_analysis_cache_key ON analysis_cache(key);
CREATE INDEX idx_analysis_cache_user_id ON analysis_cache(user_id);
CREATE INDEX idx_analysis_cache_expires_at ON analysis_cache(expires_at);
CREATE INDEX idx_analysis_cache_config_hash ON analysis_cache(config_hash);
CREATE INDEX idx_analysis_cache_data_hash ON analysis_cache(data_hash);

-- Composite index for common queries
CREATE INDEX idx_analysis_cache_user_config ON analysis_cache(user_id, config_hash);

-- Function to automatically clean up expired entries
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM analysis_cache 
  WHERE expires_at < NOW();
END;
$$;

-- Create a trigger to clean up expired entries periodically (optional)
-- This would typically be handled by a cron job in production
