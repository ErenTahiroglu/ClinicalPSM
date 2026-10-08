# CP-00: Supabase Retirement Options (analysis only; nothing executed)

Owner statements: zero registered users, no live payments, deployment on Vercel. **Not verified against production.** Do not terminate Supabase or Vercel, do not apply migrations 010-012 to production, do not delete or export any row by following this document alone.

## 1. Why "zero users" is not "zero sensitive records"
Earlier CP-00 findings showed that before the safety hold: uploads and result saves were possible for any authenticated account; `anon` could call an exposed RPC, read `analysis_cache`, and forge audit rows. So records can exist from testing (by the owner or others) even with no "customers". The state must be established by metadata-only counts.

## 2. Metadata-only inventory (owner/authorized admin runs in the Supabase SQL editor on production, **read-only**; counts and dates only; never `SELECT *`)
```sql
-- identity
SELECT count(*) AS auth_users, min(created_at), max(created_at), max(last_sign_in_at) FROM auth.users;
SELECT count(*) FILTER (WHERE email_confirmed_at IS NOT NULL) AS confirmed FROM auth.users;
-- application tables
SELECT count(*) AS profiles, count(*) FILTER (WHERE plan <> 'free') AS non_free,
       count(*) FILTER (WHERE polar_subscription_id IS NOT NULL) AS with_subscription FROM public.profiles;
SELECT count(*) AS analyses, count(*) FILTER (WHERE result_summary IS NOT NULL) AS with_results,
       min(created_at), max(created_at) FROM public.analyses;
SELECT count(*) AS uploads, coalesce(sum(row_count),0) AS total_rows_declared, min(created_at), max(created_at) FROM public.uploads;
SELECT count(*) AS cache_rows, min(created_at), max(created_at) FROM public.analysis_cache;
SELECT count(*) AS audit_rows, count(*) FILTER (WHERE action = 'FILE_UPLOADED') AS upload_events, min(timestamp), max(timestamp) FROM public.audit_logs;
-- storage
SELECT bucket_id, count(*) AS objects, coalesce(sum((metadata->>'size')::bigint),0) AS bytes, min(created_at), max(created_at) FROM storage.objects GROUP BY 1;
SELECT id, name, public FROM storage.buckets;           -- bucket names and public flag only
-- policy and grant state (also needed to assess exposure)
SELECT schemaname, tablename, policyname, cmd, roles FROM pg_policies WHERE schemaname IN ('public','storage') ORDER BY 1,2,3;
SELECT migration_name FROM supabase_migrations.schema_migrations ORDER BY 1;  -- or: supabase migration list
```
Also record (dashboard, no data): project region and plan; backup/PITR settings and retention; whether the project is paused; API keys in use and where they are stored (Vercel env); Auth providers and email templates; custom SMTP; webhooks and database webhooks; Edge Functions; cron jobs; connected integrations; log retention and drains; Vercel project environment variables, preview deployments and domains pointing at it; Polar webhook endpoint configuration; any other site or script that uses the project's keys.

Record outputs in a metadata sheet; commit nothing from production.

## 3. Path A: no protected records exist and all owner checks pass
Pass criteria (all must hold): `auth_users`, `profiles`, `analyses`, `uploads`, `analysis_cache`, storage objects = 0 (or only the owner's own clearly synthetic test rows, confirmed by the owner); `audit_logs` contains no `FILE_UPLOADED`/uploads-related rows and the owner accepts the remainder; no non-free profiles or subscriptions; no outside user ever signed in (`last_sign_in_at` only the owner); no public bucket content; no external integration depends on the project.
Steps (each needs written owner approval; take a final backup first even if empty):
1. Freeze: confirm the Vercel app no longer needs Supabase (static Cloudflare site live, or hold page).
2. Revoke secrets: rotate/remove Supabase keys from Vercel env; remove the Polar webhook endpoint (there are no subscriptions; confirm in the Polar dashboard).
3. Export schema only (no data) for the record (`supabase db dump --schema-only`), store in the repo's docs if desired.
4. Pause the project (reversible) and observe for a period chosen by the owner.
5. Delete the project only after the observation period and a final written approval; deletion is irreversible and removes backups on the provider's schedule.
6. Remove Vercel project, domains and env vars; point DNS to Cloudflare Workers static site.
7. Remove migrations/policies from the repo only in a later cleanup commit, never before step 5.
Migrations 010-012 are **not needed** on a project that will be deleted; applying them is optional hardening only if the project must stay live during observation (then apply on a branch first per the runbook).

## 4. Path B: historical protected records may exist
Triggered when any count above is non-zero beyond owner-confirmed synthetic rows, when buckets contain objects, when a bucket was ever public, or when any doubt remains.
1. **Contain first**: pause API exposure of the data: apply 010-012 (after branch verification and backup) or pause the project; disable public/signed access; rotate service keys.
2. **Assess** (CP-00 legacy plan Phase B): who uploaded, from which accounts, what the data are (by metadata and owner knowledge, not by opening records), jurisdictions, whether any outsider accessed them (Auth logs, Storage logs), retention of logs/backups. Legal/privacy counsel decides notification duties. Engineering does not make that determination.
3. **Decide per category** (owner + legal + Red Team): export to the data owner, retain with a lawful basis, redact (aggregate-only), or delete. Row-level `result_summary`, CSV objects, cache and audit metadata are handled separately.
4. **Execute only with approvals**: backup/branch restore test first; dry run on a branch; counts before/after; storage deletions by manifest of object keys (keys only); no content inspection.
5. **Backups**: deletion does not remove provider backups before they expire; record the expiry date and keep the project access-controlled until then, or ask the provider for deletion where the contract allows.
6. **Only then** retire the project as in Path A steps 4-7.
7. Keep a decommissioning record: counts, decisions, approvals, dates, key rotations, the provider's deletion confirmation.

## 5. External dependencies to clear in both paths
Vercel env vars and previews; Polar webhook and products (no subscriptions: archive checkout links per runbook); DNS (Cloudflare) records pointing to Vercel; Supabase auth redirect URLs; email sender domains; any scripts using the anon key; Git history (no secrets committed; confirm `.env*` ignored).

## 5b. New blocking finding (DEVTOOLS-00): leaked database credential
A Supabase database password is committed in `.vscode/settings.json` in the PUBLIC repository (since 2026-04-11). It must be **rotated first**, before any other retirement step; until then treat the project as potentially accessed by third parties and choose **Path B** unless logs prove otherwise. After rotation: review Supabase connection/auth logs from 2026-04-11, then continue. (No value is recorded in any document.)

## 5c. Is an encrypted backup needed before decommissioning?
- **Path A confirmed (all counts zero, owner-only synthetic rows):** no data backup is needed. Keep a schema-only dump (no data) and the metadata sheet.
- **Any non-zero protected-data count, or Path B:** take ONE encrypted backup before deletion, only if the data's legal owner (and counsel) decide retention is lawful or required: `pg_dump` of the affected schemas encrypted with `age` (public-key) and stored offline on owner-controlled media, with the key held separately; record SHA-256 of the archive and a destruction date. If the decision is deletion without retention, skip the backup and document why. Never place an unencrypted dump in the repository, Vercel, or a cloud drive.
- Provider-side backups/PITR expire on the provider's schedule; deleting the project does not give an earlier guarantee, so record that date.

## 6. Status
Inventory **NOT RUN** (no read-only Supabase connection was authorized for this phase; the owner's Cloudflare authorization does not cover Supabase). Path selection is **undetermined** until the owner provides the results.
