# CP-WEBR-02 Scientific Equivalence Amendment v1

**Status:** `CANDIDATE_AMENDMENT_PENDING_FINAL_INDEPENDENT_RED_TEAM_ACCEPTANCE`<br>
**Scope:** Proposed interpretation amendment for the CP-WEBR-02 stop condition only.<br>
**Authority:** No normative change takes effect until independent Red Team acceptance and separately recorded project ratification.

This document preserves the original roadmap, fixture manifest, assertion matrix, native reference, strict comparison reports, and all numeric failures. It is not a release approval and does not certify 25/25 numerical parity.

## 1. Correct phase interpretation and precedence

The immutable source is Section 7 of `docs/architecture/CP-WEBR-01-PRODUCTION-ARCHITECTURE.md`, SHA-256 `005f1300fde92d1509958d9058526ab8ae98c992ccfc09f3e9d13995eae44bca`.

It assigns two separate stop conditions:

- **CP-WEBR-02 — Dedicated Worker WebR Engine Integration:** “25 synthetic fixtures match native R golden results”.
- **CP-STAT-02 — Scientific Separation & Golden Test Expansion:** “100% semantic and numerical tolerance parity”.

E3 amendment candidate v1 incorrectly attributed both clauses to CP-WEBR-02. This E4 version corrects that reading. It does not amend or weaken CP-STAT-02. The original roadmap text remains unchanged and traceable.

Precedence is versioned and explicit: until this amendment is independently accepted and ratified, the original CP-WEBR-02 stop condition remains binding. If accepted, this amendment will provide a narrow, additive interpretation of the CP-WEBR-02 clause only. It supersedes the conflicting phase attribution in E3 candidate prose, not the historical E3 document, the roadmap record, CP-STAT-02, or any frozen scientific record. E3 and E4 artifacts remain separately addressable by commit and SHA-256.

## 2. Frozen scope and provenance

The original fixture identity is the unchanged 25-row manifest, SHA-256 `e799ff01a9606c91cb3d494e277e081cabdc1349a37c993a08e7057d7411e4b1`. The original CP-WEBR-02A test contract and assertion matrix remain authoritative and unchanged; the assertion matrix SHA-256 is `c53ed65845adfa0bdd61011ab7ba6667b5662f4144a438a0443898adc0cabeea`. The native oracle source SHA-256 is `fe524d3330b59ef8b2b60b1b93cd1d21ed4b02ab9e62642b432078bf4d706f87`; the R template SHA-256 is `7989403c7d093031b93a9c971a6d4f055101bab83c0ec4417fc52e4dceee24a4`.

The candidate native reference remains byte-identical to the preserved candidate at SHA-256 `ea05ce912fb03dd86f09cb779b60bd795284372d089a05a9e0124f17e766eedb`. Its source evidence is original Worker workflow `39954671878`, artifact `12501434045`, artifact digest `sha256:e41eafc0bf236997063b9c3a868371f974275fd3a5c3a81d8ef3a0f29aaef230`, from production source commit `1ca14f6ab3c41d1ba366db0adda22102acc90a3c`.

The E2 scientific evidence is workflow `40021019295`, artifact `12532397023`, digest `sha256:bb0d2cb66a9b983d40f04703fcd318fa1c76b6a02ca0d58be6bb7d858f902df3`, at E2 SHA `f3bf77f1d730cedf4d728ddc58d32b885c63b3bb`. Its archive and internal manifest are rechecked before adjudication. E3 candidate evidence is workflow `40030723272`, artifact `12533809065`, digest `sha256:9326cc163fddd03129a5777f49b23983b74ffb490b58038c2a265c2ae0b60b7f`, at SHA `ad7de4547b3b131d5d81c046eea035f80aff4ec0`; the E3 candidate document SHA-256 is `a030d1214adc7ff38f55638a77625a8c6655d6442f6d12b37faa29a39e4dec40`.

The final original strict closure workflow at the required E3 SHA is `40030723201`; it concluded failure with exactly the four preserved rows listed in Section 5. Its strict comparison artifact is `12535595517`, digest `sha256:ec570e3263b0c463efbec05f2c79ddfed27796736008b45bf4d72b013f6acc34`; the report SHA-256 is `67498f5c09185e1a003a500c1b72be281e8740ca4b02d32d1676921764049002`.

The E3 evidence pins preserve Next.js and eslint-config-next `16.4.1`, WebR `0.6.0`, R `4.6.0`, MatchIt `4.8.1`, and cobalt `5.0.0`. Production Worker, scientific adapter, R template, fixture data/configuration, native oracle, and original strict comparator remain unchanged from the verified production source identity. Historical browser evidence may be reused only while that identity remains exact.

## 3. Proposed CP-WEBR-02 equivalence outcomes

If this amendment is accepted, all 25 original fixtures must be accounted for exactly once and receive distinct, visible outcomes:

| Proposed outcome class | Fixture scope | Count |
|---|---|---:|
| Ordinary native R numerical and structural parity | fix_01–fix_14, fix_17, fix_18, fix_21, fix_22 | 18 |
| Expected error or product-policy semantic parity | fix_19, fix_19b, fix_20, fix_23, fix_24 | 5 |
| Exact frozen historical warning-classification correction | fix_15_quasi_separation | 1 |
| Exact frozen complete-separation, non-identifiable inference with restricted output | fix_16_complete_separation | 1 |

The proposed result is therefore `18 + 5 + 1 + 1` distinct scientific classifications. It is not “25/25 numerical parity.” No fixture may be skipped, duplicated, or silently counted as an ordinary pass.

## 4. Exact exception rules

### fix_15 — historical warning classification

The frozen manifest remains `SUCCESS_WITH_WARNING / SEPARATION_WARNING`, and the archived assertion matrix remains `OUTPUT_READY`. For the exact fixture input and configuration hashes only, propose the observed interpretation `OBSERVED_SUCCESS_WITHOUT_SEPARATION_WARNING` and the adjudication `HISTORICAL_WARNING_CONTRACT_EXCEPTION`.

E2 preserved native R and production WebR warning ledgers with no target GLM warning. Independent `detectseparation` 0.4.0 LP controls classified the exact model as non-separated at feasibility tolerances `1e-4` and `1e-8`; positive and negative LP controls passed. A warning-capture positive control captured `glm.fit: algorithm did not converge`. The fixture name does not certify quasi-complete separation. The old mandatory `SEPARATION_WARNING` assertion is unsupported for this exact frozen input/model. The historical manifest, assertion matrix, warning records, numeric observations, and matching configuration remain unchanged. A genuine warning removed from a warning-required fixture must still fail the comparator.

This correction does not suppress warnings on any other fixture and does not add or imply a production separation detector.

### fix_16 — complete separation and restricted, non-certifying inference

Independent LP evidence establishes complete separation for this exact frozen logistic model and the absence of a finite maximum-likelihood estimate. Proposed outcome: `INFERENCE_NON_IDENTIFIABLE_OUTPUT_RESTRICTED`. This outcome applies only to the exact frozen fixture ID, CSV/configuration hashes, provenance, and supported LP classification.

The original comparator's three standard-error rows remain `FAIL` at unchanged tolerance `1e-4`:

| Field | WebR production observation | Native reference | Absolute difference | Result |
|---|---:|---:|---:|---|
| Intercept standard error | 39815.87849877388 | 39815.8764891409 | 0.002009632982662879 | FAIL |
| x_sep standard error | 3981.587849877386 | 3981.58764891409 | 0.0002009632958106522 | FAIL |
| GLM maximum standard error | 39815.87849877388 | 39815.8764891409 | 0.002009632982662879 | FAIL |

All observed native and WebR coefficients, covariance matrices and standard errors remain visible. Those quantities are non-certifying inferential diagnostics under the proposed classification; the failures do not become numerical PASS, are not skipped, and do not establish that every covariance value agrees. Exact fixture identity, matching pair order, keyed weights, factors, sample accounting and product status remain subject to their ordinary assertions. The production restriction `OUTPUT_GENERATION_RESTRICTED` remains absolute.

The native/WebR covariance discrepancy and its cause remain `UNRESOLVED`. BLAS/LAPACK is not a confirmed cause. Complete separation does not validate propensity-score matching or causal inference.

## 5. Preserved strict comparison

The original strict comparison remains independently available and remains failed:

- 23 of 25 fixture rows PASS; 2 FAIL.
- 16,044 of 16,047 numeric comparisons PASS; 3 FAIL.
- The four failure messages are exactly the fix_15 warning/diagnostic distinction and the three fix_16 standard-error rows in Section 4.

The additive adjudicator must recalculate each numeric row's absolute difference and status under its recorded original tolerance, retain the exact three fix_16 failures, and reject an omitted failure or a rewritten `FAIL` as `PASS` without the exact approved scientific classification. It must never publish an aggregate numerical-pass counter of 25.

## 6. Required controls and exception invalidation

All 19 E3 controls remain required and individually classified as evidence-integrity, scientific-comparator, structural-identity, exception-scope, or publication-safety falsifications. Hash checks establish evidence integrity; direct synthetic numeric and structural tests separately establish comparator behavior. Both layers are required.

The qualification must fail when any fixture input hash changes, a fixture is missing/duplicated, an unrelated fixture requests fix_16 treatment, an exception identity changes, LP provenance is absent or unsupported, a genuinely non-separated case is labelled fully separated, the fix_16 output restriction is removed, pair identity/order or keyed weights change, subclasses or factor/contrast metadata are absent, or sample-accounting fields are missing. It must also detect changed ordinary coefficient or cobalt values through the numeric assertion itself, a missing required runtime warning, concealed fix_16 tolerance failures, changed reviewed evidence/document hashes, and a historical `FAIL` renamed `PASS` without the required scientific justification.

Any input/configuration hash, fixture identity, provenance, separation classification, warning ledger, or publication restriction that differs invalidates the corresponding exception. Large standard errors alone never authorize the fix_16 classification. No exception generalizes to future fixtures or production separation detection.

## 7. Proposed explicit closing gate

The proposed CP-WEBR-02 gate may be considered satisfied only after independent acceptance and project ratification of this versioned amendment, and only when:

1. All 25 frozen fixture identities and evidence hashes validate with no omission or duplication.
2. The 18 ordinary fixture outcomes satisfy all original numerical and structural assertions and tolerances.
3. The 5 expected error/product-policy outcomes match their exact frozen semantic classifications.
4. fix_15 and fix_16 satisfy every exact identity, provenance, LP, warning, and publication-safety boundary in this amendment.
5. All original numerical failures and the unresolved covariance discrepancy remain visible and hash-bound.
6. All 19 E3 controls and the direct E4 scientific and structural falsification tests pass.
7. Current production source identity is verified; historical browser evidence is reused only when it is byte-identical to the evidence source.
8. A complete evidence manifest records exact SHA, workflow, artifacts, reports, controls, and per-fixture outcome counts.

If those conditions hold, this amended equivalence contract could meet the intended CP-WEBR-02 purpose of qualifying the Worker/WebR integration's 25 frozen synthetic scenarios with explicit scientific semantics and safety boundaries. It does not pass the original 100% numerical parity criterion and does not satisfy the separate CP-STAT-02 stop condition.

## 8. Native reference governance recommendation

Recommend that an independent reviewer consider `native-reference-candidate.json` for acceptance solely as an immutable dataset of observed outputs from the pinned native R oracle, because its identity and provenance are hash-bound and reproducible. This recommendation is separate from WebR numerical-equivalence certification. It does not freeze, rewrite, or numerically parity-certify the candidate reference; those actions require their own independent governance decision.

## 9. Explicit exclusions and remaining blockers

This amendment excludes CP-STAT-02, CP-PUB-01, and CP-RELEASE. It does not authorize production statistical changes, production deployment, release, real clinical data, candidate-reference freezing, or CP-WEBR-02 self-closure.

Still deferred are scientific validation of matching quality, overlap, estimands, treatment effects and causal conclusions; publication, licensing and legal review; production security, privacy, channel and release approval; and explanation of the native/WebR covariance difference. The original CP-STAT-02 “100% semantic and numerical tolerance parity” stop condition remains unchanged and binding for that phase.
