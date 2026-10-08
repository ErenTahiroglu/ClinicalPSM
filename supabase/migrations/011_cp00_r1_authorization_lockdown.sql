-- Migration: 011_cp00_r1_authorization_lockdown
-- CP-00 R1: least-privilege authorization for the public schema.
--
-- ADDITIVE to 010 (010 is left byte-identical: it may already be applied somewhere).
-- Every statement here is idempotent. Any failure ABORTS the migration
-- (no exception swallowing). Nothing here deletes, rewrites, or moves rows.
--
-- Threats closed (see docs/audits/CP-00-R1-HARDENING-REPORT.md):
--   P0-1 profiles entitlement escalation (FOR ALL policy + full table grants)
--   P0-2 anon/authenticated EXECUTE on SECURITY DEFINER create_analysis_with_limit_check
--   P0-3 cross-user audit_logs read by Pro users; forged audit inserts
--   P0-4 analysis_cache open to anon (auth.uid() IS NULL)
--   P0-5 direct writes to analyses.name/config/status/etc. via PostgREST
--
-- PREREQUISITES: roles anon, authenticated, service_role exist (Supabase default);
--   migration role (postgres) owns public objects and may manage storage.objects policies.
--
-- CAPABILITY MATRIX AFTER THIS MIGRATION (anon / authenticated / service_role):
--   profiles        : none  / SELECT own            / ALL
--   analyses        : none  / SELECT own, DELETE own/ ALL (blocked by 010 triggers for result_summary)
--   uploads         : none  / SELECT own            / ALL (new rows blocked by 010 triggers)
--   analysis_cache  : none  / none                  / ALL (writes blocked by 010 trigger)
--   audit_logs      : none  / none                  / ALL
--   storage.objects csv-uploads: INSERT/UPDATE blocked for all non-bypass roles by restrictive policy
--   public functions: EXECUTE revoked from PUBLIC/anon/authenticated; service_role only
--
-- ROLLBACK (reviewed decision only; restores the vulnerable state, do not do this casually):
--   Re-grant per table, recreate dropped policies from 001/005/006/008, and
--   restore the original create_analysis_with_limit_check body from 007 with
--   GRANT EXECUTE ... TO authenticated. Policies dropped here are listed below.
--   DROP POLICY IF EXISTS cp00r1_profiles_select_own ON public.profiles; (and the other cp00r1_* policies)

-- ---------------------------------------------------------------------------
-- 1. Baseline: remove all client privileges on every public table, then
--    grant back only what the application requires.
-- ---------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', r.tablename);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', r.tablename);
  END LOOP;
END;
$$;

-- Future objects created by the migration role are not auto-exposed to clients.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. profiles: read own row only. No client INSERT/UPDATE/DELETE
--    (plan, analyses_limit, plan_interval, plan_reset_at, polar_* are billing state
--    written only by the webhook via service_role, or by handle_new_user()).
-- ---------------------------------------------------------------------------
GRANT SELECT ON public.profiles TO authenticated;
DROP POLICY IF EXISTS "users own their profiles" ON public.profiles;
DROP POLICY IF EXISTS cp00r1_profiles_select_own ON public.profiles;
CREATE POLICY cp00r1_profiles_select_own ON public.profiles
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- 3. analyses: read and delete own rows. No client INSERT/UPDATE, which closes
--    direct writes of name/config/status/result_summary through PostgREST.
-- ---------------------------------------------------------------------------
GRANT SELECT, DELETE ON public.analyses TO authenticated;
DROP POLICY IF EXISTS "users own their analyses" ON public.analyses;
DROP POLICY IF EXISTS cp00r1_analyses_select_own ON public.analyses;
DROP POLICY IF EXISTS cp00r1_analyses_delete_own ON public.analyses;
CREATE POLICY cp00r1_analyses_select_own ON public.analyses
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY cp00r1_analyses_delete_own ON public.analyses
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- 4. uploads: read own (via parent analysis). Rows disappear via FK cascade.
-- ---------------------------------------------------------------------------
GRANT SELECT ON public.uploads TO authenticated;
DROP POLICY IF EXISTS "users own their uploads" ON public.uploads;
DROP POLICY IF EXISTS cp00r1_uploads_select_own ON public.uploads;
CREATE POLICY cp00r1_uploads_select_own ON public.uploads
  FOR SELECT TO authenticated
  USING (analysis_id IN (SELECT id FROM public.analyses WHERE user_id = (SELECT auth.uid())));

-- ---------------------------------------------------------------------------
-- 5. analysis_cache: no client access at all. Rows preserved (no deletion).
--    RLS stays enabled with no client policy = default deny.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS users_own_cache_entries ON public.analysis_cache;
DROP POLICY IF EXISTS system_can_manage_cache ON public.analysis_cache;
ALTER TABLE public.analysis_cache ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 6. audit_logs: no client access. Server writes/reads use service_role.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS admin_only_read_audit_logs ON public.audit_logs;
DROP POLICY IF EXISTS system_can_insert_audit_logs ON public.audit_logs;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 7. Functions.
--    create_analysis_with_limit_check: was SECURITY DEFINER with caller-supplied
--    user id and limit. Replaced by a SECURITY INVOKER function that always
--    raises while the hold is active, with a locked search_path. Same signature,
--    so existing callers get a clean error rather than a missing-function error.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_analysis_with_limit_check(
  p_user_id UUID,
  p_name TEXT,
  p_status TEXT,
  p_period_start TIMESTAMPTZ,
  p_limit INTEGER
)
RETURNS SETOF public.analyses
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'CP-00 safety hold: new analyses are suspended'
    USING ERRCODE = '42501';
END;
$$;

-- Revoke EXECUTE on every function in public from client-facing roles
-- (covers create_analysis_with_limit_check, cleanup_expired_cache, handle_new_user,
-- cp00_block_clinical_writes). Trigger functions do not need caller EXECUTE at fire time.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END;
$$;

-- handle_new_user inserts into profiles; make it schema-qualified.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

-- cleanup_expired_cache deletes rows: schema-qualify so the locked path works.
CREATE OR REPLACE FUNCTION public.cleanup_expired_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.analysis_cache WHERE expires_at < NOW();
END;
$$;
REVOKE ALL ON FUNCTION public.cleanup_expired_cache() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_cache() TO service_role;

-- ---------------------------------------------------------------------------
-- 8. Storage: strict (re)installation of the csv-uploads write block.
--    010 swallowed insufficient_privilege; here a failure aborts the migration.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS cp00_block_csv_uploads_insert ON storage.objects;
DROP POLICY IF EXISTS cp00_block_csv_uploads_update ON storage.objects;
CREATE POLICY cp00_block_csv_uploads_insert ON storage.objects
  AS RESTRICTIVE FOR INSERT
  WITH CHECK (bucket_id <> 'csv-uploads');
CREATE POLICY cp00_block_csv_uploads_update ON storage.objects
  AS RESTRICTIVE FOR UPDATE
  USING (bucket_id <> 'csv-uploads')
  WITH CHECK (bucket_id <> 'csv-uploads');

-- ---------------------------------------------------------------------------
-- 9. Self-verification. Aborts the migration if any control is missing.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  op text;
  rl text;
BEGIN
  -- anon: nothing on any table
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    FOREACH op IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
      IF op IN ('SELECT','INSERT','UPDATE','REFERENCES') THEN
        IF has_any_column_privilege('anon', format('public.%I', t), op) THEN
          RAISE EXCEPTION 'CP-00 R1 verify failed: anon has % on public.%', op, t;
        END IF;
      ELSIF has_table_privilege('anon', format('public.%I', t), op) THEN
        RAISE EXCEPTION 'CP-00 R1 verify failed: anon has % on public.%', op, t;
      END IF;
    END LOOP;
  END LOOP;

  -- authenticated: exact allow-list
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    FOREACH op IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
      IF op IN ('SELECT','INSERT','UPDATE','REFERENCES') THEN
        IF has_any_column_privilege('authenticated', format('public.%I', t), op)
           <> (  (t IN ('profiles','analyses','uploads') AND op = 'SELECT')  ) THEN
          RAISE EXCEPTION 'CP-00 R1 verify failed: authenticated % on public.% unexpected', op, t;
        END IF;
      ELSIF op = 'DELETE' THEN
        IF has_table_privilege('authenticated', format('public.%I', t), op) <> (t = 'analyses') THEN
          RAISE EXCEPTION 'CP-00 R1 verify failed: authenticated DELETE on public.% unexpected', t;
        END IF;
      ELSIF has_table_privilege('authenticated', format('public.%I', t), op) THEN
        RAISE EXCEPTION 'CP-00 R1 verify failed: authenticated % on public.%', op, t;
      END IF;
    END LOOP;
  END LOOP;

  -- functions
  FOREACH rl IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND has_function_privilege(rl, p.oid, 'EXECUTE')
    ) THEN
      RAISE EXCEPTION 'CP-00 R1 verify failed: % can EXECUTE a public function', rl;
    END IF;
  END LOOP;

  -- policies that must NOT exist
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('analysis_cache','audit_logs')) THEN
    RAISE EXCEPTION 'CP-00 R1 verify failed: client policies remain on analysis_cache/audit_logs';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND cmd = 'ALL') THEN
    RAISE EXCEPTION 'CP-00 R1 verify failed: FOR ALL policy remains in public';
  END IF;

  -- RLS enabled everywhere
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity) THEN
    RAISE EXCEPTION 'CP-00 R1 verify failed: RLS disabled on a public table';
  END IF;

  -- storage block present
  IF (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname IN ('cp00_block_csv_uploads_insert','cp00_block_csv_uploads_update')) <> 2 THEN
    RAISE EXCEPTION 'CP-00 R1 verify failed: storage restrictive policies missing';
  END IF;
END;
$$;
