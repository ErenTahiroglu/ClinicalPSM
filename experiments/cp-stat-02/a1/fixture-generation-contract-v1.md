# CP-STAT-02-A1 Fixture Generation Contract v1

**Preregistered at:** 953f0d9  
**Applies to:** preregistration-matrix-v1.json  
**Matrix SHA-256:** to be filled by the subsequent pinned evidence manifest before fixture generation

This contract resolves how each matrix row becomes a deterministic dataset. It is committed before the generator and before any A1 scenario output is observed. Expected classifications and seeds in the matrix remain authoritative and are not changed by this contract.

## Deterministic parsing

- Every fixture ID is generated exactly once from the ordered matrix.
- Parse the unique sample size from the construction text using the token n=<integer>. Missing or multiple sample-size tokens fail the generator.
- Use the matrix seed as the sole scenario seed. Use an explicitly recorded RNG kind and R version.
- Every valid scenario has numeric x1 and x2. Add x3 only for profiles that specify a third numeric term. Add x_cat only for profiles containing factor, sparse, reference, or categorical.
- The canonical model formula is treat ~ x1 + x2 plus the declared additional terms; no interactions, weights, offsets, or alternative links are added unless a later preregistration version states them.
- Treatment is numeric 0/1. Row IDs are sub_0001 through sub_<n>, assigned before any row permutation.

## Base constructors and proofs

### COMPLETE_SEPARATION

Generate x1 in disjoint strict ranges: controls in [-2,-1], treated in [1,2]. The preregistered witness is b=(0,1,0,...), with a positive signed margin for every row. For a factor-nested profile, ensure every declared factor level occurs at least once and keep the x1 witness unchanged. A sparse-factor profile additionally places its named rare level in one treatment class as specified by its row hypothesis.

### QUASI_COMPLETE_SEPARATION

Create one exact boundary model row with x1=0 in each response class, and make every other control row have x1<0 and every other treated row x1>0. The x1 direction is a weak witness; the duplicated full model row across response classes rules out any strict witness. For rare-class profiles, the duplicated boundary pair counts toward the stated rare class. Other covariates and factor values for the duplicated rows must be identical.

### OVERLAP_FINITE_MLE

Create an anchor set and copy every anchor into both response classes. Without factors, use numeric anchor points (x1,x2)=(0,0),(1,0),(0,1). With L declared factor levels, cross those points with each factor level. These common model rows span the full model-matrix column space before any rank-decreasing transform. Fill remaining rows using the row seed and a balanced response allocation unless the profile explicitly requests rare treatment. This gives a constructive proof that no nonzero model-space direction can separate the outcomes. Under exact rank deficiency, the proof is applied to the observed column space and the coefficient vector is reported nonunique.

### NOT_CLASSIFIABLE_INVALID_MODEL

Create only the preregistered missing-covariate or invalid-factor condition. The input validator must reject it before model.matrix or detectseparation is called. Record LP invocation as false; do not assign a mathematical separation class.

## Preregistered transforms

Transforms are applied to both anchors and non-anchor rows, with exact duplicate rows kept identical:

- correlated: x2 = x1 + 0.1 z, where z is an independently seeded numeric vector.
- near_collinear / near_alias: x2 = x1 + 1e-5 z or the exact epsilon named in the matrix construction.
- exact_alias: x2 = x1; profiles with x3=x1+x2 use that exact linear relation.
- small_scale_complete: x1 is multiplied by 1e-6.
- large_scale_quasi: x1 is multiplied by 1e6.
- heterogeneous_scale: x1 is multiplied by 1e-5 and x2 by 1e5.
- factor_reference: relevel x_cat to the named level before model.matrix and store contrasts.
- row_permutation / reordered: apply the deterministic reverse or seeded permutation named in the fixture profile; preserve IDs.
- ties: round the specified numeric feature(s) to the stated grid and retain duplicated rows across both outcomes.
- extreme_finite / large_logits_overlap: add only the named extreme tail rows after the common anchors are fixed.
- poor_overlap / poor_balance: shift or skew non-anchor populations as stated; never remove spanning common anchors.
- caliper_zero: the LP model remains the constructed finite-overlap model. A1 does not execute matching, so the caliper and zero-pair assertion remain specified but UNMEASURED here.

If a profile name has no unique transform mapping, or if a transform changes its required anchor, strict witness, or exact duplicated boundary row, stop with GENERATOR_SPEC_AMBIGUITY. Do not infer a replacement rule from observed detector output.

## Output and proof checks

Before calling the candidate LP method, independently verify:

- complete profiles: all signed margins from the stored witness are strictly positive;
- quasi profiles: all signed margins are nonnegative, at least one is strictly positive, and an exact full model row occurs with both outcomes;
- overlap profiles: the common-row design matrix has the same rank as the full model matrix under the recorded rank calculation;
- rank-deficient profiles: rank and pivot/alias identity are recorded separately; no assertion treats aliasing as separation;
- invalid profiles: validation failure occurs before LP.

Store each generated CSV and its SHA-256, exact JSON spec and hash, formula, full model matrix and its hash, response and hash, witness/anchor proof, and per-run results in the CI artifact. No generated scenario is copied into or substituted for the frozen CP-WEBR-02 manifest.

