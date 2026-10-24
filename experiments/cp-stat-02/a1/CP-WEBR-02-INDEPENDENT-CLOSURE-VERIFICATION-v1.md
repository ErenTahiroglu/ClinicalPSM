# CP-WEBR-02 Independent Closure Verification v1

**Record state:** INDEPENDENT_PHASE_TRANSITION_VERIFIED\
**Verification date:** 2026-10-24\
**Repository/branch:** ErenTahiroglu/ClinicalPSM / development

## Baseline and ratification

The pre-A1 checkout was clean at development HEAD c3bda2ed841486aadcb5c44f0caa883662a17cf2. origin/development matched that SHA. origin/main remained 53fb05e7c8d9b77b46c4a5d8b7c9cc041345f6a6.

Ratification workflow 40081851531 completed SUCCESS on the required baseline. Its closure artifact was 12555049854 (650,410 bytes), digest sha256:5c47a447669762d073bbd5857dea839087fc2c3628844daf2496a623339aa316. The ratified record states CP_WEBR_02_CLOSED_UNDER_RATIFIED_SCIENTIFIC_EQUIVALENCE_AMENDMENT_V1, original strict parity FAIL, production release unauthorized, and the 18/5/1/1 split. Aggregate 25/25 numerical parity remains FALSE.

The ratified CP-WEBR-02 amendment file SHA-256 is 9d0471d573033b96ff4341459eb6f39e03089140d7d4c6196d222a9c1c128d21. The native observation candidate remains unchanged at ea05ce912fb03dd86f09cb779b60bd795284372d089a05a9e0124f17e766eedb. This record adds verification and does not rewrite ratification or historical records.

## Original strict workflow at phase transition

Workflow 40081851450 completed FAILURE at the same c3bda2ed841486aadcb5c44f0caa883662a17cf2. Its comparison artifact is 12555273979 (291,391 bytes), digest sha256:145ce6af80a4f08e63610f91cabe8e64e9ef209d3360ce333cf090bd8c3d1118. The bundled full evidence artifact is 12555413151 (876,573 bytes), digest sha256:4e995c66d37c358b540879835f141f87e03c671f4cb196fac2a58d68091bff5a.

The downloaded report has status FAIL: 25 of 25 fixtures measured, 23 fixture rows PASS, 2 fixture rows FAIL; 16,044 of 16,047 numeric comparisons PASS and 3 FAIL; all 18 negative controls PASS. The exact failure set is:

1. fix_15_quasi_separation: warning/diagnostic distinction is absent (historical manifest warning versus observed empty native/WebR GLM warning ledgers).
2. fix_16_complete_separation: Intercept standard error absolute difference 0.002009632982662879 against the unchanged 0.0001 tolerance — FAIL.
3. fix_16_complete_separation: x_sep standard error absolute difference 0.0002009632958106522 against the unchanged 0.0001 tolerance — FAIL.
4. fix_16_complete_separation: glm.maximum_standard_error absolute difference 0.002009632982662879 against the unchanged 0.0001 tolerance — FAIL.

No other comparison failure is present in the archived report. The E2 conclusion remains: fix15's independent LP found no separation at 1e-4 or 1e-8, with controls PASS; fix16 has complete separation and no finite MLE, while covariance causality remains unresolved. The strict failures above remain failures and are not rewritten.

## Frozen contracts and provenance pins

- CP-WEBR-01 production architecture SHA-256: 005f1300fde92d1509958d9058526ab8ae98c992ccfc09f3e9d13995eae44bca
- Canonical scientific result contract SHA-256: cafcf78a294054d893f0a43fa4b7d571e8f7383bbab8e8c54088065225fa4dd3
- CP-WEBR-02 ratification record SHA-256: b8a52855dd66a12a08fe36c9b3c0cb6f25d6a87d8dfe42ad20a932ceb3ec53ba
- CP-STAT-02 starting inventory SHA-256: 9674051fd2ef6c320badafdd9afb9bf4f6afff49516833d6e86b8f8074c61e3d
- E4 amendment SHA-256: 9d0471d573033b96ff4341459eb6f39e03089140d7d4c6196d222a9c1c128d21
- Original 25-fixture manifest SHA-256: e799ff01a9606c91cb3d494e277e081cabdc1349a37c993a08e7057d7411e4b1
- Historical 02A assertion matrix SHA-256: c53ed65845adfa0bdd61011ab7ba6667b5662f4144a438a0443898adc0cabeea
- Authoritative R template SHA-256: 7989403c7d093031b93a9c971a6d4f055101bab83c0ec4417fc52e4dceee24a4

Pinned software remains Next.js 16.4.1, eslint-config-next 16.4.1, WebR 0.6.0, R 4.6.0, MatchIt 4.8.1 and cobalt 5.0.0.

E2 workflow 40021019295, artifact 12532397023, SHA-256 sha256:bb0d2cb66a9b983d40f04703fcd318fa1c76b6a02ca0d58be6bb7d858f902df3. Its internal evidence index lists 17 files; all listed file hashes matched on verification. E2 source commit is f3bf77f1d730cedf4d728ddc58d32b885c63b3bb. The internal evidence archive checksum recorded in the index is 2f8f6487239189745ac3e735916ea1e16d70b7f6e1ee071acd4223b0ded60a85.

## Phase transition

CP-WEBR-02 remains closed only under its ratified, phase-specific scientific-equivalence amendment. CP-STAT-02 is started as a separate research phase. Its separate stop condition remains 100% semantic and numerical tolerance parity and its separate roadmap requires 50+ diverse synthetic scenarios. No production release, real clinical data, automated separation safety, or licensing clearance is authorized by this record.
