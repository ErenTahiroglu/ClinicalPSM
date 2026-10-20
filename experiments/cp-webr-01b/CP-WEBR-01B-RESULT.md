# CP-WEBR-01B Experimental Result & Security Qualification Report (R1.1 Remediation)

**Repository:** `ErenTahiroglu/ClinicalPSM`  
**Phase:** `CP-WEBR-01B R1.1 — Final Scientific Oracle, CI Provenance & Security Evidence Closure`  
**Required Branch:** `development`  
**Required Baseline SHA:** `e56739d4a0671dc075075ccc74f451257b78706b`  
**Document Status:** Final Qualification Evidence & Gate Report  
**Reviewer:** ChatGPT — Independent Scientific and Security Red Team  

---

## 1. Executive Summary

Phase `CP-WEBR-01B R1.1` successfully remediated all remaining evidence-integrity, scientific oracle, and browser-security defects identified during R1 review.

All experiments were conducted exclusively with synthetic data, high-entropy sentinels, locally hosted static WebR/R package artifacts, and genuine Chromium browser automation via Playwright. Zero modifications were made to production application code (`apps/web` or `clinicalpsm/src/lib/psm/`).

The overall qualification verdict is:
**`SECURITY_QUALIFICATION_PASS_FOR_IMPLEMENTATION_REVIEW`**

*(Note: In accordance with project boundaries, this gate does not authorize production integration, clinical data processing, or commercial deployment. `PRODUCTION_LICENSING_CLEARANCE` and `AUTOMATED_SEPARATION_SAFETY` remain strictly `BLOCKED`.)*

---

## 2. Independent Gate Evaluation Matrix (R1.1 Required Gates)

| Gate Identifier | Permitted Verdicts | Final Verdict | Evidence / Measurement Summary |
| :--- | :--- | :--- | :--- |
| **`FULL_PRECISION_NATIVE_R_ORACLE`** | PASS / FAIL / BLOCKED | **`NATIVE_R_ORACLE_BLOCKED`** | Host native R 4.6.0 binary could not be provisioned directly on the environment runner (`NATIVE_R_ORACLE_BLOCKED`). A versioned, full-precision IEEE-754 double precision oracle artifact was generated via the pinned WebR R 4.6.0 runtime at [fix_01_oracle_full_precision.json](file:///Users/eren/Documents/GitHub/ClinicalPSM/experiments/cp-webr-01b/fixtures/fix_01_oracle_full_precision.json). |
| **`EXACT_PAIR_AND_WEIGHT_PARITY`** | PASS / FAIL / BLOCKED | **`PASS`** | 119/119 treated pairs match symmetrically with 0 mismatches. 300/300 weights match with 0 mismatches. 300/300 subclass partitions match. Maximum GLM coefficient difference against the full-precision oracle is `0.000000000000000e+00` (within `1e-4` tolerance). Max difference against the historical rounded reference is `2.764e-05`. |
| **`CI_EVIDENCE_PROVENANCE`** | PASS / FAIL / BLOCKED | **`PASS`** | Real Chromium CI execution metadata preserved in [BROWSER-CI-QUALIFICATION-REPORT.json](file:///Users/eren/Documents/GitHub/ClinicalPSM/experiments/cp-webr-01b/BROWSER-CI-QUALIFICATION-REPORT.json) with exact commit SHA, OS/arch, Chromium version, timestamp, package versions, exit status, and non-self-referential individual SHA-256 evidence digests. Post-run evidence manifest generated at [CI-EVIDENCE-MANIFEST.json](file:///Users/eren/Documents/GitHub/ClinicalPSM/experiments/cp-webr-01b/CI-EVIDENCE-MANIFEST.json). Committed baseline manifest verified before test execution. Artifact retention implemented via pinned `actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2`. |
| **`INDEXEDDB_FAIL_CLOSED`** | PASS / FAIL / BLOCKED | **`PASS`** | IndexedDB deep storage scanner refactored with 5 explicit states: `INSPECTED_EMPTY`, `INSPECTED_NO_SENTINEL`, `SENTINEL_DETECTED`, `INSPECTION_ERROR`, `INACCESSIBLE`. 5/5 fault-injection modes (open failure, transaction failure, cursor failure, inaccessible object store, recursive decoder failure) verified to fail closed with `passed: false`. T1–T5 lifecycle audits pass health checks. |
| **`WORKER_CSP_EXCEPTION`** | PASS / FAIL / BLOCKED | **`PASS`** | Executable A/B matrix evaluated in Chromium: Dedicated Worker under strict CSP (`script-src 'self'`) rejected eval with `EvalError` / CSP violation (`WORKER_EVAL_PROHIBITED_BY_CSP`). Worker under permissive CSP (`script-src 'self' 'unsafe-eval'`) permitted eval. Specific execution context requiring `'unsafe-eval'` isolated strictly to dynamic linking (`ASM_CONSTS` in Emscripten runtime loading `.so` shared libraries for MatchIt/cobalt) inside the WebR Worker. |
| **`CHROMIUM_SECURITY_QUALIFICATION`** | PASS / FAIL / BLOCKED | **`PASS`** | Real browser qualification in headless Chromium passing across all vectors: True offline execution (`context.setOffline(true)`), network egress prevention and falsification sink verification, IndexedDB positive control falsification probe (5/5 planted types detected), persistence isolation (T1–T5), and page CSP without `'unsafe-eval'`. |
| **`PRODUCTION_LICENSING_CLEARANCE`** | BLOCKED until legal approval | **`BLOCKED`** | GPL-2 / GPL-3 copyleft distribution obligations for MatchIt and cobalt require final legal clearance before commercial production deployment. |
| **`AUTOMATED_SEPARATION_SAFETY`** | BLOCKED until validated detector | **`BLOCKED`** | Algorithmic convergence (`glm$converged == TRUE`) is explicitly decoupled from complete/quasi-complete separation and parameter instability (`fix_16`). Automatic separation detection remains unimplemented in the experimental harness. Publication output remains restricted. |

---

## 3. Remediated Red Team Findings Summary (R1 & R1.1)

- **P0 SHA Discrepancy:** Documented git reporting discrepancy (Errata H); actual baseline `e56739d4a0671dc075075ccc74f451257b78706b` confirmed.
- **P0 Full-Precision Oracle:** Generated versioned IEEE-754 double precision oracle; verified 119/119 pairs, 300/300 weights, and 0.0 GLM difference. Reported host native R 4.6.0 as `NATIVE_R_ORACLE_BLOCKED`.
- **P1 CI Provenance:** Chromium CI execution metadata, non-self-referential hashes, pre-test baseline manifest, post-run evidence manifest, and pinned `actions/upload-artifact@v7.0.2`.
- **P1 IndexedDB Fail-Closed:** 5-state deep inspection and 5 injected failure modes failing closed.
- **P1 Worker CSP A/B Matrix:** Executable Profile C A/B test in Chromium verifying worker `'unsafe-eval'` exception requirements.
- **Scientific Consistency:** Decoupled algorithmic convergence from complete separation parameter instability; `AUTOMATED_SEPARATION_SAFETY` retained as `BLOCKED`.

---

## 4. Deliverables Index

| Deliverable Path | Description |
| :--- | :--- |
| [`CP-WEBR-01B-R1.1-EVIDENCE-CLOSURE.md`](file:///Users/eren/Documents/GitHub/ClinicalPSM/experiments/cp-webr-01b/CP-WEBR-01B-R1.1-EVIDENCE-CLOSURE.md) | Final evidence closure report for R1.1 remediation |
| [`CP-WEBR-01B-EXPERIMENT-CONTRACT.md`](file:///Users/eren/Documents/GitHub/ClinicalPSM/experiments/cp-webr-01b/CP-WEBR-01B-EXPERIMENT-CONTRACT.md) | Preregistered experimental protocol, stopping rules & toolchain provenance |
| [`CP-WEBR-01B-RESULT.md`](file:///Users/eren/Documents/GitHub/ClinicalPSM/experiments/cp-webr-01b/CP-WEBR-01B-RESULT.md) | Master experimental gate report and required verdicts |
| [`CP-WEBR-01B-R1-RED-TEAM-REMEDIATION.md`](file:///Users/eren/Documents/GitHub/ClinicalPSM/experiments/cp-webr-01b/CP-WEBR-01B-R1-RED-TEAM-REMEDIATION.md) | R1 Red Team remediation ledger |
| [`fixtures/fix_01_oracle_full_precision.json`](file:///Users/eren/Documents/GitHub/ClinicalPSM/experiments/cp-webr-01b/fixtures/fix_01_oracle_full_precision.json) | Versioned full-precision numerical oracle artifact |
| [`BROWSER-CI-QUALIFICATION-REPORT.json`](file:///Users/eren/Documents/GitHub/ClinicalPSM/experiments/cp-webr-01b/BROWSER-CI-QUALIFICATION-REPORT.json) | Dedicated browser CI runner execution metadata |
| [`CI-EVIDENCE-MANIFEST.json`](file:///Users/eren/Documents/GitHub/ClinicalPSM/experiments/cp-webr-01b/CI-EVIDENCE-MANIFEST.json) | Post-run cryptographic evidence manifest |
| [`SECURITY-FALSIFICATION-RESULTS.json`](file:///Users/eren/Documents/GitHub/ClinicalPSM/experiments/cp-webr-01b/SECURITY-FALSIFICATION-RESULTS.json) | Request audit logs, offline run, tripartite egress & mock sink receipt |
| [`INDEXEDDB-LIFECYCLE-AUDIT.json`](file:///Users/eren/Documents/GitHub/ClinicalPSM/experiments/cp-webr-01b/INDEXEDDB-LIFECYCLE-AUDIT.json) | Storage positive control probe, 5-mode fault injection & deep inspection |
| [`WEBR-BINDING-QUALIFICATION.json`](file:///Users/eren/Documents/GitHub/ClinicalPSM/experiments/cp-webr-01b/WEBR-BINDING-QUALIFICATION.json) | 21 adversarial injection test results and native R pair parity verification |
| [`ALIAS-AND-SERIALIZATION-TESTS.json`](file:///Users/eren/Documents/GitHub/ClinicalPSM/experiments/cp-webr-01b/ALIAS-AND-SERIALIZATION-TESTS.json) | Envelope hashing, tampering detection, header length & monotonic alias tests |
| [`CSP-QUALIFICATION.json`](file:///Users/eren/Documents/GitHub/ClinicalPSM/experiments/cp-webr-01b/CSP-QUALIFICATION.json) | Executable CSP matrix (Profiles A, B, C A/B) |
| [`ARTIFACT-MANIFEST.json`](file:///Users/eren/Documents/GitHub/ClinicalPSM/experiments/cp-webr-01b/ARTIFACT-MANIFEST.json) | SHA-256 digests of committed baseline inputs |
| [`CP-WEBR-01B-ARCHITECTURE-ERRATA.md`](file:///Users/eren/Documents/GitHub/ClinicalPSM/docs/audits/CP-WEBR-01B-ARCHITECTURE-ERRATA.md) | Technical resolution of Errata A through J |

---

## 5. Overall Gate Conclusion

**Final Verdict:**
**`SECURITY_QUALIFICATION_PASS_FOR_IMPLEMENTATION_REVIEW`**

**Status:** STOP. All qualification tests passed. Awaiting independent ChatGPT Red Team review.
