# CP-00 R2: Security Hardening, Database Privilege Closure & Verification

Proposal for Red Team review. Nothing merged, deployed, or applied to any real environment.

## 1. Baseline
Expected and actual starting SHA `2a68152398ab4db4cac3c14fe5f0c040f4228f11`, equal to `origin/phase/cp-00-safety-containment`. Parent of this work: that SHA. Final SHA: the R2 commit (reported in the hand-off message; a file cannot contain its own hash).
Initial `git status`: only four untracked files under the user's research directory (`Derin Araştırma/`, NFD-normalized name). They are excluded: never staged, modified, moved or ignored.

## 2. Findings

| ID | Finding | Source | Mechanism | Status | Severity |
|---|---|---|---|---|---|
| R2-1 | Future functions are executable by `anon`/`authenticated` after 011 | `011` (`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ... FROM anon, authenticated`) | PostgreSQL grants `EXECUTE` to `PUBLIC` by a built-in **global** default; a per-schema revoke from named roles cannot remove it. Reproduced: function created after 011 had `anon=true, authenticated=true` | **Confirmed** (executable test `closure.test.ts`, `exposure-gate.test.ts`) | P0 (latent: needs a future SECURITY DEFINER/RPC function) |
| R2-2 | Future tables/sequences | `011` | New tables had no client privileges in the emulation (tables/sequences have no PUBLIC default) | **Disproved** in emulation; **deployment-dependent**: real Supabase also has `supabase_admin` default ACLs granting to `anon`/`authenticated` | P1 |
| R2-3 | Storage self-verification checked names only | `011` §9 | A policy with the right name but permissive type / wrong expression / wrong role passes | **Confirmed by construction** (011 counts two policies by name, so every mutant that keeps the two names passes it; all 16 mutants are detected by 012's check) | P0 |
| R2-4 | Audit denylist insufficient | `src/lib/audit.ts` (R1) | Sentinel content under unexpected keys, free-text `description`, full IP, user-agent, URL were persisted | **Confirmed** by adversarial tests against allowlist design | P1 |
| R2-5 | `logPlanChanged` bypassed the sanitizer and wrote caller metadata verbatim | `audit.ts` (R1) | | **Confirmed**, fixed | P2 |
| R2-6 | `service_role` bypasses Storage RLS so csv-uploads policies do not bind it | emulation + Postgres semantics | | **Confirmed limitation** (no app code uses service key for Storage; grep verified) | P2 |
| R2-7 | Functions created by roles other than the migration owner keep implicit PUBLIC EXECUTE | PostgreSQL semantics | cannot be prevented from a migration | **Confirmed limitation**; mitigated by CI gate + process rule | P1 |

## 3. Changes

New: `supabase/migrations/012_cp00_r2_security_closure.sql`, `src/db/__tests__/{closure.test.ts,exposure-gate.ts,exposure-gate.test.ts,fixtures.ts}`, `docs/operations/CP-00-SUPABASE-VERIFICATION.md`, `docs/operations/CP-00-PRODUCTION-ROLLOUT-RUNBOOK.md`, this report.
Modified: `src/lib/audit.ts` (allowlist), `src/lib/__tests__/audit.test.ts`, `src/db/__tests__/authorization.test.ts` (shared fixtures only), R1 report cross-reference.
Untouched: 010, 011 (byte-identical), PSM engine, pricing, UI design.

### 3.1 Migration 012 (additive, aborts on any error, no data touched)
- **Default privileges.** For the migration owner: global `REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC`, `REVOKE ALL ... FROM anon, authenticated` on functions, and `REVOKE ALL ... FROM PUBLIC, anon, authenticated` on tables and sequences, both global and in `public`.
  - *Evaluated and chosen over alternatives.* The global revoke applies only to objects the **owner** creates later. Supabase-managed schemas (auth, storage, realtime, graphql) are owned by `supabase_admin` and are not affected. The one side effect is on functions the owner later creates in other schemas (e.g. extension functions); PUBLIC EXECUTE is restored by a schema-level default in `extensions` when that schema exists, so extension helpers (and e.g. `uuid_generate_v4()` used in column defaults) keep working. This repo uses `gen_random_uuid()` (core), unaffected.
  - Other creator roles with client-granting defaults (global or in `public`) are revoked dynamically; if the migration role is not allowed, `insufficient_privilege` aborts the migration (fail-closed, operator action documented).
- **Storage.** Policies reinstalled strictly: `AS RESTRICTIVE ... TO public`, expression `bucket_id <> 'csv-uploads'`, no exception handler.
- **Behavioral verification** (`-- BEGIN VERIFY ... -- END VERIFY`). Aborts if: any public object is not owned by the migration role; any table/column/sequence/function privilege for `anon`/`authenticated` deviates from the contract; a SECURITY DEFINER function lacks a pinned `search_path`; client policies remain on `audit_logs`/`analysis_cache`; a `FOR ALL` policy exists; RLS is off on any public table or on `storage.objects`; the INSERT/UPDATE guards do not match **name + RESTRICTIVE + command + role = PUBLIC + exact USING/WITH CHECK expression**; or a freshly created probe function/table/sequence (created as the owner, then dropped) is reachable by `anon`, `authenticated` or PUBLIC; or any default ACL (global or `public`, any creator) grants to PUBLIC/`anon`/`authenticated`. Probes prove the *effective* result of the defaults rather than reading their text.
- **Rollback.** Documented in the header; it re-opens future-object exposure and needs Red Team approval. The 011 rollback notes still apply.
- **Compatibility.** Requires: migration role owns the `public` objects; can `ALTER DEFAULT PRIVILEGES`, create/drop policies on `storage.objects`. In PGlite the role is a superuser, so permission failures that could occur on real Supabase (notably `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin ...` and `storage.objects` ownership) **could not be exercised**. This is the main reason the real-Supabase gate matters.

### 3.2 Audit allowlist (`src/lib/audit.ts`)
Closed set of 10 event types; per event a closed set of metadata keys with validators (UUID, bounded integers, enum members, ≤64-char `[A-Za-z0-9_-]` tokens, booleans). Everything else is dropped regardless of key or nesting. `description` free text is replaced by fixed reason codes. `user_id` must be a UUID or `system`; unknown actions are dropped (not stored). IPs stored as /24 (IPv4) or /48 (IPv6); user-agent, URL and method-bearing free text are not stored. Billing audit (`PLAN_CHANGED`: plan names + subscription token) and auth events are preserved. Writes use a fresh service-role client; failures print only action and error code.
Historical audit rows may contain filenames, user agents, full IPs and stack traces from before CP-00. They were **not** modified. Remediation (owner decision): after the Phase B assessment, run a reviewed one-time scrub of `metadata` keys `fileName`, `error_stack`, `error_message`, `userAgent`, `url` and null `user_agent`, on a branch with a backup, with Red Team approval.

## 4. Verification

| Gate | Command | Result |
|---|---|---|
| Type check | `npx tsc --noEmit` | PASS (exit 0) |
| Lint | `npm run lint` | PASS (exit 0) |
| Unit + DB suites | `npm test` | **PASS: 30 files, 404 tests, 0 failed, 0 skipped** (R1: 28 files / 352) |
| Build | `npm run build` (dummy env) | PASS |
| `git diff --check` | | PASS |
| PGlite authorization (R1 carry-over) | `src/db/__tests__/authorization.test.ts` | PASS (43) |
| Future functions / tables / sequences | `closure.test.ts` | PASS |
| Storage mutation tests | `closure.test.ts` (16 mutants + equivalent-formatting control) | PASS: every unsafe variant detected, the formatting variant accepted |
| Default-privilege mutants (4) + wrong-owner + other-creator-role revoke | `closure.test.ts` | PASS |
| Exposure gate over all migrations + meta-tests | `exposure-gate.test.ts` | PASS |
| Audit adversarial tests | `audit.test.ts` | PASS |
| Playwright (unauthenticated: `safety-hold.spec.ts`, `pricing.spec.ts`) | `playwright test -c <temp config>` using the installed **Brave** (Chromium) binary against `next start` with dummy Supabase env | **PASS: 16 / 16** (EN/TR pricing, hold notice, no Polar URL, API 503s, landing claims) |
| Playwright authenticated specs (`psm-workflow`, `auth`, `daily-limit`, ...) | needs a real Supabase test project | **NOT RUN / BLOCKED** (and several are obsolete under the hold) |
| Existing-analysis viewing, account settings, authenticated hold UI in a browser | needs real Supabase auth | **NOT RUN / BLOCKED** |
| Real Supabase (local stack or branch) | no Docker, no Supabase CLI, no authorized branch | **BLOCKED**. Operator procedure: `docs/operations/CP-00-SUPABASE-VERIFICATION.md` |

The Brave run is a substitute browser, not Playwright's bundled Chromium; the Chromium download had stalled in R1 and was not retried. The temp config lived outside the repo and was removed.

## 5. Guarantees and limitations

1. **Code inspection.** API holds precede body/session/DB access; no `createSignedUrl`/`getPublicUrl`; the service-role client is used only by the webhook, account deletion and audit; no service-key Storage path.
2. **Executable PGlite tests (real Postgres engine, emulated Supabase).** Everything in §3.1 behavior, grants matrix, future-object closure, Storage rule semantics incl. mutants, audit allowlist (unit), legacy data hashes identical across 011/012.
3. **Real Supabase.** Nothing verified.
4. **Needs production operator action.** Apply and verify 010/011/012; disable Polar links; bucket and live-grant review; old deployments; entitlement review; customer obligations (runbook).
5. **Unverified.** Real role memberships and ownership (`supabase_admin`, `supabase_storage_admin`); whether `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin` is permitted to `postgres` (if not, 012 aborts with a clear error and the operator must run it as the owner); PostgREST schema exposure settings; Storage API behavior; implicit PUBLIC EXECUTE on functions created by non-owner roles (R2-7); that `service_role` is unreachable by untrusted callers (key custody).

## 6. Legacy data
Untouched. Still stored: CSVs in `csv-uploads`, `uploads` metadata, `analyses.result_summary`/`config`, `analysis_cache`, historical `audit_logs`, backups. Potential exposures from the pre-fix period cannot be assessed from the repository. Owner decisions pending: retention/deletion/redaction, audit-row scrub, incident notification analysis, correction of any escalated entitlements. See LEGACY-DATA-PLAN.

## 7. Deployment readiness
Deployable after approval: application commit and migrations 010-012 **on a Supabase branch** for verification. Not deployable to production until: branch verification PASS (real Supabase gate), Polar links disabled, backup confirmed, Red Team approval. Order: runbook §3→§7 (checkout restriction, backup, branch verification, production DB, app, post-checks).

## 8. Proposed verdict
`PASS_WITH_FINDINGS_CANDIDATE`. All code-level items from the R1 review are implemented and executably tested on a real Postgres engine; two mandatory gates remain unmet because the environment cannot provide them (real Supabase, authenticated E2E). CP-00 must not be called closed.

## 9. CP-01 readiness
Not met. Blockers: real-Supabase gate PASS; Polar links disabled; 010-012 applied and verified in production; Red Team acceptance; owner decisions on legacy data and exception E1. CP-01 not started.
