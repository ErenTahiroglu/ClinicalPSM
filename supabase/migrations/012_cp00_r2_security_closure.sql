-- Migration: 012_cp00_r2_security_closure
-- CP-00 R2: close FUTURE-object exposure and make verification behavioral.
--
-- ADDITIVE to 010 and 011 (both left byte-identical; their applied state in other
-- environments is not verified). No row is read, changed, moved or deleted.
-- Any failure aborts the migration; nothing here swallows an error.
--
-- WHY (R1 gap): `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ... FROM anon, authenticated`
-- cannot revoke the built-in GLOBAL default that gives PUBLIC `EXECUTE` on every new function.
-- Reproduced: a function created after 011 was executable by anon and authenticated.
--
-- OBJECT-OWNER REQUIREMENT: run as the role that owns the public objects and creates
-- future ones (Supabase: `postgres`). Verification aborts if any public table/function is
-- owned by another role, because default privileges only govern the role that creates objects.
--
-- ROLES IN SCOPE: PUBLIC, anon, authenticated, service_role, the migration owner (current_user),
-- and any other role that has default ACL entries in schema public (inventoried dynamically).
--
-- DEFAULT-PRIVILEGE DESIGN (evaluated, see docs/operations/CP-00-SUPABASE-VERIFICATION.md):
--   * GLOBAL (all schemas) `REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` for the migration owner only.
--     It does not affect functions owned by supabase_admin (auth, storage, realtime, graphql),
--     which are created by other roles. It would affect later functions the owner creates in
--     other schemas (e.g. extension functions in `extensions`), so PUBLIC EXECUTE is restored
--     there with a schema-level default (schema defaults are additive to global ones).
--   * Tables/sequences: global revoke from PUBLIC/anon/authenticated for the owner.
--   * Functions created by roles OTHER than the owner keep PostgreSQL's implicit PUBLIC EXECUTE;
--     this cannot be fixed from a migration and is covered by the gate in the verification doc
--     and the CI exposure test (src/db/__tests__/exposure-gate.test.ts).
--
-- ROLLBACK (do NOT run without Red Team approval: it re-opens future-object exposure):
--   ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO PUBLIC;
--   (and re-grant table/sequence defaults to anon/authenticated if the previous posture is wanted).
--   Storage policies are re-created identically to 011, so no rollback is needed for them.

-- ---------------------------------------------------------------------------
-- 1. Default privileges for objects created from now on by the migration owner.
-- ---------------------------------------------------------------------------
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;

-- Same inside the application schema (removes any schema-level entries, e.g. Supabase's).
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;

-- Keep extension-installed helper functions usable (they are not API-exposed).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'extensions') THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA extensions GRANT EXECUTE ON FUNCTIONS TO PUBLIC';
  END IF;
END;
$$;

-- Other creator roles with client-granting defaults (global or in public): revoke, or abort.
-- (Abort = insufficient_privilege propagates; the operator must run this part as that role.)
DO $$
DECLARE r record; scope text; kind text;
BEGIN
  FOR r IN
    SELECT d.defaclrole::regrole::text AS role_name, d.defaclnamespace AS ns
    FROM pg_default_acl d
    WHERE d.defaclnamespace IN (0, 'public'::regnamespace)
      AND d.defaclrole <> (SELECT oid FROM pg_roles WHERE rolname = current_user)
      AND d.defaclobjtype IN ('r','S','f')
      AND EXISTS (
        SELECT 1 FROM aclexplode(d.defaclacl) a
        WHERE a.grantee = 0 OR a.grantee IN (SELECT oid FROM pg_roles WHERE rolname IN ('anon','authenticated'))
      )
    GROUP BY 1, 2
  LOOP
    scope := CASE WHEN r.ns = 0 THEN '' ELSE ' IN SCHEMA public' END;
    FOREACH kind IN ARRAY ARRAY['FUNCTIONS','TABLES','SEQUENCES'] LOOP
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %s%s REVOKE ALL ON %s FROM PUBLIC, anon, authenticated', r.role_name, scope, kind);
    END LOOP;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Storage: strict reinstall (identical semantics to 011), no exception handling.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS cp00_block_csv_uploads_insert ON storage.objects;
DROP POLICY IF EXISTS cp00_block_csv_uploads_update ON storage.objects;
CREATE POLICY cp00_block_csv_uploads_insert ON storage.objects
  AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK (bucket_id <> 'csv-uploads');
CREATE POLICY cp00_block_csv_uploads_update ON storage.objects
  AS RESTRICTIVE FOR UPDATE TO public
  USING (bucket_id <> 'csv-uploads')
  WITH CHECK (bucket_id <> 'csv-uploads');

-- ---------------------------------------------------------------------------
-- 3. Verification. Behavioral probes (objects are really created, then dropped) plus
--    catalog inspection. Aborts the migration on any deviation.
--    The block between the BEGIN/END markers is re-run by the test suite after mutating
--    policies; keep it self-contained.
-- ---------------------------------------------------------------------------
-- BEGIN VERIFY
DO $verify$
DECLARE
  t text;
  op text;
  rl text;
  r record;
  norm text;
BEGIN
  ---------------------------------------------------------------- ownership
  FOR r IN
    SELECT c.relname FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','S','v','m')
      AND c.relowner <> (SELECT oid FROM pg_roles WHERE rolname = current_user)
  LOOP
    RAISE EXCEPTION 'CP-00 R2 verify failed: public.% is not owned by migration role %', r.relname, current_user;
  END LOOP;
  FOR r IN
    SELECT p.proname FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proowner <> (SELECT oid FROM pg_roles WHERE rolname = current_user)
  LOOP
    RAISE EXCEPTION 'CP-00 R2 verify failed: public.%() is not owned by migration role %', r.proname, current_user;
  END LOOP;

  ---------------------------------------------------------------- existing objects: table privileges
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    FOREACH rl IN ARRAY ARRAY['anon','authenticated'] LOOP
      FOREACH op IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
        IF op IN ('SELECT','INSERT','UPDATE','REFERENCES') THEN
          IF has_any_column_privilege(rl, format('public.%I', t), op)
             <> (rl = 'authenticated' AND op = 'SELECT' AND t IN ('profiles','analyses','uploads')) THEN
            RAISE EXCEPTION 'CP-00 R2 verify failed: % has unexpected % on public.%', rl, op, t;
          END IF;
        ELSIF has_table_privilege(rl, format('public.%I', t), op)
              <> (rl = 'authenticated' AND op = 'DELETE' AND t = 'analyses') THEN
          RAISE EXCEPTION 'CP-00 R2 verify failed: % has unexpected % on public.%', rl, op, t;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  ---------------------------------------------------------------- existing functions + sequences
  FOREACH rl IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p
      WHERE p.pronamespace = 'public'::regnamespace AND has_function_privilege(rl, p.oid, 'EXECUTE')
    ) THEN
      RAISE EXCEPTION 'CP-00 R2 verify failed: % can EXECUTE a public function', rl;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_class c
      WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'S'
        AND (has_sequence_privilege(rl, c.oid, 'USAGE') OR has_sequence_privilege(rl, c.oid, 'SELECT') OR has_sequence_privilege(rl, c.oid, 'UPDATE'))
    ) THEN
      RAISE EXCEPTION 'CP-00 R2 verify failed: % has privileges on a public sequence', rl;
    END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
      AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) c WHERE c LIKE 'search_path=%')
  ) THEN
    RAISE EXCEPTION 'CP-00 R2 verify failed: a SECURITY DEFINER function has no pinned search_path';
  END IF;

  ---------------------------------------------------------------- policies / RLS
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('analysis_cache','audit_logs')) THEN
    RAISE EXCEPTION 'CP-00 R2 verify failed: client policies remain on analysis_cache/audit_logs';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND cmd = 'ALL') THEN
    RAISE EXCEPTION 'CP-00 R2 verify failed: FOR ALL policy remains in public';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity) THEN
    RAISE EXCEPTION 'CP-00 R2 verify failed: RLS disabled on a public table';
  END IF;

  ---------------------------------------------------------------- storage: deep inspection
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'storage.objects'::regclass) THEN
    RAISE EXCEPTION 'CP-00 R2 verify failed: RLS disabled on storage.objects';
  END IF;

  -- INSERT guard
  SELECT regexp_replace(coalesce(pg_get_expr(p.polwithcheck, p.polrelid), 'NULL'), '[()\s]', '', 'g') INTO norm
  FROM pg_policy p
  WHERE p.polrelid = 'storage.objects'::regclass AND p.polname = 'cp00_block_csv_uploads_insert'
    AND NOT p.polpermissive AND p.polcmd = 'a' AND p.polroles = ARRAY[0::oid]
    AND p.polqual IS NULL;
  IF norm IS DISTINCT FROM 'bucket_id<>''csv-uploads''::text' THEN
    RAISE EXCEPTION 'CP-00 R2 verify failed: storage INSERT guard missing or altered (found: %)', coalesce(norm, 'no matching policy');
  END IF;

  -- UPDATE guard (USING and WITH CHECK)
  SELECT regexp_replace(coalesce(pg_get_expr(p.polqual, p.polrelid), 'NULL'), '[()\s]', '', 'g') || '|' ||
         regexp_replace(coalesce(pg_get_expr(p.polwithcheck, p.polrelid), 'NULL'), '[()\s]', '', 'g') INTO norm
  FROM pg_policy p
  WHERE p.polrelid = 'storage.objects'::regclass AND p.polname = 'cp00_block_csv_uploads_update'
    AND NOT p.polpermissive AND p.polcmd = 'w' AND p.polroles = ARRAY[0::oid];
  IF norm IS DISTINCT FROM 'bucket_id<>''csv-uploads''::text|bucket_id<>''csv-uploads''::text' THEN
    RAISE EXCEPTION 'CP-00 R2 verify failed: storage UPDATE guard missing or altered (found: %)', coalesce(norm, 'no matching policy');
  END IF;

  -- No other restrictive policy may exist that is not a pure csv-uploads exclusion (would disable other buckets).
  FOR r IN
    SELECT p.polname, p.polcmd,
           coalesce(pg_get_expr(p.polqual, p.polrelid), '') AS q,
           coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') AS w
    FROM pg_policy p
    WHERE p.polrelid = 'storage.objects'::regclass AND NOT p.polpermissive
      AND p.polname NOT IN ('cp00_block_csv_uploads_insert','cp00_block_csv_uploads_update')
  LOOP
    RAISE WARNING 'CP-00 R2: additional restrictive storage policy % (cmd %) present; confirm it does not disable other buckets', r.polname, r.polcmd;
  END LOOP;

  ---------------------------------------------------------------- FUTURE objects: behavioral probes
  -- Created as the migration owner, exactly as a future migration would.
  CREATE FUNCTION public.cp00_probe_fn() RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path = '' AS 'SELECT 1';
  CREATE FUNCTION public.cp00_probe_fn_invoker() RETURNS integer LANGUAGE sql AS 'SELECT 1';
  CREATE TABLE public.cp00_probe_tbl (id serial PRIMARY KEY, v text);

  FOREACH rl IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF has_function_privilege(rl, 'public.cp00_probe_fn()', 'EXECUTE')
       OR has_function_privilege(rl, 'public.cp00_probe_fn_invoker()', 'EXECUTE') THEN
      RAISE EXCEPTION 'CP-00 R2 verify failed: a NEW function is executable by % (default privileges not closed)', rl;
    END IF;
    FOREACH op IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
      IF has_table_privilege(rl, 'public.cp00_probe_tbl', op) THEN
        RAISE EXCEPTION 'CP-00 R2 verify failed: a NEW table grants % to %', op, rl;
      END IF;
    END LOOP;
    IF has_any_column_privilege(rl, 'public.cp00_probe_tbl', 'INSERT')
       OR has_any_column_privilege(rl, 'public.cp00_probe_tbl', 'UPDATE')
       OR has_any_column_privilege(rl, 'public.cp00_probe_tbl', 'SELECT') THEN
      RAISE EXCEPTION 'CP-00 R2 verify failed: a NEW table has column privileges for %', rl;
    END IF;
    IF has_sequence_privilege(rl, 'public.cp00_probe_tbl_id_seq', 'USAGE')
       OR has_sequence_privilege(rl, 'public.cp00_probe_tbl_id_seq', 'SELECT')
       OR has_sequence_privilege(rl, 'public.cp00_probe_tbl_id_seq', 'UPDATE') THEN
      RAISE EXCEPTION 'CP-00 R2 verify failed: a NEW sequence grants privileges to %', rl;
    END IF;
  END LOOP;

  -- PUBLIC pseudo-role on the probe function (ACL inspection, covers any role via PUBLIC)
  IF EXISTS (
    SELECT 1 FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    WHERE p.oid = 'public.cp00_probe_fn()'::regprocedure AND a.grantee = 0
  ) THEN
    RAISE EXCEPTION 'CP-00 R2 verify failed: a NEW function is executable by PUBLIC';
  END IF;

  DROP TABLE public.cp00_probe_tbl;
  DROP FUNCTION public.cp00_probe_fn();
  DROP FUNCTION public.cp00_probe_fn_invoker();

  ---------------------------------------------------------------- default ACL inventory (all creators)
  FOR r IN
    SELECT d.defaclrole::regrole::text AS creator, d.defaclobjtype AS objtype,
           CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END AS grantee
    FROM pg_default_acl d, aclexplode(d.defaclacl) a
    WHERE d.defaclnamespace IN (0, 'public'::regnamespace)
      AND d.defaclobjtype IN ('r','S','f')
      AND (a.grantee = 0 OR a.grantee IN (SELECT oid FROM pg_roles WHERE rolname IN ('anon','authenticated')))
  LOOP
    RAISE EXCEPTION 'CP-00 R2 verify failed: default ACL of % (type %) grants to %', r.creator, r.objtype, r.grantee;
  END LOOP;
END;
$verify$;
-- END VERIFY
