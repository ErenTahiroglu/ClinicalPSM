# CP-00 Supabase Verification Procedure (operator-run)

Purpose: the PGlite suite emulates Supabase; it is **not** Supabase. This procedure is the executable gate against a real **local Supabase stack or a Supabase branch database**, never production first. Use synthetic data only. Do not paste keys into tickets.

Status when written: **NOT RUN** (the implementation environment had no Docker, Supabase CLI, or authorized branch).

## 0. Prerequisites
- Supabase CLI + Docker (`supabase start`), or a Supabase **branch** created from the project (data-less).
- Migrations 001-012 from commit under review, applied in order with `supabase db reset` (local) or branch migration. Run as the `postgres` role.
- Two synthetic users (A, B) created through Auth signup; keep their JWTs in env vars `JWT_A`, `JWT_B`; `ANON_KEY`, `SERVICE_KEY` from the **branch** only.

## 1. Migration reliability
1. Apply 001-009, insert synthetic legacy rows (analyses with `result_summary`, uploads, cache, audit), then apply 010, 011, 012. Expect no error and no `WARNING: CP-00: could not create storage.objects policies` (that warning from 010 means the policies were NOT installed by 010; 011/012 then must have installed them without error).
2. Re-apply 012 (idempotent). Compare row-hash of the five tables before/after (see query in §6).
3. If 011/012 abort with `insufficient_privilege`, record the exact message. Do not continue; the migration role cannot manage `storage.objects` or the other creator roles' default ACLs, and the operator must run the failing statement as the owning role.

## 2. Effective grants (SQL editor, as postgres)
Run the "Verification SQL" from `docs/audits/CP-00-R1-HARDENING-REPORT.md` §D plus:

```sql
-- default ACL inventory: expect NO row granting to PUBLIC/anon/authenticated for r, S, f
SELECT d.defaclrole::regrole, d.defaclnamespace::regnamespace, d.defaclobjtype, a.grantee::regrole, a.privilege_type
FROM pg_default_acl d, aclexplode(d.defaclacl) a
WHERE d.defaclobjtype IN ('r','S','f') AND (a.grantee = 0 OR a.grantee::regrole::text IN ('anon','authenticated'));

-- storage policies (expect exactly: restrictive, roles {0}/public, bucket_id <> 'csv-uploads'::text)
SELECT polname, polpermissive, polcmd, polroles::regrole[], pg_get_expr(polqual, polrelid) AS using_expr,
       pg_get_expr(polwithcheck, polrelid) AS check_expr
FROM pg_policy WHERE polrelid = 'storage.objects'::regclass ORDER BY polname;

-- owners of public objects (expect only postgres)
SELECT relname, relowner::regrole FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN ('r','S','v','m');
SELECT proname, proowner::regrole, prosecdef, proconfig FROM pg_proc WHERE pronamespace='public'::regnamespace;
```

## 3. PostgREST checks (curl against branch API URL `$URL`)
Expected result in brackets.
```bash
# anon
curl -s -o /dev/null -w '%{http_code}\n' "$URL/rest/v1/profiles?select=*"            -H "apikey: $ANON_KEY"                       # [401/403 permission denied]
curl -s -o /dev/null -w '%{http_code}\n' "$URL/rest/v1/analysis_cache?select=*"       -H "apikey: $ANON_KEY"                       # [401/403]
curl -s -o /dev/null -w '%{http_code}\n' "$URL/rest/v1/audit_logs?select=*"           -H "apikey: $ANON_KEY"                       # [401/403]
curl -s -w '\n%{http_code}\n' -X POST "$URL/rest/v1/rpc/create_analysis_with_limit_check" -H "apikey: $ANON_KEY" \
  -H 'content-type: application/json' -d '{"p_user_id":"00000000-0000-0000-0000-000000000000","p_name":"x","p_status":"draft","p_period_start":"2020-01-01","p_limit":99999}'  # [403/404, no row created]
# authenticated user A
H="-H apikey:$ANON_KEY -H Authorization:Bearer\ $JWT_A"
curl -s "$URL/rest/v1/profiles?select=plan"       $H                                                    # [only A's row]
curl -s -X PATCH "$URL/rest/v1/profiles?user_id=eq.<A>" $H -H 'content-type: application/json' -d '{"plan":"pro"}'   # [403 permission denied]
curl -s -X POST  "$URL/rest/v1/analyses" $H -H 'content-type: application/json' -d '{"name":"SYNTHETIC","config":{"k":"v"}}'  # [403]
curl -s -X POST  "$URL/rest/v1/uploads"  $H -H 'content-type: application/json' -d '{"analysis_id":"<A analysis>","file_path":"x"}' # [403]
curl -s "$URL/rest/v1/audit_logs?select=*"   $H   # [403]
curl -s "$URL/rest/v1/analysis_cache?select=*" $H # [403]
curl -s -X POST "$URL/rest/v1/rpc/create_analysis_with_limit_check" $H -H 'content-type: application/json' -d '{...}' # [403]
# service role
curl -s "$URL/rest/v1/profiles?select=id&limit=1" -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" # [200]
curl -s -X PATCH "$URL/rest/v1/profiles?user_id=eq.<A>" -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" -H 'content-type: application/json' -d '{"plan":"plus"}'  # [2xx: webhook path]
```
Check the Auth user-A JWT cannot read user B's analyses/profile (zero rows).

## 4. Storage API checks (branch)
With JWT A, using the Storage API:
- `POST /storage/v1/object/csv-uploads/test.csv` [denied, RLS error]; same for upsert (`x-upsert: true`).
- Upload to another bucket that exists [allowed if its own policy allows].
- List/download of a pre-existing synthetic object in `csv-uploads` by its owner [still works].
- Delete of that object by owner [still works].
- `service_role` can still write to `csv-uploads` (known limitation: it bypasses RLS). Confirm no application code uses the service key for Storage (`grep -rn "storage" src` shows only the user-session client).

## 5. Auth, trigger, deletion
- Signup a new synthetic user: `profiles` row appears with plan `free`.
- User A deletes own analysis through `DELETE /rest/v1/analyses?id=eq.<id>`: 204, uploads cascade.
- Delete user via Auth Admin API (`DELETE /auth/v1/admin/users/<id>` with service key): profile/analyses cascade.
- Simulated Polar webhook (use the app's test signature or the unit-tested handler locally pointing to the branch): `profiles.plan` updates.

## 6. Legacy-hash check
```sql
SELECT 'analyses', md5(coalesce(string_agg(a::text,'|' ORDER BY id),'')) FROM public.analyses a
UNION ALL SELECT 'uploads', md5(coalesce(string_agg(u::text,'|' ORDER BY id),'')) FROM public.uploads u
UNION ALL SELECT 'analysis_cache', md5(coalesce(string_agg(c::text,'|' ORDER BY id),'')) FROM public.analysis_cache c
UNION ALL SELECT 'audit_logs', md5(coalesce(string_agg(l::text,'|' ORDER BY id),'')) FROM public.audit_logs l;
```
Run before and after 011/012; values must match.

## 7. Release gate for every future schema change
Any PR that adds a migration must (a) pass `src/db/__tests__/exposure-gate.test.ts` (it applies all migrations and fails on any client-reachable table/sequence/function), (b) re-run §2 on a branch, (c) create objects only as `postgres` via migrations (objects created by `supabase_admin` or other roles keep PostgreSQL's implicit PUBLIC EXECUTE on functions, which migration 012 cannot prevent), and (d) never expose a new schema through PostgREST without an explicit review.

## 8. Recording results
Record per check: PASS / FAIL / NOT RUN with timestamp, commit SHA, and DB branch id. A static read of the SQL is not a pass.
