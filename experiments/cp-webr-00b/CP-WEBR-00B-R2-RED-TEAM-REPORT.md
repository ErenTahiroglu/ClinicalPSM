# CP-WEBR-00B R2 — Independent Red Team Remediation & Qualification Report

**Phase:** `CP-WEBR-00B R2`
**Repository:** `ErenTahiroglu/ClinicalPSM`
**Reference Branch:** `development`
**Baseline SHA:** `ccac139638ffecb121ea2eb18e4514930c92f664`
**Authority / Reviewer:** Independent Red Team (ChatGPT)
**Initial Verdict:** `EXPERIMENT_INSUFFICIENT — R2_REQUIRED`
**Remediation Status:** Complete

---

## 1. Executive Summary & Gate Verdicts

All 8 qualification categories have been remediated, executed, and independently verified on reproducible local harnesses and CI.

| Gate | Verdict | Evidence Summary |
| :--- | :---: | :--- |
| **`PACKAGE_EXECUTION`** | **`PASS`** | Official CRAN MatchIt 4.8.1 and cobalt 5.0.0 execute inside WebR 0.6.0 (R 4.6.0 Wasm). |
| **`NATIVE_R_PARITY`** | **`PASS`** | Strict symmetric comparator passes 25/25 semantic fixtures (100.0%) and 24/25 numeric fixtures (96.0%). `fix_16` complete separation (SE > 39,000, `matching.converged == TRUE`) is strictly classified as expected fail-closed (`REJECT_FOR_PUBLICATION`). 12/12 mutation falsification tests caught. |
| **`BROWSER_EXECUTION`** | **`PASS`** | Real browser qualification on Chromium (Brave 154) executing inside a Dedicated Web Worker (`worker.js`). Multi-tab concurrency (4 tabs) verified. Firefox, WebKit, Safari, and mobile recorded as `UNMEASURED`. |
| **`PERFORMANCE`** | **`PASS`** | Benchmarked across 3 repetitions on N=250 (65ms), N=1,000 (83ms), N=5,000 (191ms), N=10,000 (468ms). Real memory provenance established: R heap memory tracked via `sum(gc()[,2])` (32.8 MB to 38.5 MB). Internal Wasm linear memory explicitly declared `UNMEASURED`. |
| **`PRIVACY_NO_EGRESS`** | **`PASS`** | Browser-context-wide request interception. Verified patient-sentinel injection in place of `sub_0001` and received by R before matching. Negative controls A (page-level) and B (worker-level) intercepted before egress. Offline execution completed with zero internet. Persistent storage 100% clean; IndexedDB contains 0 clinical data / sentinels. |
| **`CLOUDFLARE_STATIC_FIT`** | **`PASS`** | 188 total deployable assets (limit 20,000). Total uncompressed size 69.08 MiB. Largest file `R.wasm` 17.23 MiB (limit 25 MiB). Asset limits verified; real Cloudflare deployment out-of-scope for experiment. |
| **`TOOLCHAIN_PROVENANCE`** | **`PASS`** | WebR 0.6.0 (R 4.6.0 Wasm emscripten 5.0.7). Clean-checkout setup script removes all machine-specific paths. NEWS.md upstream documentation discrepancy recorded. |
| **`LICENSING_INVENTORY`** | **`PASS`** | Full 21-package dependency SBOM locked with exact license classifications. |
| **`PRODUCTION_LICENSING_CLEARANCE`** | **`BLOCKED`** | Delivering GPL WebAssembly binaries constitutes distribution under GPL v2/v3. Combined-work status for companion frontend code requires formal legal review. |

**Final Experiment Verdict:** `EXPERIMENT_PASS_FOR_ARCHITECTURE_REVIEW`

---

## 2. P0: Clean-Checkout Reproducibility & Architecture

### 2.1 Resolution of Undefined `PORT` and Hardcoded Paths
- **Issue:** In `browser-harness/server.mjs`, `PORT` was referenced in `new URL(req.url, ...)` before declaration, and hardcoded absolute paths to `/Users/eren/.../scratch/...` were present in 5 files.
- **Remediation:**
  - `PORT` exported at module top-level with configurable fallback: `const PORT = parseInt(process.env.PORT || '8899', 10);`.
  - Created `harness/setup_experiment.mjs`: deterministically verifies or downloads WebR 0.6.0 and all 21 Wasm packages into `.cache/` and verifies their SHA-256 hashes against `dependency-lock.json`.
  - Dynamic path resolvers (`resolveWebrDist()`, `resolveWebrPath()`) replace all scratch paths across `server.mjs`, `audit_cloudflare_assets.mjs`, `run_benchmarks.mjs`, `run_privacy_audit.mjs`, and `run_webr.mjs`.
  - Configurable browser selection (`getBrowserExecutable()`) detects system Chromium, Chrome, Brave, Edge, or falls back to Playwright bundled browser without hardcoding machine-specific binaries.

### 2.2 Exact Local Reproduction Commands
```bash
# 1. Deterministic dependency and Wasm package verification
node experiments/cp-webr-00b/harness/setup_experiment.mjs

# 2. Strict comparator mutation falsification tests (12 mutations)
node experiments/cp-webr-00b/harness/test_comparator_mutations.mjs

# 3. Parity comparator evaluation on 25 reference fixtures
node experiments/cp-webr-00b/harness/compare_parity.mjs

# 4. Cloudflare Free tier asset limits audit
node experiments/cp-webr-00b/harness/audit_cloudflare_assets.mjs

# 5. Real browser qualification suite (Chromium Dedicated Worker + Egress Interception)
node experiments/cp-webr-00b/harness/run_browser_qualification.mjs

# 6. Artifact manifest hash integrity verification
node experiments/cp-webr-00b/harness/verify_manifest.mjs
```

---

## 3. P0: Dedicated Application Worker Qualification

### 3.1 Execution Context Isolation
The architecture strictly delineates execution tiers:
1. **Page Context (`Window` / `harness.js`):** Main thread UI and orchestration. Does not perform computation or hold propensity models.
2. **Dedicated Application Worker (`worker.js` / `DedicatedWorkerGlobalScope`):** Spawns via `new Worker('/worker.js', { type: 'module' })`. Owns the WebR instance, file uploads, MatchIt, and cobalt execution.
3. **WebR Internal Worker (`webr-worker.js`):** Managed internally by WebR for WebAssembly execution.

### 3.2 Worker Lifecycle Evidence
- Worker creation & WebR initialization completed in **2,489.1 ms** (`INIT_SUCCESS`, `execution_context: "DedicatedWorker"`).
- Package installation & library mount (`MatchIt`, `cobalt`, 19 dependencies) completed in **1,937.8 ms**.
- Pipeline execution confirmed in dedicated worker context without blocking the main event loop.

---

## 4. P0: Genuine No-Egress & Interception Audit

### 4.1 Browser-Context-Wide Request Interception
- Interception was implemented at the Playwright context level (`context.route('**/*', ...)`), capturing:
  - Page-originated requests
  - Dedicated-worker-originated requests
  - Internal WebR worker requests
  - URL, query string, HTTP method, headers, and POST body data.

### 4.2 Negative Controls A & B
- **Negative Control A (Page Context):** Attempted prohibited POST to `/api/intentional-prohibited-leak` containing `SENTINEL_PAGE_EGRESS_SECRET_KEY_987654321`. Context interception caught and aborted the request (`blockedbyclient`). Zero bytes transmitted to server.
- **Negative Control B (Dedicated Worker Context):** Attempted worker-originated prohibited POST containing `SENTINEL_WORKER_EGRESS_SECRET_KEY_123456789`. Context interception caught and aborted the request. Zero bytes transmitted to server.
- **CSP External Domain Test:** Attempted connection to `https://unauthorized-external-telemetry.example.com/` was immediately rejected by browser CSP (`connect-src 'self'`).

### 4.3 Offline Pipeline & Storage Persistence Audit
- Network was explicitly disabled at the browser context (`context.setOffline(true)`).
- Complete matching pipeline executed offline using synthetic dataset with patient sentinel `SENTINEL_PATIENT_MRN_8877665544`. Pipeline completed successfully in **99.3 ms**, producing 119 matched pairs.
- Audit of network logs confirmed **0 bytes** and **0 sentinels** leaked.
- Storage audit confirmed:
  - `localStorage`: 0 keys
  - `sessionStorage`: 0 keys
  - `caches`: 0 entries
  - `serviceWorker`: 0 registrations
  - `indexedDB`: Contains Emscripten virtual filesystem database (`emscripten_filesystem`). Deep inspection of object stores confirmed **0 patient sentinels** and **0 clinical records** persisted.

---

## 5. P0: Measurable Cancellation Latency & Demonstrated Recovery

Replaced instantaneous command measurements with observable long-running workloads and full recovery demonstrations:
- **Graceful Interruption:** Started active infinite R loop (`for (i in 1:1e8) { Sys.sleep(0.02) }`). Issued `webr.interrupt()`. Workload cessation observed and confirmed with subsequent computation (`40 + 2 = 42`). Cessation latency: **1.59 ms**.
- **Worker Termination Request:** Issued `worker.terminate()`. Termination request latency: **0.04 ms**.
- **Pending Request Rejection:** In-flight request rejection verified immediately upon worker termination.
- **New Worker Creation:** Spawned fresh Dedicated Application Worker (`worker.js`). Creation latency: **0.08 ms**.
- **Full WebR & Package Restoration:** Fresh worker initialized WebR runtime, mounted VFS, and loaded pinned packages (`MatchIt` 4.8.1, `cobalt` 5.0.0, 19 dependencies) in **2,225.88 ms**.
- **Subsequent Statistical Operation:** Executed fresh 1:1 nearest neighbor matching pipeline with MatchIt/cobalt on restored worker. Completed successfully in **91.25 ms**, producing 119 matched pairs.
- **WebAssembly Linear Memory Release Latency:** Recorded as **`UNMEASURED (Private to terminated worker process)`** as browser engine internal Wasm heap reclamation cannot be observed via user-space JavaScript APIs.

---

## 6. P1: Memory Measurement Provenance

- **Old Flaw:** Reported `wasm_mem_mb=0.00` due to inaccessible Web Worker memory.
- **Remediation & Provenance:**
  - Evaluated internal R heap memory via R runtime garbage collector: `sum(gc()[,2])`.
    - R Heap Initial: **32.80 MB**
    - R Heap at N=250: **35.20 MB**
    - R Heap at N=1,000: **35.40 MB**
    - R Heap at N=5,000: **36.80 MB**
    - R Heap at N=10,000: **38.40 MB**
  - Browser Window JS Heap: Measured via `window.performance.memory.usedJSHeapSize`: **1.54 MB to 2.73 MB**.
  - WebAssembly linear memory across worker boundary is explicitly recorded as `UNMEASURED (Private to WebR worker)` rather than a fabricated zero.

---

## 7. P1: Browser Support Matrix & Performance

- **Chromium (Brave 154 / Chrome for Testing):** Fully Qualified (`PASS`).
- **Firefox, WebKit, Safari:** Strictly reported as `UNMEASURED` due to lack of local browser binaries in runner cache. No cross-browser claims made without execution evidence.
- **Multi-Tab Isolation:** 4 concurrent browser tabs simultaneously ran independent Dedicated Workers and matching pipelines. All 4 produced identical, correct matched pairs (119 pairs) without interference.

---

## 8. P1: Content Security Policy & Self-Hosting

- CSP in `server.mjs` was hardened by completely removing `'unsafe-inline'`:
  `default-src 'self' 'wasm-unsafe-eval' blob: data:; script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval' blob:; worker-src 'self' blob:; style-src 'self'; connect-src 'self';`
- **Technical Cause for `'unsafe-eval'`:** Emscripten dynamic linking (`libRlapack.so`, `libRblas.so`) uses `Function()` to bind `ASM_CONSTS`. Without `'unsafe-eval'`, dynamic library loading fails.
- All 21 package archives and WebR runtime assets served 100% from same origin (`/webr/` and `/repo/`) with zero external internet dependencies.

---

## 9. P1: Scientific Parity & Failure Reconciliations

- **Total Fixtures:** 25
- **Semantic Parity:** 25/25 (100.0%)
- **Numeric Parity:** 24/25 (96.0%)
- **All Fixtures Pass Flag:** `false` (Strictly maintained; complete separation is fail-closed).
- **Classification Breakdown (Directly Recomputed from Result Objects):**
  - **Successful Pair Equivalence:** 20 fixtures (`fix_01`..`fix_15`, `fix_17`, `fix_18`, `fix_20`, `fix_21`, `fix_22`)
  - **Expected Reference Errors:** 3 fixtures (`fix_19` missing covariates, `fix_19b` missing treatment, `fix_23` no eligible match)
  - **Product Policy Rejects:** 1 fixture (`fix_24` duplicate IDs rejected by ClinicalPSM policy)
  - **Numerical Tolerance Failures / Unsafe Models:** 1 fixture (`fix_16` complete separation; parameters non-identifiable with SE > 39,000, `matching.converged == TRUE`, classified fail-closed as `REJECT_FOR_PUBLICATION`).

### 9.1 Complete Separation Analysis (`fix_16`)
- In `fix_16`, the treatment variable is completely separated by a covariate.
- Both native R and WebR report `matching.converged: true` because `glm()` iteration terminates when consecutive deviance changes drop below numerical tolerance ($\Delta \text{deviance} < 10^{-8}$).
- However, algorithmic convergence of `glm()` is **not** evidence of parameter identifiability: parameter estimates diverge toward $\pm\infty$ with astronomical standard errors ($SE > 39,000$), producing meaningless propensity score boundaries ($p \approx 0$ or $p \approx 1$).
- The `REJECT_FOR_PUBLICATION` classification is enforced via fixture metadata. The experiment does **not** implement a general-purpose automatic separation detector at runtime; developing or selecting a reliable separation diagnostic or Firth penalized regression fallback remains an explicit production architecture blocker.

---

## 10. Dedicated GitHub Actions Experiment CI

Created `.github/workflows/experiment-cp-webr-00b.yml`:
- Triggers on push / PR to `experiments/cp-webr-00b/**` and workflow.
- Executes:
  1. Clean-checkout setup & package hash verification (`setup_experiment.mjs`)
  2. Comparator mutation suite (`test_comparator_mutations.mjs`)
  3. Parity comparator (`compare_parity.mjs`)
  4. Cloudflare asset limits audit (`audit_cloudflare_assets.mjs`)
  5. Qualification server security headers & negative control endpoint test
  6. Artifact manifest integrity check (`verify_manifest.mjs`)
- Does not modify existing `security.yml` or `gates.yml`.

---

## 11. Deliverable Machine-Readable Artifacts

1. [CP-WEBR-00B-R2-RED-TEAM-REPORT.md](file:///Users/eren/Documents/GitHub/ClinicalPSM/experiments/cp-webr-00b/CP-WEBR-00B-R2-RED-TEAM-REPORT.md)
2. [CP-WEBR-00B-RESULT.md](file:///Users/eren/Documents/GitHub/ClinicalPSM/experiments/cp-webr-00b/CP-WEBR-00B-RESULT.md)
3. [CP-WEBR-00B-R2.1-EVIDENCE-CLOSURE.md](file:///Users/eren/Documents/GitHub/ClinicalPSM/experiments/cp-webr-00b/CP-WEBR-00B-R2.1-EVIDENCE-CLOSURE.md)
4. [parity-results.json](file:///Users/eren/Documents/GitHub/ClinicalPSM/experiments/cp-webr-00b/parity-results.json)
5. [comparator-mutation-results.json](file:///Users/eren/Documents/GitHub/ClinicalPSM/experiments/cp-webr-00b/comparator-mutation-results.json)
6. [browser-benchmarks.csv](file:///Users/eren/Documents/GitHub/ClinicalPSM/experiments/cp-webr-00b/browser-benchmarks.csv)
7. [browser-privacy-audit.json](file:///Users/eren/Documents/GitHub/ClinicalPSM/experiments/cp-webr-00b/browser-privacy-audit.json)
8. [browser-qualification-matrix.json](file:///Users/eren/Documents/GitHub/ClinicalPSM/experiments/cp-webr-00b/browser-qualification-matrix.json)
9. [cloudflare-asset-audit.json](file:///Users/eren/Documents/GitHub/ClinicalPSM/experiments/cp-webr-00b/cloudflare-asset-audit.json)
10. [artifact-manifest.json](file:///Users/eren/Documents/GitHub/ClinicalPSM/experiments/cp-webr-00b/artifact-manifest.json)
11. [.github/workflows/experiment-cp-webr-00b.yml](file:///Users/eren/Documents/GitHub/ClinicalPSM/.github/workflows/experiment-cp-webr-00b.yml)

---

## 12. Remaining Architecture Review Blockers & Non-Goals

Before moving from experimental qualification to production WebR engine implementation (`clinicalpsm/src/lib/psm/`), the following items must be resolved during architecture review:

1. **Dynamic Code Evaluation (`'unsafe-eval'`) Requirement:**
   - **Root Cause:** Emscripten's dynamic linking mechanism for R shared libraries (`libRlapack.so`, `libRblas.so`) uses JavaScript `Function()` constructor bindings for `ASM_CONSTS`.
   - **Security Consequence:** CSP cannot currently restrict `script-src` to `'self'` without `'unsafe-eval'`. While `'unsafe-inline'` was completely eliminated, production deployment should consider Web Worker isolation to confine `'unsafe-eval'` strictly to the Dedicated Worker scope (`worker-src`).

2. **Complete Separation Scientific Policy Gate (`fix_16`):**
   - **Contract Decision:** Logistic regression with complete separation yields non-identifiable estimates and astronomical standard errors ($SE > 39,000$) despite `glm()` reporting algorithmic convergence (`converged == TRUE`).
   - **Requirement:** The production application must retain fail-closed behavior (`REJECT_FOR_PUBLICATION` or Firth's penalized likelihood fallback), rather than presenting unstable propensity scores to clinical researchers. The experiment does not yet implement a general-purpose automatic separation detector.

3. **Gecko / WebKit Execution Evidence:**
   - **Scope:** Real browser qualification was established on Chromium (Brave / Chrome for Testing).
   - **Requirement:** Firefox, WebKit, and native Safari are recorded as `UNMEASURED`. Full cross-browser support must not be claimed until dedicated CI runners execute the automated qualification suite against those browser targets.

4. **GPL-2 / GPL-3 Licensing Architecture Clearance:**
   - **Status:** All 21 package licenses and transitive dependencies are inventoried in `licenses-and-sbom.md` (`LICENSING_INVENTORY = PASS`).
   - **Distribution & Combined Work Obligations:** Delivering pre-compiled WebAssembly archives (`R.wasm`, `MatchIt.tgz`, `cobalt.tgz`) to client browsers constitutes binary distribution under GNU GPL v2 and v3. Under the official GNU GPL FAQ (https://www.gnu.org/licenses/gpl-faq.en.html), this triggers obligations to provide Corresponding Source and copyright notices.
   - **Frontend IP Uncertainty:** Running WebR inside a Dedicated Web Worker or communicating over JSON messages does not automatically insulate proprietary frontend code from combined-work questions under copyright law. While commercial use is permitted under GPL, proprietary frontend compatibility requires formal legal clearance.
   - **Verdict:** `PRODUCTION_LICENSING_CLEARANCE = BLOCKED` until formal IP counsel review.

5. **Target Architecture Alignment:**
   - **Boundary Enforcement:** WebR remains strictly isolated in the experiment sandbox. The active production target architecture is Cloudflare Workers Static Assets (`apps/web`), not the retired Next.js App Router production runtime. Cloudflare Free tier asset limits are verified, while actual Cloudflare deployment remains out-of-scope for this qualification phase.

---

## 13. Deterministic Verification & Command Logs

### 13.1 Reproduction Execution Sequence
```bash
# Clean-checkout dependency setup & verification
node experiments/cp-webr-00b/harness/setup_experiment.mjs

# Falsification mutation testing (12/12 caught)
node experiments/cp-webr-00b/harness/test_comparator_mutations.mjs

# Parity comparator evaluation (25 fixtures)
node experiments/cp-webr-00b/harness/compare_parity.mjs

# Cloudflare Free static asset limits audit
node experiments/cp-webr-00b/harness/audit_cloudflare_assets.mjs

# Browser qualification (Chromium Dedicated Worker + No-Egress Interception)
node experiments/cp-webr-00b/harness/run_browser_qualification.mjs

# Manifest and fixture hash integrity verification
node experiments/cp-webr-00b/harness/verify_manifest.mjs
```

### 13.2 Artifact Integrity Check
All 85 tracked experiment files match their exact recorded SHA-256 digests in `artifact-manifest.json`.
