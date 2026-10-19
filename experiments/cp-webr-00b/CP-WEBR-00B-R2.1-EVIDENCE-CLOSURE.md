# CP-WEBR-00B R2.1 — Evidence Integrity and Architecture Review Gate Closure

**Repository:** `ErenTahiroglu/ClinicalPSM`
**Branch:** `development`
**Baseline SHA:** `df93fa4435d18555cc321c3641ce7362e28e8d28`
**Authority:** Independent Red Team (ChatGPT)
**Independent Red Team Prior Verdict:** `EXPERIMENT_INSUFFICIENT — R2.1_EVIDENCE_FIX_REQUIRED`
**Phase:** `CP-WEBR-00B R2.1`
**Remediation Verdict:** `EXPERIMENT_PASS_FOR_ARCHITECTURE_REVIEW`

---

## 1. Executive Summary & Gate Reconciliation

This document establishes the evidence integrity closure for CP-WEBR-00B R2.1. All five deficiencies identified in the R2 review have been remediated with empirical evidence, strict machine-readable accounting, and zero modifications to production application code (`clinicalpsm/src/`).

| Evaluation Category | Status / Verdict | Primary Evidence Source |
| :--- | :---: | :--- |
| **CI Diff Check (`git-diff-check`)** | **`PASS`** | Trailing blank lines removed from all markdown files; `git diff --check` passes with exit code 0. |
| **Patient-Sentinel Injection** | **`PASS`** | Verified injection of `SENTINEL_PATIENT_MRN_8877665544` replacing `sub_0001` (100% confirmed target existence, worker receipt, and R dataframe presence). |
| **Browser Privacy & Egress** | **`PASS`** | 14/14 automated assertions passed; 0 bytes / 0 sentinels leaked across 215 phase-tagged requests; offline execution verified. |
| **Scientific Parity Accounting** | **`PASS`** | Directly computed from result objects: 20 pair equivalence, 3 expected reference errors, 1 policy reject, 1 numerical failure (`fix_16`). Semantic: 25/25 (100.0%), Numeric: 24/25 (96.0%), `all_fixtures_pass = false`. |
| **Complete Separation Diagnosis** | **`PASS`** | Clarified `matching.converged == TRUE` mechanism in `fix_16`; explicit statement that automatic separation detector is not yet implemented. |
| **Worker Cancellation & Recovery** | **`PASS`** | Measured and isolated: interrupt (1.59 ms), terminate (0.04 ms), worker creation (0.08 ms), full WebR/pkg reload (2,225.88 ms), subsequent statistical analysis (91.25 ms). Wasm linear memory marked `UNMEASURED`. |
| **GPL Licensing Status** | **`INVENTORY PASS / CLEARANCE BLOCKED`** | `LICENSING_INVENTORY = PASS` (21-package SBOM locked); `PRODUCTION_LICENSING_CLEARANCE = BLOCKED` (binary distribution obligations; combined-work legal clearance required). |
| **Target Architecture Consistency** | **`PASS`** | Confirmed Cloudflare Workers Static Assets (`apps/web`); removed all retired Next.js App Router runtime references. |

---

## 2. P0: CI Cleanliness & Formatting Remediation

GitHub Actions run `39291662940` failed on gate `base.git-diff-check` due to trailing blank lines at end-of-file in:
- `experiments/cp-webr-00b/CP-WEBR-00B-R2-RED-TEAM-REPORT.md`
- `experiments/cp-webr-00b/CP-WEBR-00B-RESULT.md`

### Remediation
- Both files were edited to ensure exactly one trailing newline character with no trailing blank lines.
- Local verification command:
  ```bash
  git diff --check
  ```
  **Result:** Exit code 0 (clean, no whitespace errors).

---

## 3. P0: Verified Patient-Sentinel Injection & Egress Audit

### 3.1 Defect Resolution
In R2, the browser qualification test executed `.replace('ID_0001', PATIENT_SENTINEL)`. Because the fixture `fixtures/fix_01_well_conditioned.csv` uses patient identifier prefix `sub_` (e.g. `sub_0001`), the sentinel replacement did not match any record.

In R2.1, the injection was corrected and instrumented with strict preconditions:
1. Target ID: `sub_0001`
2. Assertion: Target ID exists **exactly once** in raw `fixtures/fix_01_well_conditioned.csv`.
3. Replacement: Target ID replaced with high-entropy patient sentinel `SENTINEL_PATIENT_MRN_8877665544`.
4. Assertion: Sentinel exists **exactly once** in generated test CSV.
5. Dedicated Worker Verification: `worker.js` parses the CSV and returns:
   - `sentinel_received: true`
   - `sentinel_present_in_r: true`
   - `sentinel_id: "SENTINEL_PATIENT_MRN_8877665544"`
   Confirmed via R command: `df$id[1] == "SENTINEL_PATIENT_MRN_8877665544"`.

### 3.2 Phase-Tagged Network Request Classification

Total requests captured across all phases: **215 requests** (54,248,066 bytes transferred). All requests classified into discrete audit phases:

| Phase Tag | Count | Description & Egress Behavior |
| :--- | :---: | :--- |
| `COLD_NAVIGATION` | 4 | Initial page load (`index.html`, `style.css`, `harness.js`, `favicon.ico`). Same-origin. |
| `WORKER_SPAWN_AND_INIT` | 17 | Dedicated Worker script (`worker.js`), WebR runtime (`webr.mjs`, `webr-worker.js`), WebAssembly core (`R.wasm`, `libRblas.so`, `libRlapack.so`). Same-origin. |
| `PKG_INSTALL_MATCHIT_COBALT` | 190 | Pinned packages and dependencies (21 packages: `MatchIt`, `cobalt`, `chk`, `backports`, `rlang`, etc.). Same-origin `/repo/`. |
| `ONLINE_ANALYSIS_WITH_SENTINEL` | **0** | Dedicated worker executed full MatchIt and cobalt matching pipeline with patient sentinel dataset. **0 unexpected network requests** occurred during execution (`delta = 0`). |
| `NEGATIVE_CONTROL_PAGE_PROHIBITED_LEAK` | 1 | Attempted page fetch to `/api/intentional-prohibited-leak` containing `SENTINEL_PAGE_EGRESS_SECRET_KEY_987654321`. **Intercepted & aborted** (`blockedbyclient`). |
| `NEGATIVE_CONTROL_WORKER_PROHIBITED_LEAK` | 1 | Attempted worker fetch containing `SENTINEL_WORKER_EGRESS_SECRET_KEY_123456789`. **Intercepted & aborted** (`blockedbyclient`). |
| `NEGATIVE_CONTROL_EXTERNAL_TELEMETRY` | 1 | Attempted connection to `https://unauthorized-external-telemetry.example.com/`. **Blocked by CSP** (`connect-src 'self'`). |
| `OFFLINE_ANALYSIS_WITH_SENTINEL` | **0** | Network disabled at browser context (`context.setOffline(true)`). Matching pipeline executed and matched 119 pairs with 0 network calls. |
| `TERMINATE_AND_RECOVER` | 1 | Termination and fresh worker recreation (`worker.js`). All assets served from local browser memory/disk cache. |

### 3.3 Explicit Browser Privacy Assertions (14/14 PASS)

The audit verdict `PRIVACY_NO_EGRESS_PASS` is computed directly from 14 boolean assertions in `browser-privacy-audit.json`:

```json
{
  "target_id_existed_once_in_raw_csv": true,
  "sentinel_injected_into_sample_csv": true,
  "worker_received_sentinel_dataset": true,
  "sentinel_present_in_r_dataframe": true,
  "online_pipeline_succeeded": true,
  "zero_unexpected_network_requests_during_online_analysis": true,
  "zero_sentinels_leaked_into_network": true,
  "offline_pipeline_succeeded": true,
  "negative_control_page_egress_blocked": true,
  "negative_control_worker_egress_blocked": true,
  "negative_controls_falsification_verified": true,
  "browser_storage_clean": true,
  "zero_sentinels_persisted_in_storage": true,
  "full_recovery_after_termination_verified": true
}
```

---

## 4. P1: Scientific Status Accounting & Separation Diagnosis

### 4.1 Machine-Readable Category Reconciliation
All categories are recomputed dynamically from native R and WebR execution result objects in `parity-results.json`:

```
Total Fixtures: 25
├── Successful Pair Equivalence: 20 fixtures
│   (fix_01, fix_02, fix_03, fix_04, fix_05, fix_06, fix_07, fix_08,
│    fix_09, fix_10, fix_11, fix_12, fix_13, fix_14, fix_15, fix_17,
│    fix_18, fix_20, fix_21, fix_22)
├── Expected Reference Errors: 3 fixtures
│   ├── fix_19_missing_values (covariates contain NA)
│   ├── fix_19b_missing_treatment (treatment contains NA)
│   └── fix_23_no_eligible_match (caliper too tight for matching)
├── Product Policy Rejects: 1 fixture
│   └── fix_24_duplicate_ids (ClinicalPSM policy reject: duplicate patient IDs)
└── Numerical Tolerance Failures / Unsafe Models: 1 fixture
    └── fix_16_complete_separation (complete separation; non-identifiable parameters)
```

- **Semantic Parity:** 25/25 (100.0%)
- **Numeric Parity:** 24/25 (96.0%)
- **`all_fixtures_pass`:** `false` (Strictly maintained due to fail-closed handling of `fix_16`).

### 4.2 Complete Separation Analysis (`fix_16`)
- **Recorded Convergence:** In both native R and WebR, `matching.converged` is reported as `true`.
- **Mathematical Cause:** R's `glm(family = binomial)` checks convergence via relative deviance delta:
  $$\frac{|D^{(t)} - D^{(t-1)}|}{|D^{(t)}| + 0.1} < \epsilon \quad (\epsilon = 10^{-8})$$
  Under complete separation, fitted probabilities approach 0 or 1, log-likelihood plateaus at a constant value, and the deviance change drops below $\epsilon$, satisfying the termination condition despite parameter divergence.
- **Distinction Between Algorithm and Statistics:**
  - *Algorithmic Convergence:* The iterative optimizer satisfied its numeric stopping condition (`converged == TRUE`).
  - *Statistical Identifiability:* The parameter estimate diverges to $\pm\infty$ with astronomical standard error ($SE > 39,000$), rendering propensity scores meaningless.
  - *Parity Status:* Native R and WebR show identical numerical behavior.
  - *Product Policy:* The model is classified `REJECT_FOR_PUBLICATION` based on fixture metadata.
- **Explicit Blocker Disclosure:** The current experiment does **not** implement a general-purpose automatic separation detector at runtime. A production detector or Firth penalized likelihood fallback must be designed during architecture review.

---

## 5. P1: Measurable Cancellation Latency & Full Demonstrated Recovery

All cancellation and recovery metrics were isolated into discrete measurements:

| Metric | Measured Value | Scope & Verification |
| :--- | :---: | :--- |
| **Interrupt Request to Workload Cessation** | **1.59 ms** | Issued `webr.interrupt()` to active infinite loop (`for (i in 1:1e8) Sys.sleep(0.02)`); cessation verified via subsequent expression (`40 + 2 = 42`). |
| **Worker Termination Request** | **0.04 ms** | Issued `worker.terminate()`. |
| **Pending Request Rejection** | **Verified** | In-flight request Promise rejected immediately upon termination. |
| **New Worker Creation** | **0.08 ms** | `new Worker('/worker.js', { type: 'module' })`. |
| **Full WebR & Package Restoration** | **2,225.88 ms** | Fresh worker initialized WebR runtime, mounted VFS, and loaded `MatchIt` 4.8.1 and `cobalt` 5.0.0. |
| **Subsequent Statistical Operation** | **91.25 ms** | Executed 1:1 nearest-neighbor matching pipeline on restored worker; produced 119 matched pairs. |
| **Full Demonstrated Recovery** | **`PASS`** | Complete end-to-end recovery verified. |
| **Wasm Linear Memory Release Latency** | **`UNMEASURED`** | Private to browser engine's internal worker process garbage collection; inaccessible via user-space JavaScript APIs. |

---

## 6. P0: Correct GPL Licensing Interpretation

### 6.1 Correction of Prior Statement
The prior report stated: *"Client-side runtime execution avoids server redistribution issues."* This statement has been **retracted and removed**.

### 6.2 Legal & Architectural Assessment
Based on the official GNU GPL FAQ ([https://www.gnu.org/licenses/gpl-faq.en.html](https://www.gnu.org/licenses/gpl-faq.en.html)):
1. **Binary Redistribution Obligations:** Serving pre-compiled WebAssembly binaries (`R.wasm`, `MatchIt.tgz`, `cobalt.tgz`) from a web server to users' client browsers constitutes distribution (or "conveying" under GPLv3) of object code.
2. **Corresponding Source:** Distributing GPL-covered WebAssembly binaries creates obligations to make Corresponding Source available under the same license terms, along with appropriate copyright notices and license text.
3. **Commercial Use:** Commercial use of GPL software is explicitly permitted; GPL does not restrict commercial SaaS applications from running GPL code.
4. **Combined Work & Frontend Uncertainty:** Communicating across a Web Worker boundary via `postMessage` with JSON payloads is an architectural boundary, but does not definitively establish a separate work boundary under copyright law. If companion frontend code and WebR components form a single combined program, GPL copyleft provisions could extend to proprietary frontend code.

### 6.3 Gate Classification
- **`LICENSING_INVENTORY` = `PASS`**: All 21 packages and transitive dependencies are inventoried with exact license tags in `licenses-and-sbom.md`.
- **`PRODUCTION_LICENSING_CLEARANCE` = `BLOCKED`**: Production integration is blocked until qualified IP legal counsel reviews the distribution mechanism, source disclosure plan, and proprietary frontend separation.

---

## 7. Target Architecture Consistency

1. **Active Target Architecture:** Cloudflare Workers Static Assets (`apps/web`). All references to the retired Next.js App Router production runtime have been removed from experiment reports.
2. **Cloudflare Free Limits vs. Deployment:** Asset count (188 assets, limit 20,000) and uncompressed size (69.08 MiB total, largest file `R.wasm` at 17.23 MiB vs. 25 MiB limit) satisfy Cloudflare Free tier static asset constraints. Actual Cloudflare deployment remains out-of-scope for this qualification phase.
3. **Explicit MatchIt Configuration:** Browser qualification specifies exact matching arguments matching native R: `method = 'nearest', distance = 'glm', estimand = 'ATT', m.order = 'largest'`.
4. **Cross-Browser Status:** Firefox (Gecko), WebKit, Safari, and mobile are strictly recorded as **`UNMEASURED`**. No cross-browser claims are made without execution evidence.

---

## 8. Final Decision & Stop Gate

$$\mathbf{EXPERIMENT\_PASS\_FOR\_ARCHITECTURE\_REVIEW}$$

> [!IMPORTANT]
> **Strict Architecture Review Boundary:**
> A verdict of `EXPERIMENT_PASS_FOR_ARCHITECTURE_REVIEW` qualifies the technical feasibility of WebR 0.6.0 with MatchIt 4.8.1 and cobalt 5.0.0 in a Dedicated Web Worker. It **does NOT authorize production integration** into `clinicalpsm/src/lib/psm/`. Production integration remains blocked pending resolution of:
> 1. Formal legal review of GPL binary redistribution and frontend copyleft boundary (`PRODUCTION_LICENSING_CLEARANCE = BLOCKED`).
> 2. Runtime separation diagnostic or Firth penalized regression architecture design.
> 3. CSP `'unsafe-eval'` containment strategy in Cloudflare Workers Static Assets.
> 4. Multi-browser automated CI test execution (Firefox, WebKit, Safari).

**Remediation is complete. Awaiting independent ChatGPT Red Team review.**
