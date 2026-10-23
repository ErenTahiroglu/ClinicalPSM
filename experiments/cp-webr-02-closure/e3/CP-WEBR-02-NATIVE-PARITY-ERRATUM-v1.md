# CP-WEBR-02 Native Parity Erratum v1

**Status: `CANDIDATE_ERRATUM_PENDING_INDEPENDENT_APPROVAL`**

This is an additive, bounded proposal for independent review. It does not change the CP-WEBR-02 roadmap, the original fixture manifest, the historical 02A assertion matrix, the candidate native reference, the frozen numerical tolerances, production code, or prior comparison evidence. No candidate reference is approved or frozen by this document.

## 1. Binding original contract

The CP-WEBR-01 architecture roadmap currently requires both “25 synthetic fixtures match native R golden results” and “100% semantic and numerical tolerance parity” before the CP-WEBR-02 stop condition is met. CP-WEBR-02A R1.2a preregistered absolute numeric tolerance `1e-4` for its declared numerical families and exact identity for IDs, factors, pairs, integer accounting and matching weights. Its fixture manifest and assertion matrix remain authoritative and unchanged.

The original comparison from workflow run `39954671878` remains the unmodified baseline: 25 fixtures compared, 23 historical fixture rows `PASS`, 2 `FAIL`; 16,047 numeric comparisons, 16,044 `PASS`, 3 `FAIL`; 4 baseline failure messages (one warning/diagnostic assertion and the three fix_16 standard-error comparisons). The report is not replaced by this adjudication.

## 2. Provenance and frozen identity

- Required E3 baseline: commit `f3bf77f1d730cedf4d728ddc58d32b885c63b3bb`; main anchor: `53fb05e7c8d9b77b46c4a5d8b7c9cc041345f6a6`.
- Original 25-fixture Worker evidence: workflow run `39954671878`, artifact `12501434045`, outer artifact digest `e41eafc0bf236997063b9c3a868371f974275fd3a5c3a81d8ef3a0f29aaef230`, evidence archive SHA-256 `031b71cda811612f683a2f113057c638bc8373775eac469a343ee02d2be405cb`. Its candidate file SHA-256 is `ea05ce912fb03dd86f09cb779b60bd795284372d089a05a9e0124f17e766eedb`.
- E2 scientific evidence: workflow run `40021019295`, artifact `12532397023`, outer digest `bb0d2cb66a9b983d40f04703fcd318fa1c76b6a02ca0d58be6bb7d858f902df3`. Its internal evidence index and archive checksum must validate before this proposal is evaluated.
- Frozen R template SHA-256: `7989403c7d093031b93a9c971a6d4f055101bab83c0ec4417fc52e4dceee24a4`.
- Toolchain pins remain WebR `0.6.0`, R `4.6.0`, MatchIt `4.8.1`, and cobalt `5.0.0`. Root Next.js and eslint-config-next remain `16.4.1`.
- The original production Worker evidence is from commit `1ca14f6ab3c41d1ba366db0adda22102acc90a3c`. The Worker, adapter, template and fixture source paths are byte-identical at the E3 baseline; the qualification workflow verifies that source identity before treating this historical execution as the production anchor.

Both original E2 frozen fixtures are bound to their exact CSV and config SHA-256 values in the machine-readable pins. The exception cannot be used for changed inputs, configurations, fixture IDs, or unproven models.

## 3. Proposed fix_15 interpretation

Original frozen manifest: `SUCCESS_WITH_WARNING / SEPARATION_WARNING`. Historical 02A assertion matrix: `OUTPUT_READY`. Both records remain unchanged.

For the exact frozen `fix_15_quasi_separation` input/configuration hashes only, propose the versioned observed classification `OBSERVED_SUCCESS_WITHOUT_SEPARATION_WARNING` and the adjudication outcome `HISTORICAL_WARNING_CONTRACT_EXCEPTION`.

Evidence: the preserved native candidate warning ledger is empty; two fresh native R runs recorded no GLM warning; the production WebR anchor recorded no warning; and independent `detectseparation` 0.4.0 LP results at feasibility tolerances `1e-4` and `1e-8` classified overall, complete and quasi separation as `NO`. The LP positive and negative controls passed. The isolated warning-capture positive control captured the known `glm.fit: algorithm did not converge` warning.

The old assertion being proposed for supersession is only the comparator rule that requires an application warning or numerical-instability safeguard on every manifest row marked `SUCCESS_WITH_WARNING`. The fixture name is not mathematical evidence of quasi-complete separation. The mandatory warning expectation is unsupported for these exact frozen inputs/model. Runtime warning ledgers, numeric outputs, matching configuration, manifest, assertion matrix and all checks for other fixtures stay intact. In particular, a negative control must delete a genuine warning from `fix_21_extreme_propensities` and the adjudicator must reject the evidence. This proposal does not create or generalize a production separation detector and does not authorize suppressing other warnings.

## 4. Proposed fix_16 interpretation

For the exact frozen `fix_16_complete_separation` inputs/configuration, independent LP classification is `YES / complete=YES / quasi=NO` at both `1e-4` and `1e-8`, with non-finite MLE directions. The original logistic model therefore has no finite maximum-likelihood estimate. A finite iterative result and its finite covariance are observable numerical outputs, not evidence of finite-MLE inference.

Propose the separate status `INFERENCE_NON_IDENTIFIABLE_OUTPUT_RESTRICTED` and outcome `NON_IDENTIFIABLE_INFERENCE_RESTRICTED`. This is not ordinary numerical parity, a tolerance change, conditional skipping, validation of all native/WebR covariance values, or a general large-SE exception. The causal explanation of the low-level native/WebR covariance discrepancy remains `UNRESOLVED`.

Keep the three original frozen `1e-4` failures verbatim and in the machine report:

| Field | Native reference | Production Worker | Absolute difference | Frozen tolerance | Original result |
|---|---:|---:|---:|---:|---|
| `(Intercept)` standard error | 39815.8764891409 | 39815.87849877388 | 0.002009632982662879 | 0.0001 | `FAIL` |
| `x_sep` standard error | 3981.58764891409 | 3981.587849877386 | 0.0002009632958106522 | 0.0001 | `FAIL` |
| Maximum standard error | 39815.8764891409 | 39815.87849877388 | 0.002009632982662879 | 0.0001 | `FAIL` |

For an independently approved contract only, coefficients, covariance and standard errors may be retained as non-certifying inferential diagnostics because the finite MLE does not exist. Continue requiring exact fixture and model-matrix identity, pair identities, keyed weights, factor references, sample accounting, status checks, unaffected structural checks, and the absolute production publication restriction `OUTPUT_GENERATION_RESTRICTED`. The exception requires independently pinned LP evidence for this exact fixture, provenance, and fixture hashes. Any missing or changed provenance, identity, mathematical class, structural result, restriction, or original failure is a rejection. Do not extend this classification to large standard errors generally.

Complete separation does not by itself validate propensity-score matching, balance, a treatment-effect target, causal identification, or any clinical conclusion.

## 5. Historical fixture classifications and proposed adjudication

| Fixture | Frozen manifest | Historical comparator | Proposed additive outcome |
|---|---|---|---|
| `fix_01_well_conditioned` | `SUCCESS` | `PASS` | `NUMERICAL_AND_STRUCTURAL_PARITY_PASS` |
| `fix_02_mixed_types` | `SUCCESS` | `PASS` | `NUMERICAL_AND_STRUCTURAL_PARITY_PASS` |
| `fix_03_ref_level_change` | `SUCCESS` | `PASS` | `NUMERICAL_AND_STRUCTURAL_PARITY_PASS` |
| `fix_04_input_row_order` | `SUCCESS` | `PASS` | `NUMERICAL_AND_STRUCTURAL_PARITY_PASS` |
| `fix_05_exact_distance_ties` | `SUCCESS` | `PASS` | `NUMERICAL_AND_STRUCTURAL_PARITY_PASS` |
| `fix_06_no_caliper_nearest` | `SUCCESS` | `PASS` | `NUMERICAL_AND_STRUCTURAL_PARITY_PASS` |
| `fix_07_prob_scale_caliper` | `SUCCESS` | `PASS` | `NUMERICAL_AND_STRUCTURAL_PARITY_PASS` |
| `fix_08_linear_logit_caliper` | `SUCCESS` | `PASS` | `NUMERICAL_AND_STRUCTURAL_PARITY_PASS` |
| `fix_09_standardized_caliper` | `SUCCESS` | `PASS` | `NUMERICAL_AND_STRUCTURAL_PARITY_PASS` |
| `fix_10_whole_vs_pooled_sd` | `SUCCESS` | `PASS` | `NUMERICAL_AND_STRUCTURAL_PARITY_PASS` |
| `fix_11_pre_match_discard` | `SUCCESS` | `PASS` | `NUMERICAL_AND_STRUCTURAL_PARITY_PASS` |
| `fix_12_caliper_unmatched` | `SUCCESS` | `PASS` | `NUMERICAL_AND_STRUCTURAL_PARITY_PASS` |
| `fix_13_more_treated_than_control` | `SUCCESS` | `PASS` | `NUMERICAL_AND_STRUCTURAL_PARITY_PASS` |
| `fix_14_more_controls_than_treated` | `SUCCESS` | `PASS` | `NUMERICAL_AND_STRUCTURAL_PARITY_PASS` |
| `fix_15_quasi_separation` | `SUCCESS_WITH_WARNING` | `FAIL` | `HISTORICAL_WARNING_CONTRACT_EXCEPTION` (erratum-dependent) |
| `fix_16_complete_separation` | `SUCCESS_WITH_WARNING` | `FAIL` | `NON_IDENTIFIABLE_INFERENCE_RESTRICTED` (erratum-dependent; three numeric `FAIL`s retained) |
| `fix_17_rank_deficient` | `SUCCESS` | `PASS` | `NUMERICAL_AND_STRUCTURAL_PARITY_PASS` |
| `fix_18_zero_variance` | `SUCCESS` | `PASS` | `NUMERICAL_AND_STRUCTURAL_PARITY_PASS` |
| `fix_19_missing_values` | `EXPECTED_REFERENCE_ERROR` | `PASS` | `EXPECTED_ERROR_OR_POLICY_PARITY_PASS` |
| `fix_19b_missing_treatment` | `EXPECTED_REFERENCE_ERROR` | `PASS` | `EXPECTED_ERROR_OR_POLICY_PARITY_PASS` |
| `fix_20_malformed_category` | `SUCCESS` | `PASS` | `EXPECTED_ERROR_OR_POLICY_PARITY_PASS` (historical product-policy rejection) |
| `fix_21_extreme_propensities` | `SUCCESS_WITH_WARNING` | `PASS` | `NUMERICAL_AND_STRUCTURAL_PARITY_PASS` |
| `fix_22_small_sample` | `SUCCESS` | `PASS` | `NUMERICAL_AND_STRUCTURAL_PARITY_PASS` |
| `fix_23_no_eligible_match` | `EXPECTED_ZERO_MATCHES` | `PASS` | `EXPECTED_ERROR_OR_POLICY_PARITY_PASS` |
| `fix_24_duplicate_ids` | `CLINICALPSM_POLICY_REJECT` | `PASS` | `EXPECTED_ERROR_OR_POLICY_PARITY_PASS` |

The proposed aggregation is 18 ordinary parity outcomes, 5 expected error/product-policy outcomes, 2 erratum-dependent exceptions, and the original 3 frozen numerical failures. No aggregate is named or rendered as `25/25 numerical PASS`.

## 6. Proposed assertion mapping

| Original assertion | Proposed disposition |
|---|---|
| Exact 25-fixture manifest membership and identity | Unchanged; exact set and cardinality remain mandatory |
| All non-exception numeric assertions and exact structural assertions | Unchanged |
| fix_15 manifest warning label and historical `OUTPUT_READY` assertion | Preserved as historical data; one warning-causality interpretation may be superseded only under the exact LP/input pin above |
| Warning/diagnostic required solely because a row has a warning-labelled manifest class | Candidate supersession for fix_15 only; warning-required controls and other fixtures remain enforced |
| fix_16 three SE tolerance comparisons | Remain `FAIL` at unchanged tolerance; may be marked non-certifying inference under independently approved exact-model separation classification |
| fix_16 production publication restriction | Unchanged absolute requirement: `OUTPUT_GENERATION_RESTRICTED` |
| Historical comparison report and candidate reference bytes | Immutable; no rewrite, regeneration or freeze |

## 7. Explicit acceptance and rejection states

- Accept the proposal only through independent Red Team review and a separately authorized versioned contract approval.
- Reject if any expected fixture is missing/duplicated; an input/config/reference/report/artifact/evidence hash differs; a warning-required control loses its warning; fix_16 provenance/LP classification/identity/restriction differs; a frozen numerical failure is hidden/renamed; or any ordinary parity field changes.
- Keep a fixture `FAIL` if the relevant assertion fails and no narrow, independently justified exception applies. Mark requirements `BLOCKED` or `UNMEASURED` when evidence is absent; never omit, skip, or deduplicate to obtain a passing count.
- `HISTORICAL_WARNING_CONTRACT_EXCEPTION` and `NON_IDENTIFIABLE_INFERENCE_RESTRICTED` are review-dependent classifications and do not alter the current binding stop condition.

## 8. Proposed stop-condition amendment

If approved, replace only the interpretation of the CP-WEBR-02 stop condition with an auditable scientific equivalence contract that reports separately: (1) ordinary native R numerical and structural parity at original tolerances; (2) expected error and product-policy semantic parity; (3) mathematically established non-identifiable inference with restricted outputs and retained raw numeric failures; and (4) historical assertion corrections supported by independently validated evidence. Each fixture remains accounted for, and the two exception categories are not counted as ordinary numerical passes.

This would meet the stop condition's intended purpose of requiring evidence-backed, safe and reproducible behavior across all 25 original scenarios only if the amendment is independently approved, every ordinary check passes, expected policy behavior remains correct, fix_16 publication remains restricted, exceptions remain fixture-specific, and all remaining release/security/legal gates are separately satisfied. Until approval, the original roadmap wording remains binding and CP-WEBR-02 is not complete.

## 9. Remaining scientific, security and legal blockers

- Independent approval of this erratum and of the proposed stop-condition amendment is pending.
- fix_16's native/WebR covariance differences and their cause remain unresolved. BLAS/LAPACK is not established as the cause.
- The production numerical-instability safeguard remains unvalidated and is not a separation detector; independent separation evidence in this proposal is diagnostic-only and must not be generalized into production behavior.
- Complete separation does not establish valid matching or causal inference.
- CP-STAT-02 is deferred: no causal estimand, treatment-effect validity, overlap or matching quality assessment is added by this qualification.
- CP-RELEASE is deferred: production readiness, security, privacy, browser-channel, deployment and release approvals remain outstanding.
- CP-PUB-01 legal, publication and licensing review remains deferred. These restrictions stay in force and this proposal does not authorize production use.

## 10. Negative controls required by the additive adjudicator

The qualification must reject changed fixture input hashes; missing or duplicate fixtures; exception scope leakage; non-separated fixtures mislabelled separated; removed LP provenance or unsupported separation claims; removed publication restriction; altered pair identity, keyed weight, factor reference, ordinary coefficient or cobalt value; deleted genuine warning from warning-required fix_21; concealed or renamed fix_16 tolerance failures; altered erratum/evidence without updated reviewed hashes; and an old `FAIL` relabeled `PASS` without the exact scientific evidence and assertions above.
