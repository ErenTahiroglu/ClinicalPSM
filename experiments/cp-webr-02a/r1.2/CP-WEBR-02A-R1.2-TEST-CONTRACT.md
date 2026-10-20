# CP-WEBR-02A R1.2 Experiment & Test Contract
## Scientific Evidence Truth & Cancellation Closure

### 1. Specification & Identification

- **Stage:** CP-WEBR-02A R1.2 — Scientific Evidence Truth & Cancellation Closure
- **Repository:** `ErenTahiroglu/ClinicalPSM`
- **Required Branch:** `development`
- **Required Baseline SHA:** `12f79579c6e59d174a8d2bc91f5cc5819acd6b64`
- **Previous Stage Verdict:** `ADAPTER_INSUFFICIENT — R1.2_REQUIRED` (ChatGPT Red Team)
- **Permitted Overall Verdicts:**
  - `ADAPTER_PASS_FOR_INTEGRATION_REVIEW`
  - `ADAPTER_INSUFFICIENT`
  - `ADAPTER_FAIL`
- **Authoritative Independent Reviewer:** ChatGPT — Independent Scientific & Security Red Team

---

### 2. Strict Negative Boundaries & Prohibitions

1. Zero changes to active application runtime (`apps/web/**`) or legacy PSM code (`clinicalpsm/src/lib/psm/**`).
2. No production application integration or UI activation.
3. No legacy TypeScript PSM fallback.
4. No alternative scientific matching engine (must use MatchIt 4.8.1 and cobalt 5.0.0 on WebR 0.6.0).
5. Zero real patient or clinical data; strictly synthetic fixtures.
6. Zero changes to `main` branch.
7. No branch creation, deletion, or merging.
8. No Cloudflare deployment, DNS modifications, or paid cloud resources.
9. No dependency version changes (retain WebR 0.6.0, R 4.6.0, MatchIt 4.8.1, cobalt 5.0.0).
10. Zero alteration of historical golden fixtures or manufactured PASS verdicts.
11. Zero numerical tolerance widening (locked to `eps <= 1e-4`).
12. Zero claims of certified separation detection (must remain `BLOCKED`).
13. Zero production legal or compliance clearance claims (GDPR/KVKK/HIPAA remain `BLOCKED`).
14. Do not begin CP-WEBR-02B.

---

### 3. Falsifiable Acceptance Criteria (P0 & P1 Gates)

#### Gate 1: Worker Cancellation Classification & Lifecycle Closure
- **Requirement:** Worker state machine must never classify an error as `GRACEFUL_INTERRUPT_CONFIRMED` based solely on `INTERRUPT_REQUESTED`.
- **Validation:**
  - Differentiate user cancellation, actual WebR computation cessation (`OPERATION_CANCELLED`), generic R exceptions (`WORKER_ERROR`), worker crashes, and timeouts.
  - Stale worker request IDs and late analysis completions are safely discarded.
  - Hard termination cleanly resets worker thread with explicit `HARD_TERMINATED` classification.
  - Real browser harness tests active long workload interruption, unrelated R error during interrupt window, uninterruptible timeout fallback, and full recovery with fresh MatchIt analysis.

#### Gate 2: Grounded Scientific Fixture Assertion Contract
- **Requirement:** All 25 frozen fixtures executed with specific, falsifiable assertions verifying the scientific contract.
- **Validation:**
  - Zero empty assertion lists in fixture assertion matrix.
  - `fix_01_well_conditioned`: Exact bidirectional matched pairs (119/119), full 300-unit keyed matching weight vector (300/300), GLM coefficients within `eps <= 1e-4`, cobalt balance diagnostics.
  - `fix_02_mixed_types` & `fix_03_ref_level_change`: Explicit factor reference levels (`low` vs `med`), contrast indicators, and dummy coding shift theorem verification.
  - `fix_07`–`fix_12`: Explicit `stdCaliper` flag, actual distance scale (`linear.logit`), raw caliper width, pair distance satisfaction, and sample accounting invariant.
  - `fix_16`, `fix_17`, `fix_18`, `fix_21`: Publication restrictions applied without false claims of automated separation certification.
  - `fix_20_malformed_category`: Preserved manifest expectation with documented ClinicalPSM product-policy fail-closed override.

#### Gate 3: 7 Genuine Mutation Falsification Controls
- **Requirement:** All 7 scientific mutations must exercise the exact same normal verifier functions used for standard fixture qualification.
- **Validation:**
  1. `MUT_01_PAIR_CONTROL_ID`: Perturbed matched control ID caught by `verifyMatchedPairs`.
  2. `MUT_02_UNIT_WEIGHT`: Perturbed matching weight caught by `verifyKeyedWeights`.
  3. `MUT_03_GLM_COEFFICIENT`: Perturbed GLM coefficient caught by `verifyGlmCoefficients`.
  4. `MUT_04_BALANCE_SMD`: Corrupted cobalt balance SMD caught by `verifyBalanceDiagnostics`.
  5. `MUT_05_STD_CALIPER_FLAG`: Inverted `stdCaliper` flag caught by `verifyCaliperScale`.
  6. `MUT_06_FACTOR_CONTRAST`: Perturbed contrast estimate caught by `verifyFactorContrasts`.
  7. `MUT_07_SAMPLE_ACCOUNTING`: Perturbed unmatched count caught by `verifySampleAccounting`.
  - Machine-readable audit file `r1.2/MUTATION-FALSIFICATION-AUDIT.json` records original value, mutated value, verifier invoked, expected failure, and observed failure.

#### Gate 4: Semantic CI Gate Derivation
- **Requirement:** Scientific gates in `test_browser_qualification.mjs` derived from actual numerical assertion proofs and complete manifest identity.
- **Validation:**
  - `COBALT_BALANCE_PARITY` derived from executed numerical balance assertions, not arbitrary counts.
  - `EXACT_PAIR_AND_WEIGHT_PARITY` derived from complete keyed reference comparisons.
  - Complete frozen 25-fixture manifest identity strictly enforced.
  - Empty assertion lists or false PASS flags deterministically fail gates.
  - Semantic falsification controls in CI harness verify that tampered cobalt balance, altered weights, missing contrast proofs, or tampered template digests fail gates.

#### Gate 5: Truthful Reporting & Errata Correction
- **Requirement:** All previous inaccurate or overstated claims from R1.1 narrative explicitly corrected via an errata table.
- **Validation:**
  - Correction of matching ratio (1:1 nearest neighbor, not 1:2).
  - Correction of reference levels (`low`/`med`, not GroupA/GroupB).
  - Correction of fixture names (`fix_11_pre_match_discard`, not `fix_11_discard_both`).
  - Separation safety correctly identified as `BLOCKED`.
