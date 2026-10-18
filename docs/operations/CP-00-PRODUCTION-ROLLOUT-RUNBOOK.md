# CP-00 Production Rollout Runbook (NOT EXECUTED)

Nothing in this document has been performed. It is a plan for an authorized operator. "Code verified" never means "production secure"; each step records its own evidence.

## Principles
- Application and database cannot be changed atomically. The sequence below minimizes the exposure window and never leaves a state where the app needs a DB object that is missing.
- No legacy data is read, exported or deleted by this runbook. Counts only.
- No subscription is cancelled and no refund is issued automatically.

## Interim-exposure analysis (why this order)
| State | App | DB | Exposure |
|---|---|---|---|
| Today | old (writes open) | pre-010 | All P0s live |
| App first | CP-00 R2 (API holds, audit via service role) | pre-010/011 | API paths closed; **direct PostgREST/RPC/Storage writes and the P0 table/RPC/audit/cache issues remain open**; audit writes via service role work and are harmless |
| DB first | old app | 010+011+012 | Old app's audit inserts (user session) fail silently, its upload/save/create routes hit permission errors (the old app also breaks for new analyses; acceptable, since that is the intent). No new data can be stored. **Closes the most severe database exposures first.** |
Safest achievable sequence: restrict checkout, **take backup, apply DB migrations to a branch and verify, then apply to production DB, then deploy the app**; the old app degrades safely (errors) under the new DB, while the new app under the old DB leaves the DB exposed. If the old app's error rate matters for existing users, deploy the app immediately after the DB step (minutes).

## 0. Pre-deployment checks (read-only)
1. Confirm which migrations are applied in production: `supabase migration list` / `SELECT * FROM supabase_migrations.schema_migrations`. Do not assume 010 is absent or present.
2. Run the §2 verification SQL of `CP-00-SUPABASE-VERIFICATION.md` against production in read-only mode; save the output (no data rows).
3. Inventory legacy counts (metadata only): analyses, with_results, uploads, `storage.objects` per bucket, analysis_cache, audit_logs. Record.
4. Check `csv-uploads` visibility and list `storage.objects` policies; check whether any signed URLs are outstanding (Supabase has no list; assume URLs issued before expiry remain valid until they expire; note the maximum expiry used in code: none issued by this repo, so risk is limited to manual dashboard links).
5. Review `profiles` for suspicious values (plan/limit/`polar_*` inconsistent with Polar records) using counts and ids only. 011 does not undo past escalations. Decide corrections with the owner; do not auto-correct.
6. List Vercel deployments: production, previews, and aliases serving old code.

## 1. Backup and recovery readiness
- Confirm automated backup / PITR status and retention. Take a manual backup or create a restore point immediately before the migration. Record id and time.
- Confirm a restore drill target exists (branch DB). Estimate restore time.
- Know the rollback statements (011 header, 012 header). Rollback re-opens exposures; require Red Team approval.

## 2. Operator approval
Written approval from the product owner and the Red Team for: DB migration, app deploy, and communication. Without it, stop.

## 3. Checkout restriction (Polar), before anything else
- In the Polar dashboard, disable/archive the Plus and Pro **checkout links** (`buy.polar.sh/...` seen in `src/lib/polar.ts`) and any products' public pages. Hiding buttons in the app does not disable these URLs.
- Existing subscribers: **do not** cancel. Keep the webhook active (do not rotate `POLAR_WEBHOOK_SECRET` without coordination).
- Upgrade attempts (Plus to Pro) use the same checkout: blocked by archiving.
- Decide refund/communication policy with the owner and legal: customers who purchase while features are paused, and existing customers who cannot start new analyses. This is a business/legal decision, not engineering.
- Evidence: screenshot or Polar API response showing the links disabled, recorded with date.

## 4. Pre-flight on a Supabase branch
Create a branch from production schema (no data) or restore the backup to a branch. Apply 010, 011, 012. Execute `CP-00-SUPABASE-VERIFICATION.md` §1-§5 in full. Any FAIL stops the rollout.

## 5. Production database migration
1. Maintenance window not required (migrations are short DDL), but take the lock risk into account: `REVOKE` and policy changes take brief ACCESS EXCLUSIVE/SHARE locks.
2. Apply 010 (if absent), 011, 012 as `postgres` with `supabase db push` or the SQL editor. Abort and record on any error. If 012 reports a default ACL for another creator role cannot be changed, run that single statement as the owning role (operator with `supabase_admin` access) and re-run 012.
3. Run the verification SQL; compare legacy hashes before/after (must match).

## 6. Application deployment (Vercel)
1. Ensure `SUPABASE_SERVICE_ROLE_KEY` is set for Production (and Preview if previews write audit). Never print it.
2. Deploy the CP-00 R2 commit to Production. A successful build is **not** evidence of security; proceed to §7.
3. Old deployments: Vercel production domains point to the new deployment. For **older production deployments reachable by unique URL** and preview deployments, either enable Deployment Protection (Vercel Authentication) for previews, or delete/disable old deployments after confirming nothing depends on them. They share the production database, so an older build that still has write routes is hazardous until the DB is locked down (done in §5) and is closed afterward by the DB permissions, but the old code paths should still be removed.

## 7. Immediate post-deployment verification
- `POST /api/analyses`, `/api/analyses/<uuid>/upload`, `/results` unauthenticated: expect 503 with code `CLINICAL_DATA_WRITES_SUSPENDED`.
- `/en/pricing`, `/tr/pricing`: notice present, no `buy.polar.sh` in HTML.
- `/en/new` for a logged-in synthetic user: hold notice.
- Existing synthetic account: login, view an existing analysis, delete an analysis, account settings.
- Polar: a test-mode webhook event updates a synthetic profile.
- Re-run §3 PostgREST checks against **production** with synthetic accounts only (anon checks are safe; do not touch real users).
- Check `audit_logs` receives service-role inserts and contains no filenames (spot-check a few rows via metadata keys only).

## 8. Failure handling
| Failure | Action |
|---|---|
| 011/012 abort | Stop; nothing partial should remain (verify with SQL). Record message; do not force. |
| App 5xx after DB change | Roll back the app deploy (Vercel instant rollback) only if the previous build is not worse; DB stays locked. |
| Existing users cannot read analyses | Check grants on `analyses`/`uploads`/`profiles` SELECT; do not widen to write privileges. |
| Webhook failing | Confirm service key and that `service_role` retains UPDATE on `profiles`; do not grant to authenticated. |
| Need rollback of DB | Only with Red Team approval; restore from backup/branch rather than hand-editing grants. |

## 9. Customer communication
Prepared by the owner/legal: new analyses are temporarily paused; existing data remains accessible; do not upload patient-level data until notified; paid-plan status/billing handling. Do not claim regulatory compliance. Do not state that past data was or was not accessed until the incident assessment (LEGACY-DATA-PLAN Phase B) concludes.

## 10. Final security sign-off
Evidence bundle: verification outputs (§0, §5, §7), Polar disablement proof, Vercel deployment list, hash comparison, list of residual risks. The Red Team decides closure; the implementation agent does not.

## Not covered / owner decisions
Legacy data retention/deletion/redaction; incident notification analysis; correction of previously escalated entitlements; account-deletion residue (`audit_logs`, `analysis_cache`, backups).
