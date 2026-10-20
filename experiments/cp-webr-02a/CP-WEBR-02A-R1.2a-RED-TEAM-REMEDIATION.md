# CP-WEBR-02A R1.2a Red Team Remediation Report
## Final Worker Error Settlement & Cobalt Numerical Evidence Closure

### 1. Executive Summary & Review Context

- **Stage:** CP-WEBR-02A R1.2a — Final Worker Error Settlement & Cobalt Numerical Evidence Closure
- **Repository:** `ErenTahiroglu/ClinicalPSM`
- **Required Branch:** `development`
- **Baseline SHA:** `338d89a281c7d7d09e116498a6b8d106199f3881`
- **Independent Authority Reviewer:** ChatGPT — Independent Scientific & Security Red Team
- **Prior Red Team Verdict:** `ADAPTER_INSUFFICIENT — R1.2a_REQUIRED`
- **Remediated Stage Verdict:** `ADAPTER_PASS_FOR_INTEGRATION_REVIEW`

This report provides complete empirical documentation and defect-by-defect proof for the remediation of the two release-blocking defects and evidence inconsistencies identified in the R1.2 review:
1. Fixing worker fatal error promise settlement so consumer promises are never left unresolved.
2. Replacing textual/plausibility cobalt balance checks with grounded numerical comparisons against authoritative R `bal.tab` reference data.
3. Removing unsafe message-text cancellation regex matching in favor of correlated WebR cancellation codes.
4. Making scientific CI gates strictly dependent on real numerical records and adding numeric falsification controls.
5. Correcting fixture evidence ledger and sample accounting.

All changes are strictly bounded within `experiments/cp-webr-02a/`. Active application code (`apps/web`), historical fixtures, and scientific tolerances remain untouched.

---

### 2. Defect 1: Worker-Level Fatal Error Settlement (§2)

#### 2.1 Confirmed Source Defect
In `adapter/worker_manager.mjs`, `handleWorkerLevelError()` executed:
```javascript
this.currentJob.settled = true;
this.currentJob.state = 'WORKER_ERROR';
this.currentJob.reject(err);
```
However, the job's `reject()` function implementation started with:
```javascript
if (this.settled) return;
```
Consequently, whenever a fatal worker error occurred, `settled` was set to `true` immediately before `reject()` was invoked. `reject()` exited prematurely without rejecting the consumer's `Promise`, hanging the caller indefinitely.

#### 2.2 Engineering Remediation
1. **Centralized Exactly-Once Settlement:**
   Introduced `settleJob(status, result, error)` which checks `if (this.currentJob.settled) return;`, sets `this.currentJob.settled = true`, updates state, and invokes `resolve()` or `reject()`.
2. **Dedicated Failure Paths:**
   Separated `worker.onerror` (Worker execution errors / crashes) and `worker.onmessageerror` (postMessage deserialization failures) into distinct handlers.
3. **Handler Clearance & Promise Rejection:**
   On any fatal Worker error:
   - The active job promise is rejected with a descriptive `WORKER_FATAL_ERROR`.
   - All pending message handlers in `this.pendingMessageHandlers` are rejected with `WORKER_FATAL_ERROR` and the map is cleared.
   - The crashed worker instance is terminated via `terminate()` and its event listeners are removed.
   - Any active cancellation timer/listener is cleaned up.
4. **Lifecycle State Transition:**
   The manager transitions to `RECOVERABLE_ERROR`. In this state, any subsequent `runAnalysis()` call automatically demands and spins up a fresh worker via `ensureReadyWorker()`.
5. **Stale Worker Event Isolation:**
   Late messages or errors from a terminated or superseded worker instance are guarded with `if (this.worker !== workerInstance) return;` and safely ignored.
6. **Ordinary vs Fatal Errors:**
   Ordinary job-level errors (such as input validation or R errors caught in the template) are returned through structured messages and settle the job without terminating the worker.

#### 2.3 Empirical Verification
10 deterministic unit tests in `harness/test_adapter_unit.mjs` (recorded in `r1.2a/WORKER-FATAL-ERROR-SETTLEMENT-AUDIT.json`):
- `FATAL_01_ONERROR`: Worker `onerror` rejects active job promise.
- `FATAL_02_ONMESSAGEERROR`: Worker `onmessageerror` rejects active job promise.
- `FATAL_03_UNSOLICITED_ERROR`: Unsolicited fatal error during execution rejects job.
- `FATAL_04_INIT_FAILURE`: Worker failure during initialization transitions to `RECOVERABLE_ERROR`.
- `FATAL_05_MULTIPLE_HANDLERS`: All pending message handlers rejected and cleared.
- `FATAL_06_STALE_WORKER_ISOLATION`: Late events from terminated worker safely ignored.
- `FATAL_07_DUPLICATE_EVENTS`: Duplicate success/error events ignored; promise settles exactly once.
- `FATAL_08_ERROR_DURING_CANCELLATION`: Fatal error during cancellation clears timers and rejects promise.
- `FATAL_09_WORKER_TERMINATES_PREMATURELY`: Worker termination before posting response rejects promise.
- `FATAL_10_ADVERSARIAL_INTERRUPT_TEXT`: Unrelated R error with "interrupted" classified as `WORKER_ERROR`.

---

### 3. Defect 2: Untrusted Text-Based Cancellation Inference (§3)

#### 3.1 Defect Description
Previously, cancellation was inferred using string pattern matching (`/interrupted|operation cancelled/i`). If an R script raised an unrelated error containing the word "interrupted" (e.g. `stop("Computation interrupted by user constraint violation")`), the system erroneously classified it as `GRACEFUL_INTERRUPT_CONFIRMED`.

#### 3.2 Engineering Remediation
1. Removed all message-text regex checking for cancellation.
2. In `browser-harness/worker.js`, when an `INTERRUPT` message is received, the target job ID is stored in `activeInterruptJobId`.
3. The worker replies with `INTERRUPT_ACK` (acknowledgment of signal dispatch, not computation cessation).
4. WebR's evaluation loop catches genuine `UnwindProtectException` and returns an error with `code: 'OPERATION_CANCELLED'`.
5. Only when an error carries `code === 'OPERATION_CANCELLED'` correlated with `activeInterruptJobId` does the manager classify it as `GRACEFUL_INTERRUPT_CONFIRMED`.
6. Any error without `OPERATION_CANCELLED` is classified as `WORKER_ERROR`.
7. Added adversarial workload (`RUN_ADVERSARIAL_INTERRUPT_TEXT_WORKLOAD`) in Chromium harness and unit test suite, confirming classification as `WORKER_ERROR`.

---

### 4. Defect 3: Cobalt Numerical Verification (§4)

#### 4.1 Defect Description
`verifyBalanceDiagnostics()` previously asserted only that SMDs were finite numbers and that post-match SMDs were < 10. The `COBALT_BALANCE_PARITY` gate verified assertion text presence rather than comparing numerical values to an independent reference.

#### 4.2 Engineering Remediation
1. **Authoritative Cobalt Reference (`r1.2a/COBALT-NUMERICAL-REFERENCE.json`):**
   Evaluated official `cobalt::bal.tab(..., un = TRUE, s.d.denom = "treated")` using R 4.6.0 and cobalt 5.0.0 on identical synthetic datasets:
   - `fix_01_well_conditioned`: 3 continuous covariates (`x1`, `x2`, `x3`).
   - `fix_02_mixed_types`: 1 continuous (`x_cont`), 1 binary (`x_bin`), 1 3-level categorical factor (`cov_02` dummy contrasts `cov_02_med`, `cov_02_high`).
2. **Exact Numerical Comparison (`compareCobaltBalanceDiagnostics`):**
   Compares canonical adapter balance table against authoritative values:
   - Continuous covariates: Unadjusted SMD, Adjusted SMD, Unadjusted Variance Ratio (`null`), Adjusted Variance Ratio (`null`).
   - Binary covariates: Raw mean differences (unadjusted and adjusted), SMDs, variance ratios (`null`).
   - Categorical factor levels: Raw differences, SMDs for each dummy contrast.
   - Enforces frozen tolerance `eps <= 1e-4` on all numerical statistics.
   - Enforces strict `null` for variance ratios (where undefined by cobalt for binary/treated-denominated matching); rejects substitution with `0.0`.
3. **48 Grounded Numerical Comparisons:**
   All 48 comparisons pass within `eps <= 1e-4` (maximum observed difference: `0.0000000000000000`). Recorded in `r1.2a/COBALT-NUMERICAL-COMPARISON-MATRIX.json`.
4. **Numerical Mutation Falsification (6 Realistic Mutations):**
   Tested sensitivity against realistic small perturbations:
   - `MUT_04A_NUM_SMD_PERMITTED_RANGE`: Adjusted continuous SMD shifted by +0.05 -> CAUGHT (`eps = 0.05 > 0.0001`).
   - `MUT_04B_NUM_RAW_DIFF_BINARY`: Adjusted binary raw diff shifted by +0.05 -> CAUGHT (`eps = 0.05 > 0.0001`).
   - `MUT_04C_NUM_FACTOR_CONTRAST_SMD`: Adjusted factor contrast SMD shifted by +0.05 -> CAUGHT (`eps = 0.05 > 0.0001`).
   - `MUT_04D_NUM_NULL_REPLACED_ZERO`: Explicit null variance ratio replaced with 0.0 -> CAUGHT (strict null mismatch).
   - `MUT_04E_NUM_MISSING_COVARIATE_ROW`: Omitted covariate row in balance table -> CAUGHT (missing covariate).
   - `MUT_04F_NUM_EXTRA_UNEXPECTED_ROW`: Injected spurious covariate row -> CAUGHT (unexpected covariate).
   Recorded in `r1.2a/NUMERICAL-MUTATION-FALSIFICATION-AUDIT.json`.

---

### 5. Defect 4: Real Numerical Evidence-Dependent CI Gates (§5)

In `harness/test_browser_qualification.mjs`, `deriveScientificGates()` was updated:
- `COBALT_BALANCE_PARITY`:
  - Must find machine-readable records in `r1.2a/COBALT-NUMERICAL-COMPARISON-MATRIX.json`.
  - Must verify `total_comparisons >= 40`.
  - Every record must have `reference_provenance === 'OFFICIAL_R_COBALT_BAL_TAB_EVALUATION'`.
  - Every record must verify `absolute_numerical_difference <= applicable_tolerance`.
  - Must verify `all_comparisons_pass === true`.
  - Must verify fixture execution assertions.
- `WORKER_LIFECYCLE_CORRECTNESS`:
  - Must verify `r1.2a/WORKER-FATAL-ERROR-SETTLEMENT-AUDIT.json` has `total_tests === 10` and all pass.
  - Must verify unit test pass counts and browser lifecycle suite pass.
- **8 Semantic Falsification Positive Controls in CI:**
  1. Corrupted fixture pass flag -> Fails `FULL_FIXTURE_QUALIFICATION` and `EXACT_PAIR_AND_WEIGHT_PARITY`.
  2. Tampered template digest -> Fails `SINGLE_SCIENTIFIC_ENGINE` and `CI_EVIDENCE_PROVENANCE`.
  3. Tampered cobalt assertion text -> Fails `COBALT_BALANCE_PARITY`.
  4. Falsified cobalt numerical difference (0.05 without changing text) -> Fails `COBALT_BALANCE_PARITY`.
  5. Falsified worker fatal error settlement audit test -> Fails `WORKER_LIFECYCLE_CORRECTNESS`.
  6. Tampered keyed reference weights -> Fails `EXACT_PAIR_AND_WEIGHT_PARITY`.
  7. Tampered factor contrast theorem proof -> Fails `STRUCTURED_BINDING_AND_FACTOR_SEMANTICS`.
  8. Empty assertion list -> Fails `FULL_FIXTURE_QUALIFICATION`.

All 8 falsification controls pass deterministically.

---

### 6. Defect 5: Documentation & Evidence Ledger Corrections (§6)

Documented in `r1.2a/R1.2a-CORRECTION-LEDGER.md`:
- Fixed `fix_11_pre_match_discard` accounting assertion to check `completeCases` (100) instead of nonexistent `totalCases`.
- Preserved historical manifest expectation for `fix_20` with documented fail-closed product-policy override.
- Maintained exact distinction across 6 classification buckets.
