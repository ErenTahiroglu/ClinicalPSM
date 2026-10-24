# A2-03B Execution Interpretation v1.1

**Status:** additive interpretation frozen before any SciPy/HiGHS invocation.
**Applies to:** the six immutable A2-03A v1 preregistration files and the one A2-03B execution authorized by the Red Team review in [GitHub issue #7, comment 6387366807](https://github.com/ErenTahiroglu/ClinicalPSM/issues/7#issuecomment-6387366807).
**Purpose:** make the already-registered repeatability, residual, dual/KKT, and margin-reporting rules operational. This annex does not amend the fixtures, matrix hashes, mathematical classifications, LPs, solver versions or options, 32-cell design, repeat count, thresholds, falsification expectations, or A1 results.

The six v1 files remain byte-for-byte unchanged. Their SHA-256 identities, this annex's identities, the execution-manifest identity, code identities, and the environment lock are recorded in `A2_03B_FROZEN_INPUTS-v1.1.json`. The dedicated workflow verifies those identities and the exact 32-row manifest before it can invoke a solver.

For CPython source-distribution provenance, the workflow also pins the `actions/python-versions` manifest to commit `9834b4e4911ca2950ff6c3b7547f09eacc006848`. That manifest identifies the exact Python 3.13.17 Ubuntu 24.04 x86_64 release asset. The run records the manifest SHA-256, selected release URL, setup-python cache/download output, and installed executable SHA-256. This records the build source for the preregistered CPython version; it does not change that version or the solver environment.

## 1. Repeatability

For two finite registered maximization-objective values (f_1,f_2) in the same fixture, representation, method, and LP-problem cell, where each value is `-OptimizeResult.fun`, calculate:

`abs(f1 - f2) / max(1, abs(f1), abs(f2))`

The repeat objective comparison is within the preregistered limit when the value is `<= 1e-8`. Because the denominator is at least one, this is an absolute comparison for objectives whose magnitudes are below one. It is not a separator classifier and does not establish optimality.

Report the two raw objective values, the ratio, both solver statuses, and both exact witness classes. A repeatability PASS additionally requires equal SciPy status/success and equal exact witness class. Missing, non-finite, or unparseable objectives produce `UNMEASURED`; any status, exact-witness-class, or ratio conflict produces `SOLVER_DISAGREEMENT`. Never choose a preferred repeat.

## 2. Primal inequality and bound violations

For every encoded LP row (A_{ub}x le b_{ub}), independently recompute:

- Raw row violation: `max(0, A_i*x - b_i)`.
- Normalized row violation: `max(0, A_i*x - b_i) / max(1, sum_j(abs(A_ij*x_j)) + abs(b_i))`.

Retain the signed residual, raw violation, denominator, normalized violation, and maximum raw/normalized values across rows. Apply the original `independent_scaled_primal_violation_max = 1e-8` only to the maximum normalized violation. Record raw violations without adding a raw-value acceptance threshold.

For each finite lower bound (l_j), independently recompute:

- Raw lower-bound violation: `max(0, l_j - x_j)`.
- Normalized lower-bound violation: `max(0, l_j - x_j) / max(1, abs(x_j), abs(l_j))).

For each finite upper bound (u_j), independently recompute:

- Raw upper-bound violation: `max(0, x_j - u_j)`.
- Normalized upper-bound violation: `max(0, x_j - u_j) / max(1, abs(x_j), abs(u_j))).

Use only finite bounds that apply to the particular variable. Keep lower and upper diagnostics separate and also report the maximum raw and normalized bound violations. Apply the same registered `1e-8` limit to the maximum normalized bound violation; do not create another threshold. Retain SciPy's own inequality and bound residual/marginal fields separately from these independent calculations.

## 3. Dual, KKT, and optimality claims

The execution does not implement an independently validated dual certificate or a complete KKT checker for both LPs. Therefore:

- Record SciPy's inequality, lower-bound, and upper-bound residuals and marginals when they are present, along with any exposed solver status/iteration fields.
- Set `dual_kkt_status` and `independent_optimality_verification` to `UNVERIFIED`; set missing or non-finite diagnostics to `UNMEASURED` with the field-level reason.
- Do not claim verified optimality, stationarity, a verified primal-dual gap, or a numerical negative separation certificate from `success`, an objective of zero/near zero, solver marginals alone, or agreement between `highs-ds` and `highs-ipm`.
- A HiGHS result with no independently checked positive witness is not evidence that no separator exists. For fixture 33, the accepted #6 exact opposite-anchor/full-rank proof remains the mathematical reference for absence of a weak separator.

This rule preserves raw dual evidence without assigning it a validation status that has not been earned.

## 4. Exact witnesses, margin floor, and separate status fields

Recompute signed margins against the original archived full-precision decimal matrix. Convert every returned finite binary64 coefficient to its exact rational value using its integer ratio. For the column-max arm, map the returned coefficients back to original-column units using the exact rational ratios of the binary64 column maxima before checking the archived matrix.

- Problem A has an exact positive complete-separation witness only if every exact signed margin is strictly positive.
- Problem B has an exact positive weak-separation witness only if every exact signed margin is nonnegative and at least one is strictly positive.
- These are witness checks; they do not prove that an LP optimum was found.

The registered `high_confidence_margin_signal_floor = 1e-8` is a reporting threshold only. For Problem A the reported signal is the exact minimum signed margin. For Problem B it is the exact sum of signed margins, matching that LP's registered objective. A signal is reported as above the floor only when it is strictly greater than `1e-8`; otherwise it is at/below the floor. The floor never discards an exact positive rational witness, changes an exact mathematical classification, or changes any A1 result. A positive witness at/below the floor is reported as mathematically verified with numerical confidence `BELOW_OR_AT_FIXED_FLOOR`.

Every call and aggregate record keeps these separate fields:

1. `exact_mathematical_witness_status` — complete witness verified, weak witness verified, no positive witness returned, or unmeasured.
2. `numerical_confidence_status` — above fixed floor, at/below fixed floor, or unmeasured.
3. `solver_status` — the unmodified SciPy status, success flag, message, and termination/iteration details.
4. `dual_kkt_status` and `independent_optimality_verification` — `UNVERIFIED` unless a separately implemented, independently checked formulation exists (none is authorized here).
5. `final_evidence_interpretation` — states whether a positive exact witness was verified, its numerical-confidence status, and whether solver/dual evidence remains unverified. It must not turn absence of a returned witness into a negative mathematical claim.

A positive exact witness remains a mathematical certificate even when its signal is at/below the reporting floor; report the separate numerical-confidence limitation. When no positive witness is verified, report the call as inconclusive with respect to separation and retain the accepted #6 mathematical result separately.

## 5. Frozen inputs and fail-closed preflight

Before the first solver invocation, the dedicated workflow must:

- Verify the six original v1 file hashes, annex Markdown/JSON hashes, exact execution-manifest hash, implementation/test/workflow hashes, and locked wheel hashes against `A2_03B_FROZEN_INPUTS-v1.1.json`.
- Verify the original A1 outer ZIP hash, embedded tar hash, embedded `SHA256SUMS`, all 160 member checksums, both full-precision matrix hashes, response linkage, row order, columns, and accepted exact-proof manifest hash.
- Verify CPython 3.13.17, NumPy 2.5.4, SciPy 1.18.1, embedded HiGHS 1.12.0, Ubuntu 24.04 x86_64, wheel file hashes, and interpreter/executable provenance.
- Verify that the pinned Python build manifest contains the exact locked interpreter release and record its bytes/hash.
- Verify that the manifest has exactly 32 unique calls in its declared order and that every cell uses the locked options.
- Run static checks and all 15 synthetic falsification controls before any scientific LP invocation.

If any preflight or setup integrity check fails, emit an explicit `A2_03B_EXECUTION_BLOCKED` record, invoke zero solvers, preserve the failure evidence, and stop. A technical failure never authorizes a substituted runtime, wheel, archive, setting, fixture, retry, or extra LP call.

## 6. Evidence boundaries

The experiment may establish a positive mathematical witness from a solver-returned vector after independent exact checking. It may also report the solver's observed numerical statuses, objectives, residuals, margins, and repeatability. It does not independently establish numerical nonseparation or verified LP optimality without the dual/KKT work above.

Analyze fixture 31 and fixture 33 separately. Distinguish exact mathematical facts, observed HiGHS behavior, historical A1 ROI/lpsolve outcomes, scientifically supported causal explanations, and unresolved hypotheses. A1 did not archive all ROI solver residuals, so a HiGHS result cannot establish the exact root cause of A1's outcomes by itself.
