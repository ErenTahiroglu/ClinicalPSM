# Independent HiGHS Numerical Forensics — Preregistration v1

**Status:** `PREREGISTERED_PLAN_PENDING_INDEPENDENT_APPROVAL`
**Stage:** A2-03A preparation only; no LP solver was run for this document.
**Scientific scope:** exactly the two immutable A1 fixtures named below.
**Prepared at:** development commit `bc2cceec8cd3308fb60842e0d7b33e89fc976d6d`.

## Question and boundary

The next separately authorized stage will test whether SciPy's `linprog` interface to its bundled HiGHS implementation provides numerical evidence consistent with the independently established separation properties of two archived model matrices. This is a bounded numerical-forensics experiment. It is not a detector qualification, production implementation, or A1 rerun.

The results that must remain unchanged are:

| Fixture | Immutable A1 outcome | Independent exact-proof result |
| --- | --- | --- |
| `cpstat02a1_31_small_scale_complete` | `TOLERANCE_SENSITIVE_UNRESOLVED`; A1 reported quasi at package threshold `1e-4` and complete at `1e-8` | Complete separation confirmed for the archived full-precision model matrix |
| `cpstat02a1_33_heterogeneous_scale_overlap` | `FALSE_POSITIVE`; A1 reported overlap at `1e-4` and quasi at `1e-8` | No nonzero weak separating direction; finite unique logistic MLE for the archived full-rank design |

A1 remains 50 evaluated, 48 PASS, 2 FAIL, 0 unmeasured, with the general detector `NOT_QUALIFIED`. The #5 source audit established that `detectseparation` v0.4 `control$tolerance` is a package classification threshold applied to LP results, not HiGHS or lp_solve primal feasibility control. No fixture-specific numerical cause has been established.

## Frozen evidence and exact input choice

Authoritative A1 source: workflow [40097510667](https://github.com/ErenTahiroglu/ClinicalPSM/actions/runs/40097510667), artifact `12560933385`; source commit `579a2532a5fe210917e2b37e7d7f950c8d01d78f`.

| Evidence | SHA-256 |
| --- | --- |
| A1 outer ZIP | `ebf2d899a4d1bb8404415183dd35d4d7eb221b5a33b0eec1f8d7e9eb4e5c5c6a` |
| A1 internal `.tar.gz` | `326b94c50d9cbbdf72967c0df0d495761e7b736afb30906e60030c3d1d8ae554` |
| Exact-proof evidence manifest | `experiments/cp-stat-02/a2-f1/exact-proof/proof-evidence-manifest.json`, SHA-256 `809aefbb94c320b9368bc740a38fa39c87db279da82a7f96aa8622a98add6ef4` |
| Fixture 31 full-precision matrix CSV | `ea55df16749f235ee69b4634ec37408a2bb6361a9fb26b820170cbaf0373370e` |
| Fixture 33 full-precision matrix CSV | `be5efb7a008f0ca285691c32faff08b48df19054bd1f09bc25e0e1c10609add1` |

The solver input is the archived `model-matrices/*.csv` content from the A1 internal archive. It is not regenerated, and it is not the lower-precision `fixtures/*.csv`. The accepted #6 proof manifest records the exact input CSV, model matrix, response, row order, and specification hashes. It also records that the rounded input fixture CSV differs after binary64 conversion from the full-precision model matrix (fixture 31: x1 80/80 and x2 79/80 entries; fixture 33: x1 117/128 and x2 118/128 entries). The two sources remain unchanged and must not be conflated.

Before a future solver call, the runner must verify the outer ZIP, embedded archive, `SHA256SUMS`, both matrix CSV hashes, response hashes, row-order hashes, ordered columns `(Intercept), x1, x2`, configuration hashes, and the exact-proof manifest. Each decimal token must be parsed once to binary64 for SciPy input while retaining the original token strings for exact certificate checking. No row, response, or column may be dropped, reordered, inferred from a seed, or silently repaired.

## Preregistered run matrix

The future run will use exactly two prespecified representations, two documented HiGHS algorithms, two LP problems, and two fresh-process repeats for each fixture: `2 × 2 × 2 × 2 × 2 = 32` LP calls total.

1. **Raw:** archived full-precision model matrix as read.
2. **Column-max normalized:** divide each model-matrix column by its positive maximum absolute value, calculated from that archived matrix alone. No centering or response-dependent transformation. A zero column is a rank/identity preflight failure, not a reason to continue.
3. **Methods:** `highs-ds` is primary; `highs-ipm` is a prespecified algorithm-sensitivity run. Both are algorithms in the same HiGHS implementation and are not independent solver engines.
4. **Problems:** complete-separation margin LP and weak-separation objective LP as defined in `LP_MATHEMATICAL_CONTRACT.md`.
5. **Repeats:** two clean processes per cell, in deterministic manifest order; no adaptive reruns. Differences in status, certificate class, or objective beyond the fixed repeatability bound are reported as disagreement/inconclusive, never resolved by selecting a favorable repeat.

The order is fixture 31 then fixture 33; raw then column-max normalized; `highs-ds` then `highs-ipm`; problem A then B; repeat 1 then 2. The expected class is withheld from the LP construction and solver call. It may be joined only in the final analysis.

## Fixed numerical settings

The values in `NUMERICAL_ACCEPTANCE_CONTRACT.json` and `SOLVER_ENVIRONMENT_LOCK.md` are chosen before the numerical experiment. They are the same for both fixtures and both matrix representations. Solver feasibility tolerances are separate from the `detectseparation` package threshold.

The SciPy public documentation describes the selected `linprog` methods and options, including primal/dual feasibility controls, IPM optimality control, presolve, time limit, and the result/status fields. The future implementation must pass only documented options and fail preflight if SciPy reports an unrecognized option.

## Evidence to capture in the future stage

For every one of the 32 calls: exact input and solver-build identities; method and all options; SciPy/HiGHS status, success flag, message, iterations and elapsed time; objective; coefficient vector; all signed margins on transformed and original columns; SciPy inequality/bound residuals and marginals when present; independently recomputed primal residuals; and exact rational checks of any candidate positive separator using original decimal tokens plus the exact binary64 coefficient ratios.

`success == true` is not a scientific certificate. A complete or weak separating direction is supported only when its returned coefficients independently satisfy the required signed-margin inequalities. A zero or near-zero objective does not, by itself, prove nonseparation. For fixture 33, the accepted exact anchor/rank proof remains the mathematical reference; a HiGHS zero objective is computational evidence only unless a valid dual certificate is independently checked.

No tolerance may be changed after viewing an output. No result may be translated into a revised A1 class. A failed status, missing dual diagnostics, ambiguous margin, or solver/method disagreement is retained as `NUMERICAL_RESULT_INCONCLUSIVE`, `SOLVER_DISAGREEMENT`, or `SOLVER_EXECUTION_FAILED` according to the numerical contract.

## Sources and falsification

- SciPy 1.18.1 `linprog(method="highs")` documentation: <https://docs.scipy.org/doc/scipy/reference/optimize.linprog-highs.html>
- SciPy 1.18.1 release source commit: `e4e854eaa8f18d807cd3496028e257e36caa93cc`; its `subprojects/highs` gitlink resolves to HiGHS commit `4f96ee8f40b2d3a46e00d6137d5eb31044680776`, whose commit records the v1.12.0 update.
- Exact v0.4 package audit: commit `4ab9509f550f15af52bad8c2199c8102f10e61b7`.
- Exact archived mathematical proofs: commit `0f27cf3c5a5c0428fdcb3495caebdcaddcae79dd`.
- Falsification controls are specified before execution in `FALSIFICATION_PLAN.md`; no controls or optimization have been run in A2-03A.

**Acceptance boundary:** independent review of this preregistration is required before A2-03B solver execution. This document does not close issue #7 or establish a detector result.
