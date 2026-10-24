# A2-03B Falsification Plan

**Status:** preregistered plan only; none of these controls were executed in A2-03A.
**Scope:** isolated copies and synthetic result objects only. The immutable A1 ZIP and its members are read-only.

## Control principles

Every control is bound to an explicit precondition and expected detection. Integrity rejection means the asserted bytes/identity are not the archived evidence; it is not proof that the mathematical class changed. Mathematical falsification means a claimed witness or proof implication fails on its stated data. A control is not allowed to edit an archived file, write a mutated file back into an evidence archive, change an expected class, or add a case to the A1 50-fixture suite.

The production solver stage must run the original two archived cases only. Synthetic examples listed below are contract unit checks, not additional scientific fixtures, and must not be passed off as A1 observations.

## Preregistered controls

| ID | Mutation / check | Class | Expected failure condition | What the result means |
| --- | --- | --- | --- | --- |
| F-01 | Present a matrix with one decimal token changed, a wrong matrix SHA, wrong row order, or wrong ordered column name | Evidence integrity | Preflight rejects before any solver call | Evidence identity failure only; no class inference |
| F-02 | Pair the matrix with a response vector whose archived response hash or row linkage differs | Evidence integrity | Preflight rejects before any solver call | Input association failure only |
| F-03 | On an in-memory fixture-31 copy, reverse the response for a row that attains the exact proof's minimum positive margin, retaining the original beta | Mathematical witness falsification | The recomputed signed margin for that row is negative; the archived witness no longer certifies this mutated copy | Confirms the margin checker is response-sensitive; does not revise archived ground truth |
| F-04 | On an isolated fixture-31 proof copy, set the nonzero x1 witness component from 1 to 0 (or otherwise corrupt it) | Mathematical witness falsification | The exact recomputation rejects strict positivity (all-zero or nonpositive margin occurs) | Invalid witness is not a separator; no conclusion about a replacement witness |
| F-05 | Omit one fixture-31 observation in a temporary matrix | Evidence integrity / proof precondition | Row count, row-order identity, and matrix hash checks reject | No observation is silently omitted; not a changed scientific class |
| F-06 | Change one fixture-33 common-anchor matrix token while preserving the declared anchor IDs | Mathematical proof precondition | Exact row-equality check for the stated treated/control pair fails | The original anchor certificate is invalid on the mutated copy; this does not show that a separator exists |
| F-07 | Change the response association for one member of an opposite-treatment fixture-33 anchor pair | Evidence integrity / proof precondition | Response linkage or opposite-treatment check fails | No pairing can be asserted from stale row labels |
| F-08 | Remove one essential opposite-treatment anchor pair (both identical rows) from a temporary fixture-33 proof copy | Mathematical proof precondition | The recomputed anchor rank no longer equals the recomputed full design rank, or the original spanning certificate is explicitly unavailable | Rejects the spanning proof; does not assert the mutated design is separable |
| F-09 | Alter fixture-33 column identity/order or factor/contrast metadata | Evidence integrity | Hash/schema check rejects before rank/separation work | Prevents a proof for a different parameterization from being attributed to the archived model |
| F-10 | Feed a synthetic returned coefficient vector that violates at least one required signed margin | Mathematical certificate falsification | Exact-rational margin checker rejects the claimed complete/weak certificate | A solver success flag cannot override the failed witness |
| F-11 | Feed a synthetic `OptimizeResult` with status 1 (limit), status 2 (infeasible), status 3 (unbounded), status 4, missing status, or `success=false` | Solver-result contract | Result is not accepted as an optimum or certificate | Nonoptimal/unknown result is retained as `SOLVER_EXECUTION_FAILED`; there is no automatic retry |
| F-12 | Feed a synthetic result whose independently recomputed primal violation exceeds `1e-8` on the preregistered scaled residual | Numerical contract | Result cannot support a certificate | `NUMERICAL_RESULT_INCONCLUSIVE`, not an altered class |
| F-13 | Feed a synthetic boundary result at or below the fixed `1e-8` high-confidence margin floor, with no exact positive witness | Numerical contract | The reporting layer declines a positive numerical signal | `NUMERICAL_RESULT_INCONCLUSIVE`; no threshold movement |
| F-14 | Feed a result with missing/non-finite dual diagnostics for a zero/near-zero objective | Numerical contract | Negative separation claim is not made | `NUMERICAL_RESULT_INCONCLUSIVE`; zero objective does not imply no separation |
| F-15 | Feed two synthetic repeated-result records with incompatible exact certificate classes or objective spread above the fixed repeatability bound | Repeatability contract | Run-level aggregation detects the conflict | `SOLVER_DISAGREEMENT`; neither repeat is selected as preferred |

## Acceptance and limits

For F-03 through F-10, the future harness must first assert that each mutation occurs only in a disposable in-memory object or temporary directory, then run the intended checker. Before/after hashes of the original ZIP and proof manifest must be identical. F-01, F-02, F-05, F-07, and F-09 are identity/precondition controls, not mathematical falsifications. F-03, F-04, F-06, F-08, and F-10 exercise mathematical proof obligations, but rejection of a proof does not prove its negation.

F-11 through F-15 are unit-level ingestion/interpretation controls and do not invoke SciPy or HiGHS. In particular, the nonoptimal-status and residual controls must run against synthetic result objects, not by changing solver options and launching a deliberately bad solve. The high-confidence floor is an evidentiary reporting rule set before data analysis; exact positive witness checks use strict rational inequalities rather than that floor.

No A2-03B outcome can promote the general detector to `QUALIFIED`, erase fixture 31 or 33 from A1, or change a CP-STAT-02 tolerance. Fixture 33's accepted #6 anchor proof remains the independent mathematical result; a numerical zero objective by itself is not a negative-separation certificate.
