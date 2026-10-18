# CP-00 Legacy Data Migration and Incident-Assessment Plan

**Documentation only.** Nothing here has been executed. CP-00 performs no destructive operation and no automatic deletion. Every step needs the approvals in §6.

## 1. Objective

Determine whether raw clinical datasets or row-level results were stored in production, decide per category whether to restrict, retain, export to the owner, or delete, and record the decision.

## 2. Phase A: Read-only inventory (no data content inspected)

Run with a **read-only** role, metadata only. Never `SELECT` CSV bodies, `result_summary`, or `column_names` content into notes or tickets.

```sql
-- counts and sizes only
SELECT count(*) AS analyses, count(*) FILTER (WHERE result_summary IS NOT NULL) AS with_results,
       min(created_at), max(created_at) FROM public.analyses;
SELECT count(*) AS uploads, sum(row_count) AS total_rows, min(created_at), max(created_at) FROM public.uploads;
SELECT count(*) AS cache_rows, min(created_at), max(created_at) FROM public.analysis_cache;
SELECT count(*) AS audit_rows, count(*) FILTER (WHERE action='FILE_UPLOADED') FROM public.audit_logs;
SELECT bucket_id, count(*), sum((metadata->>'size')::bigint) FROM storage.objects GROUP BY 1;
```

Also record (dashboard, read-only): bucket public/private flag, storage policies, RLS policy list, backup/PITR retention, Vercel log retention and drains, who holds service-role credentials.

Output: counts per table/bucket, date range, number of distinct users. Store as a metadata-only inventory sheet.

## 3. Phase B: Incident assessment

Questions to answer from Phase A and deployment settings:

1. Was `csv-uploads` ever public, or was any signed URL issued? (Storage + access logs.)
2. Are RLS/storage policies correct (owner-only)? Was `analysis_cache` reachable by the `anon` role (see inventory §7)?
3. Did logs (Vercel/Supabase) capture payload fragments (`error.stack`, `[Audit Entry]` console output)?
4. Who are the users (institutional emails per registration hint) and what jurisdictions apply? Legal/DPO to decide whether any notification duty exists. **Engineering does not make that determination.**
5. Is there evidence that real patient-level data was uploaded (user statements, support tickets), as opposed to synthetic/test data?

Deliverable: a written assessment (no data excerpts) with a recommended classification, owned by the product owner and legal/privacy contact.

## 4. Phase C: Options per category

| Category | Restrict now | Retain | Export to owner | Delete |
|---|---|---|---|---|
| Storage CSVs | Migration 010 stops new writes; confirm bucket private, no public/signed URLs | Only with documented lawful basis and owner awareness | Provide authenticated download of the user's own file (to be built; not in CP-00) | Delete objects after export window and approval |
| `uploads` metadata | Read-only after 010 | With CSV | N/A | Cascades with analysis delete |
| `analyses.result_summary` | Read-only after 010 (rows still viewable) | Aggregate balance table is low risk; per-row scores and pair indices are the concern | Existing balance-table export; add full export if requested | Set `result_summary` to a redacted aggregate-only form (non-destructive variant) or delete analysis |
| `analysis_cache` | Writes blocked by 010 | Unused by code | N/A | Candidate for truncate after confirming it is unused |
| `audit_logs` | n/a | Keep security events | N/A | Scrub `metadata.fileName` for FILE_UPLOADED/limit events; retention window to be set |
| Backups | n/a | Expire per provider schedule | N/A | Cannot be selectively deleted; document expiry date |

An option "redact in place" (replace per-row arrays with aggregates) preserves the dashboard while removing row-level data; it must be a separate reviewed migration with a pre-computed aggregate and verified backup.

## 5. Execution runbook (template, for a future approved phase)

1. Freeze: confirm migration 010 applied and CP-00 deployed (writes closed).
2. Backup: take and verify a restorable backup/snapshot **before** any change; record ID, time, and a restore test on a branch database (Supabase branching), not production.
3. Dry run on the branch DB: run the redact/delete script, compare counts with Phase A.
4. Approvals (§6) recorded in writing.
5. Execute in a transaction where possible; Storage deletions batched with a manifest of object keys (keys only, no content), logged.
6. Verify: counts match expected, dashboard loads for a test account, account deletion still works.
7. Record outcome in the closure report for that phase.

**Rollback:** database changes via the pre-change backup/branch restore; Storage deletions are **not reversible**, so objects are exported or backed up (with owner consent where required) before deletion, and deletion happens only after the dry run is accepted. Migration 010 rollback SQL is in its header.

## 6. Required approvals before any data deletion or redaction

- Product owner (data controller representative).
- Legal/privacy contact, after the Phase B assessment.
- Red Team (architecture owner) sign-off on the script and dry-run result.
- Communication to affected users where legal or contractual duty exists, decided by legal, not engineering.

## 7. Open items

- Real production state is unknown to this repository; every `[DEPLOY]` item in the inventory needs a human with dashboard access.
- Account deletion does not purge `audit_logs`, `analysis_cache`, Polar records, or backups; needs a documented policy.
- Storage-remove failures are silently ignored in both deletion paths; orphans possible.
