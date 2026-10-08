# DEVTOOLS-00 Integration Report

Branch `research/cf-02-toolchain-live-verification` (from `b6f9e8c66c700c84f71766c38541c511bfe4b638`, the tip of `research/cf-01-free-tier-verification`, which matched `origin`). Worktree `/Users/eren/Documents/GitHub/ClinicalPSM-cf00`; its initial `git status` was empty. The CP-00 worktree stayed at `1bc924d…` and only `Derin Araştırma/` is untracked there; it was not touched. Final SHA is in the hand-off message.

## 1. URGENT FINDING (found by the new Gitleaks gate): committed database credential in a PUBLIC repository
| | |
|---|---|
| Category | Database password (PostgreSQL connection of a Supabase pooler user, host in `aws-1-eu-west-1.pooler.supabase.com`, database `postgres`) |
| Rule | `generic-api-key` |
| Location | `.vscode/settings.json` line 17 (a saved "Bug Bounty" SQL-client connection) |
| Introduced | commit `00d12c24` (2026-04-11); still present at the tip of this branch, on `main`, `phase/cp-00-safety-containment` and the research branches |
| Exposure | `ErenTahiroglu/ClinicalPSM` is **public** (GitHub API); not a fork; 0 forks at check time |
| Severity | **CRITICAL.** A `postgres.<project-ref>` pooler role connects as the database owner role of a Supabase project: it bypasses RLS and every grant hardened in CP-00 R1/R2, and can read, change or delete all data. Whether it points at the production project was not checked (no production access) |
| Additional exposure | While inspecting the finding my masking filter failed and the password appeared once in this agent session's terminal output. It is not written to any file, report, baseline or commit (the committed baseline is redacted; verified programmatically that it does not contain the value). Treat the credential as compromised regardless |

Required owner actions (none performed by me; I did not touch Supabase or Git history):
1. **Rotate the database password now** (Supabase dashboard: Project Settings > Database > reset database password) and update anything that uses it (local `.env`, Vercel env vars if any).
2. Review Supabase logs/auth events for unfamiliar connections since 2026-04-11 (the retirement Path B assessment becomes mandatory: the "zero users" claim says nothing about who could connect directly).
3. Remove `.vscode/settings.json` from tracking in a normal commit once rotation is done (not done here; instructions forbid automatic deletion), and decide whether a history rewrite is worthwhile. After rotation the old value is dead, and a rewrite of a public repo does not recall copies already scraped.
4. Enable GitHub secret scanning / push protection on the repository (free for public repos).

Handling in CI: the finding is carried as a **single-fingerprint baseline entry** (`.gitleaks-baseline.json`, redacted, `commit:file:rule:line`), so the gate fails on any NEW finding while the known one is printed as a warning on every run. This is a documented, temporary exception for one finding, not a directory suppression, and it must be removed after remediation.

## 2. Tools (details in `docs/devtools/TOOLCHAIN-MANIFEST.md`)
| Tool | Version | Evidence | Result |
|---|---|---|---|
| Graphify (`graphifyy`, uv tool) | 0.9.71 | wheel digest = PyPI digest; installed files = wheel; Apache-2.0 | PASS |
| Codebase Memory MCP | 0.11.0 | release checksum + GitHub attestation verified for the release asset; **installed binary differs from the release binary** | WARN (provenance of the installed build unverified; cannot swap while sessions run) |
| Superpowers plugin | 6.4.1 | registry commit = upstream tag commit; enabled; 15 `superpowers:*` skills visible in this session's skill list (incl. brainstorming, writing-plans, executing-plans, test-driven-development, systematic-debugging, requesting/receiving-code-review, verification-before-completion, using-git-worktrees, dispatching-parallel-agents, finishing-a-development-branch, subagent-driven-development, writing-skills, using-superpowers) | PASS |
| Gitleaks CLI | 8.30.1 | sha256 verified vs upstream checksums; self-test 7/7 (3 synthetic positives generated at run time, redaction checked, benign negative) | PASS |

Newer upstream versions exist for Graphify (0.9.80) and Superpowers (6.4.2); intentionally not adopted (no automatic upgrades).

## 3. Index statistics (after the final refresh in this phase)
| Index | Scope | Result |
|---|---|---|
| Graphify, `graphify extract . --code-only` then `graphify update .`, API keys unset | 194 source files (ts/tsx/mjs/js/sql/json config), docs and `*.md` excluded, research/data/secrets excluded | **995 nodes, 2,080 edges, 61 communities** (initial full extract: 181 files, 937 nodes, 2,024 edges, 46 communities) |
| Codebase Memory MCP, `index_repository` mode `fast`, `persistence=false` | same exclusions via `.cbmignore` | **1,412 nodes, 2,831 edges**; 2 partially parsed files (`globals.css`, `SettingsClient.tsx`); 25 files excluded by ignore rules |

Capability checks (executed this phase):
- Graphify: `query` (Polar webhook -> `updateProfileVerified()`, `polar/route.ts`, `audit.ts`, `Profile`), `affected "handleSaveResults"` (-> `results/route.ts`, `safety-hold.test.ts`), `path "handler()" "createAdminClient()"` (1 hop), `explain "withClinicalWriteHold()"`, `god-nodes`. Incremental refresh: added a probe file, `graphify update .` surfaced `graphifyProbeFn()` (degree 2); deleted it, `update --force` removed it. Finding: `update` also ingests Markdown/JSON structure locally (no LLM), so `*.md`/`docs/` were added to `.graphifyignore` to keep the scope code-only (graph went from 1,290 to 942 nodes).
- Codebase Memory: `search_graph("withClinicalWriteHold")` -> 1 function; `trace_path` inbound -> exactly the three guarded routes; `check_index_coverage` (5 paths: 4 `no_recorded_issue`, `docs/…` correctly `excluded`); `detect_changes` vs the previous branch -> changed files listed, `seed_symbols: 0` for config-only changes. Freshness: `generation_matches: true`.

## 4. Gitleaks results
| Scan | Result |
|---|---|
| `git` history (all reachable commits) | 1 finding: the credential above (redacted) |
| Working tree incl. ignored build output (`dir .`) | 78 raw hits, **all** in git-ignored local artifacts (`.next`, `dist`, `graphify-out`, miniflare trace stores holding JWT-shaped test session tokens) except the same `.vscode/settings.json` hit; the tracked-only scan equals the history result |
| Gate (`gitleaks.sh history` with baseline) | PASS (no new findings) |
| Self-test | 7/7 |

## 5. Gates actually executed (local, this phase)
Base: 9/9 PASS (`typecheck`, `lint`, `unit-tests` 431, `build`, `gitleaks-history`, `gitleaks-selftest`, `git-diff-check`, `dependency-inventory`, `ci-config`). Cloudflare: 5/5 PASS (`static-build`, `site-browser-tests` 75 checks, `diagnostic-exposure` 45 + artifact inspection, `auth-contract` 53, `free-compat`). Future phases listed as NOT_APPLICABLE. GitHub Actions workflows were **not executed on GitHub** (first push will be the first run).

## 6. Corrections made to the research branch
- Root `package.json`/`package-lock.json` restored to the CP-00 versions: the CF-00 vinext experiment had left an out-of-sync lockfile (React 19.3, Vite, vinext) that made `npm ci` fail, which would have broken CI. The root vinext files (`vite.config.ts`, `wrangler.jsonc`, `.dev.vars.example`) were removed from tracking; the vinext smoke scripts remain as historical evidence and need a manual vinext setup to run again. Production dependencies are unchanged.

## 7. Remaining blockers
1. Credential rotation (section 1), owner action, severity CRITICAL.
2. Codebase Memory binary provenance (WARN).
3. GitHub Actions workflows unexecuted.
4. Gitleaks upstream has no signed provenance for the release; integrity relies on the published checksum.
