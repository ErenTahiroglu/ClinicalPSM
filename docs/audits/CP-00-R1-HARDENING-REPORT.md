# CP-00 R1: Database Authorization & Safety Hardening Report

Proposal for Red Team review. Nothing merged or deployed. No migration applied to any real environment.

## A. Baseline

| Item | Value |
|---|---|
| Audited commit (expected = actual HEAD at start) | `9fa33f2b44924d9fcca928a53327ff78675cceb2` |
| Its parent | `dfa475bc7b5c4b34f32827a5d89e82d9d6fbbd63` (`main`) |
| Branch | `phase/cp-00-safety-containment` |
| Final SHA | the R1 commit on this branch (a report cannot contain its own hash; reported in the hand-off message and visible via `git log -1`) |

## B. Findings

Method: migrations 001-010 / 001-011 executed on PGlite (real PostgreSQL engine) with emulated `anon`/`authenticated`/`service_role`, `auth.uid()`, `auth.users`, `storage.objects`, and **Supabase's default `GRANT ALL` on new public objects**. "Confirmed" = exploit executed successfully on the audited migration set.

| # | Finding | Status | Evidence |
|---|---|---|---|
| P0-1 | Profiles entitlement escalation | **Confirmed** (conditional on Supabase default grants, which are standard; live grants deployment-dependent) | BEFORE tests: user sets `plan='pro'`, `analyses_limit=999999`, `polar_subscription_id`; deletes and recreates profile as Pro |
| P0-1b | Modify another user's profile | **Disproved** | RLS `USING` limits to own row; also denied after R1 |
| P0-2 | `create_analysis_with_limit_check` exposed | **Confirmed** | BEFORE test: `anon` created an analysis for another `user_id` with `p_limit=999999` and arbitrary name; `SECURITY DEFINER` bypassed RLS; created analyses during the hold |
| P0-3 | Cross-user audit-log read | **Confirmed** | BEFORE test: Pro user reads another user's rows (plan `'admin'` is impossible under the 002 CHECK) |
| P0-3b | Forged audit inserts | **Confirmed** | `anon` inserted `PLAN_CHANGED` as `system` (008 policy `auth.uid() IS NULL OR ...`) |
| P0-4 | `analysis_cache` anon exposure | **Confirmed (read)**. Writes were already blocked by 010 trigger | BEFORE test: anon `SELECT` returns rows |
| P0-5 | Clinical content via `analyses.name/config` | **Confirmed** | BEFORE test: authenticated inserted analysis with row-like JSON in `config` and a sentinel in `name`; 010 did not block |
| P0-5b | Writes via `uploads` / `result_summary` / storage | **Disproved** for the 010 set | 010 triggers/policies blocked them (still verified in AFTER) |
| P0-6 | 010 swallows `insufficient_privilege` for Storage policy | **Confirmed** by inspection | `DO ... EXCEPTION WHEN insufficient_privilege THEN RAISE WARNING` |
| D-1 | Live grants/policies/bucket state in production | **Deployment-dependent**, unverified | See §H |
| D-2 | Real Supabase storage policies (permissive ones we cannot see) | **Deployment-dependent** | Emulated with a permissive `FOR ALL` policy; restrictive policy overrides it |
| D-3 | `AuditLogger` singleton reused first request's user-session client | **Confirmed** (code) and **fixed** | `src/lib/audit.ts` |

## C. Authorization matrix

`R`=SELECT, `W`=INSERT/UPDATE, `D`=DELETE, `X`=EXECUTE. Own = own rows via RLS.

| Object | anon before | anon after | authenticated before | authenticated after | service_role before/after | Needed for |
|---|---|---|---|---|---|---|
| profiles | table grant ALL; RLS own-row means no usable rows | none | R W D own | **R own** | all / all | pricing, quota display; entitlements written only by webhook & signup trigger |
| analyses | table grant ALL; RLS gives no rows, but the RPC inserted rows for anon | none | R W D own (any column) | **R own, D own** | all / all (010 blocks `result_summary`) | legacy read, deletion |
| uploads | table grant ALL; RLS gives no rows | none | R W D own | **R own** (rows go via FK cascade) | all / all (010 blocks new rows) | legacy read, delete cascade |
| analysis_cache | **R W (anon)** | none | R W D | none | all / all (010 blocks writes) | nothing (unused by app) |
| audit_logs | **W (anon)**, R (Pro) | none | W, R (Pro) | none | all / all | server-side audit via service-role |
| storage.objects `csv-uploads` | unknown | INSERT/UPDATE blocked (restrictive) | unknown | INSERT/UPDATE blocked | bypass | existing deletion preserved |
| `create_analysis_with_limit_check` | X | none | X | none | X / **X but raises hold exception** | nothing during hold |
| `cleanup_expired_cache`, `handle_new_user`, `cp00_block_clinical_writes` | X (PUBLIC default) | none | X | none | X / X | trigger/maintenance only |

(For `anon`, default grants existed but RLS left most tables unusable; the exploitable paths were the RPC, `audit_logs` insert and `analysis_cache` read, all demonstrated.)

The AFTER suite asserts the grant matrix exactly via `has_any_column_privilege` / `has_table_privilege`.

## D. Migration changes and why they are safe

- **010** is untouched (it may already be applied anywhere; rewriting is forbidden). Its Storage warning-only behavior is superseded by 011.
- **011 `011_cp00_r1_authorization_lockdown.sql`** (additive, idempotent, ~170 lines):
  1. Revokes ALL on every public table from `PUBLIC/anon/authenticated`, grants ALL to `service_role`; default privileges revoked for future objects.
  2. Re-grants only `profiles:SELECT`, `analyses:SELECT,DELETE`, `uploads:SELECT` to `authenticated`, with own-row policies; drops the `FOR ALL` policies.
  3. Drops all client policies on `analysis_cache`, `audit_logs` (RLS stays enabled -> deny by default). **No rows deleted or changed.**
  4. Replaces the RPC with a `SECURITY INVOKER`, `search_path=''` function that always raises `42501`; revokes EXECUTE on every public function from clients.
  5. Schema-qualifies and locks `search_path` on `handle_new_user` and `cleanup_expired_cache`.
  6. Reinstalls the Storage restrictive policies **without** exception swallowing; any privilege failure aborts.
  7. Self-verification block: raises if any grant, policy, function privilege, RLS state, or Storage policy deviates. Tested to abort.
- Safety evidence: no `DELETE FROM`, `TRUNCATE`, `DROP TABLE/COLUMN`, `UPDATE ... SET` on data (static test and a hash comparison of all five legacy tables before/after: identical). FK cascades, signup trigger, account deletion verified.
- **Rollback plan:** documented in the 011 header: re-grant per table, recreate dropped policies from 001/005/006/008, restore 007 function body. Rolling back restores the vulnerable state and requires a Red Team decision. Take a database backup or branch before applying.
- **Permission compatibility:** requires the migration role to own public objects (default `postgres` in Supabase) and to create policies on `storage.objects` (normally allowed for `postgres` in Supabase). If not, 011 aborts; Postgres DDL is transactional, and `supabase db push` normally runs each file in one transaction, but confirm nothing is half-applied with the verification SQL; apply the Storage policies from the dashboard SQL editor and re-run.
- **Prerequisites before applying anywhere:** (1) deploy app code from this commit first, or at the same time (audit logger now uses service role; without 011 nothing breaks, with 011 and old code audit writes by user-session would silently fail, which is non-fatal); (2) `SUPABASE_SERVICE_ROLE_KEY` set in Vercel; (3) backup/branch snapshot; (4) apply on a Supabase **branch** first and run the verification SQL below; (5) Red Team approval.

### Verification SQL (run on the target DB after applying; expect zero rows from each)

```sql
-- clients with unexpected table privileges
SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants
WHERE table_schema='public' AND grantee IN ('anon','authenticated','PUBLIC')
  AND NOT (grantee='authenticated' AND (
        (table_name IN ('profiles','uploads') AND privilege_type='SELECT')
     OR (table_name='analyses' AND privilege_type IN ('SELECT','DELETE'))));
-- column-level grants
SELECT grantee, table_name, column_name, privilege_type FROM information_schema.column_privileges
WHERE table_schema='public' AND grantee IN ('anon','authenticated','PUBLIC')
  AND privilege_type IN ('INSERT','UPDATE');
-- executable public functions for clients
SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE'));
-- FOR ALL policies / policies on locked tables
SELECT * FROM pg_policies WHERE schemaname='public' AND (cmd='ALL' OR tablename IN ('analysis_cache','audit_logs'));
-- RLS disabled
SELECT tablename FROM pg_tables WHERE schemaname='public' AND NOT rowsecurity;
-- storage block present (expect 2 rows, i.e. this query is the positive check)
SELECT policyname FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname LIKE 'cp00_block_csv%';
-- other roles that can write public tables (review manually)
SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee NOT IN ('postgres','service_role','supabase_admin');
```

## E. Test results (exact)

| Gate | Command | Result |
|---|---|---|
| Type check | `npx tsc --noEmit` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Unit + DB tests | `npm test` | **28 files, 352 tests passed**, 0 failed, 0 skipped (R0 was 26 files / 304) |
| of which DB authorization suite | `npx vitest run src/db` | **43 tests passed** (PGlite) |
| Build | `npm run build` (dummy env) | Compiled, 26/26 static pages |
| `git diff --check` | | exit 0 |
| Playwright | see §E2 | |
| DB gate on **real Supabase** | not available (no Docker/Supabase CLI/project access) | **BLOCKED** |

The DB suite is a real Postgres engine but **an emulation of Supabase**: it does not test PostgREST, GoTrue, the Storage API, `supabase_auth_admin`/`supabase_storage_admin` ownership, or the live project's actual grants. Treat it as a strong regression gate, not as proof for production.

### E2. Playwright
**BLOCKED, not passed.** `npx playwright install chromium` stalled at ~448 KB (no usable network download), so no browser was available, and the authenticated specs also need a live Supabase. `e2e/safety-hold.spec.ts`, `pricing.spec.ts`, `basic.spec.ts` (from R0) remain unexecuted. Substitute evidence: curl smoke in R0 against `next start`; unit tests of the route guards.

## F. Negative-test evidence (all in `src/db/__tests__/authorization.test.ts`)

- BEFORE (exploit succeeds): 5 tests (profile escalation, delete/recreate, anon RPC impersonation + quota bypass, Pro audit read + anon audit forge, anon cache read, direct analyses.config insert).
- AFTER, each expecting SQLSTATE `42501`:
  - profiles: each entitlement column UPDATE, INSERT forged profile, DELETE own, UPDATE other's, anon SELECT/UPDATE.
  - RPC: anon, authenticated (self and other id) denied; service_role raises the CP-00 hold exception; zero rows created by any attempt; no public function executable by clients; every `SECURITY DEFINER` function has `search_path=""`.
  - audit_logs: anon, Free, Plus, Pro, unrelated user: SELECT, INSERT, DELETE denied.
  - analysis_cache: anon, Free, Pro: SELECT/INSERT/UPDATE/DELETE denied; legacy row preserved.
  - analyses/uploads/storage: authenticated INSERT and every UPDATE column denied; anon denied; `csv-uploads` INSERT denied despite a permissive policy; other buckets unaffected.
  - Exact grant-matrix assertion for anon and authenticated across the five tables.

## G. Service-role / legitimate behavior still works (tests)

Polar-style entitlement update and revoke by `service_role`; audit insert/read by `service_role`; signup trigger creates a free profile; owner reads own legacy analysis (with `result_summary`) and uploads, others see none; owner deletes own analysis with upload cascade, deleting another's affects 0 rows; auth-user deletion cascades profile/analyses; existing Storage object deletion; `cleanup_expired_cache` callable by `service_role`; legacy data hash identical across 011; 011 idempotent. Unit: `AuditLogger` uses a fresh service-role client per call, never the user-session client. Existing webhook tests still pass unchanged.

Note: `service_role` writes of `result_summary` and to `analysis_cache` are still blocked by the 010 triggers; this is intended during the hold and must be revisited at CP-01.

## H. Production-only blockers and operator actions (NOT done; none verified)

A. Disable/archive the hosted Polar checkout links (Plus, Pro) in the Polar dashboard.
B. Verify `csv-uploads` is private; list `storage.objects` policies; confirm no signed URLs outstanding.
C. Verify live RLS and **effective grants** with the §D verification SQL on production and on a branch; confirm `anon` role really has default grants (the severity assumption).
D. Inventory legacy counts by metadata only (CP-00-LEGACY-DATA-PLAN Phase A); do not open records.
E. Check Vercel for older production/preview deployments still running pre-CP-00 code; the old build uses the user-session client for audit and the vulnerable RPC (until 011 is applied).
F. Decide obligations to existing paying customers during the hold (service continuity, communication, refunds are a business/legal decision; none automated here).
G. Apply 011 on a Supabase branch first; apply to production only after Red Team approval, with a backup. Order: deploy app commit, apply 011, run verification SQL.
H. Because P0-1..P0-5 may have been exploitable in production, review `profiles` for implausible plan/limit/`polar_*` values (compare against Polar records; metadata only) and `audit_logs`/`analysis_cache` for unexpected rows. Entitlements already escalated are **not** corrected by 011.

## I. Unresolved privacy / retention risks

Legacy CSVs, `result_summary`, `uploads`, cache rows and old audit rows still exist and are still readable by their owners (and cache/audit by `service_role`); no deletion or redaction performed. Account deletion still does not purge `audit_logs`/`analysis_cache` rows or backups. Storage-remove failures remain unchecked in the delete paths. Upload path still embeds the filename (unreachable under the hold). CSP still allows an unused Vercel script host. Hold-time audit rows already written contain historical filenames and stacks.

## J. Proposed verdict

`PASS_WITH_FINDINGS_CANDIDATE`. All five P0s are reproduced and closed in the migration set with executable tests, but the DB gate on real Supabase is **BLOCKED** and 011 is unapplied, so production remains exposed until the operator actions in §H are completed.

## K. CP-01 readiness

Not started. Cannot begin until the Red Team accepts this report, 011 is applied and verified on a Supabase branch, and the operator actions A-C are confirmed by a human.

---
**R2 update:** the future-function gap in 011 (default privileges) and the name-only Storage check were confirmed and addressed by migration 012; see `docs/audits/CP-00-R2-SECURITY-HARDENING-REPORT.md`. Playwright in §E2 was subsequently run for the unauthenticated specs using an installed Chromium-based browser.
