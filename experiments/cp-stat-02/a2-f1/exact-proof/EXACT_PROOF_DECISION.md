# A2-02 exact-proof decision

**Verdict:** `A2_02_EXACT_PROOFS_READY_FOR_RED_TEAM`

## Mathematical decisions

| Fixture | Frozen A1 ground-truth claim | Exact-rational result | A1 detector result retained | Decision |
|---|---|---|---|---|
| `cpstat02a1_31_small_scale_complete` | Complete separation | Positive `x1` witness has strictly positive signed margin on all 80 rows; exact decimal and reconstructed binary64 minimum margins are positive. | `1e-4` quasi; `1e-8` complete; historical status remains `TOLERANCE_SENSITIVE_UNRESOLVED`. | `MATHEMATICAL_GROUND_TRUTH_CONFIRMED`; detector discrepancy unresolved. |
| `cpstat02a1_33_heterogeneous_scale_overlap` | Overlap and finite unique MLE | Three opposite-treatment exact common rows span the three-column model matrix; no nonzero weak separator exists. | `1e-4` overlap; `1e-8` quasi; historical status remains `FALSE_POSITIVE`. | `MATHEMATICAL_GROUND_TRUTH_CONFIRMED`; detector discrepancy unresolved. |

The strict separation proof for 31 does not validate the `1e-4` quasi detector output. The fixture 33 anchor proof establishes the finite-MLE claim for this frozen model; it does not establish population causal positivity, sufficient propensity overlap for a causal estimand, or matching adequacy.

## Preservation and boundaries

- Original A1 remains 50 evaluated, 48 PASS, 2 FAIL, 0 unmeasured; general detector remains `NOT_QUALIFIED`.
- No A1 expectation, scientific classification, model matrix, response, tolerance, or solver setting was changed.
- A1 supplemental LP diagnostics remain identified as same-solver observations, not independent solver confirmation. No residuals were present in the A1 JSON.
- `fix_31` remains subject to the recorded inference restriction. `fix_33` still requires separate GLM, matching and balance gates.
- Issue #6 remains open for Red Team inspection. Issue #7 must independently assess candidate LP behavior and numerical residuals; this proof makes no solver-defect finding.
- No production detector, production behavior, causal conclusion, release, or deployment is authorized.

## Issue #6 acceptance checklist

- [x] Required development baseline and unchanged main verified.
- [x] Issue #5 closed; CP-WEBR-02 ratification and open CP-STAT-02/A2 boundary verified.
- [x] Outer artifact, inner evidence archive, archived SHA256SUMS, both specs, input CSVs, matrices, row order, response values and model-matrix hashes verified before proof.
- [x] CSV/JSON model-matrix token correspondence, ordered columns and factor/reference/contrast metadata checked.
- [x] Fixture 31 exact witness margins and scale invariance verified on archived decimal rationals and reconstructed binary64 values.
- [x] Fixture 33 opposite-treatment anchors, exact ranks, spanning condition, and determinant certificate verified.
- [x] Independent interval/determinant cross-checks included.
- [x] Nine mutation/falsification controls and two positive arithmetic/proof tests pass.
- [x] Original A1 classifications and outcomes remain immutable.
- [x] No solver execution, fixture regeneration, A1 rerun, or production change.
- [ ] Independent ChatGPT Red Team review and Issue #6 governance decision remain pending.
