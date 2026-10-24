# CP-STAT-02 Read-Only Starting Inventory

**Inventory date:** 2026-10-24
**Purpose:** Define the evidence boundary for a later phase; this inventory does not start or implement CP-STAT-02.

## Authoritative contract boundary

The source of the CP-STAT-02 stop condition is Section 7 of `docs/architecture/CP-WEBR-01-PRODUCTION-ARCHITECTURE.md` (SHA-256 `005f1300fde92d1509958d9058526ab8ae98c992ccfc09f3e9d13995eae44bca`): investigate and qualify LP-based separation detection, validate against 50+ diverse synthetic fixtures, and require `100% semantic and numerical tolerance parity`. The ratified CP-WEBR-02 amendment v1 does not alter this condition.

Related existing scientific constraints are recorded in `docs/science/CP-WEBR-01-CANONICAL-RESULT-CONTRACT.md`, `experiments/cp-webr-02a/CP-WEBR-02A-EXPERIMENT-CONTRACT.md`, `experiments/cp-webr-02a/CP-WEBR-02A-R1.2a-TEST-CONTRACT.md`, and `experiments/cp-webr-02a/r1.2a/FIXTURE-ASSERTION-MATRIX.json`. Their current hashes and classifications remain authoritative until a separately reviewed, versioned change is approved.

## Existing relevant fixture and evidence inventory

- The frozen CP-WEBR-02A set contains 25 synthetic fixtures; its manifest SHA-256 is `e799ff01a9606c91cb3d494e277e081cabdc1349a37c993a08e7057d7411e4b1`.
- `fix_15_quasi_separation` is a historical manifest warning-classification discrepancy. Independent LP checks at the E2 thresholds did not establish separation for this exact input. That evidence is not detector validation.
- `fix_16_complete_separation` has fixture-specific independent LP evidence of complete separation, non-finite logistic MLE, extreme covariance/standard-error behavior, and a production Worker restriction of `OUTPUT_GENERATION_RESTRICTED`. The strict comparator retains three standard-error failures; covariance cause remains `UNRESOLVED`.
- E2 includes native/WebR diagnostic evidence and positive/negative LP controls for these two exact scenarios. E3/E4 preserve the raw observations and all original failures. None of those artifacts establishes general-purpose separation detection.
- Other existing fixtures cover rank deficiency, zero variance, extreme propensities, small samples, missingness, malformed categories, no eligible match, and duplicate IDs. The exact fixture list and hashes are in the frozen manifest and the E4 evidence package.

## Research and qualification gaps for CP-STAT-02

1. Define and validate the mathematical estimand and separation classes, including complete and quasi-complete separation, near-separation, rank deficiency, overlap failure, and non-convergence. State what is detectable from supported model inputs and what remains unidentifiable.
2. Evaluate candidate LP/separation methods against independent controls, including false-positive and false-negative cases, numerical scale changes, factor/reference changes, sparse outcomes, rank deficiency, missingness, and near-boundary examples. Document solver and package provenance and legal clearance before browser/runtime use.
3. Design at least 50 scientifically diverse synthetic fixtures with independent expected classifications and frozen input hashes. The current 25-fixture set is only an initial compatibility set.
4. Define semantic and numeric output contracts for model coefficients, fitted probabilities, convergence, weights, covariance, overlap, matching, balance, and rejection policies. Require 100% results at the separately authorized frozen tolerances; preserve raw failures.
5. Validate missing overlap, unstable propensity models, extreme fitted probabilities, and safe rejection/publication behavior. A warning threshold alone must not be called a mathematical separation detector.
6. Establish safe failure states that prevent publication of non-identifiable or inadequately supported inference. Preserve explicit production restriction semantics and test them across the candidate fixture space.
7. Assess method-specific assumptions and causal limitations. Statistical parity or model classification does not by itself validate PSM causal identification, exchangeability, positivity, estimands, or clinical interpretation.

## Current blockers and deferred work

- `AUTOMATED_SEPARATION_SAFETY = BLOCKED` until universal detector validation is completed in its own phase.
- Native/WebR covariance cause for fix16 remains unresolved; three strict numerical failures remain.
- The frozen 25 fixtures do not meet the 50+ diversity target.
- Licensing review, additional browser qualification, CP-PUB-01 publication output, and CP-RELEASE review remain deferred.
- No statistical implementation, fixture expansion, tolerance change, reference rewrite, or production behavior change is authorized by this inventory.
