# CP-STAT-02-A1 Supplemental Solver-Status Probe v1

**State:** PREREGISTERED BEFORE FIXTURE GENERATION  
**Applies to:** The 50 IDs and expected classes in preregistration-matrix-v1.json  
**Purpose:** Capture native lpSolveAPI return codes and an explicit LP formulation alongside detectseparation.

This probe does not change a fixture hypothesis, expected class, matrix hash, or acceptance rule. It is diagnostic evidence. It uses the same lp_solve engine as the detectseparation ROI/lpsolve route and is not an independent solver replication.

## Formulation

For each valid model matrix X and binary response y, define signed rows Z_i = (2y_i − 1) X_i. Positive row scaling and nonzero column scaling preserve whether a separating direction exists. Normalize each column by max(1, max_i |Z_ij|), then normalize each row by max(1, its Euclidean norm). Record the exact scales.

Use lpSolveAPI 5.5.2.0-17.15 and run two bounded maximization problems:

1. Complete-margin probe: maximize t subject to Z_i b − t ≥ 0 for every i, −1 ≤ b_j ≤ 1, and 0 ≤ t ≤ max_i Σ_j |Z_ij|. A positive optimal t is evidence for strict separation at that scale.
2. Weak-direction probe: maximize Σ_i Z_i b subject to Z_i b ≥ 0 for every i and −1 ≤ b_j ≤ 1. A positive objective is evidence for a weak separating direction with at least one strict row. A zero objective is consistent with overlap.

Both problems use the same model matrix rows, response, and formula as the package call. Apply the preregistered numerical thresholds 1e-4 and 1e-8 only when writing an explicitly labelled thresholded objective interpretation. Preserve raw objectives and statuses. Values within or close to either threshold are numerically unresolved; do not reinterpret a tiny positive complete margin as a different mathematical class.

## Solver status capture

Record solve() return code, decoded public status label, objective when status permits, exact lp.control settings, and any R warnings/errors for each problem. Codes 0 and 9 indicate optimal/presolve solutions. Codes 1 through 7, 10 through 13 retain the CRAN manual labels; all non-optimal statuses fail closed for the corresponding probe. Do not replace a status with a Boolean PASS.

The package result, direct probe, constructive fixture proof, and ordinary GLM diagnostics remain separate fields. Any disagreement stays visible and is classified as a numerical or formulation discrepancy for review. The method under evaluation remains detectseparation 0.4.0; this probe does not establish production readiness or universal validity.

