# CP-WEBR-00B Experiment Contract & Preregistration

**Repository:** `ErenTahiroglu/ClinicalPSM`
**Phase:** `CP-WEBR-00B — Isolated WebR / MatchIt / cobalt Executable Qualification`
**Date:** 19 October 2026
**Status:** PREREGISTERED & FROZEN
**Independent Authority:** ChatGPT (Red Team)

---

## 1. Executive Mission & Scope Boundary

The sole purpose of this experiment is to independently determine whether official R `MatchIt` (4.8.1) and `cobalt` (5.0.0) packages can execute correctly, reproducibly, and privately inside WebR (0.6.0) on supported browsers within Cloudflare Workers Static Assets Free tier constraints.

This is an **executable scientific qualification**. It is **NOT** a production integration:
- Production application code in `apps/web/` and `src/` remains untouched.
- The existing TypeScript PSM engine remains active in production paths.
- Real patient/clinical data is strictly forbidden; exclusively synthetic data is used.
- Scientific evaluation is outcome-blind: treatment and covariate balance are evaluated strictly without outcome association or metric-shopping.
- The experiment is capable of returning `FAIL` or `INSUFFICIENT_EVIDENCE`.

---

## 2. Research Basis & Scientific Corrections

Per CP-WEBR-00A Red Team corrections:

1. **Standardized Distance Caliper (`process.caliper`):**
   - For an unnamed distance caliper in MatchIt 4.8.1, the exact implementation is:
     $$\text{caliper\_width} = \text{configured\_caliper} \times \text{sd}(\text{distance}[!\text{discarded}])$$
   - It is calculated across **all** non-discarded units (pooled undiscarded standard deviation).
   - It is **not** a within-group pooled standard deviation ($\sqrt{(s_1^2 + s_0^2)/2}$).
   - It is **not** the treated-only ATT SMD denominator ($s_{1,\text{unadjusted}}$).
2. **No-Caliper Semantics:**
   - `caliper = NULL` imposes zero caliper restriction.
   - It does not guarantee all treated units receive matches if eligible controls are exhausted or other constraints apply.
3. **Matching Distance Semantics:**
   - Propensity distance options are explicitly distinguished:
     - Logit scale: `distance = "glm", link = "logit"` (probabilities $\hat{e}_i \in (0, 1)$).
     - Linear logit scale: `distance = "glm", link = "linear.logit"` (linear predictor $\text{logit}(\hat{e}_i) = \mathbf{x}_i^T \hat{\boldsymbol{\beta}}$).
4. **Balance Diagnostics (`cobalt::bal.tab`):**
   - Both `binary = "raw"` (raw proportion differences) and `binary = "std"` (standardized differences) are tested in dedicated fixtures.
   - Explicit continuous variable SMD denominator is set to `s.d.denom = "treated"` for ATT reporting.
5. **Estimand Interpretation:**
   - Target estimand (ATT), retained matched cohort ($N_{\text{matched}}$), discarded units ($N_{\text{discarded}}$), and caliper-unmatched units ($N_{\text{unmatched}}$) are recorded as separate dimensions.
   - No universal numerical threshold automatically certifies estimand validity.
6. **Provenance & Policy Separation:**
   - Results are captured under distinct keys:
     - `NATIVE_R_RESULT`
     - `WEBR_RESULT`
     - `CLINICALPSM_POLICY`

---

## 3. Preregistered Runtime Stack

| Component | Target Version | Provenance / Repository | Verification Method |
| :--- | :--- | :--- | :--- |
| **WebR** | `0.6.0` | npm `webr@0.6.0` / GitHub `r-wasm/webr@v0.6.0` | `webr.evalR('R.version.string')` |
| **Embedded R** | `4.6.0 (2026-04-24)` | WebR 0.6.0 Wasm distribution | `R.version.string` |
| **Native R Oracle** | `4.6.0 (2026-04-24)` | CRAN macOS sonoma-arm64 (`R-4.6.0-arm64.pkg`) | `R.version.string` |
| **MatchIt** | `4.8.1` | CRAN / `repo.r-wasm.org` / `cloud.r-project.org` | `packageVersion("MatchIt")` |
| **cobalt** | `5.0.0` | CRAN / `repo.r-wasm.org` / `cloud.r-project.org` | `packageVersion("cobalt")` |
| **Emscripten Toolchain** | `5.0.7` | `r-wasm/flang-wasm/Dockerfile` / PR #603 | Record evidence & discrepancy with NEWS.md |

---

## 4. Frozen Comparison Criteria & Numerical Tolerances

### 4.1 Exact Semantic Equalities (Tolerance: 0 / Identity)
- Model formula and covariate names.
- Factor level sequences and contrast coding.
- Matched pair assignments (`m.out$match.matrix` row names and matched IDs).
- Matched, unmatched, and discarded unit classifications.
- 1:1 matching unit weights (`m.out$weights` $\in \{0, 1\}$).
- Pair / subclass membership (`m.out$subclass`).
- Convergence classification (`m.out$model$converged`).

### 4.2 Predeclared Numerical Tolerances (Outcome-Independent)
Tolerances are frozen before evaluating comparative WebR runs:

| Metric | Target Tolerance | Justification |
| :--- | :--- | :--- |
| **GLM Coefficients** | `1e-6` | Double precision floating point differences in BLAS/LAPACK implementations (wasm32 vs aarch64 native) under IRLS convergence criterion (`epsilon = 1e-8`). |
| **Linear Predictors (`link = "linear.logit"`)** | `1e-7` | Inner product of design matrix with converged coefficients. |
| **Propensity Probabilities (`link = "logit"`)** | `1e-7` | Logistic sigmoid $\sigma(\eta)$ transformation. |
| **Covariate Sample Means** | `1e-7` | Direct arithmetic mean of observed unit values. |
| **Covariate Standard Deviations** | `1e-7` | Sample variance and square root. |
| **Cobalt SMDs (continuous & std binary)** | `1e-6` | Mean difference normalized by unadjusted treated SD. |
| **Cobalt Variance Ratios** | `1e-6` | Ratio of matched treated to matched control sample variances. |

---

## 5. Supported Browser Targets & Provisional Budgets

### 5.1 Browser Matrix
- **Automated Primary:** Headless Chromium (Playwright Chromium, Node.js WebR worker).
- **Secondary Automated:** Firefox / WebKit where local browser engines allow.
- **Manual Verification:** Real macOS Safari / Brave Desktop where feasible.
- **Unmeasured Platforms:** Mobile browsers, Windows/Linux native browsers marked `UNMEASURED`.

### 5.2 Provisional Resource & Performance Budgets
- **Cold Boot Time:** $< 6,000\text{ ms}$ (including Wasm module instantiation).
- **Warm / Reused Start:** $< 200\text{ ms}$.
- **Package Mounting Time (21 packages):** $< 4,000\text{ ms}$.
- **Analysis Execution ($N=1,000$, 5 covariates):** $< 1,500\text{ ms}$.
- **Peak Worker Memory ($N=1,000$):** $< 256\text{ MiB}$.
- **Cloudflare Single Asset Limit:** $\le 25\text{ MiB}$ ($26,214,400\text{ bytes}$) uncompressed.
- **Cloudflare File Count Limit:** $\le 20,000\text{ files}$.

---

## 6. Stopping Rules & Failure Conditions

1. **Package / Binary Block:** If exact versions (`MatchIt 4.8.1`, `cobalt 5.0.0`, `R 4.6.0`) cannot be loaded or compiled symbols are missing, STOP with `PACKAGE_BINARY_BLOCK`.
2. **Compiled Matcher Failure:** If `MatchIt` compiled C++ routine (`nn_match` / `nearest`) fails to run, STOP with `COMPILED_ROUTINE_FAIL`.
3. **Semantic Parity Failure:** If matched unit IDs or pair assignments differ between Native R 4.6.0 and WebR 0.6.0 on any deterministic fixture, record `PARITY_FAIL`.
4. **Tolerance Violation:** If any numerical metric exceeds predeclared tolerances, record `TOLERANCE_EXCEEDED` without post-hoc widening.
5. **Egress / Privacy Violation:** If any network request occurs after data analysis begins, or if synthetic sentinels leak, STOP with `SECURITY_FAIL`.
6. **Asset Size Violation:** If any individual uncompressed deployable file exceeds $25\text{ MiB}$, STOP with `CLOUDFLARE_LIMIT_EXCEEDED`.
