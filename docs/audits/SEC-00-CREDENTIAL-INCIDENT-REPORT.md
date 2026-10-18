# SEC-00: Exposed Database Credential, Incident Report

Proposal for Red Team review. The incident is **not declared closed** by this report. No secret value appears anywhere in this report, in the committed baseline, in commit messages or in tests (the committed baseline is redacted; the value was verified absent programmatically).

## A. Baseline and Git state
| Item | Value |
|---|---|
| Last audited commit | `d3640525b33cabc8b3ef074cf7e825a61c8bddca` (`research/cf-02-toolchain-live-verification`) |
| Working branch | `security/sec-00-credential-incident`, created from that commit in the worktree `/Users/eren/Documents/GitHub/ClinicalPSM-cf00` |
| Initial worktree status | clean |
| Tips that tracked the credential-bearing file | `main` `dfa475b`, `phase/cp-00-safety-containment` `1bc924d`, `research/cf-00-zero-cost-feasibility` `8e41c3b`, `research/cf-01-free-tier-verification` `b6f9e8c`, `research/cf-02-toolchain-live-verification` `d364052` (local and `origin`) |
| Owner-owned `Derin Araştırma/` | not read, not staged, not modified (excluded from every search and scan I ran) |
| Safety | no `git clean`, no `reset --hard`, no force-push, no history rewrite, no merge, no deploy |

## B. Rotation evidence
- Step 1 was asked first. The owner answered **"Yes, reset"** (owner-confirmed; I cannot verify a password reset from outside).
- Because the connection's project ref did not match any project in the owner's connected account (section C), a second question was asked. The owner answered that the leaked ref **does not exist / was deleted**.
- Independent corroboration (DNS only, no connection attempt, no use of the credential): on 2026-10-08 `db.<leaked-ref>.supabase.co` and `<leaked-ref>.supabase.co` return **NXDOMAIN**, while the live `ClinicalPSM` project's host resolves. This agrees with deletion. It does not prove the credential is unusable elsewhere.
- **I did not attempt to connect with the leaked password and ran no test against any production system.**

Status: **owner-confirmed, not independently verifiable beyond DNS.**

## C. Exposure scope (no secret)
| Aspect | Finding |
|---|---|
| What | one PostgreSQL password for a Supabase pooler login in a saved SQL-client connection named "Bug Bounty" (host `aws-1-eu-west-1.pooler.supabase.com`, database `postgres`, user `postgres.<ref>`; the entry also disabled TLS certificate verification) |
| File / line | `.vscode/settings.json`, line 17; the file contained only this connection entry (no other settings) |
| Earliest exposure in Git | commit `00d12c2` "fix: move next.js project to root directory for vercel auto-detection", author date 2026-04-11 00:23 (+03:00) = 2026-04-10 21:23 UTC. Pickaxe search of all refs shows the project ref was never in Git before this commit and in no other path |
| Commits containing the value | 25 (every later commit on the lineage) |
| Other files containing the value | none in Git history; none in the working trees of this repository, the main worktree (research folder excluded), or any other project under `~/Documents/GitHub`. Not checkable: other machines, password managers, Vercel/Supabase dashboards, other services where the same password may have been reused |
| Belongs to ClinicalPSM production? | **No evidence it does.** Connected Supabase account lists `Sentinax` (`zlgg…`) and `ClinicalPSM` (`vmfypftkayycndvgpfrj`, eu-west-1, created 2026-04-09); the leaked ref (`ixzuenvihwlmzndvrdvr`) matches neither and is NXDOMAIN. The project could have belonged to another account or been deleted; the Supabase connector cannot show deleted projects |
| Repository exposure | public repository created 2026-03-29 (public since an unknown date: GitHub exposes no visibility history), 0 forks, secret scanning and push protection **disabled** (so GitHub never alerted), last-14-day traffic: 13 clones (13 unique cloners), 4 views (1 unique). The identities behind those clones are unknown (they may be CI, deployment or the owner's own machines) |

## D. Source-tree remediation
Done after owner-confirmed rotation:
1. `.vscode/settings.json` removed (`git rm`) on `security/sec-00-credential-incident` (full-scope branch), and on two minimal branches so the actively maintained tips can adopt it without carrying research work: `security/sec-00-untrack-vscode-main` (from `origin/main`) and `security/sec-00-untrack-vscode-cp00` (from `origin/phase/cp-00-safety-containment`). Each of those two contains exactly two files changed: the file removal and `.gitignore`. **Nothing was pushed to `main` or to the CP-00 branch directly** (main is auto-deployed by Vercel; the CP-00 branch is under audit): the owner or Red Team opens PRs.
2. `.gitignore`: `/.vscode/settings.json`, `/.vscode/*.code-workspace`, `/.vscode/sqltools*`.
3. History **not** rewritten and no force-push: the value remains in 25 historical commits and in every existing clone. With the credential dead this is low residual risk; a coordinated rewrite is optional, owner-approved only, and cannot recall copies already made.
4. The research branches `cf-00` and `cf-01` are historical/superseded by `cf-02` and were not given separate commits.
5. The owner's local copy of the file in `/Users/eren/Documents/GitHub/ClinicalPSM/.vscode/settings.json` is untouched. Checking out a branch that removes it will delete that local file (it contains only the dead connection); copy it elsewhere first if wanted.
Local editor tooling should keep connections in a password manager or VS Code's secret storage, not in `settings.json`.

## E. Gitleaks and CI evidence
Executed in this phase (pinned Gitleaks 8.30.1):
| Check | Result |
|---|---|
| `gitleaks.sh current` (tracked tree, **no baseline**) before removal | FAIL (1 finding) as designed |
| `gitleaks.sh current` after removal | **PASS, 0 findings** (also PASS on the main-based and CP-00-based minimal branches) |
| `gitleaks.sh history` (baseline applied) | PASS: no new findings; 1 historical finding still reported by `gitleaks.sh known` ("accepted baseline, NOT remediation", `still-tracked=no` after removal) |
| `gitleaks.sh selftest` | **13/13 PASS**: 3 synthetic positives with redaction checks, benign negative, plus baseline semantics: the historical synthetic finding is detected and baselined; it stays visible without the baseline; a still-tracked secret fails the current-tree scan; the same secret reintroduced in a new file/commit fails despite the baseline; removal makes the current tree pass |
| Staged scan before commit | see section I (run immediately before committing) |
| Reports | git-ignored, redacted, never uploaded as artifacts (`verify-ci.mjs` fails a workflow that uploads artifacts next to gitleaks) |
Baseline entry: one fingerprint (`commit:file:rule:line`), kept because history is unchanged; it must be deleted if history is ever rewritten. It does not suppress any directory and cannot excuse a current file.

GitHub Actions evidence for `d364052` (observed via `gh run list`): `Security (gitleaks)` **success**; `Cumulative gates` **failure** at `npm ci` on the Node 20 runner ("Missing: @swc/helpers@0.5.23 from lock file"): the lockfile was written by npm 11 while Node 20 ships npm 10. Fix applied here: runners moved to Node 24 (npm 11) in `gates.yml` and `ci.yml`, lockfile untouched (an `npm@10` rewrite churned 238 lines and dropped `libc` metadata). `main`'s `CI` workflow has been failing since 2026-04-17 (last success 2026-04-13); its log has expired (HTTP 410) so the cause is **not verified**, though the lockfile/runner mismatch is a plausible candidate. Result of the first run of the updated workflows on `45c398b` (observed on GitHub): `Security (gitleaks)` **success** (current-tree step included). `Cumulative gates`: on the Linux runner **Base gates 10/10 PASS** and **Cloudflare gates 5/5 PASS** (Playwright Chromium; the first real browser run), future-gate listing success; however the run did not terminate by itself (jobs stayed `in_progress` ~15 minutes after printing their matrices and finishing post-job steps) and I cancelled it, so GitHub shows `cancelled`. Cause not established (the base job logged "Failed to save: Unable to reserve cache" while saving the npm cache; possible lingering processes). Mitigation added: `timeout-minutes` on every job. A re-run result is reported in the hand-off message.

## F. Supabase inventory and backup readiness
No production export, query of row contents, pause or deletion was performed. Read-only configuration metadata was read through the owner's connected Supabase connector (no SQL executed): project list, project status, migrations list, security advisors. Findings (`ClinicalPSM`, `vmfypftkayycndvgpfrj`): active, Postgres 17.6, applied migrations **001-009 only** (010/011/012 not applied); advisor warnings for SECURITY DEFINER functions executable by `anon`/`authenticated`: `cleanup_expired_cache`, `handle_new_user`, `rls_auto_enable` (the latter is not in the repository migrations: schema drift); Auth leaked-password protection disabled. The production hardening of CP-00 R1/R2 is therefore still **undeployed**.
The Free plan has no automatic backups and Storage objects are never in database backups (Supabase docs). `docs/operations/SEC-00-SUPABASE-INVENTORY-AND-BACKUP.md` gives: read-only inventory SQL, credential handling without shell history (`read -s` into `PGPASSWORD`), a schema-only/roles-only dump that is always allowed, a data dump only after a gate and written owner authorization, `age` encryption with offline key, integrity verification via checksum and `pg_restore --list` (no rows displayed), separate Storage treatment, restore prerequisites, and explicit stop conditions. **Not executed.**

## G. Incident assessment and logging limits
- Earliest exposure: 2026-04-10 21:23 UTC (commit `00d12c2`). Affected branches: all five listed in section A and their remotes.
- Credential owner: a Supabase project that no longer exists in the owner's account (see B/C); not ClinicalPSM production on current evidence.
- Same password elsewhere: not found in Git or local projects; reuse in external services is unknowable from here.
- Logs: the Supabase logs API returns at most a 24-hour window per query, and the project's earliest record at query time was 2026-10-08 08:27 UTC; nothing reaches back to April. For the deleted project, no logs exist to the owner. GitHub offers no clone-identity logs to the owner. **Absence of logs is not evidence of no unauthorized access.** Compromise of the dead project cannot be assessed; compromise of ClinicalPSM through this credential is unsupported by evidence but also cannot be excluded by logs.
- Required documentation/rotation: owner rotated; also recommended (not done): enable GitHub secret scanning + push protection (free for public repos), rotate any other credential that could share the password, and review whether the "Bug Bounty" project held any data worth a privacy assessment.
- Unresolved legal/privacy questions: whether the deleted project held personal or clinical data and whether any notification duty arises; for counsel, not engineering.

## H. Outstanding risks
1. Credential remains in public Git history and clones; mitigated by the deleted project, not eliminated.
2. Production hardening (migrations 010-012, Polar link disablement) still undeployed; live advisor warnings present.
3. Unknown identities of 13 recent cloners; no secret scanning enabled.
4. Schema drift (`rls_auto_enable`) unexplained.
5. Codebase Memory MCP installed binary differs from the verified release (WARN); not replaced because sessions are active; instructions in `TOOLCHAIN-MANIFEST.md`.
6. Cloudflare: three throwaway resources remain deployed (`cf01-throwaway-static-1008a`, `cf01-throwaway-probe-1008a`, D1 `cf01-throwaway-d1-1008a`), awaiting a separate cleanup approval; plan and billing remain owner-attested only (the API token has no billing scope; an existing Worker's CPU behavior contradicts a strict 10 ms Free limit).
7. `main` CI failing since April (cause unverified).

## I. Commits and branches
Filled in the hand-off message (a file cannot contain its own commit hash): `security/sec-00-credential-incident` (full scope), `security/sec-00-untrack-vscode-main` `fe7f5e7`, `security/sec-00-untrack-vscode-cp00` `7067f7f`.

## J. Proposed Red Team verdict
`PASS_WITH_FINDINGS_CANDIDATE` for **source-tree containment**: the current tracked tree is clean on all three prepared branches and the gate now blocks reappearance. Incident closure is **not** claimed: rotation is owner-attested, history is unchanged, exposure/clone identities and logs cannot support an access assessment, and production hardening is undeployed.
