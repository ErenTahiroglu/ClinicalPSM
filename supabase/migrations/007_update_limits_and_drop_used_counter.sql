-- Migration: 007_update_limits_and_drop_used_counter
-- 1. Reduce default free analysis limit to 1
-- 2. Drop static analyses_used counter (switching to dynamic computation)
-- 3. Add composite index for usage query performance
-- 4. Add namespaced advisory lock RPC for atomic limit checks

-- Update default limit for future profiles
ALTER TABLE profiles 
  ALTER COLUMN analyses_limit SET DEFAULT 1;

-- Set existing free users to limit 1
UPDATE profiles
SET analyses_limit = 1
WHERE plan = 'free';

-- Drop the analyses_used column (dynamic COUNT will be used instead)
ALTER TABLE profiles
  DROP COLUMN IF EXISTS analyses_used;

-- Index for optimized usage counting
CREATE INDEX IF NOT EXISTS idx_analyses_user_id_created_at 
  ON analyses(user_id, created_at);

-- RPC for atomic analysis creation with limit check
-- Namespace: 1001 (Analysis Creation)
CREATE OR REPLACE FUNCTION create_analysis_with_limit_check(
  p_user_id UUID,
  p_name TEXT,
  p_status TEXT,
  p_period_start TIMESTAMPTZ,
  p_limit INTEGER
)
RETURNS SETOF analyses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Step 1: Virtual namespaced advisory lock (1001 = Analysis Creation)
  -- This serializes analysis creation per user without locking the profiles table.
  PERFORM pg_advisory_xact_lock(1001, hashtext(p_user_id::text));

  -- Step 2: Dynamic usage count within the period
  SELECT COUNT(*) INTO v_count
  FROM analyses
  WHERE user_id = p_user_id AND created_at >= p_period_start;

  -- Step 3: Validation
  IF v_count >= p_limit THEN
    RAISE EXCEPTION 'Daily limit reached' USING ERRCODE = 'P0001';
  END IF;

  -- Step 4: Atomic insertion
  RETURN QUERY
  INSERT INTO analyses (user_id, name, status, created_at)
  VALUES (p_user_id, p_name, p_status, NOW())
  RETURNING *;
END;
$$;

-- Documentation
COMMENT ON COLUMN profiles.analyses_limit IS 'Limit for analyses (Free: 1/day, Plus: 20/mo, Pro: unlimited)';
