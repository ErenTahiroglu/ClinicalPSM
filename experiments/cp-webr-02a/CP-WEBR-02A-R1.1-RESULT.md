# CP-WEBR-02A R1.1 Experiment Result Report
## Focused Scientific Contract, Lifecycle and CI Gate Integrity Closure

### 1. Executive Summary & Verdict

- **Stage:** CP-WEBR-02A R1.1 — Focused Scientific Contract, Lifecycle and CI Gate Integrity Closure
- **Repository:** `ErenTahiroglu/ClinicalPSM`
- **Branch:** `development`
- **Baseline SHA:** `0b80d3fed39aaad25a3cedcefa81a8c724c7888d`
- **Evaluator:** Chromium Automated Test Harness & Node.js Test Harness
- **Independent Authority:** ChatGPT — Independent Scientific & Security Red Team
- **Overall Stage Verdict:** `ADAPTER_PASS_FOR_INTEGRATION_REVIEW`

All implementation-level defects identified in the R1 independent red team evaluation have been resolved. The WebR integration adapter demonstrates rigorous parameter propagation, truthful matching-distance provenance, fail-closed factor/missingness validation, full 25-fixture assertion parity with falsification mutation controls, cryptographic canonical result verification, deterministic worker lifecycle cancellation semantics, and dynamic CI gate derivation without hardcoded values.

All operations execute strictly within `experiments/cp-webr-02a/` using synthetic data. Active application code under `apps/web/` and production PSM code remain completely untouched.

---

### 2. Independent Governance Gates Status

| Gate | Status | Evidence & Rationale |
| :--- | :--- | :--- |
| **`STANDARDIZED_CALIPER_PROPAGATION`** | **PASS** | Canonical `stdCaliper` enforced across stack. Unknown options rejected (`UNKNOWN_OPTION_REJECTED`). MatchIt `sd(distance[!discarded])` scaling verified. Mutation 5 caught. |
| **`ACTUAL_MATCHING_DISTANCE_PROVENANCE`** | **PASS** | Distances derived from actual `m_out$distance`. Pair distances equal `\|dist[T] - dist[C]\|`. Discard sample accounting verified (`total == matched + unmatched + discarded`). |
| **`STRUCTURED_BINDING_AND_FACTOR_SEMANTICS`** | **PASS** | Preserved raw headers, NFC keys, collision rejection, mandatory explicit IDs, mandatory explicit covariate types, unlisted category rejection, blank level rejection. |
| **`MISSING_DATA_FAIL_CLOSED`** | **PASS** | Fail-closed missingness: missing treatment (`MISSING_TREATMENT`), missing continuous/categorical (`MISSING_COVARIATE`) fail closed immediately. |
| **`CANONICAL_OUTPUT_INTEGRITY`** | **PASS** | Runtime schema validation (`validateCanonicalResult()`), array invariants, non-self-referential SHA-256 hash contract, deep-freeze immutability. |
| **`PAIR_AND_CALIPER_SEMANTICS`** | **PASS** | Pair distances satisfy effective raw caliper bounds on matching scale across fixtures 07–12. |
| **`COBALT_BALANCE_PARITY`** | **PASS** | Raw and standardized balance diagnostics independently extracted and verified. Undefined statistics represented as `null`. |
| **`FULL_FIXTURE_QUALIFICATION`** | **PASS** | All 25 frozen fixtures executed and verified against falsifiable assertion matrix. All 7 mutation tests caught and failed. |
| **`EXACT_PAIR_AND_WEIGHT_PARITY`** | **PASS** | 100% exact matched pair identity and weight equality validated (`fix_01`: 119/119 pairs, 300/300 weights, max coef diff `0.0000e+0`). |
| **`WORKER_CSP_QUALIFICATION`** | **PASS** | Main page (no `unsafe-eval`) and worker Profile C.1 (strict, no `unsafe-eval`) fully qualified. |
| **`WORKER_LIFECYCLE_SUITE`** | **PASS** | All 6 lifecycle subgates verified: init, repeated runs, single-job concurrency, graceful interrupt, hard termination & recovery, pinned template digest. |
| **`TRUE_OFFLINE_EXECUTION`** | **PASS** | Pipeline executed strictly offline with `browserContext.setOffline(true)`. 0 network egress attempts. |
| **`STORAGE_PRIVACY_AUDIT`** | **PASS** | Checkpoints T1–T5 verified clean. Positive control passed (5/5 types detected and cleared). 5/5 fault-injection modes failed closed. |
| **`PRE_EGRESS_PREVENTION`** | **PASS** | Client-side pre-egress abortion verified. Server-side 403 verified. Mock sink falsification verified. |
| **`CI_EVIDENCE_PROVENANCE`** | **PASS** | Dynamically derived gates, non-self-referential CI evidence manifest, artifact digests verified. |
| **`NATIVE_R_INDEPENDENT_ORACLE`** | **BLOCKED** | Host native R 4.6.0 not provisioned on CI runner. Double-precision baseline originates from official WebR 0.6.0 / R 4.6.0. |
| **`AUTOMATED_SEPARATION_SAFETY`** | **BLOCKED** | Separation parameter instability trapped via conservative SE safeguard (`max_se > 1000`). Automated algorithmic separation detection remains blocked. |
| **`PRODUCTION_LICENSING_CLEARANCE`** | **BLOCKED** | MatchIt/cobalt (GPL-2/3) browser distribution requires formal legal licensing clearance. |
| **`BROWSER_PLATFORM_DIVERSITY`** | **UNMEASURED** | Qualified on Chromium. Firefox, WebKit, and mobile browsers unmeasured. |

---

### 3. Detailed Technical Verification Summary

#### 3.1 Adapter Unit Suite (`ADAPTER-UNIT-TESTS.json`)
- **Total Tests:** 37
- **Passed:** 37 (100%)
- **Failed:** 0
- **Coverage Highlights:**
  - Raw header preservation, NFC comparison keys, normalization collision rejection.
  - Repeated covariate rejection, treatment-as-covariate rejection.
  - Mandatory row IDs, missing/duplicate ID rejection.
  - Mandatory covariate types, unlisted category rejection, blank category rejection.
  - Canonical parameter `stdCaliper`, unknown option rejection.
  - Runtime schema validation, non-self-referential hash contract, tamper detection.
  - Worker lifecycle request ID tracking, explicit job states, cancellation classification.

#### 3.2 Scientific Parity Suite (`SCIENTIFIC-PARITY-RESULTS.json`)
- **Toolchain:** WebR 0.6.0, R 4.6.0, MatchIt 4.8.1, cobalt 5.0.0
- **Tolerance:** `eps <= 1e-4`
- **Total Fixtures Evaluated:** 25
- **Fixtures Passed:** 25 (100%)
- **Mutation Tests:** 7/7 caught and failed deterministically.
- **Fixture Highlights:**
  - `fix_01_well_conditioned`: Matched pairs 119/119, weights 300/300, max coef diff `0.0000e+0`. Status: `OUTPUT_READY`.
  - `fix_02` vs `fix_03`: Differential contrast verified between baseline `GroupA` and baseline `GroupB`.
  - `fix_07`–`fix_12`: Verified exact caliper bounds, discard accounting, and 1:2 ratio matching.
  - `fix_11_discard_both`: Discarded units properly subtracted from unmatched counts (`total == matched + unmatched + discarded`).
  - `fix_16_complete_separation`: Flagged by conservative safeguard (`max_se = 39815.88`), restricted.
  - `fix_18`–`fix_20`: Missing treatment, missing continuous, and unlisted categorical observations fail closed.

#### 3.3 Worker Lifecycle Suite (`WORKER-LIFECYCLE-AUDIT.json`)
- **Initialization:** Pinned template digest `7989403c...` verified.
- **Repeated Analyses:** Runs 1 and 2 completed sequentially with clean state reset.
- **Single-Job Concurrency:** Concurrent job attempt rejected with `CONCURRENCY_ERROR`; active job completed cleanly.
- **Graceful Interruption:** Worker acknowledges interrupt signal with matching `requestId`; settled as `GRACEFUL_INTERRUPT_CONFIRMED`.
- **Hard Termination & Recovery:** `worker.terminate()` cleanly aborts thread; re-spawned worker re-verifies template and executes analysis with exact parity.
- **Pinned Digest Tampering Control:** Tampered template rejected with `TEMPLATE_INTEGRITY_MISMATCH`.

#### 3.4 Browser Qualification Suite (`BROWSER-CI-QUALIFICATION-REPORT.json`)
- **Exit Code:** 0
- **Scientific Gates:** Dynamically derived from `SCIENTIFIC-PARITY-RESULTS.json` and `ADAPTER-UNIT-TESTS.json`. Zero hardcoded PASS values.
- **CI Falsification Controls:** Verified that tampering fixture results or timestamps forces CI to derive `FAIL`.
- **Worker CSP Qualification:** Profile C.1 strict Dedicated Worker qualified without `'unsafe-eval'`.
- **Storage Privacy Audit:** Checkpoints T1–T5 verified clean; positive control detected all 5 planted data types; 5/5 fault-injection modes failed closed.
- **Network Egress Audit:** Executed strictly offline (`setOffline(true)`); pre-egress abortion verified; mock sink leak detection verified.

---

### 4. Required Disclosures & Boundary Statements

1. **Single Scientific Engine:** Both Node qualification and Chromium worker execute the exact same versioned template `adapter/r_template.R` (`7989403c...`). Zero TypeScript statistical fallback exists.
2. **Canonical Contract:** Both Node and browser produce identical `CanonicalPsmResult` structures verified by `validateCanonicalResult()` and the non-self-referential hash contract.
3. **No Clinical Activation:** No clinical datasets were processed. Synthetic fixtures were used exclusively.
4. **Deferred Blockers:** Independent native host R oracle, automated separation safety, and production licensing clearance remain explicitly `BLOCKED`.
