# SEC-00 Supabase Retirement Gate

Nothing here pauses, deletes or changes Supabase or Vercel. Each consequential step needs the owner's separate written approval and the Red Team's decision.

## 1. Evidence (owner-confirmed facts, plus read-only checks I ran on 2026-10-08)
| Fact | Source |
|---|---|
| Both Auth accounts are the owner's; nobody else registered, purchased or knowingly used the product; no paying customers | **owner-confirmed** |
| `auth.users` 2 (both email-confirmed), `profiles` 1 (plan not free: 0; Polar ids: 0), `analyses` 0, `uploads` 0, `analysis_cache` 0, `audit_logs` 6, `storage.objects` 0, buckets 0, large objects 0, Vault secrets 0, 5 relations in `public`, no Edge Functions | owner counts, **independently reproduced** by read-only aggregate SELECTs through the connected Supabase connector (no row content returned) |
| The 6 audit rows: all `SUSPICIOUS_ACTIVITY`, `user_id='system'`, one UTC day (2026-04-19, 09:38-09:43), one IP, one user agent, all `CSRF token validation failed` on `POST /api/analyses` with neither CSRF header nor cookie; metadata keys only `url, method, ip, userAgent, hasCsrfHeader, hasCsrfCookie, security_event, description`; no upload/file/column/stack keys; no URL query strings; 0 reference an upload URL | read-only aggregates |
| Whether those six requests were the owner's own (e.g. an E2E or curl test) | **not established**; optional local IP-fingerprint comparison by the owner. They created nothing (rejected before any write) and contain no clinical content |
| PostgreSQL statistics (`n_tup_ins` etc.) show 0 everywhere, including tables that hold rows | statistics are reset/lost on restart, pause or restore: **unreliable as history**; no inference is drawn from them |
| Second account has no profile | cause **not established**; not safety-relevant for retirement (no data in any table either way). Not investigated further, as instructed |

## 2. Live exposure that remains until the owner acts (verified)
| Layer | Status |
|---|---|
| Vercel Authentication scope | `all_except_custom_domains` -> `www.clinicalpsm.com` and `clinicalpsm.com` are **public** (HTTP 200/307) |
| Supabase Auth sign-ups | **open** (`disable_signup=false`; email provider only; email confirmation required) |
| PostgREST/RPC (Data API) | **reachable with the public key**: `GET /rest/v1/analysis_cache?select=id` -> 200 `[]`. Catalog check: `anon` and `authenticated` hold SELECT/INSERT/UPDATE/DELETE/TRUNCATE on all five tables; RLS is on; policies are `{public}`; `analysis_cache.system_can_manage_cache` (`auth.uid() IS NULL OR …`) lets an anonymous caller read/write/delete cache rows; `audit_logs.system_can_insert_audit_logs` lets an anonymous caller insert audit rows; `profiles`/`analyses`/`uploads` are own-row `FOR ALL` (a signed-in user can edit their own profile fields incl. plan) |
| Functions | only three exist in `public`, all `SECURITY DEFINER`, executable by `anon` and `authenticated`: `cleanup_expired_cache`, `handle_new_user`, `rls_auto_enable`. `create_analysis_with_limit_check` (migration 007 in the repo) **does not exist live**, so the old app's analysis creation cannot succeed (consistent with `analyses = 0`) |
| `rls_auto_enable` drift | **Explained, benign:** it is the helper of event trigger `ensure_rls` (fires on `CREATE TABLE`; owner `postgres`), i.e. the dashboard's "automatically enable RLS" feature, not repository code |
| Migrations 010-012 | not applied (`schema_migrations` 001-009) |
| Vercel deployment | production target is still `main` @ `dfa475b` (pre-CP-00 code) |
| Vercel protection does **not** block PostgREST/RPC | stated explicitly: Deployment Protection covers only Vercel-hosted URLs; `https://<ref>.supabase.co/rest/v1/…` and `/auth/v1/…` are separate hosts and stay reachable until the Data API is disabled |
Practical risk today: abuse and junk-data insertion (cache and audit tables), self-registration, and future data entry if someone used the old app. There is no clinical data to leak at the moment. This is not a claim that unauthorized access never occurred.

## 3. Two paths
| | A. Pause then retire Supabase without applying 010-012 | B. Keep Supabase active for a transition |
|---|---|---|
| Preconditions | Vercel All Deployments on; sign-ups off; Data API off; Polar links off; no other integration depends on the backend (owner confirms: none known); required backup done (see section 5) | none of the A preconditions are required, but hardening is then mandatory |
| What it removes | The whole exposed backend, including the PostgREST/RPC surface, in one reversible step (pause) | nothing |
| Risk during transition | The Data API toggle/pause closes the direct exposure within minutes; between now and then the surface above stays open | The live database keeps `anon`/`authenticated` write grants and two open-policy tables until 011/012 are applied; 011/012 require the integration gate (branch database test, backup, verification SQL, Red Team approval) and understanding of drift; every week open adds exposure for no benefit |
| Effort | Four dashboard toggles; no deployment | Branch test + production migration + verification |
| Reversibility | Pause is restorable (Supabase docs: 1-year restore window, "90 days remaining" caption; restore moves a Free project to the latest minor Postgres version); deletion is not | Rollback of 011/012 re-opens the exposure |
**Recommendation: Path A.** There is no customer, no payment, no clinical data and a documented replacement (the tested Cloudflare static-first design). Applying 010-012 to a database about to be retired adds change risk with no benefit. Path B only if the owner needs the old app alive: then Data API stays on and 011/012 become mandatory first.

## 4. Gate conditions
| # | Condition | Status |
|---|---|---|
| G1 | Owner confirms both accounts are theirs and no third party used the product | **MET (owner-confirmed)** |
| G2 | Counts show no clinical records and no storage objects | **MET (owner counts + my read-only reproduction)** |
| G3 | Audit rows contain no clinical or upload evidence | **MET** (6 CSRF-failure security events, no sensitive keys); ownership of the single IP optional |
| G4 | Vercel Authentication scope = All Deployments | **OPEN (verified not set)** |
| G5 | Supabase sign-ups disabled | **OPEN (verified enabled)** |
| G6 | Data API disabled (or 011/012 applied under the gate) | **OPEN (verified reachable)** |
| G7 | Polar hosted links deactivated | **OPEN (owner confirmation needed; not externally verifiable)** |
| G8 | GitHub secret scanning + push protection enabled | **OPEN (verified disabled)** |
| G9 | Backup decision executed (section 5) | **OPEN** |
| G10 | `main` CI repaired; security PRs merged on Red Team approval | **OPEN** (PR 0 branch prepared) |
| G11 | Red Team approval for pause; later separate approval for deletion | **OPEN** |
Pause may be requested only when G4-G9 are verified and G11 (pause) is granted. Deletion additionally needs an observation period, a restore test decision and written owner approval.

## 5. Backup decision (smallest sufficient)
- No clinical records and only owner-controlled accounts: **no data backup is required.**
- Do: (a) schema/roles-only export (no personal data, tiny), plus (b) a written configuration note: Auth settings (providers, SMTP/redirect URLs), the project's env variable names in Vercel, Polar product ids, Supabase project ref/region. These items are not in any database dump (Supabase docs).
- Optional (owner's choice): a small `age`-encrypted archive of `public.audit_logs` (6 rows of low value) and a no-hash export of `auth.users`; keep outside all Git work trees and outside `~/Documents/GitHub`; never open it with a coding agent. A pause itself keeps all data restorable for a year, so these are belt-and-braces.
- A **complete application rollback** needs more than a schema dump: Vercel env variables, Auth/SMTP settings, Polar configuration, and the git history of the app; the schema file only restores structure.
- Stop conditions: any new row appears, a Storage object appears, any unexplained relation or change in counts.

## 6. Replacement and DNS
The planned replacement is the tested Cloudflare static-first prototype (accountless, browser-local, noindex, unvalidated-engine banner). **No cutover or DNS change is part of this gate**; it is a later, separately approved step. Until then the protected Vercel site is simply unavailable to the public.

## 7. Tooling controls (unchanged)
Graphify, Codebase Memory, Superpowers and Gitleaks stay in place. The Codebase Memory installed-binary mismatch is handled only in a maintenance window with no CBM session running (stage: verified binary already in `~/.local/share/clinicalpsm-tools/cbm-0.11.0/`); no active global tool was replaced.
