# CP-00 Data-Flow and Retention Inventory

Baseline `dfa475b`. Facts are tagged **[CODE]** (verified in repository) or **[DEPLOY]** (depends on live Supabase/Vercel/Polar settings; unverified). No real patient data was inspected.

## 1. Routes where CSV or derived row-level data crosses browser → server

| Route | Payload | Destination | Status after CP-00 |
|---|---|---|---|
| `POST /api/analyses/[id]/upload` [CODE] | Full CSV file (multipart), `rowCount`, `columnNames` | Storage bucket `csv-uploads` at `csvs/{user_id}/{analysis_id}/{file.name}`; row in `uploads` | **Blocked** (503, pre-read) |
| `POST /api/analyses/[id]/results` [CODE] | `PsmResult` (per-row `propensityScores`, `matchedPairs` with row indices, balance table) + `config` (treatment/covariate column names) | `analyses.result_summary`, `analyses.config` (JSONB) | **Blocked** (503, pre-read) |
| `POST /api/analyses` [CODE] | `name` (free text; can contain identifiers if user types them) | `analyses.name` | **Blocked** |
| Direct PostgREST / Storage with user JWT [CODE: RLS `FOR ALL`; DEPLOY: storage policies unknown] | Anything the user chooses | `analyses`, `uploads`, `analysis_cache`, `csv-uploads` | Blocked only after migration 010 is applied |

Read paths of legacy data (unchanged): dashboard list, analysis detail, print page, `AnalysisDetailExport` (balance table), read `analyses.result_summary` via the user's session.

No other route accepts CSV or row data. `/api/webhooks/polar` receives only Polar subscription events. [CODE]

## 2. Supabase objects

| Object | Content | Sensitivity |
|---|---|---|
| `profiles` | plan, limits, `polar_customer_id`, `polar_subscription_id`, `plan_reset_at` | Account/billing identifiers |
| `analyses` | `name`, `status`, `config` (column names), `result_summary` (row-level scores + pair indices) | **Potentially sensitive** (row-level, re-identification risk when joined with source data; column names may reveal clinical variables) |
| `uploads` | `file_path` (contains user-supplied filename), `row_count`, `column_names[]` | Filename/column names may be identifying |
| Storage `csv-uploads` (private per CLAUDE.md [DEPLOY]) | **Raw CSV** | **Highest** |
| `analysis_cache` | `result` JSONB, `data_hash`, `config_hash`, `user_id` | Legacy; no code path in `src/` reads or writes it [CODE grep]. Contents unknown [DEPLOY]. |
| `audit_logs` | `user_id` (TEXT, no FK), `action`, `ip_address`, `user_agent`, `metadata` JSONB | See §3 |
| `auth.users` | email, password hash | Identity |

## 3. Audit logging and sensitive identifiers [CODE]

- `auditLog.fileUploaded` stores `fileName`, `fileSize`, `rowCount`, `analysisId`, plus client IP and User-Agent.
- `withRequestSizeLimit` writes `fileName`, `fileSize`, `rowCount` to `audit_logs` on limit violations.
- `auditLog.errorOccurred` stores `error.message` and **`error.stack`**; messages originating from `JSON.parse`/parsing could embed fragments of payloads.
- `console.log('[Audit Entry]', entry)` prints the full entry (incl. metadata) to Vercel logs when the DB insert fails. Vercel log retention is plan-dependent [DEPLOY].
- `audit_logs.user_id` is plain TEXT: rows **survive account deletion** (no cascade), retaining IP/UA/filenames.
- **Defect (not fixed in CP-00):** `AuditLogger` caches a single Supabase server client in a static singleton created from the first request's cookies, so later audit inserts run under that first request's session context. Needs a fix before CP-01 relies on audit logs.
- Upload path embeds `file.name` unsanitized into the object key.
- Client IP derived from `x-forwarded-for` (spoofable if not behind a trusted proxy chain) [DEPLOY].

CP-00 effect: the new guards run before audit code, so rejected requests produce **no** audit/console output (asserted by test).

## 4. Deletion paths and dependencies [CODE]

- `DELETE /api/analyses/[id]`: removes Storage objects for the analysis' `uploads` (via the user's client), then deletes the `analyses` row; `uploads` cascade by FK. Storage-remove result is not checked, so a failure leaves orphan objects silently.
- `deleteAccount` server action: collects the user's upload paths, removes objects (result unchecked), then `auth.admin.deleteUser` which cascades `profiles` and `analyses` (and `uploads`). Does **not** delete: `audit_logs` rows, `analysis_cache` rows (`user_id` TEXT, no FK), Polar customer/subscription (external), backups.
- Both deletion paths remain functional under CP-00 (hold does not touch them).

## 5. Backups and retention [DEPLOY, unverifiable from code]

Supabase automated backups / PITR retention, whether Storage objects are included, Vercel log retention, and Polar data retention are not defined in the repository. Deleted raw CSVs may persist in backups until backup expiry. A written retention statement does not exist in the repo.

## 6. Third-party scripts and services [CODE]

- No analytics/tag/error-tracking SDK in `package.json` or `src/` (grep for analytics, gtag, sentry, plausible, `next/script`: none).
- CSP (`next.config.ts`) allows `https://va.vercel-scripts.com` (script + connect) although no Vercel Analytics package is installed; this is an unused allowance to remove in a later phase.
- Fonts via `next/font/google` (fetched at build, self-served). CSP also permits `fonts.googleapis.com`/`fonts.gstatic.com`.
- Supabase (DB/Auth/Storage), Vercel (hosting, logs), Polar (payments: email, `customer_external_id`=user id). Polar receives no clinical data. [CODE]
- Vercel project-level integrations (Analytics, Speed Insights, log drains) [DEPLOY] unknown.

## 7. RLS and storage-policy assumptions

- [CODE] `profiles`, `analyses`, `uploads`: `FOR ALL` own-row policies (001). `uploads` policy joins via `analyses.user_id`.
- [CODE] `analysis_cache` policy `system_can_manage_cache` is `auth.uid() IS NULL OR <pro/admin>`: an unauthenticated (anon-key) caller has `auth.uid() IS NULL`, so this policy appears to grant the `anon` role full access to all cache rows. **Finding (not fixed; migration 010 only blocks writes).** Reads remain exposed if the table has rows. Needs verification in the live DB.
- [CODE] `audit_logs` SELECT policy (005) is `plan IN ('pro','admin')`. The plan CHECK (002) allows only `free/plus/pro`, so `'admin'` never matches and **any Pro subscriber can read all users' audit rows** (IPs, user agents, uploaded filenames in `metadata`). Insert policy (008) uses the same `auth.uid() IS NULL OR pro` pattern. **Finding (not fixed in CP-00); verify against the live DB.**
- [DEPLOY] No migration creates the `csv-uploads` bucket or its `storage.objects` policies (CLAUDE.md says to create manually). Actual bucket privacy and policies are unknown.
- The existing `rls.test.ts` is excluded from the default Vitest run and needs live Supabase.

## 8. Browser storage and worker lifecycle [CODE]

- No `localStorage`/`sessionStorage`/IndexedDB usage in `src/`.
- Dataset lives in React state (`PsmWizard`) as `rawData`; lost on navigation/refresh.
- Worker is created per run (`run-psm-in-worker.ts`), receives `rawData` by structured clone, is terminated on result/error/60 s timeout. No persistence inside the worker.
- Cookies: Supabase session cookies and a `csrf-token` cookie (readable by JS, double-submit).
- Object URLs/Blobs for downloads are created client-side (`downloadCsv`, PNG export); no server round trip.
