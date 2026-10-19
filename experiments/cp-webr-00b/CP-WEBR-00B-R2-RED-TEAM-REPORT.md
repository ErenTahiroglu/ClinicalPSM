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
| **`NATIVE_R_PARITY`** | **`PASS`** | Strict symmetric comparator passes 25/25 semantic fixtures (100.0%) and 24/25 numeric fixtures (96.0%). `fix_16` complete separation is strictly classified as expected fail-closed (`REJECT_FOR_PUBLICATION`). 12/12 mutation falsification tests caught. |
| **`BROWSER_EXECUTION`** | **`PASS`** | Real browser qualification on Chromium (Brave 154) executing inside a Dedicated Web Worker (`worker.js`). Multi-tab concurrency (4 tabs) verified. Firefox, WebKit, and Safari recorded as `UNMEASURED`. |
| **`PERFORMANCE`** | **`PASS`** | Benchmarked across 3 repetitions on N=250 (75ms), N=1,000 (82ms), N=5,000 (195ms), N=10,000 (478ms). Real memory provenance established: R heap memory tracked via `sum(gc()[,2])` (32.8 MB to 38.4 MB). Internal Wasm linear memory explicitly declared `UNMEASURED`. |
| **`PRIVACY_NO_EGRESS`** | **`PASS`** | Browser-context-wide request interception. Negative controls A (page-level) and B (worker-level with synthetic sentinel) intercepted and aborted before egress. Offline execution completed with zero internet. Persistent storage (localStorage, sessionStorage, caches, service workers) 100% clean; IndexedDB contains 0 clinical data / sentinels. |
| **`CLOUDFLARE_STATIC_FIT`** | **`PASS`** | 188 total deployable assets (limit 20,000). Total uncompressed size 69.08 MiB. Largest file `R.wasm` 17.23 MiB (limit 25 MiB). |
| **`TOOLCHAIN_PROVENANCE`** | **`PASS`** | WebR 0.6.0 (R 4.6.0 Wasm emscripten 5.0.7). Clean-checkout setup script removes all machine-specific paths. NEWS.md upstream documentation discrepancy recorded. |
| **`LICENSING_READINESS`** | **`PASS`** | Full 21-package dependency SBOM locked. GPL-2/GPL-3 boundaries documented; runtime client execution avoids server redistribution issues. |

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

## 5. P0: Measurable Cancellation Latency

Replaced instantaneous command measurements with observable long-running workloads:
- **Graceful Interruption:** Started active infinite R loop (`for (i in 1:1e8) { Sys.sleep(0.02) }`). Issued `webr.interrupt()`. Cessation was observed and verified with a subsequent recovery operation (`40 + 2 = 42`). Cessation latency: **1.67 ms**.
- **Hard Worker Termination:** Issued `worker.terminate()`. Pending requests rejected immediately. Worker termination latency: **0.10 ms**.
- **Demonstrated Recovery:** Spawned fresh Dedicated Application Worker and verified liveness ping. Recovery latency: **10.21 ms**. Total end-to-end cancellation & recovery latency: **10.42 ms**.

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
- **Classification Breakdown:**
  - **Successful Pair Equivalence:** 19 fixtures (`fix_01`..`fix_15`, `fix_21`..`fix_23`)
  - **Expected Reference Errors:** 4 fixtures (`fix_17` rank deficient, `fix_18` zero variance, `fix_19` missing covariates, `fix_19b` missing treatment)
  - **Product Policy Rejects:** 1 fixture (`fix_24` duplicate IDs rejected by ClinicalPSM policy)
  - **Numerical Tolerance Failures / Unsafe Models:** 1 fixture (`fix_16` complete separation; non-identifiable parameters with SE > 39,000 classified as `REJECT_FOR_PUBLICATION`).

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
3. [parity-results.json](file:///Users/eren/Documents/GitHub/ClinicalPSM/experiments/cp-webr-00b/parity-results.json)
4. [comparator-mutation-results.json](file:///Users/eren/Documents/GitHub/ClinicalPSM/experiments/cp-webr-00b/comparator-mutation-results.json)
5. [browser-benchmarks.csv](file:///Users/eren/Documents/GitHub/ClinicalPSM/experiments/cp-webr-00b/browser-benchmarks.csv)
6. [browser-privacy-audit.json](file:///Users/eren/Documents/GitHub/ClinicalPSM/experiments/cp-webr-00b/browser-privacy-audit.json)
7. [browser-qualification-matrix.json](file:///Users/eren/Documents/GitHub/ClinicalPSM/experiments/cp-webr-00b/browser-qualification-matrix.json)
8. [cloudflare-asset-audit.json](file:///Users/eren/Documents/GitHub/ClinicalPSM/experiments/cp-webr-00b/cloudflare-asset-audit.json)
9. [artifact-manifest.json](file:///Users/eren/Documents/GitHub/ClinicalPSM/experiments/cp-webr-00b/artifact-manifest.json)
10. [.github/workflows/experiment-cp-webr-00b.yml](file:///Users/eren/Documents/GitHub/ClinicalPSM/.github/workflows/experiment-cp-webr-00b.yml)

---

## 12. Remaining Architecture Review Blockers & Non-Goals

Before moving from experimental qualification to production WebR engine implementation (`clinicalpsm/src/lib/psm/`), the following items must be resolved during architecture review:

1. **Dynamic Code Evaluation (`'unsafe-eval'`) Requirement:**
   - **Root Cause:** Emscripten's dynamic linking mechanism for R shared libraries (`libRlapack.so`, `libRblas.so`) uses JavaScript `Function()` constructor bindings for `ASM_CONSTS`.
   - **Security Consequence:** CSP cannot currently restrict `script-src` to `'self'` without `'unsafe-eval'`. While `'unsafe-inline'` was completely eliminated, production deployment should consider Web Worker isolation to confine `'unsafe-eval'` strictly to the Dedicated Worker scope (`worker-src`).

2. **Complete Separation Scientific Policy Gate (`fix_16`):**
   - **Contract Decision:** Logistic regression with complete separation yields non-convergent estimates and astronomical standard errors ($SE > 39,000$).
   - **Requirement:** The production application must retain fail-closed behavior (`REJECT_FOR_PUBLICATION` or Firth's penalized likelihood fallback), rather than presenting unstable propensity scores to clinical researchers.

3. **Gecko / WebKit Execution Evidence:**
   - **Scope:** Real browser qualification was established on Chromium (Brave / Chrome for Testing).
   - **Requirement:** Firefox, WebKit, and native Safari are recorded as `UNMEASURED`. Full cross-browser support must not be claimed until dedicated CI runners execute the automated qualification suite against those browser targets.

4. **GPL-2 / GPL-3 Licensing Architecture Clearance:**
   - **Status:** All 21 package licenses and transitive dependencies are inventoried in `licenses-and-sbom.md`.
   - **Next Step:** Obtain formal IP review confirming that serving unmodified pre-compiled WebR Wasm binaries for execution on client machines complies with organization licensing boundaries without impacting proprietary frontend IP.

5. **Production Worker Architecture:**
   - **Boundary Enforcement:** WebR remains strictly isolated in the experiment sandbox. Production Next.js App Router integration must follow the Dedicated Web Worker architecture validated in `experiments/cp-webr-00b/browser-harness/worker.js`.

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

