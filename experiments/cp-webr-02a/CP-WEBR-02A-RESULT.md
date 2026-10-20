# CP-WEBR-02A Experiment Result Report

## 1. Executive Summary & Verdict

- **Stage:** CP-WEBR-02A — Synthetic-Only Integration Adapter, Native Oracle Boundary & Production Entry Review
- **Repository:** `ErenTahiroglu/ClinicalPSM`
- **Branch:** `development`
- **Baseline SHA:** `2e5dfcff8f03d0e3ce3d212f731bcd6082061a7d`
- **Evaluator:** Chromium Automated Test Harness & Node.js Test Harness
- **Independent Authority:** ChatGPT — Independent Scientific & Security Red Team
- **Overall Stage Verdict:** `ADAPTER_PASS_FOR_INTEGRATION_REVIEW`

The synthetic-only WebR statistical integration adapter for ClinicalPSM has been designed, implemented, and fully qualified against official MatchIt 4.8.1 and cobalt 5.0.0 on WebR 0.6.0 (R 4.6.0). All operations execute locally in the browser with strictly synthetic data. Zero modifications were made to the active web runtime or production PSM code.

---

## 2. Independent Governance Gates Status

| Gate | Status | Evidence & Rationale |
| :--- | :--- | :--- |
| `FULL_PRECISION_NATIVE_R_ORACLE` | **BLOCKED** | Host native R 4.6.0 is not provisioned on current runner. Double-precision oracle was generated on official WebR/R 4.6.0 runtime and is preserved without misrepresenting it as native host R. |
| `PRODUCTION_LICENSING_CLEARANCE` | **BLOCKED** | MatchIt and cobalt are licensed under GPL-2 / GPL-3. Client-side bundling requires formal open-source licensing review prior to production commercial release. |
| `AUTOMATED_SEPARATION_SAFETY` | **BLOCKED** | Algorithmic convergence (`glm$converged == TRUE`) is decoupled from parameter instability (e.g. `SE > 39,000` in complete separation). Publication is blocked via `OUTPUT_GENERATION_RESTRICTED`. No general separation detector exists. |
| `EXACT_PAIR_AND_WEIGHT_PARITY` | **PASS** | 100% exact parity achieved on preserved fixtures (`fix_01`: 119/119 pairs, 300/300 weights, coefficient diff = 0.0000e+0 within `eps <= 1e-4`). |
| `WORKER_CSP_QUALIFICATION` | **PASS** | Worker CSP A/B matrix evaluated. Dedicated Worker and WebR internal worker qualified under strict and permissive policies. |
| `WORKER_LIFECYCLE_SUITE` | **PASS** | Dedicated Worker lifecycle verified: initialization, repeated analyses, concurrency, interruption, hard termination, and recovery. |
| `TRUE_OFFLINE_EXECUTION` | **PASS** | Full statistical pipeline executed strictly offline via `browserContext.setOffline(true)` with 0 network egress attempts. |
| `STORAGE_PRIVACY_AUDIT` | **PASS** | Checkpoints T1–T5 verified clean. Scanner positive control passed (5/5 data types). 5/5 fault-injection modes failed closed. |
| `CI_EVIDENCE_PROVENANCE` | **PASS** | Non-self-referential cryptographic evidence manifests generated. |

---

## 3. Detailed Technical Verification

### 3.1 Adapter Unit Suite (`test_adapter_unit.mjs`)
- **Total Tests:** 27
- **Passed:** 27 (100%)
- **Failed:** 0
- **Report:** `ADAPTER-UNIT-TESTS.json`
- **Key Validations:**
  - `SymbolMapper`: Monotonic aliases (`trt_00`, `cov_00`), Unicode NFC normalization, max 256 code point enforcement, control character rejection, bijective reversibility.
  - `CanonicalSerializer`: Defensive cloning (`structuredClone`), lexicographical key sorting, non-finite numeric conversion (`NaN`/`Infinity` -> `null`), SHA-256 payload envelope verification.
  - `WorkerManager`: 8-state machine transition enforcement (`NOT_LOADED` -> `INITIALIZING` -> `READY` -> `RUNNING` -> `COMPLETED`), single-job concurrency locking, rejection of overlapping jobs.

### 3.2 Scientific Parity Suite (`test_scientific_parity.mjs`)
- **Toolchain:** WebR 0.6.0, R 4.6.0, MatchIt 4.8.1, cobalt 5.0.0
- **Tolerance:** Frozen `eps <= 1e-4`
- **Report:** `SCIENTIFIC-PARITY-RESULTS.json`
- **Results:**
  - `fix_01_well_conditioned`: Matched pairs 119/119 (0 mismatches). Weights 300/300 (0 mismatches). Max coefficient difference: `0.0000e+0`. Publication status: `OUTPUT_READY`.
  - `fix_16_complete_separation`: `glm_converged: true`, max coefficient SE: `39,815.88`. Publication verdict: `OUTPUT_GENERATION_RESTRICTED`. Output generation disallowed (`false`).
  - `fix_17_rank_deficient`: Collinear term `x2` detected and aliased (`aliased: true`). Publication verdict: `OUTPUT_GENERATION_RESTRICTED`.
  - `fix_06_no_caliper_nearest`: Unconstrained matching formed 119 pairs. Verdict: `OUTPUT_READY`.
  - `fix_13_more_treated_than_control`: Correctly bounded by control pool size (75 pairs formed, 75 treated units unmatched).

### 3.3 Worker CSP Qualification Matrix (`CSP-AB-QUALIFICATION.json`)
- **Profile B (Strict Page):** Evaluated without `'unsafe-eval'`. Page prohibited `eval()` calls blocked with CSP `EvalError` and `securitypolicyviolation` event.
- **Profile C.1 (Strict Worker):**
  - CSP: `default-src 'none'; script-src 'self' 'wasm-unsafe-eval' blob:; connect-src 'self' blob:; worker-src 'self' blob:;`
  - Arbitrary `eval()` blocked.
  - WebR initialization and MatchIt/cobalt package loading verified.
  - Synthetic matching pipeline executed successfully.
- **Profile C.2 (Permissive Worker):**
  - CSP includes `'unsafe-eval'`. Arbitrary eval permitted.
  - Matching pipeline executed successfully.
- **Recommendation:** Preserve strict CSP for the main page (`no unsafe-eval`). The Dedicated Worker may operate under the qualified CSP profile.

### 3.4 Dedicated Worker Lifecycle Suite (`WORKER-LIFECYCLE-AUDIT.json`)
- **Initialization:** Completed in ~1,993 ms.
- **Repeated Analyses:** Runs 1 and 2 completed sequentially with full state reset.
- **Single-Job Concurrency:** Overlapping job dispatch handled sequentially; worker state machine strictly guards execution promise.
- **Graceful Interruption:** Worker responds to `INTERRUPT` signal via `webR.interrupt()`.
- **Hard Termination & Recovery:** `worker.terminate()` cleanly aborts execution thread within ~0.2 ms; subsequent worker instantiation initializes and completes analysis normally.

### 3.5 Storage Privacy & Fail-Closed Audit (`STORAGE-PRIVACY-AUDIT.json`)
- **Positive Control Falsification Probe:** Planted 5 distinct data types (key, string, nested object, typed array, blob) in temporary database; scanner detected all 5 types (`5/5`), and certified complete cleanup (`0` residue remaining).
- **Fault-Injection Suite:** Evaluated 5 failure modes (`FAULT_OPEN_FAILURE`, `FAULT_TX_FAILURE`, `FAULT_CURSOR_FAILURE`, `FAULT_INACCESSIBLE_STORE`, `FAULT_DECODER_FAILURE`). All 5 modes failed closed (`INSPECTION_ERROR` / `INACCESSIBLE`) with recorded errors.
- **Checkpoints T1–T5:**
  - T1 (Post-pipeline): 0 residue detected. Status: `INSPECTED_EMPTY` / `INSPECTED_NO_SENTINEL`.
  - T2 (Post-termination): 0 residue detected.
  - T3 (Post-respawn): 0 residue detected.
  - T4 (Post-second-run): 0 residue detected.
  - T5 (Final clean): 0 residue detected.

### 3.6 Tripartite Network Egress Verification
- **Nominal Offline Run:** Browser context placed in `setOffline(true)`. MatchIt + cobalt pipeline ran with 0 attempted network requests.
- **Pre-Egress Prevention:** Client attempts to access unauthorized endpoints were aborted prior to transmission (`aborted_pre_egress: true`). Server received 0 hits.
- **Server-Side Rejection:** Unauthorized attempts deliberately allowed to reach the server received HTTP `403 Forbidden`.
- **External Telemetry CSP Block:** Out-of-scope external network requests blocked by browser CSP.
- **Mock Sink Falsification:** Deliberate test payload was captured by the local mock sink, demonstrating leak detection sensitivity.

---

## 4. Required Disclosures & Boundary Statements

### 4.1 Verified Execution Facts
1. The structured TypeScript adapter (`WebRStatisticalAdapter`) executes official MatchIt 4.8.1 and cobalt 5.0.0 inside a browser-local WebR 0.6.0 instance without modifying any production application code.
2. Scientific calculations (propensity scores, matched pairs, weights, subclasses, GLM coefficients, balance metrics) derive 100% from authoritative R packages.
3. Parameter binding uses isolated child `REnvironment` objects, typed R vectors, and static templates; no user values are interpolated into R code.
4. Numerical parity against the preserved full-precision oracle is exact (`0` mismatches, max coefficient diff `0.0000e+0`).

### 4.2 Inferred Architectural Behavior
1. Dedicated Worker execution completely isolates statistical computation from the main UI thread, preventing DOM blocking during GLM fitting or matching.
2. The 8-state worker lifecycle machine provides deterministic recovery from timeouts or unhandled exceptions via hard termination.

### 4.3 Unsupported Platforms (Unmeasured)
- **Firefox:** UNMEASURED (not installed on qualification runner).
- **WebKit / Safari Desktop:** UNMEASURED.
- **Mobile Safari / Mobile Chrome:** UNMEASURED.
- **Browsers lacking `crossOriginIsolated` / `SharedArrayBuffer`:** UNMEASURED.

### 4.4 Unresolved Native R Equivalence
- The reference oracle was generated using official MatchIt 4.8.1 and cobalt 5.0.0 on WebR 0.6.0 (R 4.6.0). Cross-platform equivalence against an independent host native R installation remains `BLOCKED` until host R 4.6.0 is provisioned.

### 4.5 Unresolved Separation Safety
- The adapter identifies extreme coefficient standard errors (`SE > 1,000`) and restricts publication (`OUTPUT_GENERATION_RESTRICTED`). However, algorithmic convergence (`glm$converged == true`) does not guarantee mathematical model validity. Automated separation safety remains `BLOCKED`.

### 4.6 Production Licensing Clearance
- MatchIt and cobalt are licensed under GPL-2 and GPL-3. Client-side browser distribution requires legal clearance before public or commercial deployment. Status: `BLOCKED`.

---

## 5. Artifact Manifest

| Artifact File | Description | SHA-256 |
| :--- | :--- | :--- |
| `experiments/cp-webr-02a/ADAPTER-UNIT-TESTS.json` | 27/27 unit test evidence | Recorded in CI Manifest |
| `experiments/cp-webr-02a/SCIENTIFIC-PARITY-RESULTS.json` | Full-precision parity report | Recorded in CI Manifest |
| `experiments/cp-webr-02a/CSP-AB-QUALIFICATION.json` | Worker CSP A/B matrix report | Recorded in CI Manifest |
| `experiments/cp-webr-02a/WORKER-LIFECYCLE-AUDIT.json` | Dedicated worker lifecycle report | Recorded in CI Manifest |
| `experiments/cp-webr-02a/STORAGE-PRIVACY-AUDIT.json` | Deep storage & fail-closed report | Recorded in CI Manifest |
| `experiments/cp-webr-02a/BROWSER-CI-QUALIFICATION-REPORT.json` | Overall browser qualification report | Recorded in CI Manifest |
| `experiments/cp-webr-02a/CI-EVIDENCE-MANIFEST.json` | Cryptographic evidence manifest | Recorded in CI Manifest |

---

## 6. Phase Gate Verdict

**Overall Verdict:** `ADAPTER_PASS_FOR_INTEGRATION_REVIEW`

This verdict certifies that the WebR adapter engineering stage is complete, verified, and ready for integration review. It does NOT authorize clinical uploads, production deployment, or automatic integration into `apps/web`.

**STOP: Awaiting independent ChatGPT Red Team review. Do not proceed to CP-WEBR-02B automatically.**
