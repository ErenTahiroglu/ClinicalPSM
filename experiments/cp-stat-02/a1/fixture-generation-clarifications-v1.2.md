# CP-STAT-02-A1 Fixture-Generation Execution Correction v1.2

**State:** Post-first-execution implementation correction; requires independent review.  
**First execution:** workflow `40093824481`, commit `130e42d4b1101920b3bd2329237506b74d4487ae`, artifact `12559634424`.  
**GitHub artifact digest:** `sha256:41d4c31f0f5716f2e8c300a00783f5115c46c7581a96707505791e243add99b6`.  
**Internal evidence archive SHA-256:** `53ffc77b534c6e2813608fd1b8337be81f3d42f3e5a0306f275e71eb0a346bde`.

## Reason for the correction

The first complete execution exposed a generator implementation defect in scenarios whose predictor transforms use the seeded vector `z`. The generator created shared overlap anchors for both treatment classes, then assigned independent `z` values to each row. A later transform therefore made the supposed shared anchor rows differ across outcomes. This violated the already pinned generation contract's requirement that shared anchors remain exact duplicates and span the observed model-matrix column space. The result was visible in the first evidence: fixture 30 and fixture 50 failed their common-row rank proof. Their first-run data and results remain preserved and are not relabeled as valid qualification evidence.

This correction makes the implementation satisfy that existing contract. It does not change a fixture ID, sample size, seed, expected separation class, expected MLE status, product policy, tolerance, or acceptance rule. The first-run artifact remains part of the audit trail. A full second execution of all 50 rows is required; no subset will be rerun.

## Deterministic anchor perturbations

The seeded RNG still generates the complete `z` vector at the same point in the constructor. Only the anchor positions are then assigned deterministic `z` values. Non-anchor `z` values, response draws, and all other seeded draws remain unchanged.

Anchor ordering is the generator's existing order: factor level, anchor point, then treatment 0 followed by treatment 1. Within each paired anchor, both treatment records receive exactly the same `z` value. The same point-specific value is used at that point across factor levels.

- For `cpstat02a1_30_near_rank_deficient_overlap`, whose transform is `x3 = x1 + x2 + 1e-7*z`, point IDs 1–4 receive `z = (0, 0, 0, 1)`. The four paired anchors therefore span the intercept, `x1`, `x2`, and the small independent `x3` direction while remaining identical across response classes.
- For transforms of the form `x2 = x1 + epsilon*z` (`correlated`, `near_exact_correlation`, `near_collinear`, `near_alias`, and `weak_information` profiles), point IDs receive `z = (0, 1, 0, 0)`, truncated to the anchor point count. This gives a full-rank anchor design for the declared numeric columns while preserving paired rows.
- The exact duplicated quasi-separation boundary pair receives `z = 0` in both rows if a later transform uses `z`.
- Other overlap anchors are left unchanged when no `z`-based transform applies.

After the transform and before any separation-method call, the harness verifies that each declared common anchor occurs with both response values, and that the common-row model matrix has the same recorded rank as the complete model matrix. Failure stops the run before `detectseparation` is invoked for that fixture.

## Preserved scientific boundary

The original matrix and its SHA-256 remain authoritative for scenario identities and expected classes. This correction is not represented as having existed before the first output. It is an additive execution record. The initial artifact remains immutable, and the full corrected execution must retain all first-run outcomes and checksums separately. A corrected rerun can diagnose the generator defect; it cannot erase or retroactively qualify the first run.
