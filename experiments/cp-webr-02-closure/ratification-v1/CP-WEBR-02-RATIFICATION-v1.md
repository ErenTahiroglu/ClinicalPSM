# CP-WEBR-02 Scientific Equivalence Amendment v1 Ratification Record

**Record version:** `CP-WEBR-02-RATIFICATION-v1`
**Ratification date:** 2026-10-24
**Scope:** CP-WEBR-02 only
**Status:** `RATIFIED_SUBJECT_TO_EXACT_SHA_QUALIFICATION`

## Authority and precedence

The project owner authorized ratification by delivering the CP-WEBR-02-RATIFICATION prompt on 2026-10-24. The independent ChatGPT Red Team disposition is `E4_INDEPENDENT_RED_TEAM_ACCEPTED`. The exact amendment ratified is [CP-WEBR-02-SCIENTIFIC-EQUIVALENCE-AMENDMENT-v1.md](../e4/CP-WEBR-02-SCIENTIFIC-EQUIVALENCE-AMENDMENT-v1.md), SHA-256 `9d0471d573033b96ff4341459eb6f39e03089140d7d4c6196d222a9c1c128d21`.

This ratification record has a fixed SHA-256 recorded in `evidence-pins.json`. Its exact Git commit SHA is bound by the exact-SHA ratification workflow's machine-readable report, which must equal the workflow checkout SHA. The workflow artifact is the immutable record of that commit and its successful qualification. Ratification does not retroactively edit or delete historical roadmap, fixture, E3 candidate, strict-comparison, or reference records.

The original roadmap is [CP-WEBR-01-PRODUCTION-ARCHITECTURE.md](../../../docs/architecture/CP-WEBR-01-PRODUCTION-ARCHITECTURE.md), SHA-256 `005f1300fde92d1509958d9058526ab8ae98c992ccfc09f3e9d13995eae44bca`. Its original CP-WEBR-02 stop condition is **“25 synthetic fixtures match native R golden results.”** The separate CP-STAT-02 stop condition remains **“100% semantic and numerical tolerance parity.”** This ratification interprets the former only; it neither modifies nor satisfies the latter.

For CP-WEBR-02 only, the ratified versioned interpretation takes precedence over the original stop condition's application to the two exact, independently supported historical classifications below. The original roadmap and the original strict comparison remain binding historical evidence and fully traceable. No broader assertion is superseded.

## Ratified outcome

The 25 original fixtures remain fully accounted for as follows:

| Classification | Count | Treatment |
|---|---:|---|
| Ordinary native R numerical and structural parity | 18 | Pass under the original numerical tolerances and exact structural checks. |
| Expected error or product-policy semantic parity | 5 | Pass only for their declared error or policy semantics. |
| Historical warning-contract exception | 1 | `fix_15_quasi_separation` is classified `OBSERVED_SUCCESS_WITHOUT_SEPARATION_WARNING` for its exact frozen model and input. The historical manifest and strict failure remain preserved. |
| Restricted non-identifiable inference exception | 1 | `fix_16_complete_separation` is classified `INFERENCE_NON_IDENTIFIABLE_OUTPUT_RESTRICTED`. Publication remains `OUTPUT_GENERATION_RESTRICTED`. |

This is not `25/25 numerical parity`. The original strict comparison remains **FAIL**. All three fix16 standard-error comparisons remain **FAIL** at the original `0.0001` tolerance. The complete native/WebR covariance discrepancy and its causal explanation remain `UNRESOLVED`. The exceptions apply only to the exact frozen fixtures and evidence hashes reviewed in E2, E3, E4 and this ratification. They do not generalize to new fixtures, datasets, production separation detection, other large standard errors, or causal claims.

The independent E2 LP evidence is fixture-specific scientific support; it is not a validated universal separation detector. Complete separation establishes that the original logistic model has no finite maximum-likelihood estimate. It does not validate matching quality, propensity-score estimands, treatment effects, or causal inference.

## Native reference governance

The native candidate reference with SHA-256 `ea05ce912fb03dd86f09cb779b60bd795284372d089a05a9e0124f17e766eedb` is accepted as `NATIVE_R_OBSERVATION_DATASET_ACCEPTED_WITH_LIMITATIONS`, for archival use under this exact contract. The qualification verifies the bytes in the E4 evidence bundle. The reference is not regenerated, changed, or silently replaced by this record.

Acceptance covers the independently generated native observations and their provenance. It does not certify WebR numerical parity, validate a general-purpose separation detector, establish PSM causal validity, or automatically authorize future reference updates.

The strict workflow at run `40034455633` produced a separate, non-frozen native candidate during its run. It reported the same four known strict failure rows and no additional failed comparison fields. Its three raw standard-error rows are preserved separately from the historical E4 matrix because the candidate reference values changed slightly between native executions. The observed candidate-to-candidate numeric changes remained within the original `0.0001` tolerance; their cause is not asserted here. This run output does not replace the accepted reference hash above.

## Evidence and approvals

The pinned evidence set and artifact digests are enumerated in `evidence-pins.json`. The frozen fixture manifest SHA-256 is `e799ff01a9606c91cb3d494e277e081cabdc1349a37c993a08e7057d7411e4b1`; the fixture integrity index SHA-256 is `06e3bed64ba2504f82020b66fe30eead2bb3be82fa7bac2a9591e6aeb33f7af5`, with all 25 CSV/config input pairs checked against it. The evidence set includes original Worker evidence (E1, run `39954671878`), E2 (run `40021019295`), E3 (run `40030723272`), the E4 accepted qualification (run `40034455858`), the current strict comparison (run `40034455633`), and the Security and Cumulative runs (`40034455827`, `40034455721`). Exact run conclusions, artifact IDs, sizes, digests, evidence-internal hashes, the retained strict failure matrices, and the accepted reference SHA are verified by the ratification workflow.

The original strict matrix from E4 remains preserved as FAIL: fix15 warning-contract row, plus fix16 intercept SE, x_sep SE, and maximum SE. The strict run at the ratification baseline has those same four rows and exactly three numeric failures. Its full raw values are included in the generated ratification artifact. The original strict workflow has not been weakened or changed.

The ratification workflow emits `closure-report.json`, `closure-report.md`, and `evidence-manifest.json`, each bound to the exact final commit SHA and GitHub workflow run ID. Only a successful exact-SHA workflow can record `CP_WEBR_02_CLOSED_UNDER_RATIFIED_SCIENTIFIC_EQUIVALENCE_AMENDMENT_V1`.

## Recorded phase boundaries and blockers

The phase record must include these states:

- `ORIGINAL_STRICT_NUMERICAL_PARITY = FAIL`
- `AGGREGATE_25_OF_25_NUMERICAL_PARITY = FALSE`
- `PRODUCTION_RELEASE_AUTHORIZED = FALSE`
- `REAL_CLINICAL_DATA_AUTHORIZED = FALSE`
- `AUTOMATED_SEPARATION_SAFETY = BLOCKED`
- `PRODUCTION_LICENSING_CLEARANCE = BLOCKED`
- `CP_STAT_02_COMPLETE = FALSE`
- `CP_PUB_01 = DEFERRED`
- `CP_RELEASE = DEFERRED`

CP-STAT-02 retains its original separate stop condition and must independently address a validated separation detector, at least 50 scientifically diverse synthetic fixtures, full semantic/numerical qualification, missing overlap, unstable propensity models, safe rejection and publication policy, and methodology/causal-interpretation limits. The E2 fixture-specific LP diagnoses do not satisfy that detector requirement.

No main merge, production deployment, real clinical data, CP-STAT-02 implementation, CP-PUB-01 approval, or CP-RELEASE approval is authorized by this ratification.
