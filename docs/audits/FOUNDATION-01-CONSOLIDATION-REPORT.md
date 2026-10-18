# FOUNDATION-01 Consolidation Report: Two-Branch Consolidation, Clean Active Architecture & Research Contract

**Phase Identifier:** `FOUNDATION-01`  
**Repository:** `ErenTahiroglu/ClinicalPSM`  
**Date Context:** 18 October 2026  
**Independent Red Team Authority:** ChatGPT  
**Baseline Commits Verified:**
- Latest `origin/main`: `53fb05e7c8d9b77b46c4a5d8b7c9cc041345f6a6`
- Latest Cloudflare Source (`phase/clean-slate-03-security-dns`): `826725baaaf511803ff1f784b44cf527b9633e29`

---

## Section A: Original Branch Inventory and SHAs

Prior to consolidation, the remote repository contained exactly 15 branches across development, security, research, and staging phases:

| # | Branch Name | Remote Ref | Tip Commit SHA | Branch Purpose & Unique Content Summary | Recommended Disposal |
|---|---|---|---|---|---|
| 1 | `main` | `origin/main` | `53fb05e7c8d9b77b46c4a5d8b7c9cc041345f6a6` | Canonical repository base; Node 24 CI (PR #1) & untracked settings (PR #2) merged. | **KEEP (Permanent Branch)** |
| 2 | `development` | `origin/development` | *(New in this phase)* | New permanent active development integration branch. | **KEEP (Permanent Branch)** |
| 3 | `phase/clean-slate-03-security-dns` | `origin/phase/clean-slate-03-security-dns` | `826725baaaf511803ff1f784b44cf527b9633e29` | Staging verification, DNS runbook, redirect evaluator domain check. | Delete after Red Team approval |
| 4 | `phase/clean-slate-02-cutover-readiness` | `origin/phase/clean-slate-02-cutover-readiness` | `dacd7d6e6bf7d771339019d9bd01630e42999a2d` | Cutover redirect evaluator, privacy wording, C1-C12 checkpoints. | Delete after Red Team approval |
| 5 | `phase/clean-slate-01-staging` | `origin/phase/clean-slate-01-staging` | `6972c9c79a371d85502c4123d726273889928d19` | Cloudflare staging verification, live site tests, cutover runbook. | Delete after Red Team approval |
| 6 | `phase/clean-slate-cloudflare` | `origin/phase/clean-slate-cloudflare` | `5c9006e811f9819ee9a4269d31c6bb44f7b81b87` | Clean slate static asset app creation (`apps/web`). | Delete after Red Team approval |
| 7 | `phase/cp-00-safety-containment` | `origin/phase/cp-00-safety-containment` | `1bc924d5ad6d3dab474c4526ab3c01e0edf88843` | CP-00 R3 closure, Polar webhook updates, audit bounds fix. | Delete after Red Team approval |
| 8 | `research/cf-00-zero-cost-feasibility` | `origin/research/cf-00-zero-cost-feasibility` | `8e41c3bbc4a9c9107d8a6faec700195dc305ea73` | Zero-monthly-cost feasibility analysis across 4 architectures. | Delete after Red Team approval |
| 9 | `research/cf-01-free-tier-verification` | `origin/research/cf-01-free-tier-verification` | `b6f9e8c66c700c84f71766c38541c511bfe4b638` | Deployable auth PoC, static-first prototype, live evidence. | Delete after Red Team approval |
| 10 | `research/cf-02-toolchain-live-verification` | `origin/research/cf-02-toolchain-live-verification` | `d3640525b33cabc8b3ef074cf7e825a61c8bddca` | Cumulative CI gates, dev toolchain live verification. | Delete after Red Team approval |
| 11 | `security/sec-00-credential-incident` | `origin/security/sec-00-credential-incident` | `53fb0e53fd058427b15d7b757407bc653726a55d` | Initial credential incident containment and CI job timeouts. | Delete after Red Team approval |
| 12 | `security/sec-00-r1-retirement-readiness` | `origin/security/sec-00-r1-retirement-readiness` | `779c18b24f2d2b4be2fd733a7c2343ec55f910ed` | Containment review, inventory adjudication, backup procedures. | Delete after Red Team approval |
| 13 | `security/sec-00-r2-operational-containment` | `origin/security/sec-00-r2-operational-containment` | `3172a7dd6d500fd122959cd54f47f8c6ae5e5c62` | Operational containment status, retirement gate, read-only verifier. | Delete after Red Team approval |
| 14 | `security/sec-00-untrack-vscode-cp00` | `origin/security/sec-00-untrack-vscode-cp00` | `7067f7f6dd696de55a38d6c1890673c7099a609d` | Untrack `.vscode/settings.json` on CP-00 branch. | Delete after Red Team approval |
| 15 | `security/sec-00-untrack-vscode-main` | `origin/security/sec-00-untrack-vscode-main` | `fe7f5e71b2d9199e6e6fb180eb4c19360e7d3785` | Untrack `.vscode/settings.json` on main (merged as PR #2). | Delete after Red Team approval |
| 16 | `ci/sec-00-main-ci-node24` | `origin/ci/sec-00-main-ci-node24` | `2c1b4054f43c1bb37b8d5fc10a4d491ab6073c00` | Update main CI to Node 24 (merged as PR #1). | Delete after Red Team approval |

---

## Section B: Exact `development` Creation Evidence

The new permanent integration branch `development` was created directly from the verified `origin/main` baseline commit:
- **Parent Base Commit:** `53fb05e7c8d9b77b46c4a5d8b7c9cc041345f6a6` (PR #2 merge commit)
- **Execution Command:**
  ```bash
  git checkout -b development origin/main
  ```
- **Commit Verification:**
  ```text
  $ git rev-parse HEAD
  53fb05e7c8d9b77b46c4a5d8b7c9cc041345f6a6
  $ git log -n 1 --oneline
  53fb05e (HEAD -> development, origin/main, origin/HEAD) Merge pull request #2 from ErenTahiroglu/security/sec-00-untrack-vscode-main
  ```

---

## Section C: Selective Transplant Allowlist and Diff

Rather than merging the entire Clean-Slate branch chain (which would have introduced ~153 mixed commits and legacy migrations), an **explicit allowlist** was selectively transplanted from `phase/clean-slate-03-security-dns` (`826725baaaf511803ff1f784b44cf527b9633e29`):

### Transplant Allowlist
1. **Cloudflare Static Assets Application:**
   - `apps/web/build.mjs`
   - `apps/web/package.json`
   - `apps/web/package-lock.json`
   - `apps/web/wrangler.jsonc`
   - `apps/web/src/` (`content.json`, `demo.js`, `lang.js`, `style.css`)
   - `apps/web/test/` (`live.mjs`, `production-build.mjs`, `site.mjs`)
2. **Toolchain & Developer Scripts:**
   - `scripts/devtools/cf-free-compat.mjs`
   - `scripts/devtools/check-tools.sh`
   - `scripts/devtools/cutover-redirects.mjs`
   - `scripts/devtools/cutover-redirects.test.mjs`
   - `scripts/devtools/dep-inventory.mjs`
   - `scripts/devtools/gates.mjs`
   - `scripts/devtools/gitleaks-selftest.sh`
   - `scripts/devtools/gitleaks.sh`
   - `scripts/devtools/install-gitleaks.sh`
   - `scripts/devtools/phase-begin.sh`
   - `scripts/devtools/phase-end.sh`
   - `scripts/devtools/run-cf-gates.sh`
   - `scripts/devtools/verify-ci.mjs`
   - `scripts/devtools/verify-containment.sh`
   - `scripts/devtools/verify-cutover.sh`
   - `scripts/devtools/versions.env`
3. **Continuous Integration & Security Scanners:**
   - `.github/workflows/ci.yml` (pinned actions, permissions, Node 24)
   - `.github/workflows/gates.yml` (cumulative CI gate runner)
   - `.github/workflows/security.yml` (automated gitleaks scan)
   - `.gitleaks.toml`
   - `.gitleaks-baseline.json`
   - `.cbmignore`
   - `.graphifyignore`
   - `.gitignore` (incorporating CS-00, SEC-00, DEVTOOLS-00 ignore rules)
4. **Architecture, Audits & Operations Documentation:**
   - `docs/architecture/` (`CLEAN-SLATE-00-CLOUDFLARE.md`, `CF-00-ZERO-COST-ARCHITECTURE.md`, `CF-01-AUTH-AND-ENTITLEMENTS-CONTRACT.md`, `CP-00-DATA-FLOW-INVENTORY.md`, `CP-00-LEGACY-DATA-PLAN.md`, `CP-00-SAFETY-BASELINE.md`, `CP-01-LOCAL-FIRST-CONTRACT.md`, `CP-INFRA-001-DATABASE-DECISION.md`)
   - `docs/audits/` (`CLEAN-SLATE-00-REPORT.md`, `CLEAN-SLATE-01-LIVE-STAGING-REPORT.md`, `CLEAN-SLATE-02-CUTOVER-READINESS-REPORT.md`, `CLEAN-SLATE-03-SECURITY-AND-DNS-REPORT.md`, `CF-00-FEASIBILITY-REPORT.md`, `CF-01-INDEPENDENT-FEASIBILITY-EVIDENCE.md`, `CF-01-LIVE-VERIFICATION-REPORT.md`, `CP-00-CLOSURE-REPORT.md`, `CP-00-R1-HARDENING-REPORT.md`, `CP-00-R2-SECURITY-HARDENING-REPORT.md`, `CP-00-R3-CLOSURE-REPORT.md`, `DEVTOOLS-00-INTEGRATION-REPORT.md`, `SEC-00-CREDENTIAL-INCIDENT-REPORT.md`, `SEC-00-R1-RETIREMENT-READINESS-REPORT.md`, `SEC-00-R2-OPERATIONAL-REPORT.md`, `data/cf01-live-measurements.json`)
   - `docs/devtools/` (`CI-WIDENING-MATRIX.md`, `PHASE-TRANSITION-PROTOCOL.md`, `TOOLCHAIN-MANIFEST.md`, `gates.json`)
   - `docs/operations/` (`CF-01-LIVE-TEST-RUNBOOK.md`, `CLOUDFLARE-DOMAIN-CUTOVER.md`, `CP-00-PRODUCTION-ROLLOUT-RUNBOOK.md`, `CP-00-SUPABASE-RETIREMENT-OPTIONS.md`, `CP-00-SUPABASE-VERIFICATION.md`, `LEGACY-VERCEL-SUPABASE-RETIREMENT.md`, `SEC-00-FINAL-OWNER-CHECKLIST.md`, `SEC-00-PR-DRAFTS.md`, `SEC-00-R1-INTERIM-CONTAINMENT.md`, `SEC-00-R1-INVENTORY-ADJUDICATION.md`, `SEC-00-RETIREMENT-GATE.md`, `SEC-00-SUPABASE-INVENTORY-AND-BACKUP.md`, `cutover/wrangler.cutover.jsonc.example`)
5. **Safety Containment & Audit Enhancements:**
   - `src/lib/safety.ts` (safety hold constants fail-closed)
   - `src/lib/audit.ts` (metadata bounds fix, sanitized error logging)
   - `src/lib/polar.ts` (safe checkout gating via `getCheckoutUrl`)
   - `src/app/api/analyses/` (wrapped with `withClinicalWriteHold`)
   - `src/app/[locale]/pricing/page.tsx`, `src/features/analysis/components/WizardStep3Settings.tsx`, `src/app/[locale]/(dashboard)/new/page.tsx`
   - `messages/en.json`, `messages/tr.json` (removal of unverified claims)
   - `supabase/migrations/010_cp00_safety_hold.sql` (containment trigger reference)
   - `src/app/api/__tests__/safety-hold.test.ts`, `e2e/safety-hold.spec.ts`

### Explicitly Excluded from Transplant
- `experiments/cf00-static-first/` (throwaway PoC)
- `experiments/cf00-vinext/` (throwaway PoC)
- `experiments/cf01-auth-poc/` (throwaway PoC)
- `experiments/cf01-static-site/` (throwaway PoC)
- `experiments/cf02-cpu-probe/` (throwaway PoC)
- `supabase/migrations/011_cp00_r1_authorization_lockdown.sql`
- `supabase/migrations/012_cp00_r2_security_closure.sql`
- Direct branch merge commit history.

---

## Section D: Active Versus Retired Source Inventory

To maintain a strict boundary between active production code and historical/retired runtime code:

```
[Repository Root]
├── Active Production Architecture (Cloudflare Workers Static Assets)
│   ├── apps/web/                  <-- The active, deployable frontend application
│   ├── src/lib/psm/               <-- Mathematical engine (UNVALIDATED, pending CP-WEBR-00)
│   ├── scripts/devtools/          <-- Verification toolchain, gates, and security scanners
│   └── docs/                      <-- Specifications, PRDs, contracts, and audit ledgers
│
└── Retired Legacy Architecture (Preserved for Historical Evidence & Test Scaffolding)
    ├── src/app/                   <-- Legacy Next.js App Router (All writes blocked by 503 holds)
    ├── src/features/              <-- Legacy UI components (Preserved until static parity)
    ├── src/lib/supabase/          <-- Legacy Supabase client integration (Inactive)
    ├── supabase/migrations/       <-- Legacy PostgreSQL migrations 001-010 (Frozen)
    └── e2e/                       <-- Legacy Playwright end-to-end suite
```

---

## Section E: Encrypted Archival Verification Evidence

As mandated by Section 3, all 15 branch tips, complete histories, and tags were archived and encrypted before proposing branch deletions. Because repository history contains a previously exposed, rotated database credential, the archive was generated and encrypted strictly outside Git:

1. **Unencrypted Bundle Creation:**
   - Created via `git bundle create ./tmp_archive.bundle --all`
   - Verified via `git bundle verify ./tmp_archive.bundle`: Confirmed 33 refs (all local heads, remote refs, and HEADs).
   - Bundle Object Count: 1,197 objects.
   - Bundle Size: 1,016,537 bytes.
   - Plaintext SHA-256 Checksum: `49734e294e8a7da34d3168aeb5cc33565bb4a4b9d95e031e618d79d158bc4077`
2. **Cryptographic Encryption:**
   - Encrypted using AES-256-CBC with PBKDF2 (100,000 iterations, random 32-byte key, random 16-byte IV).
   - Encrypted Archive Path:  
     `/Users/eren/.gemini/antigravity-ide/brain/bde2c483-da90-4bd7-8519-833214691e68/scratch/archive/clinicalpsm-branches-archive-20261018.bundle.enc`
   - Encrypted Size: 1,016,560 bytes.
   - Encrypted SHA-256 Checksum: `9e3208230ae210da6e0370f17792ddeb96dbd4888e1065e8289f29be4f5a67fd`
   - Decryption Round-Trip Verification: Successfully decrypted ciphertext; computed SHA-256 matched plaintext `49734e294...` with zero byte variance.
3. **Cleanup:**
   - The plaintext bundle was immediately unlinked from the filesystem.
   - Zero credentials or passwords were printed to logs or committed to Git.

---

## Section F: Two-Branch End-State Plan

### Target Branch Topology
- **`main`:** Production-operational releases only. Currently locked to `53fb05e7c8d9b77b46c4a5d8b7c9cc041345f6a6`. Will receive promotion from `development` only after Phase CP-WEBR-00, statistical validation, and final cutover approval.
- **`development`:** Active integration branch for Claude Code and Antigravity.

### Proposed Remote Branch Deletion List (Subject to Red Team Sign-Off)
Once ChatGPT approves FOUNDATION-01, the following 13 redundant remote branches should be deleted:
1. `origin/ci/sec-00-main-ci-node24` (Merged into `main` via PR #1)
2. `origin/security/sec-00-untrack-vscode-main` (Merged into `main` via PR #2)
3. `origin/security/sec-00-untrack-vscode-cp00` (Redundant with PR #2)
4. `origin/security/sec-00-credential-incident` (Superseded by SEC-00 closure)
5. `origin/security/sec-00-r1-retirement-readiness` (Superseded by SEC-00 closure)
6. `origin/security/sec-00-r2-operational-containment` (Superseded by SEC-00 closure)
7. `origin/research/cf-00-zero-cost-feasibility` (Transplanted to `docs/`)
8. `origin/research/cf-01-free-tier-verification` (Transplanted to `docs/`)
9. `origin/research/cf-02-toolchain-live-verification` (Transplanted to `docs/` and `scripts/`)
10. `origin/phase/cp-00-safety-containment` (Transplanted to `development`)
11. `origin/phase/clean-slate-cloudflare` (Transplanted to `apps/web/`)
12. `origin/phase/clean-slate-01-staging` (Transplanted to `apps/web/` and `docs/`)
13. `origin/phase/clean-slate-02-cutover-readiness` (Transplanted to `scripts/` and `docs/`)
14. `origin/phase/clean-slate-03-security-dns` (Transplanted to `development`)

*Note: In accordance with completion rules, NO remote branches were deleted in FOUNDATION-01.*

---

## Section G: Three-Research Synthesis

Synthesizing the three independent research studies (`Preregisterable Statistical Reference Contract`, `deep-research-report.md`, and `ClinicalPSM Deep Research Perplexity.md`):

### 1. Accepted Core Requirements
- **Local-First Execution:** Zero row-level patient data leaves the browser.
- **Design/Inference Boundary:** Matching is design (preprocessing); outcome effect estimation is separate inference.
- **Biostatistical Parity:** Logistic regression IRLS deviance check ($10^{-8}$) and step-halving; Austin caliper on linear logit scale standardizing by unadjusted treated cohort variance; SMD continuous denominator locked to unadjusted treated cohort SD; binary balance as raw proportion differences; continuous variance ratios.
- **STROBE Compliance:** Complete sample accounting, common support tracking, and explicit warnings when caliper attrition shifts estimand from ATT to ATM.
- **Publication Bundle Value:** Focus on editable Word Table 1, vector Love plots, Methods text, R script, and Method Manifest.

### 2. Rejected Hypotheses
- **Monthly SaaS Billing:** Refuted by academic workflow reality (high churn $>80\%$). Replaced by per-manuscript bundle or lab pass.
- **Targeting Unassisted Residents:** Rejected due to severe statistical knowledge gaps and risk of publishing invalid observational results.
- **Automated Confounder Selection:** Rejected because statistical significance testing induces collider stratification bias.
- **Universal Balance Thresholds:** Rejected; balance heuristics ($0.10$ and $0.05$) require contextual clinical evaluation.
- **Unvalidated TypeScript Parity Claims:** Prohibited until R golden test suites pass.

### 3. Unverified Hypotheses
- Willingness to pay $49–$99 for the Publication Bundle (requires real payment experiment).
- Browser memory scaling beyond 50,000 rows (requires stress benchmarking).
- WebR WASM in-browser performance and download tolerance (evaluated in `CP-WEBR-00`).

---

## Section H: Statistical Scope and Open Scientific Questions

### Disambiguated Implementations
1. **Distance Scale:** Disambiguated `distance = "glm", link = "logit"` from linear logit distance. ClinicalPSM explicitly locks matching distance to the **linear predictor scale (`linear.logit`)**.
2. **Caliper Default:** Canonical MatchIt defaults to `caliper = NULL`. The Austin 0.20 SD logit caliper is an optional, explicitly declared profile.
3. **Balance Metrics:** Explicitly codified cobalt-compliant formulas. Prohibited post-matching pooled variance in SMD denominators and prohibited balance p-values.

### Open Scientific Questions (Deferred to CP-WEBR-00 & CP-02)
- Whether WebR WASM execution eliminates the ongoing maintenance burden of replicating MatchIt's C++ nearest-neighbor routines in TypeScript.
- How to handle high-dimensional multi-category factors in small clinical samples without inducing quasi-complete separation.

---

## Section I: Claude Code and Antigravity File-Ownership Policy

To prevent concurrent file modification and race conditions during pair programming:

```
[Claude Code Ownership]
├── src/lib/psm/               <-- Statistical algorithms & numerical solvers
├── scripts/devtools/          <-- CI gates, security scanners, build scripts
├── .github/workflows/         <-- GitHub Actions automation
├── docs/science/              <-- Statistical reference contracts & formulas
├── docs/architecture/         <-- Infrastructure & local-first specifications
└── docs/audits/               <-- Verification reports & gate ledgers

[Antigravity Ownership]
├── apps/web/src/              <-- UI presentation, layout, CSS, language strings
├── apps/web/test/             <-- Frontend accessibility & browser user journeys
├── src/features/              <-- Wizard UI components & client forms
├── src/components/ui/         <-- Design system tokens & shadcn/ui components
└── docs/product/              <-- UX flows, user stories, and acceptance criteria

[ChatGPT Red Team Authority]
└── docs/audits/ & Releases    <-- Independent evaluation, gate authorization & sign-off
```

### Integration Protocol
1. Agents work in dedicated, isolated local worktrees.
2. Parallel changes must not edit the same files.
3. Integration into `development` occurs sequentially with green CI verification after each commit.

---

## Section J: CI and Security Verification

All quality, linting, type-checking, and security gates were executed on `development`:

| Verification Gate | Command | Result | Evidence / Details |
|---|---|---|---|
| **Unit Test Suite** | `npx vitest run --exclude 'src/lib/supabase/__tests__/**'` | **PASS** | 27/27 test files passed; 324/324 tests passed (419 ms). |
| **Safety Hold Tests** | `npx vitest run src/lib/__tests__/safety.test.ts` | **PASS** | 20/20 safety assertions passed (holds fail-closed, no write paths). |
| **API Hold Tests** | `npx vitest run src/app/api/__tests__/safety-hold.test.ts` | **PASS** | 6/6 API write endpoints return HTTP 503 `CLINICAL_DATA_WRITES_SUSPENDED`. |
| **ESLint** | `npm run lint` | **PASS** | 0 errors, 3 warnings (esbuild build script). |
| **TypeScript** | `npx tsc --noEmit` | **PASS** | Clean compilation; 0 type errors. |
| **Next.js Production Build** | `npm run build` | **PASS** | 26/26 pages statically/dynamically generated. |
| **Cloudflare Static Build** | `node apps/web/build.mjs` | **PASS** | Bundled static assets to `apps/web/public/` cleanly in 5s. |
| **Redirect / HTTPS Evaluator** | `node scripts/devtools/cutover-redirects.test.mjs` | **PASS** | 25/25 synthetic redirect tests passed (pre-fetch domain check). |
| **Gitleaks Current Tree** | `bash scripts/devtools/gitleaks.sh current` | **PASS** | 0 live secrets in tracked repository tree. |

---

## Section K: WebR Feasibility Acceptance Criteria

Prepared the formal evaluation contract `docs/architecture/CP-WEBR-00-EXPERIMENTAL-CONTRACT.md`. The next technical research phase `CP-WEBR-00` will evaluate:
- Version pinning (`WebR v0.4.x`, `MatchIt v4.8.x`, `cobalt v5.0.x`).
- Cold-start latency target ($< 2.5$s desktop, $< 6.0$s laptop).
- Compressed payload size ceiling ($< 20$ MB total).
- Memory ceiling and heap stability on $N = 1,000$ to $N = 50,000$ rows.
- Browser security headers (COOP/COEP) on Cloudflare Static Assets.
- Absolute numerical concordance against Docker R 4.4.2 golden fixtures.

---

## Section L: Remaining Blockers

1. **Owner Cloudflare Dashboard Action (D1/D2 Records):** The owner must complete the dashboard deletion of the stale Vercel `@` A records and `www` CNAME record in Cloudflare DNS.
2. **Production Domain Cutover Hold:** The apex domain `clinicalpsm.com` remains pointed to the placeholder; cutover to Cloudflare Static Assets remains on hold pending Red Team sign-off.
3. **Statistical Parity Gate:** The TypeScript engine remains unvalidated until benchmarked or replaced by WebR in CP-WEBR-00.

---

## Section M: Proposed Red Team Verdict

**Proposed Verdict:** `PROCEED_WITH_CONDITIONS`

### Conditions:
1. `development` is established as the sole active development branch; no code is merged to `main` until cutover readiness.
2. Remote branch deletions must be executed only after ChatGPT Red Team explicitly authorizes the deletion list in Section F.
3. Phase `CP-WEBR-00` must proceed in an isolated experimental worktree before any changes are made to the production statistical pipeline.
