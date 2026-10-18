# SEC-00 R1: Final Containment Review and Supabase Retirement Readiness

Proposal for Red Team review. The incident is **not** declared closed; Supabase and Vercel were not changed, paused or deleted; no data was exported; the exposed password was neither used nor printed. Owner-provided facts are labeled as such.

## A. Baseline and branch SHAs
| Branch | SHA (local = origin) | Role |
|---|---|---|
| Security baseline `security/sec-00-credential-incident` | `53fb0e53fd058427b15d7b757407bc653726a55d` | audited baseline (parent `45c398b`, based on `d364052`) |
| `security/sec-00-untrack-vscode-main` | `fe7f5e71b2d9199e6e6fb180eb4c19360e7d3785` | minimal, from `origin/main` `dfa475b` |
| `security/sec-00-untrack-vscode-cp00` | `7067f7f6dd696de55a38d6c1890673c7099a609d` | minimal, from the CP-00 tip `1bc924d` |
| This work `security/sec-00-r1-retirement-readiness` | in the hand-off message | docs only, from `53fb0e5` |
Owner-owned `Derin Araştırma/` untouched. No merge, deploy, force-push or history rewrite.

## B. Three-branch source containment (re-verified by me this phase)
For each of the three branches at its `origin` tip: `.vscode/settings.json` is **not tracked**, and a Gitleaks `dir` scan of `git archive` of the tip (the tracked tree, no baseline) returns **0 findings**. The two minimal branches differ from their bases by exactly two files (`.gitignore` +5 and the deletion −20). The credential remains in 25 historical commits and existing clones (history not rewritten). Source containment: **PASS_WITH_FINDINGS** (history unchanged).
Incident facts re-checked: the leaked project ref is absent from the owner's Supabase account (which lists `ClinicalPSM` `vmfy…` and `Sentinax`), the owner states it was deleted, DNS is NXDOMAIN for it; therefore there is **no evidence it belonged to ClinicalPSM production**, and none is claimed. Password reuse elsewhere remains unknowable from here. Draft PR texts: `docs/operations/SEC-00-PR-DRAFTS.md` (prepared, not opened, because a PR to `main` triggers a failing CI and a preview build).

## C. GitHub CI results
- On the final baseline commit `53fb0e5`: `Security (gitleaks)` **success** and `Cumulative gates` **success** (base 10 gates, Cloudflare 5 gates including the Playwright browser tests on the Linux runner), observed via the GitHub API.
- Earlier run on `45c398b`: gates passed but the run did not terminate by itself and was cancelled (cause unestablished; job timeouts added). `d364052`: gates failed at `npm ci` on Node 20 (npm 10 vs a lockfile from npm 11), fixed by moving runners to Node 24.
- `main`'s own `ci.yml` is red since 2026-04-17 (log expired; cause unverified); the two minimal branches have no workflow run (their base `ci.yml` triggers on PRs to `main` only).
- Secret scanning and push protection are **still disabled** (rechecked).

## D. Production inventory findings
Owner-provided (unverified by me): `auth.users` 2, `profiles` 1, `analyses` 0, `uploads` 0, `analysis_cache` 0, `audit_logs` 6, `storage.objects` 0. Read-only connector metadata (no SQL, no rows): five application tables, no other relations in `public`/`auth`/`storage`, no Edge Functions, installed extensions `pgcrypto`, `uuid-ossp`, `supabase_vault`, `pg_stat_statements`, `plpgsql`, project active in eu-west-1; the connector's `rows` column shows 0 for all tables (planner statistics, so it can neither confirm nor refute the owner's counts).
Open questions that the counts alone cannot answer: whether both Auth users are the owner's; why one user lacks a profile; whether the six audit records contain upload/file/stack metadata or non-owner activity; whether rows were ever inserted into data tables and later deleted. **Metadata-only decision procedure:** `docs/operations/SEC-00-R1-INVENTORY-ADJUDICATION.md` (email-fingerprint comparison computed locally, trigger and timestamp checks, audit key/action/day/IP-fingerprint checks, `pg_stat_user_tables` lifetime inserts/deletes, unexpected-relation/large-object/vault checks, classification table, and what to send back as numbers only). **Not executed.** Until the owner establishes Path A (owner-only, nothing else), retirement is **BLOCKED**.

## E. Remaining privacy / security risks
1. **Production still runs the pre-CP-00 app** (`main` @ `dfa475b`, public, Subscribe buttons visible). The write holds, checkout hiding, audit hardening and webhook fixes are only on branches/previews (previews are behind Vercel Authentication).
2. **Production database still lacks migrations 010-012**: SECURITY DEFINER functions `cleanup_expired_cache`, `handle_new_user` and `rls_auto_enable` are executable by `anon`/`authenticated`; `rls_auto_enable` is not in the repo (schema drift); Auth leaked-password protection is off.
3. Self-registration is open on the public site (two Auth users exist, ownership unverified).
4. Polar checkout links still valid (owner action pending).
5. Credential in public history and clones; 13 unique cloners in 14 days (identities unknown); secret scanning off.
6. Codebase Memory installed binary provenance WARN (three CBM processes are active; replacement is unsafe now). Cloudflare throwaway resources preserved untouched (cleanup needs approval); plan/billing remain owner-attested.
7. Archive/retention: Auth rows hold emails and password hashes; audit rows hold IPs; both are personal data even if only the owner's.

## F. Backup decision and exact operator actions
Decision: **no data export is authorized or needed yet.** Tier 1 (schema/roles only) is always allowed once the owner runs it; Tier 2 (Auth/audit data) only after adjudication and a written owner approval and, if third-party data exists, counsel; Tier 3 (Storage) not needed (0 objects, and STOP if that changes). Verified against current Supabase docs: Free has no automatic backups; `supabase db dump` excludes `auth` and `storage` by default (so Auth needs `pg_dump -n auth` / `\copy`); the CLI `-p` password flag exposes the password in process arguments (avoid; use `PGPASSWORD` read with `read -rs`); dumps never include Storage objects; Vault root key, Auth settings/keys, webhooks must be handled separately. Procedure: `docs/operations/SEC-00-SUPABASE-INVENTORY-AND-BACKUP.md` section 8: backup directory outside any Git work tree and outside `~/Documents/GitHub` with a work-tree check, `age` public-key encryption with an offline private key, SHA-256 of the ciphertext, TOC-only verification (`pg_restore --list`), two media copies, no agent run in that directory, nothing pasted to chat. Nothing was executed.

## G. Safe containment / merge / retirement sequence
Full tables in `docs/operations/SEC-00-R1-INTERIM-CONTAINMENT.md`. Summary:
1. **Interim containment, owner, reversible, no code or data change:** Vercel Authentication on Production; disable new sign-ups in Supabase Auth; disable the Polar checkout links.
2. Owner runs the adjudication queries; Red Team classifies Path A / B.
3. Enable GitHub secret scanning and push protection.
4. Repair `main` CI separately.
5. Open the draft PRs; merge only on Red Team approval (`main` merge redeploys production).
6. Path A: Tier 1 backup -> Supabase pause (observe) -> final approval -> delete; remove Vercel project; move DNS later (no Cloudflare migration started). Path B: stop at containment, counsel, no deletion. Optional: apply migrations 011/012 on a branch first if the project must stay live.

## H. Verification run in this phase
| Check | Result |
|---|---|
| Tracked-tree gitleaks on 3 branch tips | 0 findings each |
| Base gates (typecheck, lint, 431 unit tests, build, gitleaks history + current-tree + 13-case selftest, diff check, dependency inventory, CI config) | **10/10 PASS** (run locally this phase; includes `base.gitleaks-current-tree`) |
| Cloudflare gates (5) | **5/5 PASS** (local, Brave) |
| Graphify code-only refresh | 996 nodes, 2,082 edges, 66 communities |
| Codebase Memory refresh (fast, no persistence) | 1,412 nodes, 2,831 edges; `detect_changes` vs baseline: 4 doc files, 0 code symbols affected |
| Blocked / not run | Supabase inventory queries (owner-run), live adjudication, backups, any production change |

## I. Proposed verdict
- Source containment (three branches): `PASS_WITH_FINDINGS`.
- **Overall incident / Supabase retirement readiness: `BLOCKED`** pending owner adjudication, because owner-only synthetic data cannot be established from the evidence available (two Auth users and six audit records are unexplained, historical inserts are unchecked) and because production still serves the unprotected pre-CP-00 application and database. Closure is not claimed.
