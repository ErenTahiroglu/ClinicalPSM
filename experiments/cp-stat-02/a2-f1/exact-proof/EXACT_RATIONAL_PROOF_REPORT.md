# CP-STAT-02 A2-02 — Exact-rational proofs for frozen fixtures 31 and 33

**Status:** `A2_02_EXACT_PROOFS_READY_FOR_RED_TEAM`

**Scope:** Only the two archived A1 model matrices and their recorded binary treatment responses. No fixture was regenerated, no solver was run, and no A1 result was rewritten.

## Baseline and issue state

- Starting repository HEAD and `origin/development`: `4ab9509f550f15af52bad8c2199c8102f10e61b7`.
- `main`: `53fb05e7c8d9b77b46c4a5d8b7c9cc041345f6a6`.
- GitHub Issue #5 is closed; #3, #4 and assigned Issue #6 are open at verification time.
- CP-WEBR-02 remains closed under its ratified v1 amendment; CP-STAT-02/A2 remains open.
- The source audit at `../source-audit/` was not changed.
- The A1 ZIP remains an untracked local file and is not included in this change.

## Frozen evidence integrity

The original workflow `40097510667`, artifact `12560933385`, was verified before proof calculation. The local ZIP SHA-256 is `ebf2d899a4d1bb8404415183dd35d4d7eb221b5a33b0eec1f8d7e9eb4e5c5c6a` (862,966 bytes). Its embedded `.cp-stat-02-a1-evidence.tar.gz` is 862,827 bytes and hashes to `326b94c50d9cbbdf72967c0df0d495761e7b736afb30906e60030c3d1d8ae554`, matching both the outer sidecar and the supplied internal digest. All 160 entries in the archived `SHA256SUMS` verified. `evidence-index.json` is not listed in that file, but is covered by the verified internal tar digest; its separate SHA-256 is recorded in `proof-evidence-manifest.json`.

| Fixture | Spec SHA-256 | Input CSV SHA-256 | Model-matrix CSV SHA-256 | Row-order SHA-256 | Response SHA-256 |
|---|---|---|---|---|---|
| `cpstat02a1_31_small_scale_complete` | `5019685bcb4e1f481238fb83d8d80efb4d676e3a3f0a0ac8ff2ce0113f7a1b5d` | `c158e73cb10ec32363008efb2683f37da8313765e55f325924d18e413cf63720` | `ea55df16749f235ee69b4634ec37408a2bb6361a9fb26b820170cbaf0373370e` | `b0966dae50ab3177f76fc229ddf6f9b16a73da875c41fa2aa5eb2cba1472be00` | `9abecedb87b35e402ae693df6b489f221c3a5ec429612a5c12930b6f351e1fcf` |
| `cpstat02a1_33_heterogeneous_scale_overlap` | `a90daedf8c3d174303c5a38c4c8d941383d083de4f8a44c2f6819e54ff228745` | `3e2d14547da868f0c7f6fbc1606977e969e2103ae2f3186e097591d2e585f564` | `be5efb7a008f0ca285691c32faff08b48df19054bd1f09bc25e0e1c10609add1` | `f3dd0c9c3bc9c214f9b44b9b636628aa043611c7edf4b49751b354f3ac90176b` | `fbce83ae705baff427e639d5ba1a7b644150de50e2f133b454e0b7fb393e1b13` |

Both records have `treat ~ x1 + x2`, ordered columns `(Intercept), x1, x2`, 80 and 128 rows respectively, matching row IDs and responses, and no factor terms (`factor_levels=[]`, reference metadata `A`, contrasts `null`). Each model-matrix CSV matches its JSON matrix cell-for-cell as exact text. The fixture CSV response vectors and row identities match the result records and their recorded digests.

### Archived predictor serialization difference

The input fixture CSV and the archived full-precision model-matrix CSV were written through separate paths in A1. `qualification.R` writes input data with `write.csv()` and writes the model matrix through `write_csv_full_precision()` / `format_number()` (`qualification.R:34–38, 83–87, 638, 738–742`). Exact reconstruction of the binary64 represented by each decimal token finds predictor differences between those two archived CSVs: fixture 31 has 80/80 differing `x1` cells and 79/80 `x2` cells; fixture 33 has 117/128 `x1` cells and 118/128 `x2` cells. This is recorded rather than hidden.

The mathematical proofs use the requested archived full-precision model matrices and the verified archived responses. They do not rebuild `X` from the lower-precision fixture CSV, and do not claim that re-reading that CSV reproduces the in-memory matrix used in A1. Row and response identity still match exactly.

## Exact arithmetic and binary64 relationship

`exact_proof.py` parses model-matrix decimal tokens directly using `Fraction(token)`. No float is used in the primary proof. A separate exact integer/rational round-to-nearest-even routine reconstructs the IEEE-754 binary64 value represented by the archived `sprintf("%.17g", value)` matrix tokens. The archived R session is R 4.6.0 on `x86_64-pc-linux-gnu`; A1 `format_number()` uses `sprintf("%.17g", x)`. Tests include exact known binary64 cases. The proofs therefore report both the exact decimal-rational result and the exact reconstructed binary64 result. LP solver approximations are treated only as historical observations and are not inputs to either proof.

## Fixture 31 — complete separation

The archived model matrix has columns `(Intercept), x1, x2`; the archived response has 40 treated and 40 controls. Use the preregistered positive-`x1` direction

\[
\beta=(0,1,0)^T.
\]

For every row, the exact signed margin is `m_i=(2y_i−1) x1_i`. The direction is nonzero and all 80 exact margins are strictly positive.

- Exact minimum: row `sub_0018`, `5025148998247459 / 5000000000000000000000` = `1.0050297996494918e-6`.
- Exact maximum: row `sub_0052`, `4936099677579477 / 2500000000000000000000` = `1.9744398710317908e-6`.
- Independent interval check: minimum treated `x1` is positive; maximum control `x1` is negative.
- Exact rank of the archived decimal matrix is 3; exact rank after binary64 reconstruction is also 3.
- The `1e-6` scaling is nonzero and invertible. The scaled witness maps to an unscaled `x1` coefficient of `1e-6`, preserving the separating linear predictor.

**Classification:** `MATHEMATICAL_GROUND_TRUTH_CONFIRMED` for complete separation. The proof does not make the A1 detector’s `1e-4` quasi result correct; the detector classification remains tolerance-sensitive.

## Fixture 33 — no separation and finite unique logistic MLE

The three exact common-row groups in the archived model matrix are:

| Control row | Treated row | Exact model-matrix tokens `(Intercept, x1, x2)` |
|---|---|---|
| `sub_0001` | `sub_0002` | `(1, 0, 0)` |
| `sub_0003` | `sub_0004` | `(1, 1.0000000000000001e-05, 0)` |
| `sub_0005` | `sub_0006` | `(1, 0, 100000)` |

Each paired row is exactly equal as a rational vector and reconstructs to the same binary64 vector in both treatment classes. The common-row count is six. Exact rational elimination gives `rank(A)=3` for the three-row anchor matrix and `rank(X)=3` for the full 128-row matrix. The same ranks hold for the reconstructed binary64 values. An independently evaluated 3×3 determinant of the selected anchor basis is nonzero:

- Decimal-rational determinant: `10000000000000001 / 10000000000000000`.
- Reconstructed binary64 determinant: `18446744073709553125 / 18446744073709551616`.

For any weak separating direction, a treated anchor requires `A_i β ≥ 0` and its identical control requires `A_i β ≤ 0`; hence every anchor enforces `A_i β=0`. Since the anchors span all three columns, `β=0` is the only solution, so no nonzero weak separator exists. Full-column rank and absence of separation imply a finite, unique logistic MLE for this model.

**Classification:** `MATHEMATICAL_GROUND_TRUTH_CONFIRMED` for `OVERLAP_FINITE_MLE`. This finite-sample logistic-model result does not establish population causal positivity, adequate matching, balance, common support for a causal estimand, or causal validity.

## Independent cross-checks and falsification tests

The fixture 31 proof is also checked by the exact treated/control `x1` intervals. The fixture 33 rank proof is checked by a separately implemented 3×3 determinant certificate, not by running the row-reduction routine twice. The A1-reported ground-truth summary (ranks, anchor count and equality status) is compared as a consistency check, not used as the proof.

`proof-tests.py` ran 11 offline tests successfully:

| Control | Expected outcome | Result |
|---|---|---|
| Original exact proofs; exact binary64 reference values | Both certificates valid | PASS |
| Fixture 31: reverse a treated response | Signed witness has a negative margin | PASS |
| Fixture 31: zero the witness component | Zero direction rejected | PASS |
| Fixture 31: corrupt a model-matrix decimal token | Evidence hash check rejects mutation | PASS |
| Fixture 31: remove an observation from a disposable matrix copy | Archived model-matrix hash check rejects mutation | PASS |
| Fixture 33: alter one shared anchor row | Exact paired-row equality is lost | PASS |
| Fixture 33: change an anchor’s response to match its pair | Opposite-treatment pair and response digest are rejected | PASS |
| Fixture 33: remove all common anchor rows | Spanning certificate disappears while remaining `X` stays rank 3 | PASS |
| Fixture 33: alter a column identity | Matrix schema check rejects mutation | PASS |
| Fixture 33: reassign a response between rows | Archived response identity/digest check rejects mutation | PASS |

Integrity controls are labeled as integrity rejection; they are not represented as scientific proof failures. All mutations were made only in memory or disposable byte copies. The original artifact and A1 records were untouched.

## Historical A1 observations and product policy

| Fixture | A1 package result (two repeats at each threshold) | A1 supplemental LP record | Product-policy evidence |
|---|---|---|---|
| 31 | `1e-4`: quasi; `1e-8`: complete. Package API did not expose its solver return code. | Same `lpsolve` solver family, marked non-independent; supplemental complete-margin objective `9.57807668562188e-7`, weak-direction objective `0.000109810010999123`, both recorded optimal with return code 0. | A1 expected policy is `RESTRICT_INFERENCE_OUTPUT`; complete separation means no finite MLE. |
| 33 | `1e-4`: overlap; `1e-8`: quasi. Package API did not expose its solver return code. | Same solver family, marked non-independent; complete-margin and weak-direction objectives are both 0, recorded optimal with return code 0. | A1 expected policy continues only to separate GLM, matching and balance gates. |

The supplemental probes are not independent solver confirmation. The archived A1 records do not contain primal or dual residual fields; none are inferred or recomputed here. These proofs do not decide whether the LP solver is defective. The original A1 classifications, failure matrix, and general `NOT_QUALIFIED` detector verdict remain unchanged.

## Scope limits

- No fixture generation, solver execution, SciPy/HiGHS, production changes, A1 rerun, or detector qualification occurred.
- Exact proof covers the archived full-precision matrix and its round-trip binary64 values. The separately serialized fixture CSV has lower-precision predictor tokens, as quantified above.
- Finite-MLE existence for fixture 33 is a model-likelihood statement, not a causal-positivity or matching-quality finding.
- Issue #7 must assess solver formulation, statuses and numerical behavior independently. Root cause of the A1 detector discrepancy remains unresolved.
