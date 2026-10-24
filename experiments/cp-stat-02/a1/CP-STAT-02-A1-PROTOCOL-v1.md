# CP-STAT-02-A1 — Preregistered Separation Qualification Protocol v1

**Status:** PREREGISTERED EXPERIMENTAL PROTOCOL  
**Phase:** CP-STAT-02-A1  
**Baseline:** c3bda2ed841486aadcb5c44f0caa883662a17cf2  
**Scope:** Isolated native-R experimental qualification only

## 1. Phase boundary

CP-WEBR-02 is recorded as CP_WEBR_02_CLOSED_UNDER_RATIFIED_SCIENTIFIC_EQUIVALENCE_AMENDMENT_V1. Its original strict comparison remains FAIL. The ratified 18/5/1/1 classification and its two exact frozen-fixture exceptions apply only to that phase and are not waivers for CP-STAT-02.

The CP-STAT-02 stop condition remains 100% semantic and numerical tolerance parity, with validation across at least 50 diverse synthetic scenarios. This A1 protocol evaluates a candidate diagnostic method and preregisters the scenarios; it does not implement or qualify a production detector, does not qualify browser/Wasm execution, and does not close CP-STAT-02.

The canonical estimator remains stats::glm with binomial logit; matching remains MatchIt 4.8.1 nearest-neighbor 1:1 without replacement for ATT using the existing settings; balance remains cobalt 5.0.0. WebR remains 0.6.0 and R 4.6.0. No frozen CP-WEBR-02 fixture, tolerance, reference, or historical result changes.

## 2. Classification taxonomy

Let y_i ∈ {0,1} be the treatment-assignment response, X the exact model matrix after the canonical formula, factor contrasts, intercept, row selection, and missing-data handling, and s_i = 2y_i − 1. A separating direction is a nonzero coefficient vector b with s_i x_iᵀb ≥ 0 for every included row and a strict inequality for at least one row.

1. **Complete separation.** A direction exists with s_i x_iᵀb > 0 for every included row. Along a ray in that direction the logistic likelihood approaches its supremum as a coefficient diverges; no finite logistic MLE exists.
2. **Quasi-complete separation.** A weak separating direction exists, at least one signed margin is zero, and no strict separating direction exists. For the canonical logit likelihood, at least one coefficient component is unbounded and a finite MLE does not exist.
3. **Overlap / finite-MLE existence.** No nonzero separating direction exists in the model-matrix column space. With an intercept and canonical logit, this is the mathematical overlap condition for finite MLE existence. A unique coefficient vector additionally requires full column rank. With rank deficiency, fitted linear predictors may have a finite maximum while the coefficient vector is nonunique.
4. **Algorithmic non-convergence.** The GLM fitter reports converged = FALSE or terminates with an optimizer/fitting error. This is an observed computation state, not a mathematical separation class. Finite-MLE problems can fail numerically; separated problems can also report convergence.
5. **Rank deficiency / aliasing.** rank(X) < ncol(X) under a preregistered numerical rank convention, with exact duplicated/dependent columns called out separately from near-dependence. This means one or more coefficient contrasts are not identified. It neither proves nor disproves separation. Rank and alias identities are reported independently from separation.
6. **Near-separation / numerical instability.** Not a separate mathematical existence class. A fixture is labelled near-boundary by its known construction, a small normalized geometric margin, and/or sensitivity of solver outcome to scaling/tolerance. These are continuous observations and experimental labels, not universal binary diagnostics. No coefficient-size or standard-error cutoff is used as ground truth.
7. **Overlap and positivity concern.** Empirical overlap in the treatment-assignment model is a finite-sample geometric statement. Causal positivity concerns the treatment probability over the target population and estimand; a finite sample cannot establish population positivity. Extreme fitted scores, sparse support, or covariate extrapolation trigger descriptive review/policy, not a separation diagnosis.
8. **Zero eligible matching pairs.** An exact product outcome after the specified MatchIt settings, caliper, discard, and sample. It is not a separation state. The analysis must return the preregistered fail-closed matching outcome; it must not manufacture a pair.
9. **Valid but poorly balanced match.** At least one eligible pair exists, but preregistered cobalt balance measures exceed the existing review thresholds. This is not separation and does not itself certify causal validity. Report the numerical balance and policy advisory without silently converting the estimand or hiding attrition.

### Decision ordering

For each valid model, independently record: input validity → exact model-matrix rank/aliasing → LP mathematical class → GLM computation state → empirical overlap diagnostics → matching eligibility/accounting → cobalt balance. A failure at one stage does not rewrite another stage. If the LP is indeterminate, fails, times out, or is tolerance-sensitive, classify separation as UNRESOLVED and fail closed at the proposed safety boundary; never infer ordinary success from GLM convergence or small coefficients.

## 3. Ground-truth design

The fixture generator is constrained by the preregistration matrix. Ground truth does not come from GLM warnings, coefficient magnitudes, or the candidate detector.

- Complete-separation cases carry a constructed signed-margin witness with every margin strictly positive.
- Quasi-complete cases carry a constructed weak-separation witness and at least one exact opposite-outcome duplicate model row. That duplicate rules out strict separation.
- Overlap cases include opposite-outcome common design rows whose model-matrix rank equals rank(X). Any weak separator must be zero on those spanning rows and therefore cannot strictly classify another model row. This establishes no separation independently of the solver.
- Exact rank-deficient cases use exact duplicated/linear-combination columns; the class proof is performed in the observed column space. Near-rank-deficient cases have full rank under the preregistered exact construction but report singular values and rank under stated numeric cutoffs.
- One-dimensional subsets additionally receive an analytic interval/range check independent of LP software.
- Invalid-input cases have no mathematical class; the expected result is an explicit validation failure before LP invocation.

Each generated data file, normalized model matrix, response vector, configuration, and witness record is SHA-256 bound. Row identifiers and order are preserved. Factor levels, contrasts, missing-row behavior, formula, and matrix columns are explicit.

## 4. Candidate method and prespecified experiment

Candidate: detectseparation 0.4.0 pre-fit detect_separation method, with stats::glm formula construction, binomial(logit), ROI implementation and lpsolve solver. Request separation_type = TRUE so a second documented LP attempts to distinguish complete from quasi-complete separation.

Primary sensitivity values are 1e-4 and 1e-8, carried forward from the E2 fix15/fix16 forensic controls. They are experimental settings, not production tolerances. A class disagreement between values is UNRESOLVED and a qualification failure for that scenario. The default 1e-4 result is never allowed to erase a disagreement. Repeat each scenario and solver call twice; class, complete flag, infinite-coefficient identity, warnings, and errors must be stable. Record elapsed time but set no universal speed threshold in A1.

The candidate package exposes the method-level outcome and separation-type result; the public API does not promise a portable low-level solver return-code field. Record the package outcome, complete flag, exact warning/error, and solver configuration. Mark raw native solver status as NOT_EXPOSED where it is unavailable; do not fabricate a code. Any failure, missing result, NA outcome, or timeout is a fail-closed UNRESOLVED observation.

An alternative implementation using detectseparation's lpSolveAPI route may be run as a sensitivity check, but both routes use lp_solve and are not independent solver replications. The independent ground truth is the constructive witness/anchor proof above. A second LP engine is a later qualification item.

## 5. Preregistered scenarios

The 50 scenarios are defined in preregistration-matrix-v1.json. They cover strict complete and quasi-complete separation, overlapping populations, near-boundary finite examples, rare classes, sparse factors, correlated predictors, exact and near rank deficiency, variable scaling, factor references, row order and ties, extreme propensities without separation, poor overlap, poor balance, caliper-induced zero pairs, invalid/missing input, small samples, and weakly identified but finite models.

The matrix was prepared before its deterministic fixture generator and result harness. It pins per-scenario expected class, constructive ground truth, product-policy state, required model/diagnostic fields, comparison rules, and falsification control. Changing a hypothesis, expected class, seed, or profile after observing output requires a separately versioned preregistration amendment; retain the old matrix and its hash.

## 6. Required evidence and comparison rules

For every valid model record fixture/config/input hashes; row IDs and exact row order; response values; formula; factor levels/reference/contrasts; model-matrix dimensions, names, values, and rank; exact alias set; LP implementation/solver/control/tolerance; method outcome; complete/quasi field; infinite-component names and signs; warnings, errors, and any public status code; runtime; R/package/solver versions; and repeatability.

Structural identities (fixture ID, model-matrix rows and columns, factor references, response, and exact duplicated design rows) compare exactly. Classification and policy states compare exactly. Numeric witness margins, singular values, linear predictors, fitted probabilities, and match/balance values are retained with full precision; no new cross-runtime tolerance is declared in A1. The only detector threshold variations are the named LP feasibility values. The original CP-WEBR-02 absolute tolerance 1e-4 remains untouched and is not reused to certify this experiment.

For future full parity, preserve exact pair IDs/order, unit-keyed weights, sample accounting, factor/contrast identity, and typed nulls. Compare canonical numeric fields only at already-authorized tolerances. A mathematically undefined quantity requires a separately preregistered semantic status and typed null; never substitute zero, widen a tolerance, or skip it conditionally.

## 7. Proposed production safety contract (proposal only)

- LP proves complete or quasi-complete separation: mark inference non-identifiable for ordinary logistic MLE and restrict publication outputs requiring that fit. Do not automatically substitute Firth or another estimator.
- LP says no separation but numerical diagnostics are unstable: report suspected instability, retain diagnostics, and restrict publication until reviewed.
- Rank deficiency/aliasing: restrict outputs requiring the aliased coefficients; preserve identifiable linear combinations only if a separately approved contract says how.
- GLM optimizer failure: computation failed; no publication.
- Empirical support/positivity concern or zero eligible pairs: report distinct overlap/matching failure; no matched result is fabricated. Whether valid but poorly balanced matches are publishable is an explicit methodological policy, not a detector result.
- Stable, full-rank, finite-MLE model with a successful GLM fit proceeds only to the existing matching and balance checks; it is not proof of causal validity.

False negatives can certify divergent MLEs and unsafe inferences. False positives can unnecessarily suppress analyses, especially with rare categories or scaling pathologies. Any indeterminate or failed detector state must not default to OUTPUT_READY. These are proposed safety rules only.

## 8. Runtime, dependency, and licensing assessment

The E2 evidence demonstrates native R 4.6.0 execution with detectseparation 0.4.0 at two feasibility tolerances, with the fix15 no-separation result and positive/negative controls passing. The locked E2 experiment used ROI 1.0-2, ROI.plugin.lpsolve 1.0-2, lpSolveAPI 5.5.2.0-17.15, and the remaining dependencies in the isolated renv lock. A1 reuses that exact forensic package lock and SHA-verified CRAN source archives; these are experimental-only and do not enter application dependencies.

CRAN metadata declares detectseparation GPL-3, ROI GPL-3, ROI.plugin.lpsolve GPL-3, and lpSolveAPI LGPL-2; lpSolveAPI needs compilation. This is a redistribution review trigger, not a legal conclusion. No package or solver binary is proposed for production distribution in A1.

WebR docs require WebAssembly-targeted package binaries (or a Wasm package build). Native success does not establish that detectseparation and the compiled lpSolveAPI dependency exist, build, or run under WebR 0.6.0. A1 does not claim browser feasibility; it remains UNMEASURED. A later Wasm gate must verify the exact package artifacts, licensing, worker runtime, payload, and deterministic behavior. Solver performance and floating-point sensitivity must be reported from measured A1 runs; A1 makes no universal time or scale-invariance claim.

## 9. Phase boundaries and next gate

A1 may recommend an isolated diagnostic for further testing only if all preregistered controls are accounted for and limitations remain visible. It cannot authorize a production dependency, production detector, automated safety claim, reference rewrite, or browser rollout.

A2 must independently decide whether to implement a fail-closed detector, define policy for unresolved classifications, qualify the complete 50+ suite under the original semantic/numeric contract, and establish a supported WebR/Wasm path if required. CP-STAT-02 still requires 100% semantic and numerical tolerance parity. CP-PUB-01 and CP-RELEASE legal/security/browser gates remain separate.

## 10. Primary sources

- detectseparation 0.4.0 CRAN reference manual: https://cran.r-project.org/web/packages/detectseparation/refman/detectseparation.html
- detectseparation source and release notes: https://github.com/ikosmidis/detectseparation
- Konis (2007), Oxford thesis: https://ora.ox.ac.uk/objects/uuid:8f9ee0d0-d78e-4101-9ab4-f9cbceed2a2a
- Silvapulle (1981), finite MLE condition: https://www.jstor.org/stable/2984941
- Albert and Anderson (1984), separation definitions: https://doi.org/10.1093/biomet/71.1.1
- Kosmidis and Firth (2021): https://doi.org/10.1093/biomet/asaa052
- R 4.6.0 stats::glm manual: https://stat.ethz.ch/R-manual/R-devel/library/stats/html/glm.html
- WebR package installation/build constraints: https://docs.r-wasm.org/webr/latest/packages.html and https://r-wasm.github.io/rwasm/

