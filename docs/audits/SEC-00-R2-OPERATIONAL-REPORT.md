# SEC-00 R2: Operational Containment and Controlled Retirement Gate

Proposal for Red Team review. Nothing was changed in Vercel, Supabase, Polar, GitHub settings or DNS; nothing was exported, paused, deleted, merged or deployed. Owner-confirmed facts are labeled; everything else was observed by me read-only.

## A. Baseline and branches
| Item | Value |
|---|---|
| Baseline | `779c18b24f2d2b4be2fd733a7c2343ec55f910ed` (`security/sec-00-r1-retirement-readiness`, equals origin) |
| This branch | `security/sec-00-r2-operational-containment` (docs + one read-only verifier script; SHA in the hand-off message) |
| Existing security branches (unchanged) | `security/sec-00-credential-incident` `53fb0e5`; `security/sec-00-untrack-vscode-main` `fe7f5e7`; `security/sec-00-untrack-vscode-cp00` `7067f7f` |
| New prepared branch | `ci/sec-00-main-ci-node24` `2c1b405` (one line in `ci.yml`, from `main` `dfa475b`) |
| Owner research folder | untouched |

## B. Owner-confirmed facts used
Both Auth accounts are the owner's; nobody else registered, purchased or knowingly used ClinicalPSM; no paying customers; password reset. These are statements; I did not ask for fingerprints, emails or passwords.

## C. Immediate production containment: status checked, NOT done
Verified against current Vercel documentation (page updated 2026-09-15): Vercel Authentication is available on all plans, and the scope **All Deployments** protects production domains; **Standard Protection does not** protect production domains. I could not open the 2026-09-09 changelog entry itself (the changelog index returned only newer entries); the docs page and the related-links title "Protect production deployments for free on every plan" support the claim.
| Control | Observed status 2026-10-08 | Method |
|---|---|---|
| Vercel Authentication on production domains | **NOT in effect**: project setting `ssoProtection.deploymentType = all_except_custom_domains` (Standard Protection); `www.clinicalpsm.com` -> HTTP 200 public, `clinicalpsm.com` -> 307 | Vercel connector (project metadata) + HTTP GET |
| Supabase new sign-ups | **NOT disabled**: `disable_signup=false`; only the email provider enabled; email confirmation required | public `GET /auth/v1/settings` with the public key |
| Supabase Data API (PostgREST/RPC) | **Reachable**: `GET /rest/v1/analysis_cache?select=id&limit=1` with the public key -> 200 `[]` | HTTP GET on an empty table |
| Polar hosted links | **Unknown**: cannot be checked without creating a checkout session; needs owner confirmation | n/a |
| GitHub secret scanning / push protection | **Disabled** | `gh api` |
Owner steps, in order, with exact dashboard paths and cautions: `docs/operations/SEC-00-FINAL-OWNER-CHECKLIST.md` (Turkish). Re-verification command (read-only, public GETs): `SUPABASE_PUBLISHABLE_KEY=<public key> bash scripts/devtools/verify-containment.sh`; its current output is 4 FAIL and 1 UNKNOWN, as expected before the owner acts. I will not report any of these as done until that script (or the Vercel project setting) shows it.

### Remaining direct database exposure (stated explicitly)
Vercel Authentication does not cover the Supabase hosts. Until the Data API is disabled (or migrations 011/012 pass the gate and are applied) a caller with the public key can: query the Data API; insert/read/delete rows in `analysis_cache` and insert forged rows into `audit_logs` (policies `system_can_manage_cache` and `system_can_insert_audit_logs`, both `auth.uid() IS NULL`-style); sign up an account (sign-ups open) and then edit their own rows in `profiles`/`analyses`/`uploads` (own-row `FOR ALL`, `anon`/`authenticated` hold full table privileges incl. TRUNCATE, which PostgREST does not expose); call three SECURITY DEFINER functions (`cleanup_expired_cache`, `handle_new_user`, `rls_auto_enable`; the old analysis RPC does not exist live). Impact today is limited by the absence of data; it is not zero (storage/junk/forged-record abuse).

## D. GitHub containment
- Current-tree Gitleaks (tracked tree, no baseline) re-run on the three security branch tips: **0 findings** each. Historical finding remains in 25 commits and clones; history not rewritten; the baseline entry is documented as "not remediation".
- The credential belonged to a different Supabase project on current evidence; it is **not** claimed to have compromised ClinicalPSM production. Correction accepted: **NXDOMAIN alone does not prove deletion** (a paused Supabase project can also stop resolving). What supports "not ClinicalPSM": the ref differs from the owner's two listed projects (`ClinicalPSM`, `Sentinax`) and from the production hostname, and the owner states it is gone. What is **not** established: whether that project is deleted, paused or in another account. Operator note: log in to the account that owned it (or check the Supabase dashboard's paused projects), and if it exists, rotate its password, then delete it; it must not remain restorable with a leaked credential.
- Minimal PRs: `docs/operations/SEC-00-PR-DRAFTS.md` now has PR 0 (CI fix), PR 1 (main), PR 2 (CP-00); none opened (opening triggers CI and previews; you can open them as drafts).
- `main` CI: **cause established.** In a throwaway worktree of `main` `dfa475b`, `npm@10 ci` (the npm of a Node 20 runner) fails with "Missing: @swc/helpers@0.5.23 from lock file", while `npm@11 ci` succeeds. Fix prepared (PR 0): Node 24 in `ci.yml` (Vercel's project already uses Node 24.x); the same runner version passed install/lint/type/test/build/gitleaks/Cloudflare gates in the SEC-00 branches on GitHub. It has not yet run as a PR on `main`.
- Secret scanning + push protection instructions: checklist step 5.

## E. Audit-log adjudication (read-only aggregates; no values, IPs, identifiers or stack contents were returned)
- 6 rows, all `SUSPICIOUS_ACTIVITY` / `security`, `user_id = 'system'`, one UTC day (2026-04-19 09:38-09:43), one distinct IP, one user agent, none matching an Auth user id.
- All 6 are "CSRF token validation failed" for `POST` requests to `/api/analyses`, with neither CSRF header nor cookie; none refers to an upload URL; no URL has a query string.
- Metadata keys present: `url`, `method`, `ip`, `userAgent`, `hasCsrfHeader`, `hasCsrfCookie`, `security_event`, `description`. **No** file name, column name, error stack/message, body or user identifier keys.
- Conclusion: no clinical-data or upload evidence; the rows are rejected requests (nothing was written by them). Consistent with a single client (plausibly the owner's own script or E2E run, but **not established**; optional local IP-fingerprint comparison in the checklist). Retention value is low; they hold an IP and user agent (personal data).
- Statistics vs history: `pg_stat_user_tables` shows 0 inserts/0 live rows for tables that contain rows, so it is **not** reliable historical evidence; no blanket "any historical insert = third-party exposure" rule is applied (R1 text corrected in the adjudication document).
- The second account has no profile: cause not established; not safety-relevant (no table holds data).

## F. Backup decision
Owner-confirmed owner-only accounts and no clinical data: **no data backup is required**. Smallest sufficient set: schema/roles-only export plus a written configuration note (Auth settings/SMTP, Vercel env variable names, Polar ids, project ref/region). An encrypted Auth/audit archive is optional (6 low-value rows; Auth export without password hashes); a pause keeps everything restorable for a year (Supabase docs). A complete application rollback needs more than a schema dump. Procedure and storage rules (outside Git, outside `~/Documents/GitHub`, `age` encryption, TOC-only verification, no agent access): `SEC-00-SUPABASE-INVENTORY-AND-BACKUP.md` section 8. Not executed.

## G. Retirement strategy
`docs/operations/SEC-00-RETIREMENT-GATE.md`: Path A (pause then retire without migrations 010-012) recommended; Path B only if the old app must stay alive (then 011/012 under the integration gate become mandatory first). Gate table: G1-G3 MET (owner-confirmed + my reproduction), G4-G9 OPEN (verified not done / unverifiable), G10-G11 OPEN. Supabase **cannot be paused yet**.
`rls_auto_enable` drift **explained**: helper of event trigger `ensure_rls` (CREATE TABLE) = the dashboard's "automatically enable RLS" feature; benign. Live drift that does matter: the 007 RPC `create_analysis_with_limit_check` is absent, so the old app cannot create analyses (consistent with `analyses = 0`).
Cloudflare static-first remains the planned replacement; no cutover, no DNS change. Cloudflare throwaway resources preserved (cleanup needs approval).

## H. Development-tool controls
Gitleaks 8.30.1, Graphify 0.9.71, Superpowers 6.4.1 unchanged and PASS; Codebase Memory still WARN (installed binary differs from the verified release; CBM sessions are active, so no replacement; verified binary staged). Graphs refreshed before and after this work (Graphify 996 nodes before, 999 after; Codebase Memory 1,412 nodes/2,831 edges). No tool was upgraded or silently replaced.

## I. Verification
Tracked-tree gitleaks on three tips: PASS. Full cumulative matrix run locally before commit: base 10/10 PASS and Cloudflare 5/5 PASS (typecheck, lint, 431 unit tests, build, gitleaks history + current-tree + 13-case selftest, diff check, dependency inventory, CI config, static build, 75 browser checks, exposure, 53 contract tests, free-compat); staged gitleaks PASS. Graph refresh after: Graphify 999 nodes / 2,085 edges / 74 communities; Codebase Memory 1,412 nodes / 2,831 edges. Live protection checks: **FAIL (4) / UNKNOWN (1)** by design because the owner has not acted; they are re-runnable and are the acceptance test for G4-G8. Not run: any owner dashboard action, any backup, any pause.

## J. Proposed verdict
`PASS_WITH_FINDINGS` for the analysis, evidence and preparation delivered. Operational containment is **not completed** (G4-G9 open), so incident closure and Supabase pause/retirement are **BLOCKED on owner actions** (a short, reversible list). No self-authorization of any next phase.
