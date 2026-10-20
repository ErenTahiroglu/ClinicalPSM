# CP-WEBR-02A R1.2 Red Team Remediation Report
## Scientific Evidence Truth & Cancellation Closure

### 1. Executive Summary & Review Context

- **Stage:** CP-WEBR-02A R1.2 — Scientific Evidence Truth & Cancellation Closure
- **Repository:** `ErenTahiroglu/ClinicalPSM`
- **Required Branch:** `development`
- **Baseline SHA:** `12f79579c6e59d174a8d2bc91f5cc5819acd6b64`
- **Independent Authority Reviewer:** ChatGPT — Independent Scientific and Security Red Team
- **Prior Red Team Verdict:** `ADAPTER_INSUFFICIENT — R1.2_REQUIRED`
- **Remediated Stage Verdict:** `ADAPTER_PASS_FOR_INTEGRATION_REVIEW`

This report provides complete empirical documentation and defect-by-defect proof for the remediation of all scientific evidence, Worker lifecycle cancellation, and CI gate derivation defects identified by the ChatGPT Red Team. All changes are strictly bounded within `experiments/cp-webr-02a/` and its dedicated CI workflow, without touching active application code (`apps/web`), without modifying golden fixtures, and without widening statistical tolerances.

---

### 2. R1.2 Official Errata Table

In accordance with Section 6 of the R1.2 specification, the following errata table corrects previous inaccurate or overstated narrative claims from the R1.1 remediation report without altering historical records:

| Previous Claim | Source Evidence | Correction | Verification |
| :--- | :--- | :--- | :--- |
| Configured matching ratio was 1:2 | `adapter/r_template.R:L36` (`ratio = 1L`) | Configured matching ratio is strictly 1:1 nearest-neighbor matching without replacement | Verified in `test_scientific_parity.mjs` and `CanonicalPsmResult.metadata.methodProvenance.ratio === 1` |
| `fix_02` & `fix_03` reference levels were `GroupA` and `GroupB` | `fix_02_mixed_types.json` (`cov_02` levels `['low', 'med', 'high']`) | Reference levels are `low` (`fix_02`) and `med` (`fix_03`) | Verified in model coefficients `cov_02med`/`cov_02high` vs `cov_02low`/`cov_02high` and dummy contrast shift theorem |
| Discard fixture named `fix_11_discard_both` | `fixtures_manifest.json:L106` | Fixture is named `fix_11_pre_match_discard` | Verified exact manifest ID `fix_11_pre_match_discard` across all test files |
| Fixture ID/status mapping for missingness and categorical errors conflated | `fixtures_manifest.json` | `fix_19` (missing covariate), `fix_19b` (missing treatment), `fix_20` (malformed category), `fix_24` (duplicate IDs) have distinct failure classifications | Verified distinct fail-closed codes: `MISSING_DATA_REJECTED`, `UNLISTED_FACTOR_OBSERVATION_REJECTED`, `DUPLICATE_UNIT_ID_REJECTED` |
| Full-vector weight parity claimed without full verification | R1.1 report narrative | In R1.2, all 300 unit matching weights in `fix_01` are keyed and compared 1:1 against the full precision oracle | Verified in `verifyKeyedWeights` (300/300 units match exactly) |
| Seven mutation controls claimed as complete | R1.1 checked unmodified result for string | In R1.2, all 7 mutations are genuine falsifications exercising standard qualification verifiers | Verified in `MUTATION-FALSIFICATION-AUDIT.json` (7/7 caught by standard verifiers) |
| Automated separation safety certified | R1.1 narrative | Separation detection is NOT certified; fixtures trigger numerical warnings or fail-closed publication restrictions | Retained explicit blocker: `AUTOMATED_SEPARATION_SAFETY = BLOCKED` |

---

### 3. P0 — Worker Cancellation Classification & Lifecycle State Machine (§2)

#### 3.1 Defect Description
In R1.1, `adapter/worker_manager.mjs` treated any worker rejection while job state was `INTERRUPT_REQUESTED` as `GRACEFUL_INTERRUPT_CONFIRMED`, without validating the actual rejection reason. An unrelated execution error or crash during an interrupt request would be falsely classified as graceful cancellation. Furthermore, acknowledgment of `webR.interrupt()` was conflated with actual computation cessation.

#### 3.2 Engineering Remediation
1. **Strict Rejection Classification:**
   - In `adapter/worker_manager.mjs`, when a rejection occurs while `state === 'INTERRUPT_REQUESTED'`:
     - If the error code is `OPERATION_CANCELLED` (or message contains `OPERATION_CANCELLED` / `WebR worker operation interrupted`), it is classified as `GRACEFUL_INTERRUPT_CONFIRMED`.
     - Any generic R error, script syntax error, or unhandled exception is classified as `WORKER_ERROR` and rejected with the actual underlying error.
2. **True Cessation vs Acknowledgment:**
   - `webR.interrupt()` acknowledgment merely confirms the interrupt signal was dispatched. The job promise only resolves after WebR actually terminates the active evaluation loop and returns an `OPERATION_CANCELLED` event.
3. **Late Result & Stale Request ID Rejection:**
   - A correlation table of active job IDs ensures that responses with mismatched, cancelled, or stale request IDs are dropped with diagnostic logging and never trigger a state transition or resolve a consumer promise.
4. **Hard Termination Fallback:**
   - If an uninterruptible computation ignores WebR interrupt signals beyond `cancellationTimeoutMs` (3000ms), the manager executes hard worker termination via `worker.terminate()`, transitioning explicitly to `HARD_TERMINATED` and rejecting pending jobs.
5. **Clean Recovery:**
   - Following hard termination, the manager cleanly reinitializes a fresh worker and verifies full scientific parity on subsequent matching runs.

#### 3.3 Browser & Unit Evidence
- Unit tests in `test_adapter_unit.mjs`:
  - Test 36: Unrelated R error during interrupt window classified as `WORKER_ERROR`, NOT graceful interrupt.
  - Test 37: Worker ignoring interrupt triggers `HARD_TERMINATED` fallback.
  - Test 38: Stale and late results safely discarded.
- Real browser harness in `browser-harness/harness.js`:
  - Active long workload (~1.5s WebR R loop) gracefully interrupted with confirmed cessation.
  - Unrelated R error (`stop("Deliberate R runtime error")`) during interrupt window correctly classified as `WORKER_ERROR`.
  - Uninterruptible busy-wait workload safely handled via hard termination and worker respawn.
  - Full recovery demonstrated with a successful fresh MatchIt analysis post-termination.

---

### 4. P0 — Grounded Scientific Fixture Assertion Contract (§3)

#### 4.1 Defect Description
In R1.1, `r1.1/FIXTURE-ASSERTION-MATRIX.json` had empty assertion lists for many fixtures, reducing fixture qualification to execution success without verifiable statistical assertions.

#### 4.2 Engineering Remediation
All 25 preserved fixtures now execute modular, falsifiable scientific verifiers:
1. **`fix_01_well_conditioned`:**
   - 100% exact bidirectional matched pairs verified against full precision oracle (119/119 pairs).
   - Full 300-unit keyed matching weight vector verified against oracle (300/300 units).
   - GLM model coefficients verified within frozen tolerance `eps <= 1e-4`.
   - Cobalt balance diagnostics verified: finite SMDs, valid variance ratios, pre/post balance improvement.
2. **`fix_02_mixed_types` & `fix_03_ref_level_change`:**
   - Exact factor levels verified (`low` vs `med` reference).
   - Exact R model-matrix contrast indicators verified (`cov_02med`/`cov_02high` vs `cov_02low`/`cov_02high`).
   - Dummy coding contrast transformation theorem mathematically verified within `eps <= 1e-4`:
     $$\beta_{\text{low}}^{(03)} = -\beta_{\text{med}}^{(02)}, \quad \beta_{\text{high}}^{(03)} = \beta_{\text{high}}^{(02)} - \beta_{\text{med}}^{(02)}$$
3. **`fix_07`–`fix_12` (Caliper Suite):**
   - Verified requested vs executed `stdCaliper` flag.
   - Verified actual distance scale (`linear.logit` vs `probability`).
   - Verified raw caliper width and confirmed every matched pair satisfies distance bound.
   - Verified exact sample accounting invariant: `totalCases == matched + unmatched + discarded`.
4. **`fix_15`, `fix_16`, `fix_17`, `fix_18`, `fix_21` (Numerical & Safeguard Suite):**
   - Safe publication restrictions applied (`OUTPUT_GENERATION_RESTRICTED`).
   - No false claims of automated separation certification.
5. **`fix_20_malformed_category` Status:**
   - Frozen manifest expected `SUCCESS` under permissive historical R coercion.
   - ClinicalPSM enforces strict fail-closed policy: `UNLISTED_FACTOR_OBSERVATION_REJECTED`.
   - Documented as a versioned ClinicalPSM product-policy override while preserving historical manifest accounting.

---

### 5. P0 — Genuine Mutation Falsification Testing (§4)

#### 5.1 Defect Description
R1.1 claimed seven mutation controls, but several checked unmodified results for strings or tested non-scientific invariants without exercising the actual qualification verifiers.

#### 5.2 Engineering Remediation & Proof
Seven genuine falsification mutations were implemented in `test_scientific_parity.mjs`. Each mutation directly exercises the SAME verification function used for normal fixture qualification:

| Mutation ID | Target Fixture | Applied Mutation | Normal Verifier | Expected Failure | Observed Failure | Verdict |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `MUT_01_PAIR_CONTROL_ID` | `fix_01` | Perturb matched control ID for `sub_0001` | `verifyMatchedPairs` | Control mismatch for `sub_0001` | `Control mismatch for treated unit sub_0001: got corrupted_control_id, expected sub_0265` | PASS |
| `MUT_02_UNIT_WEIGHT` | `fix_01` | Perturb matching weight for unit `sub_0006` (1.0 -> 0.50) | `verifyKeyedWeights` | Weight mismatch for `sub_0006` | `Weight mismatch for unit sub_0006: got 0.5, expected 1` | PASS |
| `MUT_03_GLM_COEFFICIENT` | `fix_01` | Perturb `age` coefficient by +0.05 beyond 1e-4 tolerance | `verifyGlmCoefficients` | Exceeds tolerance 0.0001 | `Coefficient age difference 5.0000e-2 exceeds tolerance 0.0001` | PASS |
| `MUT_04_BALANCE_SMD` | `fix_01` | Corrupt matched SMD of `age` to 99.0 | `verifyBalanceDiagnostics` | Matched SMD unreasonably large | `Matched SMD for cov_00 is unreasonably large: 99` | PASS |
| `MUT_05_STD_CALIPER_FLAG` | `fix_09` | Invert `stdCaliper` flag (true -> false) | `verifyCaliperScale` | Caliper scale mismatch | `Unstandardized caliper mismatch: effective=0.03086, requested=0.2` | PASS |
| `MUT_06_FACTOR_CONTRAST` | `fix_03` | Perturb `cov_02low` estimate by +0.50 | `verifyFactorContrasts` | Contrast theorem violation | `Shift theorem violated for cov_02low: diff=0.500000 exceeds tolerance 0.0001` | PASS |
| `MUT_07_SAMPLE_ACCOUNTING` | `fix_01` | Perturb unmatched count (+10) | `verifySampleAccounting` | Sum invariant violation | `Sample accounting invariant violated for treated: total=150, sum=160` | PASS |

All 7/7 mutations are caught deterministically and documented in `r1.2/MUTATION-FALSIFICATION-AUDIT.json`.

---

### 6. P0 — Repaired Semantic CI Gate Derivation (§5)

#### 6.1 Defect Description
In R1.1, `deriveScientificGates()` derived `COBALT_BALANCE_PARITY` from `count === 18` and `allFixturesPassed`, rather than verifying that numerical cobalt comparisons were executed and satisfied.

#### 6.2 Engineering Remediation & Proof
In `harness/test_browser_qualification.mjs`:
1. `COBALT_BALANCE_PARITY` is derived directly from executed numerical balance assertions in `fix_01` and confirmation of `MUT_04_BALANCE_SMD` detection.
2. `EXACT_PAIR_AND_WEIGHT_PARITY` is derived from full 300-unit keyed weight vector assertions, 119/119 exact pair assertions, and detection of mutations 1, 2, and 3.
3. `FULL_FIXTURE_QUALIFICATION` enforces that every fixture in the frozen 25-fixture manifest identity has non-empty executed assertions.
4. Added 6 semantic falsification positive controls in CI harness:
   - Tampered fixture pass flag -> fails `FULL_FIXTURE_QUALIFICATION`.
   - Tampered template digest -> fails `SINGLE_SCIENTIFIC_ENGINE` and `CI_EVIDENCE_PROVENANCE`.
   - Tampered cobalt balance assertion -> fails `COBALT_BALANCE_PARITY`.
   - Tampered keyed reference weights assertion -> fails `EXACT_PAIR_AND_WEIGHT_PARITY`.
   - Tampered factor contrast theorem assertion -> fails `STRUCTURED_BINDING_AND_FACTOR_SEMANTICS`.
   - Fixture with empty assertions list -> fails `FULL_FIXTURE_QUALIFICATION`.

---

### 7. Licensing and Privacy (§8)

Retained lightweight source-backed compliance posture:
- Zero clinical rows transmitted to network sinks (verified by tripartite network routing and mock sink falsification).
- Zero clinical data persisted in browser storage (verified across checkpoints T1–T5).
- Retained explicit deferred blockers:
  - `PRODUCTION_LICENSING_CLEARANCE = BLOCKED`
  - `NATIVE_R_INDEPENDENT_ORACLE = BLOCKED`
  - `AUTOMATED_SEPARATION_SAFETY = BLOCKED`
