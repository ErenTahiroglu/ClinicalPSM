# CP-WEBR-02A R1.1 Experiment & Test Contract
## Focused Scientific Contract, Lifecycle and CI Gate Integrity Closure

### 1. Specification & Identification

- **Stage:** CP-WEBR-02A R1.1 — Focused Scientific Contract, Lifecycle and CI Gate Integrity Closure
- **Repository:** `ErenTahiroglu/ClinicalPSM`
- **Required Branch:** `development`
- **Required Baseline SHA:** `0b80d3fed39aaad25a3cedcefa81a8c724c7888d`
- **Previous Stage Verdict:** `ADAPTER_INSUFFICIENT — R1.1_REQUIRED` (ChatGPT Red Team)
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
9. No dependency version changes without authorization.
10. Zero alteration of historical golden fixtures or manufactured PASS verdicts.
11. Zero numerical tolerance widening (locked to `eps <= 1e-4`).
12. Zero claims of validated separation detection (must remain `BLOCKED`).
13. Zero production legal or compliance clearance claims (GDPR/KVKK/HIPAA remain `BLOCKED`).
14. Do not begin CP-WEBR-02B.

---

### 3. Falsifiable Acceptance Criteria (P0 & P1 Gates)

#### Gate 1: Standardized Caliper Parameter Propagation & Validation
- **Requirement:** One canonical parameter name `stdCaliper` across typed contract (`types.ts`), fixture binding (`webr_binding.mjs`), R binding (`r_template.R`), browser harness, and canonical result.
- **Validation:**
  - Explicit option validation rejects unknown keys (`UNKNOWN_OPTION_REJECTED`).
  - Supported options validated: `caliper`, `stdCaliper`, `distanceMetric`, `discard`, `matchingOrder`, `ratio`, `replace`, `method`.
  - Distinguishes standardized caliper (`stdCaliper: true`, MatchIt default `0.2 * sd(distance[!discarded])`) from raw unstandardized caliper (`stdCaliper: false`).
  - Records both user-requested caliper and effective raw caliper width in canonical result.
  - Fails deterministically if an intentional `stdCaliper` mutation is applied.

#### Gate 2: Actual Matching-Distance Scale & Provenance
- **Requirement:** Report pair distances from actual `m_out$distance` on the matching scale, keyed to stable unit IDs.
- **Validation:**
  - When MatchIt operates with `distance = "glm", link = "linear.logit"`, reported distance equals linear predictor.
  - Linear logit distances are never falsely labeled as probability scale.
  - For each matched pair `(T_i, C_j)`, reported pair distance strictly equals `|distance[T_i] - distance[C_j]|`.
  - Pair distances satisfy `distance <= effectiveCaliperWidthRaw` whenever a caliper is configured.

#### Gate 3: Factor, Missingness, ID & Header Validation
- **Requirement:** Fail-closed validation before any R object construction.
- **Validation:**
  - Source headers: exact raw header preserved, comparison normalized using Unicode NFC. Normalization collisions (`HEADER_NORMALIZATION_COLLISION`) and duplicates rejected.
  - Covariates: repeated selected covariates (`REPEATED_COVARIATE_REJECTED`) and treatment-as-covariate (`TREATMENT_AS_COVARIATE_REJECTED`) rejected.
  - Row IDs: explicit stable, unique, non-empty IDs required. Zero fallback numbering (`String(i + 1)` prohibited).
  - Covariate Types: explicit declaration required (`continuous`, `binary`, `categorical`). Numeric-coded categories must preserve declared categorical semantics.
  - Categorical levels: blank levels rejected, unlisted observations rejected (`UNLISTED_FACTOR_OBSERVATION_REJECTED`).
  - Missingness: missing treatment (`MISSING_TREATMENT`), missing covariate (`MISSING_COVARIATE`), and blank strings rejected fail-closed.
  - Adversarial robustness: NFC/NFD collisions, whitespace differences, numeric-coded categories, non-finite numerics, R code injection attempts tested.

#### Gate 4: 25 Frozen Fixture Scientific Parity Matrix
- **Requirement:** Execute all 25 frozen fixtures with explicit, machine-readable falsifiable assertions.
- **Validation:**
  - Compare matched pairs (identities and count), keyed matching weights, GLM coefficients, and cobalt balance statistics against reference outputs.
  - Sample accounting: total = matched + unmatched + discarded. On discard fixtures (`fix_11`), discarded units subtracted from unmatched counts.
  - Differential factor contrast verified between `fix_02` (reference `GroupA`) and `fix_03` (reference `GroupB`).
  - 7 mutation tests must FAIL deterministically when pairs, weights, subclasses, coefficients, calipers, or factor references are tampered with.

#### Gate 5: Canonical Result Runtime Schema Validation & Provenance
- **Requirement:** Runtime schema validation (`validateCanonicalResult()`) on every emitted result.
- **Validation:**
  - Enforces array length invariants across `rowIds`, `treatment`, `propensityScores`, `matchedPairs`, `weights`, `subclasses`.
  - Non-self-referential hash contract: canonical result hash computed deterministically with `canonicalResultSha256` excluded.
  - Honest dependency provenance: empty dependency hash mappings prohibited; runtime engine provenance truthfully reported.
  - Immutable-at-consumer-boundary semantics: `deepFreeze` prevents consumer tampering. Zero frontend statistical recomputation.

#### Gate 6: Dedicated Worker Lifecycle & Cancellation Semantics
- **Requirement:** Rigorous state machine with explicit cancellation classifications.
- **Validation:**
  - Job states: `RUNNING`, `INTERRUPT_REQUESTED`, `GRACEFUL_INTERRUPT_CONFIRMED`, `HARD_TERMINATED`, `WORKER_ERROR`, `TIMEOUT`.
  - Request IDs correlate every message. Stale or mismatched responses rejected.
  - Generic worker error never counts as graceful interrupt.
  - Hard termination cleanly resets worker thread and reinitializes pinned template.
  - Post-recovery analysis completes with exact parity.

#### Gate 7: Elimination of Hardcoded Scientific CI PASS Values
- **Requirement:** Browser CI qualification derives all scientific gates dynamically from test execution results.
- **Validation:**
  - Zero unconditional gate assignments.
  - Browser report derives gates from `SCIENTIFIC-PARITY-RESULTS.json`, `ADAPTER-UNIT-TESTS.json`, and `fixtures_manifest.json`.
  - Deliberate falsification suite proves CI gate rejects tampered results, stale timestamps, or missing fixtures.

#### Gate 8: Pinned Template Digest & Strict CSP Execution
- **Requirement:** Cryptographic template digest pinned and verified prior to WebR execution.
- **Validation:**
  - Worker verifies template SHA-256 (`7989403c...`) against hardcoded pinned digest.
  - Tampered template deliberately injected fails closed with `TEMPLATE_INTEGRITY_MISMATCH`.
  - Main page and worker execute under strict CSP without `'unsafe-eval'`.

---

### 4. Permitted Gate States & Overall Verdict Derivation

| Gate State | Definition |
| :--- | :--- |
| **`PASS`** | Requirement verified by executed, falsifiable assertions with complete evidence. |
| **`FAIL`** | Requirement failed executable verification or produced numerical discrepancy. |
| **`BLOCKED`** | Requirement deferred due to external or regulatory precondition; explicitly documented. |
| **`UNMEASURED`** | Target platform or environment not evaluated in current bounded test scope. |

#### Overall Verdict Rules:
- **`ADAPTER_PASS_FOR_INTEGRATION_REVIEW`:** All mandatory implementation and test-integrity gates are `PASS`. Known deferred external gates remain `BLOCKED`.
- **`ADAPTER_INSUFFICIENT`:** Any implementation or test-integrity gate fails or lacks empirical verification.
- **`ADAPTER_FAIL`:** Regression in previously qualified functionality or unhandled runtime failure.

---

### 5. Deferred External Blockers

1. **`NATIVE_R_INDEPENDENT_ORACLE = BLOCKED`:** Current environment lacks native host R 4.6.0 binary; double-precision baseline originates from official WebR/R 4.6.0.
2. **`AUTOMATED_SEPARATION_SAFETY = BLOCKED`:** Separation parameter instability is detected via conservative SE threshold safeguard; no generalized separation detector exists.
3. **`PRODUCTION_LICENSING_CLEARANCE = BLOCKED`:** MatchIt/cobalt (GPL-2/3) browser distribution requires formal legal licensing audit prior to commercial integration.
