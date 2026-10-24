# CP-STAT-02-A1 Fixture-Generation Execution Correction v1.3

**State:** Post-second-execution implementation correction; pending independent review.\
**Second execution:** workflow `40095086399`, commit `4ed6a2fa4d60e28e57216fbf3f0d9e5de7dffde8`, artifact `12560637005`.\
**GitHub artifact digest:** `sha256:1d16956599423101c3731e0cca4da5cee6cb80a2ca19dc4f2d54f7456c8292d9`.\
**Internal evidence archive SHA-256:** `a038be5a15c38e56dbbfddc6dd5d197a37a86e878876282978ce152e0a42985b`.

## Reason for the correction

The second complete run showed that the v1.2 anchor repair was incomplete for three overlap scenarios: `cpstat02a1_24_high_correlation_overlap`, `cpstat02a1_25_near_exact_correlation`, and `cpstat02a1_50_weak_information_finite`. Their paired treatment/control anchor rows remained identical, but the transformed predictor coordinates caused those anchors to span only rank 2 of a rank 3 model matrix. The harness correctly stopped before invoking `detectseparation` for those fixtures. The archived second-run records remain unchanged and are not relabeled.

## Deterministic correction

For profiles that construct `x2 = x1 + epsilon*z`, assign the same deterministic `z` value to both members of each paired anchor using `(target_x2 - target_x1) / epsilon`, where the target coordinates are the original preregistered anchor points. This preserves the declared common-anchor design after the transform. Non-anchor draws, random-number generator state, fixture identifiers, seeds, sample sizes, expected classifications, product policies, solver tolerances, and acceptance criteria are unchanged.

The existing special `near_rank_deficient_overlap` construction continues to set `z` so the small independent `x3` direction is retained. The correction does not alter fixture 31 or fixture 33, the two recorded candidate-method discrepancies. It does not tune inputs to the candidate method. The exact-rank, paired-row, common-row-rank, and full-model-rank proofs remain checked before any candidate LP call.

## Evidence handling

This correction was made after the second complete run and is not represented as preregistered before either execution. The original matrix and its SHA-256 remain unchanged. The first- and second-run artifacts, every generated file, their failed status, and the v1.2/v1.3 correction history remain separately hash-pinned. A complete 50-scenario rerun is required. No result from an earlier run may be overwritten or counted as a result of this correction.

The result JSON uses schema v2 because the v1 evidence validator incorrectly treated each named model-matrix row object as an array. The corrected validator checks the exact ordered column keys and scalar string values emitted by R's named-list JSON encoding. Model-matrix CSVs are written at 17 significant digits so those independently archived values round-trip exactly against the named JSON rows. These serialization corrections change no scientific input or numeric result.
