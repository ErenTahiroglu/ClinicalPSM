-- Migration: 008_fix_security_warnings
-- 1. Fix function_search_path_mutable warning for cleanup_expired_cache
-- 2. Fix rls_policy_always_true warning for audit_logs policy

-- 1. Fix cleanup_expired_cache function search_path
DROP FUNCTION IF EXISTS cleanup_expired_cache();

CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM analysis_cache 
  WHERE expires_at < NOW();
END;
$$;

-- 2. Fix system_can_insert_audit_logs RLS policy
-- Replace the overly permissive WITH CHECK (true) with proper restrictions
DROP POLICY IF EXISTS "system_can_insert_audit_logs" ON audit_logs;

CREATE POLICY "system_can_insert_audit_logs" ON audit_logs
  FOR INSERT WITH CHECK (
    auth.uid() IS NULL OR 
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.user_id = auth.uid() 
      AND profiles.plan IN ('pro', 'admin')
    )
  );
