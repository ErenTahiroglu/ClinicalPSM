# CP-WEBR-02A R1.2a Experiment & Test Contract
## Final Worker Error Settlement & Cobalt Numerical Evidence Closure

### 1. Specification & Identification

- **Stage:** CP-WEBR-02A R1.2a — Final Worker Error Settlement & Cobalt Numerical Evidence Closure
- **Repository:** `ErenTahiroglu/ClinicalPSM`
- **Required Branch:** `development`
- **Required Baseline SHA:** `338d89a281c7d7d09e116498a6b8d106199f3881`
- **Previous Stage Verdict:** `ADAPTER_INSUFFICIENT — R1.2a_REQUIRED` (Independent Red Team)
- **Permitted Overall Verdicts:**
  - `ADAPTER_PASS_FOR_INTEGRATION_REVIEW`
  - `ADAPTER_INSUFFICIENT`
  - `ADAPTER_FAIL`
- **Authoritative Independent Reviewer:** ChatGPT — Independent Scientific & Security Red Team

---

### 2. Strict Negative Boundaries & Prohibitions

1. Zero modifications to `apps/web/**` or active product code.
2. Zero changes to `main` branch.
3. No branch creation, deletion, or merging.
4. Zero real patient or clinical data; strictly synthetic fixtures.
5. No Cloudflare deployment, DNS modifications, or external server telemetry.
6. No replacement of WebR, MatchIt, or cobalt engines.
7. No introduction of a TypeScript statistical engine.
8. Zero editing of frozen historical fixture inputs or configurations.
9. Zero alteration of scientific numerical tolerances (locked to `eps <= 1e-4`).
10. No accounts, payments, or third-party service creation.
11. Pinned toolchain versions must remain invariant: WebR 0.6.0, R 4.6.0, MatchIt 4.8.1, cobalt 5.0.0.
12. Authoritative R template SHA-256 must remain invariant: `7989403c7d093031b93a9c971a6d4f055101bab83c0ec4417fc52e4dceee24a4`.
13. External blockers must remain strictly `BLOCKED`:
    - `NATIVE_R_INDEPENDENT_ORACLE = BLOCKED`
    - `AUTOMATED_SEPARATION_SAFETY = BLOCKED`
    - `PRODUCTION_LICENSING_CLEARANCE = BLOCKED`
14. Do not begin CP-WEBR-02B until final independent review approval.

---

### 3. Falsifiable Acceptance Criteria (P0 & P1 Gates)

#### Gate 1: Worker Fatal Error Promise Settlement (§2)
- **Defect Addressed:** In `adapter/worker_manager.mjs`, `handleWorkerLevelError()` set `currentJob.settled = true` before calling `reject()`, causing `reject()` to return early and leaving consumer promises dangling indefinitely.
- **Remediation & Acceptance Criteria:**
  1. Centralized exactly-once settlement in `settleJob(status, result, error)`. `settled = true` must never be set before calling rejection wrapper.
  2. Separate failure paths for `worker.onerror` and `worker.onmessageerror`.
  3. Every active and pending message handler must be rejected on fatal Worker error with `WORKER_FATAL_ERROR`.
  4. Pending message handlers map must be completely cleared.
  5. State machine must transition to `RECOVERABLE_ERROR`.
  6. A fresh worker must be required before accepting another statistical job.
  7. Stale worker events from terminated instances must be ignored without side effects.
  8. Cancellation timers and listeners must be cleanly removed.
  9. Ordinary job-level errors must not trigger fatal worker teardown.
  10. Deterministic tests with bounded timeouts (<= 5000ms) must verify all 10 failure paths in `r1.2a/WORKER-FATAL-ERROR-SETTLEMENT-AUDIT.json`.

#### Gate 2: Untrusted Text-Based Cancellation Inference Elimination (§3)
- **Defect Addressed:** Relying on regex `/interrupted|operation cancelled/i` allowed arbitrary R exceptions containing the word "interrupted" to be misclassified as `GRACEFUL_INTERRUPT_CONFIRMED`.
- **Remediation & Acceptance Criteria:**
  1. Correlate interrupt signal with unique job ID (`activeInterruptJobId`).
  2. Treat `INTERRUPT` response as `INTERRUPT_ACK` (acknowledgment only), not cessation.
  3. Require observed computation cessation with explicit `OPERATION_CANCELLED` error code.
  4. Adversarial workload emitting R error with word "interrupted" without cancellation code must be classified as `WORKER_ERROR`.
  5. Never transition to `READY` while a potentially active stale computation remains.

#### Gate 3: Grounded Cobalt Numerical Parity Verification (§4)
- **Defect Addressed:** Balance diagnostics previously asserted arbitrary SMD threshold (< 10) and presence of text strings without numerical comparison against authoritative cobalt reference.
- **Remediation & Acceptance Criteria:**
  1. Establish R-side numerical reference using official `cobalt::bal.tab(..., un = TRUE, s.d.denom = "treated")` on identical synthetic fixtures.
  2. Numerical comparator must compare 48 distinct statistics across continuous (`fix_01`) and mixed/binary/categorical factor contrasts (`fix_02`).
  3. Compare pre-match and post-match SMDs, raw binary differences, and variance ratios within frozen tolerance `eps <= 1e-4`.
  4. Preserve undefined statistics as explicit `null`; verify replacement with `0.0` is caught.
  5. Verify normal comparator sensitivity via 6 realistic numerical mutations (SMD +0.05, binary raw diff +0.05, factor contrast SMD +0.05, null replaced by 0.0, missing row, extra row).

#### Gate 4: Real Numerical Evidence-Dependent CI Gates (§5)
- **Remediation & Acceptance Criteria:**
  1. `COBALT_BALANCE_PARITY` gate in `test_browser_qualification.mjs` must require machine-readable records in `r1.2a/COBALT-NUMERICAL-COMPARISON-MATRIX.json` with `absolute_numerical_difference <= applicable_tolerance`, `all_comparisons_pass === true`, and official reference provenance.
  2. `WORKER_LIFECYCLE_CORRECTNESS` gate must require 100% pass in `r1.2a/WORKER-FATAL-ERROR-SETTLEMENT-AUDIT.json`.
  3. CI falsification controls must alter underlying numeric values while preserving assertion strings; gate evaluator must deterministically fail.

#### Gate 5: Evidence Consistency & Accurate Accounting (§6)
- **Remediation & Acceptance Criteria:**
  1. Remove false `totalCases (undefined)` assertion from `fix_11_pre_match_discard`; report actual sample counts (`completeCases: 100, matched: 60, unmatchedControl: 40`).
  2. Accurate fixture categorization into 6 mutually exclusive buckets.
  3. Non-revisionist audit: document all R1.2 findings in `r1.2a/R1.2a-CORRECTION-LEDGER.md`.
