-- Migration: 010_cp00_safety_hold
-- CP-00 safety containment: block NEW row-level clinical writes made directly
-- through PostgREST/Storage with a user JWT (bypassing the Next.js API guards).
--
-- NON-DESTRUCTIVE: adds triggers and a restrictive policy only. It does not
-- read, modify, move, or delete any existing row or object. Existing rows stay
-- readable and deletable (analysis delete, account delete still work).
--
-- NOT APPLIED BY CODE REVIEW. Apply deliberately via `npx supabase db push`
-- after approval (see docs/architecture/CP-00-LEGACY-DATA-PLAN.md).
--
-- ROLLBACK (reviewed decision only, e.g. at CP-01 re-enable):
--   DROP TRIGGER IF EXISTS cp00_block_analyses_result_insert ON public.analyses;
--   DROP TRIGGER IF EXISTS cp00_block_analyses_result_update ON public.analyses;
--   DROP TRIGGER IF EXISTS cp00_block_uploads_insert ON public.uploads;
--   DROP TRIGGER IF EXISTS cp00_block_uploads_update ON public.uploads;
--   DROP TRIGGER IF EXISTS cp00_block_analysis_cache_write ON public.analysis_cache;
--   DROP POLICY IF EXISTS cp00_block_csv_uploads_insert ON storage.objects;
--   DROP POLICY IF EXISTS cp00_block_csv_uploads_update ON storage.objects;
--   DROP FUNCTION IF EXISTS public.cp00_block_clinical_writes();

CREATE OR REPLACE FUNCTION public.cp00_block_clinical_writes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'CP-00 safety hold: new clinical data writes are suspended'
    USING ERRCODE = '42501';
END;
$$;

-- Row-level analysis results: block inserting or changing a non-null result_summary.
CREATE TRIGGER cp00_block_analyses_result_insert
  BEFORE INSERT ON public.analyses
  FOR EACH ROW
  WHEN (NEW.result_summary IS NOT NULL)
  EXECUTE FUNCTION public.cp00_block_clinical_writes();

CREATE TRIGGER cp00_block_analyses_result_update
  BEFORE UPDATE OF result_summary ON public.analyses
  FOR EACH ROW
  WHEN (NEW.result_summary IS NOT NULL AND NEW.result_summary IS DISTINCT FROM OLD.result_summary)
  EXECUTE FUNCTION public.cp00_block_clinical_writes();

-- Upload metadata (file path, column names): block new rows and path changes.
CREATE TRIGGER cp00_block_uploads_insert
  BEFORE INSERT ON public.uploads
  FOR EACH ROW
  EXECUTE FUNCTION public.cp00_block_clinical_writes();

CREATE TRIGGER cp00_block_uploads_update
  BEFORE UPDATE OF file_path, column_names ON public.uploads
  FOR EACH ROW
  EXECUTE FUNCTION public.cp00_block_clinical_writes();

-- Legacy, currently unused cache of PSM results (JSONB): block any write.
CREATE TRIGGER cp00_block_analysis_cache_write
  BEFORE INSERT OR UPDATE ON public.analysis_cache
  FOR EACH ROW
  EXECUTE FUNCTION public.cp00_block_clinical_writes();

-- Storage: restrictive policies are ANDed with existing permissive ones, so no
-- user-role upload/overwrite into csv-uploads is possible regardless of other
-- policies. SELECT and DELETE are untouched. May require elevated privileges on
-- storage.objects; failure is a warning and MUST be verified (see docs).
DO $$
BEGIN
  CREATE POLICY cp00_block_csv_uploads_insert ON storage.objects
    AS RESTRICTIVE FOR INSERT
    WITH CHECK (bucket_id <> 'csv-uploads');
  CREATE POLICY cp00_block_csv_uploads_update ON storage.objects
    AS RESTRICTIVE FOR UPDATE
    USING (bucket_id <> 'csv-uploads')
    WITH CHECK (bucket_id <> 'csv-uploads');
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE WARNING 'CP-00: could not create storage.objects policies; create them manually via the Supabase dashboard.';
END;
$$;
